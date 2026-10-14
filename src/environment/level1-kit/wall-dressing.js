import * as THREE from 'three'
import { getKitMaterials } from './kit-materials.js'
import { createKitBuilder, kbox, metreUv } from './kit-props.js'

// Wall finish for Level 1 rooms: a wainscot (dark wood or green tile) on
// the lower wall, a skirting, a dado rail and a stepped cornice under the
// ceiling, so no wall reads as brick from floor to ceiling.
//
// It finds the room walls itself: tall, thin, axis-aligned boxes in one of
// `walls` materials. Only faces that look into a room are dressed (floor
// just below and a ceiling at wall height in front of them), so outer faces
// under the exterior skin and stair side walls are left alone. Everything
// sits within 6 cm of the wall face, inside the wall's 2D collider.
//
// Walls replaced by one-sided planes (the camera-friendly puzzle room) get
// one-sided planes back, so a camera behind the wall still sees through.

const PANEL = 1.1
const SAMPLE = 0.4
const down = new THREE.Vector3(0, -1, 0)
const up = new THREE.Vector3(0, 1, 0)
const box = new THREE.Box3()
const size = new THREE.Vector3()
const quat = new THREE.Quaternion()
const normal = new THREE.Vector3()

const FINISHES = {
  tile: (k) => ({ panel: k.tile, panelTile: 0.6, trim: k.greenDark, cornice: k.plaster }),
  wood: (k) => ({ panel: k.wainscot, panelTile: 1.4, trim: k.wood, cornice: k.plaster })
}

function axisAligned(mesh) {
  mesh.getWorldQuaternion(quat)
  const x = new THREE.Vector3(1, 0, 0).applyQuaternion(quat)
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(quat)
  return y.y > 0.999 && (Math.abs(x.x) > 0.999 || Math.abs(x.z) > 0.999)
}

// clear: [{ minX, maxX, minZ, maxZ }] wall stretches to leave bare (doors).
export function dressWalls(root, { walls, finish = 'tile', name = 'wall-dressing', skip = () => false, clear = [] } = {}) {
  const cleared = (x, z) => clear.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ)
  const k = getKitMaterials()
  const f = FINISHES[finish](k)
  const kit = createKitBuilder()
  const raycaster = new THREE.Raycaster()
  root.updateMatrixWorld(true)

  const surfaces = []
  const candidates = []
  root.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh) return
    for (let p = node; p; p = p.parent) if (!p.visible || p.userData.decor) return
    surfaces.push(node)
    if (!walls.includes(node.material) || skip(node)) return
    const type = node.geometry.type
    if ((type === 'BoxGeometry' || type === 'PlaneGeometry') && axisAligned(node)) candidates.push(node)
  })

  function hitsNear(origin, dir, far, test) {
    raycaster.set(origin, dir)
    raycaster.far = far
    return raycaster.intersectObjects(surfaces, false).some((hit) => hit.face && test(hit))
  }

  // Floor at the wall's foot and a ceiling at its head, in front of the face.
  function inRoom(x, z, bottom, top) {
    const origin = new THREE.Vector3(x, bottom + 1, z)
    const floor = hitsNear(origin, down, 1.3, (hit) => (
      Math.abs(hit.point.y - bottom) < 0.15 &&
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > 0.6
    ))
    if (!floor) return false
    return hitsNear(origin, up, top - bottom + 0.2, (hit) => (
      hit.point.y > top - 0.45 &&
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y < -0.6
    ))
  }

  let faces = 0
  for (const wall of candidates) {
    box.setFromObject(wall).getSize(size)
    const bottom = box.min.y
    const top = box.max.y
    if (size.y < 2.4) continue
    const alongX = size.x >= size.z
    const length = alongX ? size.x : size.z
    const thick = alongX ? size.z : size.x
    if (length < 0.6 || thick > 0.5) continue
    const start = alongX ? box.min.x : box.min.z
    const flat = wall.geometry.type === 'PlaneGeometry'
    let sides = [-1, 1]
    if (flat) {
      wall.getWorldQuaternion(quat)
      normal.set(0, 0, 1).applyQuaternion(quat)
      sides = [Math.sign(alongX ? normal.z : normal.x)]
    }

    for (const side of sides) {
      const face = side > 0 ? (alongX ? box.max.z : box.max.x) : (alongX ? box.min.z : box.min.x)
      const n = Math.max(1, Math.round(length / SAMPLE))
      const flags = []
      for (let i = 0; i < n; i += 1) {
        const a = start + (i + 0.5) * (length / n)
        const off = face + side * 0.4
        if (alongX ? cleared(a, face) : cleared(face, a)) flags.push(false)
        else flags.push(alongX ? inRoom(a, off, bottom, top) : inRoom(off, a, bottom, top))
      }
      for (let i = 0; i < n;) {
        if (!flags[i]) { i += 1; continue }
        let j = i
        while (j + 1 < n && flags[j + 1]) j += 1
        const a0 = start + (i * length) / n
        const a1 = start + ((j + 1) * length) / n
        dressFace(a0, a1, face, side, bottom, top, alongX, flat)
        faces += 1
        i = j + 1
      }
    }
  }

  function piece(material, a0, a1, face, side, alongX, y, h, depth, offset, tile, flat) {
    const len = a1 - a0
    const mid = (a0 + a1) / 2
    if (flat) {
      const plane = metreUv(new THREE.PlaneGeometry(len, h), tile || 1)
      plane.rotateY(alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2))
      const c = face + side * (offset + depth)
      plane.translate(alongX ? mid : c, y, alongX ? c : mid)
      kit.add(material, plane)
      return
    }
    const c = face + side * (offset + depth / 2)
    kit.add(material, alongX
      ? kbox(len, h, depth, mid, y, c, tile)
      : kbox(depth, h, len, c, y, mid, tile))
  }

  function dressFace(a0, a1, face, side, bottom, top, alongX, flat) {
    const head = top - 0.1
    piece(f.panel, a0, a1, face, side, alongX, bottom + PANEL / 2, PANEL, 0.025, 0, f.panelTile, flat)
    piece(f.trim, a0, a1, face, side, alongX, bottom + 0.08, 0.16, 0.045, 0, 0.5, flat)
    piece(f.trim, a0, a1, face, side, alongX, bottom + PANEL + 0.02, 0.07, 0.055, 0, 0.5, flat)
    piece(f.trim, a0, a1, face, side, alongX, bottom + PANEL - 0.03, 0.03, 0.035, 0, 0.5, flat)
    piece(f.cornice, a0, a1, face, side, alongX, head - 0.09, 0.18, 0.05, 0, 1.5, flat)
    piece(f.cornice, a0, a1, face, side, alongX, head - 0.04, 0.08, 0.1, 0, 1.5, flat)
    piece(f.trim, a0, a1, face, side, alongX, head - 0.2, 0.04, 0.06, 0, 0.5, flat)
  }

  const meshes = kit.build(root, name, { decor: true })
  return { faces, meshes }
}

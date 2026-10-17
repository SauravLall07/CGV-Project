import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAIL_OFFSET } from '../entities/train.js'
import { disposeObject } from '../core/dispose.js'
import { createEndingPlate, PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET } from '../shaders/ending-plate.js'

export const BRIDGE_END = 30
export const GAP_START = 0
export const GAP_END = -12
export const STUB_END = -20
const BENT_SPACING = 6, BRACE_HEIGHT = 12, SLEEPER_SPACING = 0.6

export function createEndingGorge(scene, renderer) {
  const root = new THREE.Group()
  root.name = 'ending-gorge'
  const plate = createEndingPlate(texture => renderer?.initTexture?.(texture))
  scene.add(plate.mesh, root)
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x252c36, roughness: 0.6, metalness: 0.65 })
  const timberParts = [], railParts = [], guardPosts = []
  const pose = new THREE.Object3D()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  function timber(x, y, z, sx, sy, sz, rx = 0, rz = 0) {
    pose.position.set(x, y, z); pose.rotation.set(rx, 0, rz); pose.scale.set(sx, sy, sz)
    pose.updateMatrix(); timberParts.push(pose.matrix.clone())
  }
  function beam(ax, ay, az, bx, by, bz, width = 0.35, depth = width) {
    a.set(ax, ay, az); b.set(bx, by, bz); direction.subVectors(b, a)
    pose.position.copy(a).add(b).multiplyScalar(0.5)
    pose.quaternion.setFromUnitVectors(up, direction.normalize())
    pose.scale.set(width, a.distanceTo(b), depth); pose.updateMatrix(); timberParts.push(pose.matrix.clone())
  }
  function section(start, end, brokenStart, brokenEnd) {
    for (let z = start + 0.3; z < end; z += SLEEPER_SPACING) {
      const broken = (brokenStart && z < start + 1.5) || (brokenEnd && z > end - 1.5)
      if (broken && Math.floor(Math.abs(z) * 10) % 3 === 0) continue
      timber(broken ? Math.sin(z * 9) * 0.1 : 0, -0.28, z, 3.2, 0.26, 0.25, broken ? Math.sin(z * 7) * 0.12 : 0)
    }
    for (const side of [-1, 1]) timber(side * 1.35, -0.62, (start + end) / 2, 0.42, 0.5, end - start)
    let lastZ = null
    for (let z = start + BENT_SPACING / 2; z < end - 1; z += BENT_SPACING) {
      if (start < 0) continue
      const floor = -85
      for (const side of [-1, 1]) beam(side * 1.25, -0.85, z, side * 2.1, floor, z, 0.6)
      timber(0, -0.94, z, 3.6, 0.5, 0.6)
      for (let y = -2; y > floor + 0.5; y -= BRACE_HEIGHT) {
        const low = Math.max(floor + 0.2, y - BRACE_HEIGHT)
        timber(0, low, z, 4.2, 0.3, 0.35)
        if (lastZ !== null) for (const side of [-1, 1]) {
          const mid = (y + low) / 2
          for (const range of [[y, mid], [mid, low]]) {
            beam(side * 1.65, range[0], lastZ, side * 1.65, range[1], z, 0.35, 0.25)
            beam(side * 1.65, range[1], lastZ, side * 1.65, range[0], z, 0.35, 0.25)
          }
        }
      }
      lastZ = z
    }
    for (const x of [-RAIL_OFFSET, RAIL_OFFSET]) {
      const geometry = new THREE.BoxGeometry(0.1, 0.16, end - start)
      geometry.translate(x, -0.08, (start + end) / 2); railParts.push(geometry)
    }
    for (const side of [-1, 1]) timber(side * 1.75, 0.05, (start + end) / 2, 0.22, 0.3, end - start)
    if (start >= 0) return
    for (let z = start + 1.2; z < end; z += 2.4) {
      timber(1.75, 0.55, z, 0.18, 1.1, 0.18); guardPosts.push({ x: 1.75, z })
    }
    timber(1.75, 1.1, (start + end) / 2, 0.16, 0.16, end - start)
  }
  section(0, BRIDGE_END, true, false)
  section(STUB_END, GAP_END, false, true)
  function brokenEnd(edge, sign, depth, sleepers) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8
        a.set(side * (RAIL_OFFSET + t0 * 0.2), -0.08 - depth * t0 * t0, edge + sign * 2.7 * t0)
        b.set(side * (RAIL_OFFSET + t1 * 0.2), -0.08 - depth * t1 * t1, edge + sign * 2.7 * t1)
        direction.subVectors(b, a)
        const rail = new THREE.BoxGeometry(0.1, direction.length(), 0.13)
        pose.position.copy(a).add(b).multiplyScalar(0.5)
        pose.quaternion.setFromUnitVectors(up, direction.normalize()); pose.scale.setScalar(1); pose.updateMatrix()
        rail.applyMatrix4(pose.matrix); railParts.push(rail)
      }
      for (let shard = 0; shard < 4; shard++) for (let step = 0; step < 3; step++) {
        timber(side * 1.35 + (shard - 1.5) * 0.075, -0.6 - step * 0.13,
          edge + sign * (0.12 + step * 0.22 + shard * 0.08), 0.09 - step * 0.02, 0.22 - step * 0.05, 0.35,
          sign * (0.15 + shard * 0.08))
      }
    }
    for (let i = 0; i < sleepers; i++) {
      const t = (i + 1) / (sleepers + 1)
      timber(0, -0.25 - depth * t * t, edge + sign * 2.7 * t, 3.2, 0.2, 0.23, sign * (0.2 + i * 0.19), (i - 1) * 0.16)
    }
  }
  brokenEnd(0, -1, 5.5, 4); brokenEnd(-12, 1, 3, 1)
  beam(-1.25, -1, 1.8, -4, -7, 4.6, 0.42); beam(1.25, -1, 1.8, 2.7, -4.1, 3.2, 0.42)
  timber(-0.3, -1.3, 1.8, 3.6, 0.45, 0.6, 0, THREE.MathUtils.degToRad(25))
  for (let z = BRIDGE_END + 0.3; z < 250; z += SLEEPER_SPACING) timber(0, -0.28, z, 3.2, 0.26, 0.25)
  for (const x of [-RAIL_OFFSET, RAIL_OFFSET]) {
    const geometry = new THREE.BoxGeometry(0.1, 0.16, 250 - BRIDGE_END)
    geometry.translate(x, -0.08, (250 + BRIDGE_END) / 2); railParts.push(geometry)
  }
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 220),
    new THREE.MeshStandardMaterial({ color: 0x3a3229, roughness: 1 }))
  ballast.name = 'ending-ledge-ballast'; ballast.position.set(0, -0.44, 140); root.add(ballast)
  const masonry = new THREE.InstancedMesh(new THREE.BoxGeometry(1.16, 0.57, 4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 260)
  masonry.name = 'ending-stone-piers'
  const stoneColor = new THREE.Color()
  let block = 0
  for (const z of [30, -20]) for (let row = 0; row < 26; row++) for (let col = 0; col < 5; col++) {
    pose.position.set((col - 2) * 1.2 + (row % 2) * 0.08, -0.7 - row * 0.6, z)
    pose.rotation.set(0, 0, 0); pose.scale.setScalar(1); pose.updateMatrix()
    masonry.setMatrixAt(block, pose.matrix)
    stoneColor.set(0x6a6a70).multiplyScalar(0.94 + 0.12 * (0.5 + 0.5 * Math.sin(block * 127.1)))
    masonry.setColorAt(block++, stoneColor)
  }
  masonry.computeBoundingBox(); masonry.computeBoundingSphere(); root.add(masonry)
  const rails = new THREE.Mesh(mergeGeometries(railParts), steel)
  railParts.forEach(geometry => geometry.dispose()); rails.name = 'ending-steel-rails'; root.add(rails)
  const timberMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, timberParts.length)
  timberMesh.name = 'ending-all-timber'
  timberParts.forEach((matrix, i) => timberMesh.setMatrixAt(i, matrix)); timberMesh.computeBoundingSphere(); root.add(timberMesh)
  root.userData.guardPosts = guardPosts; root.userData.bentCount = 5
  const moonCamera = plate.camera
  const moonDirection = new THREE.Vector3(0.78, 0.88, 0.5).unproject(moonCamera).sub(PLATE_CAMERA_POSITION).normalize()
  const fill = new THREE.HemisphereLight(0x34467a, 0x0e1118, 1)
  const moonlight = new THREE.DirectionalLight(0xc4d2ff, 1.8)
  moonlight.target.position.copy(PLATE_CAMERA_TARGET)
  moonlight.position.copy(moonlight.target.position).addScaledVector(moonDirection, 50)
  scene.add(fill, moonlight, moonlight.target)
  scene.background = new THREE.Color(0x0d1426); scene.environment = null
  scene.fog = new THREE.Fog(0x121b2e, 65, 160)
  let disposed = false
  return { root, plate, moonDirection, timberCount: timberParts.length,
    update(delta) { plate.update(delta) },
    dispose() {
      if (disposed) return
      disposed = true; root.removeFromParent(); plate.dispose()
      fill.removeFromParent(); moonlight.removeFromParent(); moonlight.target.removeFromParent()
      disposeObject([root, fill, moonlight])
    } }
}

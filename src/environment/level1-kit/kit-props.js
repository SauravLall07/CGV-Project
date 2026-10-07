import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// The Level 1 kit. Every prop is built at its own origin and placed with a
// matrix; parts go into a builder that merges them by material, so a whole
// room of lamps, benches and posters costs one draw per material. Props
// that repeat a lot (rivets, pipe brackets) are instanced instead.
//
// Local frames: wall props face +Z with their back on the wall at z = 0.
// Floor props stand on y = 0.

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3(1, 1, 1)
const _p = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

export function at(x, y, z, yaw = 0, scale = 1) {
  _p.set(x, y, z)
  _q.setFromAxisAngle(UP, yaw)
  _s.setScalar(scale)
  return new THREE.Matrix4().compose(_p, _q, _s)
}

// Box with UVs in metres / tile, so brick and tile keep their size.
export function kbox(w, h, d, x = 0, y = 0, z = 0, tile = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d)
  if (tile > 0) {
    const uv = geometry.attributes.uv
    const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
    for (let face = 0; face < 6; face += 1) {
      for (let i = 0; i < 4; i += 1) {
        const k = face * 4 + i
        uv.setXY(k, uv.getX(k) * spans[face][0] / tile, uv.getY(k) * spans[face][1] / tile)
      }
    }
  }
  geometry.translate(x, y, z)
  return geometry
}

// Rescales an existing box or plane's UVs to metres / tile, for walls and
// floors that already exist and only change material.
export function metreUv(geometry, tile) {
  const p = geometry.parameters
  const uv = geometry.attributes.uv
  if (geometry.type === 'PlaneGeometry') {
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * p.width / tile, uv.getY(i) * p.height / tile)
  } else if (geometry.type === 'BoxGeometry') {
    const spans = [[p.depth, p.height], [p.depth, p.height], [p.width, p.depth], [p.width, p.depth], [p.width, p.height], [p.width, p.height]]
    let k = 0
    for (const group of geometry.groups) {
      const span = spans[group.materialIndex]
      const vertices = (group.count / 6) * 4
      for (let i = 0; i < vertices; i += 1, k += 1) uv.setXY(k, uv.getX(k) * span[0] / tile, uv.getY(k) * span[1] / tile)
    }
  }
  uv.needsUpdate = true
  return geometry
}

// Swaps materials under `root` and retiles their boxes and planes once each.
// swaps: [[oldMaterial, newMaterial, tile]]
export function retile(root, swaps) {
  const done = new Set()
  root.traverse((node) => {
    if (!node.isMesh) return
    const swap = swaps.find(([from]) => from === node.material)
    if (!swap) return
    node.material = swap[1]
    if (done.has(node.geometry)) return
    done.add(node.geometry)
    metreUv(node.geometry, swap[2])
  })
}

function cylinder(rTop, rBottom, h, segments = 12, x = 0, y = 0, z = 0) {
  const geometry = new THREE.CylinderGeometry(rTop, rBottom, h, segments)
  geometry.translate(x, y, z)
  return geometry
}

// Cylinder from a to b.
export function rod(a, b, radius, segments = 8) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const length = dir.length()
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments)
  _q.setFromUnitVectors(UP, dir.normalize())
  geometry.applyQuaternion(_q)
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return geometry
}

function clean(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
  }
  if (!geometry.attributes.uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2))
  }
  return geometry.index ? geometry.toNonIndexed() : geometry
}

export function safeMerge(parts) {
  if (!parts.length) return null
  const ready = parts.map((part) => {
    const out = clean(part)
    if (out !== part) part.dispose()
    return out
  })
  const merged = mergeGeometries(ready, false)
  for (const part of ready) part.dispose()
  return merged
}

export function createKitBuilder() {
  const parts = new Map()
  const instances = new Map()

  function add(material, geometry, matrix, castShadow = false) {
    if (!geometry) return
    if (matrix) geometry.applyMatrix4(matrix)
    const key = castShadow ? 1 : 0
    if (!parts.has(material)) parts.set(material, [[], []])
    parts.get(material)[key].push(geometry)
  }

  // One shared geometry, many placements.
  function instance(key, makeGeometry, material, matrix) {
    if (!instances.has(key)) instances.set(key, { geometry: makeGeometry(), material, matrices: [] })
    instances.get(key).matrices.push(matrix.clone())
  }

  // `decor`: wall dressing that should not block guard sight, interaction
  // rays or the camera (see the collidables filter in boarding.js).
  function build(parent, name = 'kit', { decor = false } = {}) {
    const meshes = []
    let n = 0
    for (const [material, [plain, shadowed]] of parts) {
      for (const [list, castShadow] of [[plain, false], [shadowed, true]]) {
        const geometry = safeMerge(list)
        if (!geometry) continue
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = `${name}-${n++}`
        mesh.castShadow = castShadow
        mesh.receiveShadow = !material.transparent
        parent.add(mesh)
        meshes.push(mesh)
      }
    }
    for (const [key, entry] of instances) {
      const mesh = new THREE.InstancedMesh(entry.geometry, entry.material, entry.matrices.length)
      entry.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
      mesh.instanceMatrix.needsUpdate = true
      mesh.name = `${name}-${key}`
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      parent.add(mesh)
      meshes.push(mesh)
    }
    if (decor) {
      for (const mesh of meshes) {
        mesh.userData.decor = true
        mesh.userData.noInteractionBlocker = true
        mesh.userData.noCameraCollision = true
      }
    }
    parts.clear()
    instances.clear()
    return meshes
  }

  return { add, instance, build }
}

function local(M, x, y, z, yaw = 0) {
  return M ? new THREE.Matrix4().multiplyMatrices(M, at(x, y, z, yaw)) : at(x, y, z, yaw)
}

// --- Lamps ------------------------------------------------------------------

// Brass pendant: ceiling rose, rod, a bell shade with a lit cream lining and
// a bulb. Origin is the ceiling point; it hangs `drop` metres.
export function pendantLamp(b, k, M, drop = 1.4) {
  b.add(k.brass, cylinder(0.12, 0.12, 0.05, 14, 0, -0.025, 0), M)
  b.add(k.brass, cylinder(0.018, 0.018, drop - 0.2, 6, 0, -(drop - 0.2) / 2, 0), M)
  b.add(k.brass, cylinder(0.05, 0.07, 0.12, 10, 0, -drop + 0.22, 0), M)
  const profile = [
    new THREE.Vector2(0.06, 0.18),
    new THREE.Vector2(0.1, 0.16),
    new THREE.Vector2(0.2, 0.06),
    new THREE.Vector2(0.34, -0.06),
    new THREE.Vector2(0.4, -0.13),
    new THREE.Vector2(0.41, -0.16)
  ]
  const outer = new THREE.LatheGeometry(profile, 18)
  outer.translate(0, -drop + 0.02, 0)
  b.add(k.brass, outer, M)
  const inner = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p.x * 0.94, p.y - 0.01)), 18)
  inner.translate(0, -drop + 0.02, 0)
  b.add(k.lampShade, inner, M)
  const bulb = new THREE.SphereGeometry(0.09, 12, 8)
  bulb.translate(0, -drop - 0.03, 0)
  b.add(k.bulb, bulb, M)
}

// Caged bulkhead lamp: round base, frosted dome, three cage bars and a ring.
// Origin on the mounting surface; the dome points along local +Y.
export function bulkheadLamp(b, k, M) {
  b.add(k.iron, cylinder(0.17, 0.17, 0.05, 16, 0, 0.025, 0), M)
  const dome = new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1, 0.9, 1)
  dome.translate(0, 0.05, 0)
  b.add(k.bulkhead, dome, M)
  const ring = new THREE.TorusGeometry(0.135, 0.012, 6, 18)
  ring.rotateX(Math.PI / 2)
  ring.translate(0, 0.09, 0)
  b.add(k.iron, ring, M)
  for (let i = 0; i < 3; i += 1) {
    const bar = new THREE.TorusGeometry(0.135, 0.01, 4, 10, Math.PI)
    bar.rotateY((i / 3) * Math.PI)
    bar.translate(0, 0.05, 0)
    b.add(k.iron, bar, M)
  }
}

// Banker's lamp: brass base and stem, green glass shade.
export function bankersLamp(b, k, M) {
  b.add(k.brass, cylinder(0.08, 0.09, 0.03, 14, 0, 0.015, 0), M)
  b.add(k.brass, cylinder(0.012, 0.012, 0.3, 6, 0, 0.18, 0), M)
  const shade = new THREE.CylinderGeometry(0.06, 0.11, 0.09, 16, 1, true, 0, Math.PI)
  shade.rotateZ(Math.PI / 2)
  shade.rotateY(Math.PI / 2)
  shade.scale(1.6, 1, 1)
  shade.translate(0, 0.34, 0.02)
  b.add(k.bankerGlass, shade, M)
}

// --- Pipes ------------------------------------------------------------------

// Pipe from a to b with a flange at each end and a bracket every 1.6 m.
// `bracketAxis` points from the pipe to the surface it is fixed to.
export function pipeRun(b, k, a, c, radius = 0.06, material = null, bracketAxis = new THREE.Vector3(0, 1, 0)) {
  const mat = material ?? k.pipe
  b.add(mat, rod(a, c, radius, 10))
  const dir = new THREE.Vector3().subVectors(c, a)
  const length = dir.length()
  dir.normalize()
  for (const p of [a, c]) {
    b.add(k.iron, rod(p.clone().addScaledVector(dir, -0.03), p.clone().addScaledVector(dir, 0.03), radius * 1.6, 10))
  }
  const count = Math.max(1, Math.floor(length / 1.6))
  for (let i = 1; i <= count; i += 1) {
    const p = a.clone().addScaledVector(dir, (i / (count + 1)) * length)
    b.add(k.iron, rod(p.clone().addScaledVector(dir, -0.025), p.clone().addScaledVector(dir, 0.025), radius * 1.35, 8))
    b.add(k.iron, rod(p, p.clone().addScaledVector(bracketAxis, radius + 0.08), 0.012, 4))
  }
}

// --- Furniture --------------------------------------------------------------

// Station bench with a burgundy cushion. Same footprint as the old blockout
// bench (x ±0.43, z ±1; the back is at -X), so its collider is unchanged.
export function cushionedBench(b, k, M) {
  for (const z of [-0.92, 0.92]) {
    b.add(k.iron, kbox(0.62, 0.06, 0.06, 0.06, 0.42, z), M)
    b.add(k.iron, kbox(0.06, 0.42, 0.06, 0.32, 0.21, z), M)
    b.add(k.iron, kbox(0.06, 0.42, 0.06, -0.2, 0.21, z), M)
    b.add(k.iron, kbox(0.06, 0.62, 0.06, -0.38, 0.73, z), M)
    b.add(k.iron, kbox(0.62, 0.05, 0.08, 0.06, 0.66, z), M)
  }
  b.add(k.wood, kbox(0.86, 0.06, 2, 0, 0.45, 0), M, true)
  b.add(k.cushion, kbox(0.62, 0.08, 1.8, 0.06, 0.52, 0), M)
  b.add(k.wood, kbox(0.1, 0.56, 1.84, -0.38, 0.86, 0), M)
  b.add(k.cushion, kbox(0.06, 0.4, 1.7, -0.31, 0.86, 0), M)
  b.add(k.brass, kbox(0.04, 0.03, 1.84, -0.38, 1.15, 0), M)
}

// Crate: stencilled boards and corner battens.
export function crate(b, k, M, w = 0.8, h = 0.7, d = 0.8) {
  b.add(k.crate, kbox(w, h, d, 0, h / 2, 0), M, true)
  crateBattens(b, k, M, w, h, d)
}

// Corner and rim battens alone, for a box that already exists.
export function crateBattens(b, k, M, w, h, d) {
  const t = 0.05
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(k.wood, kbox(t, h + 0.01, t, sx * (w / 2 - t / 2 + 0.01), h / 2, sz * (d / 2 - t / 2 + 0.01)), M)
    }
  }
  for (const y of [0.04, h - 0.04]) {
    b.add(k.wood, kbox(w + 0.02, 0.06, t, 0, y, d / 2 + 0.005), M)
    b.add(k.wood, kbox(w + 0.02, 0.06, t, 0, y, -d / 2 - 0.005), M)
    b.add(k.wood, kbox(t, 0.06, d + 0.02, w / 2 + 0.005, y, 0), M)
    b.add(k.wood, kbox(t, 0.06, d + 0.02, -w / 2 - 0.005, y, 0), M)
  }
}

// Steamer trunk: leather, brass corners, two straps.
export function trunk(b, k, M, w = 0.9, h = 0.45, d = 0.55) {
  b.add(k.leather, kbox(w, h, d, 0, h / 2, 0), M, true)
  b.add(k.wood, kbox(w + 0.01, 0.03, d + 0.01, 0, h * 0.68, 0), M)
  const c = 0.07
  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      for (const sz of [-1, 1]) {
        b.add(k.brass, kbox(c, c, c, sx * (w / 2 - c / 2 + 0.004), sy ? h - c / 2 + 0.004 : c / 2 - 0.004, sz * (d / 2 - c / 2 + 0.004)), M)
      }
    }
  }
  for (const x of [-w * 0.28, w * 0.28]) {
    b.add(k.greenDark, kbox(0.06, h + 0.012, d + 0.012, x, h / 2, 0), M)
    b.add(k.brass, kbox(0.08, 0.06, 0.02, x, h * 0.62, d / 2 + 0.01), M)
  }
}

// Porter's trolley stacked with luggage. Same extents as the old blockout
// trolley (x ±0.58, z ±0.9), so colliders built from its bounds hold.
export function luggageTrolley(b, k, M) {
  b.add(k.wood, kbox(1.1, 0.08, 1.8, 0, 0.32, 0), M, true)
  for (const x of [-0.5, 0.5]) b.add(k.iron, kbox(0.05, 0.08, 1.8, x, 0.25, 0), M)
  for (const z of [-0.6, 0.6]) {
    for (const x of [-0.5, 0.5]) {
      const wheel = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14)
      wheel.rotateZ(Math.PI / 2)
      wheel.translate(x, 0.16, z)
      b.add(k.iron, wheel, M)
    }
    b.add(k.iron, rod(new THREE.Vector3(-0.58, 0.16, z), new THREE.Vector3(0.58, 0.16, z), 0.025, 6), M)
  }
  b.add(k.brass, rod(new THREE.Vector3(-0.45, 0.36, -0.87), new THREE.Vector3(-0.45, 1.15, -0.87), 0.022), M)
  b.add(k.brass, rod(new THREE.Vector3(0.45, 0.36, -0.87), new THREE.Vector3(0.45, 1.15, -0.87), 0.022), M)
  b.add(k.brass, rod(new THREE.Vector3(-0.45, 1.15, -0.87), new THREE.Vector3(0.45, 1.15, -0.87), 0.025), M)
  trunk(b, k, local(M, 0, 0.36, 0.2), 0.8, 0.42, 1.2)
  trunk(b, k, local(M, 0.02, 0.78, 0.28, 0.08), 0.7, 0.36, 0.95)
  crate(b, k, local(M, -0.05, 1.14, 0.25, -0.2), 0.42, 0.34, 0.42)
}

// --- Wall dressing ----------------------------------------------------------

// Framed poster; the frame is dark wood with a brass inner lip.
export function framedPoster(b, k, M, index, w = 0.8, h = 1.2) {
  b.add(k.wood, kbox(w + 0.12, h + 0.12, 0.04, 0, 0, 0.02), M)
  b.add(k.brass, kbox(w + 0.02, h + 0.02, 0.045, 0, 0, 0.022), M)
  const plane = new THREE.PlaneGeometry(w, h)
  plane.translate(0, 0, 0.046)
  b.add(k.poster(index), plane, M)
}

// Wall clock with a brass bezel. Origin at the centre of the face.
export function wallClock(b, k, M, radius = 0.42) {
  const back = new THREE.CylinderGeometry(radius + 0.05, radius + 0.05, 0.08, 28)
  back.rotateX(Math.PI / 2)
  back.translate(0, 0, 0.04)
  b.add(k.wood, back, M)
  const bezel = new THREE.TorusGeometry(radius + 0.02, 0.03, 8, 32)
  bezel.translate(0, 0, 0.085)
  b.add(k.brass, bezel, M)
  const face = new THREE.CircleGeometry(radius, 32)
  face.translate(0, 0, 0.082)
  b.add(k.clock, face, M)
}

// Ticket office front: panelled counter, brass grille, lit booth behind,
// green banker's lamp, and the sign. Origin at the wall, centred, booth
// facing +Z; `width` is along X.
export function ticketBooth(b, k, M, width = 4) {
  const depth = 0.38
  b.add(k.wood, kbox(width, 1.05, depth - 0.04, 0, 0.525, depth / 2 - 0.02), M, true)
  const panels = Math.max(2, Math.round(width / 0.9))
  const pw = (width - 0.2) / panels
  for (let i = 0; i < panels; i += 1) {
    const x = -width / 2 + 0.1 + pw * (i + 0.5)
    b.add(k.wainscot, kbox(pw - 0.12, 0.66, 0.03, x, 0.52, depth - 0.03), M)
    b.add(k.brass, kbox(pw - 0.08, 0.02, 0.035, x, 0.87, depth - 0.03), M)
  }
  b.add(k.wood, kbox(width + 0.12, 0.06, depth + 0.1, 0, 1.08, depth / 2 + 0.03), M)
  b.add(k.brass, kbox(width + 0.14, 0.025, 0.03, 0, 1.1, depth + 0.08), M)
  // Upper booth: frame posts, top fascia, grille and the lit interior.
  const top = 2.55
  for (const x of [-width / 2 + 0.08, width / 2 - 0.08, 0]) {
    b.add(k.wood, kbox(0.16, top - 1.1, 0.14, x, (top + 1.1) / 2, 0.08), M)
  }
  b.add(k.wood, kbox(width, 0.4, 0.18, 0, top + 0.2, 0.09), M)
  const glowPlane = new THREE.PlaneGeometry(width - 0.2, top - 1.15)
  glowPlane.translate(0, (top + 1.15) / 2, 0.012)
  b.add(k.lampShade, glowPlane, M)
  for (let x = -width / 2 + 0.2; x <= width / 2 - 0.2; x += 0.12) {
    if (Math.abs(x) < 0.09) continue
    b.add(k.brass, cylinder(0.008, 0.008, top - 1.12, 5, x, (top + 1.12) / 2, 0.1), M)
  }
  for (const y of [1.16, 1.8, top - 0.05]) b.add(k.brass, kbox(width - 0.1, 0.025, 0.03, 0, y, 0.1), M)
  // Speaking holes in a brass arch per window.
  for (const x of [-width / 4, width / 4]) {
    b.add(k.brass, kbox(0.5, 0.04, 0.12, x, 1.13, 0.12), M)
  }
  const sign = new THREE.PlaneGeometry(Math.min(width - 0.3, 2.6), 0.32)
  sign.translate(0, top + 0.2, 0.185)
  b.add(k.ticketSign, sign, M)
  bankersLamp(b, k, local(M, width * 0.3, 1.11, depth - 0.05))
  // Ledger and pen tray on the counter.
  b.add(k.leather, kbox(0.32, 0.03, 0.22, -width * 0.25, 1.125, depth - 0.02, 0), M)
}

// Departure board on two hanging rods. Origin at the board centre, facing +Z.
export function departureBoard(b, k, M, w = 2.4, h = 1.2, hang = 1.4) {
  b.add(k.iron, kbox(w + 0.16, h + 0.16, 0.12, 0, 0, -0.02), M)
  const face = new THREE.PlaneGeometry(w, h)
  face.translate(0, 0, 0.045)
  b.add(k.departures, face, M)
  for (const x of [-w * 0.4, w * 0.4]) b.add(k.brass, cylinder(0.015, 0.015, hang, 6, x, h / 2 + hang / 2, 0), M)
  b.add(k.brass, kbox(w + 0.2, 0.05, 0.14, 0, h / 2 + 0.1, -0.02), M)
}

// Green panelled door with a brass handle and a lit transom. Flush on the
// wall; origin at the bottom centre.
export function greenDoor(b, k, M, w = 1.2, h = 2.3) {
  b.add(k.greenDark, kbox(w + 0.24, h + 0.7, 0.08, 0, (h + 0.7) / 2, 0.04), M)
  b.add(k.green, kbox(w, h, 0.06, 0, h / 2, 0.1), M)
  for (const y of [h * 0.28, h * 0.72]) {
    b.add(k.greenDark, kbox(w * 0.7, h * 0.32, 0.02, 0, y, 0.135), M)
    b.add(k.green, kbox(w * 0.62, h * 0.26, 0.02, 0, y, 0.145), M)
  }
  b.add(k.brass, kbox(0.04, 0.16, 0.04, w * 0.36, h * 0.48, 0.15), M)
  b.add(k.brass, rod(new THREE.Vector3(w * 0.36, h * 0.48, 0.15), new THREE.Vector3(w * 0.36, h * 0.48, 0.2), 0.035, 10), M)
  b.add(k.brass, kbox(w * 0.4, 0.05, 0.02, 0, h * 0.06, 0.14), M)
  const transom = new THREE.PlaneGeometry(w - 0.1, 0.42)
  transom.translate(0, h + 0.3, 0.09)
  b.add(k.transom, transom, M)
  for (const x of [-w / 6, w / 6]) b.add(k.greenDark, kbox(0.03, 0.42, 0.03, x, h + 0.3, 0.1), M)
  b.add(k.greenDark, kbox(w, 0.06, 0.05, 0, h + 0.05, 0.1), M)
}

// A window onto the moonlit platform, with glazing bars and a sill.
export function nightWindow(b, k, M, w = 3, h = 1.6) {
  b.add(k.greenDark, kbox(w + 0.24, h + 0.24, 0.1, 0, 0, 0.0), M)
  const view = new THREE.PlaneGeometry(w, h)
  view.translate(0, 0, 0.06)
  b.add(k.nightView, view, M)
  const glass = new THREE.PlaneGeometry(w, h)
  glass.translate(0, 0, 0.09)
  b.add(k.glass, glass, M)
  const cols = Math.round(w / 0.5)
  for (let i = 1; i < cols; i += 1) b.add(k.greenDark, kbox(0.035, h, 0.04, -w / 2 + (i * w) / cols, 0, 0.1), M)
  for (const y of [-h / 6, h / 6]) b.add(k.greenDark, kbox(w, 0.035, 0.04, 0, y, 0.1), M)
  b.add(k.tile, kbox(w + 0.4, 0.06, 0.24, 0, -h / 2 - 0.15, 0.1), M)
}

// Potted palm: terracotta pot, soil, a short trunk and drooping fronds.
export function pottedPalm(b, k, M, scale = 1) {
  const S = new THREE.Matrix4().makeScale(scale, scale, scale)
  if (M) S.premultiply(M)
  const profile = [
    new THREE.Vector2(0.17, 0),
    new THREE.Vector2(0.22, 0.05),
    new THREE.Vector2(0.27, 0.45),
    new THREE.Vector2(0.3, 0.5),
    new THREE.Vector2(0.29, 0.55)
  ]
  b.add(k.pot, new THREE.LatheGeometry(profile, 16), S)
  b.add(k.soil, cylinder(0.26, 0.26, 0.02, 14, 0, 0.5, 0), S)
  b.add(k.wood, cylinder(0.04, 0.06, 0.6, 7, 0, 0.8, 0), S)
  for (let i = 0; i < 9; i += 1) {
    const frond = new THREE.PlaneGeometry(0.42, 1.05, 1, 3)
    // Bend the frond so its tip droops.
    const pos = frond.attributes.position
    for (let v = 0; v < pos.count; v += 1) {
      const t = (pos.getY(v) + 0.525) / 1.05
      pos.setZ(v, -t * t * 0.45)
    }
    frond.translate(0, 0.525, 0)
    frond.rotateX(-0.75 - (i % 3) * 0.2)
    frond.rotateY((i / 9) * Math.PI * 2 + (i % 2) * 0.2)
    frond.translate(0, 1.05 + (i % 3) * 0.06, 0)
    b.add(k.frond, frond, S)
  }
}

// Laser emitter: a small steel box with a red lens and a mounting plate.
export function laserEmitter(b, k, M) {
  b.add(k.steelFrame, kbox(0.16, 0.2, 0.14, 0, 0, 0), M)
  b.add(k.iron, kbox(0.22, 0.26, 0.03, 0, 0, -0.07), M)
  const lens = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12)
  lens.rotateX(Math.PI / 2)
  lens.translate(0, 0.02, 0.08)
  b.add(k.redLens, lens, M)
}

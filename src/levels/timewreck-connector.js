import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const CONNECTOR = Object.freeze({ halfLength: 1.2, width: 2.2, top: 0.04,
  warning: 1.3, fold: 1, angle: 1.2, walkable: 0.15, trigger: 3.4 })

// Cut only the two L3 end floors and their floor-level edge strips. The source
// builders and Level 2 stay unchanged. No decorative layer may bridge this void.
function cutLip(root, span, key, near, gap) {
  const floor = root.getObjectByName(`floor-${key}`)
  const a = near ? gap.maxZ : span.minZ
  const b = near ? span.maxZ : gap.minZ
  const geometry = new THREE.PlaneGeometry(5.2, b - a)
  geometry.translate(0, -((a + b) / 2 - span.center), 0)
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i,
    0.5 + geometry.attributes.position.getY(i) / (span.maxZ - span.minZ))
  floor.geometry.dispose(); floor.geometry = geometry
  const strips = []
  floor.parent.traverse(n => { if (n.name === `${key}-floor-edge`) strips.push(n) })
  for (const strip of strips) {
    const { width, height, depth } = strip.geometry.parameters
    const from = Math.max(a, span.center + strip.position.z - depth / 2)
    const to = Math.min(b, span.center + strip.position.z + depth / 2)
    strip.geometry.dispose()
    strip.geometry = new THREE.BoxGeometry(width, height, to - from)
    strip.position.z = (from + to) / 2 - span.center
  }
}

export function createWreckConnector({ root, spans, player, timeSystem, unregisters, warn }) {
  const boundary = spans.convergence.minZ
  const gap = { minX: -2.6, maxX: 2.6,
    minZ: boundary - CONNECTOR.halfLength, maxZ: boundary + CONNECTOR.halfLength }
  cutLip(root, spans.convergence, 'convergence', true, gap)
  cutLip(root, spans.mechanical, 'mechanical', false, gap)
  const group = new THREE.Group(); group.name = 'buckling-inter-car-connector'; root.add(group)
  const wood = new THREE.MeshStandardMaterial({ color: 0x634329, roughness: 0.72 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.8, roughness: 0.4 })
  const cyan = new THREE.MeshStandardMaterial({ color: 0x315954, emissive: 0x38bdf8, emissiveIntensity: 0.35 })
  function batch(parent, name, material, pieces) {
    const mesh = new THREE.Mesh(mergeGeometries(pieces, false), material)
    mesh.name = name; parent.add(mesh); pieces.forEach(g => g.dispose()); return mesh
  }
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
  const leaves = []
  for (const sign of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.name = `connector-${sign < 0 ? 'approach' : 'exit'}-hinge`
    hinge.position.set(0, CONNECTOR.top, sign < 0 ? gap.maxZ : gap.minZ)
    group.add(hinge); leaves.push({ hinge, sign })
    batch(hinge, 'connector-deck', wood, [box(CONNECTOR.width, 0.12, 1.2, 0, -0.06, sign * 0.6)])
    const parts = [box(2.5, 0.08, 0.12, 0, -0.06, 0)]
    for (const x of [-1.06, 1.06]) parts.push(box(0.06, 0.025, 1.2, x, -0.0125, sign * 0.6))
    for (const d of [0.3, 0.6, 0.9]) parts.push(box(2.08, 0.012, 0.025, 0, -0.006, sign * d))
    batch(hinge, 'connector-hinge-and-seams', brass, parts)
  }
  const lips = []
  for (const [z, sign] of [[gap.minZ, -1], [gap.maxZ, 1]]) {
    lips.push(box(5.2, 0.025, 0.12, 0, -0.0125, z + sign * 0.06))
    for (const x of [-1.06, 1.06]) lips.push(box(0.08, 0.025, 0.3, x, 0.0125, z + sign * 0.15))
  }
  batch(group, 'connector-fixed-lips', brass, lips)
  const outlineBox = new THREE.BoxGeometry(CONNECTOR.width, 0.04, 2.4)
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(outlineBox),
    new THREE.LineBasicMaterial({ color: 0x8bd9e8 }))
  outlineBox.dispose()
  outline.position.set(0, CONNECTOR.top, boundary); outline.raycast = () => {}; group.add(outline)
  const signal = batch(group, 'connector-clearance-arm', cyan, [box(0.55, 0.08, 0.08, 0, 0, 0)])
  signal.position.set(1.6, 0.3, gap.maxZ + 0.4)
  const strips = Array.from({ length: 24 }, () => ({ minX: 0, maxX: -1, minZ: 0, maxZ: -1, y: 0 }))
  const safeSupports = [
    { minX: -2.6, maxX: 2.6, minZ: gap.maxZ, maxZ: spans.convergence.maxZ, y: 0 },
    { minX: -2.6, maxX: 2.6, minZ: spans.mechanical.minZ, maxZ: gap.minZ, y: 0 }
  ]
  const supports = [...strips, ...safeSupports]
  let clock = -1
  const end = CONNECTOR.warning + CONNECTOR.fold
  function angle() {
    const t = THREE.MathUtils.clamp((clock - CONNECTOR.warning) / CONNECTOR.fold, 0, 1)
    return t * t * (3 - 2 * t) * CONNECTOR.angle
  }
  function apply() {
    const a = angle(), c = Math.cos(a), s = Math.sin(a)
    outline.visible = a > 0.02
    signal.rotation.z = a > CONNECTOR.walkable ? Math.PI / 2 : 0
    let index = 0
    for (const { hinge, sign } of leaves) {
      hinge.rotation.x = sign * a
      for (let i = 0; i < 12; i++) {
        const strip = strips[index++], d0 = i * 0.1, d1 = (i + 1) * 0.1
        const z0 = hinge.position.z + sign * c * d0, z1 = hinge.position.z + sign * c * d1
        strip.minX = a <= CONNECTOR.walkable ? -CONNECTOR.width / 2 : 0
        strip.maxX = a <= CONNECTOR.walkable ? CONNECTOR.width / 2 : -1
        strip.minZ = Math.min(z0, z1); strip.maxZ = Math.max(z0, z1)
        strip.y = CONNECTOR.top - s * (d0 + d1) / 2
      }
    }
  }
  unregisters.push(timeSystem.register(group, {
    recordWhen: () => clock >= 0 && clock < end,
    onUpdate(dt) { if (clock >= 0) clock = Math.min(end, clock + dt); apply() },
    getSnapshot: () => ({ clock }), restoreSnapshot(snapshot) { clock = snapshot.clock; apply() }
  }))
  group.traverse(n => { n.userData.noCameraCollision = true })
  apply()
  return { group, gap, boundary, supports, get clock() { return clock }, get angle() { return angle() },
    update(active = true) {
      const z = player.mesh.position.z
      if (active && clock < 0 && z <= boundary + CONNECTOR.trigger && z > gap.maxZ) {
        clock = 0; warn(); apply()
      }
    },
    reset() { clock = -1; group.visible = true; apply() }
  }
}

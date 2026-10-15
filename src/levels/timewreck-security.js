import * as THREE from 'three'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Flat chevrons live on real surfaces, never across the missing floor. Travel
// is -Z. Their direction is geometry as well as colour, including during Freeze.
function steeringChevron(dx, dz, x = 0, z = 0) {
  const shape = new THREE.Shape()
  shape.moveTo(-0.22, -0.12)
  for (const p of [[0, 0.22], [0.22, -0.12], [0.14, -0.18], [0, 0.04], [-0.14, -0.18]]) shape.lineTo(...p)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  geometry.rotateY(Math.atan2(-dx, -dz))
  geometry.translate(x, 0.016, z)
  return geometry
}

// Travel is -Z. Both legs are short enough to use independently from a safe
// observation spot; the centre is real shell floor, not a timed support.
export function securityCrossingLayout(center, halfWidth = 2.6) {
  const holes = [[1.4, 6.8], [-6.8, -1.4]].map(([a, b]) => ({
    minX: -halfWidth, maxX: halfWidth, minZ: center + a, maxZ: center + b
  }))
  const tiles = [
    [-1.0, 5.95, 1.8], [-0.2, 4.25, 1.8], [0.8, 2.5, 2.3],
    [0.85, -2.3, 1.9], [0.1, -6.15, 1.4]
  ].map(([x, z, length]) => ({ x, z: center + z, width: 1.6, length }))
  return { holes, tiles, center, minZ: holes[1].minZ, maxZ: holes[0].maxZ,
    islandMinZ: center - 1.4, islandMaxZ: center + 1.4 }
}

export function cutSecurityFloor(floor, span, layout) {
  // Replace only this L3 floor. Keep the shared carriage builder/L2 untouched.
  const h = layout.holes
  const ranges = [[span.minZ, h[1].minZ], [h[1].maxZ, h[0].minZ], [h[0].maxZ, span.maxZ]]
  const shapes = ranges.map(([a, b]) => {
    const shape = new THREE.Shape()
    shape.moveTo(h[0].minX, -(b - span.center))
    shape.lineTo(h[0].maxX, -(b - span.center))
    shape.lineTo(h[0].maxX, -(a - span.center))
    shape.lineTo(h[0].minX, -(a - span.center))
    shape.closePath()
    return shape
  })
  const geometry = new THREE.ShapeGeometry(shapes)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i,
    uv.getX(i) / (h[0].maxX - h[0].minX) + 0.5,
    uv.getY(i) / (span.maxZ - span.minZ) + 0.5)
  floor.geometry.dispose()
  floor.geometry = geometry
}

export function createSecurityCrossing({ root, carriage, span, halfWidth = 2.6 }) {
  const layout = securityCrossingLayout(span.center, halfWidth)
  cutSecurityFloor(carriage.getObjectByName('floor-security'), span, layout)
  // These decorative strips otherwise bridge the full-width floor openings.
  for (const name of ['security-floor-edge', 'security-floor-cyan']) {
    const strips = []
    carriage.traverse(node => { if (node.name === name) strips.push(node) })
    for (const strip of strips) {
      const ranges = [[span.minZ + 1.2, layout.minZ],
        [layout.islandMinZ, layout.islandMaxZ], [layout.maxZ, span.maxZ - 1.2]]
      for (const [a, b] of ranges) {
        const segment = new THREE.Mesh(new THREE.BoxGeometry(
          strip.geometry.parameters.width, strip.geometry.parameters.height, b - a), strip.material)
        segment.name = name
        segment.position.set(strip.position.x, strip.position.y, (a + b) / 2 - span.center)
        segment.userData.noCameraCollision = true
        carriage.add(segment)
      }
      carriage.remove(strip)
      strip.geometry.dispose()
    }
  }

  const group = new THREE.Group()
  group.name = 'security-two-stage-crossing'
  root.add(group)
  // Ice-cyan temporal field — distinct from Passenger collapse violet.
  const material = createChronoFieldMaterial({ baseColor: 0x3a4550, glowColor: 0x67e8f9,
    opacity: 0.92, doubleSided: true })
  const wood = new THREE.MeshStandardMaterial({ color: 0x684a30, roughness: 0.6 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.85, roughness: 0.42 })
  const cyan = new THREE.MeshStandardMaterial({ color: 0x1a3a42, emissive: 0x22d3ee, emissiveIntensity: 1.05 })
  const box = (parent, w, h, d, mat, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }
  // Flat edge markings lie wholly on solid floor; none reach across a void.
  for (const hole of layout.holes) {
    for (const [z, side] of [[hole.minZ, -1], [hole.maxZ, 1]]) {
      box(group, halfWidth * 2, 0.025, 0.12, brass, 0, 0.0125, z + side * 0.06)
      box(group, halfWidth * 2, 0.015, 0.03, cyan, 0, 0.03, z + side * 0.025)
    }
  }
  const island = new THREE.Group()
  island.name = 'security-recharge-island'
  island.position.z = span.center
  group.add(island)
  // An inset teal/brass compass cue marks the safe, full-width shell floor.
  box(island, 1.5, 0.01, 1.1, cyan, 0, 0.005, 0)
  for (const x of [-0.76, 0.76]) box(island, 0.025, 0.015, 1.14, brass, x, 0.012, 0)

  const approach = steeringChevron(0, -1, layout.tiles[0].x, layout.maxZ + 0.55)
  const departure = steeringChevron(0, -1, layout.tiles[3].x, span.center - 0.85)
  const directions = new THREE.Mesh(mergeGeometries([approach, departure], false), brass)
  approach.dispose(); departure.dispose()
  directions.name = 'security-solid-floor-directions'
  group.add(directions)

  const tiles = layout.tiles.map((tile, i) => {
    const mesh = new THREE.Group()
    mesh.name = `security-freeze-tile-${i}`
    box(mesh, tile.width, 0.14, tile.length, material, 0, -0.085, 0)
    // A flat, continuous wood top; support dimensions match this mesh exactly.
    box(mesh, tile.width, 0.03, tile.length, wood, 0, 0, 0)
    for (const x of [-tile.width / 2 + 0.025, tile.width / 2 - 0.025]) {
      box(mesh, 0.05, 0.015, tile.length, brass, x, 0, 0)
    }
    for (const z of [-tile.length / 2 + 0.02, tile.length / 2 - 0.02]) {
      box(mesh, tile.width, 0.015, 0.04, cyan, 0, 0, z)
    }
    const next = layout.tiles[i + 1]
    const target = i === 2 ? { x: 0, z: span.center } : next ?? { x: 0, z: layout.minZ - 0.6 }
    const marks = [steeringChevron(target.x - tile.x, target.z - tile.z, 0, 0.3)]
    // Paired bars stop at the takeoff and begin again on the landing. No
    // ribbon or arrow fills the air gap; the jump stays a visible interruption.
    if (i === 3 || i === 4) {
      for (const inset of [0.14, 0.25]) {
        const stripe = new THREE.PlaneGeometry(0.65, 0.035)
        stripe.rotateX(-Math.PI / 2)
        stripe.translate(0, 0.016, (i === 3 ? -1 : 1) * (tile.length / 2 - inset))
        marks.push(stripe)
      }
    }
    const marker = new THREE.Mesh(mergeGeometries(marks, false), brass)
    marks.forEach(part => part.dispose())
    marker.name = i === 3 ? 'security-jump-takeoff-marks' : i === 4 ? 'security-jump-landing-marks' : 'security-steering-marks'
    mesh.add(marker)
    group.add(mesh)
    // Pale outlines show the intended crossing before spending any energy.
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(tile.width, 0.03, tile.length)),
      new THREE.LineBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.58 }))
    outline.position.set(tile.x, 0.12, tile.z)
    outline.raycast = () => {}
    group.add(outline)
    return mesh
  })
  let clock = 0
  let settle = 0
  // Explicit solid-floor tops also lower feet after leaving a raised tile;
  // the player's generic floor sampler otherwise retains the previous height.
  const safeSupports = [[span.minZ, layout.minZ], [layout.islandMinZ, layout.islandMaxZ],
    [layout.maxZ, span.maxZ]].map(([minZ, maxZ]) => ({ minX: -halfWidth,
      maxX: halfWidth, minZ, maxZ, y: 0 }))
  const supports = []
  function apply() {
    supports.length = 0
    supports.push(...safeSupports)
    tiles.forEach((mesh, i) => {
      const tile = layout.tiles[i]
      const phase = clock + i * 1.7
      mesh.position.set(tile.x + Math.sin(phase * 0.8) * 0.18 * (1 - settle),
        0.105 + (0.65 + Math.sin(phase * 1.2) * 0.18) * (1 - settle), tile.z)
      mesh.rotation.set(Math.cos(phase) * 0.2 * (1 - settle), 0, Math.sin(phase) * 0.22 * (1 - settle))
      // Only the fully level deck supports feet. No padded invisible bridge.
      if (settle === 1) supports.push({ minX: tile.x - tile.width / 2, maxX: tile.x + tile.width / 2,
        minZ: tile.z - tile.length / 2, maxZ: tile.z + tile.length / 2, y: 0.12 })
    })
  }
  group.traverse(node => { node.userData.noCameraCollision = true })
  apply()
  return { group, layout, material, supports,
    get settle() { return settle },
    stepClock(dt) { clock += dt },
    snapshot: () => ({ clock }),
    restore(s) { clock = s.clock; apply() },
    update(dt, frozen) { settle = THREE.MathUtils.clamp(settle + (frozen ? dt / 0.2 : -dt / 0.2), 0, 1); apply() },
    reset() { clock = 0; settle = 0; apply() }
  }
}

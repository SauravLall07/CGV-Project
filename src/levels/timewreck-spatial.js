import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// N4/N5: static, L3-owned solids. Geometry and collision share component bounds;
// only the low threshold uses feet-height gating. No shared/L2 collision changes.
export function createWreckSpatial({ root, spans, player, obstacles }) {
  const supports = []
  const ownedObstacles = new Set()
  const materials = {
    wood: new THREE.MeshStandardMaterial({ color: 0x634329, roughness: 0.72 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x315954, roughness: 0.65 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.8, roughness: 0.4 }),
    lining: new THREE.MeshStandardMaterial({ color: 0x542936, roughness: 0.9 })
  }
  const groups = []
  const pose = new THREE.Object3D()
  function carriage(key, build) {
    const group = new THREE.Group(); group.name = `${key}-expansion-spatial`
    root.add(group); groups.push(group)
    const batches = new Map()
    const c = spans[key].center
    function box(mat, w, h, d, x, y, z, rotation = [0, 0, 0], solid = false) {
      const geometry = new THREE.BoxGeometry(w, h, d)
      pose.position.set(x, y, c + z); pose.rotation.set(...rotation); pose.updateMatrix()
      geometry.applyMatrix4(pose.matrix)
      if (!batches.has(mat)) batches.set(mat, [])
      batches.get(mat).push(geometry)
      if (solid) {
        // Solid components are axis-aligned; decorative bends stay inside them
        // or overhead. Never fill the open end of a trolley's diagonal silhouette.
        const block = { minX: x - w / 2, maxX: x + w / 2,
          minZ: c + z - d / 2, maxZ: c + z + d / 2,
          get enabled() { return player.mesh.position.y < y + h / 2 - 0.01 &&
            player.mesh.position.y + (player.isCrouching() ? 1.15 : 1.85) > y - h / 2 } }
        obstacles.push(block)
        ownedObstacles.add(block)
      }
    }
    build(box, c)
    for (const [mat, pieces] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(pieces, false), materials[mat])
      mesh.name = `${key}-spatial-${mat}`
      group.add(mesh); pieces.forEach(g => g.dispose())
    }
  }
  carriage('vault', box => {
    // Broad fractured containment base and snapped floor arm on the right.
    box('teal', 1.35, 0.52, 0.5, 1.5, 0.26, -2.1, undefined, true)
    box('brass', 2.35, 0.18, 0.4, 1.025, 0.62, -2.1, undefined, true)
    box('wood', 0.6, 0.4, 0.42, 1.85, 0.73, -2.1, [0, 0, -0.16])
    for (const s of [-1, 1]) {
      box('brass', 0.12, 0.7, 0.16, s * 1.1, 2.85, 6.4, [0, 0, s * 0.35])
      box('teal', 0.65, 0.12, 0.45, s * 1.8, 2.9, 6.4, [0.15, 0, s * 0.18])
    }
  })
  carriage('convergence', (box, c) => {
    box('wood', 5.2, 0.24, 0.26, 0, 0.12, 14, undefined, true)
    box('brass', 5.2, 0.025, 0.07, 0, 0.2275, 14.09)
    supports.push({ minX: -2.6, maxX: 2.6, minZ: c + 13.87, maxZ: c + 14.13, y: 0.24 },
      { minX: -2.6, maxX: 2.6, minZ: spans.convergence.minZ, maxZ: spans.convergence.maxZ, y: 0 })
    // Stepped diagonal trolley: an open right end, then a left-side weave.
    for (const [x, z, w] of [[-1.25, 12.1, 2.5], [-1.75, 11.5, 1.2], [-2.05, 10.7, 0.6]]) {
      box('teal', w, 1.15, 0.48, x, 0.575, z, undefined, true)
      box('brass', w, 0.07, 0.5, x, 1.185, z)
      box('lining', w * 0.8, 0.09, 0.38, x, 1.26, z, [0, 0, 0.06])
    }
    for (const s of [-1, 1]) box('brass', 1.25, 0.13, 0.18, s * 1.8, 2.95, 11.9, [0, 0, s * 0.2])
    // Existing maintenance roof already owns crouch clearance. This visibly
    // bent fascia has the same underside (1.34), with no second hidden rule.
    box('brass', 1.68, 0.12, 0.24, 1.76, 1.4, 7)
    box('teal', 0.4, 0.14, 0.22, 2.35, 1.53, 7, [0, 0, -0.18])
    box('lining', 0.12, 0.22, 0.04, 2.48, 1.48, 7, [0, 0, 0.1])
  })
  carriage('relay', box => {
    box('teal', 2.75, 1.05, 0.75, -1.125, 0.525, -1.2, undefined, true)
    box('wood', 2.6, 0.07, 0.65, -1.15, 1.085, -1.2)
    for (const x of [-2.2, -1.3, -0.4]) {
      box('brass', 0.55, 0.03, 0.4, x, 1.135, -1.2)
      box('lining', 0.36, 0.025, 0.23, x, 1.165, -1.2)
    }
    box('brass', 0.12, 1.3, 0.14, -2.4, 2.6, -1.2, [0, 0, -0.18])
    box('wood', 0.28, 0.1, 1.5, -2.35, 2.9, -0.7, [0.15, 0, 0])
  })
  carriage('security', box => {
    box('teal', 1, 1.15, 1.2, -1.8, 0.575, 0, undefined, true)
    box('brass', 0.04, 1.16, 1.21, -1.32, 0.58, 0)
    for (const z of [-0.4, 0, 0.4]) box('brass', 0.7, 0.025, 0.03, -1.8, 1.16, z)
    box('wood', 0.8, 0.07, 1, -1.8, 1.22, 0, [0, 0, 0.08])
    for (const s of [-1, 1]) {
      box('brass', 0.12, 0.65, 0.18, s * 2.35, 2.8, 0.6, [0, 0, s * 0.25])
      box('teal', 0.5, 0.12, 0.4, s * 2.1, 3.05, 0.5, [0.12, 0, s * 0.18])
    }
  })
  return { groups, supports, dispose(supportArray = []) {
    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (ownedObstacles.has(obstacles[i])) obstacles.splice(i, 1)
    }
    for (let i = supportArray.length - 1; i >= 0; i--) {
      if (supports.includes(supportArray[i])) supportArray.splice(i, 1)
    }
    ownedObstacles.clear()
    // GPU resources remain attached for the level's deduplicated root disposal.
  } }
}

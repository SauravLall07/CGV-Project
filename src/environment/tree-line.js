import * as THREE from 'three'
import { TRACK_LEVEL } from '../entities/train.js'
import { LANDING_CLEAR } from './landing/layout.js'
import pineAUrl from '../assets/textures/backdrop/pine-card-a.png?url'
import pineBUrl from '../assets/textures/backdrop/pine-card-b.png?url'
import broadleafUrl from '../assets/textures/backdrop/broadleaf-card.png?url'

// Boarding-only scenery: three instanced crossed-card batches and one ground
// mesh. It has no colliders, interaction blockers, real lights or shadows.
const GROUND_Y = TRACK_LEVEL - 0.5 // Match the track's ballast ground, not rail head.
const EYE_Y = 1.7
const TOP_ANGLE = THREE.MathUtils.degToRad(7.9) // Margin under the requested 8 degrees.
const ROWS = [
  { x: 38, count: 48 },
  { x: 46, count: 56 },
  { x: 55, count: 64 },
  { x: 64, count: 76 },
  { x: 73, count: 84 }
]

function seededRandom() {
  let state = 0x71ee
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function crossedQuads() {
  const a = new THREE.PlaneGeometry(1, 1)
  const b = new THREE.PlaneGeometry(1, 1)
  a.translate(0, 0.5, 0)
  b.translate(0, 0.5, 0)
  b.rotateY(Math.PI / 2)
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) {
    const values = [...a.attributes[name].array, ...b.attributes[name].array]
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, a.attributes[name].itemSize))
  }
  geometry.setIndex([...a.index.array, ...b.index.array].map((index, i) => index + (i >= 6 ? 4 : 0)))
  a.dispose()
  b.dispose()
  return geometry
}

function fieldGeometry() {
  // One flat field, x=9..400 and z=-400..400. At y=-1.5 it lies BELOW
  // the retained forecourt (y=0.05), never covering its surface. Keeping the
  // ground underneath avoids a sky hole when the landing is hidden from P4.
  // The entire mesh is hidden on the forecourt/title screen by the zone swap.
  const geometry = new THREE.PlaneGeometry(391, 800)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(204.5, GROUND_Y, 0)
  return geometry
}

export function createTreeLine() {
  const group = new THREE.Group()
  group.name = 'boarding-tree-line'
  group.visible = false // Zones enable it only in the final hall/platform.
  const rand = seededRandom()
  const trees = [[], [], []]
  let total = 0
  let maxElevationDegrees = 0
  function place(x, z) {
    const kind = total % 10 === 9 ? 2 : total % 2 // Exactly 10% broadleaf.
    const aspect = kind === 2 ? 1 : 0.5 // Preserve the source card proportions.
    // Account for quad WIDTH, not just its centre: any rotated vertex is at
    // most half a card width nearer the platform. Solving this inequality
    // guarantees tops below 7.9 degrees from x=0, eye y=1.7, at any platform z:
    // (GROUND_Y + height - EYE_Y) / (x - aspect * height / 2) <= tan(TOP_ANGLE).
    const heightCap = Math.min(13, (EYE_Y - GROUND_Y + x * Math.tan(TOP_ANGLE)) /
      (1 + aspect * 0.5 * Math.tan(TOP_ANGLE)))
    const height = 7 + rand() * (heightCap - 7)
    const width = height * aspect
    const rotation = rand() * Math.PI * 2
    const tint = 0.82 + rand() * 0.18
    trees[kind].push({ x, z, height, width, rotation, tint })
    // Conservative distance to the whole platform z=-28..28, including card
    // extent. Record the deterministic upper bound for the demo/visual audit.
    const dz = Math.max(0, Math.abs(z) - 28)
    const nearDistance = Math.hypot(x, dz) - width / 2
    maxElevationDegrees = Math.max(maxElevationDegrees,
      THREE.MathUtils.radToDeg(Math.atan2(GROUND_Y + height - EYE_Y, nearDistance)))
    total += 1
  }
  for (const row of ROWS) {
    for (let i = 0; i < row.count; i += 1) {
      let x = row.x + (rand() - 0.5) * 4
      const z = -90 + (i + 0.15 + rand() * 0.7) / row.count * 210
      if (z >= LANDING_CLEAR.minZ && z <= LANDING_CLEAR.maxZ) x = Math.max(x, 41)
      place(x, z)
    }
  }
  // Extra trees past both platform ends. Every tree remains far east of
  // x=11: the train's x=7 corridor stays clear by much more than 4 m forever.
  for (let i = 0; i < 12; i += 1) {
    place(35 + rand() * 10, i < 6 ? -45 - rand() * 35 : 45 + rand() * 55)
  }

  const geometry = crossedQuads()
  const textures = []
  const materials = []
  const loader = new THREE.TextureLoader()
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  for (const [kind, url] of [pineAUrl, pineBUrl, broadleafUrl].entries()) {
    const texture = loader.load(url)
    texture.colorSpace = THREE.SRGBColorSpace
    textures.push(texture)
    // Unlit but fogged: mountain floods and warm station lamps cannot turn
    // these intentionally near-black, cool silhouettes bright green.
    const material = new THREE.MeshBasicMaterial({
      map: texture, color: 0x142a2d, alphaTest: 0.5,
      side: THREE.DoubleSide, fog: true
    })
    materials.push(material)
    const mesh = new THREE.InstancedMesh(geometry, material, trees[kind].length)
    mesh.name = ['treeline-pine-a', 'treeline-pine-b', 'treeline-broadleaf'][kind]
    trees[kind].forEach((tree, i) => {
      dummy.position.set(tree.x, GROUND_Y, tree.z)
      dummy.rotation.set(0, tree.rotation, 0)
      dummy.scale.set(tree.width, tree.height, tree.width)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.setRGB(tree.tint, tree.tint, tree.tint))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    group.add(mesh)
  }
  const groundGeometry = fieldGeometry()
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x091316, roughness: 1, metalness: 0, fog: true
  })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.name = 'treeline-dark-field'
  ground.castShadow = false
  ground.receiveShadow = false
  ground.raycast = () => {}
  group.add(ground)
  group.userData.noCameraCollision = true
  group.userData.noInteractionBlocker = true
  group.userData.treeLineStats = { total, counts: trees.map((list) => list.length), maxElevationDegrees }

  let disposed = false
  return {
    group,
    update() {}, // Static scenery; no simulation or per-frame matrix uploads.
    dispose() {
      if (disposed) return
      disposed = true
      for (const child of group.children) if (child.isInstancedMesh) child.dispose()
      geometry.dispose()
      groundGeometry.dispose()
      groundMaterial.dispose()
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
    }
  }
}

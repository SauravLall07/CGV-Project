import * as THREE from 'three'
import { TRACK_LEVEL, TRACK_X, RAIL_OFFSET, TRAIN_LENGTH, TRAIN_Z } from '../entities/train.js'
import { LANDING_CLEAR } from './landing/layout.js'
import pineAUrl from '../assets/textures/backdrop/pine-card-a.png?url'
import pineBUrl from '../assets/textures/backdrop/pine-card-b.png?url'
import broadleafUrl from '../assets/textures/backdrop/broadleaf-card.png?url'

// Boarding-only scenery: three instanced crossed-card batches and one ground
// mesh. It has no colliders, interaction blockers, real lights or shadows.
const GROUND_Y = TRACK_LEVEL - 0.5 // Match the track's ballast ground, not rail head.
const TREE_MOONLIT_TINT = 0x5f7a78
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
  // Cover the platform edge and the entire railway corridor. Sleepers bottom
  // out at TRACK_LEVEL-0.32; this surface is another 0.18 m below them.
  // The hall/platform floors are y=0; the forecourt is y=0.05.
  const geometry = new THREE.PlaneGeometry(460, 800, 46, 80)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(170, GROUND_Y, 0)
  const position = geometry.attributes.position
  const indices = []
  // P3 and its return stairs lie at y=-4, x=-80.5..-51.7, z=-51.6..-21.8.
  // Leave a grid-aligned notch under that enclosed footprint (including margin)
  // rather than letting the higher field slice through its rooms or stairs.
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.getX(i)
    const b = geometry.index.getX(i + 1)
    const c = geometry.index.getX(i + 2)
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3
    if (x < -50 && z > -60 && z < -20) continue
    indices.push(a, b, c)
  }
  geometry.setIndex(indices)
  // Slow, low-amplitude colour waves: ground texture without a downloaded map.
  const colors = []
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const tint = 0.88 + 0.07 * Math.sin(x * 0.027 + z * 0.018) +
      0.05 * Math.cos(x * 0.011 - z * 0.023)
    colors.push(tint, tint, tint)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

function addTrackContinuation(group) {
  // Match createTrackBed's actual length; the four-car train makes it longer
  // than the 72 m platform-based minimum. Keep the original track untouched.
  const stationLength = Math.max(72, TRAIN_LENGTH + 48)
  const start = TRAIN_Z - stationLength / 2
  const end = TRAIN_Z + stationLength / 2
  const railGeometry = new THREE.BoxGeometry(0.12, 0.18, 1)
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 0.78, metalness: 0.45 })
  const rails = new THREE.InstancedMesh(railGeometry, railMaterial, 4)
  rails.name = 'treeline-track-rails'
  const dummy = new THREE.Object3D()
  let index = 0
  for (const [z0, z1] of [[-300, start], [end, 300]]) {
    for (const offset of [-RAIL_OFFSET, RAIL_OFFSET]) {
      dummy.position.set(TRACK_X + offset, TRACK_LEVEL - 0.09, (z0 + z1) / 2)
      dummy.scale.set(1, 1, z1 - z0)
      dummy.updateMatrix()
      rails.setMatrixAt(index++, dummy.matrix)
    }
  }
  const sleeperGeometry = new THREE.BoxGeometry(2.8, 0.14, 0.28)
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x35281c, roughness: 0.95 })
  const existingCount = Math.floor(stationLength / 0.8)
  const sleeperZ = []
  // Continue the same 0.8 m lattice at both ends, with no duplicated sleepers.
  for (let i = -1; start + i * 0.8 + 0.4 >= -300; i -= 1) sleeperZ.push(start + i * 0.8 + 0.4)
  for (let i = existingCount; start + i * 0.8 + 0.4 <= 300; i += 1) sleeperZ.push(start + i * 0.8 + 0.4)
  const sleepers = new THREE.InstancedMesh(sleeperGeometry, sleeperMaterial, sleeperZ.length)
  sleepers.name = 'treeline-track-sleepers'
  dummy.scale.set(1, 1, 1)
  sleeperZ.forEach((z, i) => {
    dummy.position.set(TRACK_X, TRACK_LEVEL - 0.25, z)
    dummy.updateMatrix()
    sleepers.setMatrixAt(i, dummy.matrix)
  })
  for (const mesh of [rails, sleepers]) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    group.add(mesh)
  }
  return { geometries: [railGeometry, sleeperGeometry], materials: [railMaterial, sleeperMaterial] }
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
    // Moonlight plus the existing hemisphere/ambient fill lights the cards;
    // a single cool tint constant makes their silhouette brightness tunable.
    const material = new THREE.MeshLambertMaterial({
      map: texture, color: TREE_MOONLIT_TINT, alphaTest: 0.5,
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
    color: 0x091316, roughness: 1, metalness: 0, fog: true, vertexColors: true
  })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.name = 'treeline-dark-field'
  ground.castShadow = false
  ground.receiveShadow = false
  ground.raycast = () => {}
  group.add(ground)
  const track = addTrackContinuation(group)
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
      track.geometries.forEach((geometry) => geometry.dispose())
      track.materials.forEach((material) => material.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
    }
  }
}

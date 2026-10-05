import * as THREE from 'three'
import { createGrassShaderMaterial } from '../shaders/grass-shader.js'
import { settings } from '../core/settings.js'

// One blade is two quads: 4 triangles. The mesh is allocated at High and
// the Grass Density setting only changes how many of those instances draw.
//   Low    60,000 blades   240,000 triangles
//   Medium 80,000 blades   320,000 triangles
//   High   100,000 blades  400,000 triangles
export const GRASS_BLADE_TRIANGLES = 4
export const GRASS_DENSITY_COUNTS = { low: 60000, medium: 80000, high: 100000 }
const GRASS_CAPACITY = GRASS_DENSITY_COUNTS.high

// Structures the opening view actually looks at. Grass is scattered
// around these and fades out by about 40 m. The gantry box is the deck;
// blades start just outside it.
const ANCHORS = [
  { minX: -189.2, maxX: -168.0, minZ: -27.7, maxZ: -21.3 },
  { minX: -177.2, maxX: -157.8, minZ: -28.2, maxZ: -20.8 },
  { minX: -160.0, maxX: -142.0, minZ: -41.0, maxZ: -20.6 }
]

const SPAWN_PATH = { ax: -168, az: -18, bx: -30, bz: 28 }

function distToBox(x, z, box) {
  const dx = x < box.minX ? box.minX - x : x > box.maxX ? x - box.maxX : 0
  const dz = z < box.minZ ? box.minZ - z : z > box.maxZ ? z - box.maxZ : 0
  return Math.hypot(dx, dz)
}

// Metres to the nearest spawn structure. 0 is on the structure.
export function grassDistance(x, z) {
  let d = Infinity
  for (const box of ANCHORS) d = Math.min(d, distToBox(x, z, box))
  return d
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const denom = abx * abx + abz * abz
  const t = denom > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / denom)) : 0
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

function onDeck(x, z) {
  return x < -168 && Math.abs(z + 24.5) < 3.1
}

function makeRng(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

// Two segments so the card can curl. Width tapers to a point.
function createBladeGeometry() {
  const rows = [
    { y: 0, half: 0.5, curl: 0 },
    { y: 0.5, half: 0.26, curl: 0.06 },
    { y: 1, half: 0.015, curl: 0.18 }
  ]
  const positions = []
  const uvs = []
  for (const row of rows) {
    positions.push(-row.half, row.y, row.curl, row.half, row.y, row.curl)
    uvs.push(0, row.y, 1, row.y)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5])
  geometry.computeVertexNormals()
  return geometry
}

function sampleAround(rand) {
  const box = ANCHORS[Math.floor(rand() * ANCHORS.length)]
  const side = Math.floor(rand() * 4)
  const width = box.maxX - box.minX
  const depth = box.maxZ - box.minZ
  let ex
  let ez
  if (side === 0) {
    ex = box.minX + rand() * width
    ez = box.minZ
  } else if (side === 1) {
    ex = box.minX + rand() * width
    ez = box.maxZ
  } else if (side === 2) {
    ex = box.minX
    ez = box.minZ + rand() * depth
  } else {
    ex = box.maxX
    ez = box.minZ + rand() * depth
  }
  const cx = (box.minX + box.maxX) * 0.5
  const cz = (box.minZ + box.maxZ) * 0.5
  let dx = ex - cx
  let dz = ez - cz
  const len = Math.hypot(dx, dz) || 1
  dx /= len
  dz /= len
  const fan = (rand() - 0.5) * 1.7
  const c = Math.cos(fan)
  const s = Math.sin(fan)
  const ox = dx * c - dz * s
  const oz = dx * s + dz * c
  // pow biases samples toward the buildings. The field thins out by 40 m.
  const radius = 0.4 + Math.pow(rand(), 1.45) * 39.6
  return [ex + ox * radius, ez + oz * radius]
}

/**
 * The Boarding meadow. One InstancedMesh, no shadows. Returns a dispose
 * that only drops the settings subscription; the mesh itself is freed
 * with the outdoor group.
 */
export function createGrassField({
  getTerrainHeight,
  gapOutsideFootprints,
  skyTime = null,
  sunDirection,
  fogColor,
  fogNear,
  fogFar,
  fogMax,
  mist = 0.36
}) {
  const material = createGrassShaderMaterial({
    skyTime,
    sunDirection,
    fogColor,
    fogNear,
    fogFar,
    fogMax,
    mist
  })
  const mesh = new THREE.InstancedMesh(createBladeGeometry(), material, GRASS_CAPACITY)
  mesh.name = 'boarding-grass'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = true
  // Not a collider. InstancedMesh.raycast rebuilds a world matrix and
  // tests every blade, and the third-person camera fires that ray every
  // frame. The empty Object3D raycast is what near-raycast already skips.
  mesh.raycast = THREE.Object3D.prototype.raycast
  mesh.userData.noCameraCollision = true

  const rand = makeRng(0x6a55e1)
  const dummy = new THREE.Object3D()
  let placed = 0
  const maxAttempts = 520000
  for (let i = 0; i < maxAttempts && placed < GRASS_CAPACITY; i += 1) {
    const [x, z] = sampleAround(rand)
    if (grassDistance(x, z) > 40) continue
    if (onDeck(x, z)) continue
    if (gapOutsideFootprints(x, z) < 0.55) continue
    if (distToSegment(x, z, SPAWN_PATH.ax, SPAWN_PATH.az, SPAWN_PATH.bx, SPAWN_PATH.bz) < 1.45) continue
    const y = getTerrainHeight(x, z)
    if (y < -0.55 || y > 3.4) continue
    dummy.position.set(x, y - 0.05, z)
    dummy.rotation.set(0, rand() * Math.PI * 2, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(placed, dummy.matrix)
    placed += 1
  }

  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  mesh.userData.placed = placed
  mesh.userData.bladeTriangles = GRASS_BLADE_TRIANGLES
  if (placed > 0) {
    mesh.computeBoundingSphere()
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.8
  }

  function applyDensity() {
    const key = settings.get('grassDensity')
    const wanted = GRASS_DENSITY_COUNTS[key] ?? GRASS_DENSITY_COUNTS.medium
    mesh.count = Math.min(wanted, placed)
  }
  applyDensity()
  const unsubscribe = settings.subscribe((_values, changed) => {
    if (changed === 'grassDensity' || changed === 'options' || changed === 'all') applyDensity()
  })

  return {
    mesh,
    material,
    placed,
    dispose() {
      unsubscribe()
    }
  }
}

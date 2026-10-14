import * as THREE from 'three'
import pineCardAUrl from '../assets/textures/backdrop/pine-card-a.png'
import pineCardBUrl from '../assets/textures/backdrop/pine-card-b.png'

const TREE_TINT = 0x6d8a86
const FOREST_ROWS = [[16, 24, 8], [28, 36, 11], [42, 50, 14], [58, 70, 17]]
const UPHILL_ROWS = [[80, 110, 50], [130, 180, 50], [210, 300, 50]]
const DOWNSLOPE_ROWS = [[68, 82, 10], [82, 96, 10], [96, 110, 10]]
const TREES_PER_CHUNK = 534
const MOON_DIRECTION = new THREE.Vector3(0.36, 0.36, -0.86).normalize()

function createForest(chunks, onChunkRecycle) {
  const loader = new THREE.TextureLoader()
  const textures = [loader.load(pineCardAUrl), loader.load(pineCardBUrl)]
  const materials = textures.map((map) => {
    map.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshLambertMaterial({
      map, color: TREE_TINT, alphaTest: 0.5, side: THREE.DoubleSide, fog: true
    })
  })
  // Two crossed, bottom-anchored cards. Scaling preserves the source's 1:2 ratio.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5
  ], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1
  ], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  geometry.computeVertexNormals()
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()
  let seed = 0
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const chunk of chunks) {
    const meshes = materials.map((material, i) => {
      const mesh = new THREE.InstancedMesh(geometry, material, TREES_PER_CHUNK / 2)
      mesh.name = `pine-forest-${i}`
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // Allocate instance colours and bounds once, before any recycling.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TREES_PER_CHUNK / 2 * 3), 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      mesh.boundingBox = new THREE.Box3()
      mesh.boundingSphere = new THREE.Sphere()
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = () => {}
      mesh.userData.noCameraCollision = true
      chunk.group.add(mesh)
      return mesh
    })
    let ordinal = 0
    function placeTree(x, localZ, height, belowRoof = false) {
      const worldZ = chunk.index * CHUNK_LENGTH + localZ
      if (Math.abs(x - riverX(worldZ)) < 20) return
      const base = surfaceHeightAt(chunk, x, worldZ) - 0.3
      if (belowRoof) height = Math.min(height, 3.8 - base)
      const width = height * 0.5
      x = Math.sign(x) * Math.max(Math.abs(x), 8 + width * 0.5)
      transform.position.set(x, surfaceHeightAt(chunk, x, worldZ) - 0.3, localZ)
      transform.rotation.set(0, random() * Math.PI * 2, 0)
      transform.scale.set(width, height, width)
      transform.updateMatrix()
      const mesh = meshes[ordinal % 2]
      const instance = Math.floor(ordinal / 2)
      mesh.setMatrixAt(instance, transform.matrix)
      const shade = 0.88 + random() * 0.12
      tint.setRGB(shade, shade, shade)
      mesh.setColorAt(instance, tint)
      ordinal += 1
    }
    function rows(layout, side, minHeight, heightRange, belowRoof = false) {
      for (const row of layout) {
        for (let i = 0; i < row[2]; i += 1) {
          const height = minHeight + random() * heightRange
          const x = side * (row[0] + random() * (row[1] - row[0]))
          const localZ = ((i + 0.1 + random() * 0.8) / row[2]) * CHUNK_LENGTH
          placeTree(x, localZ, height, belowRoof)
        }
      }
    }
    const rebuildForest = () => {
      seed = (Math.imul(chunk.index, 374761393) ^ 0x4d6f6f) >>> 0
      ordinal = 0
      rows(FOREST_ROWS, -1, 20, 12)
      rows(UPHILL_ROWS, -1, 16, 10)
      for (let i = 0; i < 4; i += 1) placeTree(16 + random() * 10, random() * CHUNK_LENGTH, 12 + random() * 6)
      rows(DOWNSLOPE_ROWS, 1, 18, 10, true)
      for (let i = 0; i < 300; i += 1) {
        // Pick the steeper of two random sites to favour slopes without rows.
        let x = 220 + random() * 530
        let localZ = random() * CHUNK_LENGTH
        const candidateX = 220 + random() * 530
        const candidateZ = random() * CHUNK_LENGTH
        const worldZ = chunk.index * CHUNK_LENGTH
        const slope = Math.abs(valleyHeightAt(x + 1, worldZ + localZ) - valleyHeightAt(x - 1, worldZ + localZ))
        const candidateSlope = Math.abs(valleyHeightAt(candidateX + 1, worldZ + candidateZ) - valleyHeightAt(candidateX - 1, worldZ + candidateZ))
        if (candidateSlope > slope) { x = candidateX; localZ = candidateZ }
        placeTree(x, localZ, 14 + random() * 10)
      }
      for (const mesh of meshes) {
        mesh.count = Math.floor(ordinal / 2) + (mesh === meshes[0] ? ordinal % 2 : 0)
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor.needsUpdate = true
        mesh.computeBoundingBox()
        mesh.computeBoundingSphere()
      }
    }
    onChunkRecycle(chunk, rebuildForest)
    rebuildForest()
  }
  return { textures, geometry, materials }
}

const CHUNK_LENGTH = 160
const CHUNK_COUNT = 8
const AHEAD_CHUNKS = 6
const HALF_WIDTH = 450
const RIGHT_WIDTH = 900
const X_SEGMENTS = 160
const Z_SEGMENTS = 20
const NORMAL_STEP = 0.25

// Fixed seed produces stable phases without consuming global Math.random().
const SEED = 0x4d6f6f
function phase(key) {
  const value = Math.sin(SEED + key * 127.1) * 43758.5453
  return (value - Math.floor(value)) * Math.PI * 2
}
const PHASE_A = phase(1)
const PHASE_B = phase(2)
const PHASE_C = phase(3)
function smooth(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// One continuous world-space surface for ALL chunks and future attached props.
// No Boarding footprint/depression is included. The moving train is at x=0.
export function valleyHeightAt(x, worldZ) {
  if (x > 0) {
    const shoulder = -2.5 - 3.5 * smooth(10, 40, x)
    const floor = shoulder - 39 * smooth(40, 120, x)
    const channel = 3 * (1 - smooth(10, 14, Math.abs(x - riverX(worldZ))))
    const wave = 0.5 * Math.sin(worldZ / 170 + x / 105 + PHASE_A) +
      0.3 * Math.cos(worldZ / 93 - x / 67 + PHASE_B) +
      0.2 * Math.sin(worldZ / 310 + x / 51 + PHASE_C)
    return floor - channel + smooth(210, 430, x) * (145 + 40 * wave) - 25 * smooth(750, 900, x)
  }
  const distance = Math.abs(x)
  const bank = smooth(10, 55, distance)
  const hills = smooth(55, 180, distance)
  const outer = smooth(180, HALF_WIDTH, distance)
  const wave = Math.sin(worldZ * 0.009 + PHASE_A) * 0.55 +
    Math.cos(worldZ * 0.017 + x * 0.006 + PHASE_B) * 0.3 +
    Math.sin(worldZ * 0.0037 - x * 0.011 + PHASE_C) * 0.15
  return -2.5 + bank * (4 + wave * 1.5) + hills * (26 + wave * 8) + outer * (22 + wave * 6)
}

function riverX(worldZ) {
  return 165 + 25 * Math.sin(worldZ / 310) + 10 * Math.sin(worldZ / 97)
}

function createRiver(chunks, onChunkRecycle) {
  const segments = 32
  const material = new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.15, metalness: 0, fog: true })
  for (const chunk of chunks) {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array((segments + 1) * 6)
    const normals = new Float32Array(positions.length)
    const indices = new Uint16Array(segments * 6)
    for (let i = 0; i <= segments; i += 1) {
      normals[i * 6 + 1] = normals[i * 6 + 4] = 1
      if (i < segments) {
        const a = i * 2
        indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6)
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'moonlit-valley-river'
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    mesh.userData.noCameraCollision = true
    chunk.group.add(mesh)
    const rebuildRiver = () => {
      for (let i = 0; i <= segments; i += 1) {
        const localZ = i * CHUNK_LENGTH / segments
        const x = riverX(chunk.index * CHUNK_LENGTH + localZ)
        const offset = i * 6
        positions[offset] = x - 13; positions[offset + 3] = x + 13
        positions[offset + 1] = positions[offset + 4] = -45.5
        positions[offset + 2] = positions[offset + 5] = localZ
      }
      geometry.attributes.position.needsUpdate = true
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
    }
    onChunkRecycle(chunk, rebuildRiver)
    rebuildRiver()
  }
}

function createChunk(material) {
  const group = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(HALF_WIDTH * 2, CHUNK_LENGTH, X_SEGMENTS, Z_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, 0, CHUNK_LENGTH / 2)
  // Concentrate the same vertex budget near the track; every chunk has the
  // identical X grid and 8 m Z spacing, so their edge vertices line up exactly.
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / HALF_WIDTH
    position.setX(i, Math.sign(u) * Math.pow(Math.abs(u), 1.6) * (u > 0 ? RIGHT_WIDTH : HALF_WIDTH))
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3))
  const ground = new THREE.Mesh(geometry, material)
  ground.name = 'moonlit-valley-ground'
  ground.castShadow = false
  ground.receiveShadow = false
  ground.raycast = () => {}
  ground.userData.noCameraCollision = true
  group.add(ground)
  return { group, ground, geometry, index: 0, onRecycle: new Set() }
}

function rebuildChunk(chunk, index) {
  chunk.index = index
  chunk.group.name = `moonlit-valley-chunk-${index}`
  chunk.group.userData.worldZ = index * CHUNK_LENGTH
  const position = chunk.geometry.attributes.position
  const normal = chunk.geometry.attributes.normal
  const color = chunk.geometry.attributes.color
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const worldZ = index * CHUNK_LENGTH + position.getZ(i)
    position.setY(i, valleyHeightAt(x, worldZ))
    // Evaluate the SAME height gradient on both sides of each edge. Per-mesh
    // computeVertexNormals() would give the two edge rows different normals.
    const dx = (valleyHeightAt(x + NORMAL_STEP, worldZ) - valleyHeightAt(x - NORMAL_STEP, worldZ)) / (2 * NORMAL_STEP)
    const dz = (valleyHeightAt(x, worldZ + NORMAL_STEP) - valleyHeightAt(x, worldZ - NORMAL_STEP)) / (2 * NORMAL_STEP)
    const length = Math.hypot(dx, 1, dz)
    normal.setXYZ(i, -dx / length, 1 / length, -dz / length)
    const variation = Math.sin(x * 0.013 + worldZ * 0.008 + PHASE_B) * 0.08 +
      Math.cos(x * 0.005 - worldZ * 0.014 + PHASE_C) * 0.04
    const facingMoon = Math.max(0, (-dx * MOON_DIRECTION.x + MOON_DIRECTION.y - dz * MOON_DIRECTION.z) / length)
    const tint = 0.66 + variation + facingMoon * 0.12
    const wet = x > 0 ? smooth(100, 120, x) * (1 - smooth(210, 240, x)) : 0
    color.setXYZ(i, tint * (0.55 + wet * 0.13), tint * (0.82 - wet * 0.04), tint * (1.05 - wet * 0.25))
  }
  position.needsUpdate = true
  normal.needsUpdate = true
  color.needsUpdate = true
  chunk.geometry.computeBoundingBox()
  chunk.geometry.computeBoundingSphere()
  // Future tree/rock batches rebuild their own placement only when their
  // owning chunk changes world index, not independently every frame.
  for (const callback of chunk.onRecycle) callback(chunk)
}

function surfaceHeightAt(chunk, x, worldZ) {
  // The analytic h() defines the valley, but a grid renders planar triangles.
  // Anchor future props to THAT triangle, avoiding tiny gaps on curved hills.
  const positions = chunk.geometry.attributes.position
  const localZ = THREE.MathUtils.clamp(worldZ - chunk.index * CHUNK_LENGTH, 0, CHUNK_LENGTH)
  const row = Math.min(Z_SEGMENTS - 1, Math.floor(localZ / (CHUNK_LENGTH / Z_SEGMENTS)))
  const clampedX = THREE.MathUtils.clamp(x, -HALF_WIDTH, RIGHT_WIDTH)
  let column = 0
  while (column < X_SEGMENTS - 1 && positions.getX(column + 1) < clampedX) column += 1
  const a = row * (X_SEGMENTS + 1) + column
  const b = a + X_SEGMENTS + 1
  const d = a + 1
  const c = b + 1
  const u = (clampedX - positions.getX(a)) / (positions.getX(d) - positions.getX(a))
  const v = (localZ - positions.getZ(a)) / (CHUNK_LENGTH / Z_SEGMENTS)
  return u + v <= 1
    ? positions.getY(a) * (1 - u - v) + positions.getY(d) * u + positions.getY(b) * v
    : positions.getY(c) * (u + v - 1) + positions.getY(d) * (1 - v) + positions.getY(b) * (1 - u)
}

function legacyPolesAndWires() {
  // Preserve moving-mode infrastructure exactly for this first step: x=11.5,
  // spacing 28 m, legacy 24 drawn poles/arms and TWO complete wire runs.
  // At x=11.5 the old corridor height function is always -2.5, so py=0.75.
  const group = new THREE.Group()
  group.name = 'trackside-infrastructure'
  const wood = new THREE.MeshStandardMaterial({ color: 0x3d2717, roughness: 0.9 })
  const wire = new THREE.LineBasicMaterial({ color: 0x111115 })
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8), wood, 24)
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.1, 0.12), wood, 24)
  const dummy = new THREE.Object3D()
  const runs = [[], []]
  let index = 0
  for (let z = -360; z <= 360; z += 28) {
    // Legacy's array capacity is 24 although this loop produces 26 wire
    // anchors. Keep that visible result without out-of-bounds matrix writes.
    if (index < 24) {
      dummy.position.set(11.5, 0.75, z)
      dummy.updateMatrix()
      poles.setMatrixAt(index, dummy.matrix)
      dummy.position.set(11.5, 3.55, z)
      dummy.updateMatrix()
      arms.setMatrixAt(index, dummy.matrix)
    }
    runs[0].push(new THREE.Vector3(10.75, 3.6, z))
    runs[1].push(new THREE.Vector3(12.25, 3.6, z))
    index += 1
  }
  poles.instanceMatrix.needsUpdate = true
  arms.instanceMatrix.needsUpdate = true
  group.add(poles, arms)
  for (const run of runs) {
    const points = []
    for (let i = 0; i < run.length - 1; i += 1) {
      const mid = new THREE.Vector3().lerpVectors(run[i], run[i + 1], 0.5)
      mid.y -= 0.85
      points.push(run[i], mid, run[i + 1])
    }
    const curve = new THREE.CatmullRomCurve3(points)
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(points.length * 4)), wire))
  }
  return group
}

export function createMoonlitValley(options = {}) {
  const group = new THREE.Group()
  group.name = 'outdoor-environment'
  const material = new THREE.MeshStandardMaterial({
    color: 0x243b33, vertexColors: true, roughness: 1, metalness: 0, fog: true
  })
  const chunks = Array.from({ length: CHUNK_COUNT }, () => createChunk(material))
  const getViewerZ = options.getViewerZ || (() => 0)
  let travel = 0
  let baseIndex = Math.floor(getViewerZ() / CHUNK_LENGTH) - AHEAD_CHUNKS
  chunks.forEach((chunk, i) => {
    rebuildChunk(chunk, baseIndex + i)
    chunk.group.position.z = chunk.index * CHUNK_LENGTH
    group.add(chunk.group)
  })
  function onChunkRecycle(chunk, callback) {
    chunk.onRecycle.add(callback)
    return () => chunk.onRecycle.delete(callback)
  }
  const forest = createForest(chunks, onChunkRecycle)
  createRiver(chunks, onChunkRecycle)
  const trackside = legacyPolesAndWires()
  group.add(trackside)
  const speed = options.speed || 35
  let disposed = false

  return {
    group,
    chunks,
    heightAt: valleyHeightAt,
    surfaceHeightAt,
    // Future props live in a chunk's local coordinates. Register a recycle
    // callback to reseed/re-anchor them when this group gets a new world index.
    addToChunk(chunk, object, { x, worldZ, heightOffset = 0 }) {
      object.position.set(x, surfaceHeightAt(chunk, x, worldZ) + heightOffset, worldZ - chunk.index * CHUNK_LENGTH)
      chunk.group.add(object)
      return object
    },
    onChunkRecycle,
    update(delta) {
      if (disposed) return
      travel += delta * speed // Same positive-Z direction and unscaled delta as before.
      const desiredBase = Math.floor((getViewerZ() - travel) / CHUNK_LENGTH) - AHEAD_CHUNKS
      // Integer world indices work in either direction. Rebuild AT MOST ONE
      // existing buffer per frame; eight groups always remain adjacent. Large
      // teleports catch up across frames instead of rebuilding all eight at once.
      if (desiredBase < baseIndex) {
        rebuildChunk(chunks.find((chunk) => chunk.index === baseIndex + CHUNK_COUNT - 1), baseIndex - 1)
        baseIndex -= 1
      } else if (desiredBase > baseIndex) {
        rebuildChunk(chunks.find((chunk) => chunk.index === baseIndex), baseIndex + CHUNK_COUNT)
        baseIndex += 1
      }
      for (const chunk of chunks) chunk.group.position.z = chunk.index * CHUNK_LENGTH + travel
      // Poles intentionally retain their old wrap for now, driven by the SAME
      // accumulated travel. Forests move with their owning terrain chunks.
      trackside.position.z = (travel % 28) - 14
    },
    dispose() {
      if (disposed) return
      disposed = true
      // Dispose these owned shared resources once, outside the generic traversal.
      forest.geometry.dispose()
      forest.materials.forEach((material) => material.dispose())
      forest.textures.forEach((texture) => texture.dispose())
      const geometries = new Set()
      const materials = new Set()
      group.traverse((node) => {
        if (node.geometry === forest.geometry) {
          if (node.isInstancedMesh) node.dispose()
          return
        }
        if (node.geometry) geometries.add(node.geometry)
        if (node.material) materials.add(node.material)
        if (node.isInstancedMesh) node.dispose()
      })
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      chunks.forEach((chunk) => chunk.onRecycle.clear())
    }
  }
}

import * as THREE from 'three'

const CHUNK_LENGTH = 160
const CHUNK_COUNT = 6
const HALF_WIDTH = 450
const X_SEGMENTS = 64
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
  const distance = Math.abs(x)
  const bank = smooth(10, 55, distance)
  const hills = smooth(55, 180, distance)
  const outer = smooth(180, HALF_WIDTH, distance)
  const wave = Math.sin(worldZ * 0.009 + PHASE_A) * 0.55 +
    Math.cos(worldZ * 0.017 + x * 0.006 + PHASE_B) * 0.3 +
    Math.sin(worldZ * 0.0037 - x * 0.011 + PHASE_C) * 0.15
  return -2.5 + bank * (4 + wave * 1.5) + hills * (26 + wave * 8) + outer * (22 + wave * 6)
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
    position.setX(i, Math.sign(u) * Math.pow(Math.abs(u), 1.6) * HALF_WIDTH)
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
    const tint = 0.86 + variation
    color.setXYZ(i, tint * 0.9, tint, tint * 0.94)
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
  const clampedX = THREE.MathUtils.clamp(x, -HALF_WIDTH, HALF_WIDTH)
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
  let baseIndex = Math.floor(getViewerZ() / CHUNK_LENGTH) - 2
  chunks.forEach((chunk, i) => {
    rebuildChunk(chunk, baseIndex + i)
    chunk.group.position.z = chunk.index * CHUNK_LENGTH
    group.add(chunk.group)
  })
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
    onChunkRecycle(chunk, callback) {
      chunk.onRecycle.add(callback)
      return () => chunk.onRecycle.delete(callback)
    },
    update(delta) {
      if (disposed) return
      travel += delta * speed // Same positive-Z direction and unscaled delta as before.
      const desiredBase = Math.floor((getViewerZ() - travel) / CHUNK_LENGTH) - 2
      // Integer world indices work in either direction. Rebuild AT MOST ONE
      // existing buffer per frame; six groups always remain adjacent. Large
      // teleports catch up across frames instead of rebuilding all six at once.
      if (desiredBase < baseIndex) {
        rebuildChunk(chunks.find((chunk) => chunk.index === baseIndex + CHUNK_COUNT - 1), baseIndex - 1)
        baseIndex -= 1
      } else if (desiredBase > baseIndex) {
        rebuildChunk(chunks.find((chunk) => chunk.index === baseIndex), baseIndex + CHUNK_COUNT)
        baseIndex += 1
      }
      for (const chunk of chunks) chunk.group.position.z = chunk.index * CHUNK_LENGTH + travel
      // Poles intentionally retain their old wrap for now, driven by the SAME
      // accumulated travel. No new forest, rocks or fences are built here.
      trackside.position.z = (travel % 28) - 14
    },
    dispose() {
      if (disposed) return
      disposed = true
      const geometries = new Set()
      const materials = new Set()
      group.traverse((node) => {
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

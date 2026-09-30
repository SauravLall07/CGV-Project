import * as THREE from 'three'

// Raycasting a whole level tests the bounding sphere of every mesh in it, and
// the Level 2 train has thousands. The rays cast every frame — camera
// collision, guard sight, interaction line of sight — are all short, so this
// keeps a flat list of just the raycastable objects that could be within
// reach of where those rays start.
//
// The list is padded by `slack` metres and reused until the ray origin has
// moved half that far, or `maxAge` seconds pass (things move on their own),
// or invalidate() is called (a level load). Anything a ray of length `reach`
// from the origin could hit is always in the list, so casting against it
// gives the same hits as casting against the whole scene graph.
//
// Listed meshes also get a geometry bounding box, which three.js checks
// before a mesh's triangles only once one has been computed. That is not
// enough for the outdoor terrain and sky, whose bounds enclose the whole
// train: a ray anywhere near them still tests every one of their thousands of
// triangles. Large static meshes are therefore listed through a stand-in that
// buckets their triangles in a grid over X/Z once, and tests only the buckets
// the ray's short segment crosses — with the same triangle test, side
// handling and distance limits as three.js, so the hits are identical.

const _sphere = new THREE.Sphere()
const IGNORED_RAYCAST = THREE.Object3D.prototype.raycast
const MESH_RAYCAST = THREE.Mesh.prototype.raycast

// Triangle count from which a mesh is worth bucketing, and buckets per side.
const GRID_MIN_TRIANGLES = 256
const GRID_SIZE = 32

const grids = new WeakMap() // geometry -> triangle buckets
const standIns = new WeakMap() // mesh -> stand-in, or null when not bucketed

const _inverse = new THREE.Matrix4()
const _localRay = new THREE.Ray()
const _end = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _hit = new THREE.Vector3()
const _world = new THREE.Vector3()

function triangleVertex(geometry, triangle, corner) {
  const i = triangle * 3 + corner
  return geometry.index ? geometry.index.getX(i) : i
}

function buildGrid(geometry) {
  const position = geometry.attributes.position
  const count = (geometry.index ? geometry.index.count : position.count) / 3
  if (geometry.boundingBox === null) geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox
  const cellX = Math.max((max.x - min.x) / GRID_SIZE, 1e-6)
  const cellZ = Math.max((max.z - min.z) / GRID_SIZE, 1e-6)
  const cell = (value, low, size) => Math.min(GRID_SIZE - 1, Math.max(0, Math.floor((value - low) / size)))
  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => [])
  for (let t = 0; t < count; t++) {
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity
    for (let k = 0; k < 3; k++) {
      const v = triangleVertex(geometry, t, k)
      const x = position.getX(v)
      const z = position.getZ(v)
      x0 = Math.min(x0, x); x1 = Math.max(x1, x)
      z0 = Math.min(z0, z); z1 = Math.max(z1, z)
    }
    for (let i = cell(x0, min.x, cellX); i <= cell(x1, min.x, cellX); i++) {
      for (let j = cell(z0, min.z, cellZ); j <= cell(z1, min.z, cellZ); j++) cells[j * GRID_SIZE + i].push(t)
    }
  }
  return { min, max, cellX, cellZ, cell, cells, stamp: new Uint32Array(count), mark: 0 }
}

// Only plain meshes are bucketed: one material, no groups or draw range, no
// skinning or morphing — the case three's own Mesh.raycast handles triangle
// by triangle from the geometry as stored.
function standInFor(mesh) {
  if (standIns.has(mesh)) return standIns.get(mesh)
  const geometry = mesh.geometry
  const eligible =
    mesh.isMesh && !mesh.isSkinnedMesh && !mesh.isInstancedMesh && !mesh.isBatchedMesh &&
    mesh.raycast === MESH_RAYCAST && mesh.material && !Array.isArray(mesh.material) &&
    !geometry.morphAttributes.position && geometry.groups.length === 0 &&
    geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity &&
    (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3 >= GRID_MIN_TRIANGLES
  let standIn = null
  if (eligible) {
    standIn = {
      layers: mesh.layers,
      children: [],
      updateWorldMatrix: (...args) => mesh.updateWorldMatrix(...args),
      raycast: (raycaster, intersects) => raycastBucketed(mesh, raycaster, intersects)
    }
  }
  standIns.set(mesh, standIn)
  return standIn
}

function raycastBucketed(mesh, raycaster, intersects) {
  const { ray, near, far } = raycaster
  if (!Number.isFinite(far)) return mesh.raycast(raycaster, intersects)
  const geometry = mesh.geometry
  let grid = grids.get(geometry)
  if (!grid) grids.set(geometry, grid = buildGrid(geometry))

  // The ray's reachable segment, in the mesh's own space.
  _inverse.copy(mesh.matrixWorld).invert()
  _localRay.copy(ray).applyMatrix4(_inverse)
  _end.copy(ray.direction).multiplyScalar(far).add(ray.origin).applyMatrix4(_inverse)
  const { min, max, cellX, cellZ, cell, cells, stamp } = grid
  const sx0 = Math.min(_localRay.origin.x, _end.x); const sx1 = Math.max(_localRay.origin.x, _end.x)
  const sz0 = Math.min(_localRay.origin.z, _end.z); const sz1 = Math.max(_localRay.origin.z, _end.z)
  if (sx1 < min.x || sx0 > max.x || sz1 < min.z || sz0 > max.z) return

  if (++grid.mark === 0xffffffff) { stamp.fill(0); grid.mark = 1 }
  const mark = grid.mark
  const side = mesh.material.side
  const position = geometry.attributes.position
  for (let i = cell(sx0, min.x, cellX); i <= cell(sx1, min.x, cellX); i++) {
    for (let j = cell(sz0, min.z, cellZ); j <= cell(sz1, min.z, cellZ); j++) {
      for (const t of cells[j * GRID_SIZE + i]) {
        if (stamp[t] === mark) continue
        stamp[t] = mark
        const a = triangleVertex(geometry, t, 0)
        const b = triangleVertex(geometry, t, 1)
        const c = triangleVertex(geometry, t, 2)
        _a.fromBufferAttribute(position, a)
        _b.fromBufferAttribute(position, b)
        _c.fromBufferAttribute(position, c)
        const hit = side === THREE.BackSide
          ? _localRay.intersectTriangle(_c, _b, _a, true, _hit)
          : _localRay.intersectTriangle(_a, _b, _c, side === THREE.FrontSide, _hit)
        if (hit === null) continue
        _world.copy(_hit).applyMatrix4(mesh.matrixWorld)
        const distance = ray.origin.distanceTo(_world)
        if (distance < near || distance > far) continue
        const normal = new THREE.Vector3()
        THREE.Triangle.getNormal(_a, _b, _c, normal)
        intersects.push({
          distance,
          point: _world.clone(),
          object: mesh,
          face: { a, b, c, normal, materialIndex: 0 },
          faceIndex: t
        })
      }
    }
  }
}

// World bounding sphere of a raycastable object, or null when it has none we
// can trust (skinned meshes deform past their geometry bounds).
function worldSphere(object) {
  let local = null
  if (object.isSkinnedMesh) return null
  if (object.isInstancedMesh || object.isBatchedMesh) {
    if (object.boundingSphere === null) object.computeBoundingSphere()
    local = object.boundingSphere
  } else if (object.geometry) {
    if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere()
    local = object.geometry.boundingSphere
  }
  if (!local) return null
  return _sphere.copy(local).applyMatrix4(object.matrixWorld)
}

export function createNearRaycastSet({ slack = 4, maxAge = 0.5 } = {}) {
  const list = []
  const seen = new Set()
  const origin = new THREE.Vector3()
  let sources = []
  let skipped = null
  let builtReach = 0
  let builtAt = -Infinity
  let valid = false
  // Bumped on every rebuild, so callers can tell the list has changed.
  let version = 0

  function sameSources(next) {
    if (next.length !== sources.length) return false
    for (let i = 0; i < next.length; i++) if (next[i] !== sources[i]) return false
    return true
  }

  // A freshly built level has not been rendered yet, so its world matrices
  // are still identity. Bring them up once, from the top of each tree.
  function refreshMatrices(next) {
    const tops = new Set()
    for (const source of next) {
      let node = source
      while (node.parent) node = node.parent
      tops.add(node)
    }
    for (const top of tops) top.updateMatrixWorld()
  }

  function rebuild(next, at, reach, skip) {
    // Later rebuilds reuse last frame's matrices; `slack` covers that frame.
    if (!valid || !sameSources(next)) refreshMatrices(next)
    list.length = 0
    seen.clear()
    // Reach only grows, so callers casting rays of different lengths don't
    // make the list rebuild back and forth.
    builtReach = Math.max(builtReach, reach)
    const limit = builtReach + slack
    const consider = (object) => {
      if (object.raycast === IGNORED_RAYCAST) return
      const sphere = worldSphere(object)
      if (sphere && sphere.center.distanceTo(at) - sphere.radius > limit) return
      if (object.isMesh && !object.isSkinnedMesh && object.geometry.boundingBox === null) {
        object.geometry.computeBoundingBox()
      }
      list.push(standInFor(object) ?? object)
    }
    const visit = (object) => {
      if (object === skip || seen.has(object)) return
      seen.add(object)
      consider(object)
      for (const child of object.children) visit(child)
    }
    for (const source of next) visit(source)
    sources = next.slice()
    skipped = skip
    origin.copy(at)
    builtAt = performance.now()
    valid = true
    version++
  }

  // `roots` is an Object3D or an array of them, searched recursively.
  // `skip` leaves out one subtree whose hits the caller ignores anyway.
  function get(roots, at, reach, skip = null) {
    const next = Array.isArray(roots) ? roots : [roots]
    if (
      !valid ||
      reach > builtReach ||
      !sameSources(next) ||
      skip !== skipped ||
      at.distanceToSquared(origin) > (slack / 2) ** 2 ||
      performance.now() - builtAt > maxAge * 1000
    ) {
      rebuild(next, at, reach, skip)
    }
    return list
  }

  function invalidate() {
    valid = false
  }

  return { get, invalidate, get version() { return version } }
}

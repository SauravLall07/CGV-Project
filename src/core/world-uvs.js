import * as THREE from 'three'

// Box-projected UVs at a fixed real-world density.
//
// The passage builders share one material per surface type, and a material's
// texture repeat is tuned for the main corridor it was written for. Every
// other mesh using it — a 6 m room, a corridor running the other way, one
// 0.6 m wall segment per stair step — gets that whole repeat squeezed onto its
// own size, so marble tiles stretch into streaks and plaster noise shrinks
// to a smear.
//
// This rewrites a mesh's UVs from its own vertex positions instead: each face
// is projected along its dominant normal axis and scaled so one texture
// repeat spans `material.userData.metresPerRepeat` metres (set by the
// factories in environment/textures.js). The material's repeat is divided
// back out, so shared materials stay untouched and meshes that are not
// converted keep their old mapping. Adjacent converted meshes share one
// coordinate space, so floor tiles and wall grain line up across joins.
//
// The geometry is rewritten in place, so it must not be shared with a mesh
// that should keep different UVs.

const DEFAULT_METRES_PER_REPEAT = 2

function metresPerRepeat(material) {
  const value = material.userData?.metresPerRepeat ?? DEFAULT_METRES_PER_REPEAT
  return Array.isArray(value) ? value : [value, value]
}

// `matrix` places the geometry in the projection space; omit it to project in
// the geometry's own space (an InstancedMesh, whose instances share UVs).
export function projectUvs(geometry, material, matrix = null) {
  const map = material?.map
  const uv = geometry.attributes.uv
  if (!map || !uv) return

  const [metresU, metresV] = metresPerRepeat(material)
  const scaleU = 1 / (metresU * map.repeat.x)
  const scaleV = 1 / (metresV * map.repeat.y)

  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const normalMatrix = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()

  for (let i = 0; i < uv.count; i++) {
    p.fromBufferAttribute(position, i)
    n.fromBufferAttribute(normal, i)
    if (matrix) {
      p.applyMatrix4(matrix)
      n.applyMatrix3(normalMatrix)
    }
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)

    let u
    let v
    if (ay >= ax && ay >= az) {
      u = p.x
      v = p.z
    } else if (ax >= az) {
      u = p.z
      v = p.y
    } else {
      u = p.x
      v = p.y
    }
    uv.setXY(i, u * scaleU, v * scaleV)
  }
  uv.needsUpdate = true
}

// Projects in world space as the mesh is currently placed, so call it once
// the mesh has its final position and parent.
export function applyWorldUvs(mesh) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  mesh.updateWorldMatrix(true, false)
  projectUvs(mesh.geometry, material, mesh.matrixWorld)
  return mesh
}

// Flat-sided shapes only: box projection would seam a cylinder or sphere,
// which keep their own wrap-around mapping.
const PROJECTABLE = new Set(['BoxGeometry', 'PlaneGeometry', 'ExtrudeGeometry'])

function projectable(node) {
  if (!node.isMesh || node.isInstancedMesh || !PROJECTABLE.has(node.geometry?.type)) return null
  const material = Array.isArray(node.material) ? node.material[0] : node.material
  // Only the tiling factory materials carry a real-world scale; signs,
  // screens and plain colours are left alone.
  return material?.map && material.userData?.metresPerRepeat !== undefined ? material : null
}

// Converts every eligible mesh under `root`, typically a whole level section
// once it is built. A geometry shared by several meshes is projected in its
// own space instead, which keeps the density right for every user of it.
export function applyWorldUvsToTree(root) {
  const users = new Map()
  root.traverse((node) => {
    if (projectable(node)) users.set(node.geometry, (users.get(node.geometry) ?? 0) + 1)
  })
  root.traverse((node) => {
    const material = projectable(node)
    if (!material) return
    if (users.get(node.geometry) > 1) projectUvs(node.geometry, material)
    else applyWorldUvs(node)
  })
}

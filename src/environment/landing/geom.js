import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const _q = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)
const _s = new THREE.Vector3(1, 1, 1)
const _p = new THREE.Vector3()

// BoxGeometry is 4 vertices per face, in order +x, -x, +y, -y, +z, -z.
// Scaling those UVs keeps brick and ashlar a constant size on every block.
const FACE_SPAN = [
  ['d', 'h'],
  ['d', 'h'],
  ['w', 'd'],
  ['w', 'd'],
  ['w', 'h'],
  ['w', 'h']
]

function scaleBoxUv(geometry, w, h, d, tile) {
  const uv = geometry.attributes.uv
  const span = { w, h, d }
  for (let face = 0; face < 6; face += 1) {
    const su = span[FACE_SPAN[face][0]] / tile
    const sv = span[FACE_SPAN[face][1]] / tile
    for (let i = 0; i < 4; i += 1) {
      const index = face * 4 + i
      uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv)
    }
  }
  uv.needsUpdate = true
}

export function box(w, h, d, x, y, z, tile = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d)
  if (tile > 0) scaleBoxUv(geometry, w, h, d, tile)
  geometry.translate(x, y, z)
  return geometry
}

export function place(x, y, z, yaw = 0, scale = 1) {
  _p.set(x, y, z)
  _q.setFromAxisAngle(_up, yaw)
  _s.setScalar(scale)
  return new THREE.Matrix4().compose(_p, _q, _s)
}

export function mergeParts(parts) {
  if (!parts.length) return null
  const geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  return geometry
}

export function addMesh(parent, geometry, material, { castShadow = false, receiveShadow = false, name } = {}, stats) {
  if (!geometry) return null
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = castShadow
  mesh.receiveShadow = receiveShadow
  if (name) mesh.name = name
  parent.add(mesh)
  if (stats) countMesh(mesh, stats)
  return mesh
}

export function addInstances(parent, geometry, material, matrices, { castShadow = false, receiveShadow = false, name } = {}, stats) {
  if (!geometry || !matrices.length) {
    geometry?.dispose()
    return null
  }
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
  for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i])
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = castShadow
  mesh.receiveShadow = receiveShadow
  if (name) mesh.name = name
  parent.add(mesh)
  if (stats) countMesh(mesh, stats)
  return mesh
}

export function countMesh(mesh, stats) {
  stats.draws += 1
  const geometry = mesh.geometry
  if (!geometry?.attributes?.position) return
  const base = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
  const copies = mesh.isInstancedMesh ? mesh.count : 1
  if (!mesh.isPoints) stats.triangles += base * copies
}

export function emptyStats() {
  return { draws: 0, triangles: 0 }
}

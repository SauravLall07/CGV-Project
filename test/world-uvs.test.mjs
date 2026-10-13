import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { applyWorldUvs, applyWorldUvsToTree } from '../src/core/world-uvs.js'

function tilingMaterial(repeat, metresPerRepeat) {
  const map = new THREE.Texture()
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(repeat[0], repeat[1])
  return new THREE.MeshStandardMaterial({ map, userData: { metresPerRepeat } })
}

function floor(width, depth, material, x = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0, z)
  return mesh
}

// Texture repeats per metre along world X and Z for a floor plane.
function floorDensity(mesh) {
  const uv = mesh.geometry.attributes.uv
  const repeat = mesh.material.map.repeat
  const params = mesh.geometry.parameters
  // PlaneGeometry vertex 0 is the (-x, +y) corner, 1 is (+x, +y), 2 is (-x, -y).
  const alongX = Math.abs(uv.getX(1) - uv.getX(0)) * repeat.x / params.width
  const alongZ = Math.abs(uv.getY(2) - uv.getY(0)) * repeat.y / params.height
  return [alongX, alongZ]
}

test('world UVs give every mesh the material\'s real-world density, whatever its size', () => {
  // A corridor-tuned repeat that used to squeeze 16 repeats onto any floor.
  const material = tilingMaterial([16, 3], 2)
  for (const [width, depth] of [[27, 6], [6, 6], [6, 3.4]]) {
    const mesh = applyWorldUvs(floor(width, depth, material))
    const [x, z] = floorDensity(mesh)
    assert.ok(Math.abs(x - 0.5) < 1e-6 && Math.abs(z - 0.5) < 1e-6, `${width}x${depth}: ${x}, ${z}`)
  }
})

test('adjacent world-UV floors continue the same pattern across the join', () => {
  const material = tilingMaterial([1, 1], 2)
  const left = applyWorldUvs(floor(4, 4, material, -2, 0))
  const right = applyWorldUvs(floor(4, 4, material, 2, 0))
  // left's +x edge (vertex 1) and right's -x edge (vertex 0) sit at x = 0, z = -2.
  const a = new THREE.Vector2().fromBufferAttribute(left.geometry.attributes.uv, 1)
  const b = new THREE.Vector2().fromBufferAttribute(right.geometry.attributes.uv, 0)
  assert.ok(a.distanceTo(b) < 1e-6)
})

test('the tree sweep converts tiling boxes only, and shares geometry safely', () => {
  const root = new THREE.Group()
  const tiling = tilingMaterial([12, 3], 2.2)

  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 0.25), tiling)
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.05), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }))
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), tiling)
  const shared = new THREE.BoxGeometry(1, 1, 1)
  const crateA = new THREE.Mesh(shared, tiling)
  const crateB = new THREE.Mesh(shared, tiling)
  crateB.position.set(7, 0, 3)
  root.add(wall, sign, pipe, crateA, crateB)

  const untouched = (mesh) => mesh.geometry.attributes.uv.array.slice()
  const signBefore = untouched(sign)
  const pipeBefore = untouched(pipe)
  applyWorldUvsToTree(root)

  assert.deepEqual(sign.geometry.attributes.uv.array, signBefore, 'materials without a real-world scale keep their UVs')
  assert.deepEqual(pipe.geometry.attributes.uv.array, pipeBefore, 'curved shapes keep their wrap-around mapping')

  // The wall's 6 m face now spans 6 / 2.2 repeats instead of all 12.
  const uv = wall.geometry.attributes.uv
  const faceStart = 16 // +z face of a BoxGeometry starts at vertex 16
  const repeats = Math.abs(uv.getX(faceStart + 1) - uv.getX(faceStart)) * 12
  assert.ok(Math.abs(repeats - 6 / 2.2) < 1e-6, `wall face repeats: ${repeats}`)

  // Shared geometry is projected in its own space: one unit cube = 1 / 2.2 repeats.
  const crateUv = shared.attributes.uv
  const crateRepeats = Math.abs(crateUv.getX(faceStart + 1) - crateUv.getX(faceStart)) * 12
  assert.ok(Math.abs(crateRepeats - 1 / 2.2) < 1e-6, `crate face repeats: ${crateRepeats}`)
})

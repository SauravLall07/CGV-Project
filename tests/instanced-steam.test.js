import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createInstancedSteam } from '../src/environment/instanced-steam.js'

test('shared steam renderer keeps Level 3 instanced soft-alpha setup', () => {
  const { mesh } = createInstancedSteam(72)
  const { geometry, material } = mesh
  const map = material.uniforms.uMap.value

  assert.equal(mesh.isInstancedMesh, true)
  assert.equal(mesh.count, 72)
  assert.equal(mesh.frustumCulled, false)
  assert.equal(material.transparent, true)
  assert.equal(material.depthTest, true)
  assert.equal(material.depthWrite, false)
  assert.equal(material.blending, THREE.NormalBlending)
  assert.equal(map.isDataTexture, true)
  assert.equal(map.image.data.length, 64 * 64 * 4)
  assert.equal(geometry.attributes.aLife.count, 72)
  assert.equal(geometry.attributes.aLayer.count, 72)

  geometry.dispose()
  material.dispose()
  map.dispose()
  mesh.dispose()
})

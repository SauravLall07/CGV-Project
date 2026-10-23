import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTitleScene, TITLE_VALLEY_SPEED, TITLE_SWAY_METRES, TITLE_SWAY_RADIANS } from '../src/ui/title-scene.js'
import { createMoonlitValley } from '../src/environment/moonlit-valley.js'

test('title builds only scrolling valley, clear-night sky and one non-shadow light within forecourt budget; disposes owned GPU resources', () => {
  const previousDocument = globalThis.document, previousLoad = THREE.TextureLoader.prototype.load
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}
  }) }) }
  THREE.TextureLoader.prototype.load = () => new THREE.Texture()
  let title, valley, options
  try {
    title = createTitleScene({ valleyFactory(value) { options = value; return valley = createMoonlitValley(value) } })
    assert.equal(options.speed, -38); assert.equal(TITLE_VALLEY_SPEED, -38)
    assert.equal(options.chunkCount, 3); assert.equal(options.omitHillSide, true)
    assert.equal(options.rails, false); assert.equal(options.poles, false)
    assert.notEqual(options.static, true)
    assert.equal(title.scene.children.length, 3)
    assert.equal(title.scene.children.filter(node => node.isLight).length, 1)
    assert.equal(title.scene.fog.near, 70); assert.equal(title.scene.fog.far, 900)
    const sky = title.scene.getObjectByName('sky-dome')
    assert.equal(sky.material.uniforms.uGlitch.value, 0)
    assert.equal(sky.material.uniforms.uNightLift.value, 0.95)
    assert.equal(sky.material.uniforms.uMoonSize.value, 2)
    assert.ok(title.stats.drawCalls < 93); assert.ok(title.stats.triangles < 94542)
    const resources = new Set(), counts = new Map()
    title.scene.traverse(node => {
      assert.equal(Boolean(node.castShadow), false)
      assert.doesNotMatch(node.name, /player|guard|train-interior/)
      if (node.geometry) resources.add(node.geometry)
      if (node.isInstancedMesh) resources.add(node)
      if (node.material) {
        resources.add(node.material)
        for (const value of Object.values(node.material)) if (value?.isTexture) resources.add(value)
      }
    })
    for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1))
    const z = valley.chunks[0].group.position.z
    title.update(1, 1366, 768)
    assert.equal(valley.chunks[0].group.position.z, z - 38)
    assert.equal(title.camera.aspect, 1366 / 768)
    // Existing buffers, scene objects and materials survive a recycle too.
    const identities = []
    title.scene.traverse(node => identities.push(node))
    for (let i = 0; i < 600; i++) title.update(1 / 60, 1366, 768)
    const after = []; title.scene.traverse(node => after.push(node))
    assert.deepEqual(after, identities)
    title.dispose(); title.dispose()
    assert.equal(title.scene.children.length, 0)
    for (const resource of resources) assert.equal(counts.get(resource), 1, resource.type)
    const position = title.camera.position.clone()
    title.update(100, 1920, 1080); assert.deepEqual(title.camera.position, position)
    // Full allocation budget, before frustum culling.
    console.log(`[title budget] calls=${title.stats.drawCalls} triangles=${title.stats.triangles}`)
  } finally {
    title?.dispose(); globalThis.document = previousDocument; THREE.TextureLoader.prototype.load = previousLoad
  }
})

test('title update reuses its camera and scene, allocates no resources and stays inside sway limits', () => {
  let updates = 0, disposed = 0
  const group = new THREE.Group(), skyMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
  const title = createTitleScene({
    valleyFactory: () => ({ group, stats: { drawCalls: 17, triangles: 45000 }, update() { updates++ }, dispose() { disposed++ } }),
    skyFactory: name => {
      assert.equal(name, 'moving-heist')
      return { mesh: skyMesh, horizonColor: new THREE.Color(0x1f3d63), update() {}, dispose() { disposed++; skyMesh.geometry.dispose(); skyMesh.material.dispose() } }
    }
  })
  const base = title.camera.rotation.clone(), camera = title.camera
  const originalArray = globalThis.Float32Array
  try {
    globalThis.Float32Array = class { constructor() { throw new Error('per-frame typed-array allocation') } }
    for (let i = 0; i < 10000; i++) {
      title.update(1 / 60, 1920, 1080)
      assert.equal(title.camera, camera)
      assert.ok(Math.abs(camera.position.y - 5) <= TITLE_SWAY_METRES + 1e-9)
      assert.ok(Math.abs(camera.rotation.z - base.z) <= TITLE_SWAY_RADIANS + 1e-9)
      assert.equal(camera.position.x, 0); assert.equal(camera.position.z, 0)
      assert.equal(camera.rotation.x, base.x); assert.equal(camera.rotation.y, base.y)
    }
  } finally { globalThis.Float32Array = originalArray; title.dispose() }
  assert.equal(updates, 10000); assert.equal(disposed, 2)
  assert.ok(TITLE_SWAY_METRES <= 0.03); assert.ok(TITLE_SWAY_RADIANS <= 0.3 * Math.PI / 180)
})

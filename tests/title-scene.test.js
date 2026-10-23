import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTitleScene, countTitleBudget, TITLE_VALLEY_SPEED, TITLE_SWAY_METRES, TITLE_SWAY_RADIANS, TITLE_EYE_Y, TITLE_COACH_Z, TITLE_TRAIN_YAW, TITLE_ROOF_Y } from '../src/ui/title-scene.js'
import { createMoonlitValley } from '../src/environment/moonlit-valley.js'
import { getKitMaterials } from '../src/environment/level1-kit/kit-materials.js'

test('title owns a batched exterior train, both valley sides and clear-night sky within 45 draws; disposes once', () => {
  const previousDocument = globalThis.document, previousLoad = THREE.TextureLoader.prototype.load
  globalThis.document = { createElement: () => {
    const canvas = { width: 256, height: 256 }
    const ctx = new Proxy({ canvas, measureText: () => ({ width: 100 }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} })
    }, { get: (target, key) => key in target ? target[key] : () => {} })
    canvas.getContext = () => ctx; return canvas
  } }
  THREE.TextureLoader.prototype.load = () => new THREE.Texture()
  let title, valley, options
  try {
    const cached = new Set(Object.values(getKitMaterials()).flat().filter(value => value?.isMaterial)), sharedDisposals = []
    const sharedTextures = new Set()
    for (const material of cached) {
      material.addEventListener('dispose', () => sharedDisposals.push(material))
      for (const value of Object.values(material)) if (value?.isTexture) sharedTextures.add(value)
    }
    for (const texture of sharedTextures) texture.addEventListener('dispose', () => sharedDisposals.push(texture))
    title = createTitleScene({ valleyFactory(value) { options = value; return valley = createMoonlitValley(value) } })
    assert.equal(options.speed, -38); assert.equal(TITLE_VALLEY_SPEED, -38)
    assert.equal(options.chunkCount, 5); assert.equal(options.omitHillSide, false)
    assert.equal(options.rails, false); assert.equal(options.poles, false)
    assert.notEqual(options.static, true)
    assert.equal(title.scene.children.length, 4)
    assert.ok(title.scene.getObjectByName('title-train-exterior'))
    assert.equal(title.scene.children.filter(node => node.isLight).length, 1)
    assert.equal(title.scene.fog.near, 70); assert.equal(title.scene.fog.far, 900)
    const sky = title.scene.getObjectByName('sky-dome')
    assert.equal(sky.material.uniforms.uGlitch.value, 0)
    assert.equal(sky.material.uniforms.uNightLift.value, 0.95)
    assert.equal(sky.material.uniforms.uMoonSize.value, 2)
    assert.ok(title.stats.drawCalls <= 45, `draws=${title.stats.drawCalls}`)
    const resources = new Set(), counts = new Map()
    title.scene.traverse(node => {
      assert.equal(Boolean(node.castShadow), false)
      assert.doesNotMatch(node.name, /player|guard|train-interior/)
      if (node.geometry) resources.add(node.geometry)
      if (node.isInstancedMesh) resources.add(node)
      if (node.material) {
        assert.equal(cached.has(node.material), false)
        resources.add(node.material)
        for (const value of Object.values(node.material)) if (value?.isTexture) { assert.equal(sharedTextures.has(value), false); resources.add(value) }
      }
    })
    for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1))
    title.update(0, 1366, 768)
    const z = valley.chunks[0].group.position.z
    title.update(1, 1366, 768)
    assert.ok(Math.abs(((valley.chunks[0].group.position.z % 2400) + 2400) % 2400 - (((z - 38) % 2400) + 2400) % 2400) < 1e-9)
    assert.equal(title.camera.aspect, 1366 / 768)
    assert.ok(Math.abs(TITLE_EYE_Y - TITLE_ROOF_Y - 1.6) < 1e-9)
    const moon = new THREE.Vector3(-0.478, 0.292, 0.828).normalize().multiplyScalar(1000).add(title.camera.position)
    title.camera.updateMatrixWorld(true)
    moon.project(title.camera)
    assert.ok(Math.abs(moon.x) > 0.6 && Math.abs(moon.x) < 1 && moon.y > 0.3 && moon.y < 1, JSON.stringify(moon))
    console.log('[title camera]', JSON.stringify({ position: title.camera.position.toArray(), moonNdc: moon.toArray(), fov: title.camera.fov }))
    // Existing buffers, scene objects and materials survive a recycle too.
    const identities = []
    title.scene.traverse(node => identities.push(node))
    for (let i = 0; i < 600; i++) {
      title.update(1 / 60, 1366, 768)
      const minZ = Math.min(...valley.chunks.map(chunk => chunk.group.position.z))
      const maxZ = Math.max(...valley.chunks.map(chunk => chunk.group.position.z + 480))
      assert.ok(title.camera.position.z - minZ > 780 && maxZ - title.camera.position.z > 780)
    }
    const after = []; title.scene.traverse(node => after.push(node))
    assert.deepEqual(after, identities)
    title.dispose(); title.dispose()
    assert.equal(title.scene.children.length, 0)
    for (const resource of resources) assert.equal(counts.get(resource), 1, resource.type)
    assert.equal(sharedDisposals.length, 0, 'title never disposes cached gameplay materials or textures')
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
  const group = new THREE.Group(), skyMesh = new THREE.Mesh(new THREE.SphereGeometry(480, 8, 6), new THREE.MeshBasicMaterial())
  const title = createTitleScene({
    valleyFactory: () => ({ group, stats: { drawCalls: 17, triangles: 45000 }, update() { updates++ }, dispose() { disposed++ } }),
    trainFactory: () => ({ train: new THREE.Group(), update() {}, dispose() { disposed++ } }),
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
      assert.ok(Math.abs(camera.position.y - TITLE_EYE_Y) <= TITLE_SWAY_METRES + 1e-9)
      assert.ok(Math.abs(camera.rotation.z - base.z) <= TITLE_SWAY_RADIANS + 1e-9)
      assert.equal(camera.position.x, Math.sin(TITLE_TRAIN_YAW) * TITLE_COACH_Z)
      assert.equal(camera.position.z, Math.cos(TITLE_TRAIN_YAW) * TITLE_COACH_Z)
      assert.equal(camera.rotation.x, base.x); assert.equal(camera.rotation.y, base.y)
    }
  } finally { globalThis.Float32Array = originalArray; title.dispose() }
  assert.equal(updates, 10000); assert.equal(disposed, 3)
  assert.ok(TITLE_SWAY_METRES <= 0.03); assert.ok(TITLE_SWAY_RADIANS <= 0.35 * Math.PI / 180)
})

test('title budget safely handles missing positions, indexed/non-indexed geometry, instances and hidden subtrees', () => {
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial(), geometries = []
  const own = geometry => { geometries.push(geometry); return geometry }
  const empty = own(new THREE.BufferGeometry()); empty.setIndex([0, 1, 2])
  root.add(new THREE.Mesh(empty, material))
  root.add(new THREE.Mesh(own(new THREE.BoxGeometry()), material))
  const triangle = own(new THREE.BufferGeometry())
  triangle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  root.add(new THREE.Mesh(triangle, material))
  const plane = own(new THREE.PlaneGeometry()), instances = new THREE.InstancedMesh(plane, material, 3)
  root.add(instances)
  const points = new THREE.Points(triangle, new THREE.PointsMaterial()); root.add(points)
  const hidden = new THREE.Group(); hidden.visible = false; hidden.add(new THREE.Mesh(plane, material)); root.add(hidden)
  assert.deepEqual(countTitleBudget(root), { drawCalls: 4, triangles: 19 })
  instances.count = 0
  assert.deepEqual(countTitleBudget(root), { drawCalls: 3, triangles: 13 })
  instances.count = 99 // Clamp to the allocated instance buffer, like the renderer.
  assert.deepEqual(countTitleBudget(root), { drawCalls: 4, triangles: 19 })
  for (const geometry of geometries) geometry.dispose()
  instances.dispose(); points.material.dispose(); material.dispose()
})

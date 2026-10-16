import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const keys = ['dead-tree-trunk', 'tree-stump']

async function loadFixture(t, { failures = false } = {}) {
  const waiting = [], warnings = []
  let active = 0, peak = 0, started = 0, waves = 0
  t.mock.method(console, 'warn', (...args) => warnings.push(args))
  function enqueue(url, resolve, reject, model) {
    started++; active++; peak = Math.max(peak, active)
    waiting.push(() => {
      active--
      if (failures && /(?:dead-tree-trunk\.glb|rock-face-diff\.jpg)$/.test(url)) {
        reject(new Error('fixture missing optional asset'))
      } else if (failures && /\/tree-stump\.glb$/.test(url)) {
        resolve({ scene: new THREE.Group() })
      } else if (model) {
        const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture() })
        const geometry = new THREE.BoxGeometry()
        geometry.name = url
        resolve({ scene: new THREE.Mesh(geometry, material) })
      } else resolve(new THREE.Texture())
    })
  }
  t.mock.method(GLTFLoader.prototype, 'load', function (url, resolve, _progress, reject) { enqueue(url, resolve, reject, true) })
  t.mock.method(THREE.TextureLoader.prototype, 'load', function (url, resolve, _progress, reject) { enqueue(url, resolve, reject, false) })
  const module = await import(`../src/environment/nature-props.js?fixture=${failures}`)
  assert.equal(module.getBoardingAssets(), null)
  const promise = module.loadBoardingAssets()
  assert.equal(module.loadBoardingAssets(), promise, 'simultaneous callers share one load')
  let done = false
  promise.then(() => { done = true })
  while (!done && waves < 20) {
    await setImmediate()
    if (done) break
    assert.ok(waiting.length, 'queue must not stall after optional failure')
    waves++
    const batch = waiting.splice(0).reverse()
    for (const finish of batch) finish()
  }
  assert.equal(done, true)
  const result = await promise
  assert.equal(module.getBoardingAssets(), result)
  assert.equal(await module.loadBoardingAssets(), result, 'revisit reuses the completed cache')
  assert.equal(started, 10, 'only two kept models and eight surface maps are requested')
  assert.equal(peak, 4, 'models and surface maps share the same four slots')
  assert.equal(waves, 3)
  return { result, warnings }
}

test('bounded nature loads preserve catalogue order and material settings under reversed completion', async t => {
  const { result, warnings } = await loadFixture(t)
  assert.deepEqual(result.props.map(prop => prop.key), keys)
  assert.equal(warnings.length, 0)
  for (const prop of result.props) {
    assert.ok(prop.geometry.name.endsWith(`/${prop.key}.glb`), 'each material/geometry stays with its catalogue definition')
    assert.equal(prop.material.map.colorSpace, THREE.SRGBColorSpace)
    assert.equal(prop.material.normalMap.colorSpace, THREE.NoColorSpace)
    assert.equal(prop.material.map.wrapS, THREE.RepeatWrapping)
    assert.equal(prop.material.map.anisotropy, 4)
    assert.equal(prop.material.map.userData.sharedTexture, true)
    assert.ok(['log', 'stump'].includes(prop.kind))
    assert.equal(prop.material.alphaTest, 0)
    assert.equal(prop.material.side, THREE.FrontSide)
  }
  assert.equal(result.groundMap.colorSpace, THREE.NoColorSpace, 'preserve existing surface interpretation')
  assert.equal(result.groundNormal.colorSpace, THREE.NoColorSpace)
})

test('optional missing/meshless nature assets preserve ordered fallback and drain every queued job', async t => {
  const { result, warnings } = await loadFixture(t, { failures: true })
  assert.deepEqual(result.props.map(prop => prop.key), [])
  assert.equal(result.rockMap, null)
  assert.ok(result.rockNormal?.isTexture)
  assert.ok(result.groundMap?.isTexture)
  assert.equal(warnings.length, 3)
})

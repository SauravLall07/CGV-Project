// Controlled loader callbacks: dependency waves/counts, not browser load time.
// node --import ./scripts/register-test-assets.mjs scripts/measure-phase-e-loading.mjs
import { createHash } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const originalGltf = GLTFLoader.prototype.load
const originalTexture = THREE.TextureLoader.prototype.load
const waiting = []
let started = 0, active = 0, peak = 0, waves = 0
function enqueue(url, resolve, model) {
  started++; active++; peak = Math.max(peak, active)
  waiting.push(() => {
    active--
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture() })
    resolve(model ? { scene: new THREE.Mesh(new THREE.BoxGeometry(), material) } : new THREE.Texture())
  })
}
GLTFLoader.prototype.load = function (url, resolve) { enqueue(url, resolve, true) }
THREE.TextureLoader.prototype.load = function (url, resolve) { enqueue(url, resolve, false) }
try {
  const { loadBoardingAssets } = await import('../src/environment/nature-props.js')
  const promise = loadBoardingAssets()
  let done = false
  promise.then(() => { done = true })
  while (!done) {
    await setImmediate()
    if (!waiting.length) {
      if (!done) throw new Error('Loading stalled without pending fixture callbacks')
      break
    }
    waves++
    // Reverse each wave to exercise catalogue order independent of completion.
    const batch = waiting.splice(0).reverse()
    for (const finish of batch) finish()
  }
  const result = await promise
  const settings = result.props.map(({ key, kind, scale, capacity, swayHeight, windStrength, material }) => ({
    key, kind, scale, capacity, swayHeight, windStrength, alphaTest: material.alphaTest, side: material.side,
    map: { colorSpace: material.map.colorSpace, wrapS: material.map.wrapS, anisotropy: material.map.anisotropy },
    normal: { colorSpace: material.normalMap.colorSpace, wrapS: material.normalMap.wrapS, anisotropy: material.normalMap.anisotropy }
  }))
  console.log(JSON.stringify({ started, peakTopLevelLoads: peak, fixtureCompletionWaves: waves,
    props: settings.map(prop => prop.key), catalogueSettingsSha256: createHash('sha256').update(JSON.stringify(settings)).digest('hex'),
    sharedPromise: promise === loadBoardingAssets() }, null, 2))
} finally {
  GLTFLoader.prototype.load = originalGltf
  THREE.TextureLoader.prototype.load = originalTexture
}

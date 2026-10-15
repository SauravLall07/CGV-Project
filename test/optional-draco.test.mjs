import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createAssetLoader } from '../src/core/assets.js'

test('uncompressed torch skips decoder wiring while default callers retain shared Draco support', async t => {
  const bytes = await readFile(new URL('../src/assets/models/props/torch/guard-torch.glb', import.meta.url))
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  assert.equal(json.extensionsUsed?.includes('KHR_draco_mesh_compression') ?? false, false)
  assert.equal(json.extensionsRequired?.includes('KHR_draco_mesh_compression') ?? false, false)
  const seen = [], wired = []
  t.mock.method(GLTFLoader.prototype, 'setDRACOLoader', function (loader) {
    wired.push(loader); this.dracoLoader = loader; return this
  })
  t.mock.method(GLTFLoader.prototype, 'load', function (url, resolve) {
    seen.push({ url, decoder: this.dracoLoader }); resolve({ url })
  })
  const assets = createAssetLoader()
  t.after(() => assets.dispose())
  assert.deepEqual(await assets.loadModel('torch.glb', { draco: false }), { url: 'torch.glb' })
  assert.equal(wired.length, 0)
  assert.equal(seen[0].decoder, null)
  await Promise.all([assets.loadModel('compressed-a.glb'), assets.loadModel('compressed-b.glb')])
  assert.equal(wired.length, 1)
  assert.equal(typeof wired[0].decodeGeometry, 'function')
  assert.equal(seen[1].decoder, wired[0])
  assert.equal(seen[2].decoder, wired[0])
})

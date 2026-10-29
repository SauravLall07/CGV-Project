import test from 'node:test'
import assert from 'node:assert/strict'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createPostProcessing } from '../src/core/postprocessing.js'

test('level shadow lift is applied, defaults for the next grade, and resets on teardown', () => {
  const previousWindow = globalThis.window
  const originalAddPass = EffectComposer.prototype.addPass
  let output, post
  globalThis.window = new EventTarget()
  EffectComposer.prototype.addPass = function (pass) {
    if (pass instanceof OutputPass) output = pass
    return originalAddPass.call(this, pass)
  }
  try {
    post = createPostProcessing({ getSize: target => target.set(1280, 720), getPixelRatio: () => 1 })
    const defaults = Object.fromEntries(['uLift', 'uWarmth', 'uSaturation', 'uVignette']
      .map(key => [key, output.uniforms[key].value]))
    post.setGrade({ warmth: 0, lift: 0.008 })
    assert.equal(output.uniforms.uWarmth.value, 0)
    assert.equal(output.uniforms.uLift.value, 0.008)
    post.setGrade({ warmth: 0 })
    assert.equal(output.uniforms.uLift.value, defaults.uLift, 'Level 2 retains its own shadow lift')
    post.setGrade({ warmth: 0, lift: 0.008 })
    post.resetGrade()
    for (const [key, value] of Object.entries(defaults)) assert.equal(output.uniforms[key].value, value)
  } finally {
    post?.dispose()
    EffectComposer.prototype.addPass = originalAddPass
    globalThis.window = previousWindow
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createGpuTimer } from '../src/dev/gpu-timer.js'
import { summarizeFrames, summarizeGpu } from '../src/dev/frame-metrics.js'
import { createBenchmark } from '../src/dev/benchmark.js'
import { createLoop } from '../src/core/loop.js'
import { mountRenderOverlay } from '../src/dev/render-overlay.js'

function fakeGl(supported = true) {
  const queries = []
  let active = null
  const gl = {
    QUERY_RESULT_AVAILABLE: 'available', QUERY_RESULT: 'result', disjoint: false,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 'elapsed', GPU_DISJOINT_EXT: 'disjoint' } : null,
    createQuery() { const q = { available: false, result: 2e6 }; queries.push(q); return q },
    beginQuery(_target, q) { assert.equal(active, null, 'elapsed queries must never nest'); active = q },
    endQuery() { assert.ok(active); active = null },
    deleteQuery(q) { assert.ok(!q.deleted, 'query must be released once'); q.deleted = true },
    getParameter: () => gl.disjoint,
    getQueryParameter: (q, parameter) => parameter === 'available' ? q.available : q.result
  }
  return { gl, queries }
}

test('frame statistics retain long gaps, exclude labeled boundaries and use the slowest 1% mean', () => {
  const frames = [...Array.from({ length: 198 }, () => ({ frameMs: 10 })), { frameMs: 20 }, { frameMs: 1000 },
    { frameMs: 5000, exclusion: 'hidden' }, { frameMs: 5000, exclusion: 'visibility-transition' },
    { frameMs: 0 }, { frameMs: NaN }]
  const result = summarizeFrames(frames)
  assert.equal(result.frames, 200)
  assert.equal(result.excludedFrames, 4)
  assert.equal(result.elapsedMs, 3000)
  assert.equal(result.averageFps, 200 * 1000 / 3000)
  assert.equal(result.onePercentLowFps, 1000 / 510)
  assert.equal(result.meanFrameMs, 15)
  assert.equal(result.p99FrameMs, 10)
  assert.equal(result.maxFrameMs, 1000)
  assert.equal(result.over16_67Ms, 2)
  assert.equal(result.over33_33Ms, 1)
  assert.equal(result.over50Ms, 1)
  assert.equal(summarizeFrames([]), null)
  assert.deepEqual(summarizeGpu([{ label: 'scene', ms: 2 }, { label: 'scene', ms: 4 }, { label: 'minimap', ms: 1 }]), {
    scene: { samples: 2, totalMs: 6, meanMs: 3 }, minimap: { samples: 1, totalMs: 1, meanMs: 1 }
  })
})

test('GPU samples are fresh, tagged to origin/completion, non-nesting and drained once', () => {
  const { gl, queries } = fakeGl()
  const timer = createGpuTimer(gl)
  assert.equal(timer.begin('scene', 10), true)
  assert.equal(timer.begin('bloom', 10), false)
  timer.endIf('bloom')
  timer.endIf('scene')
  timer.poll(11)
  assert.deepEqual(timer.drain(), [])
  queries[0].available = true
  timer.poll(12)
  assert.deepEqual(timer.drain(), [{ queryId: 1, frameId: 10, completedFrameId: 12, label: 'scene', ms: 2 }])
  timer.poll(13)
  assert.deepEqual(timer.drain(), [])
  assert.equal(timer.average('scene'), 2)
  assert.equal(queries[0].deleted, true)
  timer.reset()
  assert.equal(timer.average('scene'), null)
  timer.dispose()
})

test('GPU disjoint discards unavailable queries and histories before the flag clears', () => {
  const { gl, queries } = fakeGl()
  const timer = createGpuTimer(gl)
  timer.begin('scene', 1); timer.end()
  queries[0].available = true
  timer.poll(2)
  timer.drain()
  timer.begin('scene', 2); timer.end()
  gl.disjoint = true
  timer.poll(3)
  assert.equal(queries[1].deleted, true)
  assert.equal(timer.average('scene'), null)
  assert.equal(timer.status().disjointEvents, 1)
  gl.disjoint = false
  queries[1].available = true
  timer.poll(4)
  assert.deepEqual(timer.drain(), [])
  timer.begin('scene', 4); timer.end()
  timer.reset()
  assert.equal(queries[2].deleted, true)
  assert.equal(timer.status().disjointEvents, 0)
  timer.begin('scene', 5)
  timer.dispose(); timer.dispose()
  assert.equal(queries[3].deleted, true)
  assert.equal(timer.begin('scene', 6), false)
})

test('GPU unsupported and stalled-driver paths remain nonblocking and bounded', () => {
  const unavailable = createGpuTimer(fakeGl(false).gl)
  assert.equal(unavailable.supported, false)
  assert.equal(unavailable.begin('scene', 1), false)
  unavailable.end(); unavailable.poll(); unavailable.reset(); unavailable.dispose()
  assert.deepEqual(unavailable.drain(), [])
  assert.equal(unavailable.average('scene'), null)
  const { gl, queries } = fakeGl()
  const timer = createGpuTimer(gl)
  for (let i = 0; i < 1000; i++) { timer.begin('scene', i); timer.end() }
  assert.equal(queries.length, 256)
  assert.equal(timer.status().skipped, 744)
  timer.poll(1000)
  timer.dispose()
  assert.ok(queries.every(q => q.deleted))
})

function installUi(t) {
  const cleanups = []
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const window = new EventTarget()
  Object.assign(window, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 })
  const document = new EventTarget()
  Object.assign(document, { hidden: false, body: { appendChild() {} },
    createElement: () => ({ style: {}, textContent: '', remove() {} }) })
  globalThis.window = window
  globalThis.document = document
  t.after(() => {
    try { for (const cleanup of cleanups) cleanup() } finally {
      globalThis.window = previousWindow; globalThis.document = previousDocument
    }
  })
  return { window, document, cleanup: callback => cleanups.push(callback) }
}

test('loop instrumentation preserves the clamped simulation delta and update/render order', t => {
  const originalRaf = globalThis.requestAnimationFrame
  const scheduled = []
  globalThis.requestAnimationFrame = callback => { scheduled.push(callback); return scheduled.length }
  t.after(() => { globalThis.requestAnimationFrame = originalRaf })
  const calls = []
  const renderer = { domElement: { clientWidth: 10, clientHeight: 10 },
    setScissorTest() {}, setViewport() {}, setScissor() {}, clear() { calls.push('clear') } }
  const instrumentation = Object.fromEntries(['beginFrame', 'beginUpdate', 'endUpdate', 'beginDraw', 'endDraw', 'endFrame']
    .map(name => [name, value => calls.push(name === 'beginFrame' ? [name, value] : name)]))
  const loop = createLoop({ renderer, clock: { getDelta: () => 2 }, instrumentation,
    render() { calls.push('render') }, afterRender() { calls.push('minimap') } })
  loop.add(delta => calls.push(['update', delta]))
  loop.start()
  scheduled.shift()(2000)
  assert.deepEqual(calls, [['beginFrame', 2000], 'beginUpdate', ['update', 0.1], 'endUpdate',
    'beginDraw', 'clear', 'render', 'endDraw', 'minimap', 'endFrame'])
  assert.equal(scheduled.length, 1)
})

test('overlay measures real rAF gaps, labels visibility boundaries and isolates the minimap', t => {
  const { document, cleanup } = installUi(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const { gl, queries } = fakeGl()
  const renderer = { getContext: () => gl, getPixelRatio: () => 1, domElement: new EventTarget(),
    shadowMap: { enabled: true, render() { now += 2 } },
    info: { render: { calls: 1, triangles: 2 }, memory: { geometries: 3, textures: 4 } },
    render(scene, camera) {
      this.shadowMap.render([], scene, camera)
      now += camera.isPerspectiveCamera ? 5 : 3
    } }
  const originalRender = renderer.render, originalShadow = renderer.shadowMap.render
  const overlay = mountRenderOverlay(renderer)
  cleanup(() => overlay.dispose())
  overlay.beginFrame(0)
  assert.equal(overlay.sampleFrame(), null, 'dormant instrumentation creates no samples')
  overlay.setBenchmarkActive(true)
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene()
  overlay.beginFrame(0); overlay.endFrame()
  overlay.beginFrame(2000)
  overlay.beginUpdate(); now += 4; overlay.endUpdate()
  overlay.beginDraw(); renderer.render(scene, camera); overlay.endDraw()
  const beforeMap = overlay.sampleFrame()
  renderer.render(scene, new THREE.OrthographicCamera())
  assert.equal(overlay.sampleFrame().minimapCpuMs, 0, 'post quad is not the minimap')
  const map = new THREE.OrthographicCamera(); map.name = 'minimap'
  renderer.render(scene, map)
  const sample = overlay.sampleFrame()
  assert.equal(sample.frameMs, 2000, 'visible stalls must not be capped or filtered')
  assert.equal(sample.updateCpuMs, 4)
  assert.equal(sample.sceneCpuMs, 7)
  assert.equal(sample.drawCpuMs, 7)
  assert.equal(sample.minimapCpuMs, 5)
  assert.equal(beforeMap.frameId, sample.frameId)
  queries.forEach(q => { q.available = true })
  assert.deepEqual(overlay.takeGpuSamples().map(q => q.label).sort(), ['minimap', 'scene', 'shadow'])
  assert.deepEqual(overlay.takeGpuSamples(), [])
  overlay.endFrame()
  // Browsers can suspend rAF throughout the hidden period. The event must
  // exclude the first returning interval even without an observed hidden tick.
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'))
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'))
  overlay.beginFrame(32000)
  assert.equal(overlay.sampleFrame().exclusion, 'visibility-transition')
  overlay.endFrame()
  overlay.beginFrame(32016)
  assert.equal(overlay.sampleFrame().exclusion, null)
  overlay.endFrame()
  document.hidden = true
  overlay.beginFrame(33000)
  assert.equal(overlay.sampleFrame().exclusion, 'hidden')
  overlay.resetMeasurements()
  assert.equal(overlay.sampleFrame(), null)
  overlay.dispose()
  assert.equal(renderer.render, originalRender)
  assert.equal(renderer.shadowMap.render, originalShadow)
})

test('benchmark exports raw frames and fresh GPU results, preserving slow visible frames and interrupted attempts', t => {
  const { window, document, cleanup } = installUi(t)
  let now = 0, sample = null, gpuSamples = [], resets = 0, active = false, disjointEvents = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.method(console, 'table', () => {})
  let toggles = { postEnabled: true, shadowsOff: true }
  const original = { ...toggles }
  let scale = null
  const overlay = {
    captureToggles: () => ({ ...toggles }), applyToggles: next => { toggles = { ...next } },
    setBenchmarkActive: value => { active = value },
    resetMeasurements() { resets++; sample = null; gpuSamples = []; disjointEvents = 0 },
    sampleFrame: () => sample,
    takeGpuSamples() { const fresh = gpuSamples; gpuSamples = []; return fresh },
    gpuStatus: () => ({ supported: true, pending: 1, disjointEvents })
  }
  const bench = createBenchmark({ camera: new THREE.PerspectiveCamera(), overlay,
    quality: { setOverride: value => { scale = value }, getScale: () => scale ?? 1 },
    ready: () => true, prepare() {} })
  cleanup(() => bench.dispose())
  bench.update()
  now = 3000; bench.afterRender()
  const frame = (id, ms) => ({ frameId: id, frameMs: ms, updateCpuMs: 1,
    sceneCpuMs: 2, drawCpuMs: 3, minimapCpuMs: 0.5, exclusion: null })
  sample = frame(1, 1000); now = 4000
  gpuSamples = [{ queryId: 1, frameId: 1, completedFrameId: 1, label: 'scene', ms: 2 }]
  bench.afterRender()
  sample = frame(2, 1000); now = 5000; bench.afterRender()
  sample = frame(3, 2000); now = 7000; bench.afterRender()
  const result = window.chronoBenchmark.exportResults()
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].FPS, 0.75)
  assert.equal(result.rows[0].OnePercentLowFPS, 0.5)
  assert.equal(result.rows[0].GpuSceneSamples, 1, 'completed sample is not reused')
  assert.equal(result.captures[0].frames.length, 3)
  assert.equal(result.captures[0].gpuSamples.length, 1)
  assert.ok(resets >= 3, 'warmup and conditions reset query histories')
  // New condition measures independently, then retains the excluded attempt.
  now = 10000; bench.afterRender()
  now = 10016; sample = frame(4, 16); bench.afterRender()
  document.hidden = true
  now = 11000; sample = { ...frame(5, 984), exclusion: 'hidden' }; bench.afterRender()
  const interrupted = bench.exportResults().captures[1]
  assert.equal(interrupted.interruption, 'hidden')
  assert.equal(interrupted.frames[1].exclusion, 'hidden')
  document.hidden = false
  now = 14000; bench.afterRender()
  now = 14016; sample = frame(6, 16)
  gpuSamples = [{ queryId: 2, frameId: 6, completedFrameId: 6, label: 'scene', ms: 9 }]
  bench.afterRender()
  disjointEvents = 1
  window.dispatchEvent(new Event('keydown', { cancelable: true }))
  assert.equal(bench.exportResults().captures[2].gpuInvalidated, true)
  assert.deepEqual(bench.exportResults().captures[2].gpuPasses, {})
  assert.deepEqual(toggles, original)
  assert.equal(scale, null)
  window.dispatchEvent(new Event('keydown', { cancelable: true }))
  assert.equal(active, false)
})

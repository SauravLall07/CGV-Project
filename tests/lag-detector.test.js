import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three'
import { createLagDetector, SPIKE_MS, SUMMARY_MS, FRAME_CAPACITY } from '../src/dev/lag-detector.js'

test('lag detector logs only frames above 50 ms and at most five lines in any sliding second', () => {
  const lines = [], meter = createLagDetector({ report: line => lines.push(line) })
  const record = (now, ms) => meter.record(now, ms, 3, 4, 2, 'PLAYING', 'Boarding', 1.25)
  assert.equal(SPIKE_MS, 50)
  record(0, 50); assert.equal(lines.length, 0)
  for (let i = 0; i < 10; i++) record(100 + i, 51)
  assert.equal(lines.length, 5)
  assert.match(lines[0], /^\[spike\] 51.00 update=3.00 render=4.00 minimap=2.00 state=PLAYING level=Boarding t=1.25$/)
  record(1099, 80); assert.equal(lines.length, 5)
  record(1100, 80); assert.equal(lines.length, 6)
  record(1100, 80); assert.equal(lines.length, 6, 'the second slot is still inside its rolling second')
  meter.record(2101, 51, 3, 4, 2, 'PLAYING', 'Boarding', 2, 9)
  assert.match(lines.at(-1), /scene=9.00$/)
})

test('ten-second summary includes average, exact nearest-rank p95, max and suppressed spikes', () => {
  const lines = [], meter = createLagDetector({ report: line => lines.push(line), capacity: 32 })
  assert.equal(SUMMARY_MS, 10000)
  for (let i = 1; i <= 19; i++) meter.record(i - 1, i, 0, 0, 0, 'TITLE', 'Boarding', 0)
  meter.record(9999, 100, 0, 0, 0, 'TITLE', 'Boarding', 0)
  assert.equal(lines.filter(line => line.startsWith('[perf]')).length, 0)
  meter.record(10000, 200, 0, 0, 0, 'TITLE', 'Boarding', 0)
  assert.equal(lines.at(-1), '[perf] 10s: avg=23.33 p95=100.00 max=200.00 spikes=2')
  meter.record(20000, 16, 0, 0, 0, 'PLAYING', 'Boarding', 10)
  assert.equal(lines.at(-1), '[perf] 10s: avg=16.00 p95=16.00 max=16.00 spikes=0')
})

test('spike includes reusable system timings, position and movement without allocating sample arrays', () => {
  const lines = [], meter = createLagDetector({ report: line => lines.push(line) })
  const parts = new Float64Array([1, 2, 3, 4, 5, 6, 7, 0])
  const NativeFloat64 = globalThis.Float64Array
  try {
    globalThis.Float64Array = class { constructor() { throw new Error('sample allocation') } }
    meter.record(0, 100, 28, 8, 2, 'PLAYING', 'Boarding', 32, 7, parts, 1.23, -45.67, 6, true)
  } finally { globalThis.Float64Array = NativeFloat64 }
  assert.match(lines[0], /levelUpdate=1.00 time=2.00 player=3.00 camera=4.00 interaction=5.00 respawn=6.00 hud=7.00 pos=\(1.2,-45.7\) speed=6.00 running=true$/)
})

test('ring and percentile workspace stay fixed and sampling allocates no new arrays', () => {
  const meter = createLagDetector({ report() {} }), samples = meter.samples, workspace = meter.workspace
  assert.equal(samples.length, FRAME_CAPACITY)
  const NativeArray = globalThis.Array, NativeFloat64 = globalThis.Float64Array
  try {
    globalThis.Array = class { constructor() { throw new Error('per-frame array allocation') } }
    globalThis.Float64Array = class { constructor() { throw new Error('per-frame typed-array allocation') } }
    for (let i = 0; i < FRAME_CAPACITY + 100; i++) meter.record(i * 3, i % 30, 1, 2, 3, 'PLAYING', 'Boarding', i / 60)
    assert.equal(createLagDetector({ enabled: false }), null, 'disabled detector allocates nothing')
  } finally { globalThis.Array = NativeArray; globalThis.Float64Array = NativeFloat64 }
  assert.equal(meter.samples, samples); assert.equal(meter.workspace, workspace)
  assert.equal(samples.length, FRAME_CAPACITY); assert.equal(workspace.length, FRAME_CAPACITY)
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(source, /if \(import.meta.env\?\.DEV\) \{[\s\S]*?import\('\.\/dev\/lag-detector.js'\)/)
  assert.doesNotMatch(source, /renderOverlay\?\.sampleFrame\(/)
})

test('render-state counters are sampled only for emitted spikes and include unavailable zone, lights and programs', () => {
  const lines = [], state = new Float64Array([12, 1, 40])
  let reads = 0
  const meter = createLagDetector({ report: line => lines.push(line), getRenderState() { reads++; return state } })
  meter.record(0, 16, 1, 2, 3, 'PLAYING', 'Boarding', 0)
  assert.equal(reads, 0)
  const NativeArray = globalThis.Array, NativeFloat64 = globalThis.Float64Array
  try {
    globalThis.Array = class { constructor() { throw new Error('per-frame allocation') } }
    globalThis.Float64Array = class { constructor() { throw new Error('per-frame allocation') } }
    for (let i = 0; i < 6; i++) meter.record(i + 1, 300, 10, 290, 2, 'PLAYING', 'Boarding', 10)
  } finally { globalThis.Array = NativeArray; globalThis.Float64Array = NativeFloat64 }
  assert.equal(reads, 5, 'rate-limited spikes do not traverse the scene')
  assert.match(lines[0], /zone=unavailable lights=12 shadowLights=1 programs=40$/)
  state[2] = 44
  meter.record(1001, 300, 10, 290, 2, 'PLAYING', 'Boarding', 11)
  assert.match(lines.at(-1), /programs=44$/)
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const start = main.indexOf('  const renderState = new Float64Array(3)'), end = main.indexOf('// Same boundaries', start)
  const snippet = main.slice(start, end).replaceAll('import.meta.env?.DEV', 'false')
  const setup = snippet.slice(0, snippet.indexOf("  import('./dev/lag-detector.js')"))
  const source = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
  const visible = new THREE.PointLight(0xffffff, 0), hidden = new THREE.Group(), hiddenLight = new THREE.PointLight()
  visible.castShadow = true; hidden.visible = false; hidden.add(hiddenLight); source.add(visible, hidden)
  const otherLayer = new THREE.PointLight(); otherLayer.layers.set(2); source.add(otherLayer)
  const collect = new Function('scene', 'camera', 'renderer', `${setup};return getRenderState`)(source, camera, { info: { programs: [1, 2, 3] } })
  const first = collect(); assert.deepEqual([...first], [1, 1, 3])
  assert.equal(collect(), first, 'main reuses its counter buffer')
})

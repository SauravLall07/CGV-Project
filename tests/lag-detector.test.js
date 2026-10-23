import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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

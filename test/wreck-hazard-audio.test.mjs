import test from 'node:test'
import assert from 'node:assert/strict'
import { createWreckHazardAudio } from '../src/systems/wreck-hazard-audio.js'

test('N2/N3 audio: lazy unlock, bounded voices, master routing, held-time silence, pause and full cleanup', () => {
  const nodes = [], sources = [], master = {}
  const parameter = () => ({ value: 0, setTargetAtTime(value) { this.target = value } })
  function node(kind) {
    const n = { kind, gain: parameter(), frequency: parameter(), connect(destination) { this.destination = destination; return destination },
      start() {}, stop() { this.stopped = true }, disconnect() { this.disconnected = true } }
    nodes.push(n); return n
  }
  const context = { state: 'running', currentTime: 0, sampleRate: 48000,
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
    createOscillator() { const n = node('oscillator'); sources.push(n); return n },
    createBufferSource() { const n = node('buffer-source'); sources.push(n); return n },
    createBuffer(_channels, length) { const data = new Float32Array(length); return { getChannelData: () => data } } }
  let unlocked = false
  const audio = createWreckHazardAudio({ context: () => unlocked ? context : null, output: () => master })
  audio.update(1, 1); assert.equal(nodes.length, 0)
  unlocked = true; audio.update(0, 0); assert.equal(nodes.length, 0, 'distant/inactive hazards allocate no voices')
  audio.setPaused(true); audio.update(1, 1)
  const bus = nodes[0]
  assert.equal(bus.destination, master)
  assert.equal(bus.gain.value, 0)
  audio.setPaused(false); assert.equal(bus.gain.value, 1)
  for (let i = 0; i < 100; i++) audio.update(0.7, 1)
  assert.equal(sources.length, 2, 'no per-frame source creation')
  const noise = sources.find(n => n.kind === 'buffer-source')
  assert.equal(noise.loop, true)
  assert.equal(noise.buffer.getChannelData(0).length, 19200, 'bounded mono noise buffer')
  assert.equal(noise.destination.destination.destination, bus)
  assert.ok(sources[0].destination.gain.target > 0)
  audio.update(0, 0)
  assert.equal(sources[0].destination.gain.target, 0)
  assert.equal(noise.destination.destination.gain.target, 0, 'Freeze/Rewind/disabled state hushes jet')
  audio.reset()
  assert.ok(sources.every(n => n.stopped && n.disconnected))
  assert.ok(nodes.every(n => n.disconnected))
  audio.update(1, 1); assert.equal(sources.length, 4, 'fresh checkpoint owns fresh voices')
  audio.dispose(); audio.dispose()
  const count = nodes.length
  audio.update(1, 1); assert.equal(nodes.length, count)
  assert.ok(nodes.every(n => n.disconnected))
})

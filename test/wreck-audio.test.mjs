import test from 'node:test'
import assert from 'node:assert/strict'
import { createWreckAudio } from '../src/systems/wreck-audio.js'
import { initAudio, getMasterGain } from '../src/core/audio.js'
import { settings } from '../src/core/settings.js'

test('Wreck audio: silent before unlock; real master/mute, hush, pause, settling and disposal ownership', () => {
  const nodes = [], sources = []
  const parameter = () => ({ value: 0,
    setValueAtTime(v) { this.value = v }, exponentialRampToValueAtTime(v) { this.target = v },
    setTargetAtTime(v) { this.target = v }
  })
  const node = kind => {
    const n = { kind, gain: parameter(), frequency: parameter(),
      connect(destination) { this.destination = destination; return destination },
      disconnect() { this.disconnected = true }, start() {}, stop() { this.stopped = true }
    }
    nodes.push(n); return n
  }
  const ctx = { state: 'running', currentTime: 0, destination: {},
    createGain: () => node('gain'),
    createOscillator: () => { const n = node('oscillator'); sources.push(n); return n }
  }
  const silent = createWreckAudio({ context: () => null, output: () => null })
  silent.warning(); silent.brake(); silent.update(true, false); silent.dispose()
  assert.equal(nodes.length, 0)
  const oldWindow = globalThis.window
  const volume = settings.get('masterVolume'), mute = settings.get('mute')
  let sound
  try {
    globalThis.window = { AudioContext: class { constructor() { return ctx } } }
    initAudio()
    sound = createWreckAudio()
    sound.update(false, false)
    assert.equal(nodes.length, 1, 'inactive L3 does not start machinery')
    sound.update(true, false)
    const master = getMasterGain(), bus = nodes[1], bed = nodes[2]
    assert.equal(bus.destination, master)
    assert.equal(bed.gain.target, 0.045)
    sound.update(true, true)
    assert.equal(bed.gain.target, 0.0005)
    sound.warning()
    assert.equal(sources.at(-1).destination.destination, bus, 'warning bypasses the hushed bed')
    settings.set('mute', true); assert.equal(master.gain.value, 0)
    settings.set('masterVolume', 0.23); assert.equal(master.gain.value, 0)
    settings.set('mute', false); assert.equal(master.gain.value, 0.23)
    sound.setPaused(true); assert.equal(bus.gain.value, 0)
    const count = sources.length
    sound.warning(); assert.equal(sources.length, count)
    sound.setPaused(false); assert.equal(bus.gain.value, 1)
    assert.equal(master.gain.value, 0.23, 'resuming must not override master volume')
    sound.brake(); sound.update(true, false, 0)
    sound.update(true, false, 2.5)
    assert.equal(bed.gain.target, 0)
    const settled = sources.length
    sound.update(true, false, 3.5); assert.equal(sources.length, settled, 'settling sound occurs once')
    sound.reset()
    assert.ok(sources.every(s => s.stopped && s.disconnected))
    assert.ok(nodes.slice(1).every(n => n.disconnected))
    sound.update(true, false); assert.ok(sources.length > settled, 'checkpoint can start fresh audio')
    sound.dispose()
    const disposedCount = nodes.length
    sound.warning(); sound.brake(); sound.update(true, false)
    assert.equal(nodes.length, disposedCount)
    assert.ok(sources.every(s => s.stopped && s.disconnected))
  } finally {
    sound?.dispose()
    settings.set('masterVolume', volume); settings.set('mute', mute)
    globalThis.window = oldWindow
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { initAudio, getAudioBus, getMasterGain, resumeAudio, setAudioPaused,
  setAudioFocused, onAudioPause, disposeAudio } from '../src/core/audio.js'
import { settings } from '../src/core/settings.js'

test('category mix, mute, pause/focus, safe unlock and persistent settings share one graph', async () => {
  const storage = new Map(), nodes = []
  let resumed = 0, suspended = 0
  const previous = globalThis.window
  globalThis.window = {
    localStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) },
    AudioContext: class {
      state = 'running'; destination = {}
      createGain() {
        const n = { gain: { value: 0 }, connect(d) { this.destination = d }, disconnect() { this.disconnected = true } }
        nodes.push(n); return n
      }
      resume() { resumed++; return Promise.resolve() }
      suspend() { suspended++; return Promise.resolve() }
      close() { return Promise.resolve() }
    }
  }
  const events = [], unsubscribe = onAudioPause(value => events.push(value))
  try {
    assert.ok(initAudio())
    const sfx = getAudioBus(), ui = getAudioBus('ui'), music = getAudioBus('music'), ambience = getAudioBus('ambience')
    const master = getMasterGain(), world = sfx.destination
    assert.equal(ui.destination, master)
    assert.equal(world.destination, master)
    assert.equal(ambience.destination, world)
    assert.equal(music.destination, world)
    settings.set('sfxVolume', 0.23); settings.set('musicVolume', 0.34); settings.set('ambienceVolume', 0.45)
    assert.equal(sfx.gain.value, 0.23); assert.equal(ui.gain.value, 0.23)
    assert.equal(music.gain.value, 0.34); assert.equal(ambience.gain.value, 0.45)
    settings.set('mute', true); assert.equal(master.gain.value, 0)
    settings.set('mute', false); assert.equal(master.gain.value, 0.5)
    setAudioPaused(true); assert.equal(world.gain.value, 0); assert.equal(ui.gain.value, 0.23)
    setAudioPaused(false); assert.equal(world.gain.value, 1)
    setAudioFocused(false); assert.equal(master.gain.value, 0); assert.equal(suspended, 1)
    await resumeAudio(); assert.equal(resumed, 0)
    setAudioFocused(true); await resumeAudio(); assert.equal(resumed, 1)
    const { settings: reloaded } = await import('../src/core/settings.js?audio-persistence-test')
    assert.equal(reloaded.get('sfxVolume'), 0.23)
    assert.equal(reloaded.get('musicVolume'), 0.34)
    assert.equal(reloaded.get('ambienceVolume'), 0.45)
    assert.deepEqual(events, [true, false, true, false])
    disposeAudio(); assert.ok(nodes.every(n => n.disconnected))
    globalThis.window = {}
    assert.equal(initAudio(), null, 'unsupported browsers remain silent')
  } finally {
    unsubscribe(); disposeAudio(); globalThis.window = previous
    settings.resetOptions()
  }
})

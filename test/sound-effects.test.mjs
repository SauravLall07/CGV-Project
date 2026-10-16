import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createSoundPlayer } from '../src/systems/sound-effects.js'
import { SOUND_FILES } from '../src/systems/sound-catalog.js'
import { settings } from '../src/core/settings.js'

function fixture(maxVoices = 3) {
  const sources = [], gains = [], destinations = new Map()
  let fetches = 0, decodes = 0, blocked = false, fail = false, signal
  const ctx = { state: 'running', currentTime: 0,
    createBufferSource() {
      const s = { playbackRate: { value: 1 }, connect(d) { this.destination = d },
        disconnect() { this.disconnected = true }, start() { this.started = true },
        stop() { this.stopped = true } }
      sources.push(s); return s
    },
    createGain() {
      const g = { gain: { value: 1, setTargetAtTime(v) { this.value = v } },
        connect(d) { this.destination = d }, disconnect() { this.disconnected = true } }
      gains.push(g); return g
    },
    decodeAudioData(_data, resolve) {
      decodes++
      const b = { length: 100, numberOfChannels: 1 }
      resolve(b); return Promise.resolve(b)
    }
  }
  const player = createSoundPlayer({ context: () => ctx, paused: () => blocked,
    output: category => { if (!destinations.has(category)) destinations.set(category, {}); return destinations.get(category) },
    maxVoices, files: { jump: 'jump.wav', land: 'land.wav', 'ui-click': 'click.wav' },
    fetchAsset: async (_url, options) => {
      signal = options.signal
      fetches++
      return { ok: !fail, status: 404, arrayBuffer: async () => new ArrayBuffer(4) }
    } })
  return { player, ctx, sources, gains, destinations, counts: () => ({ fetches, decodes }),
    signal: () => signal, pause: v => { blocked = v }, failure: v => { fail = v } }
}
test('preloads deduplicate fetch/decode, cache buffers and never play a delayed missed event', async () => {
  const f = fixture()
  assert.equal(f.player.play('jump'), null)
  assert.deepEqual(f.counts(), { fetches: 0, decodes: 0 }, 'gameplay does no lazy loading')
  await Promise.all([f.player.load('jump'), f.player.load('jump')])
  assert.deepEqual(f.counts(), { fetches: 1, decodes: 1 })
  assert.equal(f.sources.length, 0)
  await f.player.load('jump')
  assert.equal(f.player.info().pcmBytes, 400)
  f.player.dispose()
})
test('cooldowns, per-key concurrency and global caps bound dense events; priority can replace low voices', async () => {
  const f = fixture(2)
  await f.player.preload()
  const low = f.player.play('jump', { priority: 0, cooldown: 0 })
  assert.ok(low)
  assert.equal(f.player.play('jump'), null, 'cooldown')
  f.ctx.currentTime = 1
  assert.ok(f.player.play('jump', { cooldown: 0 }))
  assert.equal(f.player.play('jump', { cooldown: 0 }), null, 'per-key limit')
  assert.equal(f.player.play('land', { priority: 0 }), null, 'global cap')
  assert.ok(f.player.play('land', { priority: 3 }))
  assert.equal(f.sources[0].stopped, true)
  assert.equal(f.player.info().voices, 2)
  f.player.dispose()
  assert.ok(f.sources.every(s => s.stopped && s.disconnected))
  assert.ok(f.gains.every(g => g.disconnected))
})
test('pause/suspension discard world playback, UI remains usable, loops stop and ended voices disconnect', async () => {
  const f = fixture()
  await f.player.preload()
  assert.ok(f.player.play('land', { loop: true }))
  assert.equal(f.sources[0].loop, true)
  f.pause(true); f.player.stopAll()
  assert.equal(f.sources[0].stopped, true)
  assert.equal(f.player.play('jump'), null)
  assert.ok(f.player.play('ui-click'))
  assert.equal(f.gains.at(-1).destination, f.destinations.get('ui'))
  f.sources.at(-1).onended()
  assert.equal(f.player.info().voices, 0)
  f.pause(false); f.ctx.state = 'suspended'
  assert.equal(f.player.play('jump'), null)
  f.ctx.state = 'running'
  assert.ok(f.player.play('jump'))
  settings.set('mute', true)
  try { assert.equal(f.player.play('land'), null) } finally { settings.set('mute', false) }
  f.player.dispose()
})
test('missing files and failed fetches are harmless and explicitly retryable', async t => {
  t.mock.method(console, 'warn', () => {})
  const f = fixture()
  assert.equal(await f.player.load('missing'), null)
  f.failure(true)
  assert.equal(await f.player.load('jump'), null)
  assert.equal(f.player.info().pending, 0)
  assert.equal(f.player.play('jump'), null)
  f.failure(false)
  assert.ok(await f.player.load('jump'))
  assert.deepEqual(f.counts(), { fetches: 2, decodes: 1 })
  f.player.dispose()
})
test('dispose during loading cannot reattach decoded resources or start playback', async () => {
  const f = fixture()
  const pending = f.player.load('jump')
  f.player.dispose()
  assert.equal(f.signal().aborted, true, 'disposal cancels the in-flight fetch')
  await pending
  assert.deepEqual(f.player.info(), { buffers: 0, pending: 0, voices: 0, pcmBytes: 0 })
  assert.equal(f.player.play('jump'), null)
})
test('every catalog asset exists as real RIFF PCM with non-silent samples', async () => {
  for (const [name, url] of Object.entries(SOUND_FILES)) {
    const bytes = await fs.readFile(url)
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', name)
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', name)
    assert.ok(bytes.length > 100, name)
    assert.ok(bytes.subarray(80).some(v => v !== 0), name)
  }
})

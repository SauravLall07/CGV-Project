import test from 'node:test'
import assert from 'node:assert/strict'
import { initAudio, getContext, getMasterGain, getAudioBus } from '../src/core/audio.js'
import { settings } from '../src/core/settings.js'
import { LevelMusicPlayer, startLevelMusic, stopLevelMusic, getMusicCacheInfo } from '../src/systems/level-music.js'

let fetchCount = 0, decodeCount = 0, fetchHandler, decodeHandler
const sources = [], gains = [], audible = new Set()
const buffer = () => ({ duration: 2, sampleRate: 48000, numberOfChannels: 2, length: 96000 })
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
const url = name => `https://fixture.invalid/${name}.mp3`
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

class FixtureAudioContext {
  state = 'running'; destination = {}
  createGain() {
    const gain = { gain: { value: 0 }, connect(destination) { this.destination = destination },
      disconnect() { this.disconnected = true } }
    gains.push(gain)
    return gain
  }
  createBufferSource() {
    const source = {
      connect(destination) { this.destination = destination },
      start() { this.starts = (this.starts ?? 0) + 1; audible.add(this) },
      stop() { this.stops = (this.stops ?? 0) + 1; audible.delete(this) },
      disconnect() { this.disconnected = true },
      end() { audible.delete(this); this.onended?.() }
    }
    sources.push(source)
    return source
  }
  decodeAudioData(...args) { return decodeHandler(...args) }
}

test.beforeEach(t => {
  fetchCount = 0; decodeCount = 0
  fetchHandler = async () => { fetchCount++; return response() }
  decodeHandler = (_data, resolve) => {
    decodeCount++
    const decoded = buffer()
    resolve(decoded)
    return Promise.resolve(decoded)
  }
  t.mock.method(globalThis, 'fetch', (...args) => fetchHandler(...args))
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
  t.after(() => stopLevelMusic())
})

test('music load before audio initialization fails without fetching and remains retryable after unlock', async t => {
  const player = new LevelMusicPlayer(url('before-unlock'))
  t.after(() => player.dispose())
  assert.equal(getContext(), null)
  await assert.rejects(player.load(), /initialize AudioContext/)
  assert.equal(fetchCount, 0)
  const previousWindow = globalThis.window
  try {
    globalThis.window = { AudioContext: FixtureAudioContext }
    initAudio()
  } finally { globalThis.window = previousWindow }
  assert.equal((await player.load()).duration, 2)
  assert.equal(fetchCount, 1)
})

test('overlapping music loads share one fetch/decode and expose detached PCM inventory', async t => {
  const gate = deferred(), track = url('overlap')
  fetchHandler = async () => { fetchCount++; await gate.promise; return response() }
  const players = Array.from({ length: 3 }, () => new LevelMusicPlayer(track))
  t.after(() => players.forEach(player => player.dispose()))
  const pending = players.map(player => player.load())
  assert.equal(fetchCount, 1)
  assert.deepEqual(getMusicCacheInfo().pendingUrls, [track])
  gate.resolve()
  const loaded = await Promise.all(pending)
  assert.ok(loaded.every(item => item === loaded[0]))
  assert.equal(decodeCount, 1)
  assert.equal(await players[0].load(), loaded[0])
  const cached = new LevelMusicPlayer(track); players.push(cached)
  assert.equal(await cached.load(), loaded[0])
  assert.equal(fetchCount, 1)
  const inventory = getMusicCacheInfo()
  const entry = inventory.tracks.find(item => item.url === track)
  assert.deepEqual(entry, { url: track, duration: 2, sampleRate: 48000, channels: 2, length: 96000, pcmBytes: 768000 })
  assert.equal(inventory.totalPcmBytes, inventory.tracks.reduce((sum, item) => sum + item.pcmBytes, 0))
  assert.deepEqual(inventory.pendingUrls, [])
  entry.pcmBytes = -1
  assert.equal(getMusicCacheInfo().tracks.find(item => item.url === track).pcmBytes, 768000)
})

test('shared HTTP failures clear pending state and retry with one fresh request', async t => {
  const track = url('http-retry'), players = [new LevelMusicPlayer(track), new LevelMusicPlayer(track)]
  t.after(() => players.forEach(player => player.dispose()))
  let fail = true
  fetchHandler = async () => { fetchCount++; return fail ? { ok: false, status: 503 } : response() }
  const failed = await Promise.allSettled(players.map(player => player.load()))
  assert.ok(failed.every(item => item.status === 'rejected' && /503/.test(item.reason.message)))
  assert.equal(fetchCount, 1)
  assert.equal(decodeCount, 0)
  assert.ok(!getMusicCacheInfo().pendingUrls.includes(track))
  assert.ok(!getMusicCacheInfo().tracks.some(item => item.url === track))
  fail = false
  const loaded = await Promise.all(players.map(player => player.load()))
  assert.equal(loaded[0], loaded[1])
  assert.equal(fetchCount, 2)
  assert.equal(decodeCount, 1)
})

test('decode rejection is retryable, including callback-only and promise-only decoder APIs', async t => {
  const track = url('decode-retry'), players = [new LevelMusicPlayer(track), new LevelMusicPlayer(track)]
  t.after(() => players.forEach(player => player.dispose()))
  decodeHandler = () => { decodeCount++; return Promise.reject(new Error('bad audio')) }
  const failed = await Promise.allSettled(players.map(player => player.load()))
  assert.ok(failed.every(item => item.status === 'rejected' && /bad audio/.test(item.reason.message)))
  assert.equal(decodeCount, 1)
  assert.ok(!getMusicCacheInfo().pendingUrls.includes(track))
  decodeHandler = (_data, success) => { decodeCount++; success(buffer()) }
  await players[0].load()
  assert.equal(decodeCount, 2)
  decodeHandler = () => { decodeCount++; return Promise.resolve(buffer()) }
  const promiseOnly = new LevelMusicPlayer(url('promise-only')); players.push(promiseOnly)
  assert.equal((await promiseOnly.load()).length, 96000)
})

test('disposing one pending player preserves the shared load and cannot reattach its buffer or play', async t => {
  const gate = deferred(), track = url('disposed-owner')
  fetchHandler = async () => { fetchCount++; await gate.promise; return response() }
  const disposed = new LevelMusicPlayer(track), survivor = new LevelMusicPlayer(track)
  t.after(() => { disposed.dispose(); survivor.dispose() })
  const pending = [disposed.load(), survivor.load()]
  disposed.dispose()
  gate.resolve()
  await Promise.all(pending)
  assert.equal(disposed.buffer, null)
  assert.ok(survivor.buffer)
  assert.equal(fetchCount, 1)
  assert.equal(decodeCount, 1)
  assert.equal(await disposed.load(), null)
  const started = sources.length
  await disposed.playWhenReady()
  assert.equal(sources.length, started)
  await survivor.playWhenReady({ loop: true, volume: 0.2 })
  assert.equal(sources.length, started + 1)
  assert.equal(audible.size, 1)
  survivor.dispose()
  assert.equal(audible.size, 0)
})

test('rapid menu/level/menu requests preserve latest playback intent with one live source', async () => {
  const menu = url('rapid-menu'), level = url('rapid-level')
  const gates = new Map([[menu, deferred()], [level, deferred()]])
  fetchHandler = async address => { fetchCount++; await gates.get(String(address)).promise; return response() }
  const first = startLevelMusic(menu)
  const second = startLevelMusic(level)
  const third = startLevelMusic(menu, { loop: true, volume: 0.3 })
  assert.equal(fetchCount, 2, 'two distinct tracks, not three overlapping requests')
  const started = sources.length
  gates.get(level).resolve(); await second
  assert.equal(sources.length, started, 'superseded level load cannot start')
  gates.get(menu).resolve(); await Promise.all([first, third])
  assert.equal(sources.length, started + 1)
  assert.equal(audible.size, 1)
  assert.equal(sources.at(-1).loop, true)
  assert.equal(sources.at(-1).destination.gain.value, 0.3)
  stopLevelMusic()
  assert.equal(audible.size, 0)
  assert.equal(sources.at(-1).disconnected, true)
  assert.equal(sources.at(-1).destination.disconnected, true)
})

test('one-shot music retains loop/volume and master mute routing through completion and stop', async t => {
  const mute = settings.get('mute'), volume = settings.get('masterVolume')
  t.after(() => { settings.set('masterVolume', volume); settings.set('mute', mute) })
  await startLevelMusic(url('one-shot'), { loop: false, volume: 0.4 })
  const source = sources.at(-1), master = getMasterGain()
  assert.equal(source.loop, false)
  assert.equal(source.starts, 1)
  assert.equal(source.destination.gain.value, 0.4)
  assert.equal(source.destination.destination, getAudioBus('music'))
  assert.equal(getAudioBus('music').destination.destination, master)
  settings.set('mute', true); assert.equal(master.gain.value, 0)
  settings.set('masterVolume', 0.23); assert.equal(master.gain.value, 0)
  settings.set('mute', false); assert.equal(master.gain.value, 0.23)
  source.end()
  assert.equal(audible.size, 0)
  stopLevelMusic()
  assert.equal(source.disconnected, true)
  assert.equal(source.destination.disconnected, true)
})

test('active load failures remain observable and a later start can retry', async () => {
  const track = url('active-failure')
  fetchHandler = async () => { fetchCount++; return { ok: false, status: 404 } }
  await startLevelMusic(track)
  assert.equal(console.error.mock.callCount(), 1)
  assert.equal(audible.size, 0)
  fetchHandler = async () => { fetchCount++; return response() }
  await startLevelMusic(track)
  assert.equal(fetchCount, 2)
  assert.equal(audible.size, 1)
})

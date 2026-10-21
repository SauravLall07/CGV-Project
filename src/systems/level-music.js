import { getContext, getMusicGain } from '../core/audio.js'

// Sampled level music, separate from the procedural drone in music-system.js.
// Tracks live under src/assets/audio/music/ and are resolved with
// `new URL(..., import.meta.url)` so Vite fingerprints them and the path
// stays relative — same contract as the Draco decoder in core/assets.js
// (vite base: './', subdirectory-safe).
//
// Only one LevelMusicPlayer is ever audible: startLevelMusic() disposes the
// previous player (and cancels its playback intent) before starting the next.
// Shared in-flight loads may finish for another player or the decoded cache.

// Static URLs so Vite's `new URL` analysis actually emits the files into dist.
// loadTrack() looks the filename up in this catalog.
const TRACK_FILES = {
  'menu-theme.mp3': new URL('../assets/audio/music/menu-theme.mp3', import.meta.url),
  'level1-constance.mp3': new URL('../assets/audio/music/level1-constance.mp3', import.meta.url),
  'level2-mistake-the-getaway.mp3': new URL('../assets/audio/music/level2-mistake-the-getaway.mp3', import.meta.url),
  'level3-final-count.mp3': new URL('../assets/audio/music/level3-final-count.mp3', import.meta.url),
  'victory-theme.mp3': new URL('../assets/audio/music/victory-theme.mp3', import.meta.url)
}

// `relativePath` is from this file, e.g. '../assets/audio/music/level1-constance.mp3'
export function loadTrack(relativePath) {
  const name = String(relativePath).split('/').pop()
  const url = TRACK_FILES[name]
  if (!url) throw new Error(`[level-music] unknown track "${relativePath}"`)
  return url
}

const bufferCache = new Map()
const pendingBuffers = new Map()
let nextPlayerId = 1
let livePlayers = 0
let liveSources = 0

function musicTs() {
  return `${new Date().toISOString()} t=${performance.now().toFixed(1)}`
}

function decodeAudioData(ctx, data) {
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject)
    if (result && typeof result.then === 'function') result.then(resolve, reject)
  })
}

function loadBuffer(url) {
  const key = String(url)
  if (bufferCache.has(key)) return Promise.resolve(bufferCache.get(key))
  if (pendingBuffers.has(key)) return pendingBuffers.get(key)
  const ctx = getContext()
  if (!ctx) return Promise.reject(new Error('[level-music] initialize AudioContext before loading music'))

  const pending = (async () => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`[level-music] failed to fetch ${url} (${response.status})`)
    const buffer = await decodeAudioData(ctx, await response.arrayBuffer())
    bufferCache.set(key, buffer)
    return buffer
  })().finally(() => {
    // Failures are retryable. Disposing one playback owner never cancels a
    // shared fetch/decode still needed by another owner.
    if (pendingBuffers.get(key) === pending) pendingBuffers.delete(key)
  })
  pendingBuffers.set(key, pending)
  return pending
}

// On-demand diagnostic snapshot. No AudioBuffer/node references escape and
// no per-frame work is added. PCM bytes describe decoded samples, not MP3 size.
export function getMusicCacheInfo() {
  const tracks = [...bufferCache].map(([url, buffer]) => ({
    url, duration: buffer.duration, sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels, length: buffer.length,
    pcmBytes: buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
  }))
  return { tracks, pendingUrls: [...pendingBuffers.keys()],
    totalPcmBytes: tracks.reduce((sum, track) => sum + track.pcmBytes, 0) }
}

export class LevelMusicPlayer {
  constructor(url) {
    this.id = nextPlayerId++
    this.url = url
    this.buffer = null
    this.source = null
    this.gain = null
    this._disposed = false
    livePlayers += 1
    console.log(
      `[music ${musicTs()}] LevelMusicPlayer#${this.id} CONSTRUCT livePlayers=${livePlayers} liveSources=${liveSources} url=${String(url)}`
    )
  }

  async load() {
    if (this._disposed) return null
    if (this.buffer) return this.buffer
    const buffer = await loadBuffer(this.url)
    // A superseded player must not reacquire a buffer after dispose cleared it.
    if (!this._disposed) this.buffer = buffer
    return buffer
  }

  // Always wait for decode before starting playback. play() itself is a
  // no-op while `buffer` is still null, which is what made the menu theme
  // silent on the first visit (load still in flight) and fine on the second
  // (buffer already cached).
  async playWhenReady(opts) {
    if (this._disposed) return
    await this.load()
    if (this._disposed) return
    this.play(opts)
  }

  play({ loop = true, volume = 0.5 } = {}) {
    if (this._disposed || !this.buffer) return

    this.stop()

    const ctx = getContext()
    const master = getMusicGain()

    this.gain = ctx.createGain()
    // Level 1's soundtrack is intentionally 10% of its original loudness.
    // The Music Volume slider still controls 0–100% of this reduced ceiling.
    const levelOneTrack = String(this.url).includes('level1-constance')
    this.gain.gain.value = volume * (levelOneTrack ? 0.1 : 1)
    this.gain.connect(master)

    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.loop = loop
    this.source.connect(this.gain)
    this.source.start()
    liveSources += 1
    console.log(
      `[music ${musicTs()}] LevelMusicPlayer#${this.id} SOURCE START livePlayers=${livePlayers} liveSources=${liveSources}`
    )
  }

  stop() {
    if (this.source) {
      try { this.source.stop() } catch { /* already stopped */ }
      this.source.disconnect()
      this.source = null
      liveSources = Math.max(0, liveSources - 1)
      console.log(
        `[music ${musicTs()}] LevelMusicPlayer#${this.id} SOURCE STOP livePlayers=${livePlayers} liveSources=${liveSources}`
      )
    }
    if (this.gain) {
      this.gain.disconnect()
      this.gain = null
    }
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    this.stop()
    this.buffer = null
    livePlayers = Math.max(0, livePlayers - 1)
    console.log(
      `[music ${musicTs()}] LevelMusicPlayer#${this.id} DISPOSE livePlayers=${livePlayers} liveSources=${liveSources}`
    )
  }
}

let active = null
let token = 0

export function stopLevelMusic() {
  token += 1
  console.log(
    `[music ${musicTs()}] stopLevelMusic token=${token} active=${active ? '#' + active.id : 'none'} livePlayers=${livePlayers}`
  )
  if (active) {
    active.dispose()
    active = null
  }
}

export async function startLevelMusic(url, opts = {}) {
  const myToken = ++token
  console.log(
    `[music ${musicTs()}] startLevelMusic begin token=${myToken} url=${String(url)} prevActive=${active ? '#' + active.id : 'none'}`
  )
  if (active) {
    active.dispose()
    active = null
  }

  const player = new LevelMusicPlayer(url)
  active = player

  try {
    await player.load()
  } catch (err) {
    // Superseded by another start/stop (NEW GAME mid-load) — not an error.
    if (myToken !== token || player._disposed) {
      player.dispose()
      if (active === player) active = null
      return
    }
    console.error(err)
    player.dispose()
    if (active === player) active = null
    return
  }

  if (myToken !== token || player._disposed) {
    console.log(
      `[music ${musicTs()}] startLevelMusic SKIP play LevelMusicPlayer#${player.id} myToken=${myToken} token=${token} disposed=${player._disposed}`
    )
    player.dispose()
    if (active === player) active = null
    return
  }

  const ctx = getContext()
  const buffer = player.buffer
  console.log(
    `[music ${musicTs()}] startLevelMusic play LevelMusicPlayer#${player.id} context=${ctx ? ctx.state : 'none'} duration=${buffer ? buffer.duration : 'none'}`
  )
  player.play(opts)
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log(`[music ${musicTs()}] HMR dispose level-music (stopping active player)`)
    stopLevelMusic()
  })
}

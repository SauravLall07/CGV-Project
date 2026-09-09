import { getContext, getMasterGain } from '../core/audio.js'

// Sampled level music, separate from the procedural drone in music-system.js.
// Tracks live under src/assets/audio/music/ and are resolved with
// `new URL(..., import.meta.url)` so Vite fingerprints them and the path
// stays relative — same contract as the Draco decoder in core/assets.js
// (vite base: './', subdirectory-safe).
//
// Only one LevelMusicPlayer is ever audible: startLevelMusic() disposes the
// previous player (and cancels an in-flight load) before starting the next.

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

function decodeAudioData(ctx, data) {
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject)
    if (result && typeof result.then === 'function') result.then(resolve, reject)
  })
}

export class LevelMusicPlayer {
  constructor(url) {
    this.url = url
    this.buffer = null
    this.source = null
    this.gain = null
    this._disposed = false
  }

  async load() {
    if (this.buffer) return this.buffer

    const key = String(this.url)
    if (bufferCache.has(key)) {
      this.buffer = bufferCache.get(key)
      return this.buffer
    }

    const ctx = getContext()
    const response = await fetch(this.url)
    if (!response.ok) {
      throw new Error(`[level-music] failed to fetch ${this.url} (${response.status})`)
    }
    const data = await response.arrayBuffer()
    this.buffer = await decodeAudioData(ctx, data)
    bufferCache.set(key, this.buffer)
    return this.buffer
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
    const master = getMasterGain()

    this.gain = ctx.createGain()
    this.gain.gain.value = volume
    this.gain.connect(master)

    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.loop = loop
    this.source.connect(this.gain)
    this.source.start()
  }

  stop() {
    if (this.source) {
      try { this.source.stop() } catch { /* already stopped */ }
      this.source.disconnect()
      this.source = null
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
  }
}

let active = null
let token = 0

export function stopLevelMusic() {
  token += 1
  if (active) {
    active.dispose()
    active = null
  }
}

export async function startLevelMusic(url, opts = {}) {
  const myToken = ++token
  console.log('startLevelMusic begin', String(url), 'token', myToken)
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
    if (myToken !== token || player._disposed) return
    console.error(err)
    if (active === player) active = null
    return
  }

  if (myToken !== token) {
    console.log('startLevelMusic: token mismatch, skipping play() (myToken ' + myToken + ', token ' + token + ')')
    player.stop()
    return
  }

  const ctx = getContext()
  const buffer = player.buffer
  console.log('startLevelMusic play() context state: ' + (ctx ? ctx.state : 'none'))
  console.log('startLevelMusic buffer duration: ' + (buffer ? buffer.duration : 'none') + ', length: ' + (buffer ? buffer.length : 'none') + ', sampleRate: ' + (buffer ? buffer.sampleRate : 'none'))
  player.play(opts)
}

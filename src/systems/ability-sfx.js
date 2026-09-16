import { getContext, getMasterGain } from '../core/audio.js'

// Sampled chrono ability cues, separate from MusicSystem's ambient whoosh.
// Files live under src/assets/audio/sfx/ and are resolved with
// `new URL(..., import.meta.url)` so Vite fingerprints them — same
// contract as level-music.js. One-shots fire through a dedicated bus
// into the shared master gain. preloadAbilitySfx() decodes all four
// buffers once AudioContext exists, so the first ability press is not
// waiting on fetch.

const SFX_BUS_GAIN = 0.85

const SFX_FILES = {
  SLOW: new URL('../assets/audio/sfx/sfx-slow.wav', import.meta.url),
  FREEZE: new URL('../assets/audio/sfx/sfx-freeze.wav', import.meta.url),
  REWIND: new URL('../assets/audio/sfx/sfx-rewind.wav', import.meta.url),
  GHOST: new URL('../assets/audio/sfx/sfx-ghost.wav', import.meta.url)
}

const buffers = {
  SLOW: null,
  FREEZE: null,
  REWIND: null,
  GHOST: null
}

let bus = null
let preloadPromise = null

function getBus() {
  const ctx = getContext()
  const master = getMasterGain()
  if (!ctx || !master) return null
  if (!bus) {
    bus = ctx.createGain()
    bus.gain.value = SFX_BUS_GAIN
    bus.connect(master)
  }
  return { ctx, bus }
}

function decodeAudioData(ctx, data) {
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject)
    if (result && typeof result.then === 'function') result.then(resolve, reject)
  })
}

async function loadBuffer(kind) {
  if (buffers[kind]) return buffers[kind]
  const ctx = getContext()
  if (!ctx) return null
  const url = SFX_FILES[kind]
  const label = `ability-sfx:decode:${kind}`
  console.time(label)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[ability-sfx] failed to fetch ${url} (${response.status})`)
  }
  const data = await response.arrayBuffer()
  buffers[kind] = await decodeAudioData(ctx, data)
  console.timeEnd(label)
  console.log(
    `[ability-sfx] preloaded ${kind} duration=${buffers[kind].duration.toFixed(3)}s channels=${buffers[kind].numberOfChannels} bytes=${data.byteLength}`
  )
  return buffers[kind]
}

export function preloadAbilitySfx() {
  const ctx = getContext()
  if (!ctx) {
    console.warn('[ability-sfx] preload skipped — no AudioContext yet')
    return Promise.resolve()
  }
  if (preloadPromise) return preloadPromise
  console.log('[ability-sfx] preload start')
  preloadPromise = Promise.all(Object.keys(SFX_FILES).map((kind) => loadBuffer(kind)))
    .then((loaded) => {
      const ready = Object.keys(SFX_FILES).filter((kind) => buffers[kind])
      const missing = Object.keys(SFX_FILES).filter((kind) => !buffers[kind])
      console.log(
        `[ability-sfx] preload finished ready=[${ready.join(', ')}] missing=[${missing.join(', ') || 'none'}] count=${loaded.filter(Boolean).length}/4`
      )
    })
    .catch((err) => {
      preloadPromise = null
      const ready = Object.keys(SFX_FILES).filter((kind) => buffers[kind])
      console.error('[ability-sfx] preload failed', err, 'ready so far', ready)
    })
  return preloadPromise
}

function playShot(kind) {
  const io = getBus()
  const buffer = buffers[kind]
  if (!io || !buffer) return
  const { ctx, bus: out } = io
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = false
  source.connect(out)
  source.start()
  source.onended = () => {
    try { source.disconnect() } catch { /* already gone */ }
  }
}

export function playAbilitySfx(kind) {
  if (!SFX_FILES[kind]) return
  const timed = kind === 'GHOST'
  if (timed) console.time('ability-sfx:GHOST')

  if (buffers[kind]) {
    console.log(`[ability-sfx] ${kind} cache HIT duration=${buffers[kind].duration.toFixed(3)}s`)
    playShot(kind)
    if (timed) console.timeEnd('ability-sfx:GHOST')
    return
  }

  console.warn(`[ability-sfx] ${kind} cache MISS — decoding lazily (this can hitch)`)
  preloadAbilitySfx().then(() => {
    playShot(kind)
    if (timed) console.timeEnd('ability-sfx:GHOST')
  })
}

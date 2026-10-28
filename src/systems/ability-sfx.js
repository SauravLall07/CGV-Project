import { getContext, getSfxGain } from '../core/audio.js'

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
const pending = new Set()

function getBus() {
  const ctx = getContext()
  const master = getSfxGain()
  if (!ctx || !master) return null
  if (!bus) {
    bus = ctx.createGain()
    bus.gain.value = SFX_BUS_GAIN
    bus.connect(master)
  }
  return { ctx, bus }
}

function decodeAudioData(ctx, data) {
  // Modern promise form avoids resolving the same decode both via callbacks and a promise.
  return ctx.decodeAudioData(data)
}

async function loadBuffer(kind) {
  if (buffers[kind]) return buffers[kind]
  const ctx = getContext()
  if (!ctx) return null
  const url = SFX_FILES[kind]
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[ability-sfx] failed to fetch ${url} (${response.status})`)
  }
  const data = await response.arrayBuffer()
  buffers[kind] = await decodeAudioData(ctx, data)
  return buffers[kind]
}

export function preloadAbilitySfx() {
  const ctx = getContext()
  if (!ctx) return Promise.resolve()
  if (preloadPromise) return preloadPromise
  preloadPromise = Promise.allSettled(Object.keys(SFX_FILES).map((kind) => loadBuffer(kind)))
    .then((results) => {
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') console.warn('[ability-sfx] Could not load', Object.keys(SFX_FILES)[index], result.reason)
      }
    })
    .finally(() => { preloadPromise = null })
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
  // Rewind is intentionally a little quieter than the other Chrono cues.
  if (kind === 'REWIND') {
    const rewindGain = ctx.createGain()
    rewindGain.gain.value = 0.68
    source.connect(rewindGain).connect(out)
    source.onended = () => { try { source.disconnect(); rewindGain.disconnect() } catch {} }
  } else {
    source.connect(out)
    source.onended = () => { try { source.disconnect() } catch {} }
  }
  source.start()
}

export function playAbilitySfx(kind) {
  if (!Object.prototype.hasOwnProperty.call(SFX_FILES, kind)) return
  if (buffers[kind]) {
    const ctx = getContext()
    if (ctx?.state === 'suspended') { void ctx.resume().then(() => playShot(kind)).catch(console.warn); return }
    playShot(kind)
    return
  }
  // Never lose the first activation while a clip is still loading. Loading is
  // independent for each ability, so a failed file cannot block the other three.
  if (pending.has(kind)) return
  pending.add(kind)
  const ctx = getContext()
  if (!ctx) { pending.delete(kind); return }
  loadBuffer(kind).then(() => {
    if (ctx.state === 'suspended') return ctx.resume().then(() => playShot(kind))
    playShot(kind)
  }).catch((error) => {
    console.warn(`[ability-sfx] ${kind} could not play`, error)
  }).finally(() => pending.delete(kind))
}

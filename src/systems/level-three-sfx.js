import { getContext, getSfxGain } from '../core/audio.js'

// All voices use the shared SFX bus, so settings mute/master/SFX sliders apply.
const files = {
  train: new URL('../assets/audio/sfx/level2/train.mp3', import.meta.url),
  laser: new URL('../assets/audio/sfx/security/laser-hum.mp3', import.meta.url),
  contact: new URL('../assets/audio/sfx/security/laser-contact.mp3', import.meta.url),
  whoosh: new URL('../assets/audio/sfx/level3/lethal-debris-whoosh.mp3', import.meta.url)
}
const buffers = new Map(), loads = new Map()
function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (loads.has(name)) return loads.get(name)
  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)
  const job = fetch(files[name]).then(r => {
    if (!r.ok) throw new Error(`Level 3 ${name}: ${r.status}`)
    return r.arrayBuffer()
  }).then(b => ctx.decodeAudioData(b)).then(buffer => {
    buffers.set(name, buffer); return buffer
  }).catch(error => { console.warn('[level-three-sfx]', error); return null })
    .finally(() => loads.delete(name))
  loads.set(name, job)
  return job
}

export function createLevelThreeSfx() {
  let disposed = false, paused = false, generation = 0, lastWhoosh = -Infinity
  const loops = new Map(), shots = new Set()
  function stopLoop(entry) {
    if (!entry) return
    try { entry.source.stop() } catch { /* already stopped */ }
    entry.source.disconnect(); entry.gain.disconnect()
  }
  function ensureLoop(name) {
    if (disposed || paused || loops.has(name)) return
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
    if (!ctx || ctx.state !== 'running' || !bus || !buffer) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer; source.loop = true; gain.gain.value = 0
    source.connect(gain).connect(bus); source.start()
    loops.set(name, { source, gain, ctx })
  }
  function preload() {
    if (disposed || !getContext()) return
    const id = generation
    Object.keys(files).forEach(name => { void load(name).then(() => {
      if (!disposed && id === generation && (name === 'train' || name === 'laser')) ensureLoop(name)
    }) })
  }
  function oneShot(name, volume, rate = 1) {
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
    if (disposed || paused || !ctx || ctx.state !== 'running' || !bus || !buffer) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer; source.playbackRate.value = rate; gain.gain.value = volume
    source.connect(gain).connect(bus)
    const voice = { source, gain }; shots.add(voice)
    source.onended = () => { shots.delete(voice); source.disconnect(); gain.disconnect() }
    source.start()
  }
  return {
    preload,
    update({ laserDistance = Infinity, moving = true, frozen = false, stopped = false } = {}) {
      if (disposed) return
      if (!buffers.has('train') || !buffers.has('laser')) preload()
      ensureLoop('train'); ensureLoop('laser')
      const ctx = getContext()
      if (!ctx) return
      const train = loops.get('train'), laser = loops.get('laser')
      const trainLevel = paused || stopped ? 0 : moving ? 0.20 : 0.055
      if (train) train.gain.gain.setTargetAtTime(trainLevel, ctx.currentTime, 0.12)
      const proximity = Math.max(0, 1 - Math.max(0, laserDistance - 1.3) / 9)
      if (laser) laser.gain.gain.setTargetAtTime(paused || stopped ? 0 : 0.15 * proximity, ctx.currentTime, 0.1)
      // Time Freeze affects hazard motion; the underlying train remains audible.
    },
    laserHit() { oneShot('contact', 0.2) },
    lethalFlight(distance, speed) {
      const ctx = getContext()
      if (!ctx || paused || disposed || distance > 12 || speed < 0.1) return
      // Multiple lethal panels can arrive together; keep the mix bounded.
      if (!buffers.has('whoosh')) { void load('whoosh'); return }
      if (ctx.currentTime - lastWhoosh < 0.13) return
      lastWhoosh = ctx.currentTime
      const falloff = Math.max(0, 1 - distance / 12)
      oneShot('whoosh', (0.14 + 0.17 * falloff) * falloff, Math.min(1.5, Math.max(0.65, speed / 7)))
    },
    setPaused(value) {
      paused = !!value
      const ctx = getContext()
      if (ctx) for (const entry of loops.values()) entry.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04)
    },
    reset() {
      generation++; lastWhoosh = -Infinity
      for (const voice of shots) { try { voice.source.stop() } catch {} }
      shots.clear()
    },
    dispose() {
      disposed = true; generation++
      this.reset()
      for (const entry of loops.values()) stopLoop(entry)
      loops.clear()
    }
  }
}

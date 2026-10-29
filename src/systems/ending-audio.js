import { getContext, getSfxGain } from '../core/audio.js'

// Dedicated finale soundtrack. Recorded cues replace all procedural oscillators/noise.
// The Level 3 lever cinematic is a separate sequence and is not modified here.
const urls = {
  horn: new URL('../assets/audio/sfx/level3/ending-train-horn.mp3', import.meta.url),
  brakes: new URL('../assets/audio/sfx/level3/ending-train-screech.mp3', import.meta.url),
  doors: new URL('../assets/audio/sfx/level2/metal-door-open.mp3', import.meta.url),
  explosion: new URL('../assets/audio/sfx/level3/ending-explosion.mp3', import.meta.url)
}
const cache = new Map()
const loading = new Map()
function load(kind, ctx) {
  if (cache.has(kind)) return Promise.resolve(cache.get(kind))
  if (loading.has(kind)) return loading.get(kind)
  const p = fetch(urls[kind]).then(r => {
    if (!r.ok) throw new Error(`${kind}: HTTP ${r.status}`)
    return r.arrayBuffer()
  }).then(data => ctx.decodeAudioData(data)).then(buffer => {
    cache.set(kind, buffer)
    return buffer
  }).catch(error => {
    console.warn('[ending audio]', error)
    return null
  }).finally(() => loading.delete(kind))
  loading.set(kind, p)
  return p
}
export function createEndingAudio({ context = getContext, output = getSfxGain } = {}) {
  let disposed = false
  const sources = new Set()
  const scheduled = new Set()
  // Start preloading as soon as the ending scene is constructed.
  const ctx = context()
  if (ctx) for (const name of Object.keys(urls)) void load(name, ctx)

  function play(kind, volume, offset = 0, delay = 0) {
    if (disposed) return
    const token = { cancelled: false }
    scheduled.add(token)
    const audioCtx = context()
    if (!audioCtx) return
    void load(kind, audioCtx).then(buffer => {
      scheduled.delete(token)
      if (disposed || token.cancelled || !buffer) return
      const bus = output()
      if (!bus) return
      const source = audioCtx.createBufferSource()
      const gain = audioCtx.createGain()
      source.buffer = buffer
      gain.gain.value = volume
      source.connect(gain).connect(bus)
      const start = () => {
        if (disposed || token.cancelled) { source.disconnect(); gain.disconnect(); return }
        sources.add(source)
        source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect() }
        try { source.start(audioCtx.currentTime + delay, Math.min(offset, Math.max(0, buffer.duration - 0.03))) }
        catch (error) { console.warn('[ending audio playback]', kind, error); sources.delete(source); source.disconnect(); gain.disconnect() }
      }
      if (audioCtx.state === 'suspended') void audioCtx.resume().then(start).catch(() => { source.disconnect(); gain.disconnect() })
      else start()
    })
  }

  return {
    // Horn starts with the train's visible braking phase; screech enters as it builds.
    braking() { play('horn', 0.65, 1.15); play('brakes', 0.82, 0, 0.95) },
    door() { play('doors', 0.62) },
    // Skip source silence so the explosive transient lands on the visual blast.
    explosion() { play('explosion', 0.88, 0.75) },
    // Compatibility with older ending code/tests; no synthetic cues.
    throw() {}, impact() {}, fadeOut() {}, update() {},
    get active() { return sources.size > 0 },
    get voiceCount() { return sources.size },
    stop() { for (const t of scheduled) t.cancelled = true; scheduled.clear(); for (const s of sources) { try { s.stop() } catch {} s.disconnect() } sources.clear() },
    dispose() { disposed = true; this.stop() }
  }
}

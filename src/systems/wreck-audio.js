import { getContext, getSfxGain } from '../core/audio.js'

// L3-owned procedural machinery. No samples/attribution or wall-clock timers.
// The mechanical bed hushes in stasis; warnings bypass that bed gain. All
// voices still pass through the existing mute/master-volume graph.
export function createWreckAudio({ context = getContext, output = getSfxGain } = {}) {
  let bus = null
  let bed = null
  let brakeVoice = null
  let settled = false
  let paused = false
  let disposed = false
  let debrisVoice = null
  const voices = new Set()
  function connect() {
    const ctx = context(), master = output()
    if (disposed || !ctx || !master || ctx.state !== 'running') return null
    if (!bus) { bus = ctx.createGain(); bus.gain.value = paused ? 0 : 1; bus.connect(master) }
    return ctx
  }
  function tone(ctx, frequency, endFrequency, duration, volume, type, destination = bus) {
    const source = ctx.createOscillator(), gain = ctx.createGain()
    const voice = { source, gain }
    source.type = type
    source.frequency.setValueAtTime(frequency, ctx.currentTime)
    if (duration !== null) source.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + duration)
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    if (duration !== null) gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    source.connect(gain).connect(destination)
    source.onended = () => { source.disconnect(); gain.disconnect(); voices.delete(voice) }
    voices.add(voice)
    source.start()
    if (duration !== null) source.stop(ctx.currentTime + duration)
    return voice
  }
  function clear() {
    for (const { source, gain } of voices) {
      source.onended = null
      try { source.stop() } catch { /* already ended */ }
      source.disconnect(); gain.disconnect()
    }
    voices.clear()
    bed?.disconnect(); bed = null
    brakeVoice = null; settled = false
    debrisVoice = null
    bus?.disconnect(); bus = null
  }
  return {
    debris(kind) {
      const ctx = connect()
      if (!ctx || paused || (debrisVoice && voices.has(debrisVoice))) return
      const frequency = kind === 'convergence' ? 175 : kind === 'cargo' ? 110 : 240
      debrisVoice = tone(ctx, frequency, 45, 0.3, 0.018, 'triangle')
    },
    snap() {
      const ctx = connect()
      if (ctx && !paused) {
        tone(ctx, 1350, 180, 0.09, 0.045, 'sawtooth')
        tone(ctx, 260, 65, 0.16, 0.055, 'triangle')
      }
    },
    warning() {
      const ctx = connect()
      if (ctx && !paused) tone(ctx, 640, 420, 0.22, 0.075, 'triangle')
    },
    brake() {
      const ctx = connect()
      if (ctx && !paused) tone(ctx, 95, 38, 0.18, 0.09, 'triangle')
    },
    update(active, stasis, brakeSeconds = null) {
      const ctx = active ? connect() : null
      if (!ctx) return
      if (!bed) {
        bed = ctx.createGain(); bed.gain.value = 0; bed.connect(bus)
        tone(ctx, 42, 42, null, 0.7, 'triangle', bed)
        tone(ctx, 67, 67, null, 0.3, 'sine', bed)
      }
      const motion = brakeSeconds === null ? 1 : Math.max(0, 1 - brakeSeconds / 2.5)
      bed.gain.setTargetAtTime(stasis ? 0.0005 : 0.045 * motion, ctx.currentTime, 0.04)
      if (brakeSeconds !== null) {
        if (!brakeVoice && motion > 0) brakeVoice = tone(ctx, 180, 180, null, 0, 'sawtooth')
        if (brakeVoice) {
          brakeVoice.source.frequency.setTargetAtTime(32 + 148 * motion, ctx.currentTime, 0.04)
          brakeVoice.gain.gain.setTargetAtTime(0.065 * motion, ctx.currentTime, 0.04)
        }
        if (motion === 0 && !settled) {
          settled = true
          if (!paused) tone(ctx, 76, 38, 0.2, 0.06, 'sine')
        }
      }
    },
    setPaused(value) {
      paused = value
      if (bus) bus.gain.value = value ? 0 : 1
    },
    reset: clear,
    dispose() { disposed = true; clear() }
  }
}

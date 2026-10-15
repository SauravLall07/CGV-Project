import { getContext, getMasterGain } from '../core/audio.js'

// Two bounded L3 voices, created lazily after audio unlock. No gameplay timers.
export function createWreckHazardAudio({ context = getContext, output = getMasterGain } = {}) {
  let bus, creak, hiss, paused = false, disposed = false
  function release(voice) {
    if (!voice) return
    try { voice.source.stop() } catch { /* already stopped */ }
    voice.source.disconnect(); voice.gain.disconnect(); voice.filter?.disconnect()
  }
  function reset() {
    release(creak); release(hiss); creak = hiss = null
    bus?.disconnect(); bus = null
  }
  function gain(ctx) { const g = ctx.createGain(); g.gain.value = 0; g.connect(bus); return g }
  return {
    update(freight, steam) {
      if (disposed) return
      const ctx = context(), master = output()
      if (!ctx || !master || ctx.state !== 'running') return
      if (!bus && (freight || steam)) { bus = ctx.createGain(); bus.gain.value = paused ? 0 : 1; bus.connect(master) }
      if (!bus) return
      if (freight && !creak) {
        const source = ctx.createOscillator(), volume = gain(ctx)
        source.type = 'triangle'; source.frequency.value = 82
        source.connect(volume); source.start(); creak = { source, gain: volume }
      }
      if (steam && !hiss) {
        const source = ctx.createBufferSource(), volume = gain(ctx), filter = ctx.createBiquadFilter()
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate)
        const data = buffer.getChannelData(0)
        let seed = 481
        for (let i = 0; i < data.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1 }
        source.buffer = buffer; source.loop = true; filter.type = 'bandpass'; filter.frequency.value = 1800
        source.connect(filter).connect(volume); source.start(); hiss = { source, gain: volume, filter }
      }
      creak?.gain.gain.setTargetAtTime(0.035 * freight, ctx.currentTime, 0.04)
      hiss?.gain.gain.setTargetAtTime(0.085 * steam, ctx.currentTime, 0.04)
    },
    setPaused(value) { paused = value; if (bus) bus.gain.value = value ? 0 : 1 },
    reset,
    dispose() { disposed = true; reset() }
  }
}

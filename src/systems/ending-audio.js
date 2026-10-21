import { getContext, getMasterGain } from '../core/audio.js'

// Uses the shared gesture-unlocked context and settings-controlled master bus.
// No AudioContext is created here, including in Node tests.
export function createEndingAudio({ context = getContext, output = getMasterGain } = {}) {
  let graph = null, disposed = false, stopped = false, tail = -1
  function stop() {
    stopped = true
    if (!graph) return
    graph.bus.gain.cancelScheduledValues(graph.ctx.currentTime)
    graph.bus.gain.value = 0
    for (const source of graph.sources) {
      try { source.stop() } catch { /* A scheduled source may already have ended. */ }
      source.disconnect()
    }
    for (const node of graph.nodes) node.disconnect()
    graph = null; tail = -1
  }
  function start() {
    const ctx = context(), master = output()
    if (disposed || stopped || graph || !ctx || !master || ctx.state !== 'running') return
    const bus = ctx.createGain(), sources = [], nodes = [bus], tones = []
    bus.gain.value = 0; bus.connect(master)
    const vibrato = ctx.createOscillator(), vibratoGain = ctx.createGain()
    vibrato.frequency.value = 6.3; vibratoGain.gain.value = 13
    vibrato.connect(vibratoGain); sources.push(vibrato); nodes.push(vibratoGain)
    for (let i = 0; i < 3; i++) {
      const oscillator = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
      oscillator.type = i === 1 ? 'square' : 'sawtooth'
      oscillator.frequency.value = 710 + i * 23; oscillator.detune.value = (i - 1) * 11
      filter.type = 'bandpass'; filter.frequency.value = 2400 + i * 480; filter.Q.value = 7
      gain.gain.value = 0.018
      vibratoGain.connect(oscillator.frequency); oscillator.connect(filter).connect(gain).connect(bus)
      sources.push(oscillator); nodes.push(filter, gain); tones.push(oscillator)
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), samples = buffer.getChannelData(0)
    // One startup allocation; no frame-time synthesis or assets.
    let seed = 391
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      samples[i] = (seed / 4294967296) * 2 - 1
    }
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    noise.buffer = buffer; noise.loop = true
    filter.type = 'bandpass'; filter.frequency.value = 2900; filter.Q.value = 1.2
    gain.gain.value = 0.035; noise.connect(filter).connect(gain).connect(bus)
    sources.push(noise); nodes.push(filter, gain)
    graph = { ctx, bus, sources, nodes, tones }
    for (const source of sources) source.start()
  }
  return {
    get active() { return graph !== null },
    update(progress, intensity, delta = 0) {
      if (disposed || stopped) return
      if (progress >= 0 && progress < 1) {
        start()
        if (!graph) return
        const now = graph.ctx.currentTime
        graph.bus.gain.setTargetAtTime(Math.max(0, intensity), now, 0.035)
        for (let i = 0; i < graph.tones.length; i++)
          graph.tones[i].frequency.setTargetAtTime((710 + i * 23) * (1 - progress * 0.2), now, 0.05)
      } else if (graph) {
        if (tail < 0) {
          tail = 0
          graph.bus.gain.cancelScheduledValues(graph.ctx.currentTime)
          graph.bus.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.1)
        }
        tail += Math.max(0, delta)
        if (tail >= 0.4) stop()
      }
    },
    stop,
    dispose() { stop(); disposed = true }
  }
}

import { getContext, getMasterGain } from '../core/audio.js'

// Service-trolley wheels, synthesised so they need no asset: a looped noise
// bed through a bandpass that squeals higher the faster it rolls, chopped by a
// low wobble so it reads as wheels over carpet seams, plus a crash of glass
// and brass for impacts.
//
// The rolling level only holds while setSpeed() keeps being called. Each call
// schedules a fade to silence a moment later, so pausing the game (which stops
// level updates) never leaves the squeal running.

let noise = null

function noiseBuffer(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return noise
}

function ready() {
  const ctx = getContext()
  const master = getMasterGain()
  return ctx && master && ctx.state === 'running' ? { ctx, master } : null
}

export function createTrolleySfx({ volume = 0.5 } = {}) {
  let nodes = null

  function build({ ctx, master }) {
    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(master)
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer(ctx)
    source.loop = true
    const squeal = ctx.createBiquadFilter()
    squeal.type = 'bandpass'
    squeal.Q.value = 3
    const rumble = ctx.createBiquadFilter()
    rumble.type = 'lowpass'
    rumble.frequency.value = 260
    const rumbleGain = ctx.createGain()
    rumbleGain.gain.value = 1.6
    const wobble = ctx.createGain()
    wobble.gain.value = 0.7
    const lfo = ctx.createOscillator()
    lfo.type = 'triangle'
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.3
    lfo.connect(lfoDepth).connect(wobble.gain)
    source.connect(squeal).connect(wobble)
    source.connect(rumble).connect(rumbleGain).connect(wobble)
    wobble.connect(out)
    source.start()
    lfo.start()
    return { ctx, out, source, lfo, squeal }
  }

  // speed in m/s; level 0..1 scales for distance from the listener.
  function setSpeed(speed, level = 1) {
    const audio = ready()
    if (!audio) return
    if (!nodes) {
      if (speed < 0.05) return
      nodes = build(audio)
    }
    const t = nodes.ctx.currentTime
    const amount = Math.min(1, speed / 3) * level
    nodes.squeal.frequency.setTargetAtTime(700 + speed * 420, t, 0.05)
    nodes.lfo.frequency.setTargetAtTime(4 + speed * 5, t, 0.05)
    const gain = nodes.out.gain
    gain.cancelScheduledValues(t)
    gain.setTargetAtTime(amount * 0.32 * volume, t, 0.04)
    gain.setTargetAtTime(0, t + 0.2, 0.08)
  }

  function clatter(level = 1) {
    const audio = ready()
    if (!audio) return
    const { ctx, master } = audio
    const out = ctx.createGain()
    out.gain.value = volume * level
    out.connect(master)
    const t = ctx.currentTime + 0.01
    // Brass knock, then glass chinks scattered after it.
    const hits = [[0, 0.12, 700, 1, 0.9, 'lowpass'], [0.03, 0.08, 3200, 6, 0.35, 'bandpass'],
      [0.08, 0.06, 4200, 8, 0.25, 'bandpass'], [0.15, 0.05, 3600, 8, 0.18, 'bandpass']]
    for (const [at, duration, frequency, q, gain, type] of hits) {
      const source = ctx.createBufferSource()
      source.buffer = noiseBuffer(ctx)
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = frequency
      filter.Q.value = q
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t + at)
      env.gain.linearRampToValueAtTime(gain, t + at + 0.005)
      env.gain.exponentialRampToValueAtTime(0.0001, t + at + duration)
      source.connect(filter).connect(env).connect(out)
      source.start(t + at, Math.random() * 0.5)
      source.stop(t + at + duration + 0.05)
    }
    setTimeout(() => out.disconnect(), 800)
  }

  function dispose() {
    if (!nodes) return
    try {
      nodes.source.stop()
      nodes.lfo.stop()
    } catch {
      // Already stopped with its context.
    }
    nodes.out.disconnect()
    nodes = null
  }

  return { setSpeed, clatter, dispose }
}

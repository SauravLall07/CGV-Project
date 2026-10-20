import { getContext, getMasterGain } from '../core/audio.js'

// Heavy security door opening, synthesised so it needs no asset: a bolt
// clunk, three ratchet clicks, then a short filtered grind while the slab
// rises. About 0.9 s, through the shared master gain.

let noise = null

function noiseBuffer(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return noise
}

function burst(ctx, out, { at, duration, frequency, q = 1, gain, type = 'lowpass' }) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(gain, at + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  source.connect(filter).connect(env).connect(out)
  source.start(at, Math.random() * 0.5)
  source.stop(at + duration + 0.05)
  return { filter, env }
}

export function playDoorOpen(volume = 0.5) {
  const ctx = getContext()
  const master = getMasterGain()
  if (!ctx || !master || ctx.state !== 'running') return
  const out = ctx.createGain()
  out.gain.value = volume
  out.connect(master)
  const t = ctx.currentTime + 0.02

  // Bolt clunk: a low thump under a short noise knock.
  const thump = ctx.createOscillator()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(110, t)
  thump.frequency.exponentialRampToValueAtTime(42, t + 0.18)
  const thumpEnv = ctx.createGain()
  thumpEnv.gain.setValueAtTime(0.9, t)
  thumpEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  thump.connect(thumpEnv).connect(out)
  thump.start(t)
  thump.stop(t + 0.25)
  burst(ctx, out, { at: t, duration: 0.09, frequency: 900, gain: 0.6 })

  // Ratchet.
  for (let i = 0; i < 3; i += 1) {
    burst(ctx, out, { at: t + 0.14 + i * 0.07, duration: 0.03, frequency: 2600, q: 4, gain: 0.28, type: 'bandpass' })
  }

  // Grind while the slab lifts, rising in pitch.
  const grind = burst(ctx, out, { at: t + 0.3, duration: 0.6, frequency: 380, q: 3, gain: 0.32, type: 'bandpass' })
  grind.filter.frequency.setValueAtTime(320, t + 0.3)
  grind.filter.frequency.linearRampToValueAtTime(720, t + 0.85)

  setTimeout(() => out.disconnect(), 1400)
}

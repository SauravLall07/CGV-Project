import { getContext, getMasterGain } from '../core/audio.js'

// Procedural time-distortion texture (Phase 8): looping pink noise through
// a slowly-modulated bandpass — a whoosh, not a chord. Idle output sits
// near-silent; setTimeDilation() swells the bed in when a time ability is
// active and slows the noise grain with the scale. Intensity opens the
// filter. dispose() stops and disconnects every node, same contract as
// the other systems.

const IDLE_GAIN = 0.002 // near-silent bed while time is normal
const ACTIVE_GAIN = 0.18 // subtle texture under the sampled track during an ability
const LFO_RATE = 0.08 // Hz — slow whoosh, not a musical LFO
const LFO_DEPTH = 180 // Hz added on top of the filter's own center
const BASE_CUTOFF = 550 // bandpass centre — wind/whoosh band, not a pitched tone
const CUTOFF_SPAN = 900 // extra Hz at intensity 1
const FILTER_Q = 1.2 // broad enough to stay noisy, not a whistle
const PARAM_TIME = 0.15 // playback-rate / cutoff time constant
const GAIN_FADE_TIME = 0.14 // ~0.4s to 95% — setTargetAtTime time constant
const PLAYBACK_MIN = 0.35 // freeze/rewind grain speed
const NOISE_SECONDS = 2
const REVERB_SECONDS = 2

// White-noise decay buffer for the ConvolverNode. Stereo channels are
// independent so the tail has width rather than a mono smear.
function createImpulseResponse(ctx, duration) {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * duration)
  const impulse = ctx.createBuffer(2, length, rate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
    }
  }
  return impulse
}

// Paul Kellet pink-noise filter over white. Loops as a BufferSource so the
// whoosh has no oscillator pitch.
function createPinkNoiseBuffer(ctx, duration) {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * duration)
  const buffer = ctx.createBuffer(1, length, rate)
  const data = buffer.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.96900 * b2 + white * 0.1538520
    b3 = 0.86650 * b3 + white * 0.3104856
    b4 = 0.55000 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.0168980
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  return buffer
}

let instance = null
let nextDroneId = 1
let liveDrones = 0

function musicTs() {
  return `${new Date().toISOString()} t=${performance.now().toFixed(1)}`
}

export class MusicSystem {
  constructor() {
    // One bed for the whole session — menu buttons and the canvas click all
    // go through unlockAudio(), but a second `new MusicSystem()` must not
    // stack another set of oscillators on the master gain.
    if (instance) {
      console.log(
        `[music ${musicTs()}] MusicSystem#${instance.id} REUSE (constructor hit while live) liveDrones=${liveDrones}`
      )
      return instance
    }
    instance = this
    this.id = nextDroneId++
    liveDrones += 1
    console.log(
      `[music ${musicTs()}] MusicSystem#${this.id} CONSTRUCT liveDrones=${liveDrones}`
    )

    const ctx = getContext()
    const master = getMasterGain()
    console.log('Master gain value: ' + master.gain.value)

    this.output = ctx.createGain()
    this.output.gain.value = IDLE_GAIN
    this.output.connect(master)

    // Temporary: bypass reverb to test whether the convolver is killing the signal.
    // this.convolver = ctx.createConvolver()
    // this.convolver.normalize = false
    // this.convolver.buffer = createImpulseResponse(ctx, REVERB_SECONDS)
    // this.convolver.connect(this.output)

    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'bandpass'
    this.filter.frequency.value = BASE_CUTOFF
    this.filter.Q.value = FILTER_Q
    this.filter.connect(this.output)

    this.noise = ctx.createBufferSource()
    this.noise.buffer = createPinkNoiseBuffer(ctx, NOISE_SECONDS)
    this.noise.loop = true
    this.noise.connect(this.filter)
    this.noise.start()
    console.log('Noise whoosh started, buffer duration: ' + this.noise.buffer.duration)

    // AudioParam connections add to the param's intrinsic value, so the LFO
    // swings around whatever cutoff setIntensity() is targeting.
    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = LFO_RATE

    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = LFO_DEPTH
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.filter.frequency)
    this.lfo.start()

    console.log('output gain: ' + this.output.gain.value + ', master gain: ' + getMasterGain().gain.value)

    this._disposed = false
  }

  setTimeDilation(scale) {
    if (this._disposed) return
    const t = Math.min(1, Math.max(0, scale))
    const now = getContext().currentTime
    // Scale 1.0 is idle time — keep the bed near-silent. Any ability
    // (Slow 0.2, Freeze/Rewind 0, Ghost 0.55) swells it in.
    const gain = t < 1 ? ACTIVE_GAIN : IDLE_GAIN
    this.output.gain.setTargetAtTime(gain, now, GAIN_FADE_TIME)
    // Slow the noise grain with time — freeze reads as a heavier whoosh,
    // not a pitch drop of a chord.
    this.noise.playbackRate.setTargetAtTime(
      PLAYBACK_MIN + t * (1 - PLAYBACK_MIN),
      now,
      PARAM_TIME
    )
  }

  setIntensity(level) {
    if (this._disposed) return
    const t = Math.min(1, Math.max(0, level))
    const cutoff = BASE_CUTOFF + t * CUTOFF_SPAN
    this.filter.frequency.setTargetAtTime(cutoff, getContext().currentTime, PARAM_TIME)
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true

    const ctx = getContext()
    if (ctx) this.output.gain.setValueAtTime(0, ctx.currentTime)

    if (this.noise) {
      try { this.noise.stop() } catch { /* already stopped */ }
      this.noise.disconnect()
      this.noise = null
    }

    this.lfo.stop()
    this.lfo.disconnect()
    this.lfoGain.disconnect()
    this.filter.disconnect()
    // this.convolver.disconnect()
    this.output.disconnect()
    if (instance === this) instance = null
    liveDrones = Math.max(0, liveDrones - 1)
    console.log(
      `[music ${musicTs()}] MusicSystem#${this.id} DISPOSE liveDrones=${liveDrones}`
    )
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log(`[music ${musicTs()}] HMR dispose music-system`)
    if (instance) instance.dispose()
  })
}

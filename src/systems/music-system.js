import { getContext, getMasterGain } from '../core/audio.js'

// Procedural ambient bed (Phase 8 foundation): a layered low sine drone
// through a slow-moving lowpass and a generated-impulse reverb, synthesized
// entirely with Web Audio — no samples. Time dilation detunes the oscillators
// so Slow/Freeze/Rewind can pull the bed with them later; intensity opens the
// filter. dispose() stops and disconnects every node, same contract as the
// other systems.

const OUTPUT_GAIN = 0.7
const OSC_GAIN = 0.25 // per-oscillator; three sines stay under 1.0 when summed
const LFO_RATE = 0.035 // Hz — one breath every ~30 seconds
const LFO_DEPTH = 60 // Hz added on top of the filter's own cutoff
const DRONE_FREQS = [130.8, 196, 261.6] // C3, G3, C4 — same chord, one octave up so laptop speakers can actually reproduce it
const BASE_CUTOFF = 900
const CUTOFF_SPAN = 1500 // extra Hz at intensity 1
const PARAM_TIME = 0.15 // setTargetAtTime time constant
const TIME_DETUNE_CENTS = 2400 // freeze drops two octaves
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

let instance = null

export class MusicSystem {
  constructor() {
    // One bed for the whole session — menu buttons and the canvas click all
    // go through unlockAudio(), but a second `new MusicSystem()` must not
    // stack another set of oscillators on the master gain.
    if (instance) return instance
    instance = this

    const ctx = getContext()
    const master = getMasterGain()
    console.log('Master gain value: ' + master.gain.value)

    this.output = ctx.createGain()
    this.output.gain.value = OUTPUT_GAIN
    this.output.connect(master)

    // Temporary: bypass reverb to test whether the convolver is killing the signal.
    // this.convolver = ctx.createConvolver()
    // this.convolver.normalize = false
    // this.convolver.buffer = createImpulseResponse(ctx, REVERB_SECONDS)
    // this.convolver.connect(this.output)

    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = BASE_CUTOFF
    this.filter.Q.value = 0.8
    this.filter.connect(this.output)

    this.oscGains = []
    this.oscillators = DRONE_FREQS.map((freq) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const gain = ctx.createGain()
      gain.gain.value = OSC_GAIN
      osc.connect(gain)
      gain.connect(this.filter)
      osc.start()
      this.oscGains.push(gain)
      console.log('Drone oscillator started at ' + freq + ' Hz')
      return osc
    })
    console.log('Oscillators:', this.oscillators.map((osc) => ({ type: osc.type, frequency: osc.frequency.value })))

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
    const cents = (t - 1) * TIME_DETUNE_CENTS
    const now = getContext().currentTime
    for (const osc of this.oscillators) {
      osc.detune.setTargetAtTime(cents, now, PARAM_TIME)
    }
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

    for (const osc of this.oscillators) {
      osc.stop()
      osc.disconnect()
    }
    this.oscillators.length = 0

    for (const gain of this.oscGains) {
      gain.disconnect()
    }
    this.oscGains.length = 0

    this.lfo.stop()
    this.lfo.disconnect()
    this.lfoGain.disconnect()
    this.filter.disconnect()
    // this.convolver.disconnect()
    this.output.disconnect()
    if (instance === this) instance = null
  }
}

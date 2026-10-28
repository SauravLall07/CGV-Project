import { getContext, getSfxGain } from '../core/audio.js'

// The Vault finale uses the real recordings, in sequence. No timer can cut
// off the charge before the creak and explosion are heard.
const urls = {
  charge: new URL('../assets/audio/sfx/level2/core-charge.mp3', import.meta.url),
  creak: new URL('../assets/audio/sfx/level2/core-creak.mp3', import.meta.url),
  explosion: new URL('../assets/audio/sfx/level2/core-explosion.mp3', import.meta.url),
  breach: new URL('../assets/audio/sfx/level2/security-breach.wav', import.meta.url),
  alarm: new URL('../assets/audio/sfx/level2/security-breach-alarm.mp3', import.meta.url)
}
const stages = ['charge', 'creak', 'explosion', 'breach', 'alarm']
// The recording contains ~1.5-second repeating beeps. Three complete beeps
// occupy the first 4.6 seconds; stop before the Level 2 -> 3 story beat.
const THREE_ALARM_BEEPS_SECONDS = 4.6
const volume = { charge: 0.32, creak: 0.36, explosion: 0.46, breach: 0.43, alarm: 0.32 }

// Keep the final alarm under the finale's control. It must stop before
// advancing to the story, including when the level is reset or abandoned.
let transitionAlarm = null
function stopTransitionAlarm() {
  const active = transitionAlarm
  transitionAlarm = null
  if (!active) return
  try { active.source.stop() } catch {}
  try { active.source.disconnect(); active.gain.disconnect() } catch {}
}
function startTransitionAlarm(buffer) {
  const ctx = getContext(), bus = getSfxGain()
  stopTransitionAlarm()
  if (!buffer || !ctx || !bus || ctx.state !== 'running') return
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer
  gain.gain.value = volume.alarm
  source.connect(gain).connect(bus)
  const entry = { source, gain }
  transitionAlarm = entry
  source.onended = () => {
    if (transitionAlarm === entry) transitionAlarm = null
    source.disconnect()
    gain.disconnect()
  }
  source.start()
  source.stop(ctx.currentTime + Math.min(buffer.duration, THREE_ALARM_BEEPS_SECONDS))
}


export function createCoreFinaleSfx() {
  const buffers = new Map()
  const sources = new Set()
  let disposed = false
  let requested = false
  let phase = 'idle'
  let phaseTime = 0
  let loading = null

  function preload() {
    if (loading) return loading
    const ctx = getContext()
    if (!ctx) return Promise.resolve(false)
    loading = Promise.all([...stages, 'alarm'].map(async name => {
      try {
        const res = await fetch(urls[name])
        if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
        buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch (err) {
        console.warn('[core-finale] Could not load', name, err)
      }
    })).then(() => !disposed)
    return loading
  }

  function play(name) {
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
    if (!ctx || ctx.state !== 'running' || !bus || !buffer) return
    const src = ctx.createBufferSource(), gain = ctx.createGain()
    src.buffer = buffer
    gain.gain.value = volume[name]
    src.connect(gain).connect(bus)
    const record = { src, gain }
    sources.add(record)
    src.onended = () => { sources.delete(record); src.disconnect(); gain.disconnect() }
    src.start()
  }

  function enter(next) {
    phase = next
    phaseTime = 0
    if (next === 'alarm') startTransitionAlarm(buffers.get('alarm'))
    else if (next !== 'done') play(next)
  }

  function start() {
    if (requested || disposed) return
    requested = true
    phase = 'loading'
    void preload().then(() => {
      if (!disposed && requested && phase === 'loading') enter('charge')
    })
  }

  function update(dt) {
    if (!requested || phase === 'loading' || phase === 'idle' || phase === 'done') return { phase, shaking: false, finished: phase === 'done' }
    phaseTime += Math.max(0, dt)
    const buffer = buffers.get(phase)
    // Preserve the entire recording. For missing/corrupt files, allow the
    // cinematic to complete rather than leaving input permanently locked.
    const length = phase === 'alarm'
      ? Math.min(buffer?.duration ?? THREE_ALARM_BEEPS_SECONDS, THREE_ALARM_BEEPS_SECONDS)
      : buffer?.duration ?? (phase === 'charge' ? 9.8 : phase === 'creak' ? 3.4 : phase === 'explosion' ? 5.6 : 3.34)
    if (phaseTime >= length) {
      const next = stages[stages.indexOf(phase) + 1] ?? 'done'
      if (next === 'done') stopTransitionAlarm()
      enter(next)
    }
    return { phase, shaking: phase === 'explosion', finished: phase === 'done' }
  }

  function reset() {
    stopTransitionAlarm()
    requested = false
    phase = 'idle'
    phaseTime = 0
    for (const { src, gain } of sources) {
      try { src.stop() } catch {}
      try { src.disconnect(); gain.disconnect() } catch {}
    }
    sources.clear()
  }

  function dispose() { reset(); disposed = true }
  return { preload, start, update, reset, dispose }
}

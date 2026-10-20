import { getContext, getSfxGain } from '../core/audio.js'

// Level 1 puzzle and security audio. All effects use the SFX volume bus.
const urls = {
  laser: new URL('../assets/audio/sfx/security/laser-hum.mp3', import.meta.url),
  contact: new URL('../assets/audio/sfx/security/laser-contact.mp3', import.meta.url),
  dial: new URL('../assets/audio/sfx/security/dial-switch.mp3', import.meta.url),
  plate: new URL('../assets/audio/sfx/security/pressure-switch.mp3', import.meta.url),
  tile: new URL('../assets/audio/sfx/security/tile-turn.mp3', import.meta.url),
  slide: new URL('../assets/audio/sfx/security/door-slide.mp3', import.meta.url),
  whoosh: new URL('../assets/audio/sfx/security/door-whoosh.mp3', import.meta.url),
  cameraAlarm: new URL('../assets/audio/sfx/security/camera-alarm.mp3', import.meta.url),
  wrongAnswer: new URL('../assets/audio/sfx/security/wrong-answer.mp3', import.meta.url)
}
const buffers = new Map()
const pending = new Map()
function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (pending.has(name)) return pending.get(name)
  const context = getContext()
  if (!context) return Promise.resolve(null)
  const promise = fetch(urls[name]).then(response => {
    if (!response.ok) throw new Error(`Sound ${name}: ${response.status}`)
    return response.arrayBuffer()
  }).then(data => context.decodeAudioData(data)).then(buffer => {
    buffers.set(name, buffer)
    return buffer
  }).catch(error => {
    console.warn('[level-one-security-sfx]', error)
    return null
  }).finally(() => pending.delete(name))
  pending.set(name, promise)
  return promise
}
export function preloadSecuritySfx() {
  if (!getContext()) return
  Object.keys(urls).forEach(load)
}
function play(name, volume = 0.2, offset = 0, duration = undefined) {
  const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
  if (!ctx || !bus || !buffer || ctx.state !== 'running') {
    if (ctx && !buffer) load(name)
    return
  }
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer
  gain.gain.value = volume
  source.connect(gain).connect(bus)
  source.onended = () => { source.disconnect(); gain.disconnect() }
  source.start(0, offset, duration)
}
// Camera capture alarm only. Stop it when the player respawns or the scene is cleaned up.
let cameraAlarmPlayback = null
let alarmGeneration = 0
export function stopCameraAlarmSfx() {
  alarmGeneration++
  const active = cameraAlarmPlayback
  cameraAlarmPlayback = null
  if (!active) return
  try { active.source.stop() } catch { /* source may have already ended */ }
}
export function playCameraCaptureAlarmSfx() {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  stopCameraAlarmSfx()
  const generation = alarmGeneration
  const start = (buffer) => {
    if (!buffer || generation !== alarmGeneration || !getSfxGain()) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer
    // Shortest useful excerpt; normal respawn stops it even sooner.
    gain.gain.value = 0.18
    source.connect(gain).connect(getSfxGain())
    cameraAlarmPlayback = { source, gain }
    source.onended = () => {
      if (cameraAlarmPlayback?.source === source) cameraAlarmPlayback = null
      source.disconnect(); gain.disconnect()
    }
    source.start(0, 0, Math.min(buffer.duration, 3.5))
  }
  const cached = buffers.get('cameraAlarm')
  if (cached) start(cached)
  else void load('cameraAlarm').then(start)
}
export function playPuzzleWrongAnswerSfx() {
  if (buffers.has('wrongAnswer')) play('wrongAnswer', 0.21)
  else void load('wrongAnswer') // Loaded for subsequent attempts; no stale replay.
}
export const playDialSfx = () => play('dial', 0.28)
export const playPressurePlateSfx = () => play('plate', 0.32)
// Short synthesized relay cue for each icon in Puzzle 2's memory sequence.
// No new asset needed: the oscillator starts immediately and follows SFX/Master volume.
export function playRoutingIconSfx(iconIndex = 0, emitterPosition, listenerPosition) {
  // Sequence cues are local to the wall relay, never audible across the map.
  if (!emitterPosition || !listenerPosition) return
  const dx = emitterPosition.x - listenerPosition.x
  const dy = emitterPosition.y - (listenerPosition.y + 1.4)
  const dz = emitterPosition.z - listenerPosition.z
  const distance = Math.hypot(dx, dy, dz)
  const fullVolumeRadius = 2.5
  const audibleRadius = 11
  if (distance >= audibleRadius) return
  const attenuation = distance <= fullVolumeRadius
    ? 1
    : Math.pow((audibleRadius - distance) / (audibleRadius - fullVolumeRadius), 2)
  const ctx = getContext(), bus = getSfxGain()
  if (!ctx || !bus || ctx.state !== 'running') return
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  // Related notes make the ordered icons easy to distinguish without becoming musical.
  const notes = [587.33, 659.25, 739.99, 783.99]
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(notes[Math.abs(iconIndex) % notes.length], now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.085 * attenuation, now + 0.009)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
  oscillator.connect(gain).connect(bus)
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  oscillator.start(now)
  oscillator.stop(now + 0.14)
}

export const playRelayTileSfx = () => play('tile', 0.20, 0, 0.32)
export const playLaserContactSfx = () => play('contact', 0.28, 0, 0.45)
export function playPuzzleDoorSfx() {
  play('slide', 0.48)
  // Short front part of the whoosh adds movement without an 8-second tail.
  play('whoosh', 0.12, 0.60, 1.35)
}

// A separate positional emitter for each laser; its position is read from the
// moving Three.js group every frame. No duplicate loops on activation changes.
export function createLaserAudio(group, { volume = 0.17, referenceDistance = 2.5 } = {}) {
  let source = null, gain = null, panner = null, active = true, disposed = false
  const start = () => {
    if (disposed || !active || source) return
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get('laser')
    if (!ctx || !bus || !buffer || ctx.state !== 'running') {
      if (ctx && !buffer) load('laser')
      return
    }
    source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    gain = ctx.createGain()
    gain.gain.value = volume
    panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = referenceDistance
    panner.maxDistance = 18
    panner.rolloffFactor = 1.6
    source.connect(gain).connect(panner).connect(bus)
    source.start()
  }
  const stop = () => {
    if (!source) return
    source.onended = null
    try { source.stop() } catch { /* already stopped */ }
    source.disconnect(); gain.disconnect(); panner.disconnect()
    source = gain = panner = null
  }
  return {
    setActive(value) { active = Boolean(value); if (!active) stop(); else start() },
    update() {
      if (disposed) return
      start()
      if (!panner) return
      const point = group.getWorldPosition(group.userData.audioWorldPoint || (group.userData.audioWorldPoint = group.position.clone()))
      panner.positionX.value = point.x
      panner.positionY.value = point.y + 0.6
      panner.positionZ.value = point.z
    },
    dispose() { disposed = true; stop() }
  }
}

// Keep Web Audio's listening position at the player's head (otherwise all
// spatial emitters are heard relative to the default world origin).
export function setSecurityListenerPosition(position) {
  const listener = getContext()?.listener
  if (!listener || !position) return
  const x = position.x, y = position.y + 1.4, z = position.z
  if (listener.positionX) {
    listener.positionX.value = x
    listener.positionY.value = y
    listener.positionZ.value = z
  } else if (listener.setPosition) listener.setPosition(x, y, z)
}

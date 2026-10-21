import { getContext, getSfxGain } from '../core/audio.js'

// Level 1 guard and station sounds. All output respects the SFX/master buses.
// Static asset URLs are essential: Vite cannot reliably bundle URLs built
// from a runtime filename variable inside new URL(..., import.meta.url).
const urls = {
  whats: new URL('../assets/audio/sfx/level1-voices/guard-whats-that.ogg', import.meta.url),
  who: new URL('../assets/audio/sfx/level1-voices/guard-whos-there.ogg', import.meta.url),
  someone: new URL('../assets/audio/sfx/level1-voices/guard-someone-here.ogg', import.meta.url),
  hey: new URL('../assets/audio/sfx/level1-voices/guard-hey.ogg', import.meta.url),
  found: new URL('../assets/audio/sfx/level1-voices/guard-hes-here.ogg', import.meta.url),
  dead: new URL('../assets/audio/sfx/level1-voices/guard-youre-dead.ogg', import.meta.url),
  leaving: new URL('../assets/audio/sfx/level1-voices/guard-not-leaving.ogg', import.meta.url),
  grunt: new URL('../assets/audio/sfx/level1-voices/guard-grunt.ogg', import.meta.url),
  announcement: new URL('../assets/audio/sfx/level1-voices/station-announcement.ogg', import.meta.url),
  station: new URL('../assets/audio/sfx/level1-voices/station-ambience.ogg', import.meta.url),
  door: new URL('../assets/audio/sfx/level1-voices/train-door.ogg', import.meta.url),
  effort: new URL('../assets/audio/sfx/level1-voices/train-door-force.ogg', import.meta.url),
  depart: new URL('../assets/audio/sfx/level1-voices/train-depart.ogg', import.meta.url)
}
const buffers = new Map()
const pending = new Map()
function load(key) {
  if (buffers.has(key)) return Promise.resolve(buffers.get(key))
  if (pending.has(key)) return pending.get(key)
  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)
  const promise = fetch(urls[key]).then(r => {
    if (!r.ok) throw new Error(`Audio ${key}: ${r.status}`)
    return r.arrayBuffer()
  }).then(data => ctx.decodeAudioData(data)).then(buffer => {
    buffers.set(key, buffer)
    return buffer
  }).catch(error => { console.warn('[level1-guard-train]', key, error); return null }).finally(() => pending.delete(key))
  pending.set(key, promise)
  return promise
}
export function preloadGuardTrainSfx() {
  if (!getContext()) return
  for (const key of Object.keys(urls)) void load(key)
}
let lastVoiceAt = -100
let activeVoice = null
let lastBumpAt = -100
let collisionToken = 0
let lastCaughtAt = -100
let priorityVoiceUntil = -100
let pendingInvestigation = null
function interruptVoice() {
  // A physical collision must win over ongoing and scheduled dialogue.
  if (!activeVoice) return
  const interrupted = activeVoice
  activeVoice = null
  try { interrupted.stop() } catch { /* already ended */ }
}

function play(key, volume = 0.3, { voice = false, loop = false, priority = false, latest = 1.2 } = {}) {
  const ctx = getContext(), bus = getSfxGain()
  if (!ctx || !bus) return null
  const buffer = buffers.get(key)
  if (!buffer || ctx.state !== 'running') {
    // Fetch/decode might still be in flight when the first event occurs.
    // Replay a freshly requested cue once its buffer becomes ready; don't
    // replay stale guard chatter long after an encounter has finished.
    if (!buffer && ctx.state === 'running') {
      const requestedAt = ctx.currentTime
      void load(key).then((loaded) => {
        if (!loaded || ctx.state !== 'running' || ctx.currentTime - requestedAt > latest) return
        play(key, volume, { voice, loop, priority, latest: 0 })
      })
    }
    return null
  }
  if (priority) interruptVoice()
  if (voice && !priority && (ctx.currentTime < priorityVoiceUntil || ctx.currentTime - lastVoiceAt < 2.8 || activeVoice || ctx.currentTime - lastBumpAt < 1.5)) return null
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer
  source.loop = loop
  gain.gain.value = volume
  source.connect(gain).connect(bus)
  source.onended = () => {
    if (activeVoice === source) activeVoice = null
    source.disconnect(); gain.disconnect()
  }
  if (voice) {
    activeVoice = source
    lastVoiceAt = ctx.currentTime
    if (priority) priorityVoiceUntil = Math.max(priorityVoiceUntil, ctx.currentTime + buffer.duration + 0.15)
  }
  source.start()
  return { source, gain }
}
let alertIndex = 0, catchIndex = 0, bumpIndex = 0
function nearbyVolume(guardPosition, playerPosition, radius = 14, base = 0.47) {
  if (!guardPosition || !playerPosition) return 0
  const d = guardPosition.distanceTo(playerPosition)
  if (d >= radius) return 0
  return base * Math.pow(Math.max(0, 1 - d / radius), 1.5)
}
export function playGuardAlertSfx(guardPosition, playerPosition) {
  const volume = nearbyVolume(guardPosition, playerPosition)
  // Sound 1 (the "huh" clip) deliberately removed from the alert rotation.
  if (volume > 0.015) play(['whats', 'who', 'someone'][alertIndex++ % 3], volume, { voice: true })
}
// Investigation is a gameplay event, not disposable proximity chatter.
// If another ordinary voice is active, retain one recent response until its
// voice slot opens. Capture/collision responses continue to take precedence.
export function playGuardInvestigationSfx(guardPosition, playerPosition) {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  const volume = nearbyVolume(guardPosition, playerPosition, 18, 0.52)
  if (volume <= 0.015) return // Do not make distant guards audible globally.
  const key = ['whats', 'who', 'someone'][alertIndex++ % 3]
  pendingInvestigation = { key, volume, expiresAt: ctx.currentTime + 4.5 }
  void load(key)
  updateGuardInvestigationSfx()
}
export function updateGuardInvestigationSfx() {
  if (!pendingInvestigation) return
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  const request = pendingInvestigation
  if (ctx.currentTime > request.expiresAt) { pendingInvestigation = null; return }
  if (ctx.currentTime < priorityVoiceUntil || activeVoice ||
      ctx.currentTime - lastVoiceAt < 2.8 || ctx.currentTime - lastBumpAt < 1.5 ||
      !buffers.has(request.key)) return
  pendingInvestigation = null
  play(request.key, request.volume, { voice: true })
}
export function playGuardCaughtSfx(guardPosition, playerPosition) {
  const volume = nearbyVolume(guardPosition, playerPosition, 19, 0.63)
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running' || volume <= 0.015) return
  // Capture dialogue has priority over proximity alerts and may interrupt one.
  // Avoid replaying the capture line every frame while the guard is catching up.
  if (ctx.currentTime - lastCaughtAt < 1.5) return
  lastCaughtAt = ctx.currentTime
  pendingInvestigation = null
  priorityVoiceUntil = Math.max(priorityVoiceUntil, ctx.currentTime + 2.5)
  interruptVoice()
  play(['hey', 'found'][catchIndex++ % 2], volume, { voice: true, priority: true, latest: 1.2 })
}
export function playGuardBumpSfx(guardPosition, playerPosition) {
  const volume = nearbyVolume(guardPosition, playerPosition, 12, 0.56)
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running' || volume <= 0.015) return
  if (ctx.currentTime - lastBumpAt < 0.65) return
  lastBumpAt = ctx.currentTime
  pendingInvestigation = null
  priorityVoiceUntil = Math.max(priorityVoiceUntil, ctx.currentTime + 2.5)
  interruptVoice()
  play('grunt', 0.22, { latest: 0.8 })
  const threat = ['dead', 'leaving'][bumpIndex++ % 2]
  // Mark the collision response as pending to prevent proximity chatter
  // from stealing its slot while the threat buffer loads.
  const collisionTime = ctx.currentTime
  const token = ++collisionToken
  void Promise.all([load(threat), load('grunt')]).then(([buffer]) => {
    if (!buffer || token !== collisionToken || ctx.state !== 'running' || ctx.currentTime - collisionTime > 1.4) return
    // Do not interrupt the immediate grunt: put the threat just behind it.
    const bus = getSfxGain()
    if (!bus) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer
    gain.gain.value = volume
    source.connect(gain).connect(bus)
    activeVoice = source
    lastVoiceAt = ctx.currentTime
    source.onended = () => {
      if (activeVoice === source) activeVoice = null
      source.disconnect(); gain.disconnect()
    }
    source.start(ctx.currentTime + 0.15)
  })
}
export function playStationAnnouncement() { play('announcement', 0.42, { latest: 6 }) }
export function playTrainDoorSfx() { play('door', 0.25) }
export function playTrainDepartureSfx() { play('depart', 0.62) }

let stationLoop = null
export function updateStationAmbience(playerPosition, enabled = true) {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  if (!stationLoop && enabled) stationLoop = play('station', 0, { loop: true })
  if (!stationLoop) return
  // Station courtyard and platform: local ambience instead of globally audible audio.
  const gain = enabled && playerPosition ? 0.13 : 0
  stationLoop.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.35)
}
export function disposeGuardTrainSfx() {
  stopTrainDoorEffortSfx()
  if (stationLoop) {
    try { stationLoop.source.stop() } catch { /* already stopped */ }
    stationLoop = null
  }
  if (activeVoice) {
    try { activeVoice.stop() } catch { /* already stopped */ }
    activeVoice = null
  }
  lastVoiceAt = -100
  lastBumpAt = -100
  lastCaughtAt = -100
  priorityVoiceUntil = -100
  pendingInvestigation = null
  collisionToken++
}

// The recorded metal strain is heard only during the E-hold interaction.
// Each new hold invalidates any pending audio decode from a cancelled hold.
let forcingDoor = null
let forcingDoorToken = 0
export function stopTrainDoorEffortSfx() {
  forcingDoorToken++
  if (!forcingDoor) return
  const current = forcingDoor
  forcingDoor = null
  try { current.source.stop() } catch { /* already stopped */ }
}
export function startTrainDoorEffortSfx() {
  stopTrainDoorEffortSfx()
  const token = forcingDoorToken
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  // Preloading normally makes this immediate; delayed decoding is still safe
  // because cancelling the hold invalidates its token.
  void load('effort').then(buffer => {
    if (!buffer || token !== forcingDoorToken || ctx.state !== 'running') return
    const bus = getSfxGain()
    if (!bus) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    source.loop = true
    // Kept audible but restrained, and controlled by SFX/master volume.
    gain.gain.value = 0.18
    source.connect(gain).connect(bus)
    forcingDoor = { source, gain }
    source.onended = () => {
      if (forcingDoor?.source === source) forcingDoor = null
      source.disconnect()
      gain.disconnect()
    }
    source.start()
  })
}

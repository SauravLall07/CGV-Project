import { getContext, getMasterGain } from '../core/audio.js'

// Level 1 only. Every sound goes through the existing master/mute bus.
const files = {
  step1: new URL('../assets/audio/sfx/player/footstep-1.mp3', import.meta.url),
  step2: new URL('../assets/audio/sfx/player/footstep-2.mp3', import.meta.url),
  step3: new URL('../assets/audio/sfx/player/footstep-3.mp3', import.meta.url),
  step4: new URL('../assets/audio/sfx/player/footstep-4.mp3', import.meta.url),
  jump: new URL('../assets/audio/sfx/player/jump.mp3', import.meta.url),
  land: new URL('../assets/audio/sfx/player/land.mp3', import.meta.url),
  pant: new URL('../assets/audio/sfx/player/pant.mp3', import.meta.url),
  door: new URL('../assets/audio/sfx/player/station-door.mp3', import.meta.url),
  metal: new URL('../assets/audio/sfx/player/metal-impact.mp3', import.meta.url)
}
const buffers = new Map()
let loading = null
export function preloadPlayerInteractionSfx() {
  if (loading) return loading
  const ctx = getContext()
  if (!ctx) return Promise.resolve()
  loading = Promise.all(Object.entries(files).map(async ([name, url]) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()))
    } catch (error) { console.warn(`[player-sfx] ${name} unavailable`, error) }
  }))
  return loading
}
function play(name, volume, pitch = 1) {
  const ctx = getContext(), master = getMasterGain(), buffer = buffers.get(name)
  if (!ctx || !master || !buffer || ctx.state !== 'running') return
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer
  source.playbackRate.value = pitch
  gain.gain.value = volume
  source.connect(gain).connect(master)
  source.onended = () => { source.disconnect(); gain.disconnect() }
  source.start()
}
export function playStationEntranceSfx() { play('door', 0.33) }
export function playDistractorImpactSfx() { play('metal', 0.37) }

export function createLevelOneMovementSfx(player) {
  let previous = player.mesh.position.clone(), previousAir = player.isAirborne(), stepDistance = 0
  let runDuration = 0, pantCooldown = 0, stepIndex = 0, alive = true
  preloadPlayerInteractionSfx()
  return {
    update(delta) {
      if (!alive) return
      if (!loading && getContext()) preloadPlayerInteractionSfx()
      const position = player.mesh.position
      const distance = Math.hypot(position.x - previous.x, position.z - previous.z)
      previous.copy(position)
      const airborne = player.isAirborne(), running = player.isRunning(), crouching = player.isCrouching()
      // Large jumps in position are scripted teleports, not physical footsteps.
      const moving = player.isMoving() && distance > 0.003 && distance < 0.8
      if (!previousAir && airborne) play('jump', 0.085)
      if (previousAir && !airborne) { play('land', 0.105); stepDistance = 0 }
      previousAir = airborne
      if (pantCooldown > 0) pantCooldown -= delta
      if (running && moving && !airborne) runDuration += delta
      else if (runDuration > 2.0 && !running && !airborne && pantCooldown <= 0) {
        play('pant', 0.10)
        pantCooldown = 7
        runDuration = 0
      } else if (!running) runDuration = Math.max(0, runDuration - delta * 1.7)
      if (!moving || airborne) { stepDistance = 0; return }
      stepDistance += distance
      const stride = crouching ? 1.0 : running ? 1.13 : 1.35
      if (stepDistance >= stride) {
        stepDistance %= stride
        stepIndex = (stepIndex + 1) % 4
        play(`step${stepIndex + 1}`, crouching ? 0.025 : running ? 0.105 : 0.055,
          0.95 + Math.random() * 0.10)
      }
    },
    reset() { previous.copy(player.mesh.position); previousAir = player.isAirborne(); stepDistance = 0; runDuration = 0 },
    dispose() { alive = false }
  }
}

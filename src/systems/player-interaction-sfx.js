import { getContext, getSfxGain } from '../core/audio.js'

// Level 1 only. Every sound goes through the existing master/mute bus.
const files = {
  step: new URL('../assets/audio/sfx/player/footstep-2.mp3', import.meta.url),
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
  const ctx = getContext(), master = getSfxGain(), buffer = buffers.get(name)
  if (!ctx || !master || !buffer || ctx.state !== 'running') return
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer
  source.playbackRate.value = pitch
  gain.gain.value = volume
  source.connect(gain).connect(master)
  source.onended = () => { source.disconnect(); gain.disconnect() }
  source.start()
}
export function playStationEntranceSfx() { play('door', 0.2) }
export function playDistractorImpactSfx() { play('metal', 0.1) }

export function createLevelOneMovementSfx(player) {
  let previous = player.mesh.position.clone()
  let previousAir = player.isAirborne()
  let lastPhase = null
  let lastMode = null
  let runDuration = 0
  let pantCooldown = 0
  let stepCooldown = 0
  let alive = true
  preloadPlayerInteractionSfx()

  function clearSteps() {
    lastPhase = null
    lastMode = null
  }

  return {
    update(delta) {
      if (!alive) return
      if (!loading && getContext()) preloadPlayerInteractionSfx()
      const position = player.mesh.position
      const distance = Math.hypot(position.x - previous.x, position.z - previous.z)
      previous.copy(position)
      const airborne = player.isAirborne()
      const running = player.isRunning()
      const crouching = player.isCrouching()
      // Do not emit footsteps while stationary, sliding on a wall, or teleporting.
      const moving = player.isMoving() && distance > 0.003 && distance < 0.8

      // Fire jump and landing immediately at the airborne-state transition.
      // Audio clips have been re-cut to remove silent lead-in, so no extra delay.
      if (!previousAir && airborne) play('jump', 0.02)
      if (previousAir && !airborne) play('land', 0.02)
      previousAir = airborne

      pantCooldown = Math.max(0, pantCooldown - delta)
      stepCooldown = Math.max(0, stepCooldown - delta)
      if (running && moving && !airborne) runDuration += delta
      else if (runDuration > 2 && !running && !airborne && pantCooldown <= 0) {
        play('pant', 0.10)
        pantCooldown = 7
        runDuration = 0
      } else if (!running) runDuration = Math.max(0, runDuration - delta * 1.7)

      if (!moving || airborne) {
        clearSteps()
        return
      }

      // Visual locomotion is animated independently of player world distance.
      // Trigger twice per animation cycle (alternate feet) instead of using
      // the old hard-coded distance thresholds that could drift off-beat.
      const gait = player.getFootstepCycle?.()
      if (!gait) { clearSteps(); return }
      const mode = `${gait.mode}:${crouching ? 'crouch' : running ? 'run' : 'walk'}`
      const phase = gait.phase
      if (!Number.isFinite(phase)) { clearSteps(); return }
      if (mode !== lastMode || lastPhase === null) {
        lastMode = mode
        lastPhase = phase
        return
      }
      const advance = (phase - lastPhase + 1) % 1
      const before = lastPhase
      lastPhase = phase
      // Ignore clip resets and skipped frames rather than playing a late step.
      if (advance <= 0 || advance > 0.45 || stepCooldown > 0) return
      const crosses = (contact) => ((contact - before + 1) % 1) <= advance
      const contacts = gait.mode === 'procedural' ? [0.25, 0.75] : [0.10, 0.60]
      if (!contacts.some(crosses)) return
      // One consistent, soft recording for all gait types; only loudness changes.
      play('step', crouching ? 0.7 : running ? 1.6 : 1.3)
      stepCooldown = 0.13
    },
    reset() {
      previous.copy(player.mesh.position)
      previousAir = player.isAirborne()
      clearSteps()
      runDuration = 0
      stepCooldown = 0
    },
    dispose() { alive = false }
  }
}

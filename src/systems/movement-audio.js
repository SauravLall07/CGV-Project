import { playSfx } from './sound-effects.js'

// Distance travelled AFTER collision resolution drives cadence. No input-only
// footsteps against walls; no burst of missed steps after a long frame.
export function createMovementAudio(play = playSfx) {
  let distance = 0, step = null, crouched = false, variation = 0
  function reset() { distance = 0; step?.stop(); step = null }
  return {
    reset,
    update({ delta, dx, dz, airborne, wasAirborne, jumpStarted = false,
      impact = 0, crouching = false, running = false, surface = 'stone' }) {
      if (crouched !== crouching) {
        crouched = crouching
        play('cloth', { volume: 0.22, cooldown: 0.2 })
      }
      if (jumpStarted) play('jump', { volume: 0.5, priority: 2 })
      if (wasAirborne && !airborne && impact > 1.2) {
        play('land', { volume: Math.min(0.85, 0.22 + impact * 0.055), rate: impact > 9 ? 0.8 : 1, priority: 2 })
      }
      const travelled = Math.hypot(dx, dz)
      if (airborne || wasAirborne || delta <= 0 || travelled < 0.003 || travelled > 3) {
        reset(); return
      }
      distance += travelled
      const stride = crouching ? 0.83 : running ? 1.55 : 1.3
      if (distance < stride) return
      distance %= stride
      step?.stop()
      variation = (variation + 1) % 4
      step = play('step-' + surface, { volume: crouching ? 0.2 : running ? 0.58 : 0.4,
        rate: 0.94 + variation * 0.04, key: 'player-footstep', maxInstances: 1, cooldown: 0.13, priority: 0 })
    }
  }
}

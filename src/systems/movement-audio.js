import { playSfx } from './sound-effects.js'

// Movement feedback is limited to posture changes and confirmed landings.
// Footstep and jump-takeoff sounds are intentionally disabled.
export function createMovementAudio(play = playSfx) {
  let crouched = false
  function reset() { crouched = false }
  return {
    reset,
    update({ airborne, wasAirborne, impact = 0, crouching = false }) {
      if (crouched !== crouching) {
        crouched = crouching
        play('cloth', { volume: 0.22, cooldown: 0.2 })
      }
      if (wasAirborne && !airborne && impact > 1.2) {
        play('land', { volume: Math.min(0.85, 0.22 + impact * 0.055), rate: impact > 9 ? 0.8 : 1, priority: 2 })
      }
    }
  }
}

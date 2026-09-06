import * as THREE from 'three'

// Checkpoint / respawn system (Phase 1 foundation): one registered checkpoint
// at a time, plus a generic fail() that returns the player to it instead of
// hard-failing the run. Guard detection (Phase 2), hazards (Phase 4) and the
// fell-off-the-train check all call the same fail() — they don't each
// implement their own reset.

const FALL_Y = -8 // below this, assume the player left the playable volume
const CAUGHT_FREEZE_DURATION = 900 // ms the caught screen holds before resetting position

export function createRespawnSystem({ player, hud, camera, setControlsEnabled }) {
  const checkpoint = { position: new THREE.Vector3(0, 0, 0), yaw: 0 }
  const listeners = new Set()
  let failing = false
  let failTimer = null

  function setCheckpoint(position, yaw = 0) {
    checkpoint.position.copy(position)
    checkpoint.yaw = yaw
  }

  function respawn() {
    player.setPose(checkpoint.position, checkpoint.yaw)
    // Skip the third-person camera's follow-lerp so it doesn't sweep the
    // whole level to catch up with the respawned player.
    camera.snap()
  }

  function fail(reason = 'caught') {
    if (failing) return
    failing = true
    if (setControlsEnabled) setControlsEnabled(false)
    if (hud && hud.showCaughtScreen) hud.showCaughtScreen(reason)

    failTimer = setTimeout(() => {
      respawn()
      if (hud && hud.hideCaughtScreen) hud.hideCaughtScreen()
      if (setControlsEnabled) setControlsEnabled(true)
      failing = false
      for (const fn of listeners) fn(reason)
    }, CAUGHT_FREEZE_DURATION)
  }

  function onFail(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function update() {
    if (player.mesh.position.y < FALL_Y) fail('fell')
  }

  function dispose() {
    clearTimeout(failTimer)
    listeners.clear()
  }

  return { setCheckpoint, fail, onFail, respawn, update, dispose }
}
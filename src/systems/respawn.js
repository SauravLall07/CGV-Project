import * as THREE from 'three'

// Checkpoint / respawn system (Phase 1 foundation): one registered checkpoint
// at a time, plus a generic fail() that returns the player to it instead of
// hard-failing the run. Guard detection (Phase 2), hazards (Phase 4) and the
// fell-off-the-train check all call the same fail() — they don't each
// implement their own reset.

const FALL_Y = -8 // below this, assume the player left the playable volume

export function createRespawnSystem({ player, hud, camera }) {
  const checkpoint = { position: new THREE.Vector3(0, 0, 0), yaw: 0 }
  const listeners = new Set()

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
    respawn()
    if (hud) hud.showToast(reason === 'fell' ? 'Fell off — back to checkpoint' : 'Caught — back to checkpoint')
    for (const fn of listeners) fn(reason)
  }

  function onFail(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function update() {
    if (player.mesh.position.y < FALL_Y) fail('fell')
  }

  function dispose() {
    listeners.clear()
  }

  return { setCheckpoint, fail, onFail, respawn, update, dispose }
}

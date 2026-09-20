import * as THREE from 'three'

const FALL_Y = -8
const CAUGHT_FREEZE_DURATION = 900

// One checkpoint is active at a time. Its restore callback is owned by the
// current level, while the generation token keeps delayed work inside that
// level/run. Pausing suspends a caught sequence until gameplay resumes.
export function createRespawnSystem({ player, hud, camera, timeSystem, onStateChange }) {
  let checkpoint = null
  const listeners = new Set()
  let failing = false
  let paused = false
  let failReason = null
  let failTimer = null
  let generation = 0

  function setCheckpoint(position, yaw = 0, { restore = () => {} } = {}) {
    checkpoint = {
      position: new THREE.Vector3().copy(position),
      yaw,
      restore,
      timeState: timeSystem?.captureCheckpointState()
    }
  }

  function respawn() {
    if (!checkpoint) return false
    checkpoint.restore()
    timeSystem?.resetForCheckpoint(checkpoint.timeState)
    player.setPose(checkpoint.position, checkpoint.yaw)
    camera?.setYaw?.(checkpoint.yaw)
    camera?.snap?.()
    return true
  }

  function invalidateTimer() {
    generation += 1
    if (failTimer !== null) clearTimeout(failTimer)
    failTimer = null
  }

  function cancel() {
    invalidateTimer()
    failing = false
    failReason = null
    hud?.hideCaughtScreen?.()
    onStateChange?.()
  }

  function reset() {
    cancel()
    checkpoint = null
    paused = false
  }

  function finishFailure(expectedGeneration) {
    if (expectedGeneration !== generation || paused || !failing) return
    failTimer = null
    const reason = failReason
    if (!respawn()) {
      cancel()
      return
    }

    failing = false
    failReason = null
    hud?.hideCaughtScreen?.()
    for (const listener of listeners) {
      listener(reason)
      if (expectedGeneration !== generation) return
    }
    onStateChange?.()
  }

  function scheduleFailure() {
    const expectedGeneration = generation
    hud?.showCaughtScreen?.(failReason)
    failTimer = setTimeout(() => finishFailure(expectedGeneration), CAUGHT_FREEZE_DURATION)
  }

  function fail(reason = 'caught') {
    if (failing || paused || !checkpoint) return false
    failing = true
    failReason = reason
    onStateChange?.()
    scheduleFailure()
    return true
  }

  function setPaused(value) {
    if (paused === value) return
    paused = value
    if (!failing) return

    invalidateTimer()
    if (paused) hud?.hideCaughtScreen?.()
    else scheduleFailure()
  }

  function onFail(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function update() {
    if (player.mesh.position.y < FALL_Y) fail('fell')
  }

  function dispose() {
    reset()
    listeners.clear()
  }

  return {
    setCheckpoint,
    fail,
    onFail,
    respawn,
    cancel,
    reset,
    setPaused,
    update,
    dispose,
    isFailing: () => failing
  }
}

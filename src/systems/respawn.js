import * as THREE from 'three'

// Shared checkpoint / death system.
//
// On failure:
// - preserve the currently constructed level
// - preserve opened doors, solved puzzles and collected/interacted state
// - restore the active checkpoint (or refuse fail if none is set)
//
// Lives are unlimited: death never ends the run or rebuilds Level 1.
// This keeps main's checkpoint-time-state, pause handling and
// generation-token protection for delayed respawn callbacks.

const FALL_Y = -8
const CAUGHT_FREEZE_DURATION = 900

export function createRespawnSystem({
  player,
  hud,
  camera,
  timeSystem,
  onStateChange,
  setControlsEnabled
}) {
  let checkpoint = null

  const listeners = new Set()

  let failing = false
  let paused = false
  let failReason = null
  let failTimer = null

  // Incremented whenever pending delayed work becomes invalid.
  // Prevents an old timeout from respawning the player after the level/run
  // has already changed.
  let generation = 0

  function setCheckpoint(position, yaw = 0, { restore = () => {}, afterTimeRestore = () => {} } = {}) {
    checkpoint = {
      position: new THREE.Vector3().copy(position),
      yaw,
      restore,
      afterTimeRestore,
      timeState: timeSystem?.captureCheckpointState?.()
    }
  }

  function respawn() {
    if (!checkpoint) return false

    // Move the player out of the hazard first. Level-owned cleanup is allowed
    // to reset things such as stealth/suspicion, but an error in that cleanup
    // must not strand the player at the point where they were caught.
    player.setPose(checkpoint.position, checkpoint.yaw)

    try {
      checkpoint.restore?.()
    } catch (error) {
      console.error('respawn: level checkpoint cleanup failed after player was restored', error)
    }

    try {
      timeSystem?.resetForCheckpoint?.(checkpoint.timeState)
    } catch (error) {
      console.error('respawn: time checkpoint cleanup failed after player was restored', error)
    }

    try {
      checkpoint.afterTimeRestore?.()
    } catch (error) {
      console.error('respawn: level time cleanup failed after player was restored', error)
    }

    // Restore the camera after the level callback has restored moving geometry
    // and collision bounds, so its snap uses the final checkpoint scene.
    camera?.setYaw?.(checkpoint.yaw)
    camera?.snap?.()

    return true
  }

  function invalidateTimer() {
    generation += 1

    if (failTimer !== null) {
      clearTimeout(failTimer)
    }

    failTimer = null
  }

  function cancel() {
    invalidateTimer()

    failing = false
    failReason = null

    hud?.hideCaughtScreen?.()

    if (setControlsEnabled) {
      setControlsEnabled(true)
    }

    onStateChange?.()
  }

  // Reset transient respawn state when leaving/rebuilding a level.
  function reset() {
    cancel()
    checkpoint = null
    paused = false
  }

  function finishFailure(expectedGeneration) {
    if (
      expectedGeneration !== generation ||
      paused ||
      !failing
    ) {
      return
    }

    failTimer = null

    const reason = failReason

    if (!respawn()) {
      cancel()
      return
    }

    failing = false
    failReason = null

    hud?.hideCaughtScreen?.()

    if (setControlsEnabled) {
      setControlsEnabled(true)
    }

    for (const listener of listeners) {
      listener(reason, { gameOver: false })

      // Listener may change/reset the current run.
      if (expectedGeneration !== generation) {
        return
      }
    }

    onStateChange?.()
  }

  function scheduleFailure() {
    if (!failing || paused) return

    const expectedGeneration = generation

    hud?.showCaughtScreen?.(failReason, { gameOver: false })

    failTimer = setTimeout(
      () => finishFailure(expectedGeneration),
      CAUGHT_FREEZE_DURATION
    )
  }

  function fail(reason = 'caught') {
    if (
      failing ||
      paused ||
      !checkpoint
    ) {
      return false
    }

    failing = true
    failReason = reason

    if (setControlsEnabled) {
      setControlsEnabled(false)
    }

    // Let main's central input-state system immediately see CAUGHT.
    onStateChange?.()

    scheduleFailure()

    return true
  }

  function setPaused(value) {
    if (paused === value) return

    paused = value

    if (!failing) return

    // Invalidate the old timeout whenever pause state changes.
    invalidateTimer()

    if (paused) {
      hud?.hideCaughtScreen?.()
    } else {
      scheduleFailure()
    }

    onStateChange?.()
  }

  function onFail(listener) {
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  }

  // Kept as no-ops so older call sites (restart / New Game) stay valid.
  function resetLives() {}
  function setGameOverHandler() {}

  function update() {
    if (player.mesh.position.y < FALL_Y) {
      fail('fell')
    }
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

    resetLives,
    setGameOverHandler,

    getLives: () => Infinity,
    getMaxLives: () => Infinity,

    update,
    dispose,

    isFailing: () => failing
  }
}

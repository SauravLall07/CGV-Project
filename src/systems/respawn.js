import * as THREE from 'three'

// Shared checkpoint / lives system.
//
// Normal failures:
// - consume one life
// - preserve the currently constructed level
// - preserve opened doors, solved puzzles and collected/interacted state
// - restore the active checkpoint
//
// Third failure:
// - consumes the final life
// - invokes the game-over handler
// - allows main.js to rebuild Level 1 from scratch
//
// This also keeps main's newer checkpoint-time-state, pause handling and
// generation-token protection for delayed respawn callbacks.

const FALL_Y = -8
const CAUGHT_FREEZE_DURATION = 900
const GAME_OVER_FREEZE_DURATION = 1450
const DEFAULT_LIVES = 3

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

  let lives = DEFAULT_LIVES
  let gameOverHandler = null
  let pendingGameOver = false

  function syncLives() {
    hud?.setLives?.(lives, DEFAULT_LIVES)
  }

  function setCheckpoint(position, yaw = 0, { restore = () => {} } = {}) {
    checkpoint = {
      position: new THREE.Vector3().copy(position),
      yaw,
      restore,
      timeState: timeSystem?.captureCheckpointState?.()
    }
  }

  function respawn() {
    if (!checkpoint) return false

    // Level-owned restore logic runs first. In Boarding this is also where
    // things such as stealth/suspicion can be cleared without rebuilding the
    // whole level.
    checkpoint.restore?.()

    timeSystem?.resetForCheckpoint?.(checkpoint.timeState)

    player.setPose(checkpoint.position, checkpoint.yaw)

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
    pendingGameOver = false

    hud?.hideCaughtScreen?.()

    if (setControlsEnabled) {
      setControlsEnabled(true)
    }

    onStateChange?.()
  }

  // Reset transient respawn state when leaving/rebuilding a level.
  // Lives are deliberately NOT reset here; resetLives() controls run lives.
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
    const gameOver = pendingGameOver

    // ------------------------------------------------------------
    // FINAL LIFE LOST
    // ------------------------------------------------------------
    if (gameOver) {
      // Notify listeners before the level is rebuilt.
      for (const listener of listeners) {
        listener(reason, {
          lives,
          gameOver: true
        })

        // A listener may have reset/rebuilt the system.
        if (expectedGeneration !== generation) {
          return
        }
      }

      hud?.hideCaughtScreen?.()

      failing = false
      failReason = null
      pendingGameOver = false

      if (setControlsEnabled) {
        setControlsEnabled(true)
      }

      onStateChange?.()

      // main.js / the current run owns the actual full restart.
      gameOverHandler?.({ reason })

      return
    }

    // ------------------------------------------------------------
    // ORDINARY LIFE LOST
    // ------------------------------------------------------------
    if (!respawn()) {
      cancel()
      return
    }

    failing = false
    failReason = null
    pendingGameOver = false

    hud?.hideCaughtScreen?.()

    if (setControlsEnabled) {
      setControlsEnabled(true)
    }

    for (const listener of listeners) {
      listener(reason, {
        lives,
        gameOver: false
      })

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

    hud?.showCaughtScreen?.(failReason, {
      lives,
      maxLives: DEFAULT_LIVES,
      gameOver: pendingGameOver
    })

    const duration = pendingGameOver
      ? GAME_OVER_FREEZE_DURATION
      : CAUGHT_FREEZE_DURATION

    failTimer = setTimeout(
      () => finishFailure(expectedGeneration),
      duration
    )
  }

  function resetLives(count = DEFAULT_LIVES) {
    lives = Math.max(
      1,
      Math.floor(count || DEFAULT_LIVES)
    )

    syncLives()
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

    lives = Math.max(0, lives - 1)
    pendingGameOver = lives <= 0

    syncLives()

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

  function setGameOverHandler(fn) {
    gameOverHandler = typeof fn === 'function'
      ? fn
      : null
  }

  function update() {
    if (player.mesh.position.y < FALL_Y) {
      fail('fell')
    }
  }

  function dispose() {
    reset()
    listeners.clear()
    gameOverHandler = null
  }

  syncLives()

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

    getLives: () => lives,
    getMaxLives: () => DEFAULT_LIVES,

    update,
    dispose,

    isFailing: () => failing
  }
}
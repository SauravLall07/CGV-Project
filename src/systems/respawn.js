import * as THREE from 'three'

// Shared checkpoint / lives system. Ordinary failures preserve the currently
// constructed level, so opened doors, solved puzzles and collected items stay
// exactly as they were. The third failure invokes the run-reset callback in
// main.js, which rebuilds Level 1 from scratch.

const FALL_Y = -8
const CAUGHT_FREEZE_DURATION = 900
const GAME_OVER_FREEZE_DURATION = 1450
const DEFAULT_LIVES = 3

export function createRespawnSystem({ player, hud, camera, setControlsEnabled }) {
  const checkpoint = { position: new THREE.Vector3(0, 0, 0), yaw: 0 }
  const listeners = new Set()
  let failing = false
  let failTimer = null
  let lives = DEFAULT_LIVES
  let gameOverHandler = null

  function syncLives() {
    hud?.setLives?.(lives, DEFAULT_LIVES)
  }

  function setCheckpoint(position, yaw = 0) {
    checkpoint.position.copy(position)
    checkpoint.yaw = yaw
  }

  function respawn() {
    player.setPose(checkpoint.position, checkpoint.yaw)
    camera.snap()
  }

  function resetLives(count = DEFAULT_LIVES) {
    lives = Math.max(1, Math.floor(count || DEFAULT_LIVES))
    syncLives()
  }

  function fail(reason = 'caught') {
    if (failing) return
    failing = true
    lives = Math.max(0, lives - 1)
    syncLives()

    const gameOver = lives <= 0
    if (setControlsEnabled) setControlsEnabled(false)
    hud?.showCaughtScreen?.(reason, { lives, maxLives: DEFAULT_LIVES, gameOver })

    failTimer = setTimeout(() => {
      if (gameOver) {
        // Notify stats/listeners before the level is rebuilt.
        for (const fn of listeners) fn(reason, { lives, gameOver: true })
        hud?.hideCaughtScreen?.()
        failing = false
        gameOverHandler?.({ reason })
        if (setControlsEnabled) setControlsEnabled(true)
        return
      }

      respawn()
      hud?.hideCaughtScreen?.()
      if (setControlsEnabled) setControlsEnabled(true)
      failing = false
      for (const fn of listeners) fn(reason, { lives, gameOver: false })
    }, gameOver ? GAME_OVER_FREEZE_DURATION : CAUGHT_FREEZE_DURATION)
  }

  function onFail(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function setGameOverHandler(fn) {
    gameOverHandler = typeof fn === 'function' ? fn : null
  }

  function update() {
    if (player.mesh.position.y < FALL_Y) fail('fell')
  }

  function dispose() {
    clearTimeout(failTimer)
    listeners.clear()
    gameOverHandler = null
  }

  syncLives()

  return {
    setCheckpoint,
    fail,
    onFail,
    respawn,
    resetLives,
    setGameOverHandler,
    getLives: () => lives,
    getMaxLives: () => DEFAULT_LIVES,
    update,
    dispose
  }
}

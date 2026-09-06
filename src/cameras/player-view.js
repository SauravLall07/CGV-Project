// Owns the two player cameras and which one is currently driving.
//
// Third-person remains the single owner of mouse input, pointer lock and the
// look angles; first-person borrows its yaw and pitch (see
// first-person-camera.js). That is what makes switching seamless — the view
// changes, the direction you are facing does not — and it means pausing,
// re-locking the mouse and the sensitivity/invert settings all keep working in
// first person without a second copy of that code.
//
// It deliberately exposes the same surface the rest of the game already calls
// on a camera — update/snap/setYaw/getYaw/setEnabled/requestLock/onLockLost —
// so the level manager, the respawn system and the interaction system take it
// in place of the third-person camera and need no knowledge of view modes.

import { createThirdPersonCamera } from './third-person-camera.js'
import { createFirstPersonCamera } from './first-person-camera.js'

export const VIEW_MODES = { THIRD: 'third', FIRST: 'first' }

export function createPlayerView({ camera, domElement, player, hud }) {
  const third = createThirdPersonCamera(camera, domElement)
  const first = createFirstPersonCamera(camera)

  let mode = VIEW_MODES.THIRD
  // Remembered from the last update so snap() can set the correct eye height
  // — the level manager and the respawn system call snap() without knowing
  // whether the player is crouched.
  let crouching = false

  function setMode(next, { announce = true } = {}) {
    if (next !== VIEW_MODES.FIRST && next !== VIEW_MODES.THIRD) return
    if (mode === next) return
    mode = next

    if (mode === VIEW_MODES.FIRST) {
      // The camera sits inside the character's head, so the body would fill
      // the screen from the inside.
      player.mesh.visible = false
      first.snap(crouching)
      if (announce && hud) hud.showToast('FIRST-PERSON VIEW', 900)
    } else {
      player.mesh.visible = true
      // Drop the follow smoothing, or returning to third person slides the
      // camera out from the player's head across the scene.
      third.snap()
      if (announce && hud) hud.showToast('THIRD-PERSON VIEW', 900)
    }
  }

  function toggle() {
    setMode(mode === VIEW_MODES.THIRD ? VIEW_MODES.FIRST : VIEW_MODES.THIRD)
  }

  function update(delta, playerMesh, collidables, options = {}) {
    crouching = Boolean(options.crouching)

    if (mode === VIEW_MODES.FIRST) {
      first.update(delta, playerMesh, {
        yaw: third.getYaw(),
        pitch: third.getPitch(),
        crouching
      })
    } else {
      third.update(delta, playerMesh, collidables)
    }
  }

  function snap() {
    third.snap()
    first.snap(crouching)
  }

  // Back to the default view with no toast — used when a run ends and the
  // title screen needs the player figure visible again in its cinematic shot.
  function reset() {
    setMode(VIEW_MODES.THIRD, { announce: false })
  }

  return {
    update,
    snap,
    reset,
    toggle,
    setMode,
    getMode: () => mode,
    // Pass-throughs: third-person owns look angles and pointer lock in both
    // views, so these are simply forwarded.
    setYaw: (value) => third.setYaw(value),
    getYaw: () => third.getYaw(),
    getPitch: () => third.getPitch(),
    setEnabled: (value) => third.setEnabled(value),
    requestLock: () => third.requestLock(),
    onLockLost: (fn) => third.onLockLost(fn),
    dispose: () => third.dispose()
  }
}

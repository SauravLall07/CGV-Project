// Tracks WASD + shift held state into a plain object other modules can
// read. No physics engine involved — movement is simple vector math done
// elsewhere using this state plus delta time.
const KEY_MAP = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run'
}

export function createKeyboardState() {
  const state = { forward: false, back: false, left: false, right: false, run: false }

  function onKeyDown(event) {
    const key = KEY_MAP[event.code]
    if (key) state[key] = true
  }

  function onKeyUp(event) {
    const key = KEY_MAP[event.code]
    if (key) state[key] = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }

  return { state, dispose }
}

// Tracks WASD + shift held state into a plain object other modules can
// read, and exposes an onKeyPress listener for single-press action triggers
// like time abilities and interactions.
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
  const listeners = new Map()

  function onKeyPress(code, callback) {
    if (!listeners.has(code)) listeners.set(code, new Set())
    listeners.get(code).add(callback)
    return () => {
      const set = listeners.get(code)
      if (set) {
        set.delete(callback)
        if (set.size === 0) listeners.delete(code)
      }
    }
  }

  function onKeyDown(event) {
    const key = KEY_MAP[event.code]
    if (key) state[key] = true

    if (!event.repeat && listeners.has(event.code)) {
      listeners.get(event.code).forEach((cb) => cb(event))
    }
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
    listeners.clear()
  }

  return { state, onKeyPress, dispose }
}


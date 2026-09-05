// Translates key presses into game actions.
//
// Nothing outside this module knows about key codes any more: the code →
// action map is derived from the rebindable bindings in core/settings.js and
// rebuilt whenever the player changes one in the settings screen. Held
// actions (movement, run) land in `state` for the player to read each frame;
// everything else is delivered through onAction(), which fires once per press
// — that is what the time abilities, interact and restart-level hook into.
//
// setEnabled(false) is what makes pausing safe: the held state is cleared so
// the player does not resume mid-stride, and no action fires while a menu is
// up.

import { ACTIONS, settings } from '../core/settings.js'

const HELD_ACTIONS = ACTIONS.filter((a) => a.held).map((a) => a.id)

export function createKeyboardState() {
  const state = {}
  for (const action of HELD_ACTIONS) state[action] = false

  const listeners = new Map()
  let codeToAction = new Map()
  let enabled = true

  function rebuildMap() {
    const map = new Map()
    const bindings = settings.getBindings()
    for (const action of ACTIONS) {
      for (const code of bindings[action.id] ?? []) {
        if (code) map.set(code, action.id)
      }
    }
    codeToAction = map
  }
  rebuildMap()

  // Rebinding mid-run would otherwise leave the old key's held state stuck on.
  const unsubscribe = settings.subscribe((_values, changed) => {
    if (changed === 'bindings' || changed === 'all') {
      rebuildMap()
      reset()
    }
  })

  function onAction(action, callback) {
    if (!listeners.has(action)) listeners.set(action, new Set())
    listeners.get(action).add(callback)
    return () => {
      const set = listeners.get(action)
      if (set) {
        set.delete(callback)
        if (set.size === 0) listeners.delete(action)
      }
    }
  }

  function reset() {
    for (const action of HELD_ACTIONS) state[action] = false
  }

  function onKeyDown(event) {
    if (!enabled) return
    const action = codeToAction.get(event.code)
    if (!action) return

    if (action in state) state[action] = true

    if (!event.repeat && listeners.has(action)) {
      listeners.get(action).forEach((cb) => cb(event))
    }
  }

  function onKeyUp(event) {
    const action = codeToAction.get(event.code)
    // Released keys clear even while disabled, so a key held as a menu opens
    // is not still "down" when the menu closes.
    if (action && action in state) state[action] = false
  }

  // Alt-tabbing away swallows the keyup, which would otherwise leave the
  // player sprinting into a wall on return.
  function onBlur() {
    reset()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  function setEnabled(value) {
    enabled = value
    if (!value) reset()
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    unsubscribe()
    listeners.clear()
  }

  return { state, onAction, setEnabled, reset, dispose }
}

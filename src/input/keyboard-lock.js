// Stops browser and OS shortcuts from firing while the game has focus.
//
// A page cannot cancel Ctrl+W, Ctrl+T or Ctrl+Tab with preventDefault(): the
// browser claims those before the document ever sees the keydown. That is why
// holding Ctrl to crouch and pressing W to walk forward used to close the tab
// mid-run.
//
// The one web API that does capture them is the Keyboard Lock API, and it
// only applies while the document is fullscreen. So "block browser shortcuts"
// here means: go fullscreen, then lock the keys the game binds plus the ones
// browsers hang shortcuts off. Both halves are best-effort — Firefox and
// Safari have no keyboard lock, and a fullscreen request outside a user
// gesture is refused — so every call is allowed to fail quietly and the game
// carries on. What it cannot do in any browser: Alt+F4, the Windows key and
// Ctrl+Alt+Del are handled by Windows itself, below the browser.
//
// Escape is deliberately never locked. Locking it would stop it releasing the
// pointer lock, and main.js pauses the game off exactly that signal.

import { settings, RESERVED_CODES } from '../core/settings.js'

// Locked regardless of the current bindings: the keys Chrome and Edge attach
// tab/window shortcuts to (Ctrl+W close, Ctrl+T new tab, Ctrl+N new window,
// Ctrl+R reload, Ctrl+P print, Ctrl+Shift+Q quit, Ctrl+1..9 tab switch), plus
// Tab itself for Ctrl+Tab and Alt+Tab. Function keys are left alone so F11
// and F12 keep working.
const BROWSER_SHORTCUT_CODES = [
  'KeyW', 'KeyT', 'KeyN', 'KeyR', 'KeyP', 'KeyS', 'KeyD', 'KeyF', 'KeyH',
  'KeyJ', 'KeyL', 'KeyO', 'KeyQ', 'KeyU',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'Tab', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight'
]

// Codes a browser handles itself, so binding one of them to a game action
// only works while the keyboard lock is up. The settings screen warns when the
// player picks one.
export const BROWSER_RESERVED_CODES = new Set([
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab'
])

function lockedCodes() {
  const codes = new Set(BROWSER_SHORTCUT_CODES)
  const bindings = settings.getBindings()
  for (const pair of Object.values(bindings)) {
    for (const code of pair) {
      if (code) codes.add(code)
    }
  }
  for (const code of RESERVED_CODES) codes.delete(code)
  return [...codes]
}

export function createKeyboardLock(element) {
  const supported = typeof navigator !== 'undefined' &&
    navigator.keyboard != null &&
    typeof navigator.keyboard.lock === 'function'

  // `wanted` is what the game asked for; the browser may currently be giving
  // us less than that (no fullscreen yet, request refused). Keeping the two
  // apart is what lets a later fullscreenchange re-apply the lock.
  let wanted = false

  function isFullscreen() {
    return document.fullscreenElement != null
  }

  function applyLock() {
    if (!supported || !wanted || !isFullscreen()) return
    if (!settings.get('captureShortcuts')) return
    // Rejects if fullscreen was lost between the check and the call, which is
    // fine — the fullscreenchange handler re-applies on the way back in.
    Promise.resolve(navigator.keyboard.lock(lockedCodes())).catch(() => {})
  }

  function releaseLock() {
    if (!supported) return
    try {
      navigator.keyboard.unlock()
    } catch {
      // Nothing was locked.
    }
  }

  // Rebinding a key changes which codes need capturing; re-lock so the new
  // key is covered and the old one goes back to the browser.
  const unsubscribe = settings.subscribe((values, changed) => {
    if (changed === 'bindings' || changed === 'all') applyLock()
    // Turning the option off mid-run should hand the keys back immediately,
    // without waiting for the next pause.
    if (changed === 'captureShortcuts' || changed === 'all') {
      if (values.captureShortcuts) applyLock()
      else releaseLock()
    }
  })

  function onFullscreenChange() {
    if (isFullscreen()) applyLock()
    else releaseLock()
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)

  // Must be called from a user gesture (the Play or Resume click) or the
  // fullscreen request is refused.
  function engage() {
    if (!settings.get('captureShortcuts')) {
      wanted = false
      return
    }
    wanted = true
    if (isFullscreen()) {
      applyLock()
      return
    }
    const request = element.requestFullscreen?.()
    // applyLock() runs off fullscreenchange either way; this only matters for
    // browsers that resolve the promise before firing the event.
    if (request && typeof request.then === 'function') {
      request.then(applyLock, () => {})
    }
  }

  function release({ exitFullscreen = true } = {}) {
    wanted = false
    releaseLock()
    if (exitFullscreen && isFullscreen()) {
      const result = document.exitFullscreen?.()
      if (result && typeof result.catch === 'function') result.catch(() => {})
    }
  }

  function dispose() {
    release()
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    unsubscribe()
  }

  return { engage, release, dispose, isSupported: () => supported }
}

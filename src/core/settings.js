// Persistent player settings: display options, camera/gameplay options and
// the rebindable key map. One module owns all of it so the settings screen
// (ui/settings-menu.js) has a single place to write to, and everything that
// consumes a setting — renderer, camera, keyboard, third-person camera —
// reads the same store and re-applies on change.
//
// Everything is persisted to localStorage under one key and reloaded on the
// next visit. Storage is wrapped in try/catch throughout: a browser with site
// data blocked should still run the game, just without remembering
// preferences between sessions.

const STORAGE_KEY = 'chrono-express:settings:v1'

// ---------------------------------------------------------------
// Option definitions
// ---------------------------------------------------------------
// The settings screen is generated from these, so adding a slider or a toggle
// here is all it takes for it to appear in the UI. There is no `apply` hook —
// consumers subscribe() and read the value they care about.

export const OPTION_DEFS = [
  {
    id: 'brightness',
    label: 'Brightness',
    hint: 'Tone-mapping exposure. Raise it if the carriages read too dark.',
    group: 'Display',
    type: 'slider',
    min: 0.4,
    max: 2.2,
    step: 0.05,
    format: (v) => `${Math.round((v / 1.15) * 100)}%`
  },
  {
    id: 'fov',
    label: 'Field of View',
    hint: 'Vertical FOV of the third-person camera.',
    group: 'Display',
    type: 'slider',
    min: 55,
    max: 95,
    step: 1,
    format: (v) => `${Math.round(v)}°`
  },
  {
    id: 'renderScale',
    label: 'Render Resolution',
    hint: 'Lower this first if the frame rate drops on weaker hardware.',
    group: 'Display',
    type: 'slider',
    min: 0.5,
    max: 1,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`
  },
  {
    id: 'shadows',
    label: 'Shadows',
    hint: 'Dynamic shadow casting from lamps and the train shed.',
    group: 'Display',
    type: 'toggle'
  },
  {
    id: 'softShadows',
    label: 'Soft Shadows',
    hint: 'Percentage-closer filtering. Costs a little performance.',
    group: 'Display',
    type: 'toggle',
    dependsOn: 'shadows'
  },
  {
    id: 'showStats',
    label: 'Performance Counter',
    hint: 'Shows frames per second in the corner of the HUD.',
    group: 'Display',
    type: 'toggle'
  },
  {
    id: 'mouseSensitivity',
    label: 'Mouse Sensitivity',
    hint: 'Multiplier on how far the camera swings per mouse movement.',
    group: 'Gameplay',
    type: 'slider',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`
  },
  {
    id: 'invertY',
    label: 'Invert Vertical Look',
    hint: 'Push the mouse forward to look up.',
    group: 'Gameplay',
    type: 'toggle'
  },
  {
    id: 'cameraDistance',
    label: 'Camera Distance',
    hint: 'How far the camera sits behind the player in open space.',
    group: 'Gameplay',
    type: 'slider',
    min: 3,
    max: 7,
    step: 0.1,
    format: (v) => `${v.toFixed(1)} m`
  }
]

export const DEFAULT_OPTIONS = {
  brightness: 1.15,
  fov: 60,
  renderScale: 1,
  shadows: true,
  softShadows: true,
  showStats: false,
  mouseSensitivity: 1,
  invertY: false,
  cameraDistance: 4.8
}

// ---------------------------------------------------------------
// Bindable actions
// ---------------------------------------------------------------
// Each action carries two binding slots (primary / alternate), which is what
// lets the time abilities keep both their number-row and their letter
// defaults. `held` marks the actions the player holds down — those feed the
// per-frame keyboard state; the rest fire once per press.

export const ACTIONS = [
  { id: 'forward', label: 'Move Forward', group: 'Movement', held: true },
  { id: 'back', label: 'Move Back', group: 'Movement', held: true },
  { id: 'left', label: 'Move Left', group: 'Movement', held: true },
  { id: 'right', label: 'Move Right', group: 'Movement', held: true },
  { id: 'run', label: 'Run', group: 'Movement', held: true },
  { id: 'interact', label: 'Interact', group: 'Actions' },
  { id: 'slow', label: 'Slow Time', group: 'Time Abilities' },
  { id: 'freeze', label: 'Freeze Time', group: 'Time Abilities' },
  { id: 'rewind', label: 'Rewind', group: 'Time Abilities' },
  { id: 'ghost', label: 'Time Ghost', group: 'Time Abilities' },
  { id: 'restart', label: 'Restart Level', group: 'System' }
]

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', null],
  slow: ['Digit1', 'KeyQ'],
  freeze: ['Digit2', 'KeyF'],
  rewind: ['Digit3', 'KeyC'],
  ghost: ['Digit4', 'KeyG'],
  restart: ['KeyR', null]
}

// Escape opens and closes the pause menu and cancels a rebind capture, so it
// is deliberately not rebindable — losing it would leave no way back out of a
// menu.
export const RESERVED_CODES = ['Escape']

// ---------------------------------------------------------------
// Key code to readable label
// ---------------------------------------------------------------

const CODE_LABELS = {
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  CapsLock: 'Caps',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Insert: 'Ins',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'Pg Up',
  PageDown: 'Pg Dn'
}

export function codeLabel(code) {
  if (!code) return '—'
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  return code
}

// A short "1/Q"-style summary of an action's bindings, used by the HUD's
// ability deck and the pause menu's control reference.
export function bindingLabel(codes) {
  const parts = (codes ?? []).filter(Boolean).map(codeLabel)
  return parts.length ? parts.join('/') : 'Unbound'
}

// ---------------------------------------------------------------
// Store
// ---------------------------------------------------------------

function cloneBindings(source) {
  const out = {}
  for (const action of ACTIONS) {
    const pair = source[action.id] ?? DEFAULT_BINDINGS[action.id] ?? [null, null]
    out[action.id] = [pair[0] ?? null, pair[1] ?? null]
  }
  return out
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function createSettingsStore() {
  const stored = readStorage() ?? {}

  // Validate rather than trust: a stale or hand-edited payload should fall
  // back to the default for that one field, not break the game.
  const values = { ...DEFAULT_OPTIONS }
  for (const def of OPTION_DEFS) {
    const value = stored.options?.[def.id]
    if (value === undefined) continue
    if (def.type === 'toggle' && typeof value === 'boolean') {
      values[def.id] = value
    } else if (def.type === 'slider' && typeof value === 'number' && Number.isFinite(value)) {
      values[def.id] = Math.min(def.max, Math.max(def.min, value))
    }
  }

  const bindings = cloneBindings(stored.bindings ?? {})
  const listeners = new Set()

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ options: values, bindings }))
    } catch {
      // Storage unavailable (private mode, blocked site data) — settings still
      // apply for this session, they just are not remembered.
    }
  }

  function notify(changed) {
    for (const fn of listeners) fn(values, changed)
  }

  function get(id) {
    return id === undefined ? values : values[id]
  }

  function set(id, value) {
    if (values[id] === value) return
    values[id] = value
    persist()
    notify(id)
  }

  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function getBindings() {
    return bindings
  }

  function getBinding(action) {
    return bindings[action] ?? [null, null]
  }

  // Which action (if any) already owns a code. The settings screen shows this
  // as a "was bound to X" note after stealing the key.
  function findConflict(code, exceptAction) {
    for (const action of ACTIONS) {
      if (action.id === exceptAction) continue
      if (bindings[action.id].includes(code)) return action.id
    }
    return null
  }

  function setBinding(action, slot, code) {
    if (!bindings[action] || (slot !== 0 && slot !== 1)) return
    if (code && RESERVED_CODES.includes(code)) return

    // A key can only drive one action, so clear it wherever else it sits —
    // including the other slot of this same action.
    if (code) {
      for (const other of ACTIONS) {
        const pair = bindings[other.id]
        for (let i = 0; i < 2; i += 1) {
          if (pair[i] === code && !(other.id === action && i === slot)) pair[i] = null
        }
      }
    }

    bindings[action][slot] = code ?? null
    persist()
    notify('bindings')
  }

  function clearBinding(action, slot) {
    setBinding(action, slot, null)
  }

  function resetOptions() {
    Object.assign(values, DEFAULT_OPTIONS)
    persist()
    notify('options')
  }

  function resetBindings() {
    Object.assign(bindings, cloneBindings(DEFAULT_BINDINGS))
    persist()
    notify('bindings')
  }

  function resetAll() {
    Object.assign(values, DEFAULT_OPTIONS)
    Object.assign(bindings, cloneBindings(DEFAULT_BINDINGS))
    persist()
    notify('all')
  }

  return {
    get,
    set,
    subscribe,
    getBindings,
    getBinding,
    findConflict,
    setBinding,
    clearBinding,
    resetOptions,
    resetBindings,
    resetAll
  }
}

// Single shared store — settings are global to the session by nature, and
// threading one instance through every constructor would be noise.
export const settings = createSettingsStore()

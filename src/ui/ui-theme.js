// Shared look and widgets for the menu overlays (title screen, pause menu,
// settings screen).
//
// The three of them are the same visual language — brass rules on a dark
// scrim, letterspaced serif headings — and the pause menu opens the same
// settings panel the title screen does, so the button states and form
// controls live here once instead of being re-typed per overlay.
//
// Everything is built with inline styles rather than a stylesheet, matching
// the rest of the UI layer: no CSS file has to be shipped or scoped, and each
// overlay stays a single self-contained module.

export const THEME = {
  brass: '#b08d3f',
  brassSoft: 'rgba(176, 141, 63, 0.4)',
  brassFaint: 'rgba(176, 141, 63, 0.12)',
  parchment: '#f0e6cf',
  parchmentDim: 'rgba(240, 230, 207, 0.55)',
  parchmentFaint: 'rgba(240, 230, 207, 0.28)',
  ink: 'rgba(6, 6, 16, 0.92)',
  serif: 'Georgia, "Times New Roman", "Palatino Linotype", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

// ---------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------
// `variant` only changes emphasis: 'primary' is the one action the screen is
// steering towards (NEW GAME, RESUME), 'ghost' is for the quieter ones
// (BACK, RESET), 'danger' tints the destructive one (QUIT TO TITLE) red.

const VARIANTS = {
  primary: { base: 'rgba(176, 141, 63, 0.14)', border: 'rgba(176, 141, 63, 0.55)', text: THEME.parchment, glow: 'rgba(176, 141, 63, 0.9)' },
  ghost: { base: 'rgba(255, 255, 255, 0.03)', border: 'rgba(240, 230, 207, 0.18)', text: 'rgba(240, 230, 207, 0.8)', glow: 'rgba(240, 230, 207, 0.5)' },
  danger: { base: 'rgba(180, 60, 60, 0.10)', border: 'rgba(220, 90, 90, 0.35)', text: 'rgba(255, 205, 205, 0.85)', glow: 'rgba(230, 100, 100, 0.75)' }
}

export function createButton(label, { variant = 'primary', onClick, wide = false, size = 'medium' } = {}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary
  const button = document.createElement('button')
  button.textContent = label
  button.type = 'button'

  const padding = size === 'large'
    ? 'clamp(12px, 2vh, 18px) clamp(32px, 7vw, 64px)'
    : size === 'small' ? '7px 14px' : '10px 26px'

  Object.assign(button.style, {
    padding,
    width: wide ? '100%' : 'auto',
    fontSize: size === 'large' ? 'clamp(14px, 2vw, 20px)' : size === 'small' ? '11px' : '13px',
    fontWeight: '700',
    letterSpacing: size === 'large' ? '0.22em' : '0.16em',
    color: v.text,
    background: v.base,
    border: `1px solid ${v.border}`,
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 120ms ease, color 180ms ease',
    textTransform: 'uppercase',
    fontFamily: THEME.sans,
    outline: 'none',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)'
  })

  function paint(state) {
    if (button.disabled) {
      button.style.background = 'rgba(255, 255, 255, 0.02)'
      button.style.borderColor = 'rgba(240, 230, 207, 0.08)'
      button.style.color = 'rgba(240, 230, 207, 0.22)'
      button.style.boxShadow = 'none'
      button.style.transform = 'scale(1)'
      button.style.cursor = 'default'
      return
    }
    button.style.cursor = 'pointer'
    if (state === 'hover') {
      button.style.background = v.base.replace(/[\d.]+\)$/, '0.28)')
      button.style.borderColor = v.glow
      button.style.boxShadow = `0 0 20px ${v.base.replace(/[\d.]+\)$/, '0.35)')}`
      button.style.transform = 'scale(1.03)'
      button.style.color = variant === 'primary' ? '#fff5e0' : v.text
    } else if (state === 'active') {
      button.style.transform = 'scale(0.97)'
      button.style.background = v.base.replace(/[\d.]+\)$/, '0.38)')
    } else {
      button.style.background = v.base
      button.style.borderColor = v.border
      button.style.boxShadow = 'none'
      button.style.transform = 'scale(1)'
      button.style.color = v.text
    }
  }

  button.addEventListener('mouseenter', () => paint('hover'))
  button.addEventListener('mouseleave', () => paint('default'))
  button.addEventListener('mousedown', () => paint('active'))
  button.addEventListener('mouseup', () => paint('hover'))
  button.addEventListener('focus', () => paint('hover'))
  button.addEventListener('blur', () => paint('default'))
  if (onClick) button.addEventListener('click', onClick)

  // Re-paint after an external `disabled` change so the greyed state sticks.
  button.refresh = () => paint('default')

  return button
}

// ---------------------------------------------------------------
// Headings and rules
// ---------------------------------------------------------------

export function createHeading(text, { size = 'clamp(20px, 3.2vw, 32px)' } = {}) {
  const el = document.createElement('h2')
  el.textContent = text
  Object.assign(el.style, {
    margin: '0',
    fontFamily: THEME.serif,
    fontSize: size,
    fontWeight: '700',
    letterSpacing: '0.18em',
    color: THEME.parchment,
    textTransform: 'uppercase',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.8)'
  })
  return el
}

export function createSectionLabel(text) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.28em',
    color: 'rgba(176, 141, 63, 0.8)',
    textTransform: 'uppercase',
    padding: '2px 0 8px',
    borderBottom: `1px solid ${THEME.brassFaint}`,
    marginBottom: '10px'
  })
  return el
}

// ---------------------------------------------------------------
// Settings rows
// ---------------------------------------------------------------
// A row is [label + hint] on the left, control on the right. Sliders and
// toggles share it so the settings screen lines up on one grid.

function createRow(label, hint) {
  const row = document.createElement('div')
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '18px',
    padding: '10px 2px',
    borderBottom: '1px solid rgba(240, 230, 207, 0.06)'
  })

  const text = document.createElement('div')
  Object.assign(text.style, { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' })

  const title = document.createElement('span')
  title.textContent = label
  Object.assign(title.style, {
    fontSize: '13px',
    fontWeight: '600',
    color: THEME.parchment,
    letterSpacing: '0.04em'
  })
  text.appendChild(title)

  if (hint) {
    const sub = document.createElement('span')
    sub.textContent = hint
    Object.assign(sub.style, {
      fontSize: '11px',
      color: THEME.parchmentFaint,
      lineHeight: '1.4',
      fontWeight: '400'
    })
    text.appendChild(sub)
  }

  row.appendChild(text)
  return { row, text }
}

export function createSliderRow({ label, hint, min, max, step, value, format, onInput }) {
  const { row } = createRow(label, hint)

  const control = document.createElement('div')
  Object.assign(control.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: '0 0 auto'
  })

  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  Object.assign(input.style, {
    width: 'clamp(120px, 18vw, 200px)',
    accentColor: THEME.brass,
    cursor: 'pointer',
    background: 'transparent'
  })

  const readout = document.createElement('span')
  Object.assign(readout.style, {
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
    color: 'rgba(176, 141, 63, 0.95)',
    fontWeight: '700',
    minWidth: '56px',
    textAlign: 'right'
  })

  function render(v) {
    readout.textContent = format ? format(v) : String(v)
  }
  render(value)

  input.addEventListener('input', () => {
    const v = Number(input.value)
    render(v)
    if (onInput) onInput(v)
  })

  control.append(input, readout)
  row.appendChild(control)

  return {
    row,
    setValue(v) {
      input.value = String(v)
      render(v)
    },
    setEnabled(enabled) {
      input.disabled = !enabled
      row.style.opacity = enabled ? '1' : '0.4'
    }
  }
}

export function createToggleRow({ label, hint, value, onChange }) {
  const { row } = createRow(label, hint)

  const track = document.createElement('button')
  track.type = 'button'
  track.setAttribute('role', 'switch')
  Object.assign(track.style, {
    position: 'relative',
    width: '46px',
    height: '24px',
    flex: '0 0 auto',
    borderRadius: '12px',
    border: `1px solid ${THEME.brassSoft}`,
    background: 'rgba(0, 0, 0, 0.35)',
    cursor: 'pointer',
    transition: 'background 180ms ease, border-color 180ms ease',
    outline: 'none',
    padding: '0'
  })

  const knob = document.createElement('span')
  Object.assign(knob.style, {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: THEME.parchmentDim,
    transition: 'transform 180ms ease, background 180ms ease'
  })
  track.appendChild(knob)

  let state = Boolean(value)

  function paint() {
    track.setAttribute('aria-checked', String(state))
    knob.style.transform = state ? 'translateX(22px)' : 'translateX(0)'
    knob.style.background = state ? THEME.brass : THEME.parchmentFaint
    track.style.background = state ? 'rgba(176, 141, 63, 0.22)' : 'rgba(0, 0, 0, 0.35)'
    track.style.borderColor = state ? THEME.brass : THEME.brassSoft
  }
  paint()

  track.addEventListener('click', () => {
    if (track.disabled) return
    state = !state
    paint()
    if (onChange) onChange(state)
  })

  row.appendChild(track)

  return {
    row,
    setValue(v) {
      state = Boolean(v)
      paint()
    },
    setEnabled(enabled) {
      track.disabled = !enabled
      row.style.opacity = enabled ? '1' : '0.4'
      track.style.cursor = enabled ? 'pointer' : 'default'
    }
  }
}

// A key-cap style box, used for both the rebind slots and the pause menu's
// read-only control reference.
export function createKeyCap(text, { interactive = false } = {}) {
  const cap = document.createElement(interactive ? 'button' : 'span')
  if (interactive) cap.type = 'button'
  cap.textContent = text
  Object.assign(cap.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '54px',
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    fontFamily: THEME.sans,
    color: THEME.parchment,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(240, 230, 207, 0.18)',
    borderRadius: '4px',
    boxShadow: 'inset 0 -2px 0 rgba(0, 0, 0, 0.35)',
    cursor: interactive ? 'pointer' : 'default',
    outline: 'none',
    transition: 'all 150ms ease'
  })
  return cap
}

// The dimmed, blurred full-screen backdrop every overlay sits on.
export function createOverlayRoot(id, zIndex) {
  const root = document.createElement('div')
  root.id = id
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: String(zIndex),
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(4, 5, 12, 0.72)',
    backdropFilter: 'blur(7px)',
    WebkitBackdropFilter: 'blur(7px)',
    opacity: '0',
    transition: 'opacity 220ms ease',
    userSelect: 'none',
    fontFamily: THEME.sans,
    color: THEME.parchment
  })
  return root
}

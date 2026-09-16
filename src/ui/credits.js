import { THEME, createOverlayRoot } from './ui-theme.js'

// Rolling credits overlay. Two entry points share this panel: the title
// screen's CREDITS button (solid dark scrim) and the Complete state (a
// translucent veil over the frozen last frame of the heist). Any click or
// key dismisses it; the composition root decides whether that means "back
// to the menu overlay" or "quit the run to title".

const SCROLL_PX_PER_SEC = 50
const DISMISS_GRACE_MS = 500

function addBlock(parent, children) {
  const block = document.createElement('div')
  Object.assign(block.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    width: '100%'
  })
  for (const child of children) block.appendChild(child)
  parent.appendChild(block)
  return block
}

function heading(text, size = 'clamp(22px, 4vw, 42px)') {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontFamily: THEME.serif,
    fontSize: size,
    fontWeight: '700',
    letterSpacing: '0.18em',
    color: THEME.parchment,
    textTransform: 'uppercase',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.8)',
    textAlign: 'center'
  })
  return el
}

function label(text) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.28em',
    color: 'rgba(176, 141, 63, 0.85)',
    textTransform: 'uppercase',
    paddingBottom: '6px',
    borderBottom: `1px solid ${THEME.brassFaint}`,
    marginBottom: '4px'
  })
  return el
}

function line(text, { dim = false, italic = false, size = '15px' } = {}) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontSize: size,
    lineHeight: '1.55',
    letterSpacing: '0.04em',
    color: dim ? THEME.parchmentFaint : THEME.parchmentDim,
    fontStyle: italic ? 'italic' : 'normal',
    textAlign: 'center',
    maxWidth: '36em'
  })
  return el
}

function spacer(px = 36) {
  const el = document.createElement('div')
  el.style.height = `${px}px`
  return el
}

function buildRollContent() {
  const roll = document.createElement('div')
  Object.assign(roll.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '28px',
    width: 'min(92vw, 640px)',
    padding: '0 24px 50vh',
    textAlign: 'center',
    willChange: 'transform'
  })

  addBlock(roll, [
    heading('Chrono Express'),
    line('A Time-Manipulation Stealth Heist', { size: '13px' })
  ])

  addBlock(roll, [
    label('Music'),
    line('All music by Kevin MacLeod (incompetech.com)'),
    line('Licensed under Creative Commons: By Attribution 4.0', { dim: true }),
    line('creativecommons.org/licenses/by/4.0/', { dim: true, size: '13px' }),
    spacer(8),
    line('"Constance" — Level 1 (Boarding)'),
    line('"Mistake the Getaway" — Level 2 (Moving Heist)'),
    line('"Final Count" — Level 3 (Timewreck)'),
    line('"Vibing Over Venus" — Main Menu'),
    line('"Take a Chance" — Victory')
  ])

  addBlock(roll, [
    label('Sound Effects'),
    line('"Freeze Sound Effect FX" by antonsoederberg (Freesound.org) — CC0'),
    line('"Quick Zoom Slow Down" by bevibeldesign (Freesound.org) — CC0'),
    line('"Vinyl Rewind" by tasmanianpower (Freesound.org) — CC0'),
    line('"Ghost Noise" by whiprealgood (Freesound.org) — CC0')
  ])

  // --- PLACEHOLDER: team credits ---
  // Replace the lines below with names and roles before shipping.
  addBlock(roll, [
    label('Cast & Crew'),
    line('[ Placeholder: add team names and roles here ]', { italic: true, dim: true })
  ])

  // --- PLACEHOLDER: third-party assets ---
  addBlock(roll, [
    label('Additional Assets'),
    line('Physics library: cannon-es'),
    line('Built with Three.js', { size: '13px' })
  ])


  addBlock(roll, [
    spacer(24),
    line('Press any key to return to menu', { size: '12px' })
  ])

  return roll
}

export function createCredits({ onDismiss } = {}) {
  const root = createOverlayRoot('credits', 90)
  root.style.overflow = 'hidden'
  root.style.alignItems = 'flex-start'
  root.style.justifyContent = 'center'

  const roll = buildRollContent()
  root.appendChild(roll)
  document.body.appendChild(root)

  let isOpen = false
  let source = 'menu'
  let ignoreUntil = 0

  function applyBackdrop() {
    if (source === 'complete') {
      // Translucent veil only — the frozen heist frame stays readable
      // through it. No blur: that would smear the last shot.
      root.style.background = 'rgba(0, 0, 0, 0.6)'
      root.style.backdropFilter = 'none'
      root.style.WebkitBackdropFilter = 'none'
    } else {
      root.style.background = 'rgba(4, 5, 12, 0.94)'
      root.style.backdropFilter = 'blur(7px)'
      root.style.WebkitBackdropFilter = 'blur(7px)'
    }
  }

  function startRoll() {
    roll.style.animation = 'none'
    void roll.offsetHeight
    const distance = roll.offsetHeight + window.innerHeight
    const duration = Math.max(12, distance / SCROLL_PX_PER_SEC)
    roll.style.animation = `cx-credits-roll ${duration}s linear forwards`
  }

  function open({ source: nextSource = 'menu' } = {}) {
    if (isOpen) return
    source = nextSource
    isOpen = true
    ignoreUntil = performance.now() + DISMISS_GRACE_MS
    applyBackdrop()
    root.style.display = 'flex'
    root.style.pointerEvents = 'auto'
    void root.offsetWidth
    root.style.opacity = '1'
    startRoll()
  }

  function close() {
    if (!isOpen) return
    isOpen = false
    roll.style.animation = 'none'
    root.style.opacity = '0'
    root.style.pointerEvents = 'none'
    const dismissedFrom = source
    setTimeout(() => {
      if (!isOpen) root.style.display = 'none'
    }, 220)
    if (onDismiss) onDismiss(dismissedFrom)
  }

  function tryDismiss(event) {
    if (!isOpen) return
    if (performance.now() < ignoreUntil) {
      if (event) event.stopPropagation()
      return
    }
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    close()
  }

  function onKeyDown(event) {
    if (!isOpen || event.repeat) return
    tryDismiss(event)
  }

  function onClick(event) {
    tryDismiss(event)
  }

  window.addEventListener('keydown', onKeyDown, true)
  root.addEventListener('click', onClick)

  function dispose() {
    window.removeEventListener('keydown', onKeyDown, true)
    root.remove()
  }

  return {
    open,
    close,
    dispose,
    get isOpen() { return isOpen }
  }
}

// Settings screen — one overlay shared by the title screen and the pause
// menu, so there is a single implementation of the options and the key
// rebinder rather than one per entry point.
//
// Every control writes straight through to core/settings.js, which persists to
// localStorage and notifies its subscribers; the renderer, camera and input
// modules pick the change up from there. Nothing here reaches into the game
// directly, which is why the same panel works before a level exists (title
// screen) and mid-run (pause menu).
//
// While it is open the panel swallows keydown at the capture phase, so the
// title screen's Enter-to-start and the game's own key handlers cannot fire
// underneath it — and so the rebinder can grab any key the player presses,
// including ones the game already uses.

import {
  settings, OPTION_DEFS, ACTIONS, RESERVED_CODES, codeLabel
} from '../core/settings.js'
import { BROWSER_RESERVED_CODES } from '../input/keyboard-lock.js'
import {
  THEME, createButton, createHeading, createSectionLabel,
  createSliderRow, createToggleRow, createKeyCap, createOverlayRoot,
  applyScrollbarTheme
} from './ui-theme.js'

const TABS = [
  { id: 'display', label: 'Display' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'controls', label: 'Controls' }
]

// Shown at the foot of the Controls tab: the parts of the scheme that are
// not rebindable, so the list does not look like it is missing entries.
const FIXED_CONTROLS = [
  { label: 'Look Around', keys: 'Mouse' },
  { label: 'Pause / Back', keys: 'Esc' },
  { label: 'Re-capture Mouse', keys: 'Click' }
]

export function createSettingsMenu() {
  const root = createOverlayRoot('settings-menu', 80)

  // ---------------------------------------------------------------
  // Panel chrome
  // ---------------------------------------------------------------
  const panel = document.createElement('div')
  Object.assign(panel.style, {
    display: 'flex',
    flexDirection: 'column',
    width: 'min(92vw, 820px)',
    maxHeight: '88vh',
    background: 'linear-gradient(180deg, rgba(12, 13, 22, 0.97), rgba(8, 8, 14, 0.97))',
    border: `1px solid ${THEME.brassSoft}`,
    borderRadius: '4px',
    boxShadow: '0 30px 90px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(240, 230, 207, 0.06)',
    overflow: 'hidden',
    transform: 'translateY(12px) scale(0.99)',
    transition: 'transform 220ms ease'
  })

  const header = document.createElement('div')
  Object.assign(header.style, {
    padding: 'clamp(16px, 3vh, 26px) clamp(18px, 3.5vw, 34px) 0',
    borderBottom: `1px solid ${THEME.brassFaint}`
  })

  const headingRow = document.createElement('div')
  Object.assign(headingRow.style, {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap'
  })

  const subtitle = document.createElement('div')
  subtitle.textContent = 'Saved automatically to this browser'
  Object.assign(subtitle.style, {
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: THEME.parchmentFaint
  })

  headingRow.append(createHeading('Settings'), subtitle)

  // Tab strip
  const tabRow = document.createElement('div')
  Object.assign(tabRow.style, {
    display: 'flex',
    gap: 'clamp(6px, 2vw, 20px)',
    marginTop: '16px'
  })

  let activeTab = TABS[0].id
  const tabButtons = new Map()

  for (const tab of TABS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = tab.label
    Object.assign(button.style, {
      background: 'none',
      border: 'none',
      borderBottom: '2px solid transparent',
      padding: '8px 4px',
      fontSize: '12px',
      fontWeight: '700',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: THEME.parchmentFaint,
      cursor: 'pointer',
      fontFamily: THEME.sans,
      transition: 'color 160ms ease, border-color 160ms ease',
      outline: 'none'
    })
    button.addEventListener('click', () => selectTab(tab.id))
    button.addEventListener('mouseenter', () => {
      if (activeTab !== tab.id) button.style.color = THEME.parchmentDim
    })
    button.addEventListener('mouseleave', () => {
      if (activeTab !== tab.id) button.style.color = THEME.parchmentFaint
    })
    tabButtons.set(tab.id, button)
    tabRow.appendChild(button)
  }

  header.append(headingRow, tabRow)

  // Scrolling body
  const body = document.createElement('div')
  Object.assign(body.style, {
    padding: 'clamp(12px, 2.5vh, 22px) clamp(18px, 3.5vw, 34px)',
    overflowY: 'auto',
    flex: '1 1 auto',
    minHeight: '0'
  })
  applyScrollbarTheme(body)

  // Footer
  const footer = document.createElement('div')
  Object.assign(footer.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: 'clamp(12px, 2vh, 18px) clamp(18px, 3.5vw, 34px)',
    borderTop: `1px solid ${THEME.brassFaint}`,
    background: 'rgba(0, 0, 0, 0.25)'
  })

  const resetButton = createButton('Reset to Defaults', {
    variant: 'ghost',
    size: 'small',
    onClick: () => {
      if (activeTab === 'controls') settings.resetBindings()
      else settings.resetOptions()
      render()
    }
  })

  const backButton = createButton('Back', { variant: 'primary', onClick: () => close() })

  footer.append(resetButton, backButton)
  panel.append(header, body, footer)
  root.appendChild(panel)
  document.body.appendChild(root)

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  let isOpen = false
  let onCloseCallback = null
  // While non-null the panel is waiting for the next key press to bind:
  // { action, slot, cap }.
  let capture = null

  // Conflict notice ("X was unbound from Y"). It lives out here because
  // committing a rebind re-renders the whole Controls tab — a notice element
  // owned by that tab would be detached before the message reached it.
  const notice = document.createElement('div')
  Object.assign(notice.style, {
    fontSize: '11px',
    color: 'rgba(176, 141, 63, 0.95)',
    minHeight: '14px',
    marginBottom: '6px',
    opacity: '0',
    transition: 'opacity 200ms ease'
  })

  let noticeTimer = null
  function flashNotice(text) {
    notice.textContent = text
    notice.style.opacity = '1'
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.style.opacity = '0' }, 2600)
  }

  function clearNotice() {
    clearTimeout(noticeTimer)
    notice.textContent = ''
    notice.style.opacity = '0'
  }

  // ---------------------------------------------------------------
  // Tab content
  // ---------------------------------------------------------------

  function buildOptionsTab(group) {
    const wrap = document.createElement('div')
    const defs = OPTION_DEFS.filter((d) => d.group === group)
    const controls = []

    for (const def of defs) {
      const shared = { label: def.label, hint: def.hint, value: settings.get(def.id) }
      const control = def.type === 'toggle'
        ? createToggleRow({ ...shared, onChange: (v) => { settings.set(def.id, v); syncDependencies() } })
        : createSliderRow({
          ...shared,
          min: def.min,
          max: def.max,
          step: def.step,
          format: def.format,
          onInput: (v) => settings.set(def.id, v)
        })
      controls.push({ def, control })
      wrap.appendChild(control.row)
    }

    // A dependent option (Soft Shadows under Shadows) greys out rather than
    // disappearing, so its state is still readable when the parent is off.
    function syncDependencies() {
      for (const { def, control } of controls) {
        if (!def.dependsOn) continue
        control.setEnabled(Boolean(settings.get(def.dependsOn)))
      }
    }
    syncDependencies()

    return wrap
  }

  function buildControlsTab() {
    const wrap = document.createElement('div')

    const help = document.createElement('div')
    help.textContent = 'Click a key to rebind it. Esc cancels, Backspace clears the slot.'
    Object.assign(help.style, {
      fontSize: '11px',
      color: THEME.parchmentFaint,
      marginBottom: '14px',
      letterSpacing: '0.04em'
    })
    wrap.appendChild(help)

    wrap.appendChild(notice)

    // Group headings in declaration order.
    const groups = []
    for (const action of ACTIONS) {
      let group = groups.find((g) => g.name === action.group)
      if (!group) {
        group = { name: action.group, actions: [] }
        groups.push(group)
      }
      group.actions.push(action)
    }

    for (const group of groups) {
      const section = document.createElement('div')
      section.style.marginBottom = '18px'
      section.appendChild(createSectionLabel(group.name))

      for (const action of group.actions) {
        section.appendChild(buildBindingRow(action))
      }
      wrap.appendChild(section)
    }

    // Fixed, non-rebindable controls.
    const fixed = document.createElement('div')
    fixed.appendChild(createSectionLabel('Fixed'))
    for (const entry of FIXED_CONTROLS) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 2px',
        borderBottom: '1px solid rgba(240, 230, 207, 0.06)',
        opacity: '0.55'
      })
      const label = document.createElement('span')
      label.textContent = entry.label
      Object.assign(label.style, { fontSize: '13px', color: THEME.parchment })
      const cap = createKeyCap(entry.keys)
      row.append(label, cap)
      fixed.appendChild(row)
    }
    wrap.appendChild(fixed)

    return wrap
  }

  function buildBindingRow(action) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      padding: '7px 2px',
      borderBottom: '1px solid rgba(240, 230, 207, 0.06)'
    })

    const label = document.createElement('span')
    label.textContent = action.label
    Object.assign(label.style, { fontSize: '13px', color: THEME.parchment, fontWeight: '600' })

    const slots = document.createElement('div')
    Object.assign(slots.style, { display: 'flex', gap: '8px', flex: '0 0 auto' })

    for (let slot = 0; slot < 2; slot += 1) {
      const cap = createKeyCap(codeLabel(settings.getBinding(action.id)[slot]), { interactive: true })
      if (!settings.getBinding(action.id)[slot]) cap.style.color = THEME.parchmentFaint

      cap.addEventListener('mouseenter', () => {
        if (capture) return
        cap.style.borderColor = THEME.brass
        cap.style.background = 'rgba(176, 141, 63, 0.15)'
      })
      cap.addEventListener('mouseleave', () => {
        if (capture && capture.cap === cap) return
        cap.style.borderColor = 'rgba(240, 230, 207, 0.18)'
        cap.style.background = 'rgba(255, 255, 255, 0.05)'
      })
      cap.addEventListener('click', () => beginCapture(action.id, slot, cap))
      slots.appendChild(cap)
    }

    row.append(label, slots)
    return row
  }

  // ---------------------------------------------------------------
  // Rebinding
  // ---------------------------------------------------------------

  function beginCapture(action, slot, cap) {
    if (capture) cancelCapture()
    capture = { action, slot, cap }
    cap.textContent = 'Press a key…'
    cap.style.borderColor = THEME.brass
    cap.style.background = 'rgba(176, 141, 63, 0.25)'
    cap.style.color = '#fff5e0'
  }

  function cancelCapture() {
    if (!capture) return
    capture = null
    render() // repaint the caps from the store
  }

  function commitCapture(code) {
    if (!capture) return
    const { action, slot } = capture
    const conflict = code ? settings.findConflict(code, action) : null

    settings.setBinding(action, slot, code)
    capture = null
    render()

    if (conflict) {
      const stolen = ACTIONS.find((a) => a.id === conflict)
      flashNotice(`${codeLabel(code)} was unbound from ${stolen ? stolen.label : conflict}.`)
    } else if (code && BROWSER_RESERVED_CODES.has(code)) {
      // Ctrl, Alt, the Windows key and Tab drive browser shortcuts — Ctrl+W
      // closes the tab — and only reach the game while it is capturing them.
      flashNotice(
        settings.get('captureShortcuts')
          ? `${codeLabel(code)} is a browser shortcut key; it only works fullscreen.`
          : `${codeLabel(code)} is a browser shortcut key. Turn on Capture Browser Shortcuts, or it may close the tab.`
      )
    }
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------

  function render() {
    for (const tab of TABS) {
      const button = tabButtons.get(tab.id)
      const active = tab.id === activeTab
      button.style.color = active ? THEME.parchment : THEME.parchmentFaint
      button.style.borderBottomColor = active ? THEME.brass : 'transparent'
    }

    body.replaceChildren()
    if (activeTab === 'controls') {
      body.appendChild(buildControlsTab())
      resetButton.textContent = 'Reset Key Bindings'
    } else {
      body.appendChild(buildOptionsTab(activeTab === 'display' ? 'Display' : 'Gameplay'))
      resetButton.textContent = 'Reset to Defaults'
    }
  }

  function selectTab(id) {
    if (activeTab === id) return
    cancelCapture()
    clearNotice()
    activeTab = id
    body.scrollTop = 0
    render()
  }

  // ---------------------------------------------------------------
  // Key handling
  // ---------------------------------------------------------------
  // Capture phase on window: while the panel is open nothing underneath it
  // (title screen, pause menu, gameplay) sees a key press. Default actions are
  // left alone unless a rebind is being captured, so sliders still respond to
  // the arrow keys when focused.

  function onKeyDownCapture(event) {
    if (!isOpen) return
    event.stopPropagation()

    if (capture) {
      event.preventDefault()
      if (event.code === 'Escape') {
        cancelCapture()
      } else if (event.code === 'Backspace' || event.code === 'Delete') {
        commitCapture(null)
      } else if (!RESERVED_CODES.includes(event.code)) {
        commitCapture(event.code)
      }
      return
    }

    if (event.code === 'Escape') {
      event.preventDefault()
      close()
    }
  }
  window.addEventListener('keydown', onKeyDownCapture, true)

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------

  function open(onClose) {
    onCloseCallback = onClose ?? null
    isOpen = true
    activeTab = TABS[0].id
    clearNotice()
    render()
    root.style.display = 'flex'
    void root.offsetWidth
    root.style.opacity = '1'
    panel.style.transform = 'translateY(0) scale(1)'
  }

  function close() {
    if (!isOpen) return
    isOpen = false
    capture = null
    root.style.opacity = '0'
    panel.style.transform = 'translateY(12px) scale(0.99)'
    setTimeout(() => {
      if (!isOpen) root.style.display = 'none'
    }, 240)
    const callback = onCloseCallback
    onCloseCallback = null
    if (callback) callback()
  }

  function dispose() {
    clearTimeout(noticeTimer)
    window.removeEventListener('keydown', onKeyDownCapture, true)
    root.remove()
  }

  return {
    open,
    close,
    dispose,
    get isOpen() { return isOpen }
  }
}

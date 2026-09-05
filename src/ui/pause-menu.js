// Pause menu — Esc during gameplay.
//
// It is the single place the player can stop, see where they are in the run
// and act on it: resume, restart the current level, open the settings screen,
// or bail out to the title screen. The status column is a snapshot taken when
// the menu opens (the run clock and every gameplay system are frozen behind
// it, so there is nothing to keep re-reading), and the control reference is
// generated from the live key bindings, so it stays correct after a rebind.
//
// The menu itself owns nothing gameplay-side: main.js hands it callbacks and
// a status getter, which keeps the "what does pausing actually stop" decision
// in the composition root where the loop lives.

import { ACTIONS, bindingLabel, codeLabel, settings } from '../core/settings.js'
import {
  THEME, createButton, createHeading, createSectionLabel,
  createKeyCap, createOverlayRoot, applyScrollbarTheme
} from './ui-theme.js'

// Level-manager states rendered as something a player would recognise.
const LEVEL_NAMES = {
  Boarding: 'Level 1 — Boarding the Express',
  MovingHeist: 'Level 2 — The Moving Heist',
  Timewreck: 'Level 3 — Timewreck',
  Complete: 'Heist Complete'
}

// The actions worth surfacing on the pause screen itself, in this order.
const QUICK_REFERENCE = [
  'forward', 'run', 'jump', 'duck', 'interact', 'slow', 'freeze', 'rewind', 'ghost'
]

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function createPauseMenu({
  settingsMenu, getStatus, onPause, onResume, onRestart, onQuit, canPause
}) {
  const root = createOverlayRoot('pause-menu', 70)

  const panel = document.createElement('div')
  Object.assign(panel.style, {
    display: 'flex',
    flexDirection: 'column',
    width: 'min(92vw, 720px)',
    maxHeight: '88vh',
    background: 'linear-gradient(180deg, rgba(12, 13, 22, 0.96), rgba(8, 8, 14, 0.96))',
    border: `1px solid ${THEME.brassSoft}`,
    borderRadius: '4px',
    boxShadow: '0 30px 90px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(240, 230, 207, 0.06)',
    overflow: 'hidden',
    transform: 'translateY(12px) scale(0.99)',
    transition: 'transform 220ms ease'
  })

  // ---------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------
  const header = document.createElement('div')
  Object.assign(header.style, {
    padding: 'clamp(18px, 3.5vh, 28px) clamp(20px, 4vw, 34px) clamp(14px, 2vh, 18px)',
    borderBottom: `1px solid ${THEME.brassFaint}`,
    textAlign: 'center'
  })

  const levelLine = document.createElement('div')
  Object.assign(levelLine.style, {
    marginTop: '8px',
    fontSize: '12px',
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: 'rgba(176, 141, 63, 0.9)',
    fontWeight: '700'
  })

  const objectiveLine = document.createElement('div')
  Object.assign(objectiveLine.style, {
    marginTop: '8px',
    fontSize: '13px',
    color: THEME.parchmentDim,
    fontStyle: 'italic',
    lineHeight: '1.5'
  })

  header.append(createHeading('Paused'), levelLine, objectiveLine)

  // ---------------------------------------------------------------
  // Body: run status + control reference
  // ---------------------------------------------------------------
  const body = document.createElement('div')
  Object.assign(body.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 'clamp(16px, 3vw, 30px)',
    padding: 'clamp(16px, 3vh, 24px) clamp(20px, 4vw, 34px)',
    overflowY: 'auto',
    flex: '1 1 auto',
    minHeight: '0'
  })
  applyScrollbarTheme(body)

  const statusColumn = document.createElement('div')
  const controlsColumn = document.createElement('div')
  statusColumn.appendChild(createSectionLabel('Run Status'))
  controlsColumn.appendChild(createSectionLabel('Controls'))

  const statusList = document.createElement('div')
  Object.assign(statusList.style, { display: 'flex', flexDirection: 'column', gap: '2px' })
  statusColumn.appendChild(statusList)

  const controlsList = document.createElement('div')
  Object.assign(controlsList.style, { display: 'flex', flexDirection: 'column', gap: '2px' })
  controlsColumn.appendChild(controlsList)

  body.append(statusColumn, controlsColumn)

  // A status line is a label on the left and a value on the right; the ones
  // with a `meter` also get a thin bar so energy and suspicion read at a
  // glance rather than as bare numbers.
  function addStatusRow(label, value, meter) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      padding: '8px 0',
      borderBottom: '1px solid rgba(240, 230, 207, 0.06)'
    })

    const line = document.createElement('div')
    Object.assign(line.style, {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '12px'
    })

    const name = document.createElement('span')
    name.textContent = label
    Object.assign(name.style, {
      fontSize: '12px',
      color: THEME.parchmentFaint,
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    })

    const readout = document.createElement('span')
    readout.textContent = value
    Object.assign(readout.style, {
      fontSize: '14px',
      fontWeight: '700',
      color: THEME.parchment,
      fontVariantNumeric: 'tabular-nums'
    })

    line.append(name, readout)
    row.appendChild(line)

    if (meter) {
      const track = document.createElement('div')
      Object.assign(track.style, {
        height: '4px',
        borderRadius: '2px',
        background: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden'
      })
      const fill = document.createElement('div')
      Object.assign(fill.style, {
        height: '100%',
        width: `${Math.max(0, Math.min(100, meter.percent))}%`,
        background: meter.color,
        boxShadow: `0 0 8px ${meter.color}`
      })
      track.appendChild(fill)
      row.appendChild(track)
    }

    statusList.appendChild(row)
  }

  function addControlRow(label, keys) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '6px 0',
      borderBottom: '1px solid rgba(240, 230, 207, 0.06)'
    })
    const name = document.createElement('span')
    name.textContent = label
    Object.assign(name.style, { fontSize: '12px', color: THEME.parchmentDim })
    row.append(name, createKeyCap(keys))
    controlsList.appendChild(row)
  }

  // ---------------------------------------------------------------
  // Footer buttons
  // ---------------------------------------------------------------
  const footer = document.createElement('div')
  Object.assign(footer.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    padding: 'clamp(14px, 2.5vh, 20px) clamp(20px, 4vw, 34px)',
    borderTop: `1px solid ${THEME.brassFaint}`,
    background: 'rgba(0, 0, 0, 0.25)'
  })

  const resumeButton = createButton('Resume', { variant: 'primary', onClick: () => resume() })

  const restartButton = createButton('Restart Level', {
    variant: 'ghost',
    onClick: () => {
      close()
      if (onRestart) onRestart()
    }
  })

  const settingsButton = createButton('Settings', {
    variant: 'ghost',
    onClick: () => {
      // The settings panel stacks on top and hands focus back on close, so
      // the player lands back on the pause menu rather than in the game.
      settingsMenu.open(() => {
        if (isOpen) resumeButton.focus()
      })
    }
  })

  const quitButton = createButton('Quit to Title', {
    variant: 'danger',
    onClick: () => {
      close()
      if (onQuit) onQuit()
    }
  })

  const spacer = document.createElement('div')
  spacer.style.flex = '1 1 auto'

  footer.append(resumeButton, restartButton, settingsButton, spacer, quitButton)
  panel.append(header, body, footer)
  root.appendChild(panel)
  document.body.appendChild(root)

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  let isOpen = false

  function renderStatus() {
    statusList.replaceChildren()
    controlsList.replaceChildren()

    const status = (getStatus ? getStatus() : null) ?? {}

    levelLine.textContent = LEVEL_NAMES[status.level] ?? 'In Transit'
    objectiveLine.textContent = status.objective ? `“${status.objective}”` : ''

    addStatusRow('Elapsed', formatClock(status.elapsed ?? 0))

    const maxEnergy = status.maxEnergy || 100
    const energyPct = Math.round(((status.energy ?? maxEnergy) / maxEnergy) * 100)
    addStatusRow('Chrono Power', `${energyPct}%`, { percent: energyPct, color: '#38bdf8' })

    const suspicion = Math.round(status.suspicion ?? 0)
    addStatusRow('Suspicion', `${suspicion}%`, {
      percent: suspicion,
      color: suspicion > 60 ? '#ef4444' : '#f59e0b'
    })

    addStatusRow('Checkpoint Resets', String(status.resets ?? 0))

    const mode = status.timeMode && status.timeMode !== 'NORMAL' ? status.timeMode : 'Normal Flow'
    addStatusRow('Time State', mode.charAt(0) + mode.slice(1).toLowerCase())

    for (const id of QUICK_REFERENCE) {
      const action = ACTIONS.find((a) => a.id === id)
      if (!action) continue

      if (id === 'forward') {
        // The movement cluster reads better as one "W A S D" row than as four
        // separate lines.
        const cluster = ['forward', 'left', 'back', 'right']
          .map((a) => settings.getBinding(a)[0])
          .filter(Boolean)
          .map(codeLabel)
          .join(' ')
        addControlRow('Move', cluster || 'Unbound')
        continue
      }

      addControlRow(action.label, bindingLabel(settings.getBinding(id)))
    }
    addControlRow('Look', 'Mouse')
    addControlRow('Pause', 'Esc')
  }

  function open() {
    if (isOpen) return
    isOpen = true
    renderStatus()
    root.style.display = 'flex'
    void root.offsetWidth
    root.style.opacity = '1'
    panel.style.transform = 'translateY(0) scale(1)'
    setTimeout(() => { if (isOpen) resumeButton.focus() }, 120)
  }

  function close() {
    if (!isOpen) return
    isOpen = false
    root.style.opacity = '0'
    panel.style.transform = 'translateY(12px) scale(0.99)'
    setTimeout(() => {
      if (!isOpen) root.style.display = 'none'
    }, 240)
  }

  function resume() {
    close()
    if (onResume) onResume()
  }

  // Opening goes back through main.js (onPause) rather than straight to
  // open(), because pausing is more than showing this panel — the update loop,
  // input and pointer lock all have to stop with it. main.js calls open() back
  // once it has done that; open() is idempotent, so the round trip is safe.
  function requestOpen() {
    if (isOpen) return
    if (canPause && !canPause()) return
    if (onPause) onPause()
    else open()
  }

  function toggle() {
    if (isOpen) resume()
    else requestOpen()
  }

  // Esc opens and closes the menu. The settings panel, when open, swallows
  // keydown before this listener sees it, so Esc there closes settings only.
  function onKeyDown(event) {
    if (event.code !== 'Escape' || event.repeat) return
    if (settingsMenu && settingsMenu.isOpen) return
    event.preventDefault()
    toggle()
  }
  window.addEventListener('keydown', onKeyDown)

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    root.remove()
  }

  return {
    open,
    close,
    toggle,
    requestOpen,
    dispose,
    get isOpen() { return isOpen }
  }
}

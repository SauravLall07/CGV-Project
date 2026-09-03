// HUD with Objective, Toasts, and Chrono Core Time-Manipulation Deck.
// Features energy meter, ability activation highlights, and temporal vignette.

export function createHud() {
  const root = document.createElement('div')
  root.id = 'hud'
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    userSelect: 'none',
    font: '600 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#fff',
    zIndex: '5',
    overflow: 'hidden'
  })

  // Full-screen temporal distortion vignette
  const vignette = document.createElement('div')
  Object.assign(vignette.style, {
    position: 'absolute',
    inset: '0',
    boxShadow: 'inset 0 0 90px rgba(0, 212, 255, 0)',
    pointerEvents: 'none',
    transition: 'box-shadow 250ms ease, background 250ms ease'
  })
  root.appendChild(vignette)

  // Top objective banner
  const objective = document.createElement('div')
  Object.assign(objective.style, {
    position: 'absolute',
    top: '18px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '7px 20px',
    maxWidth: '85vw',
    textAlign: 'center',
    background: 'rgba(10, 14, 24, 0.75)',
    border: '1px solid rgba(80, 160, 255, 0.25)',
    backdropFilter: 'blur(8px)',
    borderRadius: '6px',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
    letterSpacing: '0.4px',
    opacity: '0',
    transition: 'opacity 200ms ease-out'
  })

  // Center toast notifications
  const toast = document.createElement('div')
  Object.assign(toast.style, {
    position: 'absolute',
    top: '68px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '7px 16px',
    background: 'rgba(20, 10, 15, 0.85)',
    border: '1px solid rgba(255, 80, 100, 0.4)',
    borderRadius: '4px',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
    opacity: '0',
    transition: 'opacity 160ms ease-out'
  })

  // Top-Right Suspicion / Alert Meter
  const suspicionContainer = document.createElement('div')
  Object.assign(suspicionContainer.style, {
    position: 'absolute',
    top: '18px',
    right: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
    padding: '8px 14px',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '6px',
    backdropFilter: 'blur(6px)',
    opacity: '0',
    transform: 'translateY(-10px)',
    transition: 'opacity 200ms ease, transform 200ms ease'
  })

  const suspicionLabelRow = document.createElement('div')
  Object.assign(suspicionLabelRow.style, {
    display: 'flex',
    justifyContent: 'space-between',
    width: '140px',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.8px',
    color: '#f59e0b'
  })

  const suspicionLabel = document.createElement('span')
  suspicionLabel.textContent = 'SUSPICION'
  const suspicionPct = document.createElement('span')
  suspicionPct.textContent = '0%'
  suspicionLabelRow.append(suspicionLabel, suspicionPct)

  const suspicionTrack = document.createElement('div')
  Object.assign(suspicionTrack.style, {
    width: '140px',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden'
  })

  const suspicionFill = document.createElement('div')
  Object.assign(suspicionFill.style, {
    height: '100%',
    width: '0%',
    background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
    boxShadow: '0 0 8px rgba(245, 158, 11, 0.8)',
    transition: 'width 80ms ease-out'
  })
  suspicionTrack.appendChild(suspicionFill)
  suspicionContainer.append(suspicionLabelRow, suspicionTrack)

  // Bottom-Center Chrono Core Deck
  const timeDeck = document.createElement('div')
  Object.assign(timeDeck.style, {
    position: 'absolute',
    bottom: '22px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    background: 'rgba(9, 13, 22, 0.8)',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    borderRadius: '10px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 12px rgba(0, 212, 255, 0.1)'
  })

  // Chrono Power / Energy Bar container
  const energyRow = document.createElement('div')
  Object.assign(energyRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%'
  })

  const energyLabel = document.createElement('span')
  energyLabel.textContent = 'CHRONO POWER'
  Object.assign(energyLabel.style, {
    fontSize: '11px',
    letterSpacing: '1px',
    color: '#38bdf8',
    textTransform: 'uppercase',
    fontWeight: '700'
  })

  const energyBarTrack = document.createElement('div')
  Object.assign(energyBarTrack.style, {
    flex: '1',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
    minWidth: '160px'
  })

  const energyBarFill = document.createElement('div')
  Object.assign(energyBarFill.style, {
    height: '100%',
    width: '100%',
    background: 'linear-gradient(90deg, #0284c7, #38bdf8, #a5f3fc)',
    boxShadow: '0 0 8px rgba(56, 189, 248, 0.8)',
    transition: 'width 80ms ease-out'
  })
  energyBarTrack.appendChild(energyBarFill)
  energyRow.append(energyLabel, energyBarTrack)

  // Ability slots row
  const abilitySlots = document.createElement('div')
  Object.assign(abilitySlots.style, {
    display: 'flex',
    gap: '8px',
    marginTop: '2px'
  })

  const abilities = [
    { id: 'SLOW', name: 'Slow', key: '1/Q', color: '#38bdf8' },
    { id: 'FREEZE', name: 'Freeze', key: '2/F', color: '#60a5fa' },
    { id: 'REWIND', name: 'Rewind', key: '3/C', color: '#a855f7' },
    { id: 'GHOST', name: 'Ghost', key: '4/G', color: '#2dd4bf' }
  ]

  const slotElements = new Map()

  abilities.forEach((ab) => {
    const slot = document.createElement('div')
    slot.id = `ability-${ab.id.toLowerCase()}`
    Object.assign(slot.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '4px 10px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: '6px',
      minWidth: '58px',
      transition: 'all 180ms ease'
    })

    const keyElem = document.createElement('span')
    keyElem.textContent = ab.key
    Object.assign(keyElem.style, {
      fontSize: '10px',
      color: '#94a3b8',
      fontWeight: '700'
    })

    const nameElem = document.createElement('span')
    nameElem.textContent = ab.name
    Object.assign(nameElem.style, {
      fontSize: '12px',
      color: '#f1f5f9',
      fontWeight: '600'
    })

    slot.append(keyElem, nameElem)
    abilitySlots.appendChild(slot)
    slotElements.set(ab.id, { slot, ab, keyElem, nameElem })
  })

  timeDeck.append(energyRow, abilitySlots)
  root.append(objective, toast, suspicionContainer, timeDeck)
  document.body.appendChild(root)

  let toastTimer = null

  function setObjective(text) {
    objective.textContent = text ?? ''
    objective.style.opacity = text ? '1' : '0'
  }

  function showToast(text, duration = 2000) {
    toast.textContent = text
    toast.style.opacity = '1'
    clearTimeout(toastTimer)
    if (duration > 0) {
      toastTimer = setTimeout(() => { toast.style.opacity = '0' }, duration)
    }
  }

  function setSuspicion(value) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    suspicionFill.style.width = `${clamped}%`
    suspicionPct.textContent = `${clamped}%`

    if (clamped > 0) {
      suspicionContainer.style.opacity = '1'
      suspicionContainer.style.transform = 'translateY(0)'

      if (clamped > 60) {
        suspicionLabelRow.style.color = '#ef4444'
        suspicionContainer.style.borderColor = 'rgba(239, 68, 68, 0.6)'
        suspicionFill.style.background = 'linear-gradient(90deg, #f97316, #ef4444)'
        suspicionFill.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.9)'
      } else {
        suspicionLabelRow.style.color = '#f59e0b'
        suspicionContainer.style.borderColor = 'rgba(245, 158, 11, 0.3)'
        suspicionFill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)'
        suspicionFill.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.8)'
      }
    } else {
      suspicionContainer.style.opacity = '0'
      suspicionContainer.style.transform = 'translateY(-10px)'
    }
  }

  function updateTimeState({ mode, energy, maxEnergy, ghostCooldown, hasGhost }) {
    // Update energy bar
    const pct = Math.max(0, Math.min(100, (energy / maxEnergy) * 100))
    energyBarFill.style.width = `${pct}%`

    // Low energy warning color
    if (pct < 20) {
      energyBarFill.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)'
      energyBarFill.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)'
    } else {
      energyBarFill.style.background = 'linear-gradient(90deg, #0284c7, #38bdf8, #a5f3fc)'
      energyBarFill.style.boxShadow = '0 0 8px rgba(56, 189, 248, 0.8)'
    }

    // Update ability active states
    slotElements.forEach(({ slot, ab }, id) => {
      const isActive = mode === id
      if (id === 'GHOST') {
        if (hasGhost) {
          slot.style.background = 'rgba(45, 212, 191, 0.25)'
          slot.style.borderColor = '#2dd4bf'
          slot.style.boxShadow = '0 0 12px rgba(45, 212, 191, 0.5)'
        } else if (ghostCooldown > 0) {
          slot.style.opacity = '0.45'
          slot.style.background = 'rgba(255, 255, 255, 0.03)'
          slot.style.borderColor = 'rgba(255, 255, 255, 0.08)'
          slot.style.boxShadow = 'none'
        } else {
          slot.style.opacity = '1'
          slot.style.background = 'rgba(255, 255, 255, 0.05)'
          slot.style.borderColor = 'rgba(255, 255, 255, 0.15)'
          slot.style.boxShadow = 'none'
        }
      } else if (isActive) {
        slot.style.background = `${ab.color}33`
        slot.style.borderColor = ab.color
        slot.style.boxShadow = `0 0 14px ${ab.color}88`
        slot.style.transform = 'scale(1.05)'
      } else {
        slot.style.background = 'rgba(255, 255, 255, 0.05)'
        slot.style.borderColor = 'rgba(255, 255, 255, 0.15)'
        slot.style.boxShadow = 'none'
        slot.style.transform = 'scale(1.0)'
      }
    })

    // Temporal vignette styling
    if (mode === 'SLOW') {
      vignette.style.boxShadow = 'inset 0 0 90px rgba(56, 189, 248, 0.45)'
      vignette.style.background = 'rgba(2, 132, 199, 0.04)'
    } else if (mode === 'FREEZE') {
      vignette.style.boxShadow = 'inset 0 0 100px rgba(96, 165, 250, 0.65)'
      vignette.style.background = 'rgba(30, 58, 138, 0.07)'
    } else if (mode === 'REWIND') {
      vignette.style.boxShadow = 'inset 0 0 110px rgba(168, 85, 247, 0.65)'
      vignette.style.background = 'rgba(88, 28, 135, 0.08)'
    } else {
      vignette.style.boxShadow = 'inset 0 0 90px rgba(0, 212, 255, 0)'
      vignette.style.background = 'transparent'
    }
  }

  function setVisible(visible) {
    root.style.display = visible ? 'block' : 'none'
  }

  function dispose() {
    clearTimeout(toastTimer)
    root.remove()
  }

  return { root, setObjective, showToast, setSuspicion, updateTimeState, setVisible, dispose }
}

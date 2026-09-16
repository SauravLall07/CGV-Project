// HUD with Objective, Toasts, and Chrono Core Time-Manipulation Deck.
// Features energy meter, ability activation highlights, and temporal vignette.
//
// The ability slots label themselves from the live key bindings rather than
// hard-coded strings, so rebinding Freeze in the settings screen re-labels the
// deck. The optional FPS counter is driven from the same settings store.

import { bindingLabel, settings } from '../core/settings.js'

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

  // Full-screen "caught" overlay — distinct from the small toast above:
  // covers the whole viewport so the freeze in respawn.js reads as a clear
  // beat rather than a message easy to miss mid-chase.
  const caughtScreen = document.createElement('div')
  Object.assign(caughtScreen.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    background: 'rgba(10, 5, 8, 0.55)',
    backdropFilter: 'blur(3px)',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 200ms ease-out'
  })

  const caughtTitle = document.createElement('div')
  Object.assign(caughtTitle.style, {
    fontSize: '42px',
    fontWeight: '800',
    letterSpacing: '2px',
    color: '#ef4444',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.9)'
  })

  const caughtMessage = document.createElement('div')
  Object.assign(caughtMessage.style, {
    fontSize: '15px',
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textShadow: '0 1px 6px rgba(0, 0, 0, 0.8)'
  })

  caughtScreen.append(caughtTitle, caughtMessage)
  root.appendChild(caughtScreen)

  const CAUGHT_MESSAGES = {
    'guard-sight': { title: 'SPOTTED!', message: 'A guard spotted you!' },
    'guard-bump': { title: 'CAUGHT!', message: 'You walked straight into a guard!' },
    'camera': { title: 'DETECTED!', message: 'A security camera caught you on film!' },
    'laser': { title: 'ALARM TRIPPED!', message: 'You walked into a laser gate!' },
    'fell': { title: 'FELL!', message: 'You fell off the train!' },
    'caught': { title: 'CAUGHT!', message: 'Security caught you!' }
  }

  function showCaughtScreen(reason) {
    const entry = CAUGHT_MESSAGES[reason] ?? CAUGHT_MESSAGES.caught
    caughtTitle.textContent = entry.title
    caughtMessage.textContent = entry.message
    caughtScreen.style.opacity = '1'
  }

  function hideCaughtScreen() {
    caughtScreen.style.opacity = '0'
  }

  // ---------------------------------------------------------------------------
  // Large tutorial walkthrough overlay
  // ---------------------------------------------------------------------------
  // This is deliberately part of the HUD instead of a level-specific DOM tree.
  // Tutorial zones only describe *what* they want to show; the HUD owns the
  // styling, live key labels and keyboard-to-continue behaviour in one place.
  const tutorialOverlay = document.createElement('div')
  tutorialOverlay.id = 'tutorial-overlay'
  Object.assign(tutorialOverlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(24px, 5vw, 72px)',
    background: 'rgba(5, 6, 12, 0.78)',
    backdropFilter: 'blur(7px)',
    WebkitBackdropFilter: 'blur(7px)',
    opacity: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    transition: 'opacity 180ms ease-out, visibility 180ms ease-out',
    zIndex: '30'
  })

  const tutorialPanel = document.createElement('div')
  Object.assign(tutorialPanel.style, {
    width: 'min(920px, 86vw)',
    minHeight: 'min(520px, 68vh)',
    maxHeight: '78vh',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '22px',
    padding: 'clamp(28px, 5vw, 58px)',
    background: 'linear-gradient(145deg, rgba(12, 14, 23, 0.97), rgba(23, 17, 16, 0.96))',
    border: '1px solid rgba(176, 141, 63, 0.7)',
    boxShadow: '0 28px 80px rgba(0, 0, 0, 0.68), inset 0 0 46px rgba(176, 141, 63, 0.05)',
    borderRadius: '4px',
    overflow: 'hidden'
  })

  const tutorialEyebrow = document.createElement('div')
  Object.assign(tutorialEyebrow.style, {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.34em',
    textTransform: 'uppercase',
    color: '#b08d3f'
  })

  const tutorialTitle = document.createElement('div')
  Object.assign(tutorialTitle.style, {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 'clamp(30px, 5vw, 54px)',
    fontWeight: '700',
    lineHeight: '1.05',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#f0e6cf',
    textShadow: '0 3px 18px rgba(0, 0, 0, 0.8)'
  })

  const tutorialRule = document.createElement('div')
  Object.assign(tutorialRule.style, {
    width: '100%',
    height: '1px',
    background: 'linear-gradient(90deg, rgba(176, 141, 63, 0.9), rgba(176, 141, 63, 0.08))'
  })

  const tutorialText = document.createElement('div')
  Object.assign(tutorialText.style, {
    maxWidth: '760px',
    fontSize: 'clamp(15px, 2vw, 19px)',
    fontWeight: '500',
    lineHeight: '1.7',
    color: 'rgba(240, 230, 207, 0.82)',
    letterSpacing: '0.015em'
  })

  const tutorialControls = document.createElement('div')
  Object.assign(tutorialControls.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    width: '100%'
  })

  const tutorialFooter = document.createElement('div')
  Object.assign(tutorialFooter.style, {
    marginTop: '8px',
    paddingTop: '18px',
    borderTop: '1px solid rgba(240, 230, 207, 0.10)',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(240, 230, 207, 0.48)',
    textAlign: 'right'
  })

  tutorialPanel.append(
    tutorialEyebrow,
    tutorialTitle,
    tutorialRule,
    tutorialText,
    tutorialControls,
    tutorialFooter
  )
  tutorialOverlay.appendChild(tutorialPanel)
  root.appendChild(tutorialOverlay)

  let tutorialOpen = false
  let tutorialQueue = []
  const tutorialStateListeners = new Set()

  function notifyTutorialState() {
    tutorialStateListeners.forEach((listener) => listener(tutorialOpen))
  }

  function keyForControl(control) {
    if (control.key) return String(control.key)
    if (control.action) return bindingLabel(settings.getBinding(control.action))
    if (Array.isArray(control.actions)) {
      return control.actions
        .map((action) => bindingLabel(settings.getBinding(action)))
        .join(control.separator ?? '  ')
    }
    return ''
  }

  function renderTutorial(spec = {}) {
    tutorialEyebrow.textContent = spec.eyebrow ?? 'Field Guide'
    tutorialTitle.textContent = spec.title ?? 'New Mechanic'
    tutorialText.textContent = spec.text ?? ''

    tutorialControls.replaceChildren()
    const controls = Array.isArray(spec.controls) ? spec.controls : []
    tutorialControls.style.display = controls.length ? 'grid' : 'none'

    controls.forEach((control) => {
      const card = document.createElement('div')
      Object.assign(card.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        minHeight: '72px',
        padding: '13px 15px',
        background: 'rgba(176, 141, 63, 0.07)',
        border: '1px solid rgba(176, 141, 63, 0.25)',
        borderRadius: '3px'
      })

      const key = document.createElement('div')
      key.textContent = keyForControl(control)
      Object.assign(key.style, {
        fontSize: 'clamp(16px, 2.3vw, 22px)',
        fontWeight: '800',
        letterSpacing: '0.08em',
        color: '#fff2cf'
      })

      const label = document.createElement('div')
      label.textContent = control.label ?? ''
      Object.assign(label.style, {
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'rgba(240, 230, 207, 0.52)'
      })

      card.append(key, label)
      tutorialControls.appendChild(card)
    })

    tutorialFooter.textContent = spec.footer ?? 'Enter / Space — Continue'
  }

  function openTutorial(spec) {
    renderTutorial(spec)
    tutorialOpen = true
    tutorialOverlay.style.visibility = 'visible'
    tutorialOverlay.style.opacity = '1'
    notifyTutorialState()
  }

  function showTutorial(spec = {}) {
    if (tutorialOpen) {
      tutorialQueue.push(spec)
      return
    }
    openTutorial(spec)
  }

  function hideTutorial({ clearQueue = false } = {}) {
    if (clearQueue) tutorialQueue = []
    if (!tutorialOpen) return

    if (!clearQueue && tutorialQueue.length > 0) {
      renderTutorial(tutorialQueue.shift())
      return
    }

    tutorialOpen = false
    tutorialOverlay.style.opacity = '0'
    tutorialOverlay.style.visibility = 'hidden'
    notifyTutorialState()
  }

  function onTutorialStateChange(listener) {
    if (typeof listener !== 'function') return () => {}
    tutorialStateListeners.add(listener)
    return () => tutorialStateListeners.delete(listener)
  }

  function onTutorialKeyDown(event) {
    if (!tutorialOpen || event.repeat) return
    if (event.code !== 'Enter' && event.code !== 'Space') return

    // Capture the continue key before gameplay input sees it. Space is often
    // bound to Jump, and dismissing a tutorial should never also launch the
    // player into the obstacle being explained.
    event.preventDefault()
    event.stopImmediatePropagation()
    hideTutorial()
  }
  window.addEventListener('keydown', onTutorialKeyDown, true)

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
    { id: 'SLOW', name: 'Slow', action: 'slow', color: '#38bdf8' },
    { id: 'FREEZE', name: 'Freeze', action: 'freeze', color: '#60a5fa' },
    { id: 'REWIND', name: 'Rewind', action: 'rewind', color: '#a855f7' },
    { id: 'GHOST', name: 'Ghost', action: 'ghost', color: '#2dd4bf' }
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
    keyElem.textContent = bindingLabel(settings.getBinding(ab.action))
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

  // Optional FPS counter (Settings → Display → Performance Counter). Top-left
  // is the one corner nothing else on the HUD claims.
  const stats = document.createElement('div')
  Object.assign(stats.style, {
    position: 'absolute',
    top: '18px',
    left: '20px',
    padding: '4px 9px',
    background: 'rgba(9, 13, 22, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '4px',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.06em',
    color: '#94a3b8',
    display: 'none'
  })
  stats.textContent = '-- FPS'

  root.append(objective, toast, suspicionContainer, timeDeck, stats)
  document.body.appendChild(root)

  // Re-label the ability slots when the player rebinds a time ability.
  function refreshBindings() {
    slotElements.forEach(({ keyElem, ab }) => {
      keyElem.textContent = bindingLabel(settings.getBinding(ab.action))
    })
  }

  const unsubscribeSettings = settings.subscribe((values, changed) => {
    if (changed === 'bindings' || changed === 'all') refreshBindings()
    if (changed === 'showStats' || changed === 'options' || changed === 'all') {
      stats.style.display = values.showStats ? 'block' : 'none'
    }
  })
  stats.style.display = settings.get('showStats') ? 'block' : 'none'

  // Rolling average over a short window: a per-frame readout is unreadable
  // noise, and this is meant to be glanced at while playing.
  let statsAccum = 0
  let statsFrames = 0

  function updateStats(delta) {
    if (!settings.get('showStats')) return
    statsAccum += delta
    statsFrames += 1
    if (statsAccum < 0.5) return
    const fps = Math.round(statsFrames / statsAccum)
    stats.textContent = `${fps} FPS`
    statsAccum = 0
    statsFrames = 0
  }

  let toastTimer = null
  let objectiveText = ''
  let suspicionValue = 0

  function setObjective(text) {
    objectiveText = text ?? ''
    objective.textContent = objectiveText
    objective.style.opacity = objectiveText ? '1' : '0'
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
    suspicionValue = clamped
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

  function updateTimeState({ mode, energy, maxEnergy, ghostCooldown, hasGhost, available }) {
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
      // Locked out entirely (Level 3's Chrono Core depletion) — greyed and
      // visibly dead, so "only Freeze remains" reads without a text prompt.
      if (available && available[id] === false) {
        slot.style.opacity = '0.25'
        slot.style.filter = 'grayscale(1)'
        slot.style.background = 'rgba(255, 255, 255, 0.02)'
        slot.style.borderColor = 'rgba(255, 255, 255, 0.06)'
        slot.style.boxShadow = 'none'
        slot.style.transform = 'scale(1.0)'
        return
      }
      slot.style.filter = 'none'
      slot.style.opacity = '1'

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
    if (!visible) hideTutorial({ clearQueue: true })
    root.style.display = visible ? 'block' : 'none'
  }

  function dispose() {
    clearTimeout(toastTimer)
    hideTutorial({ clearQueue: true })
    tutorialStateListeners.clear()
    window.removeEventListener('keydown', onTutorialKeyDown, true)
    unsubscribeSettings()
    root.remove()
  }

  // The pause menu reads these back for its run-status column rather than
  // main.js having to mirror the same values a second time.
  return {
    root,
    setObjective,
    showToast,
    setSuspicion,
    updateTimeState,
    updateStats,
    setVisible,
    dispose,
    showCaughtScreen,
    hideCaughtScreen,
    showTutorial,
    hideTutorial,
    isTutorialOpen: () => tutorialOpen,
    onTutorialStateChange,
    getObjective: () => objectiveText,
    getSuspicion: () => suspicionValue
  }
}
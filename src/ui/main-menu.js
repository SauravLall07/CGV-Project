// Main Menu / Title Screen for Chrono Express.
//
// Displays a cinematic title overlay on top of the existing Three.js station
// scene. The station geometry (platform, train, outdoor environment) renders
// live behind the menu from a slow-drifting cinematic camera angle, giving the
// menu a real game-world backdrop rather than a static image.
//
// Flow: loading screen → main menu → NEW GAME → menu fades → third-person
// camera lerps to the player → gameplay begins.
//
// SETTINGS opens the same panel the pause menu uses (ui/settings-menu.js), so
// brightness, look sensitivity and key bindings can all be set before the run
// starts. While that panel is open it swallows key presses, which is why
// Enter-to-start cannot fire underneath it.

import { createButton } from './ui-theme.js'

const TITLE = 'CHRONO EXPRESS'
const SUBTITLE = 'THE LAST HEIST'

// Cinematic camera — elevated on the platform side, looking across at the
// station. The slow drift keeps the background alive without being distracting.
const CAM_POS = { x: 7, y: 4.8, z: 28 }
const CAM_TARGET = { x: 0, y: 2.2, z: -4 }
const DRIFT_X = 0.35
const DRIFT_Y = 0.12
const DRIFT_SPEED = 0.07

export function createMainMenu({ camera, renderer, settingsMenu }) {
  // ---------------------------------------------------------------
  // DOM overlay
  // ---------------------------------------------------------------
  const root = document.createElement('div')
  root.id = 'main-menu'
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    opacity: '0',
    transition: 'opacity 600ms ease',
    pointerEvents: 'none',
    userSelect: 'none',
    overflow: 'hidden'
  })

  // Gradient scrim — darkens the bottom half so the title and button stay
  // readable regardless of what the 3D scene is doing behind it.
  const scrim = document.createElement('div')
  Object.assign(scrim.style, {
    position: 'absolute',
    inset: '0',
    background: [
      'linear-gradient(to bottom,',
      'rgba(6, 6, 16, 0.10) 0%,',
      'rgba(6, 6, 16, 0.20) 35%,',
      'rgba(6, 6, 16, 0.55) 65%,',
      'rgba(6, 6, 16, 0.88) 100%)'
    ].join(' '),
    pointerEvents: 'none'
  })
  root.appendChild(scrim)

  // Cinematic letterbox bars (top + bottom).
  const barHeight = 'clamp(18px, 4.5vh, 56px)'
  for (const pos of ['top', 'bottom']) {
    const bar = document.createElement('div')
    Object.assign(bar.style, {
      position: 'absolute',
      [pos]: '0',
      left: '0',
      right: '0',
      height: barHeight,
      background: 'rgba(0, 0, 0, 0.55)',
      pointerEvents: 'none'
    })
    root.appendChild(bar)
  }

  // ---------------------------------------------------------------
  // Title block
  // ---------------------------------------------------------------
  const titleBlock = document.createElement('div')
  Object.assign(titleBlock.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    marginBottom: 'auto',
    marginTop: 'clamp(80px, 16vh, 200px)',
    opacity: '0',
    transform: 'translateY(24px)',
    transition: 'opacity 900ms ease 200ms, transform 900ms ease 200ms'
  })

  // Small decorative rule + label above the title
  const preTitle = document.createElement('div')
  Object.assign(preTitle.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px'
  })

  const ruleStyle = 'width: clamp(24px, 6vw, 64px); height: 1px; background: rgba(176, 141, 63, 0.5);'
  const leftRule = document.createElement('div')
  leftRule.style.cssText = ruleStyle
  const rightRule = document.createElement('div')
  rightRule.style.cssText = ruleStyle

  const preLabel = document.createElement('span')
  preLabel.textContent = 'A CHRONO HEIST'
  Object.assign(preLabel.style, {
    fontSize: 'clamp(9px, 1.4vw, 12px)',
    fontWeight: '600',
    letterSpacing: '0.32em',
    color: 'rgba(176, 141, 63, 0.75)',
    textTransform: 'uppercase'
  })
  preTitle.append(leftRule, preLabel, rightRule)

  // Main title
  const title = document.createElement('h1')
  title.textContent = TITLE
  Object.assign(title.style, {
    margin: '0',
    fontSize: 'clamp(30px, 7.5vw, 86px)',
    fontWeight: '800',
    letterSpacing: '0.14em',
    color: '#f0e6cf',
    textShadow: [
      '0 0 60px rgba(255, 200, 100, 0.25)',
      '0 2px 12px rgba(0, 0, 0, 0.85)',
      '0 0 3px rgba(255, 220, 150, 0.45)'
    ].join(', '),
    textAlign: 'center',
    lineHeight: '1.05',
    fontFamily: 'Georgia, "Times New Roman", "Palatino Linotype", serif'
  })

  // Subtitle
  const subtitle = document.createElement('div')
  subtitle.textContent = SUBTITLE
  Object.assign(subtitle.style, {
    fontSize: 'clamp(11px, 2vw, 18px)',
    fontWeight: '600',
    letterSpacing: '0.5em',
    color: 'rgba(176, 141, 63, 0.8)',
    marginTop: 'clamp(6px, 1.2vh, 16px)',
    textShadow: '0 1px 6px rgba(0, 0, 0, 0.7)',
    textTransform: 'uppercase'
  })

  titleBlock.append(preTitle, title, subtitle)

  // ---------------------------------------------------------------
  // Menu buttons
  // ---------------------------------------------------------------
  const buttonWrap = document.createElement('div')
  Object.assign(buttonWrap.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    marginBottom: 'clamp(60px, 13vh, 150px)',
    opacity: '0',
    transform: 'translateY(18px)',
    transition: 'opacity 700ms ease 650ms, transform 700ms ease 650ms'
  })

  const newGameBtn = createButton('New Game', { variant: 'primary', size: 'large' })

  // SETTINGS sits under NEW GAME as the quieter second option; it opens the
  // shared panel and hands focus back here when it closes.
  const settingsBtn = createButton('Settings', {
    variant: 'ghost',
    onClick: () => {
      if (!settingsMenu) return
      settingsMenu.open(() => {
        if (isVisible) newGameBtn.focus()
      })
    }
  })

  // Keyboard hint
  const hint = document.createElement('div')
  hint.textContent = 'Click or press Enter to begin'
  Object.assign(hint.style, {
    fontSize: 'clamp(10px, 1.2vw, 12px)',
    color: 'rgba(240, 230, 207, 0.30)',
    letterSpacing: '0.1em',
    fontWeight: '400'
  })

  buttonWrap.append(newGameBtn, settingsBtn, hint)

  // ---------------------------------------------------------------
  // Version / credit line (bottom)
  // ---------------------------------------------------------------
  const versionLine = document.createElement('div')
  versionLine.textContent = 'v0.1 — CGV Project'
  Object.assign(versionLine.style, {
    position: 'absolute',
    bottom: 'clamp(8px, 1.5vh, 18px)',
    right: 'clamp(10px, 2vw, 20px)',
    fontSize: '10px',
    color: 'rgba(240, 230, 207, 0.18)',
    letterSpacing: '0.06em',
    pointerEvents: 'none'
  })

  root.append(titleBlock, buttonWrap, versionLine)
  document.body.appendChild(root)

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  let onStartCallback = null
  let isVisible = false
  let isTransitioning = false
  let menuElapsed = 0

  // ---------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------
  function handleStart() {
    if (!isVisible || isTransitioning) return
    if (settingsMenu && settingsMenu.isOpen) return
    isTransitioning = true

    // Fade menu out after a brief beat
    setTimeout(() => {
      hide()
      if (onStartCallback) {
        setTimeout(() => onStartCallback(), 650)
      }
    }, 120)
  }

  newGameBtn.addEventListener('click', handleStart)

  function onKeyDown(event) {
    if (!isVisible || isTransitioning) return
    if (settingsMenu && settingsMenu.isOpen) return
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      handleStart()
    }
  }
  window.addEventListener('keydown', onKeyDown)

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------
  function show() {
    isVisible = true
    // Reset the start latch: the menu is shown again when the player quits a
    // run from the pause menu, and a stuck latch would make NEW GAME dead.
    isTransitioning = false
    menuElapsed = 0
    root.style.display = 'flex'
    root.style.pointerEvents = 'auto'
    void root.offsetWidth // reflow for transition
    root.style.opacity = '1'
    // Trigger entrance animations after the overlay is visible
    requestAnimationFrame(() => {
      titleBlock.style.opacity = '1'
      titleBlock.style.transform = 'translateY(0)'
      buttonWrap.style.opacity = '1'
      buttonWrap.style.transform = 'translateY(0)'
    })
    // Auto-focus the button for keyboard accessibility
    setTimeout(() => newGameBtn.focus(), 700)
  }

  function hide() {
    isVisible = false
    root.style.opacity = '0'
    root.style.pointerEvents = 'none'
    setTimeout(() => {
      root.style.display = 'none'
    }, 650)
  }

  function onStart(cb) {
    onStartCallback = cb
  }

  // Called every frame from the render loop while the menu is visible.
  // Drifts the camera slowly so the background scene stays alive.
  function updateCinematicCamera(delta) {
    if (!isVisible) return
    menuElapsed += delta
    const t = menuElapsed

    camera.position.set(
      CAM_POS.x + Math.sin(t * DRIFT_SPEED) * DRIFT_X,
      CAM_POS.y + Math.sin(t * DRIFT_SPEED * 1.4 + 0.7) * DRIFT_Y,
      CAM_POS.z + Math.cos(t * DRIFT_SPEED * 0.6) * DRIFT_X * 0.5
    )
    camera.lookAt(CAM_TARGET.x, CAM_TARGET.y, CAM_TARGET.z)
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    root.remove()
  }

  return {
    show,
    hide,
    onStart,
    updateCinematicCamera,
    dispose,
    get isVisible() { return isVisible }
  }
}

// HUD scaffold (Phase 1 foundation): a fixed-position DOM overlay with just
// enough structure for every level to show an objective line and the odd
// transient message (checkpoint respawn, "Boarding..."). The full HUD —
// suspicion meter, time-ability cooldowns, styled art — is Phase 8; this is
// only the container and the two text slots levels need right now.
//
// The interaction prompt is deliberately NOT here — it lives in the
// interaction system so that module stays self-contained. Phase 8 can fold
// both into one styled HUD.

export function createHud() {
  const root = document.createElement('div')
  root.id = 'hud'
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    userSelect: 'none',
    font: '600 15px/1.4 system-ui, sans-serif',
    color: '#fff',
    zIndex: '5'
  })

  const objective = document.createElement('div')
  Object.assign(objective.style, {
    position: 'absolute',
    top: '18px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    maxWidth: '80vw',
    textAlign: 'center',
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '4px',
    textShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
    opacity: '0',
    transition: 'opacity 160ms ease-out'
  })

  const toast = document.createElement('div')
  Object.assign(toast.style, {
    position: 'absolute',
    top: '64px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 14px',
    background: 'rgba(120, 20, 20, 0.6)',
    borderRadius: '4px',
    opacity: '0',
    transition: 'opacity 160ms ease-out'
  })

  root.append(objective, toast)
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

  function dispose() {
    clearTimeout(toastTimer)
    root.remove()
  }

  return { root, setObjective, showToast, dispose }
}

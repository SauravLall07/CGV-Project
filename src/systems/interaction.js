import * as THREE from 'three'
import { bindingLabel, settings } from '../core/settings.js'

// Interaction system (Phase 1 foundation): each frame, the registry of
// "interactable" objects is scanned for the best candidate in front of the
// player — within its own range and inside a facing cone along the camera
// yaw. That candidate becomes the focused target; a contextual prompt ("E to
// open") is shown for it, and pressing the interact key fires its callback.
//
// This is a proximity + facing test rather than a single thin raycast, so a
// short object (a floor switch, a waist-high terminal) is still detectable
// when the player walks up to it. Line-of-sight occlusion (don't trigger a
// switch through a wall) can be layered on later as a raycast against level
// geometry once levels actually have dividing walls.
//
// Doors, terminals, switches, the boarding control and the emergency brake
// all go through register() rather than each wiring their own detection or
// key handler. The prompt DOM element lives here for now; it can move into
// the full HUD (Phase 8) later without changing this API.
//
// The interact key is not owned here — it comes in through the keyboard's
// "interact" action, so it follows whatever the player has rebound it to and
// falls silent while a menu has input disabled.

const DEFAULT_RANGE = 3 // metres (horizontal); per-registration override via opts.range
const FACING_MIN = 0.35 // dot(forward, toTarget); ~70 degrees to either side
const FOCUS_EMISSIVE = 0x3a3a44 // tint applied to an unlit focused mesh
const FOCUS_BOOST = 1.8 // multiplier applied instead when it already glows

function createPromptElement() {
  const el = document.createElement('div')
  el.id = 'interaction-prompt'
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '18%',
    transform: 'translateX(-50%)',
    padding: '8px 14px',
    font: '600 15px/1 system-ui, sans-serif',
    color: '#fff',
    background: 'rgba(0, 0, 0, 0.55)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '6px',
    letterSpacing: '0.02em',
    pointerEvents: 'none',
    userSelect: 'none',
    opacity: '0',
    transition: 'opacity 120ms ease-out',
    zIndex: '10'
  })
  document.body.appendChild(el)
  return el
}

export function createInteractionSystem({ camera, input } = {}) {
  // Keyed by the registered Object3D. A Group or a Mesh both work — its world
  // position is the point range and facing are measured against.
  const registry = new Map()

  const playerPos = new THREE.Vector3()
  const targetPos = new THREE.Vector3()
  const cameraDir = new THREE.Vector3()

  const prompt = createPromptElement()
  let focused = null
  let enabled = true
  let flashUntil = 0

  function register(object, { prompt: label, onInteract, range = DEFAULT_RANGE } = {}) {
    if (!object || typeof onInteract !== 'function') {
      throw new Error('register(object, { prompt, onInteract }) requires an object and an onInteract callback')
    }
    const entry = { object, label: label ?? 'Interact', onInteract, range }
    registry.set(object, entry)

    return function unregister() {
      registry.delete(object)
      if (focused && focused.object === object) setFocus(null)
    }
  }

  // Focus highlight. An unlit prop (brass, painted metal) gets a faint
  // emissive tint; a prop that already glows keeps its own colour and is
  // simply turned up, so highlighting the Chrono Core doesn't wash it out to
  // grey.
  function applyHighlight(entry, on) {
    entry.object.traverse((node) => {
      const material = node.material
      if (!material || !material.emissive) return

      if (on) {
        if (node.userData._focusBase) return
        const base = { hex: material.emissive.getHex(), intensity: material.emissiveIntensity }
        node.userData._focusBase = base

        if (base.hex === 0x000000) {
          material.emissive.setHex(FOCUS_EMISSIVE)
          material.emissiveIntensity = 1
        } else {
          material.emissiveIntensity = base.intensity * FOCUS_BOOST
        }
      } else if (node.userData._focusBase) {
        material.emissive.setHex(node.userData._focusBase.hex)
        material.emissiveIntensity = node.userData._focusBase.intensity
        delete node.userData._focusBase
      }
    })
  }

  function renderPrompt() {
    if (performance.now() < flashUntil) return // a flash message owns the DOM
    if (focused) {
      // Read the binding per render so a rebind is reflected immediately.
      prompt.textContent = `${bindingLabel(settings.getBinding('interact'))} — ${focused.label}`
      prompt.style.opacity = '1'
    } else {
      prompt.style.opacity = '0'
    }
  }

  function setFocus(entry) {
    if (focused !== entry) {
      if (focused) applyHighlight(focused, false)
      focused = entry
      if (focused) applyHighlight(focused, true)
    }
    renderPrompt()
  }

  // Brief on-screen confirmation, e.g. after an interaction fires. Overrides
  // the contextual prompt for `duration` ms, then it resumes on its own.
  function flashPrompt(text, duration = 1200) {
    flashUntil = performance.now() + duration
    prompt.textContent = text
    prompt.style.opacity = '1'
  }

  // `player` is the object detection is measured from; `yaw` is the camera
  // yaw (radians) that defines "forward". Falls back to the camera's own
  // facing if yaw is missing.
  function update(player, yaw) {
    if (!enabled || registry.size === 0 || !player) {
      setFocus(null)
      return
    }

    player.getWorldPosition(playerPos)

    let forwardX
    let forwardZ
    if (typeof yaw === 'number') {
      forwardX = Math.sin(yaw)
      forwardZ = Math.cos(yaw)
    } else if (camera) {
      camera.getWorldDirection(cameraDir)
      const len = Math.hypot(cameraDir.x, cameraDir.z) || 1
      forwardX = cameraDir.x / len
      forwardZ = cameraDir.z / len
    } else {
      forwardX = 0
      forwardZ = 1
    }

    let best = null
    let bestScore = Infinity
    for (const entry of registry.values()) {
      entry.object.getWorldPosition(targetPos)
      const dx = targetPos.x - playerPos.x
      const dz = targetPos.z - playerPos.z
      const distance = Math.hypot(dx, dz)
      if (distance > entry.range) continue

      const facing = distance > 1e-4 ? (dx * forwardX + dz * forwardZ) / distance : 1
      if (facing < FACING_MIN) continue

      // Closest wins, with better-aimed breaking ties.
      const score = distance - facing
      if (score < bestScore) {
        bestScore = score
        best = entry
      }
    }

    setFocus(best)
  }

  // Fire the focused interactable, if there is one. Wired to the keyboard's
  // "interact" action below; also callable directly (a future on-screen
  // prompt button, say).
  function interact() {
    if (!enabled || !focused) return false
    focused.onInteract({ object: focused.object, entry: focused })
    return true
  }

  const unbindInteract = input ? input.onAction('interact', () => interact()) : null

  function setEnabled(value) {
    enabled = value
    if (!value) setFocus(null)
  }

  function dispose() {
    if (unbindInteract) unbindInteract()
    if (focused) applyHighlight(focused, false)
    prompt.remove()
    registry.clear()
    focused = null
  }

  return {
    register,
    update,
    interact,
    flashPrompt,
    setEnabled,
    dispose,
    getFocused: () => focused && focused.object
  }
}

import * as THREE from 'three'
import { bindingLabel, settings } from '../core/settings.js'

// Interaction system (Phase 1 foundation): each frame, the registry of
// "interactable" objects is scanned for the best visible candidate in front
// of the player — within its own range, vertical reach and a forgiving facing
// cone. Registered level geometry provides a line-of-sight test, so an
// otherwise valid target cannot be used through a wall or another floor.
//
// Candidate selection stays broader than a single thin camera ray, so a short
// object (a floor switch, a waist-high terminal) remains easy to select. The
// raycast is only the final visibility check from the player's interaction
// height to that candidate.
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
const DEFAULT_VERTICAL_TOLERANCE = 1.8
const INTERACTION_ORIGIN_HEIGHT = 1.1
const FACING_MIN = 0.35 // dot(forward, toTarget); ~70 degrees to either side
const OCCLUSION_PADDING = 0.08
const DISTANCE_EPSILON = 1e-7
const FOCUS_EMISSIVE = 0x3a3a44 // tint applied to an unlit focused mesh
const FOCUS_BOOST = 1.8 // multiplier applied instead when it already glows

function isDescendantOf(node, root) {
  let current = node
  while (current) {
    if (current === root) return true
    current = current.parent
  }
  return false
}

function isWorldVisible(object) {
  let current = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function isNonBlockingEffect(object) {
  let current = object
  while (current) {
    if (current.userData?.noInteractionBlocker) return true
    current = current.parent
  }

  if (object.isPoints || object.isSprite || object.isLine) return true

  const materials = Array.isArray(object.material)
    ? object.material
    : (object.material ? [object.material] : [])

  return materials.length > 0 && materials.every((material) => (
    material.transparent && (material.depthWrite === false || material.opacity < 0.35)
  ))
}

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
  const blockerRegistry = new Set()

  const playerPos = new THREE.Vector3()
  const targetPos = new THREE.Vector3()
  const cameraDir = new THREE.Vector3()
  const rayOrigin = new THREE.Vector3()
  const rayDirection = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()

  const prompt = createPromptElement()
  let focused = null
  let enabled = true
  let flashUntil = 0
  let lastPlayer = null
  let lastYaw

  function register(object, {
    prompt: label,
    onInteract,
    range = DEFAULT_RANGE,
    verticalTolerance = DEFAULT_VERTICAL_TOLERANCE,
    isEligible
  } = {}) {
    if (!object || typeof onInteract !== 'function') {
      throw new Error('register(object, { prompt, onInteract }) requires an object and an onInteract callback')
    }
    const entry = {
      object,
      label: label ?? 'Interact',
      onInteract,
      range,
      verticalTolerance,
      isEligible
    }
    registry.set(object, entry)

    return function unregister() {
      registry.delete(object)
      if (focused && focused.object === object) setFocus(null)
    }
  }

  function registerBlocker(object) {
    if (!object?.isObject3D) {
      throw new Error('registerBlocker(object) requires a Three.js Object3D')
    }
    blockerRegistry.add(object)

    return function unregisterBlocker() {
      blockerRegistry.delete(object)
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

  function getForward(yaw) {
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

    return { forwardX, forwardZ }
  }

  function hasLineOfSight(entry) {
    if (blockerRegistry.size === 0) return true

    rayOrigin.copy(playerPos)
    rayOrigin.y += INTERACTION_ORIGIN_HEIGHT
    rayDirection.subVectors(targetPos, rayOrigin)
    const targetDistance = rayDirection.length()
    if (targetDistance <= DISTANCE_EPSILON) return true

    rayDirection.multiplyScalar(1 / targetDistance)
    raycaster.set(rayOrigin, rayDirection)
    raycaster.far = Math.max(0, targetDistance - OCCLUSION_PADDING)

    const hits = raycaster.intersectObjects(Array.from(blockerRegistry), true)
    for (const hit of hits) {
      if (isDescendantOf(hit.object, entry.object)) continue
      if (!isWorldVisible(hit.object)) continue
      if (isNonBlockingEffect(hit.object)) continue
      return false
    }
    return true
  }

  function findBestCandidate(player, yaw) {
    if (!enabled || registry.size === 0 || !player) return null

    player.getWorldPosition(playerPos)
    blockerRegistry.forEach((blocker) => blocker.updateWorldMatrix(true, true))
    const { forwardX, forwardZ } = getForward(yaw)

    let best = null
    let bestScore = Infinity
    for (const entry of registry.values()) {
      if (!entry.object.parent || !isWorldVisible(entry.object)) continue
      if (entry.isEligible && !entry.isEligible({ player, object: entry.object })) continue

      entry.object.getWorldPosition(targetPos)
      const dx = targetPos.x - playerPos.x
      const dz = targetPos.z - playerPos.z
      const distance = Math.hypot(dx, dz)
      if (distance > entry.range) continue
      if (Math.abs(targetPos.y - playerPos.y) > entry.verticalTolerance) continue

      const facing = distance > 1e-4 ? (dx * forwardX + dz * forwardZ) / distance : 1
      if (facing < FACING_MIN) continue
      if (!hasLineOfSight(entry)) continue

      // Closest wins, with better-aimed breaking ties.
      const score = distance - facing
      if (score < bestScore) {
        bestScore = score
        best = entry
      }
    }

    return best
  }

  // `player` is the object detection is measured from; `yaw` is the camera
  // yaw (radians) that defines "forward". Falls back to the camera's own
  // facing if yaw is missing.
  function update(player, yaw) {
    lastPlayer = player ?? null
    lastYaw = yaw

    setFocus(findBestCandidate(lastPlayer, lastYaw))
  }

  // Fire the focused interactable, if there is one. Wired to the keyboard's
  // "interact" action below; also callable directly (a future on-screen
  // prompt button, say).
  function interact() {
    if (!enabled || !lastPlayer) return false

    // Do not trust focus from the previous rendered frame: the target may
    // have been hidden, made ineligible, moved behind a wall or unregistered.
    setFocus(findBestCandidate(lastPlayer, lastYaw))
    if (!focused) return false

    const entry = focused
    entry.onInteract({ object: entry.object, entry, player: lastPlayer })
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
    blockerRegistry.clear()
    focused = null
    lastPlayer = null
  }

  return {
    register,
    registerBlocker,
    update,
    interact,
    flashPrompt,
    setEnabled,
    dispose,
    getFocused: () => focused && focused.object
  }
}

import * as THREE from 'three'
import { settings } from '../core/settings.js'

// Third-person camera: orbits a pivot at the player's head on mouse look
// (Pointer Lock API), follows with a smoothed pivot, and pulls itself in when
// level geometry would otherwise come between it and the player.
//
// That collision pass is what makes interiors work at all: the carriage is
// 3.4 m wide and its end bulkheads are solid, so a camera parked a fixed 5 m
// behind the player would spend most of Level 2 outside the carriage looking
// at the back of a wall. Each frame it casts one ray from the pivot to where
// the camera wants to be, and if anything is hit the camera is placed just in
// front of it instead. It snaps inwards immediately (never let geometry cross
// in front of the player) but eases back out, so brushing past a pillar
// doesn't fling the camera.

const MIN_DISTANCE = 1.2
const PIVOT_HEIGHT = 1.5 // roughly head height on the 1.85 m figure
const COLLISION_PADDING = 0.25
const COLLISION_EASE_OUT = 4 // per second, when the obstruction clears
// Base radians per pixel of mouse movement; the player's sensitivity setting
// is a multiplier on top of it.
const MOUSE_SENSITIVITY = 0.0025
const PITCH_MIN = -0.35
// Capped well short of straight up: inside a 2.6 m carriage a steeper pitch
// drives the camera into the ceiling faster than the collision clamp can pull
// it back past MIN_DISTANCE.
const PITCH_MAX = 0.6
// Fraction of the remaining distance the pivot closes per 1/60s tick; scaled
// by delta so the follow feels the same regardless of frame rate.
const FOLLOW_SMOOTHING = 0.16

function isDescendantOf(node, root) {
  let current = node
  while (current) {
    if (current === root) return true
    current = current.parent
  }
  return false
}

export function createThirdPersonCamera(camera, domElement) {
  let yaw = 0
  let pitch = 0.25
  let enabled = true
  const lockLostListeners = new Set()

  function onMouseMove(event) {
    if (!enabled) return
    if (document.pointerLockElement !== domElement) return
    // Sensitivity and invert-look are read per event rather than cached, so a
    // change in the settings screen applies the moment the panel closes.
    const speed = MOUSE_SENSITIVITY * settings.get('mouseSensitivity')
    const vertical = settings.get('invertY') ? -event.movementY : event.movementY
    yaw -= event.movementX * speed
    pitch = THREE.MathUtils.clamp(pitch - vertical * speed, PITCH_MIN, PITCH_MAX)
  }

  function onClick() {
    if (!enabled) return
    requestLock()
  }

  // Losing the pointer lock means the player pressed Esc or alt-tabbed away —
  // browsers swallow that Escape keydown, so this is the only reliable signal
  // for it, and main.js hangs "open the pause menu" off it.
  function onPointerLockChange() {
    if (!enabled) return
    if (document.pointerLockElement !== domElement) {
      for (const fn of lockLostListeners) fn()
    }
  }

  function requestLock() {
    // Chrome rejects a re-lock made too soon after an Escape-driven exit, and
    // any browser rejects one outside a user gesture. Either way the click
    // handler above is still there as the fallback, so a failure is fine.
    const result = domElement.requestPointerLock()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  }

  domElement.addEventListener('click', onClick)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onPointerLockChange)

  const pivot = new THREE.Vector3()
  const smoothedPivot = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()

  let distance = settings.get('cameraDistance')
  let hasSnapped = false

  // `collidables` is the scene (or any root) tested for camera obstruction.
  // Anything flagged userData.noCameraCollision is skipped, for decorative
  // scatter — sparks, debris — that would otherwise make the camera twitch.
  function update(delta, playerMesh, collidables) {
    pivot.set(playerMesh.position.x, playerMesh.position.y + PIVOT_HEIGHT, playerMesh.position.z)

    // The player's preferred follow distance; the collision pass below is
    // free to pull the camera closer than this, never further out.
    const maxDistance = settings.get('cameraDistance')

    if (!hasSnapped) {
      // Avoid a slow pan-in from wherever the camera defaulted to.
      smoothedPivot.copy(pivot)
      distance = maxDistance
      hasSnapped = true
    } else {
      const lerpFactor = 1 - Math.pow(1 - FOLLOW_SMOOTHING, delta * 60)
      smoothedPivot.lerp(pivot, lerpFactor)
    }

    // Unit vector from the pivot out to where the camera wants to sit.
    const horizontal = Math.cos(pitch)
    offset.set(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal)

    let allowed = maxDistance
    if (collidables) {
      raycaster.set(smoothedPivot, offset)
      raycaster.far = maxDistance
      const hits = raycaster.intersectObject(collidables, true)
      for (const hit of hits) {
        if (isDescendantOf(hit.object, playerMesh)) continue
        if (hit.object.userData.noCameraCollision) continue
        allowed = Math.max(MIN_DISTANCE, hit.distance - COLLISION_PADDING)
        break
      }
    }

    if (allowed < distance) {
      distance = allowed // snap in — never let geometry block the player
    } else {
      distance += (allowed - distance) * Math.min(1, delta * COLLISION_EASE_OUT)
    }

    camera.position.copy(smoothedPivot).addScaledVector(offset, distance)
    camera.lookAt(smoothedPivot)
  }

  // Drop the smoothing for the next update() so the camera jumps straight to
  // its offset — used after a respawn or level load, where lerping across the
  // whole map would look wrong.
  function snap() {
    hasSnapped = false
  }

  // Point the camera (and therefore "forward" for movement, which is
  // camera-relative) along a level's spawn yaw. Level 3 runs back down the
  // train towards the locomotive, so without this the player would spawn
  // facing the way they came.
  function setYaw(value) {
    if (typeof value === 'number') yaw = value
  }

  // Menus (pause, settings, title) turn the camera off: no mouse look, no
  // pointer-lock grab when the player clicks a button that happens to sit
  // over the canvas, and no lock-lost callback while the lock is released on
  // purpose.
  function setEnabled(value) {
    enabled = value
    if (!value && document.pointerLockElement === domElement) document.exitPointerLock()
  }

  function onLockLost(fn) {
    lockLostListeners.add(fn)
    return () => lockLostListeners.delete(fn)
  }

  function dispose() {
    domElement.removeEventListener('click', onClick)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('pointerlockchange', onPointerLockChange)
    lockLostListeners.clear()
  }

  return {
    update,
    snap,
    setYaw,
    setEnabled,
    onLockLost,
    requestLock,
    dispose,
    // Yaw and pitch are read by the first-person camera, which has no mouse
    // input of its own — this module stays the one owner of pointer lock and
    // look angles in both views, so switching never changes where you face.
    getYaw: () => yaw,
    getPitch: () => pitch,
    get isEnabled() { return enabled }
  }
}

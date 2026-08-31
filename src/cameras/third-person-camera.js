import * as THREE from 'three'

// Third-person camera: follows the player with a smoothed (lerped) offset
// and orbits around them on mouse look, using the Pointer Lock API. This
// replaces src/dev/dev-controls.js in the active scene for this milestone —
// that file isn't deleted, it's still useful for debugging other scenes.
const DISTANCE = 6
const BASE_HEIGHT = 2.5
const LOOK_HEIGHT = 1.2
const MOUSE_SENSITIVITY = 0.0025
const PITCH_MIN = -0.4
const PITCH_MAX = 0.9
// Fraction of the remaining distance to close per 1/60s tick; scaled by
// delta so the follow feels the same regardless of frame rate.
const FOLLOW_SMOOTHING = 0.12

export function createThirdPersonCamera(camera, domElement) {
  let yaw = 0
  let pitch = 0.25

  function onMouseMove(event) {
    if (document.pointerLockElement !== domElement) return
    yaw -= event.movementX * MOUSE_SENSITIVITY
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX)
  }

  function onClick() {
    domElement.requestPointerLock()
  }

  domElement.addEventListener('click', onClick)
  document.addEventListener('mousemove', onMouseMove)

  const desiredPosition = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  let hasSnapped = false

  function update(delta, playerMesh) {
    const horizontalDistance = DISTANCE * Math.cos(pitch)
    const height = BASE_HEIGHT + DISTANCE * Math.sin(pitch)

    desiredPosition.set(
      playerMesh.position.x - Math.sin(yaw) * horizontalDistance,
      playerMesh.position.y + height,
      playerMesh.position.z - Math.cos(yaw) * horizontalDistance
    )

    if (!hasSnapped) {
      // Avoid a slow pan-in from wherever the camera defaulted to.
      camera.position.copy(desiredPosition)
      hasSnapped = true
    } else {
      const lerpFactor = 1 - Math.pow(1 - FOLLOW_SMOOTHING, delta * 60)
      camera.position.lerp(desiredPosition, lerpFactor)
    }

    lookTarget.set(playerMesh.position.x, playerMesh.position.y + LOOK_HEIGHT, playerMesh.position.z)
    camera.lookAt(lookTarget)
  }

  function dispose() {
    domElement.removeEventListener('click', onClick)
    document.removeEventListener('mousemove', onMouseMove)
  }

  return { update, dispose, getYaw: () => yaw }
}

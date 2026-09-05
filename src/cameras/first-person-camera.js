import * as THREE from 'three'

// First-person camera.
// Mouse yaw/pitch is supplied by the existing third-person camera so that
// switching views does not suddenly change the direction the player is facing.

const STANDING_EYE_HEIGHT = 1.62
const CROUCH_EYE_HEIGHT = 1.08

// How quickly the camera lowers/rises when crouching.
const HEIGHT_SMOOTHING = 12

export function createFirstPersonCamera(camera) {
  const position = new THREE.Vector3()
  const lookDirection = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()

  let eyeHeight = STANDING_EYE_HEIGHT
  let hasSnapped = false

  function update(
    delta,
    playerMesh,
    {
      yaw = 0,
      pitch = 0,
      crouching = false
    } = {}
  ) {
    if (!playerMesh) return

    // --------------------------------------------------------
    // CAMERA HEIGHT
    // --------------------------------------------------------

    const targetHeight = crouching
      ? CROUCH_EYE_HEIGHT
      : STANDING_EYE_HEIGHT

    if (!hasSnapped) {
      eyeHeight = targetHeight
      hasSnapped = true
    } else {
      eyeHeight +=
        (targetHeight - eyeHeight) *
        Math.min(1, delta * HEIGHT_SMOOTHING)
    }

    // --------------------------------------------------------
    // CAMERA POSITION
    // --------------------------------------------------------

    // playerMesh.position.y already moves during jumping,
    // so first-person naturally follows the player's jump.
    position.set(
      playerMesh.position.x,
      playerMesh.position.y + eyeHeight,
      playerMesh.position.z
    )

    camera.position.copy(position)

    // --------------------------------------------------------
    // LOOK DIRECTION
    // --------------------------------------------------------

    // Same yaw/pitch convention as the existing third-person camera.
    const horizontal = Math.cos(pitch)

    lookDirection.set(
      Math.sin(yaw) * horizontal,
      -Math.sin(pitch),
      Math.cos(yaw) * horizontal
    )

    lookTarget
      .copy(camera.position)
      .add(lookDirection)

    camera.lookAt(lookTarget)
  }

  function snap(crouching = false) {
    eyeHeight = crouching
      ? CROUCH_EYE_HEIGHT
      : STANDING_EYE_HEIGHT

    hasSnapped = false
  }

  return {
    update,
    snap
  }
}
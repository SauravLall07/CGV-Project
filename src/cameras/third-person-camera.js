import * as THREE from 'three'

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

const DISTANCE = 4.8
const MIN_DISTANCE = 1.2
const PIVOT_HEIGHT = 1.5 // roughly head height on the 1.85 m figure
const COLLISION_PADDING = 0.25
const COLLISION_EASE_OUT = 4 // per second, when the obstruction clears
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

  const pivot = new THREE.Vector3()
  const smoothedPivot = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()

  let distance = DISTANCE
  let hasSnapped = false

  // `collidables` is the scene (or any root) tested for camera obstruction.
  // Anything flagged userData.noCameraCollision is skipped, for decorative
  // scatter — sparks, debris — that would otherwise make the camera twitch.
  function update(delta, playerMesh, collidables) {
    pivot.set(playerMesh.position.x, playerMesh.position.y + PIVOT_HEIGHT, playerMesh.position.z)

    if (!hasSnapped) {
      // Avoid a slow pan-in from wherever the camera defaulted to.
      smoothedPivot.copy(pivot)
      distance = DISTANCE
      hasSnapped = true
    } else {
      const lerpFactor = 1 - Math.pow(1 - FOLLOW_SMOOTHING, delta * 60)
      smoothedPivot.lerp(pivot, lerpFactor)
    }

    // Unit vector from the pivot out to where the camera wants to sit.
    const horizontal = Math.cos(pitch)
    offset.set(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal)

    let allowed = DISTANCE
    if (collidables) {
      raycaster.set(smoothedPivot, offset)
      raycaster.far = DISTANCE
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

  function dispose() {
    domElement.removeEventListener('click', onClick)
    document.removeEventListener('mousemove', onMouseMove)
  }

  return {
    update,
    snap,
    setYaw,
    dispose,

    getYaw: () => yaw,
    getPitch: () => pitch
  }
}

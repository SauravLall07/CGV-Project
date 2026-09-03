import * as THREE from 'three'
import { createHumanoid, PLAYER_PALETTE } from './humanoid.js'

// The player: a humanoid figure (see entities/humanoid.js) that holds its own
// position/rotation and moves each frame from keyboard input. Movement is
// camera-relative (per the concept doc's "smooth follow and mouse-controlled
// looking") — forward always means "away from the camera," not a fixed world
// axis. Still stand-in geometry rather than a modelled character.

const MOVE_SPEED = 4 // metres/second
const RUN_MULTIPLIER = 1.8
const TURN_SMOOTHING = 14 // how fast the body swings round to face travel

// Walk cycle: peak limb swing in radians, how fast the phase advances with
// distance travelled, and how far the torso bobs at the top of each step.
// Purely cosmetic — no physics is involved.
const STRIDE_AMPLITUDE = 0.72
const STRIDE_FREQUENCY = 2.4
const BOB_HEIGHT = 0.035
const RUN_LEAN = 0.13

export function createPlayer() {
  const { group, body, leftArm, rightArm, leftLeg, rightLeg } = createHumanoid(PLAYER_PALETTE)
  group.position.set(0, 0, -8)

  let stridePhase = 0
  let facing = 0

  // Teleport helper used by the respawn system and the level manager — moves
  // the figure to a pose without any interpolation and resets the walk cycle.
  function setPose(position, yaw = 0) {
    group.position.copy(position)
    group.rotation.y = yaw
    facing = yaw
    stridePhase = 0
    body.position.y = 0
    body.rotation.x = 0
  }

  function update(delta, { keyboard, cameraYaw, bounds }) {
    const sin = Math.sin(cameraYaw)
    const cos = Math.cos(cameraYaw)

    // Camera-relative basis: forward = (sin, cos) points away from the
    // camera; right = (-cos, sin) is 90° clockwise from forward (up × forward
    // in Three's right-handed space).
    let dx = 0
    let dz = 0
    if (keyboard.forward) { dx += sin; dz += cos }
    if (keyboard.back) { dx -= sin; dz -= cos }
    if (keyboard.left) { dx += cos; dz -= sin }
    if (keyboard.right) { dx -= cos; dz += sin }

    const length = Math.hypot(dx, dz)
    const running = Boolean(keyboard.run) && length > 0

    if (length > 0) {
      dx /= length
      dz /= length

      const speed = (running ? MOVE_SPEED * RUN_MULTIPLIER : MOVE_SPEED) * delta
      group.position.x += dx * speed
      group.position.z += dz * speed

      // Turn towards the direction of travel rather than snapping, so
      // changing direction reads as the character pivoting.
      const target = Math.atan2(dx, dz)
      let difference = target - facing
      while (difference > Math.PI) difference -= Math.PI * 2
      while (difference < -Math.PI) difference += Math.PI * 2
      facing += difference * Math.min(1, delta * TURN_SMOOTHING)
      group.rotation.y = facing

      stridePhase += speed * STRIDE_FREQUENCY
    } else {
      // Ease the swing back to a neutral stand when stopped.
      stridePhase *= Math.max(0, 1 - delta * 10)
    }

    const swing = Math.sin(stridePhase) * STRIDE_AMPLITUDE
    leftLeg.rotation.x = swing
    rightLeg.rotation.x = -swing
    leftArm.rotation.x = -swing * 0.8
    rightArm.rotation.x = swing * 0.8

    // The torso rises twice per stride (once per footfall), and leans into a
    // run. Bobbing `body` rather than `group` keeps the group origin — which
    // bounds, respawn and the camera all read — planted on the floor.
    body.position.y = Math.abs(Math.sin(stridePhase)) * BOB_HEIGHT
    const leanTarget = running ? RUN_LEAN : 0
    body.rotation.x += (leanTarget - body.rotation.x) * Math.min(1, delta * 6)

    if (bounds) {
      group.position.x = THREE.MathUtils.clamp(group.position.x, bounds.minX, bounds.maxX)
      group.position.z = THREE.MathUtils.clamp(group.position.z, bounds.minZ, bounds.maxZ)
    }
  }

  return { mesh: group, update, setPose }
}

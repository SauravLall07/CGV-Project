import * as THREE from 'three'
import { createHumanoid, PLAYER_PALETTE } from './humanoid.js'
import { resolveBoxCollision } from '../core/collision.js'

// -----------------------------------------------------------------------------
// MOVEMENT
// -----------------------------------------------------------------------------
const MOVE_SPEED = 4
const RUN_MULTIPLIER = 1.7
const CROUCH_SPEED_MULTIPLIER = 0.42
const TURN_SMOOTHING = 14

// -----------------------------------------------------------------------------
// WALK / RUN ANIMATION
// -----------------------------------------------------------------------------
const STRIDE_AMPLITUDE = 0.72
const STRIDE_FREQUENCY = 2.4
const BOB_HEIGHT = 0.035
const RUN_LEAN = 0.13

// -----------------------------------------------------------------------------
// JUMP PHYSICS
// -----------------------------------------------------------------------------
const GRAVITY = 18
const JUMP_SPEED = 6.4
const JUMP_MOMENTUM = 0.8

// -----------------------------------------------------------------------------
// CROUCH POSE
// -----------------------------------------------------------------------------
// The thigh swings forward from the hip and the lower leg folds back at the
// knee. The pelvis is then lowered by exactly the amount lost from the leg's
// vertical reach, which keeps the feet close to the floor and keeps the torso
// attached to the hips.
const CROUCH_HIP_ANGLE = -0.85
const CROUCH_KNEE_ANGLE = 1.35
const CROUCH_TORSO_LEAN = 0.24
const CROUCH_STRIDE_SCALE = 0.25
const CROUCH_ARM_SWING_SCALE = 0.35
const CROUCH_BLEND_SPEED = 10

// -----------------------------------------------------------------------------
// HELPERS FOR THE ARTICULATED LEG REPLACEMENT
// -----------------------------------------------------------------------------
function firstMaterial(object) {
  let result = null

  object.traverse((node) => {
    if (result || !node.isMesh || !node.material) return
    result = Array.isArray(node.material) ? node.material[0] : node.material
  })

  return result ?? new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.8 })
}

function boundsInParent(object) {
  object.updateMatrixWorld(true)

  const parent = object.parent
  if (!parent) return null

  parent.updateMatrixWorld(true)

  const worldBox = new THREE.Box3().setFromObject(object)
  if (worldBox.isEmpty()) return null

  const min = worldBox.min
  const max = worldBox.max

  const points = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ]

  const localBox = new THREE.Box3()
  localBox.makeEmpty()

  for (const point of points) {
    parent.worldToLocal(point)
    localBox.expandByPoint(point)
  }

  return localBox
}

function makeLimbMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// Turns the original single-piece leg into a real two-joint leg without
// requiring any changes to humanoid.js. The original leg is hidden, and its
// size, position and material are used to build a thigh, knee, shin and foot.
function createArticulatedLeg(oldLeg, name) {
  const parent = oldLeg.parent
  if (!parent) throw new Error(`player: ${name} has no parent`)

  const box = boundsInParent(oldLeg)
  const size = new THREE.Vector3()
  const centre = new THREE.Vector3()

  if (box) {
    box.getSize(size)
    box.getCenter(centre)
  } else {
    size.set(0.42, 1.65, 0.42)
    centre.copy(oldLeg.position)
  }

  const legLength = size.y
  const width = Math.max(Math.min(size.x, size.z), 0.28)
  const radius = THREE.MathUtils.clamp(width * 0.38, 0.11, legLength * 0.12)
  const footHeight = Math.min(radius * 0.9, legLength * 0.1)
  const articulatedLength = legLength - footHeight
  const thighLength = articulatedLength * 0.5
  const shinLength = articulatedLength * 0.5

  // If the existing leg is a Group with its pivot at the hip, box.max.y still
  // gives the correct attachment height. If it is a centred Mesh, this also
  // converts its centre position into a top-of-leg hip position.
  const hip = new THREE.Group()
  hip.name = `${name}-hip`
  hip.position.set(centre.x, box ? box.max.y : centre.y + legLength * 0.5, centre.z)

  const material = firstMaterial(oldLeg)

  const thigh = makeLimbMesh(
    new THREE.CylinderGeometry(radius * 1.05, radius * 0.95, thighLength, 10),
    material
  )
  thigh.name = `${name}-thigh`
  thigh.position.y = -thighLength * 0.5
  hip.add(thigh)

  const knee = new THREE.Group()
  knee.name = `${name}-knee`
  knee.position.y = -thighLength
  hip.add(knee)

  const kneeCap = makeLimbMesh(
    new THREE.SphereGeometry(radius * 1.02, 10, 7),
    material
  )
  kneeCap.name = `${name}-knee-cap`
  knee.add(kneeCap)

  const shin = makeLimbMesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.8, shinLength, 10),
    material
  )
  shin.name = `${name}-shin`
  shin.position.y = -shinLength * 0.5
  knee.add(shin)

  const ankle = new THREE.Group()
  ankle.name = `${name}-ankle`
  ankle.position.y = -shinLength
  knee.add(ankle)

  // A small foot makes the crouched silhouette much more readable and gives
  // the lower leg somewhere visually believable to terminate.
  const foot = makeLimbMesh(
    new THREE.BoxGeometry(radius * 1.55, footHeight, radius * 2.5),
    material
  )
  foot.name = `${name}-foot`
  foot.position.set(0, -footHeight * 0.5, radius * 0.55)
  ankle.add(foot)

  parent.add(hip)

  // Keep the old leg in the hierarchy so nothing else holding a reference to
  // it breaks, but hide its geometry.
  oldLeg.visible = false

  return {
    hip,
    knee,
    ankle,
    thighLength,
    shinLength,
    basePosition: hip.position.clone()
  }
}

export function createPlayer() {
  const {
    group,
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg
  } = createHumanoid(PLAYER_PALETTE)

  group.name = 'player'
  group.position.set(0, 0, -8)
  group.updateMatrixWorld(true)

  // Build real knee joints from the existing simple legs. This leaves
  // humanoid.js untouched and therefore does not change guards or other
  // characters that may also use createHumanoid().
  const leftRig = createArticulatedLeg(leftLeg, 'left-leg')
  const rightRig = createArticulatedLeg(rightLeg, 'right-leg')

  const bodyBaseY = body.position.y

  let stridePhase = 0
  let facing = 0
  let crouchAmount = 0

  // Jump state.
  let groundY = group.position.y
  let verticalVelocity = 0
  let airVelocityX = 0
  let airVelocityZ = 0
  let airborne = false
  let wasJumpHeld = false

  // Movement flags, lifted out of update()'s locals so the stealth system can
  // read the player's current gait (crouch/run/jump) to scale detectability —
  // crouching should be much quieter than a normal walk, running or jumping
  // much louder.
  let crouching = false
  let running = false
  let moving = false

  function turnToward(dx, dz, delta) {
    const target = Math.atan2(dx, dz)
    let difference = target - facing

    while (difference > Math.PI) difference -= Math.PI * 2
    while (difference < -Math.PI) difference += Math.PI * 2

    facing += difference * Math.min(1, delta * TURN_SMOOTHING)
    group.rotation.y = facing
  }

  function setLegPose(rig, hipAngle, kneeAngle, pelvisOffset, blend) {
    rig.hip.rotation.x += (hipAngle - rig.hip.rotation.x) * blend
    rig.knee.rotation.x += (kneeAngle - rig.knee.rotation.x) * blend

    const targetY = rig.basePosition.y + pelvisOffset
    rig.hip.position.y += (targetY - rig.hip.position.y) * blend
  }

  // How far the pelvis has to descend when the two-link leg bends to the given
  // crouch angles. This is the key to the pose: the knees bend while the feet
  // stay close to their standing height instead of the torso separating from
  // the legs.
  function crouchPelvisDrop(amount) {
    const hipAngle = CROUCH_HIP_ANGLE * amount
    const kneeAngle = CROUCH_KNEE_ANGLE * amount

    const l1 = (leftRig.thighLength + rightRig.thighLength) * 0.5
    const l2 = (leftRig.shinLength + rightRig.shinLength) * 0.5

    const standingReach = l1 + l2
    const bentReach =
      l1 * Math.cos(hipAngle) +
      l2 * Math.cos(hipAngle + kneeAngle)

    return Math.max(0, standingReach - bentReach)
  }

  function resetPose() {
    body.position.y = bodyBaseY
    body.rotation.x = 0

    leftArm.rotation.x = 0
    rightArm.rotation.x = 0

    leftRig.hip.position.copy(leftRig.basePosition)
    rightRig.hip.position.copy(rightRig.basePosition)
    leftRig.hip.rotation.x = 0
    rightRig.hip.rotation.x = 0
    leftRig.knee.rotation.x = 0
    rightRig.knee.rotation.x = 0
  }

  // Used by respawn and level transitions.
  function setPose(position, yaw = 0) {
    group.position.copy(position)
    group.rotation.y = yaw
    facing = yaw

    groundY = position.y
    verticalVelocity = 0
    airVelocityX = 0
    airVelocityZ = 0
    airborne = false
    wasJumpHeld = false

    crouchAmount = 0
    stridePhase = 0
    resetPose()
  }

  function update(delta, { keyboard, cameraYaw, bounds, obstacles }) {
    const sin = Math.sin(cameraYaw)
    const cos = Math.cos(cameraYaw)

    // -----------------------------------------------------------------------
    // INPUT DIRECTION
    // -----------------------------------------------------------------------
    let dx = 0
    let dz = 0

    if (keyboard.forward) { dx += sin; dz += cos }
    if (keyboard.back) { dx -= sin; dz -= cos }
    if (keyboard.left) { dx += cos; dz -= sin }
    if (keyboard.right) { dx -= cos; dz += sin }

    const inputLength = Math.hypot(dx, dz)
    moving = inputLength > 0

    if (moving) {
      dx /= inputLength
      dz /= inputLength
    }

    const jumpHeld = Boolean(keyboard.jump)
    const jumpPressed = jumpHeld && !wasJumpHeld
    wasJumpHeld = jumpHeld

    crouching = Boolean(keyboard.duck) && !airborne
    running = Boolean(keyboard.run) && moving && !crouching

    if (!airborne) groundY = group.position.y

    // -----------------------------------------------------------------------
    // MOVEMENT / JUMP PHYSICS
    // -----------------------------------------------------------------------
    if (airborne) {
      group.position.x += airVelocityX * delta
      group.position.z += airVelocityZ * delta

      verticalVelocity -= GRAVITY * delta
      group.position.y += verticalVelocity * delta

      if (Math.hypot(airVelocityX, airVelocityZ) > 0.001) {
        turnToward(airVelocityX, airVelocityZ, delta)
      }

      if (group.position.y <= groundY) {
        group.position.y = groundY
        verticalVelocity = 0
        airVelocityX = 0
        airVelocityZ = 0
        airborne = false
      }
    } else if (jumpPressed && !crouching) {
      const launchSpeed = running ? MOVE_SPEED * RUN_MULTIPLIER : MOVE_SPEED

      airVelocityX = moving ? dx * launchSpeed * JUMP_MOMENTUM : 0
      airVelocityZ = moving ? dz * launchSpeed * JUMP_MOMENTUM : 0
      verticalVelocity = JUMP_SPEED
      airborne = true

      if (moving) turnToward(dx, dz, delta)
    } else if (moving) {
      let movementMultiplier = 1
      if (crouching) movementMultiplier = CROUCH_SPEED_MULTIPLIER
      else if (running) movementMultiplier = RUN_MULTIPLIER

      const distance = MOVE_SPEED * movementMultiplier * delta

      group.position.x += dx * distance
      group.position.z += dz * distance
      turnToward(dx, dz, delta)

      stridePhase += distance * STRIDE_FREQUENCY
    } else {
      stridePhase *= Math.max(0, 1 - delta * 10)
    }

    // Smooth crouch in/out instead of snapping.
    const crouchTarget = crouching ? 1 : 0
    crouchAmount +=
      (crouchTarget - crouchAmount) *
      Math.min(1, delta * CROUCH_BLEND_SPEED)

    // -----------------------------------------------------------------------
    // CHARACTER ANIMATION
    // -----------------------------------------------------------------------
    const blend = Math.min(1, delta * 14)

    if (airborne) {
      // Keep pelvis/torso connected and remove crouch offsets while jumping.
      const rising = verticalVelocity > 0

      const leftHipTarget = rising ? -0.35 : -0.12
      const rightHipTarget = rising ? 0.35 : 0.12
      const leftKneeTarget = rising ? 0.72 : 0.28
      const rightKneeTarget = rising ? 0.45 : 0.28

      setLegPose(leftRig, leftHipTarget, leftKneeTarget, 0, blend)
      setLegPose(rightRig, rightHipTarget, rightKneeTarget, 0, blend)

      body.position.y += (bodyBaseY - body.position.y) * blend
      body.rotation.x += (0.08 - body.rotation.x) * blend

      leftArm.rotation.x += (0.35 - leftArm.rotation.x) * blend
      rightArm.rotation.x += (-0.35 - rightArm.rotation.x) * blend
    } else {
      const stride = Math.sin(stridePhase)
      const bob = moving ? Math.abs(stride) * BOB_HEIGHT : 0

      // Crouched steps are deliberately small. The large shape of the pose
      // comes from the hip + knee angles, not from swinging rigid straight legs.
      const strideScale = THREE.MathUtils.lerp(1, CROUCH_STRIDE_SCALE, crouchAmount)
      const hipSwing = stride * STRIDE_AMPLITUDE * strideScale

      const leftWalkKnee = Math.max(0, stride) * 0.38
      const rightWalkKnee = Math.max(0, -stride) * 0.38

      const crouchHip = CROUCH_HIP_ANGLE * crouchAmount
      const crouchKnee = CROUCH_KNEE_ANGLE * crouchAmount

      // Reduce the normal walk swing as the character gets deeper into the
      // crouch, but keep enough alternating motion to read as crouch-walking.
      const leftHipTarget = crouchHip + hipSwing
      const rightHipTarget = crouchHip - hipSwing

      const leftKneeTarget =
        crouchKnee +
        leftWalkKnee * (1 - crouchAmount * 0.6) -
        hipSwing * crouchAmount * 0.25

      const rightKneeTarget =
        crouchKnee +
        rightWalkKnee * (1 - crouchAmount * 0.6) +
        hipSwing * crouchAmount * 0.25

      const hipDrop = crouchPelvisDrop(crouchAmount)
      const pelvisBob = bob * (1 - crouchAmount * 0.5)
      const pelvisOffset = pelvisBob - hipDrop

      setLegPose(leftRig, leftHipTarget, leftKneeTarget, pelvisOffset, blend)
      setLegPose(rightRig, rightHipTarget, rightKneeTarget, pelvisOffset, blend)

      // Move the upper body by the same pelvis offset as the hip joints. This is
      // what prevents the torso from becoming visually detached from the legs.
      const bodyYTarget = bodyBaseY + pelvisOffset
      body.position.y += (bodyYTarget - body.position.y) * blend

      const torsoTarget = running
        ? RUN_LEAN
        : CROUCH_TORSO_LEAN * crouchAmount

      body.rotation.x += (torsoTarget - body.rotation.x) * Math.min(1, delta * 9)

      const armScale = THREE.MathUtils.lerp(1, CROUCH_ARM_SWING_SCALE, crouchAmount)
      const leftArmTarget = -hipSwing * 0.8 * armScale + crouchAmount * 0.18
      const rightArmTarget = hipSwing * 0.8 * armScale + crouchAmount * 0.18

      leftArm.rotation.x += (leftArmTarget - leftArm.rotation.x) * blend
      rightArm.rotation.x += (rightArmTarget - rightArm.rotation.x) * blend
    }

    // -----------------------------------------------------------------------
    // COLLISION / BOUNDS
    // -----------------------------------------------------------------------
    if (obstacles) resolveBoxCollision(group.position, obstacles)

    if (bounds) {
      group.position.x = THREE.MathUtils.clamp(group.position.x, bounds.minX, bounds.maxX)
      group.position.z = THREE.MathUtils.clamp(group.position.z, bounds.minZ, bounds.maxZ)
    }
  }

  return {
    mesh: group,
    update,
    setPose,
    isCrouching: () => crouching,
    isRunning: () => running,
    isAirborne: () => airborne,
    isMoving: () => moving
  }
}
import * as THREE from 'three'

// Placeholder player: a blocky humanoid standing in for a character model,
// holding its own position/rotation and moving each frame from keyboard
// input. Movement is camera-relative (per the concept doc's "smooth follow
// and mouse-controlled looking") — forward always means "away from the
// camera," not a fixed world axis.
const MOVE_SPEED = 4 // metres/second
const RUN_MULTIPLIER = 1.8

// Proportions of the greybox man, in metres. The group's origin sits at the
// feet (y = 0 on the ground), so callers place it with position.y = 0.
const LEG_HEIGHT = 0.9
const TORSO_HEIGHT = 0.65
const ARM_HEIGHT = 0.6
const HEAD_RADIUS = 0.14
const HIP_WIDTH = 0.18
const SHOULDER_WIDTH = 0.44

// How fast the limbs swing (radians of peak rotation) and how the swing
// phase advances with distance travelled — purely cosmetic, no physics.
const STRIDE_AMPLITUDE = 0.7
const STRIDE_FREQUENCY = 2.4

export function createPlayer() {
  const group = new THREE.Group()
  group.position.set(0, 0, -8)

  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066 })
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4f8ef7 })
  const trousers = new THREE.MeshStandardMaterial({ color: 0x2f3b52 })

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(SHOULDER_WIDTH, TORSO_HEIGHT, 0.24),
    shirt
  )
  torso.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2
  group.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 12, 10), skin)
  head.position.y = LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS + 0.04
  group.add(head)

  // Small nose so the facing direction is legible on the greybox.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.06), skin)
  nose.position.set(0, head.position.y, HEAD_RADIUS)
  group.add(nose)

  // Limbs pivot from the top (hip / shoulder). Each is a Group whose child
  // box hangs downward, so rotating the group swings the whole limb.
  function makeLimb(height, width, material, x, pivotY) {
    const pivot = new THREE.Group()
    pivot.position.set(x, pivotY, 0)
    const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), material)
    box.position.y = -height / 2
    box.castShadow = true
    pivot.add(box)
    group.add(pivot)
    return pivot
  }

  const legPivotY = LEG_HEIGHT
  const armPivotY = LEG_HEIGHT + TORSO_HEIGHT - 0.05
  const leftLeg = makeLimb(LEG_HEIGHT, HIP_WIDTH, trousers, -HIP_WIDTH, legPivotY)
  const rightLeg = makeLimb(LEG_HEIGHT, HIP_WIDTH, trousers, HIP_WIDTH, legPivotY)
  const leftArm = makeLimb(ARM_HEIGHT, 0.12, shirt, -SHOULDER_WIDTH / 2 - 0.06, armPivotY)
  const rightArm = makeLimb(ARM_HEIGHT, 0.12, shirt, SHOULDER_WIDTH / 2 + 0.06, armPivotY)

  torso.castShadow = true
  head.castShadow = true

  let stridePhase = 0

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
    if (length > 0) {
      dx /= length
      dz /= length

      const speed = (keyboard.run ? MOVE_SPEED * RUN_MULTIPLIER : MOVE_SPEED) * delta
      group.position.x += dx * speed
      group.position.z += dz * speed
      group.rotation.y = Math.atan2(dx, dz)

      stridePhase += length * speed * STRIDE_FREQUENCY
    } else {
      // Ease the swing back to a neutral stand when stopped.
      stridePhase *= Math.max(0, 1 - delta * 10)
    }

    const swing = Math.sin(stridePhase) * STRIDE_AMPLITUDE
    leftLeg.rotation.x = swing
    rightLeg.rotation.x = -swing
    leftArm.rotation.x = -swing
    rightArm.rotation.x = swing

    if (bounds) {
      group.position.x = THREE.MathUtils.clamp(group.position.x, bounds.minX, bounds.maxX)
      group.position.z = THREE.MathUtils.clamp(group.position.z, bounds.minZ, bounds.maxZ)
    }
  }

  return { mesh: group, update }
}

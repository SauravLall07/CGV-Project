import * as THREE from 'three'

// Placeholder player: a capsule standing in for a character model, holding
// its own position/rotation and moving each frame from keyboard input.
// Movement is camera-relative (per the concept doc's "smooth follow and
// mouse-controlled looking") — forward always means "away from the
// camera," not a fixed world axis.
const MOVE_SPEED = 4 // metres/second
const RUN_MULTIPLIER = 1.8
const RADIUS = 0.4
const CYLINDER_LENGTH = 1.0

export function createPlayer() {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(RADIUS, CYLINDER_LENGTH, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4f8ef7 })
  )
  const halfHeight = CYLINDER_LENGTH / 2 + RADIUS
  mesh.position.set(0, halfHeight, -8)
  mesh.castShadow = true

  function update(delta, { keyboard, cameraYaw, bounds }) {
    const sin = Math.sin(cameraYaw)
    const cos = Math.cos(cameraYaw)

    let dx = 0
    let dz = 0
    if (keyboard.forward) { dx += sin; dz += cos }
    if (keyboard.back) { dx -= sin; dz -= cos }
    if (keyboard.left) { dx -= cos; dz += sin }
    if (keyboard.right) { dx += cos; dz -= sin }

    const length = Math.hypot(dx, dz)
    if (length > 0) {
      dx /= length
      dz /= length

      const speed = (keyboard.run ? MOVE_SPEED * RUN_MULTIPLIER : MOVE_SPEED) * delta
      mesh.position.x += dx * speed
      mesh.position.z += dz * speed
      mesh.rotation.y = Math.atan2(dx, dz)
    }

    if (bounds) {
      mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, bounds.minX, bounds.maxX)
      mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, bounds.minZ, bounds.maxZ)
    }
  }

  return { mesh, update }
}

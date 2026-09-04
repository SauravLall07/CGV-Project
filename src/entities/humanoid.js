import * as THREE from 'three'

// Shared humanoid figure, built from primitives. Still stand-in geometry
// rather than a modelled/rigged character, but shaped and proportioned enough
// to read as a person: capsule limbs, a tapered coat, a hat, and separate
// shoulder/hip pivots so a walk cycle can drive it.
//
// Both the player and the station's guard placeholders build from here, so
// Phase 2's patrolling guards get the same silhouette (and the same walk
// animation) as the player for free.
//
// Layout: the group's origin sits at the feet (y = 0 on the ground). Legs
// hang off the group directly; everything above the hips hangs off `body`,
// which is bobbed vertically by the walk cycle — the coat skirt covers the
// seam so the hips never visibly separate from the legs.

const HIP_Y = 0.86
const SHOULDER_Y = 1.44
const NECK_Y = 1.5
const HEAD_Y = 1.66

const LEG_LENGTH = 0.86
const LEG_RADIUS = 0.105
const ARM_LENGTH = 0.62
const ARM_RADIUS = 0.072
const SHOULDER_HALF = 0.225
const HIP_HALF = 0.115

export const HUMANOID_HEIGHT = 1.85

// Palettes are plain colour sets so a guard is one object literal away from
// the player rather than a second copy of this builder.
export const PLAYER_PALETTE = {
  coat: 0x2c3450,
  trousers: 0x1e222e,
  leather: 0x141620,
  skin: 0xc08a5e,
  hat: 0x232a40,
  accent: 0x8f3c3c,
  cap: 'flat'
}

export const GUARD_PALETTE = {
  coat: 0x5d2224,
  trousers: 0x22262f,
  leather: 0x17181d,
  skin: 0xb87c4f,
  hat: 0x1c2029,
  accent: 0xc7a24a,
  cap: 'peaked'
}

function limb({ pivotX, pivotY, length, radius, material, parent }) {
  const pivot = new THREE.Group()
  pivot.position.set(pivotX, pivotY, 0)

  // CapsuleGeometry's `length` is the cylindrical section only, so subtract
  // both hemispherical caps to hit the requested total length.
  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 10),
    material
  )
  capsule.position.y = -length / 2
  capsule.castShadow = true
  pivot.add(capsule)
  parent.add(pivot)
  return pivot
}

export function createHumanoid(palette = PLAYER_PALETTE) {
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const coatMaterial = new THREE.MeshStandardMaterial({ color: palette.coat, roughness: 0.72, metalness: 0.05 })
  const trouserMaterial = new THREE.MeshStandardMaterial({ color: palette.trousers, roughness: 0.82, metalness: 0.02 })
  const leatherMaterial = new THREE.MeshStandardMaterial({ color: palette.leather, roughness: 0.38, metalness: 0.15 })
  const skinMaterial = new THREE.MeshPhysicalMaterial({ color: palette.skin, roughness: 0.65, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.8 })
  const hatMaterial = new THREE.MeshStandardMaterial({ color: palette.hat, roughness: 0.68, metalness: 0.05 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.5, metalness: 0.4 })

  // Torso: an elliptical tapered cylinder — wider at the shoulders, squashed
  // front-to-back so it doesn't read as a barrel.
  const torsoGeometry = new THREE.CylinderGeometry(0.245, 0.2, SHOULDER_Y - HIP_Y + 0.08, 16)
  torsoGeometry.scale(1, 1, 0.62)
  const torso = new THREE.Mesh(torsoGeometry, coatMaterial)
  torso.position.y = (HIP_Y + SHOULDER_Y) / 2 + 0.02
  torso.castShadow = true
  body.add(torso)

  // Coat skirt flaring over the hips.
  const skirtGeometry = new THREE.CylinderGeometry(0.215, 0.305, 0.44, 16)
  skirtGeometry.scale(1, 1, 0.68)
  const skirt = new THREE.Mesh(skirtGeometry, coatMaterial)
  skirt.position.y = HIP_Y - 0.05
  skirt.castShadow = true
  body.add(skirt)

  // Belt.
  const beltGeometry = new THREE.CylinderGeometry(0.222, 0.222, 0.07, 16)
  beltGeometry.scale(1, 1, 0.66)
  const belt = new THREE.Mesh(beltGeometry, leatherMaterial)
  belt.position.y = HIP_Y + 0.12
  body.add(belt)

  // Rounded shoulder caps hide the joint between torso and arms.
  const shoulderGeometry = new THREE.SphereGeometry(0.095, 12, 10)
  for (const x of [-SHOULDER_HALF, SHOULDER_HALF]) {
    const shoulder = new THREE.Mesh(shoulderGeometry, coatMaterial)
    shoulder.position.set(x, SHOULDER_Y, 0)
    shoulder.castShadow = true
    body.add(shoulder)
  }

  // Neck + scarf.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.12, 10), skinMaterial)
  neck.position.y = NECK_Y
  body.add(neck)

  const scarfGeometry = new THREE.TorusGeometry(0.105, 0.048, 8, 18)
  scarfGeometry.rotateX(Math.PI / 2)
  scarfGeometry.scale(1, 1, 0.78)
  const scarf = new THREE.Mesh(scarfGeometry, accentMaterial)
  scarf.position.y = NECK_Y + 0.02
  scarf.castShadow = true
  body.add(scarf)

  // Head.
  const headGeometry = new THREE.SphereGeometry(0.145, 18, 14)
  headGeometry.scale(0.94, 1.08, 0.98)
  const head = new THREE.Mesh(headGeometry, skinMaterial)
  head.position.y = HEAD_Y
  head.castShadow = true
  body.add(head)

  const eyeGeometry = new THREE.SphereGeometry(0.021, 8, 6)
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.3 })
  for (const x of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    eye.position.set(x, HEAD_Y + 0.025, 0.124)
    body.add(eye)
  }

  // Headwear — a soft flat cap for the thief, a peaked cap for guards. Both
  // are a squashed dome plus a brim, which also makes facing direction read
  // clearly from behind (the brim only sticks out at the front).
  if (palette.cap !== 'none') {
    const crownGeometry = new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    crownGeometry.scale(1, palette.cap === 'peaked' ? 0.72 : 0.55, 1.02)
    const crown = new THREE.Mesh(crownGeometry, hatMaterial)
    crown.position.y = HEAD_Y + 0.075
    crown.castShadow = true
    body.add(crown)

    const brimGeometry = new THREE.CylinderGeometry(0.165, 0.165, 0.022, 16)
    brimGeometry.scale(1, 1, 1.15)
    const brim = new THREE.Mesh(brimGeometry, hatMaterial)
    brim.position.set(0, HEAD_Y + 0.075, 0.075)
    brim.castShadow = true
    body.add(brim)

    if (palette.cap === 'peaked') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.157, 0.157, 0.035, 16), accentMaterial)
      band.position.y = HEAD_Y + 0.082
      body.add(band)
    }
  }

  // Limbs. Arms hang off `body` so they bob with the torso; legs hang off
  // `group` so the feet stay planted on the floor.
  const leftArm = limb({ pivotX: -SHOULDER_HALF, pivotY: SHOULDER_Y, length: ARM_LENGTH, radius: ARM_RADIUS, material: coatMaterial, parent: body })
  const rightArm = limb({ pivotX: SHOULDER_HALF, pivotY: SHOULDER_Y, length: ARM_LENGTH, radius: ARM_RADIUS, material: coatMaterial, parent: body })
  const leftLeg = limb({ pivotX: -HIP_HALF, pivotY: HIP_Y, length: LEG_LENGTH, radius: LEG_RADIUS, material: trouserMaterial, parent: group })
  const rightLeg = limb({ pivotX: HIP_HALF, pivotY: HIP_Y, length: LEG_LENGTH, radius: LEG_RADIUS, material: trouserMaterial, parent: group })

  const gloveGeometry = new THREE.SphereGeometry(0.082, 10, 8)
  for (const arm of [leftArm, rightArm]) {
    const glove = new THREE.Mesh(gloveGeometry, leatherMaterial)
    glove.position.y = -ARM_LENGTH + 0.02
    glove.castShadow = true
    arm.add(glove)
  }

  const bootGeometry = new THREE.BoxGeometry(0.145, 0.11, 0.28)
  for (const leg of [leftLeg, rightLeg]) {
    const boot = new THREE.Mesh(bootGeometry, leatherMaterial)
    boot.position.set(0, -LEG_LENGTH + 0.055, 0.05)
    boot.castShadow = true
    leg.add(boot)
  }

  return { group, body, leftArm, rightArm, leftLeg, rightLeg }
}

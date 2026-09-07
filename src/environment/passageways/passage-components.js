import * as THREE from 'three'
import { createSecurityLaserMaterial } from '../../shaders/security-laser.js'

export function createAxisAlignedCorridor({
  start,
  end,
  width = 6,
  height = 5.2,
  wallThickness = 0.24,
  floorMaterial,
  wallMaterial,
  ceilingMaterial
} = {}) {
  if (!start || !end) throw new Error('passage-components: corridor needs start/end')

  const group = new THREE.Group()
  group.name = 'corridor-shell'
  const colliders = []

  const dx = end.x - start.x
  const dz = end.z - start.z
  const alongX = Math.abs(dx) > Math.abs(dz)
  const length = alongX ? Math.abs(dx) : Math.abs(dz)
  const centerX = (start.x + end.x) / 2
  const centerZ = (start.z + end.z) / 2
  const floorY = start.y ?? 0

  const floorMat = floorMaterial ?? new THREE.MeshStandardMaterial({ color: 0x5d5961, roughness: 0.82 })
  const wallMat = wallMaterial ?? new THREE.MeshStandardMaterial({ color: 0x6f665f, roughness: 0.9 })
  const roofMat = ceilingMaterial ?? wallMat

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(alongX ? length : width, alongX ? width : length),
    floorMat
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(centerX, floorY + 0.01, centerZ)
  floor.receiveShadow = true
  group.add(floor)

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? length : width, 0.2, alongX ? width : length),
    roofMat
  )
  ceiling.position.set(centerX, floorY + height, centerZ)
  ceiling.receiveShadow = true
  group.add(ceiling)

  if (alongX) {
    for (const side of [-1, 1]) {
      const z = centerZ + side * width / 2
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height, wallThickness), wallMat)
      wall.position.set(centerX, floorY + height / 2, z)
      wall.castShadow = true
      wall.receiveShadow = true
      group.add(wall)
      colliders.push({
        minX: Math.min(start.x, end.x),
        maxX: Math.max(start.x, end.x),
        minZ: z - wallThickness / 2 - 0.05,
        maxZ: z + wallThickness / 2 + 0.05
      })
    }
  } else {
    for (const side of [-1, 1]) {
      const x = centerX + side * width / 2
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, length), wallMat)
      wall.position.set(x, floorY + height / 2, centerZ)
      wall.castShadow = true
      wall.receiveShadow = true
      group.add(wall)
      colliders.push({
        minX: x - wallThickness / 2 - 0.05,
        maxX: x + wallThickness / 2 + 0.05,
        minZ: Math.min(start.z, end.z),
        maxZ: Math.max(start.z, end.z)
      })
    }
  }

  return { group, colliders }
}

export function createPuzzleDoor({
  position,
  width = 3.4,
  height = 2.8,
  thickness = 0.28,
  axis = 'x'
} = {}) {
  const group = new THREE.Group()
  group.name = 'puzzle-door'
  group.position.copy(position)

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b6d35, roughness: 0.32, metalness: 0.86 })
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x28303a, roughness: 0.42, metalness: 0.72 })
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    emissive: 0x7f1d1d,
    emissiveIntensity: 1.8,
    roughness: 0.25
  })

  const doorGeometry = axis === 'x'
    ? new THREE.BoxGeometry(thickness, height, width)
    : new THREE.BoxGeometry(width, height, thickness)

  const slab = new THREE.Mesh(doorGeometry, doorMat)
  slab.position.y = height / 2
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)

  const stripGeometry = axis === 'x'
    ? new THREE.BoxGeometry(thickness + 0.03, 0.08, width * 0.82)
    : new THREE.BoxGeometry(width * 0.82, 0.08, thickness + 0.03)
  const statusStrip = new THREE.Mesh(stripGeometry, stripMat)
  statusStrip.position.y = height - 0.24
  group.add(statusStrip)

  const postGeometry = axis === 'x'
    ? new THREE.BoxGeometry(thickness + 0.14, height + 0.3, 0.16)
    : new THREE.BoxGeometry(0.16, height + 0.3, thickness + 0.14)

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, frameMat)
    if (axis === 'x') post.position.set(0, (height + 0.3) / 2, side * (width / 2 + 0.08))
    else post.position.set(side * (width / 2 + 0.08), (height + 0.3) / 2, 0)
    group.add(post)
  }

  const collider = axis === 'x'
    ? {
        minX: position.x - thickness / 2 - 0.08,
        maxX: position.x + thickness / 2 + 0.08,
        minZ: position.z - width / 2,
        maxZ: position.z + width / 2,
        enabled: true
      }
    : {
        minX: position.x - width / 2,
        maxX: position.x + width / 2,
        minZ: position.z - thickness / 2 - 0.08,
        maxZ: position.z + thickness / 2 + 0.08,
        enabled: true
      }

  let unlocked = false
  let openAmount = 0

  function unlock() {
    if (unlocked) return
    unlocked = true
    collider.enabled = false
    stripMat.color.setHex(0x10b981)
    stripMat.emissive.setHex(0x047857)
  }

  function update(delta) {
    if (!unlocked || openAmount >= 1) return
    openAmount = Math.min(1, openAmount + delta * 1.65)
    const eased = 1 - Math.pow(1 - openAmount, 3)
    slab.position.y = height / 2 + eased * (height + 0.35)
    statusStrip.position.y = height - 0.24 + eased * (height + 0.35)
  }

  return {
    group,
    collider,
    unlock,
    update,
    isUnlocked: () => unlocked
  }
}

export function createSweepingLaser({
  position,
  beamLength = 5.1,
  beamHeight = 0.58,
  travelAxis = 'x',
  travelDistance = 1.5,
  speed = 1.25,
  hitHalfThickness = 0.22,
  onHit
} = {}) {
  const group = new THREE.Group()
  group.name = 'sweeping-laser'
  group.position.copy(position)

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x17202a, roughness: 0.32, metalness: 0.82 })
  const laserMat = createSecurityLaserMaterial({ beamCount: 1 })

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, beamLength, 14),
    laserMat
  )
  beam.rotation.x = Math.PI / 2
  beam.position.y = beamHeight
  group.add(beam)

  for (const side of [-1, 1]) {
    const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), frameMat)
    emitter.position.set(0, beamHeight, side * beamLength / 2)
    group.add(emitter)
  }

  let elapsed = 0
  let hitCooldown = 0

  function update(delta, playerPosition) {
    elapsed += delta
    hitCooldown = Math.max(0, hitCooldown - delta)
    if (laserMat.customUniforms) laserMat.customUniforms.uTime.value += delta

    const offset = Math.sin(elapsed * speed) * travelDistance
    if (travelAxis === 'z') {
      group.position.z = position.z + offset
    } else {
      group.position.x = position.x + offset
    }

    if (!playerPosition || typeof onHit !== 'function') return

    const closeAcrossBeam = Math.abs(playerPosition.z - group.position.z) <= beamLength / 2
    const closeToSweep = Math.abs(playerPosition.x - group.position.x) <= hitHalfThickness
    const feetTooLow = playerPosition.y <= beamHeight + 0.12

    if (closeAcrossBeam && closeToSweep && feetTooLow && hitCooldown <= 0) {
      hitCooldown = 0.75
      onHit()
    }
  }

  return { group, update, material: laserMat }
}

export function createTimedLaserController(laserGrid, {
  activeDuration = 2.4,
  inactiveDuration = 1.35,
  startActive = true
} = {}) {
  let active = startActive
  let timer = 0
  laserGrid.setActive(active)

  function update(delta) {
    timer += delta
    const limit = active ? activeDuration : inactiveDuration
    if (timer < limit) return

    timer = 0
    active = !active
    laserGrid.setActive(active)
  }

  return {
    update,
    isActive: () => active
  }
}

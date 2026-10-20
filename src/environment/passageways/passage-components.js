import * as THREE from 'three'
import { addLaserGlow, createSecurityLaserMaterial } from '../../shaders/security-laser.js'
import { getKitMaterials } from '../level1-kit/kit-materials.js'
import { at, createKitBuilder, kbox, laserEmitter } from '../level1-kit/kit-props.js'
import { playDoorOpen } from '../../systems/door-sfx.js'

function scaleU(geometry, factor) {
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * factor)
  return geometry
}

let dustTexture = null
function softDot() {
  if (dustTexture) return dustTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  dustTexture = new THREE.CanvasTexture(canvas)
  return dustTexture
}

// A puff of grit kicked out from the floor track when a door opens. Points
// at the door base drift outward and up, then fade. Always drawn (at zero
// opacity when idle) so the first puff does not compile a shader.
function createDustPuff(parent, width, axis) {
  const count = 48
  const positions = new Float32Array(count * 3)
  const velocity = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), width + 2)
  const material = new THREE.PointsMaterial({
    map: softDot(),
    color: 0x8c8274,
    size: 0.32,
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'door-dust'
  points.userData.decor = true
  points.userData.noInteractionBlocker = true
  points.userData.noCameraCollision = true
  parent.add(points)

  const LIFE = 1.6
  let age = LIFE

  function start() {
    for (let i = 0; i < count; i += 1) {
      const along = (Math.random() - 0.5) * width
      const out = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2)
      const vAlong = (Math.random() - 0.5) * 0.4
      const vOut = Math.sign(out) * (0.35 + Math.random() * 0.6)
      const vUp = 0.15 + Math.random() * 0.45
      const [x, z, vx, vz] = axis === 'x' ? [out, along, vOut, vAlong] : [along, out, vAlong, vOut]
      positions.set([x, 0.05 + Math.random() * 0.15, z], i * 3)
      velocity.set([vx, vUp, vz], i * 3)
    }
    geometry.attributes.position.needsUpdate = true
    age = 0
  }

  function update(delta) {
    if (age >= LIFE) return
    age += delta
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] += velocity[i * 3] * delta
      positions[i * 3 + 1] += velocity[i * 3 + 1] * delta
      positions[i * 3 + 2] += velocity[i * 3 + 2] * delta
      velocity[i * 3] *= 1 - 1.6 * delta
      velocity[i * 3 + 1] *= 1 - 1.2 * delta
      velocity[i * 3 + 2] *= 1 - 1.6 * delta
    }
    geometry.attributes.position.needsUpdate = true
    const u = age / LIFE
    material.opacity = 0.55 * Math.min(1, u * 8) * (1 - u)
    material.size = 0.32 + u * 0.5
  }

  return { start, update }
}

// Emitter boxes with a red lens, facing along `yaw`, plus the beam-end glow.
function addEmitters(group, laserMat, ends) {
  const k = getKitMaterials()
  const kit = createKitBuilder()
  for (const { x, y, z, yaw } of ends) laserEmitter(kit, k, at(x, y, z, yaw))
  kit.build(group, 'laser-emitters')
  addLaserGlow(group, laserMat, ends.map(({ x, y, z, yaw }) => new THREE.Vector3(
    x + Math.sin(yaw) * 0.1,
    y + 0.02,
    z + Math.cos(yaw) * 0.1
  )))
}

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


// Builds a fully enclosed rectangular room with optional centered openings on
// any wall. This is deliberately separate from createAxisAlignedCorridor():
// overlapping straight corridor shells are fine for straight runs, but their
// side walls cross each other at 90-degree turns. Junction rooms give those
// turns explicit perimeter walls and predictable collider openings.
//
// openings keys are minX, maxX, minZ, maxZ. Each value may be true (entire
// side open) or { width, height, offset }. width is measured along the wall,
// height starts at floor level, and offset shifts the opening along the wall.
export function createAxisAlignedRoom({
  center,
  sizeX = 4.8,
  sizeZ = 4.8,
  height = 5.0,
  wallThickness = 0.24,
  openings = {},
  floorMaterial,
  wallMaterial,
  ceilingMaterial
} = {}) {
  if (!center) throw new Error('passage-components: room needs center')
  if (sizeX <= 0 || sizeZ <= 0 || height <= 0) {
    throw new Error('passage-components: room dimensions must be positive')
  }

  const group = new THREE.Group()
  group.name = 'room-shell'
  const colliders = []
  const floorY = center.y ?? 0

  const floorMat = floorMaterial ?? new THREE.MeshStandardMaterial({ color: 0x5d5961, roughness: 0.82 })
  const wallMat = wallMaterial ?? new THREE.MeshStandardMaterial({ color: 0x6f665f, roughness: 0.9 })
  const roofMat = ceilingMaterial ?? wallMat

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), floorMat)
  floor.name = 'room-floor'
  floor.rotation.x = -Math.PI / 2
  floor.position.set(center.x, floorY + 0.01, center.z)
  floor.receiveShadow = true
  group.add(floor)

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 0.2, sizeZ), roofMat)
  ceiling.name = 'room-ceiling'
  ceiling.position.set(center.x, floorY + height, center.z)
  ceiling.receiveShadow = true
  group.add(ceiling)

  function openingFor(key, sideLength) {
    const raw = openings[key]
    if (!raw) return null
    if (raw === true) return { width: sideLength, height, offset: 0 }

    const width = THREE.MathUtils.clamp(raw.width ?? sideLength, 0, sideLength)
    const openHeight = THREE.MathUtils.clamp(raw.height ?? height, 0, height)
    const maxOffset = Math.max(0, (sideLength - width) / 2)
    const offset = THREE.MathUtils.clamp(raw.offset ?? 0, -maxOffset, maxOffset)
    return { width, height: openHeight, offset }
  }

  function addSegment(key, alongMin, alongMax) {
    const segmentLength = alongMax - alongMin
    if (segmentLength <= 0.01) return

    let mesh
    let collider
    if (key === 'minX' || key === 'maxX') {
      const x = center.x + (key === 'minX' ? -sizeX / 2 : sizeX / 2)
      const z = center.z + (alongMin + alongMax) / 2
      mesh = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, segmentLength), wallMat)
      mesh.position.set(x, floorY + height / 2, z)
      collider = {
        minX: x - wallThickness / 2 - 0.05,
        maxX: x + wallThickness / 2 + 0.05,
        minZ: center.z + alongMin,
        maxZ: center.z + alongMax
      }
    } else {
      const z = center.z + (key === 'minZ' ? -sizeZ / 2 : sizeZ / 2)
      const x = center.x + (alongMin + alongMax) / 2
      mesh = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, height, wallThickness), wallMat)
      mesh.position.set(x, floorY + height / 2, z)
      collider = {
        minX: center.x + alongMin,
        maxX: center.x + alongMax,
        minZ: z - wallThickness / 2 - 0.05,
        maxZ: z + wallThickness / 2 + 0.05
      }
    }

    mesh.name = `room-wall-${key}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    colliders.push(collider)
  }

  function addLintel(key, opening, sideLength) {
    if (!opening || opening.height >= height - 0.01 || opening.width <= 0.01) return
    const lintelHeight = height - opening.height
    let mesh
    if (key === 'minX' || key === 'maxX') {
      const x = center.x + (key === 'minX' ? -sizeX / 2 : sizeX / 2)
      mesh = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, lintelHeight, opening.width), wallMat)
      mesh.position.set(x, floorY + opening.height + lintelHeight / 2, center.z + opening.offset)
    } else {
      const z = center.z + (key === 'minZ' ? -sizeZ / 2 : sizeZ / 2)
      mesh = new THREE.Mesh(new THREE.BoxGeometry(opening.width, lintelHeight, wallThickness), wallMat)
      mesh.position.set(center.x + opening.offset, floorY + opening.height + lintelHeight / 2, z)
    }
    mesh.name = `room-lintel-${key}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    // No X/Z collider for a lintel: the lightweight character collision is
    // intentionally 2D and would otherwise treat overhead geometry as a wall.
  }

  for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
    const sideLength = (key === 'minX' || key === 'maxX') ? sizeZ : sizeX
    const opening = openingFor(key, sideLength)
    if (!opening) {
      addSegment(key, -sideLength / 2, sideLength / 2)
      continue
    }

    const openMin = opening.offset - opening.width / 2
    const openMax = opening.offset + opening.width / 2
    addSegment(key, -sideLength / 2, openMin)
    addSegment(key, openMax, sideLength / 2)
    addLintel(key, opening, sideLength)
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

  // 1930s blast door. Built facing +Z across local X, then turned for
  // axis 'x' so the slab's footprint and the collider match the old box.
  const k = getKitMaterials()
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0x2a0606,
    emissive: 0xff2a1a,
    emissiveIntensity: 2.6,
    roughness: 0.25
  })
  const body = new THREE.Group()
  if (axis === 'x') body.rotation.y = Math.PI / 2
  group.add(body)

  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), k.steel)
  slab.position.y = height / 2
  slab.castShadow = true
  slab.receiveShadow = true
  body.add(slab)

  // Slab dressing, children of the slab so it all rises together.
  const onSlab = createKitBuilder()
  const t2 = thickness / 2
  for (const face of [-1, 1]) {
    const z = face * (t2 + 0.012)
    for (const y of [-height / 2 + 0.03, height / 2 - 0.03]) onSlab.add(k.steelFrame, kbox(width, 0.06, 0.03, 0, y, z))
    for (const x of [-width / 2 + 0.03, width / 2 - 0.03]) onSlab.add(k.steelFrame, kbox(0.06, height, 0.03, x, 0, z))
    onSlab.add(k.brass, kbox(width - 0.12, 0.03, 0.03, 0, -height / 2 + 0.3, z))
    const hazard = kbox(width - 0.12, 0.22, 0.02, 0, -height / 2 + 0.17, face * (t2 + 0.006))
    scaleU(hazard, (width - 0.12) / 1.76)
    onSlab.add(k.hazard, hazard)
    const stencil = new THREE.PlaneGeometry(Math.min(width * 0.7, 2.2), Math.min(width * 0.7, 2.2) / 8)
    if (face < 0) stencil.rotateY(Math.PI)
    stencil.translate(0, 0.05, face * (t2 + 0.004))
    onSlab.add(k.stencil, stencil)
    const tag = new THREE.PlaneGeometry(0.8, 0.2)
    if (face < 0) tag.rotateY(Math.PI)
    tag.translate(0, height / 2 - 0.42, face * (t2 + 0.004))
    onSlab.add(k.security, tag)
    // Rivet rows along the edging and across the middle rail.
    const rivet = () => new THREE.SphereGeometry(0.018, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)
    const facing = face > 0 ? 0 : Math.PI
    for (let x = -width / 2 + 0.12; x <= width / 2 - 0.1; x += 0.16) {
      for (const y of [-height / 2 + 0.03, height / 2 - 0.03, -height / 2 + 0.3]) {
        onSlab.instance('rivet', rivet, k.steelFrame, at(x, y, face * (t2 + 0.028), facing))
      }
    }
    for (let y = -height / 2 + 0.2; y <= height / 2 - 0.15; y += 0.16) {
      for (const x of [-width / 2 + 0.03, width / 2 - 0.03]) {
        onSlab.instance('rivet', rivet, k.steelFrame, at(x, y, face * (t2 + 0.028), facing))
      }
    }
  }
  onSlab.build(slab, 'door-slab', { decor: true })

  const statusStrip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.04, thickness + 0.03), stripMat)
  statusStrip.position.y = height - 0.12
  body.add(statusStrip)

  // Fixed housing: heavy side frames, a slot box over the opening that the
  // slab lifts into, a floor track, corner bolts and the status lamps.
  const housing = createKitBuilder()
  const depth = thickness + 0.3
  for (const side of [-1, 1]) {
    housing.add(k.steelFrame, kbox(0.22, height + 0.5, depth, side * (width / 2 + 0.11), (height + 0.5) / 2, 0), null, true)
  }
  housing.add(k.steelFrame, kbox(width + 0.44, 0.42, depth, 0, height + 0.21, 0), null, true)
  housing.add(k.iron, kbox(width, 0.025, thickness + 0.08, 0, 0.012, 0))
  for (const face of [-1, 1]) {
    for (const x of [-width / 2 - 0.11, width / 2 + 0.11]) {
      for (const y of [0.22, height + 0.21]) {
        const bolt = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 6).rotateX(Math.PI / 2)
        bolt.translate(x, y, face * (depth / 2 + 0.015))
        housing.add(k.brass, bolt)
      }
    }
    const lamp = new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(face * Math.PI / 2)
    lamp.translate(width / 2 + 0.11, height + 0.21, face * (depth / 2))
    housing.add(stripMat, lamp)
    const guard = new THREE.TorusGeometry(0.075, 0.01, 4, 12)
    guard.translate(width / 2 + 0.11, height + 0.21, face * (depth / 2 + 0.03))
    housing.add(k.iron, guard)
  }
  housing.build(body, 'door-housing')

  const dust = createDustPuff(group, width, axis)

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
    stripMat.color.setHex(0x063a24)
    stripMat.emissive.setHex(0x22e08a)
    playDoorOpen()
    dust.start()
  }

  function update(delta) {
    dust.update(delta)
    if (!unlocked || openAmount >= 1) return
    openAmount = Math.min(1, openAmount + delta * 1.65)
    const eased = 1 - Math.pow(1 - openAmount, 3)
    slab.position.y = height / 2 + eased * (height + 0.35)
    statusStrip.position.y = height - 0.12 + eased * (height + 0.35)
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

  const laserMat = createSecurityLaserMaterial({ beamCount: 1 })

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, beamLength, 10),
    laserMat
  )
  beam.rotation.x = Math.PI / 2
  beam.position.y = beamHeight
  group.add(beam)

  addEmitters(group, laserMat, [-1, 1].map((side) => ({
    x: 0,
    y: beamHeight,
    z: side * beamLength / 2,
    yaw: side > 0 ? Math.PI : 0
  })))

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
    // beamHeight is local to the laser group. Using world-space Y here keeps the
    // same component valid in Passageway 2's lower floor at y=-4.
    const beamWorldY = group.position.y + beamHeight
    const feetTooLow = playerPosition.y <= beamWorldY + 0.12

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

// A reusable floor-level laser obstacle. Rows sit perpendicular to the travel
// direction with dark landing pads between them, so the intended interaction is
// jump -> land -> read the next row rather than simply timing one moving beam.
export function createLaserFloor({
  start,
  end,
  width = 4.2,
  rowCount = 5,
  floorY,
  hitHalfDepth = 0.2,
  clearanceHeight = 0.44,
  onHit
} = {}) {
  if (!start || !end) throw new Error('passage-components: laser floor needs start/end')

  const group = new THREE.Group()
  group.name = 'laser-floor-course'

  const y = Number.isFinite(floorY) ? floorY : (start.y ?? 0)
  const dx = end.x - start.x
  const dz = end.z - start.z
  const alongX = Math.abs(dx) >= Math.abs(dz)
  const length = alongX ? Math.abs(dx) : Math.abs(dz)
  const direction = alongX ? Math.sign(dx || 1) : Math.sign(dz || 1)

  const laserMat = createSecurityLaserMaterial({ beamCount: 1 })
  const padMat = new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.72, metalness: 0.42 })
  const emitterEnds = []

  const rows = []
  const margin = Math.min(1.05, length * 0.12)
  const usable = Math.max(0.5, length - margin * 2)
  const spacing = rowCount > 1 ? usable / (rowCount - 1) : 0

  for (let i = 0; i < rowCount; i++) {
    const along = margin + i * spacing
    const x = alongX ? start.x + direction * along : start.x
    const z = alongX ? start.z : start.z + direction * along

    // A double beam makes every hazard row unmistakable while keeping the
    // collision band narrow enough for forgiving beginner jumps.
    for (const offset of [-0.07, 0.07]) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, width - 0.34, 14),
        laserMat
      )
      if (alongX) {
        beam.rotation.x = Math.PI / 2
        beam.position.set(x + offset, y + 0.09, z)
      } else {
        beam.rotation.z = Math.PI / 2
        beam.position.set(x, y + 0.09, z + offset)
      }
      group.add(beam)
    }

    for (const side of [-1, 1]) {
      if (alongX) emitterEnds.push({ x, y: y + 0.09, z: z + side * (width / 2 - 0.08), yaw: side > 0 ? Math.PI : 0 })
      else emitterEnds.push({ x: x + side * (width / 2 - 0.08), y: y + 0.09, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 })
    }

    rows.push({ x, z })
  }
  addEmitters(group, laserMat, emitterEnds)

  // Slightly raised dark pads make the safe gaps legible without becoming
  // physical steps that would interfere with the player's ground sampler.
  const padCount = rowCount + 1
  const segment = length / padCount
  for (let i = 0; i < padCount; i++) {
    const along = segment * (i + 0.5)
    const x = alongX ? start.x + direction * along : start.x
    const z = alongX ? start.z : start.z + direction * along
    const geometry = alongX
      ? new THREE.BoxGeometry(Math.max(0.55, segment * 0.62), 0.035, width - 0.55)
      : new THREE.BoxGeometry(width - 0.55, 0.035, Math.max(0.55, segment * 0.62))
    const pad = new THREE.Mesh(geometry, padMat)
    pad.position.set(x, y + 0.025, z)
    pad.receiveShadow = true
    group.add(pad)
  }

  let active = true
  let hitCooldown = 0

  function update(delta, playerPosition) {
    hitCooldown = Math.max(0, hitCooldown - delta)
    if (laserMat.customUniforms) {
      laserMat.customUniforms.uTime.value += delta
      laserMat.customUniforms.uState.value = active ? 0 : 1
    }
    if (!active || !playerPosition || typeof onHit !== 'function' || hitCooldown > 0) return

    const lateral = alongX ? Math.abs(playerPosition.z - start.z) : Math.abs(playerPosition.x - start.x)
    if (lateral > width / 2) return
    if (playerPosition.y > y + clearanceHeight) return

    const touching = rows.some((row) => (
      alongX
        ? Math.abs(playerPosition.x - row.x) <= hitHalfDepth
        : Math.abs(playerPosition.z - row.z) <= hitHalfDepth
    ))

    if (touching) {
      hitCooldown = 0.9
      onHit()
    }
  }

  function setActive(value) {
    active = Boolean(value)
  }

  function dispose() {
    laserMat.dispose()
    padMat.dispose()
  }

  return {
    group,
    update,
    setActive,
    isActive: () => active,
    dispose,
    rows
  }
}

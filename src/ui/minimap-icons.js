import * as THREE from 'three'
import { DOOR_W } from '../environment/carriage-bounds.js'

// Unlit HUD sprites for the minimap camera. The main view stays on layer 0
// (level geometry, MeshStandardMaterial, real lights). This module owns
// layer 1 only — MeshBasicMaterial icons that ignore scene lighting, fog,
// and tone mapping, so the inset stays readable from a top-down ortho cam.
//
// Guards do not carry a THREE.SpotLight; their "flashlight" in the world is
// the yellow vision cone in stealth.js (distance 7.5, angle π/3.2, local +Z).
// Player and guard yaw 0 also faces world +Z (atan2(dx, dz); eyes/brim on +Z).
// Icon shapes are drawn in XY with the tip at +Y, then rotated onto XZ so
// that tip becomes local +Z — matching that forward axis. rotateX(-π/2)
// would map +Y to -Z and flip every arrow/wedge 180°.

export const MINIMAP_LAYER = 1

// Keep in sync with stealth.js createVisionConeMesh / GUARD_VISION_DISTANCE.
const GUARD_VISION_DISTANCE = 7.5
const GUARD_VISION_ANGLE = Math.PI / 3.2

const ICON_Y = {
  ground: 0.02,
  obstacle: 0.05,
  beam: 0.08,
  actor: 0.12
}

const COLOR = {
  ground: 0x233246,
  wall: 0x91a4b9,
  crate: 0xb45309,
  seat: 0x4a5c74,
  locker: 0x64748b,
  player: 0x5eead4,
  guard: 0xf97316,
  beam: 0xfacc15,
  alert: 0xef4444
}

function unlit(color, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    fog: false,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...extra
  })
}

function markIcon(object) {
  object.traverse((node) => {
    node.layers.set(MINIMAP_LAYER)
    node.raycast = () => {}
  })
}

// ShapeGeometry is XY, Y-up. Rx(+π/2) sends +Y → +Z (character forward).
// Rx(-π/2) would send +Y → -Z and every icon would read 180° off.
function layShapeOnXz(geometry) {
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function triangleGeometry(length, halfWidth) {
  const shape = new THREE.Shape()
  shape.moveTo(0, length)
  shape.lineTo(-halfWidth, -length * 0.45)
  shape.lineTo(halfWidth, -length * 0.45)
  shape.closePath()
  return layShapeOnXz(new THREE.ShapeGeometry(shape))
}

function wedgeGeometry(distance, angle) {
  const shape = new THREE.Shape()
  const half = angle / 2
  const segments = 18
  shape.moveTo(0, 0)
  for (let i = 0; i <= segments; i++) {
    const a = -half + (angle * i) / segments
    shape.lineTo(Math.sin(a) * distance, Math.cos(a) * distance)
  }
  shape.closePath()
  return layShapeOnXz(new THREE.ShapeGeometry(shape))
}

const _forward = new THREE.Vector3()

// Horizontal yaw from an object's world +Z (Three.js getWorldDirection).
function yawFromWorldForward(object, fallbackYaw) {
  if (!object) return fallbackYaw
  object.getWorldDirection(_forward)
  if (_forward.x * _forward.x + _forward.z * _forward.z < 1e-10) return fallbackYaw
  return Math.atan2(_forward.x, _forward.z)
}

function obstacleKind(box) {
  if (box.kind === 'crate' || box.kind === 'trunk' || box.type === 'crate') return 'crate'
  if (box.kind === 'seat') return 'seat'
  if (box.kind === 'locker' || box.kind === 'relaybox') return 'locker'
  return 'wall'
}

function pointInClip(x, z, clip) {
  if (!clip) return true
  return x >= clip.minX && x <= clip.maxX && z >= clip.minZ && z <= clip.maxZ
}

function boxOverlapsClip(box, clip) {
  if (!clip) return true
  return box.maxX >= clip.minX && box.minX <= clip.maxX &&
    box.maxZ >= clip.minZ && box.minZ <= clip.maxZ
}

export function createMinimapIcons({ scene, player, getObstacles, getGuards }) {
  const root = new THREE.Group()
  root.name = 'minimap-icons'
  root.layers.set(MINIMAP_LAYER)
  scene.add(root)
  const grid = new THREE.GridHelper(120, 60, 0x34445a, 0x34445a)
  Object.assign(grid.material, { transparent: true, opacity: 0.25, toneMapped: false, depthTest: false, depthWrite: false })
  grid.renderOrder = -1
  markIcon(grid)
  root.add(grid)

  const wallMat = unlit(COLOR.wall)
  const crateMat = unlit(COLOR.crate)
  const seatMat = unlit(COLOR.seat)
  const lockerMat = unlit(COLOR.locker)
  const playerMat = unlit(COLOR.player)
  const outlineMat = unlit(0x030810)
  const guardMat = unlit(COLOR.guard)
  const floorMat = unlit(COLOR.ground)
  const doorMat = unlit(0xc6a563)
  const beamMatTemplate = {
    color: COLOR.beam,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide
  }

  const planeGeo = new THREE.PlaneGeometry(1, 1)
  planeGeo.rotateX(-Math.PI / 2)
  const playerGeo = triangleGeometry(0.85, 0.38)
  const guardGeo = triangleGeometry(0.7, 0.32)
  const beamGeo = wedgeGeometry(GUARD_VISION_DISTANCE, GUARD_VISION_ANGLE)
  function createFloorBatch(capacity) {
    const batch = new THREE.InstancedMesh(planeGeo, floorMat, capacity)
    batch.name = 'minimap-floors'
    batch.frustumCulled = false
    batch.renderOrder = 0
    batch.visible = false
    markIcon(batch)
    root.add(batch)
    return batch
  }
  let floor = createFloorBatch(8)
  const doorIcons = new THREE.InstancedMesh(planeGeo, doorMat, 16)
  doorIcons.name = 'minimap-doors'
  doorIcons.frustumCulled = false
  doorIcons.renderOrder = 2
  doorIcons.count = 0
  markIcon(doorIcons)
  root.add(doorIcons)

  const playerIcon = new THREE.Mesh(playerGeo, playerMat)
  playerIcon.renderOrder = 4
  markIcon(playerIcon)
  root.add(playerIcon)
  playerIcon.name = 'minimap-player'
  const playerOutline = new THREE.Mesh(playerGeo, outlineMat)
  playerOutline.renderOrder = 3.5
  markIcon(playerOutline)
  root.add(playerOutline)

  const obstacleBatches = new Map()
  const obstacleMatrix = new THREE.Matrix4()
  const guardIcons = []
  function setArrow(arrow, yaw, unitsPerPixel, pixels, length) {
    arrow.rotation.y = yaw
    arrow.scale.setScalar(unitsPerPixel * pixels / (length * 1.45))
  }

  function materialForObstacle(box) {
    const kind = obstacleKind(box)
    if (kind === 'crate') return crateMat
    if (kind === 'seat') return seatMat
    if (kind === 'locker') return lockerMat
    return wallMat
  }

  function resizePool(pool, needed, create) {
    while (pool.length < needed) {
      const entry = create()
      markIcon(entry.root)
      root.add(entry.root)
      pool.push(entry)
    }
    while (pool.length > needed) {
      const entry = pool.pop()
      root.remove(entry.root)
      entry.dispose()
    }
  }

  function syncObstacles(boxes, y, clip, unitsPerPixel) {
    for (const batch of obstacleBatches.values()) batch.count = 0
    for (const box of boxes || []) {
      if (!boxOverlapsClip(box, clip)) continue
      const material = materialForObstacle(box)
      let batch = obstacleBatches.get(material)
      if (!batch || batch.count === batch.instanceMatrix.count) {
        const next = new THREE.InstancedMesh(planeGeo, material, batch ? batch.count * 2 : 32)
        next.count = batch?.count ?? 0
        next.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        next.renderOrder = 1
        next.frustumCulled = false
        markIcon(next)
        if (batch) {
          next.instanceMatrix.array.set(batch.instanceMatrix.array)
          root.remove(batch)
          batch.dispose()
        }
        root.add(next)
        obstacleBatches.set(material, next)
        batch = next
      }
      const wall = obstacleKind(box) === 'wall'
      const w = Math.max(wall ? unitsPerPixel * 1.25 : 0.08, box.maxX - box.minX)
      const d = Math.max(wall ? unitsPerPixel * 1.25 : 0.08, box.maxZ - box.minZ)
      obstacleMatrix.makeScale(w, 1, d)
      obstacleMatrix.setPosition((box.minX + box.maxX) * 0.5, y, (box.minZ + box.maxZ) * 0.5)
      batch.setMatrixAt(batch.count++, obstacleMatrix)
    }
    for (const batch of obstacleBatches.values()) {
      batch.visible = batch.count > 0
      if (batch.count) batch.instanceMatrix.needsUpdate = true
    }
  }

  function syncGuards(guards, yBeam, yActor, clip, unitsPerPixel) {
    const list = (guards || []).filter((guard) => {
      for (let node = guard.group; node; node = node.parent) {
        if (!node.visible) return false
      }
      const p = guard.group.position
      return pointInClip(p.x, p.z, clip)
    })
    resizePool(guardIcons, list.length, () => {
      const group = new THREE.Group()
      group.name = 'minimap-guard'
      const beam = new THREE.Mesh(beamGeo, unlit(COLOR.beam, beamMatTemplate))
      beam.renderOrder = 2
      const arrow = new THREE.Mesh(guardGeo, guardMat)
      arrow.renderOrder = 3
      group.add(beam, arrow)
      return {
        root: group,
        beam,
        arrow,
        dispose() {
          beam.material.dispose()
        }
      }
    })
    for (let i = 0; i < list.length; i++) {
      const guard = list[i]
      const entry = guardIcons[i]
      const p = guard.group.position
      const bodyYaw = yawFromWorldForward(
        guard.group,
        guard.facing ?? guard.group.rotation.y
      )
      // Cone is parented to the guard and aims local +Z today, but read the
      // mesh itself so an independent flashlight rotation would still map.
      const beamYaw = yawFromWorldForward(guard.visionCone, bodyYaw)
      entry.root.position.set(p.x, 0, p.z)
      entry.root.rotation.y = 0
      entry.arrow.position.y = yActor
      setArrow(entry.arrow, bodyYaw, unitsPerPixel, 7, 0.7)
      entry.beam.position.y = yBeam
      entry.beam.rotation.y = beamYaw
      const alert = guard.state === 'ALERT'
      entry.beam.material.color.setHex(alert ? COLOR.alert : COLOR.beam)
      entry.beam.material.opacity = alert ? 0.38 : 0.28
    }
  }

  function update({ clip = null, extraObstacles = null, floorVolumes = null,
    detailClip = null, unitsPerPixel = 0.1, doors = [] } = {}) {
    const origin = player.mesh.position
    const yaw = player.mesh.rotation.y
    const y0 = origin.y
    grid.position.set(Math.floor(origin.x / 2) * 2, y0, Math.floor(origin.z / 2) * 2)

    const floors = floorVolumes ?? (clip ? [clip] : [])
    if (floors.length > floor.instanceMatrix.count) {
      const previous = floor
      floor = createFloorBatch(floors.length)
      root.remove(previous)
      previous.dispose()
    }
    floor.visible = floors.length > 0
    floor.count = floors.length
    for (let i = 0; i < floors.length; i++) {
      const v = floors[i]
      obstacleMatrix.makeScale(v.maxX - v.minX, 1, v.maxZ - v.minZ)
      obstacleMatrix.setPosition((v.minX + v.maxX) / 2, y0 + ICON_Y.ground, (v.minZ + v.maxZ) / 2)
      floor.setMatrixAt(i, obstacleMatrix)
    }
    floor.instanceMatrix.needsUpdate = true
    doorIcons.count = doors.length
    for (let i = 0; i < doors.length; i++) {
      const door = doors[i]
      obstacleMatrix.makeScale(DOOR_W, 1, Math.max(0.12, unitsPerPixel * 2))
      obstacleMatrix.setPosition(door.x, y0 + ICON_Y.obstacle, door.z)
      doorIcons.setMatrixAt(i, obstacleMatrix)
    }
    doorIcons.instanceMatrix.needsUpdate = true

    playerIcon.position.set(origin.x, y0 + ICON_Y.actor, origin.z)
    setArrow(playerIcon, yawFromWorldForward(player.mesh, yaw), unitsPerPixel, 12, 0.85)
    playerOutline.position.copy(playerIcon.position)
    playerOutline.rotation.copy(playerIcon.rotation)
    playerOutline.scale.copy(playerIcon.scale).multiplyScalar(1.4)

    const obstacles = [
      ...(getObstacles?.() ?? []).filter(box => boxOverlapsClip(box, detailClip)),
      ...(extraObstacles ?? [])
    ]
    // Same MeshBasicMaterial AABB pool as Boarding. Clip is world XZ;
    // L1 colliders and L2 crate AABBs are already world-space.
    syncObstacles(obstacles, y0 + ICON_Y.obstacle, clip, unitsPerPixel)
    syncGuards(getGuards?.() ?? null, y0 + ICON_Y.beam, y0 + ICON_Y.actor, detailClip ?? clip, unitsPerPixel)
  }

  function dispose() {
    for (const batch of obstacleBatches.values()) batch.dispose()
    obstacleBatches.clear()
    resizePool(guardIcons, 0, () => ({}))
    scene.remove(root)
    grid.geometry.dispose()
    grid.material.dispose()
    floorMat.dispose()
    floor.dispose()
    doorMat.dispose()
    doorIcons.dispose()
    outlineMat.dispose()
    playerMat.dispose()
    wallMat.dispose()
    crateMat.dispose()
    seatMat.dispose()
    lockerMat.dispose()
    guardMat.dispose()
    planeGeo.dispose()
    playerGeo.dispose()
    guardGeo.dispose()
    beamGeo.dispose()
  }

  return { update, dispose, root, layer: MINIMAP_LAYER }
}

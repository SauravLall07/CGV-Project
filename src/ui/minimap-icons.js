import * as THREE from 'three'

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
  ground: 0x10161f,
  wall: 0x64748b,
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
  if (box.kind === 'crate' || box.type === 'crate') return 'crate'
  if (box.kind === 'seat') return 'seat'
  if (box.kind === 'locker') return 'locker'
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

  const wallMat = unlit(COLOR.wall)
  const crateMat = unlit(COLOR.crate)
  const seatMat = unlit(COLOR.seat)
  const lockerMat = unlit(COLOR.locker)
  const playerMat = unlit(COLOR.player)
  const guardMat = unlit(COLOR.guard)
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
  const groundGeo = new THREE.CircleGeometry(16, 48)
  groundGeo.rotateX(-Math.PI / 2)

  const ground = new THREE.Mesh(groundGeo, unlit(COLOR.ground))
  ground.renderOrder = 0
  markIcon(ground)
  root.add(ground)

  // Carriage-mode floor: scaled to the current car AABB instead of a
  // follow-radius disc, so neighbouring cars don't read as map background.
  const floor = new THREE.Mesh(planeGeo, unlit(COLOR.ground))
  floor.renderOrder = 0
  floor.visible = false
  markIcon(floor)
  root.add(floor)

  const playerIcon = new THREE.Mesh(playerGeo, playerMat)
  playerIcon.renderOrder = 4
  markIcon(playerIcon)
  root.add(playerIcon)

  const obstacleIcons = []
  const guardIcons = []
  let lastObstacleLogKey = null

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

  function syncObstacles(boxes, y, clip) {
    const incoming = boxes || []
    const list = incoming.filter((box) => boxOverlapsClip(box, clip))

    // Temporary: prove icon creation vs clip filter when entering a car.
    const logKey = clip?.key ?? null
    if (logKey && logKey !== lastObstacleLogKey) {
      lastObstacleLogKey = logKey
      const samples = incoming.slice(0, 6).map((box) => ({
        kind: box.kind || 'wall',
        x: +((box.minX + box.maxX) * 0.5).toFixed(2),
        z: +((box.minZ + box.maxZ) * 0.5).toFixed(2),
        pass: boxOverlapsClip(box, clip)
      }))
      console.log('[minimap-obstacles] enter', logKey, {
        created: incoming.length,
        afterFilter: list.length,
        clip: {
          minX: clip.minX, maxX: clip.maxX, minZ: +clip.minZ.toFixed(2), maxZ: +clip.maxZ.toFixed(2)
        },
        samples
      })
    }
    if (!clip) lastObstacleLogKey = null
    resizePool(obstacleIcons, list.length, () => {
      const mesh = new THREE.Mesh(planeGeo, wallMat)
      mesh.renderOrder = 1
      return {
        root: mesh,
        dispose() { /* shared geo/mat */ }
      }
    })
    for (let i = 0; i < list.length; i++) {
      const box = list[i]
      const mesh = obstacleIcons[i].root
      const w = Math.max(0.08, box.maxX - box.minX)
      const d = Math.max(0.08, box.maxZ - box.minZ)
      mesh.position.set((box.minX + box.maxX) * 0.5, y, (box.minZ + box.maxZ) * 0.5)
      mesh.scale.set(w, 1, d)
      mesh.material = materialForObstacle(box)
    }
  }

  function syncGuards(guards, yBeam, yActor, clip) {
    const list = (guards || []).filter((guard) => {
      const p = guard.group.position
      return pointInClip(p.x, p.z, clip)
    })
    resizePool(guardIcons, list.length, () => {
      const group = new THREE.Group()
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
      entry.arrow.rotation.y = bodyYaw
      entry.beam.position.y = yBeam
      entry.beam.rotation.y = beamYaw
      const alert = guard.state === 'ALERT'
      entry.beam.material.color.setHex(alert ? COLOR.alert : COLOR.beam)
      entry.beam.material.opacity = alert ? 0.38 : 0.28
    }
  }

  function update({ clip = null, extraObstacles = null } = {}) {
    const origin = player.mesh.position
    const yaw = player.mesh.rotation.y
    const y0 = origin.y

    if (clip) {
      ground.visible = false
      floor.visible = true
      floor.position.set(
        (clip.minX + clip.maxX) * 0.5,
        y0 + ICON_Y.ground,
        (clip.minZ + clip.maxZ) * 0.5
      )
      floor.scale.set(
        Math.max(0.2, clip.maxX - clip.minX),
        1,
        Math.max(0.2, clip.maxZ - clip.minZ)
      )
    } else {
      floor.visible = false
      ground.visible = true
      ground.position.set(origin.x, y0 + ICON_Y.ground, origin.z)
    }

    playerIcon.position.set(origin.x, y0 + ICON_Y.actor, origin.z)
    playerIcon.rotation.y = yawFromWorldForward(player.mesh, yaw)

    const obstacles = [
      ...(getObstacles?.() ?? []),
      ...(extraObstacles ?? [])
    ]
    // Same MeshBasicMaterial AABB pool as Boarding. Clip is world XZ;
    // L1 colliders and L2 crate AABBs are already world-space.
    syncObstacles(obstacles, y0 + ICON_Y.obstacle, clip)
    syncGuards(getGuards?.() ?? null, y0 + ICON_Y.beam, y0 + ICON_Y.actor, clip)
  }

  function dispose() {
    resizePool(obstacleIcons, 0, () => ({}))
    resizePool(guardIcons, 0, () => ({}))
    scene.remove(root)
    ground.material.dispose()
    floor.material.dispose()
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
    groundGeo.dispose()
  }

  return { update, dispose, root, layer: MINIMAP_LAYER }
}

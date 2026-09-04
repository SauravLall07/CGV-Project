import * as THREE from 'three'
import { createHumanoid, GUARD_PALETTE } from '../entities/humanoid.js'
import { disposeObject } from '../core/dispose.js'
import { createSecurityLaserMaterial } from '../shaders/security-laser.js'
import { resolveBoxCollision } from '../core/collision.js'

// Level 1 Stealth & Infiltration System:
// - Deterministic guard patrol AI (Patrol -> Investigate -> Alert)
// - Dynamic vision cones with obstacle line-of-sight occlusion
// - Sweeping security cameras with ground projection cones
// - Laser security grids and interactive disable terminals
// - Shared suspicion/alarm meter tied into the respawn fail-state

const STRIDE_AMPLITUDE = 0.65
const STRIDE_FREQUENCY = 2.4
const BOB_HEIGHT = 0.03
const GUARD_VISION_DISTANCE = 7.5

export function createStealthSystem({ scene, player, respawn, hud, collidables = [], obstacles = [] }) {  let suspicion = 0
  const maxSuspicion = 100
  const suspicionRiseRate = 45 // percent per second in line of sight
  const suspicionDecayRate = 22 // percent per second in shadow/cover

  const guards = []
  const cameras = []
  const laserGrids = []

  const raycaster = new THREE.Raycaster()

  // -----------------------------------------------------------------
  // Vision Cone Geometry & Material Helper
  // -----------------------------------------------------------------
  function createVisionConeMesh(distance = 7.5, angle = Math.PI / 3.2) {
    const radius = Math.tan(angle / 2) * distance
    const coneGeo = new THREE.ConeGeometry(radius, distance, 20, 1, true)
    coneGeo.rotateX(-Math.PI / 2)
    coneGeo.translate(0, 0, distance / 2)

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const mesh = new THREE.Mesh(coneGeo, coneMat)
    mesh.name = 'vision-cone'
    return { mesh, coneMat }
  }

  // -----------------------------------------------------------------
  // Guard Factory
  // -----------------------------------------------------------------
  function addGuard({ waypoints, speed = 1.6, waitTime = 2.5, initialWaypoint = 0 }) {
    const { group, body, leftArm, rightArm, leftLeg, rightLeg } = createHumanoid(GUARD_PALETTE)
    group.name = 'guard'

    const { mesh: visionCone, coneMat } = createVisionConeMesh(GUARD_VISION_DISTANCE, Math.PI / 3.2)
    visionCone.position.set(0, 1.55, 0)
    group.add(visionCone)

    // Suspicion status beacon indicator above guard hat
    const statusBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    )
    statusBeacon.position.set(0, 2.15, 0)
    group.add(statusBeacon)

    const startPos = waypoints[initialWaypoint] || waypoints[0]
    group.position.copy(startPos)

    const guard = {
      group,
      body,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      coneMat,
      visionCone,
      coneDistance: GUARD_VISION_DISTANCE,
      statusBeacon,
      waypoints,
      targetIdx: (initialWaypoint + 1) % waypoints.length,
      speed,
      waitTime,
      waitTimer: 0,
      state: 'PATROL', // 'PATROL', 'INVESTIGATE', 'ALERT'
      facing: 0,
      stridePhase: 0,
      lookAroundTimer: 0
    }

    guards.push(guard)
    scene.add(group)
    return guard
  }

  // -----------------------------------------------------------------
  // Security Camera Factory
  // -----------------------------------------------------------------
  function addCamera({ position, baseAngle = 0, sweepRange = Math.PI / 3, sweepSpeed = 0.8, range = 9 }) {
    const camGroup = new THREE.Group()
    camGroup.name = 'security-camera'
    camGroup.position.copy(position)

    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.7 })

    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), bracketMat)
    camGroup.add(mount)

    const pivot = new THREE.Group()
    pivot.position.set(0.3, 0, 0)
    camGroup.add(pivot)

    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 14), bracketMat)
    housing.rotation.z = Math.PI / 2
    pivot.add(housing)

    const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), ledMat)
    led.position.set(0.26, 0, 0)
    pivot.add(led)

    // Camera vision cone projecting downward diagonally
    const coneRadius = Math.tan(Math.PI / 6) * range
    const coneGeo = new THREE.ConeGeometry(coneRadius, range, 18, 1, true)
    coneGeo.rotateX(-Math.PI / 2)
    coneGeo.translate(0, 0, range / 2)

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const coneMesh = new THREE.Mesh(coneGeo, coneMat)
    coneMesh.rotation.x = 0.55 // pitch down toward platform
    pivot.add(coneMesh)

    const camera = {
      camGroup,
      pivot,
      ledMat,
      coneMat,
      coneMesh,
      baseAngle,
      sweepRange,
      sweepSpeed,
      range,
      elapsed: Math.random() * 10
    }

    cameras.push(camera)
    scene.add(camGroup)
    return camera
  }

  // -----------------------------------------------------------------
  // Laser Security Grid Factory
  // -----------------------------------------------------------------
  function addLaserGrid({ position, width = 2.4, height = 2.2, beamCount = 4 }) {
    const gridGroup = new THREE.Group()
    gridGroup.name = 'laser-grid'
    gridGroup.position.copy(position)

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })
    const postLeft = new THREE.Mesh(new THREE.BoxGeometry(0.15, height, 0.15), frameMat)
    postLeft.position.set(-width / 2, height / 2, 0)
    const postRight = new THREE.Mesh(new THREE.BoxGeometry(0.15, height, 0.15), frameMat)
    postRight.position.set(width / 2, height / 2, 0)
    gridGroup.add(postLeft, postRight)

    const laserMat = createSecurityLaserMaterial({ beamCount })

    const beams = []
    const spacing = height / (beamCount + 1)
    for (let i = 1; i <= beamCount; i++) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, width, 16), laserMat)
      beam.rotation.z = Math.PI / 2
      beam.position.set(0, i * spacing, 0)
      gridGroup.add(beam)
      beams.push(beam)
    }

    const grid = {
      gridGroup,
      beams,
      laserMat,
      active: true,
      bounds: {
        minX: position.x - width / 2 - 0.2,
        maxX: position.x + width / 2 + 0.2,
        minZ: position.z - 0.35,
        maxZ: position.z + 0.35,
        minY: position.y,
        maxY: position.y + height
      },
      setActive(isActive) {
        grid.active = isActive
        if (laserMat.customUniforms) {
          laserMat.customUniforms.uState.value = isActive ? 0 : 1
        }
      }
    }

    laserGrids.push(grid)
    scene.add(gridGroup)
    return grid
  }

  // -----------------------------------------------------------------
  // Line of Sight & Detection Math
  // -----------------------------------------------------------------
  const playerEyePos = new THREE.Vector3()
  const guardEyePos = new THREE.Vector3()
  const toPlayer = new THREE.Vector3()
  const coneDir = new THREE.Vector3()
  const coneEye = new THREE.Vector3()

  function checkGuardDetection(guard, playerPos, delta) {
    if (!playerPos) return false

    guardEyePos.set(guard.group.position.x, guard.group.position.y + 1.55, guard.group.position.z)
    playerEyePos.set(playerPos.x, playerPos.y + 1.2, playerPos.z)

    toPlayer.subVectors(playerEyePos, guardEyePos)
    const dist = toPlayer.length()
    const maxDist = guard.state === 'ALERT' ? 10.0 : 7.5

    if (dist > maxDist || dist < 0.1) return false

    toPlayer.normalize()

    // Facing vector of the guard
    const facingDir = new THREE.Vector3(Math.sin(guard.facing), 0, Math.cos(guard.facing))
    const dot = facingDir.dot(toPlayer)
    const fovThreshold = guard.state === 'ALERT' ? 0.3 : 0.52 // ~60-70 deg FOV

    if (dot < fovThreshold) return false

    // Line of sight raycast check against collidables / obstacles
    raycaster.set(guardEyePos, toPlayer)
    raycaster.far = dist
    const hits = raycaster.intersectObjects(collidables, true)

    for (const hit of hits) {
      if (hit.distance < dist - 0.3) {
        // Obstructed by a pillar, crate or wall
        return false
      }
    }

    return true
  }

  const camEyePos = new THREE.Vector3()
  const camToPlayer = new THREE.Vector3()

  function checkCameraDetection(cam, playerPos) {
    if (!playerPos) return false
    const camPos = cam.camGroup.position

    const dx = playerPos.x - camPos.x
    const dz = playerPos.z - camPos.z
    const dist = Math.hypot(dx, dz)

    if (dist > cam.range || dist < 1.0) return false

    // Forward direction of camera sweep
    const currentAngle = cam.baseAngle + Math.sin(cam.elapsed * cam.sweepSpeed) * cam.sweepRange
    const camDir = new THREE.Vector3(Math.sin(currentAngle), 0, Math.cos(currentAngle)).normalize()

    const toPlayerHoriz = new THREE.Vector3(dx, 0, dz).normalize()
    const dot = camDir.dot(toPlayerHoriz)
    if (dot <= 0.72) return false // outside the camera beam cone

    // Line-of-sight raycast — a partition wall or pillar between the camera
    // and the player blocks detection, same as it does for guards. Cameras
    // had no occlusion check before this; angle + distance alone let them
    // see straight through walls.
    camEyePos.copy(camPos)
    camToPlayer.set(playerPos.x, camPos.y, playerPos.z).sub(camEyePos)
    const losDist = camToPlayer.length()
    camToPlayer.normalize()

    raycaster.set(camEyePos, camToPlayer)
    raycaster.far = losDist
    const hits = raycaster.intersectObjects(collidables, true)
    for (const hit of hits) {
      if (hit.distance < losDist - 0.3) return false
    }

    return true
  }

  function checkLaserCollision(playerPos) {
    if (!playerPos) return false
    for (const grid of laserGrids) {
      if (!grid.active) continue
      const b = grid.bounds
      if (
        playerPos.x >= b.minX && playerPos.x <= b.maxX &&
        playerPos.z >= b.minZ && playerPos.z <= b.maxZ &&
        playerPos.y >= b.minY && playerPos.y <= b.maxY
      ) {
        return true
      }
    }
    return false
  }

  // -----------------------------------------------------------------
  // System Update
  // -----------------------------------------------------------------
  function update(delta) {
    const playerPos = player?.mesh?.position
    let isDetectedThisFrame = false

    // 1. Update Guards
    guards.forEach((guard) => {
      const isSeeingPlayer = checkGuardDetection(guard, playerPos, delta)

      if (isSeeingPlayer) {
        isDetectedThisFrame = true
        guard.state = suspicion > 60 ? 'ALERT' : 'INVESTIGATE'
        // Turn towards player smoothly
        const dx = playerPos.x - guard.group.position.x
        const dz = playerPos.z - guard.group.position.z
        const targetAngle = Math.atan2(dx, dz)
        guard.facing += (targetAngle - guard.facing) * Math.min(1, delta * 6.0)
        guard.group.rotation.y = guard.facing
      } else if (guard.state !== 'PATROL') {
        guard.lookAroundTimer += delta
        if (guard.lookAroundTimer > 2.0) {
          guard.state = 'PATROL'
          guard.lookAroundTimer = 0
        }
      }

      // Guard visual cues according to state
      if (guard.state === 'ALERT') {
        guard.coneMat.color.setHex(0xef4444)
        guard.statusBeacon.material.color.setHex(0xef4444)
      } else if (guard.state === 'INVESTIGATE') {
        guard.coneMat.color.setHex(0xf97316)
        guard.statusBeacon.material.color.setHex(0xf97316)
      } else {
        guard.coneMat.color.setHex(0xfacc15)
        guard.statusBeacon.material.color.setHex(0xfacc15)
      }

      // Patrol movement along waypoints
      if (guard.state === 'PATROL' && guard.waypoints.length > 1) {
        if (guard.waitTimer > 0) {
          guard.waitTimer -= delta
          // Idle look around
          guard.facing += Math.sin(guard.waitTimer * 2) * 0.01
          guard.group.rotation.y = guard.facing
          guard.stridePhase *= 0.8
        } else {
          const target = guard.waypoints[guard.targetIdx]
          const gx = target.x - guard.group.position.x
          const gz = target.z - guard.group.position.z
          const distToTarget = Math.hypot(gx, gz)

          if (distToTarget < 0.25) {
            guard.targetIdx = (guard.targetIdx + 1) % guard.waypoints.length
            guard.waitTimer = guard.waitTime
          } else {
            const moveAngle = Math.atan2(gx, gz)
            let diff = moveAngle - guard.facing
            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2
            guard.facing += diff * Math.min(1, delta * 8.0)
            guard.group.rotation.y = guard.facing

            const step = guard.speed * delta
            guard.group.position.x += Math.sin(guard.facing) * step
            guard.group.position.z += Math.cos(guard.facing) * step
            resolveBoxCollision(guard.group.position, obstacles)
            guard.stridePhase += step * STRIDE_FREQUENCY
          }
        }
      }

      // Limb swing animation
      coneDir.set(Math.sin(guard.facing), 0, Math.cos(guard.facing))
      coneEye.set(guard.group.position.x, guard.group.position.y + 1.55, guard.group.position.z)
      raycaster.set(coneEye, coneDir)
      raycaster.far = guard.coneDistance
      let coneHitDist = guard.coneDistance
      for (const hit of raycaster.intersectObjects(collidables, true)) {
        if (hit.distance < coneHitDist) coneHitDist = hit.distance
      }
      guard.visionCone.scale.setScalar(THREE.MathUtils.clamp(coneHitDist / guard.coneDistance, 0.05, 1))

      // Limb swing animation
      const swing = Math.sin(guard.stridePhase) * STRIDE_AMPLITUDE
      guard.leftLeg.rotation.x = swing
      guard.rightLeg.rotation.x = -swing
      guard.leftArm.rotation.x = -swing * 0.8
      guard.rightArm.rotation.x = swing * 0.8
      guard.body.position.y = Math.abs(Math.sin(guard.stridePhase)) * BOB_HEIGHT
    })

    // 2. Update Cameras
    cameras.forEach((cam) => {
      cam.elapsed += delta
      const angle = cam.baseAngle + Math.sin(cam.elapsed * cam.sweepSpeed) * cam.sweepRange
      cam.pivot.rotation.y = angle

      // Same wall clipping as the guard cones — stop the beam mesh at the
      // nearest obstruction along the current sweep direction.
      coneDir.set(Math.sin(angle), 0, Math.cos(angle))
      coneEye.copy(cam.camGroup.position)
      raycaster.set(coneEye, coneDir)
      raycaster.far = cam.range
      let camConeHitDist = cam.range
      for (const hit of raycaster.intersectObjects(collidables, true)) {
        if (hit.distance < camConeHitDist) camConeHitDist = hit.distance
      }
      cam.coneMesh.scale.setScalar(THREE.MathUtils.clamp(camConeHitDist / cam.range, 0.05, 1))

      const isSeeing = checkCameraDetection(cam, playerPos)
      if (isSeeing) {
        isDetectedThisFrame = true
        cam.ledMat.color.setHex(0xef4444)
        cam.coneMat.color.setHex(0xef4444)
      } else {
        cam.ledMat.color.setHex(0x38bdf8)
        cam.coneMat.color.setHex(0x38bdf8)
      }
    })

    // 3. Laser Grid Update & Collision
    laserGrids.forEach((grid) => {
      if (grid.laserMat?.customUniforms) {
        grid.laserMat.customUniforms.uTime.value += delta
        if (grid.active) {
          grid.laserMat.customUniforms.uState.value = suspicion > 50 ? 2 : 0
        } else {
          grid.laserMat.customUniforms.uState.value = 1
        }
      }
    })

    if (checkLaserCollision(playerPos)) {
      suspicion = 100
      isDetectedThisFrame = true
      if (hud) hud.showToast('Laser grid tripped! Security alerted!', 1500)
    }

    // 4. Update Suspicion Meter
    if (isDetectedThisFrame) {
      suspicion = Math.min(maxSuspicion, suspicion + suspicionRiseRate * delta)
    } else {
      suspicion = Math.max(0, suspicion - suspicionDecayRate * delta)
    }

    // 5. Check Fail State
    if (suspicion >= maxSuspicion) {
      suspicion = 0
      guards.forEach((g) => {
        g.state = 'PATROL'
        g.waitTimer = 1.0
      })
      if (respawn) respawn.fail('Detected by security!')
    }

    // Sync with HUD
    if (hud && hud.setSuspicion) {
      hud.setSuspicion(suspicion)
    }
  }

  function reset() {
    suspicion = 0
    guards.forEach((g) => {
      g.state = 'PATROL'
      g.waitTimer = 0
      g.targetIdx = 0
      if (g.waypoints.length > 0) g.group.position.copy(g.waypoints[0])
    })
    if (hud && hud.setSuspicion) hud.setSuspicion(0)
  }

  function dispose() {
    guards.forEach((g) => {
      scene.remove(g.group)
      disposeObject(g.group)
    })
    cameras.forEach((c) => {
      scene.remove(c.camGroup)
      disposeObject(c.camGroup)
    })
    laserGrids.forEach((l) => {
      scene.remove(l.gridGroup)
      disposeObject(l.gridGroup)
    })
    guards.length = 0
    cameras.length = 0
    laserGrids.length = 0
    if (hud && hud.setSuspicion) hud.setSuspicion(0)
  }

  return {
    addGuard,
    addCamera,
    addLaserGrid,
    getSuspicion: () => suspicion,
    update,
    reset,
    dispose
  }
}

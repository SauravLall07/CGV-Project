import * as THREE from 'three'
import { createHumanoid, GUARD_PALETTE } from '../entities/humanoid.js'
import { disposeObject } from '../core/dispose.js'
import { createSecurityLaserMaterial } from '../shaders/security-laser.js'
import { resolveBoxCollision, resolveCircleCollision } from '../core/collision.js'

// Level 1 Stealth & Infiltration System:
// - Deterministic guard patrol AI, two states only:
//     PATROL — walk waypoints, pause and scan left/right on a schedule.
//              Sighting the player from range does NOT interrupt this — it
//              only raises suspicion (scaled by the player's gait).
//     ALERT  — proximity-only hard lock (GUARD_LOCK_ON_DISTANCE), ignores
//              facing, breaks the routine and tracks the player directly.
//              Give it a few seconds of searching (GUARD_LOSE_LOCK_GRACE)
//              before it concedes and resumes the route.
// - Dynamic vision cones with obstacle line-of-sight occlusion
// - Sweeping security cameras with ground projection cones
// - Laser security grids and interactive disable terminals
// - Shared suspicion/alarm meter tied into the respawn fail-state

const STRIDE_AMPLITUDE = 0.65
const STRIDE_FREQUENCY = 2.4
const BOB_HEIGHT = 0.03
const GUARD_VISION_DISTANCE = 7.5
const GUARD_PATROL_TURN_SMOOTHING = 8
const GUARD_ALERT_TURN_SMOOTHING = 6
const GUARD_BODY_RADIUS = 0.4
const PLAYER_BODY_RADIUS = 0.32
const GUARD_BUMP_RADIUS = GUARD_BODY_RADIUS + PLAYER_BODY_RADIUS
const PLAYER_STAND_DETECTION_HEIGHT = 1.2
const PLAYER_CROUCH_DETECTION_HEIGHT = 0.72

// Proximity at which a guard abandons its patrol routine entirely and hard-
// locks onto the player, regardless of which way it's currently facing —
// this is the only thing that breaks the routine now. Ordinary sightings
// from range only feed the suspicion meter (see movementSuspicionMultiplier
// and the ALERT-vs-PATROL split in update()).
const GUARD_LOCK_ON_DISTANCE = 1.6
// Seconds a locked-on guard keeps searching after losing proximity before
// conceding and resuming its route.
const GUARD_LOSE_LOCK_GRACE = 2.2
// How far a waiting guard sweeps its head left/right while scanning, and how
// fast — this is the visible "turn on the spot" beat of the routine.
const GUARD_PATROL_SCAN_AMPLITUDE = Math.PI / 3.4
const GUARD_PATROL_SCAN_SPEED = 1.6
const GUARD_PATROL_TURN_TOLERANCE = THREE.MathUtils.degToRad(4)

// Suspicion-rise multipliers by the player's current gait. Only affects how
// fast suspicion climbs while seen — crouching doesn't shrink a guard's
// vision cone, it just makes being in it much less damning.
const CROUCH_SUSPICION_MULT = 0.35
const RUN_SUSPICION_MULT = 1.6
const JUMP_SUSPICION_MULT = 2.0

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
      state: 'PATROL', // 'PATROL' (routine) or 'ALERT' (proximity lock-on)
      facing: 0,
      scanBase: 0, // heading the guard sweeps around while waiting at a waypoint
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
  function addLaserGrid({
    position,
    width = 2.4,
    height = 2.2,
    beamCount = 4,
    rotationY = 0
  }) {
    const gridGroup = new THREE.Group()
    gridGroup.name = 'laser-grid'
    gridGroup.position.copy(position)
    gridGroup.rotation.y = rotationY

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.2
    })

    const postLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, height, 0.15),
      frameMat
    )
    postLeft.position.set(-width / 2, height / 2, 0)

    const postRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, height, 0.15),
      frameMat
    )
    postRight.position.set(width / 2, height / 2, 0)

    gridGroup.add(postLeft, postRight)

    const laserMat = createSecurityLaserMaterial({ beamCount })

    const beams = []
    const spacing = height / (beamCount + 1)

    for (let i = 1; i <= beamCount; i++) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, width, 16),
        laserMat
      )

      beam.rotation.z = Math.PI / 2
      beam.position.set(0, i * spacing, 0)

      gridGroup.add(beam)
      beams.push(beam)
    }

    // If the laser has been rotated by 90 degrees, its width now runs
    // along Z instead of X, so its collision box must rotate as well.
    const sideways = Math.abs(Math.sin(rotationY)) > 0.5

    const bounds = sideways
      ? {
          minX: position.x - 0.35,
          maxX: position.x + 0.35,
          minZ: position.z - width / 2 - 0.2,
          maxZ: position.z + width / 2 + 0.2,
          minY: position.y,
          maxY: position.y + height
        }
      : {
          minX: position.x - width / 2 - 0.2,
          maxX: position.x + width / 2 + 0.2,
          minZ: position.z - 0.35,
          maxZ: position.z + 0.35,
          minY: position.y,
          maxY: position.y + height
        }

    const grid = {
      gridGroup,
      beams,
      laserMat,
      active: true,
      bounds,

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
  const flatToPlayer = new THREE.Vector3()

  function playerDetectionHeight() {
    return player?.isCrouching?.()
      ? PLAYER_CROUCH_DETECTION_HEIGHT
      : PLAYER_STAND_DETECTION_HEIGHT
  }
  const coneDir = new THREE.Vector3()
  const coneEye = new THREE.Vector3()

  function checkGuardDetection(guard, playerPos) {
    if (!playerPos) return false

    // Guard eyes
    guardEyePos.set(
      guard.group.position.x,
      guard.group.position.y + 1.55,
      guard.group.position.z
    )

    // Important:
    // crouching changes the point the guard is trying to see.
    playerEyePos.set(
      playerPos.x,
      playerPos.y + playerDetectionHeight(),
      playerPos.z
    )

    toPlayer.subVectors(playerEyePos, guardEyePos)

    const dist = toPlayer.length()
    const maxDist =
      guard.state === 'ALERT'
        ? 10.0
        : GUARD_VISION_DISTANCE

    if (dist > maxDist || dist < 0.1) {
      return false
    }

    // -----------------------------------------------------------
    // FIELD OF VIEW
    // -----------------------------------------------------------
    // Use horizontal direction for the FOV calculation.
    //
    // Otherwise lowering the crouching target point also changes
    // the guard's FOV, which isn't what we want.
    flatToPlayer.set(
      toPlayer.x,
      0,
      toPlayer.z
    )

    if (flatToPlayer.lengthSq() < 1e-6) {
      return false
    }

    flatToPlayer.normalize()

    const facingDir = new THREE.Vector3(
      Math.sin(guard.facing),
      0,
      Math.cos(guard.facing)
    )

    const dot = facingDir.dot(flatToPlayer)

    const fovThreshold =
      guard.state === 'ALERT'
        ? 0.3
        : 0.52

    if (dot < fovThreshold) {
      return false
    }

    // -----------------------------------------------------------
    // LINE OF SIGHT
    // -----------------------------------------------------------

    // This ray now points toward the crouched body's height.
    // A bench/luggage item between the guard and this point
    // therefore blocks vision.
    toPlayer.normalize()

    raycaster.set(
      guardEyePos,
      toPlayer
    )

    raycaster.far = dist

    const hits =
      raycaster.intersectObjects(
        collidables,
        true
      )

    for (const hit of hits) {
      if (hit.distance < dist - 0.3) {
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

  // Distance-only "can't miss you" check — deliberately ignores the guard's
  // facing (unlike checkGuardDetection), so a guard can't be snuck past just
  // by staying behind its shoulder while standing right next to it. A wall
  // between the two still blocks it.
  function checkGuardLockOn(guard, playerPos) {
    if (!playerPos) return false

    // Use ground-plane distance for "way too close".
    const horizontalDist = Math.hypot(
      playerPos.x - guard.group.position.x,
      playerPos.z - guard.group.position.z
    )

    if (
      horizontalDist >
      GUARD_LOCK_ON_DISTANCE
    ) {
      return false
    }

    guardEyePos.set(
      guard.group.position.x,
      guard.group.position.y + 1.55,
      guard.group.position.z
    )

    playerEyePos.set(
      playerPos.x,
      playerPos.y + playerDetectionHeight(),
      playerPos.z
    )

    toPlayer.subVectors(
      playerEyePos,
      guardEyePos
    )

    const dist = toPlayer.length()

    if (dist < 0.01) {
      return true
    }

    // Close-range awareness still respects physical cover.
    //
    // So:
    // crouched behind luggage = hidden
    // come around the luggage at 1.5m = guard locks on
    toPlayer.normalize()

    raycaster.set(
      guardEyePos,
      toPlayer
    )

    raycaster.far = dist

    const hits =
      raycaster.intersectObjects(
        collidables,
        true
      )

    for (const hit of hits) {
      if (hit.distance < dist - 0.3) {
        return false
      }
    }

    return true
  }

  // How much faster suspicion should climb while the player is seen, based
  // on how loud/visible their current gait is.
  function movementSuspicionMultiplier() {
    if (!player) return 1
    if (player.isAirborne && player.isAirborne()) return JUMP_SUSPICION_MULT
    if (player.isCrouching && player.isCrouching()) return CROUCH_SUSPICION_MULT
    if (player.isRunning && player.isRunning()) return RUN_SUSPICION_MULT
    return 1
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
  // Higher number wins when more than one detector fires in the same frame
  // (a guard bump or a tripped laser is a harder, more certain catch than a
  // guard merely spotting you from a distance, so those take priority).
  const REASON_PRIORITY = { 'guard-bump': 4, laser: 4, camera: 2, 'guard-sight': 1 }

  function update(delta) {
    const playerPos = player?.mesh?.position
    let isDetectedThisFrame = false
    let detectionReason = null

    function reportDetection(reason) {
      isDetectedThisFrame = true
      if (!detectionReason || REASON_PRIORITY[reason] >= REASON_PRIORITY[detectionReason]) {
        detectionReason = reason
      }
    }

    // 1. Update Guards
    guards.forEach((guard) => {
      const isSeeingPlayer = checkGuardDetection(guard, playerPos)
      const isLockedRange = checkGuardLockOn(guard, playerPos)

      // Any sighting feeds suspicion, near or far — but only genuine close
      // proximity breaks the routine below.
      if (isSeeingPlayer || isLockedRange) reportDetection('guard-sight')

      if (isLockedRange) {
        guard.state = 'ALERT'
        guard.lookAroundTimer = 0
        // Turn towards player smoothly
        const dx = playerPos.x - guard.group.position.x
        const dz = playerPos.z - guard.group.position.z
        const targetAngle = Math.atan2(dx, dz)
        guard.facing += (targetAngle - guard.facing) * Math.min(1, delta * 6.0)
        guard.group.rotation.y = guard.facing
      } else if (guard.state === 'ALERT') {
        // Lost proximity — keep searching for a few seconds before giving up
        // and resuming the route, rather than resetting the instant the
        // player takes one step back.
        guard.lookAroundTimer += delta
        guard.facing += Math.sin(guard.lookAroundTimer * 3) * 0.02
        guard.group.rotation.y = guard.facing
        if (guard.lookAroundTimer > GUARD_LOSE_LOCK_GRACE) {
          guard.state = 'PATROL'
          guard.lookAroundTimer = 0
        }
      }

      // Guard visual cues. This is purely cosmetic feedback for the player —
      // orange means "a guard has line of sight on you and suspicion is
      // rising", independent of guard.state, which only the proximity lock
      // (red) actually changes.
      if (guard.state === 'ALERT') {
        guard.coneMat.color.setHex(0xef4444)
        guard.statusBeacon.material.color.setHex(0xef4444)
      } else if (isSeeingPlayer) {
        guard.coneMat.color.setHex(0xf97316)
        guard.statusBeacon.material.color.setHex(0xf97316)
      } else {
        guard.coneMat.color.setHex(0xfacc15)
        guard.statusBeacon.material.color.setHex(0xfacc15)
      }

      // Patrol movement along waypoints
      // Strict, readable patrol routine:
      // WALK -> STOP/SCAN -> TURN ON SPOT -> WALK -> repeat.
      if (guard.state === 'PATROL' && guard.waypoints.length > 1) {
        if (guard.waitTimer > 0) {
          // ---------------------------------------------------------
          // STOP + SCAN
          // ---------------------------------------------------------
          guard.waitTimer = Math.max(0, guard.waitTimer - delta)

          const elapsed = guard.waitTime - guard.waitTimer

          guard.facing =
            guard.scanBase +
            Math.sin(elapsed * GUARD_PATROL_SCAN_SPEED) *
              GUARD_PATROL_SCAN_AMPLITUDE

          guard.group.rotation.y = guard.facing

          // Ease walk animation back to standing.
          guard.stridePhase *= Math.max(0, 1 - delta * 10)
        } else {
          const target = guard.waypoints[guard.targetIdx]

          const gx = target.x - guard.group.position.x
          const gz = target.z - guard.group.position.z
          const distToTarget = Math.hypot(gx, gz)

          if (distToTarget < 0.08) {
            // -------------------------------------------------------
            // ARRIVED
            // -------------------------------------------------------

            // Snap exactly to the waypoint so every patrol loop
            // follows exactly the same route.
            guard.group.position.copy(target)

            guard.targetIdx =
              (guard.targetIdx + 1) % guard.waypoints.length

            guard.waitTimer = guard.waitTime
            guard.scanBase = guard.facing
            guard.stridePhase = 0
          } else {
            // -------------------------------------------------------
            // TURN TOWARD NEXT WAYPOINT
            // -------------------------------------------------------
            const moveAngle = Math.atan2(gx, gz)

            let diff = moveAngle - guard.facing

            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2

            guard.facing +=
              diff *
              Math.min(
                1,
                delta * GUARD_PATROL_TURN_SMOOTHING
              )

            guard.group.rotation.y = guard.facing

            // -------------------------------------------------------
            // WALK
            // -------------------------------------------------------
            // Don't start walking until the guard has mostly finished
            // turning. This makes the routine readable to the player.
            if (Math.abs(diff) <= GUARD_PATROL_TURN_TOLERANCE) {
              const step = Math.min(
                guard.speed * delta,
                distToTarget
              )

              guard.group.position.x +=
                (gx / distToTarget) * step

              guard.group.position.z +=
                (gz / distToTarget) * step

              resolveBoxCollision(
                guard.group.position,
                obstacles
              )

              guard.stridePhase +=
                step * STRIDE_FREQUENCY
            } else {
              guard.stridePhase *=
                Math.max(0, 1 - delta * 10)
            }
          }
        }
      } else {
        guard.stridePhase *= Math.max(0, 1 - delta * 10)
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

    if (playerPos) {
      const guardCircles = guards.map((guard) => ({
        x: guard.group.position.x,
        z: guard.group.position.z,
        radius: GUARD_BUMP_RADIUS,
        onCollide: () => {
          guard.state = 'ALERT'
          suspicion = maxSuspicion
          reportDetection('guard-bump')
          if (hud) hud.showToast('Bumped into a guard!', 1200)
        }
      }))
      resolveCircleCollision(playerPos, guardCircles)
    }

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
        reportDetection('camera')
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
      reportDetection('laser')
      if (hud) hud.showToast('Laser grid tripped! Security alerted!', 1500)
    }

    // 4. Update Suspicion Meter
    if (isDetectedThisFrame) {
      suspicion = Math.min(maxSuspicion, suspicion + suspicionRiseRate * delta * movementSuspicionMultiplier())
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
      if (respawn) respawn.fail(detectionReason ?? 'caught')
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
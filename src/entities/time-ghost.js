import * as THREE from 'three'
import { createHumanoid } from './humanoid.js'
import { loadDetectiveVisual } from './detective-visual.js'
import { disposeObject } from '../core/dispose.js'

// Holographic Time Ghost: a recorded temporal echo of the player.
// Replays a window of the player's movement and actions, walking the path
// and holding pressure plates or switches before dissolving.
//
// Prefer the Mixamo detective visual (same as the player). The procedural
// humanoid remains a fallback if the FBX fails to load.

const GHOST_PALETTE = {
  coat: 0x38bdf8,
  trousers: 0x0ea5e9,
  leather: 0x0284c7,
  skin: 0x7dd3fc,
  hat: 0x0369a1,
  accent: 0xe0f2fe,
  cap: 'flat'
}

const STRIDE_AMPLITUDE = 0.72
const BOB_HEIGHT = 0.035
const HOLD_SECONDS = 8
const MOVE_SPEED_EPS = 0.35 // m/s — above this, play the run clip

function applyGhostMaterial(mesh) {
  mesh.castShadow = false
  mesh.receiveShadow = false
  const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const ghosted = sources.map((oldMat) => {
    const ghostMat = new THREE.MeshStandardMaterial({
      color: oldMat?.color ? oldMat.color.getHex() : 0x38bdf8,
      map: oldMat?.map ?? null,
      normalMap: oldMat?.normalMap ?? null,
      emissive: 0x00d4ff,
      emissiveMap: oldMat?.emissiveMap ?? null,
      emissiveIntensity: 2.2,
      roughness: 0.25,
      metalness: 0.08,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      skinning: Boolean(oldMat?.skinning || mesh.isSkinnedMesh),
      morphTargets: Boolean(oldMat?.morphTargets),
      morphNormals: Boolean(oldMat?.morphNormals)
    })
    if (oldMat?.name) ghostMat.name = `ghost:${oldMat.name}`
    return ghostMat
  })
  mesh.material = Array.isArray(mesh.material) ? ghosted : ghosted[0]
  return ghosted
}

export function createTimeGhost() {
  const { group, body, leftArm, rightArm, leftLeg, rightLeg } = createHumanoid(GHOST_PALETTE)
  const bodyBaseY = body.position.y
  group.name = 'time-ghost'

  // Convert humanoid meshes to translucent hologram materials (fallback look).
  const ghostMaterials = []
  group.traverse((child) => {
    if (child.isMesh) {
      for (const mat of applyGhostMaterial(child)) ghostMaterials.push(mat)
    }
  })

  // Pulsing temporal aura ring at the feet
  const ringGeo = new THREE.RingGeometry(0.35, 0.55, 32)
  ringGeo.rotateX(-Math.PI / 2)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.03
  group.add(ring)

  // Unlit beacon. A real PointLight parented here is hidden with the echo and
  // reappears on summon, which changes NUM_POINT_LIGHTS. Timewreck's pool is
  // fixed at 12 so that count stays stable; an extra light rebuilds every
  // lit carriage program at the moment the release plate opens the door.
  const beaconGeo = new THREE.SphereGeometry(0.11, 10, 8)
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x7ef0ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  })
  const beacon = new THREE.Mesh(beaconGeo, beaconMat)
  beacon.name = 'time-ghost-beacon'
  beacon.position.y = 1.2
  beacon.castShadow = false
  beacon.receiveShadow = false
  beacon.userData.noCameraCollision = true
  group.add(beacon)

  let visual = null
  let trajectory = []
  let playbackTime = 0
  let isPlaying = false
  let onCompleteCallback = null
  let onTriggerCallback = null
  let elapsed = 0
  let lastSamplePos = new THREE.Vector3()

  function setHumanoidVisible(visible) {
    body.visible = visible
    leftArm.visible = visible
    rightArm.visible = visible
    leftLeg.visible = visible
    rightLeg.visible = visible
  }

  // Separate FBX load + mixer from the player so materials and animation
  // state never leak between them. Textures may be shared read-only.
  async function loadVisual(assets) {
    if (visual) return visual
    try {
      visual = await loadDetectiveVisual(assets, {
        crouchSpeed: 0,
        crouchSettleTime: 0.25
      })
      visual.root.traverse((child) => {
        if (!child.isMesh) return
        for (const mat of applyGhostMaterial(child)) ghostMaterials.push(mat)
      })
      group.add(visual.root)
      setHumanoidVisible(false)
      visual.setLocomotion({ moving: false, airborne: false, crouching: false, jumpStarted: false })
    } catch (error) {
      console.warn('[time-ghost] detective FBX failed, keeping humanoid', error)
      visual = null
    }
    return visual
  }

  function startReplay(recordedTrajectory, { onTrigger, onComplete } = {}) {
    if (!recordedTrajectory || recordedTrajectory.length < 2) {
      if (onComplete) onComplete()
      return
    }
    trajectory = recordedTrajectory
    playbackTime = 0
    isPlaying = true
    onTriggerCallback = onTrigger || null
    onCompleteCallback = onComplete || null

    const first = trajectory[0]
    group.position.copy(first.position)
    group.rotation.y = first.rotationY
    lastSamplePos.copy(first.position)
    group.visible = true
    if (visual) {
      visual.setLocomotion({ moving: false, airborne: false, crouching: false, jumpStarted: false })
    }
  }

  // Programs for these emissive/transparent materials compile on first draw.
  // The mesh exists from boot, but visible=false skips it — so the hitch lands
  // on the first Ghost press unless we compile now. The beacon is unlit, so
  // showing the echo does not change the scene light count.
  function warm(renderer, scene, camera) {
    if (!renderer || !camera) return
    const previous = group.visible
    group.visible = true
    renderer.compile(scene, camera)
    group.visible = previous
  }

  function stop() {
    const callback = onCompleteCallback
    cancel()
    if (callback) callback()
  }

  // Lifecycle resets must not run the gameplay completion callback from an
  // outgoing level or leave the old trajectory available to a new level.
  function cancel() {
    isPlaying = false
    group.visible = false
    trajectory = []
    playbackTime = 0
    onCompleteCallback = null
    onTriggerCallback = null
    elapsed = 0
    ring.rotation.y = 0
    if (visual) {
      visual.setLocomotion({ moving: false, airborne: false, crouching: false, jumpStarted: false })
    } else {
      leftLeg.rotation.x = rightLeg.rotation.x = 0
      leftArm.rotation.x = rightArm.rotation.x = 0
      body.position.y = bodyBaseY
    }
  }

  function update(delta) {
    elapsed += delta
    ring.rotation.y += delta * 2.5
    const pulse = 0.5 + Math.sin(elapsed * 8) * 0.25
    ringMat.opacity = pulse
    const beaconPulse = 0.55 + Math.sin(elapsed * 12) * 0.2
    beaconMat.opacity = beaconPulse
    beacon.scale.setScalar(0.85 + beaconPulse * 0.35)

    if (!isPlaying || trajectory.length < 2) {
      visual?.update(delta)
      return
    }

    playbackTime += delta

    const totalDuration = trajectory[trajectory.length - 1].time - trajectory[0].time
    if (playbackTime >= Math.max(0, totalDuration)) {
      // The echo keeps its weight at the summon point after replay finishes,
      // giving the player time to reach the other plate or pass the gate.
      const last = trajectory[trajectory.length - 1]
      group.position.copy(last.position)
      group.rotation.y = last.rotationY
      if (visual) {
        visual.setLocomotion({ moving: false, airborne: false, crouching: false, jumpStarted: false })
        visual.update(delta)
      } else {
        leftLeg.rotation.x = rightLeg.rotation.x = 0
        leftArm.rotation.x = rightArm.rotation.x = 0
        body.position.y = bodyBaseY
      }
      if (onTriggerCallback) onTriggerCallback(group.position)
      if (playbackTime >= Math.max(0, totalDuration) + HOLD_SECONDS) stop()
      return
    }

    const currentTargetTime = trajectory[0].time + playbackTime

    // Find the segment in trajectory
    let idx = 0
    while (idx < trajectory.length - 1 && trajectory[idx + 1].time < currentTargetTime) {
      idx++
    }

    const p0 = trajectory[idx]
    const p1 = trajectory[Math.min(idx + 1, trajectory.length - 1)]

    const segmentDuration = Math.max(0.0001, p1.time - p0.time)
    const t = Math.min(1, Math.max(0, (currentTargetTime - p0.time) / segmentDuration))

    // Interpolate position and facing
    group.position.lerpVectors(p0.position, p1.position, t)

    let rotDiff = p1.rotationY - p0.rotationY
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
    group.rotation.y = p0.rotationY + rotDiff * t

    if (visual) {
      const step = group.position.distanceTo(lastSamplePos)
      const speed = delta > 1e-4 ? step / delta : 0
      lastSamplePos.copy(group.position)
      const airborne = Math.abs((p0.position.y ?? 0) - (p1.position.y ?? 0)) > 0.08
        || group.position.y > 0.35
      visual.setLocomotion({
        moving: speed > MOVE_SPEED_EPS,
        airborne,
        crouching: false,
        jumpStarted: false
      })
      visual.update(delta)
    } else {
      // Procedural limb swing on the humanoid fallback.
      const stride = p0.stridePhase !== undefined ? p0.stridePhase : 0
      const swing = Math.sin(stride) * STRIDE_AMPLITUDE
      leftLeg.rotation.x = swing
      rightLeg.rotation.x = -swing
      leftArm.rotation.x = -swing * 0.8
      rightArm.rotation.x = swing * 0.8
      body.position.y = bodyBaseY + Math.abs(Math.sin(stride)) * BOB_HEIGHT
    }

    // Fire trigger callback to press plates / switches
    if (onTriggerCallback) {
      onTriggerCallback(group.position)
    }
  }

  function isOccupying(center, halfSize = 1.0) {
    if (!isPlaying) return false
    // A replay on the roof (or in mid-jump) cannot weight a pad below it.
    if (Math.abs(group.position.y - center.y) > 0.25) return false
    const dx = group.position.x - center.x
    const dz = group.position.z - center.z
    // Pads are square. Use the same footprint as the player's pad check so
    // an echo standing at a pad's corner has exactly the same weight.
    return Math.abs(dx) < halfSize && Math.abs(dz) < halfSize
  }

  function dispose() {
    cancel()
    visual?.dispose?.()
    visual = null
    disposeObject(group)
  }

  group.visible = false

  return {
    mesh: group,
    loadVisual,
    startReplay,
    stop,
    warm,
    cancel,
    update,
    isOccupying,
    isPlaying: () => isPlaying,
    // Read-only presentation data: use the replay's real clock rather than a
    // second countdown that can drift through pause, cancellation or reset.
    getRemainingSeconds: () => !isPlaying || trajectory.length < 2 ? 0 : Math.max(0,
      Math.max(0, trajectory[trajectory.length - 1].time - trajectory[0].time) + HOLD_SECONDS - playbackTime),
    getPosition: () => group.position,
    dispose
  }
}

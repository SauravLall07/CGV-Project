import * as THREE from 'three'
import { createHumanoid } from './humanoid.js'
import { disposeObject } from '../core/dispose.js'

// Holographic Time Ghost: a recorded temporal echo of the player.
// Replays a window of the player's movement and actions, walking the path
// and holding pressure plates or switches before dissolving.

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

export function createTimeGhost() {
  const { group, body, leftArm, rightArm, leftLeg, rightLeg } = createHumanoid(GHOST_PALETTE)
  group.name = 'time-ghost'

  // Convert all meshes in the ghost hierarchy to translucent glowing hologram materials
  const ghostMaterials = []
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false
      child.receiveShadow = false
      const oldMat = child.material
      const ghostMat = new THREE.MeshStandardMaterial({
        color: oldMat ? oldMat.color : 0x38bdf8,
        emissive: 0x00d4ff,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.62,
        wireframe: false,
        depthWrite: false
      })
      child.material = ghostMat
      ghostMaterials.push(ghostMat)
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

  // Floating scanline / temporal beacon indicator
  const beaconLight = new THREE.PointLight(0x00f0ff, 3, 4)
  beaconLight.position.y = 1.2
  group.add(beaconLight)

  let trajectory = []
  let playbackTime = 0
  let isPlaying = false
  let onCompleteCallback = null
  let onTriggerCallback = null
  let elapsed = 0

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
    group.visible = true
  }

  function stop() {
    isPlaying = false
    group.visible = false
    if (onCompleteCallback) {
      const cb = onCompleteCallback
      onCompleteCallback = null
      cb()
    }
  }

  function update(delta) {
    elapsed += delta
    ring.rotation.y += delta * 2.5
    const pulse = 0.5 + Math.sin(elapsed * 8) * 0.25
    ringMat.opacity = pulse
    beaconLight.intensity = 2.5 + Math.sin(elapsed * 12) * 1.0

    if (!isPlaying || trajectory.length < 2) return

    playbackTime += delta

    const totalDuration = trajectory[trajectory.length - 1].time - trajectory[0].time
    if (totalDuration <= 0 || playbackTime >= totalDuration) {
      // Reached the end of the recording
      const last = trajectory[trajectory.length - 1]
      group.position.copy(last.position)
      group.rotation.y = last.rotationY
      if (onTriggerCallback) onTriggerCallback(group.position)
      stop()
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

    // Interpolate limb swings
    const stride = p0.stridePhase !== undefined ? p0.stridePhase : 0
    const swing = Math.sin(stride) * STRIDE_AMPLITUDE
    leftLeg.rotation.x = swing
    rightLeg.rotation.x = -swing
    leftArm.rotation.x = -swing * 0.8
    rightArm.rotation.x = swing * 0.8
    body.position.y = Math.abs(Math.sin(stride)) * BOB_HEIGHT

    // Fire trigger callback to press plates / switches
    if (onTriggerCallback) {
      onTriggerCallback(group.position)
    }
  }

  function isOccupying(center, radius = 1.0) {
    if (!isPlaying && !group.visible) return false
    const dx = group.position.x - center.x
    const dz = group.position.z - center.z
    return (dx * dx + dz * dz) <= (radius * radius)
  }

  function dispose() {
    stop()
    disposeObject(group)
  }

  group.visible = false

  return {
    mesh: group,
    startReplay,
    stop,
    update,
    isOccupying,
    isPlaying: () => isPlaying,
    getPosition: () => group.position,
    dispose
  }
}

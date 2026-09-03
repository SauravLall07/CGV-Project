import * as THREE from 'three'
import { createCarriageInterior } from '../environment/carriage-interior.js'
import { disposeObject } from '../core/dispose.js'

// Level 2 — "The Moving Heist". Demonstrates the complete time-manipulation
// engine: Slow, Freeze, Rewind, and Time Ghost across interactive puzzle
// stations leading to the Vault.

const LENGTH = 32
const HALF = LENGTH / 2

function createChronoCore() {
  const core = new THREE.Group()
  core.name = 'chrono-core'

  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.28, metalness: 0.92 })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.12, 16), brass)
  base.position.y = 0.06
  base.castShadow = true
  core.add(base)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.85, 16), brass)
  column.position.y = 0.52
  column.castShadow = true
  core.add(column)

  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 20), brass)
  cradle.rotation.x = Math.PI / 2
  cradle.position.y = 0.98
  core.add(cradle)

  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.24, 1),
    new THREE.MeshStandardMaterial({
      color: 0x5ce6ff,
      emissive: 0x2ab8e0,
      emissiveIntensity: 3.2,
      roughness: 0.15,
      metalness: 0.3
    })
  )
  orb.position.y = 1.2
  orb.name = 'chrono-core-orb'
  core.add(orb)

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.018, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x4fd8f5, emissiveIntensity: 2.4 })
  )
  halo.rotation.x = Math.PI / 2.4
  halo.position.y = 1.2
  halo.name = 'chrono-core-halo'
  core.add(halo)

  const glow = new THREE.PointLight(0x54dcff, 14, 7, 2)
  glow.position.y = 1.2
  core.add(glow)

  return core
}

export function createMovingHeistLevel({ scene, interaction, timeSystem, hud, player, advance }) {
  const { group, update: updateInterior } = createCarriageInterior({ length: LENGTH })

  // -------------------------------------------------------------
  // Puzzle 1: Fast-Spinning Temporal Laser Blade (Use [1] Slow or [2] Freeze)
  // -------------------------------------------------------------
  const bladeGroup = new THREE.Group()
  bladeGroup.position.set(0, 1.4, -HALF + 10)

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 })
  )
  hub.rotation.x = Math.PI / 2
  bladeGroup.add(hub)

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x00d4ff,
    emissiveIntensity: 3.0,
    roughness: 0.1
  })
  const beam1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.04), beamMat)
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.04), beamMat)
  bladeGroup.add(beam1, beam2)
  group.add(bladeGroup)

  let bladeAngle = 0
  const unregisterBlade = timeSystem.register(bladeGroup, {
    onUpdate(scaledDelta) {
      bladeAngle += scaledDelta * 7.0
      bladeGroup.rotation.z = bladeAngle
    },
    getSnapshot() {
      return { angle: bladeAngle }
    },
    restoreSnapshot(snap) {
      bladeAngle = snap.angle
      bladeGroup.rotation.z = bladeAngle
    }
  })

  // -------------------------------------------------------------
  // Puzzle 2: Rewindable Falling Platform Crate (Use [3] Rewind)
  // -------------------------------------------------------------
  const crateGroup = new THREE.Group()
  crateGroup.position.set(0, 0.45, -HALF + 16)

  const crateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6, metalness: 0.1 })
  )
  crateMesh.castShadow = true
  crateGroup.add(crateMesh)
  group.add(crateGroup)

  let crateHeight = 0.45
  let crateFallSpeed = 0
  let isCrateFalling = true

  const unregisterCrate = timeSystem.register(crateGroup, {
    onUpdate(scaledDelta, timeScale, rawDelta) {
      if (timeScale > 0) {
        // Falling motion cycle
        crateHeight -= scaledDelta * 0.4
        if (crateHeight < 0.15) {
          crateHeight = 1.6 // Reset for continuous demo puzzle
        }
        crateGroup.position.y = crateHeight
      }
    },
    getSnapshot() {
      return { y: crateGroup.position.y }
    },
    restoreSnapshot(snap) {
      crateHeight = snap.y
      crateGroup.position.y = snap.y
    }
  })

  // -------------------------------------------------------------
  // Puzzle 3: Ghost Pressure Plate & Bulkhead Security Door (Use [4] Ghost)
  // -------------------------------------------------------------
  const plateGroup = new THREE.Group()
  plateGroup.position.set(0, 0.02, -HALF + 21)

  const plateGeo = new THREE.BoxGeometry(0.9, 0.04, 0.9)
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.2,
    roughness: 0.3
  })
  const plateMesh = new THREE.Mesh(plateGeo, plateMat)
  plateGroup.add(plateMesh)
  group.add(plateGroup)

  // Security Bulkhead Door
  const doorGroup = new THREE.Group()
  doorGroup.position.set(0, 1.2, -HALF + 24.5)

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.5,
    metalness: 0.8,
    roughness: 0.3
  })
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.15), doorMat)
  doorGroup.add(doorMesh)
  group.add(doorGroup)

  let doorOpenRatio = 0 // 0 = closed, 1 = open

  // -------------------------------------------------------------
  // Goal: Chrono Core in Vault
  // -------------------------------------------------------------
  const core = createChronoCore()
  core.position.set(0, 0, HALF - 2)
  group.add(core)

  scene.add(group)
  scene.background = new THREE.Color(0x090b12)
  scene.fog = new THREE.Fog(0x090b12, 8, 36)

  const unregisterCore = interaction.register(core, {
    prompt: 'Take the Chrono Core',
    onInteract: () => {
      interaction.flashPrompt('Chrono Core secured!')
      advance()
    }
  })

  const orb = core.getObjectByName('chrono-core-orb')
  const halo = core.getObjectByName('chrono-core-halo')
  let elapsed = 0

  return {
    objective: 'Use Time Abilities ([1] Slow, [2] Freeze, [3] Rewind, [4] Ghost) to reach the Vault',
    checkpoint: { position: new THREE.Vector3(0, 0, -HALF + 5), yaw: 0 },
    bounds: { minX: -0.58, maxX: 0.58, minZ: -HALF + 1.2, maxZ: HALF - 2.8 },

    update(delta) {
      updateInterior(delta)
      elapsed += delta

      // Animate Chrono Core
      orb.rotation.y += delta * 0.7
      orb.rotation.x += delta * 0.3
      orb.position.y = 1.2 + Math.sin(elapsed * 1.6) * 0.04
      halo.rotation.z += delta * 1.1
      halo.position.y = orb.position.y

      // Check pressure plate state (Player or Ghost on plate)
      const ghost = timeSystem.getGhost()
      const isGhostOnPlate = ghost.isOccupying(plateGroup.position, 0.7)
      
      // Also check player distance to plate
      const playerPos = player?.mesh?.position || scene.getObjectByName('player')?.position
      let isPlayerOnPlate = false
      if (playerPos) {
        const dx = playerPos.x - plateGroup.position.x
        const dz = playerPos.z - plateGroup.position.z
        if ((dx * dx + dz * dz) < 0.6) isPlayerOnPlate = true
      }

      const isPlatePressed = isPlayerOnPlate || isGhostOnPlate

      if (isPlatePressed) {
        plateMat.emissive.setHex(0x10b981) // Green glowing
        plateMesh.position.y = -0.015
        doorOpenRatio = Math.min(1, doorOpenRatio + delta * 3.0)
      } else {
        plateMat.emissive.setHex(0xf59e0b) // Amber glowing
        plateMesh.position.y = 0
        doorOpenRatio = Math.max(0, doorOpenRatio - delta * 2.0)
      }

      // Slide door vertically up into ceiling
      doorGroup.position.y = 1.2 + doorOpenRatio * 2.1
    },

    dispose() {
      unregisterBlade()
      unregisterCrate()
      unregisterCore()
      scene.remove(group)
      disposeObject(group)
    }
  }
}

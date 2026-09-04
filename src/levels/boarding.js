import * as THREE from 'three'
import { createStationBlockout, createStationLighting, bounds, GATE_Z } from '../environment/station-blockout.js'
import { createTrain } from '../entities/train.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createStealthSystem } from '../systems/stealth.js'
import { disposeObject } from '../core/dispose.js'

// Level 1 — "The Boarding". The complete stealth infiltration level:
// - Deterministic guard patrol AI (concourse, column perimeter, boarding sentry)
// - Wall-mounted sweeping security cameras with vision cone projections
// - Laser security grid and interactive bypass terminal
// - Suspicion / alert fail-state
// - Cinematic train departure sequence into Level 2

export function createBoardingLevel({ scene, interaction, assets, hud, player, respawn, advance }) {
  const { group: station, boardingControl, wallColliders } = createStationBlockout({ includePlaceholders: false })
  const { train } = createTrain()
  const lights = createStationLighting()
  const outdoorEnv = createOutdoorEnvironment({ mode: 'station', stationSpotLights: lights.spotLights })

  scene.add(outdoorEnv.group, station, train, ...lights)

  // Dusk atmosphere with depth fog
  scene.fog = new THREE.Fog(0x241d24, 30, 250)

  // Collect solid obstacles for line-of-sight raycasts
  const collidables = []
  station.traverse((child) => {
    if (child.isMesh && child.name !== 'vision-cone') {
      collidables.push(child)
    }
  })

  // -------------------------------------------------------------
  // Stealth & Infiltration System
  // -------------------------------------------------------------
  const stealth = createStealthSystem({
    scene,
    player,
    respawn,
    hud,
    collidables,
    obstacles: wallColliders
  })

  // -------------------------------------------------------------
  // Zone 1 — The Approach (easy): a single slow patrol along the east
  // aisle, leading toward the east-side doorway into Zone 2.
  // -------------------------------------------------------------
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(1.6, 0, -21),
      new THREE.Vector3(1.6, 0, -14.6)
    ],
    speed: 1.3,
    waitTime: 2.6,
    initialWaypoint: 0
  })

  // -------------------------------------------------------------
  // Zone 2 — The Colonnade (medium): the doorway out (into Zone 3) sits
  // on the WEST wall, so the player has to cross the full width of this
  // room past two crossing patrols and a camera. The terminal that
  // disables Zone 3's laser gate lives here too.
  // -------------------------------------------------------------
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-2.8, 0, -13),
      new THREE.Vector3(-2.8, 0, 3),
      new THREE.Vector3(-0.6, 0, 3),
      new THREE.Vector3(-0.6, 0, -13)
    ],
    speed: 1.6,
    waitTime: 1.8,
    initialWaypoint: 2
  })

  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-3.6, 0, -6),
      new THREE.Vector3(0.4, 0, -6)
    ],
    speed: 1.5,
    waitTime: 2.0,
    initialWaypoint: 0
  })

  stealth.addCamera({
    position: new THREE.Vector3(-4.7, 4.6, -8),
    baseAngle: 0.3,
    sweepRange: Math.PI / 3.4,
    sweepSpeed: 0.75,
    range: 9.5
  })

  // -------------------------------------------------------------
  // Zone 3 — The Checkpoint (hard): a guard, a camera, and the laser
  // grid sits right in the west-side doorway from Zone 2 — the toughest
  // combination yet, only passable once the Zone 2 terminal has
  // disabled it.
  // -------------------------------------------------------------
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(2.4, 0, 8),
      new THREE.Vector3(-1.0, 0, 16)
    ],
    speed: 1.7,
    waitTime: 2.0,
    initialWaypoint: 0
  })

  stealth.addCamera({
    position: new THREE.Vector3(-4.7, 4.6, 12),
    baseAngle: -0.2,
    sweepRange: Math.PI / 3.2,
    sweepSpeed: 0.65,
    range: 9.5
  })

  // -------------------------------------------------------------
  // Zone 4 — The Boarding Platform (hardest): a short, tight final
  // stretch through the east-side doorway — a fast guard and a narrow,
  // quick-sweeping camera leave little room to wait out a gap.
  // -------------------------------------------------------------
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(3.0, 0, 22),
      new THREE.Vector3(0.5, 0, 26)
    ],
    speed: 1.8,
    waitTime: 1.4,
    initialWaypoint: 0
  })

  stealth.addCamera({
    position: new THREE.Vector3(-4.7, 4.6, 24),
    baseAngle: 0,
    sweepRange: Math.PI / 4.5,
    sweepSpeed: 0.9,
    range: 8
  })

  // -------------------------------------------------------------
  // Laser Security Grid — embedded in the Zone 2 → Zone 3 doorway
  // (west side, x ≈ -2.8), matching that gate's door position.
  // -------------------------------------------------------------
  const laserGrid = stealth.addLaserGrid({
    position: new THREE.Vector3(-2.8, 0, 4),
    width: 2.4,
    height: 2.2,
    beamCount: 4
  })

  // Security Terminal Junction Box on column/wall
  const terminal = new THREE.Group()
  terminal.name = 'security-terminal'
  terminal.position.set(-4.5, 1.2, -4.0)

  const termBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.55, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 })
  )
  terminal.add(termBox)

  const termScreenMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.5,
    roughness: 0.2
  })
  const termScreen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.16), termScreenMat)
  termScreen.position.set(0.18, 0.05, 0)
  terminal.add(termScreen)

  const termLight = new THREE.PointLight(0xef4444, 3, 3)
  termLight.position.set(0.3, 0.05, 0)
  terminal.add(termLight)

  station.add(terminal)

  let isGridDisabled = false
  const unregisterTerminal = interaction.register(terminal, {
    prompt: 'Deactivate Security Laser Grid',
    onInteract: () => {
      if (isGridDisabled) return
      isGridDisabled = true
      laserGrid.setActive(false)
      termScreenMat.color.setHex(0x10b981)
      termScreenMat.emissive.setHex(0x059669)
      termLight.color.setHex(0x10b981)
      interaction.flashPrompt('Security Grid Deactivated!')
      if (hud) hud.showToast('Security laser offline — route to train clear!', 2500)
    }
  })

  // -------------------------------------------------------------
  // Boarding Sequence & Cinematic Transition
  // -------------------------------------------------------------
  let isBoardingCinematic = false
  let cinematicTimer = 0

  const unregisterBoarding = interaction.register(boardingControl, {
    prompt: 'Board Chrono Express',
    onInteract: () => {
      if (isBoardingCinematic) return
      isBoardingCinematic = true
      interaction.flashPrompt('Boarding Chrono Express…')
      if (hud) hud.setObjective('Departing station… hold on!')
    }
  })

  const zoneNames = [
    'Slip past the guard in the approach',
    'Clear the colonnade — find the terminal, then head west',
    'Bypass the checkpoint laser and camera, then head east',
    'Sprint the last stretch to the train'
  ]
  let zoneIndex = 0

  return {
    objective: 'Bypass guards & security grid to board the Chrono Express',
    checkpoint: { position: new THREE.Vector3(1.6, 0, -25), yaw: 0 },
    bounds,
    obstacles: wallColliders,
    update(delta) {
      outdoorEnv.update(delta)

      const crossed = GATE_Z.filter((g) => player.mesh.position.z > g).length
      if (crossed !== zoneIndex) {
        zoneIndex = crossed
        if (hud) hud.showToast(zoneNames[zoneIndex], 2200)
      }

      if (isBoardingCinematic) {
        cinematicTimer += delta
        // Move train smoothly forward along the tracks
        train.position.z += delta * (cinematicTimer * 6.5)

        if (cinematicTimer >= 2.4) {
          isBoardingCinematic = false
          advance()
        }
        return
      }

      stealth.update(delta)
    },

    dispose() {
      unregisterTerminal()
      unregisterBoarding()
      stealth.dispose()
      outdoorEnv.dispose()
      scene.remove(outdoorEnv.group, station, train, ...lights)
      disposeObject(station)
      disposeObject(train)
      lights.forEach(disposeObject)
    }
  }
}

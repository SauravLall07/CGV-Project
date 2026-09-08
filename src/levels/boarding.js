import * as THREE from 'three'
import {
  createStationBlockout,
  createStationLighting,
  bounds,
  GATE_Z,
  APPROACH_GATE_X,
  APPROACH_START_X,
  APPROACH_CENTER_Z,
  JUNCTION_CHECKPOINT
} from '../environment/station-blockout.js'
import { createTrain } from '../entities/train.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createTutorialPassage } from '../environment/passageways/passage-tutorial.js'
import { createGuardPassage } from '../environment/passageways/passage-guards.js'
import { createBridgePassage } from '../environment/passageways/passage-bridge.js'
import { createStealthSystem } from '../systems/stealth.js'
import { createDistractionSystem } from '../systems/distraction.js'
import { disposeObject } from '../core/dispose.js'

// Level 1 — "The Boarding". The complete stealth infiltration level:
// - Deterministic guard patrol AI (concourse, column perimeter, boarding sentry)
// - Wall-mounted sweeping security cameras with vision cone projections
// - Laser security grid and interactive bypass terminal
// - Suspicion / alert fail-state
// - Cinematic train departure sequence into Level 2

export function createBoardingLevel({ scene, interaction, assets, hud, player, camera, respawn, advance }) {
  const { group: station, boardingControl, wallColliders } = createStationBlockout({ includePlaceholders: false })

  // Shared finite inventory for throwable guard distractions. Passageways 2
  // and 3 both read/write this same object, so pickups carry across the vent.
  const distractionInventory = { count: 0, max: 3 }

  // Expansion modules stay self-contained. Passageway 1 opens its lower landing
  // when Passageway 2 is mounted; Passageway 2 then owns the lower guard hall,
  // its puzzle, hints, lasers and distraction system.
  const tutorialPassage = createTutorialPassage({
    interaction,
    hud,
    player,
    respawn,
    connectedToPassage2: true
  })
  const guardPassage = createGuardPassage({
    scene,
    interaction,
    hud,
    player,
    respawn,
    camera,
    distractionInventory,
    connectedToPassage3: true
  })
  const bridgePassage = createBridgePassage({
    scene,
    interaction,
    hud,
    player,
    respawn,
    camera,
    distractionInventory
  })

  station.add(tutorialPassage.group, guardPassage.group, bridgePassage.group)
  wallColliders.push(
    ...tutorialPassage.colliders,
    ...guardPassage.colliders,
    ...bridgePassage.colliders
  )

  const levelBounds = {
    minX: Math.min(bounds.minX, tutorialPassage.bounds.minX, guardPassage.bounds.minX, bridgePassage.bounds.minX),
    maxX: Math.max(bounds.maxX, tutorialPassage.bounds.maxX, guardPassage.bounds.maxX, bridgePassage.bounds.maxX),
    minZ: Math.min(bounds.minZ, tutorialPassage.bounds.minZ, guardPassage.bounds.minZ, bridgePassage.bounds.minZ),
    maxZ: Math.max(bounds.maxZ, tutorialPassage.bounds.maxZ, guardPassage.bounds.maxZ, bridgePassage.bounds.maxZ)
  }

  const { train } = createTrain()
  const lights = createStationLighting()
  const outdoorEnv = createOutdoorEnvironment({ mode: 'station', stationSpotLights: lights.spotLights })

  scene.add(outdoorEnv.group, station, train, ...lights)
  const unregisterStationBlocker = interaction.registerBlocker(station)
  const unregisterTrainBlocker = interaction.registerBlocker(train)

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

  tutorialPassage.setupStealth(stealth)
  guardPassage.setupStealth(stealth)
  bridgePassage.setupStealth(stealth)

  // Passageways 4 and 5 reuse the same finite distraction inventory as P2/P3.
  // Their guards belong to the station-level stealth system, so they need a
  // station-level throw handler rather than one owned by either lower passage.
  const stationDistraction = createDistractionSystem({
    scene,
    player,
    camera,
    stealth,
    hud,
    inventory: distractionInventory,
    hearingRadius: 10.5,
    groundHeightAt: () => 0,
    isEnabled: () => Boolean(
      bridgePassage.isComplete() &&
      player?.mesh?.position?.y > -0.55 &&
      !bridgePassage.isInsidePassage()
    )
  })

  const stationPickupUnregisters = []
  const stationPickupGeometry = new THREE.CylinderGeometry(0.09, 0.09, 0.26, 10)
  stationPickupGeometry.rotateZ(Math.PI / 2)
  const stationPickupMaterial = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    emissive: 0x3a2608,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.9
  })

  function addStationDistractorPickup(position, name) {
    const pickup = new THREE.Group()
    pickup.name = name
    pickup.position.copy(position)

    const body = new THREE.Mesh(stationPickupGeometry, stationPickupMaterial)
    body.position.y = 0.16
    body.castShadow = true
    pickup.add(body)
    station.add(pickup)

    let collected = false
    const unregister = interaction.register(pickup, {
      prompt: 'Pick up loose metal distractor',
      range: 2.2,
      onInteract: () => {
        if (collected) return
        if (distractionInventory.count >= distractionInventory.max) {
          hud?.showToast?.(`Distractor pouch full — ${distractionInventory.count}/${distractionInventory.max}`, 1300)
          return
        }

        collected = true
        distractionInventory.count += 1
        pickup.visible = false
        hud?.showToast?.(`Distractor collected — ${distractionInventory.count}/${distractionInventory.max}`, 1300)
      }
    })
    stationPickupUnregisters.push(unregister)
  }

  // Two replenishment points in Passageway 4's west approach and two in the
  // final station passage. They remain uncollected if the pouch is already full.
  addStationDistractorPickup(new THREE.Vector3(-43.5, 0.02, -26.2), 'distractor-pickup-p4-a')
  addStationDistractorPickup(new THREE.Vector3(-14.5, 0.02, -22.7), 'distractor-pickup-p4-b')
  addStationDistractorPickup(new THREE.Vector3(0.2, 0.02, -10.0), 'distractor-pickup-p5-a')
  addStationDistractorPickup(new THREE.Vector3(-2.8, 0.02, 10.0), 'distractor-pickup-p5-b')

  // -------------------------------------------------------------
  // New west-side infiltration wing — four extra stealth zones before the
  // original level. These guards/cameras use the exact same stealth system as
  // the existing platform section; only their positions and patrol routes are new.
  // -------------------------------------------------------------

  // Wing Zone A — Entry Gallery
  /*stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-47.0, 0, -24.2),
      new THREE.Vector3(-41.5, 0, -24.2)
    ],
    speed: 1.25,
    waitTime: 2.6,
    initialWaypoint: 0
  })*/

  // Wing Zone B — Baggage Passage (medium)
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-37.0, 0, -23.0),
      new THREE.Vector3(-31.0, 0, -26.0)
    ],
    speed: 1.45,
    waitTime: 2.0,
    initialWaypoint: 0
  })

  const approachLaserGrid = stealth.addLaserGrid({
    position: new THREE.Vector3(
      APPROACH_GATE_X[1],
      0,
      -23.025
    ),
    width: 2.1,
    height: 2.2,
    beamCount: 4,
    rotationY: Math.PI / 2
  })

  // -------------------------------------------------------------
  // West Wing Laser Terminal
  // Mounted on the north wall before Gate 2.
  // -------------------------------------------------------------
  const approachTerminal = new THREE.Group()
  approachTerminal.name = 'west-wing-security-terminal'
  approachTerminal.position.set(-32.0, 1.2, -22.0)

  // Rotate the existing terminal design so its screen faces into
  // the east-west corridor.
  approachTerminal.rotation.y = Math.PI / 2

  const approachTermBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.55, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.8
    })
  )

  approachTerminal.add(approachTermBox)

  const approachTermScreenMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.5,
    roughness: 0.2
  })

  const approachTermScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.28, 0.16),
    approachTermScreenMat
  )

  approachTermScreen.position.set(0.18, 0.05, 0)
  approachTerminal.add(approachTermScreen)

  const approachTermLight = new THREE.PointLight(
    0xef4444,
    3,
    3
  )

  approachTermLight.position.set(0.3, 0.05, 0)
  approachTerminal.add(approachTermLight)

  station.add(approachTerminal)

  let isApproachGridDisabled = false

  const unregisterApproachTerminal = interaction.register(
    approachTerminal,
    {
      prompt: 'Deactivate West Wing Laser Grid',

      onInteract: () => {
        if (isApproachGridDisabled) return

        isApproachGridDisabled = true

        approachLaserGrid.setActive(false)

        approachTermScreenMat.color.setHex(0x10b981)
        approachTermScreenMat.emissive.setHex(0x059669)
        approachTermLight.color.setHex(0x10b981)

        interaction.flashPrompt(
          'West Wing Security Grid Deactivated!'
        )

        if (hud) {
          hud.showToast(
            'Laser grid offline — Gate 2 is clear',
            2200
          )
        }
      }
    }
  )

  // Wing Zone C — Security Hall (medium-hard)
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-27.0, 0, -26.0),
      new THREE.Vector3(-20.0, 0, -23.0)
    ],
    speed: 1.55,
    waitTime: 1.7,
    initialWaypoint: 1
  })


  // Wing Zone D — Final Approach (hard)
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-16.0, 0, -23.0),
      new THREE.Vector3(-8.0, 0, -26.0)
    ],
    speed: 1.7,
    waitTime: 1.5,
    initialWaypoint: 0
  })

  stealth.addCamera({
    position: new THREE.Vector3(-10.5, 4.6, -21.95),
    baseAngle: Math.PI,
    sweepRange: Math.PI / 3.6,
    sweepSpeed: 0.9,
    range: 8.0
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

  const approachZoneNames = [
    'Infiltrate the west gallery — use luggage and benches as cover',
    'Baggage passage — find a way through the security laser',
    'Security hall — stay behind cover and avoid the patrol',
    'Final approach — reach the station junction'
  ]
  let approachZoneIndex = -1

  const zoneNames = [
    'Slip past the guard in the approach',
    'Clear the colonnade — find the terminal, then head west',
    'Bypass the checkpoint laser and camera, then head east',
    'Sprint the last stretch to the train'
  ]
  let zoneIndex = 0

  // The level manager needs an initial respawn position before any checkpoint
  // has been reached. Once the player reaches the old spawn/junction, this is
  // replaced by the level's one real checkpoint.
  const junctionCheckpointPos = new THREE.Vector3(
    JUNCTION_CHECKPOINT.x,
    0,
    JUNCTION_CHECKPOINT.z
  )
  let junctionCheckpointActive = false

  // Passageway 2 is the first real stealth test. Reaching it becomes a
  // checkpoint so a learning mistake does not force the player to repeat the
  // entire Passageway 1 tutorial and staircase.
  const passage2CheckpointPos = guardPassage.entryCheckpoint.clone()
  let passage2CheckpointActive = false

  // Passageway 3 gets its own checkpoint only after the player successfully
  // clears the crouch vent. That makes the vent a real transition without
  // respawning the player inside its low ceiling.
  const passage3CheckpointPos = bridgePassage.entryCheckpoint.clone()
  let passage3CheckpointActive = false

  // Passageway 4 starts immediately after Passageway 3's upper return stairs.
  // Give the player a checkpoint as soon as they step onto that upper approach
  // corridor, before any Passageway 4 stealth encounters begin.
  const passage4CheckpointPos = bridgePassage.exitCheckpoint.clone()
  let passage4CheckpointActive = false

  return {
    objective: 'Infiltrate all three security passageways, then rejoin the station route to the Chrono Express',
    checkpoint: {
      position: tutorialPassage.spawn.clone(),
      yaw: Math.PI / 2 // face east through Passageway 1
    },
    bounds: levelBounds,
    obstacles: wallColliders,
    groundHeightAt(x, z, fallback = 0) {
      const bridgeHeight = bridgePassage.getGroundHeight(x, z, Number.NaN)
      if (Number.isFinite(bridgeHeight)) return bridgeHeight
      const lowerHeight = guardPassage.getGroundHeight(x, z, Number.NaN)
      if (Number.isFinite(lowerHeight)) return lowerHeight
      return tutorialPassage.getGroundHeight(x, z, fallback)
    },
    handleAction(action) {
      if (bridgePassage.handleAction(action)) return true
      if (guardPassage.handleAction(action)) return true
      if (action === 'distract') return stationDistraction.throw()
      return false
    },
    update(delta) {
      outdoorEnv.update(delta)
      tutorialPassage.update(delta)
      guardPassage.update(delta)
      bridgePassage.update(delta)
      stationDistraction.update(delta)

      if (!passage2CheckpointActive && guardPassage.isInsidePassage()) {
        passage2CheckpointActive = true
        respawn.setCheckpoint(passage2CheckpointPos, Math.PI / 2)
        hud?.showToast?.('Checkpoint reached — lower security passage', 2100)
      }

      if (!passage3CheckpointActive && bridgePassage.hasClearedVent()) {
        passage3CheckpointActive = true
        respawn.setCheckpoint(passage3CheckpointPos, Math.PI)
        hud?.showToast?.('Checkpoint reached — Passageway 3 maintenance level', 2200)
      }

      if (!passage4CheckpointActive && bridgePassage.hasReachedExit()) {
        passage4CheckpointActive = true
        respawn.setCheckpoint(passage4CheckpointPos, Math.PI / 2)
        hud?.showToast?.('Checkpoint reached — Passageway 4 approach', 2200)
      }

      // The old west-wing progression also runs west -> east, so X alone is no
      // longer enough to identify it now that Passageway 2 is directly below.
      // Gate these toasts/checkpoint to the upper station footprint.
      if (!junctionCheckpointActive) {
        const inExistingApproach = (
          bridgePassage.isComplete() &&
          player.mesh.position.y > -0.15 &&
          player.mesh.position.x >= APPROACH_START_X - 0.15 &&
          Math.abs(player.mesh.position.z - APPROACH_CENTER_Z) <= 3.0
        )

        if (inExistingApproach) {
          const crossedApproach = APPROACH_GATE_X.filter((g) => player.mesh.position.x > g).length
          if (crossedApproach !== approachZoneIndex) {
            approachZoneIndex = crossedApproach
            if (hud) hud.showToast(approachZoneNames[approachZoneIndex], 2200)
          }
        }

        // Activate the original station checkpoint only after Stage 3 eventually
        // reconnects the player to the upper concourse.
        const checkpointDistance = Math.hypot(
          player.mesh.position.x - JUNCTION_CHECKPOINT.x,
          player.mesh.position.z - JUNCTION_CHECKPOINT.z
        )
        if (bridgePassage.isComplete() && player.mesh.position.y > -1 && checkpointDistance < 1.4) {
          junctionCheckpointActive = true
          respawn.setCheckpoint(junctionCheckpointPos, 0)
          if (hud) hud.showToast('Checkpoint reached — station concourse infiltrated', 2400)
        }
      } else {
        // From here onward the original four-zone level behaves exactly as before.
        const crossed = GATE_Z.filter((g) => player.mesh.position.z > g).length
        if (crossed !== zoneIndex) {
          zoneIndex = crossed
          if (hud) hud.showToast(zoneNames[zoneIndex], 2200)
        }
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
      unregisterStationBlocker()
      unregisterTrainBlocker()
      unregisterApproachTerminal()
      unregisterTerminal()
      unregisterBoarding()
      tutorialPassage.dispose()
      guardPassage.dispose()
      bridgePassage.dispose()
      stationPickupUnregisters.forEach((unregister) => unregister())
      stationDistraction.dispose()
      stealth.dispose()
      outdoorEnv.dispose()
      scene.remove(outdoorEnv.group, station, train, ...lights)
      disposeObject(station)
      disposeObject(train)
      lights.forEach(disposeObject)
    }
  }
}

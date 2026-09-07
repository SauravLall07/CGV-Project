import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y, CARRIAGE_ROOF_Y } from '../environment/carriages.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { createStealthSystem } from '../systems/stealth.js'

// Level 2 — "The Moving Heist".
//
// Physical progression is deliberately one-way: REAR -> FRONT.
// Passenger -> Security -> Relay -> Cargo -> Mechanical -> Roof -> Vault.
//
// Ability progression is equally deliberate:
// Passenger  : no powers; reuse Level 1 timing/stealth instincts.
// Security   : acquire the Chrono Interface -> unlock SLOW.
// Relay      : apply what was learned with a routing puzzle; no new power.
// Cargo      : acquire the Cryo Phase module -> unlock FREEZE.
// Mechanical : acquire the Rollback module -> unlock REWIND.
// Vault      : acquire the Echo Synchronizer -> unlock GHOST.
//
// The Chrono Interface is NOT the heist target. It is a maintenance controller
// that remotely draws power from the train's Chrono Core. The Core itself is the
// target. Removing it destabilises the train and hands the game to Level 3.

const MODE_INT = { NORMAL: 0, SLOW: 1, FREEZE: 2, REWIND: 3 }

function createChronoCore() {
  const core = new THREE.Group()
  core.name = 'chrono-core'

  const brass = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    roughness: 0.28,
    metalness: 0.92
  })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.16, 18), brass)
  base.position.y = 0.08
  base.castShadow = true
  core.add(base)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.9, 18), brass)
  column.position.y = 0.56
  column.castShadow = true
  core.add(column)

  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 10, 28), brass)
  cradle.rotation.x = Math.PI / 2
  cradle.position.y = 1.12
  core.add(cradle)

  const shaderMats = []

  const orbMat = createChronoFieldMaterial({
    baseColor: 0x0284c7,
    glowColor: 0x38bdf8,
    opacity: 0.92
  })
  shaderMats.push(orbMat)

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 2), orbMat)
  orb.position.y = 1.34
  orb.name = 'chrono-core-orb'
  core.add(orb)

  const haloMat = createChronoFieldMaterial({
    baseColor: 0x38bdf8,
    glowColor: 0xa5f3fc,
    opacity: 0.88,
    doubleSided: true
  })
  shaderMats.push(haloMat)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 36), haloMat)
  halo.rotation.x = Math.PI / 2.4
  halo.position.y = 1.34
  halo.name = 'chrono-core-halo'
  core.add(halo)

  const glow = new THREE.PointLight(0x54dcff, 18, 8, 2)
  glow.position.y = 1.34
  core.add(glow)

  core.userData.shaderMats = shaderMats
  return core
}

function makeConsole(accent = 0x38bdf8, width = 0.46) {
  const g = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, 1.05, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 })
  )
  body.position.y = 0.525
  body.castShadow = true
  g.add(body)

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.08, 0.24, 0.035),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 2.6,
      roughness: 0.2
    })
  )
  screen.position.set(0, 0.78, 0.19)
  screen.rotation.x = -0.25
  g.add(screen)

  screen.name = 'console-screen'
  g.userData.screen = screen

  return g
}

function makeChronoPickup(
  accent = 0x38bdf8,
  width = 0.52
) {
  const group = makeConsole(accent, width)

  const beacon = new THREE.Group()
  beacon.name = 'chrono-pickup-beacon'

  const columnMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  })

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.12,
      0.22,
      2.8,
      16,
      1,
      true
    ),
    columnMat
  )

  column.position.y = 1.5

  const ringMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false
  })

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      0.55,
      0.72,
      32
    ),
    ringMat
  )

  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.025

  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: accent,
      emissiveIntensity: 4,
      roughness: 0.15
    })
  )

  marker.position.y = 2.35

  const light = new THREE.PointLight(
    accent,
    18,
    7,
    2
  )

  light.position.y = 1.45

  beacon.add(
    column,
    ring,
    marker,
    light
  )

  group.add(beacon)

  let elapsed = 0

  return {
    group,

    collect() {
      beacon.visible = false
    },

    update(delta) {
      if (!beacon.visible) return

      elapsed += delta

      marker.rotation.y += delta * 2.4

      marker.position.y =
        2.35 +
        Math.sin(elapsed * 4) * 0.12

      ring.rotation.z += delta * 0.8

      ringMat.opacity =
        0.55 +
        Math.sin(elapsed * 5) * 0.2

      light.intensity =
        16 +
        Math.sin(elapsed * 4) * 5
    }
  }
}

function makeBarrierProp({ width = 0.68, height = 0.95, depth = 0.9, color = 0x5b3a22 } = {}) {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.1 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.9 })

  const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat)
  box.position.y = height / 2
  box.castShadow = true
  g.add(box)

  const strap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, 0.06, depth + 0.03), brass)
  strap.position.y = height * 0.68
  g.add(strap)

  return g
}

function makeRotor(accent = 0x38bdf8, radius = 0.9) {
  const g = new THREE.Group()
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.22 })
  const beamMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 3.2,
    roughness: 0.12
  })

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 14), hubMat)
  hub.rotation.x = Math.PI / 2
  g.add(hub)

  const h = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, 0.07, 0.07), beamMat)
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, radius * 2, 0.07), beamMat)
  g.add(h, v)

  return g
}

export function createMovingHeistLevel({ scene, interaction, timeSystem, hud, player, camera, respawn, advance }) {

  const powerPickups = []
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.0)
  if (timeSystem?.setMode) timeSystem.setMode('NORMAL')

  // Level 2 starts exactly where the story says it should: no powers yet.
  const abilityState = { SLOW: false, FREEZE: false, REWIND: false, GHOST: false }
  timeSystem?.setAbilityAvailability?.(abilityState)
  hud?.setChronoVisible?.(false)

  const env = createCarriageEnvironment()
  const outdoorEnv = createOutdoorEnvironment({ mode: 'moving', speed: 38.0 })
  const { root, spans, roof } = env

  scene.add(outdoorEnv.group, root)
  scene.fog = new THREE.Fog(0x241d24, 30, 250)

  // Geometry that can block the Passenger guard's vision.
  // This includes walls, seats, luggage, bulkheads, etc.
  const guardCollidables = []

  root.traverse((child) => {
    if (
      child.isMesh &&
      child.name !== 'vision-cone'
    ) {
      guardCollidables.push(child)
    }
  })

  const unregisters = []
  const bounds = { ...env.interiorBounds }

  // The level manager exposes one obstacle array to player.js. Keep the array
  // identity stable and swap its contents when changing interior/roof/vault.
  const activeObstacles = []
  const corridorObstacles = []
  const passengerStealth =
    createStealthSystem({
      scene,
      player,
      respawn,
      hud,
      collidables: guardCollidables,
      obstacles: corridorObstacles
    })
  const vaultObstacles = []

  function useObstacles(list) {
    activeObstacles.splice(0, activeObstacles.length, ...list)
  }

  const addProp = (obj, z, x = 0, y = 0) => {
    obj.position.set(x, y, z)
    root.add(obj)
    return obj
  }

  function addStaticBarrier({ z, x, width = 0.68, depth = 0.9, height = 0.95, color, target = corridorObstacles }) {
    const prop = makeBarrierProp({ width, depth, height, color })
    addProp(prop, z, x)
    prop.traverse((child) => {
      if (child.isMesh) {
        guardCollidables.push(child)
      }
    })
    target.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    })
    return prop
  }

  function setBounds(b) {
    bounds.minX = b.minX
    bounds.maxX = b.maxX
    bounds.minZ = b.minZ
    bounds.maxZ = b.maxZ
  }

  function unlockAbility(id, toastText) {
    if (abilityState[id]) return
    abilityState[id] = true
    timeSystem?.setAbilityAvailability?.(abilityState)
    hud?.setChronoVisible?.(true)
    if (toastText) hud?.showToast?.(toastText, 3000)
  }

  let failCooldown = 0
  function failSoft(message, reason = 'caught') {
    if (failCooldown > 0) return
    failCooldown = 1.2
    respawn.fail(reason)
    if (message) hud.showToast(message, 1800)
  }

  let section = 'interior' // interior | roof | vault

  const hintsShown = new Set()
  function hint(key, playerZ, enterZ, message) {
    if (hintsShown.has(key) || playerZ < enterZ) return
    hintsShown.add(key)
    hud.showToast(message, 3200)
  }

  // Rolling corridor checkpoints; the player always progresses toward +Z.
  let lastCheckpointZ = spans.passenger.minZ + 2.2
  const corridorCheckpoints = [
    spans.security.minZ + 1.0,
    spans.relay.minZ + 1.0,
    spans.cargo.minZ + 1.0,
    spans.mechanical.minZ + 1.0
  ]

  // --------------------------------------------------------------------------
  // PASSENGER — STEALTH / COVER
  // No Chrono powers yet. The player must use luggage and service furniture
  // to break the guard's line of sight.
  // --------------------------------------------------------------------------

  addStaticBarrier({
    z: spans.passenger.minZ + 5.0,
    x: -0.45,
    width: 0.72,
    depth: 1.25,
    height: 1.4,
    color: 0x6f4529
  })

  addStaticBarrier({
    z: spans.passenger.minZ + 7.6,
    x: 0.45,
    width: 0.72,
    depth: 1.15,
    height: 1.45,
    color: 0x48505a
  })

  addStaticBarrier({
    z: spans.passenger.minZ + 9.7,
    x: -0.45,
    width: 0.68,
    depth: 1.0,
    height: 1.3,
    color: 0x765338
  })

  addStaticBarrier({
    z: spans.passenger.center + 2.0,
    x: 0.45,
    width: 0.72,
    depth: 1.1,
    height: 1.35,
    color: 0x4f3b2c
  })

  // ------------------------------------------------------------------
  // PASSENGER GUARD
  //
  // One deliberately simple patrol keeps the first carriage connected
  // to Level 1's stealth gameplay without overwhelming the player before
  // the Chrono powers are introduced.
  // ------------------------------------------------------------------

  passengerStealth.addGuard({
    waypoints: [
      new THREE.Vector3(
        0.42,
        0,
        spans.passenger.minZ + 3.4
      ),

      new THREE.Vector3(
        0.42,
        0,
        spans.passenger.center - 1.4
      )
    ],

    speed: 1.15,
    waitTime: 2.8,
    initialWaypoint: 0
  })


  // --------------------------------------------------------------------------
  // SECURITY — CHRONO INTERFACE + SLOW
  // Three hazards after the pickup: scanner, rotor, shutter.
  // --------------------------------------------------------------------------
  const chronoInterface = makeConsole(0x38bdf8, 0.56)
  chronoInterface.name = 'chrono-interface'
  // ------------------------------------------------------------------
  // Objective beacon
  // This is a major progression pickup, so make it visually impossible
  // to confuse with an ordinary security console.
  // ------------------------------------------------------------------

  const interfaceBeacon = new THREE.Group()
  interfaceBeacon.name = 'chrono-interface-beacon'

  const beaconMaterial =
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })

  // Vertical blue light column.
  const beaconColumn =
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.12,
        0.22,
        2.8,
        16,
        1,
        true
      ),
      beaconMaterial
    )

  beaconColumn.position.y = 1.5
  interfaceBeacon.add(beaconColumn)


  // Glowing ring around its base.
  const interfaceRingMat =
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    })

  const interfaceRing =
    new THREE.Mesh(
      new THREE.RingGeometry(
        0.55,
        0.72,
        32
      ),
      interfaceRingMat
    )

  interfaceRing.rotation.x =
    -Math.PI / 2

  interfaceRing.position.y = 0.025

  interfaceBeacon.add(interfaceRing)


  // Floating objective marker above the console.
  const interfaceMarker =
    new THREE.Mesh(
      new THREE.OctahedronGeometry(
        0.18,
        0
      ),
      new THREE.MeshStandardMaterial({
        color: 0xa5f3fc,
        emissive: 0x38bdf8,
        emissiveIntensity: 4,
        roughness: 0.15
      })
    )

  interfaceMarker.position.y = 2.35

  interfaceBeacon.add(interfaceMarker)


  // Actual light spilling into the carriage.
  const interfaceLight =
    new THREE.PointLight(
      0x38bdf8,
      18,
      7,
      2
    )

  interfaceLight.position.y = 1.45
  interfaceBeacon.add(interfaceLight)

  chronoInterface.add(interfaceBeacon)
  addProp(chronoInterface, spans.security.minZ + 3.0, 0)

  let interfaceTaken = false
  unregisters.push(interaction.register(chronoInterface, {
    prompt: 'Acquire Chrono Interface',
    onInteract: () => {
      if (interfaceTaken) return
      interfaceTaken = true
      interfaceBeacon.visible = false
      unlockAbility('SLOW', 'CHRONO LINK ESTABLISHED — SLOW unlocked')
      interaction.flashPrompt('Temporal Maintenance Interface linked to the train\'s Chrono Core.')
      hud.setObjective('SLOW TIME — get through the high-speed Security systems')
    }
  }))

  addStaticBarrier({
    z: spans.security.minZ + 5.2,
    x: 0.34,
    width: 0.62,
    depth: 0.9,
    color: 0x39414b
  })

  const scanner = new THREE.Group()
  const scanBeamMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x00d4ff,
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.58
  })
  const scanBeam = new THREE.Mesh(
    new THREE.BoxGeometry(
      0.28,
      CARRIAGE_CEILING_Y - 0.35,
      1.15
    ),
    scanBeamMat
  )
  scanBeam.position.y = (CARRIAGE_CEILING_Y - 0.35) / 2
  scanner.add(scanBeam)

  const scanRange = 0.62
  const scanRail = new THREE.Mesh(
    new THREE.BoxGeometry(
      scanRange * 2 + 0.8,
      0.08,
      0.08
    ),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.3
    })
  )
  scanRail.position.y = CARRIAGE_CEILING_Y - 0.14
  scanner.add(scanRail)

  const scannerZ = spans.security.center - 1.2
  addProp(scanner, scannerZ)

  let scanT = 0
  unregisters.push(timeSystem.register(scanner, {
    onUpdate(scaledDelta) {
      scanT += scaledDelta

      scanBeam.position.x =
        Math.sin(scanT * 10.0) *
        scanRange
    },
    getSnapshot: () => ({ scanT }),
    restoreSnapshot: (s) => {
      scanT = s.scanT

      scanBeam.position.x =
        Math.sin(scanT * 10.0) *
        scanRange
    }
  }))

  const secRotor = makeRotor(0x60a5fa, 0.9)
  const secRotorZ = spans.security.center + 3.7
  addProp(secRotor, secRotorZ, 0, 1.45)
  let secRotorA = 0
  unregisters.push(timeSystem.register(secRotor, {
    onUpdate(scaledDelta) {
      secRotorA += scaledDelta * 11.0
      secRotor.rotation.z = secRotorA
    },
    getSnapshot: () => ({ secRotorA }),
    restoreSnapshot: (s) => {
      secRotorA = s.secRotorA
      secRotor.rotation.z = secRotorA
    }
  }))

  const secShutter = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.45, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x2f3742, metalness: 0.85, roughness: 0.35 })
  )
  const secShutterZ = spans.security.maxZ - 2.0
  addProp(secShutter, secShutterZ, 0, 2.2)

  let shutterT = 0
  let shutterOpen = 1
  unregisters.push(timeSystem.register(secShutter, {
    onUpdate(scaledDelta) {
      shutterT += scaledDelta
      shutterOpen = (Math.sin(shutterT * 5.5) + 1) / 2
      secShutter.position.y = 0.35 + shutterOpen * 2.75
    },
    getSnapshot: () => ({ shutterT }),
    restoreSnapshot: (s) => {
      shutterT = s.shutterT
      shutterOpen = (Math.sin(shutterT * 2.0) + 1) / 2
      secShutter.position.y = 0.35 + shutterOpen * 2.75
    }
  }))

  // --------------------------------------------------------------------------
  // CHRONO RELAY — ROUTING PUZZLE
  // Match the three relay terminal colours to the pattern above the exit gate.
  // --------------------------------------------------------------------------

  const RELAY_COLORS = [
    0xef4444, // red
    0xf59e0b, // amber
    0x38bdf8  // cyan
  ]

  const relayTarget = [2, 1, 0] // cyan, amber, red
  const relayState = [0, 0, 0]
  let relaySolved = false

  function setRelayScreen(consoleObj, colourIndex) {
    const screen = consoleObj.userData.screen
    const colour = RELAY_COLORS[colourIndex]

    screen.material.color.setHex(colour)
    screen.material.emissive.setHex(colour)
  }

  const relayPositions = [
    {
      z: spans.relay.minZ + 3.5,
      x: -0.52,
      label: 'A'
    },
    {
      z: spans.relay.center,
      x: 0.52,
      label: 'B'
    },
    {
      z: spans.relay.maxZ - 4.0,
      x: -0.52,
      label: 'C'
    }
  ]

  relayPositions.forEach((cfg, i) => {
    const terminal = makeConsole(RELAY_COLORS[0], 0.4)

    terminal.name = `relay-terminal-${cfg.label}`
    addProp(terminal, cfg.z, cfg.x)

    unregisters.push(interaction.register(terminal, {
      prompt: `Cycle Chrono Relay ${cfg.label}`,

      onInteract: () => {
        if (relaySolved) return

        relayState[i] =
          (relayState[i] + 1) %
          RELAY_COLORS.length

        setRelayScreen(terminal, relayState[i])

        const correct = relayState.every(
          (value, index) =>
            value === relayTarget[index]
        )

        if (correct) {
          relaySolved = true

          hud.showToast(
            'CHRONO RELAY STABLE — bulkhead unlocked',
            2600
          )

          hud.setObjective(
            'Proceed to Cargo and acquire the next Chrono module'
          )
        }
      }
    }))
  })

  // Some physical equipment forces the player to explore both sides.
  addStaticBarrier({
    z: spans.relay.minZ + 6.2,
    x: 0.48,
    width: 0.68,
    depth: 1.2,
    height: 1.35,
    color: 0x33434f
  })

  addStaticBarrier({
    z: spans.relay.center + 2.1,
    x: -0.48,
    width: 0.68,
    depth: 1.2,
    height: 1.35,
    color: 0x293945
  })

  // Locked exit gate.
  const relayGateZ = spans.relay.maxZ - 1.35

  const relayGate = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 1.65, 0.14),
    new THREE.MeshStandardMaterial({
      color: 0x2f3742,
      metalness: 0.9,
      roughness: 0.35
    })
  )

  addProp(relayGate, relayGateZ, 0, 1.05)

  let relayGateOpen = 0

  // Target pattern above the exit gate.
  const relayTargetPanel = new THREE.Group()

  relayTarget.forEach((targetColour, i) => {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 10),
      new THREE.MeshStandardMaterial({
        color: RELAY_COLORS[targetColour],
        emissive: RELAY_COLORS[targetColour],
        emissiveIntensity: 3
      })
    )

    light.position.set(
      (i - 1) * 0.35,
      0,
      0
    )

    relayTargetPanel.add(light)
  })

  addProp(
    relayTargetPanel,
    relayGateZ - 0.12,
    0,
    2.45
  )
  // --------------------------------------------------------------------------
  // CARGO — FREEZE
  // Three moving cargo hazards: crane crate, pallet sweeper, crush gate.
  // --------------------------------------------------------------------------
  const freezePickup =
    makeChronoPickup(0x60a5fa, 0.5)

  powerPickups.push(freezePickup)

  const freezeModule = freezePickup.group
  freezeModule.name = 'freeze-module'
  addProp(freezeModule, spans.cargo.minZ + 3.0, 0)

  let freezeTaken = false
  unregisters.push(interaction.register(freezeModule, {
    prompt: 'Install Cryo Phase module',
    onInteract: () => {
      if (freezeTaken) return
      if (!relaySolved) {
        interaction.flashPrompt(
          'Restore the Chrono Relay routing first.'
        )
        return
      }
      if (!abilityState.SLOW) {
        interaction.flashPrompt('The Chrono Interface is not linked yet.')
        return
      }
      freezeTaken = true
      freezePickup.collect()
      unlockAbility('FREEZE', 'CRYO PHASE MODULE INSTALLED — FREEZE unlocked')
      hud.setObjective('Cross Cargo — FREEZE moving loads when they clear the aisle')
    }
  }))

  const crane = new THREE.Group()
  const craneCable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.25, 8),
    new THREE.MeshStandardMaterial({ color: 0x5d6570, metalness: 0.9, roughness: 0.3 })
  )
  craneCable.position.y = -0.62
  crane.add(craneCable)

  const hangingCrate = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.85, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.76 })
  )
  hangingCrate.position.y = -1.45
  hangingCrate.castShadow = true
  crane.add(hangingCrate)

  const craneZ = spans.cargo.minZ + 6.0
  addProp(crane, craneZ, 0, CARRIAGE_CEILING_Y - 0.05)

  let craneT = 0
  unregisters.push(timeSystem.register(crane, {
    onUpdate(scaledDelta) {
      craneT += scaledDelta
      crane.position.x = Math.sin(craneT * 2.1) * 0.82
    },
    getSnapshot: () => ({ craneT }),
    restoreSnapshot: (s) => {
      craneT = s.craneT
      crane.position.x = Math.sin(craneT * 2.1) * 0.82
    }
  }))

  const pallet = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.42, 1.25),
    new THREE.MeshStandardMaterial({ color: 0x6b4b2f, roughness: 0.78 })
  )
  pallet.castShadow = true
  const palletZ = spans.cargo.center + 0.7
  addProp(pallet, palletZ, 0, 0.21)

  let palletT = 0
  unregisters.push(timeSystem.register(pallet, {
    onUpdate(scaledDelta) {
      palletT += scaledDelta
      pallet.position.x = Math.sin(palletT * 2.8) * 0.78
    },
    getSnapshot: () => ({ palletT }),
    restoreSnapshot: (s) => {
      palletT = s.palletT
      pallet.position.x = Math.sin(palletT * 2.8) * 0.78
    }
  }))

  const cargoCrusher = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 0.55, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x3b434d, metalness: 0.85, roughness: 0.4 })
  )
  const cargoCrusherZ = spans.cargo.maxZ - 3.0
  addProp(cargoCrusher, cargoCrusherZ, 0, 2.7)

  let crusherT = 0
  let crusherOpen = 1
  unregisters.push(timeSystem.register(cargoCrusher, {
    onUpdate(scaledDelta) {
      crusherT += scaledDelta
      crusherOpen = (Math.sin(crusherT * 2.5) + 1) / 2
      cargoCrusher.position.y = 0.45 + crusherOpen * 2.6
    },
    getSnapshot: () => ({ crusherT }),
    restoreSnapshot: (s) => {
      crusherT = s.crusherT
      crusherOpen = (Math.sin(crusherT * 2.5) + 1) / 2
      cargoCrusher.position.y = 0.45 + crusherOpen * 2.6
    }
  }))

  // --------------------------------------------------------------------------
  // MECHANICAL — REWIND
  // Three main challenges: collapsing bridge, slam gate, hatch motor.
  // A spinning blade remains as an extra timing obstacle.
  // --------------------------------------------------------------------------
  const rewindPickup =
    makeChronoPickup(0xa855f7, 0.5)
  powerPickups.push(rewindPickup)
  const rewindModule = rewindPickup.group
  rewindModule.name = 'rewind-module'
  addProp(rewindModule, spans.mechanical.minZ + 3.0, 0)

  let rewindTaken = false
  unregisters.push(interaction.register(rewindModule, {
    prompt: 'Install Rollback module',
    onInteract: () => {
      if (rewindTaken) return
      if (!abilityState.FREEZE) {
        interaction.flashPrompt('The Chrono Interface is missing the previous phase module.')
        return
      }
      rewindTaken = true
      rewindPickup.collect()
      unlockAbility('REWIND', 'ROLLBACK MODULE INSTALLED — REWIND unlocked')
      hud.setObjective('Cross Mechanical — REWIND broken machinery to an earlier working state')
    }
  }))

  const bridgeZ = spans.mechanical.minZ + 6.0
  const mechBridge = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.12, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.66, metalness: 0.72 })
  )
  let bridgeY = 0.06
  let bridgeTriggered = false
  let bridgeCollapsing = false
  let bridgeFuse = 0.8
  mechBridge.position.set(0, bridgeY, bridgeZ)
  root.add(mechBridge)

  const bridgePit = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 3.4, 2.8),
    new THREE.MeshStandardMaterial({ color: 0x030409, roughness: 1 })
  )
  bridgePit.position.set(0, -1.7, bridgeZ)
  bridgePit.userData.noCameraCollision = true
  root.add(bridgePit)

  unregisters.push(timeSystem.register(mechBridge, {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale > 0) {
        if (bridgeCollapsing) bridgeY = Math.max(-3.2, bridgeY - scaledDelta * 4.2)
        else if (bridgeTriggered) {
          bridgeFuse -= scaledDelta
          if (bridgeFuse <= 0) bridgeCollapsing = true
        }
      }
      mechBridge.position.y = bridgeY
    },
    getSnapshot: () => ({ bridgeY, bridgeTriggered, bridgeCollapsing, bridgeFuse }),
    restoreSnapshot: (s) => {
      bridgeY = s.bridgeY
      bridgeTriggered = s.bridgeTriggered
      bridgeCollapsing = s.bridgeCollapsing
      bridgeFuse = s.bridgeFuse
      mechBridge.position.y = bridgeY
    }
  }))

  const slamGate = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x343a42, metalness: 0.86, roughness: 0.36 })
  )
  const slamGateZ = spans.mechanical.center + 0.8
  let slamGateY = 3.0
  let slamTriggered = false
  slamGate.position.set(0, slamGateY, slamGateZ)
  root.add(slamGate)

  unregisters.push(timeSystem.register(slamGate, {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale > 0 && slamTriggered) slamGateY = Math.max(0.65, slamGateY - scaledDelta * 4.5)
      slamGate.position.y = slamGateY
    },
    getSnapshot: () => ({ slamGateY, slamTriggered }),
    restoreSnapshot: (s) => {
      slamGateY = s.slamGateY
      slamTriggered = s.slamTriggered
      slamGate.position.y = slamGateY
    }
  }))

  const mechBlade = makeRotor(0x38bdf8, 0.95)
  const mechBladeZ = spans.mechanical.maxZ - 6.0
  addProp(mechBlade, mechBladeZ, 0, 1.45)
  let mechBladeA = 0
  unregisters.push(timeSystem.register(mechBlade, {
    onUpdate(scaledDelta) {
      mechBladeA += scaledDelta * 6.4
      mechBlade.rotation.z = mechBladeA
    },
    getSnapshot: () => ({ mechBladeA }),
    restoreSnapshot: (s) => {
      mechBladeA = s.mechBladeA
      mechBlade.rotation.z = mechBladeA
    }
  }))

  const { hatchCover, ladder } = env.parts.mechanical
  let hatchBroken = false
  let hatchOpen = 1

  // Start the hatch visually open. It slams shut as the player approaches;
  // Rewind restores the earlier open state from the time-system snapshot buffer.
  hatchCover.position.x = -1.15
  unregisters.push(timeSystem.register(hatchCover, {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale > 0 && hatchBroken) hatchOpen = Math.max(0, hatchOpen - scaledDelta * 2.8)
      hatchCover.position.x = -1.15 * hatchOpen
    },
    getSnapshot: () => ({ hatchBroken, hatchOpen }),
    restoreSnapshot: (s) => {
      hatchBroken = s.hatchBroken
      hatchOpen = s.hatchOpen
      hatchCover.position.x = -1.15 * hatchOpen
    }
  }))

  unregisters.push(interaction.register(ladder, {
    prompt: 'Climb to the carriage roof',
    onInteract: () => {
      if (hatchOpen < 0.65) {
        interaction.flashPrompt('The hatch motor failed shut — REWIND it to the open state.')
        return
      }
      enterRoof()
    }
  }))

  // --------------------------------------------------------------------------
  // ROOF — SLOW
  // Always move toward +Z. Additional roof obstacles make the exterior leg feel
  // like a real set piece instead of a straight corridor.
  // --------------------------------------------------------------------------
  let gustPhase = 0
  let sweptTime = 0

  const roofArc = makeRotor(0x7dd3fc, 0.65)
  roofArc.scale.set(1.1, 1.1, 1.1)
  roofArc.position.set(0, CARRIAGE_ROOF_Y + 1.0, (roof.zStart + roof.zEnd) / 2)
  roof.group.add(roofArc)

  let roofArcT = 0
  unregisters.push(timeSystem.register(roofArc, {
    onUpdate(scaledDelta) {
      roofArcT += scaledDelta
      roofArc.rotation.z = roofArcT * 4.8
    },
    getSnapshot: () => ({ roofArcT }),
    restoreSnapshot: (s) => {
      roofArcT = s.roofArcT
      roofArc.rotation.z = roofArcT * 4.8
    }
  }))

  const lowSignal = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.16, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.75, roughness: 0.4 })
  )
  lowSignal.position.set(0, CARRIAGE_ROOF_Y + 1.35, roof.zEnd - 3.0)
  roof.group.add(lowSignal)

  function enterRoof() {
    section = 'roof'
    setBounds(env.roofBounds)
    useObstacles([])

    // The roof starts over Mechanical and ends over the forward Vault car.
    const start = new THREE.Vector3(0, CARRIAGE_ROOF_Y, roof.zStart + 0.8)
    player.setPose(start, 0)
    respawn.setCheckpoint(start, 0)
    camera.snap()

    gustPhase = 0
    sweptTime = 0
    hud.setObjective('Cross the roof toward the Vault — keep moving FORWARD')
    hud.showToast('Roof traversal — use SLOW to survive the slipstream and arc timing.', 3400)
  }

  unregisters.push(interaction.register(roof.dropHatch, {
    prompt: 'Drop into the forward Vault car',
    onInteract: () => enterVault()
  }))

  // --------------------------------------------------------------------------
  // VAULT — GHOST + full-kit final puzzle
  // Sequence: unlock Ghost -> Ghost gate -> Slow lattice -> Rewind bridge ->
  // Freeze cage -> steal Core.
  // --------------------------------------------------------------------------
  const ghostPickup =
    makeChronoPickup(0x2dd4bf, 0.52)
  powerPickups.push(ghostPickup)
  const ghostModule = ghostPickup.group
  ghostModule.name = 'ghost-module'
  addProp(ghostModule, spans.vault.minZ + 3.0, 0)

  let ghostTaken = false
  unregisters.push(interaction.register(ghostModule, {
    prompt: 'Install Echo Synchronizer',
    onInteract: () => {
      if (ghostTaken) return
      if (!abilityState.REWIND) {
        interaction.flashPrompt('The Chrono Interface is not fully calibrated.')
        return
      }
      ghostTaken = true
      ghostPickup.collect()
      unlockAbility('GHOST', 'ECHO SYNCHRONIZER INSTALLED — TIME GHOST unlocked')
      hud.setObjective('Breach the Vault — use every Chrono ability you have learned')
    }
  }))

  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.3
  })
  const vaultPlatePos = new THREE.Vector3(0, 0.03, spans.vault.minZ + 4.0)
  const vaultPlate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), plateMat)
  vaultPlate.position.copy(vaultPlatePos)
  root.add(vaultPlate)

  const ghostGateZ = spans.vault.minZ + 6.0
  const ghostGate = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 1.65, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x2f3742, metalness: 0.9, roughness: 0.35 })
  )
  addProp(ghostGate, ghostGateZ, 0, 1.05)
  let ghostGateOpen = 0

  const vaultLattice = makeRotor(0x38bdf8, 1.0)
  const vaultLatticeZ = spans.vault.center - 0.4
  addProp(vaultLattice, vaultLatticeZ, 0, 1.45)
  let latticeA = 0
  unregisters.push(timeSystem.register(vaultLattice, {
    onUpdate(scaledDelta) {
      latticeA += scaledDelta * 5.4
      vaultLattice.rotation.z = latticeA
    },
    getSnapshot: () => ({ latticeA }),
    restoreSnapshot: (s) => {
      latticeA = s.latticeA
      vaultLattice.rotation.z = latticeA
    }
  }))

  const vaultBridgeZ = spans.vault.center + 2.2
  const vaultBridge = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.12, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x626871, metalness: 0.72, roughness: 0.62 })
  )
  let vaultBridgeY = 0.06
  let vaultBridgeTriggered = false
  let vaultBridgeCollapse = false
  let vaultBridgeFuse = 0.65
  vaultBridge.position.set(0, vaultBridgeY, vaultBridgeZ)
  root.add(vaultBridge)

  const vaultPit = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 3.2, 2.35),
    new THREE.MeshStandardMaterial({ color: 0x020308, roughness: 1 })
  )
  vaultPit.position.set(0, -1.6, vaultBridgeZ)
  vaultPit.userData.noCameraCollision = true
  root.add(vaultPit)

  unregisters.push(timeSystem.register(vaultBridge, {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale > 0) {
        if (vaultBridgeCollapse) vaultBridgeY = Math.max(-3.0, vaultBridgeY - scaledDelta * 4.5)
        else if (vaultBridgeTriggered) {
          vaultBridgeFuse -= scaledDelta
          if (vaultBridgeFuse <= 0) vaultBridgeCollapse = true
        }
      }
      vaultBridge.position.y = vaultBridgeY
    },
    getSnapshot: () => ({ vaultBridgeY, vaultBridgeTriggered, vaultBridgeCollapse, vaultBridgeFuse }),
    restoreSnapshot: (s) => {
      vaultBridgeY = s.vaultBridgeY
      vaultBridgeTriggered = s.vaultBridgeTriggered
      vaultBridgeCollapse = s.vaultBridgeCollapse
      vaultBridgeFuse = s.vaultBridgeFuse
      vaultBridge.position.y = vaultBridgeY
    }
  }))

  const barMat = new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.9, roughness: 0.3 })
  const cage = new THREE.Group()
  cage.name = 'chrono-core-cage'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), barMat)
    bar.position.set(Math.cos(a) * 0.7, 1.1, Math.sin(a) * 0.7)
    cage.add(bar)
  }

  const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 28), barMat)
  capRing.rotation.x = Math.PI / 2
  capRing.position.y = 2.2
  cage.add(capRing)

  const lockRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.07, 10, 32),
    new THREE.MeshStandardMaterial({
      color: 0xb08d3f,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x3a2a08,
      emissiveIntensity: 1
    })
  )
  lockRing.rotation.x = Math.PI / 2
  lockRing.position.y = 1.08
  cage.add(lockRing)

  const coreZ = spans.vault.maxZ - 2.6
  addProp(cage, coreZ)

  let lockA = 0
  unregisters.push(timeSystem.register(lockRing, {
    onUpdate(scaledDelta) {
      lockA += scaledDelta * 3.4
      lockRing.rotation.z = lockA
    },
    getSnapshot: () => ({ lockA }),
    restoreSnapshot: (s) => {
      lockA = s.lockA
      lockRing.rotation.z = lockA
    }
  }))

  const core = createChronoCore()
  addProp(core, coreZ)

  let breached = false
  let taken = false
  let destabT = 0

  const unregisterCage = interaction.register(cage, {
    prompt: 'Breach the Chrono Core cage',
    onInteract: () => {
      if (!ghostTaken) {
        interaction.flashPrompt('Complete the Vault synchronisation first.')
        return
      }
      if (timeSystem.getMode() !== 'FREEZE') {
        interaction.flashPrompt('The lock ring is spinning — FREEZE it, then breach the cage.')
        return
      }
      breached = true
      cage.visible = false
      unregisterCage()
      hud.showToast('Cage breached — take the Chrono Core!', 2600)
    }
  })
  unregisters.push(unregisterCage)

  unregisters.push(interaction.register(core, {
    prompt: 'STEAL CHRONO CORE',
    onInteract: () => {
      if (taken) return
      if (!breached) {
        interaction.flashPrompt('Breach the cage first.')
        return
      }
      taken = true
      interaction.flashPrompt('Chrono Core secured!')
      hud.setObjective('TEMPORAL CONTAINMENT LOST — the train is destabilising')
    }
  }))

  function enterVault() {
    section = 'vault'
    setBounds(env.vaultBounds)
    useObstacles(vaultObstacles)

    const p = new THREE.Vector3(0, 0, spans.vault.minZ + 1.1)
    player.setPose(p, 0)
    respawn.setCheckpoint(p, 0)
    camera.snap()

    hud.setObjective('Vault approach — synchronise the final Echo module')
    hud.showToast('Inside the Vault car — the Chrono Core is ahead.', 3000)
  }

  // Decorative side blockers in the Vault force a final weave without blocking
  // the central puzzle interactions.
  addStaticBarrier({
    z: spans.vault.center - 2.7,
    x: 0.35,
    width: 0.62,
    depth: 0.9,
    color: 0x2f3742,
    target: vaultObstacles
  })
  addStaticBarrier({
    z: spans.vault.center + 0.8,
    x: -0.35,
    width: 0.62,
    depth: 0.9,
    color: 0x2f3742,
    target: vaultObstacles
  })

  // Initial section setup.
  setBounds(env.interiorBounds)
  useObstacles(corridorObstacles)

  const orb = core.getObjectByName('chrono-core-orb')
  const halo = core.getObjectByName('chrono-core-halo')
  let elapsed = 0

  return {
    objective: 'Move toward the FRONT of the train — reach Security and acquire the glowing blue Chrono Interface.',
    checkpoint: { position: new THREE.Vector3(0, 0, spans.passenger.minZ + 2.2), yaw: 0 },
    bounds,
    obstacles: activeObstacles,

    update(delta) {
      outdoorEnv.update(delta)
      env.update(delta)
      passengerStealth.update(delta)
      elapsed += delta
      // Draw the player's eye toward the Chrono Interface until collected.
      for (const pickup of powerPickups) {
        pickup.update(delta)
      }
      if (!interfaceTaken) {
        interfaceMarker.rotation.y +=
          delta * 2.4

        interfaceMarker.position.y =
          2.35 +
          Math.sin(elapsed * 4.0) * 0.12

        interfaceRing.rotation.z +=
          delta * 0.8

        interfaceRingMat.opacity =
          0.55 +
          Math.sin(elapsed * 5.0) * 0.2

        interfaceLight.intensity =
          16 +
          Math.sin(elapsed * 4.0) * 5
      }
      failCooldown = Math.max(0, failCooldown - delta)

      const pp = player.mesh.position
      const mode = timeSystem.getMode()

      // Chrono Relay exit gate.
      relayGateOpen +=
        ((relaySolved ? 1 : 0) - relayGateOpen) *
        Math.min(1, delta * 5)

      relayGate.position.y =
        1.05 + relayGateOpen * 2.2

      // Prevent walking through the closed gate.
      if (
        !relaySolved &&
        pp.z > relayGateZ - 0.48 &&
        pp.z < spans.relay.maxZ
      ) {
        pp.z = relayGateZ - 0.48
      }

      // Core idle animation and shader reaction.
      orb.rotation.y += delta * 0.7
      orb.rotation.x += delta * 0.3
      orb.position.y = 1.34 + Math.sin(elapsed * 1.6) * 0.05
      halo.rotation.z += delta * 1.1
      halo.position.y = orb.position.y
      for (const m of core.userData.shaderMats) {
        if (!m.customUniforms) continue
        m.customUniforms.uTime.value += delta
        m.customUniforms.uMode.value = MODE_INT[mode] ?? 0
        m.customUniforms.uIntensity.value = mode === 'NORMAL' ? 0.25 : 0.9
      }

      // Removing the Core is the Level 2 ending, not the emergency brake.
      if (taken) {
        destabT += delta
        root.rotation.z = Math.sin(destabT * 7) * 0.012 * Math.min(2, destabT)
        root.position.y = Math.sin(destabT * 11) * 0.012 * Math.min(1, destabT)
        if (destabT > 2.6) {
          taken = false
          root.rotation.z = 0
          root.position.y = 0
          advance()
        }
        return
      }

      if (section === 'interior') {
        hint(
          'passenger',
          pp.z,
          spans.passenger.minZ + 2,
          'Passenger car — stay out of sight. Move between luggage and service carts when the guard turns away.'
        )
        hint(
          'security',
          pp.z,
          spans.security.minZ,
          'Security car — find the glowing BLUE CHRONO INTERFACE and interact with it before continuing.'        
        )
        hint(
          'relay',
          pp.z,
          spans.relay.minZ,
          'Chrono Relay — match the three terminal colours to the pattern above the locked bulkhead.'
        )
        hint(
          'cargo',
          pp.z,
          spans.cargo.minZ,
          'Cargo car — install the next phase module, then FREEZE moving loads when the aisle is clear.'
        )
        hint(
          'mechanical',
          pp.z,
          spans.mechanical.minZ,
          'Mechanical car — install Rollback, then REWIND failing machinery to its earlier state.'
        )

        for (const z of corridorCheckpoints) {
          if (pp.z > z && z > lastCheckpointZ) {
            lastCheckpointZ = z
            respawn.setCheckpoint(new THREE.Vector3(0, 0, z), 0)
          }
        }

        // Security obstacle 1:
        // Narrow scanner sweeps LEFT <-> RIGHT across the doorway.
        // SLOW makes the sweep much easier to read, while the player
        // remains at normal movement speed.
        const beamWorldX =
          scanner.position.x +
          scanBeam.position.x

        if (
          Math.abs(pp.z - scannerZ) < 0.58 &&
          Math.abs(pp.x - beamWorldX) < 0.22
        ) {
          failSoft(
            'The security scanner caught you — SLOW it and cross on the opposite side.'
          )
        }

        // Security obstacle 2: rotating energy bar. Normal speed is punishing;
        // Slow creates a broad safe timing window.
        if (
          Math.abs(pp.z - secRotorZ) < 0.55 &&
          mode === 'NORMAL' &&
          abilityState.SLOW
        ) {
          failSoft('The security rotor caught you — slow the mechanism.')
        }

        // Security obstacle 3: vertical shutter. Slow extends the open phase.
        if (Math.abs(pp.z - secShutterZ) < 0.32 && shutterOpen < 0.62) {
          failSoft('The security shutter slammed shut.')
        }

        // Cargo obstacle 1: crane crate. Freeze it only after it clears your side.
        if (
          Math.abs(pp.z - craneZ) < 0.58 &&
          Math.abs(pp.x - crane.position.x) < 0.58
        ) {
          failSoft('The swinging cargo crate hit you — FREEZE it when the aisle is clear.')
        }

        // Cargo obstacle 2: pallet sweeper.
        if (
          Math.abs(pp.z - palletZ) < 0.68 &&
          Math.abs(pp.x - pallet.position.x) < 0.55
        ) {
          failSoft('The powered pallet swept you off your line.')
        }

        // Cargo obstacle 3: crusher. Freeze while high, then pass underneath.
        if (Math.abs(pp.z - cargoCrusherZ) < 0.48 && crusherOpen < 0.64) {
          failSoft('The cargo press came down — FREEZE it at the top of its cycle.')
        }

        // Mechanical obstacle 1: collapsing bridge. Rewind restores snapshots.
        if (!bridgeTriggered && pp.z > bridgeZ - 3.0) bridgeTriggered = true
        if (
          Math.abs(pp.z - bridgeZ) < 1.05 &&
          Math.abs(pp.x) < 0.74 &&
          bridgeY < -0.42
        ) {
          failSoft('The mechanical bridge collapsed — REWIND it!', 'fell')
        }

        // Mechanical obstacle 2: slam gate. Approaching it creates a "before"
        // state in the snapshot history for Rewind to restore.
        if (!slamTriggered && pp.z > slamGateZ - 2.6) slamTriggered = true
        if (Math.abs(pp.z - slamGateZ) < 0.35 && slamGateY < 1.75) {
          failSoft('The bulkhead slammed shut — REWIND the gate.')
        }

        // Extra Mechanical timing obstacle.
        if (
          Math.abs(pp.z - mechBladeZ) < 0.62 &&
          mode === 'NORMAL'
        ) {
          failSoft('The turbine blade clipped you!')
        }

        // Mechanical obstacle 3: the hatch motor fails shut near the ladder.
        if (!hatchBroken && pp.z > spans.mechanical.maxZ - 4.0) hatchBroken = true
      } else if (section === 'roof') {
        // Slipstream. Slow affects the gust cycle AND the other registered roof
        // hazards because all of them use scaledDelta.
        const slowed = mode === 'SLOW'
        gustPhase += delta * (slowed ? 0.16 : 1)
        const raw = Math.sin(gustPhase * 1.7)
        const gust = Math.pow(Math.max(0, raw), 0.6) * (slowed ? 0.24 : 1)

        pp.x += gust * 2.35 * delta
        roof.streaks.forEach((s) => {
          s.material.opacity = 0.05 + gust * 0.5
        })

        if (gust > 0.45) {
          sweptTime += delta * gust * (1 + Math.max(0, Math.abs(pp.x) - 0.55))
        } else {
          sweptTime = Math.max(0, sweptTime - delta * 1.7)
        }

        if (sweptTime > 1.5) {
          sweptTime = 0
          respawn.fail('fell')
          hud.showToast('Blown off the roof!', 1800)
        }

        const roofArcZ = roofArc.position.z
        if (
          Math.abs(pp.z - roofArcZ) < 0.58 &&
          mode === 'NORMAL'
        ) {
          failSoft('The roof arc caught you — SLOW the timing.')
        }

        // A low signal arm forces a final crouch before the Vault drop hatch.
        if (
          Math.abs(pp.z - lowSignal.position.z) < 0.38 &&
          !player.isCrouching?.()
        ) {
          failSoft('Duck under the roof signal frame!')
        }
      } else if (section === 'vault') {
        const ghost = timeSystem.getGhost()
        const ghostOnPlate = ghost.isOccupying(vaultPlatePos, 0.64)
        const playerOnPlate =
          Math.abs(pp.z - vaultPlatePos.z) < 0.58 &&
          Math.abs(pp.x - vaultPlatePos.x) < 0.58

        const pressed = ghostOnPlate || playerOnPlate
        ghostGateOpen += ((pressed ? 1 : 0) - ghostGateOpen) * Math.min(1, delta * 5)
        ghostGate.position.y = 1.05 + ghostGateOpen * 2.0
        plateMat.emissive.setHex(pressed ? 0x10b981 : 0xf59e0b)
        vaultPlate.position.y = pressed ? 0.012 : 0.03

        // The gate has no latch: standing on the plate yourself cannot get you
        // through. A replaying Ghost must hold it while you move forward.
        if (Math.abs(pp.z - ghostGateZ) < 0.32 && ghostGateOpen < 0.72) {
          failSoft('The Vault gate needs the pressure plate held — use TIME GHOST.')
        }

        if (
          Math.abs(pp.z - vaultLatticeZ) < 0.62 &&
          mode === 'NORMAL'
        ) {
          failSoft('The temporal lattice is too fast — use SLOW.')
        }

        if (!vaultBridgeTriggered && pp.z > vaultBridgeZ - 2.5) vaultBridgeTriggered = true
        if (
          Math.abs(pp.z - vaultBridgeZ) < 0.95 &&
          Math.abs(pp.x) < 0.72 &&
          vaultBridgeY < -0.42
        ) {
          failSoft('The Vault bridge collapsed — REWIND it!', 'fell')
        }
      }
    },

    dispose() {
      unregisters.forEach((fn) => fn())
      outdoorEnv.dispose()
      passengerStealth.dispose()
      scene.remove(outdoorEnv.group, root)
      disposeObject(root)
    }
  }
}

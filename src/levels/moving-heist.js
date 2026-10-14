import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import {
  createCarriageEnvironment,
  CARRIAGE_CEILING_Y,
  CARRIAGE_ROOF_Y,
  VAULT_DAIS_TOP,
  listCarriageVolumes,
  makeHourglassEmblem
} from '../environment/carriages.js'
import { createLightPool } from '../core/light-pool.js'
import { createCarriageCulling } from '../environment/carriage-culling.js'
import {
  WALL_X,
  DOOR_W,
  HAZARD_AISLE_X,
  RELAY_BOX_DEPTH,
  RELAY_BOX_WIDTH,
  CARGO_PIT,
  MECH_PITS,
  CONV_PITS,
  ROOF_RUN,
  routeControlLayout
} from '../environment/carriage-bounds.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createSkyDome } from '../environment/sky-dome.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { createStealthSystem } from '../systems/stealth.js'
import { signMaterial } from '../environment/textures.js'

// Level 2 — "The Moving Heist".
//
// Physical progression is deliberately one-way: REAR -> FRONT.
// Passenger -> Security -> Relay -> Cargo -> Mechanical -> Convergence -> Roof -> Vault.
// The roof run crosses an open freight wagon between Convergence and the Vault.
//
// Ability progression is equally deliberate:
// Passenger  : no powers; reuse Level 1 timing/stealth instincts.
// Security   : acquire the Chrono Interface -> unlock SLOW.
// Relay      : acquire the Echo Synchronizer -> unlock GHOST, and immediately
//              need it: the route board only turns while the operator
//              platform is weighted, and the platform is nowhere near it.
// Cargo      : acquire the Cryo Phase module -> unlock FREEZE, which also
//              switches on Chrono Strain while the player crosses moving loads.
// Mechanical : acquire the Rollback module -> unlock REWIND, then cross a car
//              of one-shot machinery that springs shut as you approach.
// Convergence: the last car before the Core. Each ability once on its own —
//              a Slow gate, a Freeze crate, a Rewind platform, Ghost-held
//              switches — then all four in a row to reach the roof ladder.
// Vault      : the exposed Chrono Core, with a clear approach.
//
// GHOST is deliberately granted before FREEZE. It used to be the last pickup,
// which left it with exactly one use in the whole level.
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

  // Armillary rings: the brass cradle the Core turns inside.
  for (const [name, radius] of [['chrono-core-ring-a', 0.5], ['chrono-core-ring-b', 0.58]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 40), brass)
    ring.name = name
    ring.position.y = 1.34
    core.add(ring)
  }

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

    setCollected(collected) {
      beacon.visible = !collected
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

export function createMovingHeistLevel({
  scene, interaction, timeSystem, hud, player, camera, respawn, advance, beginCinematic,
  assets = null,
  startAt = null
}) {

  const powerPickups = []
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.0)
  if (timeSystem?.setMode) timeSystem.setMode('NORMAL')

  // Level 2 starts exactly where the story says it should: no powers yet.
  const abilityState = { SLOW: false, FREEZE: false, REWIND: false, GHOST: false }
  timeSystem?.setAbilityAvailability?.(abilityState)
  hud?.setChronoVisible?.(false)

  const env = createCarriageEnvironment()
  const sky = createSkyDome('moving-heist')
  const outdoorEnv = createOutdoorEnvironment({
    mode: 'moving',
    speed: 38.0,
    fogColor: sky.horizonColor
  })
  const { root, spans, roof } = env

  scene.add(sky.mesh, outdoorEnv.group, root)
  // Night sky. Fog matches the horizon so the hills don't drop to black
  // under the moon. The dome itself is unfogged, so the stars stay visible.
  // The clear stays dark so the minimap inset does not fill with the sky.
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = new THREE.Fog(sky.horizonColor, 30, 250)
  scene.fog.color = sky.horizonColor

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

  const unregisters = [] // interaction + time-system unregister callbacks
  const checkpointHazards = []
  function registerHazard(object, options) {
    checkpointHazards.push(options)
    return timeSystem.register(object, options)
  }
  unregisters.push(interaction.registerBlocker(root))
  const bounds = { ...env.interiorBounds } // mutated on section transitions

  // The level manager exposes one obstacle array to player.js. Keep the array
  // identity stable and swap its contents when changing interior/roof/vault.
  const activeObstacles = []
  const corridorObstacles = [...env.colliders]
  // One stealth system for the whole interior run, not just the Passenger car:
  // Passenger has the conductor and Cargo gets a laser grid. Passing
  // timeSystem makes the guard obey Slow and Freeze; assets lets the guards
  // pick up the police FBX model if it is still loading when the level builds.
  const corridorStealth =
    createStealthSystem({
      scene,
      player,
      respawn,
      hud,
      collidables: guardCollidables,
      obstacles: corridorObstacles,
      timeSystem,
      assets
    })

  // Standing / crouched body height used by the rotor hazards. Ducking really
  // does slip you under an arm that would have clipped you upright.
  const PLAYER_STAND_TOP = 1.72
  const PLAYER_CROUCH_TOP = 1.04
  function playerTopY() {
    return player?.isCrouching?.() ? PLAYER_CROUCH_TOP : PLAYER_STAND_TOP
  }

  function playerOnPad(center, halfSize) {
    const position = player.mesh.position
    return Math.abs(position.y - center.y) < 0.25 &&
      Math.abs(position.x - center.x) < halfSize &&
      Math.abs(position.z - center.z) < halfSize
  }

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

  // Hazard chokepoints. The cars are wide now, but every hazard was tuned for
  // the old ±HAZARD_AISLE_X lane, so a floor-to-ceiling housing on each side
  // narrows the car back down to that lane wherever one sits. `lane` widens it
  // for a hazard whose moving part swings further out. Drop a hazard's entry
  // from the list below once it has been reworked for the full width.
  const chokeMat = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.72, metalness: 0.2 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.9 })
  const emblemMat = new THREE.MeshStandardMaterial({
    color: 0xb08d3f, emissive: 0x3a2608, emissiveIntensity: 0.4, roughness: 0.32, metalness: 0.9
  })
  // Brass picture-frame border on a flat face `w` wide and `h` tall, centred
  // at (x, h/2, z). Built along X, so it suits the pillars' end faces.
  function addBrassFrame(x, z, w, h, inset = 0.07) {
    const t = 0.04
    for (const [bw, bh, bx, by] of [
      [t, h - inset * 2, -(w / 2 - inset), h / 2],
      [t, h - inset * 2, w / 2 - inset, h / 2],
      [w - inset * 2, t, 0, inset],
      [w - inset * 2, t, 0, h - inset]
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), brassMat)
      bar.position.set(x + bx, by, z)
      bar.userData.noCameraCollision = true
      root.add(bar)
    }
  }
  function addChokepoint(z, depth, lane = HAZARD_AISLE_X) {
    const face = lane + 0.2 // pad matching the carriage colliders
    const width = WALL_X - face
    for (const s of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(width, CARRIAGE_CEILING_Y, depth), chokeMat)
      housing.position.set(s * (face + width / 2), CARRIAGE_CEILING_Y / 2, z)
      housing.castShadow = true
      housing.receiveShadow = true
      root.add(housing)
      guardCollidables.push(housing)
      // Brass-framed end faces with the hourglass crest, and a brass edge
      // running up the aisle-side corners.
      for (const e of [-1, 1]) {
        const endZ = z + e * (depth / 2 + 0.015)
        addBrassFrame(s * (face + width / 2), endZ, width, CARRIAGE_CEILING_Y)
        const emblem = makeHourglassEmblem(emblemMat, 0.62)
        emblem.position.set(s * (face + width / 2), 1.75, endZ + e * 0.02)
        if (e < 0) emblem.rotation.y = Math.PI
        root.add(emblem)
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, CARRIAGE_CEILING_Y, 0.05), brassMat)
        edge.position.set(s * face, CARRIAGE_CEILING_Y / 2, z + e * (depth / 2))
        edge.userData.noCameraCollision = true
        root.add(edge)
      }
      corridorObstacles.push({
        minX: s < 0 ? -WALL_X : lane,
        maxX: s < 0 ? -lane : WALL_X,
        minZ: z - depth / 2 - 0.2,
        maxZ: z + depth / 2 + 0.2
      })
    }
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

  // Retreating behind a hazard re-seats it for another attempt, even without
  // energy. A completed rollback repairs it permanently for this level run;
  // its failure history survives idle time while the player recharges.
  const REARM_DELAY = 1.2
  const rearmTimers = { hatch: 0 }
  function readyToRearm(key, retreated, delta) {
    if (!retreated) {
      rearmTimers[key] = 0
      return false
    }
    rearmTimers[key] += delta
    if (rearmTimers[key] >= REARM_DELAY) {
      rearmTimers[key] = 0
      return true
    }
    return false
  }

  let failCooldown = 0

  function failSoft(message, reason = 'caught') {
    if (failCooldown > 0) return

    failCooldown = 1.2
    respawn.fail(reason)

    if (message) hud.showToast(message, 1800)
  }

  let section = 'interior' // interior | roof | vault

  // Per-carriage briefings.
  //
  // House rule for everything in here: state the GOAL and the CONSTRAINT, never
  // the solution. "The pad is a long way from the gate" is a goal. "Use the
  // Time Ghost on the pad" is a walkthrough, and the room stops being a puzzle.
  const hintsShown = new Set()
  function hint(key, playerZ, enterZ, lines) {
    if (hintsShown.has(key) || playerZ < enterZ) return

    hintsShown.add(key)
    hud.showBriefing?.(lines)
  }

  let introShown = false

  // Rolling corridor checkpoints; the player always progresses toward +Z.
  let lastCheckpointZ = spans.passenger.minZ + 2.2
  const corridorCheckpoints = [
    spans.security.minZ + 1.0,
    spans.relay.minZ + 1.0,
    spans.cargo.minZ + 1.0,
    spans.cargo.center - 0.8,
    spans.cargo.center + 3.6,
    spans.cargo.center + 6.6,
    spans.mechanical.minZ + 1.0,
    spans.mechanical.center - 7.4,
    spans.mechanical.center + 1.4,
    spans.mechanical.center + 5.3,
    spans.convergence.minZ + 1.0,
    spans.convergence.center - 10.0,
    spans.convergence.center - 4.6,
    spans.convergence.center + 4.8,
    spans.convergence.center + 13.8
  ]

  // --------------------------------------------------------------------------
  // PASSENGER — STEALTH / COVER
  // No Chrono powers yet, and nothing in the car but the conductor. The booths
  // down both sides (built and collided in carriages.js) are the cover: crouch
  // between a booth's benches and the seat backs break his line of sight.
  //
  // The guard used to start at minZ + 3.4, which is 1.2 m from the player's
  // spawn at minZ + 2.2 — inside GUARD_LOCK_ON_DISTANCE. He hard-locked on
  // before the player could take a step, which read as being caught for no
  // reason.
  // --------------------------------------------------------------------------

  // The conductor walks the aisle from mid-car to the front door and back,
  // pausing at each end. His rear turnaround is 7.6 m from the spawn — just
  // outside GUARD_VISION_DISTANCE — so the player always gets to read his
  // route before he can see them. He starts walking away from them.
  corridorStealth.addGuard({
    waypoints: [
      new THREE.Vector3(0, 0, spans.passenger.minZ + 9.8),
      new THREE.Vector3(0, 0, spans.passenger.maxZ - 1.8)
    ],
    speed: 1.15,
    waitTime: 2.6,
    initialWaypoint: 0
  })


  // --------------------------------------------------------------------------
  // SECURITY — CHRONO INTERFACE + SLOW
  // Two hazards after the pickup: sliding panel, steam vents.
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

  // A navy carriage panel in a brass frame, carrying the hourglass crest, rides
  // a brass ceiling track across the aisle. It blocks the lane only where it is.
  const scanner = new THREE.Group()
  const SCAN_PANEL_W = 0.5
  const SCAN_PANEL_H = 2.75
  const scanBeam = new THREE.Group()
  const panelBody = new THREE.Mesh(
    new THREE.BoxGeometry(SCAN_PANEL_W, SCAN_PANEL_H, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x1f2a44, metalness: 0.2, roughness: 0.72 })
  )
  panelBody.castShadow = true
  scanBeam.add(panelBody)
  for (const e of [-1, 1]) {
    for (const [bw, bh, bx, by] of [
      [0.035, SCAN_PANEL_H - 0.08, -(SCAN_PANEL_W / 2 - 0.04), 0],
      [0.035, SCAN_PANEL_H - 0.08, SCAN_PANEL_W / 2 - 0.04, 0],
      [SCAN_PANEL_W - 0.08, 0.035, 0, SCAN_PANEL_H / 2 - 0.04],
      [SCAN_PANEL_W - 0.08, 0.035, 0, -(SCAN_PANEL_H / 2 - 0.04)]
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), brassMat)
      bar.position.set(bx, by, e * 0.066)
      scanBeam.add(bar)
    }
    const crest = makeHourglassEmblem(emblemMat, 0.42)
    crest.position.set(0, 0.35, e * 0.07)
    if (e < 0) crest.rotation.y = Math.PI
    scanBeam.add(crest)
  }
  scanBeam.position.y = SCAN_PANEL_H / 2 + 0.02
  scanner.add(scanBeam)

  const scanRange = 0.62
  const scanRail = new THREE.Mesh(new THREE.BoxGeometry(scanRange * 2 + 0.8, 0.08, 0.16), brassMat)
  scanRail.position.y = CARRIAGE_CEILING_Y - 0.14
  scanner.add(scanRail)

  const scannerZ = spans.security.center - 1.2
  addProp(scanner, scannerZ)

  let scanT = 0
  unregisters.push(registerHazard(scanner, {
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

  // Steam vents. Two banks of brass nozzles, set into the chokepoint pillars,
  // fire across the aisle in turn. Each hisses a thin warning plume before a
  // full burst, and the pocket between the banks is safe to wait in. They run
  // on chrono time, so SLOW stretches the gaps between bursts.
  const STEAM_PERIOD = 3.2
  const STEAM_BURST = 1.1
  const STEAM_WARN = 0.6
  const STEAM_PUFFS = 10
  const STEAM_NOZZLE_X = HAZARD_AISLE_X + 0.2
  const STEAM_HEIGHTS = [0.6, 1.4]
  const steamBanks = [
    { z: spans.security.maxZ - 4.4, offset: 0 },
    { z: spans.security.maxZ - 2.2, offset: STEAM_PERIOD / 2 }
  ]
  const ventIron = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.55, metalness: 0.8 })
  const flangeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20)
  flangeGeo.rotateZ(Math.PI / 2)
  const nozzleGeo = new THREE.CylinderGeometry(0.065, 0.085, 0.24, 14)
  nozzleGeo.rotateZ(Math.PI / 2)
  const puffGeo = new THREE.IcosahedronGeometry(1, 1)
  const steamGroup = new THREE.Group()
  steamGroup.name = 'security-steam-vents'
  for (const bank of steamBanks) {
    for (const s of [-1, 1]) {
      for (const y of STEAM_HEIGHTS) {
        const flange = new THREE.Mesh(flangeGeo, brassMat)
        flange.position.set(s * (STEAM_NOZZLE_X - 0.03), y, bank.z)
        steamGroup.add(flange)
        const nozzle = new THREE.Mesh(nozzleGeo, ventIron)
        nozzle.position.set(s * (STEAM_NOZZLE_X - 0.15), y, bank.z)
        steamGroup.add(nozzle)
      }
    }
    bank.mat = new THREE.MeshLambertMaterial({
      color: 0xe9e4da, transparent: true, opacity: 0, depthWrite: false
    })
    bank.puffs = new THREE.InstancedMesh(puffGeo, bank.mat, 2 * STEAM_HEIGHTS.length * STEAM_PUFFS)
    bank.puffs.userData.noCameraCollision = true
    bank.puffs.raycast = () => {} // steam never blocks interaction or vision rays
    bank.puffs.frustumCulled = false
    bank.density = 0
    steamGroup.add(bank.puffs)
  }
  root.add(steamGroup)

  const steamDummy = new THREE.Object3D()
  let steamT = 0
  // 0 = clear, ~0.2 = warning plume, 1 = full burst.
  function steamDensity(phase) {
    if (phase < STEAM_BURST) return Math.min(1, phase / 0.12, (STEAM_BURST - phase) / 0.25 + 0.3)
    if (phase > STEAM_PERIOD - STEAM_WARN) return 0.2
    return 0
  }
  function applySteam() {
    for (const bank of steamBanks) {
      const phase = (steamT + bank.offset) % STEAM_PERIOD
      bank.density = steamDensity(phase)
      bank.puffs.visible = bank.density > 0
      if (!bank.puffs.visible) continue
      bank.mat.opacity = 0.25 + 0.45 * bank.density
      const reach = 0.25 + 0.75 * bank.density
      let i = 0
      for (const s of [-1, 1]) {
        for (const y of STEAM_HEIGHTS) {
          for (let k = 0; k < STEAM_PUFFS; k++) {
            const u = (k / STEAM_PUFFS + steamT * 1.8) % 1
            steamDummy.position.set(
              s * (STEAM_NOZZLE_X - 0.25 - u * reach),
              y + u * 0.3 * bank.density,
              bank.z + Math.sin(k * 1.7 + steamT * 3) * 0.14 * u
            )
            steamDummy.scale.setScalar((0.08 + u * 0.34) * (0.4 + 0.6 * bank.density))
            steamDummy.updateMatrix()
            bank.puffs.setMatrixAt(i++, steamDummy.matrix)
          }
        }
      }
      bank.puffs.instanceMatrix.needsUpdate = true
    }
  }
  applySteam()
  unregisters.push(registerHazard(steamGroup, {
    onUpdate(scaledDelta) {
      steamT += scaledDelta
      applySteam()
    },
    getSnapshot: () => ({ steamT }),
    restoreSnapshot: (snap) => {
      steamT = snap.steamT
      applySteam()
    }
  }))

  // --------------------------------------------------------------------------
  // ROUTE CONTROL — ECHO SYNCHRONIZER + ROUTING SEQUENCE
  //
  // Grants GHOST and immediately demands it. The operator platform at the back
  // of the car drives the route system: while it is weighted a lever pulls, the
  // wall gear turns, the relay boxes swing open and the route board over the
  // front door flips its plates to show the routing order. The board is a
  // dozen metres from the platform, so a Time Ghost has to hold the platform
  // while the player reads it up close. Reading it logs the order and latches
  // the relays open; then relays A–D are thrown in the order I–IV and the door
  // slides apart.
  // --------------------------------------------------------------------------
  const ghostPickup =
    makeChronoPickup(0x2dd4bf, 0.52)
  powerPickups.push(ghostPickup)
  const ghostModule = ghostPickup.group
  ghostModule.name = 'ghost-module'
  addProp(ghostModule, spans.relay.minZ + 2.2, 0)

  let ghostTaken = false
  unregisters.push(interaction.register(ghostModule, {
    prompt: 'Install Echo Synchronizer',
    onInteract: () => {
      if (ghostTaken) return
      if (!abilityState.SLOW) {
        interaction.flashPrompt('The Chrono Interface is not linked yet.')
        return
      }
      ghostTaken = true
      ghostPickup.collect()
      unlockAbility('GHOST', 'ECHO SYNCHRONIZER INSTALLED — TIME GHOST unlocked')
      hud.setObjective('Route Control — the route board only turns while the operator platform is held')
    }
  }))

  const routeHalf = (spans.relay.maxZ - spans.relay.minZ) / 2
  const routeLayout = routeControlLayout(routeHalf)
  const routeZ = (localZ) => spans.relay.center + localZ
  const RELAY_COUNT = routeLayout.relays.length
  const ROMAN = ['I', 'II', 'III', 'IV']

  // relaySequence[step] = relay index. Rolled fresh each run so it cannot be
  // memorised between attempts, and never plain A-B-C-D.
  const relaySequence = [0, 1, 2, 3]
  do {
    for (let i = relaySequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[relaySequence[i], relaySequence[j]] = [relaySequence[j], relaySequence[i]]
    }
  } while (relaySequence.every((relay, step) => relay === step))
  const relayStepOf = []
  relaySequence.forEach((relay, step) => { relayStepOf[relay] = step })

  const relayInput = []
  let relayLogged = false
  let relaySolved = false
  let routeEngaged = 0 // eased 0..1 while the operator platform is weighted
  let routeEverEngaged = false
  let routeReadT = 0 // seconds spent reading the turned board up close
  const ROUTE_READ_SECONDS = 1.0
  const ROUTE_READ_RANGE = 4.5

  const oldBrass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.34, metalness: 0.9 })
  const darkIron = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.55, metalness: 0.8 })
  const creamFace = new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.6 })
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x2e1a0c, roughness: 0.7, metalness: 0.05 })

  function plaque(text, width, height, { bg = 0xb99a52, fg = 0x1d140a, px = 512 } = {}) {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      signMaterial({
        text, background: bg, foreground: fg,
        width: px, height: Math.round(px * height / width), emissiveIntensity: 0.25
      })
    )
  }

  function makeGauge(radius = 0.075) {
    const g = new THREE.Group()
    const face = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.02, 20), creamFace)
    face.rotation.x = Math.PI / 2
    g.add(face)
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 20), oldBrass)
    bezel.position.z = 0.01
    g.add(bezel)
    const needle = new THREE.Group()
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.008, radius * 0.85, 0.005), darkIron)
    hand.position.y = radius * 0.42
    needle.add(hand)
    needle.position.z = 0.014
    g.add(needle)
    g.userData.needle = needle
    return g
  }

  // --- Operator platform -----------------------------------------------------
  const opSide = routeLayout.platform.s
  const platformPos = new THREE.Vector3(opSide * (WALL_X - 0.8), 0.03, routeZ(routeLayout.platform.z))
  unregisters.push(timeSystem.registerGhostPad(platformPos, 0.56))

  const platform = new THREE.Group()
  platform.name = 'operator-platform'
  const platformBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 1.15), darkIron)
  platformBase.position.y = 0.04
  platform.add(platformBase)
  const platformPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.04, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x6b6e73, roughness: 0.45, metalness: 0.85 })
  )
  platformPlate.position.y = 0.1
  platform.add(platformPlate)
  // Brass rail on the wall side and both ends; the aisle side stays open.
  const railY = 0.9
  const railPosts = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  for (const [px, pz] of railPosts) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, railY, 8), oldBrass)
    post.position.set(px * 0.55, railY / 2, pz * 0.55)
    platform.add(post)
  }
  for (const pz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 8), oldBrass)
    rail.rotation.z = Math.PI / 2
    rail.position.set(0, railY, pz * 0.55)
    platform.add(rail)
  }
  const backRail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 8), oldBrass)
  backRail.rotation.x = Math.PI / 2
  backRail.position.set(opSide * 0.55, railY, 0)
  platform.add(backRail)
  platform.position.set(platformPos.x, 0, platformPos.z)
  root.add(platform)

  // Engaging lever on a pedestal at the platform's aisle-side corner.
  const leverStand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), darkIron)
  leverStand.position.set(platformPos.x - opSide * 0.72, 0.375, platformPos.z - 0.45)
  root.add(leverStand)
  const platformLever = new THREE.Group()
  const leverArm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), oldBrass)
  leverArm.position.y = 0.25
  const leverKnob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), darkIron)
  leverKnob.position.y = 0.5
  platformLever.add(leverArm, leverKnob)
  platformLever.position.set(leverStand.position.x, 0.78, leverStand.position.z)
  root.add(platformLever)

  // Sign on the wall behind the platform, with a status lamp.
  const signX = opSide * (WALL_X - 0.07)
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, 1.02), woodDark)
  signBack.position.set(opSide * (WALL_X - 0.05), 1.78, platformPos.z)
  root.add(signBack)
  ;[['ROUTE CONTROL', 2.0], ['OPERATOR HOLD', 1.78], ['KEEP ENGAGED', 1.56]].forEach(([text, y]) => {
    const line = plaque(text, 0.9, 0.17)
    line.position.set(signX, y, platformPos.z)
    line.rotation.y = -opSide * Math.PI / 2
    root.add(line)
  })
  const platformLampMat = new THREE.MeshStandardMaterial({
    color: 0xffb454, emissive: 0xff9a2a, emissiveIntensity: 1.2, roughness: 0.3
  })
  const platformLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), platformLampMat)
  platformLamp.position.set(opSide * (WALL_X - 0.12), 2.2, platformPos.z)
  root.add(platformLamp)

  // --- Mechanical system: wall gear across from the platform ----------------
  // Mounted on the wall with local +Z facing the aisle; only gearSpin turns.
  const gearSide = routeLayout.gear.s
  const gearMount = new THREE.Group()
  gearMount.name = 'route-gear'
  gearMount.position.set(gearSide * (WALL_X - 0.12), 1.6, routeZ(routeLayout.gear.z))
  gearMount.rotation.y = -gearSide * Math.PI / 2
  const gearSpin = new THREE.Group()
  gearSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 32), oldBrass))
  const gearHub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16), darkIron)
  gearHub.rotation.x = Math.PI / 2
  gearSpin.add(gearHub)
  for (let k = 0; k < 6; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.03), oldBrass)
    spoke.rotation.z = k * Math.PI / 6
    gearSpin.add(spoke)
  }
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.06), oldBrass)
    tooth.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0)
    tooth.rotation.z = a
    gearSpin.add(tooth)
  }
  gearMount.add(gearSpin)
  const gearGauge = makeGauge(0.1)
  gearGauge.position.set(0, 0.72, 0.02)
  gearMount.add(gearGauge)
  root.add(gearMount)

  // --- Relay boxes A–D --------------------------------------------------------
  const relayGreen = new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.55, metalness: 0.45 })
  const relayBoxes = routeLayout.relays.map((slot, i) => {
    // Group origin sits on the wall face at box height, so the interaction
    // point is never inside the wall. Local +Z points out into the aisle.
    const g = new THREE.Group()
    g.name = `relay-box-${slot.label}`
    g.position.set(slot.s * (WALL_X - 0.07), 1.2, routeZ(slot.z))
    g.rotation.y = slot.s > 0 ? -Math.PI / 2 : Math.PI / 2

    const d = RELAY_BOX_DEPTH
    const w = RELAY_BOX_WIDTH
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.75, d), relayGreen)
    body.position.z = d / 2
    body.castShadow = true
    g.add(body)
    const standPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 10), oldBrass)
    standPipe.position.set(0, -0.8, d / 2)
    g.add(standPipe)
    for (const [bw, bh, bx, by] of [
      [0.03, 0.75, -w / 2 + 0.015, 0], [0.03, 0.75, w / 2 - 0.015, 0],
      [w, 0.03, 0, 0.36], [w, 0.03, 0, -0.36]
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), oldBrass)
      bar.position.set(bx, by, d + 0.005)
      g.add(bar)
    }

    // Header with the letter plate and status lamp — visible while shut.
    const header = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 0.1), woodDark)
    header.position.set(0, 0.49, d - 0.05)
    g.add(header)
    const letter = plaque(slot.label, 0.16, 0.16, { px: 128 })
    letter.position.set(-0.12, 0.49, d + 0.006)
    g.add(letter)
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x5a1a12, emissive: 0x7a1c10, emissiveIntensity: 0.6, roughness: 0.3
    })
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), lampMat)
    lamp.position.set(0.16, 0.49, d + 0.02)
    g.add(lamp)

    const gauge = makeGauge()
    gauge.position.set(0.17, 0.2, d + 0.01)
    g.add(gauge)

    // Throw lever: swings across the front face.
    const lever = new THREE.Group()
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), oldBrass)
    arm.position.y = 0.15
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), darkIron)
    knob.position.y = 0.3
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), darkIron)
    boss.rotation.x = Math.PI / 2
    lever.add(arm, knob, boss)
    lever.position.set(-0.04, -0.12, d + 0.04)
    g.add(lever)

    // Hinged cover over the front face; swings out toward the aisle.
    const hinge = new THREE.Group()
    hinge.position.set(-w / 2, 0, d + 0.11)
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, 0.74, 0.025), relayGreen)
    cover.position.x = w / 2
    hinge.add(cover)
    const coverPlate = plaque(slot.label, 0.2, 0.2, { px: 128 })
    coverPlate.position.set(w / 2, 0.05, 0.014)
    hinge.add(coverPlate)
    const coverKnob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), oldBrass)
    coverKnob.position.set(w - 0.06, 0, 0.03)
    hinge.add(coverKnob)
    g.add(hinge)

    root.add(g)
    const entry = { slot, index: i, group: g, lever, hinge, lampMat, needle: gauge.userData.needle, open: 0, throw: 0 }

    unregisters.push(interaction.register(g, {
      prompt: `Throw Relay ${slot.label}`,
      onInteract: () => {
        if (relaySolved) return
        if (!relayLogged) {
          interaction.flashPrompt(
            routeEngaged > 0.5
              ? 'The relay will not take an order until the route board has been read.'
              : 'Relay box is shut — the route system is not engaged.'
          )
          return
        }
        if (relayInput.includes(i)) return
        if (relaySequence[relayInput.length] !== i) {
          relayInput.length = 0
          hud.showToast('ROUTING REJECTED — the levers spring back. Start again from I.', 2400)
          return
        }
        relayInput.push(i)
        if (relayInput.length < RELAY_COUNT) {
          hud.showToast(`RELAY ${slot.label} THROWN — ${relayInput.length} / ${RELAY_COUNT}`, 1100)
          return
        }
        relaySolved = true
        hud.showToast('ROUTE SET — forward door unlocked', 2600)
        hud.setObjective('Proceed to Cargo and acquire the next Chrono module')
      }
    }))
    return entry
  })

  // --- Front door and route board ------------------------------------------
  const relayGateZ = spans.relay.maxZ - 1.35
  const DOOR_H = 2.4
  const doorFace = HAZARD_AISLE_X + 0.2 // pillar face; the leaves slide into the pillars
  const doorLeaves = [-1, 1].map((side) => {
    const leaf = new THREE.Group()
    const panel = new THREE.Mesh(new THREE.BoxGeometry(doorFace, DOOR_H, 0.1), chokeMat)
    panel.castShadow = true
    leaf.add(panel)
    for (const e of [-1, 1]) {
      for (const [bw, bh, bx, by] of [
        [0.035, DOOR_H - 0.16, -(doorFace / 2 - 0.08), 0],
        [0.035, DOOR_H - 0.16, doorFace / 2 - 0.08, 0],
        [doorFace - 0.16, 0.035, 0, DOOR_H / 2 - 0.08],
        [doorFace - 0.16, 0.035, 0, -(DOOR_H / 2 - 0.08)]
      ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), brassMat)
        bar.position.set(bx, by, e * 0.056)
        leaf.add(bar)
      }
      const crest = makeHourglassEmblem(emblemMat, 0.5)
      crest.position.set(0, 0.25, e * 0.062)
      if (e < 0) crest.rotation.y = Math.PI
      leaf.add(crest)
    }
    leaf.userData.side = side
    root.add(leaf)
    return leaf
  })
  let relayGateOpen = 0
  function applyRouteDoor() {
    for (const leaf of doorLeaves) {
      const side = leaf.userData.side
      leaf.position.set(side * (doorFace / 2 + relayGateOpen * (doorFace - 0.12)), DOOR_H / 2, relayGateZ)
    }
  }
  applyRouteDoor()

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(doorFace * 2, CARRIAGE_CEILING_Y - DOOR_H, 0.24),
    woodDark
  )
  lintel.position.set(0, (CARRIAGE_CEILING_Y + DOOR_H) / 2, relayGateZ)
  root.add(lintel)

  // The board faces back down the car (-Z). NOTE the sign on X: the player
  // walks toward +Z, so world +X is SCREEN-LEFT — (1.5 - i) reads A..D left
  // to right.
  const board = new THREE.Group()
  board.name = 'route-board'
  const boardBack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.92, 0.05), woodDark)
  board.add(boardBack)
  for (const [bw, bh, bx, by] of [
    [0.04, 0.92, -0.93, 0], [0.04, 0.92, 0.93, 0], [1.9, 0.04, 0, 0.44], [1.9, 0.04, 0, -0.44]
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), oldBrass)
    bar.position.set(bx, by, -0.03)
    board.add(bar)
  }
  const boardTitle = plaque('ROUTE SEQUENCE', 1.1, 0.16, { bg: 0x2e3b2a, fg: 0xd9b45e })
  boardTitle.position.set(0, 0.3, -0.03)
  boardTitle.rotation.y = Math.PI
  board.add(boardTitle)
  const questionMat = signMaterial({
    text: '?', background: 0xf0e4c8, foreground: 0x3a2412, width: 128, height: 128, emissiveIntensity: 0.3
  })
  const flipPlates = routeLayout.relays.map((slot, i) => {
    const x = (1.5 - i) * 0.42
    const flip = new THREE.Group()
    // Far enough off the backing that the half-turn clears it.
    flip.position.set(x, -0.04, -0.18)
    const disc = new THREE.CircleGeometry(0.15, 28)
    // Front shows "?" toward the player; the back carries the numeral, turned
    // so a half-turn about X leaves it upright and facing the player.
    const front = new THREE.Mesh(disc, questionMat)
    front.rotation.y = Math.PI
    const back = new THREE.Mesh(disc, signMaterial({
      text: ROMAN[relayStepOf[i]], background: 0xf0e4c8, foreground: 0x3a2412,
      width: 128, height: 128, emissiveIntensity: 0.3
    }))
    back.rotation.z = Math.PI
    flip.add(front, back)
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 28), oldBrass)
    bezel.position.set(x, -0.04, -0.18)
    board.add(flip, bezel)
    const caption = plaque(slot.label, 0.1, 0.1, { px: 128 })
    caption.position.set(x, -0.3, -0.03)
    caption.rotation.y = Math.PI
    board.add(caption)
    return flip
  })
  board.position.set(0, (CARRIAGE_CEILING_Y + DOOR_H) / 2, relayGateZ - 0.12)
  root.add(board)
  const boardLight = new THREE.PointLight(0xffd6a0, 4, 3.5, 2)
  boardLight.position.set(0, 2.5, relayGateZ - 1.0)
  root.add(boardLight)
  let boardReveal = 0

  // --------------------------------------------------------------------------
  // CARGO — FREEZE
  // Six moving-load obstacles, each one a Freeze timing problem: a hanging
  // crate, a sliding luggage stack, rotating barrier panels, a moving floor
  // platform, a drop gate, and a final run that combines three of them.
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
      if (!abilityState.GHOST) {
        interaction.flashPrompt('The Echo Synchronizer is not installed yet.')
        return
      }
      freezeTaken = true
      freezePickup.collect()
      unlockAbility('FREEZE', 'CRYO PHASE MODULE INSTALLED — FREEZE unlocked')
      // Freeze is the module that heats the interface, so the strain meter
      // only appears once the player actually has it.
      timeSystem?.setStrainEnabled?.(true)
      hud.showToast(
        'WARNING: sustained FREEZE overheats the Chrono Interface. Watch the strain meter.',
        3600
      )
      hud.setObjective('Cross Cargo — FREEZE moving loads, but do not lean on it')
    }
  }))

  const cargoZ = (localZ) => spans.cargo.center + localZ

  // Triangle wave in [-1, 1]: -1 at t = 0, +1 at half a period. Linear motion
  // reads more like machinery than a sine, and its turnarounds are sharp.
  function tri(t, period) {
    const u = ((t / period) % 1 + 1) % 1
    return 1 - 4 * Math.abs(u - 0.5)
  }

  // Overdrive a triangle wave and clip it, so a load pauses at each end of its
  // travel — roughly a fifth of the cycle — before heading back.
  function dwell(w) {
    return THREE.MathUtils.clamp(w * 1.6, -1, 1)
  }

  // Every Cargo hazard is registered with the time system, so SLOW stretches
  // and FREEZE stops all of them together, and a checkpoint restores its clock.
  function registerCargoHazard(object, apply) {
    const state = { t: 0 }
    apply(0)
    unregisters.push(registerHazard(object, {
      onUpdate(scaledDelta) { state.t += scaledDelta; apply(state.t) },
      getSnapshot: () => ({ t: state.t }),
      restoreSnapshot: (snap) => { state.t = snap.t; apply(state.t) }
    }))
  }

  const cargoWood = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.8, metalness: 0.02 })
  const cargoBand = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.7, metalness: 0.3 })
  const leatherDark = new THREE.MeshStandardMaterial({ color: 0x2b211b, roughness: 0.78, metalness: 0.05 })
  const leatherWarm = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.8, metalness: 0.05 })
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 0.95 })

  // Navy panel in a brass frame with the hourglass crest on both faces —
  // the carriage-door look, reused for the gates and barrier panels.
  function makeCrestPanel(width, height, depth = 0.1, originAtEdge = false) {
    const g = new THREE.Group()
    const ox = originAtEdge ? width / 2 : 0
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), chokeMat)
    body.position.x = ox
    body.castShadow = true
    g.add(body)
    for (const e of [-1, 1]) {
      for (const [bw, bh, bx, by] of [
        [0.035, height - 0.12, -(width / 2 - 0.06), 0],
        [0.035, height - 0.12, width / 2 - 0.06, 0],
        [width - 0.12, 0.035, 0, height / 2 - 0.06],
        [width - 0.12, 0.035, 0, -(height / 2 - 0.06)]
      ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), brassMat)
        bar.position.set(ox + bx, by, e * (depth / 2 + 0.006))
        g.add(bar)
      }
      const crest = makeHourglassEmblem(emblemMat, Math.min(0.5, height * 0.3))
      crest.position.set(ox, 0, e * (depth / 2 + 0.012))
      if (e < 0) crest.rotation.y = Math.PI
      g.add(crest)
    }
    return g
  }

  // --- 1. Hanging crate on a ceiling rail ------------------------------------
  const CRATE_HALF = 0.45
  const CRATE_TRAVEL = 0.9
  const CRATE_BOTTOM = 0.35
  const hangingCrates = []
  function addHangingCrate(localZ, period, phase, toWorld = cargoZ) {
    const z = toWorld(localZ)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.1, 0.14), darkIron)
    rail.position.set(0, CARRIAGE_CEILING_Y - 0.1, z)
    rail.userData.noCameraCollision = true
    root.add(rail)

    const load = new THREE.Group()
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.24), oldBrass)
    trolley.position.y = CARRIAGE_CEILING_Y - 0.22
    load.add(trolley)
    const crateTop = CRATE_BOTTOM + CRATE_HALF * 2
    const ropeLen = CARRIAGE_CEILING_Y - 0.3 - crateTop
    for (const rx of [-0.3, 0.3]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ropeLen, 6), ropeMat)
      rope.position.set(rx, crateTop + ropeLen / 2, 0)
      rope.rotation.z = rx > 0 ? -0.12 : 0.12
      load.add(rope)
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(CRATE_HALF * 2, CRATE_HALF * 2, CRATE_HALF * 2), cargoWood)
    crate.position.y = CRATE_BOTTOM + CRATE_HALF
    crate.castShadow = true
    load.add(crate)
    for (const by of [0.12, 0.78]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(CRATE_HALF * 2 + 0.02, 0.06, CRATE_HALF * 2 + 0.02), cargoBand)
      band.position.y = CRATE_BOTTOM + by
      load.add(band)
    }
    const stencil = makeHourglassEmblem(cargoBand, 0.45)
    stencil.position.set(0, CRATE_BOTTOM + CRATE_HALF, -(CRATE_HALF + 0.005))
    stencil.rotation.y = Math.PI
    load.add(stencil)
    load.position.z = z
    root.add(load)

    registerCargoHazard(load, (t) => {
      load.position.x = dwell(tri(t + phase * period, period)) * CRATE_TRAVEL
    })
    hangingCrates.push({ load, z })
  }

  // --- 2. Sliding luggage stack ----------------------------------------------
  const STACK_HALF_X = 0.55
  const STACK_HALF_Z = 0.45
  const STACK_TRAVEL = 1.55 // far enough to tuck fully inside a pillar
  const luggageStacks = []
  function addLuggageStack(localZ, period, phase) {
    const z = cargoZ(localZ)
    const stack = new THREE.Group()
    const dolly = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.95), darkIron)
    dolly.position.y = 0.03
    stack.add(dolly)
    let y = 0.06
    for (const [w, h, d, mat, yaw] of [
      [1.1, 0.55, 0.9, leatherDark, 0],
      [1.0, 0.5, 0.82, leatherWarm, 0.06],
      [0.82, 0.4, 0.7, leatherDark, -0.1]
    ]) {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      trunk.position.y = y + h / 2
      trunk.rotation.y = yaw
      trunk.castShadow = true
      stack.add(trunk)
      for (const e of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.02, d + 0.02), oldBrass)
        strap.position.set(e * w * 0.3, y + h / 2, 0)
        strap.rotation.y = yaw
        stack.add(strap)
      }
      y += h
    }
    stack.position.z = z
    root.add(stack)
    registerCargoHazard(stack, (t) => {
      stack.position.x = dwell(tri(t + phase * period, period)) * STACK_TRAVEL
    })
    luggageStacks.push({ stack, z })
  }

  // --- 3. Drop gate ------------------------------------------------------------
  const GATE_W = (HAZARD_AISLE_X + 0.2) * 2 // pillar face to pillar face
  const GATE_H = 1.6
  const GATE_RAISED = CARRIAGE_CEILING_Y - GATE_H // bottom edge when up
  // Bottom edge over one cycle: a long raised hold, a fast drop, a short
  // hold on the floor, then a slow climb back.
  function gateBottom(u) {
    if (u < 0.5) return GATE_RAISED
    if (u < 0.6) return GATE_RAISED * (1 - (u - 0.5) / 0.1)
    if (u < 0.75) return 0
    return GATE_RAISED * (u - 0.75) / 0.25
  }
  const dropGates = []
  function addDropGate(localZ, period, phase) {
    const z = cargoZ(localZ)
    const gate = makeCrestPanel(GATE_W, GATE_H, 0.1)
    gate.position.z = z
    root.add(gate)
    const entry = { gate, z, bottom: GATE_RAISED }
    registerCargoHazard(gate, (t) => {
      const u = (((t / period) + phase) % 1 + 1) % 1
      entry.bottom = gateBottom(u)
      gate.position.y = entry.bottom + GATE_H / 2
    })
    dropGates.push(entry)
  }

  // --- 4. Rotating barrier panels ----------------------------------------------
  // Hinged on the pillar faces at the -Z end. Open, they lie flat against the
  // pillars; closed, they meet across the aisle.
  const PANEL_LEN = 0.95
  const panelHingeX = HAZARD_AISLE_X + 0.2 - 0.04
  const barrierPanels = []
  function addBarrierPanels(localZ, period) {
    const z = cargoZ(localZ)
    const pair = { z, angle: 0, leaves: [] }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(side * panelHingeX, 1.2, z)
      pivot.add(makeCrestPanel(PANEL_LEN, 2.4, 0.06, true))
      root.add(pivot)
      pair.leaves.push({ side, pivot })
    }
    const group = new THREE.Group() // time-system handle for the pair
    root.add(group)
    registerCargoHazard(group, (t) => {
      // 0 = open against the pillar, PI/2 = closed across the aisle.
      pair.angle = Math.PI / 2 * (0.5 - 0.5 * Math.cos(t / period * Math.PI * 2))
      for (const { side, pivot } of pair.leaves) {
        // Leaf runs along local +X; point it from the hinge toward its tip.
        pivot.rotation.y = Math.atan2(-Math.cos(pair.angle), -side * Math.sin(pair.angle))
      }
    })
    barrierPanels.push(pair)
  }
  function panelHits(pair, px, pz) {
    for (const side of [-1, 1]) {
      const hx = side * panelHingeX
      const tx = hx - side * PANEL_LEN * Math.sin(pair.angle)
      const tz = pair.z + PANEL_LEN * Math.cos(pair.angle)
      const dx = tx - hx
      const dz = tz - pair.z
      const k = THREE.MathUtils.clamp(((px - hx) * dx + (pz - pair.z) * dz) / (dx * dx + dz * dz), 0, 1)
      // 0.15, not a full body pad: open panels lie 0.2 m outside the lane.
      if (Math.hypot(px - (hx + dx * k), pz - (pair.z + dz * k)) < 0.15) return true
    }
    return false
  }

  // --- 5. Moving floor platform over an open well -----------------------------
  const pitZ = cargoZ(CARGO_PIT.z)
  const PLATFORM_HALF_X = 0.6
  const PLATFORM_TRAVEL = 1.6
  const cargoPitGeometry = new THREE.BoxGeometry(CARGO_PIT.halfX * 2, 3.4, CARGO_PIT.halfZ * 2)
  const cargoPitIndices = cargoPitGeometry.getIndex().array
  cargoPitGeometry.setIndex(cargoPitGeometry.groups
    .filter((group) => group.materialIndex !== 2)
    .flatMap((group) => Array.from(cargoPitIndices.slice(group.start, group.start + group.count))))
  cargoPitGeometry.clearGroups()
  const cargoPit = new THREE.Mesh(cargoPitGeometry,
    new THREE.MeshStandardMaterial({ color: 0x151310, roughness: 1, side: THREE.BackSide }))
  cargoPit.position.set(0, -1.7, pitZ)
  cargoPit.userData.noCameraCollision = true
  root.add(cargoPit)
  const floorPlatform = new THREE.Group()
  floorPlatform.name = 'cargo-floor-platform'
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_HALF_X * 2, 0.14, CARGO_PIT.halfZ * 2 - 0.1),
    new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.75, metalness: 0.05 })
  )
  deck.position.y = -0.07
  deck.receiveShadow = true
  floorPlatform.add(deck)
  for (const e of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, CARGO_PIT.halfZ * 2 - 0.1), oldBrass)
    edge.position.set(e * (PLATFORM_HALF_X - 0.03), 0.005, 0)
    floorPlatform.add(edge)
  }
  floorPlatform.position.z = pitZ
  root.add(floorPlatform)
  registerCargoHazard(floorPlatform, (t) => {
    floorPlatform.position.x = tri(t + 0.5 * 3.4, 3.4) * PLATFORM_TRAVEL
  })

  // --- Layout, rear to front ----------------------------------------------------
  addHangingCrate(-8.0, 2.2, 0)
  addLuggageStack(-5.0, 2.8, 0)
  addBarrierPanels(-2.9, 3.0)
  addDropGate(5.0, 3.0, 0)
  // 6. Combination: one shared 3.2 s cycle. At its start the stack is tucked
  // into the +X pillar, the crate is at the -X end and the gate is up, so a
  // well-timed FREEZE opens all three at once — along the +X side.
  const COMBO_PERIOD = 3.2
  addLuggageStack(8.2, COMBO_PERIOD, 0.5)
  addHangingCrate(9.8, COMBO_PERIOD, 0)
  addDropGate(11.2, COMBO_PERIOD, 0.1)

  // --------------------------------------------------------------------------
  // MECHANICAL — REWIND
  // Every machine in here is one-shot: it springs as the player approaches and
  // then stays shut. REWIND runs it back to where it was, and the moment time
  // runs forward again it springs a second time — rewinding buys a window, not
  // a repair. A pale outline marks where each machine will return to.
  // Rail crate, floor platform, sliding door, wall panels, then a run that
  // springs a platform, a crate and a door in sequence.
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
      hud.setObjective('Cross Mechanical — REWIND each machine open, then move before it springs again')
    }
  }))

  const mechZ = (localZ) => spans.mechanical.center + localZ
  const outlineMat = new THREE.LineBasicMaterial({
    color: 0x9fd4ff, transparent: true, opacity: 0.5, depthTest: false
  })
  const rewindMachines = []

  // Edges of `mesh` at its current transform, drawn through walls so the
  // outline of a machine's parked position reads even inside a pillar.
  function makeOutline(mesh) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), outlineMat)
    mesh.updateWorldMatrix(true, false)
    mesh.matrixWorld.decompose(lines.position, lines.quaternion, lines.scale)
    lines.renderOrder = 10
    lines.visible = false
    lines.userData.noCameraCollision = true
    lines.raycast = () => {}
    root.add(lines)
    return lines
  }

  // One-shot machine. `s` is its clock: -1 idle, then an arming delay, then
  // the spring. Snapshots are only recorded while it is arming or moving, so
  // REWIND runs it back through the spring to idle and it rests there; once
  // time runs forward with the player still in range, it springs again.
  function addRewindMachine({ z, handle, triggerFrom, triggerTo, delay, duration, apply, outlines, activeIn = 'interior' }) {
    const total = delay + duration
    const m = { z, s: -1, p: 0, outlines, moving: false }
    function set(s) {
      m.s = s
      const k = s < delay ? 0 : Math.min(1, (s - delay) / duration)
      m.p = k * k * (3 - 2 * k)
      m.moving = m.p > 0 && m.p < 1
      apply(m.p)
    }
    set(-1)
    unregisters.push(registerHazard(handle, {
      // Checked before each step's update, so the step that finishes the
      // spring still records its final pose; resting time is never recorded.
      recordWhen: () => m.s >= 0 && m.s < total,
      onUpdate(scaledDelta, timeScale) {
        if (timeScale <= 0) return
        if (m.s < 0) {
          const pz = player.mesh.position.z
          if (section !== activeIn || pz < triggerFrom || pz > triggerTo) return
          set(0)
        } else if (m.s < total) {
          set(Math.min(total, m.s + scaledDelta))
        }
      },
      getSnapshot: () => ({ s: m.s }),
      restoreSnapshot: (snap) => set(snap.s)
    }))
    rewindMachines.push(m)
    return m
  }

  // Dynamic collider that follows a machine part; padded like the carriage's.
  function trackingCollider() {
    const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
    corridorObstacles.push(box)
    return box
  }
  function placeCollider(box, x, z, halfX, halfZ) {
    box.minX = x - halfX - 0.2
    box.maxX = x + halfX + 0.2
    box.minZ = z - halfZ - 0.2
    box.maxZ = z + halfZ + 0.2
  }
  const insideBox = (box, x, z) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ

  // --- Rail crate: slides out of a pillar along a ceiling rail --------------
  const RAIL_CRATE_W = 1.5
  const RAIL_CRATE_D = 1.0
  const RAIL_CRATE_H = 1.0
  const RAIL_CRATE_BOTTOM = 0.3
  const RAIL_CRATE_PARK_X = HAZARD_AISLE_X + 0.2 + RAIL_CRATE_W / 2 + 0.05
  const railCrates = []
  function addRailCrate(localZ, trigger, delay, duration) {
    const z = mechZ(localZ)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.1, 0.14), darkIron)
    rail.position.set(0, CARRIAGE_CEILING_Y - 0.1, z)
    rail.userData.noCameraCollision = true
    root.add(rail)
    const load = new THREE.Group()
    load.name = `mechanical-rail-crate-${railCrates.length}`
    const crateY = RAIL_CRATE_BOTTOM + RAIL_CRATE_H / 2
    const crate = new THREE.Mesh(new THREE.BoxGeometry(RAIL_CRATE_W, RAIL_CRATE_H, RAIL_CRATE_D), cargoWood)
    crate.position.y = crateY
    crate.castShadow = true
    load.add(crate)
    for (const by of [0.1, RAIL_CRATE_H - 0.1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(RAIL_CRATE_W + 0.02, 0.06, RAIL_CRATE_D + 0.02), cargoBand)
      band.position.y = RAIL_CRATE_BOTTOM + by
      load.add(band)
    }
    const stencil = makeHourglassEmblem(cargoBand, 0.5)
    stencil.position.set(0, crateY, -(RAIL_CRATE_D / 2 + 0.005))
    stencil.rotation.y = Math.PI
    load.add(stencil)
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.24), oldBrass)
    trolley.position.y = CARRIAGE_CEILING_Y - 0.22
    load.add(trolley)
    const crateTop = RAIL_CRATE_BOTTOM + RAIL_CRATE_H
    const ropeLen = CARRIAGE_CEILING_Y - 0.3 - crateTop
    for (const rx of [-0.3, 0.3]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ropeLen, 6), ropeMat)
      rope.position.set(rx, crateTop + ropeLen / 2, 0)
      load.add(rope)
    }
    load.position.set(RAIL_CRATE_PARK_X, 0, z)
    root.add(load)
    const outline = makeOutline(crate)
    const box = trackingCollider()
    const machine = addRewindMachine({
      z, handle: load, triggerFrom: mechZ(trigger[0]), triggerTo: mechZ(trigger[1]), delay, duration,
      outlines: [outline],
      apply(p) {
        load.position.x = RAIL_CRATE_PARK_X * (1 - p)
        placeCollider(box, load.position.x, z, RAIL_CRATE_W / 2, RAIL_CRATE_D / 2)
      }
    })
    railCrates.push({ machine, box })
    return machine
  }

  // --- Floor platform: slides away from over a well ----------------------------
  const MECH_PLATFORM_HALF_X = 0.65
  const MECH_PLATFORM_PARK_X = -(HAZARD_AISLE_X + 0.2 + MECH_PLATFORM_HALF_X + 0.3)
  const mechPlatforms = []
  function addRewindPlatform(pit, trigger, delay, duration, toWorld = mechZ) {
    const z = toWorld(pit.z)
    const pitGeometry = new THREE.BoxGeometry(pit.halfX * 2, 3.4, pit.halfZ * 2)
    const pitIndices = pitGeometry.getIndex().array
    pitGeometry.setIndex(pitGeometry.groups
      .filter((group) => group.materialIndex !== 2)
      .flatMap((group) => Array.from(pitIndices.slice(group.start, group.start + group.count))))
    pitGeometry.clearGroups()
    const well = new THREE.Mesh(pitGeometry,
      new THREE.MeshStandardMaterial({ color: 0x151310, roughness: 1, side: THREE.BackSide }))
    well.position.set(0, -1.7, z)
    well.userData.noCameraCollision = true
    root.add(well)

    const platform = new THREE.Group()
    platform.name = `mechanical-platform-${mechPlatforms.length}`
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(MECH_PLATFORM_HALF_X * 2, 0.14, pit.halfZ * 2 - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.75, metalness: 0.05 })
    )
    deck.position.y = -0.07
    deck.receiveShadow = true
    platform.add(deck)
    for (const e of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, pit.halfZ * 2 - 0.1), oldBrass)
      edge.position.set(e * (MECH_PLATFORM_HALF_X - 0.03), 0.005, 0)
      platform.add(edge)
    }
    platform.position.set(0, 0, z)
    root.add(platform)
    const outline = makeOutline(deck)
    const machine = addRewindMachine({
      z, handle: platform, triggerFrom: toWorld(trigger[0]), triggerTo: toWorld(trigger[1]), delay, duration,
      outlines: [outline],
      apply(p) { platform.position.x = MECH_PLATFORM_PARK_X * p }
    })
    mechPlatforms.push({ machine, platform, z, halfZ: pit.halfZ })
    return machine
  }

  // --- Sliding door: a heavy crest door slams across the aisle ----------------
  const SLIDE_DOOR_W = 1.9
  const SLIDE_DOOR_H = 2.5
  const SLIDE_DOOR_PARK_X = HAZARD_AISLE_X + 0.2 + SLIDE_DOOR_W / 2
  const slideDoors = []
  function addSlideDoor(localZ, trigger, delay, duration) {
    const z = mechZ(localZ)
    const door = makeCrestPanel(SLIDE_DOOR_W, SLIDE_DOOR_H, 0.12)
    door.name = `mechanical-door-${slideDoors.length}`
    door.position.set(SLIDE_DOOR_PARK_X, SLIDE_DOOR_H / 2, z)
    root.add(door)
    const outline = makeOutline(door.children[0])
    const box = trackingCollider()
    const machine = addRewindMachine({
      z, handle: door, triggerFrom: mechZ(trigger[0]), triggerTo: mechZ(trigger[1]), delay, duration,
      outlines: [outline],
      apply(p) {
        door.position.x = SLIDE_DOOR_PARK_X * (1 - p)
        placeCollider(box, door.position.x, z, SLIDE_DOOR_W / 2, 0.06)
      }
    })
    slideDoors.push({ machine, box })
    return machine
  }

  // --- Wall panels: a pair slides in from both pillars and meets -------------
  const WALL_PANEL_W = HAZARD_AISLE_X + 0.2
  const wallPanelPairs = []
  function addWallPanels(localZ, trigger, delay, duration) {
    const z = mechZ(localZ)
    const handle = new THREE.Group()
    handle.name = 'mechanical-wall-panels'
    root.add(handle)
    const leaves = [-1, 1].map((side) => {
      const leaf = makeCrestPanel(WALL_PANEL_W, SLIDE_DOOR_H, 0.1)
      leaf.position.set(side * (WALL_PANEL_W * 1.5), SLIDE_DOOR_H / 2, z)
      root.add(leaf)
      return { side, leaf, outline: makeOutline(leaf.children[0]), box: trackingCollider() }
    })
    const machine = addRewindMachine({
      z, handle, triggerFrom: mechZ(trigger[0]), triggerTo: mechZ(trigger[1]), delay, duration,
      outlines: leaves.map((l) => l.outline),
      apply(p) {
        for (const { side, leaf, box } of leaves) {
          leaf.position.x = side * WALL_PANEL_W * (1.5 - p)
          placeCollider(box, leaf.position.x, z, WALL_PANEL_W / 2, 0.05)
        }
      }
    })
    wallPanelPairs.push({ machine, leaves })
    return machine
  }

  // --- Layout, rear to front ([from, to] trigger range is local Z) -----------
  addRailCrate(-9.0, [-11.0, -7.5], 0.2, 0.8)
  addRewindPlatform(MECH_PITS[0], [-7.2, -3.9], 0.1, 0.6)
  addSlideDoor(-0.4, [-3.8, 0.8], 0, 0.6)
  addWallPanels(3.6, [0.6, 4.8], 0, 0.6)
  // Combination: one trigger springs all three in a staggered sequence.
  addRewindPlatform(MECH_PITS[1], [5.6, 13.5], 0.25, 0.6)
  addRailCrate(10.6, [5.6, 13.5], 0.35, 0.7)
  addSlideDoor(12.4, [5.6, 13.5], 0.5, 0.6)

  const { hatchCover, ladder } = env.parts.convergence
  let hatchBroken = false
  let hatchRepaired = false
  let hatchOpen = 1

  // Start the hatch visually open. It slams shut as the player approaches;
  // Rewind restores the earlier open state from the time-system snapshot buffer.
  hatchCover.position.x = -1.15
  unregisters.push(registerHazard(hatchCover, {
    recordWhen: () => hatchBroken && hatchOpen > 0,
    onUpdate(scaledDelta, timeScale) {
      if (timeScale > 0 && hatchBroken) hatchOpen = Math.max(0, hatchOpen - scaledDelta * 2.8)
      hatchCover.position.x = -1.15 * hatchOpen
    },
    getSnapshot: () => ({ hatchBroken, hatchOpen }),
    restoreSnapshot: (s) => {
      if (hatchBroken && !s.hatchBroken) hatchRepaired = true
      hatchBroken = s.hatchBroken
      hatchOpen = s.hatchOpen
      hatchCover.position.x = -1.15 * hatchOpen
    }
  }))

  unregisters.push(interaction.register(ladder, {
    prompt: 'Climb to the carriage roof',
    isEligible: () => section === 'interior',
    onInteract: () => {
      if (!exitDoor.latched) {
        interaction.flashPrompt('The Convergence exit door is still locked.')
        return
      }
      if (hatchOpen < 0.65) {
        interaction.flashPrompt('The hatch motor failed shut — REWIND it to the open state.')
        return
      }
      enterRoof()
    }
  }))

  // ------------------------------------------------------------------
  // CONVERGENCE — the last car before the Chrono Core.
  //
  // One obstacle per ability, then all four together:
  //   1. a brass cage gate whose open window is too short to walk through —
  //      SLOW stretches it;
  //   2. a fast hanging crate — FREEZE it clear of the aisle;
  //   3. a floor platform that slides off its well — REWIND it back;
  //   4. twin switches too far apart for one person — a TIME GHOST holds one;
  //   5. crate, platform and cage gate in a row, then a final switch that
  //      only holds the exit door open while it is weighted.
  // ------------------------------------------------------------------
  const convZ = (localZ) => spans.convergence.center + localZ

  // --- Cage gate (Slow) ---------------------------------------------------------
  // A two-sided brass portcullis 1.5 m deep. Its raised window is shorter than
  // a sprint through the cage, so it has to be slowed (or frozen) to pass.
  const CAGE_W = (HAZARD_AISLE_X + 0.2) * 2
  const CAGE_H = 1.6
  const CAGE_DEPTH = 1.5
  const CAGE_RAISED = CARRIAGE_CEILING_Y - CAGE_H
  function cageBottom(u) {
    if (u < 0.2) return CAGE_RAISED
    if (u < 0.3) return CAGE_RAISED * (1 - (u - 0.2) / 0.1)
    if (u < 0.8) return 0
    return CAGE_RAISED * (u - 0.8) / 0.2
  }
  const cageGates = []
  function addCageGate(localZ, period, phase) {
    const z = convZ(localZ)
    const cage = new THREE.Group()
    cage.name = `convergence-cage-gate-${cageGates.length}`
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, CAGE_H, 6)
    const bars = Math.round(CAGE_W / 0.17)
    for (const e of [-1, 1]) {
      for (let i = 0; i <= bars; i++) {
        const bar = new THREE.Mesh(barGeo, oldBrass)
        bar.position.set(-CAGE_W / 2 + i * (CAGE_W / bars), CAGE_H / 2, e * CAGE_DEPTH / 2)
        cage.add(bar)
      }
      for (const y of [0.04, CAGE_H / 2, CAGE_H - 0.04]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(CAGE_W, 0.07, 0.07), oldBrass)
        rail.position.set(0, y, e * CAGE_DEPTH / 2)
        cage.add(rail)
      }
    }
    for (const x of [-CAGE_W / 2, CAGE_W / 2]) {
      for (const y of [0.04, CAGE_H - 0.04]) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, CAGE_DEPTH), oldBrass)
        tie.position.set(x, y, 0)
        cage.add(tie)
      }
    }
    cage.position.z = z
    root.add(cage)
    const entry = { z, bottom: CAGE_RAISED }
    unregisters.push(registerHazard(cage, (() => {
      let t = 0
      const apply = () => {
        const u = (((t / period) + phase) % 1 + 1) % 1
        entry.bottom = cageBottom(u)
        cage.position.y = entry.bottom
      }
      apply()
      return {
        onUpdate(scaledDelta) { t += scaledDelta; apply() },
        getSnapshot: () => ({ t }),
        restoreSnapshot: (snap) => { t = snap.t; apply() }
      }
    })()))
    cageGates.push(entry)
  }

  // --- Switch station (Ghost) --------------------------------------------------
  // Floor plate by the wall, a numbered brass plaque above it and a lever that
  // pulls down while the plate is weighted.
  function addSwitchStation(number, side, localZ) {
    const z = convZ(localZ)
    const pos = new THREE.Vector3(side * 1.8, 0.03, z)
    unregisters.push(timeSystem.registerGhostPad(pos, 0.56))
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), darkIron)
    base.position.set(pos.x, 0.03, z)
    root.add(base)
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.04, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x8a6d34, roughness: 0.4, metalness: 0.85 })
    )
    plate.position.set(pos.x, 0.08, z)
    root.add(plate)
    const wallX = side * (WALL_X - 0.07)
    const backing = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.42), woodDark)
    backing.position.set(side * (WALL_X - 0.05), 1.95, z)
    root.add(backing)
    const label = plaque(String(number), 0.3, 0.36, { px: 128 })
    label.position.set(wallX, 1.95, z)
    label.rotation.y = -side * Math.PI / 2
    root.add(label)
    const lever = new THREE.Group()
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), oldBrass)
    arm.position.y = 0.2
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), darkIron)
    knob.position.y = 0.4
    lever.add(arm, knob)
    lever.position.set(side * (WALL_X - 0.12), 1.3, z)
    root.add(lever)
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffb454, emissive: 0xff9a2a, emissiveIntensity: 1.2, roughness: 0.3
    })
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat)
    lamp.position.set(side * (WALL_X - 0.1), 2.3, z)
    root.add(lamp)
    const station = { pos, held: false }
    station.update = (held) => {
      station.held = held
      plate.position.y = held ? 0.055 : 0.08
      lever.rotation.x = held ? 0.8 : -0.6
      lampMat.color.setHex(held ? 0x7ee08a : 0xffb454)
      lampMat.emissive.setHex(held ? 0x3fbf5a : 0xff9a2a)
    }
    station.update(false)
    return station
  }

  // --- Crest double door --------------------------------------------------------
  function addCrestDoubleDoor(localZ) {
    const z = convZ(localZ)
    const leafW = HAZARD_AISLE_X + 0.2
    const leaves = [-1, 1].map((side) => {
      const leaf = makeCrestPanel(leafW, 2.4, 0.1)
      root.add(leaf)
      return { side, leaf }
    })
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 2, CARRIAGE_CEILING_Y - 2.4, 0.24), woodDark)
    lintel.position.set(0, (CARRIAGE_CEILING_Y + 2.4) / 2, z)
    root.add(lintel)
    const door = { z, open: 0, latched: false }
    door.apply = () => {
      for (const { side, leaf } of leaves) {
        leaf.position.set(side * (leafW / 2 + door.open * (leafW - 0.12)), 1.2, z)
      }
    }
    door.apply()
    return door
  }

  // --- Layout, rear to front ------------------------------------------------------
  addCageGate(-16.0, 1.3, 0)
  addHangingCrate(-11.5, 1.4, 0, convZ)
  addRewindPlatform(CONV_PITS[0], [-9.5, -5.7], 0.1, 0.6, convZ)
  const switchOne = addSwitchStation(1, -1, -3.7)
  const switchTwo = addSwitchStation(2, 1, 1.5)
  const switchDoor = addCrestDoubleDoor(3.6)
  // Combination.
  addHangingCrate(6.5, 1.4, 0.5, convZ)
  addRewindPlatform(CONV_PITS[1], [7.4, 11.0], 0.1, 0.6, convZ)
  addCageGate(12.2, 1.3, 0.4)
  const exitSwitch = addSwitchStation(3, -1, 14.5)
  const exitDoor = addCrestDoubleDoor(16.4)
  let switchHintShown = false

  // --------------------------------------------------------------------------
  // ROOF — every ability, out in the open.
  //
  // Starts over the tail of Convergence, crosses an open freight wagon on
  // wooden decking and ends at the Vault drop hatch. Gaps and deck openings
  // are real voids — step into one and you fall.
  //   0. a short gap onto the wagon — jump it;
  //   1. a deck panel slides off the side as you arrive — REWIND it back;
  //   2. a pair of crates shuttles across on rails — FREEZE them clear;
  //   3. a two-section plank bridge drops out under you — SLOW or REWIND;
  //   4. a row of vent hatches blasts steam — FREEZE them shut;
  //   5. a zipline over the last opening, braked until its release lever is
  //      held — a TIME GHOST holds it while you ride;
  //   6. more crates, then a drawbridge over the gap to the Vault that only
  //      lowers while its plate is weighted — FREEZE, then GHOST.
  // --------------------------------------------------------------------------
  let gustPhase = 0
  const ROOF_Y = CARRIAGE_ROOF_Y
  const F0 = spans.freight.minZ
  const V0 = spans.vault.minZ
  const roofZ = (f) => F0 + f
  const roofSupports = []
  const roofObstacles = []

  // Roof lighting: a low warm sun ahead of the train and a sky fill. They
  // stay in the scene at zero intensity indoors — changing the light count
  // would recompile every material on the climb out.
  const roofSun = new THREE.DirectionalLight(0xffb27a, 0)
  roofSun.position.set(-8, ROOF_Y + 12, V0 + 30)
  roofSun.target.position.set(0, ROOF_Y, F0 + 10)
  const roofSky = new THREE.HemisphereLight(0xffc49a, 0x3a2a2a, 0)
  root.add(roofSun, roofSun.target, roofSky)
  const roofVoids = [
    { minX: -9, maxX: 9, minZ: spans.convergence.maxZ, maxZ: roofZ(ROOF_RUN.shell[0]) },
    ...ROOF_RUN.openings.map(([a, b]) => ({ minX: -9, maxX: 9, minZ: roofZ(a), maxZ: roofZ(b) })),
    { minX: -9, maxX: 9, minZ: roofZ(ROOF_RUN.shell[1]), maxZ: V0 }
  ]
  const deckW = WALL_X * 2 + 0.3
  const roofWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.78, metalness: 0.04 })

  function roofSupport() {
    const support = { minX: 0, maxX: -1, minZ: 0, maxZ: -1, y: ROOF_Y }
    roofSupports.push(support)
    return support
  }
  function placeSupport(support, x, halfX, minZ, maxZ, active = true) {
    support.minX = active ? x - halfX : 0
    support.maxX = active ? x + halfX : -1
    support.minZ = minZ
    support.maxZ = maxZ
  }

  // --- 1. Sliding deck panel (Rewind) -------------------------------------------
  {
    const [a, b] = ROOF_RUN.openings[0]
    const len = b - a
    const panel = new THREE.Group()
    panel.name = 'roof-sliding-panel'
    const boards = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.12, len), roofWood)
    boards.position.y = -0.06
    panel.add(boards)
    for (let k = 0; k < 3; k++) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.02, 0.1), darkIron)
      strap.position.set(0, 0.005, -len / 2 + 0.5 + k * (len - 1) / 2)
      panel.add(strap)
    }
    panel.position.set(0, ROOF_Y, roofZ((a + b) / 2))
    root.add(panel)
    const outline = makeOutline(boards)
    const support = roofSupport()
    const parkedX = -(deckW + 0.6)
    addRewindMachine({
      z: panel.position.z, handle: panel, activeIn: 'roof',
      triggerFrom: roofZ(ROOF_RUN.shell[0] - 0.2), triggerTo: roofZ(b), delay: 0.25, duration: 0.7,
      outlines: [outline],
      apply(p) {
        panel.position.x = parkedX * p
        // Only a panel that is (nearly) home can be stood on.
        placeSupport(support, panel.position.x, deckW / 2, roofZ(a), roofZ(b), p < 0.35)
      }
    })
  }

  // --- 2 & 6. Rail crates (Freeze) ------------------------------------------------
  const ROOF_CRATE_W = 1.5
  const ROOF_CRATE_D = 1.1
  const roofCrates = []
  function addRoofCrates(f, period, phase) {
    const z = roofZ(f)
    for (const dz of [-0.35, 0.35]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(deckW - 0.3, 0.05, 0.08), darkIron)
      rail.position.set(0, ROOF_Y + 0.025, z + dz)
      root.add(rail)
    }
    const pair = new THREE.Group()
    pair.name = `roof-crates-${roofCrates.length}`
    for (const ox of [-0.8, 0.8]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(ROOF_CRATE_W, 1.15, ROOF_CRATE_D), cargoWood)
      crate.position.set(ox, 0.62, 0)
      crate.castShadow = true
      pair.add(crate)
      for (const by of [0.15, 1.05]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(ROOF_CRATE_W + 0.02, 0.06, ROOF_CRATE_D + 0.02), cargoBand)
        band.position.set(ox, by, 0)
        pair.add(band)
      }
    }
    pair.position.set(0, ROOF_Y, z)
    root.add(pair)
    registerCargoHazard(pair, (t) => {
      pair.position.x = dwell(tri(t + phase * period, period)) * 0.8
    })
    roofCrates.push({ pair, z })
  }
  addRoofCrates(9.0, 1.1, 0)

  // --- 3. Collapsing plank bridge (Slow / Rewind) ------------------------------
  const BRIDGE_HALF_X = 0.8
  {
    const [a, b] = ROOF_RUN.openings[1]
    const sectionLen = (b - a) / 2
    for (let k = 0; k < 2; k++) {
      const z0 = roofZ(a + k * sectionLen)
      const z1 = z0 + sectionLen
      const section = new THREE.Group()
      section.name = `roof-bridge-${k}`
      const planks = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE_HALF_X * 2, 0.1, sectionLen - 0.06), roofWood)
      planks.position.y = -0.05
      section.add(planks)
      for (const e of [-1, 1]) {
        const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, sectionLen - 0.06), darkIron)
        stringer.position.set(e * (BRIDGE_HALF_X - 0.04), -0.12, 0)
        section.add(stringer)
      }
      section.position.set(0, ROOF_Y, (z0 + z1) / 2)
      root.add(section)
      const outline = makeOutline(planks)
      const support = roofSupport()
      addRewindMachine({
        z: section.position.z, handle: section, activeIn: 'roof',
        triggerFrom: z0, triggerTo: z1, delay: 0.08, duration: 0.55,
        outlines: [outline],
        apply(p) {
          section.position.y = ROOF_Y - p * 4.2
          section.rotation.x = p * (k ? -0.5 : 0.5)
          placeSupport(support, 0, BRIDGE_HALF_X, z0, z1, p < 0.12)
        }
      })
    }
  }

  // --- 4. Vent hatches (Freeze) ---------------------------------------------------
  const VENT_Z = roofZ(18.5)
  const VENT_PERIOD = 1.6
  const VENT_PUFFS = 9
  let ventSteam = 0 // 0 clear .. 1 full blast, for the hit test
  {
    const grateMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.6, metalness: 0.8 })
    const vents = new THREE.Group()
    vents.name = 'roof-vents'
    const lids = []
    for (const x of [-1.6, 0, 1.6]) {
      const grate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.2), grateMat)
      grate.position.set(x, 0.04, 0)
      vents.add(grate)
      const hinge = new THREE.Group()
      hinge.position.set(x, 0.1, 0.6)
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.1), oldBrass)
      lid.position.z = -0.55
      hinge.add(lid)
      vents.add(hinge)
      lids.push(hinge)
    }
    const steamMat = new THREE.MeshLambertMaterial({
      color: 0xe9e4da, transparent: true, opacity: 0, depthWrite: false
    })
    const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), steamMat, 3 * VENT_PUFFS)
    puffs.userData.noCameraCollision = true
    puffs.raycast = () => {}
    puffs.frustumCulled = false
    vents.add(puffs)
    vents.position.set(0, ROOF_Y, VENT_Z)
    root.add(vents)
    const dummy = new THREE.Object3D()
    registerCargoHazard(vents, (t) => {
      const u = ((t / VENT_PERIOD) % 1 + 1) % 1
      // Down, lids lifting (warning wisps), full blast, lids closing.
      const lift = u < 0.2 ? 0 : u < 0.32 ? (u - 0.2) / 0.12 : u < 0.9 ? 1 : 1 - (u - 0.9) / 0.1
      ventSteam = u < 0.32 ? (u < 0.2 ? 0 : 0.2) : u < 0.9 ? 1 : 0.3
      for (const hinge of lids) hinge.rotation.x = -lift * 1.1
      steamMat.opacity = ventSteam * 0.6
      puffs.visible = ventSteam > 0
      let i = 0
      for (const x of [-1.6, 0, 1.6]) {
        for (let k = 0; k < VENT_PUFFS; k++) {
          const v = (k / VENT_PUFFS + t * 1.5) % 1
          dummy.position.set(x + Math.sin(k * 2.1 + t * 3) * 0.2 * v, 0.2 + v * 2.4 * ventSteam, Math.cos(k * 1.3) * 0.2)
          dummy.scale.setScalar((0.15 + v * 0.45) * Math.max(0.3, ventSteam))
          dummy.updateMatrix()
          puffs.setMatrixAt(i++, dummy.matrix)
        }
      }
      puffs.instanceMatrix.needsUpdate = true
    })
  }

  // --- 5. Zipline over the last opening (Ghost) -------------------------------
  const ZIP_X = 1.55
  const zipFrom = roofZ(ROOF_RUN.openings[2][0] - 0.45)
  const zipTo = roofZ(ROOF_RUN.openings[2][1] + 0.6)
  const leverPad = new THREE.Vector3(-1.8, ROOF_Y + 0.03, roofZ(20.3))
  unregisters.push(timeSystem.registerGhostPad(leverPad, 0.56))
  const leverBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), darkIron)
  leverBase.position.set(leverPad.x, ROOF_Y + 0.03, leverPad.z)
  root.add(leverBase)
  const leverPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.04, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x8a6d34, roughness: 0.4, metalness: 0.85 })
  )
  leverPlate.position.set(leverPad.x, ROOF_Y + 0.08, leverPad.z)
  root.add(leverPlate)
  const releaseLever = new THREE.Group()
  const releaseArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), oldBrass)
  releaseArm.position.y = 0.4
  const releaseKnob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), darkIron)
  releaseKnob.position.y = 0.8
  releaseLever.add(releaseArm, releaseKnob)
  releaseLever.position.set(leverPad.x - 0.6, ROOF_Y, leverPad.z)
  root.add(releaseLever)
  const zipLampMat = new THREE.MeshStandardMaterial({
    color: 0xffb454, emissive: 0xff9a2a, emissiveIntensity: 1.2, roughness: 0.3
  })
  const zipCableY = ROOF_Y + 2.5
  for (const z of [zipFrom - 0.3, zipTo + 0.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8), darkIron)
    post.position.set(ZIP_X + 0.35, ROOF_Y + 1.3, z)
    root.add(post)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), darkIron)
    arm.position.set(ZIP_X + 0.15, zipCableY + 0.05, z)
    root.add(arm)
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, zipTo - zipFrom + 0.6, 6), darkIron)
  cable.rotation.x = Math.PI / 2
  cable.position.set(ZIP_X, zipCableY, (zipFrom + zipTo) / 2)
  root.add(cable)
  const zipLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), zipLampMat)
  zipLamp.position.set(ZIP_X + 0.35, ROOF_Y + 2.7, zipFrom - 0.3)
  root.add(zipLamp)
  // Trolley and grab handle; the interaction point is the handle's low end.
  const trolley = new THREE.Group()
  trolley.name = 'roof-zipline'
  const wheelBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.34), oldBrass)
  wheelBox.position.y = zipCableY - ROOF_Y - 1.2
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), ropeMat)
  strap.position.y = zipCableY - ROOF_Y - 1.65
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), darkIron)
  grip.rotation.x = Math.PI / 2
  grip.position.y = zipCableY - ROOF_Y - 2.0
  trolley.add(wheelBox, strap, grip)
  trolley.position.set(ZIP_X, ROOF_Y + 1.2, zipFrom)
  root.add(trolley)
  const ZIP_DURATION = 1.5
  let zipRide = -1 // seconds into the ride, or -1 when not riding
  let zipHintShown = false

  // --- 6. Final drawbridge (Freeze, then Ghost) -------------------------------
  addRoofCrates(28.2, 1.1, 0.5)
  const bridgePlatePos = new THREE.Vector3(1.8, ROOF_Y + 0.03, roofZ(30.3))
  unregisters.push(timeSystem.registerGhostPad(bridgePlatePos, 0.56))
  const bridgePlateBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), darkIron)
  bridgePlateBase.position.set(bridgePlatePos.x, ROOF_Y + 0.03, bridgePlatePos.z)
  root.add(bridgePlateBase)
  const bridgePlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.04, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x8a6d34, roughness: 0.4, metalness: 0.85 })
  )
  bridgePlate.position.set(bridgePlatePos.x, ROOF_Y + 0.08, bridgePlatePos.z)
  root.add(bridgePlate)
  const gapFrom = roofZ(ROOF_RUN.shell[1])
  const gapLen = V0 - gapFrom
  const drawbridge = new THREE.Group()
  drawbridge.name = 'roof-drawbridge'
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, gapLen + 0.3), roofWood)
  bridgeDeck.position.set(0, -0.06, (gapLen + 0.3) / 2)
  drawbridge.add(bridgeDeck)
  for (const e of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, gapLen + 0.3), darkIron)
    side.position.set(e * 0.76, -0.1, (gapLen + 0.3) / 2)
    drawbridge.add(side)
  }
  drawbridge.position.set(0, ROOF_Y, gapFrom - 0.15)
  root.add(drawbridge)
  const drawbridgeSupport = roofSupport()
  let drawbridgeDown = 0
  let drawbridgeLatched = false

  // Decor crates on the decks, clear of the obstacles; they collide.
  for (const [f, x] of [[7.4, -1.9], [15.8 + 1.2, 1.9], [26.6, -1.9]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), cargoWood)
    crate.position.set(x, ROOF_Y + 0.4, roofZ(f))
    crate.rotation.y = 0.15
    crate.castShadow = true
    root.add(crate)
    roofObstacles.push({ minX: x - 0.6, maxX: x + 0.6, minZ: roofZ(f) - 0.6, maxZ: roofZ(f) + 0.6 })
  }

  // Checkpoints along the roof, after each landing.
  const roofCheckpoints = [roofZ(8.0), roofZ(17.0), roofZ(26.8)]
  let lastRoofCheckpointZ = -Infinity

  function enterRoof() {
    section = 'roof'
    setBounds(env.roofBounds)
    useObstacles(roofObstacles)

    // The roof starts over Convergence and ends over the forward Vault car.
    const start = new THREE.Vector3(0, ROOF_Y, roof.zStart + 0.8)
    player.setPose(start, 0)
    lastRoofCheckpointZ = start.z
    respawn.setCheckpoint(start, 0, { restore: captureCheckpointRestore() })
    camera.setYaw?.(0)
    camera.snap()

    gustPhase = 0
    hud.setObjective('Cross the roof to the Vault drop hatch')
    hud.showBriefing?.([
      'You are outside. The roof runs across an open freight wagon to the Vault.',
      'Watch your footing — the gaps between the cars are real, and so is the drop.'
    ])
  }

  const zipHandle = new THREE.Group()
  zipHandle.position.set(ZIP_X - 0.3, ROOF_Y + 1.0, zipFrom)
  root.add(zipHandle)
  unregisters.push(interaction.register(zipHandle, {
    prompt: 'Ride the zipline',
    isEligible: () => section === 'roof' && zipRide < 0,
    onInteract: () => {
      const ghost = timeSystem.getGhost()
      const leverHeld = ghost.isOccupying(leverPad, 0.56) || playerOnPad(leverPad, 0.56)
      if (!leverHeld) {
        interaction.flashPrompt('The zipline brake is locked — something has to hold its release lever down.')
        return
      }
      zipRide = 0
    }
  }))

  unregisters.push(interaction.register(roof.dropHatch, {
    prompt: 'Drop into the forward Vault car',
    isEligible: () => section === 'roof',
    onInteract: () => enterVault()
  }))

  // --------------------------------------------------------------------------
  // VAULT — clear final carriage. Convergence carries the ability challenge;
  // the Core is exposed as the reward at the end of the run.
  // --------------------------------------------------------------------------
  const coreZ = spans.vault.maxZ - 2.6
  const core = createChronoCore()
  core.userData.noInteractionBlocker = true
  addProp(core, coreZ, 0, VAULT_DAIS_TOP)

  let taken = false
  let destabT = 0

  unregisters.push(interaction.register(core, {
    prompt: 'STEAL CHRONO CORE',
    isEligible: () => section === 'vault',
    onInteract: () => {
      if (taken) return
      taken = true
      beginCinematic?.()
      interaction.flashPrompt('Chrono Core secured!')
      hud.setObjective('TEMPORAL CONTAINMENT LOST — the train is destabilising')
      hud.showBriefing?.([
        'You have it. Containment is gone and the whole train is going with it — hold on.'
      ])
    }
  }))

  // The Vault's trunks, plus the dais — the Core is taken from its edge.
  const vaultObstacles = [
    ...env.colliders,
    { minX: -1.3, maxX: 1.3, minZ: coreZ - 1.3, maxZ: coreZ + 1.3 }
  ]

  function enterVault() {
    section = 'vault'
    setBounds(env.vaultBounds)
    useObstacles(vaultObstacles)

    const p = new THREE.Vector3(0, 0, spans.vault.minZ + 1.1)
    player.setPose(p, 0)
    respawn.setCheckpoint(p, 0, { restore: captureCheckpointRestore() })
    camera.setYaw?.(0)
    camera.snap()

    hud.setObjective('The Chrono Core is exposed — take it')
    hud.showBriefing?.([
      'Vault car. Convergence is behind you.',
      'The Core is exposed ahead.'
    ])
  }

  // [z, depth, lane] per hazard — see addChokepoint.
  const chokepoints = [
    [scannerZ, 0.9],
    ...steamBanks.map((bank) => [bank.z, 1.0]),
    [(relayGateZ - 0.4 + spans.relay.maxZ) / 2, spans.relay.maxZ - relayGateZ + 0.4],
    // The crate and pallet swing past the old lane; the wider lane still
    // leaves no spot either one can't reach.
    // The crates swing past the old lane; the wider lane still leaves no spot
    // one can't reach.
    ...hangingCrates.map(({ z }) => [z, 1.4, 1.15]),
    ...luggageStacks.map(({ z }) => [z, 1.3]),
    ...barrierPanels.map(({ z }) => [z + PANEL_LEN / 2, PANEL_LEN + 0.35]),
    [pitZ, CARGO_PIT.halfZ * 2 + 0.2],
    ...dropGates.map(({ z }) => [z, 0.9]),
    ...railCrates.map(({ machine }) => [machine.z, RAIL_CRATE_D + 0.4]),
    ...mechPlatforms.map(({ z, halfZ }) => [z, halfZ * 2 + 0.2]),
    ...slideDoors.map(({ machine }) => [machine.z, 0.8]),
    ...wallPanelPairs.map(({ machine }) => [machine.z, 0.8]),
    ...cageGates.map(({ z }) => [z, CAGE_DEPTH + 0.3]),
    [switchDoor.z, 0.8],
    [exitDoor.z, 0.8]
  ]
  for (const [z, depth, lane] of chokepoints) addChokepoint(z, depth, lane)

  // Initial section setup.
  setBounds(env.interiorBounds)
  useObstacles(corridorObstacles)

  const orb = core.getObjectByName('chrono-core-orb')
  const coreRingA = core.getObjectByName('chrono-core-ring-a')
  const coreRingB = core.getObjectByName('chrono-core-ring-b')
  const halo = core.getObjectByName('chrono-core-halo')
  let elapsed = 0

  // The level owns puzzle restoration. Transient hazards return to a known,
  // solvable phase while durable progress captured at the checkpoint remains.
  function captureCheckpointRestore() {
    const saved = {
      section, bounds: { ...bounds }, lastCheckpointZ,
      abilityState: { ...abilityState }, interfaceTaken, ghostTaken, freezeTaken, rewindTaken,
      relayLogged, relaySolved, relayInput: [...relayInput],
      hatchRepaired,
      switchDoorLatched: switchDoor.latched, exitDoorLatched: exitDoor.latched, drawbridgeLatched,
      hazards: checkpointHazards.map((hazard) => hazard.getSnapshot())
    }
    return () => {
      section = saved.section
      setBounds(saved.bounds)
      useObstacles(section === 'roof' ? roofObstacles : section === 'vault' ? vaultObstacles : corridorObstacles)
      lastCheckpointZ = saved.lastCheckpointZ
      corridorStealth.reset()
      checkpointHazards.forEach((hazard, index) => hazard.restoreSnapshot(saved.hazards[index]))
      Object.assign(abilityState, saved.abilityState)
      interfaceTaken = saved.interfaceTaken
      ghostTaken = saved.ghostTaken
      freezeTaken = saved.freezeTaken
      rewindTaken = saved.rewindTaken
      interfaceBeacon.visible = !interfaceTaken
      ghostPickup.setCollected(ghostTaken)
      freezePickup.setCollected(freezeTaken)
      rewindPickup.setCollected(rewindTaken)
      hud.setChronoVisible?.(interfaceTaken)
      timeSystem.setStrainEnabled(freezeTaken)
      relayLogged = saved.relayLogged
      relaySolved = saved.relaySolved
      relayInput.splice(0, relayInput.length, ...saved.relayInput)
      routeEngaged = 0
      routeReadT = 0
      boardReveal = relayLogged ? 1 : 0
      relayGateOpen = relaySolved ? 1 : 0
      applyRouteDoor()
      hatchRepaired = saved.hatchRepaired
      switchDoor.latched = saved.switchDoorLatched
      exitDoor.latched = saved.exitDoorLatched
      for (const door of [switchDoor, exitDoor]) {
        door.open = door.latched ? 1 : 0
        door.apply()
      }
      rearmTimers.hatch = 0
      taken = false
      destabT = 0
      failCooldown = 0
      gustPhase = 0
      zipRide = -1
      drawbridgeLatched = saved.drawbridgeLatched
      drawbridgeDown = drawbridgeLatched ? 1 : 0
      root.rotation.z = 0
      root.position.y = 0
    }
  }

  // Only the lights nearest the player are real; see core/light-pool.js.
  const lightPool = createLightPool({ root, size: 12 })

  // Only the parts of the train the camera could see are drawn; see
  // environment/carriage-culling.js. Built here, once every prop is placed.
  const culling = createCarriageCulling({
    root,
    spans,
    carriages: env.carriages,
    // Passenger to Convergence open into each other; the Vault is sealed.
    chains: [['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence'], ['vault']],
    wallX: WALL_X,
    doorW: DOOR_W,
    ceilingY: CARRIAGE_CEILING_Y
  })
  const previousBeforeRender = scene.onBeforeRender
  const previousAfterRender = scene.onAfterRender
  const cullBeforeRender = (renderer, renderScene, renderCamera) => culling.beforeRender(renderCamera)
  const cullAfterRender = () => culling.afterRender()
  scene.onBeforeRender = cullBeforeRender
  scene.onAfterRender = cullAfterRender

  // Dev start (main.js ?start=<carriage>): begin at a later carriage with
  // everything before it already done — its ability collected, its door
  // solved, and its briefings marked as seen.
  const STAGES = ['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence', 'roof', 'vault']
  const startStage = Math.max(0, STAGES.indexOf(startAt))
  let startPos = new THREE.Vector3(0, 0, spans.passenger.minZ + 2.2)
  let startObjective = 'Move toward the FRONT of the train — reach Security and acquire the glowing blue Chrono Interface.'
  if (startStage > 0) {
    const done = (key) => STAGES.indexOf(key) < startStage
    if (done('security')) {
      interfaceTaken = true
      interfaceBeacon.visible = false
      unlockAbility('SLOW')
    }
    if (done('relay')) {
      ghostTaken = true
      ghostPickup.setCollected(true)
      unlockAbility('GHOST')
      relayLogged = true
      relaySolved = true
      boardReveal = 1
      relayGateOpen = 1
      applyRouteDoor()
    }
    if (done('cargo')) {
      freezeTaken = true
      freezePickup.setCollected(true)
      unlockAbility('FREEZE')
      timeSystem.setStrainEnabled(true)
    }
    if (done('mechanical')) {
      rewindTaken = true
      rewindPickup.setCollected(true)
      unlockAbility('REWIND')
    }
    for (const key of STAGES.slice(0, startStage)) hintsShown.add(key)
    introShown = true
    startObjective = `Dev start: ${STAGES[startStage]}`
    if (STAGES[startStage] === 'vault') {
      switchDoor.latched = true
      exitDoor.latched = true
      drawbridgeLatched = true
      section = 'vault'
      setBounds(env.vaultBounds)
      useObstacles(vaultObstacles)
      startPos = new THREE.Vector3(0, 0, spans.vault.minZ + 1.1)
    } else if (STAGES[startStage] === 'roof') {
      switchDoor.latched = true
      exitDoor.latched = true
      section = 'roof'
      setBounds(env.roofBounds)
      useObstacles(roofObstacles)
      startPos = new THREE.Vector3(0, CARRIAGE_ROOF_Y, roof.zStart + 0.8)
      lastRoofCheckpointZ = startPos.z
    } else {
      startPos = new THREE.Vector3(0, 0, spans[STAGES[startStage]].minZ + 1.2)
      lastCheckpointZ = startPos.z
    }
  }

  return {
    objective: startObjective,
    checkpoint: {
      position: startPos,
      yaw: 0,
      restore: captureCheckpointRestore()
    },
    bounds,
    obstacles: activeObstacles,
    // Roof run only: deck gaps are voids, and bridges / panels stand over them.
    get supports() { return section === 'roof' ? roofSupports : null },
    get voids() { return section === 'roof' ? roofVoids : null },
    getCarriageVolumes: () => listCarriageVolumes(spans),
    get isCinematic() { return taken },

    update(delta) {
      sky.update(delta, timeSystem)
      outdoorEnv.update(delta)
      env.update(delta)
      corridorStealth.update(delta)
      lightPool.update(player.mesh.position, delta)
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
      const ghost = timeSystem.getGhost()
      const topY = playerTopY()

      if (!introShown) {
        introShown = true
        hud.showBriefing?.([
          'Comms check. You are on the 03:14 Chrono Express, and the clock in the vault car is the only reason anyone robs this train.',
          'Work your way to the front. I will tell you what each car wants from you — figuring out how is your job.'
        ])
      }

      // A replaying echo reads as a person to anything that watches for one,
      // so the Passenger guard can react to a moving temporal decoy.
      corridorStealth.setDistraction(ghost.isPlaying() ? ghost.getPosition() : null)

      // Route Control. The operator platform drives the route system; only an
      // echo can hold it while the player stands at the board a dozen metres away.
      const platformHeld =
        ghost.isOccupying(platformPos, 0.56) ||
        playerOnPad(platformPos, 0.56)
      routeEngaged += ((platformHeld ? 1 : 0) - routeEngaged) * Math.min(1, delta * 4)
      platformPlate.position.y = platformHeld ? 0.075 : 0.1
      platformLever.rotation.x = -0.7 + routeEngaged * 1.4
      platformLampMat.color.setHex(platformHeld ? 0x7ee08a : 0xffb454)
      platformLampMat.emissive.setHex(platformHeld ? 0x3fbf5a : 0xff9a2a)
      gearSpin.rotation.z -= delta * routeEngaged * 1.8

      // Say once that the hold worked, and state the constraint — the board
      // is at the front and the hold ends when the platform is clear.
      if (platformHeld && !routeEverEngaged) {
        routeEverEngaged = true
        hud.showBriefing?.([
          'Operator hold engaged — the route system is live.',
          'The route board over the front door has turned its plates. It turns back the moment the platform is clear.'
        ])
      }

      // Board plates flip in a short cascade; once logged they stay turned.
      const boardTarget = routeEngaged > 0.5 || relayLogged ? 1 : 0
      boardReveal += (boardTarget - boardReveal) * Math.min(1, delta * 3)
      flipPlates.forEach((flip, i) => {
        const t = THREE.MathUtils.clamp(boardReveal * 1.6 - i * 0.2, 0, 1)
        flip.rotation.x = t * Math.PI
      })

      // Reading the turned board up close logs the order.
      const nearBoard = pp.z < relayGateZ && relayGateZ - pp.z < ROUTE_READ_RANGE
      if (!relayLogged && boardReveal > 0.97 && nearBoard) {
        routeReadT += delta
        if (routeReadT >= ROUTE_READ_SECONDS) {
          relayLogged = true
          hud.showToast('ROUTING ORDER LOGGED — relays latched open. Throw them in order, I to IV.', 3400)
          hud.setObjective('Route Control — throw relays A–D in the order shown: I, II, III, IV')
        }
      }

      // Relay boxes: open while engaged, latched once logged. Levers show
      // thrown steps; gauges wake with the system.
      const boxesOpen = routeEngaged > 0.5 || relayLogged || relaySolved
      for (const box of relayBoxes) {
        box.open += ((boxesOpen ? 1 : 0) - box.open) * Math.min(1, delta * 4)
        box.hinge.rotation.y = -1.9 * box.open
        const thrown = relaySolved || relayInput.includes(box.index)
        box.throw += ((thrown ? 1 : 0) - box.throw) * Math.min(1, delta * 8)
        box.lever.rotation.z = 0.7 - box.throw * 1.4
        const live = Math.max(routeEngaged, relayLogged ? 1 : 0)
        box.needle.rotation.z = 1.1 - live * (1.6 + Math.sin(elapsed * 3 + box.index) * 0.08)
        box.lampMat.color.setHex(thrown ? 0x7ee08a : live > 0.5 ? 0xffb454 : 0x5a1a12)
        box.lampMat.emissive.setHex(thrown ? 0x3fbf5a : live > 0.5 ? 0xff9a2a : 0x7a1c10)
        box.lampMat.emissiveIntensity = thrown || live > 0.5 ? 1.4 : 0.6
      }
      gearGauge.userData.needle.rotation.z = 1.1 - routeEngaged * 1.7

      // Front door slides apart once the route is set.
      relayGateOpen += ((relaySolved ? 1 : 0) - relayGateOpen) * Math.min(1, delta * 3)
      applyRouteDoor()
      if (
        !relaySolved &&
        pp.z > relayGateZ - 0.48 &&
        pp.z < spans.relay.maxZ
      ) {
        pp.z = relayGateZ - 0.48
      }

      // Rewind outlines: shown while a machine is away from its parked
      // position and the player is close enough for it to matter.
      for (const m of rewindMachines) {
        const show = m.p > 0.02 && Math.abs(pp.z - m.z) < 14
        for (const outline of m.outlines) outline.visible = show
      }

      // Core idle animation and shader reaction.
      orb.rotation.y += delta * 0.7
      orb.rotation.x += delta * 0.3
      orb.position.y = 1.34 + Math.sin(elapsed * 1.6) * 0.05
      halo.rotation.z += delta * 1.1
      halo.position.y = orb.position.y
      coreRingA.rotation.y += delta * 0.6
      coreRingA.rotation.x = 0.4
      coreRingB.rotation.x += delta * 0.45
      for (const m of core.userData.shaderMats) {
        if (!m.customUniforms) continue

        m.customUniforms.uTime.value += delta
        m.customUniforms.uMode.value = MODE_INT[mode] ?? 0
        m.customUniforms.uIntensity.value =
          mode === 'NORMAL' ? 0.25 : 0.9
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
          [
            'You’re aboard. Seven cars between you and the Chrono Core, and the Express does not stop for anyone.',
            'Every bulkhead on this train opens from the rear only. Once you’re through one, forward is the only direction left.',
            'First-class carriage. The conductor walks the aisle end to end and pauses at each end — and you have no chrono gear yet.',
            'Duck into the booths while he passes, move while his back is turned, and make for the front door.'
          ]
        )
        hint(
          'security',
          pp.z,
          spans.security.minZ,
          [
            'Security car. There is a maintenance interface in here wired straight into the train’s Chrono Core.',
            'Take it and you can start bending the clock. Past that point the systems run faster than anyone can react to.'
          ]
        )
        hint(
          'relay',
          pp.z,
          spans.relay.minZ,
          [
            'Route Control. The forward door stays locked until the relays are thrown in the right order.',
            'The order is posted on the route board over the door, but the board only turns while the operator platform at the back is held down.',
            'There is one more module in here. You will want it before you try.'
          ]
        )
        hint(
          'cargo',
          pp.z,
          spans.cargo.minZ,
          [
            'Cargo. Every load in this car is moving — crates on the ceiling rails, luggage on the floor, gates and panels on the walls.',
            'Nothing in here waits for you. Read each cycle before you step in. The last stretch runs three of them at once.'
          ]
        )
        hint(
          'mechanical',
          pp.z,
          spans.mechanical.minZ,
          [
            'Mechanical. The machinery in here springs shut as you approach — crates, floor sections, doors and wall panels.',
            'Install Rollback. REWIND runs a machine back to where it was; the pale outline shows where that is.',
            'It springs again the moment time runs forward, so be ready to move.'
          ]
        )
        hint(
          'convergence',
          pp.z,
          spans.convergence.minZ,
          [
            'Convergence — the last car before the Core. Every Chrono ability, once each, then all four together.',
            'The roof ladder is past the exit door at the far end. That door only opens while its switch is held.'
          ]
        )

        for (const z of corridorCheckpoints) {
          if (pp.z > z && z > lastCheckpointZ) {
            lastCheckpointZ = z
            respawn.setCheckpoint(new THREE.Vector3(0, 0, z), 0, {
              restore: captureCheckpointRestore()
            })
          }
        }

        // Security obstacle 1:
        // The security panel slides LEFT <-> RIGHT across the aisle.
        // SLOW makes the slide much easier to read, while the player
        // remains at normal movement speed. The 0.15 pad is body width.
        const beamWorldX =
          scanner.position.x +
          scanBeam.position.x

        if (
          Math.abs(pp.z - scannerZ) < 0.3 &&
          Math.abs(pp.x - beamWorldX) < SCAN_PANEL_W / 2 + 0.15
        ) {
          failSoft(
            'The security panel knocked you back — SLOW it and cross on the opposite side.'
          )
        }

        // Security obstacle 2: steam vents. Only a full burst knocks you
        // back; the warning plume is safe to walk through.
        for (const bank of steamBanks) {
          if (Math.abs(pp.z - bank.z) < 0.5 && bank.density > 0.5) {
            failSoft('Scalded by the steam vents — wait for the gap, or SLOW them.')
          }
        }

        // Cargo: every load is a Freeze timing problem. Body pads of ~0.2 m
        // are folded into each test.
        for (const { load, z } of hangingCrates) {
          if (
            Math.abs(pp.z - z) < CRATE_HALF + 0.2 &&
            Math.abs(pp.x - load.position.x) < CRATE_HALF + 0.2
          ) failSoft('A hanging crate knocked you down — FREEZE it once it has cleared your side.')
        }
        for (const { stack, z } of luggageStacks) {
          if (
            Math.abs(pp.z - z) < STACK_HALF_Z + 0.2 &&
            Math.abs(pp.x - stack.position.x) < STACK_HALF_X + 0.2
          ) failSoft('The luggage stack slid into you — FREEZE it while it is tucked away.')
        }
        for (const pair of barrierPanels) {
          if (panelHits(pair, pp.x, pp.z)) {
            failSoft('A barrier panel swung into you — FREEZE the panels while they are open.')
          }
        }
        if (
          Math.abs(pp.z - pitZ) < CARGO_PIT.halfZ - 0.1 &&
          Math.abs(pp.x - floorPlatform.position.x) > PLATFORM_HALF_X - 0.05
        ) {
          failSoft('You fell into the cargo well — FREEZE the platform when it lines up.', 'fell')
        }
        for (const { z, bottom } of dropGates) {
          if (Math.abs(pp.z - z) < 0.3 && bottom < topY + 0.05) {
            failSoft('The drop gate came down on you — FREEZE it while it is raised.')
          }
        }

        // Mechanical: a machine springing into the player knocks them back;
        // one that has finished springing simply blocks, through its collider.
        for (const { machine, box } of [...railCrates, ...slideDoors]) {
          if (machine.moving && insideBox(box, pp.x, pp.z)) {
            failSoft('The machinery sprang into you — REWIND it, then move while it is open.')
          }
        }
        for (const { machine, leaves } of wallPanelPairs) {
          if (machine.moving && leaves.some(({ box }) => insideBox(box, pp.x, pp.z))) {
            failSoft('The wall panels closed on you — REWIND them, then move while they are open.')
          }
        }
        for (const { platform, z, halfZ } of mechPlatforms) {
          if (
            Math.abs(pp.z - z) < halfZ - 0.1 &&
            Math.abs(pp.x - platform.position.x) > MECH_PLATFORM_HALF_X - 0.05
          ) {
            failSoft('The floor platform slid away — REWIND it back over the well.', 'fell')
          }
        }

        // Mechanical obstacle 3: the hatch motor fails shut near the ladder.
        // This one is the car's only exit, so its failsafe matters most.
        if (
          hatchOpen < 0.99 &&
          readyToRearm('hatch', pp.z < spans.convergence.maxZ - 5.0, delta)
        ) {
          hatchOpen = 1
          hatchBroken = false
          hatchCover.position.x = -1.15
        }
        if (
          mode !== 'REWIND' && mode !== 'FREEZE' &&
          !hatchRepaired && !hatchBroken && pp.z > spans.convergence.maxZ - 4.0
        ) hatchBroken = true

        // Convergence cage gates: only a raised cage is safe to be inside.
        for (const { z, bottom } of cageGates) {
          if (Math.abs(pp.z - z) < CAGE_DEPTH / 2 + 0.1 && bottom < topY + 0.05) {
            failSoft('The cage gate dropped on you — SLOW it to hold the gap open.')
          }
        }

        // Twin switches latch their door once both are weighted together.
        const stationHeld = (station) =>
          ghost.isOccupying(station.pos, 0.56) || playerOnPad(station.pos, 0.56)
        switchOne.update(stationHeld(switchOne))
        switchTwo.update(stationHeld(switchTwo))
        exitSwitch.update(stationHeld(exitSwitch))
        if ((switchOne.held || switchTwo.held) && !switchDoor.latched && !switchHintShown) {
          switchHintShown = true
          hud.showToast('Switch engaged — its partner must be held at the same moment.', 3200)
        }
        if (switchOne.held && switchTwo.held && !switchDoor.latched) {
          switchDoor.latched = true
          hud.showToast('BOTH SWITCHES HELD — the door is open', 2400)
        }
        // The exit door only stands open while switch 3 is weighted, and
        // latches once the player is through it.
        if (!exitDoor.latched && pp.z > exitDoor.z + 0.5) {
          exitDoor.latched = true
          hud.setObjective('Climb to the roof — the Chrono Core is in the Vault ahead')
        }
        for (const door of [switchDoor, exitDoor]) {
          const target = door.latched || (door === exitDoor && exitSwitch.held) ? 1 : 0
          door.open += (target - door.open) * Math.min(1, delta * 4)
          door.apply()
          if (door.open < 0.7 && pp.z > door.z - 0.48 && pp.z < door.z + 0.3) {
            pp.z = door.z - 0.48
          }
        }
      }

      roofSun.intensity = section === 'roof' ? 2.2 : 0
      roofSky.intensity = section === 'roof' ? 1.3 : 0

      if (section === 'roof') {
        // Slipstream streaks pulse with the gusts; SLOW calms them.
        gustPhase += delta * (mode === 'SLOW' ? 0.16 : 1)
        const gust = Math.pow(Math.max(0, Math.sin(gustPhase * 1.7)), 0.6)
        roof.streaks.forEach((s) => {
          s.material.opacity = 0.04 + gust * 0.2
        })

        // Falling through a gap or an opening.
        if (pp.y < ROOF_Y - 1.0 && zipRide < 0) {
          failSoft('You fell between the cars.', 'fell')
        }

        for (const z of roofCheckpoints) {
          if (pp.z > z && z > lastRoofCheckpointZ && pp.y > ROOF_Y - 0.2) {
            lastRoofCheckpointZ = z
            respawn.setCheckpoint(new THREE.Vector3(0, ROOF_Y, z), 0, {
              restore: captureCheckpointRestore()
            })
          }
        }

        for (const { pair, z } of roofCrates) {
          if (Math.abs(pp.z - z) < ROOF_CRATE_D / 2 + 0.2 && pp.y < ROOF_Y + 1.1) {
            for (const ox of [-0.8, 0.8]) {
              if (Math.abs(pp.x - (pair.position.x + ox)) < ROOF_CRATE_W / 2 + 0.2) {
                failSoft('A cargo crate ran you down — FREEZE the pair while the gap is on your side.')
              }
            }
          }
        }

        if (Math.abs(pp.z - VENT_Z) < 0.75 && ventSteam > 0.5) {
          failSoft('The vents blasted you — FREEZE them while the hatches are shut.')
        }

        // Zipline: the brake only releases while the lever plate is weighted.
        const leverHeld =
          ghost.isOccupying(leverPad, 0.56) || playerOnPad(leverPad, 0.56)
        leverPlate.position.y = leverHeld ? ROOF_Y + 0.055 : ROOF_Y + 0.08
        releaseLever.rotation.x = leverHeld ? 0.9 : -0.3
        zipLampMat.color.setHex(leverHeld ? 0x7ee08a : 0xffb454)
        zipLampMat.emissive.setHex(leverHeld ? 0x3fbf5a : 0xff9a2a)
        if (leverHeld && !zipHintShown) {
          zipHintShown = true
          hud.showToast('Zipline brake released — it locks again the moment the lever lifts.', 3000)
        }
        if (zipRide >= 0) {
          zipRide += delta
          const k = Math.min(1, zipRide / ZIP_DURATION)
          const e = k * k * (3 - 2 * k)
          const z = zipFrom + (zipTo - zipFrom) * e
          const y = ROOF_Y - Math.sin(k * Math.PI) * 0.35
          trolley.position.set(ZIP_X, y + 1.2, z)
          // Pin the rider to the trolley; the player's own update can't move them.
          pp.set(ZIP_X - 0.15, y, z)
          setBounds({ minX: pp.x, maxX: pp.x, minZ: z, maxZ: z })
          if (k >= 1) {
            zipRide = -1
            setBounds(env.roofBounds)
            player.setPose(new THREE.Vector3(ZIP_X - 0.15, ROOF_Y, zipTo), 0)
          }
        } else if (trolley.position.z !== zipFrom && pp.z < zipFrom) {
          trolley.position.set(ZIP_X, ROOF_Y + 1.2, zipFrom)
        }

        // Drawbridge lowers while its plate is weighted, and stays down once
        // the player is across.
        const plateHeld =
          ghost.isOccupying(bridgePlatePos, 0.56) || playerOnPad(bridgePlatePos, 0.56)
        bridgePlate.position.y = plateHeld ? ROOF_Y + 0.055 : ROOF_Y + 0.08
        if (!drawbridgeLatched && pp.z > V0 + 0.6 && pp.y > ROOF_Y - 0.2) drawbridgeLatched = true
        const bridgeTarget = plateHeld || drawbridgeLatched ? 1 : 0
        drawbridgeDown += (bridgeTarget - drawbridgeDown) * Math.min(1, delta * 2.5)
        drawbridge.rotation.x = -(1 - drawbridgeDown) * Math.PI / 2
        placeSupport(drawbridgeSupport, 0, 0.8, gapFrom, V0 + 0.2, drawbridgeDown > 0.93)
      }
    },

    dispose() {
      if (scene.onBeforeRender === cullBeforeRender) scene.onBeforeRender = previousBeforeRender
      if (scene.onAfterRender === cullAfterRender) scene.onAfterRender = previousAfterRender
      unregisters.forEach((fn) => fn())
      timeSystem?.setStrainEnabled?.(false)
      outdoorEnv.dispose()
      sky.dispose()
      corridorStealth.dispose()
      scene.remove(sky.mesh, outdoorEnv.group, root)
      disposeObject(root)
    }
  }
}

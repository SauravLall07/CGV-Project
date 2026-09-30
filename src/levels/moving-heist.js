import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y, CARRIAGE_ROOF_Y, listCarriageVolumes, makeHourglassEmblem } from '../environment/carriages.js'
import {
  WALL_X,
  HAZARD_AISLE_X,
  RELAY_BOX_DEPTH,
  RELAY_BOX_WIDTH,
  CARGO_PIT,
  routeControlLayout
} from '../environment/carriage-bounds.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { createStealthSystem } from '../systems/stealth.js'
import { signMaterial } from '../environment/textures.js'

// Level 2 — "The Moving Heist".
//
// Physical progression is deliberately one-way: REAR -> FRONT.
// Passenger -> Security -> Relay -> Cargo -> Mechanical -> Convergence -> Roof -> Vault.
//
// Ability progression is equally deliberate:
// Passenger  : no powers; reuse Level 1 timing/stealth instincts.
// Security   : acquire the Chrono Interface -> unlock SLOW.
// Relay      : acquire the Echo Synchronizer -> unlock GHOST, and immediately
//              need it: the route board only turns while the operator
//              platform is weighted, and the platform is nowhere near it.
// Cargo      : acquire the Cryo Phase module -> unlock FREEZE, which also
//              switches on Chrono Strain while the player crosses moving loads.
// Mechanical : acquire the Rollback module -> unlock REWIND, plus a twin-plate
//              drive clamp that only a Ghost can hold open with you.
// Convergence: the hardest carriage; every ability is required before the roof.
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

// Small engraved plaque with a single letter, lit so it reads at a distance.
function makeLabelPlate(letter, size = 0.16) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    signMaterial({
      text: letter,
      background: 0x0f172a,
      foreground: 0xe2e8f0,
      width: 128,
      height: 128,
      emissiveIntensity: 1.6
    })
  )
  return mesh
}

function makePressurePlate(size = 0.9) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.3
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), mat)
  mesh.userData.plateMat = mat
  return mesh
}

// Rotor hazards are a single bar through a hub, not a four-armed cross.
//
// A cross this wide in a 1.6 m aisle has no safe phase at all — every angle
// puts an arm across the player — which is exactly why these hazards used to
// need a `mode === 'NORMAL'` check to be passable. A two-armed bar leaves a
// genuine window: roughly a quarter of each rotation standing, and about half
// of it crouched, since a horizontal bar passes over a ducking player.
//
// ROTOR_ARMS / ROTOR_RADIUS / ROTOR_HUB_Y are shared by the mesh and the
// collision test on purpose. If the geometry and the maths drift apart the
// hazard becomes unreadable, so change them here and nowhere else.
const ROTOR_ARMS = 2
const ROTOR_RADIUS = 0.9
const ROTOR_HUB_Y = 1.55

function makeRotor(accent = 0x38bdf8, radius = ROTOR_RADIUS) {
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

  const bar = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, 0.09, 0.09), beamMat)
  g.add(bar)

  // Counterweights on the tips so the bar's angle stays readable at speed.
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), beamMat)
    cap.position.x = side * radius
    g.add(cap)
  }

  return g
}

// ---------------------------------------------------------------------------
// Rotor hazard geometry.
//
// The spinning hazards used to fail on `mode === 'NORMAL'`, which made every
// chrono ability an equally valid answer and Freeze the strictly safest one.
// These helpers replace that with real geometry: an arm either overlaps the
// player's body column or it doesn't. Normal time leaves a window too tight to
// read, Slow makes it readable, and Freeze only works if you stop the rotor on
// a gap — freezing it mid-arm leaves the aisle blocked until you pay to unfreeze.
// ---------------------------------------------------------------------------

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq < 1e-8) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const cross = (ox, oy, px, py, qx, qy) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox)
  const d1 = cross(ax, ay, bx, by, cx, cy)
  const d2 = cross(ax, ay, bx, by, dx, dy)
  const d3 = cross(cx, cy, dx, dy, ax, ay)
  const d4 = cross(cx, cy, dx, dy, bx, by)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

function segmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0
  return Math.min(
    pointSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointSegmentDistance(bx, by, cx, cy, dx, dy),
    pointSegmentDistance(cx, cy, ax, ay, bx, by),
    pointSegmentDistance(dx, dy, ax, ay, bx, by)
  )
}

// A rotor is a cross of `arms` beams spinning in the XY plane about
// (centreX, centreY). The player is a vertical column at `playerX` reaching up
// to `playerTopY`, so crouching genuinely shrinks the profile the arms can hit.
function rotorBlocks({
  angle,
  radius,
  centreX = 0,
  centreY,
  playerX,
  playerTopY,
  clearance = 0.3,
  arms = ROTOR_ARMS
}) {
  for (let i = 0; i < arms; i++) {
    const a = angle + (i / arms) * Math.PI * 2
    const tipX = centreX + Math.cos(a) * radius
    const tipY = centreY + Math.sin(a) * radius
    const d = segmentDistance(
      centreX, centreY, tipX, tipY,
      playerX, 0, playerX, playerTopY
    )
    if (d < clearance) return true
  }
  return false
}

export function createMovingHeistLevel({
  scene, interaction, timeSystem, hud, player, camera, respawn, advance, beginCinematic
}) {

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
  // timeSystem makes the guard obey Slow and Freeze.
  const corridorStealth =
    createStealthSystem({
      scene,
      player,
      respawn,
      hud,
      collidables: guardCollidables,
      obstacles: corridorObstacles,
      timeSystem
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
    spans.convergence.minZ + 1.0
  ]

  // --------------------------------------------------------------------------
  // PASSENGER — STEALTH / COVER
  // No Chrono powers yet. The seat rows down both sides of the car (built and
  // collided in carriages.js) are the cover: crouch in a legroom gap and the
  // seat backs break the guard's line of sight.
  //
  // The guard used to start at minZ + 3.4, which is 1.2 m from the player's
  // spawn at minZ + 2.2 — inside GUARD_LOCK_ON_DISTANCE. He hard-locked on
  // before the player could take a step, which read as being caught for no
  // reason.
  // --------------------------------------------------------------------------

  // The conductor now walks the forward quarter of the car, down the aisle
  // and 11 m from the spawn — outside GUARD_VISION_DISTANCE, so
  // the player meets him on their own terms.
  corridorStealth.addGuard({
    waypoints: [
      new THREE.Vector3(
        0.42,
        0,
        spans.passenger.center + 3.0
      ),

      new THREE.Vector3(
        0.42,
        0,
        spans.passenger.maxZ - 2.5
      )
    ],

    speed: 1.15,
    waitTime: 2.8,
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
  function addHangingCrate(localZ, period, phase) {
    const z = cargoZ(localZ)
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
  // Three main challenges: fallen plank, pad-powered block, hatch motor.
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
  mechBridge.name = 'mechanical-rewind-plank'
  let bridgeY = -3.2
  let bridgeRepaired = false
  mechBridge.position.set(0, bridgeY, bridgeZ)
  root.add(mechBridge)

  const pitGeometry = new THREE.BoxGeometry(1.45, 3.4, 2.8)
  // Open top; interior faces show the plank rising out of the well.
  const pitIndices = pitGeometry.getIndex().array
  pitGeometry.setIndex(pitGeometry.groups
    .filter((group) => group.materialIndex !== 2)
    .flatMap((group) => Array.from(pitIndices.slice(group.start, group.start + group.count))))
  pitGeometry.clearGroups()
  const bridgePit = new THREE.Mesh(pitGeometry,
    new THREE.MeshStandardMaterial({ color: 0x151923, roughness: 1, side: THREE.BackSide }))
  bridgePit.position.set(0, -1.7, bridgeZ)
  bridgePit.userData.noCameraCollision = true
  root.add(bridgePit)

  // This failure predates the player's arrival. Reverse its fall directly,
  // so it needs no live recording and cannot time out while waiting to repair.
  unregisters.push(timeSystem.register(null, {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale >= 0 || bridgeRepaired || section !== 'interior' ||
          player.mesh.position.z < spans.mechanical.minZ ||
          player.mesh.position.z > spans.mechanical.maxZ) return
      bridgeY = Math.min(0.06, bridgeY - scaledDelta * 1.5)
      mechBridge.position.y = bridgeY
      if (bridgeY >= 0.06) {
        bridgeRepaired = true
        hud.showToast('PLANK RESTORED — stable and safe to cross', 2200)
      }
    }
  }))

  const slamGate = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x343a42, metalness: 0.86, roughness: 0.36 })
  )
  const slamGateZ = spans.mechanical.center + 0.8
  let slamGateY = 0.75
  slamGate.name = 'mechanical-pad-block'
  slamGate.position.set(0, slamGateY, slamGateZ)
  root.add(slamGate)
  const padBlockObstacle = {
    minX: -1.1, maxX: 1.1,
    minZ: slamGateZ - 0.48, maxZ: slamGateZ + 0.48
  }
  corridorObstacles.push(padBlockObstacle)

  const mechBlade = makeRotor(0x38bdf8)
  const mechBladeZ = spans.mechanical.maxZ - 6.0
  addProp(mechBlade, mechBladeZ, 0, ROTOR_HUB_Y)
  let mechBladeA = 0
  unregisters.push(registerHazard(mechBlade, {
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

  // ------------------------------------------------------------------
  // DRIVE CLAMP — TWIN SYNC PLATES (Time Ghost)
  //
  // Two plates six metres apart that must be weighted at the SAME moment.
  // Neither sits on the route, so you cannot solve it by walking through:
  // summon an echo on A to hold the intervening block up, then move to B.
  // Unlike the Vault plate this one latches, so the door stays open once the
  // pair fires.
  // ------------------------------------------------------------------
  const syncPlateAPos = new THREE.Vector3(-0.56, 0.03, spans.mechanical.center - 3.1)
  const syncPlateBPos = new THREE.Vector3(0.56, 0.03, spans.mechanical.center + 2.9)

  const syncPlateA = makePressurePlate(0.86)
  syncPlateA.name = 'mechanical-sync-pad-a'
  const syncPlateAMat = syncPlateA.userData.plateMat
  syncPlateA.position.copy(syncPlateAPos)
  root.add(syncPlateA)

  const syncPlateB = makePressurePlate(0.86)
  syncPlateB.name = 'mechanical-sync-pad-b'
  const syncPlateBMat = syncPlateB.userData.plateMat
  syncPlateB.position.copy(syncPlateBPos)
  root.add(syncPlateB)
  unregisters.push(timeSystem.registerGhostPad(syncPlateAPos, 0.54))
  unregisters.push(timeSystem.registerGhostPad(syncPlateBPos, 0.54))
  for (const [pad, letter] of [[syncPlateA, 'A'], [syncPlateB, 'B']]) {
    const label = makeLabelPlate(letter, 0.32)
    label.rotation.x = -Math.PI / 2
    label.position.y = 0.03
    pad.add(label)
  }

  // Sits between the turbine blade and the roof ladder, so the clamp really is
  // the last thing standing between the player and the roof.
  const clampDoorZ = spans.mechanical.maxZ - 4.6
  const clampDoor = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 1.7, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x2f3742, metalness: 0.9, roughness: 0.35 })
  )
  clampDoor.name = 'mechanical-drive-clamp'
  addProp(clampDoor, clampDoorZ, 0, 1.05)

  // Status light on the clamp door, so "both plates at once" is legible.
  const clampLampMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 3
  })
  const clampLamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), clampLampMat)
  addProp(clampLamp, clampDoorZ - 0.14, 0, 2.15)

  let clampReleased = false
  let clampDoorOpen = 0
  let syncHintShown = false

  const { hatchCover, ladder } = env.parts.convergence
  // The roof access belongs to the Convergence car after the gauntlet.
  for (const accessPart of [env.parts.mechanical.hatchCover, env.parts.mechanical.hatchRim, env.parts.mechanical.ladder]) {
    accessPart.visible = false
  }
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
      if (!clampReleased) {
        interaction.flashPrompt('The drive clamp is still locked — sync both plates at once.')
        return
      }
      if (!Object.values(gauntletCleared).every(Boolean)) {
        interaction.flashPrompt('The Convergence gauntlet is still active — use every Chrono ability.')
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
  // CONVERGENCE — all four abilities, in sequence, before the roof.
  // ------------------------------------------------------------------
  const gauntletCleared = { slow: false, ghost: false, rewind: false, freeze: false }
  const gauntletSlowZ = spans.convergence.minZ + 4.0
  const gauntletSlowBeam = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 2.4 })
  )
  addProp(gauntletSlowBeam, gauntletSlowZ, 0, 1.15)
  let gauntletSlowT = 0
  unregisters.push(registerHazard(gauntletSlowBeam, {
    onUpdate(scaledDelta) {
      gauntletSlowT += scaledDelta
      gauntletSlowBeam.position.x = Math.sin(gauntletSlowT * 2.7) * 0.78
    },
    getSnapshot: () => ({ gauntletSlowT }),
    restoreSnapshot: (s) => {
      gauntletSlowT = s.gauntletSlowT
      gauntletSlowBeam.position.x = Math.sin(gauntletSlowT * 2.7) * 0.78
    }
  }))

  const gauntletPadPos = new THREE.Vector3(-0.55, 0.03, spans.convergence.minZ + 8.0)
  const gauntletPad = makePressurePlate(0.9)
  gauntletPad.name = 'convergence-ghost-pad'
  gauntletPad.position.copy(gauntletPadPos)
  root.add(gauntletPad)
  unregisters.push(timeSystem.registerGhostPad(gauntletPadPos, 0.56))
  const gauntletGhostGateZ = spans.convergence.minZ + 10.0
  const gauntletGhostGate = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.55, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x2f3742, metalness: 0.9, roughness: 0.35 })
  )
  addProp(gauntletGhostGate, gauntletGhostGateZ, 0, 0.9)
  let gauntletGhostGateOpen = 0

  const gauntletBridgeZ = spans.convergence.minZ + 14.0
  const gauntletBridge = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.12, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.66, metalness: 0.72 })
  )
  let gauntletBridgeY = -3.2
  gauntletBridge.position.set(0, gauntletBridgeY, gauntletBridgeZ)
  root.add(gauntletBridge)
  const gauntletPit = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 3.4, 2.8),
    new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 1, side: THREE.BackSide })
  )
  gauntletPit.position.set(0, -1.7, gauntletBridgeZ)
  gauntletPit.userData.noCameraCollision = true
  root.add(gauntletPit)

  const gauntletFreezeZ = spans.convergence.minZ + 19.0
  const gauntletFreezeRotor = makeRotor(0x60a5fa)
  addProp(gauntletFreezeRotor, gauntletFreezeZ, 0, ROTOR_HUB_Y)
  let gauntletFreezeA = 0
  unregisters.push(registerHazard(gauntletFreezeRotor, {
    onUpdate(scaledDelta) {
      gauntletFreezeA += scaledDelta * 6.2
      gauntletFreezeRotor.rotation.z = gauntletFreezeA
    },
    getSnapshot: () => ({ gauntletFreezeA }),
    restoreSnapshot: (s) => {
      gauntletFreezeA = s.gauntletFreezeA
      gauntletFreezeRotor.rotation.z = gauntletFreezeA
    }
  }))

  // --------------------------------------------------------------------------
  // ROOF — SLOW
  // Always move toward +Z. Additional roof obstacles make the exterior leg feel
  // like a real set piece instead of a straight corridor.
  // --------------------------------------------------------------------------
  let gustPhase = 0
  let sweptTime = 0

  const roofArc = makeRotor(0x7dd3fc)
  roofArc.position.set(0, CARRIAGE_ROOF_Y + ROTOR_HUB_Y, (roof.zStart + roof.zEnd) / 2)
  roof.group.add(roofArc)

  let roofArcT = 0
  unregisters.push(registerHazard(roofArc, {
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

    // The roof starts over Convergence and ends over the forward Vault car.
    const start = new THREE.Vector3(0, CARRIAGE_ROOF_Y, roof.zStart + 0.8)
    player.setPose(start, 0)
    respawn.setCheckpoint(start, 0, { restore: captureCheckpointRestore() })
    camera.setYaw?.(0)
    camera.snap()

    gustPhase = 0
    sweptTime = 0
    hud.setObjective('Cross the roof toward the Vault — keep moving FORWARD')
    hud.showBriefing?.([
      'You are outside. Slipstream at line speed will take you off the roof if you stand up in it for long.',
      'Keep moving forward, stay low when you have to, and watch what comes over the top of the car.'
    ])
  }

  unregisters.push(interaction.register(roof.dropHatch, {
    prompt: 'Drop into the forward Vault car',
    isEligible: () => section === 'roof',
    onInteract: () => enterVault()
  }))

  // --------------------------------------------------------------------------
  // VAULT — clear final carriage. The gauntlet carries the ability challenge;
  // the Core is exposed as the reward at the end of the run.
  // --------------------------------------------------------------------------
  const coreZ = spans.vault.maxZ - 2.6
  const core = createChronoCore()
  core.userData.noInteractionBlocker = true
  addProp(core, coreZ)

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

  function enterVault() {
    section = 'vault'
    setBounds(env.vaultBounds)
    useObstacles([])

    const p = new THREE.Vector3(0, 0, spans.vault.minZ + 1.1)
    player.setPose(p, 0)
    respawn.setCheckpoint(p, 0, { restore: captureCheckpointRestore() })
    camera.setYaw?.(0)
    camera.snap()

    hud.setObjective('The Chrono Core is exposed — take it')
    hud.showBriefing?.([
      'Vault car. The Convergence gauntlet is behind you.',
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
    [bridgeZ, 3.0],
    [slamGateZ, 1.2],
    [mechBladeZ, 1.4],
    [clampDoorZ, 0.8],
    [gauntletSlowZ, 1.2],
    [gauntletGhostGateZ, 0.8],
    [gauntletBridgeZ, 3.0],
    [gauntletFreezeZ, 1.4]
  ]
  for (const [z, depth, lane] of chokepoints) addChokepoint(z, depth, lane)

  // Initial section setup.
  setBounds(env.interiorBounds)
  useObstacles(corridorObstacles)

  const orb = core.getObjectByName('chrono-core-orb')
  const halo = core.getObjectByName('chrono-core-halo')
  let elapsed = 0

  // The level owns puzzle restoration. Transient hazards return to a known,
  // solvable phase while durable progress captured at the checkpoint remains.
  function captureCheckpointRestore() {
    const saved = {
      section, bounds: { ...bounds }, lastCheckpointZ,
      abilityState: { ...abilityState }, interfaceTaken, ghostTaken, freezeTaken, rewindTaken,
      relayLogged, relaySolved, relayInput: [...relayInput],
      bridgeY, bridgeRepaired, clampReleased, hatchRepaired,
      gauntletCleared: { ...gauntletCleared }, gauntletBridgeY, gauntletGhostGateOpen,
      hazards: checkpointHazards.map((hazard) => hazard.getSnapshot())
    }
    return () => {
      section = saved.section
      setBounds(saved.bounds)
      useObstacles(section === 'roof' || section === 'vault' ? [] : corridorObstacles)
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
      bridgeY = saved.bridgeY
      bridgeRepaired = saved.bridgeRepaired
      mechBridge.position.y = bridgeY
      clampReleased = saved.clampReleased
      clampDoorOpen = clampReleased ? 1 : 0
      clampDoor.position.y = 1.05 + clampDoorOpen * 2.2
      clampLampMat.color.setHex(clampReleased ? 0x10b981 : 0xef4444)
      clampLampMat.emissive.copy(clampLampMat.color)
      slamGateY = clampReleased ? 3 : 0.75
      slamGate.position.y = slamGateY
      const blockDepth = clampReleased ? 0 : 0.48
      padBlockObstacle.minZ = slamGateZ - blockDepth
      padBlockObstacle.maxZ = slamGateZ + blockDepth
      hatchRepaired = saved.hatchRepaired
      Object.assign(gauntletCleared, saved.gauntletCleared)
      gauntletBridgeY = saved.gauntletBridgeY
      gauntletBridge.position.y = gauntletBridgeY
      gauntletGhostGateOpen = saved.gauntletGhostGateOpen
      gauntletGhostGate.position.y = 0.9 + gauntletGhostGateOpen * 2.0
      rearmTimers.hatch = 0
      taken = false
      destabT = 0
      failCooldown = 0
      gustPhase = 0
      sweptTime = 0
      root.rotation.z = 0
      root.position.y = 0
    }
  }

  return {
    objective: 'Move toward the FRONT of the train — reach Security and acquire the glowing blue Chrono Interface.',
    checkpoint: {
      position: new THREE.Vector3(0, 0, spans.passenger.minZ + 2.2),
      yaw: 0,
      restore: captureCheckpointRestore()
    },
    bounds,
    obstacles: activeObstacles,
    getCarriageVolumes: () => listCarriageVolumes(spans),
    get isCinematic() { return taken },

    update(delta) {
      outdoorEnv.update(delta)
      env.update(delta)
      corridorStealth.update(delta)
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

      // Each pad lifts the block between them. Both together latch the exit.
      const onA = ghost.isOccupying(syncPlateAPos, 0.54) || playerOnPad(syncPlateAPos, 0.54)
      const onB = ghost.isOccupying(syncPlateBPos, 0.54) || playerOnPad(syncPlateBPos, 0.54)
      const blockPowered = onA || onB || clampReleased
      slamGateY += ((blockPowered ? 3.0 : 0.75) - slamGateY) * Math.min(1, delta * 5)
      slamGate.position.y = slamGateY
      // Collapse the collision box to zero depth once the block clears a
      // standing player. It follows the visible lift, including during Freeze.
      const blockDepth = slamGateY < 2.5 ? 0.48 : 0
      padBlockObstacle.minZ = slamGateZ - blockDepth
      padBlockObstacle.maxZ = slamGateZ + blockDepth

      syncPlateAMat.emissive.setHex(onA ? 0x10b981 : 0xf59e0b)
      syncPlateBMat.emissive.setHex(onB ? 0x10b981 : 0xf59e0b)
      syncPlateA.position.y = onA ? 0.012 : 0.03
      syncPlateB.position.y = onB ? 0.012 : 0.03

      if (!clampReleased) {
        if ((onA || onB) && section === 'interior' && !syncHintShown) {
          syncHintShown = true
          hud.showToast('PAD A LIFTS THE BLOCK — summon a Ghost here, then cross to pad B to unlock the exit.', 5500)
        }

        if (onA && onB) {
          clampReleased = true
          clampLampMat.color.setHex(0x10b981)
          clampLampMat.emissive.setHex(0x10b981)
          hud.showToast('DRIVE CLAMP RELEASED — the forward bulkhead is open', 2600)
        }
      }

      clampDoorOpen +=
        ((clampReleased ? 1 : 0) - clampDoorOpen) * Math.min(1, delta * 5)
      clampDoor.position.y = 1.05 + clampDoorOpen * 2.2

      // Interior only: the roof span starts just past the clamp door, and a
      // stray z-clamp up there would shove the player backwards off the train.
      if (
        section === 'interior' &&
        !clampReleased &&
        pp.z > clampDoorZ - 0.48 &&
        pp.z < spans.mechanical.maxZ
      ) {
        pp.z = clampDoorZ - 0.48
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
            'Passenger car. A conductor on the walk — and you have no chrono gear yet. Use the seats for cover and pick your moment.'
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
            'Mechanical. The plank has already fallen into the floor gap. Install Rollback and REWIND it until it is level with the floor.',
            'Past the plank, pad A lifts the blocking bulkhead. Summon a Ghost on A to hold it up while you cross to pad B.',
            'Both pads together release the drive clamp into Convergence.'
          ]
        )
        hint(
          'convergence',
          pp.z,
          spans.convergence.minZ,
          [
            'Convergence car. The route to the roof is sealed behind a four phase test.',
            'SLOW the scanner, use a TIME GHOST on the pressure plate, REWIND the fallen span, then FREEZE the rotor.'
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

        // The plank starts in the pit. Retreating never rebuilds it for free.
        if (
          Math.abs(pp.z - bridgeZ) < 1.3 &&
          Math.abs(pp.x) < 1.0 &&
          bridgeY < 0.05
        ) {
          failSoft('The mechanical bridge collapsed — REWIND it!', 'fell')
        }

        // Extra Mechanical timing obstacle. Crouching genuinely slips under a
        // high arm here, which is a second answer that costs no energy at all.
        if (
          Math.abs(pp.z - mechBladeZ) < 0.62 &&
          rotorBlocks({
            angle: mechBladeA,
            radius: ROTOR_RADIUS,
            centreY: ROTOR_HUB_Y,
            playerX: pp.x,
            playerTopY: topY
          })
        ) {
          failSoft('The turbine blade clipped you!')
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

        if (pp.z > gauntletSlowZ + 0.55 && mode === 'SLOW') gauntletCleared.slow = true
        if (
          Math.abs(pp.z - gauntletSlowZ) < 0.48 &&
          !gauntletCleared.slow && mode !== 'SLOW'
        ) {
          failSoft('The phase scanner is too fast — use SLOW to cross it.')
        }
        if (
          Math.abs(pp.z - gauntletSlowZ) < 0.5 &&
          Math.abs(pp.x - gauntletSlowBeam.position.x) < 0.22 &&
          !gauntletCleared.slow
        ) failSoft('The phase scanner caught you — use SLOW.')

        const echoOnGauntletPad = ghost.isOccupying(gauntletPadPos, 0.56)
        const gauntletPadPressed = echoOnGauntletPad
        gauntletGhostGateOpen +=
          ((gauntletPadPressed ? 1 : 0) - gauntletGhostGateOpen) * Math.min(1, delta * 5)
        gauntletGhostGate.position.y = 0.9 + gauntletGhostGateOpen * 2.0
        gauntletPad.position.y = gauntletPadPressed ? 0.012 : 0.03
        if (
          Math.abs(pp.z - gauntletGhostGateZ) < 0.36 &&
          gauntletGhostGateOpen < 0.72
        ) failSoft('The phase gate needs weight on its plate — send a TIME GHOST.')
        if (pp.z > gauntletGhostGateZ + 0.5 && gauntletGhostGateOpen >= 0.72) {
          gauntletCleared.ghost = true
        }

        if (mode === 'REWIND' && Math.abs(pp.z - gauntletBridgeZ) < 9.0) {
          gauntletBridgeY = Math.min(0.06, gauntletBridgeY + delta * 3.4)
          gauntletBridge.position.y = gauntletBridgeY
        }
        if (gauntletBridgeY >= 0.05) gauntletCleared.rewind = true
        if (
          Math.abs(pp.z - gauntletBridgeZ) < 1.3 &&
          Math.abs(pp.x) < 1.0 &&
          gauntletBridgeY < 0.05
        ) failSoft('The span is broken — REWIND it before crossing.', 'fell')

        if (
          Math.abs(pp.z - gauntletFreezeZ) < 0.55 &&
          !gauntletCleared.freeze &&
          mode !== 'FREEZE'
        ) failSoft('The rotor blocks the route — use FREEZE to pass it.')
        if (
          Math.abs(pp.z - gauntletFreezeZ) < 0.62 &&
          rotorBlocks({
            angle: gauntletFreezeA,
            radius: ROTOR_RADIUS,
            centreY: ROTOR_HUB_Y,
            playerX: pp.x,
            playerTopY: topY
          })
        ) failSoft('The convergence rotor clipped you — FREEZE it.')
        if (pp.z > gauntletFreezeZ + 0.62 && mode === 'FREEZE') {
          gauntletCleared.freeze = true
        }
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
          rotorBlocks({
            angle: roofArcT * 4.8,
            radius: ROTOR_RADIUS,
            centreY: ROTOR_HUB_Y,
            playerX: pp.x,
            playerTopY: topY
          })
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
      }
    },

    dispose() {
      unregisters.forEach((fn) => fn())
      timeSystem?.setStrainEnabled?.(false)
      outdoorEnv.dispose()
      corridorStealth.dispose()
      scene.remove(outdoorEnv.group, root)
      disposeObject(root)
    }
  }
}

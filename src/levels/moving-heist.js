import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y, CARRIAGE_ROOF_Y } from '../environment/carriages.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { createStealthSystem } from '../systems/stealth.js'
import { signMaterial } from '../environment/textures.js'

// Level 2 — "The Moving Heist".
//
// Physical progression is deliberately one-way: REAR -> FRONT.
// Passenger -> Security -> Relay -> Cargo -> Mechanical -> Roof -> Vault.
//
// Ability progression is equally deliberate:
// Passenger  : no powers; reuse Level 1 timing/stealth instincts.
// Security   : acquire the Chrono Interface -> unlock SLOW.
// Relay      : acquire the Echo Synchronizer -> unlock GHOST, and immediately
//              need it: the routing order only plays while the bus pad is
//              weighted, and the pad is nowhere near the panel that shows it.
// Cargo      : acquire the Cryo Phase module -> unlock FREEZE, which also
//              switches on Chrono Strain while the player crosses moving loads.
// Mechanical : acquire the Rollback module -> unlock REWIND, plus a twin-plate
//              drive clamp that only a Ghost can hold open with you.
// Vault      : no new power — a finale that asks for all four at once.
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

// Small engraved plaque. The relay puzzle spreads three terminals down an 18 m
// car and posts their target colours on one panel at the far end — without a
// shared A/B/C marking on both, there is nothing telling the player which light
// belongs to which terminal, and the pattern is unreadable even when visible.
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
  // One stealth system for the whole interior run, not just the Passenger car:
  // Security gets a sweeping camera and Cargo gets a laser grid. Passing
  // timeSystem makes the Passenger guard and cameras obey Slow and Freeze.
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
  const vaultObstacles = []

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
  const rearmTimers = { hatch: 0, vaultBridge: 0 }
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
  // PASSENGER — CAMERA FIRST, THEN THE CONDUCTOR
  //
  // The guard used to start at minZ + 3.4, which is 1.2 m from the player's
  // spawn at minZ + 2.2 — inside GUARD_LOCK_ON_DISTANCE. He hard-locked on
  // before the player could take a step, which read as being caught for no
  // reason. The opening threat is now a ceiling camera the player walks up to
  // and reads, and the conductor patrols the far end of the car instead.
  // ------------------------------------------------------------------

  corridorStealth.addCamera({
    position: new THREE.Vector3(
      0.62,
      CARRIAGE_CEILING_Y - 0.55,
      spans.passenger.center + 0.5
    ),
    baseAngle: Math.PI, // facing back down the car, toward the player's approach
    sweepRange: Math.PI / 3.4,
    sweepSpeed: 0.7,
    // Reach ends at minZ + 10.5, a good 2 m short of the first luggage barrier
    // and 4.3 m short of the spawn: the player always gets a clear look at the
    // car, and cover exists before anything can see them.
    range: 6.0
  })

  // The conductor now walks the forward quarter of the car, well past the last
  // luggage barrier and 11 m from the spawn — outside GUARD_VISION_DISTANCE, so
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

  const secRotor = makeRotor(0x60a5fa)
  const secRotorZ = spans.security.center + 3.7
  addProp(secRotor, secRotorZ, 0, ROTOR_HUB_Y)
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

  // Sweeping ceiling camera watching the run-up to the shutter. It is NOT
  // chrono-shielded, so Slow stretches its sweep and Freeze parks it — the
  // first place the player is rewarded for using a power on a person-detector
  // rather than on a machine.
  corridorStealth.addCamera({
    position: new THREE.Vector3(0.62, CARRIAGE_CEILING_Y - 0.55, spans.security.center + 1.0),
    baseAngle: Math.PI,
    sweepRange: Math.PI / 3.0,
    sweepSpeed: 0.85,
    range: 8.0
  })

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
  // CHRONO RELAY — ECHO SYNCHRONIZER + ROUTING SEQUENCE
  //
  // This car used to hand out no power at all, which made it the one room with
  // nothing to practise. It now grants GHOST and immediately demands it: the
  // panel over the exit gate plays a routing order one lamp at a time, and it
  // only runs while the bus pad is weighted. The pad is eleven metres behind
  // the panel and the panel is unreadable from there, so a Time Ghost has to
  // stand on the pad while the player watches. Then the order has to be keyed
  // back into terminals A / B / C — memory, not colour-matching, and no Freeze.
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
      hud.setObjective('Relay — the routing order only plays while the bus pad is weighted')
    }
  }))

  const RELAY_COLORS = [
    0xef4444, // A — red
    0xf59e0b, // B — amber
    0x38bdf8  // C — cyan
  ]

  const RELAY_LABELS = ['A', 'B', 'C']
  const RELAY_SEQUENCE_LENGTH = 4

  // The routing pattern is call-and-response: the panel over the exit gate
  // plays a run of lamps one at a time, and the player repeats that order on
  // the terminals. Rolled fresh each run so it cannot be memorised between
  // attempts, but never the same lamp twice in a row — two identical flashes
  // back to back are indistinguishable from one long one.
  const relaySequence = []

  while (relaySequence.length < RELAY_SEQUENCE_LENGTH) {
    const next = Math.floor(Math.random() * RELAY_COLORS.length)
    if (next === relaySequence[relaySequence.length - 1]) continue
    relaySequence.push(next)
  }

  // Which steps the player has actually watched play. The playback loop
  // free-runs, so one short echo shows a slice of the sequence and the next
  // shows a different slice; progress carries across both rather than demanding
  // a single uninterrupted viewing that a 5 s echo cannot always buy.
  const relaySeen = relaySequence.map(() => false)
  const relayInput = []
  let relayLogged = false
  let relaySolved = false
  // Seconds of red "rejected" flash left on the panel after a wrong terminal.
  let relayRejectFlash = 0

  // Playback timing. Kept on real time in the level update — see the playback
  // block there for why this must not be chrono-scaled.
  const RELAY_STEP_ON = 0.34
  const RELAY_STEP_GAP = 0.16
  const RELAY_LOOP_PAUSE = 0.8
  const RELAY_STEP_SPAN = RELAY_STEP_ON + RELAY_STEP_GAP
  const RELAY_CYCLE = RELAY_STEP_SPAN * RELAY_SEQUENCE_LENGTH + RELAY_LOOP_PAUSE
  let relayPlayT = 0
  // Index of the step lit this frame, or -1 during a gap or the loop pause.
  let relayActiveStep = -1

  const relayTerminals = []

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
    // Each terminal wears its own colour permanently now: the panel lamp that
    // fires for this terminal is the same colour as the terminal itself, which
    // is the only cue tying a flash eleven metres away to a box in the aisle.
    const terminal = makeConsole(RELAY_COLORS[i], 0.4)

    terminal.name = `relay-terminal-${cfg.label}`
    addProp(terminal, cfg.z, cfg.x)

    // Turn the console to face the aisle rather than the front of the train.
    // makeConsole builds its screen on +Z, so a terminal left as-is points its
    // only readable surface away from a player walking toward the front — you
    // had to walk past and look back to see it react to a press.
    terminal.rotation.y = cfg.x < 0 ? Math.PI / 2 : -Math.PI / 2

    // Matching plaque, so the panel at the gate can be read against the car.
    const termLabel = makeLabelPlate(cfg.label, 0.14)
    termLabel.position.set(0, 0.34, 0.175)
    terminal.add(termLabel)

    terminal.userData.pulse = 0
    relayTerminals.push(terminal)

    unregisters.push(interaction.register(terminal, {
      prompt: `Key Chrono Relay ${cfg.label}`,

      onInteract: () => {
        if (relaySolved) return

        // Entry is closed until the pattern has been watched. Otherwise the
        // panel — and with it the Ghost — is optional: rejection after every
        // wrong press turns three lamps and four steps into twelve guesses.
        if (!relayLogged) {
          interaction.flashPrompt(
            'No routing order logged — read the panel above the gate first.'
          )
          return
        }

        terminal.userData.pulse = 1

        if (relaySequence[relayInput.length] !== i) {
          relayInput.length = 0
          relayRejectFlash = 1.0

          hud.showToast(
            'ROUTING REJECTED — key the pattern again from the start',
            2200
          )

          return
        }

        relayInput.push(i)

        if (relayInput.length < RELAY_SEQUENCE_LENGTH) {
          hud.showToast(
            `ROUTING ${relayInput.length} / ${RELAY_SEQUENCE_LENGTH} ACCEPTED`,
            900
          )

          return
        }

        relaySolved = true

        hud.showToast(
          'CHRONO RELAY STABLE — bulkhead unlocked',
          2600
        )

        hud.setObjective(
          'Proceed to Cargo and acquire the next Chrono module'
        )
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

  // Routing panel above the exit gate: one lamp per terminal, lit one at a
  // time as the pattern steps through its order. Dark unless the bus pad is
  // weighted — or the pattern has already been logged, after which it replays
  // on its own as a reminder.
  const relayTargetPanel = new THREE.Group()
  const relayTargetLights = []
  const relayLightMats = []

  RELAY_LABELS.forEach((label, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: RELAY_COLORS[i],
      emissive: RELAY_COLORS[i],
      emissiveIntensity: 3
    })

    const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat)

    // NOTE the sign. The player always walks toward +Z, so world +X projects to
    // SCREEN-LEFT from their viewpoint. Laying these out as (i - 1) put A on the
    // right and the panel read C, B, A — the exact reverse of the terminals,
    // which is a cruel thing to do to a player reading left to right. (1 - i)
    // makes the panel read A, B, C in the order the terminals are encountered.
    light.position.set(
      (1 - i) * 0.35,
      0,
      0
    )

    light.visible = false
    relayTargetLights.push(light)
    relayLightMats.push(mat)
    relayTargetPanel.add(light)

    // Always-on plaque under each lamp. The lamps come and go with the
    // sequence; the letters must not, or the player cannot tell which flash
    // belongs to which terminal.
    const plate = makeLabelPlate(label, 0.15)
    plate.position.set((1 - i) * 0.35, -0.26, -0.08)
    plate.rotation.y = Math.PI // face back down the car, toward the player
    relayTargetPanel.add(plate)
  })

  // Progress pips under the lamps: how much of the pattern has been watched
  // while learning it, and how much has been keyed in while repeating it.
  // Without them a half-read pattern and a half-entered one look identical.
  const relayPipMats = []

  for (let i = 0; i < RELAY_SEQUENCE_LENGTH; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x1e293b,
      emissiveIntensity: 0.5
    })

    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat)
    pip.position.set((1.5 - i) * 0.17, -0.46, 0)
    relayPipMats.push(mat)
    relayTargetPanel.add(pip)
  }

  addProp(
    relayTargetPanel,
    relayGateZ - 0.12,
    0,
    2.45
  )

  // Dead housing so the panel still reads as a fixture while unlit.
  //
  // This MUST sit at a higher z than the bulbs at relayGateZ - 0.12. The player
  // approaches the gate from -Z, so lower z is nearer the eye — mounting the
  // housing at relayGateZ - 0.2 put it directly in front of all three lights
  // and the pattern could never be seen, however correctly the pad was weighted.
  const relayPanelShell = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.28, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 })
  )
  addProp(relayPanelShell, relayGateZ, 0, 2.45)

  // The bus pad sits well behind the terminals, so weighting it yourself and
  // then reading the panel at the gate is not possible — only an echo can hold
  // it while you stand at the far end of the car.
  const relayPadPos = new THREE.Vector3(0.55, 0.03, spans.relay.minZ + 5.6)
  const relayPad = makePressurePlate(0.95)
  unregisters.push(timeSystem.registerGhostPad(relayPadPos, 0.56))
  const relayPadMat = relayPad.userData.plateMat
  relayPad.position.copy(relayPadPos)
  root.add(relayPad)

  const relayPadPostMat = new THREE.MeshStandardMaterial({
    color: 0x2dd4bf,
    emissive: 0x2dd4bf,
    emissiveIntensity: 1.6,
    metalness: 0.7,
    roughness: 0.3
  })
  const relayPadPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.1, 10),
    relayPadPostMat
  )
  let relayPadEverHeld = false
  relayPadPost.position.set(relayPadPos.x, 0.55, relayPadPos.z)
  root.add(relayPadPost)
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

  // Laser grid across the forward Cargo doorway. It cycles on chrono time, so
  // SLOW stretches the gap and FREEZE parks it.
  const cargoGridZ = spans.cargo.maxZ - 5.4
  const cargoGrid = corridorStealth.addLaserGrid({
    position: new THREE.Vector3(0, 0, cargoGridZ),
    width: 2.3,
    height: 2.2,
    beamCount: 4
  })

  const CARGO_GRID_PERIOD = 4.2
  const CARGO_GRID_DOWN = 1.25
  let cargoGridT = 0
  unregisters.push(timeSystem.register(cargoGrid.gridGroup, {
    onUpdate(scaledDelta) {
      cargoGridT = (cargoGridT + Math.max(0, scaledDelta)) % CARGO_GRID_PERIOD
      cargoGrid.setActive(cargoGridT > CARGO_GRID_DOWN)
    },
    getSnapshot: () => ({ cargoGridT }),
    restoreSnapshot: (snap) => {
      cargoGridT = snap.cargoGridT
      cargoGrid.setActive(cargoGridT > CARGO_GRID_DOWN)
    }
  }))

  // Cargo stacked to starboard leaves the port lane clear for traversal.
  addStaticBarrier({
    z: spans.cargo.center + 1.8,
    x: 0.48,
    width: 0.6,
    depth: 1.2,
    height: 1.4,
    color: 0x6b4b2f
  })

  addStaticBarrier({
    z: spans.cargo.center + 4.2,
    x: 0.48,
    width: 0.6,
    depth: 1.2,
    height: 1.4,
    color: 0x4f3b2c
  })

  // No guard at the Cargo / Rollback approach: the machinery and pad puzzle
  // can be worked without a patrol following the player into Mechanical.

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

  const { hatchCover, ladder } = env.parts.mechanical
  let hatchBroken = false
  let hatchRepaired = false
  let hatchOpen = 1

  // Start the hatch visually open. It slams shut as the player approaches;
  // Rewind restores the earlier open state from the time-system snapshot buffer.
  hatchCover.position.x = -1.15
  unregisters.push(timeSystem.register(hatchCover, {
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
    onInteract: () => {
      if (!clampReleased) {
        interaction.flashPrompt('The drive clamp is still locked — sync both plates at once.')
        return
      }
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

  const roofArc = makeRotor(0x7dd3fc)
  roofArc.position.set(0, CARRIAGE_ROOF_Y + ROTOR_HUB_Y, (roof.zStart + roof.zEnd) / 2)
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
    hud.showBriefing?.([
      'You are outside. Slipstream at line speed will take you off the roof if you stand up in it for long.',
      'Keep moving forward, stay low when you have to, and watch what comes over the top of the car.'
    ])
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
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.3
  })
  const vaultPlatePos = new THREE.Vector3(0, 0.03, spans.vault.minZ + 4.0)
  unregisters.push(timeSystem.registerGhostPad(vaultPlatePos, 0.58))
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

  const vaultLattice = makeRotor(0x38bdf8)
  const vaultLatticeZ = spans.vault.center - 0.4
  addProp(vaultLattice, vaultLatticeZ, 0, ROTOR_HUB_Y)
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
  let vaultBridgeRepaired = false
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
    recordWhen: () => vaultBridgeTriggered && vaultBridgeY > -3.0,
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
      if (vaultBridgeTriggered && !s.vaultBridgeTriggered) vaultBridgeRepaired = true
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
      hud.showBriefing?.([
        'You have it. Containment is gone and the whole train is going with it — hold on.'
      ])
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

    hud.setObjective('Breach the Vault — you will need every Chrono ability at once')
    hud.showBriefing?.([
      'Vault car. This is the one they built the train around.',
      'No new gear from here. Everything between you and the Core is something you have already been taught to beat — it just comes at you all at once.'
    ])
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

      // Relay bus pad. Only an echo can hold this while the player stands at the
      // far end of the car watching the routing pattern play out on the panel.
      const relayPadHeld =
        ghost.isOccupying(relayPadPos, 0.56) ||
        playerOnPad(relayPadPos, 0.56)

      relayPadMat.emissive.setHex(relayPadHeld ? 0x10b981 : 0xf59e0b)
      relayPad.position.y = relayPadHeld ? 0.012 : 0.03
      relayPadPostMat.emissive.setHex(relayPadHeld ? 0x10b981 : 0x2dd4bf)
      relayPadPostMat.emissiveIntensity = relayPadHeld ? 3.2 : 1.6

      // Standing on the pad shows you nothing at the gate eleven metres away,
      // which reads as "the pad is broken". Say once, out loud, that it worked
      // and why you still cannot see the pattern — the constraint, not the fix.
      if (relayPadHeld && !relayPadEverHeld) {
        relayPadEverHeld = true
        hud.showBriefing?.([
          'Bus energised — that pad is doing its job.',
          'The panel over the gate is stepping through the routing order now. Watch which lamps fire and in what sequence, then key that same order into the terminals. It goes dark the moment the pad is clear.'
        ])
      }

      // Pattern playback. Real time on purpose — an echo replays at 1x whatever
      // the player does with the clock, so a chrono-scaled sequence would run
      // past the end of the echo that is holding the pad open.
      if (relaySolved) {
        relayActiveStep = -1
      } else {
        relayPlayT = (relayPlayT + delta) % RELAY_CYCLE
        const stepIndex = Math.floor(relayPlayT / RELAY_STEP_SPAN)
        relayActiveStep =
          stepIndex < RELAY_SEQUENCE_LENGTH &&
          relayPlayT - stepIndex * RELAY_STEP_SPAN < RELAY_STEP_ON
            ? stepIndex
            : -1
      }

      relayRejectFlash = Math.max(0, relayRejectFlash - delta)

      // The panel is a low-power display: it is only legible from close up.
      // Without this the player could weight the pad themselves and squint at
      // it from eleven metres away, and the Ghost would be optional again.
      const atRelayPanel = Math.abs(pp.z - relayGateZ) < 4.4

      // Once the whole pattern has been logged the panel keeps replaying it
      // with no pad. The echo is the price of *learning* the order, not a toll
      // on every retry after one mistyped step at the far end of the car.
      const relayPanelLive =
        !relaySolved && atRelayPanel && (relayPadHeld || relayLogged)

      for (let i = 0; i < relayTargetLights.length; i++) {
        const mat = relayLightMats[i]
        if (relaySolved) {
          mat.color.setHex(0x10b981)
          mat.emissive.setHex(0x10b981)
          relayTargetLights[i].visible = true
        } else if (relayRejectFlash > 0) {
          // Rejection is shown at any range: the player is standing at a
          // terminal when it happens, not at the panel.
          mat.color.setHex(0xef4444)
          mat.emissive.setHex(0xef4444)
          relayTargetLights[i].visible = true
        } else {
          mat.color.setHex(RELAY_COLORS[i])
          mat.emissive.setHex(RELAY_COLORS[i])
          relayTargetLights[i].visible =
            relayPanelLive &&
            relayActiveStep >= 0 &&
            relaySequence[relayActiveStep] === i
        }
      }

      // Steps are logged as they are actually watched, so two short echoes that
      // each catch part of the loop add up to the whole pattern.
      if (relayPanelLive && relayActiveStep >= 0 && !relayLogged) {
        relaySeen[relayActiveStep] = true
        if (relaySeen.every(Boolean)) {
          relayLogged = true
          hud.showToast('ROUTING PATTERN LOGGED — repeat it on the terminals', 3200)
          hud.setObjective('Relay — key the routing order into terminals A / B / C')
        }
      }

      const relayPipsLit = relayLogged
        ? relayInput.length
        : relaySeen.reduce((n, seen) => n + (seen ? 1 : 0), 0)
      const relayPipHue = relaySolved ? 0x10b981 : relayLogged ? 0x2dd4bf : 0xf59e0b

      for (let i = 0; i < relayPipMats.length; i++) {
        const lit = i < relayPipsLit
        const mat = relayPipMats[i]
        mat.color.setHex(lit ? relayPipHue : 0x1e293b)
        mat.emissive.setHex(lit ? relayPipHue : 0x1e293b)
        mat.emissiveIntensity = lit ? 2.6 : 0.5
      }

      // Terminal screens idle dim and flare on a press, so a keyed step is
      // legible from the terminal itself rather than only on the far panel.
      for (const terminal of relayTerminals) {
        const screenMat = terminal.userData.screen.material
        terminal.userData.pulse = Math.max(0, terminal.userData.pulse - delta * 2.4)
        if (relaySolved) {
          screenMat.color.setHex(0x10b981)
          screenMat.emissive.setHex(0x10b981)
        }
        screenMat.emissiveIntensity = 0.9 + terminal.userData.pulse * 2.6
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
          [
            'You’re aboard. Six cars between you and the Chrono Core, and the Express does not stop for anyone.',
            'Every bulkhead on this train opens from the rear only. Once you’re through one, forward is the only direction left.',
            'Passenger car. A ceiling camera and a conductor on the walk — and you have no chrono gear yet. Use the cabin for cover and pick your moment.'
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
            'Chrono Relay. The forward bulkhead is locked behind a routing pattern.',
            'The pattern is posted above the gate, but that display stays dark unless the bus pad is carrying weight — and the pad sits a long way back from the gate.',
            'There is one more module in here. You will want it before you try.'
          ]
        )
        hint(
          'cargo',
          pp.z,
          spans.cargo.minZ,
          [
            'Cargo. Live loads swinging on the move, and a hard security line across the forward door.',
            'Watch the load cycles and the security grid. The route into Mechanical is clear of guards.'
          ]
        )
        hint(
          'mechanical',
          pp.z,
          spans.mechanical.minZ,
          [
            'Mechanical. The plank has already fallen into the floor gap. Install Rollback and REWIND it until it is level with the floor.',
            'Past the plank, pad A lifts the blocking bulkhead. Summon a Ghost on A to hold it up while you cross to pad B.',
            'Both pads together release the drive clamp leading to the roof.'
          ]
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

        // Security obstacle 2: rotating energy bar. No longer "any power works" —
        // an arm either overlaps you or it doesn't, so Slow is what makes the
        // gap readable and Freeze only helps if you stop it on a gap.
        if (
          Math.abs(pp.z - secRotorZ) < 0.55 &&
          abilityState.SLOW &&
          rotorBlocks({
            angle: secRotorA,
            radius: ROTOR_RADIUS,
            centreY: ROTOR_HUB_Y,
            playerX: pp.x,
            playerTopY: topY
          })
        ) {
          failSoft('The security rotor caught you — SLOW it and cross on a gap.')
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
          readyToRearm('hatch', pp.z < spans.mechanical.maxZ - 5.0, delta)
        ) {
          hatchOpen = 1
          hatchBroken = false
          hatchCover.position.x = -1.15
        }
        if (
          mode !== 'REWIND' && mode !== 'FREEZE' &&
          !hatchRepaired && !hatchBroken && pp.z > spans.mechanical.maxZ - 4.0
        ) hatchBroken = true
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
      } else if (section === 'vault') {
        const ghostOnPlate = ghost.isOccupying(vaultPlatePos, 0.58)
        const playerOnPlate = playerOnPad(vaultPlatePos, 0.58)

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
          rotorBlocks({
            angle: latticeA,
            radius: ROTOR_RADIUS,
            centreY: ROTOR_HUB_Y,
            playerX: pp.x,
            playerTopY: topY
          })
        ) {
          failSoft('The temporal lattice is too fast — use SLOW.')
        }

        if (
          vaultBridgeY < 0.05 &&
          readyToRearm('vaultBridge', pp.z < vaultBridgeZ - 2.9, delta)
        ) {
          vaultBridgeY = 0.06
          vaultBridgeTriggered = false
          vaultBridgeCollapse = false
          vaultBridgeFuse = 0.65
          vaultBridge.position.y = vaultBridgeY
        }
        if (
          mode !== 'REWIND' && mode !== 'FREEZE' &&
          !vaultBridgeRepaired && !vaultBridgeTriggered &&
          pp.z > vaultBridgeZ - 2.5 && pp.z < vaultBridgeZ + 1.05
        ) vaultBridgeTriggered = true
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
      timeSystem?.setStrainEnabled?.(false)
      outdoorEnv.dispose()
      corridorStealth.dispose()
      scene.remove(outdoorEnv.group, root)
      disposeObject(root)
    }
  }
}

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y, listCarriageVolumes } from '../environment/carriages.js'
import { createParticleField, createChronoMoteField } from '../environment/particles.js'
import { createTimewreckExterior } from '../environment/timewreck-exterior.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'

// Level 3 — "The Timewreck". The escape run: the player now sprints BACK down
// the train they just robbed, from the vault to the locomotive, as the Chrono
// Core tears the train apart around them.
//
// The five carriages are the same builders as Level 2, rebuilt with
// `damaged: true` — scorched materials, flickering red emergency lighting,
// debris, torn ceilings, sparking cables — which is the concept doc's stated
// scope strategy: re-light and damage the carriages, don't model new ones.
//
//   Vault      — opening beat, the train starts to come apart
//   Mechanical — FAST-TIME car: runaway pistons; Slow is mandatory, not optional
//   Cargo      — TIME-LOOP car: a bulkhead stuck in an open/close/fall/rewind
//                cycle the player has to learn and time
//   Security   — FROZEN car: the floor is gone; Freeze locks the suspended
//                wreckage into a walkway to cross on
//   Passenger  — BREAKING TRAIN: the carriages behind visibly tear away and
//                drop, debris streaks past, and the floor behind you goes
//   Locomotive — FINAL SEQUENCE: scripted Core depletion leaves only Freeze,
//                then a timed sprint with time catching up behind you, to the
//                emergency brake and the stop-on-the-bridge beat
//
// Player travels in -Z, so the checkpoint yaw is PI and every "entered a new
// car" test is a descending-Z comparison.

const MODE_INT = { NORMAL: 0, SLOW: 1, FREEZE: 2, REWIND: 3 }
const NIGHT_COLOR = new THREE.Color(0x0d1218)
const DAWN_COLOR = new THREE.Color(0x2c3a56)
const FINALE_FREEZE_COLOR = new THREE.Color(0x1a3358)
const INTERIOR_HALF_WIDTH = 1.6

// Deterministic scatter, matching the environment modules.
const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1

function createEmergencyBrake() {
  const brake = new THREE.Group()
  brake.name = 'emergency-brake'

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.85, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.55 })
  )
  housing.position.y = 0.62
  housing.castShadow = true
  brake.add(housing)

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xd8c47a, emissive: 0x54430f, emissiveIntensity: 1.4, roughness: 0.5 })
  )
  plate.position.set(0, 0.86, 0.19)
  brake.add(plate)

  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.2, 12),
    new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.35, metalness: 0.9 })
  )
  pivot.rotation.z = Math.PI / 2
  pivot.position.set(0, 1.02, 0.1)
  brake.add(pivot)

  const lever = new THREE.Group()
  lever.name = 'brake-lever'
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.62, 10),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.32, metalness: 0.92 })
  )
  shaft.position.y = 0.31
  shaft.castShadow = true
  lever.add(shaft)

  const grip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd0342a, emissive: 0x6a120c, emissiveIntensity: 1.8, roughness: 0.45 })
  )
  grip.position.y = 0.64
  grip.castShadow = true
  lever.add(grip)

  lever.position.set(0, 1.02, 0.1)
  lever.rotation.x = -0.4
  brake.add(lever)

  const warning = new THREE.PointLight(0xff4a2a, 8, 4.5, 2)
  warning.position.set(0, 1.1, 0.4)
  brake.add(warning)

  return brake
}

export function createTimewreckLevel({
  scene, interaction, timeSystem, hud, player, camera, respawn, advance, beginCinematic
}) {
  // Level 3 is the "unstable" end of the scale — the shaders read this.
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.8)

  const env = createCarriageEnvironment({ damaged: true })
  const { root, spans, carriages } = env
  const outdoorEnv = createOutdoorEnvironment({ mode: 'moving', speed: 45.0, stormy: true })
  const wreckExterior = createTimewreckExterior({
    minZ: spans.cab.minZ - 10,
    maxZ: spans.vault.maxZ + 12,
    speed: 45
  })
  scene.add(outdoorEnv.group, wreckExterior.group, root)
  scene.background = new THREE.Color().copy(NIGHT_COLOR)
  // Wide enough to keep the storm-lit scenery outside readable.
  scene.fog = new THREE.Fog(0x10141c, 10, 120)

  const unregisters = []
  unregisters.push(interaction.registerBlocker(root))
  const bounds = { ...env.interiorBounds }
  const addProp = (obj, z, x = 0, y = 0) => { obj.position.set(x, y, z); root.add(obj); return obj }

  let failCooldown = 0
  function failSoft(message, reason = 'caught') {
    if (failCooldown > 0) return false
    failCooldown = 1.3
    respawn.fail(reason)
    if (message) hud.showToast(message, 1900)
    return true
  }
  // Hints fire on a DESCENDING z, since the escape runs the other way.
  const hintsShown = new Set()
  function hint(key, playerZ, enterZ, message) {
    if (hintsShown.has(key) || playerZ > enterZ) return
    hintsShown.add(key)
    hud.showToast(message, 3400)
  }

  let lastCheckpointZ = Infinity
  const checkpointZs = [
    spans.mechanical.maxZ - 1.5,
    spans.cargo.maxZ - 1.5,
    spans.security.maxZ - 1.5,
    spans.passenger.maxZ - 1.5
  ]

  // ============================================================
  // MECHANICAL — FAST-TIME CAR: runaway pistons, Slow is mandatory
  // ============================================================
  const ramBank = new THREE.Group()
  ramBank.name = 'runaway-pistons'
  const ramHeadMat = new THREE.MeshStandardMaterial({
    color: 0x6b7078, metalness: 0.9, roughness: 0.35, emissive: 0x2a1810, emissiveIntensity: 0.45
  })
  const ramRailMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.8, roughness: 0.5 })
  const rams = []
  for (const [z, phase] of [[20, 0], [16, 2.1], [12, 4.2]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2, 0.1, 0.16), ramRailMat)
    rail.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    ramBank.add(rail)

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.75, 0.5), ramHeadMat)
    head.position.set(0, 0.9, z)
    head.castShadow = true
    ramBank.add(head)

    rams.push({ head, phase, z })
  }
  root.add(ramBank)

  let ramT = 0
  function applyRams() {
    for (const r of rams) r.head.position.x = Math.sin(ramT * 3.4 + r.phase) * 1.15
  }
  applyRams()
  unregisters.push(timeSystem.register(ramBank, {
    onUpdate(scaledDelta) { ramT += scaledDelta; applyRams() },
    getSnapshot: () => ({ ramT }),
    restoreSnapshot: (s) => { ramT = s.ramT; applyRams() }
  }))

  // ============================================================
  // CARGO — TIME-LOOP CAR: a scripted open/close/fall/rewind cycle
  // ============================================================
  const LOOP_PERIOD = 9
  const loopDoorZ = spans.cargo.center + 2
  const loopBeamZ = spans.cargo.center - 2

  const loopDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.3, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0x33383f, metalness: 0.85, roughness: 0.35, emissive: 0x141618, emissiveIntensity: 0.25
    })
  )
  loopDoor.castShadow = true
  addProp(loopDoor, loopDoorZ, 0, 3.5)

  const loopBeam = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.32, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.8, roughness: 0.55 })
  )
  loopBeam.castShadow = true
  addProp(loopBeam, loopBeamZ, 0, 2.25)

  // Wall-mounted phase indicator so the cycle is learnable rather than guessed.
  const loopRingMat = new THREE.MeshStandardMaterial({
    color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 2.6, roughness: 0.3
  })
  const loopRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 10, 24), loopRingMat)
  loopRing.rotation.y = Math.PI / 2
  addProp(loopRing, loopDoorZ + 1.4, -(INTERIOR_HALF_WIDTH - 0.14), 1.7)
  const loopRingLight = new THREE.PointLight(0x10b981, 5, 5, 2)
  addProp(loopRingLight, loopDoorZ + 1.4, -(INTERIOR_HALF_WIDTH - 0.5), 1.7)

  let loopT = 0
  let loopDoorOpen = 1
  let loopBeamDown = 0
  function applyLoop() {
    const phase = ((loopT % LOOP_PERIOD) + LOOP_PERIOD) % LOOP_PERIOD
    let colour = 0x10b981 // open — go
    if (phase < 3.0) { loopDoorOpen = 1; loopBeamDown = 0 }
    else if (phase < 4.2) { loopDoorOpen = 1 - (phase - 3.0) / 1.2; loopBeamDown = 0; colour = 0xf59e0b }
    else if (phase < 5.0) { loopDoorOpen = 0; loopBeamDown = 0; colour = 0xef4444 }
    else if (phase < 6.0) { loopDoorOpen = 0; loopBeamDown = phase - 5.0; colour = 0xef4444 }
    else if (phase < 7.5) { loopDoorOpen = 0; loopBeamDown = 1; colour = 0xef4444 }
    else {
      // The loop snaps backwards to intact — the concept doc's "rewind" beat.
      const t = (phase - 7.5) / 1.5
      loopDoorOpen = t
      loopBeamDown = 1 - t
      colour = 0xa855f7
    }
    loopDoor.position.y = 1.15 + loopDoorOpen * 2.35
    loopBeam.position.y = 2.25 - loopBeamDown * 1.85
    loopRingMat.color.setHex(colour)
    loopRingMat.emissive.setHex(colour)
    loopRingLight.color.setHex(colour)
  }
  applyLoop()
  unregisters.push(timeSystem.register(loopDoor, {
    onUpdate(scaledDelta) { loopT += scaledDelta; applyLoop() },
    getSnapshot: () => ({ loopT }),
    restoreSnapshot: (s) => { loopT = s.loopT; applyLoop() }
  }))

  // ============================================================
  // SECURITY — FROZEN CAR: suspended wreckage becomes a walkway
  // ============================================================
  const gapMinZ = spans.security.center - 3
  const gapMaxZ = spans.security.center + 3

  const voidBox = new THREE.Mesh(
    new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.3, 3.4, gapMaxZ - gapMinZ),
    new THREE.MeshStandardMaterial({ color: 0x04050a, roughness: 1 })
  )
  voidBox.position.set(0, -1.68, (gapMinZ + gapMaxZ) / 2)
  voidBox.userData.noCameraCollision = true
  root.add(voidBox)

  // Torn floor lips at either edge of the hole.
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.7, roughness: 0.7 })
  for (const z of [gapMinZ, gapMaxZ]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.2, 0.12, 0.35), lipMat)
    lip.position.set(0, 0.02, z)
    lip.rotation.x = (z === gapMinZ ? 1 : -1) * 0.18
    root.add(lip)
  }

  const slabMat = createChronoFieldMaterial({
    baseColor: 0x3b4048, glowColor: 0x60a5fa, opacity: 0.95, doubleSided: true
  })
  const SLAB_HALF_X = 1.15 / 2
  const SLAB_HALF_Y = 0.16 / 2
  const SLAB_HALF_Z = 1.05 / 2
  const slabSteel = new THREE.MeshStandardMaterial({
    color: 0x4a515a, metalness: 0.78, roughness: 0.42
  })
  const slabs = []
  const slabSupports = []
  const gapVoids = [{ minX: -2, maxX: 2, minZ: gapMinZ, maxZ: gapMaxZ }]
  for (let i = 0; i < 5; i++) {
    const slab = new THREE.Group()
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 1.05), slabMat)
    deck.castShadow = true
    slab.add(deck)
    const joist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.0), slabSteel)
    joist.position.set(i % 2 ? -0.38 : 0.38, -0.12, 0)
    slab.add(joist)
    const flange = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 1.1), slabSteel)
    flange.position.set(0, -0.1, 0)
    slab.add(flange)
    slab.userData.seed = i * 1.7
    slab.traverse((o) => { o.userData.noCameraCollision = true })
    slab.position.set(0, 0.06, gapMinZ + 0.6 + i * 1.2)
    slab.userData.restZ = slab.position.z
    root.add(slab)
    slabs.push(slab)
  }

  let slabDriftT = 0
  let slabSettle = 0
  unregisters.push(timeSystem.register(slabs[0], {
    onUpdate(scaledDelta) { slabDriftT += scaledDelta },
    getSnapshot: () => ({ slabDriftT }),
    restoreSnapshot: (s) => { slabDriftT = s.slabDriftT }
  }))

  const walkwayGlow = new THREE.PointLight(0x7dd3fc, 0, 5.5, 2)
  walkwayGlow.position.set(0, 0.55, spans.security.center)
  walkwayGlow.userData.noCameraCollision = true
  root.add(walkwayGlow)

  // ============================================================
  // PASSENGER — BREAKING TRAIN: carriages tear away, debris streaks past
  // ============================================================
  let breakupT = -1

  const chunkGroup = new THREE.Group()
  chunkGroup.name = 'thrown-debris'
  chunkGroup.visible = false
  chunkGroup.userData.noCameraCollision = true
  root.add(chunkGroup)

  const chunkMat = new THREE.MeshStandardMaterial({
    color: 0x3d4248, roughness: 0.55, metalness: 0.62, emissive: 0x141618, emissiveIntensity: 0.22
  })
  const chunkGeos = [
    new THREE.BoxGeometry(0.42, 0.06, 0.55),
    new THREE.BoxGeometry(0.08, 0.08, 0.48),
    new THREE.BoxGeometry(0.5, 0.03, 0.32)
  ]
  const chunks = []
  let chunkSeed = 0

  // Cannon world for thrown passenger-car debris only. Gravity matches the
  // old ballistic 6.5; floor restitution stands in for the old y=0.12 bounce.
  const debrisWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -6.5, 0)
  })
  debrisWorld.defaultContactMaterial.friction = 0.12
  debrisWorld.defaultContactMaterial.restitution = 0.35

  const debrisFloor = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane()
  })
  debrisFloor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  debrisWorld.addBody(debrisFloor)

  const chunkShapes = [
    new CANNON.Box(new CANNON.Vec3(0.17, 0.11, 0.14)),
    new CANNON.Sphere(0.2),
    new CANNON.Box(new CANNON.Vec3(0.25, 0.06, 0.08))
  ]

  function respawnChunk(c) {
    const s = ++chunkSeed
    c.x = skew(s + 11) * 1.25
    c.y = 0.5 + Math.abs(skew(s + 3)) * 1.5
    c.z = spans.passenger.maxZ + 3
    c.vx = skew(s + 5) * 0.9
    c.vy = 0.3 + Math.abs(skew(s + 7)) * 1.4
    c.vz = -(7 + Math.abs(skew(s + 9)) * 6)
    c.life = 4.0
    if (!c.body) return
    c.body.position.set(c.x, c.y, c.z)
    c.body.velocity.set(c.vx, c.vy, c.vz)
    c.body.angularVelocity.set(3.1, 2.2, skew(s + 13) * 2)
    c.body.quaternion.set(0, 0, 0, 1)
    c.body.wakeUp()
  }
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(chunkGeos[i % 3], chunkMat)
    mesh.castShadow = true
    chunkGroup.add(mesh)
    const body = new CANNON.Body({
      mass: 1,
      shape: chunkShapes[i % 3],
      linearDamping: 0.04,
      angularDamping: 0.08
    })
    debrisWorld.addBody(body)
    const c = { mesh, body, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }
    respawnChunk(c)
    // Stagger so they don't arrive as one volley.
    c.life = 0.4 * i
    c.body.velocity.set(0, 0, 0)
    c.body.angularVelocity.set(0, 0, 0)
    c.body.sleep()
    chunks.push(c)
  }

  // Registered with the time system, so Slow/Freeze visibly bite on the flying
  // wreckage too. scaledDelta is the Cannon step so Freeze holds the bodies and
  // Slow runs the world at 0.2x; meshes copy rigid-body pose each tick.
  unregisters.push(timeSystem.register(chunkGroup, {
    onUpdate(scaledDelta) {
      const burstLive = failBurstT >= 0 && failBurstT < 2.8
      if (breakupT < 0 && !burstLive) return
      if (breakupT >= 0) {
        for (const c of chunks) {
          c.life -= Math.abs(scaledDelta)
          if (c.life <= 0) { respawnChunk(c) }
        }
      }
      if (scaledDelta !== 0) {
        const simBodies = breakupT >= 0 ? chunks : burstDebris
        const rewinding = scaledDelta < 0
        const saved = rewinding
          ? simBodies.map((c) => ({
            v: c.body.velocity.clone(),
            w: c.body.angularVelocity.clone()
          }))
          : null
        if (rewinding) {
          for (const c of simBodies) {
            c.body.velocity.scale(-1)
            c.body.angularVelocity.scale(-1)
          }
        }
        debrisWorld.step(1 / 60, Math.abs(scaledDelta), 3)
        if (rewinding) {
          simBodies.forEach((c, i) => {
            c.body.velocity.copy(saved[i].v)
            c.body.angularVelocity.copy(saved[i].w)
          })
        }
      }
      if (breakupT >= 0) {
        for (const c of chunks) {
          c.mesh.position.copy(c.body.position)
          c.mesh.quaternion.copy(c.body.quaternion)
          c.x = c.body.position.x
          c.y = c.body.position.y
          c.z = c.body.position.z
        }
      }
      for (const c of burstDebris) {
        if (!c.mesh.visible) continue
        c.mesh.position.copy(c.body.position)
        c.mesh.quaternion.copy(c.body.quaternion)
      }
    }
  }))

  // One-shot structural failure as the player comes through Security into
  // Passenger. Placed a few metres inside the car so the third-person camera
  // (behind the player, looking forward) sees it drop instead of already
  // having it behind the lens. Hinges from just outside the aisle toward the
  // wall so the walkable ±0.58 path stays clear.
  const FAIL_BURST_Z = spans.passenger.maxZ - 2.6
  const FAIL_BURST_TRIGGER_Z = spans.passenger.maxZ + 0.85
  let failBurstArmed = true
  let failBurstT = -1

  const burstGroup = new THREE.Group()
  burstGroup.name = 'passenger-fail-burst'
  burstGroup.visible = false
  burstGroup.userData.noCameraCollision = true
  root.add(burstGroup)

  const burstPanelMat = new THREE.MeshStandardMaterial({
    color: 0x4a5058, roughness: 0.62, metalness: 0.7,
    emissive: 0x121416, emissiveIntensity: 0.12
  })
  const burstSteel = new THREE.MeshStandardMaterial({
    color: 0x6b727c, roughness: 0.4, metalness: 0.85
  })
  // Pivot on the aisle-side of the overhead slab so it trapdoors DOWN
  // along the seats, not across the path.
  const panelPivot = new THREE.Group()
  panelPivot.position.set(0.92, CARRIAGE_CEILING_Y - 0.04, FAIL_BURST_Z)
  const burstPanel = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 1.85), burstPanelMat)
  burstPanel.position.set(0.39, 0, 0)
  burstPanel.castShadow = true
  burstPanel.userData.noCameraCollision = true
  panelPivot.add(burstPanel)
  const panelRib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.7), burstSteel)
  panelRib.position.set(0.08, -0.06, 0)
  panelRib.userData.noCameraCollision = true
  panelPivot.add(panelRib)
  burstGroup.add(panelPivot)

  const beamPivot = new THREE.Group()
  beamPivot.position.set(1.22, CARRIAGE_CEILING_Y - 0.14, FAIL_BURST_Z + 0.55)
  const burstBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.35), burstSteel)
  burstBeam.castShadow = true
  burstBeam.userData.noCameraCollision = true
  beamPivot.add(burstBeam)
  burstGroup.add(beamPivot)

  const burstLight = new THREE.PointLight(0xffb060, 0, 11, 1.35)
  burstLight.position.set(0.55, 1.85, FAIL_BURST_Z)
  burstLight.userData.noCameraCollision = true
  burstGroup.add(burstLight)
  const burstFill = new THREE.PointLight(0xff6a3c, 0, 7, 1.6)
  burstFill.position.set(-0.2, 1.55, FAIL_BURST_Z - 0.4)
  burstFill.userData.noCameraCollision = true
  burstGroup.add(burstFill)

  const burstSparkMat = new THREE.MeshStandardMaterial({
    color: 0xffe8c0, emissive: 0xffc078, emissiveIntensity: 6,
    transparent: true, opacity: 1
  })
  const burstSparks = []
  for (let i = 0; i < 14; i++) {
    const spark = new THREE.Mesh(
      i % 3 === 0
        ? new THREE.SphereGeometry(0.045, 6, 5)
        : new THREE.CylinderGeometry(0.028, 0.02, 0.22, 5),
      burstSparkMat
    )
    spark.userData.noCameraCollision = true
    spark.userData.ox = 0.85 + skew(i + 2) * 0.35
    spark.userData.oy = 2.15 + Math.abs(skew(i + 9)) * 0.25
    spark.userData.oz = FAIL_BURST_Z + skew(i + 5) * 0.55
    spark.userData.vx = skew(i + 11) * 0.55
    spark.userData.vz = skew(i + 13) * 0.4
    burstGroup.add(spark)
    burstSparks.push(spark)
  }

  const burstDebris = []
  const luggageMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.82, metalness: 0.05 })
  const luggageGeo = new THREE.BoxGeometry(0.52, 0.3, 0.68)
  const luggageShape = new CANNON.Box(new CANNON.Vec3(0.26, 0.15, 0.34))
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(luggageGeo, luggageMat)
    mesh.castShadow = true
    mesh.visible = false
    mesh.userData.noCameraCollision = true
    burstGroup.add(mesh)
    const body = new CANNON.Body({
      mass: 1.4,
      shape: luggageShape,
      linearDamping: 0.05,
      angularDamping: 0.06
    })
    body.sleep()
    debrisWorld.addBody(body)
    burstDebris.push({ mesh, body })
  }

  function applyFailBurst() {
    if (failBurstT < 0) {
      burstGroup.visible = false
      return
    }
    burstGroup.visible = true
    const t = failBurstT
    const drop = Math.min(1, Math.max(0, t) / 0.55)
    // Fast, obvious trapdoor: nearly 90° down beside the aisle.
    panelPivot.rotation.z = -1.48 * drop * drop * (3 - 2 * drop)
    const beamDrop = Math.min(1, Math.max(0, t) / 0.7)
    beamPivot.position.y = (CARRIAGE_CEILING_Y - 0.14) - 0.55 * beamDrop * beamDrop
    beamPivot.rotation.x = 0.55 * beamDrop
    beamPivot.rotation.z = 0.18 * beamDrop

    const flicker = t < 1.7 ? (0.45 + 0.55 * Math.abs(Math.sin(t * 38))) : 1
    const lightFade = Math.max(0, 1 - t / 2.0)
    burstLight.intensity = 26 * lightFade * flicker
    burstFill.intensity = 10 * lightFade * flicker

    for (let i = 0; i < burstSparks.length; i++) {
      const spark = burstSparks[i]
      const alive = t >= 0 && t < 1.65
      spark.visible = alive
      if (!alive) continue
      spark.position.set(
        spark.userData.ox + spark.userData.vx * t,
        spark.userData.oy - t * 1.7 - i * 0.03,
        spark.userData.oz + spark.userData.vz * t
      )
      spark.rotation.set(t * 5 + i, 0.4, t * 6 + i * 0.5)
    }
    burstSparkMat.opacity = Math.max(0, 1 - t / 1.7)
    burstSparkMat.emissiveIntensity = Math.max(0, 7 * (1 - t / 1.55))
  }

  function startFailBurst() {
    failBurstArmed = false
    failBurstT = 0
    burstDebris.forEach((c, i) => {
      c.mesh.visible = true
      c.body.wakeUp()
      c.body.position.set(1.18 + i * 0.12, 1.45 + i * 0.2, FAIL_BURST_Z + 0.15 - i * 0.4)
      c.body.velocity.set(0.55 + i * 0.2, 3.2, -1.6 - i * 0.4)
      c.body.angularVelocity.set(5.5, 3.4 * (i ? -1 : 1), 4.8)
      c.body.quaternion.set(0, 0, 0, 1)
    })
    applyFailBurst()
  }

  unregisters.push(timeSystem.register(burstGroup, {
    onUpdate(scaledDelta) {
      if (failBurstT < 0) return
      failBurstT = THREE.MathUtils.clamp(failBurstT + scaledDelta, 0, 2.2)
      applyFailBurst()
    },
    getSnapshot: () => ({ failBurstT }),
    restoreSnapshot: (s) => { failBurstT = s.failBurstT; applyFailBurst() }
  }))

  function detachCarriage(group, delay, dir) {
    const t = breakupT - delay
    if (t <= 0) return
    group.rotation.y = dir * Math.min(0.5, t * 0.2)
    group.rotation.z = dir * Math.min(0.3, t * 0.12)
    group.position.x = dir * Math.min(9, t * t * 0.4)
    group.position.y = -Math.min(8, t * t * 0.45)
  }

  // ============================================================
  // FINAL SEQUENCE — Core depletion, the sprint, the brake
  // ============================================================
  const waveMat = createChronoFieldMaterial({
    baseColor: 0x2a0a3a, glowColor: 0xa855f7, opacity: 0.6, doubleSided: true, depthWrite: false
  })
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(INTERIOR_HALF_WIDTH * 2, CARRIAGE_CEILING_Y), waveMat)
  wave.name = 'time-wave'
  wave.position.y = CARRIAGE_CEILING_Y / 2
  wave.visible = false
  wave.userData.noCameraCollision = true
  root.add(wave)
  const waveLight = new THREE.PointLight(0xa855f7, 0, 8, 2)
  waveLight.position.y = 1.4
  root.add(waveLight)

  const stasisLight = new THREE.PointLight(0x93c5fd, 0, 16, 2)
  stasisLight.position.y = 1.35
  stasisLight.userData.noCameraCollision = true
  root.add(stasisLight)

  const stasisPulseMat = createChronoFieldMaterial({
    baseColor: 0x1e3a5f, glowColor: 0xbfdbfe, opacity: 0.0, doubleSided: true, depthWrite: false
  })
  const stasisPulse = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), stasisPulseMat)
  stasisPulse.name = 'finale-stasis-pulse'
  stasisPulse.visible = false
  stasisPulse.userData.noCameraCollision = true
  root.add(stasisPulse)

  let wasFinaleFreeze = false
  let finalePulseT = -1
  let resumeFlashT = -1

  const DEPLETE_Z = spans.passenger.center
  const WAVE_SPEED = 6.2 // just under the player's 7.2 m/s sprint
  const WAVE_LEAD = 6

  let depleted = false
  let waveZ = 0
  let braking = false
  let brakeT = 0

  const brake = createEmergencyBrake()
  addProp(brake, spans.cab.center - 1.5)

  unregisters.push(interaction.register(brake, {
    prompt: 'Pull the emergency brake',
    onInteract: () => {
      if (braking) return
      braking = true
      beginCinematic?.()
      // The run is over — hand the full kit back before the next level.
      timeSystem.setAbilityAvailability({})
      interaction.flashPrompt('The Chrono Express grinds to a halt…', 3000)
      hud.setObjective('The train stops on the bridge. You made it.')
    }
  }))

  // ============================================================
  // Particles: rising embers and falling sparks through the whole wreck
  // ============================================================
  const embers = createParticleField({
    count: 240,
    area: { halfX: 1.4, minY: 0.1, maxY: 2.5, minZ: spans.cab.minZ, maxZ: spans.vault.maxZ },
    color: 0xff8a3c, size: 0.055, opacity: 0.75, gravity: 0.32, drift: 0.22, seed: 13
  })
  const sparks = createParticleField({
    count: 90,
    area: { halfX: 1.45, minY: 0.05, maxY: 2.55, minZ: spans.cab.minZ, maxZ: spans.vault.maxZ },
    color: 0xffd9a0, size: 0.028, opacity: 0.4, gravity: -0.9, drift: 0.35, seed: 29
  })
  const chronoMotes = createChronoMoteField({
    seed: 47,
    ambient: {
      count: 40,
      halfX: 1.15,
      minY: 0.4,
      maxY: 2.15,
      minZ: spans.cab.minZ + 1,
      maxZ: spans.vault.maxZ - 1
    },
    loop: { count: 16, z: spans.cargo.center, halfZ: 4.2, halfX: 1.15 },
    walkway: { count: 12, minZ: gapMinZ, maxZ: gapMaxZ, halfX: 1.1 },
    wave: { count: 22, halfZ: 3.4, halfX: 1.15 }
  })
  root.add(embers.points, sparks.points, chronoMotes.points)

  // ============================================================
  const lever = brake.getObjectByName('brake-lever')
  let elapsed = 0

  // Capture the collapse at each checkpoint, then restore moving hazards to a
  // predictable phase. The final checkpoint also puts the pursuing wave far
  // enough behind the player for repeated deaths to remain recoverable.
  function captureCheckpointRestore(checkpointZ) {
    const saved = {
      depleted,
      breakupT,
      lastCheckpointZ,
      bounds: { ...bounds },
      carriages: Object.values(carriages).map((group) => ({
        group,
        position: group.position.clone(),
        rotation: group.rotation.clone()
      }))
    }

    return () => {
      depleted = saved.depleted
      breakupT = saved.breakupT
      lastCheckpointZ = saved.lastCheckpointZ
      Object.assign(bounds, saved.bounds)
      bounds.maxZ = Math.max(bounds.maxZ, checkpointZ + 0.75)
      for (const { group, position, rotation } of saved.carriages) {
        group.position.copy(position)
        group.rotation.copy(rotation)
      }

      ramT = 0
      applyRams()
      loopT = 0
      applyLoop()
      slabDriftT = 0
      slabSettle = 0
      failCooldown = 0
      braking = false
      brakeT = 0
      root.rotation.z = 0
      root.position.y = 0
      chunkGroup.visible = breakupT >= 0
      chunks.forEach((chunk) => {
        respawnChunk(chunk)
        chunk.mesh.position.copy(chunk.body.position)
        chunk.mesh.quaternion.copy(chunk.body.quaternion)
      })

      wasFinaleFreeze = false
      finalePulseT = -1
      resumeFlashT = -1
      stasisPulse.visible = false
      stasisLight.intensity = 0
      wreckExterior.setFrozenLook(false)
      embers.material.color.setHex(0xff8a3c)
      embers.material.size = 0.055
      embers.material.opacity = 0.75
      sparks.material.color.setHex(0xffd9a0)
      sparks.material.size = 0.028
      sparks.material.opacity = 0.4
      chunkMat.color.setHex(0x3d4248)
      chunkMat.emissive.setHex(0x141618)
      chunkMat.emissiveIntensity = 0.22
      burstPanelMat.emissive.setHex(0x121416)
      burstPanelMat.emissiveIntensity = 0.12
      waveLight.color.setHex(0xa855f7)
      waveLight.distance = 8
      waveMat.customUniforms.uOpacity.value = 0.6
      burstSteel.emissive.setHex(0x000000)
      burstSteel.emissiveIntensity = 0
      luggageMat.emissive.setHex(0x000000)
      luggageMat.emissiveIntensity = 0

      waveZ = depleted ? DEPLETE_Z + WAVE_LEAD : 0
      wave.position.z = waveZ
      wave.scale.set(1, 1, 1)
      wave.visible = depleted
      waveLight.position.z = waveZ
      waveLight.intensity = depleted ? 12 : 0
    }
  }

  return {
    objective: 'The Chrono Core is tearing the train apart — escape to the locomotive',
    checkpoint: {
      position: new THREE.Vector3(0, 0, spans.vault.center + 3),
      yaw: Math.PI,
      restore: captureCheckpointRestore(spans.vault.center + 3)
    },
    bounds,
    supports: slabSupports,
    voids: gapVoids,
    getCarriageVolumes: () => listCarriageVolumes(spans),   
    get isCinematic() { return braking },

    update(delta) {
      const mode = timeSystem.getMode()
      const finaleFreeze = depleted && mode === 'FREEZE' && !braking
      if (finaleFreeze && !wasFinaleFreeze) {
        finalePulseT = 0
        resumeFlashT = -1
      }
      if (wasFinaleFreeze && !finaleFreeze && depleted && !braking) {
        resumeFlashT = 0
        finalePulseT = -1
      }
      wasFinaleFreeze = finaleFreeze
      if (finalePulseT >= 0) finalePulseT += delta
      if (resumeFlashT >= 0) resumeFlashT += delta
      if (resumeFlashT > 0.5) resumeFlashT = -1
      if (finalePulseT > 0.5) finalePulseT = -1

      const resumeBoost = resumeFlashT >= 0 && resumeFlashT < 0.22 ? 1.4 : 1
      const exteriorScale = braking
        ? Math.max(0, 1 - brakeT / 2.5)
        : finaleFreeze ? 0 : resumeBoost
      outdoorEnv.update(finaleFreeze ? 0 : delta)
      wreckExterior.update(delta, exteriorScale)
      env.update(finaleFreeze ? 0 : delta)
      embers.update(finaleFreeze ? 0 : delta)
      sparks.update(finaleFreeze ? 0 : delta)
      elapsed += delta
      failCooldown = Math.max(0, failCooldown - delta)

      const pp = player.mesh.position
      const modeInt = MODE_INT[mode] ?? 0
      let motionScale = 1
      if (mode === 'SLOW') motionScale = 0.2
      else if (mode === 'FREEZE') motionScale = 0
      else if (mode === 'REWIND') motionScale = -1.25

      const chronoFade = braking ? Math.max(0, 1 - brakeT * 0.9) : 1
      chronoMotes.update(delta, {
        motionScale,
        mode,
        loopPeriod: LOOP_PERIOD,
        loopTime: loopT,
        waveZ,
        depleted,
        walkwaySettle: slabSettle,
        fade: chronoFade,
        stasis: finaleFreeze,
        playerZ: pp.z
      })

      // Shader uniforms for the frozen-walkway slabs and the time wave.
      const freezePulse = mode === 'FREEZE' ? 0.1 * (0.5 + 0.5 * Math.sin(elapsed * 3.4)) : 0
      slabMat.customUniforms.uTime.value += finaleFreeze ? 0 : delta
      slabMat.customUniforms.uMode.value = modeInt
      slabMat.customUniforms.uIntensity.value = 0.35 + slabSettle * 0.65 + freezePulse
      if (!finaleFreeze) waveMat.customUniforms.uTime.value += delta
      waveMat.customUniforms.uMode.value = finaleFreeze ? 2 : 3
      const resumeWave = resumeFlashT >= 0 ? Math.max(0, 1 - resumeFlashT / 0.4) * 0.7 : 0
      waveMat.customUniforms.uIntensity.value = depleted
        ? (finaleFreeze ? 1.55 + Math.sin(elapsed * 2.2) * 0.12 : 1.12 + Math.sin(elapsed * 5.5) * 0.12) + resumeWave
        : 1.0
      waveMat.customUniforms.uOpacity.value = finaleFreeze ? 0.92 : 0.6
      wave.scale.set(finaleFreeze ? 1.14 : 1, finaleFreeze ? 1.18 : 1, 1)
      walkwayGlow.intensity = slabSettle * (mode === 'FREEZE' ? 4.2 : 1.6)

      if (!finaleFreeze) lever.rotation.x = -0.4 + Math.sin(elapsed * 2.2) * 0.05

      wreckExterior.setFrozenLook(finaleFreeze)

      const resumeWarm = resumeFlashT >= 0 ? Math.max(0, 1 - resumeFlashT / 0.45) : 0
      stasisLight.position.set(pp.x, 1.45, pp.z)
      stasisLight.distance = finaleFreeze ? 24 : 16
      stasisLight.intensity = finaleFreeze ? 12 : resumeWarm * 16
      stasisLight.color.setHex(finaleFreeze ? 0xdbeafe : 0xff6a32)

      if (finalePulseT >= 0 && finalePulseT < 0.48) {
        const u = finalePulseT / 0.48
        stasisPulse.visible = true
        stasisPulse.position.set(pp.x, 1.15, pp.z)
        stasisPulse.scale.setScalar(0.45 + u * 9.5)
        stasisPulseMat.customUniforms.uTime.value += delta
        stasisPulseMat.customUniforms.uMode.value = 2
        stasisPulseMat.customUniforms.uIntensity.value = 1.15 * (1 - u)
        stasisPulseMat.customUniforms.uOpacity.value = 0.22 * (1 - u) * (1 - u)
      } else {
        stasisPulse.visible = false
        stasisPulseMat.customUniforms.uOpacity.value = 0
      }

      if (finaleFreeze) {
        scene.background.copy(FINALE_FREEZE_COLOR)
        scene.fog.color.copy(FINALE_FREEZE_COLOR)
        scene.fog.near = 6
        scene.fog.far = 88
        chunkMat.color.setHex(0x64748b)
        chunkMat.emissive.setHex(0xbfdbfe)
        chunkMat.emissiveIntensity = 1.85
        burstPanelMat.emissive.setHex(0x93c5fd)
        burstPanelMat.emissiveIntensity = 1.35
        burstSteel.emissive.setHex(0xdbeafe)
        burstSteel.emissiveIntensity = 1.1
        luggageMat.emissive.setHex(0x7dd3fc)
        luggageMat.emissiveIntensity = 0.95
        burstSparkMat.color.setHex(0xf0f9ff)
        burstSparkMat.emissive.setHex(0xe0f2fe)
        burstSparkMat.emissiveIntensity = 8
        embers.material.color.setHex(0xdbeafe)
        embers.material.size = 0.12
        embers.material.opacity = 0.95
        sparks.material.color.setHex(0xffffff)
        sparks.material.size = 0.085
        sparks.material.opacity = 1
      } else if (!braking) {
        scene.background.setHex(resumeWarm > 0.08 ? 0x1a1412 : NIGHT_COLOR.getHex())
        scene.fog.color.set(resumeWarm > 0.08 ? 0x241814 : 0x10141c)
        scene.fog.near = 10
        scene.fog.far = resumeWarm > 0 ? 55 + (1 - resumeWarm) * 65 : 120
        chunkMat.color.setHex(0x3d4248)
        chunkMat.emissive.setHex(resumeWarm > 0.08 ? 0xff6a40 : 0x141618)
        chunkMat.emissiveIntensity = 0.22 + resumeWarm * 1.6
        burstPanelMat.emissive.setHex(resumeWarm > 0.08 ? 0xff7048 : 0x121416)
        burstPanelMat.emissiveIntensity = 0.12 + resumeWarm * 1.1
        burstSteel.emissive.setHex(0x000000)
        burstSteel.emissiveIntensity = 0
        luggageMat.emissive.setHex(resumeWarm > 0.08 ? 0xff6a28 : 0x000000)
        luggageMat.emissiveIntensity = resumeWarm * 1.2
        burstSparkMat.color.setHex(0xffe8c0)
        burstSparkMat.emissive.setHex(0xffc078)
        embers.material.color.setHex(resumeWarm > 0.08 ? 0xff5a20 : 0xff8a3c)
        embers.material.size = 0.055 + resumeWarm * 0.05
        embers.material.opacity = 0.75 + resumeWarm * 0.2
        sparks.material.color.setHex(resumeWarm > 0.08 ? 0xffd9a0 : 0xffd9a0)
        sparks.material.size = 0.028 + resumeWarm * 0.04
        sparks.material.opacity = 0.4 + resumeWarm * 0.45
      }

      // --- Brake pulled: the stop-on-the-bridge cinematic -----------------
      if (braking) {
        brakeT += delta
        const shake = Math.max(0, 1 - brakeT / 2.6)
        root.rotation.z = Math.sin(brakeT * 26) * 0.02 * shake
        root.position.y = Math.sin(brakeT * 33) * 0.02 * shake

        if (wave.visible) {
          const s = Math.max(0, 1 - brakeT * 0.9)
          wave.scale.set(1, s, 1)
          waveLight.intensity = 14 * s
          waveMat.customUniforms.uIntensity.value = 1.15 * s
          if (s <= 0.01) { wave.visible = false; waveLight.intensity = 0 }
        }

        // Night gives way to first light as the train settles on the bridge.
        const dawn = Math.min(1, Math.max(0, (brakeT - 2.2) / 2.0))
        scene.background.lerpColors(NIGHT_COLOR, DAWN_COLOR, dawn)
        scene.fog.color.copy(scene.background)
        scene.fog.far = 40 + dawn * 70

        if (brakeT > 4.8) {
          braking = false
          root.rotation.z = 0
          root.position.y = 0
          advance()
        }
        return
      }

      // --- Ambient instability: the whole train lurches, worse over time ---
      if (!finaleFreeze) {
        const unrest = 1 + Math.min(1.5, elapsed * 0.02) + (breakupT >= 0 ? 1.2 : 0)
        root.rotation.z = (Math.sin(elapsed * 1.7) * 0.012 + Math.sin(elapsed * 4.3) * 0.004) * unrest
        root.position.y = Math.sin(elapsed * 6.1) * 0.012 * unrest
      }

      // --- Rolling checkpoints (descending z) -----------------------------
      for (const z of checkpointZs) {
        if (pp.z < z && z < lastCheckpointZ) {
          lastCheckpointZ = z
          respawn.setCheckpoint(new THREE.Vector3(0, 0, z), Math.PI, {
            restore: captureCheckpointRestore(z)
          })
        }
      }

      hint('mechanical', pp.z, spans.mechanical.maxZ,
        'Mechanical car — the pistons are running at wrecked speed. [1]/Q SLOW is the only way through.')
      hint('cargo', pp.z, spans.cargo.maxZ,
        'Cargo car — this bulkhead is stuck in a time loop. Watch the ring and move on green.')
      hint('security', pp.z, spans.security.maxZ,
        'Security car — the floor is gone. [2]/F FREEZE the suspended wreckage into a walkway.')
      hint('passenger', pp.z, spans.passenger.maxZ,
        'The train is coming apart behind you — do not stop.')

      if (failBurstArmed && pp.z < FAIL_BURST_TRIGGER_Z) startFailBurst()

      // --- FAST-TIME CAR: runaway pistons ---------------------------------
      for (const r of rams) {
        if (Math.abs(pp.z - r.z) < 0.55 && Math.abs(pp.x - r.head.position.x) < 0.5) {
          failSoft('Crushed by a runaway piston!')
          break
        }
      }

      // --- TIME-LOOP CAR: crushing bulkhead and falling girder -------------
      if (loopDoorOpen < 0.35 && Math.abs(pp.z - loopDoorZ) < 0.5) {
        failSoft('The bulkhead slammed shut on you!')
      }
      if (loopBeamDown > 0.55 && Math.abs(pp.z - loopBeamZ) < 0.65) {
        failSoft('Crushed by the falling girder!')
      }

      // --- FROZEN CAR: suspended wreckage as a walkway ---------------------
      const frozen = mode === 'FREEZE'
      slabSettle += ((frozen ? 1 : 0) - slabSettle) * Math.min(1, delta * 7)
      for (const slab of slabs) {
        const seed = slab.userData.seed
        const driftY = 0.8 + Math.sin(slabDriftT * 1.2 + seed) * 0.32
        const driftX = Math.sin(slabDriftT * 0.8 + seed) * 0.5
        slab.position.y = THREE.MathUtils.lerp(driftY, 0.06, slabSettle)
        slab.position.x = THREE.MathUtils.lerp(driftX, 0, slabSettle)
        slab.rotation.z = THREE.MathUtils.lerp(Math.sin(slabDriftT + seed) * 0.5, 0, slabSettle)
        slab.rotation.x = THREE.MathUtils.lerp(Math.cos(slabDriftT * 0.9 + seed) * 0.4, 0, slabSettle)
      }
      slabSupports.length = 0
      if (frozen) {
        for (const slab of slabs) {
          slabSupports.push({
            minX: slab.position.x - SLAB_HALF_X - 0.3,
            maxX: slab.position.x + SLAB_HALF_X + 0.3,
            minZ: slab.position.z - SLAB_HALF_Z - 0.12,
            maxZ: slab.position.z + SLAB_HALF_Z + 0.12,
            y: slab.position.y + SLAB_HALF_Y
          })
        }
      }
      if (pp.z > gapMinZ && pp.z < gapMaxZ && !frozen) {
        failSoft('The floor is gone — FREEZE the wreckage into a walkway!', 'fell')
      } else if (pp.z > gapMinZ && pp.z < gapMaxZ && pp.y < -0.3) {
        failSoft('The floor is gone — FREEZE the wreckage into a walkway!', 'fell')
      }

      // --- BREAKING TRAIN --------------------------------------------------
      if (breakupT < 0 && pp.z < spans.passenger.maxZ - 1) {
        breakupT = 0
        chunkGroup.visible = true
        hud.showToast('The couplings are letting go — RUN!', 2600)
      }
      if (breakupT >= 0 && !finaleFreeze) {
        breakupT += delta
        // Each carriage yaws, rolls and drops independently of its siblings —
        // the Train/Carriage hierarchy doing real work.
        detachCarriage(carriages.vault, 0, 1)
        detachCarriage(carriages.mechanical, 1.1, -1)
        detachCarriage(carriages.cargo, 2.4, 1)
        detachCarriage(carriages.security, 3.8, -1)
        // The floor behind goes with them — no walking back into the void.
        // Never clamp ahead of where the player actually is, or the collapse
        // would yank them forward instead of closing off behind them.
        if (breakupT > 1.0) bounds.maxZ = Math.min(bounds.maxZ, spans.passenger.maxZ - 0.5)
        if (breakupT > 3.2) {
          bounds.maxZ = Math.min(
            bounds.maxZ,
            Math.max(lastCheckpointZ + 0.75, spans.passenger.center + 1, pp.z + 3)
          )
        }
      }

      // --- FINAL SEQUENCE: depletion, then the sprint ----------------------
      if (!depleted && pp.z < DEPLETE_Z) {
        depleted = true
        timeSystem.setAbilityAvailability({ SLOW: false, REWIND: false, GHOST: false })
        lastCheckpointZ = -Infinity // no further checkpoints past here
        waveZ = DEPLETE_Z + WAVE_LEAD
        wave.visible = true
        respawn.setCheckpoint(new THREE.Vector3(0, 0, DEPLETE_Z), Math.PI, {
          restore: captureCheckpointRestore(DEPLETE_Z)
        })
        hud.showToast('CHRONO CORE DEPLETED — only FREEZE remains. RUN!', 3800)
        hud.setObjective('Sprint to the locomotive (hold Shift) — pull the emergency brake!')
      }

      if (depleted) {
        // Freeze is the one ability left, and it is what holds time off you.
        const holding = mode === 'FREEZE'
        if (!holding && !respawn.isFailing()) waveZ -= WAVE_SPEED * delta
        wave.position.z = waveZ
        waveLight.position.z = finaleFreeze ? THREE.MathUtils.lerp(waveZ, pp.z, 0.32) : waveZ
        waveLight.distance = finaleFreeze ? 22 : 8
        waveLight.color.setHex(finaleFreeze ? 0xbfdbfe : 0xa855f7)
        waveLight.intensity = finaleFreeze
          ? 26 + Math.sin(elapsed * 2.3) * 2
          : 13 + Math.sin(elapsed * 9) * 3 + resumeWarm * 10

        if (waveZ <= pp.z + 0.35 && failCooldown <= 0) {
          failSoft('Time caught up with you!')
          waveZ = DEPLETE_Z + WAVE_LEAD
        }
      }
    },

    dispose() {
      unregisters.forEach((fn) => fn())
      // outdoorEnv.dispose() only frees GPU resources — the group still has to
      // come out of the scene here or it survives every level teardown.
      outdoorEnv.dispose()
      wreckExterior.dispose()
      scene.remove(outdoorEnv.group, wreckExterior.group, root)
      disposeObject(root)
    }
  }
}

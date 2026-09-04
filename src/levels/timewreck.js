import * as THREE from 'three'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y } from '../environment/carriages.js'
import { createParticleField } from '../environment/particles.js'
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
const NIGHT_COLOR = new THREE.Color(0x140708)
const DAWN_COLOR = new THREE.Color(0x2c3a56)
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
  scene, interaction, timeSystem, hud, player, camera, respawn, advance
}) {
  // Level 3 is the "unstable" end of the scale — the shaders read this.
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.8)

  const env = createCarriageEnvironment({ damaged: true })
  const { root, spans, carriages } = env
  const outdoorEnv = createOutdoorEnvironment({ mode: 'moving', speed: 45.0, stormy: true })
  scene.add(outdoorEnv.group, root)
  scene.background = new THREE.Color().copy(NIGHT_COLOR)
  // Wide enough to keep the storm-lit scenery outside readable.
  scene.fog = new THREE.Fog(0x1a0708, 10, 120)

  const unregisters = []
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
    color: 0x6b7078, metalness: 0.9, roughness: 0.35, emissive: 0x330d05, emissiveIntensity: 1.2
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
      color: 0x33383f, metalness: 0.85, roughness: 0.35, emissive: 0x1a0d06, emissiveIntensity: 1
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
  const slabs = []
  for (let i = 0; i < 5; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 1.05), slabMat)
    slab.userData.seed = i * 1.7
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
    color: 0x39332c, roughness: 0.9, metalness: 0.15, emissive: 0x2a0c04, emissiveIntensity: 0.6
  })
  const chunkGeos = [
    new THREE.BoxGeometry(0.34, 0.22, 0.28),
    new THREE.DodecahedronGeometry(0.2, 0),
    new THREE.BoxGeometry(0.5, 0.12, 0.16)
  ]
  const chunks = []
  let chunkSeed = 0
  function respawnChunk(c) {
    const s = ++chunkSeed
    c.x = skew(s + 11) * 1.25
    c.y = 0.5 + Math.abs(skew(s + 3)) * 1.5
    c.z = spans.passenger.maxZ + 3
    c.vx = skew(s + 5) * 0.9
    c.vy = 0.3 + Math.abs(skew(s + 7)) * 1.4
    c.vz = -(7 + Math.abs(skew(s + 9)) * 6)
    c.life = 4.0
  }
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(chunkGeos[i % 3], chunkMat)
    mesh.castShadow = true
    chunkGroup.add(mesh)
    const c = { mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }
    respawnChunk(c)
    // Stagger so they don't arrive as one volley.
    c.life = 0.4 * i
    chunks.push(c)
  }

  // Registered with the time system, so Slow/Freeze visibly bite on the flying
  // wreckage too. This ballistic integration is also the hand-off point for
  // Phase 6 — swapping it for a real rigid body changes only this callback.
  unregisters.push(timeSystem.register(chunkGroup, {
    onUpdate(scaledDelta) {
      if (breakupT < 0) return
      for (const c of chunks) {
        c.life -= Math.abs(scaledDelta)
        if (c.life <= 0) { respawnChunk(c) }
        c.vy -= 6.5 * scaledDelta
        c.x += c.vx * scaledDelta
        c.y += c.vy * scaledDelta
        c.z += c.vz * scaledDelta
        if (c.y < 0.12) { c.y = 0.12; c.vy = Math.abs(c.vy) * 0.35 }
        c.mesh.position.set(c.x, c.y, c.z)
        c.mesh.rotation.x += scaledDelta * 3.1
        c.mesh.rotation.y += scaledDelta * 2.2
      }
    }
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
    count: 160,
    area: { halfX: 1.45, minY: 0.05, maxY: 2.55, minZ: spans.cab.minZ, maxZ: spans.vault.maxZ },
    color: 0xffd9a0, size: 0.03, opacity: 0.6, gravity: -0.9, drift: 0.35, seed: 29
  })
  root.add(embers.points, sparks.points)

  // ============================================================
  const lever = brake.getObjectByName('brake-lever')
  let elapsed = 0

  return {
    objective: 'The Chrono Core is tearing the train apart — escape to the locomotive',
    checkpoint: { position: new THREE.Vector3(0, 0, spans.vault.center + 3), yaw: Math.PI },
    bounds,

    update(delta) {
      outdoorEnv.update(delta)
      env.update(delta)
      embers.update(delta)
      sparks.update(delta)
      elapsed += delta
      failCooldown = Math.max(0, failCooldown - delta)

      const pp = player.mesh.position
      const mode = timeSystem.getMode()
      const modeInt = MODE_INT[mode] ?? 0

      // Shader uniforms for the frozen-walkway slabs and the time wave.
      slabMat.customUniforms.uTime.value += delta
      slabMat.customUniforms.uMode.value = modeInt
      slabMat.customUniforms.uIntensity.value = 0.35 + slabSettle * 0.65
      waveMat.customUniforms.uTime.value += delta
      waveMat.customUniforms.uMode.value = 3
      waveMat.customUniforms.uIntensity.value = 1.0

      lever.rotation.x = -0.4 + Math.sin(elapsed * 2.2) * 0.05

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
      const unrest = 1 + Math.min(1.5, elapsed * 0.02) + (breakupT >= 0 ? 1.2 : 0)
      root.rotation.z = (Math.sin(elapsed * 1.7) * 0.012 + Math.sin(elapsed * 4.3) * 0.004) * unrest
      root.position.y = Math.sin(elapsed * 6.1) * 0.012 * unrest

      // --- Rolling checkpoints (descending z) -----------------------------
      for (const z of checkpointZs) {
        if (pp.z < z && z < lastCheckpointZ) {
          lastCheckpointZ = z
          respawn.setCheckpoint(new THREE.Vector3(0, 0, z), Math.PI)
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
      if (pp.z > gapMinZ && pp.z < gapMaxZ && !frozen) {
        failSoft('The floor is gone — FREEZE the wreckage into a walkway!', 'fell')
      }

      // --- BREAKING TRAIN --------------------------------------------------
      if (breakupT < 0 && pp.z < spans.passenger.maxZ - 1) {
        breakupT = 0
        chunkGroup.visible = true
        hud.showToast('The couplings are letting go — RUN!', 2600)
      }
      if (breakupT >= 0) {
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
          bounds.maxZ = Math.min(bounds.maxZ, Math.max(spans.passenger.center + 1, pp.z + 3))
        }
      }

      // --- FINAL SEQUENCE: depletion, then the sprint ----------------------
      if (!depleted && pp.z < DEPLETE_Z) {
        depleted = true
        timeSystem.setAbilityAvailability({ SLOW: false, REWIND: false, GHOST: false })
        respawn.setCheckpoint(new THREE.Vector3(0, 0, DEPLETE_Z), Math.PI)
        lastCheckpointZ = -Infinity // no further checkpoints past here
        waveZ = pp.z + WAVE_LEAD
        wave.visible = true
        hud.showToast('CHRONO CORE DEPLETED — only FREEZE remains. RUN!', 3800)
        hud.setObjective('Sprint to the locomotive (hold Shift) — pull the emergency brake!')
      }

      if (depleted) {
        // Freeze is the one ability left, and it is what holds time off you.
        const holding = mode === 'FREEZE'
        if (!holding) waveZ -= WAVE_SPEED * delta
        wave.position.z = waveZ
        waveLight.position.z = waveZ
        waveLight.intensity = 12 + Math.sin(elapsed * 9) * 3

        if (waveZ <= pp.z + 0.35 && failCooldown <= 0) {
          failSoft('Time caught up with you!')
          waveZ = DEPLETE_Z + WAVE_LEAD
        }
      }
    },

    dispose() {
      // Hand the full ability kit back — a restart must not inherit Level 3's
      // scripted depletion.
      if (timeSystem?.setAbilityAvailability) timeSystem.setAbilityAvailability({})
      unregisters.forEach((fn) => fn())
      // outdoorEnv.dispose() only frees GPU resources — the group still has to
      // come out of the scene here or it survives every level teardown.
      outdoorEnv.dispose()
      scene.remove(outdoorEnv.group, root)
      disposeObject(root)
    }
  }
}

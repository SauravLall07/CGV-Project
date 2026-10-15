import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y, listCarriageVolumes } from '../environment/carriages.js'
import { createLightPool } from '../core/light-pool.js'
import { WRECK_WALL_X } from '../environment/carriage-bounds.js'
import { createParticleField, createChronoMoteField } from '../environment/particles.js'
import { createTimewreckExterior } from '../environment/timewreck-exterior.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { createSecurityLaserMaterial } from '../shaders/security-laser.js'
import { bindingLabel, settings } from '../core/settings.js'
import { cargoGangwayLayout, cargoLoopPose, cutCargoGangwayFloor, createCargoGangway } from './timewreck-cargo.js'
import {
  DASH_DOOR_TIMING,
  createCarriageShake,
  createStormDebris,
  createLampMotion,
  createGrabHandles
} from './timewreck-atmosphere.js'
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
// Inset from the shell wall, so floor voids, lips and the collapse slab stop
// just short of the panelling. Derived from the shell rather than hardcoded:
// the wreck is built at the same width as Level 2, and these set pieces have
// to span whatever that is.
const WALL_INSET = 0.1
const INTERIOR_HALF_WIDTH = WRECK_WALL_X - WALL_INSET

// Deterministic scatter, matching the environment modules.
const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1

function createEmergencyBrake() {
  // Visual-only restyle of the final objective pedestal. Interaction is still
  // registered on this group; lever name/pose must stay stable for update().
  const brake = new THREE.Group()
  brake.name = 'emergency-brake'

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x2a241c, roughness: 0.55, metalness: 0.62, emissive: 0x1a1008, emissiveIntensity: 0.12
  })
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.18
  })
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3a4048, roughness: 0.4, metalness: 0.85
  })

  // Stepped pedestal — same approximate height as the old housing.
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.58), pedestalMat)
  base.position.y = 0.07
  base.castShadow = true
  brake.add(base)
  const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.62), brassMat)
  baseTrim.position.y = 0.15
  brake.add(baseTrim)

  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.38), pedestalMat)
  housing.position.y = 0.58
  housing.castShadow = true
  brake.add(housing)
  const housingFrame = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, 0.04), brassMat)
  housingFrame.position.set(0, 0.58, 0.2)
  brake.add(housingFrame)

  // Side brass columns for a mechanical “station” read.
  for (const x of [-0.28, 0.28]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.9, 8), brassMat)
    col.position.set(x, 0.55, -0.05)
    brake.add(col)
  }

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.2, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0xe8d090, emissive: 0x6a4a12, emissiveIntensity: 1.55, roughness: 0.45, metalness: 0.55
    })
  )
  plate.position.set(0, 0.86, 0.22)
  brake.add(plate)

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), steelMat)
  pivot.rotation.z = Math.PI / 2
  pivot.position.set(0, 1.02, 0.1)
  brake.add(pivot)
  const pivotCap = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14), brassMat)
  pivotCap.rotation.y = Math.PI / 2
  pivotCap.position.set(0, 1.02, 0.1)
  brake.add(pivotCap)

  const lever = new THREE.Group()
  lever.name = 'brake-lever'
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.62, 10),
    steelMat
  )
  shaft.position.y = 0.31
  shaft.castShadow = true
  lever.add(shaft)
  const shaftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), brassMat)
  shaftSleeve.position.y = 0.08
  lever.add(shaftSleeve)

  const grip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xd0342a, emissive: 0x6a120c, emissiveIntensity: 1.9, roughness: 0.45
    })
  )
  grip.position.y = 0.64
  grip.castShadow = true
  lever.add(grip)

  // Keep lever local pose identical — update() animates lever.rotation.x.
  lever.position.set(0, 1.02, 0.1)
  lever.rotation.x = -0.4
  brake.add(lever)

  // Warm amber spotlight on the brake (cool storm contrast comes from the cab).
  const warning = new THREE.PointLight(0xffb060, 9, 5.2, 2)
  warning.position.set(0, 1.35, 0.55)
  brake.add(warning)

  return brake
}

export function createTimewreckLevel({
  scene, interaction, timeSystem, hud, player, camera, respawn, advance, beginCinematic, startCarriage = null
}) {
  // Level 3 is the "unstable" end of the scale — the shaders read this.
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.8)
  // Boarding / Level 2 hide the Chrono deck until powers unlock; L3 starts with them.
  hud?.setChronoVisible?.(true)

  const env = createCarriageEnvironment({ damaged: true })
  const { root, spans, carriages } = env
  // MEDIUM outdoor density: stormy sky/fog/palette unchanged, but far fewer
  // instanced trees/terrain segments. L3 is fill-rate bound (~16→42 FPS at
  // 50% render scale; shadows off did not help), so this is the cheapest
  // GPU win that does not touch lights, hazards or carriage gameplay.
  const outdoorEnv = createOutdoorEnvironment({
    mode: 'moving',
    speed: 45.0,
    stormy: true,
    quality: 'MEDIUM'
  })
  const wreckExterior = createTimewreckExterior({
    minZ: spans.cab.minZ - 10,
    maxZ: spans.vault.maxZ + 12,
    speed: 45
  })
  scene.add(outdoorEnv.group, wreckExterior.group, root)
  scene.background = new THREE.Color().copy(NIGHT_COLOR)
  // Cool storm fog — contrasts warm amber carriage fill; range kept for readability.
  scene.fog = new THREE.Fog(0x121a28, 38, 185)

  // Damaged PBR surfaces are very dark; short-range emergency points leave most
  // of each car on ambient alone, which ACES tone mapping crushes to near-black.
  // One soft directional key (no shadows) lights the aisle and player.
  const aisleKey = new THREE.DirectionalLight(0xb8c8e0, 1.75)
  aisleKey.position.set(1.6, 13, spans.vault.maxZ + 8)
  scene.add(aisleKey)
  const aisleKeyTarget = new THREE.Object3D()
  aisleKeyTarget.position.set(0, 0.6, spans.cab.minZ - 6)
  scene.add(aisleKeyTarget)
  aisleKey.target = aisleKeyTarget

  const playerMatRestore = []
  player.mesh.traverse((node) => {
    if (!node.isMesh?.material) return
    const mats = Array.isArray(node.material) ? node.material : [node.material]
    for (const m of mats) {
      if (!m.isMeshStandardMaterial) continue
      playerMatRestore.push({
        m,
        emissive: m.emissive.getHex(),
        ei: m.emissiveIntensity
      })
      m.emissive.setHex(0x4a5a6e)
      m.emissiveIntensity = 0.42
    }
  })

  const unregisters = []
  unregisters.push(interaction.registerBlocker(root))
  const bounds = { ...env.interiorBounds }
  const addProp = (obj, z, x = 0, y = 0) => { obj.position.set(x, y, z); root.add(obj); return obj }

  let failCooldown = 0
  const LEVEL_OBJECTIVE = 'The Chrono Core is tearing the train apart — escape to the locomotive'
  const COLLAPSE_HINT = 'Freeze the tile — then hold W + Shift'
  const COLLAPSE_HINT_S = 4.6
  let collapseHintHoldUntil = -1
  let pendingToast = null

  function showLevelToast(message, duration) {
    if (elapsed < collapseHintHoldUntil) {
      pendingToast = { message, duration }
      return
    }
    hud.showToast(message, duration)
  }

  function failSoft(message, reason = 'caught') {
    if (failCooldown > 0) return false
    failCooldown = 1.3
    respawn.fail(reason)
    if (message) showLevelToast(message, 1900)
    return true
  }
  // Hints fire on a DESCENDING z, since the escape runs the other way.
  const hintsShown = new Set()
  function hint(key, playerZ, enterZ, message, duration = 3400) {
    if (hintsShown.has(key) || playerZ > enterZ) return
    hintsShown.add(key)
    showLevelToast(message, duration)
  }

  let lastCheckpointZ = Infinity

  // Vault security checkpoint: two wall-mounted racks spanning the aisle.
  // Each rack's three beams rise and fall together. The open window is when
  // the lowest beam is above head height. Gates use different speeds so the
  // clear windows rarely line up.
  const VAULT_BEAM_BASES = [0.5, 1.1, 1.7]
  // Lift high enough that a standing player (1.85 m) has a clear window when
  // the lowest beam is near its peak — not only a single-frame graze.
  const VAULT_BEAM_LIFT = 1.85
  const VAULT_BEAM_LENGTH = 4.8
  const VAULT_BEAM_RADIUS = 0.04
  const VAULT_HIT_HALF_Y = 0.055
  const VAULT_HIT_HALF_Z = 0.11
  const VAULT_BODY_HEIGHT = 1.85
  const vaultPostMat = new THREE.MeshStandardMaterial({
    color: 0x1c2430, metalness: 0.92, roughness: 0.28, emissive: 0x3a1010, emissiveIntensity: 0.22
  })
  const vaultPlateMat = new THREE.MeshStandardMaterial({
    color: 0x2a323c, metalness: 0.88, roughness: 0.32, emissive: 0x2a0808, emissiveIntensity: 0.15
  })
  const vaultGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  let vaultGateT = 0

  function createVaultGate(z, phase, speed) {
    const group = new THREE.Group()
    group.name = 'vault-security-gate'
    group.position.set(0, 0, z)
    const laserMat = createSecurityLaserMaterial({ beamCount: 1 })
    if (laserMat.customUniforms) laserMat.customUniforms.uScanSpeed.value = 5.2
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.2), vaultPostMat)
      post.position.set(side * 2.4, 1.2, 0)
      group.add(post)
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 0.55), vaultPlateMat)
      plate.position.set(side * 2.48, 1.15, 0)
      group.add(plate)
    }
    const floorStrip = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.03, 0.42), vaultPlateMat)
    floorStrip.position.set(0, 0.02, 0)
    group.add(floorStrip)
    const beams = VAULT_BEAM_BASES.map((baseY) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(VAULT_BEAM_RADIUS, VAULT_BEAM_RADIUS, VAULT_BEAM_LENGTH, 12),
        laserMat
      )
      mesh.rotation.z = Math.PI / 2
      mesh.position.y = baseY
      group.add(mesh)
      const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(VAULT_BEAM_RADIUS * 1.55, VAULT_BEAM_RADIUS * 1.55, VAULT_BEAM_LENGTH * 0.98, 10),
        vaultGlowMat
      )
      glow.rotation.z = Math.PI / 2
      glow.position.y = baseY
      group.add(glow)
      const emitters = [-1, 1].map((side) => {
        const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.2), vaultPostMat)
        emitter.position.set(side * 2.4, baseY, 0)
        group.add(emitter)
        return emitter
      })
      return { mesh, glow, baseY, emitters }
    })
    const wash = new THREE.PointLight(0xff3344, 1.2, 5.5, 2)
    wash.position.set(0, 1.3, 0)
    group.add(wash)
    group.traverse((node) => { node.userData.noCameraCollision = true })
    root.add(group)
    return { z, phase, speed, laserMat, beams, wash, plateMat: vaultPlateMat }
  }

  const vaultGates = [
    createVaultGate(spans.vault.center - 1.2, 0, 2.5),
    createVaultGate(spans.vault.center - 4.6, Math.PI, 2.95)
  ]

  function updateVaultGates(dt, playerPos) {
    vaultGateT += dt
    for (const gate of vaultGates) {
      const lift = (0.5 + 0.5 * Math.sin(vaultGateT * gate.speed + gate.phase)) * VAULT_BEAM_LIFT
      if (gate.laserMat.customUniforms) gate.laserMat.customUniforms.uTime.value += dt
      const openAmt = lift / VAULT_BEAM_LIFT
      gate.wash.intensity = 0.7 + (1 - openAmt) * 2.4
      vaultPostMat.emissiveIntensity = 0.18 + (1 - openAmt) * 0.35
      vaultPlateMat.emissiveIntensity = 0.12 + (1 - openAmt) * 0.4
      vaultGlowMat.opacity = 0.22 + (1 - openAmt) * 0.28
      for (const beam of gate.beams) {
        const y = beam.baseY + lift
        beam.mesh.position.y = y
        beam.glow.position.y = y
        for (const emitter of beam.emitters) emitter.position.y = y
        if (!playerPos) continue
        const overlapsBody = (y + VAULT_HIT_HALF_Y) > playerPos.y
          && (y - VAULT_HIT_HALF_Y) < playerPos.y + VAULT_BODY_HEIGHT
        const inSlice = Math.abs(playerPos.z - gate.z) <= VAULT_HIT_HALF_Z
        const inWidth = Math.abs(playerPos.x) <= VAULT_BEAM_LENGTH / 2
        if (overlapsBody && inSlice && inWidth) {
          failSoft('A damaged security laser caught you!', 'laser')
        }
      }
    }
  }

  // Convergence — electrical surges across the aisle. The ladder is at this
  // car's Vault end; the arcs sit further along the walk toward Mechanical.
  // Bolts are short additive mesh segments (WebGL lines stay 1px thick).
  // Collision/timing stay as tuned.
  const SURGE_WARN = 0.65
  const SURGE_HIT_HALF_Z = 1.15
  const SURGE_MAX_SEGS = 110
  const SURGE_SPARK_COUNT = 28
  const _surgeA = new THREE.Vector3()
  const _surgeB = new THREE.Vector3()
  const _surgeMid = new THREE.Vector3()
  const _surgeDir = new THREE.Vector3()
  const _surgeQuat = new THREE.Quaternion()
  const _surgeZ = new THREE.Vector3(0, 0, 1)
  let surgeT = 0

  function surgeUnit(n) {
    const v = skew(n)
    return v - Math.floor(v)
  }

  function pushSurgeSeg(arr, ax, ay, az, bx, by, bz, thick = 1) {
    arr.push(ax, ay, az, bx, by, bz, thick)
  }

  function jaggedSurgePath(arr, x0, y0, z0, x1, y1, z1, steps, seed, amp, thick = 1) {
    let px = x0
    let py = y0
    let pz = z0
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      let x = x0 + (x1 - x0) * t
      let y = y0 + (y1 - y0) * t
      let z = z0 + (z1 - z0) * t
      if (i < steps) {
        y += (surgeUnit(seed + i * 1.7) * 2 - 1) * amp
        z += (surgeUnit(seed + i * 3.1) * 2 - 1) * amp * 0.6
      }
      pushSurgeSeg(arr, px, py, pz, x, y, z, thick)
      if (i > 1 && i < steps && i % 2 === 0) {
        const fork = 0.35 + surgeUnit(seed + i * 4.4) * 0.45
        const bx = x + (surgeUnit(seed + i * 5) * 2 - 1) * fork
        const by = y + (surgeUnit(seed + i * 7) * 2 - 1) * fork * 0.85
        const bz = z + (surgeUnit(seed + i * 9) * 2 - 1) * fork * 0.7
        pushSurgeSeg(arr, x, y, z, bx, by, bz, thick * 0.55)
        const cx = bx + (surgeUnit(seed + i * 11) * 2 - 1) * fork * 0.55
        const cy = by + (surgeUnit(seed + i * 13) * 2 - 1) * fork * 0.7
        const cz = bz + (surgeUnit(seed + i * 15) * 2 - 1) * fork * 0.45
        pushSurgeSeg(arr, bx, by, bz, cx, cy, cz, thick * 0.35)
      }
      px = x
      py = y
      pz = z
    }
  }

  function placeSurgeSeg(mesh, ax, ay, az, bx, by, bz, radius) {
    _surgeA.set(ax, ay, az)
    _surgeB.set(bx, by, bz)
    _surgeDir.subVectors(_surgeB, _surgeA)
    const len = _surgeDir.length()
    if (len < 0.02) {
      mesh.visible = false
      return
    }
    _surgeMid.addVectors(_surgeA, _surgeB).multiplyScalar(0.5)
    _surgeDir.multiplyScalar(1 / len)
    _surgeQuat.setFromUnitVectors(_surgeZ, _surgeDir)
    mesh.position.copy(_surgeMid)
    mesh.quaternion.copy(_surgeQuat)
    mesh.scale.set(radius, radius, len)
    mesh.visible = true
  }

  function rebuildSurgeLightning(surge, seed, mode) {
    const segs = []
    const fromX = surge.side * 2.15
    const toX = -surge.side * 2.05
    if (mode === 'danger') {
      for (let b = 0; b < 4; b++) {
        jaggedSurgePath(
          segs,
          fromX, 0.55 + b * 0.32, (b - 1.5) * 0.38,
          toX, 0.7 + b * 0.3, (1.5 - b) * 0.32,
          12, seed + b * 23 + surge.side * 5, 0.28, b === 1 || b === 2 ? 1.15 : 0.85
        )
      }
      jaggedSurgePath(segs, fromX * 0.5, 1.35, 0.7, toX * 0.55, 0.45, -0.75, 10, seed + 101, 0.34, 0.7)
      jaggedSurgePath(segs, fromX * 0.65, 0.45, -0.65, toX * 0.45, 1.5, 0.55, 9, seed + 211, 0.3, 0.65)
    } else if (mode === 'warn') {
      for (let i = 0; i < 10; i++) {
        const sx = surge.side * (1.8 + surgeUnit(seed + i) * 0.45)
        const sy = 0.5 + surgeUnit(seed + i * 2.1) * 1.4
        const sz = (surgeUnit(seed + i * 3.3) * 2 - 1) * 0.95
        const ex = sx - surge.side * (0.2 + surgeUnit(seed + i * 4.2) * 0.55)
        const ey = sy + (surgeUnit(seed + i * 5.1) * 2 - 1) * 0.4
        const ez = sz + (surgeUnit(seed + i * 6.2) * 2 - 1) * 0.35
        pushSurgeSeg(segs, sx, sy, sz, ex, ey, ez, 0.7)
        if (i % 2 === 0) {
          pushSurgeSeg(
            segs, ex, ey, ez,
            ex - surge.side * 0.18,
            ey + (surgeUnit(seed + i * 7.3) * 2 - 1) * 0.3,
            ez + (surgeUnit(seed + i * 8.4) * 2 - 1) * 0.22,
            0.4
          )
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const sx = surge.side * (1.95 + surgeUnit(seed + i * 1.4) * 0.2)
        const sy = 0.85 + surgeUnit(seed + i * 2.2) * 0.75
        const sz = (surgeUnit(seed + i * 3.5) * 2 - 1) * 0.45
        pushSurgeSeg(
          segs, sx, sy, sz,
          sx - surge.side * 0.16,
          sy + (surgeUnit(seed + i * 4.6) * 2 - 1) * 0.18,
          sz + (surgeUnit(seed + i * 5.7) * 2 - 1) * 0.12,
          0.35
        )
      }
    }

    const count = Math.min(SURGE_MAX_SEGS, Math.floor(segs.length / 7))
    for (let i = 0; i < SURGE_MAX_SEGS; i++) {
      const core = surge.coreSegs[i]
      const glow = surge.glowSegs[i]
      if (i >= count) {
        core.visible = false
        glow.visible = false
        continue
      }
      const o = i * 7
      const thick = segs[o + 6]
      placeSurgeSeg(core, segs[o], segs[o + 1], segs[o + 2], segs[o + 3], segs[o + 4], segs[o + 5], 0.028 * thick)
      placeSurgeSeg(glow, segs[o], segs[o + 1], segs[o + 2], segs[o + 3], segs[o + 4], segs[o + 5], 0.09 * thick)
    }
    surge.boltSeed = seed
    surge.boltMode = mode
  }

  function createElectricalSurge(z, side, offset, period, danger) {
    const group = new THREE.Group()
    group.name = 'convergence-electrical-surge'
    group.position.set(0, 0, z)

    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1c2430, metalness: 0.55, roughness: 0.42,
      emissive: 0x7dd3fc, emissiveIntensity: 0.25
    })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.55, 1.05), panelMat)
    panel.position.set(side * 2.28, 1.2, 0)
    group.add(panel)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.7), panelMat)
    receiver.position.set(-side * 2.3, 1.15, 0)
    group.add(receiver)

    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.35, roughness: 0.72 })
    )
    cable.position.set(side * 1.55, 1.85, 0)
    cable.rotation.z = side * 1.05
    group.add(cable)

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x3db4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xf7fcff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const segGeo = new THREE.BoxGeometry(1, 1, 1)
    const coreSegs = []
    const glowSegs = []
    for (let i = 0; i < SURGE_MAX_SEGS; i++) {
      const glow = new THREE.Mesh(segGeo, glowMat)
      const core = new THREE.Mesh(segGeo, coreMat)
      glow.visible = false
      core.visible = false
      group.add(glow, core)
      glowSegs.push(glow)
      coreSegs.push(core)
    }

    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0x2488ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.55), hazeMat)
    haze.position.y = 1.05
    group.add(haze)

    const light = new THREE.PointLight(0x66c8ff, 0.3, 6.5, 2)
    light.position.set(0, 1.15, 0)
    group.add(light)
    const panelLight = new THREE.PointLight(0x7ecfff, 0.2, 3.8, 2)
    panelLight.position.set(side * 2.1, 1.25, 0)
    group.add(panelLight)

    const sparkPos = new Float32Array(SURGE_SPARK_COUNT * 3)
    const sparkGeo = new THREE.BufferGeometry()
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparkMat = new THREE.PointsMaterial({
      color: 0xb8ecff,
      size: 0.045,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
    const sparks = new THREE.Points(sparkGeo, sparkMat)
    sparks.frustumCulled = false
    group.add(sparks)

    group.traverse((node) => { node.userData.noCameraCollision = true })
    root.add(group)

    const surge = {
      z, side, offset, period, danger,
      panelMat, light, panelLight, glowMat, coreMat, hazeMat, sparkMat, sparkPos, sparks,
      coreSegs, glowSegs,
      boltSeed: -1, boltMode: ''
    }
    rebuildSurgeLightning(surge, 0, 'safe')
    return surge
  }

  // ~30% faster cycles; offsets keep the three arcs out of phase so a single
  // Slow burst rarely clears the whole car.
  const electricalSurges = [
    createElectricalSurge(spans.convergence.center + 8, 1, 0, 3.2, 1.85),
    createElectricalSurge(spans.convergence.center - 4, -1, 1.05, 3.15, 2.05),
    createElectricalSurge(spans.convergence.center - 14, 1, 2.0, 3.05, 2.2)
  ]

  function updateSurgeSparks(surge, seed, active, strong) {
    const arr = surge.sparkPos
    const n = strong ? SURGE_SPARK_COUNT : Math.floor(SURGE_SPARK_COUNT * 0.45)
    for (let i = 0; i < SURGE_SPARK_COUNT; i++) {
      const o = i * 3
      if (!active || i >= n) {
        arr[o + 1] = -10
        continue
      }
      const u = surgeUnit(seed + i * 3.7)
      const v = surgeUnit(seed + i * 5.1)
      const w = surgeUnit(seed + i * 7.3)
      arr[o] = (u * 2 - 1) * (strong ? 2.0 : 0.55) + (strong ? 0 : surge.side * 1.7)
      arr[o + 1] = 0.35 + v * 1.5
      arr[o + 2] = (w * 2 - 1) * (strong ? 1.0 : 0.55)
    }
    surge.sparks.geometry.attributes.position.needsUpdate = true
  }

  function updateElectricalSurges(dt, playerPos) {
    surgeT += dt
    for (const surge of electricalSurges) {
      const phase = ((surgeT + surge.offset) % surge.period + surge.period) % surge.period
      const dangerous = phase < surge.danger
      const warning = !dangerous && phase > surge.period - SURGE_WARN
      const mode = dangerous ? 'danger' : warning ? 'warn' : 'safe'
      const flickerHz = dangerous ? 16 : warning ? 24 : 6
      const seed = Math.floor(Math.abs(surgeT) * flickerHz + surge.offset * 10)
      if (seed !== surge.boltSeed || mode !== surge.boltMode) {
        rebuildSurgeLightning(surge, seed, mode)
        updateSurgeSparks(surge, seed, dangerous || warning, dangerous)
      }
      const pulse = Math.abs(Math.sin(surgeT * (dangerous ? 22 : warning ? 34 : 8) + surge.offset))
      const crackle = Math.abs(Math.sin(surgeT * 47 + surge.offset * 3))
      if (dangerous) {
        surge.coreMat.opacity = 0.95
        surge.glowMat.opacity = 0.55 + pulse * 0.25
        surge.hazeMat.opacity = 0.16 + pulse * 0.1
        surge.panelMat.emissiveIntensity = 2.6 + crackle * 0.8
        surge.light.intensity = 6.5 + pulse * 2.2 + crackle * 1.5
        surge.panelLight.intensity = 3.5 + crackle * 2.5
        surge.sparkMat.opacity = 0.55 + pulse * 0.35
        surge.sparkMat.size = 0.04 + crackle * 0.03
      } else if (warning) {
        surge.coreMat.opacity = 0.4 + pulse * 0.45
        surge.glowMat.opacity = 0.2 + pulse * 0.32
        surge.hazeMat.opacity = 0.03 + pulse * 0.05
        surge.panelMat.emissiveIntensity = 0.9 + pulse * 1.4
        surge.light.intensity = 1.5 + pulse * 2.6
        surge.panelLight.intensity = 1.2 + pulse * 2.0
        surge.sparkMat.opacity = 0.25 + pulse * 0.45
        surge.sparkMat.size = 0.035
      } else {
        surge.coreMat.opacity = 0.06 + pulse * 0.05
        surge.glowMat.opacity = 0.03 + pulse * 0.03
        surge.hazeMat.opacity = 0
        surge.panelMat.emissiveIntensity = 0.22
        surge.light.intensity = 0.25
        surge.panelLight.intensity = 0.15
        surge.sparkMat.opacity = 0.04 + pulse * 0.04
        surge.sparkMat.size = 0.03
      }
      if (!dangerous || !playerPos) continue
      const overlapsBody = playerPos.y < 1.67 && playerPos.y + 1.85 > 0.43
      const inSlice = Math.abs(playerPos.z - surge.z) <= SURGE_HIT_HALF_Z
      const inWidth = Math.abs(playerPos.x) <= 2.1
      if (overlapsBody && inSlice && inWidth) {
        failSoft('An electrical surge caught you!')
      }
    }
  }

  // Relay blast doors. The clock uses envDt, so Slow, Freeze and Rewind
  // move the whole cycle — leaves and warning light — together. Close is a
  // fast slam after a long readable warning so Freeze is the reliable cross.
  // Short open + clear warning, then a hard slam. Freeze during the open/warn
  // window is the reliable cross; waiting it out is tight.
  //
  // Open-hold only — independent of atmosphere shake/debris/lights/handles.
  // Disable via DASH_DOOR_TIMING.enabled in timewreck-atmosphere.js (reverts to 0.28).
  const BLAST_OPEN_S = DASH_DOOR_TIMING.enabled ? DASH_DOOR_TIMING.openHoldSeconds : 0.28
  const BLAST_WARN_S = 0.4
  // Slam duration — shorter = door closes faster (challenge bump).
  const BLAST_CLOSE_S = 0.11
  const BLAST_SHUT_S = 0.3
  const BLAST_REOPEN_S = 0.55
  const BLAST_CYCLE_S = BLAST_OPEN_S + BLAST_WARN_S + BLAST_CLOSE_S + BLAST_SHUT_S + BLAST_REOPEN_S
  const BLAST_LEAF_HALF_X = 0.75
  const BLAST_LEAF_HALF_Z = 0.18
  const BLAST_LEAF_TOP = 2.8
  const doorZ = spans.relay.center - 2.6
  let blastT = 0
  let blastSlam = 0
  let blastWasClosing = false

  // Vintage teal/brass door leaves — same leaf dims / motion / hits as before.
  // Warm amber warning accents (readable) replace flat industrial red.
  const blastSteel = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.4, emissive: 0x3a2810, emissiveIntensity: 0.14
  })
  const blastPlate = new THREE.MeshStandardMaterial({
    color: 0x3a5c56, metalness: 0.18, roughness: 0.55, emissive: 0x152420, emissiveIntensity: 0.14
  })
  const blastScar = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.55, roughness: 0.4
  })
  const blastLampMat = new THREE.MeshStandardMaterial({
    color: 0x3a2410, emissive: 0xffb060, emissiveIntensity: 0.12, roughness: 0.28
  })
  const blastSparkMat = new THREE.MeshStandardMaterial({
    color: 0x3a2410, emissive: 0xffb060, emissiveIntensity: 0.2, roughness: 0.35
  })
  const blastGlass = new THREE.MeshStandardMaterial({
    color: 0xa8c8d8, emissive: 0xffc090, emissiveIntensity: 0.22,
    roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.55
  })

  function blastBox(parent, w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }

  function createBlastLeaf(side) {
    const leaf = new THREE.Group()
    leaf.name = side < 0 ? 'relay-blast-leaf-left' : 'relay-blast-leaf-right'
    // Teal wood panel + brass border (same overall leaf footprint).
    blastBox(leaf, 1.34, 2.48, 0.22, blastPlate, 0, 0, 0)
    for (const x of [-0.66, 0.66]) blastBox(leaf, 0.12, 2.56, 0.3, blastSteel, x, 0, 0.02)
    for (const y of [-1.22, 1.22]) blastBox(leaf, 1.36, 0.12, 0.3, blastSteel, 0, y, 0.02)
    blastBox(leaf, 1.2, 0.06, 0.26, blastSteel, 0, 0.15, 0.04)
    // Upper lite window + brass handle toward the centre seam.
    blastBox(leaf, 0.55, 0.42, 0.04, blastGlass, side * 0.12, 0.55, 0.12)
    blastBox(leaf, 0.62, 0.48, 0.03, blastSteel, side * 0.12, 0.55, 0.1)
    blastBox(leaf, 0.05, 0.28, 0.05, blastSteel, -side * 0.48, 0.05, 0.14)
    // Leading edge faces the centre — cyan temporal accent (was red scar).
    blastBox(leaf, 0.08, 2.62, 0.34, blastScar, -side * 0.71, 0, side * 0.01)
    leaf.position.set(side * 1.85, 1.4, doorZ)
    return leaf
  }

  const blastDoors = new THREE.Group()
  blastDoors.name = 'relay-blast-doors'
  const blastLeft = createBlastLeaf(-1)
  const blastRight = createBlastLeaf(1)
  blastDoors.add(blastLeft, blastRight)

  const blastRams = []
  for (const side of [-1, 1]) {
    const housing = new THREE.Group()
    housing.name = side < 0 ? 'relay-blast-housing-left' : 'relay-blast-housing-right'
    // Vertical warm light bars flanking the doorway (reference orange strips).
    blastBox(housing, 0.14, 2.7, 0.12, blastLampMat, side * 1.55, 1.4, 0.28)
    blastBox(housing, 0.2, 2.85, 0.55, blastSteel, side * 2.35, 1.4, 0)
    blastBox(housing, 0.7, 0.55, 0.5, blastPlate, side * 1.95, 2.45, 0)
    blastBox(housing, 0.08, 0.14, 0.08, blastSparkMat, side * 1.55, 2.55, 0.32)
    const ram = blastBox(housing, 0.1, 0.1, 0.45, blastSteel, side * 1.55, 1.55, 0)
    blastRams.push({ mesh: ram, side })
    housing.position.z = doorZ
    blastDoors.add(housing)
  }

  blastBox(blastDoors, 5.0, 0.42, 0.3, blastSteel, 0, 3.05, doorZ)
  // Warm dome cue above the seam (reference overhead lamp).
  blastBox(blastDoors, 0.55, 0.12, 0.55, blastSteel, 0, 3.22, doorZ)
  const blastLamp = blastBox(blastDoors, 0.4, 0.14, 0.4, blastLampMat, 0, 3.1, doorZ + 0.18)
  blastBox(blastDoors, 4.7, 0.05, 0.08, blastPlate, 0, 0.04, doorZ - 0.22)
  blastBox(blastDoors, 4.7, 0.05, 0.08, blastPlate, 0, 0.04, doorZ + 0.22)
  const blastLight = new THREE.PointLight(0xffb060, 0.45, 6.5, 2)
  blastLight.position.set(0, 3.16, doorZ + 0.2)
  blastDoors.add(blastLight)
  const blastFillL = new THREE.PointLight(0xffb060, 0.2, 4.5, 2)
  blastFillL.position.set(-1.8, 2.2, doorZ + 0.3)
  const blastFillR = new THREE.PointLight(0xffb060, 0.2, 4.5, 2)
  blastFillR.position.set(1.8, 2.2, doorZ + 0.3)
  blastDoors.add(blastFillL, blastFillR)
  const slamSparks = createParticleField({
    count: 18,
    area: { halfX: 0.9, minY: 0.2, maxY: 2.2, minZ: doorZ - 0.4, maxZ: doorZ + 0.4 },
    color: 0xffb060, size: 0.035, opacity: 0, gravity: -1.2, drift: 0.55, seed: 91
  })
  root.add(slamSparks.points)
  blastDoors.traverse((node) => { node.userData.noCameraCollision = true })
  root.add(blastDoors)

  const blastObstacles = [
    { minX: -2.6, maxX: -1.1, minZ: doorZ - 0.48, maxZ: doorZ + 0.48 },
    { minX: 1.1, maxX: 2.6, minZ: doorZ - 0.48, maxZ: doorZ + 0.48 }
  ]

  function updateBlastDoors(dt, playerPos) {
    blastT = ((blastT + dt) % BLAST_CYCLE_S + BLAST_CYCLE_S) % BLAST_CYCLE_S
    let closeAmount = 0
    let lampEi = 0.12
    let lightI = 0.45
    let fillI = 0.15
    const warnStart = BLAST_OPEN_S
    const closeStart = warnStart + BLAST_WARN_S
    const shutStart = closeStart + BLAST_CLOSE_S
    const reopenStart = shutStart + BLAST_SHUT_S
    const closing = blastT >= closeStart && blastT < shutStart
    if (blastT < warnStart) {
      closeAmount = 0
    } else if (blastT < closeStart) {
      closeAmount = 0
      const flick = 0.5 + 0.5 * Math.sin(blastT * 18 * Math.PI)
      lampEi = 0.45 + flick * 2.6
      lightI = 1.2 + flick * 14
      fillI = 0.8 + flick * 4
    } else if (blastT < shutStart) {
      // Ease-in slam: slow start, then hard close into the centre.
      const u = (blastT - closeStart) / BLAST_CLOSE_S
      closeAmount = u * u * u
      const pulse = 0.5 + 0.5 * Math.sin(blastT * 14 * Math.PI)
      lampEi = 2.0 + pulse * 0.8
      lightI = 8 + pulse * 6
      fillI = 4 + pulse * 3
    } else if (blastT < reopenStart) {
      closeAmount = 1
      const pulse = 0.5 + 0.5 * Math.sin(blastT * 4 * Math.PI)
      lampEi = 1.7 + pulse * 0.35
      lightI = 8 + pulse * 2
      fillI = 2.5
    } else {
      const u = (blastT - reopenStart) / BLAST_REOPEN_S
      const eased = u * u * (3 - 2 * u)
      closeAmount = 1 - eased
      const pulse = 0.5 + 0.5 * Math.sin(blastT * 8 * Math.PI)
      const urgency = 1 - eased
      lampEi = 0.12 + urgency * (1.4 + pulse * 0.6)
      lightI = 0.45 + urgency * (6 + pulse * 3)
      fillI = 0.15 + urgency * 2
    }
    if (blastWasClosing && !closing && closeAmount >= 0.99) {
      blastSlam = 1
      slamSparks.material.opacity = 0.85
    }
    blastWasClosing = closing

    blastSparkMat.emissiveIntensity = lampEi > 0.4 ? lampEi * 0.85 : 0.15
    blastLampMat.emissiveIntensity = lampEi
    blastSteel.emissiveIntensity = 0.12 + Math.min(0.45, lightI * 0.04)
    blastLight.intensity = lightI
    blastFillL.intensity = fillI
    blastFillR.intensity = fillI
    blastLamp.scale.setScalar(1 + Math.min(0.35, lampEi * 0.08))

    const leftX = -1.85 + 1.1 * closeAmount
    const rightX = 1.85 - 1.1 * closeAmount
    blastLeft.position.x = leftX
    blastRight.position.x = rightX
    // Slight Z shudder during the slam window.
    const shudder = closing ? Math.sin(blastT * 80) * 0.012 * closeAmount : 0
    blastLeft.position.z = doorZ + shudder
    blastRight.position.z = doorZ - shudder
    for (const ram of blastRams) {
      ram.mesh.position.x = ram.side * (1.55 - closeAmount * 0.35)
    }

    if (!playerPos) return
    const bodyTop = playerPos.y + 1.85
    const bodyBottom = playerPos.y
    const pad = 0.18
    const inSlab = Math.abs(playerPos.z - doorZ) < BLAST_LEAF_HALF_Z + pad
      && bodyTop > 0 && bodyBottom < BLAST_LEAF_TOP
    const hitLeft = Math.abs(playerPos.x - leftX) < BLAST_LEAF_HALF_X + pad
    const hitRight = Math.abs(playerPos.x - rightX) < BLAST_LEAF_HALF_X + pad
    if (inSlab && (hitLeft || hitRight)) failSoft('The blast doors caught you!')
  }

  const checkpointZs = [
    spans.mechanical.maxZ - 1.5,
    spans.cargo.maxZ - 1.5,
    spans.cargo.minZ + 1.5,
    spans.security.maxZ - 1.5,
    spans.passenger.maxZ - 1.5
  ]

  // ============================================================
  // MECHANICAL — FAST-TIME CAR: runaway luggage trunks (same motion as pistons)
  // ============================================================
  const ramBank = new THREE.Group()
  ramBank.name = 'runaway-pistons'
  // Shared trunk materials — 3 moving heads reuse these (no per-frame cost).
  const trunkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.72, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.08
  })
  const trunkLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x3a2818, roughness: 0.88, metalness: 0.04, emissive: 0x120c08, emissiveIntensity: 0.06
  })
  const trunkBrassMat = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.14
  })
  const trunkCyanMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.7, roughness: 0.35
  })
  const ramRailMat = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.85, roughness: 0.42, emissive: 0x3a2810, emissiveIntensity: 0.1
  })
  const rams = []
  const RAM_HEAD_WIDTH = 0.85
  const RAM_HEAD_HEIGHT = 1.75
  const RAM_HEAD_DEPTH = 0.5
  // Sweep wall to wall. The head has to clear the full interior or the player
  // can walk around the piston bank instead of timing it with Slow.
  const RAM_SWEEP = INTERIOR_HALF_WIDTH - RAM_HEAD_WIDTH / 2

  // Decorative trunk built on the exact former piston AABB so hitboxes stay true.
  // Motion still writes only head.position.x — children ride along automatically.
  function createLuggageTrunkHead() {
    const head = new THREE.Group()
    head.name = 'mech-luggage-trunk'
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(RAM_HEAD_WIDTH, RAM_HEAD_HEIGHT, RAM_HEAD_DEPTH),
      trunkWoodMat
    )
    body.castShadow = true
    head.add(body)
    // Worn leather lid band across the top third.
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(RAM_HEAD_WIDTH + 0.02, RAM_HEAD_HEIGHT * 0.28, RAM_HEAD_DEPTH + 0.02),
      trunkLeatherMat
    )
    lid.position.y = RAM_HEAD_HEIGHT * 0.28
    head.add(lid)
    // Brass corner protectors.
    const c = 0.09
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const corner = new THREE.Mesh(new THREE.BoxGeometry(c, c, c), trunkBrassMat)
          corner.position.set(
            sx * (RAM_HEAD_WIDTH / 2 - c * 0.45),
            sy * (RAM_HEAD_HEIGHT / 2 - c * 0.45),
            sz * (RAM_HEAD_DEPTH / 2 - c * 0.45)
          )
          head.add(corner)
        }
      }
    }
    // Reinforcement bands.
    for (const y of [-0.35, 0.1, 0.55]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(RAM_HEAD_WIDTH + 0.04, 0.045, RAM_HEAD_DEPTH + 0.04),
        trunkBrassMat
      )
      band.position.y = y
      head.add(band)
    }
    // Latches / handle.
    for (const sz of [-1, 1]) {
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.05), trunkBrassMat)
      latch.position.set(0, 0.2, sz * (RAM_HEAD_DEPTH / 2 + 0.02))
      head.add(latch)
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.1), trunkBrassMat)
    handle.position.set(0, RAM_HEAD_HEIGHT / 2 + 0.04, 0)
    head.add(handle)
    // Restrained cyan chrono edges (selected corners only — not neon cubes).
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, RAM_HEAD_HEIGHT * 0.92, 0.035),
        trunkCyanMat
      )
      edge.position.set(
        sx * (RAM_HEAD_WIDTH / 2 - 0.02),
        0,
        sz * (RAM_HEAD_DEPTH / 2 - 0.02)
      )
      head.add(edge)
    }
    head.traverse((node) => { node.userData.noCameraCollision = true })
    return head
  }

  // Offsets from the Mechanical car's centre, keeping the original spacing.
  for (const [dz, phase] of [[3, 0], [-1, 2.1], [-5, 4.2]]) {
    const z = spans.mechanical.center + dz
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2, 0.1, 0.16),
      ramRailMat
    )
    rail.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    ramBank.add(rail)

    const head = createLuggageTrunkHead()
    head.position.set(0, 0.9, z)
    ramBank.add(head)
    rams.push({ head, phase, z })
  }

  // Retune existing Mechanical fills: warm amber aisle + one violet storm accent.
  // Same light count — no new PointLights.
  for (const [dz, intensity] of [[6, 5.5], [0, 7.2], [-6, 5.5]]) {
    const mechFill = new THREE.PointLight(0xffc090, intensity, 11, 2)
    mechFill.position.set(0, 2.6, spans.mechanical.center + dz)
    mechFill.userData.noCameraCollision = true
    root.add(mechFill)
  }
  const mechAccent = new THREE.PointLight(0xa78bfa, 3.8, 9, 2)
  mechAccent.position.set(1.2, 1.8, spans.mechanical.center - 2)
  mechAccent.userData.noCameraCollision = true
  root.add(mechAccent)
  root.add(ramBank)

  let ramT = 0
  // Cleared each level frame; when false, clock still advances for Rewind.
  let mechVisualsActive = true
  function applyRams() {
    for (const r of rams) r.head.position.x = Math.sin(ramT * 3.4 + r.phase) * RAM_SWEEP
  }
  applyRams()
  unregisters.push(timeSystem.register(ramBank, {
    onUpdate(scaledDelta) {
      ramT += scaledDelta
      if (mechVisualsActive) applyRams()
    },
    getSnapshot: () => ({ ramT }),
    restoreSnapshot: (s) => { ramT = s.ramT; applyRams() }
  }))

  // ============================================================
  // CARGO — TIME-LOOP CAR: a scripted open/close/fall/rewind cycle
  // ============================================================
  const LOOP_PERIOD = 9
  const loopDoorZ = spans.cargo.center + 2
  const loopBeamZ = spans.cargo.center - 2
  const cargoGap = cargoGangwayLayout(spans.cargo.center, WRECK_WALL_X)
  cutCargoGangwayFloor(root.getObjectByName('floor-cargo'), spans.cargo, cargoGap)

  // Retain the wood/brass dressing on the intact approach and landing, but
  // split every deck layer at the gangway opening so the void is visible.
  const cargoTrackLen = spans.cargo.maxZ - spans.cargo.minZ - 0.8
  const cargoTrackZ0 = spans.cargo.center
  const cargoTracks = new THREE.Group()
  cargoTracks.name = 'cargo-train-tracks'
  cargoTracks.position.set(0, 0, cargoTrackZ0)

  const plankMat = new THREE.MeshStandardMaterial({
    color: 0x6a4528, roughness: 0.62, metalness: 0.06, emissive: 0x1a1008, emissiveIntensity: 0.06
  })
  const plankDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3a2414, roughness: 0.72, metalness: 0.05, emissive: 0x120c08, emissiveIntensity: 0.05
  })
  const plankBrassMat = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const plankCyanMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.75, roughness: 0.35
  })

  const cargoDeckSegments = [
    [-cargoTrackLen / 2, cargoGap.minZ - cargoTrackZ0],
    [cargoGap.maxZ - cargoTrackZ0, cargoTrackLen / 2]
  ]
  for (const [from, to] of cargoDeckSegments) {
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(INTERIOR_HALF_WIDTH * 2 - 0.35, to - from), plankMat
    )
    deck.name = 'cargo-wood-deck'
    deck.rotation.x = -Math.PI / 2
    deck.position.set(0, 0.02, (from + to) / 2)
    deck.receiveShadow = true
    cargoTracks.add(deck)
  }

  const sleeperStep = 0.72
  const halfLen = cargoTrackLen * 0.5
  for (let z = -halfLen + 0.4; z <= halfLen - 0.4; z += sleeperStep) {
    if (z + cargoTrackZ0 + 0.28 > cargoGap.minZ && z + cargoTrackZ0 - 0.28 < cargoGap.maxZ) continue
    const plank = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.5, 0.06, 0.55), plankDarkMat)
    plank.position.set(0, 0.05, z)
    plank.receiveShadow = true
    cargoTracks.add(plank)
  }
  // Brass side rails + cyan broken-edge cues, interrupted at the opening.
  for (const side of [-1, 1]) {
    for (const [from, to] of cargoDeckSegments) {
      const brass = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.05, to - from), plankBrassMat
      )
      brass.position.set(side * (INTERIOR_HALF_WIDTH - 0.35), 0.07, (from + to) / 2)
      cargoTracks.add(brass)
      const cyan = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.03, to - from), plankCyanMat
      )
      cyan.position.set(side * (INTERIOR_HALF_WIDTH - 0.42), 0.09, (from + to) / 2)
      cargoTracks.add(cyan)
    }
  }
  cargoTracks.traverse((node) => { node.userData.noCameraCollision = true })
  root.add(cargoTracks)

  const cargoGangway = createCargoGangway({ root, layout: cargoGap,
    wood: plankMat, brass: plankBrassMat, cyan: plankCyanMat })
  unregisters.push(timeSystem.register(cargoGangway.group, {
    recordWhen: () => cargoGangway.state.recording,
    onUpdate(dt) {
      const z = player.mesh.position.z
      cargoGangway.state.step(dt, z <= cargoGap.triggerZ && z > cargoGap.minZ)
      cargoGangway.apply()
    },
    getSnapshot: () => cargoGangway.state.snapshot(),
    restoreSnapshot(snapshot) { cargoGangway.state.restore(snapshot); cargoGangway.apply() }
  }))

  // Brass-edged, intact landing between gangway and door. The shell remains
  // solid here so the player can release Freeze and wait for the next cycle.
  const cargoLanding = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.1, 1.1), plankMat)
  cargoLanding.name = 'cargo-safe-landing'
  cargoLanding.position.set(0, 0.025, spans.cargo.center + 3.15)
  root.add(cargoLanding)
  for (const x of [-0.8, 0.8]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 1.1), plankBrassMat)
    rim.position.set(x, 0.07, 0)
    cargoLanding.add(rim)
  }

  // Cargo loop door — aisle-wide so it fully blocks when closed (motion/hits unchanged).
  const LOOP_DOOR_W = INTERIOR_HALF_WIDTH * 2 - 0.15
  const LOOP_DOOR_H = 2.3
  const loopDoor = new THREE.Mesh(
    new THREE.BoxGeometry(LOOP_DOOR_W, LOOP_DOOR_H, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0x3a5c56, metalness: 0.18, roughness: 0.55, emissive: 0x152420, emissiveIntensity: 0.14
    })
  )
  loopDoor.name = 'cargo-loop-door'
  loopDoor.castShadow = true
  const loopBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.4, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  for (const [w, h, x, y, z] of [
    [LOOP_DOOR_W + 0.03, 0.06, 0, LOOP_DOOR_H / 2 - 0.03, 0.1],
    [LOOP_DOOR_W + 0.03, 0.06, 0, -(LOOP_DOOR_H / 2 - 0.03), 0.1],
    [0.06, LOOP_DOOR_H - 0.02, -(LOOP_DOOR_W / 2 - 0.03), 0, 0.1],
    [0.06, LOOP_DOOR_H - 0.02, LOOP_DOOR_W / 2 - 0.03, 0, 0.1]
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), loopBrass)
    bar.position.set(x, y, z)
    loopDoor.add(bar)
  }
  const loopLite = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.32, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0xa8c8d8, emissive: 0xffc090, emissiveIntensity: 0.25,
      roughness: 0.2, transparent: true, opacity: 0.55
    })
  )
  loopLite.position.set(0, 0.55, 0.11)
  loopDoor.add(loopLite)
  addProp(loopDoor, loopDoorZ, 0, 3.5)

  // Falling girder restyled as a suspended luggage trunk — original compact size.
  const loopBeam = new THREE.Group()
  loopBeam.name = 'cargo-loop-trunk'
  const loopTrunkWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.7, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.08
  })
  const loopTrunkLeather = new THREE.MeshStandardMaterial({
    color: 0x3a2818, roughness: 0.88, metalness: 0.04, emissive: 0x120c08, emissiveIntensity: 0.06
  })
  const loopTrunkBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const loopTrunkCyan = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.65, roughness: 0.35
  })
  const loopBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.32), loopTrunkWood)
  loopBody.castShadow = true
  loopBeam.add(loopBody)
  const loopLid = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.1, 0.34), loopTrunkLeather)
  loopLid.position.y = 0.16
  loopBeam.add(loopLid)
  for (const x of [-1.15, -0.4, 0.4, 1.15]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.36), loopTrunkBrass)
    band.position.x = x
    loopBeam.add(band)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), loopTrunkBrass)
      corner.position.set(sx * 1.25, 0, sz * 0.12)
      loopBeam.add(corner)
    }
  }
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.04), loopTrunkCyan)
    edge.position.set(sx * 1.28, 0, 0.14)
    loopBeam.add(edge)
  }
  for (const x of [-0.9, 0.9]) {
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), loopTrunkBrass)
    link.position.set(x, 0.35, 0)
    loopBeam.add(link)
  }
  loopBeam.traverse((node) => { node.userData.noCameraCollision = true })
  addProp(loopBeam, loopBeamZ, 0, 2.25)

  // Wall-mounted phase indicator so the cycle is learnable rather than guessed.
  const loopRingMat = new THREE.MeshStandardMaterial({
    color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 2.6, roughness: 0.3
  })
  const loopRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 10, 24), loopRingMat)
  loopRing.rotation.y = Math.PI / 2
  addProp(loopRing, loopDoorZ + 1.4, -(INTERIOR_HALF_WIDTH - 0.14), 1.7)
  const loopRingLight = new THREE.PointLight(0x10b981, 6.5, 7, 2)
  addProp(loopRingLight, loopDoorZ + 1.4, -(INTERIOR_HALF_WIDTH - 0.5), 1.7)

  let loopT = 0
  let loopDoorOpen = 1
  let loopBeamDown = 0
  // Cleared each level frame; when false, clock still advances for Rewind.
  let cargoVisualsActive = true
  const loopPose = {}
  function applyLoop() {
    const pose = cargoLoopPose(loopT, loopPose)
    loopDoorOpen = pose.door
    loopBeamDown = pose.beam
    const colour = pose.colour
    loopDoor.position.y = 1.15 + loopDoorOpen * 2.35
    loopBeam.position.y = 2.25 - loopBeamDown * 1.85
    loopRingMat.color.setHex(colour)
    loopRingMat.emissive.setHex(colour)
    loopRingLight.color.setHex(colour)
  }
  applyLoop()
  unregisters.push(timeSystem.register(loopDoor, {
    onUpdate(scaledDelta) {
      loopT += scaledDelta
      if (cargoVisualsActive) applyLoop()
    },
    getSnapshot: () => ({ loopT }),
    restoreSnapshot: (s) => { loopT = s.loopT; applyLoop() }
  }))

  // ============================================================
  // SECURITY — FROZEN CAR: suspended wreckage becomes a walkway
  // ============================================================
  const gapMinZ = spans.security.center - 3
  const gapMaxZ = spans.security.center + 3

  // Deep purple well suggests the temporal void under the gap (visual only).
  const voidBox = new THREE.Mesh(
    new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.3, 3.4, gapMaxZ - gapMinZ),
    new THREE.MeshStandardMaterial({
      color: 0x1a0a28, roughness: 1, metalness: 0,
      emissive: 0x4c1d95, emissiveIntensity: 0.35
    })
  )
  voidBox.position.set(0, -1.68, (gapMinZ + gapMaxZ) / 2)
  voidBox.userData.noCameraCollision = true
  root.add(voidBox)

  // Torn floor lips — wood + cyan fracture (same footprint / placement).
  const lipWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.62, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.08
  })
  const lipCyan = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.75, roughness: 0.35
  })
  const lipBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.42, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  for (const z of [gapMinZ, gapMaxZ]) {
    const lip = new THREE.Group()
    const board = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.2, 0.12, 0.35), lipWood)
    lip.add(board)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.15, 0.03, 0.05), lipCyan)
    edge.position.set(0, 0.06, (z === gapMinZ ? 1 : -1) * 0.14)
    lip.add(edge)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.18, 0.02, 0.06), lipBrass)
    trim.position.set(0, 0.04, 0)
    lip.add(trim)
    lip.position.set(0, 0.02, z)
    lip.rotation.x = (z === gapMinZ ? 1 : -1) * 0.18
    lip.traverse((o) => { o.userData.noCameraCollision = true })
    root.add(lip)
  }

  // Chrono field kept under wood dress so FREEZE intensity feedback stays wired.
  const slabMat = createChronoFieldMaterial({
    baseColor: 0x4a3424, glowColor: 0x38bdf8, opacity: 0.92, doubleSided: true
  })
  const SLAB_HALF_X = 1.15 / 2
  const SLAB_HALF_Y = 0.16 / 2
  const SLAB_HALF_Z = 1.05 / 2
  const slabWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.58, metalness: 0.06, emissive: 0x1a1008, emissiveIntensity: 0.1
  })
  const slabBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.42, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const slabCyan = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.7, roughness: 0.35
  })
  const slabRug = new THREE.MeshStandardMaterial({
    color: 0x6a1824, roughness: 0.92, metalness: 0, emissive: 0x1a0608, emissiveIntensity: 0.08
  })
  const slabs = []
  const slabSupports = [...cargoGangway.supports]
  const gapVoids = [cargoGap, { minX: -INTERIOR_HALF_WIDTH, maxX: INTERIOR_HALF_WIDTH, minZ: gapMinZ, maxZ: gapMaxZ }]
  for (let i = 0; i < 5; i++) {
    const slab = new THREE.Group()
    slab.name = `security-freeze-tile-${i}`
    // Core deck — exact 1.15 × 0.16 × 1.05 collision footprint (chrono feedback).
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 1.05), slabMat)
    deck.castShadow = true
    slab.add(deck)
    // Wood plank strips on top (decorative — follow the tile).
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.98), slabWood)
      plank.position.set(x, 0.09, 0)
      slab.add(plank)
    }
    // Brass edging + cyan fracture rim.
    const brassFrame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 1.1), slabBrass)
    brassFrame.position.set(0, -0.08, 0)
    slab.add(brassFrame)
    for (const [w, d, x, z] of [
      [1.18, 0.04, 0, -0.52], [1.18, 0.04, 0, 0.52],
      [0.04, 1.02, -0.58, 0], [0.04, 1.02, 0.58, 0]
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), slabCyan)
      rim.position.set(x, 0.1, z)
      slab.add(rim)
    }
    const joist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.0), slabBrass)
    joist.position.set(i % 2 ? -0.38 : 0.38, -0.12, 0)
    slab.add(joist)
    // Occasional small rug accent (reference detail — every other tile).
    if (i % 2 === 0) {
      const rug = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.45), slabRug)
      rug.position.set(0, 0.11, 0)
      slab.add(rug)
    }
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

  const walkwayGlow = new THREE.PointLight(0x7dd3fc, 0, 9, 2)
  walkwayGlow.position.set(0, 0.55, spans.security.center)
  walkwayGlow.userData.noCameraCollision = true
  root.add(walkwayGlow)

  // ============================================================
  // PASSENGER — collapsing floor Freeze crossing (after Security)
  // ============================================================
  // Player travels −Z. Security ends at passenger.maxZ; Core depletion is
  // passenger.center. This hole sits between the fail-burst and that beat.
  const collapseMaxZ = spans.passenger.maxZ - 2.4
  const collapseMinZ = spans.passenger.center + 0.15
  const collapseTriggerZ = collapseMaxZ + 1.15
  const collapseVoid = { minX: -INTERIOR_HALF_WIDTH, maxX: INTERIOR_HALF_WIDTH, minZ: collapseMinZ, maxZ: collapseMaxZ }

  // Purple temporal well under the collapse gap (visual only — void logic unchanged).
  const collapsePit = new THREE.Mesh(
    new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.28, 3.5, collapseMaxZ - collapseMinZ),
    new THREE.MeshStandardMaterial({
      color: 0x1a0a28, roughness: 1, metalness: 0,
      emissive: 0x5b21b6, emissiveIntensity: 0.4
    })
  )
  collapsePit.position.set(0, -1.72, (collapseMinZ + collapseMaxZ) / 2)
  collapsePit.visible = false
  collapsePit.userData.noCameraCollision = true
  root.add(collapsePit)

  const collapseLipWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.62, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.08
  })
  const collapseLipCyan = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.75, roughness: 0.35
  })
  const collapseLips = []
  for (const z of [collapseMinZ, collapseMaxZ]) {
    const lip = new THREE.Group()
    const board = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.18, 0.13, 0.42), collapseLipWood)
    lip.add(board)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.14, 0.03, 0.05), collapseLipCyan)
    rim.position.set(0, 0.07, (z === collapseMinZ ? 1 : -1) * 0.16)
    lip.add(rim)
    lip.position.set(0, 0.03, z)
    lip.rotation.x = (z === collapseMinZ ? 1 : -1) * 0.2
    lip.visible = false
    lip.traverse((o) => { o.userData.noCameraCollision = true })
    collapseLips.push(lip)
    root.add(lip)
  }

  // Chrono field kept for FREEZE feedback; wood/brass dress matches Room 6 tiles.
  const collapseChronoMat = createChronoFieldMaterial({
    baseColor: 0x4a3424, glowColor: 0x38bdf8, opacity: 0.9, doubleSided: true
  })
  const collapseBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.42, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const collapseWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, metalness: 0.06, roughness: 0.58, emissive: 0x1a1008, emissiveIntensity: 0.1
  })
  const collapseCyan = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.65, roughness: 0.35
  })

  function markNoCam(rootObj) {
    rootObj.traverse((o) => { o.userData.noCameraCollision = true })
    return rootObj
  }

  function makeCollapseDeck() {
    const g = new THREE.Group()
    g.name = 'collapse-deck'
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 1.52), collapseChronoMat)
    deck.castShadow = true
    g.add(deck)
    for (const x of [-0.51, -0.17, 0.17, 0.51]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.46), collapseWood)
      plank.position.set(x, 0.065, 0)
      g.add(plank)
    }
    for (const s of [-1, 1]) {
      const channel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 1.54), collapseBrass)
      channel.position.set(s * 0.64, -0.07, 0)
      g.add(channel)
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 1.48), collapseCyan)
      rim.position.set(s * 0.68, 0.06, 0)
      g.add(rim)
    }
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.22), collapseCyan)
    tear.position.set(-0.28, -0.02, 0.68)
    tear.rotation.set(0.15, 0.2, 0.08)
    g.add(tear)
    return markNoCam(g)
  }

  function makeCollapseBeam() {
    const g = new THREE.Group()
    g.name = 'collapse-beam'
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.09, 1.48), collapseChronoMat)
    top.position.y = 0.1
    top.castShadow = true
    g.add(top)
    const woodTop = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.03, 1.42), collapseWood)
    woodTop.position.y = 0.155
    g.add(woodTop)
    const web = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 1.42), collapseBrass)
    web.position.y = -0.04
    g.add(web)
    const bot = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.07, 1.48), collapseBrass)
    bot.position.y = -0.18
    g.add(bot)
    for (const z of [-0.5, 0, 0.5]) {
      const stiff = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.04, 0.07), collapseBrass)
      stiff.position.set(0, -0.04, z)
      g.add(stiff)
    }
    return markNoCam(g)
  }

  function makeCollapsePanel() {
    const g = new THREE.Group()
    g.name = 'collapse-panel'
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.09, 1.5), collapseChronoMat)
    plate.castShadow = true
    g.add(plate)
    const woodPlate = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.03, 1.42), collapseWood)
    woodPlate.position.y = 0.06
    g.add(woodPlate)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.5), collapseBrass)
    frame.position.set(0.12, 0.08, 0)
    g.add(frame)
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.02, 0.38),
      new THREE.MeshStandardMaterial({
        color: 0xa8c8d8, metalness: 0.05, roughness: 0.2,
        emissive: 0xffc090, emissiveIntensity: 0.22, transparent: true, opacity: 0.5
      })
    )
    pane.position.set(0.12, 0.1, 0)
    g.add(pane)
    for (const x of [-0.56, 0.56]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.46), collapseBrass)
      rib.position.set(x, -0.07, 0)
      g.add(rib)
      const cyan = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 1.4), collapseCyan)
      cyan.position.set(x, 0.06, 0)
      g.add(cyan)
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.12), collapseWood)
    header.position.set(0, 0.03, -0.68)
    g.add(header)
    return markNoCam(g)
  }

  const COLLAPSE_PAD_X = 0.42
  const COLLAPSE_PAD_Z = 0.4
  const collapsePieces = [
    {
      mesh: makeCollapseDeck(),
      restX: 0, restY: 0.05, restZ: collapseMaxZ - 0.82,
      hx: 1.36 / 2, hy: 0.1 / 2, hz: 1.52 / 2,
      phase: 0.2, spin: 0.55
    },
    {
      mesh: makeCollapseBeam(),
      restX: 0, restY: 0.06, restZ: (collapseMinZ + collapseMaxZ) * 0.5,
      hx: 1.18 / 2, hy: 0.145, hz: 1.48 / 2,
      phase: 1.4, spin: -0.4
    },
    {
      mesh: makeCollapsePanel(),
      restX: 0, restY: 0.05, restZ: collapseMinZ + 0.82,
      hx: 1.34 / 2, hy: 0.09 / 2, hz: 1.5 / 2,
      phase: 2.5, spin: 0.7
    }
  ]
  for (const p of collapsePieces) {
    p.mesh.position.set(p.restX, 0.04, p.restZ)
    p.mesh.visible = false
    root.add(p.mesh)
  }

  const collapseFloor = new THREE.Group()
  collapseFloor.name = 'collapse-floor-slab'
  const floorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.35, 0.08, collapseMaxZ - collapseMinZ - 0.15),
    new THREE.MeshStandardMaterial({
      color: 0x5a3a22, metalness: 0.08, roughness: 0.6, emissive: 0x1a1008, emissiveIntensity: 0.08
    })
  )
  collapseFloor.add(floorSlab)
  const floorCrack = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.04, collapseMaxZ - collapseMinZ - 0.4),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.55, roughness: 0.4
    })
  )
  floorCrack.position.y = 0.05
  collapseFloor.add(floorCrack)
  collapseFloor.position.set(0, 0.02, (collapseMinZ + collapseMaxZ) / 2)
  markNoCam(collapseFloor)
  root.add(collapseFloor)

  const collapseSparks = []
  const collapseSparkMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b8, emissive: 0xffb060, emissiveIntensity: 4, transparent: true, opacity: 0.9
  })
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), collapseSparkMat)
    sp.visible = false
    sp.userData.noCameraCollision = true
    sp.userData.ox = (i % 2 ? -0.35 : 0.4) + skew(i + 3) * 0.2
    sp.userData.oz = collapseMaxZ - 0.4 - (i * 0.45)
    root.add(sp)
    collapseSparks.push(sp)
  }

  const collapseGlow = new THREE.PointLight(0x7dd3fc, 0, 8, 2)
  collapseGlow.position.set(0, 0.7, (collapseMinZ + collapseMaxZ) / 2)
  collapseGlow.userData.noCameraCollision = true
  root.add(collapseGlow)

  let collapseArmed = true
  let collapseLive = false
  let collapseFallT = 0
  let collapseFloorT = 0
  let collapseSettle = 0

  function setCollapseVoid(on) {
    const i = gapVoids.indexOf(collapseVoid)
    if (on && i < 0) gapVoids.push(collapseVoid)
    if (!on && i >= 0) gapVoids.splice(i, 1)
  }

  function applyCollapseMotion() {
    collapseFloor.rotation.x = collapseFloorT * 1.15
    collapseFloor.position.y = 0.02 - collapseFloorT * 1.35
    collapseFloor.visible = collapseFloorT < 1.05
    collapsePit.visible = collapseLive
    for (const lip of collapseLips) lip.visible = collapseLive

    const sparkLife = collapseLive && collapseFloorT < 0.85
    collapseSparkMat.opacity = sparkLife ? Math.max(0, 1 - collapseFloorT / 0.85) : 0
    collapseSparkMat.emissiveIntensity = sparkLife ? 5 * (1 - collapseFloorT) : 0
    for (let i = 0; i < collapseSparks.length; i++) {
      const sp = collapseSparks[i]
      sp.visible = sparkLife
      if (!sparkLife) continue
      const t = collapseFloorT
      sp.position.set(
        sp.userData.ox + Math.sin(t * 9 + i) * 0.12,
        0.35 - t * 1.4,
        sp.userData.oz + Math.cos(t * 6 + i) * 0.08
      )
    }

    for (const p of collapsePieces) {
      p.mesh.visible = collapseLive
      if (!collapseLive) continue
      const t = collapseFallT + p.phase
      const loop = ((t % 2.6) + 2.6) % 2.6
      const fallY = 1.55 - loop * 1.15
      const driftX = Math.sin(t * 0.9) * 0.1
      const tumble = loop * p.spin
      p.mesh.position.x = THREE.MathUtils.lerp(p.restX + driftX, p.restX, collapseSettle)
      p.mesh.position.y = THREE.MathUtils.lerp(fallY, p.restY, collapseSettle)
      p.mesh.position.z = THREE.MathUtils.lerp(p.restZ + Math.sin(t * 0.55) * 0.08, p.restZ, collapseSettle)
      p.mesh.rotation.x = THREE.MathUtils.lerp(tumble * 0.7, 0, collapseSettle)
      p.mesh.rotation.z = THREE.MathUtils.lerp(Math.sin(t * 1.1) * 0.45, 0, collapseSettle)
      p.mesh.rotation.y = THREE.MathUtils.lerp(Math.sin(t * 0.4) * 0.2, 0, collapseSettle)
    }
  }

  // Floor/spark drop still in progress, or Freeze is still settling pads.
  // Nearby tumbling is driven by nearCollapse in update(); far-away tumble
  // can pause and resync from collapseFallT when the player returns.
  function collapseMotionNeedsUpdate(frozen) {
    if (!collapseLive) return false
    if (collapseFloorT < 1.05) return true
    if (frozen && collapseSettle < 0.98) return true
    return false
  }

  function startCollapse() {
    if (!collapseArmed) return
    collapseArmed = false
    collapseLive = true
    collapseFallT = 0
    collapseFloorT = 0
    setCollapseVoid(true)
    applyCollapseMotion()
    env.shockPassengerLights?.()
    collapseHintHoldUntil = elapsed + COLLAPSE_HINT_S
    pendingToast = null
    hud.showToast(COLLAPSE_HINT, COLLAPSE_HINT_S * 1000)
    hud.setObjective(COLLAPSE_HINT)
  }

  unregisters.push(timeSystem.register(collapseFloor, {
    onUpdate(scaledDelta) {
      if (!collapseLive) return
      collapseFallT += scaledDelta
      collapseFloorT = THREE.MathUtils.clamp(collapseFloorT + Math.abs(scaledDelta), 0, 1.15)
    },
    getSnapshot: () => ({ collapseFallT, collapseFloorT, collapseLive, collapseArmed }),
    restoreSnapshot: (s) => {
      collapseFallT = s.collapseFallT
      collapseFloorT = s.collapseFloorT
      collapseLive = s.collapseLive
      collapseArmed = s.collapseArmed
      setCollapseVoid(collapseLive)
      applyCollapseMotion()
    }
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

  // Luxury debris fragments (wood / teal / brass) — same count & Cannon shapes.
  const chunkMats = [
    new THREE.MeshStandardMaterial({
      color: 0x5a3a22, roughness: 0.6, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.1
    }),
    new THREE.MeshStandardMaterial({
      color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.14
    }),
    new THREE.MeshStandardMaterial({
      color: 0x3a5c56, roughness: 0.55, metalness: 0.18, emissive: 0x152420, emissiveIntensity: 0.16
    })
  ]
  const chunkMatBases = chunkMats.map((m) => ({
    color: m.color.getHex(),
    emissive: m.emissive.getHex(),
    emissiveIntensity: m.emissiveIntensity
  }))
  function paintChunkMats(color, emissive, emissiveIntensity) {
    for (const m of chunkMats) {
      m.color.setHex(color)
      m.emissive.setHex(emissive)
      m.emissiveIntensity = emissiveIntensity
    }
  }
  function restoreChunkMats(resumeWarm = 0) {
    chunkMats.forEach((m, i) => {
      const base = chunkMatBases[i]
      m.color.setHex(base.color)
      if (resumeWarm > 0.08) {
        m.emissive.setHex(0xff6a40)
        m.emissiveIntensity = base.emissiveIntensity + resumeWarm * 1.6
      } else {
        m.emissive.setHex(base.emissive)
        m.emissiveIntensity = base.emissiveIntensity
      }
    })
  }
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
    c.x = skew(s + 11) * (INTERIOR_HALF_WIDTH * 0.78)
    c.y = 0.5 + Math.abs(skew(s + 3)) * 1.5
    c.z = spans.passenger.maxZ + 3
    c.vx = skew(s + 5) * 0.9
    c.vy = 0.3 + Math.abs(skew(s + 7)) * 1.4
    c.vz = -(7 + Math.abs(skew(s + 9)) * 6)
    c.life = 4.0
    c.mesh.visible = true
    if (!c.body) return
    c.body.position.set(c.x, c.y, c.z)
    c.body.velocity.set(c.vx, c.vy, c.vz)
    c.body.angularVelocity.set(3.1, 2.2, skew(s + 13) * 2)
    c.body.quaternion.set(0, 0, 0, 1)
    c.body.wakeUp()
  }
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(chunkGeos[i % 3], chunkMats[i % 3])
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

  // One-shot structural failure as the player comes through Security into
  // Passenger. Placed a few metres inside the car so the third-person camera
  // (behind the player, looking forward) sees it drop instead of already
  // having it behind the lens. Hinges from just outside the aisle toward the
  // wall so the walkable ±0.58 path stays clear.
  const FAIL_BURST_Z = spans.passenger.maxZ - 2.6
  const FAIL_BURST_TRIGGER_Z = spans.passenger.maxZ + 0.85
  let failBurstArmed = true
  let failBurstT = -1
  let failBurstSettled = false

  const burstGroup = new THREE.Group()
  burstGroup.name = 'passenger-fail-burst'
  burstGroup.visible = false
  burstGroup.userData.noCameraCollision = true
  root.add(burstGroup)

  const burstPanelMat = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.58, metalness: 0.08,
    emissive: 0x1a1008, emissiveIntensity: 0.1
  })
  const burstBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.14
  })
  const burstCyan = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.55, roughness: 0.35
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
  const panelRib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.7), burstBrass)
  panelRib.position.set(0.08, -0.06, 0)
  panelRib.userData.noCameraCollision = true
  panelPivot.add(panelRib)
  const panelCyan = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.04), burstCyan)
  panelCyan.position.set(0.39, 0.05, 0.85)
  panelCyan.userData.noCameraCollision = true
  panelPivot.add(panelCyan)
  burstGroup.add(panelPivot)

  const beamPivot = new THREE.Group()
  beamPivot.position.set(1.22, CARRIAGE_CEILING_Y - 0.14, FAIL_BURST_Z + 0.55)
  const burstBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.35), burstBrass)
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
  const luggageMat = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.7, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.08
  })
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

  function sleepChunk(c) {
    c.life = 0
    c.body.velocity.set(0, 0, 0)
    c.body.angularVelocity.set(0, 0, 0)
    c.body.sleep()
    c.mesh.visible = false
  }

  function settleFailBurstBodies() {
    for (const c of burstDebris) {
      c.mesh.visible = false
      c.body.velocity.set(0, 0, 0)
      c.body.angularVelocity.set(0, 0, 0)
      c.body.sleep()
    }
  }

  // position.x saturates last (min(9, t²·0.4)); security delay is 3.8s.
  // Keep the debris storm briefly after the last carriage finishes sliding away.
  const DETACH_SATURATE_T = Math.sqrt(9 / 0.4)
  const DEBRIS_STORM_S = DETACH_SATURATE_T + 3.8 + 1.5

  // Registered with the time system, so Slow/Freeze visibly bite on the flying
  // wreckage too. scaledDelta is the Cannon step so Freeze holds the bodies and
  // Slow runs the world at 0.2x; meshes copy rigid-body pose each tick.
  unregisters.push(timeSystem.register(chunkGroup, {
    onUpdate(scaledDelta) {
      const burstSim = failBurstT >= 0 && !failBurstSettled
      const stormActive = breakupT >= 0 && breakupT < DEBRIS_STORM_S
      if (breakupT < 0 && !burstSim) return

      let chunksAwake = false
      if (breakupT >= 0) {
        for (const c of chunks) {
          if (!c.mesh.visible && c.life <= 0) continue
          c.life -= Math.abs(scaledDelta)
          if (c.life <= 0) {
            if (stormActive) respawnChunk(c)
            else sleepChunk(c)
          }
          if (c.mesh.visible) chunksAwake = true
        }
      }

      const needStep = scaledDelta !== 0 && (
        (breakupT >= 0 && (stormActive || chunksAwake))
        || burstSim
      )
      if (needStep) {
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
          if (!c.mesh.visible) continue
          c.mesh.position.copy(c.body.position)
          c.mesh.quaternion.copy(c.body.quaternion)
          c.x = c.body.position.x
          c.y = c.body.position.y
          c.z = c.body.position.z
        }
      }
      if (burstSim) {
        for (const c of burstDebris) {
          if (!c.mesh.visible) continue
          c.mesh.position.copy(c.body.position)
          c.mesh.quaternion.copy(c.body.quaternion)
        }
      }
    }
  }))

  function applyFailBurst() {
    if (failBurstT < 0) {
      burstGroup.visible = false
      failBurstSettled = false
      return
    }
    if (failBurstSettled) return

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

    // Animation complete: keep the fallen panel/beam, kill lights/sparks/physics.
    if (t >= 2.2) {
      burstLight.intensity = 0
      burstFill.intensity = 0
      for (const spark of burstSparks) spark.visible = false
      burstSparkMat.opacity = 0
      burstSparkMat.emissiveIntensity = 0
      settleFailBurstBodies()
      failBurstSettled = true
    }
  }

  function startFailBurst() {
    failBurstArmed = false
    failBurstT = 0
    failBurstSettled = false
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
      if (failBurstSettled) {
        if (scaledDelta >= 0) return
        failBurstSettled = false
      }
      failBurstT = THREE.MathUtils.clamp(failBurstT + scaledDelta, 0, 2.2)
      applyFailBurst()
    },
    getSnapshot: () => ({ failBurstT }),
    restoreSnapshot: (s) => {
      failBurstT = s.failBurstT
      failBurstSettled = false
      applyFailBurst()
    }
  }))

  function detachCarriage(group, delay, dir) {
    const t = breakupT - delay
    if (t <= 0) {
      group.userData.detachSettled = false
      group.visible = true
      return
    }
    if (group.userData.detachSettled && t >= DETACH_SATURATE_T) return
    group.rotation.y = dir * Math.min(0.5, t * 0.2)
    group.rotation.z = dir * Math.min(0.3, t * 0.12)
    group.position.x = dir * Math.min(9, t * t * 0.4)
    group.position.y = -Math.min(8, t * t * 0.45)
    // At saturation the car is at |x|=9, y=-8 — well outside the playable aisle.
    if (t >= DETACH_SATURATE_T) {
      group.userData.detachSettled = true
      group.visible = false
    }
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

  const FRACTURE_S = 2
  const FRACTURE_Z = spans.vault.center
  let fractureArmed = true
  let fractureT = -1
  const vaultFx = env.getVaultFracture?.() || { lights: [], mats: [], pieces: [] }
  const vaultMatRest = vaultFx.mats.map((m) => ({
    color: m.color.clone(),
    emissive: m.emissive.clone(),
    ei: m.emissiveIntensity
  }))
  const vaultLightRest = vaultFx.lights.map((e) => ({
    hex: e.light.color.getHex(),
    base: e.base
  }))
  const fractureMat = createChronoFieldMaterial({
    baseColor: 0x1e1033, glowColor: 0xa855f7, opacity: 0, doubleSided: true, depthWrite: false
  })
  const fracturePulse = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), fractureMat)
  fracturePulse.name = 'vault-temporal-fracture'
  fracturePulse.visible = false
  fracturePulse.userData.noCameraCollision = true
  const vaultHalf = (spans.vault.maxZ - spans.vault.minZ) / 2
  fracturePulse.position.set(0, 1.38, vaultHalf - 1.2)
  carriages.vault.add(fracturePulse)
  const fractureFill = new THREE.PointLight(0xa855f7, 0, 7, 2)
  fractureFill.position.copy(fracturePulse.position)
  carriages.vault.add(fractureFill)

  function applyVaultFracture(state) {
    for (let i = 0; i < vaultFx.mats.length; i++) {
      const m = vaultFx.mats[i]
      const rest = vaultMatRest[i]
      if (!m || !rest) continue
      if (state === 1) {
        m.color.setHex(0x334155)
        m.emissive.setHex(0x7dd3fc)
        m.emissiveIntensity = rest.ei * 1.15 + 0.45
      } else if (state === 2) {
        m.color.setHex(0x2e1064)
        m.emissive.setHex(0xc084fc)
        m.emissiveIntensity = rest.ei * 1.7 + 0.8
      } else {
        m.color.copy(rest.color)
        m.emissive.copy(rest.emissive)
        m.emissiveIntensity = rest.ei
      }
    }
    for (let i = 0; i < vaultFx.lights.length; i++) {
      const e = vaultFx.lights[i]
      const rest = vaultLightRest[i]
      if (!e || !rest) continue
      if (state === 1) {
        e.light.color.setHex(0x7dd3fc)
        e.light.intensity = rest.base * 1.25
      } else if (state === 2) {
        e.light.color.setHex(0xd946ef)
        e.light.intensity = rest.base * 1.85
      } else {
        e.light.color.setHex(rest.hex)
        e.light.intensity = rest.base
      }
    }
    for (let i = 0; i < vaultFx.pieces.length; i++) {
      const p = vaultFx.pieces[i]
      const k = (i % 2) ? 1 : -1
      if (state === 1) {
        p.mesh.position.set(p.x, p.y + 0.07, p.z - 0.1)
        p.mesh.rotation.set(p.rx, p.ry + 0.08 * k, p.rz)
      } else if (state === 2) {
        p.mesh.position.set(p.x + 0.05 * k, p.y - 0.04, p.z + 0.08)
        p.mesh.rotation.set(p.rx + 0.12, p.ry, p.rz - 0.1 * k)
      } else {
        p.mesh.position.set(p.x, p.y, p.z)
        p.mesh.rotation.set(p.rx, p.ry, p.rz)
      }
    }
  }

  function endVaultFracture() {
    fractureT = -2
    applyVaultFracture(0)
    fracturePulse.visible = false
    fractureFill.intensity = 0
    fractureMat.customUniforms.uOpacity.value = 0
  }

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

  // Celebratory exit aperture — decorative only; opens during the brake cinematic.
  const exitPath = new THREE.Group()
  exitPath.name = 'cab-exit-path'
  exitPath.visible = false
  exitPath.position.set(0, 0, spans.cab.minZ + 0.35)
  const exitDoorMat = new THREE.MeshStandardMaterial({
    color: 0x3a5c56, roughness: 0.5, metalness: 0.35, emissive: 0x1a2e2a, emissiveIntensity: 0.2
  })
  const exitBrassMat = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.4, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.2
  })
  const exitLeft = new THREE.Group()
  const exitRight = new THREE.Group()
  for (const [side, leaf] of [[-1, exitLeft], [1, exitRight]]) {
    leaf.position.set(side * 0.55, 1.4, 0)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.6, 0.12), exitDoorMat)
    panel.position.x = side * 0.52
    panel.userData.noCameraCollision = true
    leaf.add(panel)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.65, 0.14), exitBrassMat)
    trim.position.x = side * 0.05
    trim.userData.noCameraCollision = true
    leaf.add(trim)
    exitPath.add(leaf)
  }
  const exitGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.8),
    new THREE.MeshStandardMaterial({
      color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 0,
      transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    })
  )
  exitGlow.position.set(0, 1.4, -0.2)
  exitGlow.userData.noCameraCollision = true
  exitPath.add(exitGlow)
  const exitLight = new THREE.PointLight(0xffd9a0, 0, 8, 2)
  exitLight.position.set(0, 1.6, -0.8)
  exitPath.add(exitLight)
  root.add(exitPath)

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
      exitPath.visible = true
    }
  }))

  // ============================================================
  // Particles: rising embers and falling sparks through the whole wreck
  // ============================================================
  const embers = createParticleField({
    count: 240,
    area: { halfX: INTERIOR_HALF_WIDTH * 0.88, minY: 0.1, maxY: 2.5, minZ: spans.cab.minZ, maxZ: spans.vault.maxZ },
    color: 0xff8a3c, size: 0.055, opacity: 0.75, gravity: 0.32, drift: 0.22, seed: 13
  })
  const sparks = createParticleField({
    count: 90,
    area: { halfX: INTERIOR_HALF_WIDTH * 0.91, minY: 0.05, maxY: 2.55, minZ: spans.cab.minZ, maxZ: spans.vault.maxZ },
    color: 0xffd9a0, size: 0.028, opacity: 0.4, gravity: -0.9, drift: 0.35, seed: 29
  })
  const openingWind = createParticleField({
    count: 48,
    area: {
      halfX: INTERIOR_HALF_WIDTH * 1.01, minAbsX: INTERIOR_HALF_WIDTH * 0.74,
      minY: 0.85, maxY: 2.15,
      minZ: spans.cab.minZ + 0.4, maxZ: spans.passenger.maxZ - 0.4
    },
    color: 0x9aa8b8, size: 0.032, opacity: 0.28, gravity: 0.08, drift: 0.55, streamZ: 6.5, seed: 61
  })
  const openingSparks = createParticleField({
    count: 28,
    area: {
      halfX: INTERIOR_HALF_WIDTH * 0.99, minAbsX: INTERIOR_HALF_WIDTH * 0.75,
      minY: 1.05, maxY: 2.35,
      minZ: spans.cab.minZ + 0.4, maxZ: spans.passenger.maxZ - 0.4
    },
    color: 0xffd9a0, size: 0.024, opacity: 0.38, gravity: -0.55, drift: 0.4, streamZ: 4.2, seed: 73
  })
  const chronoMotes = createChronoMoteField({
    seed: 47,
    ambient: {
      count: 40,
      halfX: INTERIOR_HALF_WIDTH * 0.72,
      minY: 0.4,
      maxY: 2.15,
      minZ: spans.cab.minZ + 1,
      maxZ: spans.vault.maxZ - 1
    },
    loop: { count: 16, z: spans.cargo.center, halfZ: 4.2, halfX: INTERIOR_HALF_WIDTH * 0.72 },
    walkway: { count: 12, minZ: gapMinZ, maxZ: gapMaxZ, halfX: INTERIOR_HALF_WIDTH * 0.69 },
    wave: { count: 22, halfZ: 3.4, halfX: INTERIOR_HALF_WIDTH * 0.72 }
  })
  root.add(embers.points, sparks.points, openingWind.points, openingSparks.points, chronoMotes.points)

  // Same forward-light budget as Level 2. Built only after every L3 PointLight
  // (carriage lamps, hazard washes, Freeze glows, finale wave/stasis) is on
  // `root`. Sources stay in the graph for flicker/intensity animation; a fixed
  // set of 12 real lights is what the renderer sees.
  const lightPool = createLightPool({ root, size: 12 })

  // Independent atmosphere systems — each has its own `enabled` flag in
  // timewreck-atmosphere.js. Instantiated after lights so lamp motion can
  // find existing fixtures without adding pool lights.
  const carriageShake = createCarriageShake(root)
  const stormDebris = createStormDebris(root, spans)
  const lampMotion = createLampMotion(root)
  const grabHandles = createGrabHandles(root, spans)

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
      collapseArmed,
      collapseLive,
      fractureArmed,
      fractureT,
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
        group.userData.detachSettled = false
        group.visible = true
      }

      ramT = 0
      applyRams()
      loopT = 0
      applyLoop()
      cargoGangway.state.reset()
      cargoGangway.apply()
      slabDriftT = 0
      slabSettle = 0
      collapseArmed = saved.collapseArmed
      collapseLive = saved.collapseLive
      collapseFallT = 0
      collapseFloorT = saved.collapseLive ? 1.15 : 0
      collapseSettle = 0
      setCollapseVoid(collapseLive)
      applyCollapseMotion()
      env.restorePassengerLights?.(collapseLive)
      fractureArmed = saved.fractureArmed
      fractureT = saved.fractureT
      applyVaultFracture(0)
      fracturePulse.visible = false
      fractureFill.intensity = 0
      fractureMat.customUniforms.uOpacity.value = 0
      failCooldown = 0
      braking = false
      brakeT = 0
      exitPath.visible = false
      exitLeft.rotation.y = 0
      exitRight.rotation.y = 0
      exitGlow.material.opacity = 0
      exitGlow.material.emissiveIntensity = 0
      exitLight.intensity = 0
      carriageShake.reset()
      stormDebris.reset()
      lampMotion.reset()
      grabHandles.reset()
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
      restoreChunkMats(0)
      burstPanelMat.emissive.setHex(0x121416)
      burstPanelMat.emissiveIntensity = 0.12
      waveLight.color.setHex(0xa855f7)
      waveLight.distance = 8
      waveMat.customUniforms.uOpacity.value = 0.6
      burstBrass.emissive.setHex(0x3a2810)
      burstBrass.emissiveIntensity = 0.14
      burstCyan.emissive.setHex(0x38bdf8)
      burstCyan.emissiveIntensity = 0.55
      luggageMat.emissive.setHex(0x1a1008)
      luggageMat.emissiveIntensity = 0.08

      waveZ = depleted ? DEPLETE_Z + WAVE_LEAD : 0
      wave.position.z = waveZ
      wave.scale.set(1, 1, 1)
      wave.visible = depleted
      waveLight.position.z = waveZ
      waveLight.intensity = depleted ? 12 : 0
    }
  }

  const initialZ = startCarriage === 'cargo' ? spans.cargo.maxZ - 1.5 : spans.vault.center + 3
  return {
    objective: 'The Chrono Core is tearing the train apart — escape to the locomotive',
    checkpoint: {
      position: new THREE.Vector3(0, 0, initialZ),
      yaw: Math.PI,
      restore: captureCheckpointRestore(initialZ)
    },
    bounds,
    obstacles: blastObstacles,
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
      let motionScale = 1
      if (mode === 'SLOW') motionScale = 0.2
      else if (mode === 'FREEZE') motionScale = 0
      else if (mode === 'REWIND') motionScale = -1.25
      const envDt = motionScale * delta
      const exteriorScale = braking
        ? Math.max(0, 1 - brakeT / 2.5)
        : mode === 'FREEZE' ? 0 : resumeBoost * (mode === 'SLOW' ? 0.2 : 1)
      outdoorEnv.update(envDt)
      wreckExterior.update(delta, exteriorScale)
      env.update(envDt)
      embers.update(envDt)
      sparks.update(envDt)
      openingWind.update(envDt)
      openingSparks.update(envDt)
      slamSparks.update(envDt)
      if (blastSlam > 0) {
        blastSlam = Math.max(0, blastSlam - delta * 3.2)
        slamSparks.material.opacity = 0.85 * blastSlam
      } else if (slamSparks.material.opacity > 0) {
        slamSparks.material.opacity = Math.max(0, slamSparks.material.opacity - delta * 1.5)
      }
      elapsed += delta
      failCooldown = Math.max(0, failCooldown - delta)
      if (collapseHintHoldUntil > 0 && elapsed >= collapseHintHoldUntil) {
        collapseHintHoldUntil = -1
        if (!braking && hud.getObjective() === COLLAPSE_HINT) {
          hud.setObjective(depleted
            ? 'Sprint to the locomotive (hold Shift) — pull the emergency brake!'
            : LEVEL_OBJECTIVE)
        }
        if (pendingToast) {
          hud.showToast(pendingToast.message, pendingToast.duration)
          pendingToast = null
        }
      }

      const pp = player.mesh.position
      // Distance gates for rooms the player has already cleared (travel is −Z).
      // Returning / respawning to a higher Z re-enables the same paths.
      const HAZARD_PAD = 10
      const vaultActive = pp.z > spans.vault.minZ - HAZARD_PAD
      const surgeActive = pp.z > spans.convergence.minZ - HAZARD_PAD
      const blastActive = pp.z > doorZ - HAZARD_PAD
      const mechHazardActive = pp.z > spans.mechanical.minZ - HAZARD_PAD
        && pp.z < spans.mechanical.maxZ + HAZARD_PAD
      const cargoHazardActive = pp.z > spans.cargo.minZ - HAZARD_PAD
        && pp.z < spans.cargo.maxZ + HAZARD_PAD
      const walkwayActive = pp.z > gapMinZ - HAZARD_PAD && pp.z < gapMaxZ + HAZARD_PAD
      mechVisualsActive = mechHazardActive
      cargoVisualsActive = cargoHazardActive
      // Refresh poses immediately on re-entry so collision matches the clock
      // that kept running while visuals were gated.
      if (mechHazardActive) applyRams()
      if (cargoHazardActive) applyLoop()

      if (vaultActive) updateVaultGates(envDt, pp)
      if (surgeActive) updateElectricalSurges(envDt, pp)
      if (blastActive) updateBlastDoors(envDt, pp)
      const modeInt = MODE_INT[mode] ?? 0

      if (fractureArmed && pp.z > FRACTURE_Z) {
        fractureArmed = false
        fractureT = 0
      }
      if (fractureT >= 0) {
        if (mode !== 'FREEZE') fractureT += delta
        if (fractureT >= FRACTURE_S) {
          endVaultFracture()
        } else {
          const state = Math.floor(fractureT * 10) % 3
          applyVaultFracture(state)
          fracturePulse.visible = true
          const pulse = 0.35 + 0.65 * Math.abs(Math.sin(fractureT * 16))
          fracturePulse.scale.setScalar(1.15 + state * 0.85 + pulse * 0.35)
          fractureMat.customUniforms.uTime.value += mode === 'FREEZE' ? 0 : delta
          fractureMat.customUniforms.uMode.value = state === 1 ? 2 : 3
          fractureMat.customUniforms.uIntensity.value = 0.65 + pulse * 0.55
          fractureMat.customUniforms.uOpacity.value = 0.16 + pulse * 0.14
          fractureMat.customUniforms.uGlowColor.value.setHex(state === 1 ? 0x7dd3fc : 0xc084fc)
          fractureFill.color.setHex(state === 1 ? 0x7dd3fc : 0xa855f7)
          fractureFill.intensity = 3.5 + pulse * 7
        }
      }

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
      slabMat.customUniforms.uIntensity.value = 0.45 + slabSettle * 0.85 + freezePulse
      collapseChronoMat.customUniforms.uTime.value += finaleFreeze ? 0 : delta
      collapseChronoMat.customUniforms.uMode.value = modeInt
      collapseChronoMat.customUniforms.uIntensity.value = collapseLive
        ? (mode === 'FREEZE' ? 1.25 + freezePulse : 0.55 + 0.14 * Math.sin(elapsed * 2.4))
        : 0.34
      if (!finaleFreeze) waveMat.customUniforms.uTime.value += delta
      waveMat.customUniforms.uMode.value = finaleFreeze ? 2 : 3
      const resumeWave = resumeFlashT >= 0 ? Math.max(0, 1 - resumeFlashT / 0.4) * 0.7 : 0
      waveMat.customUniforms.uIntensity.value = depleted
        ? (finaleFreeze ? 1.55 + Math.sin(elapsed * 2.2) * 0.12 : 1.12 + Math.sin(elapsed * 5.5) * 0.12) + resumeWave
        : 1.0
      waveMat.customUniforms.uOpacity.value = finaleFreeze ? 0.92 : 0.6
      wave.scale.set(finaleFreeze ? 1.14 : 1, finaleFreeze ? 1.18 : 1, 1)
      walkwayGlow.intensity = walkwayActive
        ? slabSettle * (mode === 'FREEZE' ? 5.5 : 2.4)
        : 0

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
        paintChunkMats(0x64748b, 0xbfdbfe, 1.85)
        burstPanelMat.emissive.setHex(0x93c5fd)
        burstPanelMat.emissiveIntensity = 1.35
        burstBrass.emissive.setHex(0xdbeafe)
        burstBrass.emissiveIntensity = 1.1
        burstCyan.emissive.setHex(0xe0f2fe)
        burstCyan.emissiveIntensity = 1.35
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
        scene.fog.color.set(resumeWarm > 0.08 ? 0x241814 : 0x121a28)
        scene.fog.near = 38
        scene.fog.far = resumeWarm > 0 ? 55 + (1 - resumeWarm) * 65 : 185
        restoreChunkMats(resumeWarm)
        burstPanelMat.emissive.setHex(resumeWarm > 0.08 ? 0xff7048 : 0x121416)
        burstPanelMat.emissiveIntensity = 0.12 + resumeWarm * 1.1
        burstBrass.emissive.setHex(resumeWarm > 0.08 ? 0xff6a40 : 0x3a2810)
        burstBrass.emissiveIntensity = 0.14 + resumeWarm * 1.1
        burstCyan.emissive.setHex(resumeWarm > 0.08 ? 0xffb060 : 0x38bdf8)
        burstCyan.emissiveIntensity = 0.55 + resumeWarm * 0.9
        luggageMat.emissive.setHex(resumeWarm > 0.08 ? 0xff6a28 : 0x1a1008)
        luggageMat.emissiveIntensity = resumeWarm > 0.08 ? resumeWarm * 1.2 : 0.08
        burstSparkMat.color.setHex(0xffe8c0)
        burstSparkMat.emissive.setHex(0xffc078)
        embers.material.color.setHex(resumeWarm > 0.08 ? 0xff5a20 : 0xff8a3c)
        embers.material.size = 0.055 + resumeWarm * 0.05
        embers.material.opacity = 0.75 + resumeWarm * 0.2
        sparks.material.color.setHex(resumeWarm > 0.08 ? 0xffd9a0 : 0xffd9a0)
        sparks.material.size = 0.028 + resumeWarm * 0.04
        sparks.material.opacity = 0.4 + resumeWarm * 0.45
      }

      // --- Brake pulled: celebratory stop — heavy shake, exit path opens ---
      if (braking) {
        brakeT += delta
        // Early punch that settles into a fading rumble (celebratory, not subtle).
        const punch = Math.exp(-brakeT * 1.55)
        const rumble = Math.max(0, 1 - brakeT / 2.8)
        const shakeAmp = punch * 0.055 + rumble * 0.022
        root.rotation.z =
          Math.sin(brakeT * 34) * shakeAmp +
          Math.sin(brakeT * 51) * shakeAmp * 0.45
        root.position.y =
          Math.abs(Math.sin(brakeT * 28)) * shakeAmp * 0.85 +
          Math.sin(brakeT * 47) * shakeAmp * 0.35
        root.position.x = Math.sin(brakeT * 39) * shakeAmp * 0.4

        // Doors swing open and warm light floods the escape path.
        const open = Math.min(1, brakeT / 1.15)
        const eased = open * open * (3 - 2 * open)
        exitLeft.rotation.y = -eased * 1.35
        exitRight.rotation.y = eased * 1.35
        exitGlow.material.opacity = 0.15 + eased * 0.55
        exitGlow.material.emissiveIntensity = eased * 2.4
        exitLight.intensity = eased * 22
        exitDoorMat.emissiveIntensity = 0.2 + eased * 0.55
        exitBrassMat.emissiveIntensity = 0.2 + eased * 0.9

        if (wave.visible) {
          const s = Math.max(0, 1 - brakeT * 0.9)
          wave.scale.set(1, s, 1)
          waveLight.intensity = 14 * s
          waveMat.customUniforms.uIntensity.value = 1.15 * s
          if (s <= 0.01) { wave.visible = false; waveLight.intensity = 0 }
        }

        // Night gives way to first light as the train settles on the bridge.
        const dawn = Math.min(1, Math.max(0, (brakeT - 1.6) / 2.2))
        scene.background.lerpColors(NIGHT_COLOR, DAWN_COLOR, dawn)
        scene.fog.color.copy(scene.background)
        scene.fog.far = 40 + dawn * 70

        if (brakeT > 4.8) {
          braking = false
          root.rotation.z = 0
          root.position.y = 0
          root.position.x = 0
          advance()
        }
        return
      }

      // --- Atmosphere: shake / debris / handles (each independently toggled) ---
      const unrest = 1 + Math.min(1.5, elapsed * 0.02) + (breakupT >= 0 ? 1.2 : 0)
      const slamKick = blastSlam
      const shook = carriageShake.update(delta, {
        elapsed,
        unrest,
        slamKick,
        frozen: finaleFreeze
      })
      if (!shook && !finaleFreeze) {
        // Shake disabled: keep the train visually still (door slam feedback only).
        root.rotation.z = Math.sin(elapsed * 52) * 0.018 * slamKick * slamKick
        root.position.y = Math.sin(elapsed * 68) * 0.014 * slamKick * slamKick
        root.position.x = Math.sin(elapsed * 41) * 0.008 * slamKick * slamKick
      } else if (finaleFreeze) {
        root.position.x = 0
      }
      stormDebris.update(envDt, { elapsed, frozen: finaleFreeze, unrest })
      grabHandles.update(envDt, { elapsed, frozen: finaleFreeze, unrest, slamKick })
      // After shake + env flicker: swing fixtures and gently modulate lamp intensity.
      lampMotion.update(envDt, {
        elapsed,
        frozen: finaleFreeze,
        unrest,
        shakeX: root.position.x,
        shakeY: root.position.y
      })

      // --- Rolling checkpoints (descending z) -----------------------------
      for (const z of checkpointZs) {
        if (pp.z < z && z < lastCheckpointZ) {
          lastCheckpointZ = z
          respawn.setCheckpoint(new THREE.Vector3(0, 0, z), Math.PI, {
            restore: captureCheckpointRestore(z)
          })
        }
      }

      hint('vault-lasers', pp.z, spans.vault.center + 0.6,
        `Use ${bindingLabel(settings.getBinding('slow'))} to Slow the security lasers`)
      hint('convergence-surges', pp.z, electricalSurges[0].z + 4.5,
        `Use ${bindingLabel(settings.getBinding('slow'))} to slow the electrical surges`,
        4800)
      hint('mechanical', pp.z, spans.mechanical.maxZ,
        'Mechanical car — the pistons are running at wrecked speed. [1]/Q SLOW is the only way through.')
      hint('cargo', pp.z, spans.cargo.maxZ,
        'Cargo — the emergency gangway is buckling. The pale frame marks its earlier position.', 4400)
      hint('cargo-gangway', pp.z, cargoGap.maxZ + 1.3,
        `Restore the gangway with ${bindingLabel(settings.getBinding('rewind'))}, then hold it with ${bindingLabel(settings.getBinding('freeze'))}. Rest on the landing before the bulkhead.`, 6500)
      hint('cargo-landing', pp.z, cargoGap.minZ - 0.25,
        'Intact landing — recharge here. Watch the bulkhead ring; green means the door and overhead load are clear.', 4800)
      hint('relay-blast-doors', pp.z, doorZ + 4.2,
        `Use ${bindingLabel(settings.getBinding('slow'))} or ${bindingLabel(settings.getBinding('freeze'))} to pass the blast doors`)
      hint('security', pp.z, spans.security.maxZ,
        'Security car — the floor is gone. [2]/F FREEZE the suspended wreckage into a walkway.')
      hint('passenger', pp.z, spans.passenger.maxZ,
        'The train is coming apart behind you — do not stop.')

      if (failBurstArmed && pp.z < FAIL_BURST_TRIGGER_Z) startFailBurst()

      // --- FAST-TIME CAR: runaway pistons ---------------------------------
      if (mechHazardActive) {
        for (const r of rams) {
          if (Math.abs(pp.z - r.z) < 0.55 && Math.abs(pp.x - r.head.position.x) < 0.5) {
            failSoft('Crushed by a runaway piston!')
            break
          }
        }
      }

      // --- TIME-LOOP CAR: crushing bulkhead and falling girder -------------
      if (cargoHazardActive) {
        const bodyTop = pp.y + (player.isCrouching?.() ? 1.15 : 1.85)
        if (pp.z > cargoGap.minZ && pp.z < cargoGap.maxZ && pp.y < -0.5) {
          failSoft('The gangway buckled — rewind its pale frame, then freeze the restored deck.', 'fell')
        }
        if (loopDoor.position.y - LOOP_DOOR_H / 2 < bodyTop &&
            loopDoor.position.y + LOOP_DOOR_H / 2 > pp.y && Math.abs(pp.z - loopDoorZ) < 0.3) {
          failSoft('The bulkhead slammed shut on you!')
        }
        if (loopBeam.position.y - 0.16 < bodyTop && loopBeam.position.y + 0.21 > pp.y &&
            Math.abs(pp.x) < 1.5 && Math.abs(pp.z - loopBeamZ) < 0.4) {
          failSoft('Crushed by the falling girder!')
        }
      }

      // --- FROZEN CAR: suspended wreckage as a walkway ---------------------
      const frozen = mode === 'FREEZE'
      slabSupports.length = 0
      slabSupports.push(...cargoGangway.supports)
      if (walkwayActive) {
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
      }

      // --- PASSENGER collapse: Freeze stepping-stones across the hole ------
      if (collapseArmed && pp.z < collapseTriggerZ) startCollapse()
      collapseSettle += ((frozen && collapseLive ? 1 : 0) - collapseSettle) * Math.min(1, delta * 9)
      const nearCollapse = pp.z > collapseMinZ - HAZARD_PAD && pp.z < collapseMaxZ + HAZARD_PAD
      const collapseFxLive = collapseLive && (nearCollapse || collapseMotionNeedsUpdate(frozen))
      if (collapseFxLive) applyCollapseMotion()
      collapseGlow.intensity = collapseFxLive
        ? (frozen ? 8 : 2.4 + Math.sin(elapsed * 3.2) * 0.4)
        : 0
      if (collapseFxLive) {
        collapseBrass.emissiveIntensity = frozen ? 1.1 : 0.12
        collapseWood.emissiveIntensity = frozen ? 0.85 : 0.1
        collapseCyan.emissiveIntensity = frozen ? 1.25 : 0.65
      }
      if (frozen && collapseLive) {
        for (const p of collapsePieces) {
          slabSupports.push({
            minX: p.mesh.position.x - p.hx - COLLAPSE_PAD_X,
            maxX: p.mesh.position.x + p.hx + COLLAPSE_PAD_X,
            minZ: p.mesh.position.z - p.hz - COLLAPSE_PAD_Z,
            maxZ: p.mesh.position.z + p.hz + COLLAPSE_PAD_Z,
            y: p.mesh.position.y + p.hy + 0.02
          })
        }
      }
      const inCollapse = collapseLive && pp.z > collapseMinZ && pp.z < collapseMaxZ
      const onFarLip = pp.z <= collapseMinZ + 1.9
      let onCollapseSupport = false
      if (frozen && collapseLive) {
        for (const p of collapsePieces) {
          if (
            pp.x >= p.mesh.position.x - p.hx - COLLAPSE_PAD_X &&
            pp.x <= p.mesh.position.x + p.hx + COLLAPSE_PAD_X &&
            pp.z >= p.mesh.position.z - p.hz - COLLAPSE_PAD_Z &&
            pp.z <= p.mesh.position.z + p.hz + COLLAPSE_PAD_Z &&
            pp.y >= p.mesh.position.y + p.hy - 1.0
          ) {
            onCollapseSupport = true
            break
          }
        }
      }
      if (inCollapse && onCollapseSupport) {
        // Landing on/over an active Freeze pad — do not treat the void as a fail.
      } else if (inCollapse && pp.y < -0.3) {
        failSoft('The floor collapsed — FREEZE the wreckage and cross!', 'fell')
      } else if (inCollapse && !frozen && !onFarLip && collapseSettle < 0.18) {
        failSoft('The floor collapsed — FREEZE the wreckage and cross!', 'fell')
      }

      // --- BREAKING TRAIN --------------------------------------------------
      if (breakupT < 0 && pp.z < spans.passenger.maxZ - 1) {
        breakupT = 0
        chunkGroup.visible = true
        showLevelToast('The couplings are letting go — RUN!', 2600)
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
        showLevelToast('CHRONO CORE DEPLETED — only FREEZE remains. RUN!', 3800)
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

      // After all intensity/colour writes for this frame (env flicker, Freeze
      // glows, blast, wave/stasis) so nearby hazards win the nearest-12 set.
      lightPool.update(pp)
    },

    dispose() {
      unregisters.forEach((fn) => fn())
      stormDebris.dispose()
      grabHandles.dispose()
      scene.remove(aisleKey, aisleKeyTarget)
      for (const snap of playerMatRestore) {
        snap.m.emissive.setHex(snap.emissive)
        snap.m.emissiveIntensity = snap.ei
      }
      // outdoorEnv.dispose() only frees GPU resources — the group still has to
      // come out of the scene here or it survives every level teardown.
      outdoorEnv.dispose()
      wreckExterior.dispose()
      scene.remove(outdoorEnv.group, wreckExterior.group, root)
      disposeObject(root)
    }
  }
}

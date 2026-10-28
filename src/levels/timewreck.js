import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y, listCarriageVolumes } from '../environment/carriages.js'
import { createLightPool } from '../core/light-pool.js'
import { createWreckVisibility, installWreckVisibility } from '../environment/wreck-visibility.js'
import { WRECK_WALL_X } from '../environment/carriage-bounds.js'
import { createParticleField, createChronoMoteField } from '../environment/particles.js'
import { createTimewreckExterior } from '../environment/timewreck-exterior.js'
import { createSkyDome } from '../environment/sky-dome.js'
import { createWreckRetirement } from '../environment/wreck-ownership.js'
import { WRECK_DAMAGE } from '../environment/wreck-damage.js'
import { captureSkyEnvironment, useCapturedSkyBackground } from '../environment/sky-environment.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { createSecurityLaserMaterial } from '../shaders/security-laser.js'
import { bindingLabel, settings } from '../core/settings.js'
import { createWreckRoutes, createPassengerRack } from './timewreck-routes.js'
import { createWreckSpatial } from './timewreck-spatial.js'
import { createWreckConnector } from './timewreck-connector.js'
import { createWreckFeedback } from './timewreck-feedback.js'
import { createSecurityCrossing } from './timewreck-security.js'
import { createRelayFeedback } from './timewreck-relay-feedback.js'
import { createWreckAudio } from '../systems/wreck-audio.js'
import { createLevelThreeSfx } from '../systems/level-three-sfx.js'
import { createWreckHazardAudio } from '../systems/wreck-hazard-audio.js'
import { createExpansionHazards } from './timewreck-expansion-hazards.js'
import { createDebrisCollision } from './timewreck-debris.js'
import { createFlyingPanels } from './timewreck-flying-panels.js'
import { signMaterial } from '../environment/textures.js'
import { addPassengerGuidance } from '../environment/passenger-guidance.js'
import { cargoGangwayLayout, cargoLoopPose, cutCargoGangwayFloor, createCargoGangway } from './timewreck-cargo.js'
import {
  createCarriageShake,
  createStormDebris,
  createLampMotion,
  createGrabHandles,
  STORM_PROGRESS,
  stormProgressAlongTrain
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
const BRAKE_HANDOFF_SECONDS = 1
const BRAKE_FADE_SECONDS = 0.5
const FINALE_FREEZE_COLOR = new THREE.Color(0x1a3358)
const FOG_COOL = new THREE.Color(0x172a44)
const FOG_STORM = new THREE.Color(0x20263c)
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
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.14, 0.58, 1, 0.025), pedestalMat)
  base.position.y = 0.07
  base.castShadow = true
  brake.add(base)
  const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.62), brassMat)
  baseTrim.position.y = 0.15
  brake.add(baseTrim)

  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.78, 0.38, 1, 0.025), pedestalMat)
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
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.28), signMaterial({
    text: 'EMERGENCY BRAKE', emissiveIntensity: 0.25
  }))
  label.name = 'emergency-brake-sign'
  label.position.set(0, 1.95, 0.24)
  label.userData.noCameraCollision = true
  brake.add(label)

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
  scene, interaction, timeSystem, hud, player, camera, respawn, advance, beginCinematic, startCarriage = null,
  renderer = null, post = null, debrisSeed
}) {
  // Remove the global warm shadow lift from this storm scene only. Practical
  // lamps supply the warmth; exposure and the existing AA/quality policy stay.
  post?.setGrade({warmth:0.003,vignette:0.28,saturation:1.02})
  // Level 3 is the "unstable" end of the scale — the shaders read this.
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.8)
  // Boarding / Level 2 hide the Chrono deck until powers unlock; L3 starts with them.
  hud?.setChronoVisible?.(true)

  const env = createCarriageEnvironment({ damaged: true })
  const { root, spans, carriages } = env
  const damageSpans = Object.entries(WRECK_DAMAGE).map(([key,damage]) => ({span:spans[key],damage}))
  const moonDirection = new THREE.Vector3(-0.478, 0.292, 0.828).normalize()
  const stormSky = createSkyDome('timewreck')
  // L3 instance only: one moon bearing for visible sky, reflections and terrain.
  const sky = stormSky.uniforms
  sky.uShowSunDisc.value = 0
  sky.uSunDirection.value.set(moonDirection.x,-0.28,moonDirection.z).normalize()
  sky.uMoonDirection.value.copy(moonDirection)
  sky.uMoonStrength.value = 1
  sky.uSkyGain.value = 0.025
  sky.uNightLift.value = 0.7
  sky.uGlitch.value = 0.16
  sky.uCloudSpeed.value = 0.008
  sky.uHorizonColor.value.setHex(0x172a44)
  sky.uZenithColor.value.setHex(0x0b142a)
  // Keep the existing MEDIUM scenery budget; its broad terrain stays below
  // the hull. A valley migration would add much more visible scenery here.
  const outdoorEnv = createOutdoorEnvironment({
    mode: 'moving',
    speed: 45.0,
    stormy: true,
    quality: 'MEDIUM',
    sunPosition: moonDirection.clone().multiplyScalar(120),
    sunColor: 0xb8c8e0, skyColor: 0x607797, groundColor: 0x172132,
    fogColor: 0x172a44, fogNear: 38, fogFar: 185, terrainAmbient: 0.4
  })
  const wreckExterior = createTimewreckExterior({
    minZ: spans.cab.minZ - 10,
    maxZ: spans.vault.maxZ + 12,
    speed: 45
  })
  scene.add(outdoorEnv.group, wreckExterior.group, root, stormSky.mesh)
  scene.background = new THREE.Color().copy(NIGHT_COLOR)
  // Cool storm fog — contrasts warm amber carriage fill; range kept for readability.
  scene.fog = new THREE.Fog(0x172a44, 38, 185)

  // Capture the same visible dome once; never recapture during play.
  let stormEnvTarget = null
  let releaseCapturedSky = () => {}
  const savedEnvironment = scene.environment ?? null
  const savedEnvironmentIntensity = scene.environmentIntensity ?? 1
  if (renderer) {
    stormEnvTarget = captureSkyEnvironment(renderer, stormSky.mesh)
    scene.environment = stormEnvTarget.texture
    scene.environmentIntensity = 0.42
    releaseCapturedSky = useCapturedSkyBackground(stormSky, stormEnvTarget.texture)
  }

  // Damaged PBR surfaces are very dark; short-range emergency points leave most
  // of each car on ambient alone, which ACES tone mapping crushes to near-black.
  // One soft directional key (no shadows) lights the aisle and player.
  const aisleKey = new THREE.DirectionalLight(0xb8c8e0, 1.45)
  aisleKey.position.copy(moonDirection).multiplyScalar(24)
  aisleKey.position.z += spans.vault.maxZ - 4
  scene.add(aisleKey)
  const aisleKeyTarget = new THREE.Object3D()
  aisleKeyTarget.position.set(0, 0.6, spans.vault.maxZ - 4)
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
  const wreckAudio = createWreckAudio()
  const levelThreeSfx = createLevelThreeSfx()
  const hazardAudio = createWreckHazardAudio()
  unregisters.push(interaction.registerBlocker(root))
  const bounds = { ...env.interiorBounds }
  const addProp = (obj, z, x = 0, y = 0) => { obj.position.set(x, y, z); root.add(obj); return obj }

  let failCooldown = 0
  const LEVEL_OBJECTIVE = 'Stay ahead of the purple time wave — escape to the locomotive'
  const COLLAPSE_HINT = `Freeze the marked floor with ${bindingLabel(settings.getBinding('freeze'))}, then sprint across its centre`
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
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  let vaultGateT = 0

  function createVaultGate(z, phase, speed) {
    const group = new THREE.Group()
    group.name = 'vault-security-gate'
    group.position.set(0, 0, z)
    const laserMat = createSecurityLaserMaterial({ beamCount: 1, boost: 1.45 })
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
    const signal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.08), new THREE.MeshBasicMaterial({ color: 0xe49a30 }))
    signal.name = 'vault-clearance-signal'
    signal.position.set(1.9, 2.6, 0.15); group.add(signal)
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
    const wash = new THREE.PointLight(0xff3344, 0.42, 5.5, 2)
    wash.position.set(0, 1.3, 0)
    group.add(wash)
    group.traverse((node) => { node.userData.noCameraCollision = true })
    root.add(group)
    return { z, phase, speed, laserMat, beams, wash, signal, plateMat: vaultPlateMat }
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
      const standingClear = VAULT_BEAM_BASES[0] + lift - VAULT_HIT_HALF_Y > VAULT_BODY_HEIGHT
      gate.signal.material.color.setHex(standingClear ? 0x42dfad : 0xe49a30)
      // Same lamp/mesh: horizontal bar = standing clearance, upright = wait.
      // Shape remains readable when colour is hard to distinguish; Freeze
      // preserves the actual clearance pose rather than disabling damage.
      gate.signal.scale.set(standingClear ? 1.7 : 0.55, standingClear ? 0.55 : 1.7, 1)
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
          && (y - VAULT_HIT_HALF_Y) < playerPos.y + (player.isCrouching() ? 1.15 : VAULT_BODY_HEIGHT)
        const inSlice = Math.abs(playerPos.z - gate.z) <= VAULT_HIT_HALF_Z
        const inWidth = Math.abs(playerPos.x) <= VAULT_BEAM_LENGTH / 2
        if (overlapsBody && inSlice && inWidth) {
          levelThreeSfx.laserHit()
          failSoft('A damaged security laser caught you!', 'laser')
        }
      }
    }
  }

  // Brass observation spots are outside both laser body slices.
  for (const z of [spans.vault.center + 0.8, spans.vault.center - 2.9]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.015, 0.9), new THREE.MeshStandardMaterial({ color: 0x315954, emissive: 0x296458, emissiveIntensity: 0.4 }))
    pad.name = 'vault-safe-observation'; pad.position.set(0, 0.01, z); root.add(pad)
  }

  // Flying storm debris — one sideways wreckage dash after the second laser rack,
  // before the Convergence doorway. Clear of gate hit slices (~center-4.6 ±0.11).
  const DEBRIS_Z = spans.vault.center - 6.8
  const DEBRIS_PERIOD = 4.6
  const DEBRIS_WARN = 0.75
  const DEBRIS_MOVE = 0.7
  const DEBRIS_PARK_X = -2.25
  const DEBRIS_END_X = 2.2
  const DEBRIS_HALF_X = 0.42
  const DEBRIS_HALF_Y = 0.32
  const DEBRIS_HALF_Z = 0.28
  const DEBRIS_FLY_Y = 1.05
  let debrisClock = 0
  let lastVaultDebrisCycle = -1
  const debrisWood = new THREE.MeshStandardMaterial({
    color: 0x6a4528, roughness: 0.82, metalness: 0.05, emissive: 0x2a180c, emissiveIntensity: 0.12
  })
  const debrisMetal = new THREE.MeshStandardMaterial({
    color: 0x8a949c, roughness: 0.38, metalness: 0.85, emissive: 0x1a2030, emissiveIntensity: 0.14
  })
  const debrisWarnMat = new THREE.MeshBasicMaterial({ color: 0x9b5cff })
  const debrisTrailMat = new THREE.MeshBasicMaterial({
    color: 0xc4a0ff, transparent: true, opacity: 0.35, depthWrite: false
  })
  const debrisGroup = new THREE.Group()
  debrisGroup.name = 'vault-flying-storm-debris'
  debrisGroup.position.set(DEBRIS_PARK_X, DEBRIS_FLY_Y, DEBRIS_Z)
  const debrisPlank = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.38), debrisWood)
  debrisPlank.rotation.z = 0.18
  debrisGroup.add(debrisPlank)
  const debrisBrace = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.14), debrisMetal)
  debrisBrace.position.set(0.2, 0.08, -0.05)
  debrisBrace.rotation.x = 0.35
  debrisGroup.add(debrisBrace)
  const debrisShard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.5), debrisMetal)
  debrisShard.position.set(-0.18, -0.06, 0.08)
  debrisShard.rotation.y = -0.4
  debrisGroup.add(debrisShard)
  const debrisWarnLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), debrisWarnMat)
  debrisWarnLamp.name = 'vault-debris-warn-lamp'
  debrisWarnLamp.position.set(0, 0.28, 0.22)
  debrisGroup.add(debrisWarnLamp)
  const debrisTrails = []
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22 - i * 0.03, 0.08, 0.16), debrisTrailMat.clone())
    t.visible = false
    t.userData.noCameraCollision = true
    root.add(t)
    debrisTrails.push(t)
  }
  debrisGroup.traverse((n) => { n.userData.noCameraCollision = true })
  root.add(debrisGroup)
  const debrisLaunchLight = new THREE.PointLight(0xb57bff, 0, 5.5, 2)
  debrisLaunchLight.name = 'vault-debris-storm-flash'
  debrisLaunchLight.position.set(0, 1.6, DEBRIS_Z)
  root.add(debrisLaunchLight)
  // Safe wait pad just before the flight plane (between second rack and debris).
  const debrisSafePad = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.015, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x315954, emissive: 0x5b21b6, emissiveIntensity: 0.45 })
  )
  debrisSafePad.name = 'vault-debris-safe-wait'
  debrisSafePad.position.set(0, 0.01, DEBRIS_Z + 1.15)
  root.add(debrisSafePad)

  function debrisPhase() {
    const p = ((debrisClock % DEBRIS_PERIOD) + DEBRIS_PERIOD) % DEBRIS_PERIOD
    if (p < DEBRIS_WARN) return { mode: 'warn', u: p / DEBRIS_WARN, p }
    if (p < DEBRIS_WARN + DEBRIS_MOVE) return { mode: 'move', u: (p - DEBRIS_WARN) / DEBRIS_MOVE, p }
    return { mode: 'idle', u: 0, p }
  }

  function applyFlyingDebris() {
    const { mode, u } = debrisPhase()
    if (mode === 'move') {
      const ease = u * u * (3 - 2 * u)
      debrisGroup.position.x = DEBRIS_PARK_X + (DEBRIS_END_X - DEBRIS_PARK_X) * ease
      debrisGroup.position.y = DEBRIS_FLY_Y + Math.sin(u * Math.PI) * 0.22
      debrisGroup.position.z = DEBRIS_Z
      debrisGroup.rotation.x = u * 2.4
      debrisGroup.rotation.y = u * 1.8
      debrisGroup.rotation.z = Math.sin(u * Math.PI * 5) * 0.35
      debrisWarnMat.color.setHex(0xff66ee)
      debrisWarnLamp.scale.setScalar(1.1 + Math.sin(debrisClock * 30) * 0.15)
      debrisLaunchLight.intensity = u < 0.18 ? 7.5 * (1 - u / 0.18) : Math.max(0, 1.2 - u * 1.2)
      debrisLaunchLight.color.setHex(0xd8b4fe)
      for (let i = 0; i < debrisTrails.length; i++) {
        const trail = debrisTrails[i]
        const back = ease - (i + 1) * 0.07
        if (back <= 0) { trail.visible = false; continue }
        const te = Math.max(0, Math.min(1, back))
        trail.visible = true
        trail.position.set(
          DEBRIS_PARK_X + (DEBRIS_END_X - DEBRIS_PARK_X) * te,
          DEBRIS_FLY_Y + Math.sin(te * Math.PI) * 0.18,
          DEBRIS_Z
        )
        trail.material.opacity = 0.32 - i * 0.06
        trail.scale.setScalar(1 - i * 0.12)
      }
    } else if (mode === 'warn') {
      debrisGroup.position.set(DEBRIS_PARK_X, DEBRIS_FLY_Y, DEBRIS_Z)
      debrisGroup.rotation.set(
        Math.sin(debrisClock * 19) * 0.12,
        Math.sin(debrisClock * 14) * 0.1,
        Math.sin(debrisClock * 23) * 0.16
      )
      debrisWarnMat.color.setHex(Math.sin(debrisClock * 18) > 0 ? 0xd8b4fe : 0x7c3aed)
      debrisWarnLamp.scale.setScalar(1.3 + Math.sin(debrisClock * 22) * 0.4)
      debrisLaunchLight.intensity = 1.2 + Math.abs(Math.sin(debrisClock * 16)) * 2.8
      debrisLaunchLight.color.setHex(0x9b5cff)
      for (const trail of debrisTrails) trail.visible = false
    } else {
      debrisGroup.position.set(DEBRIS_PARK_X, DEBRIS_FLY_Y, DEBRIS_Z)
      debrisGroup.rotation.set(0.1, 0.2, 0.05)
      debrisWarnMat.color.setHex(0x6d28d9)
      debrisWarnLamp.scale.setScalar(1)
      debrisLaunchLight.intensity = 0
      for (const trail of debrisTrails) trail.visible = false
    }
  }

  function updateFlyingDebris(playerPos) {
    applyFlyingDebris()
    const flightCycle = Math.floor(Math.max(0, debrisClock) / DEBRIS_PERIOD)
    if (playerPos && debrisPhase().mode === 'move' &&
        lastVaultDebrisCycle !== flightCycle && timeSystem.getMode() !== 'REWIND') {
      lastVaultDebrisCycle = flightCycle
      levelThreeSfx.lethalFlight(Math.hypot(playerPos.x - debrisGroup.position.x,
        playerPos.y - debrisGroup.position.y, playerPos.z - DEBRIS_Z),
        (DEBRIS_END_X - DEBRIS_PARK_X) / DEBRIS_MOVE)
    }
    if (!playerPos) return
    if (debrisPhase().mode !== 'move') return
    const cx = debrisGroup.position.x
    const cy = debrisGroup.position.y
    const cz = debrisGroup.position.z
    const overlapsX = Math.abs(playerPos.x - cx) <= DEBRIS_HALF_X + 0.18
    const overlapsZ = Math.abs(playerPos.z - cz) <= DEBRIS_HALF_Z + 0.18
    const bodyTop = playerPos.y + (player.isCrouching() ? 1.15 : 1.85)
    const overlapsY = playerPos.y < cy + DEBRIS_HALF_Y && bodyTop > cy - DEBRIS_HALF_Y
    if (overlapsX && overlapsZ && overlapsY) {
      failSoft('Flying storm debris hit you! Wait on the purple-teal pad, then dodge or Slow/Freeze the crossing.')
    }
  }

  applyFlyingDebris()
  unregisters.push(timeSystem.register(debrisGroup, {
    onUpdate(scaledDelta) {
      debrisClock += scaledDelta
      applyFlyingDebris()
    },
    getSnapshot: () => ({ debrisClock }),
    restoreSnapshot(s) {
      debrisClock = s.debrisClock ?? 0
      lastVaultDebrisCycle = Math.floor(Math.max(0, debrisClock) / DEBRIS_PERIOD)
      applyFlyingDebris()
    }
  }))

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
      emissive: 0xa855f7, emissiveIntensity: 0.35
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
      color: 0x67e8f9,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfaf5ff,
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
      color: 0x7c3aed,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.55), hazeMat)
    haze.position.y = 1.05
    group.add(haze)

    const light = new THREE.PointLight(0xa78bfa, 0.3, 6.5, 2)
    light.position.set(0, 1.15, 0)
    group.add(light)
    const panelLight = new THREE.PointLight(0x67e8f9, 0.2, 3.8, 2)
    panelLight.position.set(side * 2.1, 1.25, 0)
    group.add(panelLight)

    const sparkPos = new Float32Array(SURGE_SPARK_COUNT * 3)
    const sparkGeo = new THREE.BufferGeometry()
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparkMat = new THREE.PointsMaterial({
      color: 0xe9d5ff,
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
      group, z, side, offset, period, danger,
      panelMat, light, panelLight, glowMat, coreMat, hazeMat, sparkMat, sparkPos, sparks,
      coreSegs, glowSegs,
      boltSeed: -1, boltMode: ''
    }
    rebuildSurgeLightning(surge, 0, 'safe')
    return surge
  }

  // One short fork: a close direct surge window or a shielded shutter passage.
  const electricalSurges = [createElectricalSurge(spans.convergence.center + 4, -1, 0, 3.6, 2.05)]
  // Only the direct aisle is electrified; the brass partition shields maintenance.
  electricalSurges[0].group.scale.x = 0.59
  electricalSurges[0].group.position.x = -0.72

  // Runaway service carts — open Convergence floor past the fork (well after surge ~center+4).
  // Four staggered dashes from the walls: +X, −X, and both diagonals (covers all directions).
  const CART_PERIOD = 5.0
  const CART_WARN = 0.65
  const CART_MOVE = 0.48
  const CART_HALF_X = 0.38
  const CART_HALF_Z = 0.32
  const CART_HALF_Y = 0.48
  const _cartC = spans.convergence.center
  const CART_SPECS = [
    { parkX: -2.15, parkZ: _cartC - 5.0, endX: 2.05, endZ: _cartC - 5.0 },   // across +X
    { parkX: 2.15, parkZ: _cartC - 7.2, endX: -2.05, endZ: _cartC - 7.2 },   // across −X
    { parkX: -2.15, parkZ: _cartC - 4.8, endX: 2.05, endZ: _cartC - 8.8 },   // diagonal +X/−Z
    { parkX: 2.15, parkZ: _cartC - 10.2, endX: -2.05, endZ: _cartC - 5.4 }   // diagonal −X/+Z
  ]
  let cartClock = 0
  const cartWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.72, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.1
  })
  const cartBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.16
  })
  const cartCloth = new THREE.MeshStandardMaterial({
    color: 0x6e1c28, roughness: 0.9, metalness: 0.02, emissive: 0x1a0608, emissiveIntensity: 0.08
  })
  function createRunawayCart(spec, index) {
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xe49a30 })
    const group = new THREE.Group()
    group.name = index === 0 ? 'convergence-runaway-cart' : `convergence-runaway-cart-${index + 1}`
    const facing = Math.atan2(spec.endX - spec.parkX, spec.endZ - spec.parkZ)
    group.position.set(spec.parkX, 0, spec.parkZ)
    group.rotation.y = facing
    function cartBox(w, h, d, mat, x, y, lz) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      m.position.set(x, y, lz)
      group.add(m)
      return m
    }
    cartBox(0.72, 0.1, 0.58, cartWood, 0, 0.42, 0)
    cartBox(0.68, 0.55, 0.08, cartWood, 0, 0.72, -0.25)
    cartBox(0.08, 0.55, 0.5, cartWood, -0.32, 0.72, 0)
    cartBox(0.08, 0.55, 0.5, cartWood, 0.32, 0.72, 0)
    cartBox(0.62, 0.04, 0.4, cartCloth, 0, 0.5, 0.02)
    cartBox(0.76, 0.03, 0.62, cartBrass, 0, 0.98, 0)
    for (const x of [-0.34, 0.34]) cartBox(0.04, 0.04, 0.56, cartBrass, x, 0.72, 0)
    for (const [x, wz] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8), cartBrass)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.08, wz)
      group.add(wheel)
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.08), warnMat)
    lamp.name = index === 0 ? 'runaway-cart-warn-lamp' : `runaway-cart-warn-lamp-${index + 1}`
    lamp.position.set(0, 1.05, 0.28)
    group.add(lamp)
    group.traverse((n) => { n.userData.noCameraCollision = true })
    root.add(group)
    return {
      group, lamp, warnMat, facing,
      parkX: spec.parkX, parkZ: spec.parkZ, endX: spec.endX, endZ: spec.endZ,
      // Start every cart in idle so the open floor is clear when the room loads.
      phaseOffset: CART_WARN + CART_MOVE + 0.2 + index * 1.15
    }
  }
  const runawayCarts = CART_SPECS.map((spec, i) => createRunawayCart(spec, i))

  function cartPhase(cart) {
    const p = (((cartClock + cart.phaseOffset) % CART_PERIOD) + CART_PERIOD) % CART_PERIOD
    if (p < CART_WARN) return { mode: 'warn', u: p / CART_WARN, p }
    if (p < CART_WARN + CART_MOVE) return { mode: 'move', u: (p - CART_WARN) / CART_MOVE, p }
    return { mode: 'idle', u: 0, p }
  }

  function applyRunawayCart(cart) {
    const { mode, u } = cartPhase(cart)
    const t = cartClock + cart.phaseOffset
    if (mode === 'move') {
      const ease = u * u * (3 - 2 * u)
      cart.group.position.x = cart.parkX + (cart.endX - cart.parkX) * ease
      cart.group.position.z = cart.parkZ + (cart.endZ - cart.parkZ) * ease
      cart.group.rotation.y = cart.facing
      cart.group.rotation.z = Math.sin(u * Math.PI * 6) * 0.04
      cart.group.position.y = Math.abs(Math.sin(u * Math.PI * 8)) * 0.02
      cart.warnMat.color.setHex(0xff2a2a)
      cart.lamp.scale.setScalar(1.15 + Math.sin(t * 28) * 0.2)
    } else if (mode === 'warn') {
      cart.group.position.x = cart.parkX
      cart.group.position.z = cart.parkZ
      cart.group.position.y = 0
      cart.group.rotation.y = cart.facing + Math.sin(t * 17) * 0.05
      cart.group.rotation.z = Math.sin(t * 22) * 0.08
      cart.warnMat.color.setHex(Math.sin(t * 16) > 0 ? 0xffb060 : 0xe49a30)
      cart.lamp.scale.setScalar(1.25 + Math.sin(t * 20) * 0.35)
    } else {
      cart.group.position.x = cart.parkX
      cart.group.position.z = cart.parkZ
      cart.group.position.y = 0
      cart.group.rotation.y = cart.facing
      cart.group.rotation.z = 0
      cart.warnMat.color.setHex(0xe49a30)
      cart.lamp.scale.setScalar(1)
    }
  }

  function applyRunawayCarts() {
    for (const cart of runawayCarts) applyRunawayCart(cart)
  }

  function updateRunawayCart(playerPos) {
    applyRunawayCarts()
    if (!playerPos) return
    for (const cart of runawayCarts) {
      if (cartPhase(cart).mode !== 'move') continue
      const cx = cart.group.position.x
      const cz = cart.group.position.z
      const cy = CART_HALF_Y
      const overlapsX = Math.abs(playerPos.x - cx) <= CART_HALF_X + 0.18
      const overlapsZ = Math.abs(playerPos.z - cz) <= CART_HALF_Z + 0.18
      const bodyTop = playerPos.y + (player.isCrouching() ? 1.15 : 1.85)
      const overlapsY = playerPos.y < cy + CART_HALF_Y && bodyTop > cy - CART_HALF_Y
      if (overlapsX && overlapsZ && overlapsY) {
        failSoft('A runaway service cart caught you! Sidestep the open-floor rolls or Slow to cross.')
        return
      }
    }
  }

  applyRunawayCarts()
  unregisters.push(timeSystem.register(runawayCarts[0].group, {
    onUpdate(scaledDelta) {
      cartClock += scaledDelta
      applyRunawayCarts()
    },
    getSnapshot: () => ({ cartClock }),
    restoreSnapshot(s) {
      cartClock = s.cartClock ?? 0
      applyRunawayCarts()
    }
  }))

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
      // Visual identity only: violet danger vs ice-cyan warn (timing unchanged).
      if (dangerous) {
        surge.glowMat.color.setHex(0xd8b4fe)
        surge.hazeMat.color.setHex(0x7c3aed)
        surge.panelMat.emissive.setHex(0xa855f7)
        surge.light.color.setHex(0xc084fc)
        surge.panelLight.color.setHex(0xe9d5ff)
        surge.sparkMat.color.setHex(0xf5e1ff)
        surge.coreMat.opacity = 0.95
        surge.glowMat.opacity = 0.55 + pulse * 0.25
        surge.hazeMat.opacity = 0.16 + pulse * 0.1
        surge.panelMat.emissiveIntensity = 2.6 + crackle * 0.8
        surge.light.intensity = 6.5 + pulse * 2.2 + crackle * 1.5
        surge.panelLight.intensity = 3.5 + crackle * 2.5
        surge.sparkMat.opacity = 0.55 + pulse * 0.35
        surge.sparkMat.size = 0.04 + crackle * 0.03
      } else if (warning) {
        surge.glowMat.color.setHex(0x67e8f9)
        surge.hazeMat.color.setHex(0x38bdf8)
        surge.panelMat.emissive.setHex(0x22d3ee)
        surge.light.color.setHex(0x67e8f9)
        surge.panelLight.color.setHex(0xa5f3fc)
        surge.sparkMat.color.setHex(0xb8ecff)
        surge.coreMat.opacity = 0.4 + pulse * 0.45
        surge.glowMat.opacity = 0.2 + pulse * 0.32
        surge.hazeMat.opacity = 0.03 + pulse * 0.05
        surge.panelMat.emissiveIntensity = 0.9 + pulse * 1.4
        surge.light.intensity = 1.5 + pulse * 2.6
        surge.panelLight.intensity = 1.2 + pulse * 2.0
        surge.sparkMat.opacity = 0.25 + pulse * 0.45
        surge.sparkMat.size = 0.035
      } else {
        surge.glowMat.color.setHex(0x67e8f9)
        surge.panelMat.emissive.setHex(0x6366f1)
        surge.light.color.setHex(0xa78bfa)
        surge.panelLight.color.setHex(0x67e8f9)
        surge.coreMat.opacity = 0.06 + pulse * 0.05
        surge.glowMat.opacity = 0.03 + pulse * 0.03
        surge.hazeMat.opacity = 0
        surge.panelMat.emissiveIntensity = 0.28
        surge.light.intensity = 0.25
        surge.panelLight.intensity = 0.15
        surge.sparkMat.opacity = 0.04 + pulse * 0.04
        surge.sparkMat.size = 0.03
      }
      if (!dangerous || !playerPos) continue
      const overlapsBody = playerPos.y < 1.67 && playerPos.y + 1.85 > 0.43
      const inSlice = Math.abs(playerPos.z - surge.z) <= SURGE_HIT_HALF_Z
      const inWidth = playerPos.x < 0.78 && playerPos.x > -2.6
      if (overlapsBody && inSlice && inWidth) {
        failSoft('An electrical surge caught you!')
      }
    }
  }

  // Relay spring release follows Ghost's real-time clock, independently of shared modes.
  const doorZ = spans.relay.center - 2.6
  const releasePos = new THREE.Vector3(0, 0.03, doorZ + 4.6)
  const catchZ = doorZ - 1.8
  let relayLatched = false
  let relayOpen = 0
  let blastSlam = 0

  // Vintage teal/brass door leaves — same leaf dims / motion / hits as before.
  // Warm amber warning accents (readable) replace flat industrial red.
  const blastSteel = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.4, emissive: 0x3a2810, emissiveIntensity: 0.14
  })
  const blastPlate = new THREE.MeshStandardMaterial({
    color: 0x3a5c56, metalness: 0.18, roughness: 0.55, emissive: 0x152420, emissiveIntensity: 0.14
  })
  const blastScar = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 0.95, roughness: 0.35
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

  // Low brass/teal operator platform reuses L2's footprint and occupancy height.
  const releasePlatform = new THREE.Group()
  releasePlatform.name = 'relay-emergency-platform'
  releasePlatform.position.copy(releasePos)
  blastBox(releasePlatform, 1.22, 0.04, 1.22, blastSteel, 0, -0.02, 0)
  const releaseDeck = blastBox(releasePlatform, 1.08, 0.02, 1.08, blastPlate, 0, 0, 0)
  for (const x of [-0.46, 0.46]) {
    blastBox(releasePlatform, 0.06, 0.025, 0.9, blastScar, x, 0.02, 0)
    for (const y of [0.01, 0.04, 0.07]) {
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12), blastSteel)
      spring.rotation.x = Math.PI / 2
      spring.position.set(x * 1.4, y, 0)
      releasePlatform.add(spring)
    }
  }
  root.add(releasePlatform)
  const releaseLinkage = blastBox(blastDoors, 0.045, 0.045, 4.6, blastSteel, -0.69, 0.04, doorZ + 2.3)
  unregisters.push(timeSystem.registerGhostPad(releasePos, 0.56))

  const manualCatch = new THREE.Group()
  manualCatch.name = 'relay-manual-catch'
  manualCatch.position.set(0.8, 1.05, catchZ)
  blastBox(manualCatch, 0.38, 0.48, 0.22, blastPlate, 0, 0, 0)
  const catchHandle = blastBox(manualCatch, 0.3, 0.07, 0.12, blastSteel, 0, 0.12, 0.18)
  root.add(manualCatch)
  const relayFeedback = createRelayFeedback({ doors: blastDoors, linkage: releaseLinkage,
    doorZ, catchZ, brass: blastSteel })
  let relayHeld = false
  let relayEchoRemaining = 0
  const blastObstacles = [
    { minX: -INTERIOR_HALF_WIDTH, maxX: -1.1, minZ: doorZ - 0.48, maxZ: doorZ + 0.48 },
    { minX: 1.1, maxX: INTERIOR_HALF_WIDTH, minZ: doorZ - 0.48, maxZ: doorZ + 0.48 },
    { minX: 0, maxX: 0, minZ: doorZ - 0.18, maxZ: doorZ + 0.18 },
    { minX: 0, maxX: 0, minZ: doorZ - 0.18, maxZ: doorZ + 0.18 }
  ]

  function applyRelay() {
    const close = 1 - relayOpen
    blastLeft.position.x = -1.85 + 1.1 * close
    blastRight.position.x = 1.85 - 1.1 * close
    for (const [i, leaf] of [blastLeft, blastRight].entries()) {
      Object.assign(blastObstacles[i + 2], {
        minX: leaf.position.x - 0.75, maxX: leaf.position.x + 0.75
      })
    }
    for (const ram of blastRams) ram.mesh.position.x = ram.side * (1.55 - close * 0.35)
    catchHandle.rotation.z = relayLatched ? -0.8 : 0
    relayFeedback.update(relayHeld, relayEchoRemaining, relayLatched)
    blastLampMat.emissive.setHex(relayLatched ? 0x55ff99 : relayOpen > 0.9 ? 0x22d3ee : 0xffb060)
    blastLampMat.emissiveIntensity = relayLatched ? 1.2 : 0.5 + relayOpen
    blastLight.intensity = 0.6 + relayOpen * 1.2
    blastFillL.intensity = blastFillR.intensity = 0.3
    // Temporal scar breath — visual only; open-hold timing untouched.
    blastScar.emissiveIntensity = 0.75 + relayOpen * 0.55 + (relayLatched ? 0.35 : 0)
  }

  unregisters.push(interaction.register(manualCatch, {
    prompt: 'Latch emergency fire door open',
    range: 1.6,
    isEligible: () => !relayLatched && player.mesh.position.z < doorZ - 0.55 &&
      Math.abs(player.mesh.position.y) < 0.25,
    onInteract() {
      if (relayLatched || player.mesh.position.z >= doorZ - 0.55 ||
          Math.abs(player.mesh.position.y) >= 0.25 ||
          Math.hypot(player.mesh.position.x - 0.8, player.mesh.position.z - catchZ) > 1.6) return
      // The manual catch can recover an expired echo after the player crosses.
      relayLatched = true
      relayOpen = 1
      applyRelay()
      lastCheckpointZ = Math.min(lastCheckpointZ, catchZ)
      respawn.setCheckpoint(new THREE.Vector3(0, 0, catchZ), Math.PI, {
        restore: captureCheckpointRestore(catchZ)
      })
      hud.showToast('FIRE DOOR LATCHED - passage secured. Checkpoint saved.', 3000)
    }
  }))

  function updateBlastDoors(dt, playerPos) {
    const playerOnRelease = Math.abs(playerPos.y - releasePos.y) < 0.25 &&
      Math.abs(playerPos.x - releasePos.x) < 0.56 && Math.abs(playerPos.z - releasePos.z) < 0.56
    const ghost = timeSystem.getGhost()
    const echoOnRelease = ghost.isOccupying(releasePos, 0.56)
    const held = playerOnRelease || echoOnRelease
    relayHeld = held
    relayEchoRemaining = echoOnRelease && !playerOnRelease ? ghost.getRemainingSeconds() : 0
    const target = relayLatched || held ? 1 : 0
    // A closing door waits at its current pose while a body clears the seam.
    // It never opens a shut door merely because someone approaches it.
    const inSeam = Math.abs(playerPos.z - doorZ) < 0.55
    if (target || !inSeam) {
      relayOpen = THREE.MathUtils.clamp(relayOpen + (target ? dt / 0.4 : -dt / 0.45), 0, 1)
    }
    releaseDeck.position.y = held ? -0.015 : 0
    applyRelay()
  }
  applyRelay()

  const checkpointZs = [
    spans.convergence.center + 11,
    spans.convergence.center - 3,
    spans.convergence.minZ + 3,
    spans.mechanical.maxZ - 2.5,
    spans.mechanical.center + 2.7,
    spans.mechanical.center - 2,
    spans.cargo.maxZ - 1.5,
    spans.cargo.center - 4.2,
    spans.cargo.minZ + 1.5,
    spans.relay.maxZ - 1.5,
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
      new RoundedBoxGeometry(RAM_HEAD_WIDTH, RAM_HEAD_HEIGHT, RAM_HEAD_DEPTH, 1, 0.035),
      trunkWoodMat
    )
    body.castShadow = true
    head.add(body)
    // Worn leather lid band across the top third.
    const lid = new THREE.Mesh(
      new RoundedBoxGeometry(RAM_HEAD_WIDTH + 0.02, RAM_HEAD_HEIGHT * 0.28, RAM_HEAD_DEPTH + 0.02, 1, 0.025),
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

  // Leave protected switching floor between the first bank and the shutter.
  for (const [dz, phase] of [[7, 0], [-6, 2.1], [-10, 4.2]]) {
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

  // Mechanical identity: warmer aisle fills + cooler storm accent at the breach.
  // Same light count — no new PointLights.
  for (const [dz, intensity] of [[6, 5.8], [0, 7.4], [-6, 5.8]]) {
    const mechFill = new THREE.PointLight(0xffb888, intensity, 11, 2)
    mechFill.position.set(0, 2.6, spans.mechanical.center + dz)
    mechFill.userData.noCameraCollision = true
    root.add(mechFill)
  }
  const mechAccent = new THREE.PointLight(0x7dd3fc, 4.4, 9, 2)
  mechAccent.position.set(-2.25, 2.6, spans.mechanical.center + 3.4)
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

  const connector = createWreckConnector({ root, spans, player, timeSystem, unregisters,
    warn() {
      wreckAudio.snap()
      hud.showToast(`Connector hinges are buckling. Cross now, or retreat and ${bindingLabel(settings.getBinding('rewind'))} repair, then ${bindingLabel(settings.getBinding('freeze'))} hold the flat deck.`, 5000)
    }
  })
  const spatial = createWreckSpatial({ root, spans, player, obstacles: blastObstacles })
  // N4's intact Convergence floor support must stop at the new real lip.
  spatial.supports.find(s => s.minZ === spans.convergence.minZ).minZ = connector.gap.maxZ
  const wreckRoutes = createWreckRoutes({ root, spans, player, timeSystem, unregisters, obstacles: blastObstacles })

  // ============================================================
  // CARGO — TIME-LOOP CAR: a scripted open/close/fall/rewind cycle
  // ============================================================
  const LOOP_PERIOD = 9
  const loopDoorZ = spans.cargo.center + 2
  const loopBeamZ = spans.cargo.center - 2
  const cargoGap = cargoGangwayLayout(spans.cargo.center, WRECK_WALL_X)
  cutCargoGangwayFloor(root.getObjectByName('floor-cargo'), spans.cargo, cargoGap)
  const cargoEdges = []
  carriages.cargo.traverse(node => { if (node.name === 'cargo-floor-edge') cargoEdges.push(node) })
  for (const strip of cargoEdges) {
    for (const [a,b] of [[spans.cargo.minZ+1,cargoGap.minZ],[cargoGap.maxZ,spans.cargo.maxZ-1]]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.02,b-a),strip.material)
      piece.name = strip.name; piece.userData.noCameraCollision = true
      piece.position.set(strip.position.x,strip.position.y,(a+b)/2-spans.cargo.center)
      carriages.cargo.add(piece)
    }
    strip.removeFromParent(); strip.geometry.dispose()
  }

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
  const loopBody = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.32, 0.32, 1, 0.025), loopTrunkWood)
  loopBody.castShadow = true
  loopBeam.add(loopBody)
  const loopLid = new THREE.Mesh(new RoundedBoxGeometry(2.62, 0.1, 0.34, 1, 0.018), loopTrunkLeather)
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
    color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 3.1, roughness: 0.28
  })
  const loopRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 10, 24), loopRingMat)
  loopRing.rotation.y = Math.PI / 2
  addProp(loopRing, loopDoorZ + 1.4, -(INTERIOR_HALF_WIDTH - 0.14), 1.7)
  // Thin halo keeps the phase ring readable against warm cargo fills.
  const loopRingHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.018, 8, 24),
    new THREE.MeshBasicMaterial({
      color: 0x10b981, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  )
  loopRingHalo.rotation.y = Math.PI / 2
  addProp(loopRingHalo, loopDoorZ + 1.4, -(INTERIOR_HALF_WIDTH - 0.14), 1.7)
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
    loopBeam.position.y = 2.25 - loopBeamDown * 2.07
    loopRingMat.color.setHex(colour)
    loopRingMat.emissive.setHex(colour)
    loopRingHalo.material.color.setHex(colour)
    loopRingLight.color.setHex(colour)
    // Soft pulse — same phase colours, stronger read (no timing change).
    const breath = 0.85 + 0.15 * Math.sin(loopT * 5.5)
    loopRingMat.emissiveIntensity = 3.1 * breath
    loopRingHalo.material.opacity = 0.22 + 0.2 * breath
    loopRingLight.intensity = 6.2 + 1.4 * breath
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
  const securityCrossing = createSecurityCrossing({ root, carriage: carriages.security,
    span: spans.security, halfWidth: WRECK_WALL_X })
  const { minZ: gapMinZ, maxZ: gapMaxZ } = securityCrossing.layout
  const slabMat = securityCrossing.material
  const slabSupports = [...spatial.supports, ...connector.supports, ...cargoGangway.supports]
  const gapVoids = [connector.gap, cargoGap, ...securityCrossing.layout.holes]
  let slabSettle = 0
  unregisters.push(timeSystem.register(securityCrossing.group, {
    onUpdate: dt => securityCrossing.stepClock(dt),
    getSnapshot: securityCrossing.snapshot,
    restoreSnapshot: securityCrossing.restore
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
  const collapseMaxZ = spans.passenger.center + 1.4
  const collapseMinZ = spans.passenger.center - 3
  const collapseTriggerZ = collapseMaxZ + 2.0
  const collapseVoid = { minX: -WRECK_WALL_X, maxX: WRECK_WALL_X, minZ: collapseMinZ, maxZ: collapseMaxZ }

  cutCargoGangwayFloor(root.getObjectByName('floor-passenger'), spans.passenger, collapseVoid)
  // Split decorative runners too; none may conceal the opening.
  const passengerStrips = []
  carriages.passenger.traverse(n => { if (['passenger-floor-edge', 'passenger-floor-cyan'].includes(n.name)) passengerStrips.push(n) })
  for (const strip of passengerStrips) {
    for (const [a, b] of [[spans.passenger.minZ + 1.2, collapseMinZ], [collapseMaxZ, spans.passenger.maxZ - 1.2]]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(strip.geometry.parameters.width, strip.geometry.parameters.height, b - a), strip.material)
      piece.position.set(strip.position.x, strip.position.y, (a + b) / 2 - spans.passenger.center)
      piece.name = strip.name; carriages.passenger.add(piece)
    }
    strip.removeFromParent(); strip.geometry.dispose()
  }

  // Purple temporal well under the collapse gap (visual only — void logic unchanged).
  const collapsePit = new THREE.Mesh(
    new THREE.BoxGeometry(INTERIOR_HALF_WIDTH * 2 - 0.28, 3.5, collapseMaxZ - collapseMinZ),
    new THREE.MeshStandardMaterial({
      color: 0x1a0a28, roughness: 1, metalness: 0,
      emissive: 0x7c3aed, emissiveIntensity: 0.55
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
    color: 0x1a0a28, emissive: 0xc084fc, emissiveIntensity: 0.9, roughness: 0.35
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

  // Violet chrono field — distinct from Security's ice-cyan freeze tiles.
  const collapseChronoMat = createChronoFieldMaterial({
    baseColor: 0x3a2438, glowColor: 0xa855f7, opacity: 0.9, doubleSided: true
  })
  const collapseBrass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, metalness: 0.88, roughness: 0.42, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const collapseWood = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, metalness: 0.06, roughness: 0.58, emissive: 0x1a1008, emissiveIntensity: 0.1
  })
  const collapseCyan = new THREE.MeshStandardMaterial({
    color: 0x1a0a28, emissive: 0xc084fc, emissiveIntensity: 0.85, roughness: 0.35
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

  const COLLAPSE_PAD_X = 0
  const COLLAPSE_PAD_Z = 0
  const collapsePieces = [
    {
      mesh: makeCollapseDeck(),
      restX: 0, restY: 0.05, restZ: collapseMaxZ - 0.74,
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
      restX: 0, restY: 0.05, restZ: collapseMinZ + 0.74,
      hx: 1.34 / 2, hy: 0.09 / 2, hz: 1.5 / 2,
      phase: 2.5, spin: 0.7
    }
  ]
  for (const p of collapsePieces) {
    // Flat wood caps give collision an exact, visible top across each piece.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(p.hx * 2, 0.03, p.hz * 2), collapseWood)
    cap.name = 'passenger-support-top'
    cap.position.y = 0.165
    p.mesh.add(cap)
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
      color: 0x1a0a28, emissive: 0xa855f7, emissiveIntensity: 0.75, roughness: 0.4
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

  const collapseGlow = new THREE.PointLight(0xc084fc, 0, 8, 2)
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
    collapsePit.visible = false
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
  let passengerDebris = null

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
    c.whooshPlayed = false
    passengerDebris?.reset(c.mesh)
    const s = ++chunkSeed
    c.x = skew(s + 11) * (INTERIOR_HALF_WIDTH * 0.78)
    c.y = 0.5 + Math.abs(skew(s + 3)) * 1.5
    c.z = spans.passenger.minZ - 4
    c.vx = skew(s + 5) * 0.9
    c.vy = 0.3 + Math.abs(skew(s + 7)) * 1.4
    c.vz = 7 + Math.abs(skew(s + 9)) * 6
    c.life = 4.0
    c.mesh.visible = true
    c.mesh.position.set(c.x, c.y, c.z)
    c.mesh.quaternion.identity()
    c.mesh.scale.setScalar(0)
    if (!c.body) return
    c.body.position.set(c.x, c.y, c.z)
    c.body.velocity.set(c.vx, c.vy, c.vz)
    c.body.angularVelocity.set(3.1, 2.2, skew(s + 13) * 2)
    c.body.quaternion.set(0, 0, 0, 1)
    c.body.wakeUp()
  }
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(chunkGeos[i % 3], chunkMats[i % 3])
    mesh.name = i % 3 === 1 ? 'passenger-debris-splinter' : 'passenger-debris-panel'
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
    mesh.name = 'passenger-debris-luggage'
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

  passengerDebris = createDebrisCollision(player, [
    ...chunks.filter((_, i) => i % 3 !== 1).map(c => c.mesh),
    ...burstDebris.map(c => c.mesh)
  ])

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
      if (braking || brakeComplete) scaledDelta *= brakeMotionScale()
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
          c.mesh.scale.setScalar(THREE.MathUtils.clamp(Math.min(
            (c.z - spans.passenger.minZ + 4) / 4,
            (spans.passenger.maxZ + 4 - c.z) / 4), 0, 1))
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
      c.whooshPlayed = false
      passengerDebris.reset(c.mesh)
      c.mesh.visible = true
      c.body.wakeUp()
      // Leave the rack's required right-hand lane clear of the initial volley.
      c.body.position.set(1.6 + i * 0.12, 1.45 + i * 0.2, FAIL_BURST_Z + 0.15 - i * 0.4)
      c.body.velocity.set(0.55 + i * 0.2, 3.2, 1.6 + i * 0.4)
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
  // PURSUING TIME WAVE — full escape, then the final sprint and brake
  // ============================================================
  const waveMat = createChronoFieldMaterial({
    baseColor: 0x2a0a3a, glowColor: 0xa855f7, opacity: 0.6, doubleSided: true, depthWrite: false
  })
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(INTERIOR_HALF_WIDTH * 2, CARRIAGE_CEILING_Y), waveMat)
  wave.name = 'time-wave'
  wave.position.y = CARRIAGE_CEILING_Y / 2
  wave.rotation.y = Math.PI // Face the escape route so Fresnel leaves the purple bands visible.
  // Keep the follow camera on the player's side of the visible field.
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

  const DEPLETE_Z = spans.passenger.maxZ - 1.8
  const WAVE_SPEED = 5 // below the actual 6.8 m/s sprint
  const PURSUIT_SPEED = 4.4
  const FIRST_CARRIAGE_SPEED = 3.6
  const SECOND_CARRIAGE_SPEED = 4
  const WAVE_LEAD = 12
  // Start inside the Vault, just beyond the default third-person camera.
  const PUZZLE_WAVE_LEAD = 5.5
  const initialZ = ['convergence', 'mechanical', 'cargo', 'relay', 'security', 'passenger'].includes(startCarriage)
    ? spans[startCarriage].maxZ - (startCarriage === 'mechanical' ? 2.5 : 1.5) : spans.vault.center + 3
  const sprintObjective = () => `Sprint to the locomotive (${bindingLabel(settings.getBinding('run'))}) — pull the emergency brake!`

  let depleted = false
  let waveZ = initialZ + PUZZLE_WAVE_LEAD
  wave.position.z = waveZ
  waveLight.position.z = waveZ
  waveLight.intensity = 12
  let braking = false
  let brakeComplete = false
  let disposed = false
  let brakeT = 0
  unregisters.push(timeSystem.register(wave, {
    onUpdate(scaledDelta) {
      if (depleted || braking || brakeComplete || respawn.isFailing()) return
      let speed = PURSUIT_SPEED
      if (player.mesh.position.z >= spans.vault.minZ) speed = FIRST_CARRIAGE_SPEED
      else if (player.mesh.position.z >= spans.convergence.minZ) speed = SECOND_CARRIAGE_SPEED
      waveZ -= speed * scaledDelta
    },
    getSnapshot: () => ({ waveZ }),
    restoreSnapshot(s) {
      if (!depleted && !braking && !brakeComplete && !respawn.isFailing()) waveZ = s.waveZ
    }
  }))
  function brakeMotionScale() {
    return brakeComplete ? 0 : braking ? Math.max(0, 1 - brakeT / BRAKE_HANDOFF_SECONDS) : 1
  }
  let brakeVeil = null
  function removeBrakeVeil() { brakeVeil?.remove(); brakeVeil = null }

  const bridge = new THREE.Group()
  bridge.name = 'broken-bridge-ahead'
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x796b53, roughness: 0.8 })
  for (const [a, b] of [[spans.cab.minZ - 5, spans.cab.minZ + 5], [spans.cab.minZ - 35, spans.cab.minZ - 20]]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.6, b - a), bridgeMat)
    deck.position.set(0, -0.7, (a + b) / 2); bridge.add(deck)
    for (const x of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, b - a), bridgeMat)
      rail.position.set(x, -0.33, (a + b) / 2); bridge.add(rail)
    }
  }
  root.add(bridge)
  // Exterior locomotive silhouette for the stop reveal, ahead of the existing cab.
  const locomotive = new THREE.Group()
  locomotive.name = 'finale-locomotive'
  const engineMetal = new THREE.MeshStandardMaterial({ color: 0x24413e, metalness: 0.65, roughness: 0.4 })
  const engineBrass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.85, roughness: 0.35 })
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.4, 20), engineMetal)
  boiler.rotation.x = Math.PI / 2
  boiler.position.set(0, 0.9, spans.cab.minZ - 1.7); locomotive.add(boiler)
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 1.0, 12), engineBrass)
  chimney.position.set(0, 2.2, spans.cab.minZ - 2.7); locomotive.add(chimney)
  for (const z of [spans.cab.minZ - 0.6, spans.cab.minZ - 2.6]) {
    for (const x of [-1.05, 1.05]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.14, 16), engineBrass)
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0, z); locomotive.add(wheel)
    }
  }
  root.add(locomotive)

  const brake = createEmergencyBrake()
  addProp(brake, spans.cab.center - 1.5)
  addPassengerGuidance(root, spans.passenger.center, collapseBrass)
  const trackWarning = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.26), signMaterial({
    text: 'TRACK OUT / BRAKE', emissiveIntensity: 0.25
  }))
  trackWarning.name = 'cab-broken-track-warning'
  trackWarning.position.set(0, 2.35, spans.cab.minZ + 0.5)
  trackWarning.userData.noCameraCollision = true
  root.add(trackWarning)

  unregisters.push(interaction.register(brake, {
    prompt: 'Pull the emergency brake',
    onInteract: () => {
      if (disposed || braking || brakeComplete || !depleted || Math.abs(player.mesh.position.z - brake.position.z) > 2.5) return
      braking = true
      wreckAudio.brake()
      timeSystem.setMode('NORMAL')
      timeSystem.resetGhost()
      beginCinematic?.()
      // The run is over — hand the full kit back before the next level.
      timeSystem.setAbilityAvailability({})
      interaction.flashPrompt('The Chrono Express grinds to a halt…', 3000)
      hud.setObjective('The train stops on the bridge. You made it.')
      brakeVeil = document.createElement('div')
      Object.assign(brakeVeil.style, { position: 'fixed', inset: '0', background: '#000',
        zIndex: '60', opacity: '0', pointerEvents: 'none' })
      document.body.appendChild(brakeVeil)
      hud.showCinematicSkip?.(finishBraking)
    }
  }))

  function finishBraking() {
    if (disposed || !braking || brakeComplete) return
    brakeComplete = true
    feedback.stop()
    braking = false
    wreckAudio.reset()
    levelThreeSfx.reset()
    hazardAudio.reset()
    hud.hideCinematicSkip?.()
    root.rotation.z = 0
    root.position.set(0, 0, 0)
    advance()
  }

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

  // L3 keeps 12 points (Level 2 uses 8); any reduction needs rendered profiling.
  // Built only after every L3 PointLight
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
  let atmosphereT = 0

  const passengerRack = createPassengerRack({ root, span: spans.passenger, player, timeSystem, unregisters, obstacles: blastObstacles,
    warn: () => {
      wreckAudio.warning()
      showLevelToast('Rack bolts snapping! Keep RIGHT of the rack, LEFT of the broad seat, then CENTRE for the floor crossing.', 3200)
    } })

  const expansionHazards = createExpansionHazards({ root, spans, player, timeSystem, unregisters,
    fail: message => failSoft(message), audio: hazardAudio,
    warn: kind => {
      wreckAudio.warning()
      if (kind === 'freight') showLevelToast(`Freight straps creaking! Wait for the case to swing aside; ${bindingLabel(settings.getBinding('slow'))} Slow or ${bindingLabel(settings.getBinding('freeze'))} Freeze can hold a clear route.`, 4500)
    } })

  const flyingPanels = createFlyingPanels({ root, spans, player, timeSystem, unregisters,
    onLethalFlight: (distance, speed) => levelThreeSfx.lethalFlight(distance, speed),
    warn: stage => {
      wreckAudio.warning()
      showLevelToast(`Loose roof panels! ${stage.endsWith('right') ? 'RIGHT' : 'LEFT'} lane open. Flat brass arm = recovery. Observe behind the floor bar; frozen panels still kill.`, 2400)
    },
    fail: message => failSoft(message, 'debris'), seed: debrisSeed })

  const feedback = createWreckFeedback({ root, spans, player, timeSystem, unregisters,
    cue: kind => wreckAudio.debris(kind),
    playbackScale: brakeMotionScale
  })

  const retiredVisuals = [ramBank,cargoTracks,cargoLanding,cargoGangway.group,loopDoor,loopBeam,
    loopRing,loopRingHalo,loopRingLight,securityCrossing.group,walkwayGlow,
    root.getObjectByName('cargo-burst-signals'),
    blastDoors,releasePlatform,manualCatch,slamSparks.points,expansionHazards.group,
    ...electricalSurges.map(s=>s.group),...runawayCarts.map(c=>c.group),
    debrisGroup,debrisLaunchLight,debrisSafePad,...debrisTrails,
    ...spatial.groups.filter(g=>!g.name.startsWith('passenger')),
    // These two cars have no detachment choreography. Retire them at the
    // established rear cutoff rather than inventing two more moving wrecks.
    carriages.convergence,carriages.relay]
  for (const name of ['vault-security-gate','vault-safe-observation','convergence-route-fork',
    'convergence-rewind-shutter','mechanical-rewind-shutter',
    'convergence-background-vignette','cargo-background-vignette','vault-suspended-valuables'])
    root.traverse(node=>{if(node.name===name)retiredVisuals.push(node)})
  root.getObjectByName('wreck-flying-panels')?.children.forEach(node=>{
    if (!/^(passenger|cab)-/.test(node.name)) retiredVisuals.push(node)
  })
  root.getObjectByName('grab-handles')?.children.forEach(node=>{
    if (node.userData.wreckCar !== 'passenger') retiredVisuals.push(node)
  })
  // Unnamed root fills have world-space Z, unlike carriage-owned practicals.
  root.children.forEach(node=>{
    if (node.isPointLight && !node.userData.lightPoolSlot && node.position.z > spans.passenger.maxZ &&
      !/wave|stasis|fracture/i.test(node.name)) retiredVisuals.push(node)
  })
  const retiredWreck = createWreckRetirement(retiredVisuals)

  // Capture the collapse at each checkpoint, then restore moving hazards to a
  // predictable phase. Every checkpoint also puts the pursuing wave far
  // enough behind the player for repeated deaths to remain recoverable.
  function captureCheckpointRestore(checkpointZ) {
    const saved = {
      feedback: feedback.capture(),
      depleted,
      relayLatched,
      breakupT,
      retired: retiredWreck.active,
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
      retiredWreck.apply(false)
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

      relayLatched = saved.relayLatched
      relayOpen = relayLatched ? 1 : 0
      relayHeld = false
      relayEchoRemaining = 0
      releaseDeck.position.y = 0
      applyRelay()
      wreckRoutes.reset()
      passengerRack.reset()
      failBurstArmed = true
      failBurstT = -1
      failBurstSettled = false
      applyFailBurst()
      vaultGateT = 0
      updateVaultGates(0, null)
      debrisClock = 0
      applyFlyingDebris()
      surgeT = 0
      updateElectricalSurges(0, null)
      cartClock = 0
      applyRunawayCarts()
      ramT = 0

      applyRams()
      loopT = 0
      applyLoop()
      connector.reset()
      cargoGangway.state.reset()
      cargoGangway.apply()
      securityCrossing.reset()
      slabSettle = 0
      slabSupports.length = 0
      slabSupports.push(...spatial.supports, ...connector.supports, ...cargoGangway.supports, ...securityCrossing.supports)
      collapseArmed = saved.collapseArmed
      collapseLive = saved.collapseLive
      collapseFallT = 0
      collapseFloorT = saved.collapseLive ? 1.15 : 0
      collapseSettle = 0
      setCollapseVoid(collapseLive)
      applyCollapseMotion()
      env.restorePassengerLights?.(collapseLive)
      collapseHintHoldUntil = -1
      pendingToast = null
      hintsShown.clear()
      hud.setObjective(depleted ? sprintObjective() : LEVEL_OBJECTIVE)
      fractureArmed = saved.fractureArmed
      fractureT = saved.fractureT
      applyVaultFracture(0)
      fracturePulse.visible = false
      fractureFill.intensity = 0
      fractureMat.customUniforms.uOpacity.value = 0
      failCooldown = 0
      braking = false
      wreckAudio.reset()
      levelThreeSfx.reset()
      hazardAudio.reset()
      expansionHazards.reset()
      flyingPanels.reset()
      feedback.restore(saved.feedback)
      brakeComplete = false
      hud.hideCinematicSkip?.()
      brakeT = 0
      removeBrakeVeil()
      carriageShake.reset()
      atmosphereT = 0
      stormDebris.reset()
      lampMotion.reset()
      grabHandles.reset()
      chunkGroup.visible = breakupT >= 0
      chunkSeed = 0
      chunks.forEach((chunk, i) => {
        respawnChunk(chunk)
        chunk.life = 0.4 * i
        chunk.body.velocity.set(0, 0, 0)
        chunk.body.angularVelocity.set(0, 0, 0)
        chunk.body.sleep()
        chunk.mesh.position.copy(chunk.body.position)
        chunk.mesh.quaternion.copy(chunk.body.quaternion)
      })
      passengerDebris.reset()

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

      waveZ = checkpointZ + (depleted ? WAVE_LEAD : PUZZLE_WAVE_LEAD)
      wave.position.z = waveZ
      wave.scale.set(1, 1, 1)
      wave.visible = true
      waveLight.position.z = waveZ
      waveLight.intensity = 12
      retiredWreck.apply(saved.retired)
    }
  }

  const visibility = createWreckVisibility({ root, carriages, spans,
    wallX: WRECK_WALL_X, ceilingY: CARRIAGE_CEILING_Y,
    enabled: () => !disposed && !braking })
  const removeVisibility = installWreckVisibility(scene, visibility)
  return {
    getVisibilityStats: visibility.getStats,
    objective: LEVEL_OBJECTIVE,
    checkpoint: {
      position: new THREE.Vector3(0, 0, initialZ),
      yaw: Math.PI,
      restore: captureCheckpointRestore(initialZ)
    },
    bounds,
    obstacles: blastObstacles,
    supports: slabSupports,
    voids: gapVoids,
    getCarriageVolumes: () => listCarriageVolumes(spans).filter(v =>
      v.minZ < bounds.maxZ && carriages[v.key].visible),
    get isCinematic() { return braking },
    setPresentationPaused(value) { wreckAudio.setPaused(value); hazardAudio.setPaused(value); levelThreeSfx.setPaused(value); feedback.setPaused(value) },

    update(delta) {
      // Recover temporary render visibility even if a prior render was aborted.
      visibility.afterRender()
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
      // Integrate the one-second linear deceleration exactly across frame boundaries.
      const stopStart = Math.min(BRAKE_HANDOFF_SECONDS, brakeT)
      const stopEnd = Math.min(BRAKE_HANDOFF_SECONDS, brakeT + delta)
      const brakeDelta = (stopEnd - stopStart) * (1 - (stopStart + stopEnd) / (2 * BRAKE_HANDOFF_SECONDS))
      const envDt = brakeComplete ? 0 : braking ? brakeDelta : motionScale * delta
      atmosphereT += envDt
      // Visual storm ramp Vault→Cab; Freeze / brake still zero or ease as before.
      const stormProgress = stormProgressAlongTrain(player.mesh.position.z, spans)
      const exteriorScale = brakeComplete ? 0 : braking
        ? delta > 0 ? brakeDelta / delta : brakeMotionScale()
        : mode === 'FREEZE' ? 0
          : resumeBoost * (mode === 'SLOW' ? 0.2 : 1) *
            (1 + stormProgress * STORM_PROGRESS.exteriorSpeedBoost)
      levelThreeSfx.update({
        laserDistance: Math.min(...vaultGates.map(g => Math.abs(player.mesh.position.z - g.z))),
        moving: !braking && !brakeComplete,
        frozen: mode === 'FREEZE', stopped: brakeComplete
      })
      wreckAudio.update(!brakeComplete, finaleFreeze, braking ? brakeT : null)
      let exposure = 0.18
      for (const {span,damage} of damageSpans) {
        const localZ = player.mesh.position.z-span.center
        if (localZ>damage.minZ && localZ<damage.maxZ) { exposure=1; break }
      }
      wreckAudio.exposure(brakeComplete ? 0 : exposure, mode === 'FREEZE')
      outdoorEnv.update(envDt)
      stormSky.update(envDt)
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
            ? sprintObjective()
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

      wreckRoutes.update()
      passengerRack.update()
      expansionHazards.update(!braking && !respawn.isFailing())
      connector.update(!braking && !respawn.isFailing())
      feedback.update(!braking && !brakeComplete && !respawn.isFailing())
      flyingPanels.update(!braking && !brakeComplete && !respawn.isFailing())
      // Only collision-enabled passenger pieces get the flight sample. The
      // small splinter meshes are decorative, never dangerous.
      if (!braking && !brakeComplete && mode !== 'REWIND') {
        for (const c of [...chunks.filter((_, i) => i % 3 !== 1), ...burstDebris]) {
          if (!c.mesh.visible || c.whooshPlayed || !c.body) continue
          const velocity = c.body.velocity
          const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
          const distance = c.mesh.position.distanceTo(pp)
          if (speed > 2 && distance < 8) {
            c.whooshPlayed = true
            levelThreeSfx.lethalFlight(distance, speed)
          }
        }
      }
      if (passengerDebris.update(!braking && !brakeComplete && !respawn.isFailing())) {
        failSoft('Struck by flying wreckage! Dodge the large panels and luggage, or Slow/Freeze them before crossing.', 'debris')
      }
      if (pp.z > connector.gap.minZ && pp.z < connector.gap.maxZ && pp.y < -0.65) {
        failSoft('The connector folded. Rewind from solid floor, then Freeze its flat hinges.', 'fell')
      }
      if (vaultActive && !braking) updateVaultGates(envDt, pp)
      if (vaultActive && !braking && !respawn.isFailing()) updateFlyingDebris(pp)
      if (surgeActive) updateElectricalSurges(envDt, pp)
      if (!braking && !respawn.isFailing()) updateRunawayCart(pp)
      if (blastActive) updateBlastDoors(delta, pp)
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
      waveMat.customUniforms.uTime.value += depleted ? (finaleFreeze ? 0 : delta) : envDt
      waveMat.customUniforms.uMode.value = mode === 'FREEZE' ? 2 : 3
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
        if (resumeWarm > 0.08) {
          scene.fog.color.set(0x241814)
        } else {
          // Subtle violet fog deepen toward the Cab (readability preserved).
          scene.fog.color.lerpColors(FOG_COOL, FOG_STORM, stormProgress * 0.55)
        }
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

      sky.uHorizonColor.value.copy(scene.fog.color)
      sky.uGrade.value = finaleFreeze ? 0.8 : 0
      outdoorEnv.setFog({color:scene.fog.color,near:scene.fog.near,far:scene.fog.far})

      // The Ending owns the exterior stop; retain only the lever and hand-off.
      retiredWreck.apply(retiredWreck.active)
      if (braking) {
        brakeT += delta
        lever.rotation.x = -0.4 + Math.min(1, brakeT / 0.4) * 1.1
        brakeVeil.style.opacity = String(THREE.MathUtils.clamp((brakeT - BRAKE_HANDOFF_SECONDS) / BRAKE_FADE_SECONDS, 0, 1))
        if (brakeT >= BRAKE_HANDOFF_SECONDS + BRAKE_FADE_SECONDS - 1e-9) {
          finishBraking()
        }
        lightPool.update(pp, delta)
        return
      }

      // --- Atmosphere: shake / debris / handles (each independently toggled) ---
      const unrest = 1 + Math.min(1.5, Math.abs(atmosphereT) * 0.02) + (breakupT >= 0 ? 1.2 : 0) +
        stormProgress * STORM_PROGRESS.progressUnrest
      const slamKick = blastSlam
      const shook = carriageShake.update(envDt, {
        elapsed: atmosphereT,
        unrest,
        slamKick,
        frozen: finaleFreeze
      })
      if (!shook && !finaleFreeze) {
        // Shake disabled: keep the train visually still (door slam feedback only).
        root.rotation.z = Math.sin(atmosphereT * 18) * 0.012 * slamKick * slamKick
        root.position.y = Math.sin(atmosphereT * 22) * 0.01 * slamKick * slamKick
        root.position.x = Math.sin(atmosphereT * 16) * 0.006 * slamKick * slamKick
      }
      stormDebris.update(envDt, { elapsed: atmosphereT, frozen: finaleFreeze, unrest })
      grabHandles.update(envDt, { elapsed: atmosphereT, frozen: finaleFreeze, unrest, slamKick })
      // After shake + env flicker: swing fixtures and gently modulate lamp intensity.
      lampMotion.update(envDt, {
        elapsed: atmosphereT,
        frozen: finaleFreeze,
        unrest,
        shakeX: root.position.x,
        shakeY: root.position.y
      })

      if (!player.isAirborne() && Math.abs(pp.y) < 0.25) {
        const islandZ = spans.security.center
        const onIsland = pp.z > islandZ - 1 && pp.z < islandZ + 1
        const exitZ = gapMinZ - 0.8
        const atExit = pp.z < exitZ && pp.z > spans.security.minZ
        const safeZ = onIsland ? islandZ : atExit ? exitZ : null
        if (safeZ !== null && safeZ < lastCheckpointZ) {
          lastCheckpointZ = safeZ
          respawn.setCheckpoint(new THREE.Vector3(0, 0, safeZ), Math.PI, {
            restore: captureCheckpointRestore(safeZ)
          })
        }
      }

      // --- Rolling checkpoints (descending z) -----------------------------
      for (const z of checkpointZs) {
        const connectorCheckpoint = z === spans.convergence.minZ + 3 || z === spans.mechanical.maxZ - 2.5
        if (connectorCheckpoint && (player.isAirborne() || Math.abs(pp.y) > 0.06)) continue
        if (pp.z < z && z < lastCheckpointZ) {
          lastCheckpointZ = z
          respawn.setCheckpoint(new THREE.Vector3(0, 0, z), Math.PI, {
            restore: captureCheckpointRestore(z)
          })
        }
      }

      hint('brown-panels', pp.z, spans.vault.maxZ,
        `Large brown debris is lethal in EVERY carriage. Watch ahead for a warning flash and oncoming wreckage: sidestep, ${bindingLabel(settings.getBinding('jump'))} jump, or use ${bindingLabel(settings.getBinding('slow'))}/${bindingLabel(settings.getBinding('freeze'))} Slow/Freeze. Touching frozen wreckage still kills.`, 6500)
      hint('vault-lasers', pp.z, spans.vault.center + 0.6,
        `Teal pads are safe to observe. A horizontal green lamp means standing clearance; upright amber means wait. ${bindingLabel(settings.getBinding('slow'))} slows the racks; ${bindingLabel(settings.getBinding('freeze'))} holds their current pose.`, 5500)
      hint('vault-reassess', pp.z, spans.vault.center - 2.7,
        `Reassess the SECOND rack from this pad. Freeze holds dangerous beams too. Wait for its horizontal lamp, or watch clearance while using ${bindingLabel(settings.getBinding('duck'))} to crouch.`, 5000)
      hint('vault-debris', pp.z, spans.vault.center - 5.4,
        `Storm debris ahead: purple flash means wreckage is about to fly across. Wait on the purple-teal pad, then dodge or ${bindingLabel(settings.getBinding('slow'))}/${bindingLabel(settings.getBinding('freeze'))} Slow/Freeze the crossing.`, 5000)
      hint('convergence-threshold', pp.z, spans.convergence.center + 16.5,
        `Broken threshold: ${bindingLabel(settings.getBinding('jump'))} jump the low brass edge. Pass the open right end of the trolley, then choose either aisle.`, 4500)
      hint('convergence-surges', pp.z, spans.convergence.center + 11.5,
        `Choose before the split: brass DIRECT is fast but exposed to surges. Cyan MAINTENANCE is sheltered but slower: ${bindingLabel(settings.getBinding('duck'))} crouch, ${bindingLabel(settings.getBinding('rewind'))} repair the shutter, then ${bindingLabel(settings.getBinding('freeze'))} hold it open.`,
        6000)
      hint('convergence-cart', pp.z, spans.convergence.center - 2.5,
        `Open floor ahead: four runaway service carts cross in every direction. Flashing amber means a fast roll. Sidestep or ${bindingLabel(settings.getBinding('slow'))} Slow to cross.`, 5200)
      hint('mechanical', pp.z, spans.mechanical.center + 9.3,
        `${bindingLabel(settings.getBinding('slow'))} Slow the first luggage bank. Stop inside the teal brackets on solid floor; release time control to recharge. Then ${bindingLabel(settings.getBinding('rewind'))} repair the shutter and ${bindingLabel(settings.getBinding('freeze'))} hold it open. Another bank follows.`, 6500)
      if (pp.z > spans.mechanical.center + 9 && pp.z < spans.mechanical.maxZ) {
        hint('mechanical-steam', pp.z, spans.mechanical.center + 13.2,
          `Steam crossing: upright amber means warning or a live jet. Wait here for the horizontal green bar; ${bindingLabel(settings.getBinding('freeze'))} holds the current state, including dangerous steam. Recharge beyond the pipe before the luggage bank.`, 6000)
      }
      if (Math.abs(pp.x - 1.75) < 0.55 && Math.abs(pp.z - wreckRoutes.recessZ) < 0.8) {
        hint('mechanical-recess', pp.z, Infinity,
          `Safe switching recess: ${bindingLabel(settings.getBinding('duck'))} crouch beneath high flying debris while recharging. ${bindingLabel(settings.getBinding('rewind'))} restores the shutter; switch to ${bindingLabel(settings.getBinding('freeze'))} while it is open.`, 4500)
      }
      hint('cargo', pp.z, spans.cargo.maxZ,
        'Cargo — the gangway is buckling. Its pale frame shows the earlier pose; moving brass rails meet the fixed hinge stops when restored.', 4400)
      hint('cargo-gangway', pp.z, cargoGap.maxZ + 1.3,
        `${bindingLabel(settings.getBinding('rewind'))} restores the gangway: align the brass rails with the fixed stops, then ${bindingLabel(settings.getBinding('freeze'))} hold it. Early Freeze can also save the intact deck. Rest on the landing before the bulkhead.`, 6500)
      hint('cargo-landing', pp.z, cargoGap.minZ - 0.25,
        `Intact landing — recharge here. Green means the bulkhead is open. Watch the trunk drop, then ${bindingLabel(settings.getBinding('jump'))} jump over it on the floor.`, 4800)
      hint('relay-emergency-release', pp.z, releasePos.z + 2,
        `Weight the brass platform to pull the door linkage. Summon ${bindingLabel(settings.getBinding('ghost'))} Ghost: the eight bars drain with its hold. Walk right around the cabinet, return to the centre seam, then ${bindingLabel(settings.getBinding('interact'))} latch the far-side catch; it works even after the echo fades.`, 6500)
      hint('security', pp.z, gapMaxZ + 3,
        `${bindingLabel(settings.getBinding('freeze'))} settles the broad debris decks. Enter on the left, follow brass chevrons to the right, then reach the intact recharge island. Pale outlines alone cannot support you.`, 5500)
      hint('security-island', pp.z, spans.security.center + 0.8,
        `Safe island: release Freeze and recharge; assess the right-hand path. ${bindingLabel(settings.getBinding('freeze'))} settles it. Paired brass bars mark takeoff and landing: ${bindingLabel(settings.getBinding('run'))} + ${bindingLabel(settings.getBinding('jump'))} across the break.`, 6000)
      hint('passenger', pp.z, spans.passenger.maxZ,
        `Keep right of the falling rack, clear of the luggage by the wall. Large wreckage is lethal: ${bindingLabel(settings.getBinding('jump'))} jump low panels. ${bindingLabel(settings.getBinding('freeze'))} holds debris AND the wave; frozen wreckage still kills on contact.`, 6500)
      if (pp.z < collapseMinZ - 0.25 && !braking && !brakeComplete && !hintsShown.has('passenger-exit')) {
        // The floor instruction has served its purpose once the player lands.
        collapseHintHoldUntil = -1
        pendingToast = null
        hud.setObjective(sprintObjective())
        hint('passenger-exit', pp.z, collapseMinZ - 0.25,
          `${bindingLabel(settings.getBinding('duck'))} duck the short brass beam; stand clear of it, then ${bindingLabel(settings.getBinding('jump'))} jump the low wooden rail. Release Freeze on solid floor to recharge before the brake.`, 4000)
      }

      if (failBurstArmed && pp.z < FAIL_BURST_TRIGGER_Z) startFailBurst()

      // --- FAST-TIME CAR: runaway pistons ---------------------------------
      if (mechHazardActive && !braking) {
        for (const r of rams) {
          if (Math.abs(pp.z - r.z) < 0.55 && Math.abs(pp.x - r.head.position.x) < 0.5 && pp.y < 1.8 && pp.y + (player.isCrouching() ? 1.15 : 1.85) > 0.025) {
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
          failSoft(`Caught by the falling trunk! Let it land, then ${bindingLabel(settings.getBinding('jump'))} jump over it.`)
        }
      }

      // --- FROZEN CAR: suspended wreckage as a walkway ---------------------
      const frozen = mode === 'FREEZE'
      securityCrossing.update(delta, frozen)
      slabSettle = securityCrossing.settle
      slabSupports.length = 0
      slabSupports.push(...spatial.supports, ...connector.supports, ...cargoGangway.supports, ...securityCrossing.supports)
      // Test actual falling rather than killing every non-Freeze body in a Z
      // interval. The island is safe, and reasonable jumps remain possible.
      if (walkwayActive && pp.z > gapMinZ && pp.z < gapMaxZ && pp.y < -0.65) {
        failSoft('Freeze the marked debris; recharge on the intact island before the second crossing.', 'fell')
      }

      // Shell floor is cut; the visible intact slab supports only before failure.
      if (!collapseLive) slabSupports.push({ ...collapseVoid, y: 0.06 })
      for (const [a, b] of [[spans.passenger.minZ, collapseMinZ], [collapseMaxZ, spans.passenger.maxZ]]) slabSupports.push({ minX: -2.6, maxX: 2.6, minZ: a, maxZ: b, y: 0 })
      // --- PASSENGER collapse: Freeze stepping-stones across the hole ------
      if (collapseArmed && pp.z < collapseTriggerZ) startCollapse()
      collapseSettle = THREE.MathUtils.clamp(collapseSettle + (frozen && collapseLive ? 1 : -1) * delta / 0.2, 0, 1)
      const nearCollapse = pp.z > collapseMinZ - HAZARD_PAD && pp.z < collapseMaxZ + HAZARD_PAD
      const collapseFxLive = collapseLive && (nearCollapse || collapseMotionNeedsUpdate(frozen))
      if (collapseFxLive) applyCollapseMotion()
      collapseGlow.intensity = collapseFxLive
        ? (frozen ? 8 : 2.4 + Math.sin(elapsed * 3.2) * 0.4)
        : 0
      if (collapseFxLive) {
        collapseBrass.emissiveIntensity = frozen ? 1.15 : 0.12
        collapseWood.emissiveIntensity = frozen ? 0.9 : 0.1
        collapseCyan.emissiveIntensity = frozen ? 1.55 : 0.85
        collapseLipCyan.emissiveIntensity = frozen ? 1.4 : 0.9
      }
      if (frozen && collapseLive && collapseSettle > 0.98) {
        for (const p of collapsePieces) {
          slabSupports.push({
            minX: p.mesh.position.x - p.hx - COLLAPSE_PAD_X,
            maxX: p.mesh.position.x + p.hx + COLLAPSE_PAD_X,
            minZ: p.mesh.position.z - p.hz - COLLAPSE_PAD_Z,
            maxZ: p.mesh.position.z + p.hz + COLLAPSE_PAD_Z,
            y: p.mesh.position.y + 0.18
          })
        }
      }
      const inCollapse = collapseLive && pp.z > collapseMinZ && pp.z < collapseMaxZ
      let onCollapseSupport = false
      if (frozen && collapseLive && collapseSettle > 0.98) {
        for (const p of collapsePieces) {
          if (
            pp.x >= p.mesh.position.x - p.hx - COLLAPSE_PAD_X &&
            pp.x <= p.mesh.position.x + p.hx + COLLAPSE_PAD_X &&
            pp.z >= p.mesh.position.z - p.hz - COLLAPSE_PAD_Z &&
            pp.z <= p.mesh.position.z + p.hz + COLLAPSE_PAD_Z &&
            pp.y >= p.mesh.position.y + 0.18 - 0.25
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
        if (breakupT > 1.0) {
          bounds.maxZ = Math.min(bounds.maxZ, spans.passenger.maxZ - 0.5)
          // Retire the inaccessible connector before Mechanical detaches; its
          // root-owned hinges must not float beside a departing carriage.
          connector.group.visible = false
          retiredWreck.apply(true)
        }
        if (breakupT > 3.2) {
          bounds.maxZ = Math.min(
            bounds.maxZ,
            Math.max(lastCheckpointZ + 0.75, spans.passenger.center + 1, pp.z + 3)
          )
        }
      }

      // --- FINAL SEQUENCE: depletion, then the sprint ----------------------
      if (!depleted && pp.z < DEPLETE_Z && !respawn.isFailing()) {
        depleted = true
        timeSystem.setAbilityAvailability({ SLOW: false, REWIND: false, GHOST: false })
        lastCheckpointZ = -Infinity // no further checkpoints past here
        wave.visible = true
        respawn.setCheckpoint(new THREE.Vector3(0, 0, DEPLETE_Z), Math.PI, {
          restore: captureCheckpointRestore(DEPLETE_Z)
        })
        showLevelToast('CHRONO CORE DEPLETED — only FREEZE remains. RUN!', 3800)
        hud.setObjective(sprintObjective())
      }

      if (!brakeComplete && !respawn.isFailing()) {
        // The registered clock drives puzzle pursuit; the finale uses sprint speed.
        const holding = mode === 'FREEZE'
        if (depleted && !holding) waveZ -= WAVE_SPEED * delta
        wave.position.z = waveZ
        waveLight.position.z = finaleFreeze ? THREE.MathUtils.lerp(waveZ, pp.z, 0.32) : waveZ
        waveLight.distance = finaleFreeze ? 22 : 8
        waveLight.color.setHex(finaleFreeze ? 0xbfdbfe : 0xa855f7)
        waveLight.intensity = finaleFreeze
          ? 26 + Math.sin(elapsed * 2.3) * 2
          : 13 + Math.sin(elapsed * 9) * 3 + resumeWarm * 10

        if (waveZ <= pp.z + 0.35 && failCooldown <= 0) {
          failSoft('Time caught up with you!')
        }
      }

      // After all intensity/colour writes for this frame (env flicker, Freeze
      // glows, blast, wave/stasis) so nearby hazards win the nearest-12 set.
      retiredWreck.apply(retiredWreck.active)
      lightPool.update(pp, delta)
    },

    dispose() {
      disposed = true
      removeBrakeVeil()
      feedback.stop()
      spatial.dispose(slabSupports)
      for (let i = slabSupports.length - 1; i >= 0; i--) if (connector.supports.includes(slabSupports[i])) slabSupports.splice(i, 1)
      const connectorVoidIndex = gapVoids.indexOf(connector.gap)
      if (connectorVoidIndex >= 0) gapVoids.splice(connectorVoidIndex, 1)
      wreckAudio.dispose()
      levelThreeSfx.dispose()
      hazardAudio.dispose()
      removeVisibility()
      hud.hideCinematicSkip?.()
      player.mesh.userData.tightCrouchCamera = false
      player.mesh.userData.wreckLowCeiling = false
      timeSystem.resetGhost()
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
      stormSky.mesh.removeFromParent()
      releaseCapturedSky()
      stormSky.dispose()
      post?.resetGrade()
      if (stormEnvTarget) {
        if (scene.environment === stormEnvTarget.texture) {
          scene.environment = savedEnvironment
          scene.environmentIntensity = savedEnvironmentIntensity
        }
        stormEnvTarget.dispose()
        stormEnvTarget = null
      }
      scene.remove(outdoorEnv.group, wreckExterior.group, root)
      disposeObject(root)
    }
  }
}

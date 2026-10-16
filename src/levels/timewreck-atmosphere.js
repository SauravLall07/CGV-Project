import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { CARRIAGE_CEILING_Y } from '../environment/carriages.js'
import { WRECK_WALL_X } from '../environment/carriage-bounds.js'

// ---------------------------------------------------------------------------
// Level 3 atmospheric motion — five independent systems.
// Flip any `enabled` flag to false to disable that system alone.
// ---------------------------------------------------------------------------

// 1) Carriage shake — mild root visual motion + occasional jolts.
//    Collision AABBs stay world-fixed; keep amplitudes modest to avoid
//    motion-sickness and feel of sliding walls.
export const CARRIAGE_SHAKE = {
  enabled: true,
  // Continuous vibration (radians / metres), scaled by unrest later.
  ampRotZ: 0.016,
  ampY: 0.016,
  ampX: 0.0035,
  // Occasional impact.
  joltChancePerSec: 0.42,
  joltDuration: 0.14,
  joltAmpRotZ: 0.028,
  joltAmpY: 0.024,
  joltAmpX: 0.008
}

// 2) Floating luggage / debris outside the aisle.
export const STORM_DEBRIS = {
  enabled: true,
  count: 18,
  // |x| beyond this stays clear of the playable corridor.
  minAbsX: WRECK_WALL_X + 0.85,
  driftSpeed: 0.55,
  tumbleSpeed: 1.1
}

// 3) Lamp swing / storm flicker on existing fixtures (no new PointLights).
export const LAMP_MOTION = {
  enabled: true,
  swingAmp: 0.055, // radians
  bobAmp: 0.018, // metres
  // Phase-1 polish: slightly snappier storm breath; unrest still scales it.
  stormFlicker: 0.16 // extra intensity mul amplitude on top of env flicker
}

// 4) Overhead grab handles / straps (decorative only).
export const GRAB_HANDLES = {
  enabled: true,
  // One pair every `spacing` metres along each listed span key.
  spacing: 3.6,
  swayAmp: 0.26, // radians — stronger sway as unrest climbs toward the cab
  hangY: CARRIAGE_CEILING_Y - 0.55,
  // Side offset — clear of centre aisle.
  sideX: 0.72
}

// Progressive storm intensity (visual only). timewreck.js folds this into the
// existing unrest / exteriorScale multipliers — no new particle systems.
export const STORM_PROGRESS = {
  // Added to unrest as the player travels Vault (+Z) → Cab (−Z).
  progressUnrest: 1.35,
  // Extra exterior scrap travel rate at the locomotive end.
  exteriorSpeedBoost: 0.4
}

/** 0 at Vault rear → 1 at Cab nose. Safe if spans are incomplete. */
export function stormProgressAlongTrain(playerZ, spans) {
  const a = spans?.vault?.maxZ
  const b = spans?.cab?.minZ
  if (!(Number.isFinite(a) && Number.isFinite(b) && a > b)) return 0
  return Math.min(1, Math.max(0, (a - playerZ) / (a - b)))
}

// 5) Dash-door open-window timing (Relay blast doors).
//    Applied in timewreck.js — kept here so all atmosphere knobs live together.
//    Baseline BLAST_OPEN_S was 0.28; ~22% shorter open hold.
export const DASH_DOOR_TIMING = {
  // Set enabled false to keep the previous 0.28s open hold (wire in timewreck).
  enabled: true,
  openHoldSeconds: 0.22
}

function noCam(obj) {
  obj.userData.noCameraCollision = true
  return obj
}

// --- 1. Shake --------------------------------------------------------------

export function createCarriageShake(root, config = CARRIAGE_SHAKE) {
  let joltT = 0
  let joltDir = 1
  let joltPhase = 0

  function reset() {
    joltT = 0
    if (!root) return
    root.rotation.z = 0
    root.position.y = 0
    root.position.x = 0
  }

  function update(delta, { elapsed, unrest, slamKick, frozen }) {
    if (!config.enabled || frozen) {
      if (frozen) {
        root.rotation.z = 0
        root.position.y = 0
        root.position.x = 0
      }
      return false // caller may apply fallback / slam-only
    }

    // Irregular multi-frequency vibration (not a single sine).
    const t = elapsed
    const n1 = Math.sin(t * 1.9) * 0.55 + Math.sin(t * 4.7 + 0.8) * 0.3 + Math.sin(t * 11.3 + 1.4) * 0.15
    const n2 = Math.sin(t * 2.4 + 0.3) * 0.5 + Math.sin(t * 6.8) * 0.35 + Math.sin(t * 13.1 + 2.1) * 0.15
    const n3 = Math.sin(t * 3.1 + 1.1) * 0.6 + Math.sin(t * 9.2 + 0.5) * 0.4

    if (joltT > 0) {
      joltT = Math.max(0, joltT - delta)
    } else if (delta > 0 && Math.random() < config.joltChancePerSec * delta) {
      joltT = config.joltDuration
      joltDir = Math.random() < 0.5 ? -1 : 1
      joltPhase = Math.random() * Math.PI * 2
    }

    const joltU = joltT > 0 ? (joltT / config.joltDuration) : 0
    // Ease-out punch.
    const jolt = joltU * joltU
    const slam = slamKick * slamKick

    root.rotation.z =
      n1 * config.ampRotZ * unrest +
      Math.sin(t * 52) * 0.02 * slam +
      Math.sin(joltPhase + (1 - joltU) * 18) * config.joltAmpRotZ * jolt * joltDir

    root.position.y =
      n2 * config.ampY * unrest +
      Math.sin(t * 68) * 0.016 * slam +
      Math.abs(Math.sin(joltPhase * 1.3)) * config.joltAmpY * jolt

    root.position.x =
      n3 * config.ampX * unrest +
      Math.sin(t * 41) * 0.01 * slam +
      Math.sin(joltPhase * 2.1) * config.joltAmpX * jolt * joltDir

    return true
  }

  return { update, reset, config }
}

// --- 2. Storm debris -------------------------------------------------------

function makeLuggageMaterials() {
  const leather = new THREE.MeshStandardMaterial({
    color: 0x5a3a22, roughness: 0.72, metalness: 0.08, emissive: 0x1a1008, emissiveIntensity: 0.08
  })
  const leatherDark = new THREE.MeshStandardMaterial({
    color: 0x3a2414, roughness: 0.78, metalness: 0.06, emissive: 0x120a06, emissiveIntensity: 0.06
  })
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.14
  })
  const wood = new THREE.MeshStandardMaterial({
    color: 0x6a4a2c, roughness: 0.65, metalness: 0.05, emissive: 0x1a1008, emissiveIntensity: 0.06
  })
  return { leather, leatherDark, brass, wood }
}

function buildLuggageTrunk(mats, variant) {
  const g = new THREE.Group()
  g.name = 'storm-luggage'
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.58),
    variant % 2 ? mats.leather : mats.leatherDark
  )
  body.castShadow = true
  g.add(body)
  // Reinforced corners
  for (const [x, y, z] of [
    [-0.2, 0.1, 0.28], [0.2, 0.1, 0.28], [-0.2, 0.1, -0.28], [0.2, 0.1, -0.28],
    [-0.2, -0.1, 0.28], [0.2, -0.1, 0.28]
  ]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mats.brass)
    cap.position.set(x, y, z)
    g.add(cap)
  }
  // Clasp + strap
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.1), mats.brass)
  clasp.position.set(0, 0.13, 0.3)
  g.add(clasp)
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.04), mats.leatherDark)
  strap.position.set(0, 0.13, 0)
  g.add(strap)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI), mats.brass)
  handle.rotation.x = Math.PI / 2
  handle.position.set(0, 0.16, 0)
  g.add(handle)
  noCam(g)
  return g
}

function buildWoodFragment(mats, i) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08 + (i % 5) * 0.025, 0.04, 0.35 + (i % 4) * 0.06),
    mats.wood
  )
  mesh.name = 'storm-wood-frag'
  noCam(mesh)
  return mesh
}

export function createStormDebris(root, spans, config = STORM_DEBRIS) {
  const group = new THREE.Group()
  group.name = 'storm-debris-field'
  root.add(group)

  const items = []
  if (!config.enabled) {
    return {
      update() {},
      reset() {},
      dispose() { root.remove(group) },
      config
    }
  }

  const mats = makeLuggageMaterials()
  const zMin = spans.cab.minZ + 2
  const zMax = spans.vault.maxZ - 2
  const zSpan = zMax - zMin

  for (let i = 0; i < config.count; i++) {
    const isTrunk = i % 3 !== 2
    const mesh = isTrunk ? buildLuggageTrunk(mats, i) : buildWoodFragment(mats, i)
    const side = i % 2 ? 1 : -1
    const absX = config.minAbsX + (i % 5) * 0.22
    const base = {
      mesh,
      side,
      x: side * absX,
      y: 0.55 + (i % 6) * 0.28,
      z: zMin + ((i * 0.618) % 1) * zSpan,
      spinX: 0.4 + (i % 5) * 0.15,
      spinY: 0.55 + (i % 7) * 0.12,
      spinZ: 0.3 + (i % 4) * 0.18,
      drift: 0.35 + (i % 6) * 0.12,
      phase: i * 1.37,
      turbulence: 0.4 + (i % 3) * 0.25
    }
    mesh.position.set(base.x, base.y, base.z)
    mesh.rotation.set(base.phase * 0.2, base.phase * 0.3, base.phase * 0.15)
    group.add(mesh)
    items.push(base)
  }

  function update(delta, { elapsed, frozen, unrest = 1 }) {
    if (!config.enabled || frozen || delta === 0) return
    const t = elapsed
    const storm = 1 + Math.min(1.2, unrest * 0.35)
    for (const item of items) {
      const p = item.phase
      const bob = Math.sin(t * item.drift + p) * 0.12 * storm
      const sway = Math.sin(t * (item.drift * 0.7) + p * 1.3) * 0.18 * item.turbulence
      const gust = Math.sin(t * 2.8 + p) > 0.92 ? 0.15 * item.turbulence : 0
      item.mesh.position.x = item.x + sway
      item.mesh.position.y = item.y + bob + gust
      item.mesh.position.z = item.z + Math.sin(t * 0.35 + p) * 0.4
      item.mesh.rotation.x += delta * item.spinX * config.tumbleSpeed * 0.35 * storm
      item.mesh.rotation.y += delta * item.spinY * config.tumbleSpeed * 0.4 * storm
      item.mesh.rotation.z += delta * item.spinZ * config.tumbleSpeed * 0.25 * storm
    }
  }

  function reset() {}

  function dispose() {
    root.remove(group)
    // This branch is detached before the level root's teardown. Release its
    // shared luggage materials as well as geometry here.
    disposeObject(group)
  }

  return { update, reset, dispose, config }
}

// --- 3. Lamp motion --------------------------------------------------------

export function createLampMotion(root, config = LAMP_MOTION) {
  const lights = []
  const fixtures = []

  if (config.enabled) {
    root.traverse((node) => {
      if (node.isMesh && /sconce|wreck-door-lamp|door-lamp/i.test(node.name || '')) {
        fixtures.push({
          mesh: node,
          baseRotZ: node.rotation.z,
          baseRotX: node.rotation.x,
          seed: fixtures.length * 1.9
        })
      }
      // Carriage lamps only — skip pool lights and named finale/hazard sources.
      if (
        node.isPointLight &&
        !String(node.name || '').startsWith('light-pool') &&
        !/wave|stasis|burst|fracture|aisle|slam/i.test(node.name || '')
      ) {
        // Prefer lights that sit near fixtures / carriage fills (skip huge ranges).
        if (node.distance > 0 && node.distance <= 12) {
          lights.push({
            light: node,
            baseX: node.position.x,
            baseY: node.position.y,
            baseZ: node.position.z,
            baseIntensity: node.intensity,
            seed: lights.length * 2.7
          })
        }
      }
    })
  }

  function update(delta, { elapsed, frozen, unrest = 1, shakeX = 0, shakeY = 0 }) {
    if (!config.enabled || frozen) return
    const t = elapsed
    const shakeBoost = 1 + Math.min(1.5, Math.abs(shakeX) * 40 + Math.abs(shakeY) * 25)

    for (const entry of fixtures) {
      const s = entry.seed
      const swing = Math.sin(t * 2.3 + s) * config.swingAmp * unrest * shakeBoost
        + Math.sin(t * 5.1 + s * 1.4) * config.swingAmp * 0.35
      entry.mesh.rotation.z = entry.baseRotZ + swing
      entry.mesh.rotation.x = entry.baseRotX + Math.sin(t * 1.7 + s) * config.swingAmp * 0.4
      // Warm glass emissive breathes with the storm (no extra PointLights).
      const mat = entry.mesh.material
      if (mat && mat.emissiveIntensity !== undefined) {
        if (entry.baseEmissive === undefined) entry.baseEmissive = mat.emissiveIntensity
        const flick = 1 + Math.sin(t * 6.4 + s) * config.stormFlicker
          + (Math.sin(t * 1.1 + s) > 0.9 ? -config.stormFlicker * 0.7 : 0)
        mat.emissiveIntensity = entry.baseEmissive * THREE.MathUtils.clamp(flick, 0.75, 1.2)
      }
    }

    for (const entry of lights) {
      const s = entry.seed
      const bob = Math.sin(t * 2.6 + s) * config.bobAmp * unrest * shakeBoost
      const sway = Math.sin(t * 2.1 + s * 1.3) * config.bobAmp * 0.7
      entry.light.position.x = entry.baseX + sway
      entry.light.position.y = entry.baseY + bob
      // Soft mul on the already-flickered intensity from env.update (same frame).
      const storm = 1 + Math.sin(t * 7.2 + s) * config.stormFlicker * 0.85 * unrest
        + (Math.sin(t * 0.9 + s) > 0.9 ? -config.stormFlicker * 0.6 : 0)
      entry.light.intensity *= THREE.MathUtils.clamp(storm, 0.85, 1.1)
    }
  }

  function reset() {
    for (const entry of fixtures) {
      entry.mesh.rotation.z = entry.baseRotZ
      entry.mesh.rotation.x = entry.baseRotX
    }
    for (const entry of lights) {
      entry.light.position.set(entry.baseX, entry.baseY, entry.baseZ)
    }
  }

  return { update, reset, config }
}

// --- 4. Grab handles -------------------------------------------------------

function buildGrabHandle(brassMat, strapMat) {
  const g = new THREE.Group()
  g.name = 'grab-handle'
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 6), brassMat)
  mount.position.y = 0.28
  g.add(mount)
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.02), strapMat)
  strap.position.y = 0.05
  g.add(strap)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.16, 8), brassMat)
  grip.rotation.z = Math.PI / 2
  grip.position.y = -0.16
  g.add(grip)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 5, 10), brassMat)
  ring.position.y = 0.22
  g.add(ring)
  noCam(g)
  return g
}

export function createGrabHandles(root, spans, config = GRAB_HANDLES) {
  const group = new THREE.Group()
  group.name = 'grab-handles'
  root.add(group)
  const handles = []

  if (!config.enabled) {
    return {
      update() {},
      reset() {},
      dispose() { root.remove(group) },
      config
    }
  }

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x3a2418, roughness: 0.85, metalness: 0.05, emissive: 0x120a06, emissiveIntensity: 0.05
  })

  // Place along major cars (skip vault lasers / cab gauges clutter).
  const keys = ['convergence', 'mechanical', 'cargo', 'relay', 'security', 'passenger']
  let index = 0
  for (const key of keys) {
    const span = spans[key]
    if (!span) continue
    for (let z = span.minZ + 1.8; z < span.maxZ - 1.8; z += config.spacing) {
      for (const side of [-1, 1]) {
        const handle = buildGrabHandle(brassMat, strapMat)
        handle.position.set(side * config.sideX, config.hangY, z)
        // Rest pose: hang straight down; pivot at mount.
        handle.rotation.z = side * 0.08
        group.add(handle)
        handles.push({
          mesh: handle,
          baseRotZ: handle.rotation.z,
          baseRotX: 0,
          phase: index * 0.85,
          side
        })
        index++
      }
    }
  }

  function update(delta, { elapsed, frozen, unrest = 1, slamKick = 0 }) {
    if (!config.enabled || frozen) return
    const t = elapsed
    const kick = slamKick * slamKick
    for (const h of handles) {
      const sway =
        Math.sin(t * 2.15 + h.phase) * config.swayAmp * unrest * 0.65 +
        Math.sin(t * 4.8 + h.phase * 1.4) * config.swayAmp * 0.25 +
        Math.sin(t * 14 + h.phase) * config.swayAmp * 0.55 * kick
      h.mesh.rotation.z = h.baseRotZ + sway * h.side
      h.mesh.rotation.x = Math.sin(t * 1.9 + h.phase * 0.7) * config.swayAmp * 0.35 * unrest
    }
  }

  function reset() {
    for (const h of handles) {
      h.mesh.rotation.z = h.baseRotZ
      h.mesh.rotation.x = 0
    }
  }

  function dispose() {
    root.remove(group)
    brassMat.dispose()
    strapMat.dispose()
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
    })
  }

  return { update, reset, dispose, config }
}

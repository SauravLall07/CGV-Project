import * as THREE from 'three'
import { createDebrisCollision } from './timewreck-debris.js'
import { createWreckPanelGeometry } from '../environment/wreck-geometry.js'
import { signMaterial } from '../environment/textures.js'

const WARNING = 0.9
const RECOVERY = 3
const RUN_IN = 4
const SHAPES = [[0.85, 0.1, 1.45], [0.24, 0.22, 1.5], [0.72, 0.55, 0.72]]
const COLORS = [0x543316, 0x704a26, 0x3f2b20, 0x8b6139]

export const CARGO_BURSTS = Object.freeze({ warning: 1.2, active: 0.9,
  second: 3.3, period: 8.4, pad: 12.5, start: 9.6, end: 11.3 })

// Two pairs replace four random flights. The remaining flights stay downstream
// of freight; neither pool can sweep the gangway, landing or observation pad.
export function cargoBurstPhase(clock) {
  if (clock < 0) return 'idle'
  const t = clock % CARGO_BURSTS.period
  if (t < 1.2) return 'warning-right'
  if (t < 2.1) return 'burst-right'
  if (t < 3.3) return 'recovery'
  if (t < 4.5) return 'warning-left'
  if (t < 5.4) return 'burst-left'
  return 'clear'
}

function randomSource(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// The brown hull panels recur in every car, from the Vault through the cab.
export function createFlyingPanels({ root, spans, player, timeSystem, unregisters, fail,
  warn, onLethalFlight, seed = Math.floor(Math.random() * 4294967296) }) {
  const group = new THREE.Group()
  group.name = 'wreck-flying-panels'
  root.add(group)
  const geometries = [0, 1, 2].map(createWreckPanelGeometry)
  let enabled = true
  const panels = Object.entries(spans).flatMap(([key, span], carIndex) =>
    Array.from({ length: key === 'vault' || key === 'convergence' ? 6 : 8 }, (_, index) => {
    const id = carIndex * 8 + index
    const random = randomSource(seed ^ Math.imul(id + 1, 0x9e3779b1))
    const material = new THREE.MeshStandardMaterial({
      color: 0x543316, roughness: 0.82, metalness: 0.28,
      emissive: 0x321306, emissiveIntensity: 0.18, transparent: !(key === 'cargo' && index < 4)
    })
    const mesh = new THREE.Mesh(geometries[index % 3], material)
    mesh.name = `${key}-flying-brown-panel${index ? `-${index + 1}` : ''}`
    mesh.userData.noCameraCollision = true
    group.add(mesh)
    return { mesh, span, key, id, index, clock: -1, checkedCycle: -1,
      delay: index === 0 ? 0 : index * 0.65 + random() * 0.3,
      period: WARNING + (span.maxZ - span.minZ + RUN_IN * 2) / 4.5 + RECOVERY }
  }))
  const collision = createDebrisCollision(player, panels.map(p => p.mesh))
  const cargo = panels.filter(p => p.key === 'cargo')
  const cargoCenter = spans.cargo.center ?? (spans.cargo.minZ + spans.cargo.maxZ) / 2
  const signals = new THREE.Group()
  signals.name = 'cargo-burst-signals'
  root.add(signals)
  const signalMaterial = new THREE.MeshStandardMaterial({ color: 0xc4a052,
    emissive: 0xc4a052, emissiveIntensity: 0.6, roughness: 0.65 })
  const signal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.07, 0.07), signalMaterial)
  signal.name = 'cargo-burst-clearance-arm'
  signal.position.set(0, 1.42, cargoCenter + 9.2); signals.add(signal)
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.3), signMaterial({
    text: 'BURSTS / RIGHT - LEFT / FLAT = CLEAR', width: 2048, emissiveIntensity: 0.3
  }))
  label.position.set(0, 1.85, cargoCenter + 9.2); signals.add(label)
  // The bar marks a real solid-floor observation position.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.018, 0.045), signalMaterial)
  pad.name = 'cargo-burst-observation-pad'
  pad.position.set(0, 0.02, cargoCenter + CARGO_BURSTS.pad); signals.add(pad)
  signals.traverse(n => { n.userData.noCameraCollision = true })
  let lastCue = '', wasNearCargo = false

  function applyCargo(panel) {
    const { mesh, index, clock } = panel
    const cycle = Math.floor(Math.max(0, clock) / CARGO_BURSTS.period)
    if (panel.checkedCycle !== cycle) { collision.reset(mesh); panel.checkedCycle = cycle }
    const second = index >= 2
    const t = Math.max(0, clock) % CARGO_BURSTS.period - (second ? CARGO_BURSTS.second : 0)
    const u = THREE.MathUtils.clamp((t - CARGO_BURSTS.warning) / CARGO_BURSTS.active, 0, 1)
    mesh.visible = clock >= 0 && t >= 0 && t < CARGO_BURSTS.warning + CARGO_BURSTS.active
    mesh.scale.set(0.9, 0.55, 0.75)
    const burstCycle = Math.floor(Math.max(0, clock) / CARGO_BURSTS.period)
    if (t >= CARGO_BURSTS.warning && t < CARGO_BURSTS.warning + CARGO_BURSTS.active &&
        panel.soundedCycle !== burstCycle && timeSystem.getMode() !== 'REWIND') {
      panel.soundedCycle = burstCycle
      const pp = player.mesh.position
      onLethalFlight?.(Math.hypot(pp.x, pp.y - 1.5, pp.z - (cargoCenter + CARGO_BURSTS.start)),
        (CARGO_BURSTS.end - CARGO_BURSTS.start) / CARGO_BURSTS.active)
    }
    mesh.position.set(index % 2 ? (second ? 1.05 : -1.05) : 0,
      u < 0.25 ? 2.7 - u / 0.25 * 1.6 : u > 0.7 ? 1.1 + (u - 0.7) / 0.3 * 2.6 : 1.1,
      cargoCenter + CARGO_BURSTS.start + (CARGO_BURSTS.end - CARGO_BURSTS.start) * u)
    // Loose roof panels land against the retained ceiling above the solid lip.
    mesh.rotation.set(0.2 + u * 2, u * 0.8, 0.15 + u * 0.7)
    mesh.material.opacity = 1
    mesh.material.emissiveIntensity = t < CARGO_BURSTS.warning ? 0.5 + Math.abs(Math.sin(t * 14)) : 0.18
  }

  function applySignal() {
    const stage = cargoBurstPhase(cargo[0].clock)
    signal.rotation.z = stage.includes('right') ? -0.65 : stage.includes('left') ? 0.65 : 0
    signal.scale.y = stage.startsWith('burst') ? 2 : 1
    signalMaterial.emissiveIntensity = stage.startsWith('warning') ? 0.6 + Math.abs(Math.sin(cargo[0].clock * 14)) : 0.5
  }
  const scrapGeometry = createWreckPanelGeometry(1).scale(0.18, 0.04, 0.42)
  const scrapMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.25 })
  const scrapPose = new THREE.Object3D()
  const scraps = panels.filter(p => p.index === 0).map(owner => {
    const mesh = new THREE.InstancedMesh(scrapGeometry, scrapMaterial, 6)
    const { span } = owner
    mesh.name = owner.mesh.name.replace('brown-panel', 'small-debris')
    mesh.userData.noCameraCollision = true
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.4, (span.minZ + span.maxZ) / 2),
      (span.maxZ - span.minZ) / 2 + RUN_IN + 1)
    const random = randomSource(seed ^ Math.imul(owner.id + 17, 0x85ebca6b))
    const flights = Array.from({ length: mesh.count }, (_, i) => {
      mesh.setColorAt(i, new THREE.Color(random() < 0.5 ? 0xc4a052 : COLORS[Math.floor(random() * COLORS.length)]))
      return { x: (random() * 2 - 1) * 2.1, y: 0.4 + random() * 2,
        speed: 6 + random() * 9, offset: random(), spin: 0.7 + random() * 2,
        scale: new THREE.Vector3(0.6 + random(), 0.6 + random(), 0.6 + random()) }
    })
    group.add(mesh)
    return { mesh, owner, flights }
  })

  function applyScraps() {
    for (const { mesh, owner, flights } of scraps) {
      const t = Math.max(0, owner.clock), distance = owner.span.maxZ - owner.span.minZ + RUN_IN * 2
      mesh.visible = owner.clock >= 0
      for (let i = 0; i < mesh.count; i++) {
        const flight = flights[i]
        const travel = (Math.max(0, t - flight.offset * 2) * flight.speed) % distance
        scrapPose.position.set(flight.x, flight.y, owner.span.minZ - RUN_IN + travel)
        scrapPose.rotation.set(t * flight.spin, t * 1.3 + i, t * 0.7)
        scrapPose.scale.copy(flight.scale).multiplyScalar(Math.min(1, travel / RUN_IN, (distance - travel) / RUN_IN))
        scrapPose.updateMatrix(); mesh.setMatrixAt(i, scrapPose.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  function apply(panel) {
    if (panel.key === 'cargo' && panel.index < 4) { applyCargo(panel); return }
    const elapsed = panel.clock - panel.delay
    const cycle = Math.floor(Math.max(0, elapsed) / panel.period)
    if (panel.checkedCycle !== cycle) {
      // A seeded flight regenerates exactly when Rewind returns to this cycle.
      const random = randomSource(seed ^ Math.imul(panel.id + 1, 0x9e3779b1) ^ Math.imul(cycle + 1, 0x85ebca6b))
      const shapeIndex = Math.floor(random() * SHAPES.length)
      const dimensions = SHAPES[shapeIndex]
      const size = 0.65 + random() * 0.5
      panel.mesh.scale.set(...dimensions.map(value => value * size))
      panel.mesh.material.color.setHex(COLORS[Math.floor(random() * COLORS.length)])
      const right = random() < 0.5
      panel.x = (right ? 1 : -1) * (1.25 + random() * 0.75)
      // High right-side flights leave room beneath the maintenance roof.
      panel.y = right ? 2.3 + random() * 0.25 : 0.65 + random() * 0.85
      panel.speed = 4.5 + random() * 5
      // The player runs in -Z: all wreckage enters from ahead and passes in +Z.
      panel.startZ = panel.span.minZ - RUN_IN
      panel.endZ = panel.span.maxZ + RUN_IN
      if (panel.key === 'cargo') panel.endZ = cargoCenter - 9.8
      panel.duration = (panel.endZ - panel.startZ) / panel.speed
      collision.reset(panel.mesh)
      panel.checkedCycle = cycle
    }
    const phase = Math.max(0, elapsed) % panel.period
    const travel = THREE.MathUtils.clamp(phase - WARNING, 0, panel.duration)
    const z = panel.startZ + travel * panel.speed
    panel.mesh.visible = elapsed >= 0 && phase < WARNING + panel.duration
    panel.mesh.position.set(panel.x, panel.y, z)
    // Trigger once at the start of actual lethal motion, never for decorative
    // instanced scraps, warning poses, stationary objects or rewind snapshots.
    if (phase >= WARNING && phase < WARNING + panel.duration &&
        panel.soundedCycle !== cycle && timeSystem.getMode() !== 'REWIND') {
      panel.soundedCycle = cycle
      const pp = player.mesh.position
      const distance = Math.hypot(pp.x - panel.x, pp.y - panel.y, pp.z - z)
      onLethalFlight?.(distance, panel.speed)
    }
    if (panel.key === 'cargo') panel.mesh.position.y += Math.max(0, (z - panel.endZ + 2) / 2) * 3
    // Cargo's shortened flights terminate overhead against the retained hull;
    // keep them opaque while rising rather than fading lethal floor-level wood.
    panel.mesh.material.opacity = Math.min(1, phase / WARNING,
      panel.key === 'cargo' ? 1 : Math.max(0, (panel.endZ - z) / RUN_IN))
    panel.mesh.rotation.set(0.35 + travel * 1.4, travel * 0.65, 0.18 + travel * 0.5)
    panel.mesh.material.emissiveIntensity = phase < WARNING
      ? 0.35 + Math.abs(Math.sin(phase * 18)) * 1.2 : 0.18
  }

  unregisters.push(timeSystem.register(group, {
    onUpdate(dt) {
      if (!enabled) return
      for (const panel of panels) {
        if (panel.clock >= 0) panel.clock += dt
        apply(panel)
      }
      applyScraps()
      applySignal()
    },
    getSnapshot: () => panels.map(p => p.clock),
    restoreSnapshot(clocks) {
      if (!enabled) return
      panels.forEach((p, i) => {
        p.clock = clocks[i]
        p.soundedCycle = Math.floor(Math.max(0, p.clock) / (p.key === 'cargo' && p.index < 4 ? CARGO_BURSTS.period : p.period))
        apply(p)
      })
      applyScraps()
      applySignal()
      lastCue = ''
      wasNearCargo = false
    }
  }))

  function update(active = true) {
    enabled = active
    if (active) {
      const z = player.mesh.position.z
      for (const panel of panels) {
        if (panel.clock < 0 && z >= panel.span.minZ && z <= panel.span.maxZ) {
          panel.clock = 0
          apply(panel)
        }
      }
      applyScraps()
      applySignal()
      const stage = cargoBurstPhase(cargo[0].clock)
      const cue = `${Math.floor(cargo[0].clock / CARGO_BURSTS.period)}:${stage}`
      const near = z >= cargoCenter + 8.6 && z <= spans.cargo.maxZ
      if ((cue !== lastCue || near && !wasNearCargo) && timeSystem.getMode() !== 'REWIND') {
        if (near && (stage.startsWith('warning') || stage.startsWith('burst'))) warn?.(stage)
        lastCue = cue
      }
      wasNearCargo = near
    }
    if (collision.update(active)) fail('Flying wreckage killed you! Dodge the large brown objects or Slow/Freeze their flight.')
  }

  function reset() {
    for (const panel of panels) { panel.clock = -1; panel.checkedCycle = -1; panel.soundedCycle = -1; apply(panel) }
    applyScraps()
    collision.reset()
    lastCue = ''
    wasNearCargo = false
    applySignal()
    enabled = true
  }
  reset()
  return { group, update, reset, getCargoState: () => ({ clock: cargo[0].clock, stage: cargoBurstPhase(cargo[0].clock) }) }
}

import * as THREE from 'three'
import { createDebrisCollision } from './timewreck-debris.js'

const WARNING = 0.9
const RECOVERY = 3
const RUN_IN = 4
const SHAPES = [[0.85, 0.1, 1.45], [0.24, 0.22, 1.5], [0.72, 0.55, 0.72]]
const COLORS = [0x543316, 0x704a26, 0x3f2b20, 0x8b6139]

function randomSource(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// The brown hull panels recur in every car, from the Vault through the cab.
export function createFlyingPanels({ root, spans, player, timeSystem, unregisters, fail,
  seed = Math.floor(Math.random() * 4294967296) }) {
  const group = new THREE.Group()
  group.name = 'wreck-flying-panels'
  root.add(group)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  let enabled = true
  const panels = Object.entries(spans).flatMap(([key, span], carIndex) =>
    Array.from({ length: key === 'vault' || key === 'convergence' ? 6 : 8 }, (_, index) => {
    const id = carIndex * 8 + index
    const random = randomSource(seed ^ Math.imul(id + 1, 0x9e3779b1))
    const material = new THREE.MeshStandardMaterial({
      color: 0x543316, roughness: 0.82, metalness: 0.28,
      emissive: 0x321306, emissiveIntensity: 0.18, transparent: true
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `${key}-flying-brown-panel${index ? `-${index + 1}` : ''}`
    mesh.userData.noCameraCollision = true
    group.add(mesh)
    return { mesh, span, id, index, clock: -1, checkedCycle: -1,
      delay: index === 0 ? 0 : index * 0.65 + random() * 0.3,
      period: WARNING + (span.maxZ - span.minZ + RUN_IN * 2) / 4.5 + RECOVERY }
  }))
  const collision = createDebrisCollision(player, panels.map(p => p.mesh))
  const scrapGeometry = new THREE.BoxGeometry(0.18, 0.04, 0.42)
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
    const elapsed = panel.clock - panel.delay
    const cycle = Math.floor(Math.max(0, elapsed) / panel.period)
    if (panel.checkedCycle !== cycle) {
      // A seeded flight regenerates exactly when Rewind returns to this cycle.
      const random = randomSource(seed ^ Math.imul(panel.id + 1, 0x9e3779b1) ^ Math.imul(cycle + 1, 0x85ebca6b))
      const dimensions = SHAPES[Math.floor(random() * SHAPES.length)]
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
      panel.duration = (panel.endZ - panel.startZ) / panel.speed
      collision.reset(panel.mesh)
      panel.checkedCycle = cycle
    }
    const phase = Math.max(0, elapsed) % panel.period
    const travel = THREE.MathUtils.clamp(phase - WARNING, 0, panel.duration)
    const z = panel.startZ + travel * panel.speed
    panel.mesh.visible = elapsed >= 0 && phase < WARNING + panel.duration
    panel.mesh.position.set(panel.x, panel.y, z)
    // Fade recycling outside the carriage, keeping the entire lethal crossing solid.
    panel.mesh.material.opacity = Math.min(1, phase / WARNING,
      Math.max(0, (panel.endZ - z) / RUN_IN))
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
    },
    getSnapshot: () => panels.map(p => p.clock),
    restoreSnapshot(clocks) {
      if (!enabled) return
      panels.forEach((p, i) => { p.clock = clocks[i]; apply(p) })
      applyScraps()
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
    }
    if (collision.update(active)) fail('Flying wreckage killed you! Dodge the large brown objects or Slow/Freeze their flight.')
  }

  function reset() {
    for (const panel of panels) { panel.clock = -1; panel.checkedCycle = -1; apply(panel) }
    applyScraps()
    collision.reset()
    enabled = true
  }
  reset()
  return { group, update, reset }
}

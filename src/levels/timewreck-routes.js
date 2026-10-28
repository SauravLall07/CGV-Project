import * as THREE from 'three'
import { switchingRecessGeometry } from '../environment/mechanical-reference.js'
import { signMaterial } from '../environment/textures.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// One-shot failures keep their intact baseline while the player observes.
export function createMaintenanceShutter({ root, timeSystem, unregisters, obstacles, player, z, minX, maxX, name }) {
  const group = new THREE.Group()
  group.name = name
  root.add(group)
  const brass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.8, roughness: 0.4 })
  const teal = new THREE.MeshStandardMaterial({ color: 0x315954, roughness: 0.65 })
  const width = maxX - minX
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, 0.18), teal)
  panel.position.set((minX + maxX) / 2, 3.85, z)
  group.add(panel)
  for (const x of [minX, maxX]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.8, 0.24), brass)
    rail.position.set(x, 1.9, z); group.add(rail)
  }
  const earlier = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry),
    new THREE.LineBasicMaterial({ color: 0x8bd9e8, transparent: true, opacity: 0.5 }))
  earlier.position.copy(panel.position); earlier.raycast = () => {}; group.add(earlier)
  const box = { minX, maxX, minZ: z - 0.09, maxZ: z + 0.09, enabled: false }
  obstacles.push(box)
  let clock = -1
  function apply() {
    const close = THREE.MathUtils.clamp(clock / 0.8, 0, 1)
    panel.position.y = 3.85 - close * 2.6
    const p = player.mesh.position
    box.enabled = panel.position.y - 1.25 < p.y + (player.isCrouching() ? 1.15 : 1.85)
    // A jammed shutter cannot crush a body occupying its threshold.
    if (Math.abs(p.z - z) < 0.24 && p.x > minX - 0.18 && p.x < maxX + 0.18 && box.enabled) {
      panel.position.y = Math.max(panel.position.y, p.y + (player.isCrouching() ? 1.15 : 1.85) + 1.27)
      box.enabled = false
    }
  }
  unregisters.push(timeSystem.register(group, {
    recordWhen: () => clock >= 0 && clock < 0.8,
    onUpdate(dt) {
      if (clock < 0 && player.mesh.position.z < z + 5 && player.mesh.position.z > z + 0.4) clock = 0
      else if (clock >= 0) clock = Math.min(0.8, clock + dt)
      apply()
    },
    getSnapshot: () => ({ clock }),
    restoreSnapshot(s) { clock = s.clock; apply() }
  }))
  return { z, apply, reset() { clock = -1; apply() } }
}

export function createWreckRoutes({ root, spans, player, timeSystem, unregisters, obstacles }) {
  const group = new THREE.Group(); group.name = 'convergence-route-fork'; root.add(group)
  const teal = new THREE.MeshStandardMaterial({ color: 0x315954, roughness: 0.6 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.8, roughness: 0.4 })
  const cyan = new THREE.MeshStandardMaterial({ color: 0x24545a, emissive: 0x38bdf8, emissiveIntensity: 0.6 })
  const c = spans.convergence.center
  const near = c + 9, far = c - 1
  function box(w, h, d, x, y, z, mat, name) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.name = name; group.add(m); return m
  }
  box(0.14, 2.9, near - far, 0.85, 1.45, (near + far) / 2, teal, 'fork-partition')
  obstacles.push({ minX: 0.78, maxX: 0.92, minZ: far, maxZ: near })
  // Wide enough for body and camera; low brass ceiling requires crouching.
  box(1.68, 0.12, 8, 1.76, 1.4, c + 4, brass, 'maintenance-low-ceiling')
  const low = { minX: 0.92, maxX: 2.6, minZ: c, maxZ: c + 8, enabled: true }
  obstacles.push(low)
  for (const x of [-0.5, 1.75]) box(0.5, 0.015, 1, x, 0.012, near + 1, x < 0 ? brass : cyan, 'fork-route-marker')
  // Read from the approach (+Z), above the real partition/low passage. Static
  // signs explain the tradeoff without inventing a second route mechanic.
  for (const [x, width, text, foreground] of [
    [-1.0, 2.9, 'DIRECT / FAST / EXPOSED', 0xd9b45e],
    [1.75, 1.6, 'LOW / SHELTERED', 0x8bd9e8]
  ]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.32), signMaterial({
      text, foreground, background: 0x1b2927, emissiveIntensity: 0.2, width: 1024
    }))
    sign.name = x < 0 ? 'fork-direct-sign' : 'fork-maintenance-sign'
    sign.position.set(x, 2.98, near + 0.2)
    sign.userData.noCameraCollision = true
    group.add(sign)
  }
  const recessZ = spans.mechanical.center + 2.7
  const recessMaterial = new THREE.MeshStandardMaterial({
    color: 0x39797c, emissive: 0x69bdcd, emissiveIntensity: 0.3, roughness: 0.72
  })
  const recess = new THREE.Mesh(switchingRecessGeometry(), recessMaterial)
  recess.name = 'mechanical-safe-switching-recess'
  recess.position.set(1.75, 0.026, recessZ)
  recess.userData.noCameraCollision = true
  group.add(recess)
  const shutters = [
    createMaintenanceShutter({ root, player, timeSystem, unregisters, obstacles,
      z: c + 4, minX: 0.92, maxX: 2.6, name: 'convergence-rewind-shutter' }),
    createMaintenanceShutter({ root, player, timeSystem, unregisters, obstacles,
      z: spans.mechanical.center, minX: -2.6, maxX: 2.6, name: 'mechanical-rewind-shutter' })
  ]
  return { shutters, recessZ, update() {
    const p = player.mesh.position
    const inside = p.x > 1.1 && p.z > c - 0.2 && p.z < c + 7.95
    const underExitBeam = Math.abs(p.z - (spans.passenger.center - 4.7)) < 0.265
    low.enabled = !player.isCrouching() && !inside
    // Keeping a low pose on release prevents standing into the visible roof;
    // movement is blocked at the entrance unless crouching.
    player.mesh.userData.tightCrouchCamera = inside || underExitBeam
    player.mesh.userData.wreckLowCeiling = inside || underExitBeam
    shutters.forEach(s => s.apply())
  }, reset() { shutters.forEach(s => s.reset()); player.mesh.userData.tightCrouchCamera = false; player.mesh.userData.wreckLowCeiling = false } }
}

export function createPassengerRack({ root, span, player, timeSystem, unregisters, obstacles, warn }) {
  const group = new THREE.Group(); group.name = 'passenger-falling-rack'; root.add(group)
  const z = span.center + 5.8
  const wood = new THREE.MeshStandardMaterial({ color: 0x634329, roughness: 0.7 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.8, roughness: 0.4 })
  const rack = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, 1.1), brass)
  rack.position.set(-1.05, 2.65, z); group.add(rack)
  for (const x of [-1.9, -1, -0.15]) {
    const luggage = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.8), wood)
    luggage.position.set(x + 1.05, 0.36, 0); rack.add(luggage)
  }
  // Same actual fall footprint, outlined so intact wood remains visible.
  const brackets = []
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const side = new THREE.BoxGeometry(0.045, 0.015, 0.3)
    side.translate(x * 1.4775, 0, z * 0.4)
    const end = new THREE.BoxGeometry(0.3, 0.015, 0.045)
    end.translate(x * 1.35, 0, z * 0.5275)
    brackets.push(side, end)
  }
  const markerGeometry = mergeGeometries(brackets, false)
  brackets.forEach(part => part.dispose())
  const marker = new THREE.Mesh(markerGeometry,
    new THREE.MeshStandardMaterial({ color: 0x9d6c28, emissive: 0xe49a30, emissiveIntensity: 0.8 }))
  marker.position.set(-1.05, 0.02, z); group.add(marker)
  marker.name = 'passenger-rack-fall-footprint'
  marker.userData.noCameraCollision = true
  const block = { minX: -2.55, maxX: 0.45, minZ: z - 0.55, maxZ: z + 0.55, enabled: false }
  obstacles.push(block)
  let clock = -1
  function apply() {
    const fall = THREE.MathUtils.clamp((clock - 0.9) / 0.65, 0, 1)
    rack.position.y = 2.65 - fall * 2.5
    rack.rotation.z = 0
    block.enabled = fall > 0.32
  }
  unregisters.push(timeSystem.register(group, {
    recordWhen: () => clock >= 0 && clock < 1.55,
    onUpdate(dt) { if (clock >= 0) clock = Math.min(1.55, clock + dt); apply() },
    getSnapshot: () => ({ clock }), restoreSnapshot(s) { clock = s.clock; apply() }
  }))
  return { update() {
    if (clock < 0 && player.mesh.position.z < z + 3.3 && player.mesh.position.z > z) {
      clock = 0; warn()
    }
  }, reset() { clock = -1; apply() } }
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Cosmetic fragments derive from the owning bridge angle, including snapshot
// restore. They never register their own history or add support/collision.
export function createRepairFragments({ leaves, width, length, wood, brass, name }) {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const pose = new THREE.Object3D()
  const parts = leaves.map(({ hinge, sign }) => {
    const splinters = new THREE.InstancedMesh(geometry, wood, 4)
    const straps = new THREE.InstancedMesh(geometry, brass, 2)
    for (const mesh of [splinters, straps]) {
      mesh.name = `${name}-repair-${mesh === straps ? 'straps' : 'splinters'}`
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), length + width + 1)
      mesh.userData.noCameraCollision = true; mesh.raycast = () => {}
      hinge.add(mesh)
    }
    return { sign, splinters, straps }
  })
  function update(angle) {
    const fracture = Math.min(1, Math.max(0, angle / 1.16))
    for (const { sign, splinters, straps } of parts) {
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1
        pose.position.set(side * (width / 2 - 0.06 + fracture * (0.15 + i * 0.03)),
          -0.07 - fracture * (0.18 + i * 0.04), sign * length * (0.72 + i * 0.06))
        pose.rotation.set(fracture * 0.7, side * fracture * 0.45, side * fracture * 0.9)
        pose.scale.set(0.1, 0.035, 0.2); pose.updateMatrix(); splinters.setMatrixAt(i, pose.matrix)
      }
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1
        pose.position.set(side * (width / 2 + 0.015), -0.14, sign * length * 0.65)
        pose.rotation.set(0, 0, side * fracture * 0.6)
        pose.scale.set(0.035, 0.2 + fracture * 0.14, 0.045); pose.updateMatrix(); straps.setMatrixAt(i, pose.matrix)
      }
      splinters.instanceMatrix.needsUpdate = true; straps.instanceMatrix.needsUpdate = true
    }
  }
  update(0)
  return { update }
}

export const WRECK_VIGNETTES = Object.freeze([
  { key: 'convergence', offset: -5, triggerNear: -4, triggerFar: -8, duration: 1.4, x: -2.95, y: 2.1 },
  { key: 'cargo', offset: -10.5, triggerNear: -9, triggerFar: -12.5, duration: 1.6, x: 3.05, y: 1.6 },
  { key: 'passenger', offset: 6.5, triggerNear: 4.5, triggerFar: 2, duration: 1.2, x: 3, y: 3.15 }
])

export function createWreckFeedback({ root, spans, player, timeSystem, unregisters, cue,
  playbackScale = () => 1 }) {
  const group = new THREE.Group(); group.name = 'wreck-staged-feedback'; root.add(group)
  const wood = new THREE.MeshStandardMaterial({ color: 0x634329, roughness: 0.72 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc4a052, metalness: 0.8, roughness: 0.4 })
  const teal = new THREE.MeshStandardMaterial({ color: 0x315954, roughness: 0.65 })
  const lining = new THREE.MeshStandardMaterial({ color: 0x542936, roughness: 0.9 })
  let paused = false, stopped = false, vaultClock = 0
  const pose = new THREE.Object3D()
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
  function batch(parent, material, pieces) {
    const mesh = new THREE.Mesh(mergeGeometries(pieces, false), material)
    pieces.forEach(g => g.dispose()); parent.add(mesh); return mesh
  }
  const events = WRECK_VIGNETTES.map((spec, index) => {
    const node = new THREE.Group(); node.name = `${spec.key}-background-vignette`; group.add(node)
    if (index === 0) {
      batch(node, teal, [box(0.5, 1.2, 0.08)])
      batch(node, brass, [-1, 1].flatMap(s => [box(0.04, 1.2, 0.1, s * 0.23), box(0.5, 0.04, 0.1, 0, s * 0.58)]))
    } else if (index === 1) {
      batch(node, wood, [box(0.75, 0.55, 0.9)])
      batch(node, brass, [-1, 1].flatMap(s => [box(0.04, 0.56, 0.91, s * 0.24), box(0.3, 0.04, 0.08, s * 0.18, 0.32)]))
    } else {
      batch(node, lining, [box(0.4, 1.05, 0.08)])
      batch(node, wood, [box(0.43, 0.045, 0.1, 0, 0.51), box(0.045, 1.05, 0.1, -0.2), box(0.045, 0.4, 0.1, 0.2, 0.32)])
    }
    const event = { spec, node, clock: -1, cued: false }
    function apply() {
      const u = THREE.MathUtils.clamp(event.clock / spec.duration, 0, 1)
      const t = u * u * (3 - 2 * u)
      const side = index === 0 ? -1 : 1
      node.position.set(spec.x + side * t * (index === 2 ? 0.9 : 2.4),
        spec.y + t * (index === 0 ? -2.3 : index === 1 ? 0.8 : -0.9),
        spans[spec.key].center + spec.offset - t * 0.8)
      node.rotation.set(t * 0.3, side * t * 0.7, side * t * 0.6)
    }
    event.apply = apply
    unregisters.push(timeSystem.register(node, {
      recordWhen: () => !paused && !stopped && event.clock >= 0 && event.clock < spec.duration,
      onUpdate(dt) {
        if (paused || stopped) return
        if (event.clock >= 0) event.clock = Math.min(spec.duration, event.clock + dt * playbackScale())
        apply()
      },
      getSnapshot: () => ({ clock: event.clock }),
      restoreSnapshot(s) { if (!paused && !stopped) { event.clock = s.clock; apply() } }
    }))
    apply(); return event
  })
  const valuables = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), brass, 3)
  valuables.name = 'vault-suspended-valuables'; group.add(valuables)
  valuables.boundingSphere = new THREE.Sphere(new THREE.Vector3(1.8, 1.15, spans.vault.center - 2.1), 0.6)
  function applyVault() {
    for (let i = 0; i < 3; i++) {
      pose.position.set(1.65 + i * 0.16, 1.15 + Math.sin(vaultClock * 1.4 + i) * 0.09,
        spans.vault.center - 2.1 + (i - 1) * 0.13)
      pose.rotation.set(0.15 * i, vaultClock * 0.4 + i, 0.2); pose.scale.set(0.65, 1, 0.65)
      pose.updateMatrix(); valuables.setMatrixAt(i, pose.matrix)
    }
    valuables.instanceMatrix.needsUpdate = true
  }
  unregisters.push(timeSystem.register(valuables, {
    onUpdate(dt) { if (!paused && !stopped) { vaultClock += dt * playbackScale(); applyVault() } },
    getSnapshot: () => ({ clock: vaultClock }),
    restoreSnapshot(s) { if (!paused && !stopped) { vaultClock = s.clock; applyVault() } }
  }))
  applyVault()
  group.traverse(n => { n.userData.noCameraCollision = true; n.raycast = () => {} })
  return { group,
    update(active = true) {
      if (!active || paused || stopped) return
      const p = player.mesh.position
      if (Math.abs(p.x) > 2.6) return
      for (const e of events) {
        const z = p.z - spans[e.spec.key].center
        if (e.clock < 0 && z <= e.spec.triggerNear && z >= e.spec.triggerFar) {
          e.clock = 0; e.apply()
          if (!e.cued && timeSystem.getMode() !== 'FREEZE' && timeSystem.getMode() !== 'REWIND') {
            cue(e.spec.key)
          }
          e.cued = true // Never replay a late cue after Freeze or a history rewind.
        }
      }
    },
    capture: () => ({ vaultClock, events: events.map(e => ({ clock: e.clock, cued: e.cued })) }),
    restore(saved) {
      stopped = false; vaultClock = saved.vaultClock; applyVault()
      events.forEach((e, i) => { e.clock = saved.events[i].clock; e.cued = saved.events[i].cued; e.apply() })
    },
    setPaused(value) { paused = value },
    stop() { stopped = true }
  }
}

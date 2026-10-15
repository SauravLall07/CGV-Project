import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Local to the wreck: Level 2's floor and machinery remain unchanged.
export const CARGO_GANGWAY = Object.freeze({
  minOffset: 3.8, maxOffset: 8.6, triggerOffset: 12.8,
  warning: 0.18, fallDuration: 0.65, width: 1.6, top: 0.1,
  maxAngle: 1.16, walkableAngle: 0.18
})

// Selectively record the failure, just like L2's one-shot Rewind machines.
// Waiting on the approach must never replace the intact baseline with idle
// snapshots of a broken bridge. Triggering is deliberately not mode-gated.
export function createCargoGangwayState() {
  let clock = -1
  const end = CARGO_GANGWAY.warning + CARGO_GANGWAY.fallDuration
  return {
    get clock() { return clock },
    get recording() { return clock >= 0 && clock < end },
    get angle() {
      const t = Math.max(0, Math.min(1, (clock - CARGO_GANGWAY.warning) / CARGO_GANGWAY.fallDuration))
      return t * t * (3 - 2 * t) * CARGO_GANGWAY.maxAngle
    },
    step(dt, inApproach) {
      if (dt <= 0) return
      if (clock < 0) {
        if (inApproach) clock = 0
      } else clock = Math.min(end, clock + dt)
    },
    snapshot: () => ({ clock }),
    restore(snapshot) { clock = snapshot.clock },
    reset() { clock = -1 }
  }
}

// The loop continues while the gangway rests broken. Both clocks use the
// shared time system, so Freeze holds a repaired deck and an open door.
export function cargoLoopPose(clock, out = {}) {
  const phase = ((clock % 9) + 9) % 9
  out.door = 1
  out.beam = 0
  out.colour = 0x10b981
  if (phase >= 2.5 && phase < 3.7) {
    out.door = 1 - (phase - 2.5) / 1.2
    out.colour = 0xf59e0b
  } else if (phase >= 3.7 && phase < 7.5) {
    out.door = 0
    out.beam = Math.max(0, Math.min(1, phase - 5))
    out.colour = 0xef4444
  } else if (phase >= 7.5) {
    out.door = (phase - 7.5) / 1.5
    out.beam = 1 - out.door
    out.colour = 0xa855f7
  }
  return out
}

export function cargoGangwayLayout(center, halfWidth) {
  return {
    minZ: center + CARGO_GANGWAY.minOffset,
    maxZ: center + CARGO_GANGWAY.maxOffset,
    triggerZ: center + CARGO_GANGWAY.triggerOffset,
    minX: -halfWidth, maxX: halfWidth
  }
}

// Cut all the way to the shell sides: no invisible floor or walkable edge
// remains beside the narrow hinged deck. Floor material/UV scale are retained.
export function cutCargoGangwayFloor(floor, span, layout) {
  const shapes = []
  for (const [minZ, maxZ] of [[span.minZ, layout.minZ], [layout.maxZ, span.maxZ]]) {
    const shape = new THREE.Shape()
    shape.moveTo(layout.minX, -(maxZ - span.center))
    shape.lineTo(layout.maxX, -(maxZ - span.center))
    shape.lineTo(layout.maxX, -(minZ - span.center))
    shape.lineTo(layout.minX, -(minZ - span.center))
    shape.closePath()
    shapes.push(shape)
  }
  const geometry = new THREE.ShapeGeometry(shapes)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / (layout.maxX - layout.minX) + 0.5,
      uv.getY(i) / (span.maxZ - span.minZ) + 0.5)
  }
  floor.geometry.dispose()
  floor.geometry = geometry
}

export function createCargoGangway({ root, layout, wood, brass, cyan }) {
  const state = createCargoGangwayState()
  const group = new THREE.Group()
  group.name = 'cargo-rewind-gangway'
  root.add(group)
  const halfLength = (layout.maxZ - layout.minZ) / 2
  const leaves = []
  for (const sign of [-1, 1]) {
    const hinge = new THREE.Group()
    hinge.name = sign < 0 ? 'cargo-gangway-approach-leaf' : 'cargo-gangway-exit-leaf'
    hinge.position.set(0, CARGO_GANGWAY.top, sign < 0 ? layout.maxZ : layout.minZ)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CARGO_GANGWAY.width, 0.12, halfLength), wood)
    deck.position.set(0, -0.06, sign * halfLength / 2)
    deck.castShadow = true
    deck.receiveShadow = true
    hinge.add(deck)
    for (const x of [-0.74, 0.74]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, halfLength), brass)
      rail.position.set(x, 0.025, sign * halfLength / 2)
      hinge.add(rail)
    }
    for (let d = 0.18; d < halfLength; d += 0.36) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.015, 0.018), brass)
      seam.position.set(0, 0.008, sign * d)
      hinge.add(seam)
    }
    const fracture = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.025, 0.045), cyan)
    fracture.position.set(0, 0.02, sign * (halfLength - 0.03))
    hinge.add(fracture)
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.85, 8), brass)
    axle.rotation.z = Math.PI / 2
    hinge.add(axle)
    group.add(hinge)
    leaves.push({ hinge, sign })
  }
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(CARGO_GANGWAY.width, 0.12, halfLength * 2)),
    new THREE.LineBasicMaterial({ color: 0xa5d8ec, transparent: true, opacity: 0.65 })
  )
  outline.name = 'cargo-gangway-restored-outline'
  outline.position.set(0, CARGO_GANGWAY.top - 0.06, (layout.minZ + layout.maxZ) / 2)
  outline.raycast = () => {}
  group.add(outline)
  // Fixed mating stops lie on the solid lips, behind each hinge. Their short
  // brass rails meet the moving leaf rails only in the restored flat pose.
  // Nothing spans the hole or suggests an extra walkable side route.
  const stopParts = []
  for (const [z, direction] of [[layout.maxZ, 1], [layout.minZ, -1]]) {
    for (const x of [-0.74, 0.74]) {
      const rail = new THREE.BoxGeometry(0.055, 0.06, 0.24)
      rail.translate(x, CARGO_GANGWAY.top + 0.025, z + direction * 0.12)
      stopParts.push(rail)
      const crossbar = new THREE.BoxGeometry(0.18, 0.025, 0.045)
      crossbar.translate(x, CARGO_GANGWAY.top + 0.025, z + direction * 0.22)
      stopParts.push(crossbar)
    }
  }
  const stops = new THREE.Mesh(mergeGeometries(stopParts, false), brass)
  stopParts.forEach(part => part.dispose())
  stops.name = 'cargo-gangway-fixed-hinge-stops'
  group.add(stops)
  // Mutate persistent strips instead of allocating support objects per frame.
  const supports = Array.from({ length: 24 }, () => ({ minX: 0, maxX: -1, minZ: 0, maxZ: -1, y: 0 }))
  function apply() {
    const angle = state.angle
    outline.visible = angle > 0.02
    let index = 0
    for (const { hinge, sign } of leaves) {
      hinge.rotation.x = sign * angle
      for (let i = 0; i < 12; i++) {
        const support = supports[index++]
        const d0 = halfLength * i / 12
        const d1 = halfLength * (i + 1) / 12
        const z0 = hinge.position.z + sign * Math.cos(angle) * d0
        const z1 = hinge.position.z + sign * Math.cos(angle) * d1
        support.minX = angle <= CARGO_GANGWAY.walkableAngle ? -CARGO_GANGWAY.width / 2 : 0
        support.maxX = angle <= CARGO_GANGWAY.walkableAngle ? CARGO_GANGWAY.width / 2 : -1
        support.minZ = Math.min(z0, z1)
        support.maxZ = Math.max(z0, z1)
        support.y = CARGO_GANGWAY.top - Math.sin(angle) * (d0 + d1) / 2
      }
    }
  }
  group.traverse((node) => { node.userData.noCameraCollision = true })
  apply()
  return { group, state, supports, apply }
}

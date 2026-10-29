import * as THREE from 'three'
import { woodMaterial } from './textures.js'

// Level 2 Passenger: the porter's louvred luggage cabinet. A tall wardrobe
// against the wall whose doors are slatted, so a player shut inside still
// sees the aisle through the gaps (they hide in first person).
//
// The group's origin is the centre of the front face at floor level and the
// carcass runs along local +X, so placing it is one position plus a yaw that
// turns local +X toward the wall. Sizes come from carriage-bounds.js
// (LUGGAGE_CABINET), which also builds its collider.

const PLINTH = 0.1
const DOOR_OPEN_ANGLE = 1.7
const DOOR_SPEED = 7
// How long the doors stay open while the player steps in or out.
const DOOR_HOLD = 0.32

export function createLuggageCabinet({ depth, halfZ, height }) {
  const group = new THREE.Group()
  group.name = 'luggage-cabinet'

  const carcassMat = woodMaterial({ repeat: [1, 2], light: 0x5a3418, dark: 0x2a160a })
  const doorMat = woodMaterial({ repeat: [1, 1], light: 0x6a3e1c, dark: 0x341b0c })
  const liningMat = new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 0.95, metalness: 0 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })

  const add = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  // Carcass: sides, back, top, plinth and a cornice across the front.
  const t = 0.05
  for (const s of [-1, 1]) add(group, new THREE.BoxGeometry(depth, height, t), carcassMat, depth / 2, height / 2, s * (halfZ - t / 2))
  add(group, new THREE.BoxGeometry(t, height, halfZ * 2), liningMat, depth - t / 2, height / 2, 0)
  add(group, new THREE.BoxGeometry(depth, t, halfZ * 2), carcassMat, depth / 2, height - t / 2, 0)
  add(group, new THREE.BoxGeometry(depth, PLINTH, halfZ * 2), carcassMat, depth / 2, PLINTH / 2, 0)
  add(group, new THREE.BoxGeometry(0.08, 0.1, halfZ * 2 + 0.08), carcassMat, 0.02, height + 0.03, 0)
  add(group, new THREE.BoxGeometry(0.03, 0.03, halfZ * 2 + 0.1), brass, -0.02, height - 0.02, 0)

  // Inside: a hat shelf, a coat on the rail and a case on the floor, kept to
  // the back and sides so the player's spot in the middle stays clear.
  add(group, new THREE.BoxGeometry(depth - 0.1, 0.03, halfZ * 2 - 0.1), liningMat, depth / 2, 1.98, 0)
  const rail = add(group, new THREE.CylinderGeometry(0.015, 0.015, halfZ * 2 - 0.12, 8), brass, depth - 0.22, 1.86, 0)
  rail.rotation.x = Math.PI / 2
  add(group, new THREE.BoxGeometry(0.16, 0.95, 0.42), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 }),
    depth - 0.22, 1.36, halfZ - 0.3)
  add(group, new THREE.BoxGeometry(0.42, 0.55, 0.22), new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.8 }),
    depth - 0.3, PLINTH + 0.275, -(halfZ - 0.2))
  const hat = new THREE.Group()
  hat.position.set(depth - 0.35, 1.995, -0.35)
  add(hat, new THREE.CylinderGeometry(0.17, 0.17, 0.015, 18), liningMat, 0, 0.01, 0)
  add(hat, new THREE.CylinderGeometry(0.1, 0.11, 0.12, 18), liningMat, 0, 0.07, 0)
  group.add(hat)

  // Two louvred doors hinged on the front corners. Each pivot sits on its
  // hinge; the door runs from there to the centre line.
  const doorWidth = halfZ - 0.01
  const doorHeight = height - PLINTH - 0.08
  const stile = 0.06
  const slatSpacing = 0.13
  const doors = []
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.name = 'luggage-cabinet-door'
    pivot.position.set(0, PLINTH + 0.02, side * halfZ)
    group.add(pivot)
    const leaf = new THREE.Group()
    leaf.position.z = -side * doorWidth / 2
    pivot.add(leaf)

    for (const z of [-1, 1]) add(leaf, new THREE.BoxGeometry(0.035, doorHeight, stile), doorMat, 0, doorHeight / 2, z * (doorWidth / 2 - stile / 2))
    for (const y of [stile / 2, doorHeight * 0.52, doorHeight - stile / 2]) {
      add(leaf, new THREE.BoxGeometry(0.035, stile, doorWidth), doorMat, 0, y, 0)
    }
    // Slats tilt down toward the aisle, like any louvre: the gaps between
    // them are the player's view out.
    for (let y = stile + slatSpacing / 2; y < doorHeight - stile; y += slatSpacing) {
      if (Math.abs(y - doorHeight * 0.52) < stile) continue
      const slat = add(leaf, new THREE.BoxGeometry(0.012, 0.06, doorWidth - stile * 2), doorMat, 0, y, 0)
      slat.rotation.z = 0.6
    }
    const knob = add(leaf, new THREE.SphereGeometry(0.028, 10, 8), brass, -0.04, doorHeight * 0.48, -side * (doorWidth / 2 - 0.08))
    knob.castShadow = false
    // The doors never stand between the player and the latch they reach for.
    leaf.traverse((node) => { node.userData.noInteractionBlocker = true })
    doors.push({ pivot, side })
  }

  // What a player shut inside reaches for to get out: just inside the doors,
  // at hand height. It has no meshes, so focusing it highlights nothing and
  // the louvres keep their colour while you peer through them.
  const exitAnchor = new THREE.Object3D()
  exitAnchor.name = 'luggage-cabinet-latch'
  exitAnchor.position.set(0.08, 1.0, 0)
  group.add(exitAnchor)

  let open = 0
  let target = 0
  let hold = 0

  // Swing the doors open, then shut again once the player is through.
  function swing() {
    target = 1
    hold = DOOR_HOLD
  }

  function update(delta) {
    if (hold > 0) {
      hold = Math.max(0, hold - delta)
      if (hold === 0) target = 0
    }
    open += (target - open) * Math.min(1, delta * DOOR_SPEED)
    if (Math.abs(target - open) < 1e-3) open = target
    // Both doors open outward, toward the aisle (local -X).
    for (const { pivot, side } of doors) pivot.rotation.y = side * open * DOOR_OPEN_ANGLE
  }

  function reset() {
    open = 0
    target = 0
    hold = 0
    update(0)
  }

  return { group, exitAnchor, swing, update, reset, getOpen: () => open }
}

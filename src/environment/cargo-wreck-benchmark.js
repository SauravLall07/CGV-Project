import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Static L3 dressing, owned by the Cargo shell. The actual repairable deck,
// loop load and swinging freight remain separate level-owned objects.
export function addCargoWreckBenchmark(group, { wood, leather, brass }) {
  const batches = new Map([[wood, []], [leather, []], [brass, []]])
  const pose = new THREE.Object3D()
  function box(material, size, position, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(...size)
    pose.position.set(...position)
    pose.rotation.set(...rotation)
    pose.updateMatrix()
    geometry.applyMatrix4(pose.matrix)
    batches.get(material).push(geometry)
  }

  // A luggage rack folds towards the existing left-side rupture. Large open
  // ribs frame the gap without spanning it at floor height. The old brass
  // fascia remains attached along the outside of this exposed timber backing.
  box(wood, [0.16, 0.2, 2.1], [-2.3, 3.05, 7.35])
  box(wood, [0.16, 0.2, 1.65], [-2.15, 2.94, 5.5], [-0.14, 0.1, 0])
  for (const [z, y, tilt] of [[8.15, 3.04, -0.1], [6.9, 3.0, -0.18], [5.2, 2.9, -0.3]]) {
    box(brass, [0.95, 0.08, 0.1], [-1.93, y, z], [0, 0.12, tilt])
    box(wood, [0.64, 0.12, 0.2], [-1.96, y + 0.06, z + 0.12], [0, 0.12, tilt])
  }
  // Split lining leaves and snapped luggage straps pull towards the missing
  // hull, with a visible attachment at the rack rather than floating litter.
  for (const [z, y, lean] of [[7.7, 2.88, -0.22], [5.75, 2.8, -0.36]]) {
    box(leather, [0.055, 0.32, 0.86], [-2.26, y, z], [0.16, 0, lean])
    box(leather, [0.07, 0.22, 0.06], [-1.64, y - 0.04, z], [0, 0, -0.25])
    box(leather, [0.07, 0.12, 0.06], [-1.69, y - 0.18, z], [0, 0, -0.65])
    box(brass, [0.09, 0.06, 0.08], [-1.61, y + 0.08, z])
  }

  // Two strapped freight cases have burst outward through the right wall.
  // Every vertex stays beyond X=2.55, outside the playable body envelope.
  // The composition ends before Z=-5.5, well upstream of the -7 freight sweep.
  for (const [x, y, z, width, height, depth] of [
    [3.04, 0.52, -4.75, 0.78, 0.92, 1.25],
    [3.12, 1.34, -4.62, 0.68, 0.66, 0.95]
  ]) {
    // Open slats expose the broken case interior; no broad false floor top.
    for (const side of [-1, 1]) {
      box(wood, [width, height, 0.08], [x, y, z + side * depth / 2])
      box(wood, [0.08, height, depth], [x + side * width / 2, y, z])
      for (const edge of [-1, 1]) {
        box(brass, [width + 0.04, 0.055, 0.045], [x, y + side * height * 0.3, z + edge * depth / 2])
        box(brass, [0.045, 0.055, depth], [x + edge * width / 2, y + side * height * 0.3, z])
      }
    }
    box(leather, [0.04, height + 0.05, 0.11], [x - width / 2 - 0.045, y, z])
  }
  // The lid and splinters lean outward, never into the checkpoint/recharge lane.
  box(wood, [0.54, 0.08, 1.1], [3.2, 1.8, -4.65], [0.12, 0, 0.55])
  box(wood, [0.1, 0.65, 0.12], [2.85, 1.36, -5.12], [0.15, 0, -0.28])
  box(wood, [0.09, 0.5, 0.11], [3.38, 1.42, -4.27], [-0.2, 0, 0.32])
  box(leather, [0.055, 0.55, 0.1], [2.78, 1.06, -4.64], [0, 0, -0.2])

  const root = new THREE.Group()
  root.name = 'cargo-wreck-benchmark'
  for (const [material, pieces] of batches) {
    const geometry = mergeGeometries(pieces, false)
    pieces.forEach(piece => piece.dispose())
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `cargo-wreck-${material === wood ? 'timber' : material === leather ? 'lining' : 'straps'}`
    mesh.userData.noCameraCollision = true
    root.add(mesh)
  }
  group.add(root)
  return root
}

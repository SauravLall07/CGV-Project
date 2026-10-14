import { addInstances, box, mergeParts, place } from './geom.js'

// Wooden slats on an iron frame. Local +X is the back, so a yaw of 0 faces
// the seat toward the plaza (world -X).

function woodGeometry() {
  const parts = []
  for (let i = 0; i < 4; i += 1) {
    parts.push(box(0.08, 0.045, 1.45, -0.12 + i * 0.1, 0.48, 0))
  }
  for (let i = 0; i < 3; i += 1) {
    parts.push(box(0.045, 0.1, 1.4, 0.22, 0.66 + i * 0.14, 0))
  }
  return mergeParts(parts)
}

function ironGeometry() {
  const parts = []
  for (const z of [-0.58, 0.58]) {
    parts.push(box(0.06, 0.48, 0.06, -0.16, 0.24, z))
    parts.push(box(0.06, 0.48, 0.06, 0.16, 0.24, z))
    parts.push(box(0.4, 0.04, 0.05, 0, 0.46, z))
    parts.push(box(0.05, 0.42, 0.05, 0.2, 0.7, z))
  }
  parts.push(box(0.05, 0.05, 1.2, 0.2, 0.92, 0))
  return mergeParts(parts)
}

export function addBenches(parent, spots, materials, stats) {
  const woods = []
  const irons = []
  for (const spot of spots) {
    const matrix = place(spot.x, spot.y, spot.z, spot.yaw || 0)
    woods.push(matrix)
    irons.push(matrix.clone())
  }
  addInstances(parent, woodGeometry(), materials.crate, woods, { name: 'landing-benches' }, stats)
  addInstances(parent, ironGeometry(), materials.iron, irons, { name: 'landing-bench-frames' }, stats)
}

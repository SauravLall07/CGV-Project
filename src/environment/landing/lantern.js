import * as THREE from 'three'
import { addInstances, box, mergeParts, place } from './geom.js'

// Wall lantern and the head of a lamp post share this cage. The glow is an
// emissive box; a real point light is optional and only on the few that the
// light pool should be able to pick up.

function cageGeometry() {
  const d = 0.16
  return mergeParts([
    box(0.08, 0.1, 0.22, 0, 0.28, 0),
    box(0.06, 0.34, 0.06, 0, 0.08, -0.1),
    box(0.06, 0.34, 0.06, 0, 0.08, 0.1),
    box(0.06, 0.06, 0.26, 0, 0.24, 0),
    box(0.06, 0.05, 0.26, 0, -0.08, 0),
    box(0.28, 0.06, 0.08, -0.12, 0.3, 0),
    box(d, 0.08, 0.08, -0.22, 0.22, 0)
  ])
}

function glowGeometry() {
  return box(0.1, 0.22, 0.14, 0, 0.08, 0)
}

export function addLanterns(parent, placements, materials, stats) {
  const cages = []
  const glows = []
  for (const placement of placements) {
    const matrix = place(placement.x, placement.y, placement.z, placement.yaw || 0)
    cages.push(matrix)
    glows.push(matrix.clone())
    if (!placement.light) continue
    const light = new THREE.PointLight(
      placement.color ?? 0xffb067,
      placement.intensity ?? 12,
      placement.distance ?? 12,
      2
    )
    light.name = 'landing-lantern'
    light.castShadow = false
    light.position.set(placement.x, placement.y + 0.08, placement.z)
    parent.add(light)
  }
  addInstances(parent, cageGeometry(), materials.iron, cages, { name: 'landing-lantern-cages' }, stats)
  addInstances(parent, glowGeometry(), materials.lantern, glows, { name: 'landing-lantern-glow' }, stats)
}

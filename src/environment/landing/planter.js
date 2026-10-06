import * as THREE from 'three'
import { addInstances, box, mergeParts, place } from './geom.js'

function stoneGeometry() {
  return mergeParts([
    box(0.85, 0.55, 0.85, 0, 0.28, 0, 1.2),
    box(0.98, 0.08, 0.98, 0, 0.58, 0, 1.2),
    box(0.7, 0.08, 0.7, 0, 0.08, 0, 1.2)
  ])
}

function shrubGeometry() {
  const ball = new THREE.SphereGeometry(0.36, 10, 8)
  ball.translate(0, 0.98, 0)
  const side = new THREE.SphereGeometry(0.22, 8, 6)
  side.translate(0.16, 0.82, 0.08)
  return mergeParts([ball, side])
}

export function addPlanters(parent, spots, materials, stats) {
  const stones = []
  const shrubs = []
  for (const spot of spots) {
    const matrix = place(spot.x, spot.y, spot.z, spot.yaw || 0)
    stones.push(matrix)
    shrubs.push(matrix.clone())
  }
  addInstances(parent, stoneGeometry(), materials.stoneTrim, stones, {
    receiveShadow: true,
    name: 'landing-planters'
  }, stats)
  addInstances(parent, shrubGeometry(), materials.shrub, shrubs, { name: 'landing-shrubs' }, stats)
}

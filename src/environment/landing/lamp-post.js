import * as THREE from 'three'
import { addInstances, box, mergeParts, place } from './geom.js'

// Cast-iron standard. The head reuses the same lantern proportions as the
// wall brackets. Small parts: the whole post skips the shadow map.

function postGeometry() {
  const shaft = new THREE.CylinderGeometry(0.07, 0.1, 3.55, 8)
  shaft.translate(0, 1.95, 0)
  const parts = [
    box(0.42, 0.12, 0.42, 0, 0.06, 0),
    box(0.28, 0.1, 0.28, 0, 0.16, 0),
    shaft,
    box(0.22, 0.08, 0.22, 0, 3.78, 0),
    box(0.16, 0.34, 0.16, 0, 4.15, 0),
    box(0.2, 0.06, 0.2, 0, 4.34, 0)
  ]
  return mergeParts(parts)
}

function headGeometry() {
  return mergeParts([
    box(0.05, 0.28, 0.05, -0.1, 4.12, -0.1),
    box(0.05, 0.28, 0.05, 0.1, 4.12, -0.1),
    box(0.05, 0.28, 0.05, -0.1, 4.12, 0.1),
    box(0.05, 0.28, 0.05, 0.1, 4.12, 0.1),
    box(0.24, 0.04, 0.24, 0, 4.28, 0)
  ])
}

function glowGeometry() {
  return box(0.14, 0.2, 0.14, 0, 4.12, 0)
}

// The head sits about 4 m up. A cutoff of 6.5 m reaches about 5 m out
// across the cobbles, so the pool is roughly 10 m across. 220 candela
// keeps that disc strong, and posts farther apart than that still have
// a dark gap between them.
export const LAMP_INTENSITY = 220

export function addLampPosts(parent, posts, materials, stats) {
  const poles = []
  const cages = []
  const glows = []
  for (const post of posts) {
    const matrix = place(post.x, post.y, post.z, post.yaw || 0)
    poles.push(matrix)
    cages.push(matrix.clone())
    glows.push(matrix.clone())
    const light = new THREE.PointLight(0xffb060, LAMP_INTENSITY, 6.5, 2)
    light.name = post.flicker ? 'landing-lamp-flicker' : 'landing-lamp'
    light.castShadow = false
    light.position.set(post.x, post.y + 4.12, post.z)
    parent.add(light)
  }
  const glowMaterial = materials.lantern.clone()
  glowMaterial.emissiveIntensity = 5
  addInstances(parent, postGeometry(), materials.iron, poles, { name: 'landing-lamp-posts' }, stats)
  addInstances(parent, headGeometry(), materials.iron, cages, { name: 'landing-lamp-cages' }, stats)
  addInstances(parent, glowGeometry(), glowMaterial, glows, { name: 'landing-lamp-glow' }, stats)
}

import * as THREE from 'three'
import { createParticleField } from '../particles.js'
import { addBenches } from './bench.js'
import { addCars } from './car.js'
import { addMesh, box, mergeParts } from './geom.js'
import { FACADE_X, Z_MAX, Z_MIN } from './layout.js'
import { addLampPosts } from './lamp-post.js'
import { addPlanters } from './planter.js'

// Cobbles in front of the west facade, plus the street furniture. The plaza
// stops at the rail side (x ≈ 9); the walkable platform never reaches it.

const PLAZA_X0 = 8.7
const PLAZA_X1 = FACADE_X - 0.15
const PLAZA_Z0 = Z_MIN - 2.2
const PLAZA_Z1 = Z_MAX + 2.2

function addPlaza(parent, materials, stats) {
  const width = PLAZA_X1 - PLAZA_X0
  const length = PLAZA_Z1 - PLAZA_Z0
  const repeatX = width / 2.05
  const repeatY = length / 2.05
  for (const map of [materials.cobble.map, materials.cobble.normalMap, materials.cobble.roughnessMap]) {
    map.repeat.set(repeatX, repeatY)
  }
  const stone = new THREE.PlaneGeometry(width, length)
  stone.rotateX(-Math.PI / 2)
  stone.translate((PLAZA_X0 + PLAZA_X1) / 2, 0.045, (PLAZA_Z0 + PLAZA_Z1) / 2)
  addMesh(parent, stone, materials.cobble, {
    receiveShadow: true,
    name: 'landing-plaza'
  }, stats)

  // Quay down to the ballast, so the cobbles read as a platform rather than
  // a slab floating over the corridor floor.
  addMesh(parent, box(
    0.45, 1.35, length,
    PLAZA_X0 + 0.1, -0.55, (PLAZA_Z0 + PLAZA_Z1) / 2, 1.6
  ), materials.stone, {
    castShadow: true,
    receiveShadow: true,
    name: 'landing-quay'
  }, stats)
}

function addLuggage(parent, materials, stats) {
  const wood = []
  const iron = []
  const crates = [
    { w: 0.7, h: 0.55, d: 0.55, x: 21.6, y: 0.28, z: 13.4 },
    { w: 0.5, h: 0.4, d: 0.48, x: 21.9, y: 0.75, z: 13.15 },
    { w: 0.62, h: 0.48, d: 0.5, x: 21.5, y: 0.25, z: 24.2 },
    { w: 0.4, h: 0.32, d: 0.4, x: 21.2, y: 0.64, z: 24.45 }
  ]
  for (const crate of crates) {
    wood.push(box(crate.w, crate.h, crate.d, crate.x, crate.y, crate.z))
    iron.push(box(crate.w + 0.02, 0.04, 0.04, crate.x, crate.y, crate.z + crate.d / 2))
    iron.push(box(crate.w + 0.02, 0.04, 0.04, crate.x, crate.y, crate.z - crate.d / 2))
  }
  const trunk = box(0.85, 0.38, 0.48, 20.8, 0.22, 24.9)
  const lid = new THREE.CylinderGeometry(0.24, 0.24, 0.85, 10, 1, false, 0, Math.PI)
  lid.rotateZ(Math.PI / 2)
  lid.translate(20.8, 0.41, 24.9)
  wood.push(trunk, lid)
  iron.push(box(0.9, 0.04, 0.04, 20.8, 0.4, 25.14))
  addMesh(parent, mergeParts(wood), materials.crate, { name: 'landing-luggage' }, stats)
  addMesh(parent, mergeParts(iron), materials.iron, { name: 'landing-luggage-straps' }, stats)
}

function addFlags(parent, materials, stats) {
  const poles = []
  const banners = []
  const spots = [
    { x: 13.2, z: 8.4 },
    { x: 12.6, z: 18.6 },
    { x: 13.2, z: 29.4 }
  ]
  for (const spot of spots) {
    const pole = new THREE.CylinderGeometry(0.045, 0.06, 6.2, 8)
    pole.translate(spot.x, 3.1, spot.z)
    poles.push(pole)
    const finial = new THREE.SphereGeometry(0.09, 8, 6)
    finial.translate(spot.x, 6.25, spot.z)
    poles.push(finial)

    const cloth = new THREE.PlaneGeometry(0.72, 1.7)
    cloth.translate(0.36, -0.85, 0)
    const banner = new THREE.Mesh(cloth, materials.banner)
    banner.position.set(spot.x, 5.7, spot.z)
    banner.castShadow = false
    banner.name = 'landing-banner'
    parent.add(banner)
    banners.push(banner)
    stats.draws += 1
    stats.triangles += 2
  }
  addMesh(parent, mergeParts(poles), materials.iron, { name: 'landing-flagpoles' }, stats)
  return banners
}

function addShelter(parent, materials, stats) {
  // Open roof beside the right wing, over the rails' north end, so the
  // steam reads as coming from the trains rather than from a chimney.
  const roof = box(6.2, 0.14, 12.5, 13.4, 5.15, 33.2)
  const posts = []
  for (const x of [10.6, 16.1]) {
    for (const z of [27.4, 38.6]) {
      posts.push(box(0.16, 5.1, 0.16, x, 2.55, z))
    }
  }
  addMesh(parent, roof, materials.roof, { castShadow: true, name: 'landing-shelter' }, stats)
  addMesh(parent, mergeParts(posts), materials.iron, { name: 'landing-shelter-posts' }, stats)
}

export function buildForecourt(parent, materials, stats) {
  addPlaza(parent, materials, stats)
  addLuggage(parent, materials, stats)
  addShelter(parent, materials, stats)

  addLampPosts(parent, [
    { x: 11.4, y: 0.05, z: 2.2 },
    { x: 11.6, y: 0.05, z: 9.2 },
    { x: 11.2, y: 0.05, z: 16.4 },
    { x: 11.5, y: 0.05, z: 23.8 },
    { x: 11.3, y: 0.05, z: 31.2 },
    { x: 11.6, y: 0.05, z: 37.4 }
  ], materials, stats)

  addBenches(parent, [
    { x: 18.4, y: 0.05, z: 8.6 },
    { x: 18.4, y: 0.05, z: 28.8 },
    { x: 16.2, y: 0.05, z: 4.6, yaw: 0.4 }
  ], materials, stats)

  addPlanters(parent, [
    { x: 20.2, y: 0.05, z: 14.6 },
    { x: 20.2, y: 0.05, z: 22.6 },
    { x: 19.4, y: 0.05, z: 6.2 },
    { x: 19.4, y: 0.05, z: 31.2 },
    { x: 17.2, y: 0.05, z: 2.4 }
  ], materials, stats)

  addCars(parent, [
    { x: 15.6, y: 0.05, z: 1.85, yaw: 0.08 },
    { x: 14.2, y: 0.05, z: 36.4, yaw: -0.18 },
    { x: 16.8, y: 0.05, z: 33.1, yaw: 0.35 }
  ], materials, stats)

  const banners = addFlags(parent, materials, stats)

  const steam = createParticleField({
    count: 64,
    area: { halfX: 1.7, minY: 0, maxY: 10.5, minZ: -1.3, maxZ: 1.3 },
    color: 0xd2d6db,
    size: 0.85,
    opacity: 0.26,
    gravity: 1.25,
    drift: 0.38,
    seed: 23
  })
  steam.points.position.set(12.4, 2.4, 32.6)
  steam.points.name = 'landing-steam'
  parent.add(steam.points)
  stats.draws += 1

  let time = 0
  function update(delta) {
    time += delta
    steam.update(delta)
    for (let i = 0; i < banners.length; i += 1) {
      banners[i].rotation.y = Math.sin(time * 0.65 + i * 1.7) * 0.12
    }
  }

  return { update }
}

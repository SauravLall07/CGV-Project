import * as THREE from 'three'
import { createParticleField } from '../particles.js'
import { addBenches } from './bench.js'
import { addCars } from './car.js'
import { addMesh, box, mergeParts } from './geom.js'
import { FACADE_X, PLAZA } from './layout.js'
import { addLampPosts, LAMP_INTENSITY } from './lamp-post.js'
import { addPlanters } from './planter.js'

// Cobbles in front of the west facade, plus the street furniture. The plaza
// stops at the rail side (x ≈ 9); the walkable platform never reaches it.

const PLAZA_X0 = PLAZA.minX
const PLAZA_X1 = PLAZA.maxX
const PLAZA_Z0 = PLAZA.minZ
const PLAZA_Z1 = PLAZA.maxZ

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
  for (const crate of CRATES) {
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
  const posts = SHELTER_POSTS.map((post) => box(0.16, 5.1, 0.16, post.x, 2.55, post.z))
  addMesh(parent, roof, materials.roof, { castShadow: true, name: 'landing-shelter' }, stats)
  addMesh(parent, mergeParts(posts), materials.iron, { name: 'landing-shelter-posts' }, stats)
}

// A chain of pools from the spawn (13.55, 14.35) up to the steps, plus one
// lamp on the west edge that is close enough to the opening view to stay
// in the light pool. That edge lamp is the one that flickers.
const LAMPS = [
  { x: 10.5, y: 0.05, z: 23.2, flicker: true },
  { x: 12.2, y: 0.05, z: 13.0 },
  { x: 15.2, y: 0.05, z: 15.15 },
  { x: 17.15, y: 0.05, z: 15.55 },
  { x: 16.5, y: 0.05, z: 20.4 },
  { x: 18.5, y: 0.05, z: 17.15 }
]

const BENCHES = [
  { x: 18.4, y: 0.05, z: 8.6 },
  { x: 18.4, y: 0.05, z: 28.8 },
  { x: 16.2, y: 0.05, z: 4.6, yaw: 0.4 }
]

const PLANTERS = [
  { x: 20.2, y: 0.05, z: 14.6 },
  { x: 20.2, y: 0.05, z: 22.6 },
  { x: 19.4, y: 0.05, z: 6.2 },
  { x: 19.4, y: 0.05, z: 31.2 },
  { x: 17.2, y: 0.05, z: 2.4 }
]

const CARS = [
  { x: 15.6, y: 0.05, z: 1.85, yaw: 0.08 },
  { x: 14.2, y: 0.05, z: 36.4, yaw: -0.18 },
  { x: 16.8, y: 0.05, z: 33.1, yaw: 0.35 }
]

const CRATES = [
  { w: 0.7, h: 0.55, d: 0.55, x: 21.6, y: 0.28, z: 13.4 },
  { w: 0.5, h: 0.4, d: 0.48, x: 21.9, y: 0.75, z: 13.15 },
  { w: 0.62, h: 0.48, d: 0.5, x: 21.5, y: 0.25, z: 24.2 },
  { w: 0.4, h: 0.32, d: 0.4, x: 21.2, y: 0.64, z: 24.45 }
]

const SHELTER_POSTS = [
  { x: 10.6, z: 27.4 },
  { x: 16.1, z: 27.4 },
  { x: 10.6, z: 38.6 },
  { x: 16.1, z: 38.6 }
]

function yawBox(x, z, halfX, halfZ, yaw = 0, pad = 0.12) {
  const c = Math.abs(Math.cos(yaw))
  const s = Math.abs(Math.sin(yaw))
  const hx = halfX * c + halfZ * s + pad
  const hz = halfX * s + halfZ * c + pad
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }
}

function forecourtColliders() {
  const boxes = []
  for (const lamp of LAMPS) boxes.push(yawBox(lamp.x, lamp.z, 0.24, 0.24))
  for (const bench of BENCHES) boxes.push(yawBox(bench.x, bench.z, 0.28, 0.78, bench.yaw || 0))
  for (const planter of PLANTERS) boxes.push(yawBox(planter.x, planter.z, 0.52, 0.52))
  for (const car of CARS) boxes.push(yawBox(car.x, car.z, 0.85, 2.2, car.yaw || 0, 0.2))
  for (const crate of CRATES) {
    boxes.push({
      minX: crate.x - crate.w / 2,
      maxX: crate.x + crate.w / 2,
      minZ: crate.z - crate.d / 2,
      maxZ: crate.z + crate.d / 2
    })
  }
  boxes.push({ minX: 20.35, maxX: 21.3, minZ: 24.6, maxZ: 25.2 })
  for (const post of SHELTER_POSTS) boxes.push(yawBox(post.x, post.z, 0.16, 0.16, 0, 0.06))
  return boxes
}

export function buildForecourt(parent, materials, stats) {
  addPlaza(parent, materials, stats)
  addLuggage(parent, materials, stats)
  addShelter(parent, materials, stats)

  addLampPosts(parent, LAMPS, materials, stats)
  addBenches(parent, BENCHES, materials, stats)
  addPlanters(parent, PLANTERS, materials, stats)
  addCars(parent, CARS, materials, stats)

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

  const flicker = parent.getObjectByName('landing-lamp-flicker')
  let time = 0
  function update(delta) {
    time += delta
    steam.update(delta)
    for (let i = 0; i < banners.length; i += 1) {
      banners[i].rotation.y = Math.sin(time * 0.65 + i * 1.7) * 0.12
    }
    if (flicker) {
      const a = Math.sin(time * 2.3)
      const b = Math.sin(time * 7.1 + 1.4)
      const c = Math.sin(time * 14.2 + Math.sin(time * 0.6) * 3.0)
      const mix = a * 0.45 + b * 0.35 + c * 0.3
      let level = 0.72 + 0.28 * (0.5 + 0.5 * b)
      if (mix > 0.62) level *= 0.08
      else if (mix > 0.38) level *= 0.4
      flicker.intensity = LAMP_INTENSITY * level
    }
  }

  return { update, colliders: forecourtColliders() }
}

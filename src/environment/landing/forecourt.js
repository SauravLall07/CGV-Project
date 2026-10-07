import * as THREE from 'three'
import { createParticleField } from '../particles.js'
import { addBenches } from './bench.js'
import { addCars } from './car.js'
import { addInstances, addMesh, box, mergeParts, place } from './geom.js'
import { FACADE_X, PLAZA } from './layout.js'
import { addCentreLamp, CENTRE_LAMP_BASE } from './centre-lamp.js'
import { addLampPosts, LAMP_GLOW } from './lamp-post.js'
import { addLightPools } from './light-pools.js'
import { addPlanters } from './planter.js'
import { STREET } from './town.js'

// Cobbles in front of the west facade, plus the street furniture. The plaza
// stops at the rail side (x ≈ 9); the walkable platform never reaches it.

const PLAZA_X0 = PLAZA.minX
const PLAZA_X1 = PLAZA.maxX
const PLAZA_Z0 = PLAZA.minZ
const PLAZA_Z1 = PLAZA.maxZ

// Iron screen on the quay, with a hedge on the track side of it. Tall
// enough that the locomotive, the platform and the guards sit behind it.
// The plume is placed on the track so only the steam clears the top rail.
// Two runs of fence and hedge, with the street opening between them.
function addTrackScreen(parent, materials, stats) {
  const x = PLAZA.minX - 0.12
  const height = 4.55
  const runs = [
    [PLAZA.minZ + 0.2, STREET.minZ - 0.2],
    [STREET.maxZ + 0.2, PLAZA.maxZ - 0.2]
  ]
  const posts = []
  const rails = []
  const pickets = []
  const hedges = []
  for (const [z0, z1] of runs) {
    const length = z1 - z0
    const midZ = (z0 + z1) / 2
    const postCount = Math.round(length / 2.35) + 1
    for (let i = 0; i < postCount; i += 1) {
      posts.push(place(x, PLAZA.y, z0 + (i / (postCount - 1)) * length))
    }
    for (let i = 0; i < 6; i += 1) {
      rails.push(box(0.028, 0.028, length, x, 0.5 + i * 0.68, midZ))
    }
    rails.push(box(0.05, 0.04, length, x, height - 0.02, midZ))
    const picketCount = Math.floor(length / 0.15)
    for (let i = 0; i < picketCount; i += 1) {
      pickets.push(place(x, PLAZA.y, z0 + (i + 0.5) * (length / picketCount)))
    }
    hedges.push(box(0.55, 3.2, length, x - 0.42, 1.65, midZ))
  }

  addInstances(parent, box(0.1, height, 0.1, 0, height / 2, 0), materials.iron, posts, {
    name: 'landing-fence-posts'
  }, stats)
  addMesh(parent, mergeParts(rails), materials.iron, { name: 'landing-fence-rails' }, stats)
  addInstances(
    parent,
    box(0.016, height - 0.2, 0.016, 0, (height - 0.2) / 2 + 0.1, 0),
    materials.iron,
    pickets,
    { name: 'landing-fence-pickets' },
    stats
  )
  addMesh(parent, mergeParts(hedges), materials.shrub, { name: 'landing-hedge' }, stats)
}

function addPlaza(parent, materials, stats) {
  const width = PLAZA_X1 - PLAZA_X0
  const length = PLAZA_Z1 - PLAZA_Z0
  // The map is an 8 by 8 block of stones. One metre per repeat makes each
  // stone about 12.5 cm.
  const repeatX = width / 1
  const repeatY = length / 1
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

// The pair flanks the street opening behind the spawn; the southern one
// flickers. The centrepiece sits south of the door axis so the title shot
// and the walk to the doors stay clear, and its pool covers the spawn.
const LAMPS = [
  { x: 9.55, y: 0.05, z: 9.4, flicker: true },
  { x: 9.55, y: 0.05, z: 17.8 }
]

const CENTRE_LAMP = { x: 16.2, y: 0.05, z: 13.4 }

// Painted pools, in the order the flicker expects: index 1 is the
// flickering post.
const POOL_STRENGTH = { centre: 2.1, entrance: 1.55, steps: 0.75 }
const POOLS = [
  { x: CENTRE_LAMP.x, z: CENTRE_LAMP.z, radius: 5.6, strength: POOL_STRENGTH.centre },
  { x: LAMPS[0].x, z: LAMPS[0].z, radius: 4.3, strength: POOL_STRENGTH.entrance },
  { x: LAMPS[1].x, z: LAMPS[1].z, radius: 4.3, strength: POOL_STRENGTH.entrance },
  { x: 19.3, z: 18.6, radius: 3.4, strength: POOL_STRENGTH.steps }
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
  boxes.push(yawBox(CENTRE_LAMP.x, CENTRE_LAMP.z, CENTRE_LAMP_BASE, CENTRE_LAMP_BASE, 0, 0.06))
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
  boxes.push({
    minX: PLAZA.minX - 0.85,
    maxX: PLAZA.minX + 0.05,
    minZ: PLAZA.minZ + 0.2,
    maxZ: PLAZA.maxZ - 0.2
  })
  return boxes
}

export function buildForecourt(parent, materials, stats) {
  addPlaza(parent, materials, stats)
  addTrackScreen(parent, materials, stats)
  addLuggage(parent, materials, stats)
  addShelter(parent, materials, stats)

  const flickerGlow = addLampPosts(parent, LAMPS, materials, stats)
  addCentreLamp(parent, CENTRE_LAMP, materials, stats)
  const pools = addLightPools(parent, POOLS, materials.cobble.map, stats)
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
  steam.points.position.set(6.5, 3.3, 27.2)
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
    if (flickerGlow) {
      const a = Math.sin(time * 2.3)
      const b = Math.sin(time * 7.1 + 1.4)
      const c = Math.sin(time * 14.2 + Math.sin(time * 0.6) * 3.0)
      const mix = a * 0.45 + b * 0.35 + c * 0.3
      let level = 0.72 + 0.28 * (0.5 + 0.5 * b)
      if (mix > 0.62) level *= 0.08
      else if (mix > 0.38) level *= 0.4
      flickerGlow.emissiveIntensity = LAMP_GLOW * Math.max(0.12, level)
      pools.setStrength(1, POOL_STRENGTH.entrance * level)
    }
  }

  return { update, pools, colliders: forecourtColliders() }
}

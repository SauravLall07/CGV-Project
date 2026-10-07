import * as THREE from 'three'
import { addBenches } from './bench.js'
import { addMesh, box, mergeParts } from './geom.js'
import { CENTER_Z, FACADE_X, PLAZA } from './layout.js'
import { addCentreLamp, CENTRE_LAMP_BASE } from './centre-lamp.js'
import { addLampPosts, LAMP_GLOW } from './lamp-post.js'
import { addLightPools } from './light-pools.js'
import { addPlanters } from './planter.js'
import { createSteam } from './steam.js'

// Cobbles in front of the west facade, plus the street furniture. The plaza
// stops at the quay shops (x ≈ 9); the walkable platform never reaches it.

const PLAZA_X0 = PLAZA.minX
const PLAZA_X1 = PLAZA.maxX
const PLAZA_Z0 = PLAZA.minZ
const PLAZA_Z1 = PLAZA.maxZ

function addPlaza(parent, materials, stats) {
  const width = PLAZA_X1 - PLAZA_X0
  const length = PLAZA_Z1 - PLAZA_Z0
  // The map is an 8 by 8 block of stones. One metre per repeat makes each
  // stone about 12.5 cm.
  const repeatX = width / 1
  const repeatY = length / 1
  // 4× anisotropy is enough for stones this small at standing eye height,
  // and it is three samplers on most of the screen.
  for (const map of [materials.cobble.map, materials.cobble.normalMap, materials.cobble.roughnessMap]) {
    map.repeat.set(repeatX, repeatY)
    map.anisotropy = 4
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

function addShelter(parent, materials, stats) {
  // Open roof beside the right wing, over the rails' north end, so the
  // steam reads as coming from the trains rather than from a chimney.
  const roof = box(6.2, 0.14, 12.5, 13.4, 5.15, 33.2)
  const posts = SHELTER_POSTS.map((post) => box(0.16, 5.1, 0.16, post.x, 2.55, post.z))
  addMesh(parent, roof, materials.roof, { castShadow: true, name: 'landing-shelter' }, stats)
  addMesh(parent, mergeParts(posts), materials.iron, { name: 'landing-shelter-posts' }, stats)
}

// The pair flanks the street opening behind the spawn; the southern one
// flickers. The two tall standards on stone bases mirror each other across
// the door axis, so the walk to the doors stays clear and both halves of the
// square are lit; their pools meet at the spawn.
const LAMPS = [
  { x: 9.55, y: 0.05, z: 9.4, flicker: true },
  { x: 9.55, y: 0.05, z: 17.8 }
]

const CENTRE_LAMPS = [
  { x: 16.2, y: 0.05, z: 13.4 },
  { x: 16.2, y: 0.05, z: 2 * CENTER_Z - 13.4 }
]

// Painted pools, in the order the flicker expects: index 1 is the
// flickering post.
const POOL_STRENGTH = { centre: 2.1, entrance: 1.55, steps: 0.75 }
const POOLS = [
  { x: CENTRE_LAMPS[0].x, z: CENTRE_LAMPS[0].z, radius: 5.6, strength: POOL_STRENGTH.centre },
  { x: LAMPS[0].x, z: LAMPS[0].z, radius: 4.3, strength: POOL_STRENGTH.entrance },
  { x: LAMPS[1].x, z: LAMPS[1].z, radius: 4.3, strength: POOL_STRENGTH.entrance },
  { x: 19.3, z: 18.6, radius: 3.4, strength: POOL_STRENGTH.steps },
  { x: CENTRE_LAMPS[1].x, z: CENTRE_LAMPS[1].z, radius: 5.6, strength: POOL_STRENGTH.centre }
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
  for (const lamp of CENTRE_LAMPS) boxes.push(yawBox(lamp.x, lamp.z, CENTRE_LAMP_BASE, CENTRE_LAMP_BASE, 0, 0.06))
  for (const bench of BENCHES) boxes.push(yawBox(bench.x, bench.z, 0.28, 0.78, bench.yaw || 0))
  for (const planter of PLANTERS) boxes.push(yawBox(planter.x, planter.z, 0.52, 0.52))
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
  // The quay shop fronts, the street opening and its bollards.
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
  addLuggage(parent, materials, stats)
  addShelter(parent, materials, stats)

  const flickerGlow = addLampPosts(parent, LAMPS, materials, stats)
  for (const lamp of CENTRE_LAMPS) addCentreLamp(parent, lamp, materials, stats)
  const pools = addLightPools(parent, POOLS, materials.cobble.map, stats)
  addBenches(parent, BENCHES, materials, stats)
  addPlanters(parent, PLANTERS, materials, stats)

  // The engines stand behind the quay shops. The plume starts inside the
  // two-storey bakery block (roof at 7.7 m), so only what clears the roof
  // shows from the square.
  const steam = createSteam({ height: 12, size: 2.6 })
  steam.points.position.set(4.2, 7.0, 26.4)
  parent.add(steam.points)
  stats.draws += 1

  let time = 0
  function update(delta) {
    time += delta
    steam.update(delta)
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

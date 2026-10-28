import * as THREE from 'three'
import { RAIL_OFFSET, TRACK_LEVEL, TRACK_X, TRAIN_LENGTH, TRAIN_Z } from '../entities/train.js'
import { createHumanoid, GUARD_PALETTE } from '../entities/humanoid.js'
import { SUN_SHADOW_LAYER } from '../core/stairs.js'
import {
  carpetMaterial,
  metalMaterial,
  plasterMaterial,
  woodMaterial
} from './textures.js'
import { settings, shadowMapSize } from '../core/settings.js'
import { getKitMaterials } from './level1-kit/kit-materials.js'
import {
  at,
  createKitBuilder,
  crate,
  cushionedBench,
  departureBoard,
  framedPoster,
  hangingClock,
  kbox,
  luggageTrolley,
  metreUv,
  pendantLamp,
  platformWindow,
  platformLantern,
  platformConifer,
  pottedPalm,
  railwaySignal,
  wallSign,
  ticketBooth,
  trunk,
  wallClock
} from './level1-kit/kit-props.js'
import { addFloorGlows, addWallGlows } from './landing/light-pools.js'
import { dressApproachHall } from './passageways/level1-dressing.js'

// Level 1's station: a continuous wet-stone platform, timber canopy and iron
// columns, a warm ashlar facade, and luggage cover beside the Chrono Express.
// The west hall keeps its established geometry, dressing and gameplay.
//
// The platform surface is y = 0 and the track floor is TRACK_LEVEL, so the
// train's floor lines up with the platform and its wheels sit in the trench.

export const PLATFORM_WIDTH = 10
export const PLATFORM_MIN_Z = -28
export const PLATFORM_MAX_Z = 62
export const PLATFORM_LENGTH = PLATFORM_MAX_Z - PLATFORM_MIN_Z

const HALF_WIDTH = PLATFORM_WIDTH / 2
// The hall entrance and its existing backing wall retain their original extent.
const HALF_LENGTH = 28
const ROOF_Y = 6
const WALL_X = -HALF_WIDTH

export const APPROACH_START_X = -52
export const APPROACH_CENTER_Z = -24.5
export const APPROACH_WIDTH = 5.5
export const APPROACH_GATE_X = [-40, -29, -18]
export const APPROACH_SPAWN = { x: -49.5, z: APPROACH_CENTER_Z }
export const JUNCTION_CHECKPOINT = { x: 1.6, z: -25 }
// Passageway 3 now rejoins at the FIXED western entrance of the original
// approach corridor. The first three passageways are relocated around this
// anchor rather than cutting a side doorway into the middle of Passageway 4.
export const STAGE3_REJOIN_X = APPROACH_START_X
export const STAGE3_REJOIN_WIDTH = 3.8
export const STAGE3_REJOIN_HEIGHT = 4.45

export const APPROACH_Z_MIN = APPROACH_CENTER_Z - APPROACH_WIDTH / 2
const APPROACH_Z_MAX = APPROACH_CENTER_Z + APPROACH_WIDTH / 2

const DOOR_HEIGHT = 2.6

// Ordered station work areas: luggage, baggage sorting, then sparse vendors.
// Each opaque body is also the visible LOS core; open frames are decor only.
export const PLATFORM_COVER = [
  ['hat-box-tower', -1.3, -23, 0.9, 1.0, 1.65, 'hats'],
  ['single-suitcase', 1.3, -18, 1.0, 0.8, 0.9, 'trunks'],
  ['paired-crates', -1.3, -12, 1.2, 1.2, 1.0, 'crates'],
  ['checkpoint-luggage', -1.3, -7, 1.2, 1.3, 1.7, 'trunks'],
  ['sandwich-board', 1.9, -10, 0.8, 0.8, 1.1, 'board'],
  ['steamer-trunk', 1.3, -2, 1.3, 0.9, 0.95, 'trunks'],
  ['milk-pair', -1.3, 3, 1.0, 1.0, 1.0, 'milk'],
  ['open-trolley', 0, 5.5, 0.9, 1.2, 1.1, 'frame'],
  ['two-suitcases', 1.3, 8, 1.0, 0.9, 1.0, 'trunks'],
  ['single-mail-sack', -1.3, 13, 0.8, 0.8, 1.0, 'mail'],
  ['checkpoint-crates', -1.3, 18, 1.2, 1.2, 1.7, 'crates'],
  ['hat-box-pair', 1.3, 23, 0.9, 0.9, 1.0, 'hats'],
  ['small-bench', -1.3, 25.5, 1.2, 0.8, 1.0, 'bench'],
  ['parcel-pair', -1.3, 28, 1.1, 1.0, 1.05, 'crates'],
  ['final-luggage-stack', 1.3, 33, 1.1, 1.2, 1.65, 'trunks'],
  ['lamp-post-base', -1.3, 35.5, 0.8, 0.8, 0.4, 'lamp'],
  ['single-trunk', -1.3, 38, 1.2, 0.9, 0.95, 'trunks'],
  ['door-parcels', 1.3, 42.5, 1.0, 1.0, 1.0, 'crates']
].map(([id, x, z, width, length, height, type]) => ({
  id, x, z, centres: [x], width, length, height, type,
  seeThrough: ['board', 'bench', 'frame', 'lamp'].includes(type)
}))

// Axis-aligned outer bounds. The west side is extended for the new
// perpendicular infiltration wing. Solid wall colliders below keep the
// player inside the intended L-shaped route rather than the whole rectangle.
export const bounds = {
  minX: APPROACH_START_X + 0.7,
  maxX: 4.3,
  minZ: -HALF_LENGTH + 0.8,
  maxZ: PLATFORM_MAX_Z - 0.8
}

function createTrackBed() {
  const group = new THREE.Group()
  group.name = 'platform-track'
  // The 2.2 s cut leaves the nose at -70.03; the retained -107.5 rail
  // endpoint has 37.47 m spare. Keep eight batched sleeper draws.
  const length = Math.max(220, PLATFORM_LENGTH + 16, TRAIN_LENGTH + 48)
  const ballastMaterial = plasterMaterial({ repeat: [3, 7], base: 0x3b3830, roughness: 1 })
  const sleeperMaterial = woodMaterial({ repeat: [2, 1], light: 0x4a3826, dark: 0x241a11, roughness: 0.95 })
  const railMaterial = metalMaterial({ repeat: [1, 8], base: 0x8d8a83, roughness: 0.78, metalness: 0.45 })
  for (let section = 0; section < 8; section++) {
    const sectionLength = length / 8
    const centre = TRAIN_Z - length / 2 + sectionLength * (section + 0.5)

    // TRACK_LEVEL is the top of the rail head — the height the train's wheel
    // treads rest on — so everything here stacks downwards from it.
    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.4, sectionLength),
      ballastMaterial
    )
    ballast.position.set(TRACK_X, TRACK_LEVEL - 0.5, centre)
    ballast.receiveShadow = true
    group.add(ballast)

    // One sleeper draw per section, with a finite culling sphere.
    const sleeperCount = Math.floor(sectionLength / 0.8)
    const sleepers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.8, 0.14, 0.28),
      sleeperMaterial,
      sleeperCount
    )
    const dummy = new THREE.Object3D()
    for (let i = 0; i < sleeperCount; i++) {
      dummy.position.set(TRACK_X, TRACK_LEVEL - 0.25, centre - sectionLength / 2 + i * 0.8 + 0.4)
      dummy.updateMatrix()
      sleepers.setMatrixAt(i, dummy.matrix)
    }
    sleepers.instanceMatrix.needsUpdate = true
    sleepers.computeBoundingSphere()
    sleepers.receiveShadow = true
    group.add(sleepers)

    for (const offset of [-RAIL_OFFSET, RAIL_OFFSET]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, sectionLength), railMaterial)
      rail.position.set(TRACK_X + offset, TRACK_LEVEL - 0.09, centre)
      group.add(rail)
    }
  }

  return group
}

function createRearWall() {
  const group = new THREE.Group()
  const colliders = []

  const wood = woodMaterial({ repeat: [1, 16], light: 0x7c5330, dark: 0x3d2615 })
  const plaster = plasterMaterial({ repeat: [2, 14], base: 0x8e8172 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xa9832f, roughness: 0.35, metalness: 0.85 })

  // Build the rear wall as two solid runs with a real opening where the new
  // west-east corridor enters the existing platform. The old implementation
  // was one continuous box, which would visually block the new route.
  function addWallRun(zMin, zMax) {
    const length = zMax - zMin
    if (length <= 0.05) return
    const z = (zMin + zMax) / 2

    const wainscot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, length), wood)
    wainscot.position.set(WALL_X - 0.2, 0.75, z)
    wainscot.receiveShadow = true
    group.add(wainscot)

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.4, ROOF_Y - 0.9, length), plaster)
    upper.position.set(WALL_X - 0.2, 1.5 + (ROOF_Y - 0.9) / 2, z)
    upper.receiveShadow = true
    group.add(upper)

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, length), brass)
    rail.position.set(WALL_X - 0.16, 1.55, z)
    group.add(rail)

    colliders.push({
      minX: WALL_X - 0.45,
      maxX: WALL_X + 0.15,
      minZ: zMin,
      maxZ: zMax
    })
  }

  addWallRun(-HALF_LENGTH, APPROACH_Z_MIN)
  addWallRun(APPROACH_Z_MAX, HALF_LENGTH)

  // Keep a lintel above the entrance so it reads as an intentional doorway.
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, ROOF_Y - DOOR_HEIGHT, APPROACH_WIDTH),
    plaster
  )
  lintel.position.set(WALL_X - 0.18, DOOR_HEIGHT + (ROOF_Y - DOOR_HEIGHT) / 2, APPROACH_CENTER_Z)
  lintel.castShadow = true
  group.add(lintel)

  const jambGeometry = new THREE.BoxGeometry(0.5, DOOR_HEIGHT, 0.12)
  for (const z of [APPROACH_Z_MIN, APPROACH_Z_MAX]) {
    const jamb = new THREE.Mesh(jambGeometry, brass)
    jamb.position.set(WALL_X - 0.12, DOOR_HEIGHT / 2, z)
    group.add(jamb)
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, APPROACH_WIDTH + 0.24), brass)
  header.position.set(WALL_X - 0.12, DOOR_HEIGHT, APPROACH_CENTER_Z)
  group.add(header)

  return { group, colliders }
}

function createApproachCorridor() {
  const group = new THREE.Group()
  group.name = 'west-infiltration-wing'
  const colliders = []

  const corridorEndX = JUNCTION_CHECKPOINT.x
  const length = corridorEndX - APPROACH_START_X
  const centerX = (APPROACH_START_X + corridorEndX) / 2

  // The ticket hall of reference 02: cream plaster over dark panelling, a
  // checkerboard floor, green trim and brass. Shapes and colliders are the
  // blockout's; only the surfaces and the dressing are new.
  const k = getKitMaterials()
  const kit = createKitBuilder()
  const floorMat = k.checker
  const wallMat = k.plaster
  const panelMat = k.wainscot
  const brassMat = k.brass
  const trimMat = k.green

  const floor = new THREE.Mesh(metreUv(new THREE.PlaneGeometry(length, APPROACH_WIDTH), 2.4), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(centerX, 0.01, APPROACH_CENTER_Z)
  floor.receiveShadow = true
  group.add(floor)

  // Full-height walls on both sides of the original approach corridor. Stage 3
  // no longer cuts a doorway into either side wall; it meets Passageway 4 at
  // the corridor's intended western entrance instead.
  for (const z of [APPROACH_Z_MIN, APPROACH_Z_MAX]) {
    const wall = new THREE.Mesh(metreUv(new THREE.BoxGeometry(length, ROOF_Y, 0.3), 3), wallMat)
    wall.position.set(centerX, ROOF_Y / 2, z)
    wall.castShadow = true
    wall.receiveShadow = true
    group.add(wall)

    const wainscot = new THREE.Mesh(metreUv(new THREE.BoxGeometry(Math.max(0.1, length - 0.18), 1.45, 0.08), 1.4), panelMat)
    wainscot.position.set(centerX, 0.73, z + (z === APPROACH_Z_MIN ? 0.17 : -0.17))
    group.add(wainscot)

    const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, length - 0.18), 0.1, 0.1), brassMat)
    rail.position.set(centerX, 1.52, z + (z === APPROACH_Z_MIN ? 0.2 : -0.2))
    group.add(rail)

    colliders.push({
      minX: APPROACH_START_X,
      maxX: corridorEndX,
      minZ: z - 0.22,
      maxZ: z + 0.22
    })
  }

  // Western entrance frame. Passageway 3's second staircase climbs east through
  // this opening at x = APPROACH_START_X, centered on APPROACH_CENTER_Z.
  const openingMinZ = APPROACH_CENTER_Z - STAGE3_REJOIN_WIDTH / 2
  const openingMaxZ = APPROACH_CENTER_Z + STAGE3_REJOIN_WIDTH / 2
  for (const [spanMinZ, spanMaxZ] of [
    [APPROACH_Z_MIN, openingMinZ],
    [openingMaxZ, APPROACH_Z_MAX]
  ]) {
    const spanDepth = spanMaxZ - spanMinZ
    if (spanDepth <= 0.05) continue
    const wall = new THREE.Mesh(metreUv(new THREE.BoxGeometry(0.3, ROOF_Y, spanDepth), 3), wallMat)
    wall.position.set(APPROACH_START_X, ROOF_Y / 2, (spanMinZ + spanMaxZ) / 2)
    wall.castShadow = true
    wall.receiveShadow = true
    group.add(wall)
    colliders.push({
      minX: APPROACH_START_X - 0.2,
      maxX: APPROACH_START_X + 0.2,
      minZ: spanMinZ,
      maxZ: spanMaxZ
    })
  }

  const entranceLintel = new THREE.Mesh(
    metreUv(new THREE.BoxGeometry(0.3, ROOF_Y - STAGE3_REJOIN_HEIGHT, STAGE3_REJOIN_WIDTH), 3),
    wallMat
  )
  entranceLintel.position.set(
    APPROACH_START_X,
    STAGE3_REJOIN_HEIGHT + (ROOF_Y - STAGE3_REJOIN_HEIGHT) / 2,
    APPROACH_CENTER_Z
  )
  entranceLintel.castShadow = true
  group.add(entranceLintel)

  const entranceJambGeometry = new THREE.BoxGeometry(0.34, STAGE3_REJOIN_HEIGHT, 0.14)
  for (const z of [openingMinZ, openingMaxZ]) {
    const jamb = new THREE.Mesh(entranceJambGeometry, trimMat)
    jamb.position.set(APPROACH_START_X, STAGE3_REJOIN_HEIGHT / 2, z)
    group.add(jamb)
  }
  const entranceHeader = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, STAGE3_REJOIN_WIDTH + 0.24), trimMat)
  entranceHeader.position.set(APPROACH_START_X, STAGE3_REJOIN_HEIGHT, APPROACH_CENTER_Z)
  group.add(entranceHeader)

  // Ceiling and skylight strip continue the same luxury-station architecture.
  const ceiling = new THREE.Mesh(
    metreUv(new THREE.BoxGeometry(length, 0.22, APPROACH_WIDTH + 0.5), 3),
    k.ceiling
  )
  ceiling.position.set(centerX, ROOF_Y, APPROACH_CENTER_Z)
  group.add(ceiling)

  const skylight = new THREE.Mesh(
    new THREE.BoxGeometry(length - 2, 0.06, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xa8bcd8, emissive: 0x93aed4, emissiveIntensity: 1.0, roughness: 0.25 })
  )
  skylight.position.set(centerX, ROOF_Y - 0.13, APPROACH_CENTER_Z)
  group.add(skylight)

  // Three alternating doorway partitions create four distinct passage zones.
  const corridorDoors = [
    { x: APPROACH_GATE_X[0], doorMin: -26.95, doorMax: -24.65 },
    { x: APPROACH_GATE_X[1], doorMin: -24.15, doorMax: -21.90 },
    { x: APPROACH_GATE_X[2], doorMin: -26.90, doorMax: -24.55 }
  ]

  function addCrossGate({ x, doorMin, doorMax }) {
    const southDepth = doorMin - APPROACH_Z_MIN
    const northDepth = APPROACH_Z_MAX - doorMax

    if (southDepth > 0.05) {
      const south = new THREE.Mesh(metreUv(new THREE.BoxGeometry(0.3, ROOF_Y, southDepth), 3), wallMat)
      south.position.set(x, ROOF_Y / 2, APPROACH_Z_MIN + southDepth / 2)
      south.castShadow = true
      group.add(south)
      colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: APPROACH_Z_MIN, maxZ: doorMin })
    }

    if (northDepth > 0.05) {
      const north = new THREE.Mesh(metreUv(new THREE.BoxGeometry(0.3, ROOF_Y, northDepth), 3), wallMat)
      north.position.set(x, ROOF_Y / 2, doorMax + northDepth / 2)
      north.castShadow = true
      group.add(north)
      colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: doorMax, maxZ: APPROACH_Z_MAX })
    }

    const lintel = new THREE.Mesh(
      metreUv(new THREE.BoxGeometry(0.3, ROOF_Y - DOOR_HEIGHT, doorMax - doorMin), 3),
      wallMat
    )
    lintel.position.set(x, DOOR_HEIGHT + (ROOF_Y - DOOR_HEIGHT) / 2, (doorMin + doorMax) / 2)
    lintel.castShadow = true
    group.add(lintel)

    const jambGeometry = new THREE.BoxGeometry(0.34, DOOR_HEIGHT, 0.12)
    for (const z of [doorMin, doorMax]) {
      const jamb = new THREE.Mesh(jambGeometry, trimMat)
      jamb.position.set(x, DOOR_HEIGHT / 2, z)
      group.add(jamb)
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, doorMax - doorMin + 0.24), trimMat)
    header.position.set(x, DOOR_HEIGHT, (doorMin + doorMax) / 2)
    group.add(header)
    // Architrave: a green cornice and a brass bead over each doorway.
    kit.add(trimMat, kbox(0.42, 0.16, doorMax - doorMin + 0.5, x, DOOR_HEIGHT + 0.14, (doorMin + doorMax) / 2))
    kit.add(brassMat, kbox(0.44, 0.03, doorMax - doorMin + 0.52, x, DOOR_HEIGHT + 0.23, (doorMin + doorMax) / 2))
  }

  corridorDoors.forEach(addCrossGate)

  // Brass pendants. Only some keep a real light (see boarding-lighting.js);
  // the rest glow and paint a pool on the floor.
  // Keep the first pendant at its adjusted position, and shift the second
  // clear of the wall. Each pendant and its point light share an x coordinate.
  for (const x of [-45.5, -37.5, -32, -24, -16, -8]) {
    pendantLamp(kit, k, at(x, ROOF_Y - 0.11, APPROACH_CENTER_Z), 1.45)

    const lamp = new THREE.PointLight(0xffc98a, 18, 11, 2)
    lamp.position.set(x, ROOF_Y - 1.7, APPROACH_CENTER_Z)
    group.add(lamp)
  }

  // Cover. Colliders are the blockout's fixed boxes; the props sit inside them.
  function addLuggageObstacle(x, z, rotation = 0, stack = false) {
    const M = at(x, 0, z, rotation)
    if (stack) {
      crate(kit, k, new THREE.Matrix4().multiplyMatrices(M, at(0, 0, -0.45, 0.04)), 0.95, 0.85, 0.9)
      crate(kit, k, new THREE.Matrix4().multiplyMatrices(M, at(0.05, 0.85, -0.42, -0.18)), 0.55, 0.42, 0.55)
      trunk(kit, k, new THREE.Matrix4().multiplyMatrices(M, at(0, 0, 0.52, Math.PI / 2)), 0.9, 0.5, 0.62)
      trunk(kit, k, new THREE.Matrix4().multiplyMatrices(M, at(0, 0.5, 0.5, Math.PI / 2 + 0.1)), 0.72, 0.4, 0.5)
    } else {
      luggageTrolley(kit, k, M)
    }

    const turned = Math.abs(Math.sin(rotation)) > 0.5
    const halfX = turned ? 1.0 : 0.7
    const halfZ = turned ? 0.7 : 1.0
    colliders.push({ minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ })
  }

  function addBenchObstacle(x, z, rotation = 0) {
    cushionedBench(kit, k, at(x, 0, z, rotation))

    const turned = Math.abs(Math.sin(rotation)) > 0.5
    const halfX = turned ? 1.1 : 0.45
    const halfZ = turned ? 0.45 : 1.1
    colliders.push({ minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ })
  }

  // The layout alternates cover from north to south, forcing the player to
  // weave instead of simply sprinting down one side of the corridor.
  addBenchObstacle(-45.0, -22.65, Math.PI / 2)
  addLuggageObstacle(-35.0, -25.85, Math.PI / 2)
  addBenchObstacle(-24.0, -22.65, Math.PI / 2)
  addLuggageObstacle(-21.0, -26.05, 0, true)
  addBenchObstacle(-12.0, -26.25, Math.PI / 2)
  addLuggageObstacle(-8.5, -22.95, Math.PI / 2)

  // Wall dressing. Inner faces: plaster at ±0.15 from each wall line, the
  // panelling 0.06 proud of it.
  const wallRuns = [
    { face: APPROACH_Z_MIN + 0.21, out: 1 },
    { face: APPROACH_Z_MAX - 0.21, out: -1 }
  ]
  const gateNear = (x, pad) => APPROACH_GATE_X.some((g) => Math.abs(g - x) < pad)
  const stile = () => new THREE.BoxGeometry(0.08, 1.24, 0.03)
  for (const { face, out } of wallRuns) {
    const runLength = length - 0.4
    kit.add(trimMat, kbox(runLength, 0.2, 0.05, centerX, 0.1, face + out * 0.02))
    kit.add(k.wood, kbox(runLength, 0.06, 0.07, centerX, 1.42, face + out * 0.02))
    kit.add(trimMat, kbox(runLength, 0.16, 0.12, centerX, ROOF_Y - 0.19, face))
    kit.add(brassMat, kbox(runLength, 0.025, 0.13, centerX, ROOF_Y - 0.28, face))
    for (let x = APPROACH_START_X + 0.8; x < corridorEndX - 0.4; x += 1.15) {
      if (gateNear(x, 0.35)) continue
      kit.instance('stile', stile, k.wood, at(x, 0.83, face + out * 0.015))
    }
  }
  // Dark beams across the ceiling, between the pendants.
  for (let x = APPROACH_START_X + 2; x < corridorEndX - 1; x += 4) {
    if (gateNear(x, 0.7)) continue
    kit.add(k.wood, kbox(0.26, 0.3, APPROACH_WIDTH - 0.3, x, ROOF_Y - 0.26, APPROACH_CENTER_Z), null, true)
  }

  // Red runner between the gates, with brass edging.
  const runnerStops = [APPROACH_START_X + 0.4, ...APPROACH_GATE_X.flatMap((g) => [g - 0.35, g + 0.35]), corridorEndX - 0.3]
  for (let i = 0; i < runnerStops.length; i += 2) {
    const x0 = runnerStops[i]
    const x1 = runnerStops[i + 1]
    const runnerGeometry = metreUv(new THREE.PlaneGeometry(x1 - x0, 1.5), 1.5)
    runnerGeometry.rotateX(-Math.PI / 2)
    runnerGeometry.translate((x0 + x1) / 2, 0.022, APPROACH_CENTER_Z)
    kit.add(k.runner, runnerGeometry)
    for (const side of [-1, 1]) {
      kit.add(brassMat, kbox(x1 - x0, 0.012, 0.04, (x0 + x1) / 2, 0.022, APPROACH_CENTER_Z + side * 0.77))
    }
  }

  // Ticket office on the south wall, opposite the first bench.
  const southFace = APPROACH_Z_MIN + 0.15
  const northFace = APPROACH_Z_MAX - 0.15
  ticketBooth(kit, k, at(-44.6, 0, southFace + 0.06, 0), 3.8)
  // Framed posters between the pendants, clear of the terminal and gates.
  ;[-43, -35, -21, -13, -3].forEach((x, i) => framedPoster(kit, k, at(x, 2.55, northFace, Math.PI), i))
  // RIVIERA (index 4) must sit west of the platform backing wall at x=-5.
  // Its frame now ends at -6.04, over 0.6 m clear of that corner.
  ;[-37, -24, -14, -6.5].forEach((x, i) => framedPoster(kit, k, at(x, 2.55, southFace, 0), i + 1))
  // Clocks over the first and last gate, facing the way the player comes.
  wallClock(kit, k, at(APPROACH_GATE_X[0] - 0.16, 3.7, -25.8, -Math.PI / 2), 0.42)
  wallClock(kit, k, at(APPROACH_GATE_X[2] - 0.16, 3.7, -25.72, -Math.PI / 2), 0.42)
  // Warm wash above each poster, as if from the pendants.
  addWallGlows(group, [
    ...[-43, -35, -21, -13, -3].map((x) => ({ x, y: 3.4, z: northFace - 0.02, yaw: Math.PI / 2, width: 2.6, height: 2.6, strength: 0.16 })),
    ...[-37, -24, -14, -6.5].map((x) => ({ x, y: 3.4, z: southFace + 0.02, yaw: -Math.PI / 2, width: 2.6, height: 2.6, strength: 0.16 }))
  ], null, 0xff9e52, 'hall-wall-glow')

  // Free-standing pieces that should not block guard sight: palms and the
  // hanging departure board. They go in a group outside the station.
  const dressing = new THREE.Group()
  dressing.name = 'hall-dressing'
  const loose = createKitBuilder()
  for (const [x, z] of [
    [-47.0, southFace + 0.35],
    [-42.2, southFace + 0.35],
    [APPROACH_START_X + 0.5, southFace + 0.32],
    [APPROACH_START_X + 0.5, northFace - 0.32],
    [APPROACH_GATE_X[1] - 0.5, southFace + 0.35],
    [APPROACH_GATE_X[2] - 0.5, northFace - 0.35]
  ]) {
    pottedPalm(loose, k, at(x, 0, z, x * 1.7), 0.9)
  }
  departureBoard(loose, k, at(-47.6, 4.35, APPROACH_CENTER_Z, -Math.PI / 2), 2.6, 1.05, 1.4)
  loose.build(dressing, 'hall-dressing')

  kit.build(group, 'hall-kit')

  // Brass threshold at the exact old spawn/junction. There is no solid wall
  // here: the player reaches this arch, activates the checkpoint, then turns
  // north into the original Zone 1.
  const exitPostGeometry = new THREE.BoxGeometry(0.16, DOOR_HEIGHT, 0.16)
  for (const z of [APPROACH_Z_MIN + 0.12, APPROACH_Z_MAX - 0.12]) {
    const post = new THREE.Mesh(exitPostGeometry, brassMat)
    post.position.set(JUNCTION_CHECKPOINT.x, DOOR_HEIGHT / 2, z)
    group.add(post)
  }
  const exitHeader = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.14, APPROACH_WIDTH),
    brassMat
  )
  exitHeader.position.set(JUNCTION_CHECKPOINT.x, DOOR_HEIGHT, APPROACH_CENTER_Z)
  group.add(exitHeader)
  dressApproachHall(group, colliders)

  return { group, colliders, dressing }
}

function markPlatformDecor(object) {
  if (!object) return
  object.userData.decor = true
  object.userData.noInteractionBlocker = true
  object.userData.noCameraCollision = true
}

function createGuardPlaceholder() {
  // Static figure standing in for a patrolling guard. Non-functional — no
  // patrol or detection logic exists yet (Phase 2), but it now shares the
  // player's humanoid builder so the eventual guards inherit the same rig.
  const { group } = createHumanoid(GUARD_PALETTE)
  group.name = 'guard-placeholder'
  group.position.set(1.8, 0, 9)
  group.rotation.y = Math.PI * 0.85
  return group
}

function createCameraPlaceholder(z) {
  // Wall-mounted PTZ camera. Non-functional — no detection cone exists yet.
  const placeholder = new THREE.Group()
  placeholder.name = 'camera-placeholder'

  const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.6 })

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), bracketMaterial)
  arm.position.x = 0.25
  placeholder.add(arm)

  const housing = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), bracketMaterial)
  housing.position.x = 0.55
  placeholder.add(housing)

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.15, metalness: 0.3 })
  )
  lens.rotation.z = Math.PI / 2
  lens.rotation.y = 0.5
  lens.position.set(0.72, -0.04, 0.1)
  placeholder.add(lens)

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a20, emissiveIntensity: 4 })
  )
  led.position.set(0.66, 0.14, 0.14)
  placeholder.add(led)

  placeholder.position.set(WALL_X + 0.3, 4.6, z)
  return placeholder
}

function createOpenPlatform() {
  const group = new THREE.Group(), base = getKitMaterials(), colliders = []
  // Platform palette aliases eliminate eleven otherwise redundant batch draws.
  const k = { ...base, greenDark: base.iron, stationStone: base.platformStone, concrete: base.platformStone }
  group.name = 'open-platform'
  group.userData.platformRegion = true
  const sections = Array.from({ length: 5 }, (_, i) => {
    const builder = createKitBuilder()
    // Decorative kit helpers request shadows on individual luggage pieces.
    // Suppress that split here: these are a single batch per material.
    return { start: -28 + i * 20, end: Math.min(62, -8 + i * 20), builder,
      b: { add: (mat, geometry, matrix) => builder.add(mat, geometry, matrix) } }
  })
  const sectionAt = z => sections[Math.min(4, Math.max(0, Math.floor((z + 28) / 20)))]
  const box = (b, mat, w, h, d, x, y, z, scale = 1) => b.add(mat, kbox(w, h, d, x, y, z, scale))
  // Keep pocket 10's centre (4.1,54) clear of the column base. The front
  // entry to that pocket now avoids every base instead of touching one.
  const columnZ = [-26, -18, -10, -2, 4, 12, 20, 28, 36, 45, 52, 61]
  for (const { start, end, b } of sections) {
    const length = end - start, centre = (start + end) / 2
    const floor = metreUv(new THREE.PlaneGeometry(10, length), 4)
    floor.rotateX(-Math.PI / 2); floor.translate(0, 0, centre)
    b.add(k.platformPaving, floor)
    box(b, k.stationStone, 0.4, 0.1, length, 4.8, -0.04, centre)
    box(b, k.paper, 0.12, 0.012, length, 4.28, 0.012, centre)
    box(b, k.iron, 0.2, 1.4, length, 5, -0.7, centre)
    box(b, k.wood, 11.8, 0.22, length, -0.3, 6, centre, 2)
    for (const x of [-4.7, -1.5, 1.7, 4.6]) box(b, k.wood, 0.16, 0.22, length, x, 5.78, centre)
    // Ashlar skin begins past the existing hall entrance; never seals it.
    const wallStart = Math.max(start, APPROACH_Z_MAX)
    if (end > wallStart) {
      box(b, k.platformStone, 0.16, 6, end - wallStart, -4.92, 3, (wallStart + end) / 2, 2)
      colliders.push({ minX: -5.1, maxX: -4.84, minZ: wallStart, maxZ: end })
    }
    // A narrow skin below/above the windows is part of the same stone batch.
    for (let z = start + 1; z < end; z += 2) {
      box(b, k.wood, 11.6, 0.2, 0.12, -0.3, 5.82, z)
    }
  }
  for (const z of columnZ) {
    const b = sectionAt(z).b
    box(b, k.iron, 0.64, 0.28, 0.64, 4.6, 0.14, z)
    const shaft = new THREE.CylinderGeometry(0.16, 0.23, 5.35, 10)
    shaft.translate(4.6, 2.94, z); b.add(k.iron, shaft)
    for (const y of [0.42, 5.55]) box(b, k.brass, 0.42, 0.1, 0.42, 4.6, y, z)
    box(b, k.wood, 10, 0.3, 0.23, -0.2, 5.58, z)
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(4.6, 4.4, z),
      new THREE.Vector3(3.4, 4.45, z), new THREE.Vector3(3.3, 5.6, z), new THREE.Vector3(4.3, 5.6, z))
    b.add(k.iron, new THREE.TubeGeometry(curve, 10, 0.045, 4, false))
    colliders.push({ minX: 4.28, maxX: 4.92, minZ: z - 0.32, maxZ: z + 0.32, kind: 'wall' })
  }
  const lampZ = []
  for (let z = -24; z <= 60; z += 6) {
    pendantLamp(sectionAt(z).b, k, at(0.4, 5.85, z), 1.25)
    lampZ.push(z)
  }
  for (const z of [-12, 16, 44]) {
    const light = new THREE.PointLight(0xffc082, 34, 19, 2)
    light.position.set(0.4, 4.4, z); group.add(light)
  }
  for (let z = -18; z <= 58; z += 8) {
    const b = sectionAt(z).b
    platformWindow(b, k, at(-4.81, 1.05, z, Math.PI / 2), z === 6 || z === 38)
    platformLantern(b, k, at(-4.78, 3.45, z + 3, Math.PI / 2))
  }
  // Entrance poster, additional travel posters, and a clock projecting into view.
  for (const [z, index] of [[-20.5, 0], [17.5, 1], [41.5, 2]]) {
    const b = sectionAt(z).b
    const pictureKit = z < 0 ? { ...k, poster: () => k.chronoPoster } : k
    framedPoster(b, pictureKit, at(-4.79, 3.0, z, Math.PI / 2), index, z < 0 ? 1.35 : 0.85, z < 0 ? 2.05 : 1.3)
  }
  const clockBatch = sectionAt(10).b
  box(clockBatch, k.iron, 1.3, 0.1, 0.1, -4.2, 4.95, 10)
  box(clockBatch, k.iron, 0.08, 0.5, 0.08, -3.6, 4.7, 10)
  hangingClock(clockBatch, k, at(-3.6, 4.25, 10), 0.48, 0.45)

  // Cores are visible, low-detail luggage bodies, not invisible expanded boxes.
  // Detail is batched separately and can never create holes in the core.
  const cores = new Map()
  for (const cover of PLATFORM_COVER) {
    const { id, centres, z, width, height, length, type } = cover
    const builder = createKitBuilder()
    const b = sectionAt(z).b
    if (cover.seeThrough) {
      if (type === 'bench') {
        for (const dz of [-0.24, 0, 0.24]) box(b, k.wood, width, 0.06, 0.16, cover.x, 0.5, z + dz)
        for (const dx of [-width * 0.4, width * 0.4]) {
          box(b, k.iron, 0.07, 0.5, length, cover.x + dx, 0.25, z)
          box(b, k.iron, 0.07, height - 0.5, 0.07, cover.x + dx, (height + 0.5) / 2, z + 0.3)
        }
        for (const y of [height - 0.3, height - 0.05]) box(b, k.wood, width, 0.09, 0.06, cover.x, y, z + 0.3)
      }
      else if (type === 'lamp') {
        box(b, k.iron, width, height, length, cover.x, height / 2, z)
        box(b, k.iron, 0.07, 2.7, 0.07, cover.x, 1.75, z)
        box(b, k.brass, 0.28, 0.25, 0.28, cover.x, 3.1, z)
      } else if (type === 'frame') {
        for (const side of [-1, 1]) {
          box(b, k.iron, 0.05, height, 0.05, cover.x + side * width * 0.4, height / 2, z - length * 0.4)
          box(b, k.iron, 0.05, 0.05, length, cover.x + side * width * 0.4, 0.2, z)
        }
        box(b, k.brass, width, 0.05, 0.05, cover.x, height, z - length * 0.4)
      } else {
        for (const side of [-1, 1]) box(b, k.iron, 0.07, height, 0.07, cover.x + side * width * 0.4, height / 2, z)
        box(b, k.wood, width, 0.28, 0.12, cover.x, height - 0.14, z)
        box(b, k.brass, width * 0.85, 0.02, 0.14, cover.x, height - 0.1, z)
      }
      colliders.push({ minX: cover.x - width / 2, maxX: cover.x + width / 2,
        minZ: z - length / 2, maxZ: z + length / 2, kind: 'seat' })
      continue
    }
    for (const x of centres) {
      const material = ['crates', 'kiosk', 'chairs', 'flowers'].includes(type) ? k.crate : type === 'milk' ? k.iron : type === 'mail' ? k.sack : k.leather
      builder.add(material, kbox(width, height, length, x, height / 2, z))
    }
    const coreGroup = new THREE.Group()
    const [mesh] = builder.build(coreGroup, id)
    mesh.userData.coverId = id
    cores.set(id, mesh); group.add(coreGroup)
    for (const x of centres) {
      colliders.push({ minX: x - width / 2, maxX: x + width / 2,
        minZ: z - length / 2, maxZ: z + length / 2, kind: type === 'crates' ? 'crate' : 'trunk' })
      // Details stay inside each footprint; paired cores share one mesh/material.
      for (const dz of [-length * 0.4, 0, length * 0.4]) {
        box(b, k.brass, width + 0.012, 0.035, 0.06, x, height + 0.01, z + dz)
        for (const side of [-1, 1]) box(b, k.brass, 0.025, height, 0.06, x + side * (width / 2 + 0.01), height / 2, z + dz)
      }
      if (type === 'trunks' || type === 'trolley') {
        for (const dz of [-length * 0.3, length * 0.3]) trunk(b, k, at(x, height - 0.32, z + dz), Math.min(width, 1.1), 0.32, Math.min(1.2, length * 0.35))
      } else if (type === 'kiosk') {
        box(b, k.iron, width + 0.1, 0.08, length + 0.1, x, height, z)
        for (const dz of [-1.2, 0, 1.2]) {
          box(b, k.paper, width + 0.02, 0.12, 0.65, x, height * 0.65, z + dz)
          box(b, k.newsprint, width + 0.025, 0.015, 0.5, x, height * 0.65 + 0.07, z + dz)
        }
      } else if (type === 'milk' || type === 'mail' || type === 'flowers' || type === 'hats') {
        const offsets = type === 'mail' ? [0] : type === 'milk' ? [-length * 0.25, length * 0.25] : [-length * 0.3, 0, length * 0.3]
        for (const dz of offsets) {
          const body = type === 'mail' ? new THREE.SphereGeometry(Math.min(width * 0.45, 0.38), 8, 6) : new THREE.CylinderGeometry(0.17, 0.24, 0.3, 10)
          body.translate(x, height - (type === 'mail' ? Math.min(width * 0.45, 0.38) : 0.15), z + dz)
          b.add(type === 'milk' ? k.iron : type === 'mail' ? k.sack : type === 'hats' ? k.leather : k.pot, body)
          if (type === 'flowers') {
            const bouquet = new THREE.SphereGeometry(0.22, 8, 6)
            bouquet.translate(x, height + 0.12, z + dz)
            b.add(k.cushion, bouquet)
            box(b, k.green, 0.05, 0.25, 0.05, x, height, z + dz)
          }
        }
        if (type !== 'flowers') {
          for (let y = 0.25; y < height; y += 0.35) box(b, k.brass, width + 0.012, 0.025, length, x, y, z)
        }
      } else if (type === 'chairs') {
        for (let i = 0; i < 6; i++) {
          box(b, k.wood, width + 0.02, 0.04, length, x, 0.2 + i * 0.25, z)
          for (const side of [-1, 1]) box(b, k.brass, 0.04, height, 0.07, x + side * width * 0.4, height / 2, z)
        }
      } else {
        for (const dz of [-length * 0.25, length * 0.25]) box(b, k.brass, width * 0.5, 0.12, 0.015, x, height * 0.65, z + dz)
      }
      if (type === 'trolley') {
        for (const dz of [-length * 0.4, length * 0.4]) for (const side of [-1, 1]) {
          const wheel = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10)
          wheel.rotateZ(Math.PI / 2); wheel.translate(x + side * 0.53, 0.15, z + dz)
          b.add(k.iron, wheel)
        }
      }
    }
  }
  // Preserve six benches and five conifers along the wall, away from middle pockets.
  // They have movement boxes, but their slats/foliage are deliberately not cover.
  for (const z of [-13.7, 3, 20, 36, 52, 59]) {
    cushionedBench(sectionAt(z).b, k, at(-4.25, 0, z))
    colliders.push({ minX: -4.68, maxX: -3.82, minZ: z - 1, maxZ: z + 1, kind: 'seat' })
  }
  for (const z of [-10.8, 7.5, 23.8, 39.5, 55.5]) {
    platformConifer(sectionAt(z).b, k, at(-4.3, 0, z))
    colliders.push({ minX: -4.75, maxX: -3.85, minZ: z - 0.45, maxZ: z + 0.45, kind: 'crate' })
  }
  // End boundary remains distant from the front carriage, in the locomotive steam.
  for (const z of [-28, 62]) {
    const b = sectionAt(z).b
    const rear = z < 0
    box(b, rear ? k.platformStone : k.iron, 10, rear ? 6 : 1.2, 0.2, 0, rear ? 3 : 0.6, z, 2)
    colliders.push({ minX: -5, maxX: 5, minZ: z - 0.1, maxZ: z + 0.1 })
  }
  const signal = sectionAt(62).b
  railwaySignal(signal, k, at(10.6, -1, 70), 5.6)
  // Build each section separately; never merge the full 90 m station into one mesh.
  for (const { start, builder } of sections) {
    const batch = new THREE.Group(); batch.name = `platform-section-${start}`
    builder.build(batch, 'platform-detail', { decor: true }); group.add(batch)
  }
  // Shared cheap light pools; these are appearance cues, not extra real lights.
  markPlatformDecor(addFloorGlows(group, lampZ.map(z => ({ x: 0.4, y: 0, z, radius: 2.5, strength: 0.2 })), null, 0xffb666, 'platform-warm-pools'))
  const streaks = createKitBuilder()
  for (const z of lampZ) for (const dx of [-0.3, 0, 0.3]) {
    box(streaks, k.lampShade, 0.045, 0.002, 1.8, 0.4 + dx, 0.006, z)
  }
  streaks.build(group, 'wet-light-streaks', { decor: true })
  return { group, colliders, cores }
}

export function createStationBlockout({ includePlaceholders = false } = {}) {
  const group = new THREE.Group()
  group.name = 'station'

  const track = createTrackBed()
  group.add(track)

  const rearWall = createRearWall()
  group.add(rearWall.group)
  // The old arched platform dressing is replaced; hall-facing backing is retained.

  const approachCorridor = createApproachCorridor()
  group.add(approachCorridor.group)

  const platform = createOpenPlatform()
  group.add(platform.group)

  if (includePlaceholders) {
    group.add(createGuardPlaceholder())
    group.add(createCameraPlaceholder(-8))
    group.add(createCameraPlaceholder(12))
  }

  return {
    group,
    bounds,
    platform: platform.group,
    track,
    coverCores: platform.cores,
    hallDressing: approachCorridor.dressing,
    wallColliders: [
      ...rearWall.colliders,
      ...approachCorridor.colliders,
      ...platform.colliders
    ]
  }
}

// The sun's shadow camera follows the player. SUN_SHADOW_LAYER is the merged
// stair volumes from core/stairs.js, which the main camera never draws.

// Moonlight, not the sunset. 30° up, a few degrees north of east, so it is
// ahead of the Boarding spawn camera (that camera looks along +X). The
// afterglow stays on (16, 0, -10), south of east and just below the horizon.
// tan(30°) is about 0.58, so a 6 m wall throws about 10 m of shadow and the
// ±16 m window still covers it. Bias stays at the previous 32° values.
const SUN_ELEVATION = 30 * Math.PI / 180
const SUN_AZIMUTH = new THREE.Vector3(16, 0, 3).normalize()
const SUN_SHADOW_HALF = 16
const SUN_SHADOW_DISTANCE = 36
export const SUN_DIRECTION = new THREE.Vector3(
  SUN_AZIMUTH.x * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  SUN_AZIMUTH.z * Math.cos(SUN_ELEVATION)
)
// Opt-in platform moon. The original bearing remains the default everywhere else.
export const PLATFORM_MOON_DIRECTION = new THREE.Vector3(0.85, 0.25, 0.46).normalize()
const SUN_CAMERA_UP = new THREE.Vector3(0, 1, 0)
const _camRight = new THREE.Vector3()
const _camUp = new THREE.Vector3()
const _camForward = new THREE.Vector3()
const _snapped = new THREE.Vector3()
const _delta = new THREE.Vector3()

export function updateStationSunShadow(sunlight, focus, direction = SUN_DIRECTION) {
  if (!sunlight || !focus) return
  const target = sunlight.target
  target.position.copy(focus)
  sunlight.position.copy(focus).addScaledVector(direction, SUN_SHADOW_DISTANCE)

  // Match the basis Three uses when it points the shadow camera at the target,
  // then snap both the light and the target onto that camera's texel grid.
  const cam = sunlight.shadow.camera
  cam.position.copy(sunlight.position)
  cam.up.copy(SUN_CAMERA_UP)
  cam.lookAt(target.position)
  cam.updateMatrixWorld()

  _camRight.setFromMatrixColumn(cam.matrixWorld, 0)
  _camUp.setFromMatrixColumn(cam.matrixWorld, 1)
  _camForward.setFromMatrixColumn(cam.matrixWorld, 2)

  const mapSize = Math.max(1, sunlight.shadow.mapSize.x)
  const texel = (cam.right - cam.left) / mapSize
  const x = Math.round(target.position.dot(_camRight) / texel) * texel
  const y = Math.round(target.position.dot(_camUp) / texel) * texel
  const z = target.position.dot(_camForward)
  _snapped.set(0, 0, 0)
    .addScaledVector(_camRight, x)
    .addScaledVector(_camUp, y)
    .addScaledVector(_camForward, z)
  _delta.copy(_snapped).sub(target.position)
  target.position.add(_delta)
  sunlight.position.add(_delta)
}

// Warm, controlled station lighting for Level 1's visual identity. Base
// exposure comes from the hemisphere + directional pair (both resolution- and
// unit-stable); the pendant lamps inside the blockout add warm accents.
export function createStationLighting() {
  // Day-for-night moonlight: about 3× the old 0.65, cool silver-blue.
  // Lamps and torches stay warmer and brighter than this. The sky's
  // afterglow is a different direction, below the horizon.
  const sunlight = new THREE.DirectionalLight(0xc8daf6, 1.95)
  sunlight.name = 'station-sun'
  sunlight.position.copy(SUN_DIRECTION).multiplyScalar(SUN_SHADOW_DISTANCE)
  sunlight.castShadow = true
  const shadowSize = shadowMapSize(settings.get('shadowQuality')) || 2048
  sunlight.shadow.mapSize.set(shadowSize, shadowSize)
  sunlight.shadow.camera.left = -SUN_SHADOW_HALF
  sunlight.shadow.camera.right = SUN_SHADOW_HALF
  sunlight.shadow.camera.top = SUN_SHADOW_HALF
  sunlight.shadow.camera.bottom = -SUN_SHADOW_HALF
  sunlight.shadow.camera.near = 1
  sunlight.shadow.camera.far = SUN_SHADOW_DISTANCE + SUN_SHADOW_HALF + 16
  sunlight.shadow.camera.updateProjectionMatrix()
  sunlight.shadow.camera.layers.enable(SUN_SHADOW_LAYER)
  // 30° is still steep enough that this bias holds acne off the platform.
  // A grazing moon would need more; this one does not.
  sunlight.shadow.bias = -0.0002
  sunlight.shadow.normalBias = 0.045
  sunlight.target.position.set(0, 0, 0)

  // A little more sky fill than the old 0.32, so shadowed faces keep a
  // shape. The ground stays near-black and the warm lamps still lead.
  const sky = new THREE.HemisphereLight(0x2a4068, 0x0a090e, 0.48)
  sky.name = 'station-sky'
  const fill = new THREE.AmbientLight(0x10131c, 0.06)
  fill.name = 'station-fill'

  // -------------------------------------------------------------
  // Exterior Mountain Floodlights & Architectural Spotlights
  // -------------------------------------------------------------
  const spotLights = []
  const spotTargets = []

  // Floodlight 1 — Left mountain sector
  const spotLeft = new THREE.SpotLight(0xffb86c, 6.0, 145.0, Math.PI / 2.8, 0.75, 1.5)
  spotLeft.position.set(-5.0, 6.2, -12.0)
  const targetLeft = new THREE.Object3D()
  targetLeft.position.set(-65.0, 18.0, -25.0)
  spotLeft.target = targetLeft
  spotLights.push(spotLeft)
  spotTargets.push(targetLeft)

  // Floodlight 2 — Center mountain peak. The light stays; it does not cast
  // a shadow map. The sun is the only shadow caster on this level.
  const spotCenter = new THREE.SpotLight(0xffc480, 8.0, 165.0, Math.PI / 2.6, 0.8, 1.4)
  spotCenter.position.set(-5.0, 6.4, 0.0)
  const targetCenter = new THREE.Object3D()
  targetCenter.position.set(-75.0, 24.0, 0.0)
  spotCenter.target = targetCenter
  spotCenter.castShadow = false
  spotLights.push(spotCenter)
  spotTargets.push(targetCenter)

  // Floodlight 3 — Right mountain sector
  const spotRight = new THREE.SpotLight(0xffb86c, 6.0, 145.0, Math.PI / 2.8, 0.75, 1.5)
  spotRight.position.set(-5.0, 6.2, 12.0)
  const targetRight = new THREE.Object3D()
  targetRight.position.set(-65.0, 18.0, 25.0)
  spotRight.target = targetRight
  spotLights.push(spotRight)
  spotTargets.push(targetRight)

  // The outer-wall sconces are glow only: the walls hide them from every
  // walkable spot, and a real light each would crowd the light pool.
  const allLights = [sunlight, sunlight.target, sky, fill, ...spotLights, ...spotTargets]
  allLights.spotLights = spotLights

  return allLights
}

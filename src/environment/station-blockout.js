import * as THREE from 'three'
import { RAIL_OFFSET, TRACK_LEVEL, TRACK_X, TRAIN_LENGTH, TRAIN_Z } from '../entities/train.js'
import { createHumanoid, GUARD_PALETTE } from '../entities/humanoid.js'
import { SUN_SHADOW_LAYER } from '../core/stairs.js'
import {
  carpetMaterial,
  marbleFloorMaterial,
  metalMaterial,
  plasterMaterial,
  signMaterial,
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
  kbox,
  luggageTrolley,
  metreUv,
  pendantLamp,
  pottedPalm,
  ticketBooth,
  trunk,
  wallClock
} from './level1-kit/kit-props.js'
import { addWallGlows } from './landing/light-pools.js'

// Level 1's station: a covered platform with a marble concourse, cast-iron
// columns under a glazed train shed, a panelled rear wall with lit arched
// windows, and the track trench alongside. Still primitives — no modelled or
// downloaded assets — but textured and lit for the concept doc's "warm,
// controlled, believable" Level 1 identity rather than left as greybox.
//
// The platform surface is y = 0 and the track floor is TRACK_LEVEL, so the
// train's floor lines up with the platform and its wheels sit in the trench.

export const PLATFORM_WIDTH = 10
export const PLATFORM_LENGTH = 56

const HALF_WIDTH = PLATFORM_WIDTH / 2
const HALF_LENGTH = PLATFORM_LENGTH / 2
const ROOF_Y = 6
const WALL_X = -HALF_WIDTH
const PILLAR_X = 4.6
const PILLAR_Z = [-24, -16, -8, 0, 8, 16, 24]

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

const GATE_DOORS = [
  { z: -14, doorMin: 1.0, doorMax: 3.4 },   // Approach → Colonnade: opens east
  { z: 4, doorMin: -4.0, doorMax: -1.6 },   // Colonnade → Checkpoint: opens west
  { z: 20, doorMin: 0.6, doorMax: 3.0 }     // Checkpoint → Boarding: opens east
]
export const GATE_Z = GATE_DOORS.map((g) => g.z)
const DOOR_HEIGHT = 2.6

// Axis-aligned outer bounds. The west side is extended for the new
// perpendicular infiltration wing. Solid wall colliders below keep the
// player inside the intended L-shaped route rather than the whole rectangle.
export const bounds = {
  minX: APPROACH_START_X + 0.7,
  maxX: 4.3,
  minZ: -HALF_LENGTH + 0.8,
  maxZ: HALF_LENGTH - 0.8
}

function createConcourse() {
  const group = new THREE.Group()

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATFORM_WIDTH, PLATFORM_LENGTH),
    marbleFloorMaterial({ repeat: [5, 20], base: 0xa89a86, vein: 0x6a6053, grout: 0x453e35 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // Coping stone and the tactile safety strip that runs along the edge.
  const coping = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.1, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0xb9b09c, roughness: 0.92 })
  )
  coping.position.set(HALF_WIDTH - 0.22, 0.05, 0)
  coping.receiveShadow = true
  group.add(coping)

  const safetyLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.03, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0xd8a63c, roughness: 0.6, emissive: 0x3a2a08, emissiveIntensity: 1 })
  )
  safetyLine.position.set(HALF_WIDTH - 0.75, 0.03, 0)
  group.add(safetyLine)

  // The vertical face dropping from the platform down past the rail head to
  // the ballast.
  const edgeFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 1.5, PLATFORM_LENGTH),
    plasterMaterial({ repeat: [1, 20], base: 0x50483f, roughness: 0.9 })
  )
  edgeFace.position.set(HALF_WIDTH, -0.75, 0)
  edgeFace.receiveShadow = true
  group.add(edgeFace)

  return group
}

function createTrackBed() {
  const group = new THREE.Group()
  // The consist is longer than the platform and is centered on TRAIN_Z, with
  // the nose at the forward platform end. The extra length covers the cars
  // at rest plus the departure roll, which drives the train about 19 m
  // toward +Z.
  const length = Math.max(PLATFORM_LENGTH + 16, TRAIN_LENGTH + 48)

  // TRACK_LEVEL is the top of the rail head — the height the train's wheel
  // treads rest on — so everything here stacks downwards from it.
  const ballast = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.4, length),
    plasterMaterial({ repeat: [3, Math.round(length / 3)], base: 0x3b3830, roughness: 1 })
  )
  ballast.position.set(TRACK_X, TRACK_LEVEL - 0.5, TRAIN_Z)
  ballast.receiveShadow = true
  group.add(ballast)

  // Sleepers: one InstancedMesh for the whole run rather than ~55 meshes.
  const sleeperCount = Math.floor(length / 0.8)
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.8, 0.14, 0.28),
    woodMaterial({ repeat: [2, 1], light: 0x4a3826, dark: 0x241a11, roughness: 0.95 }),
    sleeperCount
  )
  const dummy = new THREE.Object3D()
  for (let i = 0; i < sleeperCount; i++) {
    dummy.position.set(TRACK_X, TRACK_LEVEL - 0.25, TRAIN_Z - length / 2 + i * 0.8 + 0.4)
    dummy.updateMatrix()
    sleepers.setMatrixAt(i, dummy.matrix)
  }
  sleepers.instanceMatrix.needsUpdate = true
  sleepers.receiveShadow = true
  group.add(sleepers)

  const railMaterial = metalMaterial({ repeat: [1, Math.round(length / 2.4)], base: 0x8d8a83, roughness: 0.78, metalness: 0.45 })
  for (const offset of [-RAIL_OFFSET, RAIL_OFFSET]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, length), railMaterial)
    rail.position.set(TRACK_X + offset, TRACK_LEVEL - 0.09, TRAIN_Z)
    group.add(rail)
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

  // Arched windows: dusk light coming in from outside the station. Skip the
  // new doorway bay so no window geometry floats across the entrance.
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fb4d8,
    emissive: 0xbcd0f0,
    emissiveIntensity: 1.5,
    roughness: 0.2
  })
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7, metalness: 0.3 })
  const paneGeometry = new THREE.BoxGeometry(0.08, 2.4, 1.5)
  const archGeometry = new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16, 1, false, 0, Math.PI)
  archGeometry.rotateZ(Math.PI / 2)
  const frameGeometry = new THREE.BoxGeometry(0.05, 2.6, 1.7)

  for (let z = -HALF_LENGTH + 5; z <= HALF_LENGTH - 5; z += 6) {
    if (z > APPROACH_Z_MIN - 1 && z < APPROACH_Z_MAX + 1) continue

    const frame = new THREE.Mesh(frameGeometry, frameMaterial)
    frame.position.set(WALL_X + 0.02, 3.4, z)
    group.add(frame)

    const pane = new THREE.Mesh(paneGeometry, glassMaterial)
    pane.position.set(WALL_X + 0.01, 3.4, z)
    group.add(pane)

    const arch = new THREE.Mesh(archGeometry, glassMaterial)
    arch.position.set(WALL_X + 0.01, 4.6, z)
    group.add(arch)
  }

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
  for (let x = -48; x <= -8; x += 8) {
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
  ;[-37, -24, -14, -5].forEach((x, i) => framedPoster(kit, k, at(x, 2.55, southFace, 0), i + 1))
  // Clocks over the first and last gate, facing the way the player comes.
  wallClock(kit, k, at(APPROACH_GATE_X[0] - 0.16, 3.7, -25.8, -Math.PI / 2), 0.42)
  wallClock(kit, k, at(APPROACH_GATE_X[2] - 0.16, 3.7, -25.72, -Math.PI / 2), 0.42)
  // Warm wash above each poster, as if from the pendants.
  addWallGlows(group, [
    ...[-43, -35, -21, -13, -3].map((x) => ({ x, y: 3.4, z: northFace - 0.02, yaw: Math.PI / 2, width: 2.6, height: 2.6, strength: 0.16 })),
    ...[-37, -24, -14, -5].map((x) => ({ x, y: 3.4, z: southFace + 0.02, yaw: -Math.PI / 2, width: 2.6, height: 2.6, strength: 0.16 }))
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

  return { group, colliders, dressing }
}

function createPillars() {
  const group = new THREE.Group()

  const ironMaterial = metalMaterial({ repeat: [1, 3], base: 0x33413c, roughness: 0.55, metalness: 0.6 })
  const brassMaterial = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })

  const baseGeometry = new THREE.BoxGeometry(0.85, 0.3, 0.85)
  const shaftGeometry = new THREE.CylinderGeometry(0.24, 0.3, 5.1, 14)
  const collarGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14)
  const capitalGeometry = new THREE.BoxGeometry(0.75, 0.3, 0.75)
  const bracketGeometry = new THREE.BoxGeometry(0.12, 0.1, 1.6)

  for (const z of PILLAR_Z) {
    const base = new THREE.Mesh(baseGeometry, ironMaterial)
    base.position.set(PILLAR_X, 0.15, z)
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    const shaft = new THREE.Mesh(shaftGeometry, ironMaterial)
    shaft.position.set(PILLAR_X, 2.85, z)
    shaft.castShadow = true
    group.add(shaft)

    for (const y of [0.45, 5.25]) {
      const collar = new THREE.Mesh(collarGeometry, brassMaterial)
      collar.position.set(PILLAR_X, y, z)
      group.add(collar)
    }

    const capital = new THREE.Mesh(capitalGeometry, ironMaterial)
    capital.position.set(PILLAR_X, 5.55, z)
    capital.castShadow = true
    group.add(capital)

    // Decorative brackets fanning out to the roof deck.
    for (const side of [-1, 1]) {
      const bracket = new THREE.Mesh(bracketGeometry, ironMaterial)
      bracket.position.set(PILLAR_X, 5.75, z + side * 0.8)
      bracket.rotation.x = side * 0.35
      group.add(bracket)
    }
  }

  return group
}

function createGateWall({ z, doorMin, doorMax }, name, wallMat, frameMat) {
  const gate = new THREE.Group()
  gate.name = name

  const leftWidth = doorMin - WALL_X
  const leftCenterX = WALL_X + leftWidth / 2
  const rightWidth = HALF_WIDTH - doorMax
  const rightCenterX = doorMax + rightWidth / 2

  const leftFlank = new THREE.Mesh(new THREE.BoxGeometry(leftWidth, ROOF_Y, 0.3), wallMat)
  leftFlank.position.set(leftCenterX, ROOF_Y / 2, z)
  leftFlank.castShadow = true
  leftFlank.receiveShadow = true
  gate.add(leftFlank)

  const rightFlank = new THREE.Mesh(new THREE.BoxGeometry(rightWidth, ROOF_Y, 0.3), wallMat)
  rightFlank.position.set(rightCenterX, ROOF_Y / 2, z)
  rightFlank.castShadow = true
  rightFlank.receiveShadow = true
  gate.add(rightFlank)

  // Lintel closes the gap above door height, so the opening reads as a
  // doorway rather than a hole straight through to the shed roof.
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(doorMax - doorMin, ROOF_Y - DOOR_HEIGHT, 0.3),
    wallMat
  )
  lintel.position.set((doorMin + doorMax) / 2, DOOR_HEIGHT + (ROOF_Y - DOOR_HEIGHT) / 2, z)
  lintel.castShadow = true
  gate.add(lintel)

  // Brass door-frame trim, echoing the pillar collars elsewhere on the set.
  const jambGeometry = new THREE.BoxGeometry(0.12, DOOR_HEIGHT, 0.34)
  for (const x of [doorMin, doorMax]) {
    const jamb = new THREE.Mesh(jambGeometry, frameMat)
    jamb.position.set(x, DOOR_HEIGHT / 2, z)
    gate.add(jamb)
  }
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(doorMax - doorMin + 0.24, 0.12, 0.34),
    frameMat
  )
  header.position.set((doorMin + doorMax) / 2, DOOR_HEIGHT, z)
  gate.add(header)

  // AABB colliders for the two solid flanks only — the door gap stays open.
  // Both the player (player.js) and guards (stealth.js) resolve against
  // these, so nobody can walk through the wall; the same mesh list also
  // feeds the guard/camera line-of-sight raycasts, so nobody can *see*
  // through it either.
  const colliders = [
    { minX: WALL_X, maxX: doorMin, minZ: z - 0.2, maxZ: z + 0.2 },
    { minX: doorMax, maxX: HALF_WIDTH, minZ: z - 0.2, maxZ: z + 0.2 }
  ]

  return { gate, colliders }
}

function createPartitionWalls() {
  const group = new THREE.Group()
  group.name = 'partition-walls'
  const colliders = []

  const wallMat = plasterMaterial({ repeat: [2, 3], base: 0x796d5e, roughness: 0.88 })
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.9 })
  const names = ['approach-gate', 'colonnade-gate', 'checkpoint-gate']

  GATE_DOORS.forEach((door, i) => {
    const { gate, colliders: gateColliders } = createGateWall(door, names[i], wallMat, frameMat)
    group.add(gate)
    colliders.push(...gateColliders)
  })

  return { group, colliders }
}

function createTrainShed() {
  const group = new THREE.Group()

  // Roof deck. Deliberately does NOT cast shadows: the sun rakes in from the
  // open track side, and a shadow-casting deck would flatten the whole
  // platform into darkness for no visual gain.
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_WIDTH + 2.4, 0.25, PLATFORM_LENGTH),
    plasterMaterial({ repeat: [4, 16], base: 0x453f38, roughness: 0.95 })
  )
  deck.position.set(-0.3, ROOF_Y, 0)
  group.add(deck)

  // Glazed skylight strips let the shed read as a Victorian train shed and
  // give the ceiling something to catch the eye.
  const skylightMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8bcd8,
    emissive: 0x93aed4,
    emissiveIntensity: 1.1,
    roughness: 0.25
  })
  for (const x of [-2.6, 1.4]) {
    const skylight = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.08, PLATFORM_LENGTH - 3),
      skylightMaterial
    )
    skylight.position.set(x, ROOF_Y - 0.13, 0)
    group.add(skylight)
  }

  // Lattice trusses spanning the platform.
  const trussMaterial = metalMaterial({ repeat: [4, 1], base: 0x3a3a3c, roughness: 0.6, metalness: 0.7 })
  const chordGeometry = new THREE.BoxGeometry(PLATFORM_WIDTH + 2, 0.16, 0.2)
  const webGeometry = new THREE.BoxGeometry(0.9, 0.09, 0.12)

  for (let z = -HALF_LENGTH + 2; z <= HALF_LENGTH - 2; z += 4) {
    const chord = new THREE.Mesh(chordGeometry, trussMaterial)
    chord.position.set(-0.3, ROOF_Y - 0.45, z)
    chord.castShadow = true
    group.add(chord)

    // Alternating diagonals give the chord a lattice read rather than a row
    // of parallel bars.
    let brace = 0
    for (let x = -5; x <= 4; x += 1.5) {
      const web = new THREE.Mesh(webGeometry, trussMaterial)
      web.position.set(x, ROOF_Y - 0.28, z)
      web.rotation.z = (brace++ % 2 === 0 ? 1 : -1) * 0.5
      group.add(web)
    }
  }

  return group
}

function createPendantLamps() {
  const group = new THREE.Group()

  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.9 })
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0cc,
    emissive: 0xffdda0,
    emissiveIntensity: 3.2
  })
  const rodGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6)
  const shadeGeometry = new THREE.ConeGeometry(0.45, 0.38, 14, 1, true)
  const bulbGeometry = new THREE.SphereGeometry(0.13, 10, 8)

  for (const z of [-21, -14, -7, 0, 7, 14, 21]) {
    const rod = new THREE.Mesh(rodGeometry, brass)
    rod.position.set(0.4, ROOF_Y - 0.75, z)
    group.add(rod)

    // A cone's wide end is already its -Y end, so it hangs mouth-down as-is.
    const shade = new THREE.Mesh(shadeGeometry, brass)
    shade.position.set(0.4, ROOF_Y - 1.5, z)
    group.add(shade)

    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial)
    bulb.position.set(0.4, ROOF_Y - 1.62, z)
    group.add(bulb)

    // The warm pool on the platform. Moonlight is only a cool fill.
    // and hemisphere lights, and none of these cast shadows.
    const lamp = new THREE.PointLight(0xffc98a, 22, 13, 2)
    lamp.position.set(0.4, ROOF_Y - 1.7, z)
    group.add(lamp)
  }

  return group
}

// The kit bench keeps the blockout footprint, so the collider taken from
// its bounds is unchanged.
function createBench(z) {
  const bench = new THREE.Group()
  const kit = createKitBuilder()
  cushionedBench(kit, getKitMaterials(), null)
  kit.build(bench, 'bench')
  bench.position.set(WALL_X + 0.75, 0, z)
  return bench
}

function createDepartureBoard() {
  const board = new THREE.Group()

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.1, 3.2),
    signMaterial({ text: 'CHRONO EXPRESS  ·  23:40', background: 0x0d0f14, foreground: 0xe0b45c, width: 512, height: 180 })
  )
  panel.rotation.y = Math.PI / 2
  board.add(panel)

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 1.28, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.6, metalness: 0.5 })
  )
  frame.rotation.y = Math.PI / 2
  frame.position.x = 0.02
  board.add(frame)

  for (const side of [-1.3, 1.3]) {
    const hanger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c322f, metalness: 0.8, roughness: 0.4 })
    )
    hanger.position.set(0, 1.4, side)
    board.add(hanger)
  }

  board.position.set(-1.6, 3.6, -6)
  return board
}

function createPlatformSign() {
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.52, 2),
    signMaterial({ text: 'PLATFORM 1', background: 0x11223a, foreground: 0xf0e6cf, width: 512, height: 128 })
  )
  sign.rotation.y = Math.PI / 2
  sign.position.set(PILLAR_X - 0.35, 3.1, 0)
  return sign
}

function createStationClock() {
  const clock = new THREE.Group()

  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0xf2ead6, emissive: 0x6b6250, emissiveIntensity: 0.6, roughness: 0.5 })
  )
  face.rotation.z = Math.PI / 2
  clock.add(face)

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.5, metalness: 0.6 })
  )
  rim.rotation.z = Math.PI / 2
  rim.position.x = -0.02
  clock.add(rim)

  const handMaterial = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4 })
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.3), handMaterial)
  hourHand.position.set(0.07, 0.08, 0.13)
  clock.add(hourHand)
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.05), handMaterial)
  minuteHand.position.set(0.07, 0.2, 0)
  clock.add(minuteHand)

  clock.position.set(WALL_X + 0.45, 4.3, 10)
  return clock
}

// Porter's trolley, same extents as the blockout one (its collider comes
// from its bounds).
function createLuggage() {
  const group = new THREE.Group()
  const kit = createKitBuilder()
  luggageTrolley(kit, getKitMaterials(), null)
  kit.build(group, 'luggage')
  group.position.set(-3.4, 0, -13)
  group.rotation.y = 0.3
  return group
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

function createBoardingControl() {
  // Brass pedestal with a lit screen, on the platform edge beside the
  // locomotive's front (the nose rests at z = 26). Interacting with it
  // triggers the level-manager transition into Level 2.
  const control = new THREE.Group()
  control.name = 'boarding-control'

  const brass = new THREE.MeshStandardMaterial({ color: 0xa9812f, roughness: 0.3, metalness: 0.92 })
  const casing = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.55, metalness: 0.5 })

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.12, 14), brass)
  foot.position.y = 0.06
  foot.castShadow = true
  control.add(foot)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.95, 14), brass)
  column.position.y = 0.55
  column.castShadow = true
  control.add(column)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.34), casing)
  head.position.y = 1.18
  head.rotation.x = -0.32
  head.castShadow = true
  control.add(head)

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.28, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x36e0a4, emissive: 0x1fbf88, emissiveIntensity: 2.4, roughness: 0.25 })
  )
  screen.position.set(0, 1.24, 0.19)
  screen.rotation.x = -0.32
  control.add(screen)

  control.position.set(4, 0, 25)
  return control
}

function createExteriorLightFixtures() {
  const group = new THREE.Group()
  group.name = 'exterior-light-fixtures'

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.4, metalness: 0.8 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff0cc,
    emissive: 0xffb86c,
    emissiveIntensity: 4.5,
    roughness: 0.1
  })

  // 1. Roof Exterior Floodlight Fixtures (3 mounted along rear eave X = -5.0, Y = 6.2, facing -X towards mountains)
  for (const z of [-12, 0, 12]) {
    const fixture = new THREE.Group()
    fixture.position.set(-5.0, 6.2, z)

    // Base bracket attached to roof eave
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), metalMat)
    base.position.set(0.15, 0, 0)
    fixture.add(base)

    // Swivel arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), brassMat)
    arm.rotation.z = Math.PI / 4
    arm.position.set(-0.1, 0, 0)
    fixture.add(arm)

    // Floodlight housing cone angled towards negative X (towards mountain)
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.25, 0.55, 12), metalMat)
    housing.rotation.z = -Math.PI / 3.2
    housing.position.set(-0.35, 0.1, 0)
    fixture.add(housing)

    // Emissive Lens Face
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12), bulbMat)
    lens.rotation.z = -Math.PI / 3.2
    lens.position.set(-0.55, 0.22, 0)
    fixture.add(lens)

    group.add(fixture)
  }

  // 2. Wall Sconces on Outer Face of Rear Wall (X = -5.2, Y = 3.8, Z = -12, -4, 4, 12)
  for (const z of [-12, -4, 4, 12]) {
    const sconce = new THREE.Group()
    sconce.position.set(-5.2, 3.8, z)

    const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.25), brassMat)
    sconce.add(wallPlate)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), brassMat)
    neck.rotation.z = -Math.PI / 2
    neck.position.set(-0.18, 0, 0)
    sconce.add(neck)

    const glassGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), bulbMat)
    glassGlobe.position.set(-0.32, 0, 0)
    sconce.add(glassGlobe)

    group.add(sconce)
  }

  return group
}

export function createStationBlockout({ includePlaceholders = false } = {}) {
  const group = new THREE.Group()
  group.name = 'station'
  const stationPropColliders = []

  function addFloorPropCollider(object, inset = 0.08) {
    group.updateMatrixWorld(true)
    object.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const maxInsetX = Math.max(0, (box.max.x - box.min.x) * 0.22)
    const maxInsetZ = Math.max(0, (box.max.z - box.min.z) * 0.22)
    const ix = Math.min(inset, maxInsetX)
    const iz = Math.min(inset, maxInsetZ)
    stationPropColliders.push({
      minX: box.min.x + ix,
      maxX: box.max.x - ix,
      minZ: box.min.z + iz,
      maxZ: box.max.z - iz
    })
  }

  group.add(createConcourse())
  group.add(createTrackBed())

  const rearWall = createRearWall()
  group.add(rearWall.group)

  const approachCorridor = createApproachCorridor()
  group.add(approachCorridor.group)

  const stationPillars = createPillars()
  group.add(stationPillars)
  for (const z of PILLAR_Z) {
    stationPropColliders.push({
      minX: PILLAR_X - 0.36,
      maxX: PILLAR_X + 0.36,
      minZ: z - 0.36,
      maxZ: z + 0.36
    })
  }
  const partitionWalls = createPartitionWalls()
  group.add(partitionWalls.group)
  group.add(createTrainShed())
  group.add(createPendantLamps())
  group.add(createDepartureBoard())
  group.add(createPlatformSign())
  group.add(createStationClock())
  const stationLuggage = createLuggage()
  group.add(stationLuggage)
  addFloorPropCollider(stationLuggage, 0.10)
  group.add(createExteriorLightFixtures())

  if (includePlaceholders) {
    group.add(createGuardPlaceholder())
    group.add(createCameraPlaceholder(-8))
    group.add(createCameraPlaceholder(12))
  }

  for (const z of [-12, -4, 4, 12]) {
    const bench = createBench(z)
    group.add(bench)
    addFloorPropCollider(bench, 0.09)
  }

  // A red carpet runner leading to the boarding point — luxury cue, and it
  // quietly signposts where the player is meant to go.
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 16),
    carpetMaterial({ repeat: [1, 9], base: 0x5e1f28, accent: 0x9a7238 })
  )
  runner.rotation.x = -Math.PI / 2
  runner.position.set(2.2, 0.015, -20)
  runner.receiveShadow = true
  group.add(runner)

  const boardingControl = createBoardingControl()
  group.add(boardingControl)
  addFloorPropCollider(boardingControl, 0.08)

  return {
    group,
    bounds,
    boardingControl,
    hallDressing: approachCorridor.dressing,
    wallColliders: [
      ...rearWall.colliders,
      ...approachCorridor.colliders,
      ...partitionWalls.colliders,
      ...stationPropColliders
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
const SUN_CAMERA_UP = new THREE.Vector3(0, 1, 0)
const _camRight = new THREE.Vector3()
const _camUp = new THREE.Vector3()
const _camForward = new THREE.Vector3()
const _snapped = new THREE.Vector3()
const _delta = new THREE.Vector3()

export function updateStationSunShadow(sunlight, focus) {
  if (!sunlight || !focus) return
  const target = sunlight.target
  target.position.copy(focus)
  sunlight.position.copy(focus).addScaledVector(SUN_DIRECTION, SUN_SHADOW_DISTANCE)

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

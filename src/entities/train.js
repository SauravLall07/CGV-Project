import * as THREE from 'three'
import { litWindowMaterial, metalMaterial, woodMaterial } from '../environment/textures.js'

// The train's parent-child hierarchy: a `train` Group containing named
// `carriage-N` Groups plus a `locomotive` Group. Moving/rotating `train`
// moves everything with it, and each carriage can still be moved/rotated
// independently of its siblings — the Alpha hierarchy requirement, now with
// real content hanging off it.
//
// Carriage progression follows the concept doc's Passenger -> Security ->
// Cargo -> Mechanical -> Vault order, each with its own livery and window
// treatment so the progression reads at a glance.
//
// Geometry is laid out so the carriage FLOOR sits at local y = 1.0 with the
// wheel treads at local y = 0. The train is then dropped to y = TRACK_LEVEL,
// which puts its floor level with the station platform and its wheels down in
// the track trench — the same relationship a real platform has.

export const TRACK_X = 7
export const TRACK_LEVEL = -1

const CARRIAGE_LENGTH = 6
const COUPLING_GAP = 0.6
const CARRIAGE_SPACING = CARRIAGE_LENGTH + COUPLING_GAP
const BODY_HALF_WIDTH = 1.6
const FLOOR_Y = 1
const BODY_TOP_Y = 3
const WAIST_Y = 2.02
const WHEEL_RADIUS = 0.42

const CARRIAGE_TYPES = [
  { type: 'passenger', lower: 0x2f5d4a, upper: 0xe7ddc6, panes: 6, glass: 0xffd9a0, glow: 1.6 },
  { type: 'security', lower: 0x39414b, upper: 0x8d949c, panes: 10, glass: 0x9fd0ff, glow: 0.7 },
  { type: 'cargo', lower: 0x5a3f2c, upper: 0x715339, panes: 0, glass: 0x000000, glow: 0 },
  { type: 'mechanical', lower: 0x343a42, upper: 0x4d555f, panes: 8, glass: 0xffb066, glow: 0.9 },
  { type: 'vault', lower: 0x24262b, upper: 0x33363d, panes: 0, glass: 0x000000, glow: 0 }
]

// Shared geometry/material sets, built once per createTrain() and reused by
// every carriage — five carriages that each allocated their own copies would
// be five times the GPU memory for identical data.
function createSharedResources() {
  const brass = new THREE.MeshStandardMaterial({ color: 0xb98f3e, roughness: 0.28, metalness: 0.92 })
  const steel = metalMaterial({ repeat: [2, 1], base: 0x6f747c, roughness: 0.5, metalness: 0.88 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.62, metalness: 0.7 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.95, metalness: 0.05 })
  const timber = woodMaterial({ repeat: [3, 1], light: 0x7a5230, dark: 0x3f2716 })

  return {
    brass,
    steel,
    darkSteel,
    rubber,
    timber,
    chassis: new THREE.BoxGeometry(3, 0.3, CARRIAGE_LENGTH - 0.1),
    bogieFrame: new THREE.BoxGeometry(2.5, 0.32, 1.7),
    wheel: (() => {
      const geometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.16, 16)
      geometry.rotateZ(Math.PI / 2) // axle runs along X
      return geometry
    })(),
    vent: new THREE.BoxGeometry(0.5, 0.16, 0.7),
    tank: new THREE.BoxGeometry(0.8, 0.5, 1.5)
  }
}

function addWheels(carriage, shared) {
  // One InstancedMesh for all eight wheels rather than eight separate meshes.
  const wheels = new THREE.InstancedMesh(shared.wheel, shared.darkSteel, 8)
  const dummy = new THREE.Object3D()
  let index = 0

  for (const bogieZ of [-1.9, 1.9]) {
    for (const axleOffset of [-0.62, 0.62]) {
      for (const side of [-1.32, 1.32]) {
        dummy.position.set(side, WHEEL_RADIUS, bogieZ + axleOffset)
        dummy.updateMatrix()
        wheels.setMatrixAt(index++, dummy.matrix)
      }
    }
  }
  wheels.instanceMatrix.needsUpdate = true
  wheels.castShadow = true
  carriage.add(wheels)

  for (const bogieZ of [-1.9, 1.9]) {
    const frame = new THREE.Mesh(shared.bogieFrame, shared.darkSteel)
    frame.position.set(0, 0.62, bogieZ)
    frame.castShadow = true
    carriage.add(frame)
  }
}

function addDoor(carriage, shared, lowerMaterial) {
  // Platform-facing door: a recessed leaf with a glazed upper half and a
  // brass handle, so the carriage reads as boardable.
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.75, 0.95), lowerMaterial)
  leaf.position.set(-BODY_HALF_WIDTH - 0.01, FLOOR_Y + 0.9, 0)
  carriage.add(leaf)

  const surround = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.9, 1.1), shared.brass)
  surround.position.set(-BODY_HALF_WIDTH - 0.005, FLOOR_Y + 0.9, 0)
  carriage.add(surround)

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.62, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xffe0ac, emissive: 0xffd08a, emissiveIntensity: 1.4, roughness: 0.25 })
  )
  glass.position.set(-BODY_HALF_WIDTH - 0.05, FLOOR_Y + 1.32, 0)
  carriage.add(glass)

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), shared.brass)
  handle.rotation.x = Math.PI / 2
  handle.position.set(-BODY_HALF_WIDTH - 0.07, FLOOR_Y + 0.82, 0.35)
  carriage.add(handle)

  // Step down to the platform.
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.9), shared.steel)
  step.position.set(-BODY_HALF_WIDTH - 0.14, FLOOR_Y - 0.22, 0)
  step.castShadow = true
  carriage.add(step)
}

function createCarriage(index, config, shared) {
  const carriage = new THREE.Group()
  carriage.name = `carriage-${index}`
  carriage.userData.type = config.type

  const lowerMaterial = new THREE.MeshStandardMaterial({ color: config.lower, roughness: 0.44, metalness: 0.35 })
  const upperMaterial = new THREE.MeshStandardMaterial({ color: config.upper, roughness: 0.5, metalness: 0.2 })

  const chassis = new THREE.Mesh(shared.chassis, shared.darkSteel)
  chassis.position.y = FLOOR_Y - 0.15
  chassis.castShadow = true
  carriage.add(chassis)

  // Main body: lower livery band, then a lighter band up to the roof line.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_HALF_WIDTH * 2, BODY_TOP_Y - FLOOR_Y, CARRIAGE_LENGTH - 0.1),
    lowerMaterial
  )
  body.position.y = (FLOOR_Y + BODY_TOP_Y) / 2
  body.castShadow = true
  body.receiveShadow = true
  carriage.add(body)

  const upperBand = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_HALF_WIDTH * 2 + 0.02, BODY_TOP_Y - WAIST_Y - 0.06, CARRIAGE_LENGTH - 0.08),
    upperMaterial
  )
  upperBand.position.y = (WAIST_Y + BODY_TOP_Y) / 2 + 0.03
  upperBand.castShadow = true
  carriage.add(upperBand)

  // Barrel roof: a cylinder laid along Z and squashed vertically, with its
  // lower half buried inside the body so only the arc shows.
  const roofGeometry = new THREE.CylinderGeometry(1.63, 1.63, CARRIAGE_LENGTH - 0.08, 20)
  roofGeometry.rotateX(Math.PI / 2)
  roofGeometry.scale(1, 0.45 / 1.63, 1)
  const roof = new THREE.Mesh(roofGeometry, upperMaterial)
  roof.position.y = BODY_TOP_Y
  roof.castShadow = true
  carriage.add(roof)

  // Brass waistline and roof-edge trim. Each is a single box slightly wider
  // than the body, so one mesh shows a stripe down both sides.
  for (const [y, height] of [[WAIST_Y, 0.07], [BODY_TOP_Y - 0.04, 0.05]]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_HALF_WIDTH * 2 + 0.06, height, CARRIAGE_LENGTH - 0.12),
      shared.brass
    )
    trim.position.y = y
    carriage.add(trim)
  }

  // Glazing: one lit strip per side, textured with frames and warm panes so a
  // whole run of windows costs a single draw call.
  if (config.panes > 0) {
    const windowMaterial = litWindowMaterial({
      repeat: [1, 1],
      paneCount: config.panes,
      glass: config.glass,
      emissiveIntensity: config.glow
    })
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, CARRIAGE_LENGTH - 1.4), windowMaterial)
      strip.position.set(side * (BODY_HALF_WIDTH + 0.01), 2.42, 0)
      carriage.add(strip)
    }
  }

  if (config.type === 'cargo' || config.type === 'vault') {
    // Solid stock gets banded planking instead of windows.
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, CARRIAGE_LENGTH - 1.2), shared.timber)
      band.position.set(side * (BODY_HALF_WIDTH + 0.005), 2.3, 0)
      carriage.add(band)
    }
  }

  addDoor(carriage, shared, lowerMaterial)
  addWheels(carriage, shared)

  // Underframe equipment boxes.
  for (const z of [-0.6, 0.7]) {
    const tank = new THREE.Mesh(shared.tank, shared.darkSteel)
    tank.position.set(z > 0 ? 0.5 : -0.5, 0.62, z)
    tank.castShadow = true
    carriage.add(tank)
  }

  // Roof vents.
  const vents = new THREE.InstancedMesh(shared.vent, shared.brass, 3)
  const dummy = new THREE.Object3D()
  ;[-1.6, 0, 1.6].forEach((z, i) => {
    dummy.position.set(0, BODY_TOP_Y + 0.44, z)
    dummy.updateMatrix()
    vents.setMatrixAt(i, dummy.matrix)
  })
  vents.instanceMatrix.needsUpdate = true
  vents.castShadow = true
  carriage.add(vents)

  // Gangway connections at both ends.
  for (const side of [-1, 1]) {
    const gangway = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.8, COUPLING_GAP + 0.1),
      shared.rubber
    )
    gangway.position.set(0, FLOOR_Y + 0.95, side * (CARRIAGE_LENGTH / 2 + COUPLING_GAP / 2 - 0.05))
    carriage.add(gangway)
  }

  const middleIndex = (CARRIAGE_TYPES.length - 1) / 2
  carriage.position.z = (index - middleIndex) * CARRIAGE_SPACING
  return carriage
}

function createLocomotive(shared) {
  const loco = new THREE.Group()
  loco.name = 'locomotive'

  const green = new THREE.MeshStandardMaterial({ color: 0x1f4436, roughness: 0.4, metalness: 0.45 })

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.4, 8), shared.darkSteel)
  chassis.position.y = 0.8
  chassis.castShadow = true
  loco.add(chassis)

  // Boiler running most of the length, capped by a darker smokebox.
  const boilerGeometry = new THREE.CylinderGeometry(1.05, 1.05, 5.4, 22)
  boilerGeometry.rotateX(Math.PI / 2)
  const boiler = new THREE.Mesh(boilerGeometry, green)
  boiler.position.set(0, 2.05, -1)
  boiler.castShadow = true
  loco.add(boiler)

  for (const z of [-2.4, -0.4, 1.2]) {
    const bandGeometry = new THREE.CylinderGeometry(1.07, 1.07, 0.1, 22)
    bandGeometry.rotateX(Math.PI / 2)
    const band = new THREE.Mesh(bandGeometry, shared.brass)
    band.position.set(0, 2.05, z)
    loco.add(band)
  }

  const smokeboxGeometry = new THREE.CylinderGeometry(1.09, 1.09, 0.7, 22)
  smokeboxGeometry.rotateX(Math.PI / 2)
  const smokebox = new THREE.Mesh(smokeboxGeometry, shared.darkSteel)
  smokebox.position.set(0, 2.05, -4)
  smokebox.castShadow = true
  loco.add(smokebox)

  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.9, 14), shared.darkSteel)
  chimney.position.set(0, 3.4, -3.7)
  chimney.castShadow = true
  loco.add(chimney)

  const chimneyCap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 14), shared.brass)
  chimneyCap.position.set(0, 3.85, -3.7)
  loco.add(chimneyCap)

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shared.brass)
  dome.position.set(0, 3.0, -1.2)
  dome.castShadow = true
  loco.add(dome)

  // Cab at the rear, with glazed openings on both sides.
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.85, 2.3, 2.6), green)
  cab.position.set(0, 2.35, 2.4)
  cab.castShadow = true
  loco.add(cab)

  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.14, 2.9), shared.darkSteel)
  cabRoof.position.set(0, 3.55, 2.4)
  cabRoof.castShadow = true
  loco.add(cabRoof)

  const cabGlass = new THREE.MeshStandardMaterial({
    color: 0xffce8a,
    emissive: 0xffb765,
    emissiveIntensity: 1.5,
    roughness: 0.25
  })
  for (const side of [-1, 1]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 1.2), cabGlass)
    glass.position.set(side * 1.44, 2.85, 2.4)
    loco.add(glass)
  }

  // Plough / cowcatcher: a four-sided cone laid on its side and flattened.
  const ploughGeometry = new THREE.ConeGeometry(1.45, 1.5, 4)
  ploughGeometry.rotateX(-Math.PI / 2)
  ploughGeometry.scale(1, 0.75, 1)
  const plough = new THREE.Mesh(ploughGeometry, shared.darkSteel)
  plough.rotation.z = Math.PI / 4
  plough.position.set(0, 0.75, -4.6)
  plough.castShadow = true
  loco.add(plough)

  const bufferBeam = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.5, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x8a2420, roughness: 0.6, metalness: 0.3 })
  )
  bufferBeam.position.set(0, 1.05, -4.3)
  loco.add(bufferBeam)

  // Headlamp, plus an unshadowed point light so it actually throws some glow
  // down the track without paying for another shadow map.
  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 12), shared.brass)
  lampHousing.rotation.x = Math.PI / 2
  lampHousing.position.set(0, 3.05, -4.1)
  loco.add(lampHousing)

  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffeec0, emissiveIntensity: 4 })
  )
  lens.position.set(0, 3.05, -4.28)
  loco.add(lens)

  const beam = new THREE.PointLight(0xffe6b0, 18, 22, 2)
  beam.position.set(0, 3.05, -4.6)
  loco.add(beam)

  // Driving wheels (large, coupled) and a leading truck.
  const driverGeometry = new THREE.CylinderGeometry(0.78, 0.78, 0.18, 20)
  driverGeometry.rotateZ(Math.PI / 2)
  const drivers = new THREE.InstancedMesh(driverGeometry, shared.darkSteel, 6)
  const dummy = new THREE.Object3D()
  let index = 0
  for (const z of [-0.6, 0.9, 2.4]) {
    for (const side of [-1.3, 1.3]) {
      dummy.position.set(side, 0.78, z)
      dummy.updateMatrix()
      drivers.setMatrixAt(index++, dummy.matrix)
    }
  }
  drivers.instanceMatrix.needsUpdate = true
  drivers.castShadow = true
  loco.add(drivers)

  const leading = new THREE.InstancedMesh(shared.wheel, shared.darkSteel, 4)
  index = 0
  for (const z of [-3.4, -2.4]) {
    for (const side of [-1.3, 1.3]) {
      dummy.position.set(side, WHEEL_RADIUS, z)
      dummy.updateMatrix()
      leading.setMatrixAt(index++, dummy.matrix)
    }
  }
  leading.instanceMatrix.needsUpdate = true
  leading.castShadow = true
  loco.add(leading)

  // Running boards along both sides.
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 7), shared.steel)
    board.position.set(side * 1.45, 1.25, -0.4)
    board.castShadow = true
    loco.add(board)
  }

  return loco
}

export function createTrain() {
  const train = new THREE.Group()
  train.name = 'train'
  const shared = createSharedResources()

  CARRIAGE_TYPES.forEach((config, index) => {
    train.add(createCarriage(index, config, shared))
  })

  const locomotive = createLocomotive(shared)
  // Rear -> front progression is Passenger -> Security -> Cargo -> Mechanical
  // -> Vault -> Locomotive. The carriage indices already increase along +Z,
  // so put the locomotive beyond the final (Vault) carriage and rotate it so
  // its nose/headlamp also faces +Z. This also makes Level 1's +Z departure
  // movement visually read as the train driving forward rather than reversing.
  const lastCarriageFront = ((CARRIAGE_TYPES.length - 1) / 2) * CARRIAGE_SPACING + CARRIAGE_LENGTH / 2
  locomotive.position.z = lastCarriageFront + COUPLING_GAP + 3.7
  locomotive.rotation.y = Math.PI
  train.add(locomotive)

  // Stationary alongside the platform for this milestone — the train doesn't
  // move until Level 2 behaviour exists. Dropped to TRACK_LEVEL so the
  // carriage floor lines up with the platform surface.
  train.position.set(TRACK_X, TRACK_LEVEL, 0)

  return { train }
}

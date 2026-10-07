import * as THREE from 'three'
import { signMaterial } from '../textures.js'
import { addCars } from './car.js'
import { addInstances, addMesh, box, mergeParts, place } from './geom.js'
import { PLAZA } from './layout.js'
import { addWallGlows } from './light-pools.js'
import { addWindowBays } from './window-bay.js'

// Dark two- and three-storey terraces closing the square on three sides,
// shops along the quay, and a street running west from the quay behind the
// spawn into black. Built from the station's own pieces: the same brick and
// stone trim, the window bay at a smaller scale, the sign material and the
// cars. Most windows are dark; a few are dimly lit.
//
// Everything west of the quay sits over the platform and the track. Those
// are hidden while the player is on the forecourt and this group is hidden
// everywhere else, so the two never show together.

export const STREET = { minZ: 10.1, maxZ: 17.1, endX: -30 }

const GROUND = 3.9
const STOREY = 3.3
const BAY_SCALE = 0.74
const UP = new THREE.Vector3(0, 1, 0)
const EAST_X = 36
const QUAY_X = 8.4
const LIT_WINDOWS = new Set([5, 23])

function heightOf(storeys) {
  return GROUND + STOREY * (storeys - 1) + 0.5
}

// A wall plane. Local x runs along the wall (UP × out), y is up, z points
// out of the wall. Every local box stays axis-aligned in world space.
function face(out, x, z) {
  const outward = new THREE.Vector3(out[0], 0, out[1])
  const along = new THREE.Vector3().crossVectors(UP, outward)
  const matrix = new THREE.Matrix4().makeBasis(along, UP, outward).setPosition(x, 0, z)
  return { matrix, yaw: Math.atan2(outward.z, -outward.x) }
}

function onFace(target, geometry, frame) {
  geometry.applyMatrix4(frame.matrix)
  target.push(geometry)
}

function createSinks() {
  return {
    brick: [],
    trim: [],
    stone: [],
    wood: [],
    awning: [],
    glass: [[], [], [], []],
    openings: [],
    signs: []
  }
}

let windowCursor = 0
function nextShade() {
  const index = windowCursor
  windowCursor += 1
  if (LIT_WINDOWS.has(index)) return 1
  return (index * 7) % 9 === 0 ? 2 : 3
}

function addWindows(sinks, frame, u0, width, storeys) {
  const count = Math.max(1, Math.floor(width / 2.1))
  const step = width / count
  const point = new THREE.Vector3()
  for (let storey = 1; storey < storeys; storey += 1) {
    const y = GROUND + STOREY * (storey - 1) + 1.72
    for (let i = 0; i < count; i += 1) {
      point.set(u0 + step * (i + 0.5), y, 0.07).applyMatrix4(frame.matrix)
      sinks.openings.push({
        x: point.x,
        y: point.y,
        z: point.z,
        yaw: frame.yaw,
        scale: BAY_SCALE,
        shade: nextShade()
      })
    }
  }
}

function addShopfront(sinks, frame, u0, width, unit, tiles) {
  const uc = u0 + width / 2
  const inner = width - 0.7
  onFace(sinks.wood, box(inner, 0.58, 0.16, uc, 3.42, 0.08), frame)
  onFace(sinks.wood, box(inner, 0.62, 0.1, uc, 0.31, 0.05), frame)
  const doorW = 1.05
  const doorU = u0 + 0.35 + doorW / 2
  onFace(sinks.wood, box(doorW, 2.55, 0.08, doorU, 1.28, 0.02), frame)
  const glassU0 = u0 + 0.35 + doorW + 0.12
  const glassW = u0 + width - 0.35 - glassU0
  if (glassW > 0.6) {
    const panes = Math.max(1, Math.round(glassW / 1.25))
    const paneW = glassW / panes
    const shade = unit.shopShade ?? 3
    for (let i = 0; i < panes; i += 1) {
      const u = glassU0 + paneW * (i + 0.5)
      onFace(sinks.glass[shade], box(paneW - 0.08, 2.35, 0.04, u, 1.8, 0.04), frame)
      onFace(sinks.wood, box(0.07, 2.4, 0.08, glassU0 + paneW * i, 1.8, 0.05), frame)
    }
    onFace(sinks.wood, box(glassW, 0.07, 0.08, glassU0 + glassW / 2, 2.62, 0.05), frame)
  }
  for (const u of [u0 + 0.18, u0 + width - 0.18]) {
    onFace(sinks.stone, box(0.36, GROUND, 0.16, u, GROUND / 2, 0.08, tiles.stone), frame)
  }
  if (unit.awning) {
    const awning = new THREE.BoxGeometry(inner - 0.3, 0.05, 1.35)
    awning.rotateX(0.38)
    awning.translate(uc, 3.0, 0.64)
    onFace(sinks.awning, awning, frame)
    onFace(sinks.awning, box(inner - 0.3, 0.24, 0.03, uc, 2.66, 1.26), frame)
  }
  if (unit.sign) {
    const plane = new THREE.PlaneGeometry(Math.min(inner - 0.4, 3.6), 0.48)
    plane.translate(uc, 3.42, 0.17)
    plane.applyMatrix4(frame.matrix)
    sinks.signs.push({ geometry: plane, text: unit.sign })
  }
}

// units: { width, storeys, shop, awning, sign, shopShade, plain, mass }
function addFrontage(sinks, frame, units, depth, tiles) {
  let u0 = 0
  for (const unit of units) {
    const width = unit.width
    const height = heightOf(unit.storeys)
    const uc = u0 + width / 2
    if (unit.mass !== false) {
      onFace(sinks.brick, box(width, height, depth, uc, height / 2, -depth / 2, tiles.brick), frame)
      if ((Math.round(u0 * 10) % 3) === 0) {
        onFace(sinks.brick, box(0.6, 1.6, 0.6, uc + width * 0.2, height + 0.5, -depth * 0.55, tiles.brick), frame)
      }
    }
    if (!unit.plain) {
      onFace(sinks.trim, box(width + 0.04, 0.2, 0.14, uc, GROUND, 0.07, tiles.stone), frame)
      onFace(sinks.trim, box(width + 0.12, 0.22, 0.34, uc, height - 0.62, 0.15, tiles.stone), frame)
      onFace(sinks.trim, box(width + 0.04, 0.12, 0.4, uc, height + 0.06, -0.12, tiles.stone), frame)
      addWindows(sinks, frame, u0, width, unit.storeys)
      if (unit.shop) addShopfront(sinks, frame, u0, width, unit, tiles)
    }
    u0 += width
  }
}

function addStreet(parent, sinks, materials, stats, tiles) {
  const x0 = STREET.endX
  const x1 = PLAZA.minX
  const width = x1 - x0
  const length = STREET.maxZ - STREET.minZ
  const road = new THREE.PlaneGeometry(width, length)
  road.rotateX(-Math.PI / 2)
  road.translate((x0 + x1) / 2, 0.045, (STREET.minZ + STREET.maxZ) / 2)
  // Same metre-per-repeat mapping as the plaza, so the stones line up and
  // the shared cobble material needs no second texture.
  const position = road.attributes.position
  const uv = road.attributes.uv
  const plazaW = PLAZA.maxX - PLAZA.minX
  const plazaL = PLAZA.maxZ - PLAZA.minZ
  for (let i = 0; i < position.count; i += 1) {
    uv.setXY(i, (position.getX(i) - PLAZA.minX) / plazaW, (PLAZA.maxZ - position.getZ(i)) / plazaL)
  }
  addMesh(parent, road, materials.cobble, { receiveShadow: true, name: 'landing-street' }, stats)

  for (const z of [STREET.minZ + 0.75, STREET.maxZ - 0.75]) {
    sinks.stone.push(box(width - 0.2, 0.15, 1.5, (x0 + x1) / 2 - 0.1, 0.075, z, tiles.stone))
  }
  const bollards = []
  for (let z = STREET.minZ + 0.6; z <= STREET.maxZ - 0.5; z += 1.15) {
    bollards.push(place(PLAZA.minX + 0.25, PLAZA.y, z))
  }
  const bollard = new THREE.CylinderGeometry(0.09, 0.12, 0.9, 8)
  bollard.translate(0, 0.45, 0)
  addInstances(parent, bollard, materials.iron, bollards, { name: 'landing-bollards' }, stats)

  // Layers of black across the street. With the fog they take the far end
  // to nothing, and the moon cannot light it back up.
  const veil = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    fog: false
  })
  const veils = []
  for (const x of [-4, -10, -16, -22, -27]) {
    const plane = new THREE.PlaneGeometry(length, 13)
    plane.rotateY(Math.PI / 2)
    plane.translate(x, 6.5, (STREET.minZ + STREET.maxZ) / 2)
    veils.push(plane)
  }
  addMesh(parent, mergeParts(veils), veil, { name: 'landing-street-veil' }, stats)
}

const SQUARE_CARS = [
  { x: 20.7, y: 0.05, z: -2.35, yaw: Math.PI / 2 },
  { x: 20.3, y: 0.05, z: 39.8, yaw: -Math.PI / 2 }
]

const STREET_CARS = [
  { x: 3.2, y: 0.05, z: 12.35, yaw: Math.PI / 2 },
  { x: -5.6, y: 0.05, z: 14.85, yaw: -Math.PI / 2 },
  { x: -13.2, y: 0.05, z: 12.35, yaw: Math.PI / 2 },
  { x: -20.4, y: 0.05, z: 14.85, yaw: -Math.PI / 2 }
]

function townColliders() {
  const south = PLAZA.minZ
  const north = PLAZA.maxZ
  const boxes = [
    { minX: QUAY_X, maxX: EAST_X, minZ: south - 9.4, maxZ: south },
    { minX: PLAZA.maxX - 0.05, maxX: EAST_X, minZ: south, maxZ: -1.42 },
    { minX: QUAY_X, maxX: EAST_X, minZ: north, maxZ: north + 9.4 },
    { minX: PLAZA.maxX - 0.05, maxX: EAST_X, minZ: 38.62, maxZ: north }
  ]
  for (const car of SQUARE_CARS) {
    boxes.push({ minX: car.x - 2.25, maxX: car.x + 2.25, minZ: car.z - 0.95, maxZ: car.z + 0.95 })
  }
  return boxes
}

export function buildTown(parent, materials, stats) {
  windowCursor = 0
  const group = new THREE.Group()
  group.name = 'landing-town'
  parent.add(group)

  const tiles = { brick: materials.brickTile, stone: materials.stoneTile }
  const sinks = createSinks()
  const brick = materials.brick.clone()
  brick.color.multiplyScalar(0.55)
  const awning = new THREE.MeshStandardMaterial({ color: 0x3a1714, roughness: 0.88 })

  const south = PLAZA.minZ
  const north = PLAZA.maxZ
  const corner = PLAZA.maxX + 0.1

  // South side of the square, facing north onto the cobbles.
  addFrontage(sinks, face([0, 1], 2, south), [
    { width: QUAY_X - 2, storeys: 3, plain: true },
    { width: 5, storeys: 3, shop: true },
    { width: 5.2, storeys: 2, shop: true, awning: true },
    { width: corner - 18.6, storeys: 3, shop: true, awning: true, sign: 'CAFE DE LA GARE', shopShade: 2 },
    { width: EAST_X - corner, storeys: 2, plain: true }
  ], 9.4, tiles)
  addFrontage(sinks, face([0, 1], corner, -1.42), [
    { width: EAST_X - corner, storeys: 2, plain: true }
  ], 2.2, tiles)

  // North side, facing south. Its run starts at the station corner.
  addFrontage(sinks, face([0, -1], corner, north), [
    { width: corner - 18.4, storeys: 3, shop: true, sign: 'HOTEL TERMINUS' },
    { width: 5.6, storeys: 2, shop: true, awning: true },
    { width: 12.8 - QUAY_X, storeys: 3, shop: true },
    { width: QUAY_X - 2, storeys: 3, plain: true }
  ], 9.4, tiles)
  addFrontage(sinks, face([0, -1], EAST_X, north), [
    { width: EAST_X - corner, storeys: 2, plain: true }
  ], 9.4, tiles)
  addFrontage(sinks, face([0, -1], EAST_X, 38.62), [
    { width: EAST_X - corner, storeys: 2, plain: true }
  ], north - 38.62, tiles)

  // The street. South terrace faces north across it, the north terrace
  // faces south, and a block closes the far end.
  const streetX = STREET.endX
  addFrontage(sinks, face([0, 1], streetX, STREET.minZ), [
    { width: 7, storeys: 2 },
    { width: 6.5, storeys: 3 },
    { width: 6.5, storeys: 2, shop: true },
    { width: 6.5, storeys: 3, shop: true, awning: true },
    { width: 6.1, storeys: 2, shop: true },
    { width: QUAY_X - 2.6, storeys: 3, shop: true, sign: 'TABAC' }
  ], STREET.minZ - 1, tiles)
  addFrontage(sinks, face([0, -1], QUAY_X, STREET.maxZ), [
    { width: 5.6, storeys: 3, shop: true },
    { width: 6.2, storeys: 2, shop: true, awning: true },
    { width: 6.6, storeys: 3 },
    { width: 6.5, storeys: 2 },
    { width: 6.5, storeys: 3 },
    { width: 7, storeys: 2 }
  ], 6.4, tiles)
  addFrontage(sinks, face([1, 0], streetX, 23.5), [
    { width: 22.5, storeys: 3 }
  ], 8, tiles)

  // Shops along the quay, facing the square, either side of the street.
  // The two corner units front the street buildings' own masses; the rest
  // are new 6.4 m deep terraces. The two-storey roofs let the steam behind
  // them show from the square. Shop windows are dark but for the café and
  // a faint pharmacy.
  addFrontage(sinks, face([1, 0], QUAY_X, STREET.minZ), [
    { width: 4.6, storeys: 3, mass: false, shop: true, sign: 'PHARMACY', shopShade: 2 },
    { width: STREET.minZ - 1 - 4.6, storeys: 3, mass: false, shop: true, awning: true, sign: 'BARBER' },
    { width: 1 - south, storeys: 2, shop: true, sign: 'IRONMONGER' }
  ], QUAY_X - 2, tiles)
  addFrontage(sinks, face([1, 0], QUAY_X, north), [
    { width: 5.6, storeys: 2, shop: true, awning: true, sign: 'CAFÉ', shopShade: 1 },
    { width: 6.1, storeys: 3, shop: true, sign: 'POST OFFICE' },
    { width: north - STREET.maxZ - 5.6 - 6.1 - 6.4, storeys: 2, shop: true, awning: true, sign: 'BAKERY' },
    { width: 6.4, storeys: 3, mass: false, shop: true, sign: 'TAILOR' }
  ], QUAY_X - 2, tiles)

  addStreet(group, sinks, materials, stats, tiles)

  const walls = addMesh(group, mergeParts(sinks.brick), brick, {
    castShadow: true, receiveShadow: true, name: 'landing-town-brick'
  }, stats)
  addMesh(group, mergeParts(sinks.trim), materials.stoneTrim, { receiveShadow: true, name: 'landing-town-trim' }, stats)
  addMesh(group, mergeParts(sinks.stone), materials.stone, { receiveShadow: true, name: 'landing-town-stone' }, stats)
  addMesh(group, mergeParts(sinks.wood), materials.wood, { name: 'landing-town-shopfronts' }, stats)
  addMesh(group, mergeParts(sinks.awning), awning, { name: 'landing-town-awnings' }, stats)
  sinks.glass.forEach((parts, shade) => {
    if (parts.length) {
      addMesh(group, mergeParts(parts), materials.glass[shade], { name: `landing-town-shop-glass-${shade}` }, stats)
    }
  })
  addWindowBays(group, sinks.openings, materials, stats)
  for (const sign of sinks.signs) {
    const material = signMaterial({
      text: sign.text,
      background: 0x0e100c,
      foreground: 0xd8b866,
      width: 1024,
      height: 160,
      emissiveIntensity: 0.42
    })
    addMesh(group, sign.geometry, material, { name: 'landing-town-sign' }, stats)
  }

  addCars(group, [...SQUARE_CARS, ...STREET_CARS], materials, stats)

  // The entrance lamps throw a faint wash on the shop fronts above them.
  addWallGlows(group, [
    { x: QUAY_X + 0.03, y: 4.7, z: 8.85, width: 2.3, height: 3.4, strength: 0.32 },
    { x: QUAY_X + 0.03, y: 4.7, z: 18.9, width: 2.7, height: 3.4, strength: 0.32 }
  ], stats)

  group.traverse((node) => {
    node.userData.noCameraCollision = true
  })
  // The walls stop the follow camera on the square. Raycasts do not check
  // visibility, and off the forecourt this group stands over the platform,
  // so the walls only answer while the town is shown.
  walls.userData.noCameraCollision = false
  const wallRaycast = walls.raycast.bind(walls)
  walls.raycast = (raycaster, intersects) => {
    if (group.visible) wallRaycast(raycaster, intersects)
  }

  return { group, colliders: townColliders() }
}

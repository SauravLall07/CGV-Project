import * as THREE from 'three'
import {
  marbleFloorMaterial,
  metalMaterial,
  plasterMaterial,
  woodMaterial
} from '../textures.js'
import { bindingLabel, settings } from '../../core/settings.js'
import { GUARD_PASSAGE_EXIT } from './passage-guards.js'
import { createTutorialHintSystem } from '../../systems/tutorial-hints.js'
import { createDistractionSystem } from '../../systems/distraction.js'
import { createStaircase } from '../../core/stairs.js'
import { APPROACH_START_X, APPROACH_CENTER_Z } from '../station-blockout.js'
import {
  createAxisAlignedCorridor,
  createAxisAlignedRoom,
  createLaserFloor,
  createPuzzleDoor,
  createTimedLaserController
} from './passage-components.js'

export const BRIDGE_PASSAGE_FLOOR_Y = -4
// Passageway 3 begins at Passageway 2's exact exported endpoint. The vent is
// retained, but every room after it is now built as a true enclosed shell.
export const BRIDGE_PASSAGE_VENT_ENTRY = GUARD_PASSAGE_EXIT.clone()

export const BRIDGE_PASSAGE_BOUNDS = {
  minX: -80.5,
  maxX: -51.7,
  minZ: -51.6,
  maxZ: -21.8
}

const ROOM_HEIGHT = 5
const JUNCTION_SIZE = 4.8
const VENT_WIDTH = 1.65
const VENT_HEIGHT = 1.34
const VENT_EXIT_X = -74.5

// Explicit room-and-hall layout. Straight corridors terminate at room edges,
// so no corridor side wall can cross a 90-degree turn.
const ENTRY_ROOM_X = VENT_EXIT_X + JUNCTION_SIZE / 2 // west edge = vent exit
const ENTRY_ROOM_Z = BRIDGE_PASSAGE_VENT_ENTRY.z
const SOUTH_ROOM_X = ENTRY_ROOM_X
const SOUTH_ROOM_Z = -49
const LASER_ROOM_X = -59
const LASER_ROOM_Z = SOUTH_ROOM_Z
const PUZZLE_X = LASER_ROOM_X
const PUZZLE_ROOM_Z = -39.7
// The puzzle chamber is deliberately much wider/taller than the 4.8 m junction
// rooms. Third-person cameras need breathing room; the previous compact box put
// the follow camera inside its side walls whenever the player turned sharply.
const PUZZLE_ROOM_SIZE_X = 10.5
const PUZZLE_ROOM_SIZE_Z = 8.0
const PUZZLE_ROOM_HEIGHT = 6.2
const PUZZLE_DOOR_Z = PUZZLE_ROOM_Z + PUZZLE_ROOM_SIZE_Z / 2

// Fully enclosed two-stair return to the fixed western entrance of Passageway 4.
const LOWER_STAIR_X = PUZZLE_X
const LOWER_VESTIBULE_DEPTH = 3.4
const LOWER_STAIR_START_Z = PUZZLE_DOOR_Z + LOWER_VESTIBULE_DEPTH
const MID_LANDING_X = LOWER_STAIR_X
const MID_LANDING_Z = APPROACH_CENTER_Z
const MID_LANDING_SIZE = 4.8
const LOWER_STAIR_END_Z = MID_LANDING_Z - MID_LANDING_SIZE / 2
const UPPER_STAIR_START_X = MID_LANDING_X + MID_LANDING_SIZE / 2
const UPPER_STAIR_END_X = APPROACH_START_X
const UPPER_STAIR_Z = APPROACH_CENTER_Z
const STAIR_WIDTH = 3.3

function addBox(group, colliders, {
  size,
  position,
  material,
  collider = true,
  name = ''
}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  mesh.position.copy(position)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  if (collider) {
    colliders.push({
      minX: position.x - size.x / 2,
      maxX: position.x + size.x / 2,
      minZ: position.z - size.z / 2,
      maxZ: position.z + size.z / 2
    })
  }

  return mesh
}

function addStairSideColliders(colliders, stair, thickness = 0.16) {
  const dx = stair.end.x - stair.start.x
  const dz = stair.end.z - stair.start.z
  const length = Math.hypot(dx, dz)
  const ux = dx / length
  const uz = dz / length
  const px = uz
  const pz = -ux

  for (const side of [-1, 1]) {
    const ax = stair.start.x + px * side * (stair.width / 2 + 0.09)
    const az = stair.start.z + pz * side * (stair.width / 2 + 0.09)
    const bx = stair.end.x + px * side * (stair.width / 2 + 0.09)
    const bz = stair.end.z + pz * side * (stair.width / 2 + 0.09)
    colliders.push({
      minX: Math.min(ax, bx) - thickness,
      maxX: Math.max(ax, bx) + thickness,
      minZ: Math.min(az, bz) - thickness,
      maxZ: Math.max(az, bz) + thickness
    })
  }
}

function addCylinderBetween(group, start, end, radius, material, name = '') {
  const direction = end.clone().sub(start)
  const length = direction.length()
  if (length < 0.001) return null

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 10),
    material
  )
  mesh.name = name
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  )
  mesh.castShadow = true
  group.add(mesh)
  return mesh
}

function addStairRailings(group, stair, material, {
  railHeight = 0.95,
  inset = 0.16,
  postSpacing = 1.15
} = {}) {
  const dx = stair.end.x - stair.start.x
  const dz = stair.end.z - stair.start.z
  const horizontalLength = Math.hypot(dx, dz)
  if (horizontalLength < 0.001) return

  const ux = dx / horizontalLength
  const uz = dz / horizontalLength
  const px = uz
  const pz = -ux
  const sideOffset = Math.max(0.2, stair.width / 2 - inset)
  const postCount = Math.max(2, Math.ceil(stair.runLength / postSpacing))

  for (const side of [-1, 1]) {
    const offsetX = px * side * sideOffset
    const offsetZ = pz * side * sideOffset

    const railStart = stair.start.clone().add(new THREE.Vector3(offsetX, railHeight, offsetZ))
    const railEnd = stair.end.clone().add(new THREE.Vector3(offsetX, railHeight, offsetZ))
    addCylinderBetween(group, railStart, railEnd, 0.035, material, `bridge-stair-rail-${side}`)

    for (let i = 0; i <= postCount; i++) {
      const t = i / postCount
      const base = new THREE.Vector3(
        THREE.MathUtils.lerp(stair.start.x, stair.end.x, t) + offsetX,
        THREE.MathUtils.lerp(stair.start.y, stair.end.y, t) + 0.04,
        THREE.MathUtils.lerp(stair.start.z, stair.end.z, t) + offsetZ
      )
      const top = base.clone()
      top.y += railHeight - 0.04
      addCylinderBetween(group, base, top, 0.025, material, `bridge-stair-post-${side}-${i}`)
    }
  }
}

function createCrouchVent({ group, colliders, floorMat, wallMat, ironMat, player, hud }) {
  const startX = BRIDGE_PASSAGE_VENT_ENTRY.x
  const endX = VENT_EXIT_X
  const z = BRIDGE_PASSAGE_VENT_ENTRY.z
  const width = 1.65
  const height = 1.34
  const length = endX - startX
  const centerX = (startX + endX) / 2

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, width), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(centerX, BRIDGE_PASSAGE_FLOOR_Y + 0.015, z)
  floor.receiveShadow = true
  group.add(floor)

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, width + 0.18), ironMat)
  ceiling.position.set(centerX, BRIDGE_PASSAGE_FLOOR_Y + height, z)
  ceiling.receiveShadow = true
  group.add(ceiling)

  // Camera shroud above the low crawl ceiling. Gameplay still happens below
  // `height`, while the chase camera sees an enclosed maintenance chase instead
  // of sky/terrain if it rides above the player.
  const shroudCeiling = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, width + 0.32), wallMat)
  shroudCeiling.position.set(centerX, BRIDGE_PASSAGE_FLOOR_Y + ROOM_HEIGHT, z)
  shroudCeiling.receiveShadow = true
  group.add(shroudCeiling)

  for (const side of [-1, 1]) {
    const wallZ = z + side * width / 2
    addBox(group, colliders, {
      // Full-height outer service wall. The crawl opening is still limited by
      // the low ceiling, but the third-person camera can no longer look over
      // the duct wall and reveal the outdoor environment.
      size: new THREE.Vector3(length, ROOM_HEIGHT, 0.14),
      position: new THREE.Vector3(centerX, BRIDGE_PASSAGE_FLOOR_Y + ROOM_HEIGHT / 2, wallZ),
      material: wallMat
    })
  }

  // Passageway 2 opens into a wide bay. Close the shoulders around a small vent
  // mouth so the transition reads deliberately rather than as a missing wall.
  const bayWidth = 5.4
  const shoulderDepth = (bayWidth - width) / 2
  for (const side of [-1, 1]) {
    const shoulderZ = z + side * (width / 2 + shoulderDepth / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(0.28, ROOM_HEIGHT, shoulderDepth),
      position: new THREE.Vector3(startX, BRIDGE_PASSAGE_FLOOR_Y + ROOM_HEIGHT / 2, shoulderZ),
      material: ironMat
    })
  }
  addBox(group, colliders, {
    size: new THREE.Vector3(0.28, ROOM_HEIGHT - height, width),
    position: new THREE.Vector3(startX, BRIDGE_PASSAGE_FLOOR_Y + height + (ROOM_HEIGHT - height) / 2, z),
    material: ironMat,
    collider: false
  })

  const gatePositions = [startX + 0.18, centerX, endX - 0.18]
  const clearanceGates = []
  for (let i = 0; i < gatePositions.length; i++) {
    const x = gatePositions[i]
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, width), ironMat)
    rib.position.set(x, BRIDGE_PASSAGE_FLOOR_Y + height - 0.06, z)
    group.add(rib)

    const gate = {
      minX: x - 0.12,
      maxX: x + 0.12,
      minZ: z - width / 2 + 0.06,
      maxZ: z + width / 2 - 0.06,
      enabled: true,
      ventClearance: true
    }
    colliders.push(gate)
    clearanceGates.push(gate)
  }

  let warnedStanding = false
  function update() {
    const crouched = Boolean(player?.isCrouching?.())
    clearanceGates.forEach((gate) => { gate.enabled = !crouched })

    const p = player?.mesh?.position
    if (!p || crouched || warnedStanding) return
    const insideMouth = p.x > startX - 0.4 && p.x < endX + 0.2 && Math.abs(p.z - z) < width / 2 + 0.2
    if (insideMouth) {
      warnedStanding = true
      hud?.showToast?.(`Too low to stand — hold ${bindingLabel(settings.getBinding('duck'))} and crouch through the vent.`, 2500)
    }
  }

  return {
    update,
    contains(x, zPos) {
      return x >= startX - 0.1 && x <= endX + 0.1 && Math.abs(zPos - z) <= width / 2 + 0.1
    },
    hasCleared(position) {
      return Boolean(position && position.x > endX + 0.55 && position.z < z + 2.2 && position.z > z - 3.3)
    }
  }
}

function makeRoomWallsCameraFriendly(roomShell) {
  // The lightweight third-person camera can move through static level walls.
  // A BoxGeometry then shows its *outer* plaster face and fills the viewport.
  // Keep the room's existing colliders, but render its wall segments as inward-
  // facing one-sided planes. The player still cannot leave the room; if the
  // camera briefly crosses a wall, that wall simply stops occluding the view.
  const replacements = []

  for (const wall of [...roomShell.group.children]) {
    if (!wall?.isMesh || !wall.name?.startsWith('room-wall-')) continue

    const side = wall.name.slice('room-wall-'.length)
    const params = wall.geometry?.parameters ?? {}
    const height = params.height ?? PUZZLE_ROOM_HEIGHT
    const length = (side === 'minX' || side === 'maxX')
      ? (params.depth ?? PUZZLE_ROOM_SIZE_Z)
      : (params.width ?? PUZZLE_ROOM_SIZE_X)

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(length, height),
      wall.material
    )
    plane.name = `${wall.name}-camera-friendly`
    plane.position.copy(wall.position)

    if (side === 'minX') plane.rotation.y = Math.PI / 2
    else if (side === 'maxX') plane.rotation.y = -Math.PI / 2
    else if (side === 'maxZ') plane.rotation.y = Math.PI

    plane.castShadow = true
    plane.receiveShadow = true
    replacements.push({ wall, plane })
  }

  for (const { wall, plane } of replacements) {
    roomShell.group.remove(wall)
    roomShell.group.add(plane)
    wall.geometry?.dispose?.()
  }
}


function addPuzzleRoomDressing({ group, floorY, ironMat }) {
  // Give the relay chamber a deliberate maintenance-control-room identity.
  // Keep all wall dressing one-sided or well inside the room so the existing
  // camera-friendly wall treatment still prevents large grey occluders.
  const insetFloorMat = new THREE.MeshStandardMaterial({
    color: 0x151d24,
    roughness: 0.66,
    metalness: 0.42
  })
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x202d36,
    roughness: 0.58,
    metalness: 0.52,
    side: THREE.FrontSide
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x8f7139,
    emissive: 0x211706,
    emissiveIntensity: 0.28,
    roughness: 0.34,
    metalness: 0.82
  })
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x43b8c8,
    emissive: 0x0b5966,
    emissiveIntensity: 0.8,
    roughness: 0.28,
    metalness: 0.45
  })
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b8,
    emissive: 0xffb45d,
    emissiveIntensity: 1.35,
    roughness: 0.32,
    metalness: 0.12
  })

  // Dark inset work zone under the relay console. The narrow cyan/bronze edge
  // makes the puzzle read as the focal point without turning the whole table
  // or floor into an emissive slab.
  const inset = new THREE.Mesh(
    new THREE.BoxGeometry(6.15, 0.055, 5.15),
    insetFloorMat
  )
  inset.position.set(PUZZLE_X, floorY + 0.026, PUZZLE_ROOM_Z + 0.05)
  inset.receiveShadow = true
  group.add(inset)

  const edgeY = floorY + 0.065
  const edgeZ = PUZZLE_ROOM_Z + 0.05
  for (const x of [-3.02, 3.02]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 5.0), cyanMat)
    edge.position.set(PUZZLE_X + x, edgeY, edgeZ)
    group.add(edge)
  }
  for (const z of [-2.5, 2.5]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.035, 0.045), trimMat)
    edge.position.set(PUZZLE_X, edgeY, edgeZ + z)
    group.add(edge)
  }

  function addInteriorPanel(width, height, position, rotationY = 0) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMat)
    panel.position.copy(position)
    panel.rotation.y = rotationY
    panel.receiveShadow = true
    group.add(panel)

    // Simple top/bottom rails keep the wall modules from reading as blank
    // texture patches while remaining thin enough not to become camera blocks.
    for (const y of [-height / 2 + 0.08, height / 2 - 0.08]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.055, 0.035), trimMat)
      rail.position.set(position.x, position.y + y, position.z)
      rail.rotation.y = rotationY
      group.add(rail)
    }
  }

  const wallInset = 0.035
  const sidePanelY = floorY + 1.45
  for (const offsetZ of [-2.15, 0, 2.15]) {
    addInteriorPanel(
      1.75,
      2.45,
      new THREE.Vector3(PUZZLE_X - PUZZLE_ROOM_SIZE_X / 2 + wallInset, sidePanelY, PUZZLE_ROOM_Z + offsetZ),
      Math.PI / 2
    )
    addInteriorPanel(
      1.75,
      2.45,
      new THREE.Vector3(PUZZLE_X + PUZZLE_ROOM_SIZE_X / 2 - wallInset, sidePanelY, PUZZLE_ROOM_Z + offsetZ),
      -Math.PI / 2
    )
  }

  // Frame the locked stairwell opening with two large machinery panels.
  const farZ = PUZZLE_ROOM_Z + PUZZLE_ROOM_SIZE_Z / 2 - wallInset
  addInteriorPanel(2.7, 2.45, new THREE.Vector3(PUZZLE_X - 3.55, sidePanelY, farZ), Math.PI)
  addInteriorPanel(2.7, 2.45, new THREE.Vector3(PUZZLE_X + 3.55, sidePanelY, farZ), Math.PI)

  // Overhead beams and small practical fixtures make the room feel engineered
  // rather than like a single oversized empty shell.
  for (const offsetZ of [-2.45, 0, 2.45]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(PUZZLE_ROOM_SIZE_X - 0.7, 0.18, 0.16),
      ironMat
    )
    beam.position.set(PUZZLE_X, floorY + PUZZLE_ROOM_HEIGHT - 0.30, PUZZLE_ROOM_Z + offsetZ)
    beam.castShadow = true
    group.add(beam)
  }

  for (const offsetZ of [-2.1, 0.25, 2.35]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 0.38), ironMat)
    housing.position.set(PUZZLE_X, floorY + PUZZLE_ROOM_HEIGHT - 0.52, PUZZLE_ROOM_Z + offsetZ)
    group.add(housing)

    const lens = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.035, 0.22), lensMat)
    lens.position.set(PUZZLE_X, floorY + PUZZLE_ROOM_HEIGHT - 0.59, PUZZLE_ROOM_Z + offsetZ)
    group.add(lens)

    const light = new THREE.PointLight(0xffc983, 4.8, 8.0, 2.2)
    light.position.set(PUZZLE_X, floorY + PUZZLE_ROOM_HEIGHT - 0.82, PUZZLE_ROOM_Z + offsetZ)
    group.add(light)
  }

  // Small service pipes/couplers break up the long side walls without adding
  // bulky props in the player's circulation space.
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x56646c,
    roughness: 0.38,
    metalness: 0.82
  })
  for (const side of [-1, 1]) {
    for (const offsetZ of [-2.8, 2.8]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.5, 10), pipeMat)
      pipe.position.set(
        PUZZLE_X + side * (PUZZLE_ROOM_SIZE_X / 2 - 0.13),
        floorY + 1.35,
        PUZZLE_ROOM_Z + offsetZ
      )
      group.add(pipe)
    }
  }

  // A restrained status bar above the exit gives the room a clear destination.
  const exitHeader = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 0.12), trimMat)
  exitHeader.position.set(PUZZLE_X, floorY + 3.12, farZ - 0.025)
  group.add(exitHeader)
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), cyanMat)
    lamp.position.set(PUZZLE_X + side * 1.55, floorY + 3.12, farZ - 0.10)
    group.add(lamp)
  }
}

function createCircuitRoutingPuzzle({ group, colliders, interaction, hud, door, floorY, ironMat }) {
  const unregisters = []
  let solved = false

  // Directions are N, E, S, W on the horizontal console. Each relay tile owns
  // a connector shape and a quarter-turn rotation. Power must travel from the
  // SOURCE edge through all three fuse cells and finally reach the DOOR edge.
  const DIRS = [
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }
  ]
  const BASE_CONNECTIONS = {
    straight: [1, 3],
    corner: [0, 1],
    tee: [0, 1, 3],
    cross: [0, 1, 2, 3]
  }

  // Intentionally scrambled starting state. A valid solution connects the
  // entire board, but players are free to discover any equivalent valid route.
  const tileDefs = [
    [
      { type: 'corner', rotation: 3 },
      { type: 'straight', rotation: 1 },
      { type: 'corner', rotation: 0 }
    ],
    [
      { type: 'tee', rotation: 2 },
      { type: 'cross', rotation: 0, fixed: true },
      { type: 'tee', rotation: 1 }
    ],
    [
      { type: 'corner', rotation: 2 },
      { type: 'tee', rotation: 3 },
      { type: 'corner', rotation: 1 }
    ]
  ]

  const fuseCells = new Set(['0,0', '2,0', '2,2'])
  const sourceCell = { row: 1, col: 0, edge: 3 }
  const exitCell = { row: 1, col: 2, edge: 1 }

  // A freestanding waist-high console gives every tile a unique X/Z position.
  // The interaction system intentionally ignores Y, so a wall-mounted 3x3 grid
  // would make all three tiles in a column indistinguishable to the player.
  const consoleGroup = new THREE.Group()
  consoleGroup.name = 'bridge-chrono-router'
  consoleGroup.position.set(PUZZLE_X, floorY, PUZZLE_ROOM_Z + 0.15)
  group.add(consoleGroup)

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x111820,
    roughness: 0.48,
    metalness: 0.76
  })
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b7a3f,
    emissive: 0x211706,
    emissiveIntensity: 0.28,
    roughness: 0.32,
    metalness: 0.88
  })
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0x26323b,
    roughness: 0.4,
    metalness: 0.72
  })

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(3.42, 0.66, 3.36),
    baseMaterial
  )
  pedestal.position.y = 0.33
  pedestal.castShadow = true
  pedestal.receiveShadow = true
  consoleGroup.add(pedestal)

  // The previous deck used the brass material over the entire 3.7 m square,
  // which made the console read as one bright orange slab. Keep the worktop
  // dark and reserve brass for a thin perimeter trim.
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(3.62, 0.12, 3.54),
    deckMaterial
  )
  deck.position.y = 0.72
  deck.castShadow = true
  deck.receiveShadow = true
  consoleGroup.add(deck)

  for (const x of [-1.77, 1.77]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 3.45), trimMaterial)
    edge.position.set(x, 0.80, 0)
    consoleGroup.add(edge)
  }
  for (const z of [-1.73, 1.73]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(3.54, 0.045, 0.045), trimMaterial)
    edge.position.set(0, 0.80, z)
    consoleGroup.add(edge)
  }

  // Keep the player out of the console body while leaving the board reachable
  // from all four sides. Collision remains 2D in this project.
  colliders?.push?.({
    minX: PUZZLE_X - 1.82,
    maxX: PUZZLE_X + 1.82,
    minZ: PUZZLE_ROOM_Z + 0.15 - 1.82,
    maxZ: PUZZLE_ROOM_Z + 0.15 + 1.82
  })

  // Low, angled status display. The old upright billboard obscured almost the
  // entire board from side/rear third-person camera angles.
  const displayGroup = new THREE.Group()
  displayGroup.position.set(0, 1.36, 1.47)
  displayGroup.rotation.x = -0.52
  consoleGroup.add(displayGroup)

  const screenFrame = new THREE.Mesh(
    new THREE.BoxGeometry(3.18, 0.92, 0.12),
    ironMat
  )
  screenFrame.castShadow = true
  displayGroup.add(screenFrame)

  const screenCanvas = document.createElement('canvas')
  screenCanvas.width = 1024
  screenCanvas.height = 256
  const screenContext = screenCanvas.getContext('2d')
  const screenTexture = new THREE.CanvasTexture(screenCanvas)
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: screenTexture,
    toneMapped: false,
    side: THREE.FrontSide
  })
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.96, 0.74),
    screenMaterial
  )
  screen.position.z = -0.065
  screen.rotation.y = Math.PI
  displayGroup.add(screen)

  for (const side of [-1, 1]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.11), trimMaterial)
    bracket.position.set(side * 1.34, 1.05, 1.39)
    bracket.rotation.x = -0.22
    consoleGroup.add(bracket)
  }

  const tileBaseMaterial = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.42,
    metalness: 0.62
  })
  const fixedBaseMaterial = new THREE.MeshStandardMaterial({
    color: 0x263241,
    emissive: 0x0b1f2b,
    emissiveIntensity: 0.55,
    roughness: 0.38,
    metalness: 0.7
  })

  const tiles = []
  const tileSpacing = 0.92

  function connections(tile) {
    return BASE_CONNECTIONS[tile.type].map((dir) => (dir + tile.rotation) % 4)
  }

  function hasConnection(tile, dir) {
    return connections(tile).includes(dir)
  }

  function createConnectorMesh(dir, material) {
    const eastWest = dir === 1 || dir === 3
    const segment = new THREE.Mesh(
      new THREE.BoxGeometry(
        eastWest ? 0.36 : 0.095,
        0.055,
        eastWest ? 0.095 : 0.36
      ),
      material
    )
    const offset = 0.19
    if (dir === 0) segment.position.z = -offset
    if (dir === 1) segment.position.x = offset
    if (dir === 2) segment.position.z = offset
    if (dir === 3) segment.position.x = -offset
    segment.position.y = 0.075
    return segment
  }

  for (let row = 0; row < 3; row++) {
    tiles[row] = []
    for (let col = 0; col < 3; col++) {
      const def = tileDefs[row][col]
      const tile = {
        row,
        col,
        type: def.type,
        rotation: def.rotation,
        fixed: Boolean(def.fixed),
        group: new THREE.Group(),
        lineMaterial: new THREE.MeshStandardMaterial({
          color: 0x2dd4bf,
          emissive: 0x0f766e,
          emissiveIntensity: 0.65,
          roughness: 0.22,
          metalness: 0.48
        }),
        fuseMaterial: null
      }

      tile.group.name = `bridge-router-tile-${row}-${col}`
      tile.group.position.set(
        (col - 1) * tileSpacing,
        0.84,
        (row - 1) * tileSpacing
      )

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.075, 0.78),
        tile.fixed ? fixedBaseMaterial : tileBaseMaterial
      )
      base.position.y = 0.015
      tile.group.add(base)

      for (const dir of BASE_CONNECTIONS[tile.type]) {
        tile.group.add(createConnectorMesh(dir, tile.lineMaterial))
      }

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.045, 16),
        tile.lineMaterial
      )
      hub.position.y = 0.085
      tile.group.add(hub)

      if (fuseCells.has(`${row},${col}`)) {
        tile.fuseMaterial = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0x78350f,
          emissiveIntensity: 1.2,
          roughness: 0.2,
          metalness: 0.35
        })
        const fuseRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.18, 0.035, 8, 20),
          tile.fuseMaterial
        )
        fuseRing.rotation.x = Math.PI / 2
        fuseRing.position.y = 0.115
        tile.group.add(fuseRing)
      }

      // Negative Y rotation makes our logical N -> E quarter-turn match the
      // visible clockwise turn when the board is viewed from above.
      tile.group.rotation.y = -tile.rotation * Math.PI / 2
      consoleGroup.add(tile.group)
      tiles[row][col] = tile

      if (!tile.fixed) {
        unregisters.push(interaction.register(tile.group, {
          prompt: 'Rotate relay tile',
          range: 2.85,
          onInteract: () => {
            if (solved) return
            tile.rotation = (tile.rotation + 1) % 4
            tile.group.rotation.y = -tile.rotation * Math.PI / 2
            evaluate()
          }
        }))
      }
    }
  }

  const sourceMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 2.6
  })
  const exitMaterial = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 2.2
  })

  const sourceMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.08, 0.34),
    sourceMaterial
  )
  sourceMarker.position.set(-1.54, 0.93, 0)
  consoleGroup.add(sourceMarker)

  const exitMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.08, 0.34),
    exitMaterial
  )
  exitMarker.position.set(1.54, 0.93, 0)
  consoleGroup.add(exitMarker)

  function computePowered() {
    const visited = new Set()
    const sourceTile = tiles[sourceCell.row][sourceCell.col]
    if (!hasConnection(sourceTile, sourceCell.edge)) return visited

    const queue = [[sourceCell.row, sourceCell.col]]
    visited.add(`${sourceCell.row},${sourceCell.col}`)

    while (queue.length) {
      const [row, col] = queue.shift()
      const tile = tiles[row][col]
      for (const dir of connections(tile)) {
        const next = DIRS[dir]
        const nr = row + next.dr
        const nc = col + next.dc
        if (nr < 0 || nr >= 3 || nc < 0 || nc >= 3) continue

        const neighbour = tiles[nr][nc]
        const opposite = (dir + 2) % 4
        if (!hasConnection(neighbour, opposite)) continue

        const key = `${nr},${nc}`
        if (visited.has(key)) continue
        visited.add(key)
        queue.push([nr, nc])
      }
    }

    return visited
  }

  function drawScreen(fusesPowered, doorPowered) {
    if (!screenContext) return
    const ctx = screenContext
    ctx.fillStyle = '#071019'
    ctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height)
    ctx.strokeStyle = '#b08d3f'
    ctx.lineWidth = 8
    ctx.strokeRect(8, 8, screenCanvas.width - 16, screenCanvas.height - 16)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 54px sans-serif'
    ctx.fillText('CHRONO RELAY ROUTER', 512, 64)

    ctx.fillStyle = '#67e8f9'
    ctx.font = '700 34px sans-serif'
    ctx.fillText('ROTATE TILES: SOURCE → ALL 3 FUSES → DOOR', 512, 126)

    ctx.fillStyle = fusesPowered === 3 ? '#34d399' : '#fbbf24'
    ctx.font = '700 38px sans-serif'
    ctx.fillText(`FUSES ${fusesPowered}/3`, 360, 202)

    ctx.fillStyle = doorPowered ? '#34d399' : '#f87171'
    ctx.fillText(doorPowered ? 'DOOR LINKED' : 'DOOR OFFLINE', 690, 202)
    screenTexture.needsUpdate = true
  }

  function evaluate() {
    const powered = computePowered()
    let fusesPowered = 0

    for (const row of tiles) {
      for (const tile of row) {
        const key = `${tile.row},${tile.col}`
        const live = powered.has(key)
        tile.lineMaterial.emissiveIntensity = live ? 2.35 : 0.55
        tile.lineMaterial.color.setHex(live ? 0x67e8f9 : 0x2dd4bf)

        if (tile.fuseMaterial) {
          tile.fuseMaterial.color.setHex(live ? 0x34d399 : 0xf59e0b)
          tile.fuseMaterial.emissive.setHex(live ? 0x059669 : 0x78350f)
          tile.fuseMaterial.emissiveIntensity = live ? 2.5 : 1.05
          if (live) fusesPowered += 1
        }
      }
    }

    const exitTile = tiles[exitCell.row][exitCell.col]
    const doorPowered = powered.has(`${exitCell.row},${exitCell.col}`) && hasConnection(exitTile, exitCell.edge)
    exitMaterial.color.setHex(doorPowered ? 0x34d399 : 0xef4444)
    exitMaterial.emissive.setHex(doorPowered ? 0x059669 : 0x991b1b)
    exitMaterial.emissiveIntensity = doorPowered ? 3.1 : 2.2
    drawScreen(fusesPowered, doorPowered)

    if (solved || fusesPowered !== 3 || !doorPowered) return
    solved = true
    door.unlock()
    hud?.showToast?.('ROUTE COMPLETE — all three chrono fuses powered; stairwell unlocked.', 3300)
  }

  evaluate()

  return {
    isSolved: () => solved,
    dispose() {
      unregisters.forEach((unregister) => unregister())
      screen.geometry.dispose()
      screenMaterial.dispose()
      screenTexture.dispose()
      baseMaterial.dispose()
      trimMaterial.dispose()
      deckMaterial.dispose()
      tileBaseMaterial.dispose()
      fixedBaseMaterial.dispose()
      sourceMaterial.dispose()
      exitMaterial.dispose()
      for (const row of tiles) {
        for (const tile of row) {
          tile.lineMaterial.dispose()
          tile.fuseMaterial?.dispose?.()
        }
      }
    }
  }
}

export function createBridgePassage({ scene, interaction, hud, player, respawn, camera, distractionInventory } = {}) {
  const group = new THREE.Group()
  group.name = 'passage-bridge'
  const colliders = []

  const floorMat = marbleFloorMaterial({ repeat: [16, 4], base: 0x5b6064, vein: 0x34383d, grout: 0x22262a })
  const wallMat = plasterMaterial({ repeat: [14, 3], base: 0x444b50, roughness: 0.94 })
  const ceilingMat = plasterMaterial({ repeat: [14, 2], base: 0x252b30, roughness: 0.98 })
  const ironMat = metalMaterial({ repeat: [9, 2], base: 0x26343e, roughness: 0.48, metalness: 0.78 })
  const woodMat = woodMaterial({ repeat: [5, 2], light: 0x5b3f2b, dark: 0x2d1d14 })
  const stairRailMat = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    emissive: 0x2f2108,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.9
  })
  const pickupUnregisters = []
  const sharedInventory = distractionInventory ?? { count: 0, max: 3 }

  function addDistractorPickup(position, name) {
    const pickup = new THREE.Group()
    pickup.name = name
    pickup.position.copy(position)

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xb08d3f,
      emissive: 0x3a2608,
      emissiveIntensity: 0.45,
      roughness: 0.28,
      metalness: 0.9
    })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 10), bodyMat)
    body.rotation.z = Math.PI / 2
    body.position.y = 0.16
    body.castShadow = true
    pickup.add(body)
    group.add(pickup)

    let collected = false
    let unregister = null
    unregister = interaction.register(pickup, {
      prompt: 'Pick up loose metal distractor',
      range: 2.2,
      onInteract: () => {
        if (collected) return
        if (sharedInventory.count >= sharedInventory.max) {
          hud?.showToast?.(`Distractor pouch full — ${sharedInventory.count}/${sharedInventory.max}`, 1300)
          return
        }
        collected = true
        sharedInventory.count += 1
        pickup.visible = false
        unregister?.()
        interaction?.flashPrompt?.(`Distractor collected — ${sharedInventory.count}/${sharedInventory.max}`)
      }
    })
    pickupUnregisters.push(() => unregister?.())
  }

  function mountShell(shell) {
    group.add(shell.group)
    colliders.push(...shell.colliders)
    return shell
  }

  // ---------------------------------------------------------------------------
  // P2 -> P3 crouch vent
  // ---------------------------------------------------------------------------
  const vent = createCrouchVent({ group, colliders, floorMat, wallMat, ironMat, player, hud })

  // ---------------------------------------------------------------------------
  // Explicit junction rooms + edge-to-edge halls
  // ---------------------------------------------------------------------------
  // The previous version overlapped six complete corridor shells at their
  // center points. Each shell brought its own full-length side walls, which
  // meant those walls physically crossed the next corridor at every 90° turn.
  // These rooms own the corners instead; straight corridors only span the space
  // between room edges.
  const entryRoom = mountShell(createAxisAlignedRoom({
    center: new THREE.Vector3(ENTRY_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, ENTRY_ROOM_Z),
    sizeX: JUNCTION_SIZE,
    sizeZ: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    openings: {
      minX: { width: VENT_WIDTH, height: VENT_HEIGHT },
      minZ: true
    },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const southHallStartZ = ENTRY_ROOM_Z - JUNCTION_SIZE / 2
  const southHallEndZ = SOUTH_ROOM_Z + JUNCTION_SIZE / 2
  const southHall = mountShell(createAxisAlignedCorridor({
    start: new THREE.Vector3(SOUTH_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, southHallStartZ),
    end: new THREE.Vector3(SOUTH_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, southHallEndZ),
    width: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const southRoom = mountShell(createAxisAlignedRoom({
    center: new THREE.Vector3(SOUTH_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, SOUTH_ROOM_Z),
    sizeX: JUNCTION_SIZE,
    sizeZ: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    openings: { maxZ: true, maxX: true },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const laserHallStartX = SOUTH_ROOM_X + JUNCTION_SIZE / 2
  const laserHallEndX = LASER_ROOM_X - JUNCTION_SIZE / 2
  const laserHall = mountShell(createAxisAlignedCorridor({
    start: new THREE.Vector3(laserHallStartX, BRIDGE_PASSAGE_FLOOR_Y, LASER_ROOM_Z),
    end: new THREE.Vector3(laserHallEndX, BRIDGE_PASSAGE_FLOOR_Y, LASER_ROOM_Z),
    width: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const laserRoom = mountShell(createAxisAlignedRoom({
    center: new THREE.Vector3(LASER_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, LASER_ROOM_Z),
    sizeX: JUNCTION_SIZE,
    sizeZ: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    openings: { minX: true, maxZ: true },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const securityHallStartZ = LASER_ROOM_Z + JUNCTION_SIZE / 2
  const securityHallEndZ = PUZZLE_ROOM_Z - PUZZLE_ROOM_SIZE_Z / 2
  const securityHall = mountShell(createAxisAlignedCorridor({
    start: new THREE.Vector3(PUZZLE_X, BRIDGE_PASSAGE_FLOOR_Y, securityHallStartZ),
    end: new THREE.Vector3(PUZZLE_X, BRIDGE_PASSAGE_FLOOR_Y, securityHallEndZ),
    width: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const doorWidth = 3.4
  const puzzleRoom = mountShell(createAxisAlignedRoom({
    center: new THREE.Vector3(PUZZLE_X, BRIDGE_PASSAGE_FLOOR_Y, PUZZLE_ROOM_Z),
    sizeX: PUZZLE_ROOM_SIZE_X,
    sizeZ: PUZZLE_ROOM_SIZE_Z,
    height: PUZZLE_ROOM_HEIGHT,
    openings: {
      // Match the enlarged chamber's entrance to the width/height of the
      // incoming security corridor. Using `true` here removed the *entire*
      // min-Z wall, leaving two large open bays beside the corridor mouth.
      minZ: { width: JUNCTION_SIZE, height: ROOM_HEIGHT },
      maxZ: { width: doorWidth, height: 2.8 }
    },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))
  makeRoomWallsCameraFriendly(puzzleRoom)

  // The chamber keeps normal player collision but uses one-sided interior wall
  // faces so the third-person camera can cross a wall without a grey slab
  // covering the screen. No forced view-mode changes are needed.
  addPuzzleRoomDressing({
    group,
    floorY: BRIDGE_PASSAGE_FLOOR_Y,
    ironMat
  })

  // The wall opening above is the single physical partition around this door;
  // unlike the previous version there is no second loose wall plane or bare
  // landing on the far side.
  const puzzleDoor = createPuzzleDoor({
    position: new THREE.Vector3(PUZZLE_X, BRIDGE_PASSAGE_FLOOR_Y, PUZZLE_DOOR_Z),
    width: doorWidth,
    height: 2.8,
    axis: 'z'
  })
  group.add(puzzleDoor.group)
  colliders.push(puzzleDoor.collider)

  const powerPuzzle = createCircuitRoutingPuzzle({
    group,
    colliders,
    interaction,
    hud,
    door: puzzleDoor,
    floorY: BRIDGE_PASSAGE_FLOOR_Y,
    ironMat
  })

  // ---------------------------------------------------------------------------
  // Fully enclosed P3 -> P4 stair return
  // ---------------------------------------------------------------------------
  const lowerVestibuleCenterZ = (PUZZLE_DOOR_Z + LOWER_STAIR_START_Z) / 2
  const lowerVestibule = mountShell(createAxisAlignedRoom({
    center: new THREE.Vector3(LOWER_STAIR_X, BRIDGE_PASSAGE_FLOOR_Y, lowerVestibuleCenterZ),
    sizeX: JUNCTION_SIZE,
    sizeZ: LOWER_VESTIBULE_DEPTH,
    height: ROOM_HEIGHT,
    openings: {
      minZ: true,
      maxZ: { width: STAIR_WIDTH, height: ROOM_HEIGHT }
    },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const stair1 = createStaircase({
    start: new THREE.Vector3(LOWER_STAIR_X, BRIDGE_PASSAGE_FLOOR_Y, LOWER_STAIR_START_Z),
    end: new THREE.Vector3(LOWER_STAIR_X, -2, LOWER_STAIR_END_Z),
    width: STAIR_WIDTH,
    steps: 15,
    wallHeight: 4.35,
    stepMaterial: ironMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(stair1.group)
  addStairSideColliders(colliders, stair1)
  addStairRailings(group, stair1, stairRailMat)

  const midLanding = mountShell(createAxisAlignedRoom({
    center: new THREE.Vector3(MID_LANDING_X, -2, MID_LANDING_Z),
    sizeX: MID_LANDING_SIZE,
    sizeZ: MID_LANDING_SIZE,
    height: 4.35,
    openings: {
      minZ: { width: STAIR_WIDTH, height: 4.35 },
      maxX: { width: STAIR_WIDTH, height: 4.35 }
    },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

  const stair2 = createStaircase({
    start: new THREE.Vector3(UPPER_STAIR_START_X, -2, UPPER_STAIR_Z),
    end: new THREE.Vector3(UPPER_STAIR_END_X, 0, UPPER_STAIR_Z),
    width: STAIR_WIDTH,
    steps: 12,
    wallHeight: 4.35,
    stepMaterial: ironMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(stair2.group)
  addStairSideColliders(colliders, stair2)
  addStairRailings(group, stair2, stairRailMat)

  // ---------------------------------------------------------------------------
  // Gameplay dressing / hazards
  // ---------------------------------------------------------------------------
  addBox(group, colliders, {
    size: new THREE.Vector3(1.1, 1.45, 0.85),
    position: new THREE.Vector3(SOUTH_ROOM_X - 1.35, BRIDGE_PASSAGE_FLOOR_Y + 0.725, -42.25),
    material: ironMat,
    name: 'bridge-cover-a'
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(1.15, 1.2, 0.8),
    position: new THREE.Vector3(SOUTH_ROOM_X + 1.3, BRIDGE_PASSAGE_FLOOR_Y + 0.6, -44.7),
    material: woodMat,
    name: 'bridge-cover-b'
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(1.0, 1.4, 0.9),
    position: new THREE.Vector3(LASER_ROOM_X - 1.45, BRIDGE_PASSAGE_FLOOR_Y + 0.7, LASER_ROOM_Z + 1.35),
    material: ironMat,
    name: 'bridge-cover-c'
  })

  addDistractorPickup(
    new THREE.Vector3(ENTRY_ROOM_X + 1.1, BRIDGE_PASSAGE_FLOOR_Y + 0.02, ENTRY_ROOM_Z + 1.2),
    'distractor-pickup-p3-a'
  )
  addDistractorPickup(
    new THREE.Vector3(LASER_ROOM_X + 1.25, BRIDGE_PASSAGE_FLOOR_Y + 0.02, LASER_ROOM_Z - 1.25),
    'distractor-pickup-p3-b'
  )

  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xff9f43, emissiveIntensity: 3 })
  const lightPoints = [
    [ENTRY_ROOM_X, ENTRY_ROOM_Z],
    [SOUTH_ROOM_X, -43.2],
    [SOUTH_ROOM_X, SOUTH_ROOM_Z],
    [-66.2, LASER_ROOM_Z],
    [LASER_ROOM_X, LASER_ROOM_Z],
    [PUZZLE_X, -44.2]
  ]
  lightPoints.forEach(([x, z]) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), bulbMat)
    bulb.position.set(x, BRIDGE_PASSAGE_FLOOR_Y + 4.05, z)
    group.add(bulb)
    const light = new THREE.PointLight(0xffbd75, 7.2, 7, 2.15)
    light.position.copy(bulb.position)
    group.add(light)
  })

  // Replace the very bright floating bulbs with small wall sconces. Several
  // lower-intensity practical lights illuminate the treads/rails evenly without
  // blasting nearby plaster into large yellow/white rectangles.
  const stairHousingMat = new THREE.MeshStandardMaterial({
    color: 0x202930,
    roughness: 0.42,
    metalness: 0.82
  })
  const stairLensMat = new THREE.MeshStandardMaterial({
    color: 0xffdfb0,
    emissive: 0xffa64d,
    emissiveIntensity: 1.2,
    roughness: 0.28,
    metalness: 0.12
  })

  function addStairSconce(stair, t, side, intensity = 5.2) {
    const dx = stair.end.x - stair.start.x
    const dz = stair.end.z - stair.start.z
    const run = Math.hypot(dx, dz)
    const ux = dx / run
    const uz = dz / run
    const px = uz
    const pz = -ux
    const yaw = Math.atan2(ux, uz)
    const floorY = THREE.MathUtils.lerp(stair.start.y, stair.end.y, t)
    const centerX = THREE.MathUtils.lerp(stair.start.x, stair.end.x, t)
    const centerZ = THREE.MathUtils.lerp(stair.start.z, stair.end.z, t)
    const wallOffset = stair.width / 2 + 0.035

    const fixture = new THREE.Group()
    fixture.position.set(
      centerX + px * side * wallOffset,
      floorY + 1.62,
      centerZ + pz * side * wallOffset
    )
    fixture.rotation.y = yaw
    group.add(fixture)

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.46), stairHousingMat)
    housing.castShadow = true
    fixture.add(housing)

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.23, 0.30), stairLensMat)
    lens.position.x = -side * 0.085
    fixture.add(lens)

    const light = new THREE.PointLight(0xffc886, intensity, 5.8, 2.25)
    light.position.set(
      centerX - px * side * 0.30,
      floorY + 1.55,
      centerZ - pz * side * 0.30
    )
    group.add(light)
  }

  for (const [t, side] of [[0.16, -1], [0.48, 1], [0.80, -1]]) addStairSconce(stair1, t, side, 5.1)
  for (const [t, side] of [[0.18, 1], [0.50, -1], [0.82, 1]]) addStairSconce(stair2, t, side, 5.1)

  function addLandingCeilingFixture(position, intensity = 5.5) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.11, 0.34), stairHousingMat)
    housing.position.copy(position)
    group.add(housing)

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.03, 0.20), stairLensMat)
    lens.position.copy(position)
    lens.position.y -= 0.07
    group.add(lens)

    const light = new THREE.PointLight(0xffc886, intensity, 6.2, 2.25)
    light.position.copy(position)
    light.position.y -= 0.28
    group.add(light)
  }

  addLandingCeilingFixture(
    new THREE.Vector3(LOWER_STAIR_X, BRIDGE_PASSAGE_FLOOR_Y + 3.75, lowerVestibuleCenterZ),
    5.2
  )
  addLandingCeilingFixture(
    new THREE.Vector3(MID_LANDING_X, 1.55, MID_LANDING_Z),
    5.4
  )
  addLandingCeilingFixture(
    new THREE.Vector3(APPROACH_START_X + 0.55, 3.55, APPROACH_CENTER_Z),
    5.8
  )

  const laserFloor = createLaserFloor({
    start: new THREE.Vector3(laserHallStartX + 0.7, BRIDGE_PASSAGE_FLOOR_Y, LASER_ROOM_Z),
    end: new THREE.Vector3(laserHallEndX - 0.7, BRIDGE_PASSAGE_FLOOR_Y, LASER_ROOM_Z),
    width: 4.25,
    rowCount: 5,
    onHit: () => {
      hud?.showToast?.('Laser floor tripped — jump cleanly over each glowing row.', 1500)
      respawn?.fail?.('laser')
    }
  })
  group.add(laserFloor.group)

  // ---------------------------------------------------------------------------
  // Hints
  // ---------------------------------------------------------------------------
  const hints = createTutorialHintSystem({ player, hud })
  hints.addZone({
    id: 'bridge-vent',
    center: { x: BRIDGE_PASSAGE_VENT_ENTRY.x + 0.7, y: BRIDGE_PASSAGE_FLOOR_Y, z: BRIDGE_PASSAGE_VENT_ENTRY.z },
    size: { x: 2.2, y: 2.3, z: 2.5 },
    text: () => `MAINTENANCE VENT — hold ${bindingLabel(settings.getBinding('duck'))} and stay crouched until you clear all three low ribs.`,
    duration: 4200
  })
  hints.addZone({
    id: 'bridge-mixed-intro',
    center: { x: SOUTH_ROOM_X, y: BRIDGE_PASSAGE_FLOOR_Y, z: -42.1 },
    size: { x: 4.5, y: 3.4, z: 3.0 },
    text: () => `PASSAGEWAY 3 — read the guard and camera together. Use cover, or spend a collected distractor with ${bindingLabel(settings.getBinding('distract'))} when you need space.`,
    duration: 4400
  })
  hints.addZone({
    id: 'bridge-laser-floor',
    center: { x: (laserHallStartX + laserHallEndX) / 2, y: BRIDGE_PASSAGE_FLOOR_Y, z: LASER_ROOM_Z },
    size: { x: Math.max(3.0, laserHallEndX - laserHallStartX), y: 3.4, z: 4.6 },
    text: 'LASER FLOOR — the dark slabs are landing zones. Jump each glowing row; do not sprint straight through them.',
    duration: 4300
  })
  hints.addZone({
    id: 'bridge-timed-recall',
    center: { x: PUZZLE_X, y: BRIDGE_PASSAGE_FLOOR_Y, z: (securityHallStartZ + securityHallEndZ) / 2 },
    size: { x: 4.6, y: 3.4, z: 4.4 },
    text: 'SECURITY CHOKE — combine laser timing with camera/guard awareness. Wait for a clean opening.',
    duration: 3600
  })
  hints.addZone({
    id: 'bridge-power-puzzle',
    center: { x: PUZZLE_X, y: BRIDGE_PASSAGE_FLOOR_Y, z: PUZZLE_ROOM_Z },
    size: { x: PUZZLE_ROOM_SIZE_X - 0.6, y: 4.8, z: PUZZLE_ROOM_SIZE_Z - 0.6 },
    text: 'CHRONO RELAY ROUTER — rotate the junction tiles to carry the cyan route from SOURCE through all three fuse rings and into the DOOR.',
    duration: 5200
  })
  hints.addZone({
    id: 'bridge-stairs',
    center: { x: LOWER_STAIR_X, y: BRIDGE_PASSAGE_FLOOR_Y, z: lowerVestibuleCenterZ },
    size: { x: 3.4, y: 3.0, z: 3.0 },
    condition: () => powerPuzzle.isSolved(),
    text: 'BRIDGE COMPLETE — climb the first staircase, turn right inside the enclosed landing, then climb directly into the original passageway.',
    duration: 4700
  })

  // Exact playable floor rectangles. The previous broad AABBs extended across
  // empty space inside the U-shaped route and could hold the player on a
  // phantom floor after a geometry leak.
  const floorAreas = []
  function addFloorArea(centerX, centerZ, sizeX, sizeZ, y = BRIDGE_PASSAGE_FLOOR_Y) {
    floorAreas.push({
      minX: centerX - sizeX / 2,
      maxX: centerX + sizeX / 2,
      minZ: centerZ - sizeZ / 2,
      maxZ: centerZ + sizeZ / 2,
      y
    })
  }

  addFloorArea((BRIDGE_PASSAGE_VENT_ENTRY.x + VENT_EXIT_X) / 2, BRIDGE_PASSAGE_VENT_ENTRY.z, VENT_EXIT_X - BRIDGE_PASSAGE_VENT_ENTRY.x, VENT_WIDTH)
  addFloorArea(ENTRY_ROOM_X, ENTRY_ROOM_Z, JUNCTION_SIZE, JUNCTION_SIZE)
  addFloorArea(SOUTH_ROOM_X, (southHallStartZ + southHallEndZ) / 2, JUNCTION_SIZE, Math.abs(southHallEndZ - southHallStartZ))
  addFloorArea(SOUTH_ROOM_X, SOUTH_ROOM_Z, JUNCTION_SIZE, JUNCTION_SIZE)
  addFloorArea((laserHallStartX + laserHallEndX) / 2, LASER_ROOM_Z, Math.abs(laserHallEndX - laserHallStartX), JUNCTION_SIZE)
  addFloorArea(LASER_ROOM_X, LASER_ROOM_Z, JUNCTION_SIZE, JUNCTION_SIZE)
  addFloorArea(PUZZLE_X, (securityHallStartZ + securityHallEndZ) / 2, JUNCTION_SIZE, Math.abs(securityHallEndZ - securityHallStartZ))
  addFloorArea(PUZZLE_X, PUZZLE_ROOM_Z, PUZZLE_ROOM_SIZE_X, PUZZLE_ROOM_SIZE_Z)
  addFloorArea(LOWER_STAIR_X, lowerVestibuleCenterZ, JUNCTION_SIZE, LOWER_VESTIBULE_DEPTH)
  addFloorArea(MID_LANDING_X, MID_LANDING_Z, MID_LANDING_SIZE, MID_LANDING_SIZE, -2)

  function getGroundHeight(x, z, fallback = 0) {
    const h1 = stair1.getFloorHeight(x, z)
    if (h1 != null) return h1
    const h2 = stair2.getFloorHeight(x, z)
    if (h2 != null) return h2

    for (const area of floorAreas) {
      if (x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ) return area.y
    }
    return fallback
  }

  function isInsidePassage(position = player?.mesh?.position) {
    if (!position || position.y > 0.55) return false
    const floor = getGroundHeight(position.x, position.z, Number.NaN)
    return Number.isFinite(floor)
  }

  let timedController = null
  let distraction = null

  function setupStealth(stealth) {
    if (!stealth) return

    stealth.addGuard({
      waypoints: [
        new THREE.Vector3(SOUTH_ROOM_X + 0.9, BRIDGE_PASSAGE_FLOOR_Y, -42.2),
        new THREE.Vector3(SOUTH_ROOM_X - 0.75, BRIDGE_PASSAGE_FLOOR_Y, -45.0)
      ],
      speed: 1.15,
      waitTime: 2.4,
      initialWaypoint: 0
    })

    stealth.addCamera({
      position: new THREE.Vector3(SOUTH_ROOM_X - 2.18, BRIDGE_PASSAGE_FLOOR_Y + 4.35, -45.4),
      baseAngle: Math.PI / 2,
      sweepRange: Math.PI / 5.4,
      sweepSpeed: 0.58,
      range: 6.4
    })

    const timedGrid = stealth.addLaserGrid({
      position: new THREE.Vector3(PUZZLE_X, BRIDGE_PASSAGE_FLOOR_Y, (securityHallStartZ + securityHallEndZ) / 2),
      width: 4.25,
      height: 2.15,
      beamCount: 4,
      rotationY: 0
    })
    timedController = createTimedLaserController(timedGrid, {
      activeDuration: 2.3,
      inactiveDuration: 1.6,
      startActive: true
    })

    stealth.addGuard({
      waypoints: [
        new THREE.Vector3(LASER_ROOM_X - 1.0, BRIDGE_PASSAGE_FLOOR_Y, LASER_ROOM_Z + 1.1),
        new THREE.Vector3(PUZZLE_X + 1.0, BRIDGE_PASSAGE_FLOOR_Y, securityHallEndZ - 0.65)
      ],
      speed: 1.25,
      waitTime: 2.0,
      initialWaypoint: 0
    })

    distraction = createDistractionSystem({
      scene,
      player,
      camera,
      stealth,
      hud,
      groundHeightAt: getGroundHeight,
      isEnabled: () => isInsidePassage(),
      hearingRadius: 9.5,
      inventory: sharedInventory
    })
  }

  function handleAction(action) {
    if (action !== 'distract') return false
    return distraction?.throw?.() ?? false
  }

  const checkpointPosition = new THREE.Vector3(ENTRY_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, ENTRY_ROOM_Z)
  const exitCheckpointPosition = new THREE.Vector3(APPROACH_START_X + 1.0, 0, APPROACH_CENTER_Z)
  let bridgeEntered = false

  function hasReachedExit() {
    const p = player?.mesh?.position
    return Boolean(
      p && powerPuzzle.isSolved() &&
      p.y > -0.25 &&
      p.x >= APPROACH_START_X + 0.55 &&
      Math.abs(p.z - APPROACH_CENTER_Z) <= STAIR_WIDTH / 2
    )
  }

  function update(delta) {
    vent.update()
    const p = player?.mesh?.position
    if (vent.hasCleared(p)) bridgeEntered = true

    // Secondary containment guard. If a future geometry/collider regression lets
    // the player escape a lower Passageway 3 wall, fail immediately instead of
    // letting the fallback ground sampler create an invisible outdoor floor.
    if (bridgeEntered && p && p.y < -1.0 && !isInsidePassage(p)) {
      respawn?.fail?.('fell')
      return
    }
    laserFloor.update(delta, player?.mesh?.position)
    timedController?.update(delta)
    distraction?.update(delta)
    puzzleDoor.update(delta)
    hints.update()
  }

  function dispose() {
    powerPuzzle.dispose()
    pickupUnregisters.forEach((unregister) => unregister())
    distraction?.dispose()
    distraction = null
    laserFloor.dispose?.()
    hints.dispose()
  }

  return {
    group,
    colliders,
    bounds: { ...BRIDGE_PASSAGE_BOUNDS },
    setupStealth,
    handleAction,
    getGroundHeight,
    isInsidePassage,
    hasClearedVent: () => vent.hasCleared(player?.mesh?.position),
    hasReachedExit,
    entryCheckpoint: checkpointPosition,
    exitCheckpoint: exitCheckpointPosition,
    update,
    dispose,
    isComplete: () => powerPuzzle.isSolved()
  }
}

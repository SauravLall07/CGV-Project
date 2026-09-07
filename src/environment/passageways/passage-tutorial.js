import * as THREE from 'three'
import {
  marbleFloorMaterial,
  metalMaterial,
  plasterMaterial,
  woodMaterial
} from '../textures.js'
import { createTutorialHintSystem } from '../../systems/tutorial-hints.js'
import { createStaircase } from '../../core/stairs.js'
import {
  createAxisAlignedCorridor,
  createPuzzleDoor,
  createSweepingLaser,
  createTimedLaserController
} from './passage-components.js'

export const TUTORIAL_PASSAGE_SPAWN = new THREE.Vector3(-90.5, 0, -24.5)

export const TUTORIAL_PASSAGE_BOUNDS = {
  minX: -93.2,
  maxX: -59.2,
  minZ: -40.4,
  maxZ: -21.2
}

const CORRIDOR_Z = -24.5
const CORRIDOR_WIDTH = 6
const FLOOR_Y = 0
const LOWER_FLOOR_Y = -4
const ROOM_HEIGHT = 5.2
const PASSAGE_START_X = -93
const PUZZLE_DOOR_X = -66
const TURN_ROOM_EAST_X = -60
const STAIR_X = -63
const STAIR_START_Z = -27.5
const STAIR_END_Z = -36.6
const LOWER_ROOM_Z_MIN = -40
const LOWER_ROOM_Z_MAX = -36.6

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

function createSymbolMesh(type, material) {
  let geometry
  if (type === 0) geometry = new THREE.CircleGeometry(0.13, 20)
  else if (type === 1) geometry = new THREE.PlaneGeometry(0.23, 0.23)
  else geometry = new THREE.CircleGeometry(0.15, 3)

  const mesh = new THREE.Mesh(geometry, material)
  return mesh
}

function createSymbolPuzzle({ group, interaction, hud, door }) {
  const unregisters = []
  const symbols = ['circle', 'square', 'triangle']
  const target = [2, 0, 1]
  const current = [0, 1, 2]

  const panel = new THREE.Group()
  panel.name = 'tutorial-symbol-puzzle'
  panel.position.set(-69.3, 1.45, -21.42)
  panel.rotation.y = Math.PI
  group.add(panel)

  const casingMat = new THREE.MeshStandardMaterial({ color: 0x222b34, roughness: 0.42, metalness: 0.72 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.88 })
  const symbolMats = [
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0c4a6e, emissiveIntensity: 1.6 }),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x78350f, emissiveIntensity: 1.5 }),
    new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x581c87, emissiveIntensity: 1.5 })
  ]

  const casing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 0.18), casingMat)
  panel.add(casing)

  const solvedLampMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x7f1d1d,
    emissiveIntensity: 2
  })
  const solvedLamp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.04), solvedLampMat)
  solvedLamp.position.set(0, 0.33, -0.11)
  panel.add(solvedLamp)

  const dialGroups = []

  for (let i = 0; i < 3; i++) {
    const dial = new THREE.Group()
    dial.name = `symbol-dial-${i + 1}`
    dial.position.set(-0.62 + i * 0.62, -0.05, -0.12)

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), brassMat)
    dial.add(ring)

    const variants = []
    for (let s = 0; s < 3; s++) {
      const symbol = createSymbolMesh(s, symbolMats[s])
      symbol.position.z = -0.025
      symbol.visible = s === current[i]
      dial.add(symbol)
      variants.push(symbol)
    }

    dial.userData.variants = variants
    panel.add(dial)
    dialGroups.push(dial)
  }

  // Clue plaque on the opposite wall. The three symbols are visible in the
  // target order, so the player has to inspect the room rather than brute-force
  // a generic button sequence.
  const clue = new THREE.Group()
  clue.name = 'symbol-clue-plaque'
  clue.position.set(-70.2, 1.55, -27.42)
  group.add(clue)

  const cluePlate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.13), casingMat)
  clue.add(cluePlate)

  for (let i = 0; i < 3; i++) {
    const symbol = createSymbolMesh(target[i], symbolMats[target[i]])
    symbol.position.set(-0.62 + i * 0.62, 0, 0.075)
    clue.add(symbol)
  }

  let solved = false

  function syncDial(i) {
    dialGroups[i].userData.variants.forEach((mesh, symbolIndex) => {
      mesh.visible = symbolIndex === current[i]
    })
  }

  function checkSolved() {
    if (solved) return
    solved = current.every((value, index) => value === target[index])
    if (!solved) return

    solvedLampMat.color.setHex(0x10b981)
    solvedLampMat.emissive.setHex(0x047857)
    door.unlock()
    interaction?.flashPrompt?.('Cipher accepted — door unlocked')
    hud?.showToast?.('Cipher accepted. Turn left beyond the door and take the stairs down.', 3200)
  }

  dialGroups.forEach((dial, i) => {
    const unregister = interaction.register(dial, {
      prompt: `Rotate cipher dial ${i + 1}`,
      range: 2.4,
      onInteract: () => {
        if (solved) return
        current[i] = (current[i] + 1) % symbols.length
        syncDial(i)
        interaction?.flashPrompt?.(`Dial ${i + 1}: ${symbols[current[i]]}`)
        checkSolved()
      }
    })
    unregisters.push(unregister)
  })

  return {
    dispose() {
      unregisters.forEach((unregister) => unregister())
    },
    isSolved: () => solved
  }
}

export function createTutorialPassage({ interaction, hud, player, respawn, connectedToPassage2 = false } = {}) {
  const group = new THREE.Group()
  group.name = 'passage-tutorial'
  const colliders = []
  const stealthObjects = { camera: null, timedGrid: null, timedController: null }

  const floorMat = marbleFloorMaterial({
    repeat: [16, 3],
    base: 0x857c73,
    vein: 0x4d4743,
    grout: 0x332f2d
  })
  const wallMat = plasterMaterial({ repeat: [12, 3], base: 0x655d56, roughness: 0.9 })
  const panelMat = woodMaterial({ repeat: [10, 2], light: 0x66452e, dark: 0x321f17 })
  const ceilingMat = plasterMaterial({ repeat: [12, 2], base: 0x3d3a3c, roughness: 0.96 })
  const ironMat = metalMaterial({ repeat: [8, 1], base: 0x2c3640, roughness: 0.48, metalness: 0.72 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })

  // Main tutorial gallery: long enough to teach one mechanic at a time before
  // the player reaches the final cipher door.
  const corridor = createAxisAlignedCorridor({
    start: new THREE.Vector3(PASSAGE_START_X, FLOOR_Y, CORRIDOR_Z),
    end: new THREE.Vector3(PUZZLE_DOOR_X, FLOOR_Y, CORRIDOR_Z),
    width: CORRIDOR_WIDTH,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(corridor.group)
  colliders.push(...corridor.colliders)

  // Rear wall behind the spawn.
  addBox(group, colliders, {
    size: new THREE.Vector3(0.25, ROOM_HEIGHT, CORRIDOR_WIDTH),
    position: new THREE.Vector3(PASSAGE_START_X, ROOM_HEIGHT / 2, CORRIDOR_Z),
    material: wallMat
  })

  // Wainscot and repeating warm lights keep the same station language as the
  // existing passageways while making the new area feel deliberately authored.
  for (const side of [-1, 1]) {
    const z = CORRIDOR_Z + side * (CORRIDOR_WIDTH / 2 - 0.16)
    const wainscot = new THREE.Mesh(new THREE.BoxGeometry(26.4, 1.35, 0.07), panelMat)
    wainscot.position.set(-79.5, 0.68, z)
    group.add(wainscot)
  }

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe7bf,
    emissive: 0xffbd70,
    emissiveIntensity: 3.2,
    roughness: 0.15
  })
  for (const x of [-89, -84, -79, -74, -69]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bulbMat)
    lamp.position.set(x, 4.55, CORRIDOR_Z)
    group.add(lamp)

    const light = new THREE.PointLight(0xffc98a, 15, 9, 2)
    light.position.copy(lamp.position)
    group.add(light)
  }

  // Low moving beam: the player's first active obstacle. It is intentionally
  // low enough to clear with the existing jump arc.
  const sweepingLaser = createSweepingLaser({
    position: new THREE.Vector3(-86, 0, CORRIDOR_Z),
    beamLength: 5.1,
    beamHeight: 0.56,
    travelAxis: 'x',
    travelDistance: 1.25,
    speed: 1.3,
    onHit: () => {
      hud?.showToast?.('Low laser tripped — jump over the moving beam.', 1500)
      respawn?.fail?.('laser')
    }
  })
  group.add(sweepingLaser.group)

  // Waist-high maintenance cabinets create readable camera cover without
  // introducing guard stealth before Passageway 2.
  addBox(group, colliders, {
    size: new THREE.Vector3(1.25, 1.35, 0.85),
    position: new THREE.Vector3(-81.3, 0.675, -26.25),
    material: ironMat,
    name: 'camera-cover-cabinet-a'
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(1.1, 1.2, 0.85),
    position: new THREE.Vector3(-79.7, 0.6, -22.8),
    material: ironMat,
    name: 'camera-cover-cabinet-b'
  })

  // Puzzle partition at the end of the long gallery. Solid side pieces leave a
  // single central door so the cipher is a real progression gate.
  const doorWidth = 3.4
  const sideDepth = (CORRIDOR_WIDTH - doorWidth) / 2
  for (const side of [-1, 1]) {
    const z = CORRIDOR_Z + side * (doorWidth / 2 + sideDepth / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(0.25, ROOM_HEIGHT, sideDepth),
      position: new THREE.Vector3(PUZZLE_DOOR_X, ROOM_HEIGHT / 2, z),
      material: wallMat
    })
  }
  addBox(group, colliders, {
    size: new THREE.Vector3(0.25, ROOM_HEIGHT - 2.8, doorWidth),
    position: new THREE.Vector3(PUZZLE_DOOR_X, 2.8 + (ROOM_HEIGHT - 2.8) / 2, CORRIDOR_Z),
    material: wallMat,
    collider: false
  })

  const puzzleDoor = createPuzzleDoor({
    position: new THREE.Vector3(PUZZLE_DOOR_X, FLOOR_Y, CORRIDOR_Z),
    width: doorWidth,
    height: 2.8,
    axis: 'x'
  })
  group.add(puzzleDoor.group)
  colliders.push(puzzleDoor.collider)

  const symbolPuzzle = createSymbolPuzzle({ group, interaction, hud, door: puzzleDoor })

  // Turn room directly behind the puzzle door. Its north wall contains the
  // staircase opening, making the required "turn left, go down" beat explicit.
  const turnRoomCenterX = (PUZZLE_DOOR_X + TURN_ROOM_EAST_X) / 2
  const turnRoomCenterZ = CORRIDOR_Z
  const turnRoomWidthX = TURN_ROOM_EAST_X - PUZZLE_DOOR_X
  const turnRoomDepthZ = CORRIDOR_WIDTH

  const turnFloor = new THREE.Mesh(new THREE.PlaneGeometry(turnRoomWidthX, turnRoomDepthZ), floorMat)
  turnFloor.rotation.x = -Math.PI / 2
  turnFloor.position.set(turnRoomCenterX, 0.01, turnRoomCenterZ)
  turnFloor.receiveShadow = true
  group.add(turnFloor)

  const turnCeiling = new THREE.Mesh(new THREE.BoxGeometry(turnRoomWidthX, 0.2, turnRoomDepthZ), ceilingMat)
  turnCeiling.position.set(turnRoomCenterX, ROOM_HEIGHT, turnRoomCenterZ)
  group.add(turnCeiling)

  addBox(group, colliders, {
    size: new THREE.Vector3(0.25, ROOM_HEIGHT, turnRoomDepthZ),
    position: new THREE.Vector3(TURN_ROOM_EAST_X, ROOM_HEIGHT / 2, turnRoomCenterZ),
    material: wallMat
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(turnRoomWidthX, ROOM_HEIGHT, 0.25),
    position: new THREE.Vector3(turnRoomCenterX, ROOM_HEIGHT / 2, CORRIDOR_Z + CORRIDOR_WIDTH / 2),
    material: wallMat
  })

  const stairWidth = 3.2
  const northWallZ = CORRIDOR_Z - CORRIDOR_WIDTH / 2
  const sideSpan = (turnRoomWidthX - stairWidth) / 2
  for (const side of [-1, 1]) {
    const x = STAIR_X + side * (stairWidth / 2 + sideSpan / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(sideSpan, ROOM_HEIGHT, 0.25),
      position: new THREE.Vector3(x, ROOM_HEIGHT / 2, northWallZ),
      material: wallMat
    })
  }

  const staircase = createStaircase({
    start: new THREE.Vector3(STAIR_X, FLOOR_Y, STAIR_START_Z),
    end: new THREE.Vector3(STAIR_X, LOWER_FLOOR_Y, STAIR_END_Z),
    width: stairWidth,
    steps: 15,
    wallHeight: 4.6,
    stepMaterial: new THREE.MeshStandardMaterial({ color: 0x53505a, roughness: 0.82, metalness: 0.05 }),
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(staircase.group)

  // The rendered stair walls also need X/Z collision because the shared player
  // controller intentionally uses lightweight 2D wall boxes.
  for (const side of [-1, 1]) {
    const x = STAIR_X + side * (stairWidth / 2 + 0.09)
    colliders.push({
      minX: x - 0.16,
      maxX: x + 0.16,
      minZ: STAIR_END_Z,
      maxZ: STAIR_START_Z
    })
  }

  // Narrow decorative handrails make the descent read clearly from the turn.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 9.7, 8), brassMat)
    rail.rotation.x = Math.PI / 2
    rail.rotation.z = Math.atan2(LOWER_FLOOR_Y - FLOOR_Y, STAIR_END_Z - STAIR_START_Z)
    rail.position.set(STAIR_X + side * 1.45, -0.65, (STAIR_START_Z + STAIR_END_Z) / 2)
    group.add(rail)
  }

  // Bottom landing / Stage 2 connection point. It is a real enclosed room, not
  // an exterior gap, so outdoor terrain can never become part of the playable
  // route. The east bulkhead is intentionally left sealed until Passageway 2 is
  // added in the next stage.
  const lowerCenterZ = (LOWER_ROOM_Z_MIN + LOWER_ROOM_Z_MAX) / 2
  const lowerRoomDepth = LOWER_ROOM_Z_MAX - LOWER_ROOM_Z_MIN
  const lowerRoomWidth = 6
  const lowerCenterX = STAIR_X

  const lowerFloor = new THREE.Mesh(new THREE.PlaneGeometry(lowerRoomWidth, lowerRoomDepth), floorMat)
  lowerFloor.rotation.x = -Math.PI / 2
  lowerFloor.position.set(lowerCenterX, LOWER_FLOOR_Y + 0.01, lowerCenterZ)
  lowerFloor.receiveShadow = true
  group.add(lowerFloor)

  const lowerCeiling = new THREE.Mesh(new THREE.BoxGeometry(lowerRoomWidth, 0.2, lowerRoomDepth), ceilingMat)
  lowerCeiling.position.set(lowerCenterX, LOWER_FLOOR_Y + ROOM_HEIGHT, lowerCenterZ)
  group.add(lowerCeiling)

  const lowerSideSpan = (lowerRoomWidth - stairWidth) / 2
  for (const side of [-1, 1]) {
    const x = lowerCenterX + side * (stairWidth / 2 + lowerSideSpan / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(lowerSideSpan, ROOM_HEIGHT, 0.25),
      position: new THREE.Vector3(x, LOWER_FLOOR_Y + ROOM_HEIGHT / 2, LOWER_ROOM_Z_MAX),
      material: wallMat
    })
  }

  addBox(group, colliders, {
    size: new THREE.Vector3(0.25, ROOM_HEIGHT, lowerRoomDepth),
    position: new THREE.Vector3(lowerCenterX - lowerRoomWidth / 2, LOWER_FLOOR_Y + ROOM_HEIGHT / 2, lowerCenterZ),
    material: wallMat
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(lowerRoomWidth, ROOM_HEIGHT, 0.25),
    position: new THREE.Vector3(lowerCenterX, LOWER_FLOOR_Y + ROOM_HEIGHT / 2, LOWER_ROOM_Z_MIN),
    material: wallMat
  })

  // Stage 1 used a sealed east bulkhead here. Once Passageway 2 exists the
  // landing stays physically open so the modules join without overlapping wall
  // collision. Keeping this switch preserves the ability to run Passageway 1
  // by itself during isolated testing.
  if (!connectedToPassage2) {
    const stageBulkhead = addBox(group, colliders, {
      size: new THREE.Vector3(0.3, ROOM_HEIGHT, lowerRoomDepth),
      position: new THREE.Vector3(lowerCenterX + lowerRoomWidth / 2, LOWER_FLOOR_Y + ROOM_HEIGHT / 2, lowerCenterZ),
      material: ironMat,
      name: 'passage-2-stage-bulkhead'
    })
    stageBulkhead.userData.stageBoundary = true
  }

  // Tutorial hint zones. These are non-blocking, fade using the existing HUD,
  // and never repeat during the current level instance.
  const hints = createTutorialHintSystem({ player, hud })
  hints.addZone({
    id: 'tutorial-movement',
    center: { x: -90.2, y: 0, z: CORRIDOR_Z },
    size: { x: 4.4, y: 4, z: 5.4 },
    text: 'Move through the gallery. Run when the route is clear and jump over low hazards.',
    duration: 3400
  })
  hints.addZone({
    id: 'tutorial-moving-laser',
    center: { x: -88, y: 0, z: CORRIDOR_Z },
    size: { x: 3.4, y: 4, z: 5.4 },
    text: 'MOVING LASER — watch its rhythm, then jump over the low beam as it sweeps past.',
    duration: 3300
  })
  hints.addZone({
    id: 'tutorial-camera',
    center: { x: -82.2, y: 0, z: CORRIDOR_Z },
    size: { x: 3.5, y: 4, z: 5.4 },
    text: 'SECURITY CAMERA — blue vision cones raise suspicion. Wait for the sweep or use solid cover.',
    duration: 3600
  })
  hints.addZone({
    id: 'tutorial-timed-gate',
    center: { x: -78.4, y: 0, z: CORRIDOR_Z },
    size: { x: 3.5, y: 4, z: 5.4 },
    text: 'LASER GATE — this one cycles off briefly. Read the timing and cross during the safe window.',
    duration: 3500
  })
  hints.addZone({
    id: 'tutorial-puzzle',
    center: { x: -72, y: 0, z: CORRIDOR_Z },
    size: { x: 4.5, y: 4, z: 5.4 },
    text: 'LOCKED DOOR — inspect the opposite maintenance plaque, then rotate all three cipher dials to match it.',
    duration: 3900
  })
  hints.addZone({
    id: 'tutorial-stage-complete',
    center: { x: STAIR_X, y: LOWER_FLOOR_Y, z: -38.4 },
    size: { x: 5.2, y: 3.5, z: 2.2 },
    condition: () => symbolPuzzle.isSolved(),
    text: connectedToPassage2
      ? 'Passageway 1 complete. Continue east into the lower security passage.'
      : 'Passageway 1 complete. The sealed bulkhead ahead is the connection point for Passageway 2.',
    duration: 4200
  })

  function setupStealth(stealth) {
    if (!stealth) return

    stealthObjects.camera = stealth.addCamera({
      position: new THREE.Vector3(-80.4, 4.45, -21.78),
      baseAngle: Math.PI,
      sweepRange: Math.PI / 5.2,
      sweepSpeed: 0.58,
      range: 7.2
    })

    stealthObjects.timedGrid = stealth.addLaserGrid({
      position: new THREE.Vector3(-76.3, FLOOR_Y, CORRIDOR_Z),
      width: 5.25,
      height: 2.2,
      beamCount: 4,
      rotationY: Math.PI / 2
    })

    stealthObjects.timedController = createTimedLaserController(stealthObjects.timedGrid, {
      activeDuration: 2.35,
      inactiveDuration: 1.45,
      startActive: true
    })
  }

  function getGroundHeight(x, z, fallback = 0) {
    const stairHeight = staircase.getFloorHeight(x, z)
    if (stairHeight != null) return stairHeight

    const onLowerLanding = (
      x >= lowerCenterX - lowerRoomWidth / 2 &&
      x <= lowerCenterX + lowerRoomWidth / 2 &&
      z >= LOWER_ROOM_Z_MIN &&
      z <= LOWER_ROOM_Z_MAX + 0.2
    )
    if (onLowerLanding) return LOWER_FLOOR_Y

    return fallback
  }

  function update(delta) {
    sweepingLaser.update(delta, player?.mesh?.position)
    puzzleDoor.update(delta)
    stealthObjects.timedController?.update(delta)
    hints.update()
  }

  function dispose() {
    symbolPuzzle.dispose()
    hints.dispose()
  }

  return {
    group,
    colliders,
    spawn: TUTORIAL_PASSAGE_SPAWN.clone(),
    bounds: { ...TUTORIAL_PASSAGE_BOUNDS },
    setupStealth,
    getGroundHeight,
    update,
    dispose,
    isComplete: () => symbolPuzzle.isSolved()
  }
}

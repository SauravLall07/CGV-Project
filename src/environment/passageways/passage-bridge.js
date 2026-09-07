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
const PUZZLE_DOOR_Z = PUZZLE_ROOM_Z + JUNCTION_SIZE / 2

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

  for (const side of [-1, 1]) {
    const wallZ = z + side * width / 2
    addBox(group, colliders, {
      size: new THREE.Vector3(length, height, 0.14),
      position: new THREE.Vector3(centerX, BRIDGE_PASSAGE_FLOOR_Y + height / 2, wallZ),
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

function createPowerMatrixPuzzle({ group, interaction, hud, door, floorY, wallMat, ironMat }) {
  const unregisters = []
  const state = {
    camera: true,
    laser: true,
    door: false
  }
  let solved = false

  const panel = new THREE.Group()
  panel.name = 'bridge-power-matrix'
  panel.position.set(PUZZLE_X + JUNCTION_SIZE / 2 - 0.14, floorY + 1.55, PUZZLE_ROOM_Z)
  panel.rotation.y = -Math.PI / 2
  group.add(panel)

  const casing = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.25, 0.18), ironMat)
  panel.add(casing)

  const labels = [
    { key: 'camera', color: 0x38bdf8 },
    { key: 'laser', color: 0xef4444 },
    { key: 'door', color: 0xf59e0b }
  ]
  const lamps = new Map()
  labels.forEach((entry, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: entry.color,
      emissive: entry.color,
      emissiveIntensity: 2.2,
      roughness: 0.25
    })
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.06), mat)
    lamp.position.set(-0.72 + i * 0.72, 0.36, -0.12)
    panel.add(lamp)
    lamps.set(entry.key, lamp)
  })

  // Three physical breakers. Their prompts disclose which circuits they affect;
  // the player reasons about the small network rather than matching another code.
  const breakerDefs = [
    { name: 'SURVEILLANCE / DOOR', x: -0.72, apply: () => { state.camera = !state.camera; state.door = !state.door } },
    { name: 'LASER ISOLATOR', x: 0, apply: () => { state.laser = !state.laser } },
    { name: 'CROSS-FEED', x: 0.72, apply: () => { state.camera = !state.camera; state.laser = !state.laser } }
  ]

  const leverGroups = []
  const leverMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.88 })
  breakerDefs.forEach((def, i) => {
    const lever = new THREE.Group()
    lever.name = `bridge-breaker-${i + 1}`
    lever.position.set(def.x, -0.23, -0.14)

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.09), wallMat)
    lever.add(base)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.09), leverMat)
    handle.position.z = -0.08
    lever.add(handle)
    lever.userData.handle = handle
    panel.add(lever)
    leverGroups.push(lever)

    unregisters.push(interaction.register(lever, {
      prompt: `Toggle ${def.name} breaker`,
      range: 2.7,
      onInteract: () => {
        if (solved) return
        def.apply()
        handle.rotation.z = handle.rotation.z === 0 ? 0.75 : 0
        sync()
        interaction.flashPrompt(statusText())
        checkSolved()
      }
    }))
  })

  const targetStripMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x064e3b, emissiveIntensity: 1.8 })
  const targetStrip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.05), targetStripMat)
  targetStrip.position.set(0, -0.53, -0.12)
  panel.add(targetStrip)

  function statusText() {
    return `Surveillance ${state.camera ? 'ON' : 'OFF'} · Lasers ${state.laser ? 'ON' : 'OFF'} · Door ${state.door ? 'ON' : 'OFF'}`
  }

  function sync() {
    lamps.get('camera').material.emissiveIntensity = state.camera ? 2.3 : 0.12
    lamps.get('laser').material.emissiveIntensity = state.laser ? 2.3 : 0.12
    lamps.get('door').material.emissiveIntensity = state.door ? 2.3 : 0.12
  }

  function checkSolved() {
    if (solved) return
    solved = !state.camera && !state.laser && state.door
    if (!solved) return

    targetStripMat.color.setHex(0x34d399)
    targetStripMat.emissive.setHex(0x10b981)
    targetStripMat.emissiveIntensity = 3
    door.unlock()
    hud?.showToast?.('MAINTENANCE MATRIX STABLE — surveillance and laser feeds isolated; stairwell unlocked.', 3600)
  }

  unregisters.push(interaction.register(panel, {
    prompt: 'Inspect maintenance power target',
    range: 3,
    onInteract: () => {
      interaction.flashPrompt(statusText())
      hud?.showToast?.('TARGET: Surveillance OFF · Lasers OFF · Door ON. Each breaker changes one or more circuits.', 3300)
    }
  }))

  sync()

  return {
    isSolved: () => solved,
    dispose() {
      unregisters.forEach((unregister) => unregister())
    }
  }
}

export function createBridgePassage({ scene, interaction, hud, player, respawn, camera } = {}) {
  const group = new THREE.Group()
  group.name = 'passage-bridge'
  const colliders = []

  const floorMat = marbleFloorMaterial({ repeat: [16, 4], base: 0x5b6064, vein: 0x34383d, grout: 0x22262a })
  const wallMat = plasterMaterial({ repeat: [14, 3], base: 0x444b50, roughness: 0.94 })
  const ceilingMat = plasterMaterial({ repeat: [14, 2], base: 0x252b30, roughness: 0.98 })
  const ironMat = metalMaterial({ repeat: [9, 2], base: 0x26343e, roughness: 0.48, metalness: 0.78 })
  const woodMat = woodMaterial({ repeat: [5, 2], light: 0x5b3f2b, dark: 0x2d1d14 })

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
  const securityHallEndZ = PUZZLE_ROOM_Z - JUNCTION_SIZE / 2
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
    sizeX: JUNCTION_SIZE,
    sizeZ: JUNCTION_SIZE,
    height: ROOM_HEIGHT,
    openings: {
      minZ: true,
      maxZ: { width: doorWidth, height: 2.8 }
    },
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  }))

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

  const powerPuzzle = createPowerMatrixPuzzle({
    group,
    interaction,
    hud,
    door: puzzleDoor,
    floorY: BRIDGE_PASSAGE_FLOOR_Y,
    wallMat,
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

  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xff9f43, emissiveIntensity: 3 })
  const lightPoints = [
    [ENTRY_ROOM_X, ENTRY_ROOM_Z],
    [SOUTH_ROOM_X, -43.2],
    [SOUTH_ROOM_X, SOUTH_ROOM_Z],
    [-66.2, LASER_ROOM_Z],
    [LASER_ROOM_X, LASER_ROOM_Z],
    [PUZZLE_X, -44.2],
    [PUZZLE_X, PUZZLE_ROOM_Z],
    [LOWER_STAIR_X, lowerVestibuleCenterZ],
    [MID_LANDING_X, MID_LANDING_Z]
  ]
  lightPoints.forEach(([x, z]) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bulbMat)
    const floorY = (x === MID_LANDING_X && z === MID_LANDING_Z) ? -2 : BRIDGE_PASSAGE_FLOOR_Y
    bulb.position.set(x, floorY + 4.05, z)
    group.add(bulb)
    const light = new THREE.PointLight(0xffbd75, 9, 7, 2)
    light.position.copy(bulb.position)
    group.add(light)
  })

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
    text: () => `PASSAGEWAY 3 — read the guard and camera together; crouch, use cover, or press ${bindingLabel(settings.getBinding('distract'))} to create space.`,
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
    size: { x: 4.4, y: 3.4, z: 4.4 },
    text: 'POWER MATRIX — maintenance mode needs Surveillance OFF, Lasers OFF and Door ON. Watch the three status lamps.',
    duration: 4700
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
  addFloorArea(PUZZLE_X, PUZZLE_ROOM_Z, JUNCTION_SIZE, JUNCTION_SIZE)
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
      hearingRadius: 9.5
    })
  }

  function handleAction(action) {
    if (action !== 'distract') return false
    return distraction?.throw?.() ?? false
  }

  const checkpointPosition = new THREE.Vector3(ENTRY_ROOM_X, BRIDGE_PASSAGE_FLOOR_Y, ENTRY_ROOM_Z)

  function update(delta) {
    vent.update()
    laserFloor.update(delta, player?.mesh?.position)
    timedController?.update(delta)
    distraction?.update(delta)
    puzzleDoor.update(delta)
    hints.update()
  }

  function dispose() {
    powerPuzzle.dispose()
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
    entryCheckpoint: checkpointPosition,
    update,
    dispose,
    isComplete: () => powerPuzzle.isSolved()
  }
}

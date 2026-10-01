import * as THREE from 'three'
import {
  marbleFloorMaterial,
  metalMaterial,
  plasterMaterial,
  woodMaterial
} from '../textures.js'
import { createTutorialHintSystem } from '../../systems/tutorial-hints.js'
import { createAxisAlignedCorridor, createPuzzleDoor } from './passage-components.js'
import { TUTORIAL_PASSAGE_WEST_ENTRY_X } from './passage-tutorial.js'

// Passageway 0 — a short, completely safe onboarding gallery.
// It exists only to let the player get their hands on movement/camera controls
// before Passageway 1 introduces hazards. The exit door teaches interaction.

const FLOOR_Y = 0
const CORRIDOR_Z = -24.5
const CORRIDOR_WIDTH = 6
const ROOM_HEIGHT = 5.2
const PASSAGE_END_X = TUTORIAL_PASSAGE_WEST_ENTRY_X
const PASSAGE_START_X = PASSAGE_END_X - 18
const EXTERIOR_START_X = PASSAGE_START_X - 11.5
const EXTERIOR_WIDTH = 4.8
const EXIT_DOOR_X = PASSAGE_END_X - 2.15

export const ONBOARDING_PASSAGE_SPAWN = new THREE.Vector3(
  EXTERIOR_START_X + 1.7,
  FLOOR_Y,
  CORRIDOR_Z
)

export const ONBOARDING_PASSAGE_BOUNDS = {
  minX: EXTERIOR_START_X - 0.4,
  maxX: PASSAGE_END_X + 0.35,
  minZ: CORRIDOR_Z - CORRIDOR_WIDTH / 2 - 0.3,
  maxZ: CORRIDOR_Z + CORRIDOR_WIDTH / 2 + 0.3
}

function addBox(group, colliders, {
  size,
  position,
  material,
  collider = true,
  colliderInset = 0,
  name = ''
}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  mesh.position.copy(position)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  if (collider) {
    const inset = Math.max(0, colliderInset)
    colliders.push({
      minX: position.x - size.x / 2 + inset,
      maxX: position.x + size.x / 2 - inset,
      minZ: position.z - size.z / 2 + inset,
      maxZ: position.z + size.z / 2 - inset
    })
  }

  return mesh
}

function createAccessPanel() {
  const group = new THREE.Group()
  group.name = 'onboarding-access-panel'

  const casingMat = new THREE.MeshStandardMaterial({
    color: 0x222b34,
    roughness: 0.4,
    metalness: 0.78
  })
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    roughness: 0.28,
    metalness: 0.9
  })
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0c4a6e,
    emissiveIntensity: 2.0,
    roughness: 0.2
  })

  const casing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.72, 0.52), casingMat)
  group.add(casing)

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.305, 0.42, 0.34), brassMat)
  frame.position.x = 0.02
  group.add(frame)

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.29, 0.23), screenMat)
  screen.position.x = 0.18
  group.add(screen)

  group.userData.screenMaterial = screenMat
  return group
}

export function createOnboardingPassage({ interaction, hud, player } = {}) {
  const group = new THREE.Group()
  group.name = 'passage-onboarding'
  const colliders = []

  const floorMat = marbleFloorMaterial({
    repeat: [11, 3],
    base: 0x857c73,
    vein: 0x4d4743,
    grout: 0x332f2d
  })
  const wallMat = plasterMaterial({ repeat: [9, 3], base: 0x655d56, roughness: 0.9 })
  const panelMat = woodMaterial({ repeat: [7, 2], light: 0x66452e, dark: 0x321f17 })
  const ceilingMat = plasterMaterial({ repeat: [9, 2], base: 0x3d3a3c, roughness: 0.96 })
  const ironMat = metalMaterial({ repeat: [6, 1], base: 0x2c3640, roughness: 0.48, metalness: 0.72 })

  const corridor = createAxisAlignedCorridor({
    start: new THREE.Vector3(PASSAGE_START_X, FLOOR_Y, CORRIDOR_Z),
    end: new THREE.Vector3(PASSAGE_END_X, FLOOR_Y, CORRIDOR_Z),
    width: CORRIDOR_WIDTH,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(corridor.group)
  colliders.push(...corridor.colliders)

  // The run now begins outside on an elevated service gantry. It gives the
  // player a believable approach to the infiltration wing and lets the first
  // movement tutorial happen in open air before they step indoors.
  const serviceDoorWidth = 2.8
  const serviceDoorHeight = 2.75
  const rearSideDepth = (CORRIDOR_WIDTH - serviceDoorWidth) / 2
  for (const side of [-1, 1]) {
    addBox(group, colliders, {
      size: new THREE.Vector3(0.25, ROOM_HEIGHT, rearSideDepth),
      position: new THREE.Vector3(
        PASSAGE_START_X,
        ROOM_HEIGHT / 2,
        CORRIDOR_Z + side * (serviceDoorWidth / 2 + rearSideDepth / 2)
      ),
      material: wallMat,
      name: `onboarding-entry-wall-${side}`
    })
  }
  addBox(group, colliders, {
    size: new THREE.Vector3(0.25, ROOM_HEIGHT - serviceDoorHeight, serviceDoorWidth),
    position: new THREE.Vector3(
      PASSAGE_START_X,
      serviceDoorHeight + (ROOM_HEIGHT - serviceDoorHeight) / 2,
      CORRIDOR_Z
    ),
    material: wallMat,
    collider: false,
    name: 'onboarding-entry-lintel'
  })

  // Exterior steel deck.
  const exteriorLength = PASSAGE_START_X - EXTERIOR_START_X
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x303942,
    roughness: 0.58,
    metalness: 0.68
  })
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(exteriorLength, 0.28, EXTERIOR_WIDTH),
    deckMat
  )
  deck.position.set((EXTERIOR_START_X + PASSAGE_START_X) / 2, -0.14, CORRIDOR_Z)
  deck.receiveShadow = true
  deck.castShadow = true
  deck.name = 'onboarding-exterior-service-deck'
  group.add(deck)

  // A pair of rails keeps the playable route readable while leaving the sky,
  // distant scenery and underside of the gantry visible.
  const railMat = new THREE.MeshStandardMaterial({ color: 0x78838a, roughness: 0.4, metalness: 0.85 })
  for (const side of [-1, 1]) {
    const railZ = CORRIDOR_Z + side * EXTERIOR_WIDTH / 2
    for (const y of [0.55, 1.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(exteriorLength, 0.07, 0.07), railMat)
      rail.position.set((EXTERIOR_START_X + PASSAGE_START_X) / 2, y, railZ)
      rail.castShadow = true
      group.add(rail)
    }
    // Rail collision is intentionally thin; the circle-vs-box player
    // collision keeps the character on the deck without stealing walkway room.
    colliders.push({
      minX: EXTERIOR_START_X,
      maxX: PASSAGE_START_X,
      minZ: railZ - 0.06,
      maxZ: railZ + 0.06
    })
  }

  // Closed freight-lift gate behind the spawn explains how the thief reached
  // this otherwise isolated service gantry, while keeping progression one-way.
  for (const y of [0.55, 1.05]) {
    const rearRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, EXTERIOR_WIDTH), railMat)
    rearRail.position.set(EXTERIOR_START_X, y, CORRIDOR_Z)
    group.add(rearRail)
  }
  colliders.push({
    minX: EXTERIOR_START_X - 0.06,
    maxX: EXTERIOR_START_X + 0.06,
    minZ: CORRIDOR_Z - EXTERIOR_WIDTH / 2,
    maxZ: CORRIDOR_Z + EXTERIOR_WIDTH / 2
  })

  const liftFrameMat = new THREE.MeshStandardMaterial({ color: 0x252c33, roughness: 0.52, metalness: 0.78 })
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), liftFrameMat)
    post.position.set(EXTERIOR_START_X - 0.15, 1.5, CORRIDOR_Z + side * (EXTERIOR_WIDTH / 2 - 0.18))
    group.add(post)
  }
  const liftHeader = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, EXTERIOR_WIDTH), liftFrameMat)
  liftHeader.position.set(EXTERIOR_START_X - 0.15, 2.95, CORRIDOR_Z)
  group.add(liftHeader)

  for (let x = EXTERIOR_START_X + 0.6; x < PASSAGE_START_X; x += 2.2) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), railMat)
      post.position.set(x, 0.575, CORRIDOR_Z + side * EXTERIOR_WIDTH / 2)
      group.add(post)
    }
  }

  // Heavy portal trim makes the open doorway read as the point where the
  // player physically enters the building, rather than another arbitrary gap.
  const rearTrimMat = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    emissive: 0x2f2108,
    emissiveIntensity: 0.22,
    roughness: 0.3,
    metalness: 0.9
  })
  for (const zOffset of [-serviceDoorWidth / 2, serviceDoorWidth / 2]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.12, serviceDoorHeight + 0.14, 0.12), rearTrimMat)
    trim.position.set(PASSAGE_START_X - 0.02, serviceDoorHeight / 2, CORRIDOR_Z + zOffset)
    group.add(trim)
  }
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, serviceDoorWidth + 0.12), rearTrimMat)
  topTrim.position.set(PASSAGE_START_X - 0.02, serviceDoorHeight, CORRIDOR_Z)
  group.add(topTrim)

  // Warm exterior utility lamps lead the eye toward the doorway.
  for (const x of [EXTERIOR_START_X + 2.2, EXTERIOR_START_X + 7.2]) {
    const lamp = new THREE.PointLight(0xffb66d, 9, 7, 2)
    lamp.position.set(x, 2.7, CORRIDOR_Z)
    group.add(lamp)
  }

  // Match the station's wood-and-brass language so the onboarding space feels
  // like part of the level rather than a separate grey test room.
  for (const side of [-1, 1]) {
    const z = CORRIDOR_Z + side * (CORRIDOR_WIDTH / 2 - 0.16)
    const wainscot = new THREE.Mesh(
      new THREE.BoxGeometry(PASSAGE_END_X - PASSAGE_START_X - 0.5, 1.35, 0.07),
      panelMat
    )
    wainscot.position.set((PASSAGE_START_X + PASSAGE_END_X) / 2, 0.68, z)
    group.add(wainscot)
  }

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe7bf,
    emissive: 0xffbd70,
    emissiveIntensity: 3.0,
    roughness: 0.15
  })
  for (const x of [PASSAGE_START_X + 3.2, PASSAGE_START_X + 8.0, PASSAGE_START_X + 12.8]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bulbMat)
    lamp.position.set(x, 4.55, CORRIDOR_Z)
    group.add(lamp)

    const light = new THREE.PointLight(0xffc98a, 13, 8.5, 2)
    light.position.copy(lamp.position)
    group.add(light)
  }

  // A few waist-high props give the player something to walk around and make
  // camera-relative movement immediately readable, but there is no fail state.
  addBox(group, colliders, {
    size: new THREE.Vector3(1.25, 1.0, 0.72),
    position: new THREE.Vector3(PASSAGE_START_X + 8.0, 0.5, CORRIDOR_Z - 1.65),
    material: ironMat,
    colliderInset: 0.06,
    name: 'onboarding-luggage-a'
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(1.0, 0.8, 0.72),
    position: new THREE.Vector3(PASSAGE_START_X + 10.4, 0.4, CORRIDOR_Z + 1.55),
    material: ironMat,
    colliderInset: 0.06,
    name: 'onboarding-luggage-b'
  })

  // Interaction gate at the end. The player has already practised moving by
  // the time they reach it, so this teaches one new input by itself.
  const doorWidth = 3.4
  const sideDepth = (CORRIDOR_WIDTH - doorWidth) / 2
  for (const side of [-1, 1]) {
    const z = CORRIDOR_Z + side * (doorWidth / 2 + sideDepth / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(0.25, ROOM_HEIGHT, sideDepth),
      position: new THREE.Vector3(EXIT_DOOR_X, ROOM_HEIGHT / 2, z),
      material: wallMat
    })
  }
  addBox(group, colliders, {
    size: new THREE.Vector3(0.25, ROOM_HEIGHT - 2.8, doorWidth),
    position: new THREE.Vector3(EXIT_DOOR_X, 2.8 + (ROOM_HEIGHT - 2.8) / 2, CORRIDOR_Z),
    material: wallMat,
    collider: false
  })

  const exitDoor = createPuzzleDoor({
    position: new THREE.Vector3(EXIT_DOOR_X, FLOOR_Y, CORRIDOR_Z),
    width: doorWidth,
    height: 2.8,
    axis: 'x'
  })
  group.add(exitDoor.group)
  colliders.push(exitDoor.collider)

  const accessPanel = createAccessPanel()
  accessPanel.position.set(EXIT_DOOR_X - 0.65, 1.35, CORRIDOR_Z - 2.64)
  accessPanel.rotation.y = -Math.PI / 2
  group.add(accessPanel)

  const unregisterPanel = interaction?.register?.(accessPanel, {
    prompt: 'Open training passage door',
    range: 2.5,
    isEligible: () => !exitDoor.isUnlocked(),
    onInteract: () => {
      if (exitDoor.isUnlocked()) return
      exitDoor.unlock()
      const screenMat = accessPanel.userData.screenMaterial
      screenMat?.color?.setHex?.(0x10b981)
      screenMat?.emissive?.setHex?.(0x047857)
      interaction?.flashPrompt?.('Access confirmed — door unlocked', 1300)
      hud?.showToast?.('Training complete. Hazards begin in Passageway 1.', 2300)
    }
  })

  const hints = createTutorialHintSystem({ player, hud })

  hints.addZone({
    id: 'onboarding-movement',
    center: { x: ONBOARDING_PASSAGE_SPAWN.x, y: FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 4.8, y: 4.0, z: 4.4 },
    modal: true,
    eyebrow: 'Service Gantry · Approach',
    title: 'Move & Look',
    text: 'The freight lift behind you has delivered you to a maintenance gantry outside the station wing. Follow the gantry through the open service doorway; movement follows the direction of the camera.',
    controls: [
      { label: 'Move', actions: ['forward', 'left', 'back', 'right'] },
      { label: 'Look Around', key: 'Mouse' },
      { label: 'Run', action: 'run' },
      { label: 'Switch View', action: 'toggleView' }
    ]
  })

  hints.addZone({
    id: 'onboarding-interact',
    center: { x: EXIT_DOOR_X - 2.4, y: FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 3.0, y: 4.0, z: 5.4 },
    modal: true,
    eyebrow: 'Passageway 0 · Training',
    title: 'Interact',
    text: 'Useful objects highlight when you are close and looking toward them. Use Interact on the access panel beside the door to continue.',
    controls: [
      { label: 'Interact', action: 'interact' }
    ]
  })

  function getGroundHeight(x, z, fallback = 0) {
    const inInterior = (
      x >= PASSAGE_START_X && x <= ONBOARDING_PASSAGE_BOUNDS.maxX &&
      Math.abs(z - CORRIDOR_Z) <= CORRIDOR_WIDTH / 2 + 0.1
    )
    const onExteriorDeck = (
      x >= EXTERIOR_START_X && x <= PASSAGE_START_X &&
      Math.abs(z - CORRIDOR_Z) <= EXTERIOR_WIDTH / 2 + 0.08
    )
    return (inInterior || onExteriorDeck) ? FLOOR_Y : fallback
  }

  function update(delta) {
    exitDoor.update(delta)
    hints.update()
  }

  function dispose() {
    unregisterPanel?.()
    hints.dispose()
  }

  return {
    group,
    colliders,
    spawn: ONBOARDING_PASSAGE_SPAWN.clone(),
    bounds: { ...ONBOARDING_PASSAGE_BOUNDS },
    getGroundHeight,
    update,
    dispose,
    isComplete: () => exitDoor.isUnlocked(),
    hasExited: (position = player?.mesh?.position) => Boolean(
      position &&
      exitDoor.isUnlocked() &&
      position.x >= PASSAGE_END_X + 0.4 &&
      Math.abs(position.z - CORRIDOR_Z) <= CORRIDOR_WIDTH / 2
    )
  }
}

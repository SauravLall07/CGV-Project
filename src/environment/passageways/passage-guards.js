import * as THREE from 'three'
import {
  marbleFloorMaterial,
  metalMaterial,
  plasterMaterial,
  woodMaterial
} from '../textures.js'
import { bindingLabel, settings } from '../../core/settings.js'
import { createTutorialHintSystem } from '../../systems/tutorial-hints.js'
import { createDistractionSystem } from '../../systems/distraction.js'
import {
  createAxisAlignedCorridor,
  createPuzzleDoor,
  createSweepingLaser,
  createTimedLaserController
} from './passage-components.js'

const PASSAGE_X_SHIFT = -66
const worldX = (x) => x + PASSAGE_X_SHIFT

export const GUARD_PASSAGE_FLOOR_Y = -4
export const GUARD_PASSAGE_ENTRY = new THREE.Vector3(worldX(-58.25), GUARD_PASSAGE_FLOOR_Y, -38.3)

export const GUARD_PASSAGE_BOUNDS = {
  minX: worldX(-60.2),
  maxX: worldX(-13.8),
  minZ: -42.15,
  maxZ: -34.45
}

const CORRIDOR_Z = -38.3
const ROOM_HEIGHT = 5.0
const ENTRY_X = worldX(-60)
const WIDEN_X = worldX(-56)
const EXIT_DOOR_X = worldX(-17.8)
const STAGE3_WALL_X = worldX(-14.2)
export const GUARD_PASSAGE_EXIT = new THREE.Vector3(STAGE3_WALL_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z)
const MAIN_WIDTH = 7.2
const ENTRY_WIDTH = 3.4
const EXIT_BAY_WIDTH = 5.4

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

function markerGeometry(index) {
  if (index === 0) return new THREE.CircleGeometry(0.18, 22)
  if (index === 1) return new THREE.CircleGeometry(0.2, 3)
  if (index === 2) return new THREE.PlaneGeometry(0.3, 0.3)
  return new THREE.RingGeometry(0.1, 0.19, 20)
}

function createSignalStepPuzzle({ group, interaction, hud, player, door, floorY }) {
  const target = [1, 3, 0, 2]
  const unregisters = []
  const platePositions = [
    new THREE.Vector3(worldX(-23.4), floorY + 0.055, CORRIDOR_Z - 1.55),
    new THREE.Vector3(worldX(-20.7), floorY + 0.055, CORRIDOR_Z - 1.55),
    new THREE.Vector3(worldX(-23.4), floorY + 0.055, CORRIDOR_Z + 1.55),
    new THREE.Vector3(worldX(-20.7), floorY + 0.055, CORRIDOR_Z + 1.55)
  ]

  const baseColors = [0x38bdf8, 0xf59e0b, 0xc084fc, 0x34d399]
  const markerNames = ['circle', 'triangle', 'square', 'ring']

  const plateMats = baseColors.map((color) => new THREE.MeshStandardMaterial({
    color: 0x242a31,
    roughness: 0.52,
    metalness: 0.62,
    emissive: color,
    emissiveIntensity: 0.35
  }))
  const symbolMats = baseColors.map((color) => new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.2,
    roughness: 0.25,
    metalness: 0.25,
    side: THREE.DoubleSide
  }))

  const plates = []
  for (let i = 0; i < platePositions.length; i++) {
    const plate = new THREE.Group()
    plate.name = `routing-floor-plate-${i + 1}`
    plate.position.copy(platePositions[i])

    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 1.35), plateMats[i])
    slab.position.y = 0
    slab.receiveShadow = true
    plate.add(slab)

    const symbol = new THREE.Mesh(markerGeometry(i), symbolMats[i])
    symbol.rotation.x = -Math.PI / 2
    symbol.position.y = 0.055
    plate.add(symbol)

    group.add(plate)
    plates.push({ plate, slab, symbol })
  }

  // Wall relay displays the four-symbol route as a short animated sequence.
  // The player may replay it at any time, making this a memory/observation
  // puzzle rather than another dial-code puzzle.
  const panel = new THREE.Group()
  panel.name = 'routing-sequence-relay'
  panel.position.set(worldX(-22.05), floorY + 1.55, CORRIDOR_Z + MAIN_WIDTH / 2 - 0.13)
  panel.rotation.y = Math.PI
  group.add(panel)

  const casingMat = new THREE.MeshStandardMaterial({ color: 0x1d2731, roughness: 0.4, metalness: 0.78 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.88 })
  const casing = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.05, 0.18), casingMat)
  panel.add(casing)

  const labelRail = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.06, 0.05), brassMat)
  labelRail.position.set(0, 0.39, -0.115)
  panel.add(labelRail)

  const panelMarkers = []
  for (let i = 0; i < 4; i++) {
    const mat = symbolMats[i].clone()
    mat.emissiveIntensity = 0.18
    const symbol = new THREE.Mesh(markerGeometry(i), mat)
    symbol.position.set(-0.9 + i * 0.6, -0.05, -0.115)
    panel.add(symbol)
    panelMarkers.push(symbol)
  }

  let progress = 0
  let solved = false
  let occupiedPlate = -1
  let playbackActive = true
  let playbackTime = 0
  let replayCooldown = 0

  function setPanelStep(activeMarker = -1) {
    panelMarkers.forEach((mesh, index) => {
      mesh.material.emissiveIntensity = index === activeMarker ? 3.2 : 0.18
      mesh.scale.setScalar(index === activeMarker ? 1.22 : 1)
    })
  }

  function replay() {
    if (solved || replayCooldown > 0) return
    playbackActive = true
    playbackTime = 0
    replayCooldown = 0.35
    setPanelStep(-1)
  }

  const unregisterPanel = interaction.register(panel, {
    prompt: 'Replay routing sequence',
    range: 2.7,
    onInteract: () => {
      replay()
      interaction?.flashPrompt?.('Sequence replaying')
    }
  })
  unregisters.push(unregisterPanel)

  function resetProgress(showMessage = true) {
    progress = 0
    plates.forEach(({ slab }, index) => {
      slab.material.emissive.setHex(baseColors[index])
      slab.material.emissiveIntensity = 0.35
    })
    if (showMessage) hud?.showToast?.('Wrong pressure plate — routing sequence reset. Replay the wall relay and try again.', 2100)
  }

  function activatePlate(index) {
    if (solved) return
    const expected = target[progress]

    if (index !== expected) {
      resetProgress(true)
      replay()
      return
    }

    const slab = plates[index].slab
    slab.material.emissive.setHex(0x10b981)
    slab.material.emissiveIntensity = 2.5
    progress += 1
    interaction?.flashPrompt?.(`${markerNames[index]} accepted — ${progress}/4`)

    if (progress < target.length) return

    solved = true
    setPanelStep(-1)
    panelMarkers.forEach((mesh) => {
      mesh.material.emissive.setHex(0x10b981)
      mesh.material.emissiveIntensity = 2.2
    })
    door.unlock()
    hud?.showToast?.('Routing sequence accepted — Passageway 3 access unlocked.', 3000)
    interaction?.flashPrompt?.('Access granted')
  }

  function update(delta) {
    replayCooldown = Math.max(0, replayCooldown - delta)

    if (playbackActive && !solved) {
      playbackTime += delta
      const leadIn = 0.35
      const stepDuration = 0.68
      const step = Math.floor((playbackTime - leadIn) / stepDuration)

      if (playbackTime < leadIn) {
        setPanelStep(-1)
      } else if (step >= 0 && step < target.length) {
        setPanelStep(target[step])
      } else if (playbackTime >= leadIn + target.length * stepDuration + 0.25) {
        playbackActive = false
        setPanelStep(-1)
      }
    }

    if (solved || !player?.mesh) return

    const p = player.mesh.position
    let inside = -1
    let bestDistSq = Infinity
    for (let i = 0; i < platePositions.length; i++) {
      const dx = p.x - platePositions[i].x
      const dz = p.z - platePositions[i].z
      const distSq = dx * dx + dz * dz
      if (distSq < 0.56 * 0.56 && distSq < bestDistSq) {
        inside = i
        bestDistSq = distSq
      }
    }

    if (inside !== -1 && occupiedPlate !== inside) activatePlate(inside)
    occupiedPlate = inside
  }

  function dispose() {
    unregisters.forEach((unregister) => unregister())
  }

  return {
    update,
    dispose,
    replay,
    isSolved: () => solved
  }
}

export function createGuardPassage({ scene, interaction, hud, player, respawn, camera, connectedToPassage3 = false } = {}) {
  const group = new THREE.Group()
  group.name = 'passage-guards'
  const colliders = []

  const floorMat = marbleFloorMaterial({
    repeat: [20, 4],
    base: 0x69666a,
    vein: 0x3d3a40,
    grout: 0x27252a
  })
  const wallMat = plasterMaterial({ repeat: [18, 3], base: 0x4d5155, roughness: 0.92 })
  const ceilingMat = plasterMaterial({ repeat: [16, 2], base: 0x292d31, roughness: 0.98 })
  const ironMat = metalMaterial({ repeat: [10, 2], base: 0x293540, roughness: 0.5, metalness: 0.75 })
  const woodMat = woodMaterial({ repeat: [6, 2], light: 0x5c402c, dark: 0x2b1d15 })

  // Narrow connector lines up exactly with Passageway 1's lower landing, then
  // opens into the wider guard-training hall.
  const entry = createAxisAlignedCorridor({
    start: new THREE.Vector3(ENTRY_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    end: new THREE.Vector3(WIDEN_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    width: ENTRY_WIDTH,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(entry.group)
  colliders.push(...entry.colliders)

  const main = createAxisAlignedCorridor({
    start: new THREE.Vector3(WIDEN_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    end: new THREE.Vector3(EXIT_DOOR_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    width: MAIN_WIDTH,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(main.group)
  colliders.push(...main.colliders)

  // Fill the shoulders where the 3.3m stair landing widens to 7.2m. The central
  // gap stays open, so the transition reads like a security choke-point rather
  // than an accidental hole in the corridor shell.
  const shoulderDepth = (MAIN_WIDTH - ENTRY_WIDTH) / 2
  for (const side of [-1, 1]) {
    const z = CORRIDOR_Z + side * (ENTRY_WIDTH / 2 + shoulderDepth / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(0.24, ROOM_HEIGHT, shoulderDepth),
      position: new THREE.Vector3(WIDEN_X, GUARD_PASSAGE_FLOOR_Y + ROOM_HEIGHT / 2, z),
      material: wallMat
    })
  }

  // Repeating industrial lights keep this lower level clearly indoor and make
  // guard cones / laser timing readable without changing the station palette.
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe0ad,
    emissive: 0xffa94d,
    emissiveIntensity: 3,
    roughness: 0.18
  })
  for (const x of [-57.5, -52, -46.5, -41, -35.5, -30, -24.5, -19.5].map(worldX)) {
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 10), bulbMat)
    bulb.rotation.z = Math.PI / 2
    bulb.position.set(x, GUARD_PASSAGE_FLOOR_Y + 4.35, CORRIDOR_Z)
    group.add(bulb)

    const light = new THREE.PointLight(0xffc57f, 11, 8, 2)
    light.position.copy(bulb.position)
    group.add(light)
  }

  // Cover for the first crouch lesson. These boxes are real obstacles, so they
  // block line of sight and teach that physical cover matters.
  addBox(group, colliders, {
    size: new THREE.Vector3(1.45, 1.55, 0.9),
    position: new THREE.Vector3(worldX(-53.0), GUARD_PASSAGE_FLOOR_Y + 0.775, CORRIDOR_Z - 2.35),
    material: ironMat,
    name: 'guard-passage-cover-a'
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(1.25, 1.25, 0.85),
    position: new THREE.Vector3(worldX(-48.2), GUARD_PASSAGE_FLOOR_Y + 0.625, CORRIDOR_Z + 2.25),
    material: woodMat,
    name: 'guard-passage-cover-b'
  })

  // A baggage trolley marks the obvious distraction target. It is not required
  // mechanically — the player can throw anywhere — but gives first-time players
  // a legible place to lure the second guard toward.
  const trolley = new THREE.Group()
  trolley.position.set(worldX(-40.8), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z + 2.55)
  const trolleyDeck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.72), ironMat)
  trolleyDeck.position.y = 0.35
  trolley.add(trolleyDeck)
  for (const side of [-1, 1]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.5), woodMat)
    bag.position.set(side * 0.38, 0.8, 0)
    trolley.add(bag)
  }
  group.add(trolley)

  // Camera/laser combination zone: still forgiving, with a cabinet immediately
  // before the camera and generous safe window on the timed grid.
  addBox(group, colliders, {
    size: new THREE.Vector3(1.2, 1.35, 0.82),
    position: new THREE.Vector3(worldX(-35.0), GUARD_PASSAGE_FLOOR_Y + 0.675, CORRIDOR_Z - 2.45),
    material: ironMat,
    name: 'guard-passage-camera-cover'
  })

  const movingLaser = createSweepingLaser({
    position: new THREE.Vector3(worldX(-28.4), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    beamLength: 6.15,
    beamHeight: 0.58,
    travelAxis: 'x',
    travelDistance: 0.85,
    speed: 1.05,
    onHit: () => {
      hud?.showToast?.('Moving laser tripped — use the jump timing learned upstairs.', 1500)
      respawn?.fail?.('laser')
    }
  })
  group.add(movingLaser.group)

  // Final routing puzzle door. The room behind it is a short sealed transition
  // bay so Stage 3 can attach cleanly without redesigning this passage later.
  const doorWidth = 3.6
  const sideDepth = (MAIN_WIDTH - doorWidth) / 2
  for (const side of [-1, 1]) {
    const z = CORRIDOR_Z + side * (doorWidth / 2 + sideDepth / 2)
    addBox(group, colliders, {
      size: new THREE.Vector3(0.24, ROOM_HEIGHT, sideDepth),
      position: new THREE.Vector3(EXIT_DOOR_X, GUARD_PASSAGE_FLOOR_Y + ROOM_HEIGHT / 2, z),
      material: wallMat
    })
  }
  addBox(group, colliders, {
    size: new THREE.Vector3(0.24, ROOM_HEIGHT - 2.8, doorWidth),
    position: new THREE.Vector3(EXIT_DOOR_X, GUARD_PASSAGE_FLOOR_Y + 2.8 + (ROOM_HEIGHT - 2.8) / 2, CORRIDOR_Z),
    material: wallMat,
    collider: false
  })

  const puzzleDoor = createPuzzleDoor({
    position: new THREE.Vector3(EXIT_DOOR_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    width: doorWidth,
    height: 2.8,
    axis: 'x'
  })
  group.add(puzzleDoor.group)
  colliders.push(puzzleDoor.collider)

  const exitBay = createAxisAlignedCorridor({
    start: new THREE.Vector3(EXIT_DOOR_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    end: new THREE.Vector3(STAGE3_WALL_X, GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
    width: EXIT_BAY_WIDTH,
    height: ROOM_HEIGHT,
    floorMaterial: floorMat,
    wallMaterial: wallMat,
    ceilingMaterial: ceilingMat
  })
  group.add(exitBay.group)
  colliders.push(...exitBay.colliders)

  // Stage 2 originally ended at a sealed bulkhead. Once Passageway 3 is
  // mounted, the bay stays open and Passageway 3 supplies the smaller crouch
  // vent frame that closes this wide opening down to a maintenance duct.
  if (!connectedToPassage3) {
    const stage3Bulkhead = addBox(group, colliders, {
      size: new THREE.Vector3(0.3, ROOM_HEIGHT, EXIT_BAY_WIDTH),
      position: new THREE.Vector3(STAGE3_WALL_X, GUARD_PASSAGE_FLOOR_Y + ROOM_HEIGHT / 2, CORRIDOR_Z),
      material: ironMat,
      name: 'passage-3-stage-bulkhead'
    })
    stage3Bulkhead.userData.stageBoundary = true
  }

  const signalPuzzle = createSignalStepPuzzle({
    group,
    interaction,
    hud,
    player,
    door: puzzleDoor,
    floorY: GUARD_PASSAGE_FLOOR_Y
  })

  const hints = createTutorialHintSystem({ player, hud })
  hints.addZone({
    id: 'guards-intro',
    center: { x: worldX(-57.7), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 3.8, y: 3.2, z: 3.0 },
    text: 'GUARDS — yellow vision cones show where they can see. Watch patrols before committing to a route.',
    duration: 3400
  })
  hints.addZone({
    id: 'crouch-intro',
    center: { x: worldX(-53.4), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 4.0, y: 3.2, z: 6.4 },
    text: () => `CROUCH — hold ${bindingLabel(settings.getBinding('duck'))}. You move slower, but suspicion rises much more slowly while a guard sees you.`,
    duration: 4100
  })
  hints.addZone({
    id: 'distract-intro',
    center: { x: worldX(-45.5), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 5.0, y: 3.2, z: 6.4 },
    text: () => `DISTRACT — press ${bindingLabel(settings.getBinding('distract'))} to throw a metal distractor where you are facing. Nearby guards investigate the impact, then resume patrol.`,
    duration: 4700
  })
  hints.addZone({
    id: 'combine-camera-laser',
    center: { x: worldX(-35.2), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 4.8, y: 3.2, z: 6.5 },
    text: 'COMBINE MECHANICS — use the cabinet as camera cover, read the laser cycle, then cross during the safe window.',
    duration: 3900
  })
  hints.addZone({
    id: 'moving-laser-recall',
    center: { x: worldX(-29.4), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 4.0, y: 3.2, z: 6.5 },
    text: 'MOVING LASER — same principle as Passageway 1, but now after stealth pressure. Wait for a clean jump rather than rushing.',
    duration: 3500
  })
  hints.addZone({
    id: 'signal-step-puzzle',
    center: { x: worldX(-24.2), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 5.0, y: 3.2, z: 6.5 },
    text: 'ROUTING FLOOR — watch the wall relay flash four symbols, then step on the matching floor plates in that order. Interact with the relay to replay it.',
    duration: 4700
  })
  hints.addZone({
    id: 'passage-2-complete',
    center: { x: worldX(-15.9), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 2.8, y: 3.2, z: 4.8 },
    condition: () => signalPuzzle.isSolved(),
    text: connectedToPassage3
      ? 'Passageway 2 complete. The maintenance vent ahead is the only route forward — crouch to fit through.'
      : 'Passageway 2 complete. The bulkhead ahead is the Stage 3 connection point.',
    duration: 3600
  })

  let timedController = null
  let distraction = null
  let stealthRef = null

  function isInsidePassage(position = player?.mesh?.position) {
    if (!position) return false
    return (
      position.x >= GUARD_PASSAGE_BOUNDS.minX &&
      position.x <= GUARD_PASSAGE_BOUNDS.maxX &&
      position.z >= GUARD_PASSAGE_BOUNDS.minZ &&
      position.z <= GUARD_PASSAGE_BOUNDS.maxZ &&
      position.y < -2.4
    )
  }

  function getGroundHeight(x, z, fallback = 0) {
    const inside = (
      x >= GUARD_PASSAGE_BOUNDS.minX &&
      x <= GUARD_PASSAGE_BOUNDS.maxX &&
      z >= GUARD_PASSAGE_BOUNDS.minZ &&
      z <= GUARD_PASSAGE_BOUNDS.maxZ
    )
    return inside ? GUARD_PASSAGE_FLOOR_Y : fallback
  }

  function setupStealth(stealth) {
    if (!stealth) return
    stealthRef = stealth

    // Guard 1: slow cross-corridor patrol with obvious cover. This is the
    // dedicated crouch/sneak lesson and is intentionally easy to read.
    stealth.addGuard({
      waypoints: [
        new THREE.Vector3(worldX(-50.6), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z - 2.35),
        new THREE.Vector3(worldX(-50.6), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z + 2.25)
      ],
      speed: 1.08,
      waitTime: 2.7,
      initialWaypoint: 0
    })

    // Guard 2 sits across the obvious line of travel. Throwing toward the
    // baggage trolley pulls this guard north, opening the south-side route.
    stealth.addGuard({
      waypoints: [
        new THREE.Vector3(worldX(-44.0), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
        new THREE.Vector3(worldX(-38.4), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z)
      ],
      speed: 1.22,
      waitTime: 2.25,
      initialWaypoint: 1
    })

    stealth.addCamera({
      position: new THREE.Vector3(worldX(-34.7), GUARD_PASSAGE_FLOOR_Y + 4.45, CORRIDOR_Z + MAIN_WIDTH / 2 - 0.12),
      baseAngle: Math.PI,
      sweepRange: Math.PI / 4.7,
      sweepSpeed: 0.58,
      range: 7.4
    })

    const timedGrid = stealth.addLaserGrid({
      position: new THREE.Vector3(worldX(-32.15), GUARD_PASSAGE_FLOOR_Y, CORRIDOR_Z),
      width: 6.25,
      height: 2.2,
      beamCount: 4,
      rotationY: Math.PI / 2
    })

    timedController = createTimedLaserController(timedGrid, {
      activeDuration: 2.65,
      inactiveDuration: 1.65,
      startActive: true
    })

    distraction = createDistractionSystem({
      scene,
      player,
      camera,
      stealth,
      hud,
      groundHeightAt: getGroundHeight,
      isEnabled: () => isInsidePassage(),
      hearingRadius: 10
    })
  }

  function handleAction(action) {
    if (action !== 'distract') return false
    return distraction?.throw?.() ?? false
  }

  function update(delta) {
    movingLaser.update(delta, player?.mesh?.position)
    timedController?.update(delta)
    distraction?.update(delta)
    signalPuzzle.update(delta)
    puzzleDoor.update(delta)
    hints.update()
  }

  function dispose() {
    signalPuzzle.dispose()
    distraction?.dispose()
    distraction = null
    stealthRef = null
    hints.dispose()
  }

  return {
    group,
    colliders,
    bounds: { ...GUARD_PASSAGE_BOUNDS },
    entryCheckpoint: GUARD_PASSAGE_ENTRY.clone(),
    setupStealth,
    handleAction,
    getGroundHeight,
    isInsidePassage,
    update,
    dispose,
    isComplete: () => signalPuzzle.isSolved()
  }
}

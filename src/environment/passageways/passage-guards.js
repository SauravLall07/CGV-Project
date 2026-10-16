import { playSfx } from '../../systems/sound-effects.js'
import * as THREE from 'three'
import { getKitMaterials } from '../level1-kit/kit-materials.js'
import { retile } from '../level1-kit/kit-props.js'
import { dressWalls } from '../level1-kit/wall-dressing.js'
import { dressGuardPassage } from './level1-dressing.js'
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
import { addPassageShell } from './passage-exterior.js'

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

// The route markers are actual station-signalling pictograms rather than
// abstract, colour-coded shapes. Their silhouettes carry the information.
function createRailMarkerTexture(index) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = '#f0dfb3'
  ctx.fillStyle = '#f0dfb3'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }
  const circle = (x, y, r, fill = false) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
    fill ? ctx.fill() : ctx.stroke()
  }
  if (index === 0) { // Railway points / turnout
    line(75, 35, 75, 218)
    line(113, 35, 113, 218)
    ctx.beginPath(); ctx.moveTo(75, 203); ctx.bezierCurveTo(75, 139, 154, 105, 178, 38); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(113, 218); ctx.bezierCurveTo(113, 156, 188, 117, 212, 54); ctx.stroke()
    for (let y = 56; y < 206; y += 38) line(64, y, 125, y)
  } else if (index === 1) { // Mechanical semaphore signal
    line(106, 51, 106, 219)
    line(78, 219, 140, 219)
    ctx.fillRect(105, 72, 108, 24)
    ctx.fillStyle = '#9e4236'; ctx.fillRect(161, 74, 30, 20)
    ctx.fillStyle = '#f0dfb3'; circle(107, 84, 11, true)
  } else if (index === 2) { // Signal gantry
    line(48, 211, 48, 71)
    line(208, 211, 208, 71)
    line(48, 74, 208, 74)
    line(63, 86, 191, 86)
    line(75, 74, 75, 118)
    line(182, 74, 182, 118)
    circle(75, 141, 13); circle(182, 141, 13)
    line(48, 211, 208, 211)
  } else { // Track tunnel
    ctx.beginPath(); ctx.moveTo(55, 213); ctx.lineTo(55, 118)
    ctx.arc(128, 118, 73, Math.PI, 0); ctx.lineTo(201, 213); ctx.stroke()
    line(94, 214, 113, 143)
    line(161, 214, 143, 143)
    for (let y = 161; y < 215; y += 18) {
      const t = (y - 143) / 71
      line(113 - 19*t, y, 143 + 18*t, y)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function randomizedRoute() {
  const route = [0, 1, 2, 3]
  for (let i = route.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[route[i], route[j]] = [route[j], route[i]]
  }
  return route
}

function createSignalStepPuzzle({ group, interaction, hud, player, door, floorY }) {
  const target = randomizedRoute()
  const unregisters = []
  const platePositions = [
    new THREE.Vector3(worldX(-23.4), floorY + 0.055, CORRIDOR_Z - 1.55),
    new THREE.Vector3(worldX(-20.7), floorY + 0.055, CORRIDOR_Z - 1.55),
    new THREE.Vector3(worldX(-23.4), floorY + 0.055, CORRIDOR_Z + 1.55),
    new THREE.Vector3(worldX(-20.7), floorY + 0.055, CORRIDOR_Z + 1.55)
  ]

  const markerNames = ['points', 'semaphore', 'signal gantry', 'tunnel']
  const inactiveGlow = 0x6f5733
  const signalGlow = 0xf9c66b
  const activatedSymbolGlow = 0xffc65a
  const solvedSymbolGlow = 0x62ffc9
  const markerTextures = markerNames.map((_, i) => createRailMarkerTexture(i))
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x242b2a, roughness: 0.66, metalness: 0.7,
    emissive: inactiveGlow, emissiveIntensity: 0.12
  })
  const insetMat = new THREE.MeshStandardMaterial({ color: 0x101a1b, roughness: 0.72, metalness: 0.42 })
  const brassTrimMat = new THREE.MeshStandardMaterial({ color: 0xa68b58, roughness: 0.45, metalness: 0.84 })
  const symbolMats = markerTextures.map((map) => new THREE.MeshStandardMaterial({
    map, transparent: true, alphaTest: 0.12, depthWrite: false,
    emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12,
    side: THREE.DoubleSide, roughness: 0.75
  }))

  const plates = []
  for (let i = 0; i < platePositions.length; i++) {
    const plate = new THREE.Group()
    plate.name = `routing-floor-plate-${i + 1}`
    plate.position.copy(platePositions[i])

    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 1.35), plateMat.clone())
    slab.receiveShadow = true
    plate.add(slab)

    // Bronze-rimmed enamel centre: the texture is easy to read on the floor.
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.012, 1.14), brassTrimMat)
    trim.position.y = 0.053
    plate.add(trim)
    const inset = new THREE.Mesh(new THREE.BoxGeometry(1.07, 0.014, 1.07), insetMat)
    inset.position.y = 0.064
    plate.add(inset)
    const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), symbolMats[i])
    symbol.rotation.x = -Math.PI / 2
    symbol.position.y = 0.075
    plate.add(symbol)

    group.add(plate)
    // Each plate owns its own emissive surface and icon so completed steps
    // can remain lit independently until the route resets.
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.008, 1.04),
      new THREE.MeshBasicMaterial({ color: 0xffbc54, transparent: true, opacity: 0, depthWrite: false })
    )
    lamp.position.y = 0.073
    plate.add(lamp)
    // Keep the pictogram above its backlight to preserve the icon silhouette.
    symbol.position.y = 0.079
    symbol.material = symbolMats[i].clone()
    plates.push({ plate, slab, symbol, lamp, restingY: plate.position.y, activated: false })
  }

  // Wall relay displays the four-emblem route as a short animated sequence.
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
  labelRail.position.set(0, 0.39, 0.115)
  panel.add(labelRail)

  const panelMarkers = []
  for (let i = 0; i < 4; i++) {
    const mat = symbolMats[i].clone()
    mat.emissiveIntensity = 0.12
    const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), mat)
    symbol.position.set(-0.9 + i * 0.6, -0.05, 0.12)
    panel.add(symbol)
    panelMarkers.push(symbol)
  }

  let progress = 0
  let solved = false
  let occupiedPlate = -1
  let playbackActive = true
  let playbackTime = 0
  let replayCooldown = 0
  let inputStarted = false

  // Move the complete plate assembly (rim, inset and symbol) so it reads as a
  // physical pressure switch instead of only changing its emissive material.
  const plateTravel = 0.055
  const plateResponse = 16

  function setPlateLit(entry, lit, completed = false) {
    entry.activated = lit
    entry.slab.material.emissive.setHex(completed ? 0x136d54 : lit ? 0x9b5e19 : inactiveGlow)
    entry.slab.material.emissiveIntensity = completed ? 1.65 : lit ? 1.25 : 0.12
    entry.symbol.material.emissive.setHex(completed ? solvedSymbolGlow : activatedSymbolGlow)
    entry.symbol.material.emissiveIntensity = lit ? 3.5 : 0.12
    entry.lamp.material.color.setHex(completed ? 0x37f3ad : 0xffbd54)
    entry.lamp.material.opacity = lit ? 0.22 : 0
  }

  const playbackLeadIn = 0.35
  const playbackStepOn = 0.52
  const playbackStepGap = 0.16
  const playbackStepDuration = playbackStepOn + playbackStepGap
  const playbackLoopPause = 0.9
  const playbackCycle = playbackLeadIn + target.length * playbackStepDuration + playbackLoopPause

  let audibleMarker = -1
  function setPanelStep(activeMarker = -1) {
    if (activeMarker !== audibleMarker && activeMarker >= 0 && player?.mesh && player.mesh.position.distanceTo(panel.position) < 10) {
      playSfx('dial', { rate: 0.8 + activeMarker * 0.14, cooldown: 0.12, volume: 0.3 })
    }
    audibleMarker = activeMarker
    panelMarkers.forEach((mesh, index) => {
      mesh.material.emissive.setHex(index === activeMarker ? signalGlow : 0xffffff)
      mesh.material.emissiveIntensity = index === activeMarker ? 1.8 : 0.12
      mesh.scale.setScalar(index === activeMarker ? 1.22 : 1)
    })
  }

  function replay({ resetInput = false } = {}) {
    if (solved || replayCooldown > 0) return
    if (resetInput) resetProgress(false)
    inputStarted = false
    playbackActive = true
    playbackTime = 0
    replayCooldown = 0.35
    setPanelStep(-1)
  }

  const unregisterPanel = interaction.register(panel, {
    prompt: 'Replay routing sequence',
    range: 2.7,
    onInteract: () => {
      playSfx('switch', { volume: 0.4 })
      replay({ resetInput: true })
      interaction?.flashPrompt?.('Sequence replaying')
    }
  })
  unregisters.push(unregisterPanel)

  function resetProgress(showMessage = true) {
    progress = 0
    plates.forEach((entry) => setPlateLit(entry, false))
    if (showMessage) hud?.showToast?.('Wrong pressure plate — routing sequence reset. Replay the wall relay and try again.', 2100)
  }

  function activatePlate(index) {
    if (solved) return
    const expected = target[progress]

    if (index !== expected) {
      playSfx('error', { volume: 0.4 })
      resetProgress(true)
      replay()
      return
    }

    // The first committed step ends the automatic demonstration. Correct
    // intermediate steps deliberately give no green flash or "accepted"
    // message — the player only learns they were right after completing the
    // entire remembered route.
    if (!inputStarted) {
      inputStarted = true
      playbackActive = false
      setPanelStep(-1)
    }
    progress += 1
    setPlateLit(plates[index], true)

    if (progress < target.length) return

    playSfx('objective', { priority: 2 })
    solved = true
    playbackActive = false
    setPanelStep(-1)
    plates.forEach((entry) => setPlateLit(entry, true, true))
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
      const cycleTime = playbackTime % playbackCycle

      if (cycleTime < playbackLeadIn) {
        setPanelStep(-1)
      } else {
        const sequenceTime = cycleTime - playbackLeadIn
        const step = Math.floor(sequenceTime / playbackStepDuration)
        if (step >= 0 && step < target.length) {
          const withinStep = sequenceTime - step * playbackStepDuration
          setPanelStep(withinStep < playbackStepOn ? target[step] : -1)
        } else {
          // Clear pause between complete sequence loops so the four-emblem
          // route has a readable beginning/end rather than becoming a blur.
          setPanelStep(-1)
        }
      }

      if (inputStarted) {
        playbackActive = false
        setPanelStep(-1)
      }
    }

    if (!player?.mesh) return

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

    // Animate the switch independently of puzzle correctness, including after
    // the door unlocks. The plate rises again when the player steps away.
    const blend = 1 - Math.exp(-plateResponse * Math.max(0, delta))
    plates.forEach(({ plate, restingY }, index) => {
      const desiredY = restingY - (inside === index ? plateTravel : 0)
      plate.position.y += (desiredY - plate.position.y) * blend
    })

    if (!solved && inside !== -1 && occupiedPlate !== inside) activatePlate(inside)
    if (occupiedPlate !== inside) playSfx(inside < 0 ? 'switch-release' : 'switch', { key: 'routing-pressure', volume: 0.4 })
    occupiedPlate = inside
  }

  function dispose() {
    unregisters.forEach((unregister) => unregister())
    markerTextures.forEach((texture) => texture.dispose())
    symbolMats.forEach((material) => material.dispose())
    plates.forEach(({ slab, symbol, lamp }) => {
      slab.material.dispose()
      symbol.material.dispose()
      lamp.material.dispose()
    })
    panelMarkers.forEach((marker) => marker.material.dispose())
  }

  return {
    update,
    dispose,
    replay,
    isSolved: () => solved
  }
}

export function createGuardPassage({ scene, interaction, hud, player, respawn, camera, distractionInventory, worldObstacles = [], connectedToPassage3 = false } = {}) {
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
  addPassageShell(group, {
    name: 'guards-exterior',
    minX: ENTRY_X,
    maxX: STAGE3_WALL_X,
    minZ: CORRIDOR_Z - MAIN_WIDTH / 2,
    maxZ: CORRIDOR_Z + MAIN_WIDTH / 2,
    floorY: GUARD_PASSAGE_FLOOR_Y,
    wallHeight: ROOM_HEIGHT,
    skipWest: true,
    skipEast: true
  })
  const ceilingMat = plasterMaterial({ repeat: [16, 2], base: 0x292d31, roughness: 0.98 })
  const ironMat = metalMaterial({ repeat: [10, 2], base: 0x293540, roughness: 0.5, metalness: 0.75 })
  const woodMat = woodMaterial({ repeat: [6, 2], light: 0x5c402c, dark: 0x2b1d15 })
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
          playSfx('error', { volume: 0.35 })
          hud?.showToast?.(`Distractor pouch full — ${sharedInventory.count}/${sharedInventory.max}`, 1300)
          return
        }

        playSfx('pickup', { volume: 0.5 })
        collected = true
        sharedInventory.count += 1
        pickup.visible = false
        unregister?.()
        interaction?.flashPrompt?.(`Distractor collected — ${sharedInventory.count}/${sharedInventory.max}`)
      }
    })
    pickupUnregisters.push(() => unregister?.())
  }

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
    colliderInset: 0.06,
    name: 'guard-passage-cover-a'
  })
  addBox(group, colliders, {
    size: new THREE.Vector3(1.25, 1.25, 0.85),
    position: new THREE.Vector3(worldX(-48.2), GUARD_PASSAGE_FLOOR_Y + 0.625, CORRIDOR_Z + 2.25),
    material: woodMat,
    colliderInset: 0.06,
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

  // Limited-use distraction pickups. These feed a shared inventory used by
  // Passageways 2 and 3; once the player spends them, the throw key does
  // nothing until another physical pickup is collected.
  addDistractorPickup(
    new THREE.Vector3(worldX(-54.8), GUARD_PASSAGE_FLOOR_Y + 0.02, CORRIDOR_Z + 1.9),
    'distractor-pickup-p2-a'
  )
  addDistractorPickup(
    new THREE.Vector3(worldX(-41.1), GUARD_PASSAGE_FLOOR_Y + 0.02, CORRIDOR_Z + 2.0),
    'distractor-pickup-p2-b'
  )
  addDistractorPickup(
    new THREE.Vector3(worldX(-34.2), GUARD_PASSAGE_FLOOR_Y + 0.02, CORRIDOR_Z - 1.9),
    'distractor-pickup-p2-c'
  )

  // Camera/laser combination zone: still forgiving, with a cabinet immediately
  // before the camera and generous safe window on the timed grid.
  addBox(group, colliders, {
    size: new THREE.Vector3(1.2, 1.35, 0.82),
    position: new THREE.Vector3(worldX(-35.0), GUARD_PASSAGE_FLOOR_Y + 0.675, CORRIDOR_Z - 2.45),
    material: ironMat,
    colliderInset: 0.06,
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
    modal: true,
    eyebrow: 'Passageway 2 · Stealth',
    title: 'Guards & Crouching',
    text: 'Yellow vision cones show where guards can see. Watch their patrol before moving. Crouching is slower, but it makes you much harder to detect while crossing exposed ground.',
    controls: [
      { label: 'Crouch / Sneak', action: 'duck' }
    ]
  })
  hints.addZone({
    id: 'crouch-intro',
    center: { x: worldX(-53.4), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 4.0, y: 3.2, z: 6.4 },
    text: () => `Stay low with ${bindingLabel(settings.getBinding('duck'))} when you need to cross a guard's sightline.`,
    duration: 3000
  })
  hints.addZone({
    id: 'distract-intro',
    center: { x: worldX(-45.5), y: GUARD_PASSAGE_FLOOR_Y, z: CORRIDOR_Z },
    size: { x: 5.0, y: 3.2, z: 6.4 },
    modal: true,
    eyebrow: 'Passageway 2 · Stealth',
    title: 'Distractions',
    text: 'Loose metal can pull guards away from your route. Collect a distractor when you find one, then throw it toward open space. Each throw consumes one pickup, so use them deliberately.',
    controls: [
      { label: 'Pick Up', action: 'interact' },
      { label: 'Throw Distractor', action: 'distract' }
    ]
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
    text: 'ROUTING FLOOR — watch the wall relay flash four railway emblems, then step on the matching floor plates in that order. Interact with the relay to replay it.',
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
      obstacles: worldObstacles,
      isEnabled: () => isInsidePassage(),
      hearingRadius: 10,
      inventory: sharedInventory
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

  // Service level in the laser passage's kit (reference 03).
  const kit = getKitMaterials()
  retile(group, [
    [floorMat, kit.concrete, 3],
    [wallMat, kit.brick, 0.46],
    [ceilingMat, kit.ceiling, 3]
  ])
  dressWalls(group, { walls: [kit.brick], finish: 'wood', name: 'guards-wall-dressing' })
  dressGuardPassage(group, colliders)

  function dispose() {
    signalPuzzle.dispose()
    pickupUnregisters.forEach((unregister) => unregister())
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

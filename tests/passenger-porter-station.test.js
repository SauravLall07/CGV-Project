import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createServiceTrolley, trolleyNoiseRadius, TROLLEY_HALF_Z, CLATTER_RADIUS, RELEASE_RADIUS } from '../src/levels/heist-trolley.js'
import { createStealthSystem } from '../src/systems/stealth.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createMovingHeistLevel } from '../src/levels/moving-heist.js'
import {
  localInteriorBoxes, passengerBooths, passengerCabinetLocal, passengerLoungeRuns, PASSENGER_STOWAGE
} from '../src/environment/carriage-bounds.js'

const ZONE = { minX: -1.2, maxX: 1.2, minZ: -10, maxZ: 10 }

// Grab from `at`, let the step up to the bar finish, and return where the
// player now stands (as the level holds them).
function takeHold(trolley, at) {
  trolley.grab(at)
  const hand = at.clone()
  for (let i = 0; i < 20; i++) {
    trolley.holdPosition(hand)
    trolley.update(1 / 60, { playerPosition: hand })
  }
  return hand
}

// Walk the held trolley at (vx, vz) m/s, holding the player to it the way
// the level does. Returns every event.
function push(trolley, hand, vx, vz, seconds, circles = []) {
  const events = []
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    hand.x += vx / 60
    hand.z += vz / 60
    events.push(...trolley.update(1 / 60, { playerPosition: hand, circles }))
    trolley.holdPosition(hand)
  }
  return events
}

function hudStub(messages = []) {
  return new Proxy({ showToast: (message) => messages.push(message) }, {
    get: (target, key) => target[key] ?? (() => {})
  })
}

function installCanvasStub() {
  const pixels = (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })
  const context = new Proxy({
    createImageData: pixels,
    getImageData: (_x, _y, width, height) => pixels(width, height),
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => target[key] ?? (() => {}) })
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {} })
  }
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
}

test('Trolley: grabbing steps up to a bar, then the pair steers the way the player walks', () => {
  const trolley = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  trolley.grab(new THREE.Vector3(0.1, 0, -1.2))
  assert.equal(trolley.playerBox.enabled, false, 'the player must not collide with the trolley they are holding')
  assert.equal(trolley.isSettling(), true)
  const stance = trolley.holdPosition(new THREE.Vector3())
  assert.ok(Math.abs(stance.x) < 1e-9, 'the player squares up behind the bar')
  assert.ok(stance.z < -TROLLEY_HALF_Z - 0.2 && stance.z > -1.2)
  const { left, right } = trolley.getGrip()
  assert.ok(left.x > 0 && right.x < 0, 'one hand either side, left on the player\'s left')
  assert.ok(left.z > 0 && left.z < 0.6, 'the bar is just ahead, within reach')

  const hand = takeHold(trolley, new THREE.Vector3(0.1, 0, -1.2))
  assert.ok(trolley.group.position.length() < 1e-9, 'it waits while the player steps up')

  assert.ok(Math.abs(trolley.getGrabYaw()) < 1e-9, 'the player faces the handle they grabbed (+Z)')

  // Straight ahead: a plain push, no turn.
  push(trolley, hand, 0, 1, 0.5)
  assert.ok(Math.abs(trolley.getYaw()) < 1e-9)
  assert.ok(trolley.group.position.z > hand.z + 0.7)

  // Walk left (+X): the pair swings round until the trolley leads that way.
  push(trolley, hand, 1, 0, 1.5)
  assert.ok(Math.abs(trolley.getGrabYaw() - Math.PI / 2) < 0.05, `heading ${trolley.getGrabYaw().toFixed(2)}`)
  assert.ok(Math.abs(trolley.getYaw() - Math.PI / 2) < 0.05, 'the trolley itself turns to face left')
  assert.ok(Math.abs(trolley.group.rotation.y - trolley.getYaw()) < 1e-9)
  assert.ok(trolley.group.position.x > hand.x + 0.7 && Math.abs(trolley.group.position.z - hand.z) < 0.1,
    'it leads the way, the player behind it')

  // Back up: it is pulled straight back and keeps its heading.
  const heading = trolley.getGrabYaw()
  push(trolley, hand, -1, 0, 0.5)
  assert.ok(Math.abs(trolley.getGrabYaw() - heading) < 1e-9, 'pulling does not turn it round')

  // Against the aisle edge it stops — turned, its long side now spans the
  // aisle — and holds the player back with it.
  push(trolley, hand, 3, 0, 2)
  const halfAcross = Math.abs(Math.cos(trolley.getYaw())) * 0.31 + Math.abs(Math.sin(trolley.getYaw())) * TROLLEY_HALF_Z
  assert.ok(Math.abs(trolley.group.position.x - (ZONE.maxX - halfAcross)) < 1e-6)
  assert.ok(trolley.group.position.x - hand.x > 0.7)
  trolley.release()
  assert.equal(trolley.playerBox.enabled, true)

  // From the side, the hands go on the gallery rail instead.
  const side = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  const at = takeHold(side, new THREE.Vector3(-1, 0, 0.05))
  assert.ok(at.x < -0.31 - 0.18 && Math.abs(at.z) < 1e-9)
  assert.ok(Math.abs(side.getGrabYaw() - Math.PI / 2) < 1e-9)
  assert.equal(side.getYaw(), 0, 'held by the side, it pushes broadside on')
  // Where the stance is blocked, the player holds on from where they stand.
  const blocked = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  blocked.grab(new THREE.Vector3(0, 0, -1.3), () => false)
  assert.equal(blocked.isSettling(), false)
  assert.ok(Math.abs(blocked.holdPosition(new THREE.Vector3()).z + 1.3) < 1e-9)
})

test('Trolley: the lounge lets it reach the wall, and a shove into that wall clatters', () => {
  const aisle = { minX: -1.2, maxX: 1.2, minZ: -10, maxZ: 10 }
  const lounge = { minX: -2.5, maxX: 2.5, minZ: 2, maxZ: 5 }
  const trolley = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [aisle, lounge] })
  const hand = takeHold(trolley, new THREE.Vector3(0, 0, -0.8))
  // Left in the aisle: it turns to lead that way, and the booths stop it.
  push(trolley, hand, 2, 0, 2)
  assert.ok(Math.abs(trolley.getYaw() - Math.PI / 2) < 0.05)
  assert.ok(Math.abs(trolley.group.position.x - (aisle.maxX - TROLLEY_HALF_Z)) < 0.02, 'in the aisle, the booths stop it')
  // Forward into the lounge, then left again: there, it reaches the wall.
  for (let i = 0; i < 600 && trolley.group.position.z < 3.6; i++) push(trolley, hand, 0, 2, 1 / 60)
  push(trolley, hand, 2, 0, 2)
  assert.ok(Math.abs(trolley.group.position.x - (lounge.maxX - TROLLEY_HALF_Z)) < 0.02, 'in the lounge, it reaches the wall')

  // Back off, then shove it at the wall and let go.
  push(trolley, hand, -2, 0, 0.5)
  push(trolley, hand, 2, 0, 0.25)
  trolley.release()
  const events = []
  for (let i = 0; i < 90; i++) events.push(...trolley.update(1 / 60, { playerPosition: hand }))
  assert.ok(events.some((event) => event.kind === 'clatter'), 'the wall rings it like a bell')
})

test('Trolley: let go while moving, it rolls on, slows to a stop and clatters off a wheel stop', () => {
  const trolley = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  const hand = takeHold(trolley, new THREE.Vector3(0, 0, -0.8))
  push(trolley, hand, 0, 3, 0.5)
  const releasedAt = trolley.group.position.z
  trolley.release()
  assert.ok(trolley.getVelocity().z > 2.5, 'pushing hands the trolley the player\'s speed')
  for (let i = 0; i < 600; i++) trolley.update(1 / 60, { playerPosition: hand })
  assert.ok(trolley.group.position.z > releasedAt + 2, 'a shove carries it on')
  assert.equal(trolley.getSpeed(), 0, 'rolling friction stops it')

  // A hard shove into the front stop rattles it, loudly.
  const fast = createServiceTrolley({ position: new THREE.Vector3(0, 0, 7), zones: [ZONE] })
  const pusher = takeHold(fast, new THREE.Vector3(0, 0, 6.2))
  push(fast, pusher, 0, 4, 1 / 3)
  fast.release()
  const events = []
  for (let i = 0; i < 120; i++) events.push(...fast.update(1 / 60, {}))
  const clatter = events.find((event) => event.kind === 'clatter')
  assert.ok(clatter, 'striking a wheel stop at speed is a clatter')
  assert.equal(clatter.radius, CLATTER_RADIUS)
  assert.ok(fast.group.position.z <= ZONE.maxZ - TROLLEY_HALF_Z + 1e-9)
  assert.ok(fast.getVelocity().z <= 0, 'it bounces back off the stop')
})

test('Trolley: held it is quiet, letting go rattles, and it keeps rattling while it rolls on', () => {
  assert.ok(trolleyNoiseRadius(1) < trolleyNoiseRadius(2.4))
  assert.ok(trolleyNoiseRadius(2.4) < trolleyNoiseRadius(4))
  assert.ok(trolleyNoiseRadius(20) <= 11)

  const trolley = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  const hand = takeHold(trolley, new THREE.Vector3(0, 0, -0.8))
  const held = push(trolley, hand, 0, 2.4, 2).filter((event) => event.type === 'noise')
  assert.deepEqual(held, [], 'nobody hears a trolley being guided by hand')

  trolley.release()
  const after = []
  for (let i = 0; i < 60; i++) after.push(...trolley.update(1 / 60, { playerPosition: hand }))
  assert.equal(after[0]?.kind, 'release', 'the rattle comes the moment the hands come off')
  assert.equal(after[0].radius, RELEASE_RADIUS)
  assert.ok(after.some((event) => event.kind === 'roll'), 'rolling on is heard too')

  // Let go standing still: still a rattle, and nothing more.
  const still = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  const at = takeHold(still, new THREE.Vector3(0, 0, -0.8))
  still.release()
  const settled = []
  for (let i = 0; i < 60; i++) settled.push(...still.update(1 / 60, { playerPosition: at }))
  assert.deepEqual(settled.map((event) => event.kind), ['release'])

  // Pull back (toward the player), then let go: no rolling into them.
  const pulled = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  const puller = takeHold(pulled, new THREE.Vector3(0, 0, -0.8))
  push(pulled, puller, 0, -2, 1 / 3)
  pulled.release()
  const before = pulled.group.position.z
  pulled.update(1 / 60, { playerPosition: puller })
  assert.equal(pulled.group.position.z, before)
})

test('Trolley: shoving a held trolley into a guard reports a ram, an unattended one just stops', () => {
  const guard = { x: 0, z: 2, radius: 0.4 }
  const trolley = createServiceTrolley({ position: new THREE.Vector3(0, 0, 0), zones: [ZONE] })
  const hand = takeHold(trolley, new THREE.Vector3(0, 0, -0.8))
  const rammed = push(trolley, hand, 0, 2, 1, [guard]).some((event) => event.type === 'ram')
  assert.ok(rammed)
  assert.ok(trolley.group.position.z + TROLLEY_HALF_Z <= guard.z - guard.radius + 0.05, 'it never moves into the guard')

  trolley.reset()
  const shove = takeHold(trolley, new THREE.Vector3(0, 0, -0.8))
  push(trolley, shove, 0, 3, 1 / 6)
  trolley.release()
  for (let i = 0; i < 120; i++) {
    const events = trolley.update(1 / 60, { circles: [guard] })
    assert.ok(!events.some((event) => event.type === 'ram'), 'only a held trolley can ram')
  }
  assert.equal(trolley.getSpeed(), 0)
  assert.ok(trolley.group.position.z + TROLLEY_HALF_Z <= guard.z - guard.radius + 0.05)
})

function makeStealth({ obstacles = [], waypoints }) {
  const scene = new THREE.Scene()
  const player = createPlayer()
  const failures = []
  const stealth = createStealthSystem({
    scene, player, hud: hudStub(), obstacles,
    respawn: { fail: (reason) => failures.push(reason) }
  })
  const guard = stealth.addGuard({ waypoints, speed: 1.2, waitTime: 0.5 })
  return { scene, player, stealth, guard, failures }
}

test('Stealth: a hidden player is invisible to a guard staring straight at them', () => {
  const { player, stealth, guard, failures } = makeStealth({
    waypoints: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.01)]
  })
  guard.facing = 0
  player.setPose(new THREE.Vector3(0, 0, 1.2))
  stealth.setPlayerHidden(true)
  for (let i = 0; i < 240; i++) stealth.update(1 / 60)
  assert.equal(stealth.getSuspicion(), 0)
  assert.equal(failures.length, 0)
  assert.notEqual(guard.state, 'ALERT', 'hidden inside arm\'s reach is still hidden')

  stealth.setPlayerHidden(false)
  stealth.update(1 / 60)
  assert.equal(guard.state, 'ALERT', 'stepping out next to him is not')
  stealth.dispose()
})

test('Stealth: a patrol blocked across the aisle turns back instead of walking into it forever', () => {
  const blocker = { minX: -1, maxX: 1, minZ: 4, maxZ: 5 }
  const { stealth, guard } = makeStealth({
    obstacles: [blocker],
    waypoints: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10)]
  })
  // 4 m at 1.2 m/s, half a second stuck, a pause and a turn: by 7 s he is
  // well on his way back.
  let furthest = 0
  for (let i = 0; i < 60 * 7; i++) {
    stealth.update(1 / 60)
    furthest = Math.max(furthest, guard.group.position.z)
  }
  assert.ok(furthest <= blocker.minZ + 1e-6, 'he never passes the blockage')
  assert.ok(guard.group.position.z < 3, 'he has turned back toward the other end of his beat')
  assert.equal(guard.targetIdx, 0)
  stealth.dispose()
})

test('Stealth: a guard checking a noise by the wall stands facing the wall', () => {
  // Coming down the aisle from in front, as the conductor does.
  const { stealth, guard } = makeStealth({
    waypoints: [new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -6)]
  })
  stealth.investigate(new THREE.Vector3(2.2, 0, 1), { radius: 8, duration: 5, standAt: new THREE.Vector3(0.95, 0, 1) })
  for (let i = 0; i < 60 * 5; i++) stealth.update(1 / 60)
  assert.equal(guard.state, 'INVESTIGATE')
  assert.ok(guard.group.position.distanceTo(new THREE.Vector3(0.95, 0, 1)) < 0.15, 'he looks from where he was sent')
  assert.ok(guard.investigateFaced)
  assert.ok(Math.abs(guard.scanBase - Math.PI / 2) < 0.08, 'square on to the wall')
  assert.ok(Math.cos(guard.facing - Math.PI / 2) > Math.cos(Math.PI / 2.8) - 1e-6,
    'his look-round never reaches the far side of the car')
  stealth.dispose()
})

test('Stealth: a noise only draws guards within its hearing radius', () => {
  const { stealth, guard } = makeStealth({
    waypoints: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.01)]
  })
  // Six metres away: inside the old blanket lure range, outside earshot.
  assert.equal(stealth.investigate(new THREE.Vector3(0, 0, -6), { radius: 4, duration: 3 }), 0)
  for (let i = 0; i < 30; i++) stealth.update(1 / 60)
  assert.equal(guard.state, 'PATROL')

  assert.equal(stealth.investigate(new THREE.Vector3(0, 0, -6), { radius: 8, duration: 1 }), 1)
  assert.equal(guard.state, 'INVESTIGATE')
  for (let i = 0; i < 60 * 12; i++) stealth.update(1 / 60)
  assert.equal(guard.state, 'PATROL', 'he looks for a while, then goes back to his route')
  stealth.dispose()
})

test('Player: a movement constraint can hold, slow and turn the player, and setPose clears it', () => {
  const player = createPlayer()
  player.setPose(new THREE.Vector3())
  const tick = () => player.update(0.5, { keyboard: { forward: true }, cameraYaw: 0 })
  player.setMovementConstraint({ locked: true })
  tick()
  assert.equal(player.mesh.position.z, 0)

  player.setMovementConstraint({ speedScale: 0.5, faceYaw: Math.PI })
  tick()
  assert.ok(Math.abs(player.mesh.position.z - 1) < 1e-9, 'half of the 4 m/s walk')
  assert.ok(Math.abs(player.mesh.rotation.y - Math.PI) < 1e-9, 'the body keeps facing the trolley')

  player.setPose(new THREE.Vector3())
  tick()
  assert.ok(Math.abs(player.mesh.position.z - 2) < 1e-9)
})

test('Passenger layout: the porter\'s bays swap their booth for luggage and a cabinet', () => {
  const half = 10
  const boxes = localInteriorBoxes('passenger', half)
  const cabinets = boxes.filter((box) => box.kind === 'cabinet')
  const luggage = boxes.filter((box) => box.kind === 'luggage')
  assert.equal(cabinets.length, 1)
  assert.equal(luggage.length, 3, 'two piles and an under-window trunk, on the booth footprint')
  const { z: cabinetZ, s: cabinetSide } = passengerCabinetLocal(half)
  assert.ok(cabinets[0].minX > 0 === cabinetSide > 0)
  assert.ok(cabinets[0].minZ < cabinetZ && cabinets[0].maxZ > cabinetZ)
  const seatsOnCabinetSide = boxes.filter((box) => box.kind === 'seat' &&
    Math.sign(box.minX) === cabinetSide && box.minZ < cabinetZ + 1.5 && box.maxZ > cabinetZ - 1.5)
  assert.equal(seatsOnCabinetSide.length, 0, 'no bench is left inside the cabinet')
  for (const run of passengerLoungeRuns(half)) {
    const blocking = boxes.filter((box) => Math.sign(box.minX + box.maxX) === run.s &&
      box.minZ < run.maxZ - 0.01 && box.maxZ > run.minZ + 0.01)
    assert.deepEqual(blocking, [], `the lounge is open floor along the ${run.s > 0 ? '+X' : '-X'} wall`)
  }
  const open = PASSENGER_STOWAGE.filter((bay) => bay.kind === 'lounge').length
  assert.ok(open >= 5, 'most of the booths in his beat are gone')
  assert.ok(passengerLoungeRuns(half).some((run) => run.maxZ - run.minZ > 6), 'long enough to slide the trolley along')
})

function buildLevel() {
  installCanvasStub()
  const scene = new THREE.Scene()
  const player = createPlayer()
  player.setPose(new THREE.Vector3())
  const messages = []
  const hud = hudStub(messages)
  const time = createTimeSystem({ scene, player, hud })
  const interactions = new Map()
  const failures = []
  let mode = 'third'
  const camera = {
    snap() {}, setYaw() {}, getYaw: () => 0,
    getMode: () => mode,
    setMode: (next) => { mode = next }
  }
  const level = createMovingHeistLevel({
    scene, player, hud, timeSystem: time, camera, advance() {},
    respawn: { setCheckpoint() {}, fail: (reason) => failures.push(reason) },
    interaction: {
      register(_object, options) {
        interactions.set(options.prompt, options)
        return () => interactions.delete(options.prompt)
      },
      registerBlocker: () => () => {},
      flashPrompt() {}
    }
  })
  let elapsed = 0
  function tick(seconds, keyboard = null) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      elapsed += 1 / 60
      time.update(1 / 60, elapsed)
      level.update(1 / 60)
      player.update(1 / 60, { keyboard: keyboard ?? {}, cameraYaw: 0, bounds: level.bounds, obstacles: level.obstacles })
    }
  }
  function dispose() {
    level.dispose()
    time.dispose()
    delete globalThis.document
    delete globalThis.window
  }
  return { scene, player, level, interactions, failures, messages, tick, dispose, getMode: () => mode }
}

test('Level 2 Passenger: pushing the trolley lures the conductor to it while the cabinet hides the player', () => {
  const { scene, player, level, interactions, failures, tick, dispose, getMode } = buildLevel()
  try {
    const trolley = scene.getObjectByName('service-trolley')
    const home = trolley.position.clone()
    const [conductor] = level.getGuards()
    assert.ok(conductor, 'Level 2 exposes the conductor')
    const beat = conductor.waypoints.map((point) => point.z)
    const cabinetZ = scene.getObjectByName('luggage-cabinet').position.z
    assert.ok(cabinetZ > Math.min(...beat) && cabinetZ < Math.max(...beat), 'he walks past the cabinet every lap')
    // Let the conductor start his beat.
    player.mesh.position.set(home.x, 0, home.z - 0.8)
    tick(0.1)

    // E takes hold; the prompt then offers to let go.
    interactions.get('Push trolley').onInteract()
    assert.ok(interactions.has('Let go of trolley') && !interactions.has('Push trolley'))
    assert.equal(interactions.get('Let go of trolley').keepFocus(), true, 'held, it keeps focus wherever you look')
    tick(0.2)
    const stance = player.mesh.position.clone()
    tick(0.6, { forward: true })
    assert.ok(trolley.position.z > home.z + 0.6, 'the trolley moves with the player')
    assert.ok(player.mesh.position.z - stance.z < 0.6 * 4 * 0.45 + 0.05, 'pushing is slower than walking')
    assert.equal(conductor.state, 'PATROL', 'guided by hand, the trolley does not draw him')
    // E again lets go.
    interactions.get('Let go of trolley').onInteract()
    assert.ok(interactions.has('Push trolley') && !interactions.has('Let go of trolley'))
    tick(1 / 60)
    assert.equal(conductor.state, 'INVESTIGATE', 'letting go rattles it, and he comes to look')
    assert.equal(scene.getObjectByName('guard-mark-investigate').visible, true)

    // Duck into the cabinet before he arrives; he looks round and goes back.
    interactions.get('Hide in luggage cabinet').onInteract()
    assert.equal(getMode(), 'first', 'hiding looks out through the louvres')
    const inside = player.mesh.position.clone()
    tick(10, { forward: true })
    assert.deepEqual(failures, [], 'nobody sees into the cabinet')
    assert.ok(player.mesh.position.distanceTo(inside) < 1e-9, 'a hidden player stays put')
    assert.equal(conductor.state, 'PATROL', 'having found nothing he returns to his route')

    interactions.get('Step out of the cabinet').onInteract()
    assert.equal(getMode(), 'third', 'stepping out restores the view the player chose')
    assert.ok(interactions.has('Hide in luggage cabinet'))
    assert.ok(player.mesh.position.x < inside.x, 'the player is back in the aisle')

    // Respawning puts the porter's station back as it was.
    level.checkpoint.restore()
    assert.ok(trolley.position.distanceTo(home) < 1e-9)
  } finally {
    dispose()
  }
})

test('Level 2 Passenger: the trolley cannot be pushed out of the car or into the vestibule', () => {
  const { scene, player, level, interactions, tick, dispose } = buildLevel()
  try {
    const passenger = level.getCarriageVolumes().find((volume) => volume.key === 'passenger')
    const trolley = scene.getObjectByName('service-trolley')
    // Freeze the conductor's beat out of the way so this is only about the aisle.
    const [conductor] = level.getGuards()
    conductor.group.position.set(2.2, 0, passenger.maxZ - 3)
    conductor.waypoints.forEach((point) => point.copy(conductor.group.position))
    player.mesh.position.set(trolley.position.x, 0, trolley.position.z - 0.8)
    interactions.get('Push trolley').onInteract()
    tick(12, { forward: true, run: true })
    assert.ok(trolley.position.z + TROLLEY_HALF_Z <= passenger.maxZ - 1.4 + 1e-6, 'a wheel stop keeps the doorway clear')
    assert.ok(player.mesh.position.z < trolley.position.z - TROLLEY_HALF_Z, 'the player is held behind it')
    interactions.get('Let go of trolley').onInteract()
    tick(1, { forward: true })
    assert.ok(player.mesh.position.z > trolley.position.z - TROLLEY_HALF_Z - 0.5, 'letting go frees the player')
  } finally {
    dispose()
  }
})

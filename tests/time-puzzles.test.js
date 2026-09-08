import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createTimeGhost } from '../src/entities/time-ghost.js'
import { createMovingHeistLevel } from '../src/levels/moving-heist.js'
import { createPlayer } from '../src/entities/player.js'

function setup() {
  const scene = new THREE.Scene()
  const player = createPlayer()
  player.setPose(new THREE.Vector3())
  const messages = []
  const hud = new Proxy({ showToast: (message) => messages.push(message) }, {
    get: (target, key) => target[key] ?? (() => {})
  })
  const time = createTimeSystem({ scene, player, hud })
  let elapsed = 0
  function tick(seconds, fps = 60, level = null, keyboard = null) {
    const frames = Math.round(seconds * fps)
    for (let i = 0; i < frames; i++) {
      elapsed += 1 / fps
      time.update(1 / fps, elapsed)
      level?.update(1 / fps)
      if (keyboard) player.update(1 / fps, {
        keyboard, cameraYaw: 0, bounds: level.bounds, obstacles: level.obstacles
      })
    }
  }
  return { scene, player, hud, messages, time, tick }
}

test('rewind restores the same amount of history at 10, 30, 60 and 144 FPS', () => {
  for (const fps of [10, 30, 60, 144]) {
    const { time, tick } = setup()
    let position = 0
    time.register(null, {
      onUpdate: (delta) => { position += delta },
      getSnapshot: () => ({ position }),
      restoreSnapshot: (snapshot) => { position = snapshot.position }
    })
    tick(4, fps)
    time.triggerRewind()
    tick(1, fps)
    assert.ok(Math.abs(position - 1.5) < 0.1, `${fps} FPS restored to ${position}`)
    time.dispose()
  }
})

test('ghost holds its endpoint, presses only pads at its feet, then releases', () => {
  const ghost = createTimeGhost()
  const pad = new THREE.Vector3(-0.56, 0.03, 10)
  let completed = 0
  ghost.startReplay([
    { time: 0, position: new THREE.Vector3(0, 0, 8), rotationY: 0 },
    { time: 1, position: new THREE.Vector3(-0.56, 0, 10), rotationY: 0 }
  ], { onComplete: () => completed++ })
  ghost.update(1.1)
  assert.equal(ghost.isPlaying(), true)
  assert.equal(ghost.isOccupying(pad, 0.6), true)
  assert.equal(ghost.isOccupying(new THREE.Vector3(-0.56, -3, 10), 0.6), false)
  ghost.update(7)
  assert.equal(ghost.isOccupying(pad, 0.6), true)
  ghost.update(1)
  assert.equal(ghost.isOccupying(pad, 0.6), false)
  assert.equal(completed, 1)
  ghost.dispose()
})

test('summoning uses the current pad position and resetting clears old echoes', () => {
  const { time, tick, player } = setup()
  tick(1)
  player.mesh.position.set(0.5, 0, 2)
  time.triggerGhost()
  tick(1.2)
  assert.equal(time.getGhost().isOccupying(new THREE.Vector3(0.5, 0.03, 2), 0.6), true)
  time.resetGhost()
  assert.equal(time.getGhost().isPlaying(), false)
  time.triggerGhost()
  assert.equal(time.getGhost().isPlaying(), false)
  time.dispose()
})

test('a ghost summoned at the corner of a pad anchors immediately without movement history', () => {
  const { time, player, tick } = setup()
  const pad = new THREE.Vector3(0, 0.03, 0)
  const unregister = time.registerGhostPad(pad, 0.54)
  player.mesh.position.set(0.5, 0, 0.5)
  time.triggerGhost()
  assert.equal(time.getGhost().isOccupying(pad, 0.54), true)
  player.mesh.position.set(3, 0, 3)
  tick(1)
  assert.equal(time.getGhost().isOccupying(pad, 0.54), true)
  unregister()
  time.resetGhost()
  player.mesh.position.set(0.5, 0, 0.5)
  time.triggerGhost()
  assert.equal(time.getGhost().isPlaying(), false, 'disposed pads must not accept new anchors')
  time.dispose()
})

// Canvas drawing is irrelevant to these simulation tests. Keep the actual
// level, geometry, time system and pad/clamp logic; stub only browser drawing.
function installCanvasStub() {
  const pixels = (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })
  const context = new Proxy({
    createImageData: pixels,
    getImageData: (_x, _y, width, height) => pixels(width, height),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => target[key] ?? (() => {}) })
  globalThis.document = { createElement: () => ({ getContext: () => context }) }
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
}

test('Mechanical: plank starts fallen, rollback repairs it, and an anchored ghost lifts the block for traversal', () => {
  installCanvasStub()
  const { scene, player, hud, messages, time, tick } = setup()
  const failures = []
  const level = createMovingHeistLevel({
    scene, player, hud, timeSystem: time,
    interaction: { register: () => () => {}, flashPrompt() {} },
    camera: { snap() {} },
    respawn: { setCheckpoint() {}, fail: (reason) => failures.push(reason) },
    advance() {}
  })
  time.setAbilityAvailability({})
  const plank = scene.getObjectByName('mechanical-rewind-plank')
  const padA = scene.getObjectByName('mechanical-sync-pad-a')
  const padB = scene.getObjectByName('mechanical-sync-pad-b')
  const clamp = scene.getObjectByName('mechanical-drive-clamp')
  const block = scene.getObjectByName('mechanical-pad-block')
  assert.equal(scene.getObjectByName('guard-shielded'), undefined)
  assert.equal(plank.position.y, -3.2, 'the plank must start down in the pit')
  assert.equal(block.position.y, 0.75, 'the pad block must start closed')

  scene.updateMatrixWorld(true)
  const floor = scene.getObjectByName('floor-mechanical')
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, plank.position.z), new THREE.Vector3(0, -1, 0))
  assert.equal(ray.intersectObject(floor).length, 0, 'the floor must have a real opening over the fallen plank')
  ray.ray.origin.z -= 2
  assert.ok(ray.intersectObject(floor).length > 0, 'the approach floor must remain intact')

  // Rewinding from another carriage must not solve Mechanical prematurely.
  player.mesh.position.set(0, 0, plank.position.z - 7)
  tick(1, 60, level)
  time.triggerRewind()
  tick(0.2, 60, level)
  assert.equal(plank.position.y, -3.2)
  time.setMode('NORMAL')
  player.mesh.position.z = plank.position.z - 4
  tick(15, 60, level)
  assert.equal(plank.position.y, -3.2, 'waiting or retreating must not restore the plank')

  time.triggerRewind()
  tick(0.4, 60, level)
  assert.ok(plank.position.y > -3.2 && plank.position.y < 0, 'rollback must visibly lift the plank')
  time.setMode('NORMAL')
  const partialY = plank.position.y
  tick(2, 60, level)
  assert.equal(plank.position.y, partialY, 'interrupted rollback must keep its progress')
  time.triggerRewind()
  tick(0.6, 60, level)
  assert.equal(plank.position.y, 0.06, 'rollback must restore the whole plank')
  time.setMode('NORMAL')
  tick(2, 60, level)
  assert.equal(plank.position.y, 0.06, 'the restored plank must not immediately collapse again')
  const failuresBeforeCrossing = failures.length
  player.mesh.position.z = plank.position.z
  tick(0.5, 60, level)
  assert.equal(failures.length, failuresBeforeCrossing, 'crossing the restored plank should be safe')

  // A closed block has collision rather than a checkpoint-failure trigger.
  player.mesh.position.set(0, 0, block.position.z - 1)
  tick(0.5, 60, level, { forward: true })
  assert.ok(player.mesh.position.z <= block.position.z - 0.47)

  // Step onto A and summon right away: no five-second stationary recording.
  player.mesh.position.copy(padA.position).setY(0)
  tick(0.1, 60, level)
  assert.ok(clamp.position.y < 1.1, 'one weighted pad must not release the clamp')
  assert.ok(block.position.y > 0.75, 'the pad must immediately start lifting the visible block')
  time.triggerGhost()
  assert.equal(time.getGhost().isOccupying(padA.position, 0.54), true)
  const failuresBeforePads = failures.length
  tick(1.5, 60, level, { forward: true })
  assert.ok(player.mesh.position.z > block.position.z + 0.48, 'the player must walk through the raised block')
  tick(0.28, 60, level, { left: true })
  tick(1, 60, level)
  assert.equal(failures.length, failuresBeforePads, 'crossing the pad block must not respawn the player')
  assert.ok(clamp.position.y > 3, 'ghost and player together must release the clamp')
  assert.ok(messages.some((message) => message.startsWith('DRIVE CLAMP RELEASED')))
  tick(13, 60, level)
  assert.equal(time.getGhost().isPlaying(), false)
  assert.ok(clamp.position.y > 3, 'the released clamp must remain open after the echo fades')
  level.dispose()
  time.dispose()
  delete globalThis.document
  delete globalThis.window
})

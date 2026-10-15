import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createRespawnSystem } from '../src/systems/respawn.js'

function levelHarness(fps = 60) {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
  const scene = new THREE.Scene()
  const player = createPlayer()
  const messages = []
  const hud = new Proxy({ showToast: (message) => messages.push(message) }, {
    get: (target, key) => target[key] ?? (() => {})
  })
  const time = createTimeSystem({ scene, player, hud })
  const respawn = createRespawnSystem({ player, hud, timeSystem: time, camera: { snap() {} } })
  const interactions = new Map()
  const level = createTimewreckLevel({ scene, player, hud, timeSystem: time, respawn,
    interaction: { register: (object, options) => { interactions.set(object.name, options); return () => interactions.delete(object.name) }, registerBlocker: () => () => {}, flashPrompt() {} },
    camera: { snap() {} }, advance() {}, startCarriage: 'relay'
  })
  player.setPose(level.checkpoint.position, Math.PI)
  respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  const span = level.getCarriageVolumes().find((v) => v.key === 'relay')
  const center = (span.minZ + span.maxZ) / 2
  const doorZ = center - 2.6
  const pad = new THREE.Vector3(0, 0.03, doorZ + 4.6)
  const tick = (seconds, keys = {}) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / fps) {
      const dt = Math.min(1 / fps, seconds - t)
      time.update(dt)
      level.update(dt)
      player.update(dt, { keyboard: keys, cameraYaw: Math.PI, bounds: level.bounds,
        obstacles: level.obstacles, supports: level.supports, voids: level.voids })
    }
  }
  const dispose = () => { respawn.dispose(); level.dispose(); time.dispose() }
  return { scene, player, time, respawn, level, center, doorZ, pad, interactions, tick, dispose, messages }
}


function leafX(h) { return h.scene.getObjectByName('relay-blast-leaf-right').position.x }
function holdFill(h) {
  const bars = h.scene.getObjectByName('relay-echo-hold-bars')
  const matrix = new THREE.Matrix4()
  let fill = 0
  for (let i = 0; i < bars.count; i++) {
    bars.getMatrixAt(i, matrix)
    fill += (matrix.elements[5] - 0.12) / 0.88
  }
  return fill
}
function summon(h) {
  h.player.setPose(h.pad, Math.PI)
  h.tick(0.5)
  h.time.triggerGhost()
  h.tick(0.05)
  assert.ok(h.time.getGhost().isOccupying(h.pad, 0.56))
}

// Walk around the visible cabinet, then return to the centre seam/catch.
// No sprint, crouch, jump, or pose shortcut while the real-time echo runs.
function walkReleasedDoor(h, target = -4.4, run = false) {
  const multiplier = run ? 1.7 : 1
  h.tick(0.175 / multiplier, { right: true, run })
  h.tick(0.9875 / multiplier, { forward: true, run })
  h.tick(0.175 / multiplier, { left: true, run })
  h.tick((-1.95 - target) / (4 * multiplier), { forward: true, run })
}

test('Relay: Ghost holds release while the real player walks to the catch with energy/time margin', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness(fps)
    try {
      assert.equal(leafX(h), 0.75)
      summon(h)
      assert.ok(h.time.getEnergy() >= 64 && h.time.getEnergy() <= 65)
      walkReleasedDoor(h)
      assert.ok(h.time.getGhost().getRemainingSeconds() > 5.9, 'walking detour takes under four seconds of the eight-second hold')
      assert.ok(h.time.getEnergy() < 63, 'holding Ghost continues to drain without recharge')
      assert.ok(h.player.mesh.position.z < h.doorZ - 1, `${fps}: real player crosses`)
      assert.ok(h.player.mesh.position.y >= 0)
      const catchControl = h.interactions.get('relay-manual-catch')
      assert.ok(catchControl.isEligible())
      catchControl.onInteract()
      h.time.triggerGhost() // cancellation cannot undo the catch
      h.tick(9)
      assert.equal(leafX(h), 1.85)
      assert.ok(holdFill(h) > 7.99, 'catch displays durable security after the echo expires')
      assert.ok(h.time.getEnergy() > 95)
      for (let i = 0; i < 3; i++) {
        h.respawn.fail('caught'); h.respawn.cancel(); h.respawn.respawn()
        assert.equal(h.player.mesh.position.z, h.doorZ - 1.8)
        assert.equal(leafX(h), 1.85)
        assert.equal(h.time.getGhost().isPlaying(), false)
        assert.ok(holdFill(h) > 7.99, 'latched feedback survives checkpoint recovery')
      }
    } finally { h.dispose() }
  }
})

test('Relay: closed door blocks walking, wall routes and jumping; catch rejects near-side use', () => {
  const h = levelHarness()
  try {
    const catchControl = h.interactions.get('relay-manual-catch')
    for (const x of [-2, 0, 2]) {
      h.player.setPose(new THREE.Vector3(x, 0, h.doorZ + 0.5), Math.PI)
      catchControl.onInteract()
      h.tick(0.5, { forward: true, run: true, jump: true })
      assert.ok(h.player.mesh.position.z > h.doorZ, 'no shut door bypass')
      assert.equal(leafX(h), 0.75)
    }
  } finally { h.dispose() }
})

test('Relay: occupancy height, cancellation, expiration and pre-catch retries restore a usable release', () => {
  const h = levelHarness()
  try {
    h.player.setPose(h.pad.clone().add(new THREE.Vector3(0, 1, 0)), Math.PI)
    h.tick(0.01)
    assert.equal(leafX(h), 0.75, 'airborne player does not press release')
    const ghost = h.time.getGhost()
    ghost.startReplay([0, 0.001].map(time => ({ time, position: h.pad.clone().add(new THREE.Vector3(0, 1, 0)), rotationY: 0 })))
    h.player.setPose(new THREE.Vector3(0, 0, h.pad.z + 2), Math.PI)
    h.tick(0.1)
    assert.equal(leafX(h), 0.75, 'airborne echo does not press release')
    assert.ok(holdFill(h) < 0.01, 'airborne echo cannot light the occupancy display')
    h.time.resetGhost()
    for (let i = 0; i < 3; i++) {
      summon(h)
      h.player.setPose(new THREE.Vector3(0, 0, h.pad.z + 2), Math.PI)
      h.time.triggerGhost()
      h.tick(0.7)
      assert.equal(leafX(h), 0.75)
      assert.ok(holdFill(h) < 0.01, 'cancelling the echo clears the display')
      h.respawn.fail('caught'); h.respawn.cancel(); h.respawn.respawn()
      assert.ok(h.player.mesh.position.z > h.pad.z)
      assert.equal(leafX(h), 0.75)
      assert.equal(ghost.isPlaying(), false)
      assert.equal(h.time.getGhostCooldown(), 0)
      assert.ok(h.time.getEnergy() >= 50)
    }
    h.tick(4)
    summon(h)
    h.player.setPose(new THREE.Vector3(0, 0, h.pad.z + 2), Math.PI)
    h.tick(7.8)
    assert.ok(ghost.isPlaying(), 'registered pad gives full eight-second hold')
    h.tick(1)
    assert.equal(ghost.isPlaying(), false)
    assert.equal(leafX(h), 0.75)
    assert.ok(holdFill(h) < 0.01, 'expired echo leaves no stale countdown')
    summon(h)
    h.level.dispose()
    assert.equal(ghost.isPlaying(), false, 'teardown cancels outgoing echo')
    assert.equal(h.interactions.size, 0)
    assert.equal(h.scene.getObjectByName('relay-emergency-platform'), undefined)
    h.level = null
  } finally { h.respawn.dispose(); if (h.level) h.level.dispose(); h.time.dispose() }
})


test('Relay: solo sprint cannot outrun the spring door at 30/60/144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness(fps)
    try {
      h.player.setPose(h.pad, Math.PI)
      h.tick(0.5)
      walkReleasedDoor(h, -4.4, true)
      assert.ok(h.player.mesh.position.z > h.doorZ, `${fps}: release needs an echo`)
    } finally { h.dispose() }
  }
})

test('Relay: hold bars and linkage follow real occupancy and echo lifetime through Freeze', () => {
  const h = levelHarness()
  try {
    summon(h)
    assert.ok(holdFill(h) > 7.99, 'physical occupant keeps the release held')
    const linkage = h.scene.getObjectByName('relay-release-linkage')
    assert.equal(linkage.position.y, 0.025)
    h.player.setPose(new THREE.Vector3(0, 0, h.pad.z + 2), Math.PI)
    h.tick(0.1)
    const ghost = h.time.getGhost()
    const remaining = ghost.getRemainingSeconds()
    assert.ok(Math.abs(holdFill(h) - remaining) < 1e-5)
    h.time.triggerFreeze(); h.tick(0.5)
    assert.ok(Math.abs(ghost.getRemainingSeconds() - (remaining - 0.5)) < 1e-6, 'Ghost uses real time during Freeze')
    assert.ok(Math.abs(holdFill(h) - ghost.getRemainingSeconds()) < 1e-5)
    h.time.setMode('NORMAL'); h.tick(3)
    assert.ok(holdFill(h) < 4.5 && holdFill(h) > 4)
    h.time.resetGhost(); h.tick(0.1)
    assert.equal(ghost.getRemainingSeconds(), 0)
    assert.ok(holdFill(h) < 0.01)
    assert.equal(linkage.position.y, 0.04)
    h.respawn.fail('retry'); h.respawn.cancel(); h.respawn.respawn()
    assert.ok(holdFill(h) < 0.01, 'checkpoint restoration clears transient feedback')
  } finally { h.dispose() }
})

test('Relay: depleted energy recovers on safe floor; Ghost works alongside each shared mode', () => {
  const h = levelHarness()
  try {
    h.time.triggerFreeze()
    h.tick(4)
    assert.ok(h.time.getEnergy() < 10)
    h.player.setPose(h.pad, Math.PI)
    h.time.triggerGhost()
    assert.equal(h.time.getGhost().isPlaying(), false)
    h.tick(4)
    assert.ok(h.time.getEnergy() > 50)
    for (const mode of ['SLOW', 'FREEZE', 'REWIND']) {
      h.time.setMode('NORMAL'); h.time.resetGhost(); h.tick(5)
      summon(h)
      h.time.setMode(mode)
      h.tick(0.8, { forward: true })
      assert.ok(leafX(h) > 1.84, `${mode} does not cancel release occupancy`)
      h.time.setMode('NORMAL'); h.time.resetGhost()
      h.player.setPose(new THREE.Vector3(0, 0, h.pad.z + 2), Math.PI)
      h.tick(0.8)
      assert.equal(leafX(h), 0.75)
    }
  } finally { h.dispose() }
})

test('Relay: level teardown unregisters the pad and a fresh restart clears durable progress', () => {
  const h = levelHarness()
  let restarted
  try {
    summon(h)
    walkReleasedDoor(h)
    h.interactions.get('relay-manual-catch').onInteract()
    h.level.dispose()
    h.player.setPose(h.pad, Math.PI)
    h.time.triggerGhost()
    assert.equal(h.time.getGhost().isPlaying(), false, 'disposed pad cannot summon a stationary echo')
    h.time.resetForLevel()
    restarted = createTimewreckLevel({ scene: h.scene, player: h.player, hud: new Proxy({}, { get: () => () => {} }),
      timeSystem: h.time, respawn: h.respawn, camera: { snap() {} }, advance() {}, startCarriage: 'relay',
      interaction: { register: () => () => {}, registerBlocker: () => () => {} }
    })
    h.player.setPose(restarted.checkpoint.position, Math.PI)
    assert.equal(leafX(h), 0.75, 'new run starts with shut, unlatched door')
    assert.equal(h.time.getGhost().isPlaying(), false)
    assert.equal(h.time.getEnergy(), 100)
    h.player.setPose(h.pad, Math.PI)
    h.time.triggerGhost()
    assert.ok(h.time.getGhost().isPlaying(), 'new release registration works')
    const platforms = []
    h.scene.traverse(node => { if (node.name === 'relay-emergency-platform') platforms.push(node) })
    assert.equal(platforms.length, 1)
  } finally { h.respawn.dispose(); restarted?.dispose(); h.time.dispose() }
})


test('Relay: cancellation in the seam cannot crush the player; far-side catch recovers a closed door', () => {
  const h = levelHarness()
  try {
    summon(h)
    walkReleasedDoor(h, -2.6)
    assert.ok(Math.abs(h.player.mesh.position.z - h.doorZ) < 0.2)
    h.time.triggerGhost()
    h.tick(0.6)
    assert.equal(leafX(h), 1.85, 'spring waits while the body occupies the seam')
    assert.equal(h.respawn.isFailing(), false)
    h.tick(0.5, { forward: true })
    h.tick(0.6)
    assert.equal(leafX(h), 0.75)
    h.interactions.get('relay-manual-catch').onInteract()
    assert.equal(leafX(h), 1.85, 'far-side catch prevents a soft lock after losing echo')
  } finally { h.dispose() }
})

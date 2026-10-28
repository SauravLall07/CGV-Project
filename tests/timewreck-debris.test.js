import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDebrisCollision } from '../src/levels/timewreck-debris.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createRespawnSystem } from '../src/systems/respawn.js'

function harness() {
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.55))
  root.add(mesh)
  let crouching = false
  const player = { mesh: new THREE.Group(), isCrouching: () => crouching }
  mesh.position.set(0, 1.5, 0)
  const collision = createDebrisCollision(player, [mesh])
  return { root, mesh, player, collision, crouch(value) { crouching = value },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose() } }
}

test('passenger debris catches fast panels and player crossings at fixed and mixed frame rates', () => {
  for (const schedule of [[1/30], [1/60], [1/144], [1/144, 0.1, 1/30, 1/60]]) {
    const h = harness()
    try {
      h.mesh.position.z = 3
      h.collision.update()
      let hit = false, frame = 0
      for (let t = 0; t < 0.6;) {
        const dt = schedule[frame++ % schedule.length]
        h.mesh.position.z -= dt * 13
        hit ||= h.collision.update()
        t += dt
      }
      assert.ok(hit, `${schedule}: moving panel hits standing player`)
      h.mesh.position.z = 0; h.player.mesh.position.z = 0.9; h.collision.reset()
      assert.equal(h.collision.update(), false)
      h.player.mesh.position.z = -0.9
      assert.equal(h.collision.update(), true, 'player cannot run through a frozen panel between frames')
    } finally { h.dispose() }
  }
})

test('passenger debris uses visible rotated geometry, body height and parent transforms', () => {
  const h = harness()
  try {
    assert.equal(h.collision.update(), true)
    h.crouch(true)
    assert.equal(h.collision.update(), false, 'crouch clears a head-height panel')
    h.crouch(false); h.player.mesh.position.y = 2; h.collision.reset()
    assert.equal(h.collision.update(), false, 'jumping above the panel clears it')
    h.player.mesh.position.set(0.32, 0, 0); h.collision.reset()
    h.mesh.position.y = 1.85; h.mesh.rotation.z = Math.PI / 4
    assert.equal(h.collision.update(), false, 'empty corner of a rotated panel AABB is safe')
    h.root.position.x = 0.32; h.mesh.rotation.z = 0; h.mesh.position.y = 1.5; h.collision.reset()
    assert.equal(h.collision.update(), true, 'collision follows the shaken carriage root')
  } finally { h.dispose() }
})

test('hidden, disabled and recycled debris cannot create phantom swept hits', () => {
  const h = harness()
  try {
    h.root.visible = false
    assert.equal(h.collision.update(), false)
    h.root.visible = true; h.mesh.visible = false
    assert.equal(h.collision.update(), false)
    h.mesh.visible = true
    h.mesh.scale.setScalar(0)
    assert.equal(h.collision.update(), false, 'a fragment waiting at zero scale cannot kill')
    h.mesh.scale.setScalar(1)
    h.mesh.material.transparent = true; h.mesh.material.opacity = 0
    assert.equal(h.collision.update(), false, 'fully faded wreckage cannot kill')
    h.mesh.material.opacity = 1
    assert.equal(h.collision.update(false), false, 'pause, failure and braking can disable hits')
    h.mesh.position.z = 3; h.collision.update()
    h.mesh.position.z = -3; h.collision.reset(h.mesh)
    assert.equal(h.collision.update(), false, 'recycling does not sweep across the entire car')
    h.mesh.position.z = 0; h.player.mesh.position.z = 3; h.collision.reset(); h.collision.update()
    h.player.mesh.position.z = -3
    assert.equal(h.collision.update(), false, 'checkpoint/dev teleports test only the destination')
  } finally { h.dispose() }
})

function levelHarness() {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
  const scene = new THREE.Scene(), player = createPlayer(), messages = []
  const hud = new Proxy({ showCaughtScreen: reason => messages.push(reason) }, { get: (t, k) => t[k] ?? (() => {}) })
  const time = createTimeSystem({ scene, player, hud })
  const respawn = createRespawnSystem({ player, hud, timeSystem: time, camera: { snap() {} } })
  const level = createTimewreckLevel({ debrisSeed: 12345, scene, player, hud, timeSystem: time, respawn, startCarriage: 'passenger',
    interaction: { register: () => () => {}, registerBlocker: () => () => {}, flashPrompt() {} }, camera: { snap() {} }, advance() {} })
  player.setPose(level.checkpoint.position, Math.PI)
  respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  return { scene, player, time, respawn, level, messages,
    dispose() { respawn.dispose(); level.dispose(); time.dispose() } }
}

test('real passenger panels and luggage kill once, splinters stay harmless, and checkpoint retry is safe', () => {
  for (const name of ['passenger-debris-panel', 'passenger-debris-luggage']) {
    const h = levelHarness()
    try {
      const group = h.scene.getObjectByName('thrown-debris')
      const piece = h.scene.getObjectByName(name)
      const splinter = h.scene.getObjectByName('passenger-debris-splinter')
      group.visible = true
      piece.parent.visible = true
      for (const n of [...group.children, ...piece.parent.children]) if (n !== splinter) n.visible = false
      // Time is held: the collision check must still protect a player touching wreckage.
      splinter.position.copy(h.player.mesh.position); splinter.position.y += 1
      h.level.update(0)
      assert.equal(h.respawn.getLives(), 3, 'small splinter is decorative')
      piece.visible = true
      piece.scale.setScalar(1)
      piece.position.copy(h.player.mesh.position); piece.position.y += 1
      h.level.update(0)
      assert.equal(h.respawn.getLives(), 2, name)
      assert.equal(h.respawn.isFailing(), true)
      assert.deepEqual(h.messages, ['debris'])
      h.level.update(0)
      assert.equal(h.respawn.getLives(), 2, 'one impact consumes one life')
      h.respawn.cancel(); h.respawn.respawn(); h.level.update(0)
      assert.equal(h.respawn.isFailing(), false, 'restored checkpoint has no stale contact')
      assert.equal(h.respawn.getLives(), 2)
    } finally { h.dispose() }
  }
})

test('passenger storm debris enters from ahead, grows outside the car and travels towards the player', () => {
  const h = levelHarness()
  try {
    const span = h.level.getCarriageVolumes().find(v => v.key === 'passenger')
    const group = h.scene.getObjectByName('thrown-debris')
    h.player.mesh.position.set(0, 10, span.maxZ - 1.5)
    h.level.update(0)
    assert.ok(group.visible)
    assert.ok(group.children.every(m => m.position.z < span.minZ && m.scale.x === 0),
      'waiting debris stays hidden beyond the far end')
    h.time.update(0.1)
    const moving = group.children.find(m => m.scale.x > 0)
    assert.ok(moving)
    assert.ok(moving.position.z < span.minZ)
    assert.ok(moving.scale.x < 1, 'a new fragment grows into view outside the carriage')
    const z = moving.position.z
    h.time.update(0.1)
    assert.ok(moving.position.z > z, 'passenger wreckage also flies in +Z')
  } finally { h.dispose() }
})

test('real L3 wires brown-panel death and safe checkpoint resets into every carriage', () => {
  const h = levelHarness()
  try {
    const volumes = h.level.getCarriageVolumes()
    for (const key of ['vault', 'convergence', 'mechanical', 'cargo', 'relay', 'security', 'passenger', 'cab']) {
      h.respawn.cancel(); h.respawn.resetLives(); h.respawn.respawn()
      const span = volumes.find(v => v.key === key)
      h.player.setPose(new THREE.Vector3(0, 0, span.maxZ - 1.5), Math.PI)
      h.level.update(0)
      const mesh = h.scene.getObjectByName(`${key}-flying-brown-panel`)
      assert.ok(mesh.visible, `${key}: a real flight is armed on entry`)
      mesh.material.opacity = 1
      mesh.position.copy(h.player.mesh.position); mesh.position.y += 1
      h.level.update(0)
      assert.equal(h.respawn.getLives(), 2, key)
      assert.equal(h.messages.at(-1), 'debris', key)
      h.respawn.cancel(); h.respawn.respawn()
      assert.ok(h.scene.getObjectByName('wreck-flying-panels').children.every(p => !p.visible))
    }
  } finally { h.dispose() }
})

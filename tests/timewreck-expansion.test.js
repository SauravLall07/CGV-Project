import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createExpansionHazards, FREIGHT, STEAM, freightAngle, freightContact } from '../src/levels/timewreck-expansion-hazards.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createRespawnSystem } from '../src/systems/respawn.js'
import { disposeObject } from '../src/core/dispose.js'

const schedules = [30, 60, 144, [1 / 144, 1 / 30, 0.1, 1 / 60]]
function harness(schedule = 60) {
  const scene = new THREE.Scene(), player = createPlayer()
  const time = createTimeSystem({ scene, player }), unregisters = [], failures = [], warnings = []
  const hazards = createExpansionHazards({ root: scene, spans: { cargo: { center: 0 }, mechanical: { center: 30 } },
    player, timeSystem: time, unregisters, fail: m => failures.push(m), warn: kind => warnings.push(kind) })
  let frame = 0
  const pose = (x, z, y = 0) => { player.setPose(new THREE.Vector3(x, y, z), Math.PI); hazards.update(false) }
  function tick(seconds, keyboard = {}, enabled = true) {
    for (let t = 0; t < seconds - 1e-9;) {
      const dt = Math.min(Array.isArray(schedule) ? schedule[frame++ % schedule.length] : 1 / schedule, seconds - t)
      t += dt
      time.update(dt)
      player.update(dt, { keyboard, cameraYaw: Math.PI, bounds: { minX: -2.42, maxX: 2.42, minZ: -20, maxZ: 50 } })
      hazards.update(enabled)
    }
  }
  return { scene, player, time, hazards, failures, warnings, pose, tick,
    dispose() { unregisters.forEach(fn => fn()); time.dispose(); disposeObject(hazards.group) } }
}

test('N2: zero-energy waiting, Slow and Freeze allow real freight traversal at fixed and mixed frame rates', () => {
  for (const fps of schedules) for (const mode of ['NORMAL', 'SLOW', 'FREEZE']) {
    const h = harness(fps)
    try {
      h.pose(0, FREIGHT.offset + 1.1); h.tick(0.01)
      if (mode === 'NORMAL') {
        h.time.triggerFreeze(); h.tick(100 / 28)
        assert.ok(h.time.getEnergy() < 0.01, 'genuinely depleted on safe observation floor')
        h.time.setMode('NORMAL')
      } else h.time.resetForCheckpoint({ energy: 50 })
      // Observe from outside the swept slice; start at a repeatable side pose.
      for (let i = 0; i < 600 && (h.hazards.getState().freightClock < 4.8 || Math.abs(freightAngle(h.hazards.getState().freightClock)) < 0.8); i++) h.tick(1 / 60)
      h.time.setMode(mode)
      h.tick(0.6, { forward: true })
      assert.ok(h.player.mesh.position.z < FREIGHT.offset - 1, `${fps}/${mode}: player clears case`)
      assert.equal(h.failures.length, 0, `${fps}/${mode}: ${h.failures}`)
      assert.ok(h.time.getEnergy() > 0)
    } finally { h.dispose() }
  }
})

test('N2: blocked frozen case stays dangerous; rewind restores real pose, body-height collision and reset phase', () => {
  const h = harness()
  try {
    h.pose(0, FREIGHT.offset + 1); h.tick(0.01); h.tick(FREIGHT.warning + FREIGHT.period / 4)
    h.time.triggerFreeze()
    const snapshot = h.hazards.getState(), pivot = h.scene.getObjectByName('freight-pendulum')
    const angle = pivot.rotation.z
    h.tick(0.3)
    assert.equal(pivot.rotation.z, angle)
    h.tick(0.3, { forward: true })
    assert.ok(h.failures.length > 0)
    assert.ok(freightContact(snapshot.freightClock, 0, 0, 0, 1.85))
    assert.ok(freightContact(snapshot.freightClock, 0, 0, 0, 1.15), 'crouched body still intersects low case')
    assert.equal(freightContact(snapshot.freightClock, 0, 3, 0, 1.85), false)
    assert.equal(freightContact(snapshot.freightClock, 2.42, 0, 0, 1.85), false, 'do not kill the whole aisle')
    h.pose(0, FREIGHT.offset + 1.1)
    h.time.triggerRewind(); h.tick(0.25)
    assert.ok(h.hazards.getState().freightClock < snapshot.freightClock)
    assert.equal(pivot.rotation.z, freightAngle(h.hazards.getState().freightClock))
    h.hazards.reset(); h.time.resetForCheckpoint()
    assert.equal(h.hazards.getState().freightStarted, false)
    assert.equal(pivot.rotation.z, FREIGHT.amplitude)
  } finally { h.dispose() }
})

test('N2: sampled contact catches load/player tunnelling across a frame spike', () => {
  const h = harness([0.1])
  try {
    h.pose(0, FREIGHT.offset + 1.1); h.tick(0.1); h.tick(1.8)
    h.time.triggerFreeze()
    h.tick(0.4, { forward: true, run: true })
    assert.ok(h.player.mesh.position.z < FREIGHT.offset - FREIGHT.halfZ)
    assert.ok(h.failures.length, 'contact detected despite fast travel through the thin slice')
  } finally { h.dispose() }
})

test('N3: observe warning/burst then cross clear jet with Normal/Slow/Freeze at all frame schedules', () => {
  for (const fps of schedules) for (const mode of ['NORMAL', 'SLOW', 'FREEZE']) {
    const h = harness(fps)
    try {
      h.pose(0, 30 + STEAM.offset + 1.1); h.tick(0.01)
      assert.ok(h.warnings.includes('steam'))
      for (let i = 0; h.hazards.getState().steamStage !== 'clear'; i++) { assert.ok(i < 400); h.tick(1 / 60) }
      assert.equal(h.scene.getObjectByName('timed-steam-jet').visible, false)
      h.time.setMode(mode); h.tick(0.6, { forward: true })
      assert.ok(h.player.mesh.position.z < 30 + STEAM.offset - 1)
      assert.equal(h.failures.length, 0, `${fps}/${mode}: ${h.failures}`)
    } finally { h.dispose() }
  }
})

test('N3: frozen live steam still fails at body height, clearance and particles rewind together', () => {
  const h = harness()
  try {
    h.pose(0, 30 + STEAM.offset + 1.1); h.tick(0.8)
    assert.equal(h.hazards.getState().steamStage, 'active')
    h.time.triggerFreeze()
    const mist = h.scene.getObjectByName('timed-steam-jet')
    const placed = () => Array.from(mist.instanceMatrix.array)
    const particles = placed()
    h.tick(0.2)
    assert.deepEqual(placed(), particles)
    h.tick(0.3, { forward: true })
    assert.ok(h.failures.some(m => m.includes('Steam')))
    h.pose(0, 30 + STEAM.offset + 1.1)
    h.time.triggerRewind(); h.tick(0.45)
    assert.equal(h.hazards.getState().steamStage, 'warning')
    assert.notDeepEqual(placed(), particles)
    h.hazards.reset(); h.time.resetForCheckpoint()
    assert.equal(mist.visible, false)
    assert.equal(h.hazards.getState().steamStarted, false)
  } finally { h.dispose() }
})

test('N3: live jet reaches both walls and crouched bodies; bodies above its visible volume are safe', () => {
  for (const [x, y, duck, dangerous] of [[-2.42, 0, false, true], [2.42, 0, true, true], [0, 3, false, false]]) {
    const h = harness()
    try {
      h.pose(0, 42.1); h.tick(0.8); h.time.triggerFreeze()
      h.pose(x, 41, y); h.tick(0.01, { duck })
      assert.equal(h.failures.length > 0, dangerous)
    } finally { h.dispose() }
  }
})

test('N2/N3: safe staging, pause suppression, bounded scene resources and unregister/disposal', () => {
  const h = harness()
  const resources = new Set(), disposed = new Set()
  try {
    h.hazards.group.traverse(n => {
      assert.equal(n.castShadow || false, false)
      assert.equal(n.isLight || false, false)
      for (const resource of [n.geometry, ...(Array.isArray(n.material) ? n.material : [n.material])].filter(Boolean)) {
        resources.add(resource); resource.addEventListener('dispose', () => disposed.add(resource))
      }
    })
    for (const z of [-4.2, -10.5, 43, 39]) { h.pose(0, z); h.tick(6); assert.equal(h.failures.length, 0) }
    h.hazards.reset(); h.time.resetForCheckpoint()
    h.pose(0, 41); h.tick(0.1, {}, false)
    assert.equal(h.hazards.getState().steamStarted, false, 'disabled presentation cannot trigger encounter')
    assert.equal(h.scene.getObjectByName('timed-steam-jet').count, 72)
  } finally { h.dispose() }
  assert.equal(disposed.size, resources.size)
})

function levelHarness(start, fps = 60) {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
  const scene = new THREE.Scene(), player = createPlayer(), messages = []
  const hud = new Proxy({ showToast: m => messages.push(m) }, { get: (t, k) => t[k] ?? (() => {}) })
  const time = createTimeSystem({ scene, player, hud })
  const respawn = createRespawnSystem({ player, hud, timeSystem: time, camera: { snap() {} } })
  const level = createTimewreckLevel({ debrisSeed: 12345, scene, player, hud, timeSystem: time, respawn, startCarriage: start,
    interaction: { register: () => () => {}, registerBlocker: () => () => {}, flashPrompt() {} }, camera: { snap() {} }, advance() {} })
  player.setPose(level.checkpoint.position, Math.PI); respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  const volume = level.getCarriageVolumes().find(v => v.key === start), center = (volume.minZ + volume.maxZ) / 2
  function tick(seconds, keyboard = {}) {
    for (let t = 0; t < seconds - 1e-9; t += 1 / fps) {
      const dt = Math.min(1 / fps, seconds - t)
      time.update(dt); level.update(dt)
      player.update(dt, { keyboard, cameraYaw: Math.PI, bounds: level.bounds, obstacles: level.obstacles, supports: level.supports, voids: level.voids })
    }
  }
  return { scene, player, time, respawn, level, center, tick, messages,
    dispose() { respawn.dispose(); level.dispose(); time.dispose() } }
}

test('N2 integration: new pre-load checkpoint gives three safe retries and actual frozen crossings', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('cargo', fps)
    try {
      h.player.setPose(new THREE.Vector3(0, 0, h.center - 4.3), Math.PI); h.tick(0.05)
      for (let attempt = 0; attempt < 3; attempt++) {
        h.respawn.respawn()
        assert.ok(Math.abs(h.player.mesh.position.z - (h.center - 4.2)) < 1e-6)
        assert.ok(h.time.getEnergy() >= 50)
        h.time.triggerFreeze(); h.tick(0.8, { forward: true, run: true })
        assert.ok(h.player.mesh.position.z < h.center - 8.5)
        assert.equal(h.respawn.isFailing(), false, h.messages.join(';'))
      }
    } finally { h.dispose() }
  }
})

test('N3 integration: Mechanical entry resets safe and steam does not consume luggage/recess space', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('mechanical', fps)
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        h.respawn.respawn()
        h.tick(0.1, { forward: true })
        h.tick(2.1)
        h.time.triggerFreeze(); h.tick(0.6, { forward: true, run: true })
        assert.ok(h.player.mesh.position.z < h.center + 10)
        assert.ok(h.player.mesh.position.z > h.center + 8)
        assert.equal(h.respawn.isFailing(), false, h.messages.join(';'))
        h.time.setMode('NORMAL'); h.tick(7)
        assert.equal(h.time.getEnergy(), 100)
      }
    } finally { h.dispose() }
  }
})

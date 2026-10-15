import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTimeSystem, TIME_MODES } from '../src/systems/time-system.js'

function createHarness() {
  const messages = []
  const scene = new THREE.Scene()
  const player = { mesh: new THREE.Group() }
  const hud = { showToast: (message) => messages.push(message) }
  const timeSystem = createTimeSystem({ scene, player, hud })
  return { timeSystem, player, messages }
}

function runFor(timeSystem, seconds, frameDeltas) {
  let elapsed = 0
  let index = 0
  while (elapsed < seconds - 1e-10) {
    const delta = Math.min(frameDeltas[index % frameDeltas.length], seconds - elapsed)
    timeSystem.update(delta)
    elapsed += delta
    index += 1
  }
}

function rewindScalar(frameDeltas) {
  const { timeSystem } = createHarness()
  let value = 0
  timeSystem.register(new THREE.Group(), {
    onUpdate: (scaledDelta) => { value += scaledDelta },
    getSnapshot: () => ({ value }),
    restoreSnapshot: (snapshot) => { value = snapshot.value }
  })

  runFor(timeSystem, 6, frameDeltas)
  assert.ok(Math.abs(value - 6) < 1e-9)
  timeSystem.triggerRewind()
  runFor(timeSystem, 0.5, frameDeltas)
  timeSystem.dispose()
  return value
}

test('rewind restores the same timeline position at different refresh rates', () => {
  const results = [30, 60, 144].map((fps) => rewindScalar([1 / fps]))
  results.push(rewindScalar([1 / 24, 1 / 165, 1 / 47, 1 / 90, 0.013]))

  for (const result of results) assert.ok(Math.abs(result - 4.75) < 1e-8)
  assert.ok(Math.max(...results) - Math.min(...results) < 1e-9)
})

test('a fully collapsed walkway rewinds to its intact state predictably', () => {
  const { timeSystem } = createHarness()
  const plank = { y: 0.06, triggered: false, collapsing: false, fuse: 1.4 }

  timeSystem.register(new THREE.Group(), {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale <= 0) return
      if (plank.collapsing) plank.y = Math.max(-3, plank.y - scaledDelta * 4)
      else if (plank.triggered) {
        plank.fuse -= scaledDelta
        if (plank.fuse <= 0) plank.collapsing = true
      }
    },
    getSnapshot: () => ({ ...plank }),
    restoreSnapshot: (snapshot) => Object.assign(plank, snapshot)
  })

  runFor(timeSystem, 0.25, [1 / 60])
  plank.triggered = true
  runFor(timeSystem, 3, [1 / 37, 1 / 144, 0.019])
  assert.equal(plank.y, -3)

  timeSystem.triggerRewind()
  for (let frames = 0; frames < 144 * 4 && timeSystem.getMode() === TIME_MODES.REWIND; frames++) {
    timeSystem.update(1 / 144)
  }
  assert.equal(timeSystem.getMode(), TIME_MODES.NORMAL)

  assert.ok(Math.abs(plank.y - 0.06) < 1e-9)
  assert.equal(plank.triggered, false)
  assert.equal(plank.collapsing, false)
  assert.ok(Math.abs(plank.fuse - 1.4) < 1e-9)
  timeSystem.dispose()
})

test('rewind stops at exhausted history and charges only restored time', () => {
  const { timeSystem, messages } = createHarness()
  let value = 0
  timeSystem.register(new THREE.Group(), {
    onUpdate: (scaledDelta) => { value += scaledDelta },
    getSnapshot: () => ({ value }),
    restoreSnapshot: (snapshot) => { value = snapshot.value }
  })

  runFor(timeSystem, 0.1, [1 / 60])
  timeSystem.triggerRewind()
  timeSystem.update(1)

  assert.equal(timeSystem.getMode(), TIME_MODES.NORMAL)
  assert.ok(Math.abs(value) < 1e-9)
  assert.ok(timeSystem.getEnergy() > 98)
  assert.equal(messages.filter((message) => message === 'Rewind history exhausted').length, 1)
  timeSystem.dispose()
})

test('rewind restores snapshots without running forward object updates backwards', () => {
  const { timeSystem } = createHarness()
  let value = 0
  let updateCalls = 0
  timeSystem.register(new THREE.Group(), {
    onUpdate(scaledDelta) {
      updateCalls += 1
      value += scaledDelta
    },
    getSnapshot: () => ({ value }),
    restoreSnapshot: (snapshot) => { value = snapshot.value }
  })

  runFor(timeSystem, 1, [1 / 60])
  const callsBeforeRewind = updateCalls
  timeSystem.triggerRewind()
  runFor(timeSystem, 0.2, [1 / 144])

  assert.equal(updateCalls, callsBeforeRewind)
  assert.ok(Math.abs(value - 0.5) < 1e-8)
  timeSystem.dispose()
})

test('Ghost recording uses active simulation time rather than wall-clock timestamps', () => {
  const { timeSystem, player } = createHarness()

  for (let i = 0; i < 60; i += 1) {
    player.mesh.position.z = i / 59
    // The ignored second argument represents a wall clock that jumps while
    // paused. Ghost duration must be based only on the supplied delta values.
    timeSystem.update(1 / 60, 100 + i / 60)
  }
  timeSystem.update(1 / 60, 1000)
  timeSystem.triggerGhost()
  assert.equal(timeSystem.getGhost().isPlaying(), true)

  runFor(timeSystem, 1.1, [1 / 60])
  assert.equal(timeSystem.getGhost().isPlaying(), true, 'echo holds its endpoint for pad puzzles')
  runFor(timeSystem, 8, [1 / 60])
  assert.equal(timeSystem.getGhost().isPlaying(), false)
  timeSystem.dispose()
})

test('ability availability is a stable immutable view and old views survive state changes', () => {
  const { timeSystem } = createHarness()
  try {
    const initial = timeSystem.getAbilityAvailability()
    runFor(timeSystem, 1, [1 / 60])
    assert.equal(timeSystem.getAbilityAvailability(), initial)
    assert.throws(() => { initial.SLOW = false }, TypeError)
    assert.equal(timeSystem.getAbilityAvailability().SLOW, true)

    timeSystem.triggerSlow()
    timeSystem.setAbilityAvailability({ SLOW: false })
    const offline = timeSystem.getAbilityAvailability()
    assert.notEqual(offline, initial)
    assert.equal(offline.SLOW, false)
    assert.equal(initial.SLOW, true)
    assert.equal(timeSystem.getMode(), TIME_MODES.NORMAL, 'disabling the active ability still exits it')
    assert.equal(offline.FREEZE, true, 'omitted abilities retain the original enabled default')

    const checkpoint = timeSystem.captureCheckpointState()
    assert.notEqual(checkpoint.availability, offline, 'checkpoint data remains independently editable')
    checkpoint.availability.GHOST = false
    timeSystem.resetForCheckpoint(checkpoint)
    const restored = timeSystem.getAbilityAvailability()
    assert.equal(restored.GHOST, false)
    assert.equal(offline.GHOST, true)
    checkpoint.availability.GHOST = true
    assert.equal(restored.GHOST, false, 'later checkpoint edits cannot mutate the restored view')
    assert.throws(() => { restored.REWIND = false }, TypeError)

    timeSystem.resetForLevel()
    assert.deepEqual(timeSystem.getAbilityAvailability(), { SLOW: true, FREEZE: true, REWIND: true, GHOST: true })
    assert.equal(offline.SLOW, false)
    timeSystem.setAbilityAvailability({ REWIND: false })
    timeSystem.resetForRun()
    assert.equal(timeSystem.getAbilityAvailability().REWIND, true)
  } finally { timeSystem.dispose() }
})

test('rewind retains procedural reverse updates when a mixed snapshot set is exhausted', () => {
  const { timeSystem } = createHarness()
  const object = new THREE.Group()
  let backwardsObjectUpdates = 0, proceduralReverse = 0
  timeSystem.register(object, { onUpdate(dt) {
    if (dt < 0) backwardsObjectUpdates++
    object.position.x += dt
  } })
  const unregister = timeSystem.register(null, {
    getSnapshot: () => null,
    onUpdate(dt) { if (dt < 0) proceduralReverse += dt }
  })
  try {
    runFor(timeSystem, 0.1, [1 / 60])
    timeSystem.triggerRewind()
    timeSystem.update(1)
    assert.equal(timeSystem.getMode(), TIME_MODES.REWIND)
    assert.equal(timeSystem.getEnergy(), 68)
    assert.equal(proceduralReverse, -2.5)
    assert.equal(object.position.x, 0)
    assert.equal(backwardsObjectUpdates, 0)
    unregister()
    timeSystem.update(1)
    assert.equal(timeSystem.getMode(), TIME_MODES.NORMAL)
    assert.equal(timeSystem.getEnergy(), 68, 'exhausted snapshot history charges no additional rewind time')
  } finally { timeSystem.dispose() }
})

test('rewind uses the longest registered history when earlier entries retain only a baseline', () => {
  const { timeSystem } = createHarness()
  const object = new THREE.Group()
  timeSystem.register(new THREE.Group(), { recordWhen: () => false })
  timeSystem.register(object, { onUpdate(dt) { object.position.x += dt } })
  try {
    runFor(timeSystem, 0.5, [1 / 60])
    timeSystem.triggerRewind()
    timeSystem.update(0.1)
    assert.equal(timeSystem.getMode(), TIME_MODES.REWIND)
    assert.ok(Math.abs(object.position.x - 0.25) < 1e-9)
    timeSystem.update(1)
    assert.equal(timeSystem.getMode(), TIME_MODES.NORMAL)
    assert.equal(object.position.x, 0)
    assert.ok(Math.abs(timeSystem.getEnergy() - 93.6) < 1e-9)
  } finally { timeSystem.dispose() }
})

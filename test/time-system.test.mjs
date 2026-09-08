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
  while (timeSystem.getMode() === TIME_MODES.REWIND) {
    timeSystem.update(1 / 144)
  }

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
  assert.equal(timeSystem.getGhost().isPlaying(), false)
  timeSystem.dispose()
})

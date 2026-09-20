import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { disposeObject } from '../src/core/dispose.js'
import { resolveInputState } from '../src/core/input-state.js'
import { createLevelManager } from '../src/core/level-manager.js'
import { mergeBufferGeometries } from '../src/environment/outdoor-environment.js'
import { createRespawnSystem } from '../src/systems/respawn.js'
import { createTimeSystem, TIME_MODES } from '../src/systems/time-system.js'

test('level and run resets clear all temporal state and restore the full kit', () => {
  const scene = new THREE.Scene()
  const player = { mesh: new THREE.Group() }
  const time = createTimeSystem({ scene, player, hud: { showToast() {} } })

  for (let i = 0; i < 20; i += 1) time.update(0.1)
  time.triggerGhost()
  assert.equal(time.getEnergy(), 65)
  assert.equal(time.getGhost().isPlaying(), true)
  assert.equal(time.getGhostCooldown(), 4)

  time.setLevelMultiplier(1.8)
  time.setAbilityAvailability({ SLOW: false, REWIND: false, GHOST: false })
  time.resetForLevel()

  assert.equal(time.getMode(), TIME_MODES.NORMAL)
  assert.equal(time.getEnergy(), time.getMaxEnergy())
  assert.equal(time.getGhost().isPlaying(), false)
  assert.equal(time.getGhost().mesh.visible, false)
  assert.equal(time.getGhostCooldown(), 0)
  assert.deepEqual(time.getAbilityAvailability(), {
    SLOW: true, FREEZE: true, REWIND: true, GHOST: true
  })

  time.triggerGhost()
  assert.equal(time.getGhost().isPlaying(), false, 'old player history must not replay')
  time.triggerSlow()
  assert.equal(time.getUniforms().uIntensity.value, 0.5, 'level multiplier must reset')

  time.resetForRun()
  assert.equal(time.getEnergy(), 100)
  time.dispose()
})

test('normal level progression carries energy with a documented recovery floor', () => {
  const scene = new THREE.Scene()
  const player = { mesh: new THREE.Group() }
  const time = createTimeSystem({ scene, player })

  time.triggerSlow()
  time.update(2)
  assert.equal(time.getEnergy(), 64)
  time.resetForLevel({ preserveEnergy: true })
  assert.equal(time.getEnergy(), 64)

  time.triggerSlow()
  time.update(1)
  assert.equal(time.getEnergy(), 46)
  time.resetForLevel({ preserveEnergy: true })
  assert.equal(time.getEnergy(), 50)
  time.dispose()
})

test('level manager applies run energy policy and invalidates respawns at transitions', () => {
  const originalAnimationFrame = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = (callback) => { callback(); return 1 }
  const resets = []
  let respawnResets = 0
  const level = () => ({
    checkpoint: { position: new THREE.Vector3(), yaw: 0 },
    dispose() {}
  })
  const manager = createLevelManager({
    scene: new THREE.Scene(),
    interaction: { setEnabled() {} },
    hud: { setObjective() {} },
    player: { setPose() {} },
    camera: { setYaw() {}, snap() {} },
    respawn: {
      reset: () => { respawnResets += 1 },
      setCheckpoint() {}
    },
    loadingScreen: { show() {}, hide() {} },
    timeSystem: {
      resetForLevel: (options) => resets.push(options),
      resetForRun: () => resets.push('run')
    },
    levels: [
      { state: 'One', create: level },
      { state: 'Two', create: level }
    ]
  })

  try {
    manager.enter('One')
    manager.advance()
    manager.restart()
    manager.unload()
    assert.deepEqual(resets, [
      { preserveEnergy: false },
      { preserveEnergy: true },
      { preserveEnergy: false },
      'run'
    ])
    assert.equal(respawnResets, 4)
  } finally {
    globalThis.requestAnimationFrame = originalAnimationFrame
  }
})

test('checkpoint respawn restores level state, time state, position, and camera yaw', () => {
  const player = {
    mesh: new THREE.Group(),
    setPose(position, yaw) { this.pose = { position: position.clone(), yaw } }
  }
  const calls = []
  const checkpointTime = { energy: 40 }
  const respawn = createRespawnSystem({
    player,
    camera: {
      setYaw: (yaw) => calls.push(['yaw', yaw]),
      snap: () => calls.push(['snap'])
    },
    timeSystem: {
      captureCheckpointState: () => checkpointTime,
      resetForCheckpoint: (snapshot) => calls.push(['time', snapshot])
    }
  })

  const position = new THREE.Vector3(3, 2, -7)
  respawn.setCheckpoint(position, Math.PI / 2, {
    restore: () => calls.push(['level'])
  })
  position.set(99, 99, 99)
  assert.equal(respawn.respawn(), true)
  assert.deepEqual(player.pose.position.toArray(), [3, 2, -7])
  assert.equal(player.pose.yaw, Math.PI / 2)
  assert.deepEqual(calls, [
    ['level'], ['time', checkpointTime], ['yaw', Math.PI / 2], ['snap']
  ])
  respawn.dispose()
})

test('cancel invalidates a pending failure before it can teleport or reactivate input', async () => {
  let poses = 0
  let caughtVisible = false
  let stateChanges = 0
  const respawn = createRespawnSystem({
    player: { mesh: new THREE.Group(), setPose: () => { poses += 1 } },
    camera: { snap() {} },
    hud: {
      showCaughtScreen: () => { caughtVisible = true },
      hideCaughtScreen: () => { caughtVisible = false }
    },
    onStateChange: () => { stateChanges += 1 }
  })
  respawn.setCheckpoint(new THREE.Vector3())
  respawn.fail()
  respawn.cancel()
  const changesAfterCancel = stateChanges

  await new Promise((resolve) => setTimeout(resolve, 950))
  assert.equal(poses, 0)
  assert.equal(caughtVisible, false)
  assert.equal(stateChanges, changesAfterCancel, 'stale callback must remain inert')
  respawn.dispose()
})

test('pausing suspends a pending failure until gameplay resumes', async () => {
  let poses = 0
  const respawn = createRespawnSystem({
    player: { mesh: new THREE.Group(), setPose: () => { poses += 1 } },
    camera: { snap() {} }
  })
  respawn.setCheckpoint(new THREE.Vector3())
  respawn.fail()
  respawn.setPaused(true)

  await new Promise((resolve) => setTimeout(resolve, 950))
  assert.equal(poses, 0)
  assert.equal(respawn.isFailing(), true)

  respawn.setPaused(false)
  await new Promise((resolve) => setTimeout(resolve, 950))
  assert.equal(poses, 1)
  assert.equal(respawn.isFailing(), false)
  respawn.dispose()
})

test('input state keeps caught, transition, and cinematic controls explicit', () => {
  const base = {
    gameStarted: true, creditsOpen: false, paused: false,
    transitioning: false, caught: false, cinematic: false
  }
  assert.equal(resolveInputState(base), 'PLAYING')
  assert.equal(resolveInputState({ ...base, caught: true }), 'CAUGHT')
  assert.equal(resolveInputState({ ...base, transitioning: true }), 'TRANSITION')
  assert.equal(resolveInputState({ ...base, cinematic: true }), 'CINEMATIC')
  assert.equal(resolveInputState({ ...base, paused: true, caught: true }), 'PAUSED')
  assert.equal(resolveInputState({ ...base, gameStarted: false }), 'TITLE')
})

test('tree geometry merge preserves indexed and mixed topology', () => {
  const pine = [
    new THREE.CylinderGeometry(0.2, 0.35, 1.8, 6),
    new THREE.ConeGeometry(1.6, 2.2, 7),
    new THREE.ConeGeometry(1.25, 1.9, 7),
    new THREE.ConeGeometry(0.9, 1.6, 7)
  ]
  const deciduous = [
    new THREE.CylinderGeometry(0.25, 0.45, 2.2, 6),
    new THREE.DodecahedronGeometry(1.8, 1)
  ]

  for (const parts of [pine, deciduous]) {
    const expectedIndices = parts.reduce(
      (sum, geometry) => sum + (geometry.index?.count ?? geometry.attributes.position.count), 0
    )
    const merged = mergeBufferGeometries(parts)
    assert.ok(merged.index)
    assert.equal(merged.index.count, expectedIndices)
    assert.equal(merged.index.count % 3, 0)
    assert.ok(Math.max(...merged.index.array) < merged.attributes.position.count)
    merged.dispose()
    parts.forEach((part) => part.dispose())
  }
})

test('resource cleanup disposes InstancedMesh buffers and shared resources once', () => {
  const roots = [new THREE.Group(), new THREE.Group()]
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial()
  const instances = new THREE.InstancedMesh(geometry, material, 3)
  roots[0].add(instances)
  roots[1].add(new THREE.Mesh(geometry, material))

  let instanceDisposals = 0
  let geometryDisposals = 0
  let materialDisposals = 0
  instances.addEventListener('dispose', () => { instanceDisposals += 1 })
  geometry.addEventListener('dispose', () => { geometryDisposals += 1 })
  material.addEventListener('dispose', () => { materialDisposals += 1 })

  disposeObject(roots)
  assert.equal(instanceDisposals, 1)
  assert.equal(geometryDisposals, 1)
  assert.equal(materialDisposals, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { sound, createAudioTransitions } from '../src/systems/sound-effects.js'
import { createPlayer } from '../src/entities/player.js'
import { createTrain } from '../src/entities/train.js'
import { createPuzzleDoor } from '../src/environment/passageways/passage-components.js'
import { createDistractionSystem } from '../src/systems/distraction.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createRespawnSystem } from '../src/systems/respawn.js'
import { disposeObject } from '../src/core/dispose.js'

function capture(t) {
  const events = []
  t.mock.method(sound, 'play', (name, options) => { events.push({ name, ...options }); return { stop() {} } })
  return { events, count: name => events.filter(e => e.name === name).length }
}
test('real player physics emits one successful jump/landing and stays silent against bounds', t => {
  const c = capture(t), player = createPlayer(), keyboard = { forward: true }
  t.after(() => disposeObject(player.mesh))
  const update = (bounds = null) => player.update(1 / 60, { keyboard, cameraYaw: 0, bounds })
  for (let i = 0; i < 60; i++) update({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 })
  assert.equal(c.events.length, 0, 'walking input blocked by bounds is silent')
  for (let i = 0; i < 60; i++) update()
  assert.ok(c.count('step-stone') >= 2)
  keyboard.forward = false; keyboard.jump = true
  for (let i = 0; i < 90; i++) update()
  assert.equal(c.count('jump'), 1); assert.equal(c.count('land'), 1)
  const before = c.events.length
  player.setPose(new THREE.Vector3(20, 0, 20))
  keyboard.jump = false; update()
  assert.equal(c.events.length, before)
})
test('puzzle unlock and boarding train door transitions cue once, independent of animation ticks', t => {
  const c = capture(t)
  const door = createPuzzleDoor({ position: new THREE.Vector3() })
  door.unlock(); door.unlock()
  for (let i = 0; i < 120; i++) door.update(1 / 60)
  assert.equal(c.count('unlock'), 1); assert.equal(c.count('door-open'), 1)
  const train = createTrain()
  train.openDoor(); train.openDoor()
  for (let i = 0; i < 60; i++) train.update(1 / 60)
  train.closeDoor(); train.closeDoor()
  for (let i = 0; i < 60; i++) train.update(1 / 60)
  assert.equal(c.count('door-open'), 2); assert.equal(c.count('door-close'), 1)
  disposeObject(door.group); disposeObject(train.train); disposeObject(train.stationSteam)
})
test('throw cue follows animation release and floor impact happens once', t => {
  const c = capture(t), scene = new THREE.Scene(), mesh = new THREE.Group()
  scene.add(mesh)
  const animation = { released: false, finished: false, cancelled: false }
  const system = createDistractionSystem({ scene, player: { mesh, playThrow: () => animation },
    inventory: { count: 1, max: 3 }, groundHeightAt: () => 0 })
  t.after(() => system.dispose())
  assert.ok(system.throw())
  for (let i = 0; i < 20; i++) system.update(1 / 60)
  assert.equal(c.count('throw'), 0)
  animation.released = true
  for (let i = 0; i < 180; i++) system.update(1 / 60)
  assert.equal(c.count('throw'), 1); assert.equal(c.count('metal-impact'), 1)
  assert.equal(system.getCount(), 0)
  assert.equal(system.throw(), false); assert.equal(c.count('error'), 1)
})
test('ability success, rejection and deactivation audio follow authoritative state', t => {
  const c = capture(t)
  const system = createTimeSystem({ scene: new THREE.Scene(), player: { mesh: new THREE.Group() } })
  t.after(() => system.dispose())
  system.triggerSlow(); system.triggerSlow()
  assert.equal(c.count('ability-slow'), 1); assert.equal(c.count('ability-end'), 1)
  system.setAbilityAvailability({ FREEZE: false })
  system.triggerFreeze()
  assert.equal(c.count('ability-freeze'), 0); assert.equal(c.count('error'), 1)
})
test('checkpoints, failure, respawn and final life use distinct one-shot cues', t => {
  const c = capture(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let gameOvers = 0
  const player = { mesh: new THREE.Group(), setPose() {} }
  const respawn = createRespawnSystem({ player })
  t.after(() => respawn.dispose())
  respawn.setGameOverHandler(() => gameOvers++)
  respawn.setCheckpoint(new THREE.Vector3())
  assert.equal(c.count('checkpoint'), 0)
  respawn.setCheckpoint(new THREE.Vector3(1, 0, 0))
  assert.equal(c.count('checkpoint'), 1)
  assert.ok(respawn.fail()); assert.equal(respawn.fail(), false)
  t.mock.timers.tick(900)
  assert.equal(c.count('fail'), 1); assert.equal(c.count('respawn'), 1)
  respawn.fail(); t.mock.timers.tick(900)
  respawn.fail(); t.mock.timers.tick(1450)
  assert.equal(c.count('game-over'), 1); assert.equal(gameOvers, 1)
})
test('motion and pressure state trackers never replay from proximity or idle contact', t => {
  const c = capture(t), audio = createAudioTransitions()
  audio.motion('door', 0, 30)
  audio.motion('door', 0, 1)
  assert.equal(c.events.length, 0)
  audio.motion('door', 0.2, 1)
  audio.motion('door', 0.2, 1)
  audio.motion('door', 0.20001, 1)
  audio.motion('door', 0.4, 1)
  audio.motion('door', 0.3, 1)
  assert.equal(c.count('door-open'), 1); assert.equal(c.count('door-close'), 1)
  audio.edge('plate', false, 'switch')
  for (let i = 0; i < 100; i++) audio.edge('plate', true, 'switch')
  assert.equal(c.count('switch'), 1)
  audio.reset(); audio.motion('door', 0, 1)
  assert.equal(c.count('door-close'), 1, 'checkpoint restoration is silent')
})

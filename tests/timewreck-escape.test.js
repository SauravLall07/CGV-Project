import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createRespawnSystem } from '../src/systems/respawn.js'

import { securityCrossingLayout } from '../src/levels/timewreck-security.js'

function levelHarness(start = 'mechanical', fps = 60) {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
  let advanced = 0
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
    camera: { snap() {} }, advance() { advanced++ }, startCarriage: start
  })
  player.setPose(level.checkpoint.position, Math.PI)
  respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  const span = level.getCarriageVolumes().find((v) => v.key === start)
  const center = (span.minZ + span.maxZ) / 2
  const layout = securityCrossingLayout(center)
  let duckWasDown = false
  const tick = (seconds, keys = {}) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / fps) {
      const dt = Math.min(1 / fps, seconds - t)
      time.update(dt)
      level.update(dt)
      player.update(dt, { keyboard: keys, cameraYaw: Math.PI, bounds: level.bounds,
        obstacles: level.obstacles, supports: level.supports, voids: level.voids, crouchPressed: Boolean(keys.duck) && !duckWasDown })
      duckWasDown = Boolean(keys.duck)
    }
  }
  const dispose = () => { respawn.dispose(); level.dispose(); time.dispose() }
  return { get advanced() { return advanced }, scene, player, time, respawn, level, center, layout, interactions, tick, dispose, messages }
}
function pose(h, x, z, y = 0) { h.player.setPose(new THREE.Vector3(x, y, z), Math.PI) }
function repair(h, name) {
  const shutter = h.scene.getObjectByName(name).children[0]
  h.tick(1.4)
  assert.ok(shutter.position.y < 1.4, 'shutter visibly failed')
  h.tick(14)
  h.time.triggerRewind(); h.tick(0.55)
  assert.ok(shutter.position.y > 3.5, 'idle retains intact history')
  h.time.triggerFreeze()
  return shutter
}

test('Mechanical: Slow first bank, safe switching recess, Rewind/Freeze shutter and second bank at 30/60/144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('mechanical', fps)
    try {
      pose(h, 1.5, h.center + 9)
      h.time.triggerSlow(); h.tick(1.1, { forward: true })
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      assert.ok(h.player.mesh.position.z < h.center + 5)
      h.time.setMode('NORMAL'); h.tick(0.6, { forward: true })
      const shutter = repair(h, 'mechanical-rewind-shutter')
      h.tick(1.25, { forward: true })
      assert.ok(h.player.mesh.position.z < h.center - 1.5)
      assert.ok(shutter.position.y > 3.5)
      assert.ok(h.time.getEnergy() > 35)
      h.time.setMode('NORMAL'); h.tick(0.375, {left: true}); h.tick(4)
      h.time.triggerSlow(); h.tick(2.4, { forward: true })
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      assert.ok(h.player.mesh.position.z < h.center - 11)
    } finally { h.dispose() }
  }
})

test('Convergence: direct timed aisle and crouched maintenance fork both rejoin at 30/60/144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('convergence', fps)
    try {
      pose(h, -0.6, h.center + 6.2)
      h.tick(2.15) // surge safe window starts at 2.05s
      h.time.triggerSlow(); h.tick(1.2, { forward: true })
      assert.ok(h.player.mesh.position.z < h.center + 2)
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      h.time.setMode('NORMAL')
      pose(h, 1.75, h.center + 9)
      h.tick(0.65, { forward: true })
      assert.ok(h.player.mesh.position.z > h.center + 8, JSON.stringify(h.player.mesh.position))
      // Player settings default to hold; the real crouch input is duck.
      h.tick(1.6, { forward: true, duck: true })
      const shutter = repair(h, 'convergence-rewind-shutter')
      h.tick(1.4, { forward: true, duck: true })
      assert.ok(h.player.mesh.position.z < h.center + 3.5, JSON.stringify({pos:h.player.mesh.position,center:h.center,mode:h.time.getMode(), energy:h.time.getEnergy()}))
      assert.ok(shutter.position.y > 3.5)
      h.time.setMode('NORMAL')
      h.tick(2.9, { forward: true, duck: true })
      assert.ok(h.player.mesh.position.z < h.center - 1)
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
    } finally { h.dispose() }
  }
})

test('Passenger: warned rack, real separating floor, Freeze chase and controllable sprint reach brake', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('passenger', fps)
    try {
      h.tick(0.1, { forward: true, run: true })
      h.tick(0.7, { forward: true, run: true, right: true })
      assert.ok(h.messages.some(m => m.includes('Rack bolts')))
      h.tick(0.2, { forward: true, run: true })
      const wave = h.scene.getObjectByName('time-wave')
      const waveZ = wave.position.z
      h.time.triggerFreeze(); h.tick(0.3)
      assert.equal(wave.position.z, waveZ)
      h.tick(0.37, { left: true, run: true })
      h.tick(1.6, { forward: true, run: true })
      assert.ok(h.player.mesh.position.z < h.center - 3)
      assert.ok(h.player.mesh.position.y >= -0.1)
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      h.time.setMode('NORMAL')
      h.tick(1.1, { forward: true, run: true })
      const brake = h.scene.getObjectByName('emergency-brake')
      // Continue real movement to interaction range, then pull the actual callback.
      while (h.player.mesh.position.z > brake.position.z + 1.5 && !h.respawn.isFailing()) h.tick(0.1, { forward: true, run: true })
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      assert.equal(h.level.isCinematic, false, 'player owns the entire sprint')
      h.interactions.get('emergency-brake').onInteract()
      assert.equal(h.level.isCinematic, true)
      h.tick(2.7)
      const scenery = h.scene.getObjectByName('trackside-infrastructure')
      const stopped = scenery.position.z
      h.tick(0.8)
      assert.equal(scenery.position.z, stopped, 'main scenery actually stops')
      assert.ok(h.scene.getObjectByName('broken-bridge-ahead'))
      h.tick(1.5)
      assert.equal(h.advanced, 1)
    } finally { h.dispose() }
  }
})

test('New checkpoints: repeated local retries restore warnings, shutters, wave lead, energy and power availability', () => {
  for (const start of ['mechanical', 'convergence', 'passenger']) {
    const h = levelHarness(start)
    try {
      const checkpoint = h.level.checkpoint.position.clone()
      for (let i = 0; i < 3; i++) {
        h.tick(0.2, { forward: true })
        h.time.triggerFreeze(); h.tick(2)
        h.respawn.cancel(); h.respawn.respawn()
        assert.ok(h.player.mesh.position.distanceTo(checkpoint) < (start === 'passenger' ? 0.31 : 0.001), JSON.stringify({start, checkpoint, pos:h.player.mesh.position}))
        assert.equal(h.time.getMode(), 'NORMAL')
        assert.ok(h.time.getEnergy() >= 50)
        assert.equal(h.level.isCinematic, false)
        assert.equal(h.player.mesh.userData.wreckLowCeiling, false)
        const rack = h.scene.getObjectByName('passenger-falling-rack').children[0]
        assert.equal(rack.position.y, 2.65)
      }
    } finally { h.dispose() }
  }
})


test('Vault: both clearance windows can be observed, held and crossed with real body collision', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('vault', fps)
    try {
      const gates = []
      h.scene.traverse(n => { if (n.name === 'vault-security-gate') gates.push(n) })
      gates.sort((a, b) => b.position.z - a.position.z)
      for (const gate of gates) {
        pose(h, 0, gate.position.z + 1.4)
        let wait = 0
        while (gate.getObjectByName('vault-clearance-signal').material.color.getHex() !== 0x42dfad && wait < 8) {
          h.tick(1 / fps); wait += 1 / fps
        }
        assert.ok(wait < 8)
        h.time.triggerFreeze(); h.tick(0.5, { forward: true, run: true })
        assert.ok(h.player.mesh.position.z < gate.position.z - 1)
        assert.equal(h.respawn.isFailing(), false)
        h.time.setMode('NORMAL'); h.tick(1.1)
      }
    } finally { h.dispose() }
  }
})

test('Passenger: unheld and wall-side floors fall; depleted retries reset wave, rack and energy three times', () => {
  const h = levelHarness('passenger')
  try {
    h.tick(0.1, { forward: true, run: true })
    for (const x of [0, 2.3, -2.3]) {
      pose(h, x, h.center + 1)
      h.tick(0.6)
      assert.equal(h.respawn.isFailing(), true)
      h.respawn.cancel(); h.respawn.respawn()
      assert.ok(h.player.mesh.position.z > h.center + 8)
      assert.equal(h.time.getAbilityAvailability().REWIND, false)
      assert.ok(h.time.getEnergy() >= 50)
      assert.ok(h.scene.getObjectByName('time-wave').position.z - h.player.mesh.position.z >= 11.9)
      assert.equal(h.scene.getObjectByName('passenger-falling-rack').children[0].position.y, 2.65)
    }
  } finally { h.dispose() }
})

test('Batches 4/5: full rebuild disposes routes and restores fresh ability and obstacle state', () => {
  const h = levelHarness('passenger')
  try {
    h.tick(0.2, { forward: true, run: true })
    const fork = h.scene.getObjectByName('convergence-route-fork')
    let disposed = false
    fork.children[0].geometry.addEventListener('dispose', () => { disposed = true })
    h.level.dispose()
    assert.equal(disposed, true)
    assert.equal(fork.parent.parent, null)
    assert.equal(h.interactions.has('emergency-brake'), false)
    h.time.resetForLevel()
    const fresh = createTimewreckLevel({ scene: h.scene, player: h.player, hud: new Proxy({}, {get:()=>()=>{}}), timeSystem: h.time,
      respawn: h.respawn, camera: {snap(){}}, advance(){}, startCarriage: 'passenger',
      interaction: {register:()=>()=>{}, registerBlocker:()=>()=>{}} })
    try {
      assert.equal(h.time.getAbilityAvailability().REWIND, true)
      assert.equal(h.time.getEnergy(), 100)
      const forks = []; h.scene.traverse(n=>{if(n.name==='convergence-route-fork') forks.push(n)})
      assert.equal(forks.length, 1)
      assert.equal(h.scene.getObjectByName('passenger-falling-rack').children[0].position.y, 2.65)
    } finally { fresh.dispose() }
  } finally { h.respawn.dispose(); h.time.dispose() }
})

test('Shutter: failed panel blocks standing, crouching and jumping approaches without opening itself', () => {
  const h = levelHarness('mechanical')
  try {
    pose(h, 0, h.center + 3)
    h.tick(2)
    for (const keys of [{forward:true}, {forward:true, duck:true}, {forward:true, jump:true}]) {
      pose(h, 0, h.center + 1.2)
      h.tick(0.6, keys)
      assert.ok(h.player.mesh.position.z > h.center + 0.25)
      assert.ok(h.scene.getObjectByName('mechanical-rewind-shutter').children[0].position.y < 1.4)
    }
  } finally { h.dispose() }
})

test('Passenger: rendered full-width hole and flat caps match exact support surfaces', () => {
  const h = levelHarness('passenger')
  try {
    pose(h, 0, h.center + 2.8)
    h.tick(0.1); h.time.triggerFreeze(); h.tick(0.25)
    const floor = h.scene.getObjectByName('floor-passenger')
    const root = floor.parent.parent
    h.scene.updateMatrixWorld(true)
    for (const x of [-2.4, 0, 2.4]) {
      const local = new THREE.Vector3(x, 2, h.center - 0.8)
      const origin = root.localToWorld(local)
      const direction = new THREE.Vector3(0,-1,0).transformDirection(root.matrixWorld)
      assert.equal(new THREE.Raycaster(origin,direction).intersectObject(floor).length,0)
    }
    const caps = []; h.scene.traverse(n=>{if(n.name==='passenger-support-top')caps.push(n)})
    for (const cap of caps) {
      const piece = cap.parent
      const support = h.level.supports.find(s=>Math.abs((s.minZ+s.maxZ)/2-piece.position.z)<0.01 && s.y>0.2)
      assert.ok(support)
      assert.ok(Math.abs(support.y-(piece.position.y+0.18))<0.0001)
      assert.ok(Math.abs(support.maxX-support.minX-cap.geometry.parameters.width)<0.0001)
      assert.ok(Math.abs(support.maxZ-support.minZ-cap.geometry.parameters.depth)<0.0001)
    }
  } finally { h.dispose() }
})

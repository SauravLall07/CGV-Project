import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createRespawnSystem } from '../src/systems/respawn.js'

import { securityCrossingLayout } from '../src/levels/timewreck-security.js'

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
    camera: { snap() {} }, advance() {}, startCarriage: 'security'
  })
  player.setPose(level.checkpoint.position, Math.PI)
  respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  const span = level.getCarriageVolumes().find((v) => v.key === 'security')
  const center = (span.minZ + span.maxZ) / 2
  const layout = securityCrossingLayout(center)
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
  return { scene, player, time, respawn, level, center, layout, interactions, tick, dispose, messages }
}



function firstLeg(h) {
  h.player.setPose(new THREE.Vector3(-0.9, 0, h.layout.maxZ + 0.35), Math.PI)
  h.tick(0.05)
  h.time.triggerFreeze()
  h.tick(0.23)
  h.tick(0.62, { forward: true })
  h.tick(0.5, { forward: true, right: true })
  h.tick(0.7, { forward: true })
  h.tick(0.05)
  assert.ok(Math.abs(h.player.mesh.position.z - h.center) < 1, 'first leg reaches island')
  assert.ok(h.player.mesh.position.y >= 0, 'steered crossing stays on rendered decks')
  assert.equal(h.respawn.isFailing(), false)
}
function secondLeg(h) {
  // Start from where the real player stopped on the island, with no teleport.
  h.time.triggerFreeze()
  h.tick(0.23)
  h.tick(0.81, { forward: true })
  assert.ok(h.player.mesh.position.z < h.center - 2.5)
  h.tick(0.75, { forward: true, run: true, jump: true })
  h.tick(0.6, { forward: true })
  h.tick(0.05)
  assert.ok(h.player.mesh.position.z < h.layout.minZ - 0.4, 'jumping leg reaches exit')
  assert.ok(h.player.mesh.position.y >= 0)
  assert.equal(h.respawn.isFailing(), false)
}

test('Security: actual player steers, recharges on island and jumps the second crossing at 30/60/144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness(fps)
    try {
      firstLeg(h)
      assert.ok(h.time.getEnergy() > 38, `${fps}: first leg has energy margin`)
      h.time.setMode('NORMAL')
      h.tick(4.5)
      assert.equal(h.time.getEnergy(), 100)
      assert.equal(h.player.mesh.position.y, 0)
      secondLeg(h)
      assert.ok(h.time.getEnergy() > 28, `${fps}: second leg has energy margin`)
    } finally { h.dispose() }
  }
})

test('Security: both openings are visible across the shell; island and supports match actual geometry', () => {
  const h = levelHarness()
  try {
    const floor = h.scene.getObjectByName('floor-security')
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
    h.scene.updateMatrixWorld(true)
    const floorStrips = []
    h.scene.traverse(node => { if (['security-floor-edge', 'security-floor-cyan'].includes(node.name)) floorStrips.push(node) })
    for (const hole of h.layout.holes) {
      for (const x of [-2.59, -2.36, -2.28, 0, 2.28, 2.36, 2.59]) {
        ray.ray.origin.set(x, 0.4, (hole.minZ + hole.maxZ) / 2)
        assert.equal(ray.intersectObject(floor).length, 0)
        assert.equal(ray.intersectObjects(floorStrips).length, 0, 'trim cannot cover either gap')
      }
    }
    for (const x of [-2.59, 0, 2.59]) {
      ray.ray.origin.set(x, 0.4, h.center)
      assert.ok(ray.intersectObject(floor).length)
    }
    h.time.triggerFreeze(); h.tick(0.23)
    h.scene.updateMatrixWorld(true)
    for (let i = 0; i < h.layout.tiles.length; i++) {
      const tile = h.layout.tiles[i]
      const deck = h.scene.getObjectByName(`security-freeze-tile-${i}`)
      const marks = deck.children.find(n => n.name.endsWith('-marks'))
      assert.ok(marks, 'each real deck carries its own steering or jump marks')
      assert.equal(marks.userData.noCameraCollision, true)
      assert.equal(marks.castShadow, false)
      const vertices = marks.geometry.attributes.position
      for (let j = 0; j < vertices.count; j++) {
        assert.ok(Math.abs(vertices.getX(j)) < tile.width / 2)
        assert.ok(Math.abs(vertices.getZ(j)) < tile.length / 2, 'mark cannot extend across a gap')
      }
      const support = h.level.supports.find(s => Math.abs(s.minZ - (tile.z - tile.length / 2)) < 0.001)
      assert.ok(support)
      assert.equal(support.maxX - support.minX, tile.width)
      ray.ray.origin.set(tile.x, 2, tile.z)
      const hits = ray.intersectObject(h.scene.getObjectByName(`security-freeze-tile-${i}`), true)
      assert.ok(Math.abs(h.scene.getObjectByName('security-two-stage-crossing').worldToLocal(hits[0].point).y - support.y) < 1e-6)
    }
    const solidMarks = h.scene.getObjectByName('security-solid-floor-directions')
    const vertices = solidMarks.geometry.attributes.position
    for (let j = 0; j < vertices.count; j++) {
      const z = vertices.getZ(j)
      assert.ok(z > h.layout.maxZ || (z > h.layout.islandMinZ && z < h.layout.islandMaxZ),
        'approach/island instructions stay on permanent floor')
    }
    h.time.setMode('NORMAL'); h.tick(0.23)
    assert.equal(h.level.supports.filter(s => h.layout.holes.some(hole => s.minZ >= hole.minZ && s.maxZ <= hole.maxZ)).length, 0)
  } finally { h.dispose() }
})

test('Security: unheld debris and wall-side routes cause actual falls; entry retries recover', () => {
  const h = levelHarness()
  try {
    for (const x of [-2.4, 0, 2.4]) {
      h.player.setPose(new THREE.Vector3(x, 0, h.layout.maxZ + 0.2), Math.PI)
      h.tick(0.9, { forward: true })
      assert.ok(h.player.mesh.position.y < -0.65)
      assert.equal(h.respawn.isFailing(), true)
      h.respawn.cancel(); h.respawn.respawn()
      assert.ok(h.player.mesh.position.z > h.layout.maxZ)
      assert.equal(h.time.getMode(), 'NORMAL')
      assert.ok(h.time.getEnergy() >= 50)
    }
    firstLeg(h)
  } finally { h.dispose() }
})

test('Security: island saves grounded progress, energy depletion is safe there, and second-leg falls retry locally', () => {
  const h = levelHarness()
  try {
    firstLeg(h)
    h.tick(4) // consume the remaining Freeze energy on stable island floor
    assert.equal(h.time.getMode(), 'NORMAL')
    assert.equal(h.respawn.isFailing(), false)
    assert.equal(h.player.mesh.position.y, 0)
    for (let i = 0; i < 3; i++) {
      h.player.setPose(new THREE.Vector3(2.3, -1, h.center - 3), Math.PI)
      h.tick(1 / 60)
      assert.equal(h.respawn.isFailing(), true)
      h.respawn.cancel(); h.respawn.respawn()
      assert.equal(h.player.mesh.position.z, h.center)
      assert.equal(h.player.mesh.position.y, 0)
      assert.equal(h.time.getMode(), 'NORMAL')
      assert.ok(h.time.getEnergy() >= 50)
      assert.equal(h.level.supports.filter(s => h.layout.holes.some(hole => s.minZ >= hole.minZ && s.maxZ <= hole.maxZ)).length, 0)
    }
    h.tick(4)
    // Retries spawn at the island centre. Steer to the second leg on solid floor.
    h.tick(0.13, { right: true })
    h.tick(0.115, { back: true })
    secondLeg(h)
  } finally { h.dispose() }
})


test('Security: the second break needs a jump even at sprint speed', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness(fps)
    try {
      h.player.setPose(new THREE.Vector3(0.5, 0.12, h.center - 2.8), Math.PI)
      h.time.triggerFreeze(); h.tick(0.23)
      h.tick(0.7, { forward: true, run: true })
      assert.equal(h.respawn.isFailing(), true, `${fps}: running cannot bridge the visible break`)
    } finally { h.dispose() }
  }
})


test('Security: running out of Freeze on a crossing falls and restores a solvable entry', () => {
  const h = levelHarness()
  try {
    h.player.setPose(new THREE.Vector3(-0.9, 0, h.layout.maxZ + 0.35), Math.PI)
    h.tick(0.05)
    h.time.triggerFreeze(); h.tick(3.3)
    assert.ok(h.time.getEnergy() < 10)
    h.tick(1.1, { forward: true })
    assert.equal(h.respawn.isFailing(), true)
    h.respawn.cancel(); h.respawn.respawn()
    assert.ok(h.player.mesh.position.z > h.layout.maxZ)
    assert.equal(h.time.getMode(), 'NORMAL')
    h.tick(4)
    firstLeg(h)
  } finally { h.dispose() }
})

test('Security: level rebuild clears island progress, geometry and temporal registrations', () => {
  const h = levelHarness()
  let restarted
  try {
    firstLeg(h)
    const oldGroup = h.scene.getObjectByName('security-two-stage-crossing')
    let disposed = false
    oldGroup.getObjectByName('security-freeze-tile-0').children[0].geometry.addEventListener('dispose', () => { disposed = true })
    h.level.dispose()
    assert.equal(oldGroup.parent.parent, null, 'outgoing carriage root is detached')
    assert.ok(disposed)
    h.time.resetForLevel()
    restarted = createTimewreckLevel({ scene: h.scene, player: h.player, hud: new Proxy({}, { get: () => () => {} }),
      timeSystem: h.time, respawn: h.respawn, camera: { snap() {} }, advance() {}, startCarriage: 'security',
      interaction: { register: () => () => {}, registerBlocker: () => () => {} }
    })
    h.player.setPose(restarted.checkpoint.position, Math.PI)
    assert.ok(h.player.mesh.position.z > h.layout.maxZ)
    const groups = []
    h.scene.traverse(node => { if (node.name === 'security-two-stage-crossing') groups.push(node) })
    assert.equal(groups.length, 1)
    assert.equal(h.time.getEnergy(), 100)
    assert.equal(h.time.getMode(), 'NORMAL')
    h.time.triggerFreeze()
    for (let i = 0; i < 16; i++) { h.time.update(1 / 60); restarted.update(1 / 60) }
    assert.equal(restarted.supports.filter(s => s.y === 0.12 && s.minZ > h.layout.minZ - 0.1 && s.maxZ < h.layout.maxZ + 0.1).length, 5)
  } finally { h.respawn.dispose(); restarted?.dispose(); h.time.dispose() }
})

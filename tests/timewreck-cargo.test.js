import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCargoGangway, cargoGangwayLayout, cutCargoGangwayFloor, cargoLoopPose } from '../src/levels/timewreck-cargo.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createRespawnSystem } from '../src/systems/respawn.js'

function gangwayHarness() {
  const scene = new THREE.Scene()
  const player = { mesh: new THREE.Group() }
  const time = createTimeSystem({ scene, player })
  const mat = new THREE.MeshStandardMaterial()
  const layout = cargoGangwayLayout(0, 2.6)
  const bridge = createCargoGangway({ root: scene, layout, wood: mat, brass: mat, cyan: mat })
  time.register(bridge.group, {
    recordWhen: () => bridge.state.recording,
    onUpdate(dt) { bridge.state.step(dt, true); bridge.apply() },
    getSnapshot: () => bridge.state.snapshot(),
    restoreSnapshot(s) { bridge.state.restore(s); bridge.apply() }
  })
  const tick = (seconds, fps = 60) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / fps) time.update(Math.min(1 / fps, seconds - t))
  }
  return { scene, time, bridge, layout, tick }
}

test('Cargo: waiting on a broken gangway retains repair history at different refresh rates', () => {
  for (const fps of [30, 60, 144]) {
    const { time, bridge, tick } = gangwayHarness()
    const fragments = bridge.group.getObjectByName('cargo-repair-splinters')
    const intactFragments = Array.from(fragments.instanceMatrix.array)
    tick(14, fps)
    assert.notDeepEqual(Array.from(fragments.instanceMatrix.array), intactFragments)
    assert.ok(bridge.state.angle > 1)
    assert.ok(bridge.supports.every((s) => s.maxX < s.minX))
    time.triggerRewind()
    tick(0.34, fps)
    assert.ok(bridge.state.angle < 0.01, `${fps} FPS restores an intact deck after waiting`)
    assert.deepEqual(Array.from(fragments.instanceMatrix.array), intactFragments, 'repair fragments return with the actual rewound deck')
    time.triggerFreeze()
    const clock = bridge.state.clock
    tick(1.5, fps)
    assert.equal(bridge.state.clock, clock)
    assert.ok(bridge.supports.every((s) => s.maxX > s.minX))
    assert.ok(time.getEnergy() > 40, 'repair plus crossing fits one full energy bar')
    time.dispose()
  }
})

test('Cargo: Freeze holds the actual failed pose rather than repairing it', () => {
  const { time, bridge, tick } = gangwayHarness()
  tick(1.5)
  time.triggerFreeze()
  tick(1)
  assert.ok(bridge.state.angle > 1)
  assert.ok(bridge.supports.every((s) => s.maxX < s.minX))
  assert.ok(bridge.group.getObjectByName('cargo-gangway-approach-leaf').rotation.x < -1)
  time.dispose()
})

test('Cargo: fixed hinge stops remain on solid lips through failure and restoration', () => {
  const { time, bridge, layout, tick } = gangwayHarness()
  try {
    const stops = bridge.group.getObjectByName('cargo-gangway-fixed-hinge-stops')
    assert.equal(stops.userData.noCameraCollision, true)
    assert.equal(stops.castShadow, false)
    const vertices = stops.geometry.attributes.position
    for (let i = 0; i < vertices.count; i++) {
      const z = vertices.getZ(i)
      assert.ok(z <= layout.minZ + 1e-6 || z >= layout.maxZ - 1e-6, 'a stop cannot fill the opening')
    }
    const fixed = stops.matrix.clone()
    tick(14)
    assert.equal(bridge.supports.every(s => s.maxX < s.minX), true)
    assert.ok(stops.matrix.equals(fixed), 'broken leaf must not pull the fixed reference down')
    time.triggerRewind(); tick(0.34); time.triggerFreeze(); tick(0.2)
    assert.ok(stops.matrix.equals(fixed))
    assert.ok(bridge.state.angle < 0.01)
    assert.equal(bridge.supports.length, 24)
    assert.ok(bridge.supports.every(s => Math.abs(s.y - 0.1) < 1e-6))
  } finally { time.dispose() }
})

test('Cargo: floor opening reaches both walls and leaves intact approach/landing geometry', () => {
  const scene = new THREE.Scene()
  const span = { minZ: 20, maxZ: 48, center: 34 }
  const layout = cargoGangwayLayout(span.center, 2.6)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 28), new THREE.MeshBasicMaterial())
  floor.rotation.x = -Math.PI / 2
  floor.position.z = span.center
  scene.add(floor)
  cutCargoGangwayFloor(floor, span, layout)
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
  for (const x of [-2.59, -1, 0, 1, 2.59]) {
    ray.ray.origin.set(x, 2, (layout.minZ + layout.maxZ) / 2)
    assert.equal(ray.intersectObject(floor).length, 0)
  }
  for (const z of [layout.maxZ + 1, layout.minZ - 0.6]) {
    ray.ray.origin.set(0, 2, z)
    assert.ok(ray.intersectObject(floor).length > 0)
  }
  for (const clock of [-18, -9, 0, 9, 18]) {
    const pose = cargoLoopPose(clock)
    assert.equal(pose.door, 1)
    assert.equal(pose.beam, 0)
  }
})

function levelHarness() {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
  const scene = new THREE.Scene()
  const player = createPlayer()
  const messages = []
  const hud = new Proxy({ showToast: (message) => messages.push(message) }, {
    get: (target, key) => target[key] ?? (() => {})
  })
  const time = createTimeSystem({ scene, player, hud })
  const respawn = createRespawnSystem({ player, hud, timeSystem: time, camera: { snap() {} } })
  const level = createTimewreckLevel({ scene, player, hud, timeSystem: time, respawn,
    interaction: { register: () => () => {}, registerBlocker: () => () => {}, flashPrompt() {} },
    camera: { snap() {} }, advance() {}, startCarriage: 'cargo'
  })
  player.setPose(level.checkpoint.position, Math.PI)
  respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  const span = level.getCarriageVolumes().find((v) => v.key === 'cargo')
  const center = (span.minZ + span.maxZ) / 2
  const gap = cargoGangwayLayout(center, 2.6)
  const tick = (seconds, keys = {}) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      const dt = Math.min(1 / 60, seconds - t)
      time.update(dt)
      level.update(dt)
      player.update(dt, { keyboard: keys, cameraYaw: Math.PI, bounds: level.bounds,
        obstacles: level.obstacles, supports: level.supports, voids: level.voids })
    }
  }
  const dispose = () => { respawn.dispose(); level.dispose(); time.dispose() }
  return { scene, player, time, respawn, level, center, gap, tick, dispose, messages }
}

test('Cargo integration: actual player crosses the repaired frozen deck, rests, then clears the loop', () => {
  const h = levelHarness()
  try {
    h.tick(13)
    h.scene.updateMatrixWorld(true)
    const floorRay = new THREE.Raycaster(
      new THREE.Vector3(0, 2, (h.gap.minZ + h.gap.maxZ) / 2), new THREE.Vector3(0, -1, 0)
    )
    assert.equal(floorRay.intersectObject(h.scene.getObjectByName('floor-cargo')).length, 0)
    assert.equal(floorRay.intersectObject(h.scene.getObjectByName('cargo-train-tracks'), true).length, 0,
      'decorative deck and rails must not cover the new opening')
    const leaf = h.scene.getObjectByName('cargo-gangway-approach-leaf')
    assert.ok(leaf.rotation.x < -1)
    h.time.triggerRewind()
    h.tick(0.34)
    h.time.triggerFreeze()
    h.player.setPose(new THREE.Vector3(0, 0, h.gap.maxZ + 0.3), Math.PI)
    h.tick(0.9, { forward: true, run: true })
    assert.ok(h.player.mesh.position.z < h.gap.minZ, 'player reaches the intact landing')
    assert.ok(h.player.mesh.position.y >= 0, 'real support prevents falling')
    assert.equal(h.respawn.isFailing(), false)
    h.time.setMode('NORMAL')
    h.tick(4)
    assert.equal(h.time.getEnergy(), 100, 'landing allows full recharge')
    const door = h.scene.getObjectByName('cargo-loop-door')
    for (let i = 0; i < 600 && door.position.y < 3.49; i++) h.tick(1 / 60)
    assert.ok(door.position.y > 3.49)
    h.time.triggerFreeze()
    const y = door.position.y
    h.tick(1.15, { forward: true, run: true })
    assert.ok(h.player.mesh.position.z < h.center - 2.7, 'player clears door and overhead load')
    assert.equal(door.position.y, y, 'Freeze holds the open bulkhead')
    assert.equal(h.respawn.isFailing(), false)
  } finally { h.dispose() }
})

test('Cargo integration: a partially shut frozen bulkhead still collides with the player body', () => {
  const h = levelHarness()
  try {
    h.tick(3.1)
    const door = h.scene.getObjectByName('cargo-loop-door')
    assert.ok(door.position.y > 2 && door.position.y < 2.8)
    h.time.triggerFreeze()
    h.player.setPose(new THREE.Vector3(0, 0, h.center + 2), Math.PI)
    h.tick(1 / 60)
    assert.equal(h.respawn.isFailing(), true,
      'Freeze cannot make a door harmless while it intersects the body')
  } finally { h.dispose() }
})

test('Cargo integration: gap falls and repeated checkpoint resets restore usable geometry and history', () => {
  const h = levelHarness()
  try {
    const leaf = h.scene.getObjectByName('cargo-gangway-approach-leaf')
    for (let attempt = 0; attempt < 3; attempt++) {
      h.tick(1.3)
      assert.ok(leaf.rotation.x < -1)
      h.player.setPose(new THREE.Vector3(0, 0, (h.gap.minZ + h.gap.maxZ) / 2), Math.PI)
      h.tick(0.4)
      assert.equal(h.respawn.isFailing(), true, 'unsupported player actually falls')
      h.respawn.cancel()
      h.respawn.respawn()
      assert.ok(h.player.mesh.position.z > h.gap.maxZ + 2)
      assert.equal(Math.abs(leaf.rotation.x), 0)
      assert.equal(h.time.getMode(), 'NORMAL')
      assert.ok(h.time.getEnergy() >= 50)
    }
    h.tick(12)
    h.time.triggerRewind()
    h.tick(0.34)
    h.time.triggerFreeze()
    assert.ok(Math.abs(leaf.rotation.x) < 0.01, 'fresh baseline still repairs after repeated resets')
    assert.ok(h.level.supports.some((s) => s.minZ > h.gap.minZ && s.maxZ < h.gap.maxZ && s.maxX > s.minX))
  } finally { h.dispose() }
})

test('Cargo alternate: early Freeze preserves intact gangway for an actual sprint crossing', () => {
  const h = levelHarness()
  try {
    h.time.triggerFreeze()
    h.tick(1.5, {forward:true,run:true})
    assert.ok(h.player.mesh.position.z<h.gap.minZ)
    assert.ok(h.player.mesh.position.z>h.center+2.2,'stops on landing before bulkhead')
    assert.ok(h.player.mesh.position.y>=0)
    assert.equal(h.respawn.isFailing(),false)
    assert.ok(h.time.getEnergy()>55)
  } finally {h.dispose()}
})

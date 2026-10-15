import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createWreckConnector, CONNECTOR } from '../src/levels/timewreck-connector.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { disposeObject } from '../src/core/dispose.js'

const schedules = [30, 60, 144, [1 / 144, 1 / 30, 0.1, 1 / 60]]
function harness(schedule) {
  const root = new THREE.Group(), player = createPlayer(), scene = new THREE.Scene()
  const spans = { convergence: { minZ: 0, maxZ: 40, center: 20 }, mechanical: { minZ: -30, maxZ: 0, center: -15 } }
  for (const [key, span] of Object.entries(spans)) {
    const group = new THREE.Group(); group.position.z = span.center; root.add(group)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.2, span.maxZ - span.minZ), new THREE.MeshBasicMaterial())
    floor.name = `floor-${key}`; floor.rotation.x = -Math.PI / 2; group.add(floor)
    for (const x of [-2.36, 2.36]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, span.maxZ - span.minZ - 2), floor.material)
      strip.position.set(x, 0.012, 0); strip.name = `${key}-floor-edge`; group.add(strip)
    }
  }
  const time = createTimeSystem({ scene, player }), unregisters = []
  let warnings = 0, frame = 0
  const connector = createWreckConnector({ root, spans, player, timeSystem: time, unregisters, warn() { warnings++ } })
  const pose = (x, z) => player.setPose(new THREE.Vector3(x, 0, z), Math.PI)
  function tick(seconds, keyboard = {}) {
    for (let t = 0; t < seconds - 1e-9;) {
      const dt = Math.min(Array.isArray(schedule) ? schedule[frame++ % schedule.length] : 1 / schedule, seconds - t)
      t += dt; time.update(dt); connector.update()
      player.update(dt, { keyboard, cameraYaw: Math.PI, supports: connector.supports, voids: [connector.gap] })
    }
  }
  return { root, player, time, connector, pose, tick, get warnings() { return warnings },
    dispose() { unregisters.forEach(fn => fn()); time.dispose(); disposeObject(root); disposeObject(player.mesh) } }
}

test('N7: prompt walking, early Freeze and Slow cross the actual connector at fixed/mixed rates', () => {
  for (const fps of schedules) for (const mode of ['NORMAL', 'FREEZE', 'SLOW']) {
    const h = harness(fps)
    try {
      h.pose(0, 3); h.time.resetForCheckpoint({ energy: 50 })
      if (mode !== 'NORMAL') h.time.setMode(mode)
      h.tick(1.45, { forward: true })
      assert.ok(h.player.mesh.position.z < -2.5, `${fps}/${mode}: reaches permanent landing`)
      assert.equal(h.player.mesh.position.y, 0)
      assert.ok(h.time.getEnergy() > 9)
      assert.equal(h.warnings, 1)
    } finally { h.dispose() }
  }
})

test('N7: idle retains repair history, frozen broken leaves stay unsupported, and sprint jump remains valid', () => {
  for (const fps of schedules) {
    const h = harness(fps)
    try {
      h.pose(0, 3); h.tick(26)
      assert.ok(h.connector.angle > 1)
      h.time.triggerFreeze(); h.tick(1.1, { forward: true })
      assert.ok(h.player.mesh.position.y < -0.65, 'dangerous Freeze does not create a bridge')
      h.pose(0, 3); h.time.setMode('NORMAL'); h.tick(7)
      h.time.triggerRewind()
      for (let i = 0; h.connector.angle > 0.01; i++) {
        assert.ok(i < 100); h.tick(0.02)
      }
      h.time.triggerFreeze(); h.tick(1.45, { forward: true })
      assert.ok(h.player.mesh.position.z < -2.5)
      assert.equal(h.player.mesh.position.y, 0)
      h.pose(0, 3); h.time.setMode('NORMAL'); h.tick(7)
      // A sprint jump is an allowed alternate, even over fully broken leaves.
      h.pose(0, 1.75); h.tick(0.8, { forward: true, run: true, jump: true })
      assert.ok(h.player.mesh.position.z < -1.2)
      assert.equal(h.player.mesh.position.y, 0)
    } finally { h.dispose() }
  }
})

test('N7: both floors/edge strips expose the full gap and supported strips match moving leaf surfaces', () => {
  const h = harness(60)
  try {
    const fragments = h.connector.group.getObjectByName('connector-repair-splinters')
    const intactFragments = Array.from(fragments.instanceMatrix.array)
    const surfaces = []
    h.root.traverse(n => { if (/^(floor-|convergence-floor-edge|mechanical-floor-edge)/.test(n.name)) surfaces.push(n) })
    h.root.updateMatrixWorld(true)
    for (const x of [-2.59, -2.36, 0, 2.36, 2.59]) for (const z of [-1.1, -0.1, 0.1, 1.1]) {
      assert.equal(new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0)).intersectObjects(surfaces).length, 0)
    }
    h.pose(0, 3); h.tick(CONNECTOR.warning + 0.13)
    h.time.triggerFreeze(); h.tick(0.01); h.root.updateMatrixWorld(true)
    assert.ok(h.connector.angle > 0 && h.connector.angle < CONNECTOR.walkable)
    for (const s of h.connector.supports.slice(0, 24)) {
      const z = (s.minZ + s.maxZ) / 2
      const hits = new THREE.Raycaster(new THREE.Vector3(0, 1, z), new THREE.Vector3(0, -1, 0)).intersectObject(h.connector.group, true)
      assert.ok(Math.abs(hits[0].point.y - s.y) < 0.001)
    }
    h.time.setMode('NORMAL'); h.tick(1)
    assert.notDeepEqual(Array.from(fragments.instanceMatrix.array), intactFragments)
    assert.ok(h.connector.supports.slice(0, 24).every(s => s.maxX < s.minX))
    h.connector.reset()
    assert.deepEqual(Array.from(fragments.instanceMatrix.array), intactFragments, 'reset restores visible splinters with supports')
    assert.equal(h.connector.clock, -1)
    assert.ok(h.connector.supports.slice(0, 24).every(s => s.minX < s.maxX && s.y === CONNECTOR.top))
  } finally { h.dispose() }
})

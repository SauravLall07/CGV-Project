import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createWreckSpatial } from '../src/levels/timewreck-spatial.js'
import { createPlayer } from '../src/entities/player.js'
import { disposeObject } from '../src/core/dispose.js'

function harness(fps) {
  const root = new THREE.Group(), obstacles = [], player = createPlayer()
  const spans = Object.fromEntries(['vault', 'convergence', 'relay', 'security'].map((key, i) =>
    [key, { center: -60 * i, minZ: -60 * i - 20, maxZ: -60 * i + 20 }]))
  const spatial = createWreckSpatial({ root, spans, player, obstacles })
  const pose = (key, x, z) => player.setPose(new THREE.Vector3(x, 0, spans[key].center + z), Math.PI)
  const tick = (seconds, keyboard = {}) => {
    for (let t = 0; t < seconds - 1e-9;) {
      const dt = Math.min(1 / fps, seconds - t); t += dt
      player.update(dt, { keyboard, cameraYaw: Math.PI, obstacles, supports: spatial.supports })
    }
  }
  return { root, player, obstacles, spans, spatial, pose, tick, dispose() { disposeObject(root); disposeObject(player.mesh) } }
}

test('N4: Vault arm blocks its visible footprint, leaves the left lane and both observation pads safe', () => {
  for (const fps of [30, 60, 144]) {
    const h = harness(fps)
    try {
      h.pose('vault', 0, -1.5); h.tick(0.3, { forward: true })
      assert.ok(h.player.mesh.position.z > -1.73)
      h.tick(0.16, { left: true }); h.tick(0.4, { forward: true })
      assert.ok(h.player.mesh.position.z < -2.9, 'walks the visible left lane')
      for (const z of [0.8, -2.9]) {
        h.pose('vault', 0, z); h.tick(0.2)
        assert.equal(h.player.mesh.position.x, 0)
        assert.equal(h.player.mesh.position.z, z)
      }
    } finally { h.dispose() }
  }
})

test('N4: threshold support matches the actual geometry top across its full width', () => {
  const h = harness(60)
  try {
    h.root.updateMatrixWorld(true)
    const s = h.spatial.supports[0]
    for (const x of [-2.4, 0, 2.4]) {
      const hits = new THREE.Raycaster(new THREE.Vector3(x, 1, (s.minZ + s.maxZ) / 2),
        new THREE.Vector3(0, -1, 0)).intersectObject(h.spatial.groups[1], true)
      assert.ok(Math.abs(hits[0].point.y - s.y) < 1e-6)
    }
  } finally { h.dispose() }
})

test('N5: Security locker cannot push arrival/takeoff lanes into holes; centre spawn remains clear', () => {
  for (const fps of [30, 60, 144]) {
    const h = harness(fps), c = h.spans.security.center
    try {
      h.pose('security', -1.8, 1.05); h.tick(0.2, { forward: true })
      assert.ok(h.player.mesh.position.z >= c + 0.77, 'locker blocks walking through its face')
      for (const z of [1.05, -1.05]) {
        h.pose('security', -1.8, z); h.tick(0.6, { right: true })
        assert.ok(h.player.mesh.position.x > 0.59)
        assert.ok(Math.abs(h.player.mesh.position.z - (c + z)) < 0.001)
      }
      for (let retry = 0; retry < 3; retry++) {
        h.pose('security', 0, 0); h.tick(0.2)
        assert.equal(h.player.mesh.position.x, 0)
        assert.equal(h.player.mesh.position.z, c)
      }
    } finally { h.dispose() }
  }
})

test('N4/N5: teardown removes only owned collision/support entries and releases merged resources once', () => {
  const h = harness(60)
  const foreign = { minX: 10, maxX: 11, minZ: 10, maxZ: 11, y: 0 }
  h.obstacles.push(foreign)
  const supports = [...h.spatial.supports, foreign]
  const resources = new Set(), counts = new Map()
  h.root.traverse(n => { if (n.geometry) resources.add(n.geometry); if (n.material) resources.add(n.material) })
  for (const r of resources) r.addEventListener('dispose', () => counts.set(r, (counts.get(r) ?? 0) + 1))
  h.spatial.dispose(supports); h.spatial.dispose(supports)
  assert.deepEqual(h.obstacles, [foreign])
  assert.deepEqual(supports, [foreign])
  h.dispose()
  assert.equal(counts.size, resources.size)
  assert.ok([...counts.values()].every(count => count === 1))
})

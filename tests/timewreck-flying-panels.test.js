import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createFlyingPanels } from '../src/levels/timewreck-flying-panels.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { disposeObject } from '../src/core/dispose.js'

const keys = ['vault', 'convergence', 'mechanical', 'cargo', 'relay', 'security', 'passenger', 'cab']
function harness(fps = 60, seed = 12345) {
  const root = new THREE.Group(), player = { mesh: new THREE.Group(), isCrouching: () => false }
  const spans = Object.fromEntries(keys.map((key, i) => [key, { minZ: -i * 30, maxZ: -i * 30 + 20 }]))
  const time = createTimeSystem({ scene: root, player }), unregisters = [], failures = []
  const panels = createFlyingPanels({ root, spans, player, timeSystem: time, unregisters,
    fail: m => failures.push(m), seed })
  let frame = 0
  function tick(seconds, active = true) {
    for (let t = 0; t < seconds - 1e-9;) {
      const dt = Math.min(Array.isArray(fps) ? fps[frame++ % fps.length] : 1 / fps, seconds - t)
      time.update(dt); panels.update(active); t += dt
    }
  }
  const enter = key => {
    player.mesh.position.set(0, 0, (spans[key].minZ + spans[key].maxZ) / 2)
    panels.update()
    return root.getObjectByName(`${key}-flying-brown-panel`)
  }
  return { root, player, spans, time, panels, failures, tick, enter,
    dispose() { unregisters.forEach(fn => fn()); time.dispose(); disposeObject(root) } }
}

test('first two escape cars have six obstacles, later cars have eight; each launch varies and flies towards the player', () => {
  const h = harness()
  try {
    const sizes = new Set(), speeds = new Set(), origins = new Set(), directions = new Set()
    for (const key of keys) {
      h.panels.reset(); h.enter(key)
      const meshes = h.panels.group.children.filter(m => m.name.startsWith(`${key}-flying-brown-panel`))
      assert.equal(meshes.length, ['vault', 'convergence'].includes(key) ? 6 : 8, key)
      const firstLaunches = new Map(), flightSizes = new Set()
      let previous = meshes.map(m => ({ visible: m.visible, position: m.position.clone() }))
      for (let t = 0; t < 40; t += 0.05) {
        h.tick(0.05)
        meshes.forEach((mesh, i) => {
          const last = previous[i]
          if (mesh.visible) {
            const { minZ, maxZ } = h.spans[key]
            if (!last.visible) assert.ok(mesh.position.z < minZ, 'new debris enters from beyond the far end')
            if (mesh.position.z >= minZ && mesh.position.z <= maxZ) {
              assert.equal(mesh.material.opacity, 1, 'lethal debris stays fully visible inside the carriage')
            }
            sizes.add(mesh.scale.toArray().join(','))
            flightSizes.add(mesh.scale.toArray().join(','))
            const dz = mesh.position.z - last.position.z
            if (last.visible && Math.abs(dz) > 0.01 && Math.abs(dz) < 0.6) {
              assert.equal(mesh.position.x, last.position.x, 'a flight never steers sideways')
              assert.equal(mesh.position.y, last.position.y)
              speeds.add(Math.round(Math.abs(dz) / 0.05 * 100))
              directions.add(Math.sign(dz))
              if (!firstLaunches.has(i)) firstLaunches.set(i, t)
            } else if (!last.visible) origins.add(mesh.position.toArray().join(','))
          } else if (last.visible) assert.ok(last.position.z > h.spans[key].maxZ,
            'debris exits the carriage before disappearing')
        })
        previous = meshes.map(m => ({ visible: m.visible, position: m.position.clone() }))
      }
      const launches = [...firstLaunches.values()]
      assert.equal(launches.length, meshes.length)
      assert.equal(new Set(launches).size, meshes.length, 'first launches are staggered')
      assert.ok(flightSizes.size > meshes.length, 'later volleys get new sizes')
      assert.equal(h.failures.length, 0, 'the centre leaves room to dodge')
    }
    assert.ok(sizes.size > 30 && speeds.size > 20 && origins.size > 30)
    assert.deepEqual([...directions], [1], 'all flights approach from ahead of the player running in -Z')
  } finally { h.dispose() }
})

test('oncoming wreckage fades in beyond the far end before entering the carriage', () => {
  const h = harness()
  try {
    const mesh = h.enter('vault'), { minZ } = h.spans.vault
    assert.ok(mesh.position.z < minZ)
    assert.equal(mesh.material.opacity, 0)
    h.tick(0.3)
    assert.ok(mesh.material.opacity > 0 && mesh.material.opacity < 1)
    assert.ok(mesh.position.z < minZ, 'the warning fades in at its distant source')
    h.tick(0.6)
    assert.equal(mesh.material.opacity, 1)
    const z = mesh.position.z
    h.tick(0.1)
    assert.ok(mesh.position.z > z, 'flight advances towards the approaching player')
  } finally { h.dispose() }
})

test('every randomized obstacle is lethal, including scaled crates and beams, at fixed/mixed frame rates', () => {
  for (const fps of [10, 30, 60, 144, [1/144, 1/30, 0.1, 1/60]]) {
    const h = harness(fps)
    try {
      for (const key of keys) {
        const meshes = h.panels.group.children.filter(m => m.name.startsWith(`${key}-flying-brown-panel`))
        for (const mesh of meshes) {
          h.panels.reset(); h.enter(key)
          for (let i = 0; !mesh.visible || mesh.material.opacity === 0; i++) { assert.ok(i < 100); h.tick(0.1) }
          h.player.mesh.position.copy(mesh.position); h.player.mesh.position.y -= 0.4
          const before = h.failures.length
          h.panels.update()
          assert.equal(h.failures.length, before + 1, `${mesh.name}/${fps}`)
        }
      }
    } finally { h.dispose() }
  }
})

test('small fragments vary by carriage, move with time controls and never kill on contact', () => {
  const h = harness()
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scrapLayouts = new Set()
  try {
    for (const key of keys) {
      h.panels.reset(); h.time.resetForCheckpoint(); h.enter(key); h.tick(2.2)
      const scrap = h.root.getObjectByName(`${key}-flying-small-debris`)
      assert.equal(scrap.count, 6)
      scrapLayouts.add(Array.from(scrap.instanceMatrix.array).join(','))
      scrap.getMatrixAt(2, matrix); position.setFromMatrixPosition(matrix)
      const before = position.z
      h.tick(0.1)
      scrap.getMatrixAt(2, matrix); position.setFromMatrixPosition(matrix)
      assert.notEqual(position.z, before)
      h.time.triggerFreeze(); h.tick(0.1)
      const held = Array.from(scrap.instanceMatrix.array)
      h.tick(0.1)
      assert.deepEqual(Array.from(scrap.instanceMatrix.array), held)
      // Isolate small-fragment contact from the independently lethal large objects.
      h.panels.group.children.filter(m => !m.isInstancedMesh).forEach(m => { m.visible = false })
      for (let i = 0; i < scrap.count; i++) {
        scrap.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix)
        h.player.mesh.position.copy(position); h.player.mesh.position.y -= 0.3
        h.panels.update()
      }
      assert.equal(h.failures.length, 0, `${key}: all six small fragments are harmless`)
    }
    assert.equal(scrapLayouts.size, keys.length)
  } finally { h.dispose() }
})

function poses(h) {
  return h.panels.group.children.filter(m => !m.isInstancedMesh).map(m => ({
    visible: m.visible, position: m.position.toArray(), scale: m.scale.toArray(), color: m.material.color.getHex(),
    opacity: m.material.opacity
  }))
}

test('seeded random flights replay exactly through Rewind and retry; a new seed produces a new layout', () => {
  const h = harness(), other = harness(60, 54321)
  try {
    h.enter('vault'); other.enter('vault')
    const initial = poses(h)
    assert.notDeepEqual(poses(other), initial)
    h.tick(7.8)
    const saved = poses(h)
    h.tick(0.4)
    assert.notDeepEqual(poses(h), saved)
    h.time.triggerRewind(); h.tick(0.16)
    poses(h).forEach((pose, i) => {
      assert.equal(pose.color, saved[i].color)
      assert.deepEqual(pose.scale, saved[i].scale)
      assert.equal(pose.visible, saved[i].visible)
      assert.ok(Math.abs(pose.opacity - saved[i].opacity) < 1e-6)
      pose.position.forEach((value, axis) => assert.ok(Math.abs(value - saved[i].position[axis]) < 1e-6))
    })
    h.panels.reset(); h.time.resetForCheckpoint(); h.enter('vault')
    assert.deepEqual(poses(h), initial)
  } finally { h.dispose(); other.dispose() }
})

test('randomized flights obey Slow, Freeze and disabled presentation', () => {
  const h = harness()
  try {
    const mesh = h.enter('mechanical')
    h.tick(1.1)
    const z = mesh.position.z
    h.tick(0.1)
    const velocity = (mesh.position.z - z) / 0.1
    const beforeSlow = mesh.position.z
    h.time.triggerSlow(); h.tick(0.5)
    assert.ok(Math.abs(mesh.position.z - beforeSlow - velocity * 0.1) < 1e-6)
    h.time.triggerFreeze()
    const held = poses(h)
    h.tick(0.4)
    assert.deepEqual(poses(h), held)
    h.time.setMode('NORMAL'); h.panels.update(false)
    h.tick(0.4, false)
    assert.deepEqual(poses(h), held)
    h.panels.reset()
    assert.ok(h.panels.group.children.every(p => !p.visible))
    assert.equal(h.failures.length, 0)
  } finally { h.dispose() }
})

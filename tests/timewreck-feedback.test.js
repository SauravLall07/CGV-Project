import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createWreckFeedback, WRECK_VIGNETTES } from '../src/levels/timewreck-feedback.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { disposeObject } from '../src/core/dispose.js'

function harness(schedule = 60) {
  const scene = new THREE.Scene(), root = new THREE.Group(), player = { mesh: new THREE.Group() }
  scene.add(root)
  const time = createTimeSystem({ scene, player }), unregisters = [], cues = []
  const spans = Object.fromEntries(['vault', 'convergence', 'cargo', 'passenger'].map((key, i) => [key, { center: -50 * i }]))
  let factor = 1, frame = 0
  const feedback = createWreckFeedback({ root, spans, player, timeSystem: time, unregisters,
    cue: kind => cues.push(kind), playbackScale: () => factor })
  const tick = (seconds, active = true) => {
    for (let t = 0; t < seconds - 1e-9;) {
      const dt = Math.min(Array.isArray(schedule) ? schedule[frame++ % schedule.length] : 1 / schedule, seconds - t)
      t += dt; time.update(dt); feedback.update(active)
    }
  }
  const approach = spec => player.mesh.position.set(0, 0, spans[spec.key].center + spec.triggerNear - 0.1)
  return { root, scene, player, time, feedback, spans, cues, tick, approach,
    scale(value) { factor = value }, dispose() { feedback.stop(); unregisters.forEach(fn => fn()); time.dispose(); disposeObject(root) } }
}

test('N8: all vignettes share actual Slow/Freeze/Rewind snapshots with bounded cues at fixed/mixed rates', () => {
  for (const fps of [30, 60, 144, [1/144, 1/30, 0.1, 1/60]]) for (const spec of WRECK_VIGNETTES) {
    const h = harness(fps)
    try {
      h.approach(spec); h.tick(0.05)
      assert.deepEqual(h.cues, [spec.key])
      h.time.triggerSlow(); h.tick(0.5)
      const index = WRECK_VIGNETTES.indexOf(spec), clock = h.feedback.capture().events[index].clock
      assert.ok(clock > 0.09 && clock < 0.16)
      h.time.triggerFreeze()
      const frozen = h.feedback.capture(); h.tick(0.3)
      assert.deepEqual(h.feedback.capture(), frozen, 'Freeze holds real phase, valuables and pose')
      h.time.setMode('NORMAL'); h.tick(2)
      const node = h.root.getObjectByName(`${spec.key}-background-vignette`), end = node.position.clone()
      h.time.triggerRewind(); h.tick(0.7)
      assert.ok(node.position.distanceTo(end) > 0.2, 'rewind visibly returns debris toward its source')
      assert.deepEqual(h.cues, [spec.key], 'rewinding cannot replay event audio')
      h.time.setMode('NORMAL'); h.tick(2)
      assert.ok(node.position.distanceTo(end) < 1e-6)
      assert.deepEqual(h.cues, [spec.key])
    } finally { h.dispose() }
  }
})

test('N8: checkpoint capture, pause, braking scale, held-time trigger and completion retain coherent progress', () => {
  const h = harness()
  try {
    const spec = WRECK_VIGNETTES[0]
    h.approach(spec); h.tick(0.3)
    const saved = h.feedback.capture()
    h.feedback.setPaused(true); h.tick(0.5)
    assert.deepEqual(h.feedback.capture(), saved)
    h.feedback.setPaused(false); h.scale(0.5); h.tick(0.2)
    assert.ok(Math.abs(h.feedback.capture().events[0].clock - saved.events[0].clock - 0.1) < 1e-6)
    h.feedback.restore(saved); h.time.resetForCheckpoint(h.time.captureCheckpointState())
    assert.deepEqual(h.feedback.capture(), saved, 'checkpoint pose is restored before history reset')
    h.scale(0); h.tick(0.2)
    assert.deepEqual(h.feedback.capture(), saved, 'settled braking scale halts motion')
    h.feedback.stop(); h.scale(1); h.tick(0.5)
    assert.deepEqual(h.feedback.capture(), saved, 'skip/completion cannot animate stale events')
    h.feedback.restore(saved); h.scale(1)
    h.approach(WRECK_VIGNETTES[1]); h.time.triggerFreeze(); h.tick(0.1)
    assert.equal(h.feedback.capture().events[1].clock, 0)
    assert.deepEqual(h.cues, ['convergence'], 'frozen activation has no late or repeated audio cue')
    h.time.setMode('NORMAL'); h.tick(0.1)
    assert.deepEqual(h.cues, ['convergence'])
  } finally { h.dispose() }
})

test('N8: non-support debris stays outside route through full motion and uses stable, disposed resources', () => {
  const h = harness()
  const resources = new Set(), disposed = new Map()
  h.root.traverse(n => {
    assert.ok(!n.isLight && !n.castShadow)
    assert.equal(n.userData.noCameraCollision, n === h.root ? undefined : true)
    if (n.geometry) resources.add(n.geometry)
    if (n.material) { resources.add(n.material); assert.equal(n.material.transparent, false) }
  })
  for (const r of resources) r.addEventListener('dispose', () => disposed.set(r, (disposed.get(r) ?? 0) + 1))
  try {
    for (const spec of WRECK_VIGNETTES) {
      h.approach(spec)
      for (let i = 0; i < 40; i++) {
        h.tick(0.05); h.root.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(h.root.getObjectByName(`${spec.key}-background-vignette`))
        assert.ok(spec.x < 0 ? bounds.max.x < -2.6 : bounds.min.x > 2.6, `${spec.key}: outside playable shell`)
      }
    }
    const after = new Set()
    h.root.traverse(n => { if (n.geometry) after.add(n.geometry); if (n.material) after.add(n.material) })
    assert.deepEqual(after, resources, 'no per-frame geometry/material replacement')
  } finally { h.dispose() }
  assert.equal(disposed.size, resources.size)
  assert.ok([...disposed.values()].every(count => count === 1))
})

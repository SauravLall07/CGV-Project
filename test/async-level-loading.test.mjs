import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import * as THREE from 'three'
import { createLevelManager } from '../src/core/level-manager.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(t, load) {
  const previous = globalThis.requestAnimationFrame, frames = [], events = [], resets = [], poses = []
  const incoming = [], checkpoints = [], errors = [], warnings = []
  let shown = 0, hidden = 0, failed = 0, disposed = 0, updated = 0, loads = 0
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length }
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', (...args) => errors.push(args))
  t.mock.method(console, 'warn', (...args) => warnings.push(args))
  const opening = { objective: 'opening', checkpoint: { position: new THREE.Vector3(), yaw: 0 },
    update() { updated++ }, dispose() { disposed++ } }
  const factory = ctx => {
    incoming.push(ctx)
    return { objective: 'next', checkpoint: { position: new THREE.Vector3(1, 2, 3), yaw: 1.5 }, dispose() {} }
  }
  const manager = createLevelManager({
    scene: new THREE.Scene(), assets: {}, hud: { setObjective() {} },
    interaction: { setEnabled: value => events.push(['input', value]) },
    player: { setPose: (...args) => poses.push(args) }, camera: { setYaw() {}, snap() {} },
    respawn: { reset() {}, setCheckpoint: (...args) => checkpoints.push(args) },
    loadingScreen: { show() { shown++ }, hide() { hidden++ }, setError() { failed++ } },
    timeSystem: { resetForLevel: options => resets.push(options), resetForRun() {} },
    onEnter: state => events.push(['enter', state]),
    levels: [
      { state: 'Opening', create: () => opening },
      { state: 'Later', load: () => { loads++; return load(factory) } },
      { state: 'Complete', keepPrevious: true, create: () => ({ dispose() {} }) }
    ]
  })
  manager.adopt('Opening', opening)
  t.after(() => { manager.dispose(); globalThis.requestAnimationFrame = previous })
  return { manager, factory, opening, frames, events, resets, poses, incoming, checkpoints, errors, warnings,
    frame() { for (const fn of frames.splice(0)) fn() },
    get counts() { return { shown, hidden, failed, disposed, updated, loads } } }
}

test('cold async transition waits under overlay, preserves checkpoint/options/energy and final presentation frame', async t => {
  const gate = deferred(), f = fixture(t, () => gate.promise)
  f.manager.enter('Later', { preserveEnergy: true, levelOptions: { startAt: 'relay' } })
  f.frame(); f.frame()
  await setImmediate()
  f.manager.update(1)
  assert.equal(f.counts.loads, 1)
  assert.equal(f.counts.disposed, 0, 'keep outgoing scene until module resolution succeeds')
  assert.equal(f.counts.updated, 0, 'outgoing gameplay is frozen during import')
  assert.equal(f.counts.shown, 1)
  assert.equal(f.counts.hidden, 0)
  assert.equal(f.manager.isTransitioning(), true)
  gate.resolve(f.factory)
  await setImmediate()
  assert.equal(f.counts.disposed, 1)
  assert.equal(f.incoming[0].startAt, 'relay')
  assert.deepEqual(f.resets.at(-1), { preserveEnergy: true })
  assert.deepEqual(f.poses.at(-1)[0].toArray(), [1, 2, 3])
  assert.equal(f.checkpoints.at(-1)[1], 1.5)
  assert.equal(f.counts.hidden, 0, 'build completion is not presentation completion')
  f.frame()
  assert.equal(f.manager.isTransitioning(), false)
  assert.equal(f.counts.hidden, 1)
  assert.deepEqual(f.events.at(-1), ['input', true])
  f.manager.restart()
  f.frame(); f.frame(); f.frame()
  assert.equal(f.counts.loads, 1, 'successful factory is cached for restart')
  assert.equal(f.incoming.at(-1).startAt, 'relay')
})

for (const cancel of ['unload', 'adopt', 'restart']) {
  test(`late import after ${cancel} never constructs or changes the replacement scene`, async t => {
    const gate = deferred(), f = fixture(t, () => gate.promise)
    f.manager.enter('Later')
    f.frame(); f.frame()
    await setImmediate()
    if (cancel === 'adopt') f.manager.adopt('Opening', f.opening)
    else f.manager[cancel]()
    f.frame(); f.frame(); f.frame()
    const hiddenBefore = f.counts.hidden
    gate.resolve(f.factory)
    await setImmediate()
    f.frame()
    assert.equal(f.incoming.length, 0)
    assert.equal(f.counts.hidden, hiddenBefore, 'late completion does not dismiss a newer overlay')
    assert.equal(f.manager.getState(), cancel === 'unload' ? null : 'Opening')
    assert.equal(f.manager.isTransitioning(), false)
  })
}

test('concurrent prefetch/enter shares resolution, and repeated enter constructs only the latest request', async t => {
  const gate = deferred(), f = fixture(t, () => gate.promise)
  const prefetch = f.manager.prefetch('Later')
  f.manager.enter('Later', { levelOptions: { request: 1 } })
  f.frame(); f.frame()
  f.manager.enter('Later', { levelOptions: { request: 2 } })
  f.frame(); f.frame()
  await setImmediate()
  assert.equal(f.counts.loads, 1)
  gate.resolve(f.factory)
  await prefetch
  await setImmediate()
  f.frame()
  assert.equal(f.incoming.length, 1)
  assert.equal(f.incoming[0].request, 2)
})

test('cancellation before deferred work starts avoids the import entirely', async t => {
  const f = fixture(t, factory => Promise.resolve(factory))
  f.manager.enter('Later')
  f.manager.unload()
  f.frame(); f.frame()
  await setImmediate()
  assert.equal(f.counts.loads, 0)
  assert.equal(f.incoming.length, 0)
  assert.equal(f.manager.getState(), null)
})

test('an old presentation frame cannot hide a newer transition or reenable its input', async t => {
  const f = fixture(t, factory => Promise.resolve(factory))
  f.manager.enter('Later')
  f.frame(); f.frame()
  await setImmediate()
  assert.equal(f.incoming.length, 1)
  f.manager.enter('Opening')
  f.frame() // Old presentation callback plus the new transition's first frame.
  assert.equal(f.counts.hidden, 0)
  assert.equal(f.manager.isTransitioning(), true)
  assert.deepEqual(f.events.at(-1), ['input', false])
  f.frame(); f.frame()
  assert.equal(f.counts.hidden, 1)
  assert.equal(f.manager.getState(), 'Opening')
  assert.equal(f.manager.isTransitioning(), false)
})

test('failed optional prefetch is observed, leaves gameplay intact and retries on transition', async t => {
  let attempt = 0
  const f = fixture(t, factory => ++attempt === 1 ? Promise.reject(new Error('missing chunk')) : Promise.resolve(factory))
  assert.equal(await f.manager.prefetch('Later'), null)
  assert.equal(f.counts.shown, 0)
  assert.equal(f.counts.disposed, 0)
  assert.equal(f.manager.isTransitioning(), false)
  assert.equal(f.warnings.length, 1)
  f.manager.enter('Later')
  f.frame(); f.frame()
  await setImmediate()
  f.frame()
  assert.equal(f.counts.loads, 2)
  assert.equal(f.incoming.length, 1)
  assert.equal(f.manager.getState(), 'Later')
})

test('failed required chunk keeps old scene/input frozen and gives a visible recovery message', async t => {
  const f = fixture(t, () => Promise.reject(new Error('missing chunk')))
  f.manager.enter('Later')
  f.frame(); f.frame()
  await setImmediate()
  assert.equal(f.counts.failed, 1)
  assert.equal(f.errors.length, 1)
  assert.equal(f.counts.disposed, 0)
  assert.equal(f.incoming.length, 0)
  assert.equal(f.manager.isTransitioning(), true)
  assert.equal(f.manager.getState(), 'Opening')
  assert.equal(f.counts.hidden, 0)
  f.manager.unload()
  assert.equal(f.manager.isTransitioning(), false)
})

test('canceled rejection is silent and eager credits keep the previous scene without a loading flash', async t => {
  const gate = deferred(), f = fixture(t, () => gate.promise)
  f.manager.enter('Later')
  f.frame(); f.frame()
  await setImmediate()
  f.manager.enter('Complete')
  assert.equal(f.manager.getState(), 'Complete')
  assert.equal(f.counts.shown, 1, 'only the earlier cold transition showed loading')
  assert.equal(f.counts.disposed, 0, 'credits hold the outgoing scene')
  gate.reject(new Error('late failed chunk'))
  await setImmediate()
  assert.equal(f.counts.failed, 0)
  assert.equal(f.errors.length, 0)
  assert.equal(f.incoming.length, 0)
  f.manager.unload()
  assert.equal(f.counts.disposed, 1, 'held scene is disposed exactly once on quit')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createLoadQueue } from '../src/core/load-queue.js'
import { createLoadingTasks } from '../src/core/loading-tasks.js'
import { createLoadingScreen } from '../src/ui/loading-screen.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('load queue releases slots after asynchronous rejection and synchronous throw', async () => {
  const queue = createLoadQueue(2), first = deferred(), second = deferred(), starts = []
  const failure = new Error('failed request')
  const jobs = [
    queue(() => { starts.push(1); return first.promise }),
    queue(() => { starts.push(2); return second.promise }),
    queue(() => { starts.push(3); throw failure }),
    queue(() => { starts.push(4); return 'four' })
  ]
  const outcomes = Promise.allSettled(jobs)
  await setImmediate()
  assert.deepEqual(starts, [1, 2])
  first.reject(failure)
  await setImmediate()
  assert.deepEqual(starts, [1, 2, 3, 4], 'failed jobs do not stall queued work')
  second.resolve('two')
  const results = await outcomes
  assert.deepEqual(results.map(result => result.status), ['rejected', 'fulfilled', 'rejected', 'fulfilled'])
  assert.equal(results[1].value, 'two')
  assert.equal(results[3].value, 'four')
})

function screenFixture(t, tasks) {
  const previous = globalThis.document
  const makeElement = () => ({ style: {}, children: [], offsetWidth: 0,
    append(...items) { this.children.push(...items) },
    appendChild(item) { this.children.push(item) },
    remove() { this.removed = true } })
  const body = makeElement(), progress = new Set(), load = new Set()
  globalThis.document = { body, createElement: makeElement }
  const assets = {
    onProgress(fn) { progress.add(fn); return () => progress.delete(fn) },
    onLoad(fn) { load.add(fn); return () => load.delete(fn) }
  }
  const screen = createLoadingScreen(assets, { tasks })
  const root = body.children[0], fill = root.children[1].children[0], label = root.children[2]
  t.after(() => { screen.dispose(); globalThis.document = previous })
  return { screen, root, fill, label, progress, load,
    managerDone() { for (const fn of progress) fn(1); for (const fn of load) fn() } }
}

for (const order of [['detective', 'police', 'backdrop'], ['backdrop', 'police', 'detective']]) {
  test(`startup waits for all required work and presentation: ${order.join(' -> ')}`, async t => {
    const tasks = createLoadingTasks(['detective', 'police', 'backdrop', 'presentation'])
    const fixture = screenFixture(t, tasks)
    const jobs = Object.fromEntries(order.map(name => [name, deferred()]))
    const promises = order.map(name => tasks.track(name, jobs[name].promise))
    fixture.managerDone()
    assert.equal(fixture.fill.style.width, '0%')
    assert.equal(fixture.root.style.opacity, '1')
    for (let index = 0; index < order.length; index++) {
      jobs[order[index]].resolve(index === 0 ? null : order[index]) // Existing asset fallbacks are valid results.
      await promises[index]
      tasks.complete(order[index]) // Duplicate completion must not inflate progress.
      fixture.managerDone()
      assert.equal(fixture.fill.style.width, `${(index + 1) * 25}%`)
      assert.equal(fixture.root.style.opacity, '1')
      assert.equal(tasks.ready, false)
    }
    tasks.complete('presentation')
    assert.equal(tasks.ready, true)
    assert.equal(fixture.fill.style.width, '100%')
    assert.equal(fixture.root.style.opacity, '1', 'completion still requires the scene owner to hide')
    fixture.screen.hide()
    assert.equal(fixture.root.style.opacity, '0')
    fixture.screen.show()
    assert.equal(fixture.fill.style.width, '0%', 'a later transition starts fresh')
    assert.equal(fixture.root.style.opacity, '1')
    fixture.managerDone()
    assert.equal(fixture.root.style.opacity, '1', 'a later manager completion cannot dismiss construction')
  })
}

test('mandatory rejection remains visible and observed without reporting readiness', async t => {
  const tasks = createLoadingTasks(['mandatory', 'other'])
  const fixture = screenFixture(t, tasks)
  const failure = new Error('mandatory preparation failed')
  await assert.rejects(tasks.track('mandatory', Promise.reject(failure)), error => error === failure)
  await tasks.track('other', Promise.resolve('ready'))
  fixture.managerDone()
  assert.equal(tasks.ready, false)
  assert.match(fixture.label.textContent, /Unable to load.*Reload/)
  assert.equal(fixture.root.style.opacity, '1')
})

test('manager-only loading still requires owner dismissal and unsubscribes on disposal', t => {
  const fixture = screenFixture(t)
  fixture.managerDone()
  assert.equal(fixture.fill.style.width, '100%')
  assert.equal(fixture.root.style.opacity, '1')
  fixture.screen.hide()
  fixture.screen.show() // A pending fade must not hide a new transition.
  fixture.screen.dispose()
  assert.equal(fixture.progress.size, 0)
  assert.equal(fixture.load.size, 0)
  assert.equal(fixture.root.removed, true)
})

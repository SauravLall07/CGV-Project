// A fixed set of required steps, not estimated elapsed-time progress. A loader
// may resolve with its established fallback; rejection keeps readiness false.
export function createLoadingTasks(names) {
  const required = new Set(names)
  if (!required.size || required.size !== names.length) throw new Error('Expected unique loading task names')
  const pending = new Set(required)
  const listeners = new Set()
  let failed = false

  function snapshot() {
    return { progress: (required.size - pending.size) / required.size,
      ready: !failed && pending.size === 0, failed }
  }
  function publish() {
    const state = snapshot()
    for (const fn of listeners) fn(state)
  }
  function complete(name) {
    if (!required.has(name)) throw new Error(`Unknown loading task: ${name}`)
    if (pending.delete(name)) publish()
  }
  function fail() {
    if (!failed) { failed = true; publish() }
  }
  function track(name, promise) {
    if (!required.has(name)) throw new Error(`Unknown loading task: ${name}`)
    return Promise.resolve(promise).then(value => {
      complete(name)
      return value
    }, error => { fail(); throw error })
  }
  return {
    complete, fail, track,
    get ready() { return !failed && pending.size === 0 },
    subscribe(fn) {
      listeners.add(fn)
      fn(snapshot())
      return () => listeners.delete(fn)
    }
  }
}

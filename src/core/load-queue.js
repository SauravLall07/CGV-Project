// Bound complete top-level load/parse jobs, including their asynchronous work.
export function createLoadQueue(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid load concurrency')
  const pending = []
  let active = 0

  function drain() {
    while (active < concurrency && pending.length) {
      const { task, resolve, reject } = pending.shift()
      active++
      Promise.resolve().then(task).then(
        value => { active--; resolve(value); drain() },
        error => { active--; reject(error); drain() }
      )
    }
  }

  return task => new Promise((resolve, reject) => {
    pending.push({ task, resolve, reject })
    drain()
  })
}

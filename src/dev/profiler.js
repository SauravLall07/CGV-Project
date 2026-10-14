// CPU timings only. Frames come from the dev overlay's existing RAF wrapper,
// so repeated calls accumulate and inactive systems contribute zero that frame.
function createProfiler() {
  const frames = []
  const sums = new Map()
  const starts = new Map()
  const current = new Map()
  let recording = false
  return {
    beginFrame() {
      starts.clear()
      current.clear()
      recording = true
    },
    begin(name) {
      if (recording) starts.set(name, performance.now())
    },
    end(name) {
      if (!recording || !starts.has(name)) return
      const duration = performance.now() - starts.get(name)
      starts.delete(name)
      current.set(name, (current.get(name) ?? 0) + duration)
    },
    endFrame(commit) {
      recording = false
      starts.clear() // Early returns/exceptions cannot leave an open timer.
      if (!commit) return
      const sample = new Map(current)
      frames.push(sample)
      for (const [name, value] of sample) sums.set(name, (sums.get(name) ?? 0) + value)
      if (frames.length > 60) {
        for (const [name, value] of frames.shift()) {
          const remaining = sums.get(name) - value
          if (remaining <= 1e-9) sums.delete(name)
          else sums.set(name, remaining)
        }
      }
    },
    top(limit = 8) {
      return [...sums].map(([name, sum]) => ({ name, ms: sum / frames.length }))
        .sort((a, b) => b.ms - a.ms).slice(0, limit)
    },
    reset() {
      frames.length = 0
      sums.clear()
      starts.clear()
      current.clear()
      recording = false
    }
  }
}

// The factory is never executed in production. Level call sites also have
// explicit DEV guards, so production removes the instrumentation entirely.
const noop = () => {}
export const profiler = import.meta.env.DEV ? createProfiler() : {
  beginFrame: noop, begin: noop, end: noop, endFrame: noop, top: noop, reset: noop
}

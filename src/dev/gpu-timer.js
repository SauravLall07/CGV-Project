// EXT_disjoint_timer_query_webgl2. One elapsed query at a time: WebGL
// forbids nesting, so the shadow pass, the scene pass and each post pass
// are opened and closed in order. Results arrive a frame or two later.

const WINDOW = 30
const MAX_PENDING = 256
const MAX_COMPLETED = 20000

export function createGpuTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const pending = []
  const history = new Map()
  let completed = []
  let open = null
  let nextId = 1
  let disposed = false
  let dropped = 0
  let invalidated = 0
  let disjointEvents = 0
  let skipped = 0

  function average(label) {
    const samples = history.get(label)
    if (!samples || samples.length === 0) return null
    let sum = 0
    for (let i = 0; i < samples.length; i += 1) sum += samples[i]
    return sum / samples.length
  }

  function push(label, ms) {
    let samples = history.get(label)
    if (!samples) {
      samples = []
      history.set(label, samples)
    }
    samples.push(ms)
    if (samples.length > WINDOW) samples.shift()
  }

  function begin(label, frameId = null) {
    if (!ext || disposed || open) return false
    if (pending.length >= MAX_PENDING) { skipped += 1; return false }
    const query = gl.createQuery()
    if (!query) return false
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
    open = { query, label, frameId, queryId: nextId++ }
    return true
  }

  function end() {
    if (!ext || !open) return
    gl.endQuery(ext.TIME_ELAPSED_EXT)
    pending.push(open)
    open = null
  }

  function endIf(label) {
    if (open && open.label === label) end()
  }

  function clearQueries() {
    if (open) {
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      gl.deleteQuery(open.query)
      open = null
    }
    for (const item of pending) gl.deleteQuery(item.query)
    pending.length = 0
  }

  function reset() {
    clearQueries()
    history.clear()
    completed = []
    dropped = 0
    invalidated = 0
    disjointEvents = 0
    skipped = 0
  }

  function poll(completedFrameId = null) {
    if (!ext || disposed) return
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    // Even unavailable queries can straddle the disjoint interval. Keeping
    // them would accept invalid results after the flag clears on a later poll.
    if (disjoint) {
      disjointEvents += 1
      invalidated += pending.length + (open ? 1 : 0) + completed.length
      clearQueries()
      history.clear()
      completed = []
      return
    }
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const item = pending[i]
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue
      const ns = gl.getQueryParameter(item.query, gl.QUERY_RESULT)
      const ms = ns / 1e6
      if (Number.isFinite(ms) && ms >= 0) {
        push(item.label, ms)
        if (completed.length < MAX_COMPLETED) {
          completed.push({ queryId: item.queryId, frameId: item.frameId,
            completedFrameId, label: item.label, ms })
        } else dropped += 1
      }
      gl.deleteQuery(item.query)
      pending.splice(i, 1)
    }
  }

  return {
    supported: Boolean(ext),
    begin,
    end,
    endIf,
    poll,
    average,
    reset,
    drain() {
      const samples = completed
      completed = []
      return samples
    },
    status: () => ({ supported: Boolean(ext), pending: pending.length + (open ? 1 : 0),
      dropped, invalidated, disjointEvents, skipped }),
    dispose() {
      if (disposed) return
      reset()
      disposed = true
    }
  }
}

// EXT_disjoint_timer_query_webgl2. One elapsed query at a time: WebGL
// forbids nesting, so the shadow pass, the scene pass and each post pass
// are opened and closed in order. Results arrive a frame or two later.

const WINDOW = 30

export function createGpuTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const pending = []
  const history = new Map()
  let open = null

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

  function begin(label) {
    if (!ext || open) return false
    const query = gl.createQuery()
    if (!query) return false
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
    open = { query, label }
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

  function poll() {
    if (!ext) return
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const item = pending[i]
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue
      if (!disjoint) {
        const ns = gl.getQueryParameter(item.query, gl.QUERY_RESULT)
        push(item.label, ns / 1e6)
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
    average
  }
}

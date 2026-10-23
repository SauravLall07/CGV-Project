export const SPIKE_MS = 50
export const SPIKE_LOGS_PER_SECOND = 5
export const SUMMARY_MS = 10000
export const FRAME_CAPACITY = 4096

// No sample objects, array growth, slices or sorting copies on the frame path.
// Strings are created only when emitting a requested diagnostic line.
export function createLagDetector({ enabled = true, report = console.log, capacity = FRAME_CAPACITY } = {}) {
  if (!enabled) return null
  const samples = new Float64Array(capacity), workspace = new Float64Array(capacity)
  const spikeTimes = new Float64Array(SPIKE_LOGS_PER_SECOND)
  spikeTimes.fill(-Infinity)
  let count = 0, sum = 0, maximum = 0, spikes = 0, start = -1, logSlot = 0
  function percentile(length) {
    for (let i = 0; i < length; i++) workspace[i] = samples[i]
    const k = Math.max(0, Math.ceil(length * 0.95) - 1)
    let left = 0, right = length - 1
    while (left < right) {
      const pivot = workspace[(left + right) >> 1]
      let i = left, j = right
      while (i <= j) {
        while (workspace[i] < pivot) i++
        while (workspace[j] > pivot) j--
        if (i <= j) { const value = workspace[i]; workspace[i++] = workspace[j]; workspace[j--] = value }
      }
      if (k <= j) right = j
      else if (k >= i) left = i
      else break
    }
    return workspace[k]
  }
  return { samples, workspace,
    record(now, total, update, render, minimap, state, level, levelSeconds, sceneCpuMs) {
      if (!Number.isFinite(total) || total < 0) return
      if (start < 0) start = now
      samples[count % capacity] = total
      count++; sum += total; maximum = Math.max(maximum, total)
      if (total > SPIKE_MS) {
        spikes++
        if (now - spikeTimes[logSlot] >= 1000) {
          spikeTimes[logSlot] = now; logSlot = (logSlot + 1) % SPIKE_LOGS_PER_SECOND
          report(`[spike] ${total.toFixed(2)} update=${update.toFixed(2)} render=${render.toFixed(2)} minimap=${minimap.toFixed(2)} state=${state} level=${level} t=${levelSeconds.toFixed(2)}${Number.isFinite(sceneCpuMs) ? ` scene=${sceneCpuMs.toFixed(2)}` : ''}`)
        }
      }
      if (now - start >= SUMMARY_MS) {
        report(`[perf] 10s: avg=${(sum / count).toFixed(2)} p95=${percentile(Math.min(count, capacity)).toFixed(2)} max=${maximum.toFixed(2)} spikes=${spikes}`)
        start = now; count = 0; sum = 0; maximum = 0; spikes = 0
      }
    }
  }
}

// Statistics use uncapped rAF intervals, never simulation delta. Call only
// when exporting/finishing a capture, rather than sorting on every frame.
export function summarizeFrames(frames) {
  const values = frames.filter(frame => !frame.exclusion &&
    Number.isFinite(frame.frameMs) && frame.frameMs > 0).map(frame => frame.frameMs)
  if (!values.length) return null
  values.sort((a, b) => a - b)
  const total = values.reduce((sum, value) => sum + value, 0)
  const slowestCount = Math.ceil(values.length * 0.01)
  const slowestTotal = values.slice(-slowestCount).reduce((sum, value) => sum + value, 0)
  const percentile = fraction => values[Math.ceil(values.length * fraction) - 1]
  return {
    frames: values.length,
    excludedFrames: frames.length - values.length,
    elapsedMs: total,
    averageFps: values.length * 1000 / total,
    onePercentLowFps: slowestCount * 1000 / slowestTotal,
    meanFrameMs: total / values.length,
    p50FrameMs: percentile(0.5),
    p95FrameMs: percentile(0.95),
    p99FrameMs: percentile(0.99),
    maxFrameMs: values.at(-1),
    over16_67Ms: values.filter(ms => ms > 16.67).length,
    over33_33Ms: values.filter(ms => ms > 33.33).length,
    over50Ms: values.filter(ms => ms > 50).length
  }
}

export function summarizeGpu(samples) {
  const passes = {}
  for (const sample of samples) {
    const pass = passes[sample.label] ??= { samples: 0, totalMs: 0 }
    pass.samples += 1
    pass.totalMs += sample.ms
  }
  for (const pass of Object.values(passes)) pass.meanMs = pass.totalMs / pass.samples
  return passes
}

// Imported only behind import.meta.env.DEV in main.js. No production hook/UI.
import { summarizeFrames, summarizeGpu } from './frame-metrics.js'

export function createBenchmark({ camera, overlay, quality, ready, prepare }) {
  const steps = [
    ['Normal', {}],
    ['Scenery hidden', { sceneryHidden: true }],
    ['Lighting simplified', { lightsLimited: true }],
    ['Post off', { postEnabled: false }],
    ['Unlit', { unlit: true }],
    ['Render scale 70%', { scale: 0.7 }]
  ]
  const rows = []
  const captures = []
  let phase = 'waiting', step = 0, started = 0, lastPaint = 0
  let baseline = null, pose = null, capture = null
  const panel = document.createElement('div')
  Object.assign(panel.style, {
    position: 'fixed', inset: 'auto 16px 16px 16px', zIndex: '100001',
    padding: '18px', background: 'rgba(5,9,15,.96)', color: '#e8eef5',
    border: '1px solid #68788a', font: '14px/1.6 Consolas,monospace',
    whiteSpace: 'pre', pointerEvents: 'none'
  })
  panel.textContent = 'Benchmark: loading the requested start point…'
  document.body.appendChild(panel)

  function restore() {
    if (baseline) overlay.applyToggles(baseline)
    quality.setOverride(null)
  }

  function beginMeasurement(now) {
    // Discard warmup queries too; rolling averages are not fresh frame samples.
    overlay.resetMeasurements()
    capture = { test: steps[step][0], startedMs: now, frames: [], gpuSamples: [],
      settings: { ...overlay.captureToggles(), renderScale: quality.getScale() } }
    phase = 'measure'
    started = now
  }

  function beginStep(now) {
    // Neutral baseline for EVERY test, never stack prior diagnostic overrides.
    overlay.applyToggles({ ...baseline, pixelRatioForced: false, shadowsOff: false,
      lightsLimited: false, sceneryHidden: false, minimapOff: false,
      glowsHidden: false, unlit: false, postEnabled: true })
    quality.setOverride(1)
    const changes = steps[step][1]
    overlay.applyToggles({ ...overlay.captureToggles(), ...changes })
    if (changes.scale) quality.setOverride(changes.scale)
    overlay.resetMeasurements()
    phase = 'warmup'
    started = now
    panel.textContent = `Benchmark ${step + 1}/${steps.length}: ${steps[step][0]} — warming up (High baseline).`
  }

  function finishCapture(now, interruption = null) {
    if (!capture) return
    const ids = new Set(capture.frames.filter(f => !f.exclusion && f.frameMs > 0).map(f => f.frameId))
    // Results can arrive several frames later; retain both IDs and consume once.
    capture.gpuSamples = capture.gpuSamples.filter(sample => ids.has(sample.frameId))
    capture.endedMs = now
    capture.interruption = interruption
    capture.gpuStatus = overlay.gpuStatus()
    // Cancellation/disposal can poll a disjoint event without afterRender.
    if (capture.gpuStatus.disjointEvents) {
      capture.gpuSamples = []
      capture.gpuInvalidated = true
    }
    capture.summary = summarizeFrames(capture.frames)
    capture.gpuPasses = summarizeGpu(capture.gpuSamples)
    captures.push(capture)
    capture = null
  }

  function exportResults() {
    return structuredClone({
      format: 'chrono-express-benchmark/v1',
      environment: { userAgent: navigator.userAgent, viewport: [window.innerWidth, window.innerHeight],
        devicePixelRatio: window.devicePixelRatio },
      policy: {
        intervals: 'uncapped requestAnimationFrame timestamps; visible slow frames retained',
        exclusions: 'hidden/visibility-transition and gameplay interruptions restart this condition; interrupted attempts retained',
        onePercentLow: '1000 / mean(slowest ceil(N * .01) intervals)',
        gpu: 'fresh queries by originating frame; missing/disjoint samples unavailable; pending tail not estimated',
        cpu: 'update callbacks; scene traversal/shadow/submission; draw includes clear/composer; minimap icon render',
        scope: 'development fixed-camera diagnostic, 3 s warmup + 4 s measurement; simulation continues; not a production baseline'
      },
      originalToggles: baseline, rows, captures
    })
  }
  // Explicit DevTools export; no frame-time downloads or recurring console output.
  const exportHandle = { exportResults }
  window.chronoBenchmark = exportHandle

  function showResults(message = '') {
    restore()
    overlay.resetMeasurements()
    phase = 'results'
    console.table(rows)
    const header = 'Test                   FPS   1% low   Frame ms   Update CPU ms   GPU scene ms'
    const lines = rows.map(r =>
      `${r.Test.padEnd(23)}${r.FPS.toFixed(1).padStart(6)}${r.OnePercentLowFPS.toFixed(1).padStart(9)}` +
      `${r.FrameMs.toFixed(2).padStart(11)}${r.CpuUpdateMs.toFixed(2).padStart(16)}` +
      `${(r.GpuSceneMs == null ? 'n/a' : r.GpuSceneMs.toFixed(2)).padStart(15)}`)
    panel.textContent = ['CHRONO EXPRESS — BENCHMARK', '100% baseline • fixed camera • 3 s warmup + 4 s per test',
      'GPU scene = mean of fresh completed scene queries, not total GPU frame time.',
      'Raw data: window.chronoBenchmark.exportResults(); unsupported/disjoint/missing GPU = n/a.',
      '', header, ...lines, '', message || 'Finished. Press any key to dismiss.'].join('\n')
  }

  function onKey(event) {
    if (phase === 'waiting' || phase === 'closed') return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (phase === 'results') {
      phase = 'closed'
      panel.remove()
      overlay.setBenchmarkActive(false)
      window.removeEventListener('keydown', onKey, true)
    } else {
      capture?.gpuSamples.push(...overlay.takeGpuSamples())
      finishCapture(performance.now(), 'cancelled')
      showResults('Cancelled. All overrides restored. Press any key to dismiss.')
    }
  }
  window.addEventListener('keydown', onKey, true)

  return {
    exportResults,
    isHolding: () => phase !== 'waiting' && phase !== 'closed',
    update() {
      if (phase !== 'waiting' || !ready()) return
      prepare()
      pose = { position: camera.position.clone(), quaternion: camera.quaternion.clone() }
      baseline = overlay.captureToggles()
      overlay.setBenchmarkActive(true)
      beginStep(performance.now())
    },
    beforeRender() {
      if (!pose || phase === 'closed') return
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.quaternion)
      camera.updateMatrixWorld()
    },
    afterRender() {
      if (phase !== 'warmup' && phase !== 'measure') return
      const now = performance.now()
      const sample = overlay.sampleFrame()
      const freshGpu = overlay.takeGpuSamples()
      if (capture) capture.gpuSamples.push(...freshGpu)
      // A disjoint event invalidates even results already drained this attempt.
      if (capture && overlay.gpuStatus().disjointEvents) {
        capture.gpuSamples.length = 0
        capture.gpuInvalidated = true
      }
      if (document.hidden || !ready() || sample?.exclusion) {
        if (sample && capture) capture.frames.push(sample)
        finishCapture(now, sample?.exclusion ?? (document.hidden ? 'hidden' : 'gameplay-interruption'))
        overlay.resetMeasurements()
        started = now
        phase = 'warmup'
        return
      }
      if (phase === 'warmup') {
        if (now - started >= 3000) beginMeasurement(now)
        return
      }
      if (sample) capture.frames.push(sample)
      if (now - lastPaint >= 250) {
        panel.textContent = `Benchmark ${step + 1}/${steps.length}: ${steps[step][0]} — measuring (${((now - started) / 1000).toFixed(1)}/4 s).`
        lastPaint = now
      }
      if (now - started < 4000 || !capture.frames.some(f => !f.exclusion && f.frameMs > 0)) return
      finishCapture(now)
      const result = captures.at(-1)
      const metrics = result.summary
      const frames = result.frames.filter(f => !f.exclusion && f.frameMs > 0)
      const meanCpu = key => frames.reduce((sum, f) => sum + f[key], 0) / frames.length
      rows.push({ Test: steps[step][0], FPS: metrics.averageFps, OnePercentLowFPS: metrics.onePercentLowFps,
        FrameMs: metrics.meanFrameMs, P99FrameMs: metrics.p99FrameMs,
        CpuUpdateMs: meanCpu('updateCpuMs'), CpuSceneMs: meanCpu('sceneCpuMs'),
        CpuDrawMs: meanCpu('drawCpuMs'), CpuMinimapMs: meanCpu('minimapCpuMs'),
        GpuSceneMs: result.gpuInvalidated ? null : result.gpuPasses.scene?.meanMs ?? null,
        GpuSceneSamples: result.gpuInvalidated ? 0 : result.gpuPasses.scene?.samples ?? 0,
        PendingGpuQueries: result.gpuStatus.pending })
      if (++step < steps.length) beginStep(now)
      else showResults()
    },
    dispose() {
      capture?.gpuSamples.push(...overlay.takeGpuSamples())
      finishCapture(performance.now(), 'disposed')
      restore()
      overlay.resetMeasurements()
      phase = 'closed'
      overlay.setBenchmarkActive(false)
      window.removeEventListener('keydown', onKey, true)
      if (window.chronoBenchmark === exportHandle) delete window.chronoBenchmark
      panel.remove()
    }
  }
}

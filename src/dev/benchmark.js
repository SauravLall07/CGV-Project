// Imported only behind import.meta.env.DEV in main.js. No production hook/UI.
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
  let phase = 'waiting', step = 0, started = 0, lastFrame = 0
  let baseline = null, pose = null, totals = null
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

  function beginStep(now) {
    // Neutral baseline for EVERY test, never stack overrides from prior tests.
    overlay.applyToggles({ ...baseline, pixelRatioForced: false, shadowsOff: false,
      lightsLimited: false, sceneryHidden: false, minimapOff: false,
      glowsHidden: false, unlit: false, postEnabled: true })
    quality.setOverride(1)
    const changes = steps[step][1]
    overlay.applyToggles({ ...overlay.captureToggles(), ...changes })
    if (changes.scale) quality.setOverride(changes.scale)
    phase = 'warmup'
    started = now
    totals = { frames: 0, frameMs: 0, cpuMs: 0, gpuMs: 0, gpuFrames: 0 }
  }

  function showResults(message = '') {
    restore()
    phase = 'results'
    console.table(rows)
    const header = 'Test                   FPS    Frame ms    CPU update ms    GPU scene ms'
    const lines = rows.map((r) =>
      `${r.Test.padEnd(23)}${r.FPS.toFixed(1).padStart(6)}${r.FrameMs.toFixed(2).padStart(12)}` +
      `${r.CpuUpdateMs.toFixed(2).padStart(17)}${(r.GpuSceneMs == null ? 'n/a' : r.GpuSceneMs.toFixed(2)).padStart(16)}`)
    panel.textContent = ['CHRONO EXPRESS — BENCHMARK', '100% baseline • fixed camera • 3 s warmup + 4 s per test',
      'GPU values average available timer-query scene samples; n/a = unavailable.', '', header, ...lines,
      '', message || 'Finished. Take one screenshot. Press any key to dismiss.'].join('\n')
  }

  function onKey(event) {
    if (phase === 'waiting' || phase === 'closed') return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (phase === 'results') {
      phase = 'closed'; panel.remove(); overlay.setBenchmarkActive(false)
      window.removeEventListener('keydown', onKey, true)
    } else showResults('Cancelled. All overrides restored. Press any key to dismiss.')
  }
  window.addEventListener('keydown', onKey, true)

  return {
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
      // Background tabs and gameplay interruptions are not benchmark samples.
      // Restart warmup after a gap, retaining the current single test override.
      if (document.hidden || !ready() || (lastFrame && now - lastFrame > 500)) {
        started = now; phase = 'warmup'
        totals = { frames: 0, frameMs: 0, cpuMs: 0, gpuMs: 0, gpuFrames: 0 }
        lastFrame = now
        return
      }
      lastFrame = now
      if (phase === 'warmup') {
        panel.textContent = `Benchmark ${step + 1}/${steps.length}: ${steps[step][0]} — warming up (High baseline).`
        if (now - started < 3000) return
        phase = 'measure'; started = now
        return
      }
      const sample = overlay.sampleFrame()
      if (sample.frameMs > 0) {
        totals.frames++; totals.frameMs += sample.frameMs; totals.cpuMs += sample.cpuMs
        if (sample.gpuSceneMs != null) { totals.gpuMs += sample.gpuSceneMs; totals.gpuFrames++ }
      }
      panel.textContent = `Benchmark ${step + 1}/${steps.length}: ${steps[step][0]} — measuring (${((now - started) / 1000).toFixed(1)}/4 s).`
      if (now - started < 4000 || !totals.frames) return
      rows.push({ Test: steps[step][0], FPS: totals.frames * 1000 / totals.frameMs,
        FrameMs: totals.frameMs / totals.frames, CpuUpdateMs: totals.cpuMs / totals.frames,
        GpuSceneMs: totals.gpuFrames ? totals.gpuMs / totals.gpuFrames : null })
      restore()
      if (++step < steps.length) beginStep(now)
      else showResults()
    },
    dispose() {
      restore(); phase = 'closed'; overlay.setBenchmarkActive(false)
      window.removeEventListener('keydown', onKey, true); panel.remove()
    }
  }
}

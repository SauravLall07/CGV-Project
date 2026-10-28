import * as THREE from 'three'
import { getContext, getMasterGain } from '../core/audio.js'
import { THEME } from './ui-theme.js'
import { createStoryFilm, FX_NONE, FX_TREMOR, FX_ROCKSLIDE, FX_TIMEWARP } from '../shaders/story-film.js'
import { typewriterProgress } from './story-player.js'
import {
  TREMOR_SHAKE, TREMOR_SHAKE_IN, TREMOR_SHAKE_END, RIPPLE_CENTER, RIPPLE_SQUASH, RIPPLE_MAX_RADIUS, RIPPLES,
  ROCK_SHAKE, ROCK_SHAKE_VERTICAL, ROCK_SHAKE_KEYS, DUST_STRENGTH, WARP_PULSE_HZ
} from '../story/l3-transition-beat.js'

// Mid-game narrated cutscene (Level 2 → Level 3). Owns the same slot in
// main.js as the intro's story player, so STORY input, pause blocking, music
// gating and minimap rules apply unchanged.
//
// The next level's constructor and its first frames block the main thread.
// Neither may show as a freeze:
//   fadeOut  the film's panel 1 crossfades in over the frozen Level 2 frame;
//            music fades with it
//   build    panel 1 holds perfectly still (no zoom/effects yet) while its
//            line plays on the audio clock and main.js builds + compiles
//            Level 3 — a blocked frame of a still picture looks the same
//   panels   3 panels, captions, effects; the clock is wall time, so the
//            pictures stay in sync with the voice after a blocked frame
//   surge    panel 3's cracks flood the screen chrono-blue (a page layer
//            animated by the compositor, so it keeps pulsing through jank)
//   blue     Level 3 runs live under the blue until its frames are steady
//   reveal   the blue clears onto Level 3, then control is handed back
const log = (...args) => { if (import.meta.env?.DEV) console.log('[story]', ...args) }
const FX_IDS = { none: FX_NONE, tremor: FX_TREMOR, rockslide: FX_ROCKSLIDE, timewarp: FX_TIMEWARP }
// The film keeps animating at its peak while the snapshot encodes.
const CAPTURE_TIMEOUT_MS = 1500
const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

// Panel i: [start, end). Its line starts after the panel's narration delay;
// the next panel starts after the line plus its hold.
export function buildTransitionTimeline(beat, clipDurations) {
  let cursor = 0
  return beat.panels.map((panel, i) => {
    const clip = clipDurations[i] ?? beat.timings.fallbackClip
    const last = i === beat.panels.length - 1
    const start = cursor
    const clipStart = start + (panel.narrationDelay ?? beat.timings.narrationDelay)
    cursor = clipStart + clip + (last ? beat.timings.lastHold : beat.timings.hold)
    return { start, end: cursor, clipStart, clip }
  })
}

// Caption chunk on screen at local clip time t, and its typewriter length.
export function captionAt(panel, clip, t) {
  let index = 0
  while (index + 1 < panel.captions.length && t >= panel.captions[index + 1].at) index++
  const chunk = panel.captions[index]
  const until = index + 1 < panel.captions.length ? panel.captions[index + 1].at : clip
  return { index, local: Math.max(0, t - chunk.at), spoken: Math.max(0.1, until - chunk.at) }
}

export function envelope(keys, t) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]
      return v0 + (v1 - v0) * smooth((t - t0) / Math.max(1e-6, t1 - t0))
    }
  }
  return keys[keys.length - 1][1]
}

// Smooth, deterministic camera-style shake (sum of incommensurate sines,
// ~6–14 Hz), never per-frame random jitter.
export function shakeOffset(t, amount, vertical = 1, target = { x: 0, y: 0 }) {
  target.x = amount * (Math.sin(t * 82.3) * 0.55 + Math.sin(t * 45.9 + 1.3) * 0.45)
  target.y = amount * vertical * (Math.sin(t * 73.5 + 0.7) * 0.55 + Math.sin(t * 37.1 + 2.1) * 0.45)
  return target
}

export function createTransitionPlayer({ beat, renderer, onBlack = () => {}, onBuild = () => {}, onPrewarm = () => {},
  onReveal = () => {}, isLevelReady = () => true, onComplete = () => {}, onRendererRestore = () => {},
  context = getContext, master = getMasterGain, doc = globalThis.document, keys = globalThis.window,
  loadImage = url => new THREE.ImageLoader().loadAsync(url),
  loadAudio = async (url, ctx, signal) => {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Story audio HTTP ${response.status}`)
    return ctx.decodeAudioData(await response.arrayBuffer())
  }, film = createStoryFilm(), setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now() } = {}) {
  const t = beat.timings, u = film.uniforms
  const textures = [], clips = [], sfx = [], abort = new AbortController()
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true
  const size = new THREE.Vector2(), savedViewport = new THREE.Vector4(), shake = { x: 0, y: 0 }
  let disposed = false, active = false, prepared = false, readyPromise = null, warmed = false, loadTimer, hardTimer
  let phase = '', phaseStartedAt = 0, origin = 0, time = 0, index = 0, skipped = false
  let timeline = null, savedRenderer = null, zoomFrom = Infinity, surgeSeconds = 0, warpFrom = 0
  let settled = false, settleCount = 0, lastUpdateAt = 0, fxShift = 0
  let root = null, strip = null, surge = null, frame = null, button = null, blocks = []
  let captureWanted = false, captureState = '', captureTimer
  let bus = null, limiter = null, narrationGain = null, narration = null, rumbleGain = null, rumble = null
  let narrationIndex = -1, rumbleStarted = false, rumbleFading = false
  let masterSaved = null, buildStartedAt = 0, goodFrames = 0
  const gameFrames = []
  let enterHeld = false, enterReady = true

  // ---- renderer ownership (same contract as the intro's story player) ----
  function storyResolution() {
    if (!savedRenderer) return
    const ratio = Math.min(keys.devicePixelRatio || 1, 2)
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
  }
  function acquireRenderer() {
    if (savedRenderer) return
    renderer.getViewport(savedViewport)
    savedRenderer = { pixelRatio: renderer.getPixelRatio(), outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, autoClear: renderer.autoClear }
    storyResolution()
  }
  function releaseRenderer() {
    if (!savedRenderer) return
    renderer.setPixelRatio(savedRenderer.pixelRatio)
    renderer.outputColorSpace = savedRenderer.outputColorSpace
    renderer.toneMapping = savedRenderer.toneMapping
    renderer.toneMappingExposure = savedRenderer.exposure
    renderer.autoClear = savedRenderer.autoClear
    renderer.setViewport(savedViewport)
    savedRenderer = null
    onRendererRestore()
  }

  // ---- audio ----
  function ensureBus() {
    if (bus) return bus
    const ctx = context()
    if (!ctx) return null
    bus = ctx.createGain(); bus.gain.value = beat.bus.gain
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = beat.bus.threshold; limiter.knee.value = beat.bus.knee
    limiter.ratio.value = beat.bus.ratio; limiter.attack.value = beat.bus.attack
    limiter.release.value = beat.bus.release
    bus.connect(limiter); limiter.connect(master())
    narrationGain = ctx.createGain(); narrationGain.gain.value = 1; narrationGain.connect(bus)
    return bus
  }
  function ramp(param, to, seconds) {
    const ctx = context(); if (!ctx || !param) return
    param.cancelScheduledValues(ctx.currentTime)
    param.setValueAtTime(param.value, ctx.currentTime)
    param.linearRampToValueAtTime(to, ctx.currentTime + seconds)
  }
  function stopSource(node) {
    if (!node) return
    node.onended = null
    try { node.stop() } catch { /* already ended */ }
    node.disconnect()
  }
  // Scheduled on the audio clock, so it starts on time even if the main
  // thread is blocked by the level build when it is due.
  function playNarration(i, delay = 0) {
    const ctx = context(), buffer = clips[i]
    narrationIndex = i
    if (!buffer || ctx?.state !== 'running' || !ensureBus()) return
    try {
      stopSource(narration)
      narration = ctx.createBufferSource(); narration.buffer = buffer
      narration.connect(narrationGain); narration.start(ctx.currentTime + Math.max(0, delay))
      log('l3 line', i + 1, delay > 0 ? `in ${delay.toFixed(2)}s` : '')
    } catch (error) { log('l3 line failed', error.message); narration = null }
  }
  function startRumble(spec, buffer) {
    const ctx = context()
    rumbleStarted = true
    if (!buffer || ctx?.state !== 'running' || !ensureBus()) return
    try {
      rumbleGain = ctx.createGain(); rumbleGain.gain.value = spec.gain; rumbleGain.connect(bus)
      rumble = ctx.createBufferSource(); rumble.buffer = buffer
      rumble.connect(rumbleGain); rumble.start()
      log('l3 rumble start gain', spec.gain)
    } catch (error) { log('l3 rumble failed', error.message); stopRumble() }
  }
  function fadeRumble(seconds) {
    if (!rumbleGain || rumbleFading) return
    rumbleFading = true; ramp(rumbleGain.gain, 0, seconds)
    const node = rumble
    setTimer(() => { if (rumble === node) stopRumble() }, seconds * 1000 + 50)
  }
  function stopRumble() {
    stopSource(rumble); rumble = null
    rumbleGain?.disconnect(); rumbleGain = null
  }
  function fadeMasterOut(seconds) {
    const gain = master()?.gain
    if (!gain || masterSaved !== null) return
    masterSaved = gain.value; ramp(gain, 0, seconds)
  }
  function restoreMaster() {
    const gain = master()?.gain, ctx = context()
    if (!gain || masterSaved === null) return
    if (ctx) { gain.cancelScheduledValues(ctx.currentTime); gain.setValueAtTime(masterSaved, ctx.currentTime) }
    gain.value = masterSaved
    masterSaved = null
  }

  // ---- loading ----
  function prefetch() {
    if (readyPromise) return readyPromise
    const ctx = context()
    const work = Promise.allSettled([
      ...beat.panels.map(async (panel, i) => {
        const image = await loadImage(panel.image)
        if (disposed) return
        const texture = new THREE.Texture(image)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = false
        texture.minFilter = texture.magFilter = THREE.LinearFilter
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate = true
        textures[i] = texture
      }),
      ...beat.panels.map(async (panel, i) => {
        if (!ctx) return
        const buffer = await loadAudio(panel.audio, ctx, abort.signal)
        if (!disposed) clips[i] = buffer
      }),
      ...beat.panels.map(async (panel, i) => {
        if (!ctx || !panel.sfx) return
        const buffer = await loadAudio(panel.sfx.url, ctx, abort.signal)
        if (!disposed) sfx[i] = buffer
      })
    ]).then(results => results.forEach(r => { if (r.status === 'rejected') log('l3 asset failed', r.reason?.message) }))
    readyPromise = Promise.race([work, new Promise(resolve => {
      loadTimer = setTimer(() => { log('l3 prepare timeout'); resolve() }, t.prepareTimeout * 1000)
    })]).then(() => { clearTimer(loadTimer); if (!disposed) prepared = true })
    return readyPromise
  }
  // GPU uploads/compiles for the film itself, done before anything shows.
  function warm() {
    if (disposed || warmed || !prepared) return
    warmed = true
    for (const texture of textures) if (texture) renderer.initTexture(texture)
    renderer.initTexture(black)
    renderer.compile(film.scene, film.camera)
  }

  // ---- DOM ----
  function makeLetters(parent, text) {
    return Array.from(text, character => {
      const span = doc.createElement('span'); span.textContent = character
      span.style.visibility = 'hidden'; parent.appendChild(span); return span
    })
  }
  // Holds the surge's peak frame (a snapshot of the film) above the game
  // while Level 3's first frames run. Only opacity/transform animate, so the
  // compositor keeps it moving even while those frames block the main thread.
  function buildSurge() {
    const layer = doc.createElement('div'); layer.id = 'story-surge'
    Object.assign(layer.style, { position: 'absolute', inset: '0', opacity: '0', overflow: 'hidden', pointerEvents: 'none', willChange: 'transform, opacity',
      transformOrigin: '50% 52%',
      // Fallback look if the snapshot is unavailable: the same blue grade.
      background: 'radial-gradient(ellipse at 50% 52%, #dff5ff 0%, #7fd3f8 16%, #2a9fd8 42%, #0b4f7a 75%, #052238 100%)' })
    const style = doc.createElement('style')
    style.textContent = '@keyframes l3-surge-pull{from{transform:scale(1)}to{transform:scale(1.1)}}'
      + '@keyframes l3-surge-core{from{opacity:.25}to{opacity:.7}}'
    layer.appendChild(style)
    // A 2D canvas: the snapshot is copied in on the GPU (no readback/encode).
    frame = doc.createElement('canvas')
    Object.assign(frame.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', willChange: 'transform', transformOrigin: '50% 52%' })
    layer.appendChild(frame)
    const core = doc.createElement('div')
    Object.assign(core.style, { position: 'absolute', inset: '0', willChange: 'opacity',
      background: 'radial-gradient(ellipse at 50% 52%, rgba(235,249,255,0.85) 0%, rgba(150,220,252,0.35) 22%, rgba(56,189,248,0) 50%)',
      animation: 'l3-surge-core 0.9s ease-in-out infinite alternate' })
    layer.appendChild(core)
    return layer
  }
  function buildDom() {
    root = doc.createElement('div'); root.id = 'story-transition'
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '11000', pointerEvents: 'auto', fontFamily: THEME.serif })
    surge = buildSurge(); root.appendChild(surge)
    strip = doc.createElement('div'); strip.id = 'story-captions'
    Object.assign(strip.style, { position: 'absolute', bottom: `${beat.captions.bottomVh}vh`, left: '50%', transform: 'translateX(-50%)', width: 'min(980px, 92vw)', maxWidth: '980px', textAlign: 'center', visibility: 'hidden', opacity: '0', willChange: 'opacity' })
    const caption = doc.createElement('div')
    Object.assign(caption.style, { color: '#f3ead6', fontFamily: 'Georgia, serif', fontSize: 'clamp(18px, 1.91vw, 26px)', lineHeight: '1.4', textShadow: '0 0 2px #000, 0 2px 6px #000, 0 0 14px rgba(0,0,0,0.85)' })
    blocks = beat.panels.map(panel => panel.captions.map(chunk => {
      const block = doc.createElement('div'); block.style.display = 'none'
      const item = { block, letters: makeLetters(block, chunk.text), shown: -1 }
      caption.appendChild(block); return item
    }))
    strip.appendChild(caption); root.appendChild(strip)
    button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Skip'
    Object.assign(button.style, { position: 'absolute', right: '24px', top: '12px', padding: '8px 14px', color: THEME.parchment, background: '#111820', border: `1px solid ${THEME.brass}`, borderRadius: '4px', font: 'inherit', cursor: 'pointer' })
    button.addEventListener('click', skip); root.appendChild(button)
    root.addEventListener('click', swallow); root.addEventListener('pointerdown', swallow)
    doc.body.appendChild(root)
  }
  function showCaption(panelIndex, chunkIndex, count) {
    blocks.forEach((panel, p) => panel.forEach((item, c) => {
      const visible = p === panelIndex && c === chunkIndex
      item.block.style.display = visible ? 'block' : 'none'
      if (visible && item.shown !== count) {
        for (let i = 0; i < item.letters.length; i++) item.letters[i].style.visibility = i < count ? 'visible' : 'hidden'
        item.shown = count
      }
    }))
  }
  // Snapshot of the canvas, taken right after the film drew its surge peak
  // (same task, so no preserveDrawingBuffer is needed). createImageBitmap
  // keeps it on the GPU; drawing it into the 2D canvas is a GPU copy, so
  // there is no pixel readback or JPEG encode stalling the frame.
  function captureFrame() {
    captureWanted = false
    const canvas = renderer.domElement
    const createBitmap = globalThis.createImageBitmap
    if (!canvas || typeof createBitmap !== 'function' || !frame?.getContext) { captureState = 'failed'; return }
    captureState = 'pending'
    const done = ok => { if (captureState === 'pending') captureState = ok ? 'ready' : 'failed' }
    captureTimer = setTimer(() => done(false), CAPTURE_TIMEOUT_MS)
    const at = now()
    try {
      createBitmap(canvas).then(bitmap => {
        if (disposed || !frame) { bitmap.close?.(); return done(false) }
        frame.width = bitmap.width; frame.height = bitmap.height
        frame.getContext('2d').drawImage(bitmap, 0, 0)
        bitmap.close?.()
        if (import.meta.env?.DEV) console.log(`[perf] l3 snapshot ${(now() - at).toFixed(1)}ms`)
        done(true)
      }, error => { log('l3 snapshot failed', error?.message); done(false) })
    } catch { done(false) }
  }

  // ---- input ----
  function swallow(event) { event.stopPropagation() }
  function keydown(event) {
    if (!active) return
    if (event.code === 'Escape' || event.code === 'Enter') { event.preventDefault(); event.stopImmediatePropagation() }
    if (event.code === 'Enter' && !event.repeat && enterReady) skip()
    if (event.code === 'Enter') enterHeld = true
  }
  function keyup(event) { if (event.code === 'Enter') { enterHeld = false; enterReady = true } }
  function blur() { enterHeld = false; enterReady = true }

  // ---- lifecycle ----
  function setPhase(next) { phase = next; phaseStartedAt = now(); log('l3', next) }
  const phaseTime = () => (now() - phaseStartedAt) / 1000
  function setTexture(i, uniform, dimensions) {
    const texture = textures[i] || black
    uniform.value = texture
    dimensions.value.set(texture.image?.width || 16, texture.image?.height || 9)
  }
  function start() {
    if (disposed || active) return
    active = true; enterReady = !enterHeld
    keys.addEventListener('keydown', keydown, true)
    keys.addEventListener('keyup', keyup, true)
    keys.addEventListener('blur', blur)
    keys.addEventListener('resize', storyResolution)
    prefetch(); warm()
    timeline = buildTransitionTimeline(beat, beat.panels.map((_, i) => clips[i]?.duration))
    buildDom()
    u.uRain.value = 0; u.uFade.value = 1; u.uOpacity.value = 0; u.uImage.value = 1; u.uMix.value = 1
    u.uPaperOpacity.value = 0; u.uSteam.value = 0; u.uTrainHeight.value = 0; u.uSmokeClear.value = 0
    u.uBand.value.set(0, 1)
    u.uRingCenter.value.set(RIPPLE_CENTER[0], RIPPLE_CENTER[1]); u.uRingSquash.value = RIPPLE_SQUASH
    u.uWarpPulseHz.value = WARP_PULSE_HZ
    resetFx()
    fadeMasterOut(t.startFade)
    origin = now(); time = 0; index = 0
    setPanel(0, u.uTexA, u.uSizeA, u.uZoomA, u.uPanA); setPanel(0, u.uTexB, u.uSizeB, u.uZoomB, u.uPanB)
    // Generous while Level 3 builds (slow machines); reset once panels move.
    armHardTimeout(t.timeout * 2)
    setPhase('fadeOut')
  }
  function enterBuild() {
    u.uOpacity.value = 1
    // Music and the gameplay drone are silent now; stop them and give the
    // narration its normal master level back.
    onBlack()
    restoreMaster()
    acquireRenderer() // panel 1 is opaque from here: full story resolution
    if (!skipped) {
      // Line 1 and its first caption are queued on the audio clock / the
      // compositor, so both run on time through the blocking build.
      const entry = timeline[0]
      playNarration(0, entry.clipStart - time)
      strip.style.visibility = 'visible'
      showCaption(0, 0, beat.panels[0].captions[0].text.length)
      strip.style.transition = `opacity ${t.captionFade}s linear ${Math.max(0, entry.clipStart - time).toFixed(3)}s`
      strip.style.opacity = '1'
    }
    warm()
    setPhase('build'); buildStartedAt = now()
    onBuild()
  }
  function armHardTimeout(seconds) {
    clearTimer(hardTimer)
    hardTimer = setTimer(() => { if (active) { log('l3 hard timeout'); finish() } }, seconds * 1000)
  }
  function afterBuild() {
    if (import.meta.env?.DEV) console.log(`[load] level3 built ${(now() - buildStartedAt).toFixed(1)}ms (on panel 1)`)
    const at = now()
    warm() // in case the panels finished loading during the build
    // Level 3's first real frame is drawn now, with the game's own renderer
    // settings, so its shaders/textures/buffers are created behind panel 1;
    // the film is drawn over it before the browser shows anything.
    releaseRenderer()
    onPrewarm()
    acquireRenderer()
    if (import.meta.env?.DEV) console.log(`[perf] level3 first frame ${(now() - at).toFixed(1)}ms (on panel 1)`)
    // Panel 1 stays still until frames are steady again (see settle()).
    settled = false; settleCount = 0
    strip.style.transition = 'none'
    armHardTimeout(t.timeout)
    if (skipped) beginSurge(t.skipSurge)
    else setPhase('panels')
  }
  // Frames are steady again after the build/first-frame stall: panel 1 starts
  // zooming and its effects begin. If that is late, panel 1 is lengthened so
  // its ring/shake still get their moment, and later panels move back.
  function settle() {
    settled = true
    zoomFrom = time
    if (index !== 0) return
    fxShift = Math.max(0, time + 0.3 - RIPPLES[0].at)
    const extra = RIPPLES[0].at + fxShift + t.panel1FxMin - timeline[0].end
    if (extra > 0) {
      timeline[0].end += extra
      for (let i = 1; i < timeline.length; i++) { timeline[i].start += extra; timeline[i].end += extra; timeline[i].clipStart += extra }
    }
    log('l3 settled', time.toFixed(2), fxShift > 0 ? `effects +${fxShift.toFixed(2)}s, panel 1 +${Math.max(0, extra).toFixed(2)}s` : '')
  }
  function beginSurge(seconds) {
    surgeSeconds = seconds; warpFrom = u.uWarp.value
    setPhase('surge')
  }
  function beginBlue() {
    // The page layer now shows exactly the film's last frame (or, if the
    // snapshot failed, the same blue grade), then slowly pushes in. The film
    // stops drawing and Level 3 starts running underneath at game
    // resolution; its heavy first frames are invisible behind the layer.
    clearTimer(captureTimer)
    if (captureState === 'ready') frame.style.animation = `l3-surge-pull ${t.blueMax + t.revealFade}s cubic-bezier(.2,.6,.3,1) forwards`
    else frame.style.display = 'none'
    surge.style.transition = 'none' // instant: the film below stops drawing this frame
    surge.style.opacity = '1'
    if (narrationGain) ramp(narrationGain.gain, 0, 0.25)
    fadeRumble(0.25)
    strip.style.transition = 'none'; strip.style.visibility = 'hidden'
    releaseRenderer()
    goodFrames = 0; gameFrames.length = 0
    log('l3 blue', captureState === 'ready' ? '(snapshot)' : '(gradient)')
    setPhase('blue')
  }
  function beginReveal() {
    if (import.meta.env?.DEV) console.log(`[perf] level3 frames under blue ${gameFrames.map(ms => ms.toFixed(1)).join(' ')}`)
    // The blue rushes towards the camera and clears onto Level 3.
    surge.style.transition = `opacity ${t.revealFade}s ease-in, transform ${t.revealFade}s ease-in`
    surge.style.opacity = '0'
    surge.style.transform = 'scale(1.18)'
    onReveal()
    setPhase('reveal')
  }
  function skip() {
    // surge/blue/reveal are already on the way out.
    if (!active || skipped || !['fadeOut', 'build', 'panels'].includes(phase)) return
    skipped = true; log('l3 skip')
    if (narrationGain) ramp(narrationGain.gain, 0, t.skipAudioFade)
    fadeRumble(t.skipAudioFade)
    strip.style.transition = 'none'; strip.style.visibility = 'hidden'
    if (phase === 'panels') beginSurge(t.skipSurge)
    // fadeOut/build: Level 3 still has to be built; the surge follows it.
  }
  function finish() {
    if (!active) return
    log('l3 complete')
    dispose(); onComplete()
  }
  function cancel() { if (!disposed) { log('l3 cancel'); dispose() } }
  function dispose() {
    if (disposed) return
    disposed = true; active = false
    clearTimer(loadTimer); clearTimer(hardTimer); clearTimer(captureTimer); abort.abort()
    if (frame) { frame.width = frame.height = 0 } // release the snapshot's memory
    stopSource(narration); narration = null; stopRumble()
    narrationGain?.disconnect(); bus?.disconnect(); limiter?.disconnect()
    narrationGain = bus = limiter = null
    restoreMaster()
    releaseRenderer()
    keys.removeEventListener('keydown', keydown, true)
    keys.removeEventListener('keyup', keyup, true)
    keys.removeEventListener('blur', blur)
    keys.removeEventListener('resize', storyResolution)
    button?.removeEventListener('click', skip)
    root?.removeEventListener('click', swallow); root?.removeEventListener('pointerdown', swallow)
    root?.remove(); root = strip = surge = frame = button = null; blocks = []
    textures.forEach(texture => texture?.dispose()); textures.length = 0
    clips.length = 0; sfx.length = 0; timeline = null
    black.dispose(); film.dispose()
  }

  // ---- per-frame ----
  function resetFx() {
    u.uFx.value = FX_NONE; u.uFxShake.value.set(0, 0)
    u.uRingA.value.set(0, 0); u.uRingB.value.set(0, 0)
    u.uWarp.value = 0; u.uDust.value = 0
    if (phase !== 'surge') u.uSurge.value = 0
  }
  function rippleAt(spec, local, target) {
    const p = (local - spec.at) / spec.duration
    if (p <= 0 || p >= 1) { target.set(0, 0); return }
    // Fade in quickly, fade out as it spreads across the valley.
    target.set(RIPPLE_MAX_RADIUS * (1 - Math.pow(1 - p, 2)), spec.strength * smooth(p / 0.12) * (1 - smooth(p)))
  }
  function updateFx(panel, local, duration) {
    resetFx()
    u.uFx.value = FX_IDS[panel.fx] ?? FX_NONE
    if (panel.fx === 'tremor') {
      const env = smooth((local - TREMOR_SHAKE_IN[0]) / (TREMOR_SHAKE_IN[1] - TREMOR_SHAKE_IN[0]))
        * (1 - (1 - TREMOR_SHAKE_END) * smooth((local - TREMOR_SHAKE_IN[1]) / Math.max(0.1, duration - TREMOR_SHAKE_IN[1])))
      shakeOffset(time, TREMOR_SHAKE * env, 1, shake)
      rippleAt(RIPPLES[0], local, u.uRingA.value)
      rippleAt(RIPPLES[1], local, u.uRingB.value)
    } else if (panel.fx === 'rockslide') {
      shakeOffset(time, ROCK_SHAKE * envelope(ROCK_SHAKE_KEYS, local), ROCK_SHAKE_VERTICAL, shake)
      u.uDust.value = DUST_STRENGTH
    } else if (panel.fx === 'timewarp') {
      u.uWarp.value = smooth(local / 1.0)
    }
    u.uFxShake.value.set(shake.x, shake.y)
    shake.x = shake.y = 0
  }
  function setPanel(i, tex, dimensions, zoom, pan) {
    const panel = beat.panels[i], entry = timeline[i]
    setTexture(i, tex, dimensions)
    // Panel 1 holds its first frame until Level 3 is built.
    const from = i === 0 ? Math.max(entry.start, zoomFrom) : entry.start
    const progress = Math.min(1, Math.max(0, (time - from) / Math.max(0.1, entry.end - from)))
    zoom.value = panel.zoom[0] + (panel.zoom[1] - panel.zoom[0]) * progress
    pan.value.set(panel.pan[0] * progress, panel.pan[1] * progress)
  }
  function updatePanels() {
    const end = timeline[timeline.length - 1].end
    const clamped = Math.min(time, end - 1e-3)
    let next = 0
    while (next + 1 < timeline.length && clamped >= timeline[next + 1].start) next++
    // However long Level 3's first frame takes, panel 1 waits for it;
    // settle() then moves the rest of the cutscene back.
    if (!settled) next = 0
    if (next !== index) { index = next; log('l3 panel', index + 1) }
    const entry = timeline[index], panel = beat.panels[index], local = clamped - entry.start
    if (!skipped && narrationIndex < index && time >= entry.clipStart) playNarration(index)
    if (!skipped && panel.sfx && !rumbleStarted) startRumble(panel.sfx, sfx[index])
    if (rumbleStarted && !rumbleFading && !panel.sfx) fadeRumble(beat.panels.find(p => p.sfx)?.sfx.fade ?? 0.6)
    setPanel(Math.max(0, index - 1), u.uTexA, u.uSizeA, u.uZoomA, u.uPanA)
    setPanel(index, u.uTexB, u.uSizeB, u.uZoomB, u.uPanB)
    u.uMix.value = index === 0 ? 1 : Math.min(1, local / t.crossfade)
    if (index === 0 && !settled) { resetFx() } // perfectly still until steady
    else if (index === 0) updateFx(panel, local - fxShift, entry.end - entry.start - fxShift)
    else updateFx(panel, local, entry.end - entry.start)
    if (skipped) return
    // Captions follow the line's own clock.
    const clipLocal = time - entry.clipStart
    if (clipLocal < 0) { strip.style.opacity = 0; showCaption(index, 0, 0); return }
    const chunk = captionAt(panel, entry.clip, clipLocal)
    const text = panel.captions[chunk.index].text
    // Panel 1's first line was already shown whole during the build.
    const count = index === 0 && chunk.index === 0 ? text.length
      : Math.floor(text.length * typewriterProgress(chunk.local, chunk.spoken, t.typewriterFraction))
    showCaption(index, chunk.index, count)
    strip.style.opacity = Math.min(1, index === 0 && chunk.index === 0 ? 1 : clipLocal / t.captionFade, Math.max(0, (entry.end - time) / t.captionFade))
  }
  function update(delta) {
    if (!active) return
    u.uTime.value += Math.min(Math.max(0, delta), 0.25)
    // Wall clock: after a blocked frame, pictures catch up with the voice.
    time = (now() - origin) / 1000
    const gap = now() - lastUpdateAt; lastUpdateAt = now()
    if (phase === 'fadeOut') {
      u.uOpacity.value = smooth(phaseTime() / t.startFade)
      if (phaseTime() >= t.startFade) enterBuild()
    } else if (phase === 'build') {
      if (prepared && isLevelReady()) afterBuild()
    } else if (phase === 'panels') {
      if (!settled) {
        settleCount = gap < t.settleFrameMs ? settleCount + 1 : 0
        if (settleCount >= t.settleFrames) settle()
      }
      updatePanels()
      if (settled && time >= timeline[timeline.length - 1].end - t.surge) beginSurge(t.surge)
    } else if (phase === 'surge') {
      updatePanels()
      // The cracks blaze and the frame floods blue (all in the film shader).
      const p = smooth(phaseTime() / surgeSeconds)
      if (beat.panels[index].fx === 'timewarp') u.uWarp.value = Math.max(warpFrom, 1) + (t.surgeWarp - Math.max(warpFrom, 1)) * p
      u.uSurge.value = p
      if (p >= 1 && !captureState) captureWanted = true
      if (captureState === 'ready' || captureState === 'failed') beginBlue()
    } else if (phase === 'blue') {
      if ((phaseTime() >= t.blueMin && goodFrames >= t.warmGoodFrames) || phaseTime() >= t.blueMax) beginReveal()
    } else if (phase === 'reveal') {
      if (phaseTime() >= t.revealFade) finish()
    }
  }
  function render() {
    if (!active || phase === 'blue' || phase === 'reveal') return // page layer covers / clears onto the game
    const overGame = phase === 'fadeOut'
    if (!overGame) storyResolution()
    renderer.getDrawingBufferSize(size); u.uResolution.value.copy(size)
    const autoClear = renderer.autoClear
    if (overGame) renderer.autoClear = false
    try { renderer.setRenderTarget(null); renderer.render(film.scene, film.camera) }
    finally { renderer.autoClear = autoClear }
    if (captureWanted) captureFrame()
  }
  return { prefetch, start, update, render, skip, cancel, dispose,
    unlockAudio() { try { return Promise.resolve(context()?.resume()) } catch { return Promise.resolve() } },
    recordFrame(ms, fullGameFrame = true) {
      if (!active || phase !== 'blue') return
      if (gameFrames.length < 180) gameFrames.push(ms)
      goodFrames = fullGameFrame && Number.isFinite(ms) && ms >= 0 && ms < t.warmFrameMs ? goodFrames + 1 : 0
    },
    resources() {
      return { listeners: disposed ? 0 : 4, dom: root ? 1 : 0,
        audioNodes: [narration, narrationGain, rumble, rumbleGain, bus, limiter].filter(Boolean).length,
        textures: textures.filter(Boolean).length, masterFaded: masterSaved !== null }
    },
    get phase() { return phase },
    get active() { return active },
    get prepared() { return prepared },
    // main.js draws the game under the beat in these phases…
    get showGame() { return active && (phase === 'fadeOut' || phase === 'blue' || phase === 'reveal') },
    // …and runs it (presentation frames) once Level 3 exists.
    get liveGame() { return active && (phase === 'blue' || phase === 'reveal') },
    get lookAroundAngle() { return 0 },
    get underSmoke() { return false },
    get showQuad() { return active }
  }
}

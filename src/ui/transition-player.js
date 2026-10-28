import * as THREE from 'three'
import { getContext, getMasterGain } from '../core/audio.js'
import { THEME } from './ui-theme.js'
import { createStoryFilm, FX_NONE, FX_TREMOR, FX_ROCKSLIDE, FX_TIMEWARP } from '../shaders/story-film.js'
import { typewriterProgress } from './story-player.js'
import {
  TREMOR_SHAKE, TREMOR_SHAKE_IN, TREMOR_SHAKE_END, RIPPLE_CENTER, RIPPLE_SQUASH, RIPPLE_MAX_RADIUS, RIPPLES,
  ROCK_SHAKE, ROCK_SHAKE_VERTICAL, ROCK_SHAKE_KEYS, DUST_STRENGTH, WARP_PULSE_HZ,
  SLIP_EVERY, SLIP_DURATION_S, SLIP_BAND, SLIP_MIN_Y, SLIP_MAX_Y
} from '../story/l3-transition-beat.js'

// Mid-game narrated cutscene (Level 2 → Level 3). Owns the same slot in
// main.js as the intro's story player, so STORY input, pause blocking, music
// gating and minimap rules apply unchanged. Phases:
//   fadeOut  game still drawn, black veil 0 → 1, master volume fades with it
//   build    opaque black (also over the loading screen); main.js swaps levels
//   panels   3 ink panels with narration, captions and panel effects
//   darken   last panel → black
//   warm     opaque black over the LIVE new level until frames are steady
//   reveal   black veil 1 → 0, then hand control back
const log = (...args) => { if (import.meta.env?.DEV) console.log('[story]', ...args) }
const FX_IDS = { none: FX_NONE, tremor: FX_TREMOR, rockslide: FX_ROCKSLIDE, timewarp: FX_TIMEWARP }
const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

// Panel i: [start, end). The line starts narrationDelay after the panel
// appears; the next panel starts after the line plus its hold.
export function buildTransitionTimeline(beat, clipDurations) {
  let cursor = 0
  return beat.panels.map((panel, i) => {
    const clip = clipDurations[i] ?? beat.timings.fallbackClip
    const last = i === beat.panels.length - 1
    const start = cursor
    const clipStart = start + beat.timings.narrationDelay
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

// Deterministic glitch schedule over one panel: [{ at, y, height }].
export function slipSchedule(duration, seed = 7) {
  let state = seed
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 }
  const slips = []
  let at = SLIP_EVERY[0] * 0.5
  while (at < duration - SLIP_DURATION_S) {
    const height = SLIP_BAND[0] + (SLIP_BAND[1] - SLIP_BAND[0]) * random()
    const y = SLIP_MIN_Y + (SLIP_MAX_Y - height - SLIP_MIN_Y) * random()
    slips.push({ at, y, height })
    at += SLIP_EVERY[0] + (SLIP_EVERY[1] - SLIP_EVERY[0]) * random()
  }
  return slips
}

export function createTransitionPlayer({ beat, renderer, onBlack = () => {}, isLevelReady = () => true,
  onComplete = () => {}, onRendererRestore = () => {},
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
  let phase = '', phaseTime = 0, time = 0, index = -1, skipped = false, veil = 0, darkenFrom = 1
  let timeline = null, slips = [], savedRenderer = null
  let root = null, strip = null, cover = null, button = null, blocks = []
  let bus = null, limiter = null, narrationGain = null, narration = null, rumbleGain = null, rumble = null
  let narrationIndex = -1, rumbleStarted = false, rumbleFading = false
  let masterSaved = null, buildStartedAt = 0, goodFrames = 0, warmWall = 0, warmStartedAt = 0
  const warmFrames = []
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
  function playNarration(i) {
    const ctx = context(), buffer = clips[i]
    narrationIndex = i
    if (!buffer || ctx?.state !== 'running' || !ensureBus()) return
    try {
      stopSource(narration)
      narration = ctx.createBufferSource(); narration.buffer = buffer
      narration.connect(narrationGain); narration.start()
      log('l3 line', i + 1)
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
  function warm() {
    if (disposed || warmed) return
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
  function buildDom() {
    root = doc.createElement('div'); root.id = 'story-transition'
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '11000', pointerEvents: 'auto', fontFamily: THEME.serif })
    // Hides the level manager's loading screen while Level 3 is built.
    cover = doc.createElement('div')
    Object.assign(cover.style, { position: 'absolute', inset: '0', background: '#000', display: 'none' })
    root.appendChild(cover)
    strip = doc.createElement('div'); strip.id = 'story-captions'
    Object.assign(strip.style, { position: 'absolute', bottom: `${beat.captions.bottomVh}vh`, left: '50%', transform: 'translateX(-50%)', width: 'min(980px, 92vw)', maxWidth: '980px', textAlign: 'center', visibility: 'hidden' })
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
  function setPhase(next) { phase = next; phaseTime = 0; log('l3', next) }
  function start() {
    if (disposed || active) return
    active = true; enterReady = !enterHeld
    keys.addEventListener('keydown', keydown, true)
    keys.addEventListener('keyup', keyup, true)
    keys.addEventListener('blur', blur)
    keys.addEventListener('resize', storyResolution)
    buildDom()
    prefetch()
    u.uRain.value = 0; u.uFade.value = 1; u.uOpacity.value = 0; u.uImage.value = 0; u.uMix.value = 1
    u.uPaperOpacity.value = 0; u.uSteam.value = 0; u.uTrainHeight.value = 0; u.uSmokeClear.value = 0
    u.uBand.value.set(0, 1)
    u.uRingCenter.value.set(RIPPLE_CENTER[0], RIPPLE_CENTER[1]); u.uRingSquash.value = RIPPLE_SQUASH
    u.uWarpPulseHz.value = WARP_PULSE_HZ
    setTexture(0, u.uTexA, u.uSizeA); setTexture(0, u.uTexB, u.uSizeB)
    fadeMasterOut(t.startFade)
    hardTimer = setTimer(() => { if (active) { log('l3 hard timeout'); finish() } }, t.timeout * 1000)
    setPhase('fadeOut')
  }
  function setTexture(i, uniform, dimensions) {
    const texture = textures[i] || black
    uniform.value = texture
    dimensions.value.set(texture.image?.width || 16, texture.image?.height || 9)
  }
  function enterBlack() {
    veil = 1; cover.style.display = 'block'
    setPhase('build'); buildStartedAt = now()
    // Music and the gameplay drone are silent at this point; stop them, then
    // give the narration its normal master level back.
    onBlack()
    restoreMaster()
  }
  function beginPanels() {
    cover.style.display = 'none'
    warm()
    timeline = buildTransitionTimeline(beat, beat.panels.map((_, i) => clips[i]?.duration))
    const last = timeline[timeline.length - 1]
    slips = slipSchedule(last.end - last.start)
    acquireRenderer()
    time = 0; index = -1
    strip.style.visibility = 'visible'
    setPhase('panels')
  }
  function beginWarm() {
    stopSource(narration); narration = null; fadeRumble(0.1)
    strip.style.visibility = 'hidden'; cover.style.display = 'none'
    releaseRenderer()
    resetFx()
    u.uImage.value = 0; veil = 1; goodFrames = 0; warmWall = 0; warmStartedAt = now(); warmFrames.length = 0
    setPhase('warm')
  }
  function skip() {
    // darken/warm/reveal are already on the way out.
    if (!active || skipped || !['fadeOut', 'build', 'panels'].includes(phase)) return
    skipped = true; log('l3 skip')
    if (phase === 'panels') {
      if (narrationGain) ramp(narrationGain.gain, 0, t.skipAudioFade)
      fadeRumble(t.skipAudioFade)
      darkenFrom = u.uImage.value
      strip.style.visibility = 'hidden'
      setPhase('darken')
    }
    // fadeOut/build: the level still has to be built; panels are skipped.
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
    clearTimer(loadTimer); clearTimer(hardTimer); abort.abort()
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
    root?.remove(); root = strip = cover = button = null; blocks = []
    textures.forEach(texture => texture?.dispose()); textures.length = 0
    clips.length = 0; sfx.length = 0; timeline = null
    black.dispose(); film.dispose()
  }

  // ---- per-frame ----
  function resetFx() {
    u.uFx.value = FX_NONE; u.uFxShake.value.set(0, 0)
    u.uRingA.value.set(0, 0); u.uRingB.value.set(0, 0)
    u.uWarp.value = 0; u.uSlip.value.set(0, 0, 0); u.uDust.value = 0
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
      const slip = slips.find(s => local >= s.at && local < s.at + SLIP_DURATION_S)
      if (slip) u.uSlip.value.set(1, slip.y, slip.height)
    }
    u.uFxShake.value.set(shake.x, shake.y)
    shake.x = shake.y = 0
  }
  function setPanel(i, tex, dimensions, zoom, pan) {
    const panel = beat.panels[i], entry = timeline[i]
    setTexture(i, tex, dimensions)
    const progress = Math.min(1, Math.max(0, (time - entry.start) / (entry.end - entry.start)))
    zoom.value = panel.zoom[0] + (panel.zoom[1] - panel.zoom[0]) * progress
    pan.value.set(panel.pan[0] * progress, panel.pan[1] * progress)
  }
  function updatePanels(delta) {
    time += delta
    const end = timeline[timeline.length - 1].end
    if (time >= end) { darkenFrom = u.uImage.value; strip.style.visibility = 'hidden'; setPhase('darken'); return }
    let next = 0
    while (next + 1 < timeline.length && time >= timeline[next + 1].start) next++
    if (next !== index) { index = next; log('l3 panel', index + 1) }
    const entry = timeline[index], panel = beat.panels[index], local = time - entry.start
    if (narrationIndex < index && time >= entry.clipStart) playNarration(index)
    if (panel.sfx && !rumbleStarted) startRumble(panel.sfx, sfx[index])
    if (rumbleStarted && !rumbleFading && !panel.sfx) fadeRumble(beat.panels.find(p => p.sfx)?.sfx.fade ?? 0.6)
    setPanel(Math.max(0, index - 1), u.uTexA, u.uSizeA, u.uZoomA, u.uPanA)
    setPanel(index, u.uTexB, u.uSizeB, u.uZoomB, u.uPanB)
    u.uMix.value = index === 0 ? 1 : Math.min(1, local / t.crossfade)
    u.uImage.value = Math.min(1, time / t.firstPanelFade)
    updateFx(panel, local, entry.end - entry.start)
    // Captions follow the line's own clock.
    const clipLocal = time - entry.clipStart
    if (clipLocal < 0) { strip.style.opacity = 0; showCaption(index, 0, 0); return }
    const chunk = captionAt(panel, entry.clip, clipLocal)
    const text = panel.captions[chunk.index].text
    showCaption(index, chunk.index, Math.floor(text.length * typewriterProgress(chunk.local, chunk.spoken, t.typewriterFraction)))
    strip.style.opacity = Math.min(1, clipLocal / t.captionFade, Math.max(0, (entry.end - time) / t.captionFade))
  }
  function update(delta) {
    if (!active) return
    delta = Math.min(Math.max(0, delta), t.maxFrame)
    phaseTime += delta
    u.uTime.value += delta
    if (phase === 'fadeOut') {
      veil = Math.min(1, phaseTime / t.startFade)
      if (veil >= 1) enterBlack()
    } else if (phase === 'build') {
      if (prepared && isLevelReady()) {
        if (import.meta.env?.DEV) console.log(`[load] level3 built under black ${(now() - buildStartedAt).toFixed(1)}ms`)
        if (skipped) beginWarm()
        else beginPanels()
      }
    } else if (phase === 'panels') {
      updatePanels(delta)
    } else if (phase === 'darken') {
      const duration = skipped ? t.skipDarken : t.endDarken
      u.uImage.value = darkenFrom * (1 - smooth(phaseTime / duration))
      if (phaseTime >= duration) beginWarm()
    } else if (phase === 'warm') {
      warmWall = Math.max(phaseTime, (now() - warmStartedAt) / 1000)
      if (goodFrames >= t.warmGoodFrames || warmWall >= t.warmMax) {
        if (import.meta.env?.DEV) console.log(`[perf] level3 warm frames ${warmFrames.map(ms => ms.toFixed(1)).join(' ')} good=${goodFrames} after ${warmWall.toFixed(2)}s`)
        setPhase('reveal')
      }
    } else if (phase === 'reveal') {
      veil = 1 - smooth(phaseTime / t.revealFade)
      if (phaseTime >= t.revealFade) finish()
    }
  }
  function render() {
    if (!active) return
    const overGame = phase === 'fadeOut' || phase === 'warm' || phase === 'reveal'
    if (phase === 'panels' || phase === 'darken') { u.uOpacity.value = 1; storyResolution() }
    else { u.uImage.value = 0; u.uOpacity.value = phase === 'build' ? 1 : veil }
    renderer.getDrawingBufferSize(size); u.uResolution.value.copy(size)
    const autoClear = renderer.autoClear
    if (overGame) renderer.autoClear = false
    try { renderer.setRenderTarget(null); renderer.render(film.scene, film.camera) }
    finally { renderer.autoClear = autoClear }
  }
  return { prefetch, start, update, render, skip, cancel, dispose,
    unlockAudio() { try { return Promise.resolve(context()?.resume()) } catch { return Promise.resolve() } },
    recordFrame(ms, fullGameFrame = true) {
      if (!active || phase !== 'warm') return
      if (warmFrames.length < 120) warmFrames.push(ms)
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
    // main.js draws the game under the veil in these phases…
    get showGame() { return active && (phase === 'fadeOut' || phase === 'warm' || phase === 'reveal') },
    // …but only runs it (presentation frames) once Level 3 exists.
    get liveGame() { return active && (phase === 'warm' || phase === 'reveal') },
    get lookAroundAngle() { return 0 },
    get underSmoke() { return false },
    get showQuad() { return active }
  }
}

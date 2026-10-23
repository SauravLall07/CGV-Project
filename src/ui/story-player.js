import * as THREE from 'three'
import { getContext, getMasterGain } from '../core/audio.js'
import { THEME } from './ui-theme.js'
import { createStoryFilm, FILM_RAIN, CARD_RAIN } from '../shaders/story-film.js'
import { createNewspaperTexture } from '../story/newspaper-texture.js'
import { createTitleTexture } from '../story/title-texture.js'

const log = (...args) => { if (import.meta.env?.DEV) console.log('[story]', ...args) }
const audioLog = message => { if (import.meta.env?.DEV) console.log('[story-audio]', message) }
export function createRainLevelMeter(analyser, report = audioLog) {
  // One PCM workspace for this analyser's lifetime, never one per sample.
  const samples = new Float32Array(analyser.fftSize)
  let elapsed = 0
  return {
    update(delta) {
      elapsed += Math.max(0, delta)
      if (elapsed < 1) return
      elapsed %= 1
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
      const rms = Math.sqrt(sum / samples.length)
      report(`rain level rms=${rms.toFixed(5)}`)
      return rms
    }
  }
}
export const typewriterProgress = (elapsed, duration, fraction = 0.85) => Math.min(1, Math.max(0, elapsed / Math.max(0.001, duration * fraction)))
export function endingTimeline(beat, panels) {
  const push = panels[panels.length - 1].end
  const ripple = push + beat.timings.push
  const title = ripple + beat.timings.ripple - beat.timings.titleSettle
  const dissolve = ripple + beat.timings.ripple + beat.timings.titleHold
  return { push, ripple, title, dissolve, complete: dissolve + beat.timings.dissolve }
}

export function buildStoryTimeline(beat, buffers, audible) {
  let cursor = beat.timings.opening ?? beat.timings.fadeIn
  return beat.panels.map((panel, index) => {
    const buffer = audible && buffers[panel.audio]
    const sharedBefore = buffer && index > 0 && beat.panels[index - 1].audio === panel.audio
    const sharedAfter = buffer && beat.panels[index + 1]?.audio === panel.audio
    const offset = sharedBefore ? panel.switchAt : 0
    const segment = buffer ? Math.max(0, (sharedAfter ? beat.panels[index + 1].switchAt : buffer.duration) - offset) : beat.timings.fallback
    const start = cursor
    cursor += segment + (buffer && !sharedAfter ? beat.timings.hold : 0)
    return { start, end: cursor, segment, offset, play: !sharedBefore, buffer: buffer || null }
  })
}

// This owner is prepared during title loading and consumed by one run. All
// asynchronous writes check its generation; late decode/image results cannot
// resurrect a disposed owner. Dependency injection keeps lifecycle tests real.
export function createStoryPlayer({ beat, renderer, onComplete = () => {}, onDissolve = () => {},
  measureRain = Boolean(import.meta.env?.DEV),
  context = getContext, master = getMasterGain, doc = globalThis.document,
  keys = globalThis.window, loadImage = url => new THREE.ImageLoader().loadAsync(url),
  loadAudio = async (url, ctx, signal) => {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Story audio HTTP ${response.status}`)
    return ctx.decodeAudioData(await response.arrayBuffer())
  }, film = createStoryFilm(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let generation = 0, disposed = false, active = false, readyPromise
  let root, caption, button, strip, timeline, index = -1, time = 0, fadeTime = -1
  let source = null, enterReady = false, enterHeld = false, timer, loadTimer
  let narrationGain = null, rainSource = null, rainGain = null, rainBuffer = null
  let request = null, unlockPromise = null, phase = '', audioWait = 0, revealCount = -1
  let newspaper = null, titleTexture = null, whistleBuffer = null, whistleSource = null, whistleGain = null
  let dissolving = false, dissolveTime = 0, dissolveDuration = 0, dissolveFrom = 0, rainFailed = false, rainFading = false
  let ending = null, pushed = false, rippled = false, titled = false
  let storyBus = null, limiter = null, rainAnalyser = null, rainMeter = null
  let savedRenderer = null
  const savedViewport = new THREE.Vector4()
  function storyResolution() {
    if (!active || !savedRenderer) return
    const ratio = Math.min(keys.devicePixelRatio || 1, 2)
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
  }
  function acquireRenderer() {
    renderer.getViewport(savedViewport)
    savedRenderer = { pixelRatio: renderer.getPixelRatio(), outputColorSpace: renderer.outputColorSpace }
    storyResolution()
  }
  function releaseRenderer() {
    if (!savedRenderer) return
    renderer.setPixelRatio(savedRenderer.pixelRatio)
    renderer.outputColorSpace = savedRenderer.outputColorSpace
    renderer.setViewport(savedViewport)
    savedRenderer = null
  }
  function ensureStoryBus() {
    if (storyBus) return storyBus
    const ctx = context()
    if (!ctx) return null
    storyBus = ctx.createGain(); storyBus.gain.value = beat.bus.gain
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = beat.bus.threshold; limiter.knee.value = beat.bus.knee
    limiter.ratio.value = beat.bus.ratio; limiter.attack.value = beat.bus.attack
    limiter.release.value = beat.bus.release
    storyBus.connect(limiter); limiter.connect(master())
    return storyBus
  }
  const captionLetters = []
  // Whole text remains in normal inline flow, including invisible characters.
  // Revealing never changes wrapping, alignment or the dimensions of a line.
  function makeLetters(parent, text) {
    return Array.from(text, character => {
      const span = doc.createElement('span'); span.textContent = character
      span.style.visibility = 'hidden'; parent.appendChild(span); return span
    })
  }
  function reveal(letters, count) {
    for (let i = 0; i < letters.length; i++) letters[i].style.visibility = i < count ? 'visible' : 'hidden'
  }
  const textures = [], buffers = [], abort = new AbortController()
  const size = new THREE.Vector2()
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  black.needsUpdate = true
  function stopAudio() {
    request = null
    if (!source) return
    source.onended = null
    try { source.stop() } catch { /* already ended */ }
    source.disconnect(); source = null
  }
  function stopRain() {
    if (rainSource) {
      audioLog('rain stop')
      try { rainSource.stop() } catch { /* already stopped */ }
      rainSource.disconnect(); rainSource = null
    }
    rainGain?.disconnect(); rainGain = null
    rainAnalyser?.disconnect(); rainAnalyser = null; rainMeter = null
  }
  function startRain() {
    const ctx = context()
    if (!active || fadeTime >= 0 || rainFailed || rainFading || !rainBuffer || rainSource || ctx?.state !== 'running') return
    try {
      rainGain = ctx.createGain(); rainGain.connect(ensureStoryBus())
      if (measureRain) {
        rainAnalyser = ctx.createAnalyser(); rainAnalyser.fftSize = 1024
        // Side branch measures boosted rain before the mix/limiter/master.
        // Its output is unconnected, so it cannot double the audible route.
        rainGain.connect(rainAnalyser); rainMeter = createRainLevelMeter(rainAnalyser)
      }
      rainGain.gain.setValueAtTime(0, ctx.currentTime)
      rainGain.gain.linearRampToValueAtTime(beat.rain.volume, ctx.currentTime + beat.timings.rainFadeIn)
      rainSource = ctx.createBufferSource(); rainSource.buffer = rainBuffer
      rainSource.loop = true; rainSource.connect(rainGain); rainSource.start()
      audioLog(`rain start context=${ctx.state} master=${master()?.gain?.value} volume=${beat.rain.volume}`)
      audioLog(`rain loop 0..${rainBuffer.duration}`)
      audioLog(`rain fade in ${beat.timings.rainFadeIn}s`)
    } catch (error) { stopRain(); rainFailed = true; audioLog(`rain failed: ${error.message}`) }
  }
  function fadeRain(seconds) {
    if (!rainGain) return
    const now = context().currentTime
    rainGain.gain.cancelScheduledValues(now)
    rainGain.gain.setValueAtTime(rainGain.gain.value, now)
    rainGain.gain.linearRampToValueAtTime(0, now + seconds)
    rainFading = true; audioLog(`rain fade out ${seconds}s`)
  }
  function stopWhistle() {
    if (whistleSource) {
      try { whistleSource.stop() } catch { /* already ended */ }
      whistleSource.disconnect(); whistleSource = null
    }
    whistleGain?.disconnect(); whistleGain = null
  }
  function playWhistle() {
    if (!active || dissolving || phase !== 'push' || !whistleBuffer || whistleSource) return
    const ctx = context()
    if (ctx?.state !== 'running') { unlockAudio().then(playWhistleWhenRunning); return }
    try {
      whistleGain = ctx.createGain(); whistleGain.gain.value = beat.whistle.volume; whistleGain.connect(ensureStoryBus())
      whistleSource = ctx.createBufferSource(); whistleSource.buffer = whistleBuffer
      whistleSource.connect(whistleGain); whistleSource.start()
      audioLog(`whistle start volume=${beat.whistle.volume}`)
    } catch (error) { stopWhistle(); audioLog(`whistle failed: ${error.message}`) }
  }
  function playWhistleWhenRunning() { if (context()?.state === 'running') playWhistle() }
  function tryNarration() {
    const ctx = context(), pending = request
    if (!pending || pending.started || !active || fadeTime >= 0 || ctx?.state !== 'running') return
    try {
      // Own unity gain makes the narration route explicit without touching
      // settings/master volume. Keep both node references until teardown.
      if (!narrationGain) {
        narrationGain = ctx.createGain(); narrationGain.gain.value = 1
        narrationGain.connect(ensureStoryBus())
      }
      const node = ctx.createBufferSource()
      node.buffer = pending.buffer; node.connect(narrationGain)
      const offset = Math.min(pending.buffer.duration, pending.offset)
      node.onended = () => {
        audioLog(`ended line ${pending.line + 1}`)
        node.disconnect()
        if (source === node) source = null
      }
      source = node; node.start(0, offset); pending.started = true
      audioLog(`start line ${pending.line + 1} offset=${offset.toFixed(3)}`)
    } catch (error) {
      audioLog(`start failed line ${pending.line + 1}: ${error.message}`)
      stopAudio(); useFallback(pending.line)
    }
  }
  function unlockAudio() {
    const ctx = context()
    if (!ctx || disposed) return Promise.resolve()
    if (unlockPromise) return unlockPromise
    const token = generation
    try {
      // Invoke resume synchronously in the menu's New Game gesture, even
      // when Chrome reports running. Retry again at suspended panel entry.
      const resumed = ctx.resume()
      unlockPromise = Promise.resolve(resumed).then(() => {
        if (disposed || token !== generation) return
        startRain(); tryNarration()
      }, error => { audioLog(`resume failed: ${error.message}`) }).finally(() => { unlockPromise = null })
      return unlockPromise
    } catch (error) { audioLog(`resume failed: ${error.message}`); return Promise.resolve() }
  }
  function useFallback(line) {
    // Preserve the elapsed prefix; retime this entire narration group plus
    // the remaining groups. A failed unlock cannot hang or discard a clip
    // and then jump straight into the middle of its successor.
    const first = timeline.findIndex((entry, i) => beat.panels[i].audio === line)
    const start = timeline[first].start
    buffers[line] = null
    const replacement = buildStoryTimeline(beat, buffers, true)
    const shift = start - replacement[first].start
    for (let i = first; i < timeline.length; i++) {
      timeline[i] = replacement[i]; timeline[i].start += shift; timeline[i].end += shift
    }
    time = Math.max(time, start); request = null; audioWait = 0
    ending = endingTimeline(beat, timeline)
  }
  function prepare() {
    if (readyPromise) return readyPromise
    const token = generation
    newspaper = createNewspaperTexture(doc); titleTexture = createTitleTexture(doc)
    renderer.initTexture(newspaper); renderer.initTexture(titleTexture)
    // Queue ambience before the six images/five voices so a cold connection
    // pool cannot starve it behind all the larger story downloads.
    const rainReady = beat.rain ? loadAudio(beat.rain.url, context(), abort.signal).then(buffer => {
      if (!disposed && token === generation) rainBuffer = buffer
    }).catch(error => { rainFailed = true; audioLog(`rain failed decode/load: ${error.message}`) }) : Promise.resolve()
    const work = Promise.allSettled([
      ...beat.panels.map(async (panel, i) => {
        const image = await loadImage(panel.image)
        if (disposed || token !== generation) return
        const texture = new THREE.Texture(image)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = false
        texture.minFilter = texture.magFilter = THREE.LinearFilter
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate = true
        textures[i] = texture
        renderer.initTexture(texture)
      }),
      ...beat.audio.map(async (url, i) => {
        const buffer = await loadAudio(url, context(), abort.signal)
        if (!disposed && token === generation) buffers[i] = buffer
      }),
      rainReady,
      ...(beat.whistle ? [loadAudio(beat.whistle.url, context(), abort.signal).then(buffer => {
        if (!disposed && token === generation) whistleBuffer = buffer
      }).catch(error => { audioLog(`whistle failed decode/load: ${error.message}`) })] : [])
    ])
    // A stalled request cannot keep the title loading forever. Late results
    // are invalidated and their fetches aborted before warming the shader.
    readyPromise = Promise.race([work, new Promise(resolve => {
      loadTimer = setTimer(() => {
        generation++; abort.abort()
        if (!rainBuffer) { rainFailed = true; audioLog('rain failed: preparation timeout') }
        resolve()
      }, (beat.timings.prepareTimeout ?? 8) * 1000)
    })]).then(() => {
      clearTimer(loadTimer)
      if (disposed) return
      film.uniforms.uTexA.value = textures[0] || black
      film.uniforms.uTexB.value = textures[1] || black
      film.uniforms.uPaper.value = newspaper
      film.uniforms.uTitle.value = titleTexture
      renderer.initTexture(black)
      renderer.compile(film.scene, film.camera)
    })
    return readyPromise
  }
  function swallow(event) { event.stopPropagation() }
  function keydown(event) {
    if (event.code === 'Enter') enterHeld = true
    if (!active) return
    if (event.code === 'Escape' || event.code === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation()
    }
    if (event.code === 'Enter' && enterReady && !event.repeat) skip()
  }
  function keyup(event) { if (event.code === 'Enter') { enterHeld = false; enterReady = true } }
  function blur() { enterHeld = false; enterReady = true }
  // Track while the title is visible: its start callback is delayed until
  // after the menu fade, so the original key event is no longer available.
  keys.addEventListener('keydown', keydown, true)
  keys.addEventListener('keyup', keyup, true)
  keys.addEventListener('blur', blur)
  keys.addEventListener('resize', storyResolution)
  function dispose() {
    if (disposed) return
    disposed = true; active = false; generation++
    clearTimer(timer); clearTimer(loadTimer); abort.abort(); stopAudio()
    stopRain(); rainBuffer = null; stopWhistle(); whistleBuffer = null
    narrationGain?.disconnect(); narrationGain = null
    storyBus?.disconnect(); limiter?.disconnect(); storyBus = limiter = null
    releaseRenderer()
    keys.removeEventListener('keydown', keydown, true)
    keys.removeEventListener('keyup', keyup, true)
    keys.removeEventListener('blur', blur)
    keys.removeEventListener('resize', storyResolution)
    root?.removeEventListener('click', swallow)
    root?.removeEventListener('pointerdown', swallow)
    button?.removeEventListener('click', skip)
    root?.remove(); root = caption = button = strip = null
    captionLetters.length = 0
    textures.forEach(texture => texture.dispose()); textures.length = 0
    buffers.length = 0; timeline = null
    newspaper?.dispose(); titleTexture?.dispose(); newspaper = titleTexture = null
    black.dispose(); film.dispose()
  }
  function complete() {
    if (!active) return
    log('complete'); dispose(); onComplete()
  }
  function cancel() { if (!disposed) { log('cancel'); dispose() } }
  function skip() {
    if (!active || fadeTime >= 0) return
    log('skip'); stopAudio(); stopWhistle(); fadeTime = 0
    film.uniforms.uTitleOpacity.value = 0
    film.uniforms.uPaperOpacity.value = 0
    film.uniforms.uRipple.value = -1
    film.uniforms.uImage.value = 1
    film.uniforms.uFade.value = 1
    // A skipped newspaper dissolves its current painting directly into the
    // game; panel 1 supplies the underlying image once paper is hidden.
    setPanel(Math.max(0, index), film.uniforms.uTexA, film.uniforms.uSizeA, film.uniforms.uZoomA, film.uniforms.uPanA)
    setPanel(Math.max(0, index), film.uniforms.uTexB, film.uniforms.uSizeB, film.uniforms.uZoomB, film.uniforms.uPanB)
    beginDissolve(beat.timings.skipDissolve)
  }
  function beginDissolve(seconds) {
    const first = !dissolving
    dissolveFrom = first ? 0 : film.uniforms.uDissolve.value
    dissolving = true; dissolveTime = 0; dissolveDuration = seconds
    strip.style.visibility = 'hidden'; fadeRain(seconds)
    film.uniforms.uDissolve.value = dissolveFrom
    log('dissolve')
    if (first) onDissolve()
  }
  function start() {
    if (disposed || active) return
    active = true; time = 0; index = -1; enterReady = !enterHeld
    acquireRenderer()
    ensureStoryBus()
    timeline = buildStoryTimeline(beat, buffers, true)
    ending = endingTimeline(beat, timeline)
    audioLog(`context=${context()?.state ?? 'missing'} master=${master()?.gain?.value ?? 'missing'}`)
    audioLog(`bus gain=${storyBus?.gain.value ?? 'missing'} master=${master()?.gain?.value ?? 'missing'}`)
    const u = film.uniforms
    u.uBand.value.set(beat.band.bottom, 1 - beat.band.top)
    root = doc.createElement('div')
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '11000', pointerEvents: 'auto', fontFamily: THEME.serif })
    strip = doc.createElement('div'); strip.id = 'story-captions'
    Object.assign(strip.style, { position: 'absolute', bottom: `${beat.captions.bottomVh}vh`, left: '50%', transform: 'translateX(-50%)', width: 'min(980px, 92vw)', maxWidth: '980px', textAlign: 'center' })
    caption = doc.createElement('div')
    Object.assign(caption.style, { color: '#f3ead6', fontFamily: 'Georgia, serif', fontSize: 'clamp(18px, 1.91vw, 26px)', lineHeight: '1.4', textShadow: '0 0 2px #000, 0 2px 6px #000, 0 0 14px rgba(0,0,0,0.85)' })
    for (const panel of beat.panels) {
      const block = doc.createElement('div'); block.style.display = 'none'
      captionLetters.push({ block, letters: makeLetters(block, panel.caption) }); caption.appendChild(block)
    }
    strip.appendChild(caption); root.appendChild(strip)
    button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Skip intro'
    Object.assign(button.style, { position: 'absolute', right: '24px', top: '12px', padding: '8px 14px', color: THEME.parchment, background: '#111820', border: `1px solid ${THEME.brass}`, borderRadius: '4px', font: 'inherit', cursor: 'pointer' })
    button.addEventListener('click', skip); root.appendChild(button)
    root.addEventListener('click', swallow); root.addEventListener('pointerdown', swallow)
    doc.body.appendChild(root)
    const token = generation
    timer = setTimer(() => { if (token === generation) complete() }, beat.timings.timeout * 1000)
    log('start', beat.id)
    if (context()?.state === 'running') startRain()
    else unlockAudio()
    update(0)
  }
  function update(delta) {
    if (!active) return
    rainMeter?.update(delta)
    delta = Math.max(0, delta)
    // Pause the presentation clock while a panel waits for its resume,
    // bounded independently of the wall-clock hard timeout.
    if (request && !request.started && fadeTime < 0) {
      audioWait += delta; tryNarration()
      if (!request?.started && audioWait < beat.timings.unlockWait) return
      if (request && !request.started) useFallback(request.line)
      delta = 0
    }
    const u = film.uniforms
    if (dissolving) {
      dissolveTime += delta
      u.uTime.value += delta
      u.uDissolve.value = dissolveFrom + (1 - dissolveFrom) * Math.min(1, dissolveTime / dissolveDuration)
      if (dissolveTime >= dissolveDuration) complete()
      return
    }
    time += delta
    if (time >= beat.timings.timeout) { complete(); return }
    if (!rainSource && !rainFailed && !rainFading && context()?.state === 'running') startRain()
    u.uTime.value = time
    u.uFade.value = 1
    if (time < timeline[0].start) {
      if (phase !== 'newspaper') { phase = 'newspaper'; log('opening'); log('newspaper') }
      const spin = Math.min(1, Math.max(0, (time - beat.timings.newspaperLead) / beat.timings.newspaperSpin))
      const ease = 1 - Math.pow(1 - spin, 3)
      const stoppedAt = beat.timings.newspaperLead + beat.timings.newspaperSpin
      const hold = Math.min(1, Math.max(0, (time - stoppedAt - beat.timings.newspaperShake) / beat.timings.newspaperHold))
      const fade = Math.max(0, Math.min(1, (time - (beat.timings.opening - beat.timings.openingCrossfade)) / beat.timings.openingCrossfade))
      u.uPaperScale.value = (0.015 + (beat.newspaper.height - 0.015) * ease) * (1 + (beat.newspaper.push - 1) * hold)
      u.uPaperAngle.value = (1 - ease) * beat.newspaper.turns * Math.PI * 2
      const shake = time >= stoppedAt && time < stoppedAt + beat.timings.newspaperShake ? beat.newspaper.shake * (1 - (time - stoppedAt) / beat.timings.newspaperShake) : 0
      u.uShake.value.set(Math.sin(time * 180) * shake, Math.cos(time * 143) * shake)
      u.uPaperOpacity.value = 1 - fade; u.uImage.value = fade; u.uRain.value = CARD_RAIN
      setPanel(0, u.uTexA, u.uSizeA, u.uZoomA, u.uPanA)
      setPanel(0, u.uTexB, u.uSizeB, u.uZoomB, u.uPanB)
      strip.style.visibility = 'hidden'
      return
    }
    u.uPaperOpacity.value = 0; u.uImage.value = 1; u.uRain.value = FILM_RAIN
    if (time >= ending.push) {
      strip.style.visibility = 'hidden'
      const last = beat.panels.length - 1
      setPanel(last, u.uTexA, u.uSizeA, u.uZoomA, u.uPanA)
      setPanel(last, u.uTexB, u.uSizeB, u.uZoomB, u.uPanB)
      u.uMix.value = 1
      const progress = Math.min(1, (time - ending.push) / beat.timings.push)
      u.uZoomB.value = beat.panels[last].zoom[1] + (beat.ending.zoom - beat.panels[last].zoom[1]) * progress
      u.uPanB.value.set(beat.panels[last].pan[0] + (beat.ending.pan[0] - beat.panels[last].pan[0]) * progress,
        beat.panels[last].pan[1] + (beat.ending.pan[1] - beat.panels[last].pan[1]) * progress)
      if (!pushed) { pushed = true; phase = 'push'; log('ending push'); stopAudio(); playWhistle() }
      if (time >= ending.ripple) {
        if (!rippled) { rippled = true; phase = 'ripple'; log('ripple') }
        u.uRipple.value = Math.min(1, (time - ending.ripple) / beat.timings.ripple)
      }
      if (time >= ending.title) {
        if (!titled) { titled = true; phase = 'title'; log('title') }
        const settle = Math.min(1, (time - ending.title) / beat.timings.titleSettle)
        u.uTitleOpacity.value = settle; u.uTitleDistortion.value = 1 - settle
      }
      if (time >= ending.dissolve) {
        beginDissolve(beat.timings.dissolve)
        dissolveTime = time - ending.dissolve
        u.uDissolve.value = Math.min(1, dissolveTime / dissolveDuration)
        if (dissolveTime >= dissolveDuration) complete()
      }
      return
    }
    phase = 'panels'
    strip.style.visibility = 'visible'
    let next = 0
    while (next + 1 < timeline.length && time >= timeline[next + 1].start) next++
    if (index !== next) {
      index = next
      const entry = timeline[index], panel = beat.panels[index]
      log('panel', index + 1, panel.image, entry.buffer?.duration ?? 'fallback')
      if (index >= 0) captionLetters.forEach((item, i) => { if (i !== index) item.block.style.display = 'none' })
      captionLetters[index].block.style.display = 'block'; revealCount = -1
      if (entry.play) {
        stopAudio()
        if (entry.buffer) {
          request = { line: panel.audio, buffer: entry.buffer, offset: Math.max(0, time - entry.start), started: false }
          audioWait = 0
          if (context()?.state === 'running') tryNarration()
          else unlockAudio()
        }
      }
    }
    const entry = timeline[index], panel = beat.panels[index]
    const local = Math.max(0, time - entry.start)
    const count = Math.floor(panel.caption.length * typewriterProgress(local, entry.segment, beat.timings.typewriterFraction))
    if (revealCount !== count) { reveal(captionLetters[index].letters, count); revealCount = count }
    const previous = Math.max(0, index - 1)
    const mix = index === 0 ? 1 : Math.min(1, local / beat.timings.crossfade)
    u.uMix.value = mix
    const captionIn = Math.min(1, local / beat.timings.captionFade)
    const captionOut = Math.min(1, Math.max(0, (entry.end - time) / beat.timings.captionFade))
    strip.style.opacity = Math.min(captionIn, captionOut)
    setPanel(previous, u.uTexA, u.uSizeA, u.uZoomA, u.uPanA)
    setPanel(index, u.uTexB, u.uSizeB, u.uZoomB, u.uPanB)
  }
  function setPanel(i, tex, dimensions, zoom, pan) {
    const texture = textures[i] || black, panel = beat.panels[i], entry = timeline[i]
    const progress = Math.min(1, Math.max(0, (time - entry.start) / (entry.end - entry.start)))
    tex.value = texture
    dimensions.value.set(texture.image.width, texture.image.height)
    zoom.value = panel.zoom[0] + (panel.zoom[1] - panel.zoom[0]) * progress
    pan.value.set(panel.pan[0] * progress, panel.pan[1] * progress)
  }
  return { prepare, start, update, skip, cancel, dispose, unlockAudio,
    get active() { return active },
    get isDissolving() { return active && dissolving },
    render() {
      if (!active) return
      storyResolution()
      renderer.getDrawingBufferSize(size); film.uniforms.uResolution.value.copy(size)
      const autoClear = renderer.autoClear
      if (dissolving) renderer.autoClear = false
      try { renderer.setRenderTarget(null); renderer.render(film.scene, film.camera) }
      finally { renderer.autoClear = autoClear }
    }
  }
}

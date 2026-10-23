import * as THREE from 'three'
import { getContext, getMasterGain } from '../core/audio.js'
import { THEME } from './ui-theme.js'
import { createStoryFilm, FILM_RAIN, CARD_RAIN } from '../shaders/story-film.js'

const log = (...args) => { if (import.meta.env?.DEV) console.log('[story]', ...args) }
const audioLog = message => { if (import.meta.env?.DEV) console.log('[story-audio]', message) }
export const typewriterProgress = (elapsed, duration, fraction = 0.85) => Math.min(1, Math.max(0, elapsed / Math.max(0.001, duration * fraction)))

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
export function createStoryPlayer({ beat, renderer, onComplete = () => {},
  context = getContext, master = getMasterGain, doc = globalThis.document,
  keys = globalThis.window, loadImage = url => new THREE.ImageLoader().loadAsync(url),
  loadAudio = async (url, ctx, signal) => {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Story audio HTTP ${response.status}`)
    return ctx.decodeAudioData(await response.arrayBuffer())
  }, film = createStoryFilm(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let generation = 0, disposed = false, active = false, readyPromise
  let root, caption, button, strip, opening, openingLetters, endCard, timeline, index = -1, time = 0, fadeTime = -1
  let source = null, enterReady = false, enterHeld = false, timer, loadTimer, skipOpacity = 0
  let narrationGain = null, rainSource = null, rainGain = null, rainBuffer = null
  let request = null, unlockPromise = null, phase = '', audioWait = 0, revealCount = -1
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
      try { rainSource.stop() } catch { /* already stopped */ }
      rainSource.disconnect(); rainSource = null
    }
    rainGain?.disconnect(); rainGain = null
  }
  function startRain() {
    const ctx = context()
    if (!active || fadeTime >= 0 || !rainBuffer || rainSource || ctx?.state !== 'running') return
    try {
      rainGain = ctx.createGain(); rainGain.connect(master())
      rainGain.gain.setValueAtTime(0, ctx.currentTime)
      rainGain.gain.linearRampToValueAtTime(beat.rain.volume, ctx.currentTime + beat.timings.rainFadeIn)
      rainSource = ctx.createBufferSource(); rainSource.buffer = rainBuffer
      rainSource.loop = true; rainSource.connect(rainGain); rainSource.start()
    } catch (error) { stopRain(); audioLog(`rain unavailable: ${error.message}`) }
  }
  function tryNarration() {
    const ctx = context(), pending = request
    if (!pending || pending.started || !active || fadeTime >= 0 || ctx?.state !== 'running') return
    try {
      // Own unity gain makes the narration route explicit without touching
      // settings/master volume. Keep both node references until teardown.
      if (!narrationGain) {
        narrationGain = ctx.createGain(); narrationGain.gain.value = 1
        narrationGain.connect(master())
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
  }
  function prepare() {
    if (readyPromise) return readyPromise
    const token = generation
    const work = Promise.allSettled([
      ...beat.panels.map(async (panel, i) => {
        const image = await loadImage(panel.image)
        if (disposed || token !== generation) return
        const texture = new THREE.Texture(image)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = false
        texture.minFilter = texture.magFilter = THREE.LinearFilter
        texture.needsUpdate = true
        textures[i] = texture
        renderer.initTexture(texture)
      }),
      ...beat.audio.map(async (url, i) => {
        const buffer = await loadAudio(url, context(), abort.signal)
        if (!disposed && token === generation) buffers[i] = buffer
      }),
      ...(beat.rain ? [loadAudio(beat.rain.url, context(), abort.signal).then(buffer => {
        if (!disposed && token === generation) rainBuffer = buffer
      })] : [])
    ])
    // A stalled request cannot keep the title loading forever. Late results
    // are invalidated and their fetches aborted before warming the shader.
    readyPromise = Promise.race([work, new Promise(resolve => {
      loadTimer = setTimer(() => { generation++; abort.abort(); resolve() }, (beat.timings.prepareTimeout ?? 8) * 1000)
    })]).then(() => {
      clearTimer(loadTimer)
      if (disposed) return
      film.uniforms.uTexA.value = textures[0] || black
      film.uniforms.uTexB.value = textures[1] || black
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
  function dispose() {
    if (disposed) return
    disposed = true; active = false; generation++
    clearTimer(timer); clearTimer(loadTimer); abort.abort(); stopAudio()
    stopRain(); rainBuffer = null
    narrationGain?.disconnect(); narrationGain = null
    keys.removeEventListener('keydown', keydown, true)
    keys.removeEventListener('keyup', keyup, true)
    keys.removeEventListener('blur', blur)
    root?.removeEventListener('click', swallow)
    root?.removeEventListener('pointerdown', swallow)
    button?.removeEventListener('click', skip)
    root?.remove(); root = caption = button = strip = opening = openingLetters = endCard = null
    captionLetters.length = 0
    textures.forEach(texture => texture.dispose()); textures.length = 0
    buffers.length = 0; timeline = null
    black.dispose(); film.dispose()
  }
  function complete() {
    if (!active) return
    log('complete'); dispose(); onComplete()
  }
  function cancel() { if (!disposed) { log('cancel'); dispose() } }
  function skip() {
    if (!active || fadeTime >= 0) return
    log('skip'); stopAudio(); stopRain(); skipOpacity = film.uniforms.uFade.value; fadeTime = 0
  }
  function start() {
    if (disposed || active) return
    active = true; time = 0; index = -1; enterReady = !enterHeld
    timeline = buildStoryTimeline(beat, buffers, true)
    audioLog(`context=${context()?.state ?? 'missing'} master=${master()?.gain?.value ?? 'missing'}`)
    const u = film.uniforms
    u.uBand.value.set(beat.band.bottom, 1 - beat.band.top)
    root = doc.createElement('div')
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '11000', pointerEvents: 'auto', fontFamily: THEME.serif })
    strip = doc.createElement('div'); strip.id = 'story-captions'
    Object.assign(strip.style, { position: 'absolute', bottom: '0', height: `${beat.band.bottom * 100}vh`, width: '100%', boxSizing: 'border-box', padding: '8px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' })
    const label = doc.createElement('div'); label.textContent = 'DETECTIVE'
    Object.assign(label.style, { color: '#c9a44e', letterSpacing: '0.24em', fontSize: '14px', marginBottom: '10px', textShadow: '0 1px 3px #000' })
    caption = doc.createElement('div')
    Object.assign(caption.style, { color: THEME.parchment, fontFamily: THEME.serif, fontSize: 'clamp(18px, 1.76vw, 24px)', lineHeight: '1.3', width: 'min(900px, 100%)', textShadow: '0 1px 3px #000' })
    for (const panel of beat.panels) {
      const block = doc.createElement('div'); block.style.display = 'none'
      captionLetters.push({ block, letters: makeLetters(block, panel.caption) }); caption.appendChild(block)
    }
    strip.appendChild(label); strip.appendChild(caption); root.appendChild(strip)
    opening = doc.createElement('div'); opening.id = 'story-opening'
    Object.assign(opening.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.parchment, font: 'italic clamp(24px, 2.5vw, 34px) Georgia, serif', textAlign: 'center', padding: '24px' })
    const openingText = doc.createElement('div')
    openingLetters = makeLetters(openingText, beat.openingText)
    opening.appendChild(openingText); root.appendChild(opening)
    endCard = doc.createElement('div'); endCard.id = 'story-end-card'
    Object.assign(endCard.style, { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: '0', pointerEvents: 'none' })
    const title = doc.createElement('h1'); title.textContent = 'CHRONO EXPRESS'
    Object.assign(title.style, { margin: '0', fontSize: 'clamp(30px, 7.5vw, 86px)', fontWeight: '800', letterSpacing: '0.14em', color: '#f0e6cf', textShadow: '0 0 60px rgba(255, 200, 100, 0.25), 0 2px 12px rgba(0, 0, 0, 0.85), 0 0 3px rgba(255, 220, 150, 0.45)', textAlign: 'center', lineHeight: '1.05', fontFamily: 'Georgia, "Times New Roman", "Palatino Linotype", serif' })
    const subtitle = doc.createElement('div'); subtitle.textContent = 'THE LAST HEIST'
    Object.assign(subtitle.style, { fontSize: 'clamp(11px, 2vw, 18px)', fontWeight: '600', letterSpacing: '0.5em', color: 'rgba(176, 141, 63, 0.8)', marginTop: 'clamp(6px, 1.2vh, 16px)', textShadow: '0 1px 6px rgba(0, 0, 0, 0.7)', textTransform: 'uppercase' })
    endCard.appendChild(title); endCard.appendChild(subtitle); root.appendChild(endCard)
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
    delta = Math.max(0, delta)
    // Pause the presentation clock while a panel waits for its resume,
    // bounded independently of the wall-clock hard timeout.
    if (request && !request.started && fadeTime < 0) {
      audioWait += delta; tryNarration()
      if (!request?.started && audioWait < beat.timings.unlockWait) return
      if (request && !request.started) useFallback(request.line)
      delta = 0
    }
    time += delta
    if (time >= beat.timings.timeout) { complete(); return }
    const lastEnd = timeline[timeline.length - 1].end
    const endStart = lastEnd + beat.timings.fadeOut
    const u = film.uniforms
    if (fadeTime >= 0) {
      fadeTime += delta
      u.uFade.value = skipOpacity * Math.max(0, 1 - fadeTime / beat.timings.skipFade)
      root.style.opacity = Math.max(0, 1 - fadeTime / beat.timings.skipFade)
      if (fadeTime >= beat.timings.skipFade) complete()
      return
    }
    u.uTime.value = time
    if (time >= endStart + beat.timings.endCard) { complete(); return }
    if (time >= endStart) {
      if (phase !== 'end') {
        phase = 'end'; log('end card'); stopAudio()
        if (rainGain) {
          const now = context().currentTime
          rainGain.gain.cancelScheduledValues(now)
          rainGain.gain.setValueAtTime(rainGain.gain.value, now)
          rainGain.gain.linearRampToValueAtTime(0, now + beat.timings.endCard)
        }
      }
      strip.style.visibility = 'hidden'; opening.style.visibility = 'hidden'
      const local = time - endStart
      endCard.style.opacity = Math.min(1, local / beat.timings.endFadeIn,
        Math.max(0, (beat.timings.endCard - local) / beat.timings.endFadeOut))
      u.uImage.value = 0; u.uRain.value = 0; u.uFade.value = 0
      return
    }
    if (time < timeline[0].start) {
      if (phase !== 'opening') { phase = 'opening'; log('opening') }
      u.uImage.value = 0; u.uFade.value = 1; u.uRain.value = CARD_RAIN
      strip.style.visibility = 'hidden'
      reveal(openingLetters, Math.floor(openingLetters.length * Math.min(1, time / beat.timings.openingType)))
      return
    }
    phase = 'panels'
    opening.style.opacity = Math.max(0, 1 - (time - timeline[0].start) / beat.timings.openingCrossfade)
    strip.style.visibility = 'visible'
    let next = 0
    while (next + 1 < timeline.length && time >= timeline[next + 1].start) next++
    if (index !== next) {
      index = next
      const entry = timeline[index], panel = beat.panels[index]
      log('panel', index + 1, panel.image, entry.buffer?.duration ?? 'fallback')
      if (index > 0) captionLetters[index - 1].block.style.display = 'none'
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
    u.uImage.value = Math.min(1, (time - timeline[0].start) / beat.timings.openingCrossfade)
    u.uRain.value = FILM_RAIN
    u.uFade.value = Math.max(0, Math.min(1, (endStart - time) / beat.timings.fadeOut))
    strip.style.opacity = u.uFade.value
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
    render() {
      if (!active) return
      renderer.getDrawingBufferSize(size); film.uniforms.uResolution.value.copy(size)
      renderer.setRenderTarget(null); renderer.render(film.scene, film.camera)
    }
  }
}

import * as THREE from 'three'
import { getContext, getMasterGain } from '../core/audio.js'
import { THEME } from './ui-theme.js'
import { createStoryFilm } from '../shaders/story-film.js'

const log = (...args) => { if (import.meta.env?.DEV) console.log('[story]', ...args) }
export const typewriterProgress = (elapsed, duration, fraction = 0.85) => Math.min(1, Math.max(0, elapsed / Math.max(0.001, duration * fraction)))

export function buildStoryTimeline(beat, buffers, audible) {
  let cursor = beat.timings.fadeIn
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
  let root, caption, button, timeline, index = -1, time = 0, fadeTime = -1
  let source = null, enterReady = false, enterHeld = false, timer, loadTimer, skipOpacity = 0
  const captionFrames = beat.panels.map(panel => Array.from({ length: panel.caption.length + 1 }, (_, i) => panel.caption.slice(0, i)))
  const textures = [], buffers = [], abort = new AbortController()
  const size = new THREE.Vector2()
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  black.needsUpdate = true
  function stopAudio() {
    if (!source) return
    try { source.stop() } catch { /* already ended */ }
    source.disconnect(); source = null
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
      })
    ])
    // A stalled request cannot keep the title loading forever. Late results
    // are invalidated and their fetches aborted before warming the shader.
    readyPromise = Promise.race([work, new Promise(resolve => {
      loadTimer = setTimer(() => { generation++; abort.abort(); resolve() }, 8000)
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
    keys.removeEventListener('keydown', keydown, true)
    keys.removeEventListener('keyup', keyup, true)
    keys.removeEventListener('blur', blur)
    root?.removeEventListener('click', swallow)
    root?.removeEventListener('pointerdown', swallow)
    button?.removeEventListener('click', skip)
    root?.remove(); root = caption = button = null
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
    log('skip'); stopAudio(); skipOpacity = film.uniforms.uFade.value; fadeTime = 0
  }
  function start() {
    if (disposed || active) return
    active = true; time = 0; index = -1; enterReady = !enterHeld
    timeline = buildStoryTimeline(beat, buffers, context()?.state === 'running')
    root = doc.createElement('div')
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '11000', pointerEvents: 'auto', fontFamily: THEME.serif })
    const strip = doc.createElement('div')
    Object.assign(strip.style, { position: 'absolute', bottom: '0', width: '100%', boxSizing: 'border-box', padding: '50px 24px 72px', textAlign: 'center', background: 'linear-gradient(transparent, rgba(0,0,0,0.88))' })
    const label = doc.createElement('div'); label.textContent = 'DETECTIVE'
    Object.assign(label.style, { color: THEME.brass, letterSpacing: '0.24em', fontSize: '12px', marginBottom: '12px' })
    caption = doc.createElement('div')
    Object.assign(caption.style, { color: THEME.parchment, fontFamily: 'Georgia, serif', fontSize: 'clamp(16px, 2vw, 22px)', lineHeight: '1.5', maxWidth: '900px', margin: 'auto', minHeight: '3em' })
    strip.appendChild(label); strip.appendChild(caption); root.appendChild(strip)
    button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Skip intro'
    Object.assign(button.style, { position: 'absolute', right: '24px', bottom: '24px', padding: '10px 18px', color: THEME.parchment, background: '#111820', border: `1px solid ${THEME.brass}`, borderRadius: '4px', font: 'inherit', cursor: 'pointer' })
    button.addEventListener('click', skip); root.appendChild(button)
    root.addEventListener('click', swallow); root.addEventListener('pointerdown', swallow)
    doc.body.appendChild(root)
    const token = generation
    timer = setTimer(() => { if (token === generation) complete() }, beat.timings.timeout * 1000)
    log('start', beat.id)
    update(0)
  }
  function update(delta) {
    if (!active) return
    time += Math.max(0, delta)
    if (time >= beat.timings.timeout) { complete(); return }
    const lastEnd = timeline[timeline.length - 1].end
    if (fadeTime >= 0) {
      fadeTime += Math.max(0, delta)
      film.uniforms.uFade.value = skipOpacity * Math.max(0, 1 - fadeTime / beat.timings.skipFade)
      root.style.opacity = film.uniforms.uFade.value
      if (fadeTime >= beat.timings.skipFade) complete()
      return
    }
    if (time >= lastEnd + beat.timings.fadeOut) { complete(); return }
    let next = 0
    while (next + 1 < timeline.length && time >= timeline[next + 1].start) next++
    if (index !== next) {
      index = next
      const entry = timeline[index], panel = beat.panels[index]
      log('panel', index + 1, panel.image, entry.buffer?.duration ?? 'fallback')
      if (entry.play && time >= entry.start) {
        stopAudio()
        if (entry.buffer) {
          try {
            source = context().createBufferSource(); source.buffer = entry.buffer
            source.connect(master()); source.start(0, Math.min(entry.buffer.duration, Math.max(0, time - entry.start)))
          } catch { stopAudio() }
        }
      }
    }
    const entry = timeline[index], panel = beat.panels[index]
    const local = Math.max(0, time - entry.start)
    if (index === 0 && time >= entry.start && !source && entry.buffer) {
      try {
        source = context().createBufferSource(); source.buffer = entry.buffer
        source.connect(master()); source.start(0, Math.max(0, time - entry.start))
      } catch { stopAudio() }
    }
    const text = captionFrames[index][Math.floor(panel.caption.length * typewriterProgress(local, entry.segment, beat.timings.typewriterFraction))]
    if (caption.textContent !== text) caption.textContent = text
    const u = film.uniforms
    const previous = Math.max(0, index - 1)
    const mix = index === 0 ? 1 : Math.min(1, local / beat.timings.crossfade)
    u.uMix.value = mix; u.uTime.value = time
    u.uFade.value = Math.min(1, time / beat.timings.fadeIn, Math.max(0, (lastEnd + beat.timings.fadeOut - time) / beat.timings.fadeOut))
    root.style.opacity = u.uFade.value
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
  return { prepare, start, update, skip, cancel, dispose,
    get active() { return active },
    render() {
      if (!active) return
      renderer.getDrawingBufferSize(size); film.uniforms.uResolution.value.copy(size)
      renderer.setRenderTarget(null); renderer.render(film.scene, film.camera)
    }
  }
}

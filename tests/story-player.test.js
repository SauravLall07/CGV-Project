import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three'
import { introBeat } from '../src/story/intro-beat.js'
import { createStoryPlayer, buildStoryTimeline, typewriterProgress, endingTimeline, createRainLevelMeter } from '../src/ui/story-player.js'
import { createStoryFilm, SHARPEN, FILM_GRAIN, FILM_RAIN, FILM_FLICKER } from '../src/shaders/story-film.js'
import { resolveInputState } from '../src/core/input-state.js'

function harness({ locked = false, failed = false, delayed = false, rain = false, resumeLater = false, whistle = false, deviceRatio = 2.5 } = {}) {
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''
    appendChild(child) { this.children.push(child); child.parent = this }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) }
  }
  const keys = new EventTarget(), body = new Element(), pending = [], timers = new Map()
  keys.devicePixelRatio = deviceRatio
  let starts = [], stops = 0, completes = 0, disposals = 0, uploads = 0, renders = 0, compiled = 0, resumes = 0
  const nodes = [], gains = [], resumeResolvers = [], canvases = [], renderOrder = [], textureOwners = [], compressors = [], analysers = [], images = []
  let crossfadeStarts = 0, paints = 0, handoverRatio = null
  function createElement(tag) {
    const element = new Element()
    if (tag === 'canvas') {
      const context = { fillRect() { paints++ }, fillText() { paints++ }, clearRect() { paints++ },
        measureText: text => ({ width: text.length * 70 }),
        createRadialGradient: () => ({ addColorStop() {} }),
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {} }
      element.getContext = () => context
      canvases.push(element)
    }
    return element
  }
  const film = createStoryFilm()
  film.material.addEventListener('dispose', () => disposals++)
  film.geometry.addEventListener('dispose', () => disposals++)
  const master = { gain: { value: 0.5 } }
  const ctx = { state: locked || resumeLater ? 'suspended' : 'running', currentTime: 0,
    resume() {
      resumes++
      if (resumeLater) return new Promise(resolve => resumeResolvers.push(() => { ctx.state = 'running'; resolve() }))
      if (locked) return Promise.reject(new Error('locked'))
      return Promise.resolve()
    },
    createGain() {
      const gain = { value: 1, events: [], setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]) },
        linearRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]) }, cancelScheduledValues(time) { this.events.push(['cancel', time]) } }
      const node = { gain, targets: [], connect(target) { this.target ??= target; this.targets.push(target) }, disconnect() { this.disconnected = true } }
      gains.push(node); return node
    },
    createDynamicsCompressor() {
      const node = { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {},
        connect(target) { this.target = target }, disconnect() { this.disconnected = true } }
      compressors.push(node); return node
    },
    createAnalyser() {
      const node = { fftSize: 1024, reads: [], getFloatTimeDomainData(buffer) { this.reads.push(buffer); buffer.fill(0.02) }, disconnect() { this.disconnected = true } }
      analysers.push(node); return node
    },
    createBufferSource() {
      const node = { connect(target) { this.target = target }, disconnect() { this.disconnected = true },
        start(_when, offset = 0) { assert.equal(ctx.state, 'running'); this.offset = offset; starts.push(this.buffer.id) }, stop() { stops++; this.stopped = true } }
      nodes.push(node); return node
    }
  }
  const viewport = new THREE.Vector4(3, 4, 1366, 768)
  const renderer = { autoClear: true, pixelRatio: 0.625, outputColorSpace: THREE.LinearSRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2,
    capabilities: { getMaxAnisotropy: () => 16, maxTextureSize: 16384 },
    getPixelRatio() { return this.pixelRatio }, setPixelRatio(value) { this.pixelRatio = value; viewport.set(0, 0, 1920, 1080) },
    getViewport(target) { return target.copy(viewport) }, setViewport(value) { viewport.copy(value) },
    initTexture(texture) { uploads++; textureOwners.push(texture); texture.addEventListener('dispose', () => disposals++) }, compile() { compiled++ },
    getDrawingBufferSize(size) { size.set(1920, 1080) }, setRenderTarget() {}, render() { renders++; renderOrder.push(this.autoClear ? 'quad-clear' : 'quad-overlay') } }
  const player = createStoryPlayer({ beat: introBeat, renderer, film, doc: { body, createElement }, keys,
    measureRain: true,
    onCrossfade: () => { crossfadeStarts++; handoverRatio = renderer.getPixelRatio() },
    context: () => ctx, master: () => master, onComplete: () => completes++,
    loadImage: url => {
      const image = url === introBeat.newspaper.image ? { width: 1024, height: 1536 } : { width: 1672, height: 941 }
      images.push(image)
      return delayed ? new Promise(resolve => pending.push(() => resolve(image))) : Promise.resolve(image)
    },
    loadAudio: async url => {
      const isRain = url === introBeat.rain.url
      const isWhistle = url === introBeat.whistle.url
      if (failed || (isRain && !rain) || (isWhistle && !whistle)) throw new Error('decode failed')
      return { duration: isRain ? 24 : isWhistle ? 2 : 8, id: isRain ? 'rain' : isWhistle ? 'whistle' : introBeat.audio.indexOf(url) }
    },
    setTimer(callback, ms) { timers.set(ms, callback); return ms }, clearTimer(id) { timers.delete(id) }
  })
  function key(type, repeat = false) {
    const event = new Event(type, { cancelable: true }); Object.assign(event, { code: 'Enter', repeat }); keys.dispatchEvent(event)
  }
  return { player, film, body, pending, timers, key, ctx, master, nodes, gains, resumeResolvers, canvases, renderer, renderOrder, textureOwners, compressors, analysers, images,
    get stats() { return { starts, stops, completes, disposals, uploads, renders, compiled, resumes, crossfadeStarts, paints, handoverRatio } } }
}

const narrationTimeline = () => buildStoryTimeline(introBeat, Array(5).fill({ duration: 8 }), true)
const endStart = () => endingTimeline(introBeat, narrationTimeline()).crossfade
const endBeats = () => endingTimeline(introBeat, narrationTimeline())
const finishTime = () => endBeats().complete
const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean)
function assertStoryRoute(gain, h) {
  const bus = gain.target, limiter = h.compressors[0]
  assert.equal(bus.gain.value, 1)
  assert.equal(bus.target, limiter)
  assert.equal(limiter.target, h.master)
  assert.equal(h.compressors.length, 1)
  assert.deepEqual([limiter.threshold.value, limiter.knee.value, limiter.ratio.value, limiter.attack.value, limiter.release.value], [-6, 0, 12, 0.003, 0.25])
  return bus
}

test('shared narration switches at 1.8 with no intervening hold; final hold is 0.6', async () => {
  const timeline = buildStoryTimeline(introBeat, Array(5).fill({ duration: 8 }), true)
  assert.ok(Math.abs(timeline[2].start - timeline[1].start - 1.8) < 1e-9)
  assert.equal(timeline[1].end, timeline[2].start)
  assert.ok(Math.abs(timeline[2].end - timeline[1].start - 8.6) < 1e-9)
  const h = harness(); await h.player.prepare(); h.player.start()
  h.player.update(timeline[1].start)
  assert.equal(h.stats.starts.filter(id => id === 1).length, 1)
  h.player.update(1.799)
  assert.equal(h.film.uniforms.uMix.value, 1)
  h.player.update(0.002)
  assert.ok(h.film.uniforms.uMix.value < 0.01)
  h.player.update(6.799)
  assert.equal(h.stats.starts.filter(id => id === 1).length, 1)
  h.player.cancel()
})

test('failed and locked narration uses six seconds per panel and still completes', async () => {
  for (const options of [{ failed: true }, { locked: true }]) {
    const h = harness(options); await h.player.prepare(); h.player.start()
    // Locked audio now retries resume before the bounded fallback, rather
    // than permanently discarding decoded clips at intro start.
    for (let i = 0; i < 899 && h.player.active; i++) h.player.update(0.1)
    assert.equal(h.stats.completes, 1)
    assert.equal(h.stats.starts.length, 0)
  }
})

test('hard timeout completes once without animation frames', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  const late = h.timers.get(90000); late(); late()
  assert.equal(h.stats.completes, 1)
  assert.equal(h.stats.crossfadeStarts, 1, 'timeout still hands over the arrival camera once')
})

test('typewriter is even across 85 percent and holds full text', () => {
  assert.equal(typewriterProgress(0, 10), 0)
  assert.equal(typewriterProgress(4.25, 10), 0.5)
  assert.equal(typewriterProgress(8.5, 10), 1)
  assert.equal(typewriterProgress(10.6, 10), 1)
})

test('skip in fade-in, every panel, holds, crossfade, and fade-out completes once', async () => {
  for (const time of [0, 0.4, 1, ...narrationTimeline().flatMap(entry => [entry.start + 0.1, entry.end - 0.1]), endStart() + 0.5, finishTime() - 0.1]) {
    const h = harness(); await h.player.prepare(); h.player.start(); h.player.update(time)
    const stopped = h.stats.stops
    h.player.skip(); h.player.skip()
    assert.ok(h.stats.stops >= stopped)
    h.player.update(0.4); h.player.update(100)
    assert.equal(h.stats.completes, 1)
  }
})

test('opening Enter and repeats ignored, release then fresh Enter skips', async () => {
  const h = harness(); await h.player.prepare(); h.key('keydown'); h.player.start()
  h.key('keydown'); h.player.update(1); assert.equal(h.player.active, true)
  h.key('keyup'); h.key('keydown', true); h.player.update(1); assert.equal(h.player.active, true)
  h.key('keydown'); h.player.update(0.6); assert.equal(h.stats.completes, 1)
})

test('mouse start permits the first fresh Enter; repeats alone never skip', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  h.key('keydown', true); h.player.update(1); assert.equal(h.player.active, true)
  h.key('keydown'); h.player.update(0.6); assert.equal(h.stats.completes, 1)
})

test('Enter released during the title fade permits the next fresh Enter', async () => {
  const h = harness(); await h.player.prepare()
  h.key('keydown'); h.key('keyup'); h.player.start()
  h.key('keydown'); h.player.update(0.6); assert.equal(h.stats.completes, 1)
})

test('cancel invalidates late image and timer callbacks and releases owned resources', async () => {
  const h = harness({ delayed: true }); const ready = h.player.prepare()
  h.player.start(); const late = h.timers.get(90000)
  h.player.cancel(); h.pending.forEach(resolve => resolve()); await ready; late()
  assert.equal(h.stats.completes, 0); assert.equal(h.stats.uploads, 0)
  assert.equal(h.stats.disposals, 2); assert.equal(h.body.children.length, 0)
  h.key('keyup'); h.key('keydown'); assert.equal(h.stats.completes, 0)
})

test('prepared textures are uploaded, compiled, rendered and disposed with DOM', async () => {
  const h = harness(); await h.player.prepare()
  assert.equal(h.stats.uploads, 8); assert.equal(h.stats.compiled, 1)
  h.player.start(); h.player.render(); assert.equal(h.stats.renders, 1)
  h.player.cancel(); h.player.dispose()
  assert.equal(h.stats.disposals, 10); assert.equal(h.body.children.length, 0)
})

test('STORY takes precedence over gameplay blockers and releases through resolution', () => {
  const state = { gameStarted: true, story: true, paused: true, cinematic: true, transitioning: true, caught: true, editor: true, creditsOpen: true }
  assert.equal(resolveInputState(state), 'STORY')
  assert.equal(resolveInputState({ ...state, story: false }), 'CREDITS')
  assert.equal(resolveInputState({ gameStarted: true, story: false }), 'PLAYING')
  assert.equal(resolveInputState({ gameStarted: false, story: true }), 'TITLE')
})

test('all six captions match the supplied script exactly', () => {
  assert.deepEqual(introBeat.panels.map(p => p.caption), [
    '1934. Twelve years on the force. One man I could never bring to justice. Cornelius Vane.',
    'He owns the railways.',
    'Every witness against him disappeared. Every file I built was rewritten overnight.',
    'His secret is the Chrono Core, a machine that bends time. With it, he erases his crimes before anyone can prove them.',
    "The police and the courts belong to him. No warrant will ever touch that man. So I'll do what the law can't.",
    "The Core travels on the Chrono Express tonight. I'm going to steal it, and bring Vane down."
  ])
})

test('composition freezes before gameplay updates and renders only story; credits retained', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.ok(main.indexOf('storyPlayer.update(delta)') < main.indexOf('player.updateVisual(delta)'))
  assert.match(main, /if \(storyPlayer.showGame\) post.render\(world, view\)\s+storyPlayer.render\(\)/)
  assert.match(main, /if \(!storyPlayer\?\.active\) playMusicForState\(state\)/)
  const credits = fs.readFileSync(new URL('../src/ui/credits.js', import.meta.url), 'utf8')
  assert.ok(credits.includes('Story illustrations generated with ChatGPT (OpenAI)'))
  assert.ok(credits.includes('Narration voice generated with ElevenLabs (voice: David)'))
  assert.ok(credits.includes('Rain ambience generated with ElevenLabs'))
  assert.ok(credits.includes('Steam whistle sound generated with ElevenLabs'))
  assert.match(main, /storyPlayer\?\.unlockAudio\?\.\(\)/)
})

test('narration starts through unity gain and master only when running', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  assert.equal(h.stats.starts.length, 0, 'opening card has no narration')
  h.player.update(introBeat.timings.opening)
  assert.deepEqual(h.stats.starts, [0])
  const source = h.nodes[0]
  assert.equal(source.offset, 0)
  assert.equal(source.target.gain.value, 1)
  assertStoryRoute(source.target, h)
  source.onended(); h.player.update(0.1)
  assert.deepEqual(h.stats.starts, [0], 'ended callback cannot restart the line')
  h.player.cancel()
})

test('suspended panel retries resume and starts the retained clip on resolution, once', async () => {
  const h = harness({ resumeLater: true }); await h.player.prepare()
  h.player.start(); assert.equal(h.stats.resumes, 1)
  h.player.update(introBeat.timings.opening)
  assert.equal(h.stats.starts.length, 0)
  h.player.update(1)
  assert.equal(h.stats.starts.length, 0, 'presentation waits for running context')
  h.resumeResolvers.shift()(); await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(h.stats.starts, [0]); assert.equal(h.nodes[0].offset, 0)
  h.player.update(0.1); assert.deepEqual(h.stats.starts, [0])
  h.player.cancel()
})

test('context suspended after opening gets a new resume at panel start', async () => {
  const h = harness({ resumeLater: true }); await h.player.prepare()
  h.player.start(); h.resumeResolvers.shift()(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  h.ctx.state = 'suspended'
  h.player.update(introBeat.timings.opening)
  assert.equal(h.stats.resumes, 2); assert.equal(h.stats.starts.length, 0)
  h.resumeResolvers.shift()(); await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(h.stats.starts, [0]); h.player.cancel()
})

test('late resume after skip or cancel cannot start narration or rain', async () => {
  for (const action of ['skip', 'cancel']) {
    const h = harness({ resumeLater: true, rain: true }); await h.player.prepare(); h.player.start()
    h.player.update(introBeat.timings.opening); h.player[action]()
    h.resumeResolvers.shift()(); await Promise.resolve(); await Promise.resolve()
    assert.equal(h.stats.starts.length, 0)
    h.player.update(0.6); assert.equal(h.stats.completes, action === 'skip' ? 1 : 0)
  }
})

test('full viewport band removes letterbox and retains generic cover fitting', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  h.film.uniforms.uBand.value.toArray().forEach((actual, i) => {
    assert.ok(Math.abs(actual - [0, 1][i]) < 1e-9, `band value ${i}`)
  })
  assert.match(h.film.material.fragmentShader, /uResolution.y \* \(uBand.y - uBand.x\)/)
  assert.match(h.film.material.fragmentShader, /vUv.y < uBand.x \|\| vUv.y > uBand.y/)
  assert.match(h.film.material.fragmentShader, /\(uv\.y - uBand\.x\) \/ \(uBand\.y - uBand\.x\)/)
  h.player.cancel()
})

test('fixed-layout captions retain every character while only visibility changes', async () => {
  const h = harness(); await h.player.prepare(); h.player.start(); h.player.update(introBeat.timings.opening)
  const strip = find(h.body, 'story-captions'), caption = strip.children[0], block = caption.children[0]
  const children = [...block.children]
  assert.equal(children.map(span => span.textContent).join(''), introBeat.panels[0].caption)
  assert.ok(children.every(span => span.style.visibility === 'hidden'))
  assert.equal(strip.style.background, undefined)
  assert.equal(strip.style.border, undefined)
  assert.equal(strip.children.length, 1, 'no DETECTIVE label')
  assert.equal(strip.style.width, 'min(980px, 92vw)')
  assert.equal(caption.style.fontSize, 'clamp(18px, 1.91vw, 26px)')
  assert.equal(caption.style.color, '#f3ead6')
  h.player.update(4)
  assert.deepEqual(block.children, children)
  assert.ok(children.some(span => span.style.visibility === 'visible'))
  assert.ok(children.some(span => span.style.visibility === 'hidden'))
  assert.equal(children.map(span => span.textContent).join(''), introBeat.panels[0].caption)
  h.player.cancel()
})

test('real newspaper image spins twice, settles, shakes, holds and crossfades with no canvas drawing', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  const u = h.film.uniforms, paper = u.uPaper.value
  assert.equal(h.canvases.length, 0); assert.equal(h.stats.paints, 0)
  assert.equal(paper.image, h.images[0])
  assert.equal(paper.generateMipmaps, true)
  assert.equal(paper.minFilter, THREE.LinearMipmapLinearFilter)
  assert.equal(paper.magFilter, THREE.LinearFilter)
  assert.equal(paper.anisotropy, 16); assert.equal(paper.colorSpace, THREE.SRGBColorSpace)
  assert.deepEqual(u.uPaperSize.value.toArray(), [1024, 1536])
  assert.ok(Math.abs(u.uPaperAngle.value - Math.PI * 4) < 1e-9)
  assert.equal(u.uImage.value, 0); assert.equal(u.uRain.value, 0.06)
  h.player.update(introBeat.timings.newspaperLead + introBeat.timings.newspaperSpin)
  assert.ok(Math.abs(u.uPaperAngle.value) < 1e-9)
  assert.ok(Math.abs(u.uPaperScale.value - 0.88) < 1e-9)
  h.player.update(0.125); assert.ok(Math.abs(u.uPaperScale.value - 0.89) < 1e-9)
  h.player.update(0.125); assert.ok(Math.abs(u.uPaperScale.value - 0.88) < 1e-9)
  h.player.update(0.05); assert.ok(u.uShake.value.length() > 0)
  h.player.update(0.071); assert.equal(u.uShake.value.length(), 0)
  const now = introBeat.timings.newspaperLead + introBeat.timings.newspaperSpin + 0.371
  h.player.update(7.05 - now)
  assert.ok(Math.abs(u.uPaperOpacity.value - 0.5) < 1e-8)
  assert.ok(Math.abs(u.uImage.value - 0.5) < 1e-8)
  assert.ok(Math.abs(u.uPaperScale.value - 0.88 * 1.03) < 1e-9)
  assert.equal(h.stats.starts.length, 0, 'no narration during newspaper or its crossfade')
  h.player.update(0.451); assert.deepEqual(h.stats.starts, [0])
  assert.equal(u.uPaperOpacity.value, 0)
  await h.player.prepare(); assert.equal(h.stats.paints, 0); assert.equal(h.canvases.length, 0)
  assert.equal(h.images.length, 7, 'prefetch is not repeated')
  assert.equal(u.uPaperShadowOpacity.value, 0.45); assert.ok(u.uPaperShadowBlur.value > 0)
  assert.ok(u.uPaperFalloff.value > 0)
  assert.match(h.film.material.fragmentShader, /vec2\(uPaperSize.x \/ uPaperSize.y, 1.0\)/)
  assert.ok(h.film.material.fragmentShader.indexOf('color *= mix(1.0, 0.25') < h.film.material.fragmentShader.indexOf('vec3 paper = texture2D'))
  h.player.cancel()
})

test('ending crossfades without zoom, restores renderer before handover, then animates the DOM title and completes', async () => {
  const h = harness({ whistle: true }); await h.player.prepare(); h.player.start()
  const u = h.film.uniforms, t = endBeats()
  h.player.update(t.crossfade)
  assert.deepEqual(h.stats.starts, ['whistle'])
  assert.equal(h.nodes[0].target.gain.value, 0.8)
  assertStoryRoute(h.nodes[0].target, h)
  assert.equal(h.player.showGame, true); assert.equal(h.player.showQuad, true)
  assert.equal(h.stats.handoverRatio, 0.625); assert.equal(h.renderer.getPixelRatio(), 0.625)
  assert.ok(Math.abs(u.uZoomB.value - 1.04) < 1e-9)
  assert.ok(Math.abs(u.uPanB.value.x - introBeat.panels[5].pan[0]) < 1e-9)
  assert.equal(u.uOpacity.value, 1)
  h.player.update(1.1); assert.ok(Math.abs(u.uOpacity.value - 0.5) < 1e-9)
  h.player.update(1.101); assert.equal(h.player.showQuad, false)
  const title = find(h.body, 'story-title'), heading = title.children[0], subtitle = title.children[1]
  assert.equal(title.style.visibility, 'hidden')
  const draws = h.stats.renders; h.player.render(); assert.equal(h.stats.renders, draws)
  h.player.update(0.4)
  assert.equal(title.style.visibility, 'visible')
  assert.equal(heading.textContent, 'CHRONO EXPRESS'); assert.equal(subtitle.textContent, 'THE LAST HEIST')
  assert.equal(heading.style.fontSize, 'clamp(30px, 7.5vw, 86px)')
  assert.ok(Number(heading.style.opacity) < 0.01)
  assert.equal(Number(subtitle.style.opacity), 0)
  h.player.update(0.6); assert.ok(Number(heading.style.opacity) > 0.5)
  assert.ok(Number(subtitle.style.opacity) < 0.01)
  h.player.update(1.0); assert.equal(Number(subtitle.style.opacity), 1)
  h.player.update(0.8)
  assert.ok(Math.abs(Number(heading.style.opacity) - 1) < 1e-9)
  assert.ok(Math.abs(parseFloat(heading.style.letterSpacing) - 0.14) < 1e-9)
  assert.equal(heading.style.filter, 'blur(0px)')
  assert.equal(h.stats.crossfadeStarts, 1)
  assert.equal(u.uFade.value, 1, 'crossfade never fades RGB to black')
  assert.equal(h.player.active, true)
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'STORY')
  h.player.update(2.0); assert.equal(h.player.active, true)
  h.player.update(0.6); assert.ok(Number(title.style.opacity) > 0.49 && Number(title.style.opacity) < 0.51)
  h.player.update(0.601); assert.equal(h.stats.completes, 1)
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'PLAYING')
})

test('rain loops through the limited story bus at 1.5, fades in over 1.5 and out during crossfade', async () => {
  const h = harness({ rain: true }); await h.player.prepare(); h.player.start()
  assert.deepEqual(h.stats.starts, ['rain'])
  const rain = h.nodes[0], gain = rain.target
  assert.equal(rain.loop, true); assertStoryRoute(gain, h)
  assert.equal(gain.targets[1], h.analysers[0], 'meter is a side branch after the boosted rain gain')
  assert.deepEqual(gain.gain.events, [['set', 0, 0], ['ramp', 1.5, 1.5]])
  h.ctx.currentTime = endStart(); h.player.update(endStart())
  assert.deepEqual(gain.gain.events.at(-1), ['ramp', 0, endStart() + 2.2])
  h.player.update(finishTime() - endStart() + 0.01)
  assert.equal(rain.stopped, true); assert.equal(gain.disconnected, true)
  assert.equal(h.stats.completes, 1)
})

test('missing rain does not affect narration; skip fades rain and stops it on completion', async () => {
  const failed = harness(); await failed.player.prepare(); failed.player.start()
  failed.player.update(introBeat.timings.opening); assert.deepEqual(failed.stats.starts, [0])
  failed.player.update(finishTime()); assert.equal(failed.stats.completes, 1)
  for (const time of [0, endStart() + 1]) {
    const h = harness({ rain: true }); await h.player.prepare(); h.player.start(); h.player.update(time)
    const rain = h.nodes[0]; h.player.skip(); assert.notEqual(rain.stopped, true)
    assert.deepEqual(rain.target.gain.events.at(-1), ['ramp', 0, h.ctx.currentTime + 0.6])
    h.player.skip(); h.player.update(0.6); assert.equal(h.stats.completes, 1)
    assert.equal(rain.stopped, true)
  }
})

test('cinema subtitles stay centred at 7vh with no box or label on all six panels', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  const strip = find(h.body, 'story-captions'), entries = narrationTimeline()
  let elapsed = 0
  for (let i = 0; i < entries.length; i++) {
    h.player.update(entries[i].start - elapsed); elapsed = entries[i].start
    assert.equal(strip.style.bottom, '7vh')
    assert.equal(strip.style.left, '50%')
    assert.equal(strip.style.transform, 'translateX(-50%)')
    assert.equal(strip.style.maxWidth, '980px')
    assert.equal(strip.style.textAlign, 'center')
    assert.equal(strip.style.background, undefined)
    assert.equal(strip.style.border, undefined)
    assert.equal(strip.children.length, 1)
    const text = strip.children[0]
    assert.equal(text.style.fontFamily, 'Georgia, serif')
    assert.equal(text.style.lineHeight, '1.4')
    assert.equal(text.style.textShadow, '0 0 2px #000, 0 2px 6px #000, 0 0 14px rgba(0,0,0,0.85)')
    assert.ok(Math.abs(Number(strip.style.opacity)) < 1e-8)
    h.player.update(0.301); elapsed += 0.301
    assert.equal(Number(strip.style.opacity), 1)
    assert.equal(strip.style.transform, 'translateX(-50%)')
  }
  h.player.cancel()
})

test('skip from newspaper, each panel, crossfade, title in, hold and title out crossfades once with no title', async () => {
  for (const time of [0, ...narrationTimeline().map(entry => entry.start + 0.5), endStart() + 0.1, endBeats().title + 0.3, endBeats().hold + 0.5, endBeats().titleOut + 0.2]) {
    const h = harness({ rain: true, whistle: true }); await h.player.prepare(); h.player.start(); h.player.update(time)
    const narration = h.nodes.filter(node => typeof node.buffer.id === 'number')
    const whistle = h.nodes.find(node => node.buffer.id === 'whistle')
    h.player.skip(); h.player.skip()
    assert.equal(h.player.showGame, true)
    assert.equal(h.renderer.getPixelRatio(), 0.625)
    assert.ok(narration.every(node => node.stopped))
    if (whistle) assert.equal(whistle.stopped, true)
    assert.equal(find(h.body, 'story-title').style.visibility, 'hidden')
    h.player.update(0.599); assert.equal(h.stats.completes, 0)
    h.player.update(0.002); assert.equal(h.stats.completes, 1)
    assert.equal(h.stats.crossfadeStarts, 1)
    assert.equal(h.stats.disposals, 10)
    assert.equal(h.body.children.length, 0)
  }
})

test('crossfade overlays one quad after normal scene, restores renderer state and contains no removed shader effects', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  h.player.render(); assert.deepEqual(h.renderOrder, ['quad-clear'])
  h.player.skip(); h.renderOrder.push('game'); h.player.render()
  assert.deepEqual(h.renderOrder.slice(-2), ['game', 'quad-overlay'])
  assert.equal(h.renderer.autoClear, true)
  assert.equal(h.film.material.transparent, true)
  assert.match(h.film.material.fragmentShader, /, uOpacity\)/)
  assert.doesNotMatch(h.film.material.fragmentShader, /uRipple|uTitle|uDissolve|dissolveNoise|chromatic/)
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /onCrossfade\(\) \{[\s\S]*?beginForecourtArrival\(\)/)
  assert.match(main, /if \(storyPlayer\?\.showGame && arrival\) updateForecourtArrival\(delta\)/)
  assert.equal(fs.existsSync(new URL('../src/story/newspaper-texture.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../src/story/title-texture.js', import.meta.url)), false)
  const playerSource = fs.readFileSync(new URL('../src/ui/story-player.js', import.meta.url), 'utf8')
  assert.doesNotMatch(playerSource, /createNewspaperTexture|createTitleTexture|ending push|log\('ripple'\)|log\('dissolve'\)/)
  h.player.cancel()
})

test('all story sounds share exactly one bus and limiter; cleanup disconnects owned audio only', async () => {
  const h = harness({ rain: true, whistle: true }); await h.player.prepare(); h.player.start()
  const rain = h.nodes[0], bus = assertStoryRoute(rain.target, h)
  h.player.update(introBeat.timings.opening)
  const narration = h.nodes.find(node => node.buffer.id === 0)
  assert.equal(assertStoryRoute(narration.target, h), bus)
  h.player.update(endStart() - introBeat.timings.opening)
  const whistle = h.nodes.find(node => node.buffer.id === 'whistle')
  assert.equal(assertStoryRoute(whistle.target, h), bus)
  assert.equal(h.master.gain.value, 0.5)
  h.player.cancel()
  assert.ok(h.gains.every(node => node.disconnected))
  assert.ok(h.compressors.every(node => node.disconnected))
  assert.ok(h.analysers.every(node => node.disconnected))
  assert.equal(h.master.disconnected, undefined)
})

test('rain RMS meter samples at most once per second and reuses its preallocated PCM buffer', () => {
  const seen = [], reports = []
  const analyser = { fftSize: 1024, getFloatTimeDomainData(buffer) { seen.push(buffer); buffer.fill(0.02) } }
  const meter = createRainLevelMeter(analyser, line => reports.push(line))
  meter.update(0.999); assert.equal(seen.length, 0)
  const NativeFloat32Array = globalThis.Float32Array
  try {
    globalThis.Float32Array = class { constructor() { throw new Error('meter allocated a new PCM buffer') } }
    assert.ok(Math.abs(meter.update(0.002) - 0.02) < 1e-8)
    meter.update(0.5); assert.equal(seen.length, 1)
    assert.ok(Math.abs(meter.update(0.5) - 0.02) < 1e-8)
  } finally { globalThis.Float32Array = NativeFloat32Array }
  assert.equal(seen.length, 2); assert.equal(seen[0], seen[1])
  assert.ok(seen[0] instanceof NativeFloat32Array)
  assert.equal(seen[0].length, 1024)
  assert.deepEqual(reports, ['rain level rms=0.02000', 'rain level rms=0.02000'])
})

test('full device resolution and sRGB restore at crossfade start or on cancel and timeout', async () => {
  for (const exit of ['complete', 'skip', 'cancel', 'timeout']) {
    const h = harness(); await h.player.prepare()
    const originalViewport = h.renderer.getViewport(new THREE.Vector4()).toArray()
    assert.equal(h.renderer.getPixelRatio(), 0.625, 'title rendering is unchanged by prepare')
    h.player.start()
    assert.equal(h.renderer.getPixelRatio(), 2)
    assert.equal(h.renderer.outputColorSpace, THREE.SRGBColorSpace)
    assert.equal(h.film.material.toneMapped, false)
    if (exit === 'complete') h.player.update(finishTime() + 0.01)
    else if (exit === 'skip') { h.player.skip(); assert.equal(h.renderer.getPixelRatio(), 0.625); h.player.update(0.601) }
    else if (exit === 'timeout') h.timers.get(90000)()
    else h.player.cancel()
    assert.equal(h.renderer.getPixelRatio(), 0.625)
    assert.equal(h.renderer.outputColorSpace, THREE.LinearSRGBColorSpace)
    assert.deepEqual(h.renderer.getViewport(new THREE.Vector4()).toArray(), originalViewport)
    assert.equal(h.renderer.toneMapping, THREE.ACESFilmicToneMapping)
    assert.equal(h.renderer.toneMappingExposure, 1.2)
    assert.equal(h.renderer.autoClear, true)
    h.player.dispose(); assert.equal(h.renderer.getPixelRatio(), 0.625)
  }
})

test('story resolution respects DPR below two and reapplies after the renderer resize listener', async () => {
  const h = harness({ deviceRatio: 1.5 }); await h.player.prepare(); h.player.start()
  assert.equal(h.renderer.getPixelRatio(), 1.5)
  h.renderer.setPixelRatio(0.5)
  h.player.render(); assert.equal(h.renderer.getPixelRatio(), 1.5)
  h.player.cancel()
  assert.equal(h.renderer.getPixelRatio(), 0.625)
})

test('real main render callback bypasses composer for story quad and preserves post state', async () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '')
  const start = main.indexOf('render(world, view) {'), end = main.indexOf('\n  },', start)
  assert.ok(start >= 0 && end > start)
  const method = main.slice(start, end + 4)
  for (const enabled of [true, false]) {
    const h = harness(); await h.player.prepare(); h.player.start()
    let postCalls = 0
    const post = { enabled, render() { postCalls++ } }
    const render = new Function('storyPlayer', 'post', 'player', 'benchmark', `return function ${method}`)(h.player, post, { getCinematicView: () => null }, null)
    render({}, {}); assert.equal(postCalls, 0)
    assert.equal(h.stats.renders, 1)
    h.player.skip(); render({}, {})
    assert.equal(postCalls, 1, 'the live game under the crossfade uses its normal post path')
    assert.equal(h.renderOrder.at(-1), 'quad-overlay')
    h.player.update(0.601); render({}, {})
    assert.equal(postCalls, 2, 'normal scene render resumes')
    assert.equal(post.enabled, enabled)
  }
})

test('panel textures retain original NPOT images, maximum anisotropy and source-texel sharpening', async () => {
  const h = harness(); await h.player.prepare()
  for (let i = 0; i < 6; i++) {
    const texture = h.textureOwners[i + 1]
    assert.equal(texture.image, h.images[i + 1])
    assert.equal(texture.image.width, 1672); assert.equal(texture.image.height, 941)
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
    assert.equal(texture.minFilter, THREE.LinearFilter); assert.equal(texture.magFilter, THREE.LinearFilter)
    assert.equal(texture.generateMipmaps, false); assert.equal(texture.anisotropy, 16)
  }
  assert.ok(introBeat.panels.every(panel => panel.zoom[0] === 1 && panel.zoom[1] === 1.04))
  assert.equal(h.film.uniforms.uSharpen.value, 0.35); assert.equal(SHARPEN, 0.35)
  assert.equal(FILM_GRAIN, 0.010); assert.equal(FILM_RAIN, 0.025); assert.equal(FILM_FLICKER, 0.010)
  assert.equal(h.film.material.toneMapped, false)
  assert.match(h.film.material.fragmentShader, /vec2 texel = 1.0 \/ max\(size, vec2\(1.0\)\)/)
  assert.match(h.film.material.fragmentShader, /center \+ uSharpen \* \(center - blur\)/)
  assert.match(h.film.material.fragmentShader, /mix\(1.0, 0.25, 1.0 - smoothstep\(0.0, 0.38, vUv.y\)\)/)
  assert.match(h.film.material.fragmentShader, /#include <colorspace_fragment>/)
  h.player.cancel()
})

test('after the ending crossfade the real render callback draws only game while DOM title keeps input blocked', async () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '')
  const start = main.indexOf('render(world, view) {'), end = main.indexOf('\n  },', start)
  assert.ok(start >= 0 && end > start)
  const h = harness(); await h.player.prepare(); h.player.start()
  let games = 0
  const render = new Function('storyPlayer', 'post', 'player', 'benchmark', `return function ${main.slice(start, end + 4)}`)(h.player, { render() { games++ } }, { getCinematicView: () => null }, null)
  h.player.update(endStart()); render({}, {})
  assert.equal(games, 1); assert.equal(h.stats.renders, 1)
  h.player.update(2.201); render({}, {})
  assert.equal(games, 2); assert.equal(h.stats.renders, 1, 'quad submissions stop at crossfade end')
  h.player.update(0.4); render({}, {})
  assert.equal(games, 3); assert.equal(h.stats.renders, 1)
  assert.equal(find(h.body, 'story-title').style.visibility, 'visible')
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'STORY')
  assert.match(main, /const show = gameStarted && !storyPlayer\?\.active && !credits.isOpen/)
  h.player.cancel()
})

test('actual composition callbacks start arrival at crossfade and release music, HUD and input only on completion', async () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const start = main.indexOf('function prepareIntro() {'), end = main.indexOf('// Large walkthrough popups', start)
  assert.ok(start >= 0 && end > start)
  const events = []
  let callbacks
  const owner = { active: true, prepare: () => Promise.resolve() }
  const run = new Function('deps', `
    const {createStoryPlayer,initAudio,beginForecourtArrival,playMusicForState,hud,syncInputState,levelManager}=deps;
    const introBeat={},renderer={}; let storyPlayer=null,storyRun=1,gameStarted=true;
    ${main.slice(start, end)}
    return {prepareIntro, invalidate(){storyRun++}, get owner(){return storyPlayer}};
  `)({
    createStoryPlayer(options) { callbacks = options; return owner },
    initAudio() {}, beginForecourtArrival() { events.push('arrival') },
    playMusicForState(state) { events.push('music:' + state) },
    hud: { setVisible(value) { events.push('hud:' + value) } },
    syncInputState() { events.push('sync') }, levelManager: { getState: () => 'Boarding' }
  })
  await run.prepareIntro()
  callbacks.onCrossfade()
  assert.deepEqual(events, ['arrival'], 'HUD and music remain blocked over the title')
  assert.equal(run.owner, owner)
  callbacks.onComplete()
  assert.deepEqual(events, ['arrival', 'music:Boarding', 'hud:true', 'sync'])
  assert.equal(run.owner, null)
  run.invalidate(); callbacks.onCrossfade(); callbacks.onComplete()
  assert.equal(events.length, 4, 'stale generation cannot resume a different run')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { inflateSync } from 'node:zlib'
import * as THREE from 'three'
import { introBeat } from '../src/story/intro-beat.js'
import { createStoryPlayer, buildStoryTimeline, typewriterProgress, endingTimeline, createRainLevelMeter, trainPlacement, measureTrainAlpha, DEFAULT_TRAIN_BOUNDS } from '../src/ui/story-player.js'
import { createStoryFilm, SHARPEN, FILM_GRAIN, FILM_RAIN, FILM_FLICKER } from '../src/shaders/story-film.js'
import { resolveInputState } from '../src/core/input-state.js'
import { createPostProcessing } from '../src/core/postprocessing.js'
import { createStealthSystem } from '../src/systems/stealth.js'
import { LANDING_FIGURE } from '../src/environment/landing/layout.js'

function harness({ locked = false, failed = false, delayed = false, rain = false, resumeLater = false, whistle = false, deviceRatio = 2.5, restoreHook = () => {} } = {}) {
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''
    appendChild(child) { this.children.push(child); child.parent = this }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) }
  }
  const keys = new EventTarget(), body = new Element(), pending = [], timers = new Map()
  keys.devicePixelRatio = deviceRatio
  keys.innerWidth = 1920; keys.innerHeight = 1080
  let starts = [], stops = 0, completes = 0, disposals = 0, uploads = 0, renders = 0, compiled = 0, resumes = 0
  const nodes = [], gains = [], resumeResolvers = [], canvases = [], renderOrder = [], textureOwners = [], compressors = [], analysers = [], images = []
  let crossfadeStarts = 0, paints = 0, handoverRatio = null, restores = 0, coveredAtHandover = null
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
    getSize(target) { return target.set(1366, 768) },
    getViewport(target) { return target.copy(viewport) }, setViewport(value) { viewport.copy(value) },
    initTexture(texture) { uploads++; textureOwners.push(texture); texture.addEventListener('dispose', () => disposals++) }, compile() { compiled++ },
    getDrawingBufferSize(size) { size.set(1920, 1080) }, setRenderTarget() {}, render() { renders++; renderOrder.push(this.autoClear ? 'quad-clear' : 'quad-overlay') } }
  const player = createStoryPlayer({ beat: introBeat, renderer, film, doc: { body, createElement }, keys,
    measureRain: true,
    measureTrain: () => DEFAULT_TRAIN_BOUNDS,
    onRendererRestore: () => { restores++; assert.equal(renderer.getPixelRatio(), 0.625); restoreHook() },
    getRenderScale: () => 0.5,
    onCrossfade: () => { crossfadeStarts++; handoverRatio = renderer.getPixelRatio(); coveredAtHandover = film.uniforms.uSteam.value },
    context: () => ctx, master: () => master, onComplete: () => completes++,
    loadImage: url => {
      const image = url === introBeat.newspaper.image ? { width: 1024, height: 1536 }
        : url === introBeat.train.image ? { width: 1536, height: 1024 } : { width: 1672, height: 941 }
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
    get stats() { return { starts, stops, completes, disposals, uploads, renders, compiled, resumes, crossfadeStarts, paints, handoverRatio, restores, coveredAtHandover } } }
}

const narrationTimeline = () => buildStoryTimeline(introBeat, Array(5).fill({ duration: 8 }), true)
const endStart = () => endBeats().darken
const endBeats = () => endingTimeline(introBeat, narrationTimeline())
const finishTime = () => endBeats().complete
function finishEnding(h) {
  h.player.update(finishTime())
  h.player.update(introBeat.timings.smokeWaitMax)
  h.player.update(introBeat.timings.smokeClear)
}
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
  assert.equal(h.stats.uploads, 9); assert.equal(h.stats.compiled, 1)
  h.player.start(); h.player.render(); assert.equal(h.stats.renders, 1)
  h.player.cancel(); h.player.dispose()
  assert.equal(h.stats.disposals, 11); assert.equal(h.body.children.length, 0)
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
  assert.match(main, /if \(storyPlayer.showGame\) \{[\s\S]*?post.render\(world, view\)[\s\S]*?minimap.render\(renderer\)[\s\S]*?storyPlayer.render\(\)/)
  assert.match(main, /if \(gameStarted && !storyPlayer\?\.active && !awaitingIntro\) playMusicForState\(state\)/)
  const credits = fs.readFileSync(new URL('../src/ui/credits.js', import.meta.url), 'utf8')
  assert.ok(credits.includes('Story, menu and transition illustrations generated with ChatGPT (OpenAI)'))
  assert.ok(credits.includes('Narration voice generated with ElevenLabs (voice: David) (elevenlabs.io)'))
  assert.ok(credits.includes('Rain ambience generated with ElevenLabs (elevenlabs.io)'))
  assert.ok(credits.includes('Steam whistle sound generated with ElevenLabs (elevenlabs.io)'))
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
  assert.equal(h.images.length, 8, 'prefetch is not repeated')
  assert.equal(u.uPaperShadowOpacity.value, 0.45); assert.ok(u.uPaperShadowBlur.value > 0)
  assert.ok(u.uPaperFalloff.value > 0)
  assert.match(h.film.material.fragmentShader, /vec2\(uPaperSize.x \/ uPaperSize.y, 1.0\)/)
  assert.ok(h.film.material.fragmentShader.indexOf('color *= mix(1.0, 0.25') < h.film.material.fragmentShader.indexOf('vec3 paper = texture2D'))
  h.player.cancel()
})

test('ending darkens, draws title, passes train, covers fully, waits for twenty good full frames then clears', async () => {
  const h = harness({ whistle: true }); await h.player.prepare(); h.player.start()
  const u = h.film.uniforms, t = endBeats()
  assert.equal(t.title - t.darken, 1)
  assert.ok(Math.abs(t.train - t.hold - 1) < 1e-9)
  assert.ok(Math.abs(t.trainEnd - t.train - 1.6) < 1e-9)
  assert.ok(Math.abs(t.reveal - t.trainEnd - 0.6) < 1e-9)
  assert.ok(Math.abs(t.complete - t.reveal - 2) < 1e-9)
  h.player.update(t.darken)
  assert.deepEqual(h.stats.starts, [])
  assert.equal(h.player.showGame, false); assert.equal(h.player.showQuad, true)
  assert.equal(h.renderer.getPixelRatio(), 2)
  assert.ok(Math.abs(u.uZoomB.value - 1.04) < 1e-9)
  assert.ok(Math.abs(u.uPanB.value.x - introBeat.panels[5].pan[0]) < 1e-9)
  assert.equal(u.uOpacity.value, 1)
  h.player.update(0.5); assert.ok(Math.abs(u.uImage.value - 0.5) < 1e-9)
  h.player.update(0.5); assert.equal(u.uImage.value, 0)
  const title = find(h.body, 'story-title'), heading = title.children[0], subtitle = title.children[1]
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
  assert.equal(h.stats.crossfadeStarts, 0)
  h.player.update(1.0)
  assert.deepEqual(h.stats.starts, ['whistle'])
  assert.equal(h.nodes[0].target.gain.value, 0.8); assertStoryRoute(h.nodes[0].target, h)
  assert.ok(u.uTrainHeight.value > 0); assert.equal(h.player.showGame, false)
  assert.ok(u.uTrainCenter.value.x < 0)
  assert.equal(u.uTrainBlur.value, 0)
  h.player.update(1.599)
  assert.equal(h.stats.crossfadeStarts, 0)
  h.player.update(0.0011)
  assert.equal(h.stats.crossfadeStarts, 1)
  assert.equal(h.stats.handoverRatio, 0.625); assert.equal(h.stats.restores, 1)
  assert.equal(h.player.showGame, true)
  assert.equal(h.stats.coveredAtHandover, 1)
  assert.equal(u.uSmokeClear.value, 0)
  assert.equal(u.uTrainHeight.value, 0)
  assert.equal(h.player.active, true)
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'STORY')
  for (let i = 0; i < 20; i++) h.player.recordFrame(16)
  h.player.update(0.599); assert.equal(u.uSmokeClear.value, 0)
  h.player.update(0.001); assert.equal(u.uSmokeClear.value, 0)
  h.player.update(1); assert.equal(u.uSmokeClear.value, 0.5)
  assert.equal(h.player.active, true)
  h.player.update(1); assert.equal(h.stats.completes, 1)
  assert.equal(h.player.showQuad, false)
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'PLAYING')
})

test('rain loops through the limited story bus at 1.5, fades in over 1.5 and out during reveal', async () => {
  const h = harness({ rain: true }); await h.player.prepare(); h.player.start()
  assert.deepEqual(h.stats.starts, ['rain'])
  const rain = h.nodes[0], gain = rain.target
  assert.equal(rain.loop, true); assertStoryRoute(gain, h)
  assert.equal(gain.targets[1], h.analysers[0], 'meter is a side branch after the boosted rain gain')
  assert.deepEqual(gain.gain.events, [['set', 0, 0], ['ramp', 1.5, 1.5]])
  h.ctx.currentTime = endStart(); h.player.update(endStart())
  assert.deepEqual(gain.gain.events.at(-1), ['ramp', 1.5, 1.5], 'rain continues during title and train')
  h.player.update(endBeats().trainEnd - endStart())
  for (let i = 0; i < 20; i++) h.player.recordFrame(16)
  h.ctx.currentTime = endBeats().reveal; h.player.update(0.6)
  assert.deepEqual(gain.gain.events.at(-1), ['ramp', 0, endBeats().complete])
  h.player.update(endBeats().complete - endBeats().reveal + 0.001)
  assert.equal(rain.stopped, true); assert.equal(gain.disconnected, true)
  assert.equal(h.stats.completes, 1)
})

test('hidden look-around completes one orbit and returns exactly to arrival yaw before reveal', async () => {
  assert.equal(introBeat.timings.smokeGoodFrames, 20)
  assert.equal(introBeat.timings.smokeFrameMs, 33)
  assert.equal(introBeat.timings.smokeWaitMin, 0.6)
  assert.equal(introBeat.timings.smokeWaitMax, 5)
  assert.equal(introBeat.timings.smokeLookAround, 0.6)
  const h = harness(); await h.player.prepare(); h.player.start(); h.player.update(endBeats().trainEnd)
  assert.equal(h.player.lookAroundAngle, 0)
  h.player.update(0.15); assert.ok(Math.abs(h.player.lookAroundAngle - Math.PI / 2) < 1e-9)
  h.player.update(0.15); assert.ok(Math.abs(h.player.lookAroundAngle - Math.PI) < 1e-9)
  h.player.update(0.3); assert.equal(h.player.lookAroundAngle, 0)
  assert.equal(h.film.uniforms.uSmokeClear.value, 0)
  h.player.cancel(); assert.equal(h.player.lookAroundAngle, 0)
})

test('under-smoke wait needs twenty complete good frames, resets on partial or 33 ms frames, and caps at 5 seconds', async () => {
  const h = harness(); await h.player.prepare(); h.player.start(); h.player.update(endBeats().trainEnd)
  assert.equal(h.stats.coveredAtHandover, 1)
  for (let i = 0; i < 19; i++) h.player.recordFrame(16)
  h.player.update(0.6); h.player.update(0.1)
  assert.equal(h.film.uniforms.uSmokeClear.value, 0)
  h.player.recordFrame(33)
  for (let i = 0; i < 19; i++) h.player.recordFrame(16)
  h.player.update(0.1); h.player.update(0.1)
  assert.equal(h.film.uniforms.uSmokeClear.value, 0, 'one slow frame resets the streak')
  h.player.recordFrame(16, false)
  for (let i = 0; i < 19; i++) h.player.recordFrame(16)
  h.player.update(0); h.player.update(0.1)
  assert.equal(h.film.uniforms.uSmokeClear.value, 0, 'partial game frame breaks the streak too')
  h.player.recordFrame(16); h.player.update(0)
  h.player.update(1); assert.equal(h.film.uniforms.uSmokeClear.value, 0.5)
  h.player.update(1); assert.equal(h.stats.completes, 1)
  const slow = harness(); await slow.player.prepare(); slow.player.start(); slow.player.update(endBeats().trainEnd)
  slow.player.recordFrame(80); slow.player.update(4.999)
  assert.equal(slow.film.uniforms.uSmokeClear.value, 0)
  slow.player.update(0.001); slow.player.update(1)
  assert.equal(slow.film.uniforms.uSmokeClear.value, 0.5, '5-second maximum prevents an indefinite wait')
  slow.player.skip(); slow.player.update(0.6); assert.equal(slow.stats.completes, 1)
  const stalled = harness(); await stalled.player.prepare(); stalled.player.start(); stalled.player.update(endBeats().trainEnd)
  stalled.player.recordFrame(5100); stalled.player.update(0.1); stalled.player.update(1)
  assert.equal(stalled.film.uniforms.uSmokeClear.value, 0.5, 'wall-clock cap survives the game loop delta clamp')
  stalled.player.cancel()
})

test('missing rain does not affect narration; skip fades rain and stops it on completion', async () => {
  const failed = harness(); await failed.player.prepare(); failed.player.start()
  failed.player.update(introBeat.timings.opening); assert.deepEqual(failed.stats.starts, [0])
  finishEnding(failed); assert.equal(failed.stats.completes, 1)
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

test('skip from newspaper, each panel, darken, title, hold, train and smoke crossfades once', async () => {
  for (const time of [0, ...narrationTimeline().map(entry => entry.start + 0.5), ...['darken', 'title', 'hold', 'train', 'reveal'].map(phase => endBeats()[phase] + 0.2)]) {
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
    assert.equal(h.stats.disposals, 11)
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
  assert.match(h.film.material.fragmentShader, /float alpha = uOpacity \* \(uSteam >= 1.0 \? smokeOpacity : 1.0\)/)
  assert.doesNotMatch(h.film.material.fragmentShader, /uRipple|uTitle|uDissolve|dissolveNoise|chromatic/)
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /onCrossfade\(\) \{[\s\S]*?beginForecourtArrival\(\)/)
  assert.match(main, /if \(arrival && !updateForecourtArrival\(delta\) && !presentation\)/)
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
  h.player.update(endBeats().train - introBeat.timings.opening)
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
    if (exit === 'complete') finishEnding(h)
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
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('render(world, view) {'), end = main.indexOf('\n  },', start)
  assert.ok(start >= 0 && end > start)
  const method = main.slice(start, end + 4)
  for (const enabled of [true, false]) {
    const h = harness(); await h.player.prepare(); h.player.start()
    let postCalls = 0
    const post = { enabled, render() { postCalls++ } }
    const render = new Function('storyPlayer', 'post', 'player', 'benchmark', `const startupPrepared=true,levelManager={minimapVisible:false},gameStarted=true,titleBackdrop=null,frameStartedAt=performance.now(),frameIntervalMs=16,ranFullGameFrame=true,renderer={},minimap={setVisible(){},render(){}}; let firstLiveFramePending=false; return function ${method}`)(h.player, post, { getCinematicView: () => null }, null)
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

test('hidden handover runs the complete shared update with neutral input and a stopped run timer', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('function updateGameFrame('), end = main.indexOf('\nloop.start()', start)
  assert.ok(start >= 0 && end > start)
  const calls = [], camera = new THREE.PerspectiveCamera(), hud = {
    updateStats() { calls.push('hud stats') }, isTutorialOpen: () => false,
    updateRunTimer(options) { calls.push('timer'); assert.equal(options.elapsed, 7); assert.equal(options.running, false) },
    updateTimeState() { calls.push('hud state') } }
  let keyboardEnabled = true, interactionEnabled = false
  const keyboard = { state: { forward: true, interact: true }, consumePress() { throw new Error('hidden update consumed player input') } }
  const timeSystem = { update() { calls.push('time') }, getMode: () => 'NORMAL', getGhost: () => ({ isPlaying: () => false }),
    getEnergy: () => 100, getMaxEnergy: () => 100, getGhostCooldown: () => 0, getAbilityAvailability: () => ({}),
    getStrain: () => 0, getMaxStrain: () => 100, isStrainEnabled: () => false, getFreezeLockout: () => 0 }
  const deps = { camera, hud, keyboard, timeSystem, scene: new THREE.Scene(), renderQuality: { update() {} },
    player: { mesh: new THREE.Group(), updateVisual() { calls.push('visual') }, isCrouching: () => false,
      update(delta, input) { calls.push('player'); assert.equal(keyboardEnabled, false); assert.equal(input.keyboard.forward, false); assert.equal(input.keyboard.interact, false); assert.equal(input.runPressed, false); assert.equal(input.crouchPressed, false) } },
    levelManager: { getState: () => 'Boarding', update() { calls.push('level') } },
    storyPlayer: { lookAroundAngle: Math.PI },
    playerView: { yaw: 0, getYaw() { return this.yaw }, setYaw(value) { this.yaw = value },
      update() { calls.push('camera collision'); camera.position.set(999, 999, 999) } },
    interaction: { setEnabled(value) { interactionEnabled = value }, update() { assert.equal(keyboardEnabled, false); assert.equal(interactionEnabled, true); calls.push('interaction') } },
    respawn: { update() { calls.push('respawn') } },
    getInputState: () => 'STORY', syncInputState() { keyboardEnabled = false },
    updateForecourtArrival() { camera.position.set(10, 20, 30); return false } }
  const run = new Function('deps', 'THREE', `const {${Object.keys(deps).join(',')}}=deps;
    const benchmark=null,renderOverlay=null,modelEditor=null,credits={isOpen:false},gameStarted=true;
    const presentationKeyboard=Object.freeze({forward:false,interact:false});
    const arrivalFramePosition=new THREE.Vector3(),arrivalFrameRotation=new THREE.Quaternion();
    let elapsed=7,arrival={},firstHiddenSystemsPending=true;
    ${main.slice(start, end)}
    return {updateGameFrame,get elapsed(){return elapsed}};`)(deps, THREE)
  for (let i = 0; i < 10; i++) {
    deps.storyPlayer.lookAroundAngle = i < 5 ? Math.PI : 0
    assert.equal(run.updateGameFrame(0.1, true), true)
    assert.equal(deps.playerView.yaw, 0, 'internal orbit must restore the movement yaw exactly')
  }
  assert.equal(run.elapsed, 7); assert.equal(interactionEnabled, false)
  assert.deepEqual(camera.position.toArray(), [10, 20, 30], 'warming collision must not replace the arrival shot')
  assert.deepEqual(calls.slice(0, 11), ['visual', 'hud stats', 'timer', 'time', 'level', 'player', 'camera collision', 'interaction', 'respawn', 'hud state', 'visual'])
  assert.equal(calls.filter(name => name === 'level').length, 10)
  assert.match(main, /if \(storyPlayer\?\.showGame && storyPlayer\.liveGame !== false\) ranFullGameFrame = updateGameFrame\(delta, true\)/)
  const render = main.slice(main.indexOf('render(world, view) {'), main.indexOf('  afterRender:', main.indexOf('render(world, view) {')))
  assert.ok(render.indexOf('post.render(world, view)') < render.indexOf('minimap.render(renderer)'))
  assert.ok(render.indexOf('minimap.render(renderer)') < render.indexOf('storyPlayer.render()'))
  assert.match(render, /recordFrame\([^\n]*ranFullGameFrame, performance.now\(\)\)/)
})

test('arrival spawn lies beyond all platform guard sight and camera ranges throughout hidden frames', () => {
  const source = fs.readFileSync(new URL('../src/levels/boarding.js', import.meta.url), 'utf8')
  const start = source.indexOf('const platformPatrols = ['), end = source.indexOf('const platformGuards', start)
  const routes = new Function(`${source.slice(start, end)}; return platformPatrols`)()
  const mesh = new THREE.Group(); mesh.position.set(LANDING_FIGURE.x, LANDING_FIGURE.y, LANDING_FIGURE.z)
  const world = new THREE.Scene(); world.add(mesh)
  let captures = 0
  const stealth = createStealthSystem({ scene: world, player: { mesh }, respawn: { fail() { captures++ } } })
  try {
    for (const route of routes) {
      assert.ok(route.points.every(([x]) => LANDING_FIGURE.x - x >= 9.95 - 1e-9))
      for (let i = 0; i < route.points.length; i++) {
        const [ax, az] = route.points[i], [bx, bz] = route.points[(i + 1) % route.points.length]
        const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz
        const t = length2 ? Math.max(0, Math.min(1, ((LANDING_FIGURE.x - ax) * dx + (LANDING_FIGURE.z - az) * dz) / length2)) : 0
        assert.ok(Math.hypot(LANDING_FIGURE.x - ax - dx * t, LANDING_FIGURE.z - az - dz * t) > 10,
          route.id + ' remains beyond even the alerted guard range along the complete route')
      }
      stealth.addGuard({ waypoints: route.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), speed: route.speed, waitTime: route.waitTime })
    }
    assert.match(source, /new THREE.Vector3\(-10.5, 4.6, -21.95\)/)
    assert.ok(LANDING_FIGURE.x - (-10.5) > 8)
    stealth.addCamera({ position: new THREE.Vector3(-10.5, 4.6, -21.95), range: 8 })
    for (let i = 0; i < 210; i++) { stealth.update(1 / 60); assert.equal(stealth.getSuspicion(), 0) }
    assert.equal(captures, 0)
    assert.ok(stealth.getGuards().every(guard => guard.state !== 'ALERT'))
  } finally { stealth.dispose() }
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

test('real render callback draws only story before coverage, game plus one quad during reveal, then only game', async () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('render(world, view) {'), end = main.indexOf('\n  },', start)
  assert.ok(start >= 0 && end > start)
  const h = harness(); await h.player.prepare(); h.player.start()
  let games = 0
  const render = new Function('storyPlayer', 'post', 'player', 'benchmark', `const startupPrepared=true,levelManager={minimapVisible:false},gameStarted=true,titleBackdrop=null,frameStartedAt=performance.now(),frameIntervalMs=16,ranFullGameFrame=true,renderer={},minimap={setVisible(){},render(){}}; let firstLiveFramePending=false; return function ${main.slice(start, end + 4)}`)(h.player, { render() { games++ } }, { getCinematicView: () => null }, null)
  h.player.update(endStart()); render({}, {})
  assert.equal(games, 0); assert.equal(h.stats.renders, 1)
  h.player.update(endBeats().title - endStart() + 0.1); render({}, {})
  assert.equal(games, 0); assert.equal(h.stats.renders, 2)
  assert.equal(find(h.body, 'story-title').style.visibility, 'visible')
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'STORY')
  h.player.update(endBeats().reveal - endBeats().title - 0.1 + 0.0001); render({}, {})
  assert.equal(games, 1); assert.equal(h.stats.renders, 3)
  assert.equal(h.renderOrder.at(-1), 'quad-overlay')
  h.player.update(5); h.player.update(2); render({}, {})
  assert.equal(games, 2); assert.equal(h.stats.renders, 3)
  assert.match(main, /const show = gameStarted && !storyPlayer\?\.active && !credits.isOpen/)
  h.player.cancel()
})

test('actual composition keeps level music silent behind the title and during intro, then releases music, HUD and input on completion', async () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('function prepareIntro() {'), end = main.indexOf('// Large walkthrough popups', start)
  assert.ok(start >= 0 && end > start)
  const enterStart = main.indexOf('onEnter: (state) => {'), enterEnd = main.indexOf('  onLeave:', enterStart)
  assert.ok(enterStart >= 0 && enterEnd > enterStart)
  const events = []
  let callbacks
  const owner = { active: false, prefetch: () => Promise.resolve() }
  const run = new Function('deps', `
    const {createStoryPlayer,initAudio,beginForecourtArrival,warmGameplayAudio,playMusicForState,hud,syncInputState,levelManager}=deps;
    const post={resize(){deps.events.push('resize')}},settings={get(){return 0.85}};
    const introBeat={},renderer={},camera={},modelEditor=null,timeSystem={warmGhost(){}},requestAnimationFrame=()=>{};
    let storyPlayer=null,storyRun=1,gameStarted=false,awaitingIntro=false,firstLiveFramePending=false,firstPlayableFramePending=false;
    ${main.slice(start, end)}
    const levelCallbacks={${main.slice(enterStart, enterEnd)}};
    return {prepareIntro, enterBoarding(){levelCallbacks.onEnter('Boarding')},
      beginRun(){gameStarted=true;storyPlayer.active=true}, invalidate(){storyRun++}, get owner(){return storyPlayer}, get hudStyle(){return hud.root.style}};
  `)({
    events, createStoryPlayer(options) { callbacks = options; return owner },
    initAudio() {}, warmGameplayAudio() { events.push('warm audio') }, beginForecourtArrival() { events.push('arrival') },
    playMusicForState(state) { events.push('music:' + state) },
    hud: { root: { style: {} }, setVisible(value) { events.push('hud:' + value) } },
    syncInputState() { events.push('sync') }, levelManager: { getState: () => 'Boarding' }
  })
  await run.prepareIntro()
  run.enterBoarding()
  assert.deepEqual(events, [], 'built Boarding behind the visible title must not start level music, even with no active intro')
  run.beginRun(); run.enterBoarding()
  assert.deepEqual(events, [], 'level music also stays silent while the intro is active')
  callbacks.onRendererRestore(); assert.deepEqual(events, ['resize']); events.length = 0
  assert.equal(callbacks.getRenderScale(), 0.85)
  callbacks.onCrossfade()
  assert.deepEqual(events, ['warm audio', 'arrival'], 'audio constructs under cover, while music and HUD remain blocked')
  assert.equal(run.hudStyle.display, 'block'); assert.equal(run.hudStyle.visibility, 'hidden', 'HUD layout stays warm under smoke')
  assert.equal(run.owner, owner)
  callbacks.onComplete()
  assert.deepEqual(events, ['warm audio', 'arrival', 'music:Boarding', 'hud:true', 'sync'])
  assert.equal(run.owner, null)
  assert.equal(run.hudStyle.visibility, '')
  run.invalidate(); callbacks.onCrossfade(); callbacks.onComplete()
  assert.equal(events.length, 5, 'stale generation cannot resume a different run')
})

test('Boarding music decodes without playback and procedural audio constructs muted under smoke', async () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('function prefetchBoardingMusic()'), end = main.indexOf('async function buildTitleBackdrop()', start)
  const calls = []
  const deps = { LEVEL_TRACKS: { Boarding: { file: 'level1' } }, loadTrack: file => file,
    LevelMusicPlayer: class { load() { calls.push('decode'); return Promise.resolve() } dispose() { calls.push('dispose loading owner') } },
    getContext: () => ({ currentTime: 12 }), ensureGameplayDrone() { calls.push('construct'); return { output: { gain: {
      cancelScheduledValues(at) { calls.push('cancel:' + at) }, setValueAtTime(value, at) { calls.push(`gain:${value}:${at}`) } } } } }
  }
  const run = new Function('deps', `const {${Object.keys(deps).join(',')}}=deps;${main.slice(start, end)};return {prefetchBoardingMusic,warmGameplayAudio}`)(deps)
  await run.prefetchBoardingMusic(); assert.deepEqual(calls, ['decode', 'dispose loading owner'])
  run.warmGameplayAudio()
  assert.deepEqual(calls.slice(2), ['construct', 'cancel:12', 'gain:0:12'])
})

test('train placement stays offscreen at endpoints, preserves aspect and caps CSS image upscaling', async () => {
  const target = {}
  for (const [width, height] of [[1366, 768], [1920, 1080], [3840, 2160], [768, 1366]]) {
    const start = trainPlacement(introBeat, width, height, 0, target)
    assert.equal(start.x + start.width / 2, 0)
    assert.ok(start.height * height / 1024 <= 1.60000000001)
    assert.ok(Math.abs(start.width * width / (start.height * height) - 1.5) < 1e-9)
    assert.ok(Math.abs(start.y - 0.5 * start.height - 0.05) < 1e-9)
    const end = trainPlacement(introBeat, width, height, 1, target)
    assert.ok(Math.abs(end.x - end.width / 2 - 1) < 1e-9)
    assert.equal(end.blur, 0)
  }
  const h = harness(); await h.player.prepare()
  const train = h.film.uniforms.uTrain.value
  assert.equal(train.image.width, 1536); assert.equal(train.image.height, 1024)
  assert.equal(train.colorSpace, THREE.SRGBColorSpace); assert.equal(train.premultiplyAlpha, true)
  assert.equal(h.film.material.premultipliedAlpha, true)
  assert.match(h.film.material.fragmentShader, /tap < 8/)
  assert.match(h.film.material.fragmentShader, /octave < 4/)
  assert.match(h.film.material.fragmentShader, /uSteam >= 1.0 \? smokeOpacity : 1.0/)
  assert.ok(h.film.material.fragmentShader.indexOf('color = uSteam >= 1.0') < h.film.material.fragmentShader.indexOf('vec4 train ='))
  assert.match(h.film.material.fragmentShader, /gl_FragColor.rgb \*= gl_FragColor.a/)
  h.player.cancel()
})

test('complete, skip and cancel release every owned resource and subsequent update/render do nothing', async () => {
  for (const exit of ['complete', 'skip', 'cancel']) {
    const h = harness({ rain: true, whistle: true }); await h.player.prepare(); h.player.start()
    h.player.update(introBeat.timings.opening)
    if (exit === 'complete') finishEnding(h)
    else if (exit === 'skip') { h.player.skip(); h.player.update(0.601) }
    else h.player.cancel()
    assert.deepEqual(h.player.resources(), { frames: 0, listeners: 0, audioNodes: 0, textures: 0 })
    assert.ok(h.nodes.every(node => node.disconnected && node.stopped))
    assert.ok([...h.gains, ...h.compressors, ...h.analysers].every(node => node.disconnected))
    assert.equal(h.stats.disposals, 11); assert.equal(h.stats.restores, 1)
    assert.equal(h.body.children.length, 0); assert.equal(h.timers.size, 0)
    const before = h.stats, uniforms = [h.film.uniforms.uTime.value, h.film.uniforms.uOpacity.value, h.film.uniforms.uSteam.value]
    h.player.update(1000); h.player.render(); h.key('keydown'); h.key('keyup')
    assert.deepEqual(h.stats, before)
    assert.deepEqual([h.film.uniforms.uTime.value, h.film.uniforms.uOpacity.value, h.film.uniforms.uSteam.value], uniforms)
  }
})

test('a resize during story cannot leave the real composer at story resolution after complete, skip or cancel', async () => {
  const previousWindow = globalThis.window, original = THREE.WebGLRenderTarget.prototype.setSize
  const sizes = []
  THREE.WebGLRenderTarget.prototype.setSize = function (width, height, depth) {
    if (this.texture.name === 'chrono-post-target') sizes.push([width, height])
    return original.call(this, width, height, depth)
  }
  try {
    for (const exit of ['complete', 'skip', 'cancel']) {
      let post
      const h = harness({ restoreHook: () => post.resize() })
      globalThis.window = new EventTarget()
      post = createPostProcessing(h.renderer)
      try {
        await h.player.prepare(); h.player.start()
        post.resize()
        assert.deepEqual(sizes.at(-1), [1366 * 2, 768 * 2])
        if (exit === 'complete') finishEnding(h)
        else if (exit === 'skip') { h.player.skip(); h.player.update(0.601) }
        else h.player.cancel()
        assert.deepEqual(sizes.at(-1), [1366 * 0.625, 768 * 0.625])
        assert.equal(h.stats.restores, 1)
      } finally { h.player.cancel(); post.dispose() }
    }
  } finally { globalThis.window = previousWindow; THREE.WebGLRenderTarget.prototype.setSize = original }
})

test('PNG alpha bounds are measured once, including body height and transparent padding', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4)
  for (const [x, y] of [[1, 0], [1, 2], [2, 2], [1, 3], [2, 3]]) pixels[(y * 4 + x) * 4 + 3] = 255
  let reads = 0, draws = 0
  const bounds = measureTrainAlpha({ width: 4, height: 4 }, introBeat, {
    createElement: () => ({ getContext: () => ({ drawImage() { draws++ }, getImageData() { reads++; return { data: pixels } } }) })
  })
  assert.deepEqual(bounds, { left: 0.25, right: 0.75, bodyBottom: 0, bodyTop: 0.5 })
  assert.equal(reads, 1); assert.equal(draws, 1)
  for (const progress of [0, 0.5, 1]) {
    const placement = trainPlacement(introBeat, 1366, 768, progress, {}, bounds)
    assert.ok(placement.height * 768 / 1024 <= 1.6)
    if (progress === 0) assert.ok(Math.abs(placement.leading) < 1e-9)
    if (progress === 1) assert.ok(Math.abs(placement.trailing - 1) < 1e-9)
  }
  assert.equal(reads, 1, 'placement never rereads alpha')
})

test('committed train PNG supplies real opaque extents and a measured crisp body scale', () => {
  const png = fs.readFileSync(new URL('../src/assets/textures/story/story-train.png', import.meta.url))
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  assert.equal(png[24], 8); assert.equal(png[25], 6, 'fixture is an 8-bit RGBA PNG')
  assert.equal(png[28], 0, 'fixture is non-interlaced')
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), kind = png.toString('ascii', offset + 4, offset + 8)
    if (kind === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const scanlines = inflateSync(Buffer.concat(chunks)), pixels = new Uint8ClampedArray(width * height * 4), stride = width * 4
  // Reconstruct the five PNG scanline filters, solely for this real-asset test.
  for (let y = 0; y < height; y++) {
    const filter = scanlines[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, a = x >= 4 ? pixels[index - 4] : 0
      const b = y ? pixels[index - stride] : 0, c = y && x >= 4 ? pixels[index - stride - 4] : 0
      let prediction = 0
      if (filter === 1) prediction = a
      if (filter === 2) prediction = b
      if (filter === 3) prediction = Math.floor((a + b) / 2)
      if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        prediction = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      pixels[index] = (scanlines[y * (stride + 1) + 1 + x] + prediction) & 255
    }
  }
  let minAlpha = 255, maxAlpha = 0
  for (let i = 3; i < pixels.length; i += 4) { minAlpha = Math.min(minAlpha, pixels[i]); maxAlpha = Math.max(maxAlpha, pixels[i]) }
  assert.equal(minAlpha, 0, 'train asset needs truly transparent background pixels for an alpha-aligned wipe')
  assert.ok(maxAlpha >= 250, `maximum alpha ${maxAlpha} is opaque enough`)
  const bounds = measureTrainAlpha({ width, height }, introBeat, { createElement: () => ({ getContext: () => ({
    drawImage() {}, getImageData: () => ({ data: pixels })
  }) }) })
  assert.ok(bounds.left >= 0 && bounds.left < bounds.right && bounds.right <= 1)
  assert.ok(bounds.bodyTop > bounds.bodyBottom)
  console.log('[train asset bounds]', JSON.stringify(bounds))
  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    const pose = trainPlacement(introBeat, w, h, 0.5, {}, bounds)
    const scale = pose.height * h / height, bodyHeight = pose.height * (bounds.bodyTop - bounds.bodyBottom)
    assert.ok(scale <= 1.600000001)
    assert.ok(Math.abs(bodyHeight - 0.28) < 1e-9)
    assert.ok(Math.abs(pose.y + (bounds.bodyBottom - 0.5) * pose.height - 0.05) < 1e-9)
    console.log(`[train scale] ${w}x${h} upscale=${scale.toFixed(5)} body=${bodyHeight.toFixed(5)}`)
  }
})

test('arrival-view warm-up uploads textures and renders once without changing visibility or culling', async () => {
  const h = harness(); await h.player.prefetch()
  assert.equal(h.stats.uploads, 0); assert.equal(h.stats.compiled, 0); assert.equal(h.stats.renders, 0)
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('function warmLevel1()'), end = main.indexOf('function startPreparedIntro()', start)
  const world = new THREE.Scene(), view = new THREE.PerspectiveCamera(), map = new THREE.Texture()
  world.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map })))
  const hidden = new THREE.Group(); hidden.visible = false; hidden.frustumCulled = false
  world.add(hidden)
  const initial = []; world.traverse(node => initial.push([node, node.visible, node.frustumCulled]))
  const initialPosition = view.position.clone(), initialRotation = view.quaternion.clone()
  const events = []
  const warm = new Function('scene', 'camera', 'renderer', 'post', 'storyPlayer', 'setArrivalStartCamera', `const preparedBoarding={updateAtmosphere(){}},timeSystem={warmGhost(){}}; ${main.slice(start, end)}; return warmLevel1`)(
    world, view, h.renderer, { render() {
      for (const [node, visible, culled] of initial) { assert.equal(node.visible, visible); assert.equal(node.frustumCulled, culled) }
      assert.deepEqual(view.position.toArray(), [9, 8, 7])
      events.push('warm game')
    } }, h.player, () => { view.position.set(9, 8, 7); events.push('arrival view') })
  warm(); events.push('warm done')
  for (const [node, visible, culled] of initial) { assert.equal(node.visible, visible); assert.equal(node.frustumCulled, culled) }
  assert.deepEqual(view.position, initialPosition); assert.ok(view.quaternion.equals(initialRotation))
  assert.equal(h.stats.uploads, 10); assert.equal(h.stats.compiled, 2, 'one story compile plus one arrival-view compile')
  assert.deepEqual(events, ['arrival view', 'warm game', 'warm done'])
  assert.doesNotMatch(main.slice(start, end), /frustumCulled\s*=|\.visible\s*=|full warm-up/)
  assert.equal(h.player.active, false)
  h.player.start(); events.push('intro start')
  assert.ok(events.indexOf('warm done') < events.indexOf('intro start'))
  const uploads = h.stats.uploads, compiled = h.stats.compiled
  h.player.update(endBeats().reveal + 0.001)
  const renderStart = main.indexOf('render(world, view) {'), renderEnd = main.indexOf('\n  },', renderStart)
  const render = new Function('storyPlayer', 'post', 'player', 'benchmark', `const startupPrepared=true,levelManager={minimapVisible:false},gameStarted=true,titleBackdrop=null,frameStartedAt=performance.now(),frameIntervalMs=16,ranFullGameFrame=true,renderer={},minimap={setVisible(){},render(){}};let firstLiveFramePending=false;return function ${main.slice(renderStart, renderEnd + 4)}`)(
    h.player, { render() { events.push('first live') } }, { getCinematicView: () => null }, null)
  render(world, view)
  assert.equal(events.at(-1), 'first live')
  assert.equal(h.stats.uploads, uploads); assert.equal(h.stats.compiled, compiled)
  const startup = main.slice(main.indexOf('// Defer by two animation frames'), main.indexOf('const loop ='))
  assert.doesNotMatch(startup, /await introReady|await charactersReady/)
  assert.ok(startup.indexOf('await startupTasks.track') < startup.indexOf('menu.show()'))
  const prepare = main.slice(main.indexOf('async function buildTitleBackdrop()'), main.indexOf('const settingsMenu'))
  assert.ok(prepare.indexOf('await Promise.all') < prepare.indexOf('createBoardingLevel('))
  assert.ok(prepare.indexOf('createBoardingLevel(') < prepare.indexOf('warmLevel1()'))
  assert.ok(prepare.indexOf('warmLevel1()') < prepare.indexOf('return createTitleBackdrop('))
  assert.match(main, /Promise.all\(\[introReady, charactersReady, boardingFilesReady/)
  assert.match(main, /transitioning: awaitingIntro \|\| levelManager.isTransitioning\(\)/)
  h.player.cancel(); world.children[0].geometry.dispose(); world.children[0].material.dispose(); map.dispose()
})

test('arrival-view warm-up leaves visibility/culling unchanged and restores camera if compilation fails', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('import.meta.env?.DEV', 'false')
  const start = main.indexOf('function warmLevel1()'), end = main.indexOf('function startPreparedIntro()', start)
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), hidden = new THREE.Group()
  hidden.visible = false; hidden.frustumCulled = false; scene.add(hidden)
  const position = camera.position.clone(), rotation = camera.quaternion.clone()
  const warm = new Function('scene', 'camera', 'renderer', 'post', 'storyPlayer', 'setArrivalStartCamera', `const preparedBoarding={updateAtmosphere(){}},timeSystem={warmGhost(){}}; ${main.slice(start, end)}; return warmLevel1`)(
    scene, camera, { compile() {
      assert.equal(hidden.visible, false); assert.equal(hidden.frustumCulled, false)
      assert.equal(scene.visible, true); assert.equal(scene.frustumCulled, true)
      camera.position.set(1, 2, 3); throw new Error('compile failure')
    } }, {},
    { warm() {}, renderPrepared() {} }, () => {})
  assert.throws(warm, /compile failure/)
  assert.equal(scene.visible, true); assert.equal(scene.frustumCulled, true)
  assert.equal(hidden.visible, false); assert.equal(hidden.frustumCulled, false)
  assert.deepEqual(camera.position, position); assert.ok(camera.quaternion.equals(rotation))
})

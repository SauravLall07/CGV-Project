import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { introBeat } from '../src/story/intro-beat.js'
import { createStoryPlayer, buildStoryTimeline, typewriterProgress, endingTimeline } from '../src/ui/story-player.js'
import { createStoryFilm } from '../src/shaders/story-film.js'
import { resolveInputState } from '../src/core/input-state.js'

function harness({ locked = false, failed = false, delayed = false, rain = false, resumeLater = false, whistle = false } = {}) {
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''
    appendChild(child) { this.children.push(child); child.parent = this }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) }
  }
  const keys = new EventTarget(), body = new Element(), pending = [], timers = new Map()
  let starts = [], stops = 0, completes = 0, disposals = 0, uploads = 0, renders = 0, compiled = 0, resumes = 0
  const nodes = [], gains = [], resumeResolvers = [], canvases = [], renderOrder = [], textureOwners = []
  let dissolveStarts = 0, paints = 0
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
      const node = { gain, connect(target) { this.target = target }, disconnect() { this.disconnected = true } }
      gains.push(node); return node
    },
    createBufferSource() {
      const node = { connect(target) { this.target = target }, disconnect() { this.disconnected = true },
        start(_when, offset = 0) { assert.equal(ctx.state, 'running'); this.offset = offset; starts.push(this.buffer.id) }, stop() { stops++; this.stopped = true } }
      nodes.push(node); return node
    }
  }
  const renderer = { autoClear: true, initTexture(texture) { uploads++; textureOwners.push(texture); texture.addEventListener('dispose', () => disposals++) }, compile() { compiled++ },
    getDrawingBufferSize(size) { size.set(1920, 1080) }, setRenderTarget() {}, render() { renders++; renderOrder.push(this.autoClear ? 'quad-clear' : 'quad-overlay') } }
  const player = createStoryPlayer({ beat: introBeat, renderer, film, doc: { body, createElement }, keys,
    onDissolve: () => { dissolveStarts++ },
    context: () => ctx, master: () => master, onComplete: () => completes++,
    loadImage: () => delayed ? new Promise(resolve => pending.push(() => resolve({ width: 1600, height: 900 }))) : Promise.resolve({ width: 1600, height: 900 }),
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
  return { player, film, body, pending, timers, key, ctx, master, nodes, gains, resumeResolvers, canvases, renderer, renderOrder, textureOwners,
    get stats() { return { starts, stops, completes, disposals, uploads, renders, compiled, resumes, dissolveStarts, paints } } }
}

const narrationTimeline = () => buildStoryTimeline(introBeat, Array(5).fill({ duration: 8 }), true)
const endStart = () => endingTimeline(introBeat, narrationTimeline()).push
const endBeats = () => endingTimeline(introBeat, narrationTimeline())
const finishTime = () => endBeats().complete
const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean)

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
  assert.equal(h.stats.completes, 0); assert.equal(h.stats.uploads, 2)
  assert.equal(h.stats.disposals, 4); assert.equal(h.body.children.length, 0)
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
  assert.match(main, /if \(storyPlayer.isDissolving\) post.render\(world, view\)\s+storyPlayer.render\(\)/)
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
  assert.equal(source.target.target, h.master)
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
  const strip = find(h.body, 'story-captions'), caption = strip.children[1], block = caption.children[0]
  const children = [...block.children]
  assert.equal(children.map(span => span.textContent).join(''), introBeat.panels[0].caption)
  assert.ok(children.every(span => span.style.visibility === 'hidden'))
  assert.equal(strip.style.background, '#efe4c8')
  assert.equal(strip.style.width, 'clamp(300px, 36vw, 560px)')
  assert.equal(caption.style.fontSize, 'clamp(16px, 1.4vw, 19px)')
  assert.equal(strip.children[0].style.color, '#7a2a1f')
  h.player.update(4)
  assert.deepEqual(block.children, children)
  assert.ok(children.some(span => span.style.visibility === 'visible'))
  assert.ok(children.some(span => span.style.visibility === 'hidden'))
  assert.equal(children.map(span => span.textContent).join(''), introBeat.panels[0].caption)
  h.player.cancel()
})

test('newspaper spins three turns, stops and shakes, holds, crossfades, and paints once', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  const u = h.film.uniforms, painted = h.stats.paints
  assert.equal(h.canvases.length, 2); assert.ok(painted > 18000)
  assert.deepEqual(h.canvases.map(c => [c.width, c.height]), [[1024, 1400], [2048, 512]])
  assert.ok(Math.abs(u.uPaperAngle.value - Math.PI * 6) < 1e-9)
  assert.equal(u.uImage.value, 0); assert.equal(u.uRain.value, 0.06)
  h.player.update(introBeat.timings.newspaperLead + introBeat.timings.newspaperSpin)
  assert.ok(Math.abs(u.uPaperAngle.value) < 1e-9)
  assert.ok(Math.abs(u.uPaperScale.value - 0.75) < 1e-9)
  h.player.update(0.05); assert.ok(u.uShake.value.length() > 0)
  h.player.update(0.11); assert.equal(u.uShake.value.length(), 0)
  h.player.update(6.6 - (introBeat.timings.newspaperLead + introBeat.timings.newspaperSpin + 0.16))
  assert.ok(Math.abs(u.uPaperOpacity.value - 0.5) < 1e-8)
  assert.ok(Math.abs(u.uImage.value - 0.5) < 1e-8)
  assert.ok(Math.abs(u.uPaperScale.value - 0.75 * 1.04) < 1e-9)
  assert.equal(h.stats.starts.length, 0, 'no narration during newspaper or its crossfade')
  h.player.update(0.401); assert.deepEqual(h.stats.starts, [0])
  assert.equal(u.uPaperOpacity.value, 0)
  await h.player.prepare(); assert.equal(h.stats.paints, painted); assert.equal(h.canvases.length, 2)
  h.player.cancel()
})

test('ending pushes with whistle, ripples, settles title, holds and dissolves without black', async () => {
  const h = harness({ whistle: true }); await h.player.prepare(); h.player.start()
  const u = h.film.uniforms, t = endBeats()
  h.player.update(t.push)
  assert.deepEqual(h.stats.starts, ['whistle'])
  assert.equal(h.nodes[0].target.gain.value, 0.8)
  assert.equal(h.nodes[0].target.target, h.master)
  assert.equal(u.uTitleOpacity.value, 0); assert.equal(u.uRipple.value, -1)
  h.player.update(1.2)
  assert.ok(Math.abs(u.uZoomB.value - 1.25) < 1e-9)
  assert.ok(Math.abs(u.uPanB.value.x - 0.08) < 1e-9)
  assert.ok(Math.abs(u.uRipple.value) < 1e-8)
  h.player.update(0.4)
  assert.ok(Math.abs(u.uTitleOpacity.value) < 1e-8)
  h.player.update(0.4)
  assert.ok(Math.abs(u.uTitleDistortion.value - 0.5) < 1e-8)
  h.player.update(0.4)
  assert.ok(Math.abs(u.uTitleOpacity.value - 1) < 1e-8)
  assert.ok(Math.abs(u.uTitleDistortion.value) < 1e-8)
  h.player.update(1.501)
  assert.equal(h.player.isDissolving, true); assert.equal(h.stats.dissolveStarts, 1)
  assert.equal(u.uFade.value, 1, 'dissolve never fades to black')
  assert.equal(h.player.active, true)
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'STORY')
  h.player.update(1.501); assert.equal(h.stats.completes, 1)
  assert.equal(resolveInputState({ gameStarted: true, story: h.player.active }), 'PLAYING')
})

test('rain loops under master at 0.5, fades in over 1.5 and out during dissolve', async () => {
  const h = harness({ rain: true }); await h.player.prepare(); h.player.start()
  assert.deepEqual(h.stats.starts, ['rain'])
  const rain = h.nodes[0], gain = rain.target
  assert.equal(rain.loop, true); assert.equal(gain.target, h.master)
  assert.deepEqual(gain.gain.events, [['set', 0, 0], ['ramp', 0.5, 1.5]])
  h.ctx.currentTime = endBeats().dissolve; h.player.update(endBeats().dissolve)
  assert.deepEqual(gain.gain.events.at(-1), ['ramp', 0, endBeats().dissolve + 1.5])
  h.player.update(1.501)
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

test('comic captions use the six data corners, 4% margin, 0.3s fade and 10px slide', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  const strip = find(h.body, 'story-captions'), entries = narrationTimeline()
  let elapsed = 0
  const corners = ['top-left', 'bottom-left', 'bottom-right', 'top-left', 'bottom-left', 'top-left']
  for (let i = 0; i < entries.length; i++) {
    h.player.update(entries[i].start - elapsed); elapsed = entries[i].start
    assert.equal(introBeat.panels[i].corner, corners[i])
    assert.equal(strip.style.top, corners[i].startsWith('top') ? '4%' : 'auto')
    assert.equal(strip.style.bottom, corners[i].startsWith('bottom') ? '4%' : 'auto')
    assert.equal(strip.style.left, corners[i].endsWith('left') ? '4%' : 'auto')
    assert.equal(strip.style.right, corners[i].endsWith('right') ? '4%' : 'auto')
    assert.ok(Math.abs(Number(strip.style.opacity)) < 1e-8)
    assert.match(strip.style.transform, /10/)
    h.player.update(0.301); elapsed += 0.301
    assert.equal(Number(strip.style.opacity), 1)
    assert.equal(strip.style.transform, 'translateY(0px)')
  }
  h.player.cancel()
})

test('skip from newspaper, each panel, ripple, title and dissolve starts one short dissolve', async () => {
  for (const time of [0, ...narrationTimeline().map(entry => entry.start + 0.5), endBeats().ripple + 0.1, endBeats().title + 0.3, endBeats().dissolve + 0.2]) {
    const h = harness({ rain: true, whistle: true }); await h.player.prepare(); h.player.start(); h.player.update(time)
    const narration = h.nodes.filter(node => typeof node.buffer.id === 'number')
    const whistle = h.nodes.find(node => node.buffer.id === 'whistle')
    h.player.skip(); h.player.skip()
    assert.equal(h.player.isDissolving, true)
    assert.ok(narration.every(node => node.stopped))
    if (whistle) assert.equal(whistle.stopped, true)
    assert.equal(h.film.uniforms.uTitleOpacity.value, 0)
    h.player.update(0.599); assert.equal(h.stats.completes, 0)
    h.player.update(0.002); assert.equal(h.stats.completes, 1)
    assert.equal(h.stats.dissolveStarts, 1)
    assert.equal(h.stats.disposals, 11)
    assert.equal(h.body.children.length, 0)
  }
})

test('dissolve overlays one quad after the normal scene and restores renderer clear state', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  h.player.render(); assert.deepEqual(h.renderOrder, ['quad-clear'])
  h.player.skip(); h.renderOrder.push('game'); h.player.render()
  assert.deepEqual(h.renderOrder.slice(-2), ['game', 'quad-overlay'])
  assert.equal(h.renderer.autoClear, true)
  assert.equal(h.film.material.transparent, true)
  assert.match(h.film.material.fragmentShader, /smoothstep\(threshold - 0.025, threshold \+ 0.025, dissolveNoise\)/)
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /onDissolve\(\) \{[\s\S]*?beginForecourtArrival\(\)/)
  assert.match(main, /if \(storyPlayer\?\.isDissolving && arrival\) updateForecourtArrival\(delta\)/)
  h.player.cancel()
})

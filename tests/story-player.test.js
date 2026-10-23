import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { introBeat } from '../src/story/intro-beat.js'
import { createStoryPlayer, buildStoryTimeline, typewriterProgress } from '../src/ui/story-player.js'
import { createStoryFilm } from '../src/shaders/story-film.js'
import { resolveInputState } from '../src/core/input-state.js'

function harness({ locked = false, failed = false, delayed = false } = {}) {
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''
    appendChild(child) { this.children.push(child); child.parent = this }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) }
  }
  const keys = new EventTarget(), body = new Element(), pending = [], timers = new Map()
  let starts = [], stops = 0, completes = 0, disposals = 0, uploads = 0, renders = 0, compiled = 0
  const film = createStoryFilm()
  film.material.addEventListener('dispose', () => disposals++)
  film.geometry.addEventListener('dispose', () => disposals++)
  const ctx = { state: locked ? 'suspended' : 'running', createBufferSource() {
    return { connect() {}, disconnect() {}, start() { starts.push(this.buffer.id) }, stop() { stops++ } }
  } }
  const renderer = { initTexture(texture) { uploads++; texture.addEventListener('dispose', () => disposals++) }, compile() { compiled++ },
    getDrawingBufferSize(size) { size.set(1920, 1080) }, setRenderTarget() {}, render() { renders++ } }
  const player = createStoryPlayer({ beat: introBeat, renderer, film, doc: { body, createElement: () => new Element() }, keys,
    context: () => ctx, master: () => ({}), onComplete: () => completes++,
    loadImage: () => delayed ? new Promise(resolve => pending.push(() => resolve({ width: 1600, height: 900 }))) : Promise.resolve({ width: 1600, height: 900 }),
    loadAudio: async url => { if (failed) throw new Error('decode failed'); return { duration: 8, id: introBeat.audio.indexOf(url) } },
    setTimer(callback, ms) { timers.set(ms, callback); return ms }, clearTimer(id) { timers.delete(id) }
  })
  function key(type, repeat = false) {
    const event = new Event(type, { cancelable: true }); Object.assign(event, { code: 'Enter', repeat }); keys.dispatchEvent(event)
  }
  return { player, film, body, pending, timers, key,
    get stats() { return { starts, stops, completes, disposals, uploads, renders, compiled } } }
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
    h.player.update(37.59); assert.equal(h.player.active, true)
    h.player.update(0.02); assert.equal(h.stats.completes, 1)
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
  for (const time of [0, 0.4, 1, 8.9, 9.5, 11.3, 17.5, 18.5, 27, 35.5, 43.9, 44.9]) {
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
  h.key('keydown'); h.player.update(0.4); assert.equal(h.stats.completes, 1)
})

test('mouse start permits the first fresh Enter; repeats alone never skip', async () => {
  const h = harness(); await h.player.prepare(); h.player.start()
  h.key('keydown', true); h.player.update(1); assert.equal(h.player.active, true)
  h.key('keydown'); h.player.update(0.4); assert.equal(h.stats.completes, 1)
})

test('Enter released during the title fade permits the next fresh Enter', async () => {
  const h = harness(); await h.player.prepare()
  h.key('keydown'); h.key('keyup'); h.player.start()
  h.key('keydown'); h.player.update(0.4); assert.equal(h.stats.completes, 1)
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
  assert.equal(h.stats.uploads, 7); assert.equal(h.stats.compiled, 1)
  h.player.start(); h.player.render(); assert.equal(h.stats.renders, 1)
  h.player.cancel(); h.player.dispose()
  assert.equal(h.stats.disposals, 9); assert.equal(h.body.children.length, 0)
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
  assert.match(main, /if \(storyPlayer\?\.active\) \{ storyPlayer.render\(\); return \}/)
  assert.match(main, /if \(!storyPlayer\?\.active\) playMusicForState\(state\)/)
  const credits = fs.readFileSync(new URL('../src/ui/credits.js', import.meta.url), 'utf8')
  assert.ok(credits.includes('Story illustrations generated with ChatGPT (OpenAI)'))
  assert.ok(credits.includes('Narration voice generated with ElevenLabs (voice: David)'))
})

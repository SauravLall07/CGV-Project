import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three'
import { introBeat } from '../src/story/intro-beat.js'
import {
  l3TransitionBeat, L3_NARRATION_DELAY_S, L3_PANEL_HOLD_S, L3_LAST_PANEL_HOLD_S, L3_RUMBLE_GAIN,
  L3_PANEL_ZOOM, TREMOR_SHAKE, ROCK_SHAKE, ROCK_SHAKE_VERTICAL, RIPPLES, TREMOR_SHAKE_IN, L3_FIRST_LINE_DELAY_S, L3_SURGE_S, L3_REVEAL_FADE_S, L3_BLUE_MAX_S
} from '../src/story/l3-transition-beat.js'
import { createTransitionPlayer, buildTransitionTimeline, captionAt, envelope, shakeOffset } from '../src/ui/transition-player.js'
import { createStoryFilm, FX_NONE, RING_DISPLACE, WARP_DISPLACE, WARP_GHOST } from '../src/shaders/story-film.js'

// Measured from the recorded ElevenLabs clips.
const CLIPS = [6.269, 4.728, 7.001]
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`)

function harness({ failAudio = false } = {}) {
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''; offsetWidth = 1280
    appendChild(child) { this.children.push(child); child.parent = this; return child }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null }
  }
  const keys = new EventTarget(), body = new Element(), timers = new Map(), sources = [], gains = []
  keys.devicePixelRatio = 2; keys.innerWidth = 1920; keys.innerHeight = 1080
  let clock = 0, blacks = 0, builds = 0, prewarms = 0, reveals = 0, completes = 0, restores = 0, renders = 0, ready = false
  const param = value => ({ value, events: [],
    setValueAtTime(v, time) { this.value = v; this.events.push(['set', v, time]) },
    linearRampToValueAtTime(v, time) { this.events.push(['ramp', v, time]) },
    cancelScheduledValues(time) { this.events.push(['cancel', time]) } })
  const masterNode = { gain: param(0.7) }
  const ctx = { state: 'running', currentTime: 0, resume: () => Promise.resolve(),
    createGain() { const node = { gain: param(1), connect(target) { this.target = target }, disconnect() { this.disconnected = true } }; gains.push(node); return node },
    createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { this.target = target }, disconnect() {} } },
    createBufferSource() {
      const node = { connect(target) { this.target = target }, disconnect() { this.disconnected = true },
        start(when = 0) { this.started = true; this.when = when }, stop() { this.stopped = true } }
      sources.push(node); return node
    } }
  const viewport = new THREE.Vector4(0, 0, 1366, 768)
  const renderer = { autoClear: true, pixelRatio: 0.85, outputColorSpace: THREE.LinearSRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1,
    capabilities: { getMaxAnisotropy: () => 16 },
    getPixelRatio() { return this.pixelRatio }, setPixelRatio(value) { this.pixelRatio = value },
    getViewport(target) { return target.copy(viewport) }, setViewport(value) { viewport.copy(value) },
    initTexture() {}, compile() {}, getDrawingBufferSize(size) { size.set(1920, 1080) },
    setRenderTarget() {}, render() { renders++ } }
  const film = createStoryFilm()
  const audioUrls = l3TransitionBeat.panels.map(p => p.audio)
  const player = createTransitionPlayer({ beat: l3TransitionBeat, renderer, film,
    doc: { body, createElement: tag => { const el = new Element(); if (tag === 'canvas') el.getContext = () => ({ drawImage() {} }); return el } }, keys,
    context: () => ctx, master: () => masterNode,
    loadImage: async () => ({ width: 1672, height: 941 }),
    loadAudio: async url => {
      if (failAudio) throw new Error('decode failed')
      const i = audioUrls.indexOf(url)
      return { duration: i >= 0 ? CLIPS[i] : 7.54, id: i >= 0 ? `line${i + 1}` : 'rumble' }
    },
    isLevelReady: () => ready,
    onBlack: () => blacks++, onBuild: () => builds++, onPrewarm: () => prewarms++, onReveal: () => reveals++, onComplete: () => completes++, onRendererRestore: () => restores++,
    setTimer(callback, ms) { const id = Symbol(ms); timers.set(id, callback); return id }, clearTimer(id) { timers.delete(id) },
    now: () => clock })
  const step = (seconds, frame = 1 / 60) => { for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) { clock += frame * 1000; player.update(frame); player.render() } }
  const key = code => { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { code, repeat: false }); keys.dispatchEvent(event) }
  return { player, film, body, renderer, masterNode, sources, gains, timers, step, key,
    setReady(value) { ready = value },
    get stats() { return { blacks, builds, prewarms, reveals, completes, restores, renders } } }
}

test('L3 beat: three panels with the agreed images, lines, effects and exact captions', () => {
  const panels = l3TransitionBeat.panels
  assert.equal(panels.length, 3)
  assert.deepEqual(panels.map(p => p.image.split('/').pop()), ['l3-1-tremor.jpg', 'l3-2-rockslide.jpg', 'l3-3-timewarp.jpg'])
  assert.deepEqual(panels.map(p => p.audio.split('/').pop()), ['l3-1-tremor.mp3', 'l3-2-rockslide.mp3', 'l3-3-timewarp.mp3'])
  assert.deepEqual(panels.map(p => p.fx), ['tremor', 'rockslide', 'timewarp'])
  assert.deepEqual(panels.map(p => p.captions), [
    [{ at: 0, text: "Taking the Core shook more than Vane's empire." }, { at: 4.16, text: 'The whole valley felt it.' }],
    [{ at: 0, text: 'The mountain gave way.' }, { at: 1.92, text: 'The bridge ahead has no track left.' }],
    [{ at: 0, text: "Time's pulling the train apart." }, { at: 3.34, text: 'I have to reach the engine and stop it before the bridge does.' }]
  ])
  // Only the rockslide panel carries the rumble, at half the narration level.
  assert.deepEqual(panels.map(p => Boolean(p.sfx)), [false, true, false])
  assert.equal(panels[1].sfx.url.split('/').pop(), 'l3-rumble.mp3')
  assert.equal(panels[1].sfx.gain, L3_RUMBLE_GAIN)
  assert.equal(L3_RUMBLE_GAIN, 0.5)
  // Same narration bus as the intro, so the voice level matches.
  assert.equal(l3TransitionBeat.bus, introBeat.bus)
  // Captions use the intro's straight apostrophe.
  assert.ok(introBeat.panels.some(p => p.caption.includes("I'll")))
  assert.ok(panels.every(p => p.captions.every(c => !c.text.includes('’'))))
})

test('L3 beat: panel lengths follow the recorded lines (delay + clip + hold)', () => {
  const timeline = buildTransitionTimeline(l3TransitionBeat, CLIPS)
  near(timeline[0].start, 0)
  // Panel 1's line waits for the Level 2 → panel crossfade to finish.
  near(timeline[0].clipStart, L3_FIRST_LINE_DELAY_S)
  near(timeline[0].end, L3_FIRST_LINE_DELAY_S + CLIPS[0] + L3_PANEL_HOLD_S)
  near(timeline[1].end - timeline[1].start, L3_NARRATION_DELAY_S + CLIPS[1] + L3_PANEL_HOLD_S)
  near(timeline[2].end - timeline[2].start, L3_NARRATION_DELAY_S + CLIPS[2] + L3_LAST_PANEL_HOLD_S)
  near(timeline[1].start, timeline[0].end)
  near(timeline[2].clipStart, timeline[2].start + L3_NARRATION_DELAY_S)
  near(timeline[2].end, 22.998, 0.01)
  // A failed line still gives its panel a fixed length.
  const fallback = buildTransitionTimeline(l3TransitionBeat, [undefined, CLIPS[1], CLIPS[2]])
  near(fallback[0].clip, l3TransitionBeat.timings.fallbackClip)
})

test('L3 beat: captions switch at the measured pause in each line', () => {
  const panel = l3TransitionBeat.panels[0]
  assert.equal(captionAt(panel, CLIPS[0], 0).index, 0)
  assert.equal(captionAt(panel, CLIPS[0], 4.15).index, 0)
  const second = captionAt(panel, CLIPS[0], 4.5)
  assert.equal(second.index, 1)
  near(second.local, 4.5 - 4.16)
  near(second.spoken, CLIPS[0] - 4.16)
})

test('L3 effects: envelopes and shake stay bounded; panel 1 stays calm until "The whole valley felt it"', () => {
  assert.equal(envelope([[0, 0.1], [1, 0.5]], -1), 0.1)
  near(envelope([[0, 0.1], [1, 0.5]], 1), 0.5)
  for (let t = 0; t < 8; t += 0.01) {
    const s = shakeOffset(t, ROCK_SHAKE, ROCK_SHAKE_VERTICAL)
    assert.ok(Math.abs(s.x) <= ROCK_SHAKE + 1e-9 && Math.abs(s.y) <= ROCK_SHAKE * ROCK_SHAKE_VERTICAL + 1e-9)
  }
  // Smooth, not per-frame random: consecutive 60 fps frames move only a little.
  const a = shakeOffset(1, TREMOR_SHAKE), b = shakeOffset(1 + 1 / 60, TREMOR_SHAKE)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < TREMOR_SHAKE * 1.6)
  // Toned down twice at the user's request.
  assert.ok(TREMOR_SHAKE <= 0.0015 && ROCK_SHAKE <= 0.0035)
  // Effects start after the build window, on the second sentence of line 1.
  const timeline = buildTransitionTimeline(l3TransitionBeat, CLIPS)
  const secondSentence = timeline[0].clipStart + l3TransitionBeat.panels[0].captions[1].at
  assert.ok(Math.abs(RIPPLES[0].at - secondSentence) < 0.2 && Math.abs(TREMOR_SHAKE_IN[0] - secondSentence) < 0.2)
  assert.ok(RIPPLES.every(r => r.at + r.duration <= timeline[0].end + 1e-9))
  // Overscan: the zoomed panel always has more margin than the largest offset.
  const margin = (1 - 1 / L3_PANEL_ZOOM[0]) / 2
  const worstPan = Math.max(...l3TransitionBeat.panels.flatMap(p => p.pan.map(Math.abs)))
  const worstOffset = Math.max(ROCK_SHAKE * ROCK_SHAKE_VERTICAL, TREMOR_SHAKE + RING_DISPLACE, WARP_DISPLACE + WARP_GHOST)
  assert.ok(margin - worstPan > worstOffset, `margin ${margin - worstPan} > ${worstOffset}`)
  // Panel 1 is first shown as a CSS copy, so it must not pan.
  assert.deepEqual(l3TransitionBeat.panels[0].pan, [0, 0])
})

test('story film: effects default off, no glitch band, glowing cracks for the time warp', () => {
  const film = createStoryFilm()
  assert.equal(film.uniforms.uFx.value, FX_NONE)
  assert.ok(film.uniforms.uFxShake.value.equals(new THREE.Vector2(0, 0)))
  assert.equal(film.uniforms.uWarp.value, 0)
  assert.equal(film.uniforms.uDust.value, 0)
  assert.equal(film.uniforms.uSlip, undefined)
  const shader = film.material.fragmentShader
  assert.match(shader, /vec2 panelEffect\(vec2 uv\) \{\s*if \(uFx < 0\.5\) return uv;/)
  assert.match(shader, /vec3 panelEffectColor\(vec3 color, vec2 uv\) \{\s*if \(uFx < 0\.5\) return color;/)
  assert.doesNotMatch(shader, /uSlip/)
  assert.match(shader, /float halo = 0\.0;/)
  assert.match(shader, /float energy = 0\.5 \+ 0\.5 \* sin\(uTime/)
  film.dispose()
})

const timelineEnd = () => buildTransitionTimeline(l3TransitionBeat, CLIPS)
const find = (node, id) => node.id === id ? node : (node.children ?? []).map(child => find(child, id)).find(Boolean)

test('L3 player: Level 2 crossfades straight into the film’s panel 1; line 1 plays and Level 3 builds on a still panel', async () => {
  const h = harness()
  await h.player.prefetch()
  h.player.start()
  const root = h.body.children[0], strip = find(root, 'story-captions'), surge = find(root, 'story-surge')
  // No black and no page copy: the WebGL film itself fades in over Level 2.
  assert.equal(h.player.phase, 'fadeOut')
  assert.equal(h.player.showGame, true)
  assert.equal(h.player.liveGame, false)
  assert.equal(surge.style.opacity, '0')
  assert.ok(h.masterNode.gain.events.some(([type, value, time]) => type === 'ramp' && value === 0 && Math.abs(time - 0.8) < 1e-6))
  h.step(0.4)
  assert.ok(h.film.uniforms.uOpacity.value > 0.3 && h.film.uniforms.uOpacity.value < 0.7)
  assert.equal(h.renderer.pixelRatio, 0.85) // still at game resolution over the live frame
  h.step(0.45)
  // Crossfade done: full-resolution panel, music stopped, line 1 on the audio clock, build requested.
  assert.equal(h.player.phase, 'build')
  assert.equal(h.film.uniforms.uOpacity.value, 1)
  assert.equal(h.renderer.pixelRatio, 2)
  assert.equal(h.stats.blacks, 1)
  assert.equal(h.stats.builds, 1)
  near(h.masterNode.gain.value, 0.7)
  const line1 = h.sources.find(s => s.buffer.id === 'line1')
  assert.ok(line1?.started)
  assert.ok(line1.when > 0 && line1.when < 0.2, `scheduled ${line1.when}s ahead`)
  assert.equal(strip.style.visibility, 'visible')
  assert.match(strip.style.transition, /opacity 0\.3s linear 0\.\d+s/)
  // The panel holds still during the build, so a blocked frame shows no jump.
  const zoomDuringBuild = h.film.uniforms.uZoomB.value
  near(zoomDuringBuild, L3_PANEL_ZOOM[0])
  assert.equal(h.film.uniforms.uFx.value, 0)
  h.setReady(true)
  h.step(2.5, 2.5) // Level 3's constructor blocks for 2.5 s
  assert.equal(h.stats.prewarms, 1)
  assert.equal(h.player.phase, 'panels')
  h.step(1 / 60)
  assert.ok(h.film.uniforms.uZoomB.value - L3_PANEL_ZOOM[0] < 0.0002, 'zoom starts after the build, no jump')
  assert.equal(h.sources.filter(s => s.buffer.id === 'line1').length, 1) // not replayed
  assert.equal(h.film.uniforms.uRingA.value.y, 0) // calm until the second sentence
})

test('L3 player: a long Level 3 first frame never skips panel 1 — it waits, then gets its ring, and the rest moves back', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.85)
  h.step(7.5, 7.5) // build + first frame block for 7.5 s (≈ the user's laptop)
  assert.equal(h.player.phase, 'panels')
  assert.equal(h.stats.prewarms, 1)
  h.step(1 / 60) // first frame after the block: GPU still catching up
  h.step(2.4, 2.4) // a second stall
  // Still on panel 1, perfectly still, although its original end (8.07 s) has passed.
  h.step(1 / 60)
  assert.equal(h.film.uniforms.uTexB.value, h.film.uniforms.uTexA.value)
  assert.equal(h.film.uniforms.uFx.value, 0)
  near(h.film.uniforms.uZoomB.value, L3_PANEL_ZOOM[0])
  assert.equal(h.sources.filter(s => s.buffer.id === 'line2').length, 0)
  // Steady frames: panel 1 starts moving and its ring plays.
  h.step(4 / 60)
  h.step(0.6)
  assert.equal(h.film.uniforms.uFx.value, 1)
  assert.ok(h.film.uniforms.uRingA.value.y > 0, 'ring plays after the stall')
  assert.ok(h.film.uniforms.uZoomB.value > L3_PANEL_ZOOM[0])
  // Panel 2 (and line 2) come only after panel 1's effects have had their time.
  h.step(2.0)
  assert.equal(h.sources.filter(s => s.buffer.id === 'line2').length, 0)
  h.step(1.0)
  assert.equal(h.film.uniforms.uFx.value, 2)
  assert.equal(h.sources.filter(s => s.buffer.id === 'line2').length, 1)
})

test('L3 player: the safety timeout ignores the build time and counts from the first moving panel', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start()
  const [startTimeout] = [...h.timers.keys()].filter(id => id.description === String(l3TransitionBeat.timings.timeout * 2 * 1000))
  assert.ok(startTimeout, 'generous timeout while building')
  h.step(0.85); h.setReady(true); h.step(1 / 60)
  assert.equal(h.timers.has(startTimeout), false)
  assert.ok([...h.timers.keys()].some(id => id.description === String(l3TransitionBeat.timings.timeout * 1000)))
})

test('L3 player: three panels, then the cracks flood the screen blue, Level 3 settles under it and the blue clears', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.85); h.step(1 / 60)
  assert.equal(h.player.phase, 'panels')
  const timeline = timelineEnd(), end = timeline[2].end
  const surge = find(h.body.children[0], 'story-surge')
  h.step(5.6 - 0.87)
  assert.equal(h.film.uniforms.uFx.value, 1)
  assert.ok(h.film.uniforms.uRingA.value.y > 0) // ring on "The whole valley felt it"
  h.step(timeline[1].start + 0.6 - 5.6)
  const rumble = h.sources.find(s => s.buffer.id === 'rumble')
  assert.ok(rumble?.started)
  assert.equal(rumble.target.gain.value, 0.5)
  assert.equal(h.film.uniforms.uFx.value, 2)
  h.step(timeline[2].start + 1.2 - (timeline[1].start + 0.6))
  assert.ok(rumble.target.gain.events.some(([type, value]) => type === 'ramp' && value === 0))
  assert.equal(h.film.uniforms.uFx.value, 3)
  assert.ok(h.film.uniforms.uWarp.value > 0.9)
  assert.equal(h.sources.filter(s => s.buffer.id === 'line3').length, 1)
  // Surge: after line 3 the film itself floods blue and the cracks blaze.
  h.step(end - L3_SURGE_S + 0.05 - (timeline[2].start + 1.2))
  assert.equal(h.player.phase, 'surge')
  assert.equal(surge.style.opacity, '0') // page layer not involved yet
  assert.equal(h.player.showGame, false) // Level 3 not drawn yet: panel 3 stays smooth
  h.step(0.6)
  assert.ok(h.film.uniforms.uWarp.value > 1.5)
  assert.ok(h.film.uniforms.uSurge.value > 0.4 && h.film.uniforms.uSurge.value < 0.7)
  h.step(0.65)
  // Fully blue: Level 3 runs live underneath at game resolution; film stops drawing.
  assert.equal(h.player.phase, 'blue')
  assert.equal(surge.style.opacity, '1') // blue layer holds the frame
  assert.equal(h.player.showGame, true)
  assert.equal(h.player.liveGame, true)
  assert.equal(h.renderer.pixelRatio, 0.85)
  const renders = h.stats.renders
  // Level 3 may run slowly (100–200 ms frames are fine); only stalls hold the blue.
  h.player.recordFrame(400, true) // a stall resets the count
  for (let i = 0; i < 5; i++) h.player.recordFrame(i % 2 ? 180 : 110, true)
  h.step(0.6)
  assert.equal(h.stats.renders, renders)
  assert.equal(h.player.phase, 'blue')
  h.player.recordFrame(150, true)
  h.step(1 / 60)
  assert.equal(h.player.phase, 'reveal')
  assert.equal(h.stats.reveals, 1) // music comes in with the clearing blue
  assert.equal(surge.style.opacity, '0')
  assert.equal(surge.style.transform, 'scale(1.18)')
  assert.match(surge.style.transition, /opacity 1s ease-in, transform 1s ease-in/)
  h.step(L3_REVEAL_FADE_S + 0.05)
  assert.equal(h.stats.completes, 1)
  assert.equal(h.player.active, false)
  assert.equal(h.body.children.length, 0)
  assert.deepEqual(h.player.resources(), { listeners: 0, dom: 0, audioNodes: 0, textures: 0, masterFaded: false })
})

test('L3 player: the blue hold layer animates only opacity/transform, and snapshots the film peak', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start()
  const surge = find(h.body.children[0], 'story-surge')
  assert.match(surge.style.background, /^radial-gradient\(ellipse at 50% 52%, #dff5ff 0%.*#052238 100%\)$/)
  const style = surge.children.find(c => c.textContent?.includes('@keyframes'))
  for (const frames of style.textContent.match(/\{[^{}]*\}/g)) assert.doesNotMatch(frames, /(width|height|top|left|background|filter)\s*:/)
  assert.ok(surge.children.some(c => /l3-surge-core/.test(c.style.animation)))
  // With a real canvas, the frame is copied on the GPU (createImageBitmap →
  // 2D canvas) right after the peak is drawn: no readback or encode.
  const g = harness()
  const canvasEl = {}; g.renderer.domElement = canvasEl
  const captured = [], drawn = []
  const previous = globalThis.createImageBitmap
  globalThis.createImageBitmap = source => { captured.push(source); return Promise.resolve({ width: 1920, height: 1080, close() { this.closed = true } }) }
  try {
    await g.player.prefetch(); g.player.start(); g.setReady(true)
    g.step(0.85); g.step(1); g.key('Enter')
    const layer = find(g.body.children[0], 'story-surge')
    const frameCanvas = layer.children.find(c => c.getContext)
    frameCanvas.getContext = () => ({ drawImage(bitmap, x, y) { drawn.push([bitmap.width, x, y]) } })
    g.step(0.6)
    assert.deepEqual(captured, [canvasEl])
    await Promise.resolve(); await Promise.resolve()
    g.step(1 / 60)
    assert.deepEqual(drawn, [[1920, 0, 0]])
    assert.equal(frameCanvas.width, 1920)
    assert.equal(g.player.phase, 'blue')
    assert.match(frameCanvas.style.animation, /^l3-surge-pull /)
  } finally { globalThis.createImageBitmap = previous }
})

test('L3 player: Enter during panels fades the audio and goes straight to the blue surge', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.85); h.step(2)
  assert.equal(h.player.phase, 'panels')
  h.key('Enter')
  assert.equal(h.player.phase, 'surge')
  assert.ok(h.gains.some(g => g.gain.events.some(([type, value]) => type === 'ramp' && value === 0)), 'narration fades on skip')
  h.step(0.6)
  assert.equal(h.player.phase, 'blue')
  h.key('Enter') // ignored on the way out
  for (let i = 0; i < 6; i++) h.player.recordFrame(120, true)
  h.step(1 / 60)
  assert.equal(h.player.phase, 'blue') // keeps the blue at least briefly
  h.step(0.4)
  assert.equal(h.player.phase, 'reveal')
  h.step(1.05)
  assert.equal(h.stats.completes, 1)
})

test('L3 player: the blue never holds longer than its maximum', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.85); h.step(1); h.key('Enter'); h.step(0.6)
  assert.equal(h.player.phase, 'blue')
  h.step(L3_BLUE_MAX_S - 0.1)
  assert.equal(h.player.phase, 'blue')
  h.step(0.15)
  assert.equal(h.player.phase, 'reveal')
})

test('L3 player: Enter while Level 3 builds, or during the crossfade, skips the panels', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start()
  h.step(0.85)
  assert.equal(h.player.phase, 'build')
  h.key('Enter')
  h.setReady(true); h.step(1 / 60)
  assert.equal(h.player.phase, 'surge')
  assert.equal(h.stats.prewarms, 1)

  const early = harness()
  await early.player.prefetch(); early.player.start()
  early.step(0.3); early.key('Enter'); early.step(0.6)
  assert.equal(early.player.phase, 'build')
  assert.equal(early.stats.builds, 1)
  assert.equal(early.sources.length, 0) // no narration queued after a skip
  early.setReady(true); early.step(1 / 60)
  assert.equal(early.player.phase, 'surge')
})

test('L3 player: cancel restores the master volume and removes everything', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start()
  h.step(0.3)
  assert.equal(h.player.resources().masterFaded, true)
  h.player.cancel()
  near(h.masterNode.gain.value, 0.7)
  assert.equal(h.body.children.length, 0)
  assert.equal(h.player.active, false)
  assert.equal(h.stats.completes, 0)
})

test('L3 player: missing audio still plays the panels on fallback timing', async () => {
  const h = harness({ failAudio: true })
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.85); h.step(1 / 60)
  assert.equal(h.player.phase, 'panels')
  const end = buildTransitionTimeline(l3TransitionBeat, [undefined, undefined, undefined])[2].end
  near(end, L3_FIRST_LINE_DELAY_S + 5 + 0.9 + (0.5 + 5 + 0.9) + (0.5 + 5 + 1.3))
  // Panel 1's ring (at 5.0 s) must get its full time, so the shorter fallback
  // panel 1 is lengthened by the difference.
  const extra = Math.max(0, RIPPLES[0].at + l3TransitionBeat.timings.panel1FxMin - (L3_FIRST_LINE_DELAY_S + 5 + 0.9))
  h.step(end + extra - L3_SURGE_S - (0.85 + 1 / 60) - 0.1)
  assert.equal(h.player.phase, 'panels')
  h.step(0.15)
  assert.equal(h.player.phase, 'surge')
  assert.equal(h.sources.length, 0)
})

test('main.js: Level 2 ending plays the beat, builds Level 3 on panel 1 without the loading overlay, and hands back', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '')
  // No level/core edits: Level 2's own advance() is redirected from here.
  assert.match(main, /createMovingHeistLevel\(\{ \.\.\.ctx, post, advance: beginLevel3Transition \}\)/)
  const section = main.slice(main.indexOf('function prepareLevel3Transition()'), main.indexOf('// Quit to title'))
  assert.match(section, /onBlack\(\) \{[\s\S]*stopLevelMusic\(\)[\s\S]*disposeGameplayDrone\(\)[\s\S]*\},\s*onBuild\(\) \{[\s\S]*levelManager\.advance\(\)/)
  // A real Level 3 frame through the game's pipeline, every texture and object, not a bare compile.
  assert.match(section, /onPrewarm\(\) \{[\s\S]*updateGameFrame\(0, true\)[\s\S]*node\.frustumCulled = false[\s\S]*renderer\.initTexture\(texture\)[\s\S]*post\.render\(scene, camera, \{ antialias: true \}\)[\s\S]*node\.frustumCulled = true/)
  assert.doesNotMatch(section, /renderer\.compile\(/)
  // Level 3's music is decoded in the background before the reveal.
  assert.match(section, /onBuild\(\) \{[\s\S]*levelManager\.advance\(\)[\s\S]*new LevelMusicPlayer\(loadTrack\(LEVEL_TRACKS\.Timewreck\.file\)\)[\s\S]*music\.load\(\)/)
  assert.match(section, /isLevelReady: \(\) => levelManager\.getState\(\) === 'Timewreck' && !levelManager\.isTransitioning\(\)/)
  assert.match(section, /onReveal\(\) \{[\s\S]*playMusicForState\(levelManager\.getState\(\)\)/)
  assert.match(section, /onComplete\(\) \{[\s\S]*storyPlayer = null[\s\S]*hud\.setVisible\(true\)[\s\S]*syncInputState\(\)/)
  // The loading overlay is suppressed only for this build; errors still show.
  assert.match(section, /onBuild\(\) \{[\s\S]*quietLevelLoad = true[\s\S]*levelManager\.advance\(\)/)
  assert.match(main, /loadingScreen: levelLoadingScreen,/)
  assert.match(main, /show\(\) \{ if \(!quietLevelLoad\) loadingScreen\.show\(\) \}/)
  assert.match(main, /setError\(\) \{ quietLevelLoad = false; loadingScreen\.show\(\); loadingScreen\.setError\?\.\(\) \}/)
  // Ending's module/paintings wait until the beat is over.
  assert.match(main, /state: 'Ending', load: \(\) => afterStoryBeat\(\)\.then\(\(\) => import\('\.\/levels\/ending\.js'\)\)/)
  // Occupies the intro's slot: pause, input, music and minimap gating follow.
  assert.match(section, /storyPlayer = owner\s*\n\s*hud\.setVisible\(false\)\s*\n\s*owner\.start\(\)/)
  assert.match(main, /canPause: \(\) => gameStarted && !storyPlayer\?\.active/)
  assert.match(main, /if \(storyPlayer\?\.showGame && storyPlayer\.liveGame !== false\) ranFullGameFrame = updateGameFrame\(delta, true\)/)
  // Level 3 under the blue is drawn with the same anti-aliasing as gameplay.
  assert.match(main, /if \(storyPlayer\.showGame\) \{[\s\S]*?post\.render\(world, view, \{ antialias: levelManager\.getState\?\.\(\) === 'Timewreck' \}\)/)
  assert.match(main, /onLeave: \(\) => \{\s*stopLevelMusic\(\)\s*releaseIdleLevel3Transition\(\)/)
  assert.match(main, /if \(target === 'l3cut'\) return \{ state: 'MovingHeist', levelOptions: \{ startAt: 'vault' \}, cutscene: 'l3' \}/)
  const credits = fs.readFileSync(new URL('../src/ui/credits.js', import.meta.url), 'utf8')
  assert.ok(credits.includes('Rockslide rumble sound generated with ElevenLabs (elevenlabs.io)'))
})

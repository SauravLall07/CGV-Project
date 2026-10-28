import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three'
import { introBeat } from '../src/story/intro-beat.js'
import {
  l3TransitionBeat, L3_NARRATION_DELAY_S, L3_PANEL_HOLD_S, L3_LAST_PANEL_HOLD_S, L3_RUMBLE_GAIN,
  L3_PANEL_ZOOM, TREMOR_SHAKE, ROCK_SHAKE, ROCK_SHAKE_VERTICAL, RIPPLES, SLIP_MIN_Y, SLIP_DURATION_S
} from '../src/story/l3-transition-beat.js'
import { createTransitionPlayer, buildTransitionTimeline, captionAt, envelope, shakeOffset, slipSchedule } from '../src/ui/transition-player.js'
import { createStoryFilm, FX_NONE, RING_DISPLACE, WARP_DISPLACE, WARP_GHOST, SLIP_OFFSET } from '../src/shaders/story-film.js'

// Measured from the recorded ElevenLabs clips.
const CLIPS = [6.269, 4.728, 7.001]
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`)

function harness({ failAudio = false } = {}) {
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''
    appendChild(child) { this.children.push(child); child.parent = this; return child }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null }
  }
  const keys = new EventTarget(), body = new Element(), timers = new Map(), sources = [], gains = []
  keys.devicePixelRatio = 2; keys.innerWidth = 1920; keys.innerHeight = 1080
  let clock = 0, blacks = 0, completes = 0, restores = 0, renders = 0, ready = false
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
        start() { this.started = true }, stop() { this.stopped = true } }
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
    doc: { body, createElement: () => new Element() }, keys,
    context: () => ctx, master: () => masterNode,
    loadImage: async () => ({ width: 1672, height: 941 }),
    loadAudio: async url => {
      if (failAudio) throw new Error('decode failed')
      const i = audioUrls.indexOf(url)
      return { duration: i >= 0 ? CLIPS[i] : 7.54, id: i >= 0 ? `line${i + 1}` : 'rumble' }
    },
    isLevelReady: () => ready,
    onBlack: () => blacks++, onComplete: () => completes++, onRendererRestore: () => restores++,
    setTimer(callback, ms) { const id = Symbol(ms); timers.set(id, callback); return id }, clearTimer(id) { timers.delete(id) },
    now: () => clock })
  const step = (seconds, frame = 1 / 60) => { for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) { clock += frame * 1000; player.update(frame); player.render() } }
  const key = code => { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { code, repeat: false }); keys.dispatchEvent(event) }
  return { player, film, body, renderer, masterNode, sources, gains, timers, step, key,
    setReady(value) { ready = value },
    get stats() { return { blacks, completes, restores, renders } } }
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
  near(timeline[0].end, L3_NARRATION_DELAY_S + CLIPS[0] + L3_PANEL_HOLD_S)
  near(timeline[1].end - timeline[1].start, L3_NARRATION_DELAY_S + CLIPS[1] + L3_PANEL_HOLD_S)
  near(timeline[2].end - timeline[2].start, L3_NARRATION_DELAY_S + CLIPS[2] + L3_LAST_PANEL_HOLD_S)
  near(timeline[1].start, timeline[0].end)
  near(timeline[2].clipStart, timeline[2].start + L3_NARRATION_DELAY_S)
  near(timeline[2].end, 22.598, 0.01)
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

test('L3 effects: envelopes, shake and slips stay bounded and out of the subtitles', () => {
  assert.equal(envelope([[0, 0.1], [1, 0.5]], -1), 0.1)
  near(envelope([[0, 0.1], [1, 0.5]], 1), 0.5)
  for (let t = 0; t < 8; t += 0.01) {
    const s = shakeOffset(t, ROCK_SHAKE, ROCK_SHAKE_VERTICAL)
    assert.ok(Math.abs(s.x) <= ROCK_SHAKE + 1e-9 && Math.abs(s.y) <= ROCK_SHAKE * ROCK_SHAKE_VERTICAL + 1e-9)
  }
  // Smooth, not per-frame random: consecutive 60 fps frames move only a little.
  const a = shakeOffset(1, TREMOR_SHAKE), b = shakeOffset(1 + 1 / 60, TREMOR_SHAKE)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < TREMOR_SHAKE * 1.6)
  const slips = slipSchedule(8.8)
  assert.deepEqual(slips, slipSchedule(8.8))
  assert.ok(slips.length >= 3)
  for (let i = 0; i < slips.length; i++) {
    assert.ok(slips[i].y >= SLIP_MIN_Y && slips[i].y + slips[i].height <= 0.9 + 1e-9)
    if (i) assert.ok(slips[i].at - slips[i - 1].at >= 1.8 - 1e-9 && slips[i].at - slips[i - 1].at <= 2.6 + 1e-9)
    assert.ok(slips[i].at + SLIP_DURATION_S <= 8.8)
  }
  // Overscan: the zoomed panel always has more margin than the largest offset.
  const margin = (1 - 1 / L3_PANEL_ZOOM[0]) / 2
  const worstPan = Math.max(...l3TransitionBeat.panels.flatMap(p => p.pan.map(Math.abs)))
  const worstOffset = Math.max(ROCK_SHAKE * ROCK_SHAKE_VERTICAL, TREMOR_SHAKE + RING_DISPLACE, WARP_DISPLACE + WARP_GHOST + SLIP_OFFSET)
  assert.ok(margin - worstPan > worstOffset, `margin ${margin - worstPan} > ${worstOffset}`)
  assert.equal(RIPPLES[1].at, 4.6)
})

test('story film: effects default off, so the intro renders exactly as before', () => {
  const film = createStoryFilm()
  assert.equal(film.uniforms.uFx.value, FX_NONE)
  assert.ok(film.uniforms.uFxShake.value.equals(new THREE.Vector2(0, 0)))
  assert.equal(film.uniforms.uWarp.value, 0)
  assert.equal(film.uniforms.uDust.value, 0)
  const shader = film.material.fragmentShader
  assert.match(shader, /vec2 panelEffect\(vec2 uv\) \{\s*if \(uFx < 0\.5\) return uv;/)
  assert.match(shader, /vec3 panelEffectColor\(vec3 color, vec2 uv\) \{\s*if \(uFx < 0\.5\) return color;/)
  assert.match(shader, /if \(uDust > 0\.0\)/)
  film.dispose()
})

test('L3 player: fade out, build under black, three panels, darken, warm, reveal, clean hand-back', async () => {
  const h = harness()
  await h.player.prefetch()
  h.player.start()
  assert.equal(h.player.phase, 'fadeOut')
  assert.equal(h.player.showGame, true)
  assert.equal(h.player.liveGame, false)
  // Master (music + drone) fades out with the picture.
  assert.ok(h.masterNode.gain.events.some(([type, value, time]) => type === 'ramp' && value === 0 && Math.abs(time - 0.8) < 1e-6))
  h.step(0.85)
  assert.equal(h.player.phase, 'build')
  assert.equal(h.stats.blacks, 1)
  near(h.masterNode.gain.value, 0.7)
  assert.equal(h.player.resources().masterFaded, false)
  const root = h.body.children[0]
  assert.equal(root.style.zIndex, '11000')
  assert.equal(root.children[0].style.display, 'block') // covers the loading screen
  h.step(1)
  assert.equal(h.player.phase, 'build') // waits for Level 3
  h.setReady(true)
  h.step(1 / 60)
  assert.equal(h.player.phase, 'panels')
  assert.equal(h.player.showGame, false)
  assert.equal(root.children[0].style.display, 'none')
  assert.equal(h.renderer.pixelRatio, 2)
  // Line 1 starts after the narration delay.
  h.step(0.4)
  assert.equal(h.sources.length, 0)
  h.step(0.2)
  assert.equal(h.sources.filter(s => s.buffer.id === 'line1').length, 1)
  assert.equal(h.film.uniforms.uFx.value, 1)
  const timeline = buildTransitionTimeline(l3TransitionBeat, CLIPS)
  // Panel 2: line 2 and the rumble at half level.
  h.step(timeline[1].start - 0.6 + 0.6)
  const rumble = h.sources.find(s => s.buffer.id === 'rumble')
  assert.ok(rumble?.started)
  assert.equal(rumble.target.gain.value, 0.5)
  assert.equal(h.film.uniforms.uFx.value, 2)
  assert.ok(h.film.uniforms.uDust.value > 0)
  assert.equal(h.sources.filter(s => s.buffer.id === 'line2').length, 1)
  // Panel 3: rumble fades out over 0.6 s, time-warp effect on.
  h.step(timeline[2].start - timeline[1].start + 0.1)
  assert.ok(rumble.target.gain.events.some(([type, value]) => type === 'ramp' && value === 0))
  assert.equal(h.film.uniforms.uFx.value, 3)
  h.step(1.2)
  assert.ok(h.film.uniforms.uWarp.value > 0.9)
  assert.equal(h.sources.filter(s => s.buffer.id === 'line3').length, 1)
  // End: darken, then warm over the live level at game resolution.
  // Panel 3 is now 1.9 s in (0.7 + 1.2).
  h.step(timeline[2].end - timeline[2].start - 1.9 + 0.05)
  assert.equal(h.player.phase, 'darken')
  h.step(1.05)
  assert.equal(h.player.phase, 'warm')
  assert.equal(h.renderer.pixelRatio, 0.85)
  assert.equal(h.stats.restores, 1)
  assert.equal(h.player.liveGame, true)
  assert.equal(h.film.uniforms.uFx.value, 0)
  for (let i = 0; i < 19; i++) h.player.recordFrame(16, true)
  h.player.recordFrame(50, true) // a slow frame resets the count
  h.step(1 / 60)
  assert.equal(h.player.phase, 'warm')
  for (let i = 0; i < 20; i++) h.player.recordFrame(16, true)
  h.step(1 / 60)
  assert.equal(h.player.phase, 'reveal')
  h.step(0.85)
  assert.equal(h.stats.completes, 1)
  assert.equal(h.player.active, false)
  assert.equal(h.body.children.length, 0)
  assert.deepEqual(h.player.resources(), { listeners: 0, dom: 0, audioNodes: 0, textures: 0, masterFaded: false })
  assert.equal(h.stats.blacks, 1)
})

test('L3 player: warm never waits longer than its maximum', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.9); h.key('Enter'); h.step(0.5)
  assert.equal(h.player.phase, 'warm')
  h.step(5.1)
  assert.equal(h.player.phase, 'reveal')
})

test('L3 player: Enter during panels fades audio, darkens quickly and goes straight to Level 3', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start(); h.setReady(true)
  h.step(0.9 + 2)
  assert.equal(h.player.phase, 'panels')
  h.key('Enter')
  assert.equal(h.player.phase, 'darken')
  const narration = h.gains.find(g => g.target && g.target.target && g.gain.value === 1 && g.gain.events.some(([type, value]) => type === 'ramp' && value === 0))
  assert.ok(narration, 'narration fades on skip')
  h.step(0.45)
  assert.equal(h.player.phase, 'warm')
  h.key('Enter') // ignored on the way out
  h.step(5.1); h.step(0.85)
  assert.equal(h.stats.completes, 1)
})

test('L3 player: Enter while Level 3 is still building skips the panels entirely', async () => {
  const h = harness()
  await h.player.prefetch(); h.player.start()
  h.step(0.9)
  h.key('Enter')
  h.setReady(true); h.step(1 / 60)
  assert.equal(h.player.phase, 'warm')
  assert.equal(h.sources.length, 0)
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
  h.step(0.9)
  assert.equal(h.player.phase, 'panels')
  h.step(3 * (0.5 + 5 + 0.9) + 0.6)
  assert.equal(h.player.phase, 'darken')
  assert.equal(h.sources.length, 0)
})

test('main.js: Level 2 ending plays the beat, which builds Level 3 under black and hands back', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('\r', '')
  // No level/core edits: Level 2's own advance() is redirected from here.
  assert.match(main, /createMovingHeistLevel\(\{ \.\.\.ctx, post, advance: beginLevel3Transition \}\)/)
  const section = main.slice(main.indexOf('function prepareLevel3Transition()'), main.indexOf('// Quit to title'))
  assert.match(section, /onBlack\(\) \{[\s\S]*stopLevelMusic\(\)[\s\S]*disposeGameplayDrone\(\)[\s\S]*levelManager\.advance\(\)/)
  assert.match(section, /isLevelReady: \(\) => levelManager\.getState\(\) === 'Timewreck' && !levelManager\.isTransitioning\(\)/)
  assert.match(section, /onComplete\(\) \{[\s\S]*storyPlayer = null[\s\S]*playMusicForState\(levelManager\.getState\(\)\)[\s\S]*hud\.setVisible\(true\)[\s\S]*syncInputState\(\)/)
  // Occupies the intro's slot: pause, input, music and minimap gating follow.
  assert.match(section, /storyPlayer = owner\s*\n\s*hud\.setVisible\(false\)\s*\n\s*owner\.start\(\)/)
  assert.match(main, /canPause: \(\) => gameStarted && !storyPlayer\?\.active/)
  assert.match(main, /if \(storyPlayer\?\.showGame && storyPlayer\.liveGame !== false\) ranFullGameFrame = updateGameFrame\(delta, true\)/)
  assert.match(main, /onLeave: \(\) => \{\s*stopLevelMusic\(\)\s*releaseIdleLevel3Transition\(\)/)
  assert.match(main, /if \(target === 'l3cut'\) return \{ state: 'MovingHeist', levelOptions: \{ startAt: 'vault' \}, cutscene: 'l3' \}/)
  const credits = fs.readFileSync(new URL('../src/ui/credits.js', import.meta.url), 'utf8')
  assert.ok(credits.includes('Rockslide rumble sound generated with ElevenLabs (elevenlabs.io)'))
})

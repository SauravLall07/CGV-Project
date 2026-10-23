import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three'
import { createTitleBackdrop } from '../src/ui/title-backdrop.js'
import { MENU_FILM, PLUME_FLOW_STRENGTH } from '../src/shaders/menu-film.js'

test('illustrated title owns exactly one quad, every animation uniform and its independent resources', async () => {
  const viewport = new THREE.Vector4(3, 4, 1366, 768), original = viewport.clone()
  let draws = 0, restores = 0, disposals = 0
  const renderer = { ratio: 0.85, outputColorSpace: THREE.LinearSRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2, autoClear: true,
    capabilities: { getMaxAnisotropy: () => 16 },
    getViewport: target => target.copy(viewport), setViewport: value => viewport.copy(value),
    getPixelRatio() { return this.ratio }, setPixelRatio(value) { this.ratio = value; viewport.set(0, 0, 1920, 1080) },
    getDrawingBufferSize: target => target.set(1920, 1080), initTexture() {}, compile() {}, setRenderTarget() {},
    render(scene) { assert.equal(scene.children.length, 1); assert.equal(scene.children[0].isMesh, true); draws++ } }
  const image = { width: 1920, height: 1080 }, keys = { devicePixelRatio: 2.5 }
  const title = await createTitleBackdrop({ renderer, keys, loadImage: async () => image, onRendererRestore: () => restores++ })
  assert.equal(renderer.ratio, 0.85, 'preparation does not change game rendering')
  for (const resource of [title.material, title.texture, title.geometry]) resource.addEventListener('dispose', () => disposals++)
  assert.equal(title.scene.children.length, 1); assert.equal(title.material.toneMapped, false)
  assert.equal(title.texture.image, image); assert.equal(title.texture.colorSpace, THREE.SRGBColorSpace)
  assert.equal(title.texture.generateMipmaps, false); assert.equal(title.texture.minFilter, THREE.LinearFilter)
  assert.equal(title.texture.anisotropy, 16)
  for (const [key, value] of Object.entries(MENU_FILM)) {
    const name = `u${key[0].toUpperCase()}${key.slice(1)}`
    assert.ok(title.uniforms[name], key)
    assert.ok(title.material.fragmentShader.includes(name), key + ' is driven in shader')
    assert.deepEqual(Array.isArray(value) ? title.uniforms[name].value.toArray() : title.uniforms[name].value, value)
  }
  assert.deepEqual(MENU_FILM.plume, [0.08, 0.22, 0.84, 0.50])
  assert.equal(PLUME_FLOW_STRENGTH, 0.020)
  assert.equal(title.uniforms.uPlumeFlowStrength.value, PLUME_FLOW_STRENGTH)
  assert.equal(title.uniforms.uPlumeBrightness.value, 0.14)
  assert.equal(title.uniforms.uPlumeSpeedA.value, 0.010)
  assert.equal(title.uniforms.uPlumeSpeedB.value, 0.017)
  assert.equal(title.uniforms.uPlumeSpeedLarge.value, 0.006)
  assert.equal(title.uniforms.uPlumeLargeCycles.value, 3)
  assert.equal(title.uniforms.uPlumeLargeWeight.value, 0.65)
  assert.equal(title.uniforms.uPlumeMinStrength.value, 0.85)
  assert.equal(title.uniforms.uPlumeMaxStrength.value, 1)
  assert.deepEqual(title.uniforms.uPlumeLuminance.value.toArray(), [0.45, 0.75])
  assert.deepEqual(title.uniforms.uPlumeLuminanceWeights.value.toArray(), [0.2126, 0.7152, 0.0722])
  assert.match(title.material.fragmentShader, /mix\(mix\(flowA,flowB,phase\),flowLarge,uPlumeLargeWeight\)/)
  assert.match(title.material.fragmentShader, /uTime\*uPlumeSpeedLarge/)
  assert.match(title.material.fragmentShader, /uPlumeLargeCycles\/\(uPlume.z-uPlume.x\)/)
  assert.match(title.material.fragmentShader, /float luminance=dot\(original,uPlumeLuminanceWeights\)/)
  assert.match(title.material.fragmentShader, /float smoke=smoothstep\(uPlumeLuminance.x,uPlumeLuminance.y,luminance\)/)
  assert.match(title.material.fragmentShader, /float plume=region\(p,uPlume\)\*smoke/)
  assert.match(title.material.fragmentShader, /q=clamp\(q,vec2\(0\.\),vec2\(1\.\)\)/)
  assert.match(title.material.fragmentShader, /uPlumeFlowStrength\*plume\*turbulence/)
  assert.match(title.material.fragmentShader, /flow\/=max\(1\.,length\(flow\)\)/)
  assert.doesNotMatch(title.material.fragmentShader, /uFunnel|uPuff|float puff|float age/)
  assert.ok(Object.keys(MENU_FILM).every(key => !/funnel|puff/i.test(key)))
  assert.deepEqual(MENU_FILM.moon, [0.915, 0.13, 0.04])
  assert.deepEqual(MENU_FILM.mist, [0.22, 0.55, 0.80, 0.80])
  assert.match(title.material.fragmentShader, /i<3/)
  assert.match(title.material.fragmentShader, /min\(1\.,aspect\/ia\)/)
  assert.match(title.material.fragmentShader, /vec2\(p.x,1\.-p.y\)/)
  assert.doesNotMatch(title.material.fragmentShader, /uRain|rainUv/)
  const resolution = title.uniforms.uResolution.value, children = [...title.scene.children]
  title.show(); assert.equal(renderer.ratio, 2); assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace)
  for (let i = 0; i < 10000; i++) title.update(1 / 60)
  assert.equal(title.uniforms.uResolution.value, resolution); assert.deepEqual(title.scene.children, children)
  renderer.ratio = 0.5; title.render(); assert.equal(renderer.ratio, 2); assert.equal(draws, 1)
  title.hide(); assert.equal(renderer.ratio, 0.85); assert.deepEqual(viewport, original)
  assert.equal(renderer.outputColorSpace, THREE.LinearSRGBColorSpace)
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(renderer.toneMappingExposure, 1.2)
  assert.equal(renderer.autoClear, true); assert.equal(restores, 1)
  keys.devicePixelRatio = 1.5; title.show(); assert.equal(renderer.ratio, 1.5)
  title.dispose(); title.dispose(); title.update(1); title.render()
  assert.equal(renderer.ratio, 0.85); assert.equal(restores, 2); assert.equal(disposals, 3)
  assert.equal(title.scene.children.length, 0); assert.equal(draws, 1)
})

test('plume mask follows cover-fit image coordinates and keeps at least 85 percent strength across its full width', async () => {
  const renderer = { capabilities: { getMaxAnisotropy: () => 1 }, initTexture() {}, compile() {} }
  const title = await createTitleBackdrop({ renderer, keys: {}, loadImage: async () => ({ width: 1920, height: 1080 }) })
  try {
    const shader = title.material.fragmentShader
    const crop = shader.indexOf('vec2 p=(vec2(vUv.x,1.-vUv.y)-.5)*fit/zoom+.5;')
    assert.ok(crop >= 0)
    assert.ok(shader.indexOf('vec3 original=image(p)') > crop)
    assert.ok(shader.indexOf('float plume=region(p,uPlume)*smoke') > shader.indexOf('float luminance=dot(original'))
    assert.doesNotMatch(shader, /region\(vUv,uPlume\)/)
    const mix = (a, b, t) => a + (b - a) * t
    const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
    const expression = shader.match(/float turbulence=([^;]+);/)[1]
    const strength = new Function('p', 'uPlume', 'uPlumeMinStrength', 'uPlumeMaxStrength', 'mix', 'smoothstep', `return ${expression}`)
    const [left, top, right, bottom] = MENU_FILM.plume, region = { x: left, y: top, z: right, w: bottom }
    for (let i = 0; i <= 100; i++) {
      const value = strength({ x: mix(left, right, i / 100) }, region, MENU_FILM.plumeMinStrength, MENU_FILM.plumeMaxStrength, mix, smoothstep)
      assert.ok(value >= 0.85 && value <= 1, `plume width sample ${i}: ${value}`)
    }
    assert.equal(smoothstep(...MENU_FILM.plumeLuminance, 0.4), 0)
    assert.equal(smoothstep(...MENU_FILM.plumeLuminance, 0.8), 1)
    // Soft region edges and the luminance mask multiply the displacement,
    // separately from the full-width strength envelope checked above.
    assert.match(shader, /r.xy-vec2\(uMaskSoftness\),r.xy\+vec2\(uMaskSoftness\)/)
    assert.match(shader, /uPlumeFlowStrength\*plume\*turbulence/)
  } finally { title.dispose() }
})

test('actual title preparation waits for decoded assets, builds once, warms before creating the illustration', async () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replaceAll('import.meta.env?.DEV', 'false')
  const start = source.indexOf('async function buildTitleBackdrop()'), end = source.indexOf('const settingsMenu', start)
  const calls = [], pending = []
  const wait = name => new Promise(resolve => pending.push(() => { calls.push(name); resolve() }))
  const prepared = { checkpoint: { position: new THREE.Vector3(), yaw: 0, pitch: 0 } }
  const deps = { scene: {}, interaction: {}, assets: {}, hud: { setVisible() {} }, player: { mesh: {}, setPose() {} },
    playerView: { setYaw() {}, setPitch() {}, snap() {}, update() {} }, camera: {}, respawn: {}, timeSystem: { warmGhost() {} }, renderer: {},
    levelManager: {}, post: {}, syncInputState() {}, charactersReady: wait('characters'),
    prepareIntro: () => wait('intro'), loadBoardingAssets: () => wait('files'),
    createBoardingLevel: () => { calls.push('build'); return prepared },
    warmLevel1: () => calls.push('warm'), prefetchBoardingMusic: () => Promise.resolve(), createTitleBackdrop: () => { calls.push('illustration'); return {} } }
  const run = new Function('deps', `const {${Object.keys(deps).join(',')}}=deps;
    let introReady,boardingFilesReady,preparedBoarding;
    ${source.slice(start, end)}
    return {buildTitleBackdrop,get prepared(){return preparedBoarding}};`)(deps)
  const ready = run.buildTitleBackdrop()
  assert.deepEqual(calls, [])
  pending.shift()(); pending.shift()(); await Promise.resolve(); assert.equal(calls.includes('build'), false)
  pending.shift()(); await ready
  assert.deepEqual(calls, ['characters', 'intro', 'files', 'build', 'warm', 'illustration'])
  assert.equal(run.prepared, prepared)
  const game = source.slice(source.indexOf('function startGame()'), source.indexOf('// Dev builds only:'))
  assert.match(game, /levelManager.adopt\('Boarding', boarding\)/)
  assert.doesNotMatch(game, /await |Promise.all|enter\('Boarding'\)|createBoardingLevel/)
  assert.ok(game.indexOf('adopt(') < game.indexOf('startPreparedIntro()'))
})

test('menu New Game unlocks and invokes the prepared intro inside the gesture, once', () => {
  const source = fs.readFileSync(new URL('../src/ui/main-menu.js', import.meta.url), 'utf8')
  const start = source.indexOf('function handleStart()'), end = source.indexOf("newGameBtn.addEventListener", start)
  const calls = []
  const handler = new Function('calls', `let isVisible=true,isTransitioning=false;
    const settingsMenu=null,isCreditsOpen=()=>false,unlockAudio=()=>calls.push('unlock');
    const hide=()=>calls.push('hide'),onStartCallback=()=>calls.push('intro');
    ${source.slice(start, end)} return handleStart;`)(calls)
  handler(); handler()
  assert.deepEqual(calls, ['unlock', 'hide', 'intro'])
})

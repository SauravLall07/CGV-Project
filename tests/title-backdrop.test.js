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
  assert.deepEqual(MENU_FILM.plume, [0.17, 0.29, 0.80, 0.47])
  assert.equal(PLUME_FLOW_STRENGTH, 0.010)
  assert.equal(title.uniforms.uPlumeFlowStrength.value, PLUME_FLOW_STRENGTH)
  assert.equal(title.uniforms.uPlumeBrightness.value, 0.10)
  assert.equal(title.uniforms.uPlumeSpeedA.value, 0.010)
  assert.equal(title.uniforms.uPlumeSpeedB.value, 0.017)
  assert.match(title.material.fragmentShader, /mix\(flowA,flowB,phase\)/)
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

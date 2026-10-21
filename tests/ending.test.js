import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createEndingLevel, ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, HOLD, FADE_OUT,
  TITLE_HOLD, ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET, ENDING_CAMERA_FOV, WORLD_ALIGN_DEFAULTS } from '../src/levels/ending.js'
import { createEndingTrain, STOP_CENTER_Z, STOP_NOSE_Z, TRAIN_SPEED } from '../src/environment/ending-train.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../src/shaders/ending-plate.js'
import { createTrain } from '../src/entities/train.js'
import { getKitMaterials } from '../src/environment/level1-kit/kit-materials.js'
import { CARRIAGE_HOLES, BOILER_HOLE, TORN_TOOTH_REACH } from '../src/shaders/ending-time-damage.js'
import { createEndingAudio } from '../src/systems/ending-audio.js'
import { SPARK_COUNT } from '../src/environment/ending-sparks.js'

const TITLE_FADE = 0.6
const TOTAL = ENDING_FADE_IN + APPROACH + BRAKE + SETTLE + HOLD + FADE_OUT + TITLE_FADE + TITLE_HOLD

function harness({ delayPlate = false, audioFactory } = {}) {
  const previousDocument = globalThis.document, previousWindow = globalThis.window, previousLocation = globalThis.location
  let listenerAdds = 0, releasePlate = null
  globalThis.window = { addEventListener() { listenerAdds++ }, removeEventListener() {} }
  globalThis.location = { search: '?start=ending' }
  const doc = { activeElement: null }
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.style = {}; this.children = [] }
    appendChild(child) { this.children.push(child); child.parent = this; return child }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
    focus() { doc.activeElement = this }
    blur() { if (doc.activeElement === this) doc.activeElement = null }
  }
  doc.createElement = tag => tag === 'canvas' ? previousDocument.createElement('canvas') : new Element(tag)
  doc.createElementNS = (_namespace, tag) => {
    const image = new Element(tag); image.width = 1671; image.height = 941; image.complete = true
    Object.defineProperty(image, 'src', { set(url) {
      const loaded = () => image.dispatchEvent(new Event('load'))
      if (delayPlate && String(url).includes('ending-plate')) releasePlate = loaded
      else loaded()
    } })
    return image
  }
  doc.body = doc.createElement('body'); globalThis.document = doc
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x123456, 10, 30); scene.background = new THREE.Color(0x112233)
  const originalFog = scene.fog, originalBackground = scene.background
  let cinematicView = null, callback = null, begins = 0
  const manager = { state: 'Ending', advances: 0, advance() { this.advances++; this.state = 'Complete' } }
  const player = { mesh: new THREE.Group(), setCinematicView(value) { cinematicView = value }, cancelScriptedWalk() {} }
  const hud = { root: doc.createElement('div'), setVisible(value) { this.root.style.display = value ? 'block' : 'none' },
    showCinematicSkip(value) { callback = value }, hideCinematicSkip() { callback = null } }
  hud.root.style.display = 'block'
  const renderCamera = new THREE.PerspectiveCamera(67, 16 / 9, 0.1, 1800)
  const originalFov = renderCamera.fov, originalAspect = renderCamera.aspect
  const defaultGrade = { warmth: 0.04, saturation: 1.06, vignette: 0.34 }
  let grade = { ...defaultGrade }, postEnabled = true
  const post = { setGrade(value) { grade = { ...defaultGrade, ...value } }, resetGrade() { grade = { ...defaultGrade } },
    isEnabled: () => postEnabled, setEnabled(value) { postEnabled = value } }
  const level = createEndingLevel({ scene, player, hud, renderCamera, post, camera: { setMode() {} },
    beginCinematic() { begins++ }, advance: () => manager.advance(), audioFactory })
  player.setCinematicView(null)
  const overlay = doc.body.children.find(child => child.id === 'ending-overlay')
  return { doc, scene, player, hud, manager, level, overlay, originalFog, originalBackground,
    renderCamera, originalFov, originalAspect, defaultGrade,
    get view() { return cinematicView }, get skip() { return callback }, get begins() { return begins },
    get grade() { return grade }, get postEnabled() { return postEnabled }, get listenerAdds() { return listenerAdds },
    releasePlate() { releasePlate?.() },
    restore() {
      level.dispose(); globalThis.document = previousDocument; globalThis.window = previousWindow; globalThis.location = previousLocation
    } }
}

test('Ending: plate camera, passive alignment, geometry budget, physical stop and full timeline hold', t => {
  for (const fps of [30, 60, 144]) {
    const h = harness({ delayPlate: fps === 60 })
    try {
      assert.equal(h.view, null)
      assert.equal(h.level.isCinematic, true)
      h.level.update(0)
      if (fps === 60) {
        h.level.update(0.5)
        assert.equal(h.overlay.style.opacity, '1', 'fade waits under black until the painting is ready')
        h.releasePlate(); h.level.update(0)
      }
      assert.equal(h.begins, 1)
      assert.equal(h.listenerAdds, 0, 'alignment registers no window listeners without align')
      assert.deepEqual(ENDING_CAMERA_POSITION, PLATE_CAMERA_POSITION)
      assert.deepEqual(ENDING_CAMERA_TARGET, PLATE_CAMERA_TARGET)
      assert.equal(ENDING_CAMERA_FOV, PLATE_CAMERA_FOV)
      assert.equal(ENDING_CAMERA_FOV, 39.5)
      assert.deepEqual(h.renderCamera.position, PLATE_CAMERA_POSITION)
      assert.deepEqual(h.view.position, PLATE_CAMERA_POSITION)
      assert.deepEqual(h.view.target, PLATE_CAMERA_TARGET)
      assert.equal(h.renderCamera.fov, PLATE_CAMERA_FOV)
      assert.equal(h.renderCamera.aspect, PLATE_CAMERA_ASPECT)
      const expectedDirection = PLATE_CAMERA_TARGET.clone().sub(PLATE_CAMERA_POSITION).normalize()
      assert.ok(h.renderCamera.getWorldDirection(new THREE.Vector3()).distanceTo(expectedDirection) < 1e-10)
      assert.equal(h.view.moveSeconds, 1)
      const plate = h.scene.getObjectByName('ending-plate-sphere'), material = plate.material
      for (const uniform of ['uPlate', 'uPlateViewProj', 'uOutsideColor', 'uTime', 'uFlow']) assert.ok(material.uniforms[uniform], uniform)
      assert.equal(material.toneMapped, false); assert.equal(material.fog, false)
      assert.equal(material.depthWrite, false); assert.equal(material.side, THREE.BackSide)
      assert.equal(material.uniforms.uPlate.value.colorSpace, THREE.SRGBColorSpace)
      assert.equal(material.uniforms.uOutsideColor.value.getHex(), 0x0d1426)
      const projected = new THREE.Vector3(0.4, -0.2, 0.5).unproject(h.renderCamera)
      projected.sub(PLATE_CAMERA_POSITION).normalize().multiplyScalar(1500).add(PLATE_CAMERA_POSITION)
      projected.applyMatrix4(material.uniforms.uPlateViewProj.value)
      assert.ok(Math.abs(projected.x - 0.4) < 1e-10 && Math.abs(projected.y + 0.2) < 1e-10, 'projective plate matches the shot camera')
      for (const fov of [52, 37.5, PLATE_CAMERA_FOV]) {
        assert.equal(h.level.setShotFov(fov), fov)
        h.level.update(0)
        assert.equal(h.renderCamera.fov, fov)
        assert.equal(h.renderCamera.aspect, PLATE_CAMERA_ASPECT)
        const expected = new THREE.Matrix4().multiplyMatrices(h.renderCamera.projectionMatrix, h.renderCamera.matrixWorldInverse)
        const actual = material.uniforms.uPlateViewProj.value
        for (let i = 0; i < 16; i++) assert.ok(Math.abs(actual.elements[i] - expected.elements[i]) < 1e-10)
        projected.set(0.4, -0.2, 0.5).unproject(h.renderCamera)
        projected.sub(PLATE_CAMERA_POSITION).normalize().multiplyScalar(1500).add(PLATE_CAMERA_POSITION).applyMatrix4(actual)
        assert.ok(Math.abs(projected.x - 0.4) < 1e-10 && Math.abs(projected.y + 0.2) < 1e-10, 'plate pixels stay fixed as FOV changes')
      }
      const world = h.scene.getObjectByName('WORLD_ALIGN'), train = h.scene.getObjectByName('ending-train')
      assert.equal(train.parent, world); assert.deepEqual(world.children, [train]); assert.equal(plate.parent, h.scene)
      for (const name of ['ending-all-timber', 'ending-steel-rails', 'ending-stone-piers', 'ending-ledge-ballast']) {
        assert.equal(h.scene.getObjectByName(name), undefined, `no redundant 3D geometry: ${name}`)
      }
      const lighting = h.scene.getObjectByName('ending-gorge')
      assert.notEqual(lighting.parent, world)
      lighting.traverse(node => assert.ok(!node.isMesh && !node.isSprite && !node.isPoints))
      assert.equal(h.scene.fog, null)
      const moonlight = h.scene.getObjectByName('ending-moonlight')
      const moonDirection = moonlight.position.clone().sub(moonlight.target.position).normalize()
      const elevation = THREE.MathUtils.radToDeg(Math.asin(moonDirection.y))
      assert.ok(elevation >= 35 && elevation <= 45, `moon elevation: ${elevation}`)
      const glow = h.scene.getObjectByName('ending-headlight-glow')
      assert.ok(glow.isSprite); assert.equal(glow.material.depthWrite, false)
      assert.equal(glow.material.blending, THREE.AdditiveBlending)
      assert.equal(world.getObjectByName(plate.name), undefined)
      assert.deepEqual(WORLD_ALIGN_DEFAULTS, { x: -0.75, y: -3.25, z: -0.75, yaw: -20.25, pitch: -2.75, roll: 0, scale: 1 })
      assert.deepEqual(world.position, new THREE.Vector3(-0.75, -3.25, -0.75))
      assert.equal(world.rotation.x, THREE.MathUtils.degToRad(-2.75))
      assert.equal(world.rotation.y, THREE.MathUtils.degToRad(-20.25)); assert.equal(world.rotation.z, 0)
      assert.equal(world.scale.x, 1)
      assert.equal(h.grade.warmth, 0); assert.equal(h.postEnabled, false, 'the painting bypasses final global tone mapping')
      let calls = 0, triangles = 0
      h.scene.traverse(node => {
        if (!node.isMesh && !node.isPoints && !node.isSprite && !node.isLine) return
        for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return
        assert.equal(node.castShadow, false)
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        calls += materials.reduce((count, material) => count + (material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1), 0)
        if (node.isMesh) triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1)
        else if (node.isSprite) triangles += 2
      })
      assert.ok(calls <= 140, `draws: ${calls}`); assert.ok(triangles <= 150000, `triangles: ${triangles}`)
      if (fps === 60) {
        t.diagnostic(`Train-only scene estimate: ${calls} drawable objects, ${triangles} triangles`)
        t.diagnostic(`Moonlight: ${JSON.stringify({ direction: moonDirection, elevation, intensity: moonlight.intensity,
          hemisphereIntensity: h.scene.getObjectByName('ending-hemisphere').intensity, glowSize: glow.scale.x })}`)
      }
      const locomotive = h.scene.getObjectByName('ending-locomotive'), bounds = new THREE.Box3(), part = new THREE.Box3()
      const instance = new THREE.Matrix4(), worldMatrix = new THREE.Matrix4()
      // Keep the physical clearance checks in track coordinates after baking the painted-track alignment.
      world.updateMatrixWorld(true)
      const trackInverse = world.matrixWorld.clone().invert()
      function noseZ() {
        train.updateMatrixWorld(true); bounds.makeEmpty()
        locomotive.traverse(node => {
          if (!node.isMesh || node.name === 'ending-headlight-cone' || node.userData.endingDecoration) return
          node.geometry.computeBoundingBox()
          for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
            if (node.isInstancedMesh) { node.getMatrixAt(i, instance); worldMatrix.multiplyMatrices(node.matrixWorld, instance) }
            else worldMatrix.copy(node.matrixWorld)
            worldMatrix.premultiply(trackInverse)
            part.copy(node.geometry.boundingBox).applyMatrix4(worldMatrix); bounds.union(part)
          }
        })
        return bounds.min.z
      }
      assert.ok(noseZ() >= STOP_NOSE_Z + 50)
      let elapsed = 0, minimumNose = Infinity
      const frozenClock = material.uniforms.uTime.value
      material.uniforms.uFlow.value = 0
      h.level.update(0)
      assert.equal(material.uniforms.uTime.value, frozenClock)
      material.uniforms.uFlow.value = 1
      while (elapsed < TOTAL - 0.01) {
        const delta = Math.min(1 / fps, TOTAL - 0.01 - elapsed)
        h.level.update(delta); elapsed += delta
        const nose = noseZ(); minimumNose = Math.min(minimumNose, nose)
        assert.ok(nose > 0, `physical nose never crosses the edge: ${nose}`)
        if (elapsed >= ENDING_FADE_IN + APPROACH + BRAKE + SETTLE) assert.ok(Math.abs(nose - STOP_NOSE_Z) <= 0.1)
        assert.equal(h.player.mesh.visible, false)
      }
      if (fps === 60) t.diagnostic(`Physical nose: settled ${noseZ()}, minimum ${minimumNose}`)
      const stopped = createEndingTrain()
      try {
        stopped.update(STOP_CENTER_Z, TRAIN_SPEED * (APPROACH + BRAKE / 2), -1, SETTLE + HOLD)
        stopped.root.updateMatrix()
        const alignedStop = new THREE.Matrix4().multiplyMatrices(world.matrixWorld, stopped.root.matrix)
        train.updateMatrixWorld(true)
        for (let i = 0; i < 16; i++) assert.ok(Math.abs(train.matrixWorld.elements[i] - alignedStop.elements[i]) < 1e-10,
          `full approach reaches the aligned stopped pose, matrix element ${i}`)
      } finally { stopped.dispose() }
      assert.equal(h.manager.advances, 0); assert.equal(h.overlay.children[0].style.opacity, '1')
      h.level.update(0.02); assert.equal(h.manager.state, 'Complete'); assert.equal(h.manager.advances, 1)
      h.level.update(100); assert.equal(h.manager.advances, 1); assert.equal(h.begins, 1)
    } finally { h.restore() }
  }
})

test('Ending: damage uniforms use pivot-local holes, protect the first carriage and leave shared shaders intact', () => {
  const kit = getKitMaterials(), h = harness()
  try {
    h.level.update(0); h.scene.updateMatrixWorld(true)
    for (const material of Object.values(kit).flat().filter(value => value?.isMaterial)) {
      assert.equal(material.userData.endingTimeDamage, undefined)
      assert.notEqual(material.customProgramCacheKey(), 'ending-time-damage-v2')
    }
    let patched = 0
    for (let i = 0; i < 4; i++) {
      const pivot = h.scene.getObjectByName(`ending-carriage-${i + 1}`)
      const towardCamera = h.renderCamera.position.clone().sub(pivot.getWorldPosition(new THREE.Vector3()))
      const outward = new THREE.Vector3(-1, 0, 0).transformDirection(pivot.matrixWorld)
      assert.ok(outward.dot(towardCamera) > 0, 'local -X faces the shot camera')
      for (const node of pivot.children.filter(node => node.name.startsWith(`carriage-${i}-`))) {
        const uniforms = node.material.userData.endingTimeDamage
        assert.ok(uniforms); assert.equal(uniforms.uHoles.value.length, 4)
        assert.equal(uniforms.uTime.value, 0); assert.equal(uniforms.uRift.value, 1)
        assert.deepEqual(uniforms.uHoles.value.slice(0, CARRIAGE_HOLES[i].length), CARRIAGE_HOLES[i])
        const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <emissivemap_fragment>' }
        node.material.onBeforeCompile(shader)
        for (const key of ['uHoles', 'uTime', 'uRift']) assert.equal(shader.uniforms[key], uniforms[key])
        assert.match(shader.vertexShader, /vDamageLocal = transformed/)
        assert.match(shader.fragmentShader, /discard/); assert.doesNotMatch(shader.fragmentShader, /damageCells/)
        assert.match(shader.fragmentShader, /if\(!gl_FrontFacing\)/)
        patched++
      }
    }
    assert.ok(patched > 12)
    for (const hole of CARRIAGE_HOLES[0]) {
      assert.equal(hole.roof, 2)
      assert.ok(hole.center.z + hole.halfSize.z + TORN_TOOTH_REACH + 0.27 < 6,
        'the opening, teeth and halo stay behind the reserved front 4 m')
    }
    assert.equal(BOILER_HOLE.halfSize.z * 2 + 2 * TORN_TOOTH_REACH, 2.5)
    assert.ok(h.scene.getObjectByName('ending-boiler-interior'))
    assert.equal(h.scene.getObjectByName('ending-boiler-ribs'), undefined)
  } finally { h.restore() }
})

test('Ending: freeze steam/river and release the glow once', () => {
  const h = harness()
  try {
    h.level.update(0)
    const uniforms = new Set()
    h.scene.traverse(node => {
      for (const material of node.material ? Array.isArray(node.material) ? node.material : [node.material] : []) {
        if (material.userData.endingTimeDamage) uniforms.add(material.userData.endingTimeDamage)
      }
    })
    const staleSkip = h.skip
    h.level.update(ENDING_FADE_IN + APPROACH)
    h.level.update(BRAKE + SETTLE)
    assert.equal(h.level.timeState.frozen, true)
    const steam = h.scene.getObjectByName('ending-chimney-steam').material.uniforms.uTime
    const plateUniforms = h.scene.getObjectByName('ending-plate-sphere').material.uniforms
    const steamTime = steam.value
    h.level.update(0.6)
    assert.equal(steam.value, steamTime); assert.equal(plateUniforms.uFlow.value, 0)
    const riverTime = plateUniforms.uTime.value
    h.level.update(0.1)
    assert.equal(plateUniforms.uTime.value, riverTime)
    for (const uniform of uniforms) assert.equal(uniform.uRift.value, 1)
    const vignette = h.doc.body.children.find(node => node.id === 'ending-time-vignette')
    assert.equal(Number(vignette.style.opacity), 0.35)
    h.level.update(HOLD - 0.7)
    assert.equal(h.level.timeState.releaseCount, 1)
    assert.equal(h.level.release(), false); staleSkip(); staleSkip()
    assert.equal(h.level.timeState.releaseCount, 1)
    h.level.update(0.61)
    for (const uniform of uniforms) assert.equal(uniform.uRift.value, 0)
    assert.equal(Number(vignette.style.opacity), 0)
    assert.equal(plateUniforms.uFlow.value, 1); assert.ok(steam.value > steamTime)
  } finally { h.restore() }
})

test('Ending: damage resources dispose once, vignette detaches and restart resets the anomaly', () => {
  const h = harness(), resources = new Map()
  h.scene.traverse(node => {
    if (node.geometry) resources.set(node.geometry, 0)
    for (const material of node.material ? Array.isArray(node.material) ? node.material : [node.material] : []) resources.set(material, 0)
  })
  for (const resource of resources.keys()) resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1))
  try {
    h.level.update(0); assert.equal(h.level.release(), true); assert.equal(h.level.release(), false)
    h.level.dispose(); h.level.dispose()
    for (const count of resources.values()) assert.equal(count, 1)
    assert.equal(h.doc.body.children.length, 0); assert.equal(h.scene.children.length, 0)
    assert.equal(h.level.release(), false)
  } finally { h.restore() }
  const restarted = harness()
  try {
    restarted.level.update(0)
    assert.equal(restarted.level.timeState.rift, 1); assert.equal(restarted.level.timeState.releaseCount, 0)
    assert.equal(restarted.level.timeState.frozen, false); assert.equal(restarted.level.timeState.released, false)
  } finally { restarted.restore() }
})

test('Ending: skip uses fade/title and advances once despite repeated or stale activation', () => {
  const h = harness()
  try {
    h.level.update(0)
    const staleSkip = h.skip, button = h.doc.activeElement
    assert.equal(button.tagName, 'BUTTON')
    button.dispatchEvent(new Event('click')); staleSkip(); button.dispatchEvent(new Event('click'))
    assert.equal(h.manager.advances, 0)
    h.level.update(FADE_OUT + TITLE_FADE + TITLE_HOLD - 0.01); assert.equal(h.manager.advances, 0)
    h.level.update(0.02); staleSkip(); h.level.update(100); assert.equal(h.manager.advances, 1)
  } finally { h.restore() }
})

test('Ending: completed disposal releases the plate once and restores FOV, grade, fog and scene ownership', () => {
  const h = harness()
  try {
    h.level.update(0)
    const staleSkip = h.skip, texture = h.scene.getObjectByName('ending-plate-sphere').material.uniforms.uPlate.value
    const projection = h.scene.getObjectByName('ending-plate-sphere').material.uniforms.uPlateViewProj.value
    const defaultProjection = projection.clone()
    const glow = h.scene.getObjectByName('ending-headlight-glow')
    let glowTextureDisposals = 0, glowGeometryDisposals = 0
    glow.material.map.addEventListener('dispose', () => glowTextureDisposals++)
    glow.geometry.addEventListener('dispose', () => glowGeometryDisposals++)
    h.level.setShotFov(57)
    assert.notDeepEqual(projection.elements, defaultProjection.elements)
    let textureDisposals = 0
    texture.addEventListener('dispose', () => textureDisposals++)
    h.level.update(TOTAL + 1); assert.equal(h.manager.advances, 1)
    assert.doesNotThrow(() => { h.level.dispose(); h.level.dispose() })
    assert.equal(textureDisposals, 1)
    assert.equal(glowTextureDisposals, 1); assert.equal(glowGeometryDisposals, 1)
    assert.deepEqual(projection.elements, defaultProjection.elements, 'plate projection restores its initial camera FOV')
    assert.equal(h.renderCamera.fov, h.originalFov); assert.equal(h.renderCamera.aspect, h.originalAspect)
    assert.deepEqual(h.grade, h.defaultGrade); assert.equal(h.postEnabled, true)
    assert.equal(h.scene.children.length, 0); assert.equal(h.scene.fog, h.originalFog); assert.equal(h.scene.background, h.originalBackground)
    assert.equal(h.doc.body.children.length, 0); assert.equal(h.hud.root.style.display, 'block')
    assert.equal(h.player.mesh.visible, true); assert.equal(h.view, null)
    staleSkip(); h.level.update(100); assert.equal(h.manager.advances, 1)
  } finally { h.restore() }
})

test('Ending: teardown leaves cached kit materials/maps valid for a fresh platform train', () => {
  const kit = getKitMaterials(), cachedMaterials = new Set(Object.values(kit).flat().filter(value => value?.isMaterial))
  const sharedState = () => [...cachedMaterials].map(material => ({
    color: material.color?.getHex(), emissive: material.emissive?.getHex(),
    intensity: material.emissiveIntensity, roughness: material.roughness, metalness: material.metalness,
    side: material.side, transparent: material.transparent, opacity: material.opacity, version: material.version,
    compile: material.onBeforeCompile, cache: material.customProgramCacheKey(),
    userData: JSON.stringify(material.userData),
    textures: Object.values(material).filter(value => value?.isTexture).map(texture => ({
      texture, version: texture.version, colorSpace: texture.colorSpace, source: texture.source
    }))
  }))
  const originalSharedState = sharedState()
  const windowState = () => ({ color: kit.carriageWindow.color.getHex(), emissive: kit.carriageWindow.emissive.getHex(),
    intensity: kit.carriageWindow.emissiveIntensity, map: kit.carriageWindow.map, emissiveMap: kit.carriageWindow.emissiveMap,
    colorSpace: kit.carriageWindow.map.colorSpace, version: kit.carriageWindow.map.version,
    roughness: kit.carriageWindow.roughness, metalness: kit.carriageWindow.metalness, toneMapped: kit.carriageWindow.toneMapped })
  const originalWindow = windowState()
  const watched = new Set(cachedMaterials)
  for (const material of cachedMaterials) for (const value of Object.values(material)) if (value?.isTexture) watched.add(value)
  let sharedDisposals = 0
  const onDispose = () => sharedDisposals++
  for (const resource of watched) resource.addEventListener('dispose', onDispose)
  const h = harness()
  let fresh = null
  try {
    const windowClone = h.scene.getObjectByName('ending-carriage-1').children.find(
      node => node.material?.name === 'ending-amber-windows')?.material
    assert.ok(windowClone); assert.notEqual(windowClone, kit.carriageWindow)
    assert.equal(windowClone.map, null); assert.equal(windowClone.emissiveMap, null)
    assert.equal(windowClone.emissive.getHex(), 0xffb35c); assert.equal(windowClone.emissiveIntensity, 0.85)
    assert.deepEqual(windowState(), originalWindow, 'creating the ending leaves the shared station window unchanged')
    assert.deepEqual(sharedState(), originalSharedState)
    h.scene.getObjectByName('ending-real-train').traverse(node => {
      if (!node.material) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        assert.equal(cachedMaterials.has(material), false)
        for (const value of Object.values(material)) if (value?.isTexture) assert.equal(watched.has(value), false)
      }
    })
    h.level.update(TOTAL + 1); h.level.dispose(); assert.equal(sharedDisposals, 0)
    assert.deepEqual(windowState(), originalWindow, 'disposing the ending leaves the shared station window unchanged')
    assert.deepEqual(sharedState(), originalSharedState)
    fresh = createTrain(); assert.equal(getKitMaterials(), kit)
    let sharedMeshes = 0
    fresh.train.traverse(node => {
      if (cachedMaterials.has(node.material)) {
        sharedMeshes++; assert.ok(node.geometry.attributes.position.count > 0); assert.ok(node.material.isMaterial)
        if (node.material.map) assert.ok(node.material.map.image)
      }
    })
    assert.ok(sharedMeshes > 0); assert.equal(sharedDisposals, 0)
  } finally {
    if (fresh) {
      const geometries = new Set(), materials = new Set()
      for (const root of [fresh.train, fresh.stationSteam]) root.traverse(node => {
        if (node.geometry) geometries.add(node.geometry)
        if (node.material && !cachedMaterials.has(node.material)) materials.add(node.material)
      })
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
    }
    h.restore()
    for (const resource of watched) resource.removeEventListener('dispose', onDispose)
  }
})

test('Ending: outlines follow rift release and GPU sparks exist only during braking', () => {
  const h = harness()
  try {
    h.level.update(0)
    const sparks = h.scene.getObjectByName('ending-brake-sparks')
    assert.equal(sparks.count, SPARK_COUNT)
    assert.equal(sparks.material.uniforms.uIntensity.value, 0)
    assert.ok(sparks.geometry.getAttribute('aSeed').isInstancedBufferAttribute)
    const outlines = []
    h.scene.traverse(node => { if (node.name === 'ending-blue-outline') outlines.push(node) })
    assert.ok(outlines.length >= 6)
    for (const node of outlines) {
      assert.equal(node.material.uniforms.uRift.value, 1)
      assert.equal(node.material.side, THREE.BackSide)
      assert.equal(node.material.depthWrite, false)
      assert.equal(node.material.depthTest, true)
    }
    for (const name of ['ending-torn-panel', 'ending-time-threads', 'ending-damage-splinters'])
      assert.equal(h.scene.getObjectByName(name), undefined)
    h.level.update(ENDING_FADE_IN + APPROACH + BRAKE / 2)
    assert.ok(sparks.material.uniforms.uIntensity.value > 0.99)
    h.level.update(BRAKE / 2)
    assert.equal(sparks.material.uniforms.uIntensity.value, 0)
    h.level.release(); h.level.update(0.61)
    for (const node of outlines) assert.equal(node.material.uniforms.uRift.value, 0)
  } finally { h.restore() }
})

function fakeEndingAudioContext() {
  const sources = [], nodes = []
  const parameter = () => ({
    value: 0, setValueAtTime(value) { this.value = value }, setTargetAtTime(value) { this.value = value },
    cancelScheduledValues() {}
  })
  const node = (source = false) => {
    const value = { gain: parameter(), frequency: parameter(), detune: parameter(), Q: parameter(),
      connected: false, stopped: false,
      connect() { this.connected = true; return arguments[0] },
      disconnect() { this.connected = false },
      start() {}, stop() { this.stopped = true } }
    nodes.push(value)
    if (source) sources.push(value)
    return value
  }
  const context = { state: 'running', currentTime: 0, sampleRate: 100,
    createGain: () => node(), createOscillator: () => node(true),
    createBiquadFilter: () => node(), createBufferSource: () => node(true),
    createBuffer: () => ({ getChannelData: () => new Float32Array(100) }) }
  const master = node()
  return { context, master, sources, nodes }
}

test('Ending: screech requires a running shared context and stops on skip, dispose and restart', () => {
  const silent = createEndingAudio({ context: () => null, output: () => null })
  silent.update(0.5, 1); assert.equal(silent.active, false); silent.dispose()
  const suspended = fakeEndingAudioContext()
  suspended.context.state = 'suspended'
  const waiting = createEndingAudio({ context: () => suspended.context, output: () => suspended.master })
  waiting.update(0.5, 1); assert.equal(suspended.sources.length, 0); waiting.dispose()
  for (const action of ['skip', 'dispose']) {
    const mock = fakeEndingAudioContext()
    let audio
    const h = harness({ audioFactory: () => (audio = createEndingAudio({
      context: () => mock.context, output: () => mock.master
    })) })
    try {
      h.level.update(0); assert.equal(mock.sources.length, 0)
      h.level.update(ENDING_FADE_IN + APPROACH + 0.3)
      assert.equal(audio.active, true); assert.equal(mock.sources.length, 5)
      if (action === 'skip') h.skip()
      else h.level.dispose()
      assert.equal(audio.active, false)
      assert.ok(mock.sources.every(source => source.stopped))
      assert.ok(mock.nodes.filter(node => node !== mock.master).every(node => !node.connected))
    } finally { h.restore() }
  }
  const mock = fakeEndingAudioContext()
  const restarted = createEndingAudio({ context: () => mock.context, output: () => mock.master })
  restarted.update(0.5, 1); assert.equal(restarted.active, true)
  restarted.update(-1, 0, 0.2); assert.equal(restarted.active, true)
  restarted.update(-1, 0, 0.2); assert.equal(restarted.active, false)
  restarted.dispose()
})

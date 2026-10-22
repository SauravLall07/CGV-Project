import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createEndingLevel, ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, BEAT, DOOR_OPEN, HOLD_CORE,
  THROW, THROW_RELEASE, FALL, PHASES, DURATIONS, TRAIN_START_NOSE_Z,
  SKY_HOLD, ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET, ENDING_CAMERA_FOV, WORLD_ALIGN_DEFAULTS } from '../src/levels/ending.js'
import { DOOR_HOLD, WHIP_SECONDS, RELEASE_TO_WHIP, SNAP_HOLD, DIP_DOWN, DIP_UP, TURN, RUN, EMPTY_BEAT, TILT_UP, TILT_DEGREES, CRANE_HEIGHT, DOOR_EYE_HEIGHT, measureEndingFrame, measureEndingRoofAngle } from '../src/levels/ending.js'
import { RUN_IN, RUN_RADIUS, RUN_CORRIDOR, DOOR_OPEN_ANGLE } from '../src/environment/ending-door.js'
import { createPlayer } from '../src/entities/player.js'
import { FLASH_SECONDS, SCREEN_FLASH_PEAK, RIVER_TARGET_NDC, GORGE_FLOOR_Y } from '../src/environment/ending-core.js'
import { ENDING_DOOR_HOLE } from '../src/shaders/ending-time-damage.js'
import fs from 'node:fs'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { createEndingTrain, STOP_CENTER_Z, STOP_NOSE_Z, TRAIN_SPEED } from '../src/environment/ending-train.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../src/shaders/ending-plate.js'
import { createTrain, RAIL_OFFSET } from '../src/entities/train.js'
import { getKitMaterials } from '../src/environment/level1-kit/kit-materials.js'
import { CARRIAGE_HOLES, BOILER_HOLE, TORN_TOOTH_REACH, AGING_REACH, EDGE_WIDTH, HALO_WIDTH } from '../src/shaders/ending-time-damage.js'
import { createCarriageEnvironment } from '../src/environment/carriages.js'
import { disposeObject } from '../src/core/dispose.js'
import { createEndingAudio } from '../src/systems/ending-audio.js'
import { SPARK_COUNT } from '../src/environment/ending-sparks.js'

const TOTAL = DURATIONS.reduce((sum,value)=>sum+value,0)

function assertQuaternionClose(actual,expected) {
  for(const component of ['x','y','z','w'])
    assert.ok(Math.abs(actual[component]-expected[component])<=1e-9,component+' quaternion component changed')
}

function harness({ delayPlate = false, audioFactory, playerOverride } = {}) {
  const previousDocument = globalThis.document, previousWindow = globalThis.window, previousLocation = globalThis.location
  let listenerAdds = 0
  const pendingPlates = []
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
      if (delayPlate && String(url).includes('ending-plate')) pendingPlates.push(loaded)
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
  const player = playerOverride ?? createPlayer()
  const setView=player.setCinematicView
  player.setCinematicView=value=>{cinematicView=value;setView(value)}
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
    releasePlate() { pendingPlates.splice(0).forEach(loaded=>loaded()) },
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
      assert.equal(h.doc.body.children.some(node=>node.id==='ending-dev-phase'),false,'no DEV label without import.meta.env.DEV')
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
      assert.equal(train.parent, world); assert.deepEqual(world.children, [train,h.level.track.root]); assert.equal(plate.parent, h.scene)
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
      assert.ok(calls <= 180, `draws: ${calls}`); assert.ok(triangles <= 240000, `triangles: ${triangles}`)
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
        const index=PHASES.indexOf(h.level.phase)
        const visible=index>=PHASES.indexOf('doorOpen') && index<=PHASES.indexOf('run') &&
          (h.level.phase!=='whipDown' || h.level.phaseTime<0.06 || h.level.phaseTime>0.24)
        assert.equal(h.player.mesh.visible, visible)
      }
      if (fps === 60) t.diagnostic(`Physical nose: settled ${noseZ()}, minimum ${minimumNose}`)
      const stopped = createEndingTrain()
      try {
        stopped.update(STOP_CENTER_Z, TRAIN_SPEED * (APPROACH + BRAKE / 2), -1, SETTLE)
        stopped.root.updateMatrix()
        const alignedStop = new THREE.Matrix4().multiplyMatrices(world.matrixWorld, stopped.root.matrix)
        train.updateMatrixWorld(true)
        for (let i = 0; i < 16; i++) assert.ok(Math.abs(train.matrixWorld.elements[i] - alignedStop.elements[i]) < 1e-10,
          `full approach reaches the aligned stopped pose, matrix element ${i}`)
      } finally { stopped.dispose() }
      assert.equal(h.manager.advances, 0); assert.equal(h.overlay.children.length,0);assert.equal(h.overlay.style.opacity,'0')
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
      assert.notEqual(material.customProgramCacheKey(), 'ending-time-aging-v3')
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
      assert.ok(hole.center.z + hole.halfSize.z + TORN_TOOTH_REACH + AGING_REACH < 6,
        'the opening, teeth and full aging reach stay behind the reserved front 4 m')
    }
    assert.equal(BOILER_HOLE.halfSize.z * 2 + 2 * TORN_TOOTH_REACH, 2.5)
    assert.ok(h.scene.getObjectByName('ending-boiler-interior'))
    assert.equal(h.scene.getObjectByName('ending-boiler-ribs'), undefined)
  } finally { h.restore() }
})

test('Ending: damage resources dispose once and restart restores running effects', () => {
  const h = harness(), resources = new Map()
  h.scene.traverse(node => {
    if (node.geometry) resources.set(node.geometry, 0)
    for (const material of node.material ? Array.isArray(node.material) ? node.material : [node.material] : []) resources.set(material, 0)
  })
  for (const resource of resources.keys()) resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1))
  try {
    h.level.update(0)
    h.level.dispose(); h.level.dispose()
    for (const count of resources.values()) assert.equal(count, 1)
    assert.equal(h.doc.body.children.length, 0); assert.equal(h.scene.children.length, 0)
  } finally { h.restore() }
  const restarted = harness()
  try {
    restarted.level.update(0)
    assert.equal(restarted.scene.getObjectByName('ending-plate-sphere').material.uniforms.uFlow.value, 1)
  } finally { restarted.restore() }
})

test('Ending: skip advances immediately once despite repeated or stale activation', () => {
  const h = harness()
  try {
    h.level.update(0)
    const staleSkip = h.skip, button = h.doc.activeElement
    assert.equal(button.tagName, 'BUTTON')
    button.dispatchEvent(new Event('click')); staleSkip(); button.dispatchEvent(new Event('click'))
    assert.equal(h.manager.advances, 1)
    assert.equal(h.level.phase,'done');assert.equal(h.level.activeShot,1)
    assert.equal(h.overlay.children.length,0)
    h.level.update(0.02); staleSkip(); h.level.update(100); assert.equal(h.manager.advances, 1)
  } finally { h.restore() }
})

test('Ending: completed disposal releases the plate once and restores FOV, grade, fog and scene ownership', () => {
  const h = harness()
  try {
    const cameraState=camera=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),up:camera.up.toArray(),
      fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far,zoom:camera.zoom,view:camera.view?{...camera.view}:null,
      matrix:camera.matrix.toArray(),world:camera.matrixWorld.toArray(),worldInverse:camera.matrixWorldInverse.toArray(),
      projection:camera.projectionMatrix.toArray(),projectionInverse:camera.projectionMatrixInverse.toArray()})
    const originalRenderState=cameraState(h.renderCamera),originalPlateState=cameraState(h.level.plate.camera)
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
    assert.deepEqual(cameraState(h.level.plate.camera),originalPlateState,'plate camera restores captured pose, up and matrices exactly')
    assert.deepEqual(cameraState(h.renderCamera),originalRenderState,'render camera restores captured pose, up and matrices exactly')
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
      node => node.material?.map?.image === kit.carriageWindow.map.image)?.material
    assert.ok(windowClone); assert.notEqual(windowClone, kit.carriageWindow)
    assert.ok(windowClone.map);assert.equal(windowClone.emissiveMap,windowClone.map)
    assert.notEqual(windowClone.map,kit.carriageWindow.map);assert.notEqual(windowClone.map.source,kit.carriageWindow.map.source)
    for(const property of ['color','emissive'])assert.equal(windowClone[property].getHex(),kit.carriageWindow[property].getHex())
    for(const property of ['emissiveIntensity','roughness','metalness'])assert.equal(windowClone[property],kit.carriageWindow[property])
    assert.equal(windowClone.map.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(windowClone.map.generateMipmaps,true)
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

test('Ending: GPU sparks exist only during braking', () => {
  const h = harness()
  try {
    h.level.update(0)
    const sparks = h.scene.getObjectByName('ending-brake-sparks')
    assert.equal(sparks.count, SPARK_COUNT)
    assert.equal(sparks.material.uniforms.uIntensity.value, 0)
    assert.ok(sparks.geometry.getAttribute('aSeed').isInstancedBufferAttribute)
    const seeds = sparks.geometry.getAttribute('aSeed'), contacts = sparks.geometry.getAttribute('aContact')
    const emitters = new Set()
    for (let i=0;i<seeds.count;i++) {
      assert.ok(seeds.getZ(i)>=0.2-1e-6 && seeds.getZ(i)<=0.5+1e-6)
      emitters.add([seeds.getY(i),contacts.getX(i),contacts.getZ(i)].join(','))
    }
    assert.equal(emitters.size,26,'both sides of every braked wheel have an emitter')
    assert.equal(h.scene.getObjectByName('ending-blue-outline'),undefined)
    for (const name of ['ending-torn-panel', 'ending-time-threads', 'ending-damage-splinters'])
      assert.equal(h.scene.getObjectByName(name), undefined)
    h.level.update(ENDING_FADE_IN + APPROACH + BRAKE / 2)
    assert.ok(sparks.material.uniforms.uIntensity.value > 0.99)
    h.level.update(BRAKE / 2)
    assert.equal(sparks.material.uniforms.uIntensity.value, 0)
  } finally { h.restore() }
})

test('Ending: approach starts beyond the upper-left frame and enters only after fade-in', t => {
  const h=harness()
  try {
    h.level.update(0)
    assert.ok(TRAIN_SPEED>=22 && TRAIN_SPEED<=26);assert.equal(BRAKE,4.5)
    assert.ok(APPROACH>=2.2 && APPROACH<=3.2)
    assert.ok(Math.abs(TRAIN_START_NOSE_Z-STOP_NOSE_Z-TRAIN_SPEED*(APPROACH+BRAKE/2))<1e-9)
    const train=h.scene.getObjectByName('ending-train'),world=train.parent,nose=new THREE.Vector3()
    const startCenter=train.position.z
    const noseOffset=startCenter-(TRAIN_START_NOSE_Z-STOP_NOSE_Z)-STOP_NOSE_Z
    const projectNose=()=>{world.updateMatrixWorld(true);return nose.set(0,0.25,train.position.z-noseOffset).applyMatrix4(world.matrixWorld).project(h.renderCamera)}
    assert.ok(projectNose().x<-1 && nose.y>0,'nose starts outside upper-left edge')
    h.level.update(ENDING_FADE_IN)
    assert.ok(projectNose().x<-1,'nose stays outside throughout stationary fade-in')
    let elapsed=ENDING_FADE_IN,entry=null
    for(let i=0;i<Math.ceil(APPROACH*120);i++) {
      h.level.update(1/120);elapsed+=1/120;projectNose()
      if(entry===null && Math.abs(nose.x)<1 && Math.abs(nose.y)<1)entry=elapsed
    }
    assert.ok(entry>ENDING_FADE_IN && entry<ENDING_FADE_IN+APPROACH,'nose enters during approach after fade')
    h.level.update(BRAKE+SETTLE)
    assert.ok(Math.abs(train.position.z-(startCenter-TRAIN_START_NOSE_Z+STOP_NOSE_Z))<1e-9,'stopped pose is unchanged')
    t.diagnostic(`Approach ${APPROACH} s, start nose ${TRAIN_START_NOSE_Z} m, V0 ${TRAIN_SPEED} m/s, deceleration ${TRAIN_SPEED/BRAKE} m/s²; entry ${entry} s after start`)
  } finally {h.restore()}
})

test('Ending: peak budget reserves twelve detective draws with every ending effect active', t => {
  const h=harness()
  try {
    h.level.update(0)
    h.level.door.setOpen(1)
    const core=h.level.core
    core.update(0,-1,0.25)
    core.payload.visible=true;core.trail.visible=true;core.flash.visible=true;core.light.intensity=1.5
    assert.equal(h.level.door.openness,1)
    assert.ok(core.payload.visible && core.trail.visible && core.flash.visible && core.light.intensity>0)
    let calls=0,triangles=0
    h.scene.traverse(node=>{
      if(!node.isMesh && !node.isSprite && !node.isPoints && !node.isLine)return
      for(let parent=node;parent;parent=parent.parent)if(!parent.visible)return
      const materials=Array.isArray(node.material)?node.material:[node.material]
      calls+=materials.reduce((sum,material)=>sum+(material.transparent && material.side===THREE.DoubleSide && !material.forceSinglePass?2:1),0)
      if(node.isMesh)triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1)
      else if(node.isSprite)triangles+=2
    })
    assert.ok(calls<=168,`peak draws: ${calls}`);assert.ok(triangles<=220000,`peak triangles: ${triangles}`)
    t.diagnostic(`Conservative peak without detective, with open doors and all core effects together: ${calls} draw calls, ${triangles} triangles (before culling); twelve detective draws reserved`)
  } finally {h.restore()}
})

test('Ending: full story matches each active plate camera and keeps light count fixed', t => {
  const h=harness()
  try {
    h.level.update(0)
    const countLights=()=>{let count=0;h.scene.traverse(node=>{if(node.isLight)count++});return count}
    const lights=countLights(),phases=[h.level.phase]
    const steam=h.scene.getObjectByName('ending-chimney-steam').material.uniforms.uTime
    const river=h.scene.getObjectByName('ending-plate-sphere').material.uniforms
    let previousSteam=steam.value,previousRiver=river.uTime.value
    let elapsed=0
    while(elapsed<TOTAL-0.001) {
      const dt=Math.min(1/30,TOTAL-0.001-elapsed)
      h.level.update(dt);elapsed+=dt
      if(phases.at(-1)!==h.level.phase)phases.push(h.level.phase)
      const shot=h.level.shots[h.level.activeShot]
      assert.deepEqual(h.renderCamera.position,shot.position);assertQuaternionClose(h.renderCamera.quaternion,shot.quaternion)
      assert.equal(h.renderCamera.fov,shot.fov);assert.equal(h.renderCamera.aspect,shot.aspect)
      assert.equal(countLights(),lights)
      assert.deepEqual(h.view.initialPosition,h.view.position)
      assertQuaternionClose(h.view.initialRotation,h.view.targetRotation)
      assert.deepEqual(h.scene.getObjectByName('ending-plate-sphere').position,shot.position)
      if(h.level.phase!=='whipDown') {
        assert.equal(river.uWhip.value,0);assert.equal(river.uPlateMix.value,0)
      }
      assert.ok(steam.value>previousSteam);assert.ok(river.uTime.value>previousRiver)
      previousSteam=steam.value;previousRiver=river.uTime.value
      assert.equal(river.uFlow.value,1)
      assert.equal(h.doc.body.children.some(node=>node.id==='ending-time-vignette'),false)
      h.scene.traverse(node=>{
        for(const material of node.material?Array.isArray(node.material)?node.material:[node.material]:[]) {
          const uniforms=material.userData.endingTimeDamage??material.userData.endingLamp
          if(uniforms)assert.equal(uniforms.uRift.value,1)
        }
      })
      if(PHASES.indexOf(h.level.phase)<PHASES.indexOf('doorOpen'))assert.equal(h.level.door.openness,0)
      if(PHASES.indexOf(h.level.phase)>PHASES.indexOf('doorOpen'))assert.equal(h.level.door.openness,1)
    }
    assert.deepEqual(phases,PHASES.filter((_,i)=>DURATIONS[i]>0));assert.equal(h.manager.advances,0)
    h.level.update(0.01);h.level.update(100);assert.equal(h.manager.advances,1)
    t.diagnostic('Impact world '+JSON.stringify(h.level.core.impact)+'; NDC '+JSON.stringify(h.level.core.impact.clone().project(h.level.core.camera)))
  } finally {h.restore()}
})

test('Ending: skip from every phase produces one complete transition and an empty open doorway', () => {
  for(let phase=0;phase<PHASES.length-1;phase++) {
    if(DURATIONS[phase]===0)continue // Cuts execute atomically with the following phase.
    const h=harness()
    try {
      h.level.update(0);const skip=h.skip
      const elapsed=DURATIONS.slice(0,phase).reduce((sum,value)=>sum+value,0)+0.00001
      h.level.update(elapsed);assert.equal(h.level.phase,PHASES[phase])
      skip();skip()
      assert.equal(h.level.activeShot,1)
      assert.equal(h.player.mesh.visible,false);assert.equal(h.level.door.openness,1)
      assert.equal(h.level.core.payload.visible,false);assert.equal(h.level.core.trail.visible,false)
      assert.equal(h.level.core.flash.visible,false);assert.equal(Number(h.level.core.screen.style.opacity),0)
      h.level.update(TOTAL+1);skip();h.level.update(100)
      assert.equal(h.manager.advances,1)
    } finally {h.restore()}
  }
})

test('Ending: clean doorway bypasses damage and sag inside the protected front zone', () => {
  const h=harness()
  try {
    const hole=ENDING_DOOR_HOLE
    assert.equal(hole.clean,1);assert.equal(hole.roof,0)
    assert.ok(hole.center.z-hole.halfSize.z>=6)
    assert.equal(hole.halfSize.z*2,1.3);assert.equal(hole.halfSize.y*2,2.1)
    const batch=h.scene.getObjectByName('ending-carriage-1').children.find(node=>node.material?.userData.endingTimeDamage)
    assert.ok(batch.material.userData.endingTimeDamage.uHoles.value.includes(hole))
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'}
    batch.material.onBeforeCompile(shader)
    assert.match(shader.vertexShader,/if\(uHoles\[h\]\.clean>0\.5\) continue/)
    assert.match(shader.fragmentShader,/if\(uHoles\[h\]\.clean>0\.5\) \{\s*if\(field.y<0\.0 && edge<0\.0\) discard;\s*continue;/)
    h.level.update(0);assert.equal(h.level.door.openness,0)
  } finally {h.restore()}
})

test('Ending: doorway framing, gorge exclusion, owned plates and faithful core construction', t => {
  const h=harness()
  try {
    h.level.update(ENDING_FADE_IN+APPROACH+BRAKE+SETTLE)
    h.scene.updateMatrixWorld(true)
    const carriage=h.scene.getObjectByName('ending-carriage-1')
    const bottom=h.level.door.threshold.clone().applyMatrix4(carriage.matrixWorld)
    const top=h.level.door.threshold.clone().add(new THREE.Vector3(0,2.1,0)).applyMatrix4(carriage.matrixWorld)
    const framing=Math.abs(top.project(h.level.shots[1]).y-bottom.project(h.level.shots[1]).y)/2
    assert.ok(framing>=0.5 && framing<=0.6,'head-height door frame fraction '+framing)
    const c=h.level.shots[2]
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse))
    h.scene.getObjectByName('ending-train').traverse(node=>{
      if(!node.isMesh && !node.isSprite && !node.isPoints)return
      const box=new THREE.Box3().setFromObject(node)
      assert.equal(frustum.intersectsBox(box),false,'C excludes '+node.name)
    })
    const detectiveBox=new THREE.Box3().setFromCenterAndSize(
      h.level.door.threshold.clone().applyMatrix4(carriage.matrixWorld).add(new THREE.Vector3(0,0.9,0)),new THREE.Vector3(1,2,1))
    assert.equal(frustum.intersectsBox(detectiveBox),false)
    for(let i=0;i<3;i++) {
      const shot=h.level.shots[i],aim=shot.getWorldDirection(new THREE.Vector3()).add(shot.position)
      t.diagnostic(`Shot ${'ABC'[i]} position ${JSON.stringify(shot.position)}; aim ${JSON.stringify(aim)}; FOV ${shot.fov}; aspect ${shot.aspect}`)
    }
    t.diagnostic(`B doorway ${framing*100}%; C train/door and conservative detective bounds excluded`)
    const design=h.level.core.design
    assert.equal(design.getObjectByName('chrono-core-orb').geometry.type,'IcosahedronGeometry')
    assert.equal(design.getObjectByName('chrono-core-orb').geometry.parameters.detail,2)
    assert.equal(design.getObjectByName('chrono-core-orb').material.uniforms.uBaseColor.value.getHex(),0x0284c7)
    assert.equal(design.getObjectByName('chrono-core-ring-b').geometry.parameters.radius,0.58)
    assert.equal(design.getObjectByName('chrono-core-base').material.metalness,0.92)
    assert.equal(design.scale.x,0.13)
    const textures=h.level.plate.textures,counts=[0,0,0]
    textures.forEach((texture,index)=>texture.addEventListener('dispose',()=>counts[index]++))
    const other=harness()
    try {
      assert.notEqual(other.level.core.design.getObjectByName('chrono-core-orb').material,
        design.getObjectByName('chrono-core-orb').material)
    } finally {other.restore()}
    h.level.dispose();h.level.dispose();assert.deepEqual(counts,[1,1,1])
  } finally {h.restore()}
})

test('Ending: real Throw skeleton holds and releases the core, completes its visible arc and restores the player', async t => {
  const player=createPlayer()
  const previousParseWindow=globalThis.window
  globalThis.window={URL:globalThis.URL}
  function parseThrow(filename='Throw.fbx') {
    const bytes=fs.readFileSync(new URL('../src/assets/models/detective/'+filename,import.meta.url))
    const manager=new THREE.LoadingManager(),textures=new THREE.TextureLoader(manager)
    textures.load=()=>new THREE.Texture();manager.addHandler(/.*/,textures)
    return new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  }
  const visual=await player.loadVisual({async loadFbx(url) {
    if(url.endsWith('/Throw.fbx'))return parseThrow()
    if(url.endsWith('/Salute.fbx'))return parseThrow('Salute.fbx')
    if(url.endsWith('/Running.fbx'))return parseThrow('Running.fbx')
    if(url.endsWith('/Idle.fbx')) {
      return parseThrow('Idle.fbx')
    }
    const model=new THREE.Group();model.animations=[new THREE.AnimationClip('locomotion',1,[])];return model
  }})
  globalThis.window=previousParseWindow
  const oldPosition=player.mesh.position.clone(),oldRotation=player.mesh.quaternion.clone(),oldVisible=player.mesh.visible
  const h=harness({playerOverride:player})
  await Promise.resolve()
  try {
    h.level.update(0)
    h.level.update(ENDING_FADE_IN+APPROACH+BRAKE+SETTLE+BEAT+DOOR_HOLD+DOOR_OPEN)
    assert.equal(h.level.phase,'holdCore');assert.equal(player.mesh.visible,true)
    assert.equal(visual.actions.salute.loop,THREE.LoopOnce)
    assert.equal(visual.actions.salute.clampWhenFinished,true)
    assert.equal(h.level.durationOf('salute')+DIP_UP,visual.actions.salute.getClip().duration)
    t.diagnostic('Salute duration '+visual.actions.salute.getClip().duration+' s; measured run stance speed '+h.level.runClipSpeed+' m/s')
    h.scene.updateMatrixWorld(true)
    const carriage=h.scene.getObjectByName('ending-carriage-1'),inverse=carriage.matrixWorld.clone().invert(),sole=new THREE.Vector3()
    let lowest=Infinity
    for(const name of ['mixamorigLeftFoot','mixamorigRightFoot','mixamorigLeftToeBase','mixamorigRightToeBase']) {
      const bone=visual.root.getObjectByName(name);assert.ok(bone,name)
      bone.getWorldPosition(sole).applyMatrix4(inverse);lowest=Math.min(lowest,sole.y)
    }
    assert.ok(Math.abs(lowest-h.level.door.threshold.y)<=0.03,'live foot/toe bones on tilted vestibule floor')
    assert.ok(h.level.actorMetrics.headMarginCm>=0,'head below door top')
    assert.equal(h.level.core.payload.parent.name,'mixamorigRightHand')
    assert.ok(h.level.core.payload.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))<1e-6)
    player.updateVisual(HOLD_CORE);h.level.update(HOLD_CORE)
    assert.equal(h.level.phase,'throw')
    assert.equal(visual.actions.throw.loop,THREE.LoopOnce);assert.equal(visual.actions.throw.clampWhenFinished,true)
    assert.ok(Math.abs(visual.actions.throw.getClip().duration-THROW)<1e-5)
    player.updateVisual(THROW_RELEASE-0.01);h.level.update(THROW_RELEASE-0.01)
    assert.equal(h.level.core.payload.parent.name,'mixamorigRightHand')
    player.updateVisual(0.011);h.level.update(0.011)
    assert.equal(h.level.core.payload.parent,h.level.core.root)
    const core=h.level.core,projected=new THREE.Vector3()
    let first=null,last=null,previous=null,entry=null,previousCHeight=Infinity
    const worldPoint=new THREE.Vector3()
    for(let i=0;i<=400;i++) {
      const time=core.flightDuration*i/400
      core.pointAt(time,worldPoint)
      if(previous) assert.ok(worldPoint.distanceTo(previous)<1,'continuous ballistic samples')
      previous=worldPoint.clone()
      projected.copy(worldPoint).project(core.camera)
      if(time>=RELEASE_TO_WHIP+WHIP_SECONDS && Math.abs(projected.x)<1 && Math.abs(projected.y)<1 && projected.z>-1 && projected.z<1)
        entry??={time,ndc:projected.clone()}
      if(time>=RELEASE_TO_WHIP+WHIP_SECONDS && Math.abs(projected.x)<=0.85 && Math.abs(projected.y)<=0.85 && projected.z>-1 && projected.z<1) {
        first??={time,ndc:projected.clone()};last=time
      }
      if(first) {
        assert.ok(Math.abs(projected.x)<=0.85 && Math.abs(projected.y)<=0.85 && projected.z>-1 && projected.z<1,'C remains inside safe frame through impact')
        assert.ok(projected.y<=previousCHeight,'core descends through C')
        previousCHeight=projected.y
      }
    }
    assert.ok(entry && entry.ndc.y>0.97 && Math.abs(entry.ndc.x)<0.95,'C entry is through the top, not the side: '+JSON.stringify(entry))
    const delay=entry.time-RELEASE_TO_WHIP-WHIP_SECONDS
    assert.ok(delay>=0 && delay<=0.6,'C entry delay after whip '+delay)
    t.diagnostic('Core appears '+delay+' s after WHIP_DOWN ends')
    assert.ok(first.ndc.y>0.8,'core enters safe frame from above')
    assert.ok(first && last-first.time>=1.5,'C visibility at least 1.5 seconds')
    const horizontalSpeed=Math.hypot(core.velocity.x,core.velocity.z)
    const launchAngle=THREE.MathUtils.radToDeg(Math.atan2(core.velocity.y,horizontalSpeed))
    assert.ok(launchAngle>=45 && launchAngle<=55,'upward lob preserved after straightening and grounding: '+launchAngle)
    const closestTime=((core.camera.position.x-core.start.x)*core.velocity.x+
      (core.camera.position.z-core.start.z)*core.velocity.z)/(horizontalSpeed*horizontalSpeed)
    core.pointAt(closestTime,worldPoint)
    assert.ok(worldPoint.y>core.camera.position.y,'lob passes above C camera elevation')
    let topExit=null
    for(let i=1;i<=200 && !topExit;i++) {
      const time=RELEASE_TO_WHIP*i/200
      core.pointAt(time,worldPoint).project(h.level.shots[1])
      if(worldPoint.y>1 && worldPoint.z>-1 && worldPoint.z<1)topExit=time
    }
    assert.ok(topExit!==null,'B exit is through its top before whip')
    const exit=core.pointAt(RELEASE_TO_WHIP+WHIP_SECONDS,worldPoint).project(h.level.shots[1])
    assert.ok(Math.abs(exit.x)>1 || Math.abs(exit.y)>1 || exit.z>1 || exit.z< -1,'core leaves B by end of whip')
    t.diagnostic('C top entry '+JSON.stringify(entry)+'; first safe-frame sample '+JSON.stringify(first)+'; visible '+(last-first.time)+' seconds; B exit '+JSON.stringify(exit))
    t.diagnostic('Solved launch angle '+launchAngle+' degrees; speed '+core.velocity.length()+' m/s; closest-to-C time '+closestTime+' s')
    core.pointAt(core.flightDuration,projected);assert.ok(projected.distanceTo(core.impact)<0.5)
    assert.ok(Math.abs(core.impact.y-GORGE_FLOOR_Y)<=1e-6)
    projected.copy(core.impact).project(core.camera)
    assert.ok(Math.abs(projected.x-RIVER_TARGET_NDC.x)<0.03 && Math.abs(projected.y-RIVER_TARGET_NDC.y)<0.03)
    t.diagnostic('Launch '+JSON.stringify(core.start)+'; velocity '+JSON.stringify(core.velocity)+'; flight '+core.flightDuration+' s')
    t.diagnostic('Impact world '+JSON.stringify(core.impact)+'; NDC '+JSON.stringify(projected))
    const throughImpact=core.flightDuration-0.001+1/60
    player.updateVisual(throughImpact)
    h.level.update(throughImpact)
    assert.equal(h.level.phase,'flash');assert.equal(core.light.intensity,0)
    assert.ok(core.payload.position.distanceTo(core.impact)<0.5)
    assert.equal(player.mesh.visible,true)
    h.level.update(SCREEN_FLASH_PEAK);assert.equal(player.mesh.visible,true)
    assert.ok(Number(core.screen.style.opacity)>=0.84)
    // Advance precisely to the returned salute beat, independent of the flash sample offset.
    h.level.update(h.level.durationOf('flash')-h.level.phaseTime+SNAP_HOLD)
    assert.equal(h.level.phase,'dipDown');assert.equal(h.level.activeShot,2)
    h.level.update(DIP_DOWN)
    assert.equal(h.level.phase,'dipUp');assert.equal(h.level.activeShot,1)
    assert.equal(h.overlay.style.opacity,'1');assert.equal(player.mesh.visible,true)
    assert.equal(h.level.activeAnimation,'salute')
    h.level.update(DIP_UP+h.level.durationOf('salute')/2)
    assert.equal(h.level.phase,'salute');assert.ok(Math.abs(visual.actions.salute.time-(DIP_UP+h.level.durationOf('salute')/2))<1e-6)
    h.level.update(h.level.durationOf('salute')-h.level.phaseTime+TURN)
    assert.equal(h.level.phase,'run')
    assert.equal(h.level.activeAnimation,'run')
    h.level.update(RUN/2)
    assert.equal(player.mesh.visible,true)
    const expectedRunTime=(RUN/2*h.level.door.runDistance/RUN/h.level.runClipSpeed)%visual.actions.run.getClip().duration
    assert.ok(Math.abs(visual.actions.run.time-expectedRunTime)<1e-6,'run stride matches translation speed')
    h.level.update(RUN/2)
    assert.equal(h.level.phase,'emptyBeat');assert.equal(player.mesh.visible,false)
    const localExit=player.mesh.position.clone().applyMatrix4(carriage.matrixWorld.clone().invert())
    assert.ok(localExit.distanceTo(h.level.door.runEnd)<0.03,'finishes around the corridor corner')
    assert.equal(h.level.runMetrics.fullyOccluded,true);assert.equal(h.level.runMetrics.hidden,true)
    assert.equal(h.level.door.fullyOccluded(h.level.shots[1].position,player.mesh.position),true)
    h.level.update(EMPTY_BEAT+TILT_UP)
    assert.equal(h.level.phase,'skyHold');assert.equal(player.mesh.visible,false)
    assert.equal(h.overlay.style.opacity,'0');assert.equal(h.overlay.children.length,0)
    h.level.dispose()
    assert.equal(player.mesh.visible,oldVisible)
    assert.deepEqual(player.mesh.position,oldPosition);assertQuaternionClose(player.mesh.quaternion,oldRotation)
    assert.equal(player.getCinematicView(),null)
    assert.equal(player.mesh.getObjectByName('ending-chrono-core'),undefined)
    assert.equal(h.doc.body.children.length,0)
  } finally {h.restore();visual.dispose();disposeObject(player.mesh)}
})

test('Ending: straight textured steam car, B-only track, bounded crane and sky hold', t => {
  const h=harness()
  try {
    h.level.update(ENDING_FADE_IN+APPROACH+BRAKE+SETTLE)
    h.scene.updateMatrixWorld(true)
    const kit=getKitMaterials(),carriages=[]
    for(let i=1;i<=4;i++) {
      const carriage=h.scene.getObjectByName('ending-carriage-'+i);carriages.push(carriage)
      assert.equal(carriage.rotation.y,0);assert.equal(carriage.rotation.z,0)
      const paint=carriage.children.find(node=>node.material?.color?.getHex()===kit.carriageGreen.color.getHex())?.material
      assert.ok(paint);assert.equal(paint.roughness,kit.carriageGreen.roughness)
      assert.equal(paint.metalness,kit.carriageGreen.metalness);assert.equal(paint.clearcoat,kit.carriageGreen.clearcoat)
    }
    const inverseTrack=h.level.track.root.matrixWorld.clone().invert(),point=new THREE.Vector3()
    for(const carriage of carriages)for(const side of [-1,1])for(const z of [-8.25,-5.75,5.75,8.25]) {
      point.set(side*RAIL_OFFSET,0,z).applyMatrix4(carriage.matrixWorld).applyMatrix4(inverseTrack)
      assert.ok(Math.abs(point.y-h.level.track.railTop)<=0.02,'rolling wheel meets rail')
      assert.ok(Math.abs(Math.abs(point.x)-h.level.track.railOffset)<=0.02)
    }
    assert.equal(h.level.track.root.children.length,2,'two merged track draws')
    assert.equal(h.level.track.root.visible,false)
    h.level.update(BEAT+DOOR_HOLD+DOOR_OPEN+HOLD_CORE)
    assert.equal(h.level.activeShot,1);assert.equal(h.level.track.root.visible,true)
    h.level.update(THROW_RELEASE+RELEASE_TO_WHIP+WHIP_SECONDS)
    assert.equal(h.level.activeShot,2);assert.equal(h.level.track.root.visible,false)
    const tiltStart=DURATIONS.slice(0,PHASES.indexOf('tiltUp')).reduce((sum,value)=>sum+value,0)
    const elapsed=DURATIONS.slice(0,PHASES.indexOf('fallC')).reduce((sum,value)=>sum+value,0)
    h.level.update(tiltStart-elapsed)
    assert.equal(h.level.phase,'tiltUp');assert.equal(h.level.track.root.visible,true)
    const fixedPosition=h.renderCamera.position.clone(),startRotation=h.renderCamera.quaternion.clone()
    let maximum=0
    for(let frame=0;frame<=90;frame++) {
      if(frame)h.level.update(TILT_UP/90)
      const rise=h.renderCamera.position.clone().sub(fixedPosition)
      assert.ok(rise.clone().cross(h.level.shots[1].up).length()<1e-8,'crane follows carriage up')
      for(const x of [-1,1])for(const y of [-1,1]) {
        point.set(x,y,0.5).unproject(h.renderCamera).sub(h.renderCamera.position).normalize().multiplyScalar(1500).add(h.renderCamera.position).applyMatrix4(h.level.plate.material.uniforms.uPlateViewProj.value)
        maximum=Math.max(maximum,Math.abs(point.x),Math.abs(point.y))
        assert.ok(Math.abs(point.x)<=0.98 && Math.abs(point.y)<=0.98,'tilt stays inside painting '+JSON.stringify(point))
      }
    }
    assert.equal(h.level.phase,'skyHold');assert.equal(h.overlay.style.opacity,'0');assert.equal(h.overlay.children.length,0)
    assert.ok(Math.abs(h.renderCamera.position.distanceTo(fixedPosition)-CRANE_HEIGHT)<1e-8)
    const final=measureEndingFrame(h.scene.getObjectByName('ending-train'),h.renderCamera,h.level.plate.doorCamera)
    assert.equal(final.visibleTrainBounds,0);assert.equal(final.trainOverlapPercent,0);assert.ok(final.maxPlateNdc<=0.98)
    assert.ok(Math.abs(THREE.MathUtils.radToDeg(startRotation.angleTo(h.renderCamera.quaternion))-TILT_DEGREES)<1e-7)
    assert.equal(h.manager.advances,0)
    h.level.update(SKY_HOLD-0.01);assert.equal(h.manager.advances,0)
    h.level.update(0.02);h.level.update(100);assert.equal(h.manager.advances,1)
    t.diagnostic('Crane '+CRANE_HEIGHT+' m, tilt '+TILT_DEGREES+' degrees; largest plate corner '+maximum+'; final '+JSON.stringify(final))
  } finally {h.restore()}
})

test('Ending: carriage-local eye-height B, steam-room exterior and reserved terrain identifiers', t => {
  const h=harness()
  try {
    h.level.update(ENDING_FADE_IN+APPROACH+BRAKE+SETTLE+BEAT+DOOR_HOLD+DOOR_OPEN)
    h.scene.updateMatrixWorld(true)
    const carriage=h.scene.getObjectByName('ending-carriage-1'),shot=h.level.shots[1]
    const floor=new THREE.Vector3(-1.485,h.level.door.threshold.y,h.level.door.threshold.z).applyMatrix4(carriage.matrixWorld)
    const centre=new THREE.Vector3(-1.485,h.level.door.threshold.y+1.05,h.level.door.threshold.z).applyMatrix4(carriage.matrixWorld).project(shot)
    const angles=new THREE.Euler().setFromQuaternion(shot.quaternion,'YXZ')
    const up=new THREE.Vector3(0,1,0).transformDirection(carriage.matrixWorld)
    const normal=new THREE.Vector3(-1,0,0).transformDirection(carriage.matrixWorld)
    assert.ok(shot.up.distanceTo(up)<1e-10)
    assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(shot.quaternion).distanceTo(up)<1e-10)
    assert.ok(shot.getWorldDirection(new THREE.Vector3()).distanceTo(normal.negate())<1e-10)
    assert.ok(Math.abs(shot.position.clone().sub(floor).dot(up)-DOOR_EYE_HEIGHT)<1e-8)
    assertQuaternionClose(h.level.plate.doorCamera.quaternion,shot.quaternion)
    const roofAngle=measureEndingRoofAngle(carriage,shot)
    assert.ok(Math.abs(roofAngle)<=0.3,'roof line level in B: '+roofAngle)
    assert.ok(Math.abs(centre.x)<1e-10,'door centred horizontally')
    assert.ok(carriage.getObjectByName('ending-steam-solid-panelling'))
    assert.equal(carriage.children.some(node=>node.name==='ending-damage-interior'),false)
    assert.ok(carriage.children.some(node=>node.name==='ending-steam-room-interior'))
    for(const mesh of carriage.children.filter(node=>node.userData.endingWindowBatch)) {
      const p=mesh.geometry.attributes.position
      for(let i=0;i<p.count;i+=3)assert.ok((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3>=0,'no near-side window triangle')
    }
    for(let i=2;i<=4;i++) {
      const other=h.scene.getObjectByName('ending-carriage-'+i)
      assert.ok(other.children.some(node=>node.material?.map?.image===getKitMaterials().carriageWindow.map.image))
      assert.ok(other.children.some(node=>node.name==='ending-damage-interior'))
    }
    assert.equal(PHASES.includes('whipUp'),false);assert.equal(PHASES.includes('title'),false)
    const source=fs.readFileSync(new URL('../src/shaders/terrain-shader.js',import.meta.url),'utf8')
    const reserved=new Set('patch sample common partition active asm class union enum typedef template this resource goto inline noinline public static extern external interface long short half fixed unsigned superp input output sizeof cast namespace using packed'.split(' '))
    const declarations=[...source.matchAll(/\b(?:float|int|bool|vec[234]|mat[234]|sampler2D)\s+(\w+)/g)].map(match=>match[1])
    assert.deepEqual(declarations.filter(name=>reserved.has(name)),[])
    assert.match(source,/float soilVariation = noise\(vWorldPosition.xz \* 0.011\)/)
    t.diagnostic('B position '+JSON.stringify(shot.position)+' FOV '+shot.fov+'; doorway '+JSON.stringify(centre)+'; world pitch/roll '+angles.x+'/'+angles.z+'; roof angle '+roofAngle)
  } finally {h.restore()}
})

test('Ending: outward doors clear the standing volume and the sealed left run is wall-occluded before hiding', t => {
  const h=harness()
  try {
    h.level.update(DURATIONS.slice(0,PHASES.indexOf('holdCore')).reduce((sum,value)=>sum+value,0))
    const door=h.level.door,carriage=h.scene.getObjectByName('ending-carriage-1')
    h.scene.updateMatrixWorld(true)
    assert.equal(door.standingIntersections(),0)
    for(const {hinge,side} of door.hinges) {
      assert.ok(Math.abs(hinge.rotation.y-side*DOOR_OPEN_ANGLE)<1e-10)
      assert.ok(180-Math.abs(THREE.MathUtils.radToDeg(hinge.rotation.y))<=10)
      const bounds=new THREE.Box3()
      hinge.traverse(node=>{
        if(!node.geometry)return
        const matrix=new THREE.Matrix4().multiplyMatrices(door.root.matrixWorld.clone().invert(),node.matrixWorld)
        node.geometry.computeBoundingBox();bounds.union(node.geometry.boundingBox.clone().applyMatrix4(matrix))
      })
      assert.ok(bounds.max.x<=-1.42,'leaves outside the carriage wall')
      assert.ok(side>0?bounds.min.z>=0.61:bounds.max.z<=-0.61,'leaves outside the opening')
    }
    const start=door.sampleRun(0),corner=door.sampleRun(RUN_IN),end=door.sampleRun(door.runDistance)
    assert.equal(RUN_IN,1);assert.ok(RUN_CORRIDOR>=3&&RUN_CORRIDOR<=4)
    assert.ok(start.position.distanceTo(door.threshold)<1e-10)
    assert.ok(Math.abs(corner.position.x-start.position.x-1)<1e-10)
    assert.equal(corner.position.z,start.position.z)
    const before=door.sampleRun(RUN_IN+Math.PI*RUN_RADIUS/2-1e-5)
    const after=door.sampleRun(RUN_IN+Math.PI*RUN_RADIUS/2+1e-5)
    assert.ok(before.tangent.distanceTo(after.tangent)<1e-4,'rounded turn has continuous facing')
    const projectedStart=corner.position.clone().applyMatrix4(carriage.matrixWorld).project(h.level.shots[1])
    const projectedEnd=end.position.clone().applyMatrix4(carriage.matrixWorld).project(h.level.shots[1])
    assert.ok(projectedEnd.x<projectedStart.x,'corridor runs screen-left')
    // Actual raycasts from inside the corridor must hit opaque enclosure in all 26 directions.
    const origin=new THREE.Vector3(0.15,2.5,-2.5).applyMatrix4(door.root.matrixWorld),raycaster=new THREE.Raycaster()
    for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]) {
      if(!x&&!y&&!z)continue
      const direction=new THREE.Vector3(x,y,z).normalize().transformDirection(door.root.matrixWorld)
      raycaster.set(origin,direction)
      assert.ok(raycaster.intersectObject(door.root,true).some(hit=>!hit.object.material.transparent),'sealed corridor direction '+[x,y,z])
    }
    h.level.update(DURATIONS.slice(PHASES.indexOf('holdCore'),PHASES.indexOf('run')).reduce((sum,value)=>sum+value,0))
    assert.equal(h.level.phase,'run')
    let firstOccluded=null
    for(let frame=1;frame<=60;frame++) {
      h.level.update(RUN/60)
      const metrics=h.level.runMetrics,sample=door.sampleRun(metrics.distance)
      const facing=new THREE.Vector3(0,0,1).applyQuaternion(h.player.mesh.quaternion)
      const expected=sample.tangent.clone().transformDirection(carriage.matrixWorld)
      assert.ok(facing.distanceTo(expected)<1e-8,'facing follows path tangent')
      if(metrics.fullyOccluded)firstOccluded??=metrics.distance
      if(frame<60)assert.equal(h.player.mesh.visible,true,'no visibility hide before path end')
      if(!h.player.mesh.visible)assert.equal(metrics.fullyOccluded,true)
    }
    assert.ok(firstOccluded>RUN_IN&&firstOccluded<door.runDistance,'wall occlusion precedes cleanup hide')
    assert.equal(h.level.runMetrics.hidden,true);assert.equal(h.player.mesh.visible,false)
    // Check the final conservative body envelope against the rendered meshes independently.
    const local=door.runEnd.clone();local.z-=door.root.position.z
    const camera=h.level.shots[1].position
    for(const x of [-0.45,0.45])for(const y of [0.08,1,1.95])for(const z of [-0.45,0.45]) {
      const target=new THREE.Vector3(local.x+x,door.threshold.y+y,local.z+z).applyMatrix4(door.root.matrixWorld)
      raycaster.set(camera,target.clone().sub(camera).normalize())
      assert.ok(raycaster.intersectObject(door.root,true).some(hit=>!hit.object.material.transparent&&hit.distance<camera.distanceTo(target)-0.02),'rendered wall occludes full body')
    }
    t.diagnostic('Doors ±'+THREE.MathUtils.radToDeg(DOOR_OPEN_ANGLE)+' degrees; standing intersections 0; path '+door.runDistance+' m; first fully occluded at '+firstOccluded+' m')
  } finally {h.restore()}
})

// Mirror the pivot-local GLSL hole test; weight each cell by its projected
// quadrilateral area, including perspective, camera and crooked carriage pose.
function openingAt(y,z,holes) {
  const fract = value => value-Math.floor(value)
  const hash = (x,y) => fract(Math.sin(x*127.1+y*311.7)*43758.5453)
  const teeth = (p,seed) => {
    const i=Math.floor(p),f=fract(p)
    return ((1-f)*hash(i,seed)+f*hash(i+1,seed))*2-1
  }
  return holes.some(hole => {
    const qx=z-hole.center.z,qy=y-hole.center.y
    return Math.max(Math.abs(qx)-hole.halfSize.z+0.3*teeth(qy*2.3,hole.seed),
      Math.abs(qy)-hole.halfSize.y+0.3*teeth(qx*2.1,hole.seed+7))<0
  })
}

test('Ending: projected openings exceed 35% and the first carriage front is protected', t => {
  const h=harness()
  try {
    h.level.update(0);h.level.update(ENDING_FADE_IN+APPROACH+BRAKE+SETTLE)
    h.scene.updateMatrixWorld(true)
    const vertices=Array.from({length:4},()=>new THREE.Vector3())
    function cellArea(pivot,y,z,dy,dz) {
      const points=[[y,z],[y+dy,z],[y+dy,z+dz],[y,z+dz]]
      for(let k=0;k<4;k++) vertices[k].set(-1.45,...points[k]).applyMatrix4(pivot.matrixWorld).project(h.renderCamera)
      let area=0
      for(let k=0;k<4;k++) area+=vertices[k].x*vertices[(k+1)%4].y-vertices[(k+1)%4].x*vertices[k].y
      return Math.abs(area)*0.5
    }
    for(let i=0;i<4;i++) {
      const pivot=h.scene.getObjectByName('ending-carriage-'+(i+1))
      let total=0,open=0
      for(let iz=0;iz<200;iz++) for(let iy=0;iy<40;iy++) {
        const z=-10+iz*0.1,y=1.25+iy*0.0625,area=cellArea(pivot,y,z,0.0625,0.1)
        total+=area
        if(openingAt(y+0.03125,z+0.05,CARRIAGE_HOLES[i])) open+=area
      }
      const ratio=open/total
      t.diagnostic('Carriage '+(i+1)+' projected side opening: '+(ratio*100).toFixed(2)+'%')
      assert.ok(ratio>=0.35,'carriage '+(i+1)+' opening fraction '+ratio)
      const flaps=pivot.getObjectByName('ending-peeled-metal')
      assert.equal(flaps.userData.flaps.length,CARRIAGE_HOLES[i].length*6)
      if(i===0) {
        for(const flap of flaps.userData.flaps) assert.ok(flap.bounds.max.z<6)
        const frame=pivot.getObjectByName('ending-broken-frame')
        frame.geometry.computeBoundingBox();assert.ok(frame.geometry.boundingBox.max.z<6)
        for(const mesh of pivot.children.filter(node=>node.name==='ending-damage-interior'))
          for(const bounds of mesh.userData.debrisBounds) assert.ok(bounds.max.z<6)
        for(const mesh of pivot.children.filter(node=>node.material?.userData.endingTimeDamage))
          assert.equal(mesh.material.userData.endingTimeDamage.uProtectedFront.value,6)
        for(let z=6;z<=10;z+=0.1) for(let y=1.25;y<=3.75;y+=0.1)
          assert.equal(openingAt(y,z,CARRIAGE_HOLES[0]),false)
      }
      t.diagnostic('Carriage '+(i+1)+': '+flaps.userData.flaps.length+' flaps; '+pivot.getObjectByName('ending-broken-frame').userData.ribCount+' ribs')
    }
  } finally {h.restore()}
})

test('Ending: thin blue tear emission and warm lamp stutter stay active', t => {
  const h=harness()
  try {
    h.level.update(0)
    assert.equal(EDGE_WIDTH,0.025);assert.ok(HALO_WIDTH<=0.06)
    const effects=new Set(), lamps=[]
    const unpatchedCarriages=new Set()
    let patchedCarriageMaterials=0
    h.scene.traverse(node=>{
      for(const material of node.material ? Array.isArray(node.material)?node.material:[node.material] : []) {
        const damage=material.userData.endingTimeDamage,lamp=material.userData.endingLamp
        const carriageNamed=/^carriage-\d+-/.test(node.name)
        if(carriageNamed && !damage)unpatchedCarriages.add(node.name)
        const carriageBatch=carriageNamed && !node.userData.interactionCollider
        if(carriageNamed && node.userData.interactionCollider) {
          assert.match(node.name,/^carriage-[0-3]-collider$/);assert.equal(node.visible,false)
        }
        if(carriageBatch)assert.ok(damage,'carriage batch retains its damage shader')
        if(damage && (carriageBatch || material.customProgramCacheKey()==='ending-time-aging-v3')) {
          if(carriageBatch)patchedCarriageMaterials++
          effects.add(damage)
          const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'}
          material.onBeforeCompile(shader)
          assert.match(shader.fragmentShader,/totalEmissiveRadiance\+=uRift/)
          assert.doesNotMatch(shader.fragmentShader,/fresnel|damageCells/)
          assert.match(shader.fragmentShader,/ageAmount=0\.0/)
          assert.equal(shader.uniforms.uRift,damage.uRift)
          assert.match(shader.fragmentShader,/endingLampFlicker\(uTime,vDamageLocal.z\),uRift\*ageAmount/)
          if(material.map?.image===getKitMaterials().carriageWindow.map.image) assert.equal(material.defines.ENDING_LAMP,1)
        }
        if(lamp) {
          effects.add(lamp);lamps.push(material)
          const shader={uniforms:{},vertexShader:'',fragmentShader:'#include <emissivemap_fragment>'}
          material.onBeforeCompile(shader)
          assert.equal(shader.uniforms.uRift,lamp.uRift)
          assert.match(shader.fragmentShader,/mix\(1\.0,endingLampFlicker\(uTime,2\.1\),uRift\)/)
        }
      }
    })
    assert.ok(patchedCarriageMaterials>12)
    // F3 removes carriage 1's passenger lamps. Each remaining carriage merges
    // two table lamps and three wall lamps into one rift-stutter batch.
    const tableLamp=new THREE.CylinderGeometry(0.08,0.15,0.16,14,1,true)
    const wallLamp=new THREE.CylinderGeometry(0.06,0.09,0.16,8)
    const vertexCount=geometry=>geometry.index?.count??geometry.attributes.position.count
    const expectedLampVertices=2*vertexCount(tableLamp)+3*vertexCount(wallLamp)
    tableLamp.dispose();wallLamp.dispose()
    const passengerCarriages=[2,3,4],locomotiveLamps=[]
    h.scene.getObjectByName('ending-hero-locomotive').traverse(node=>{
      if(node.material?.userData.endingLamp)locomotiveLamps.push(node)
    })
    assert.equal(locomotiveLamps.length,1,'locomotive cab retains its rift lamp batch')
    assert.equal(lamps.length,1+passengerCarriages.length)
    for(const i of [1,...passengerCarriages]) {
      const carriage=h.scene.getObjectByName('ending-carriage-'+i),batches=[],glows=[]
      carriage.traverse(node=>{
        if(node.material?.userData.endingLamp)batches.push(node)
        if(node.name==='ending-interior-lamp-glows')glows.push(node)
      })
      assert.equal(batches.length,i===1?0:1,'rift lamp batch count for carriage '+i)
      assert.equal(glows.length,i===1?0:1,'glow batch count for carriage '+i)
      if(i===1)continue
      assert.equal(batches[0].geometry.attributes.position.count,expectedLampVertices)
      assert.equal(glows[0].geometry.attributes.position.count,5*4)
      assert.equal(glows[0].material.uniforms.uRift.value,1)
      assert.match(glows[0].material.fragmentShader,/mix\(1\.0,endingLampFlicker\(uTime,2\.1\),uRift\)/)
    }
    assert.deepEqual([...unpatchedCarriages].sort(),[0,1,2,3].map(i=>`carriage-${i}-collider`))
    t.diagnostic('Unpatched carriage meshes (hidden interaction boxes only): '+[...unpatchedCarriages].sort().join(', '))
    for(const uniforms of effects) assert.equal(uniforms.uRift.value,1)
    h.level.update(TOTAL-0.1)
    for(const uniforms of effects) assert.equal(uniforms.uRift.value,1)
  } finally {h.restore()}
})

test('Ending: creating and disposing preserves live Level 1 and Level 2 geometry/materials', () => {
  const platform=createTrain(), interior=createCarriageEnvironment()
  const roots=[platform.train,platform.stationSteam,interior.root], geometries=new Set(),materials=new Set(),resources=new Set()
  for(const root of roots) root.traverse(node=>{
    if(node.geometry) {geometries.add(node.geometry);resources.add(node.geometry)}
    for(const material of node.material ? Array.isArray(node.material)?node.material:[node.material] : []) {
      materials.add(material);resources.add(material)
      for(const value of Object.values(material)) if(value?.isTexture) resources.add(value)
    }
  })
  function snapshot() {
    return {
      geometries:[...geometries].map(geometry=>({
        attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([key,value])=>[key,value.array.slice()])),
        index:geometry.index?.array.slice(),groups:geometry.groups.map(group=>({...group}))
      })),
      materials:[...materials].map(material=>({
        color:material.color?.getHex(),emissive:material.emissive?.getHex(),intensity:material.emissiveIntensity,
        roughness:material.roughness,metalness:material.metalness,side:material.side,version:material.version,
        compile:material.onBeforeCompile,userData:JSON.stringify(material.userData),
        textures:Object.values(material).filter(value=>value?.isTexture).map(texture=>({
          texture,source:texture.source,version:texture.version,colorSpace:texture.colorSpace,
          repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),wrapS:texture.wrapS,wrapT:texture.wrapT
        }))
      }))
    }
  }
  const before=snapshot()
  let disposals=0
  const onDispose=()=>disposals++
  for(const resource of resources) resource.addEventListener('dispose',onDispose)
  const h=harness()
  try {
    assert.deepEqual(snapshot(),before)
    h.scene.traverse(node=>{
      if(node.geometry) assert.equal(geometries.has(node.geometry),false)
      for(const material of node.material ? Array.isArray(node.material)?node.material:[node.material] : [])
        assert.equal(materials.has(material),false)
    })
    h.level.update(TOTAL+1);h.level.dispose()
    assert.deepEqual(snapshot(),before);assert.equal(disposals,0)
  } finally {
    h.restore()
    for(const resource of resources) resource.removeEventListener('dispose',onDispose)
    disposeObject(roots)
  }
})

function fakeEndingAudioContext() {
  const sources = [], nodes = []
  const parameter = () => ({
    value: 0, setValueAtTime(value) { this.value = value }, setTargetAtTime(value) { this.value = value },
    cancelScheduledValues() {}
  })
  const node = (source = false) => {
    const value = { gain: parameter(), frequency: parameter(), detune: parameter(), Q: parameter(),
      connected: false, stopped: false, started: false, destinations: [],
      connect(destination) { this.connected = true; this.destinations.push(destination); return destination },
      disconnect() { this.connected = false },
      start() { this.started = true }, stop() { this.stopped = true } }
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

test('Ending: story sounds share the master bus and skip/dispose stop every source', () => {
  const silent=createEndingAudio({context:()=>null,output:()=>null})
  assert.doesNotThrow(()=>{silent.door();silent.throw();silent.impact();silent.fadeOut();silent.dispose()})
  for(const action of ['skip','dispose']) {
    const mock=fakeEndingAudioContext()
    let audio
    const h=harness({audioFactory:()=>audio=createEndingAudio({context:()=>mock.context,output:()=>mock.master})})
    try {
      h.level.update(0)
      h.level.update(ENDING_FADE_IN+APPROACH+0.1)
      assert.equal(mock.sources.length,5,'braking sources start in game')
      h.level.update(BRAKE-0.1+SETTLE+BEAT+DOOR_HOLD+0.000001)
      assert.equal(h.level.phase,'doorOpen');assert.equal(mock.sources.length,7,'latch and slide start at door opening')
      h.level.update(DOOR_OPEN+HOLD_CORE)
      assert.equal(h.level.phase,'throw');assert.equal(mock.sources.length,8,'whoosh starts at throw')
      h.level.update(THROW_RELEASE+RELEASE_TO_WHIP+WHIP_SECONDS+FALL)
      assert.equal(h.level.phase,'flash');assert.equal(mock.sources.length,13,'whip, impact layers and ambient start at impact')
      assert.ok(mock.sources.every(source=>source.started),'every created sound is started')
      const reachesMaster=(node,seen=new Set())=>node===mock.master || (!seen.has(node) && (seen.add(node),node.destinations.some(next=>reachesMaster(next,seen))))
      assert.ok(mock.sources.slice(5).every(source=>reachesMaster(source)),'every story source reaches the shared master')
      h.level.update(0.1)
      assert.ok(audio.voiceCount>=2,'boom tail and ambient remain active')
      if(action==='skip')h.skip()
      else h.level.dispose()
      assert.equal(audio.voiceCount,0)
      assert.ok(mock.sources.every(source=>source.stopped))
      assert.ok(mock.nodes.filter(node=>node!==mock.master).every(node=>!node.connected))
    } finally {h.restore()}
  }
})

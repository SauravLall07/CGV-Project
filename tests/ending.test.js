import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createEndingLevel, ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, HOLD, FADE_OUT,
  TITLE_HOLD, START_CENTER_Z, ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET, ENDING_CAMERA_FOV } from '../src/levels/ending.js'
import { STOP_CENTER_Z, STOP_NOSE_Z } from '../src/environment/ending-train.js'
import { createTrain } from '../src/entities/train.js'
import { getKitMaterials } from '../src/environment/level1-kit/kit-materials.js'
import { TRAIN_START_NOSE_Z } from '../src/environment/ending-landmarks.js'

const TITLE_FADE = 0.6
const TOTAL = ENDING_FADE_IN + APPROACH + BRAKE + SETTLE + HOLD + FADE_OUT + TITLE_FADE + TITLE_HOLD

function harness() {
  const previousDocument = globalThis.document
  const doc = { activeElement: null }
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.style = {}; this.children = [] }
    appendChild(child) { this.children.push(child); child.parent = this; return child }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
    focus() { doc.activeElement = this }
    blur() { if (doc.activeElement === this) doc.activeElement = null }
  }
  doc.createElement = tag => tag === 'canvas' ? previousDocument.createElement('canvas') : new Element(tag)
  // Use the registered canvas fixture; simulate only the TextureLoader image events.
  doc.createElementNS = (_namespace, tag) => {
    const image = new Element(tag)
    image.width = image.height = 128
    image.complete = true
    Object.defineProperty(image, 'src', { set() { image.dispatchEvent(new Event('load')) } })
    return image
  }
  doc.body = doc.createElement('body')
  globalThis.document = doc
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x123456, 10, 30)
  scene.background = new THREE.Color(0x112233)
  const originalFog = scene.fog, originalBackground = scene.background
  let cinematicView = null
  let callback = null
  let begins = 0
  const manager = { state: 'Ending', advances: 0, advance() { this.advances++; this.state = 'Complete' } }
  const player = { mesh: new THREE.Group(), setCinematicView(value) { cinematicView = value }, cancelScriptedWalk() {} }
  const hud = { root: doc.createElement('div'), setVisible(value) { this.root.style.display = value ? 'block' : 'none' },
    showCinematicSkip(value) { callback = value }, hideCinematicSkip() { callback = null } }
  hud.root.style.display = 'block'
  const renderCamera = new THREE.PerspectiveCamera(67, 16 / 9, 0.1, 1800)
  const originalFov = renderCamera.fov
  const defaultGrade = { warmth: 0.04, saturation: 1.06, vignette: 0.34 }
  let grade = { ...defaultGrade }
  const post = { setGrade(value) { grade = { ...defaultGrade, ...value } }, resetGrade() { grade = { ...defaultGrade } } }
  const level = createEndingLevel({ scene, player, hud, renderCamera, post, camera: { setMode() {} },
    beginCinematic() { begins++ }, advance: () => manager.advance() })
  // Match the manager's post-factory setPose clearing the cinematic view.
  player.setCinematicView(null)
  const overlay = doc.body.children.find(child => child.id === 'ending-overlay')
  return { doc, scene, player, hud, manager, level, overlay, originalFog, originalBackground, renderCamera, originalFov,
    get view() { return cinematicView }, get skip() { return callback }, get begins() { return begins },
    get grade() { return grade }, defaultGrade,
    restore() { level.dispose(); globalThis.document = previousDocument } }
}

test('Ending: full timeline advances once, actor stays hidden, camera/stop and geometry budget hold', (t) => {
  for (const fps of [30, 60, 144]) {
    const h = harness()
    try {
      assert.equal(h.view, null)
      assert.equal(h.level.isCinematic, true)
      h.level.update(0)
      assert.equal(h.renderCamera.fov, ENDING_CAMERA_FOV)
      assert.equal(h.begins, 1)
      assert.deepEqual(h.view.position, ENDING_CAMERA_POSITION)
      assert.deepEqual(h.view.initialPosition, h.view.position)
      assert.equal(h.view.moveSeconds, 1)
      const train = h.scene.getObjectByName('ending-train')
      const locomotive = h.scene.getObjectByName('ending-locomotive')
      const nose = new THREE.Box3(), part = new THREE.Box3()
      function measureLocomotive() {
        train.updateMatrixWorld(true)
        nose.makeEmpty()
        locomotive.traverse(node => {
          if (!node.isMesh || node.name === 'ending-headlight-cone') return
          node.geometry.computeBoundingBox()
          part.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld)
          nose.union(part)
        })
        return nose.min.z
      }
      assert.ok(measureLocomotive() >= STOP_NOSE_Z + 50, 'initial physical nose is at least 50 m behind its stop')
      assert.ok(Math.abs(measureLocomotive() - TRAIN_START_NOSE_Z) < 0.01, 'measured start nose matches analytic motion')
      assert.ok(APPROACH >= 2.2 && APPROACH <= 3.2)
      assert.equal(train.position.x, 0)
      const camera = new THREE.PerspectiveCamera(ENDING_CAMERA_FOV, 16 / 9, 0.1, 1800)
      camera.position.copy(ENDING_CAMERA_POSITION); camera.lookAt(ENDING_CAMERA_TARGET)
      camera.updateMatrixWorld(true)
      const viewDirection = ENDING_CAMERA_TARGET.clone().sub(ENDING_CAMERA_POSITION).normalize()
      const downAngle = THREE.MathUtils.radToDeg(Math.asin(-viewDirection.y))
      assert.ok(downAngle >= 15 && downAngle <= 25, `downward view angle: ${downAngle}`)
      const gapProjection = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      for (const z of [0, -12]) for (const x of [-1.6, 1.6]) {
        const edge = new THREE.Vector3(x, 0, z).project(camera)
        assert.ok(Math.abs(edge.x) < 1 && Math.abs(edge.y) < 1, 'both gap edges fit in frame')
        gapProjection.minX = Math.min(gapProjection.minX, edge.x)
        gapProjection.maxX = Math.max(gapProjection.maxX, edge.x)
        gapProjection.minY = Math.min(gapProjection.minY, edge.y)
        gapProjection.maxY = Math.max(gapProjection.maxY, edge.y)
      }
      const distantNose = new THREE.Vector3(0, 0.25, TRAIN_START_NOSE_Z).project(camera)
      assert.ok(Math.abs(distantNose.x) > 1 || Math.abs(distantNose.y) > 1, 'starting nose is outside the camera frustum')
      const clearance = h.scene.getObjectByName('ending-gorge').userData.clearance
      const gorge = h.scene.getObjectByName('ending-gorge')
      function checkNDC(point, target, label) {
        assert.ok(Math.abs(point.x - target[0]) <= 0.08 && Math.abs(point.y - target[1]) <= 0.08,
          `${label}: (${point.x}, ${point.y}) vs (${target})`)
      }
      // Visible deck corner, pier cap, and centre of the abutment's exposed front face.
      const breakProjection = new THREE.Vector3(1.6, -0.41, 0).project(camera)
      const pierProjection = new THREE.Vector3(0, -0.7, 30).project(camera)
      const abutmentProjection = new THREE.Vector3(0, -8.2, -18).project(camera)
      checkNDC(breakProjection, [0.32, -0.10], 'break edge')
      checkNDC(pierProjection, [-0.48, 0.10], 'pier')
      checkNDC(abutmentProjection, [0.80, -0.38], 'far abutment')
      const moonProjection = h.scene.getObjectByName('ending-round-moon').position.clone().project(camera)
      checkNDC(moonProjection, [0.78, 0.88], 'moon')
      const river = h.scene.getObjectByName('ending-gorge-river')
      assert.ok(river.material.isShaderMaterial)
      assert.ok(river.material.uniforms.uTime)
      assert.equal(river.material.uniforms.uFlowScale.value, 1)
      assert.equal(h.grade.warmth, 0)
      assert.equal(h.scene.fog.near, 90); assert.equal(h.scene.fog.far, 900)
      let nearestPost = Infinity
      for (const post of gorge.userData.guardPosts) {
        const box = new THREE.Box3(new THREE.Vector3(post.x - 0.06, 0, post.z - 0.06),
          new THREE.Vector3(post.x + 0.06, 1.1, post.z + 0.06))
        nearestPost = Math.min(nearestPost, box.distanceToPoint(ENDING_CAMERA_POSITION))
      }
      assert.ok(nearestPost >= 0.6, 'camera clears every guard post')
      assert.ok(clearance.maxHeight <= -6)
      assert.ok(clearance.maxPropHeight <= -6)
      assert.ok(clearance.nearestPropDistance >= 8)
      assert.ok(ENDING_CAMERA_POSITION.y - clearance.cameraTerrainMax >= 8)
      if (fps === 60) t.diagnostic(`Valley clearance: ${JSON.stringify(clearance)}`)
      let calls = 0, triangles = 0, heroCalls = 0, heroTriangles = 0, puffs = 0
      h.scene.traverse(node => {
        if (!node.isMesh && !node.isPoints) return
        assert.equal(node.castShadow, false)
        for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return
        calls++
        if (node.isPoints) { puffs += node.geometry.attributes.position.count; return }
        triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1)
        for (let parent = node; parent; parent = parent.parent) if (parent.name === 'ending-hero-locomotive') {
          heroCalls += node.material.side === THREE.DoubleSide && node.material.transparent ? 2 : 1
          heroTriangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1)
        }
      })
      assert.ok(calls <= 350, `allocated draws: ${calls}`)
      assert.ok(triangles <= 600000, `allocated triangles: ${triangles}`)
      assert.ok(heroCalls <= 12, `new locomotive draws: ${heroCalls}`)
      assert.ok(heroTriangles <= 25000, `new locomotive triangles: ${heroTriangles}`)
      assert.ok(puffs <= 40)
      if (fps === 60) {
        h.scene.updateMatrixWorld(true)
        const terrainPositions = h.scene.getObjectByName('ending-canyon-terrain').geometry.attributes.position
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
        let maximumFacetEdge = 0
        for (let i = 0; i < terrainPositions.count; i += 3) {
          a.fromBufferAttribute(terrainPositions, i); b.fromBufferAttribute(terrainPositions, i + 1); c.fromBufferAttribute(terrainPositions, i + 2)
          maximumFacetEdge = Math.max(maximumFacetEdge, a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
        }
        assert.ok(maximumFacetEdge <= 4.01, `terrain facet edge: ${maximumFacetEdge}`)
        t.diagnostic(`Maximum terrain facet edge: ${maximumFacetEdge}`)
        const sample = new THREE.Vector3(), viewPoint = new THREE.Vector3()
        const ridgeBins = Array(16).fill(-Infinity)
        h.scene.getObjectByName('moonlit-mountain-ring').traverse(node => {
          if (!node.isMesh) return
          const position = node.geometry.attributes.position
          for (let i = 0; i < position.count; i++) {
            sample.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld)
            viewPoint.copy(sample).applyMatrix4(camera.matrixWorldInverse)
            sample.project(camera)
            if (viewPoint.z >= 0 || Math.abs(sample.x) >= 1) continue
            const bin = Math.min(15, Math.floor((sample.x + 1) * 8))
            ridgeBins[bin] = Math.max(ridgeBins[bin], sample.y)
          }
        })
        const riverSamples = [[0.62, 0.15], [0.47, -0.90]].map(target => {
          let error = Infinity, point = null
          const position = river.geometry.attributes.position
          for (let i = 0; i < position.count; i++) {
            sample.fromBufferAttribute(position, i).project(camera)
            if (Math.abs(sample.x) > 1 || Math.abs(sample.y) > 1) continue
            const distance = Math.hypot(sample.x - target[0], sample.y - target[1])
            if (distance < error) { error = distance; point = { x: sample.x, y: sample.y } }
          }
          return { target, point }
        })
        t.diagnostic(`Background: ${JSON.stringify({ ridgeMin: Math.min(...ridgeBins), ridgeMax: Math.max(...ridgeBins), riverSamples })}`)
      }
      if (fps === 60) t.diagnostic(`Layout/budget: ${JSON.stringify({ breakProjection, pierProjection, nearestPost,
        abutmentProjection, moonProjection, distantNose, downAngle,
        scenery: h.scene.getObjectByName('ending-landmarks').userData.sceneryCounts,
        hiddenGroundChunks: gorge.userData.hiddenGroundChunks,
        retainedValleyFoliage: gorge.userData.retainedValleyFoliage, bents: gorge.userData.bentCount,
        removedInstances: gorge.userData.removedInstances, heroCalls, heroTriangles, puffs, APPROACH })}`)
      if (fps === 60) t.diagnostic(`Ending allocated geometry: ${calls} mesh draws, ${triangles} triangles (before culling/postprocessing)`)
      let elapsedTime = 0
      let approachChecked = false
      let stopReported = false
      let minimumNoseZ = measureLocomotive()
      while (elapsedTime < TOTAL - 0.01) {
        const dt = Math.min(1 / fps, TOTAL - 0.01 - elapsedTime,
          elapsedTime < ENDING_FADE_IN ? ENDING_FADE_IN - elapsedTime : Infinity)
        h.level.update(dt); elapsedTime += dt
        assert.equal(h.player.mesh.visible, false)
        const noseZ = measureLocomotive()
        minimumNoseZ = Math.min(minimumNoseZ, noseZ)
        assert.ok(noseZ > 0, 'physical locomotive never crosses the broken end at any sampled time')
        if (!approachChecked && elapsedTime >= ENDING_FADE_IN) {
          approachChecked = true
          assert.ok(noseZ >= STOP_NOSE_Z + 50, 'physical nose is at least 50 m behind its stop at APPROACH start')
          if (fps === 60) t.diagnostic(`Approach-start physical nose Z: ${noseZ}`)
        }
        if (elapsedTime >= ENDING_FADE_IN + APPROACH + BRAKE + SETTLE) {
          assert.ok(Math.abs(noseZ - STOP_NOSE_Z) <= 0.1, `settled physical nose Z: ${noseZ}`)
          const noseProjection = new THREE.Vector3(0, 3.55, noseZ + 1.47).project(camera)
          checkNDC(noseProjection, [0.22, 0.27], 'headlight/nose')
          const tail = h.scene.getObjectByName('ending-carriage-4')
          const tailBounds = new THREE.Box3().setFromObject(tail)
          const tailProjection = new THREE.Vector3(0, 3, tailBounds.max.z).project(camera)
          const first = new THREE.Box3().setFromObject(h.scene.getObjectByName('ending-carriage-1'))
          const locomotiveTerrain = gorge.userData.heightAt(0, (nose.min.z + nose.max.z) / 2)
          const firstCarriageFrontTerrain = gorge.userData.heightAt(0, first.min.z)
          assert.ok(locomotiveTerrain <= -40, `terrain beneath locomotive: ${locomotiveTerrain}`)
          assert.ok(firstCarriageFrontTerrain <= -40, `terrain beneath first carriage front: ${firstCarriageFrontTerrain}`)
          if (fps === 60 && !stopReported) {
            stopReported = true
            const corner = new THREE.Vector3()
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
            for (const x of [nose.min.x, nose.max.x]) for (const y of [nose.min.y, nose.max.y]) for (const z of [nose.min.z, nose.max.z]) {
              corner.set(x, y, z).project(camera)
              minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x)
              minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y)
            }
            assert.ok((maxX - minX) / 2 >= 0.14 && (maxX - minX) / 2 <= 0.20,
              `locomotive frame width: ${(maxX - minX) / 2}`)
            // Exact point-to-triangle distance over visible scene geometry, including instances.
            const triangle = new THREE.Triangle(), closest = new THREE.Vector3()
            const instance = new THREE.Matrix4(), world = new THREE.Matrix4()
            let nearestDistance = Infinity, nearestMesh = ''
            h.scene.updateMatrixWorld(true)
            h.scene.traverse(node => {
              if (!node.isMesh) return
              for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return
              const position = node.geometry.attributes.position, index = node.geometry.index
              const count = index?.count ?? position.count
              for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
                if (node.isInstancedMesh) {
                  node.getMatrixAt(i, instance); world.multiplyMatrices(node.matrixWorld, instance)
                } else world.copy(node.matrixWorld)
                for (let vertex = 0; vertex < count; vertex += 3) {
                  triangle.a.fromBufferAttribute(position, index ? index.getX(vertex) : vertex).applyMatrix4(world)
                  triangle.b.fromBufferAttribute(position, index ? index.getX(vertex + 1) : vertex + 1).applyMatrix4(world)
                  triangle.c.fromBufferAttribute(position, index ? index.getX(vertex + 2) : vertex + 2).applyMatrix4(world)
                  triangle.closestPointToPoint(ENDING_CAMERA_POSITION, closest)
                  const distance = closest.distanceTo(ENDING_CAMERA_POSITION)
                  if (distance < nearestDistance) { nearestDistance = distance; nearestMesh = node.name || node.type }
                }
              }
            })
            assert.ok(nearestDistance >= 8, `camera-to-nearest-mesh distance: ${nearestDistance}`)
            const coneDirection = new THREE.Vector3(0, 0, 1).transformDirection(
              h.scene.getObjectByName('ending-headlight-cone').matrixWorld)
            assert.ok(coneDirection.z < -0.99, 'headlight points along world -Z')
            t.diagnostic(`Composition: ${JSON.stringify({ noseZ, locomotiveFrameWidth: (maxX - minX) / 2,
              locomotiveFrameHeight: (maxY - minY) / 2, noseProjection, coneDirection, tailProjection,
              locomotiveTerrain, firstCarriageFrontTerrain,
              gapProjection, nearestMesh, nearestDistance })}`)
          }
        }
      }
      assert.equal(approachChecked, true)
      if (fps === 60) t.diagnostic(`Minimum physical nose Z over timeline: ${minimumNoseZ}`)
      assert.equal(h.manager.advances, 0)
      assert.ok(Math.abs(STOP_CENTER_Z - 7 - STOP_NOSE_Z) < 1e-9)
      assert.equal(h.overlay.children[0].style.opacity, '1', 'title holds fully visible for 2.5 seconds')
      h.level.update(0.02)
      assert.equal(h.manager.state, 'Complete')
      assert.equal(h.manager.advances, 1)
      h.level.update(100)
      assert.equal(h.manager.advances, 1)
      assert.equal(h.begins, 1)
    } finally { h.restore() }
  }
})

test('Ending: skip uses fade/title and advances once despite repeated or stale activation', () => {
  const h = harness()
  try {
    h.level.update(0)
    const staleSkip = h.skip
    const button = h.doc.activeElement
    assert.equal(button.tagName, 'BUTTON')
    button.dispatchEvent(new Event('click'))
    staleSkip(); button.dispatchEvent(new Event('click'))
    assert.equal(h.manager.advances, 0)
    h.level.update(FADE_OUT + TITLE_FADE + TITLE_HOLD - 0.01)
    assert.equal(h.manager.advances, 0)
    h.level.update(0.02)
    staleSkip(); h.level.update(100)
    assert.equal(h.manager.advances, 1)
  } finally { h.restore() }
})

test('Ending: disposal after completion is idempotent and restores scene/UI/player ownership', () => {
  const h = harness()
  try {
    h.level.update(0)
    const staleSkip = h.skip
    h.level.update(TOTAL + 1)
    assert.equal(h.manager.advances, 1)
    assert.doesNotThrow(() => { h.level.dispose(); h.level.dispose() })
    assert.equal(h.renderCamera.fov, h.originalFov, 'ending restores the previous camera FOV')
    assert.deepEqual(h.grade, h.defaultGrade, 'ending restores the incoming default grade')
    assert.equal(h.scene.children.length, 0)
    assert.equal(h.scene.fog, h.originalFog)
    assert.equal(h.scene.background, h.originalBackground)
    assert.equal(h.doc.body.children.length, 0)
    assert.equal(h.hud.root.style.display, 'block')
    assert.equal(h.player.mesh.visible, true)
    assert.equal(h.view, null)
    staleSkip(); h.level.update(100)
    assert.equal(h.manager.advances, 1)
  } finally { h.restore() }
})

test('Ending: teardown leaves cached kit materials/maps valid for a fresh platform train', () => {
  const kit = getKitMaterials()
  const cachedMaterials = new Set(Object.values(kit).flat().filter(value => value?.isMaterial))
  const watched = new Set(cachedMaterials)
  for (const material of cachedMaterials) for (const value of Object.values(material)) if (value?.isTexture) watched.add(value)
  let sharedDisposals = 0
  const onDispose = () => { sharedDisposals++ }
  for (const resource of watched) resource.addEventListener('dispose', onDispose)
  const h = harness()
  let fresh = null
  try {
    const ending = h.scene.getObjectByName('ending-real-train')
    ending.traverse(node => {
      if (!node.material) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        assert.equal(cachedMaterials.has(material), false, 'all ending materials are owned clones')
        for (const value of Object.values(material)) if (value?.isTexture) assert.equal(watched.has(value), false)
      }
    })
    h.level.update(TOTAL + 1)
    h.level.dispose()
    assert.equal(sharedDisposals, 0, 'ending does not dispose cached materials or map wrappers')
    fresh = createTrain()
    assert.equal(getKitMaterials(), kit, 'ending never resets the shared kit cache')
    let sharedMeshes = 0
    fresh.train.traverse(node => {
      if (cachedMaterials.has(node.material)) {
        sharedMeshes++
        assert.ok(node.geometry.attributes.position.count > 0)
        assert.ok(node.material.isMaterial)
        if (node.material.map) assert.ok(node.material.map.image)
      }
    })
    assert.ok(sharedMeshes > 0, 'fresh platform train still references the intact kit')
    assert.equal(sharedDisposals, 0)
  } finally {
    // Fresh factory geometry and unique materials are ours; cached kit resources remain live.
    if (fresh) {
      const geometries = new Set(), uniqueMaterials = new Set()
      for (const root of [fresh.train, fresh.stationSteam]) root.traverse(node => {
        if (node.geometry) geometries.add(node.geometry)
        if (node.material && !cachedMaterials.has(node.material)) uniqueMaterials.add(node.material)
      })
      geometries.forEach(geometry => geometry.dispose())
      uniqueMaterials.forEach(material => material.dispose())
    }
    h.restore()
    for (const resource of watched) resource.removeEventListener('dispose', onDispose)
  }
})

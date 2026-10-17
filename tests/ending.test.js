import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createEndingLevel, ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, HOLD, FADE_OUT,
  TITLE_HOLD, START_CENTER_X, ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET } from '../src/levels/ending.js'
import { STOP_CENTER_X, STOP_NOSE_X } from '../src/environment/ending-train.js'

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
  doc.createElement = tag => new Element(tag)
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
  const level = createEndingLevel({ scene, player, hud, camera: { setMode() {} },
    beginCinematic() { begins++ }, advance: () => manager.advance() })
  // Match the manager's post-factory setPose clearing the cinematic view.
  player.setCinematicView(null)
  const overlay = doc.body.children.find(child => child.id === 'ending-overlay')
  return { doc, scene, player, hud, manager, level, overlay, originalFog, originalBackground,
    get view() { return cinematicView }, get skip() { return callback }, get begins() { return begins },
    restore() { level.dispose(); globalThis.document = previousDocument } }
}

test('Ending: full timeline advances once, actor stays hidden, camera/stop and geometry budget hold', (t) => {
  for (const fps of [30, 60, 144]) {
    const h = harness()
    try {
      assert.equal(h.view, null)
      assert.equal(h.level.isCinematic, true)
      h.level.update(0)
      assert.equal(h.begins, 1)
      assert.deepEqual(h.view.position, ENDING_CAMERA_POSITION)
      assert.deepEqual(h.view.initialPosition, h.view.position)
      assert.equal(h.view.moveSeconds, 1)
      const train = h.scene.getObjectByName('ending-train')
      assert.equal(train.position.x, START_CENTER_X)
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1800)
      camera.position.copy(ENDING_CAMERA_POSITION); camera.lookAt(ENDING_CAMERA_TARGET)
      camera.updateMatrixWorld(true)
      const leftEnd = new THREE.Vector3(STOP_CENTER_X - 71.2, 4.5, 1.8).project(camera)
      assert.ok(Math.abs(leftEnd.x) < 1 && Math.abs(leftEnd.y) < 1, 'rear fits corrected camera at default FOV/aspect')
      let calls = 0, triangles = 0
      h.scene.traverse(node => {
        if (!node.isMesh) return
        calls++
        triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1)
        assert.equal(node.castShadow, false)
      })
      assert.ok(calls <= 150, `allocated mesh draws: ${calls}`)
      assert.ok(triangles <= 250000, `allocated triangles: ${triangles}`)
      if (fps === 60) t.diagnostic(`Ending allocated geometry: ${calls} mesh draws, ${triangles} triangles (before culling/postprocessing)`)
      let elapsedTime = 0
      while (elapsedTime < TOTAL - 0.01) {
        const dt = Math.min(1 / fps, TOTAL - 0.01 - elapsedTime)
        h.level.update(dt); elapsedTime += dt
        assert.equal(h.player.mesh.visible, false)
        if (elapsedTime >= ENDING_FADE_IN + APPROACH + BRAKE) {
          assert.equal(train.position.x, STOP_CENTER_X)
          train.updateMatrixWorld(true)
          const nose = new THREE.Box3().setFromObject(h.scene.getObjectByName('ending-locomotive'))
          // Exclude the headlight cone from the physical nose envelope below.
          assert.ok(nose.max.x < 9, 'headlight cone ends above, before the far-stub interior')
        }
      }
      assert.equal(h.manager.advances, 0)
      assert.ok(Math.abs(STOP_CENTER_X + 7 - STOP_NOSE_X) < 1e-9)
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

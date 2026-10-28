import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { createPlayerView } from '../src/cameras/player-view.js'
import { createThirdPersonCamera } from '../src/cameras/third-person-camera.js'
import { createCinematicSkip } from '../src/ui/cinematic-skip.js'
import { createRespawnSystem } from '../src/systems/respawn.js'
import { resolveInputState } from '../src/core/input-state.js'

function installDocument() {
  const previous = globalThis.document
  const doc = new EventTarget()
  doc.activeElement = null
  doc.pointerLockElement = null
  doc.exitPointerLock = () => {doc.pointerLockElement = null}
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.style = {}; this.children = [] }
    appendChild(child) {this.children.push(child); child.parent = this}
    remove() {this.parent.children = this.parent.children.filter(n=>n!==this)}
    focus() {doc.activeElement = this}
    blur() {if(doc.activeElement===this) doc.activeElement=null}
  }
  doc.createElement = tag => new Element(tag)
  globalThis.document = doc
  return { doc, restore() {globalThis.document=previous} }
}

test('death and automatic respawn retain mouse capture in both views; Escape still pauses', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const syncSource = source.slice(source.indexOf('function syncInputState()'), source.indexOf('\nfunction setPaused(value)'))
  const lockStart = source.indexOf('playerView.onLockLost(() => {')
  const lockSource = source.slice(lockStart, source.indexOf('\n})', lockStart) + 3)
  for (const mode of ['first', 'third']) {
    const { doc, restore } = installDocument()
    const canvas = doc.createElement('canvas')
    let requests = 0, releases = 0, paused = false, keyboardEnabled, interactionEnabled
    canvas.requestPointerLock = () => { requests++; doc.pointerLockElement = canvas }
    doc.exitPointerLock = () => { releases++; doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange')) }
    const player = { mesh: new THREE.Group(), setPose(position) { this.mesh.position.copy(position) },
      stopPress() {}, resetInteractionAnimation() {} }
    const view = createPlayerView({ camera: new THREE.PerspectiveCamera(), domElement: canvas, player })
    const getInputState = () => resolveInputState({ gameStarted: true, paused, caught: respawn.isFailing() })
    const respawn = createRespawnSystem({ player, camera: view, onStateChange: () => sync() })
    const sync = new Function('getInputState', 'respawn', 'levelManager', 'benchmark', 'player', 'keyboard', 'interaction', 'playerView', 'getPaused',
      `return function() { const paused = getPaused(); return (${syncSource})() }`)(getInputState, respawn, { setPresentationPaused() {} }, null, player,
      { setEnabled(value) { keyboardEnabled = value } }, { setEnabled(value) { interactionEnabled = value } }, view, () => paused)
    new Function('playerView', 'getInputState', 'settingsMenu', 'benchmark', 'setPaused', lockSource)(
      view, getInputState, { isOpen: false }, null, value => { paused = value; sync() })
    const mouseMove = () => {
      const event = new Event('mousemove')
      Object.assign(event, { movementX: 20, movementY: 0 }); doc.dispatchEvent(event)
    }
    try {
      view.setMode(mode, { announce: false }); sync(); view.requestLock()
      respawn.setCheckpoint(new THREE.Vector3(0, 0, 3))
      for (let attempt = 0; attempt < 3; attempt++) {
        assert.equal(respawn.fail('caught'), true)
        assert.equal(keyboardEnabled, false)
        assert.equal(interactionEnabled, false)
        assert.equal(doc.pointerLockElement, canvas)
        t.mock.timers.tick(900)
        assert.equal(respawn.isFailing(), false)
        assert.equal(keyboardEnabled, true)
        assert.equal(interactionEnabled, true)
        assert.equal(doc.pointerLockElement, canvas)
        const yaw = view.getYaw(); mouseMove()
        assert.notEqual(view.getYaw(), yaw, 'mouse look works immediately without clicking')
      }
      assert.equal(requests, 1, 'respawning never needs to request capture again')
      assert.equal(releases, 0, 'death never releases capture')
      respawn.fail('caught')
      doc.exitPointerLock()
      assert.equal(paused, true, 'Escape during the caught overlay still opens pause')
      t.mock.timers.tick(1000)
      assert.equal(respawn.isFailing(), true, 'pause holds the pending respawn')
      assert.equal(keyboardEnabled, false)
    } finally { respawn.dispose(); view.dispose(); restore() }
  }
})

test('wreck camera ignores decorative groups, holds brief clearances and still snaps before solid walls', () => {
  for (const fps of [30, 60, 144]) {
    const { doc, restore } = installDocument()
    const canvas = doc.createElement('canvas')
    const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 100)
    const view = createThirdPersonCamera(camera, canvas)
    const player = new THREE.Group(), scene = new THREE.Scene(), decoration = new THREE.Group()
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 0.1), new THREE.MeshBasicMaterial())
    wall.position.set(0, 1.5, -1)
    decoration.userData.noCameraCollision = true
    decoration.add(wall); scene.add(decoration)
    const tick = () => { scene.updateMatrixWorld(true); view.update(1 / fps, player, scene, { stabilizeCollision: true }) }
    try {
      view.setPitch(0); tick()
      const free = view.getDistance()
      assert.ok(free > 2, 'decorative children do not pull the camera in')
      decoration.userData.noCameraCollision = false
      tick()
      const blocked = view.getDistance()
      assert.ok(blocked < 1, 'a real wall retracts the camera immediately')
      decoration.userData.noCameraCollision = true
      for (let i = 0; i < Math.floor(fps * 0.08); i++) tick()
      assert.equal(view.getDistance(), blocked, 'brief openings do not pump the camera')
      for (let i = 0; i < fps; i++) tick()
      assert.ok(view.getDistance() > free - 0.2, 'sustained clearance releases smoothly')
      decoration.userData.noCameraCollision = false
      tick()
      assert.equal(view.getDistance(), blocked)
    } finally { view.dispose(); wall.geometry.dispose(); wall.material.dispose(); restore() }
  }
})

test('chasing field remains two-sided while the follow camera stays on the player side', () => {
  for (const fps of [30, 60, 144]) {
    const { doc, restore } = installDocument()
    const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 100)
    const view = createThirdPersonCamera(camera, doc.createElement('canvas'))
    const player = new THREE.Group(), scene = new THREE.Scene()
    const field = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }))
    field.position.set(0, 1.75, 5.5); scene.add(field)
    try {
      view.setYaw(Math.PI); view.setPitch(0)
      for (let i = 0; i < fps; i++) {
        field.position.z = 5.5 - i / fps * 5
        scene.updateMatrixWorld(true)
        view.update(1 / fps, player, scene, { stabilizeCollision: true })
        assert.ok(camera.position.z < field.position.z,
          `field/camera ${fps}/${i}: ${field.position.z}/${camera.position.z}`)
      }
    } finally { view.dispose(); field.geometry.dispose(); field.material.dispose(); restore() }
  }
})

test('Skip control: native button focus, single activation, hide and disposal discard handlers', () => {
  const {doc,restore} = installDocument()
  try {
    const root = doc.createElement('div')
    const skip = createCinematicSkip(root)
    const button = root.children[0]
    let completed = 0
    assert.equal(button.tagName,'BUTTON')
    assert.equal(button.type,'button')
    assert.equal(button.style.display,'none')
    skip.show(()=>completed++)
    assert.equal(doc.activeElement,button)
    assert.equal(button.style.pointerEvents,'auto')
    button.dispatchEvent(new Event('click')); button.dispatchEvent(new Event('click'))
    assert.equal(completed,1)
    assert.equal(doc.activeElement,null)
    skip.show(()=>completed++); skip.hide(); button.dispatchEvent(new Event('click'))
    assert.equal(completed,1)
    skip.show(()=>completed++); skip.dispose(); button.dispatchEvent(new Event('click'))
    assert.equal(completed,1)
    assert.equal(root.children.length,0)
  } finally {restore()}
})

test('Camera math: first/third crouch clearance, jumping and exterior-reveal recovery at 30/60/144 FPS', () => {
  for (const fps of [30,60,144]) {
    const {doc,restore} = installDocument()
    const canvas = doc.createElement('canvas')
    canvas.requestPointerLock = () => {doc.pointerLockElement=canvas}
    const camera = new THREE.PerspectiveCamera(65,16/9,0.1,100)
    const player = {mesh:new THREE.Group()}
    const view = createPlayerView({camera,domElement:canvas,player})
    const scene = new THREE.Scene()
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.68,0.12,8),new THREE.MeshBasicMaterial())
    roof.position.set(1.76,1.4,4); scene.add(roof)
    player.mesh.position.set(1.75,0,4)
    player.mesh.userData.tightCrouchCamera=true
    scene.updateMatrixWorld(true)
    try {
      for (const mode of ['first','third']) {
        view.setMode(mode,{announce:false}); view.setYaw(Math.PI); view.setPitch(0.6); view.snap()
        for(let i=0;i<fps;i++) view.update(1/fps,player.mesh,scene,{crouching:true})
        assert.ok(camera.position.y<1.34, `${mode}/${fps}: camera stays below roof`)
        assert.ok(camera.position.y>0.5)
        // Tight third-person clearance hides the avatar to prevent model clipping.
        assert.equal(player.mesh.visible,false)
      }
      player.mesh.userData.tightCrouchCamera=false
      view.setPitch(0); view.snap()
      for(let i=0;i<fps;i++) view.update(1/fps,player.mesh,null,{crouching:false})
      assert.equal(player.mesh.visible,true,'third-person avatar returns in open space')
      view.setMode('first',{announce:false}); view.snap()
      player.mesh.position.y=1.4
      view.update(1/fps,player.mesh,null,{crouching:false})
      assert.ok(Math.abs(camera.position.y-3.02)<0.0001,'jump follows player height')
      view.showWreckStop(new THREE.Vector3(0,0,-100),2)
      assert.equal(player.mesh.visible,true)
      assert.equal(camera.position.x,19)
      player.mesh.position.set(0,0,0); view.snap()
      view.update(1/fps,player.mesh,null,{crouching:false})
      assert.equal(player.mesh.visible,false)
      assert.ok(Math.abs(camera.position.y-1.62)<0.0001)
    } finally {view.dispose(); roof.geometry.dispose(); roof.material.dispose();restore()}
  }
})

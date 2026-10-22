import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createPlayerView } from '../src/cameras/player-view.js'
import { createCinematicSkip } from '../src/ui/cinematic-skip.js'

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

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createWreckVisibility, installWreckVisibility } from '../src/environment/wreck-visibility.js'

function fixture() {
  const scene = new THREE.Scene()
  const root = new THREE.Group(); scene.add(root)
  const carriage = new THREE.Group(); root.add(carriage)
  const mesh = (x, z, w = 0.2, h = 0.2) => {
    const node = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), new THREE.MeshStandardMaterial())
    node.position.set(x, 1.7, z); carriage.add(node); return node
  }
  const panel = mesh(1.5, 0, 1, 3.4); panel.userData.wreckOccluder = true
  const hidden = mesh(3, -3)
  const doorway = mesh(0, -3)
  const edge = mesh(2.03, -3, 0.4)
  const camera = new THREE.PerspectiveCamera(80, 1.6, 0.1, 200)
  camera.position.set(0, 1.7, 3); camera.lookAt(0, 1.7, 0); camera.updateMatrixWorld()
  let enabled = true
  const visibility = createWreckVisibility({ root, carriages: { current: carriage },
    spans: { current: { minZ: -5, maxZ: 5 } }, wallX: 2.6, ceilingY: 3.5,
    enabled: () => enabled })
  return { scene, root, carriage, panel, hidden, doorway, edge, camera, visibility,
    setEnabled(value) { enabled = value } }
}

test('Wreck visibility: solid panel coverage hides a whole bound, preserves doorway/edge and restores visibility', () => {
  const f = fixture()
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, false)
  assert.equal(f.doorway.visible, true)
  assert.equal(f.edge.visible, true, 'partial coverage never hides an entire mesh')
  assert.equal(f.panel.visible, true)
  assert.equal(f.visibility.getStats().hidden, 1)
  f.visibility.afterRender()
  assert.equal(f.hidden.visible, true)
  f.hidden.visible = false
  f.visibility.beforeRender(f.camera); f.visibility.afterRender()
  assert.equal(f.hidden.visible, false, 'pre-existing hidden state is preserved')
})

test('Wreck visibility: live transforms follow moving panels, root shake and moved candidates', () => {
  const f = fixture()
  f.panel.position.x += 3
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, true, 'moving a panel away exposes the target')
  f.panel.position.x -= 3
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, false)
  f.visibility.afterRender()
  f.root.position.set(10, 0.2, 7); f.root.rotation.z = 0.06
  f.root.updateMatrixWorld(true)
  f.camera.position.set(0, 1.7, 3).applyMatrix4(f.root.matrixWorld)
  f.camera.lookAt(new THREE.Vector3(0, 1.7, 0).applyMatrix4(f.root.matrixWorld))
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, false, 'world transforms preserve proven occlusion')
  f.visibility.afterRender()
  f.hidden.position.x = 0
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, true)
})

test('Wreck visibility: orthographic, exterior, disabled finale, clipped panels and invisible occluders fail open', () => {
  const f = fixture()
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, false)
  f.visibility.beforeRender(new THREE.OrthographicCamera())
  assert.equal(f.hidden.visible, true)
  f.camera.position.x = 4
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
  f.camera.position.x = 0
  f.setEnabled(false)
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
  f.setEnabled(true)
  for (const change of ['transparent', 'invisible', 'layer', 'near', 'globalClip']) {
    f.panel.material.transparent = change === 'transparent'
    f.panel.visible = change !== 'invisible'
    f.panel.layers.set(change === 'layer' ? 1 : 0)
    f.camera.near = change === 'near' ? 4 : 0.1
    f.visibility.beforeRender(f.camera, { clippingPlanes: change === 'globalClip' ? [{}] : [] })
    assert.equal(f.hidden.visible, true, change)
  }
})

test('Wreck visibility: shadow casters, custom shaders, deformers and depth-independent meshes are untouched', () => {
  const f = fixture()
  // Eligibility is rechecked each pass, including after diagnostic material swaps.
  f.hidden.castShadow = true
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
  f.hidden.castShadow = false
  const original = f.hidden.material
  f.hidden.material = new THREE.ShaderMaterial()
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
  f.hidden.material = original
  f.hidden.material.depthTest = false
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
  f.hidden.material.depthTest = true
  f.hidden.morphTargetInfluences = [1]
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
  f.hidden.morphTargetInfluences = []
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, false)
  f.visibility.dispose(); assert.equal(f.hidden.visible, true)
  f.visibility.beforeRender(f.camera); assert.equal(f.hidden.visible, true)
})

test('Wreck visibility: render hooks chain with correct context/arguments, restore before minimap and detach safely', () => {
  const f = fixture()
  const calls = []
  const before = function (...args) { assert.equal(this, f.scene); calls.push(['before', args]) }
  const after = function (...args) { assert.equal(this, f.scene); assert.equal(f.hidden.visible, true); calls.push(['after', args]) }
  f.scene.onBeforeRender = before; f.scene.onAfterRender = after
  const remove = installWreckVisibility(f.scene, f.visibility)
  const renderer = {}, target = {}
  f.scene.onBeforeRender(renderer, f.scene, f.camera, target)
  assert.equal(f.hidden.visible, false)
  f.scene.onAfterRender(renderer, f.scene, f.camera, target)
  assert.equal(f.hidden.visible, true)
  const map = new THREE.OrthographicCamera()
  f.scene.onBeforeRender(renderer, f.scene, map, target)
  assert.equal(f.hidden.visible, true)
  f.scene.onAfterRender(renderer, f.scene, map, target)
  assert.deepEqual(calls[0][1], [renderer, f.scene, f.camera, target])
  f.scene.onBeforeRender(renderer, f.scene, f.camera, target)
  remove()
  assert.equal(f.hidden.visible, true)
  assert.equal(f.scene.onBeforeRender, before); assert.equal(f.scene.onAfterRender, after)
  const newer = () => {}
  const removeAgain = installWreckVisibility(f.scene, fixture().visibility)
  f.scene.onBeforeRender = newer
  removeAgain(); assert.equal(f.scene.onBeforeRender, newer)
})

test('Wreck visibility: sampled rays to culled bounds intersect actual panels after rotation', () => {
  const f = fixture()
  f.root.rotation.y = 0.13
  f.root.updateMatrixWorld(true)
  f.camera.position.set(0, 1.7, 3).applyMatrix4(f.root.matrixWorld)
  f.camera.lookAt(new THREE.Vector3(0, 1.7, 0).applyMatrix4(f.root.matrixWorld))
  f.visibility.beforeRender(f.camera)
  assert.equal(f.hidden.visible, false)
  const ray = new THREE.Raycaster()
  for (let x = -0.1; x <= 0.1; x += 0.05) for (let y = -0.1; y <= 0.1; y += 0.05) {
    const p = new THREE.Vector3(3 + x, 1.7 + y, -3).applyMatrix4(f.root.matrixWorld)
    ray.set(f.camera.position, p.clone().sub(f.camera.position).normalize())
    assert.ok(ray.intersectObject(f.panel).some(hit => hit.distance < p.distanceTo(f.camera.position)))
  }
  f.visibility.afterRender()
})

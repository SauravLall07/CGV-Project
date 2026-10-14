import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { loadDetectiveVisual } from '../src/entities/detective-visual.js'
import { createDistractionSystem } from '../src/systems/distraction.js'

// Use the real throw skeleton and clip, without loading browser-only textures.
function parseThrow() {
  const bytes = fs.readFileSync(new URL('../src/assets/models/detective/Throw.fbx', import.meta.url))
  return new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

async function makeVisual() {
  return loadDetectiveVisual({
    async loadFbx(url) {
      if (url.endsWith('/Throw.fbx')) return parseThrow()
      if (url.endsWith('/Idle.fbx')) {
        const model = parseThrow()
        // The animation-only FBX has no mesh bounds. Supply centimetre-sized
        // bounds so prepareModel uses the same scale as the real Idle mesh.
        const bounds = new THREE.Mesh(new THREE.BoxGeometry(1, 180, 1), new THREE.MeshStandardMaterial())
        bounds.position.y = 90
        model.add(bounds)
        model.animations = [new THREE.AnimationClip('idle', 1, [])]
        return model
      }
      const model = new THREE.Group()
      model.animations = [new THREE.AnimationClip('locomotion', 1, [])]
      return model
    }
  })
}

function makeSystem(visual, count = 1) {
  const scene = new THREE.Scene()
  const mesh = new THREE.Group()
  if (visual) mesh.add(visual.root)
  scene.add(mesh)
  const messages = []
  const impacts = []
  const inventory = { count, max: 3 }
  let animationCalls = 0
  const system = createDistractionSystem({
    scene,
    inventory,
    player: {
      mesh,
      isCrouching: () => false,
      playThrow() { animationCalls++; return visual.playThrow() }
    },
    camera: { getYaw: () => 0 },
    hud: { showToast(message) { messages.push(message) } },
    stealth: { investigate(position, options) { impacts.push({ position, options }); return 1 } },
    groundHeightAt: () => 0
  })
  return { system, scene, inventory, messages, impacts, animationCalls: () => animationCalls }
}

test('empty inventory reports the exact message without animation or projectile', () => {
  const state = makeSystem(null, 0)
  assert.equal(state.system.throw(), false)
  assert.deepEqual(state.messages, ['You have nothing to throw'])
  assert.equal(state.animationCalls(), 0)
  assert.equal(state.scene.getObjectByName('thrown-distraction'), undefined)
  state.system.dispose()
})

test('real Throw clip releases at frame 24 and survives ordinary movement', async () => {
  const visual = await makeVisual()
  const state = makeSystem(visual)
  visual.setLocomotion({ moving: true, airborne: false, crouching: false })
  assert.equal(state.system.throw(), true)
  assert.equal(state.system.throw(), false)
  assert.equal(state.animationCalls(), 1)
  for (let frame = 1; frame <= 23; frame++) {
    visual.update(1 / 30)
    visual.setLocomotion({ moving: true, airborne: false, crouching: false })
    state.system.update(1 / 30)
  }
  assert.equal(state.scene.getObjectByName('thrown-distraction'), undefined)
  assert.equal(state.inventory.count, 1)
  assert.equal(visual.actions.throw.isRunning(), true)
  visual.update(1 / 30 + 1e-6)
  state.system.update(0)
  const projectile = state.scene.getObjectByName('thrown-distraction')
  assert.ok(projectile)
  const hand = visual.root.getObjectByName('mixamorigRightHand')
  assert.ok(projectile.position.distanceTo(hand.getWorldPosition(new THREE.Vector3())) < 1e-5)
  assert.equal(state.inventory.count, 0)
  for (let frame = 0; frame < 90; frame++) {
    visual.update(1 / 30)
    visual.setLocomotion({ moving: true, airborne: false, crouching: false })
    state.system.update(1 / 30)
  }
  assert.equal(state.impacts.length, 1)
  assert.deepEqual(state.impacts[0].options, { radius: 10, duration: 3.4 })
  assert.equal(visual.actions.run.isRunning(), true)
  assert.ok(state.messages.includes('A guard heard the noise and is investigating.'))
  state.system.dispose()
  visual.dispose()
})

test('reset during wind-up cancels release without consuming inventory', async () => {
  const visual = await makeVisual()
  const state = makeSystem(visual)
  state.system.throw()
  visual.update(0.3)
  visual.cancelThrow()
  visual.update(1)
  state.system.update(1)
  assert.equal(state.inventory.count, 1)
  assert.equal(state.scene.getObjectByName('thrown-distraction'), undefined)
  assert.equal(state.system.isReady(), true)
  state.system.dispose()
  visual.dispose()
})

test('a long animation tick still releases exactly once when the clip finishes', async () => {
  const visual = await makeVisual()
  const state = makeSystem(visual)
  state.system.throw()
  visual.update(3)
  state.system.update(0)
  assert.ok(state.scene.getObjectByName('thrown-distraction'))
  state.system.update(0)
  assert.equal(state.inventory.count, 0)
  assert.equal(state.scene.children.filter(child => child.name === 'thrown-distraction').length, 1)
  state.system.dispose()
  visual.dispose()
})

test('an earlier cast finishing does not interrupt a throw', async () => {
  const visual = await makeVisual()
  visual.playCast()
  visual.update(0.6)
  const animation = visual.playThrow()
  visual.update(0.5)
  visual.playCast()
  assert.equal(visual.actions.throw.isRunning(), true)
  assert.equal(animation.finished, false)
  visual.update(0.31)
  assert.equal(animation.released, true)
  visual.dispose()
})

test('disposing the level during wind-up prevents a later projectile', async () => {
  const visual = await makeVisual()
  const state = makeSystem(visual)
  state.system.throw()
  state.system.dispose()
  visual.update(1)
  assert.equal(visual.actions.throw.isRunning(), false)
  assert.equal(state.inventory.count, 1)
  assert.equal(state.scene.getObjectByName('thrown-distraction'), undefined)
  visual.dispose()
})

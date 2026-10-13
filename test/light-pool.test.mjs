import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { createLightPool } from '../src/core/light-pool.js'
import { createLevelManager } from '../src/core/level-manager.js'

function addLamp(parent, x, intensity = 10) {
  const light = new THREE.PointLight(0xffc98a, intensity, 8, 2)
  light.position.set(x, 3, 0)
  parent.add(light)
  return light
}

function poolLights(root) {
  return root.children.filter((node) => node.name.startsWith('light-pool-'))
}

test('light pool hides placed lamps and lights only the nearest ones', () => {
  const root = new THREE.Group()
  const lamps = [0, 5, 10, 40, 80].map((x) => addLamp(root, x))
  const pool = createLightPool({ root, size: 2 })

  assert.equal(pool.sourceCount, 5)
  assert.ok(lamps.every((lamp) => lamp.visible === false), 'placed lamps stay as hidden sources')

  // Real light count is fixed at the pool size, so materials never recompile.
  const real = poolLights(root)
  assert.equal(real.length, 2)

  root.updateMatrixWorld(true)
  pool.update(new THREE.Vector3(1, 3, 0))
  const lit = real.filter((light) => light.intensity > 0).map((light) => light.position.x).sort((a, b) => a - b)
  assert.deepEqual(lit, [0, 5])

  // Walking down the corridor hands the pool to the lamps ahead.
  pool.update(new THREE.Vector3(78, 3, 0))
  const ahead = real.filter((light) => light.intensity > 0).map((light) => light.position.x).sort((a, b) => a - b)
  assert.deepEqual(ahead, [40, 80])
})

test('light pool skips lamps that are off or under a hidden parent', () => {
  const root = new THREE.Group()
  const hiddenFixture = new THREE.Group()
  hiddenFixture.visible = false
  root.add(hiddenFixture)
  addLamp(hiddenFixture, 0)
  addLamp(root, 1, 0)
  addLamp(root, 30)

  const pool = createLightPool({ root, size: 3 })
  root.updateMatrixWorld(true)
  pool.update(new THREE.Vector3(0, 3, 0))

  const lit = poolLights(root).filter((light) => light.intensity > 0)
  assert.equal(lit.length, 1)
  assert.equal(lit[0].position.x, 30)
})

test('level manager forwards view updates to the active level only', () => {
  const originalAnimationFrame = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = (callback) => { callback(); return 1 }
  const viewers = []
  const manager = createLevelManager({
    scene: new THREE.Scene(),
    interaction: { setEnabled() {} },
    hud: { setObjective() {} },
    player: { setPose() {} },
    camera: { setYaw() {}, snap() {} },
    respawn: { reset() {}, setCheckpoint() {} },
    loadingScreen: { show() {}, hide() {} },
    timeSystem: { resetForLevel() {}, resetForRun() {} },
    levels: [
      {
        state: 'Viewed',
        create: () => ({
          checkpoint: { position: new THREE.Vector3(), yaw: 0 },
          updateView: (viewer) => viewers.push(viewer.x),
          dispose() {}
        })
      },
      {
        state: 'Plain',
        create: () => ({ checkpoint: { position: new THREE.Vector3(), yaw: 0 }, dispose() {} })
      }
    ]
  })

  try {
    manager.updateView(new THREE.Vector3(1, 0, 0)) // nothing built yet
    manager.enter('Viewed')
    manager.updateView(new THREE.Vector3(2, 0, 0))
    manager.enter('Plain')
    manager.updateView(new THREE.Vector3(3, 0, 0)) // level without the hook
    manager.unload()
    manager.updateView(new THREE.Vector3(4, 0, 0))
    assert.deepEqual(viewers, [2])
  } finally {
    globalThis.requestAnimationFrame = originalAnimationFrame
  }
})

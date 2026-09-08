import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem: () => null,
    setItem() {}
  }
}

globalThis.document = {
  createElement: () => ({ style: {}, remove() {} }),
  body: { appendChild() {} }
}

const { createInteractionSystem } = await import('../src/systems/interaction.js')

function makeTarget(scene, { x = 0, y = 1, z = 2 } = {}) {
  const target = new THREE.Group()
  target.position.set(x, y, z)
  target.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.5, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x334155 })
  ))
  scene.add(target)
  return target
}

test('solid registered geometry blocks interaction line of sight', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const target = makeTarget(scene)
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x777777 })
  )
  wall.position.set(0, 1.2, 1)
  scene.add(player, wall)

  let interactions = 0
  const system = createInteractionSystem()
  system.register(target, { prompt: 'Use terminal', onInteract: () => { interactions += 1 } })
  system.registerBlocker(scene)

  system.update(player, 0)
  assert.equal(system.getFocused(), null)
  assert.equal(system.interact(), false)
  assert.equal(interactions, 0)

  wall.visible = false
  system.update(player, 0)
  assert.equal(system.getFocused(), target)
  assert.equal(system.interact(), true)
  assert.equal(interactions, 1)
  system.dispose()
})

test('targets on another floor are rejected by vertical reach', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const roofHatch = makeTarget(scene, { y: 3.3 })
  scene.add(player)

  const system = createInteractionSystem()
  system.register(roofHatch, { prompt: 'Drop through hatch', onInteract() {} })

  system.update(player, 0)
  assert.equal(system.getFocused(), null)

  player.position.y = 3.3
  system.update(player, 0)
  assert.equal(system.getFocused(), roofHatch)
  system.dispose()
})

test('eligibility and visibility are revalidated when interaction fires', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const target = makeTarget(scene)
  scene.add(player)

  let onRoof = true
  let interactions = 0
  const system = createInteractionSystem()
  system.register(target, {
    prompt: 'Use roof hatch',
    isEligible: () => onRoof,
    onInteract: () => { interactions += 1 }
  })

  system.update(player, 0)
  assert.equal(system.getFocused(), target)

  onRoof = false
  assert.equal(system.interact(), false)
  assert.equal(system.getFocused(), null)

  onRoof = true
  system.update(player, 0)
  target.visible = false
  assert.equal(system.interact(), false)
  assert.equal(interactions, 0)
  system.dispose()
})

test('small switches remain selectable and transparent effects do not block them', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const target = makeTarget(scene, { y: 0.3 })
  const effect = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false })
  )
  effect.position.set(0, 1, 1)
  scene.add(player, effect)

  const camera = new THREE.PerspectiveCamera()
  camera.rotation.y = Math.PI
  camera.updateMatrixWorld(true)

  const system = createInteractionSystem({ camera })
  system.register(target, { prompt: 'Press floor switch', onInteract() {} })
  system.registerBlocker(scene)

  // Omitting yaw exercises the camera-direction path used by either view.
  system.update(player)
  assert.equal(system.getFocused(), target)
  system.dispose()
})

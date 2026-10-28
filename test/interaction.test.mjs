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

test('a solid decorative object marked non-blocking does not hide its container interaction', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const cage = new THREE.Group()
  cage.position.set(0, 0, 2)
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
  )
  core.position.set(0, 0.75, 2)
  core.userData.noInteractionBlocker = true
  scene.add(player, cage, core)

  const system = createInteractionSystem()
  system.register(cage, { prompt: 'Breach cage', onInteract() {} })
  system.registerBlocker(scene)

  system.update(player, 0)
  assert.equal(system.getFocused(), cage)
  system.dispose()
})

test('focusing a prop whose parts share a material leaves that material as it was', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f })
  const lever = new THREE.Group()
  lever.position.set(0, 1, 2)
  for (let i = 0; i < 4; i++) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), brass)
    part.position.y = i * 0.1
    lever.add(part)
  }
  // A cage elsewhere built from the same material, like the Convergence gates.
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), brass)
  cage.position.set(0, 1, -20)
  scene.add(player, lever, cage)

  const system = createInteractionSystem()
  system.register(lever, { prompt: 'Pull lever', onInteract() {} })

  for (let round = 0; round < 5; round++) {
    player.position.set(0, 0, 0)
    system.update(player, 0)
    assert.equal(system.getFocused(), lever)
    assert.equal(brass.emissiveIntensity, 1, 'one tint per material, not one per part')

    player.position.set(0, 0, 10) // out of range: focus drops
    system.update(player, 0)
    assert.equal(system.getFocused(), null)
    assert.equal(brass.emissive.getHex(), 0x000000)
    assert.equal(brass.emissiveIntensity, 1)
  }
  system.dispose()
})

test('an infinite hold runs for as long as the key is down and shows no progress bar', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const target = makeTarget(scene, { y: 0.5, z: 1 })
  scene.add(player)
  const input = { state: { interact: false }, onAction: () => () => {} }
  const calls = []
  // Keep hold of the DOM the system builds: prompt, then progress bar.
  const elements = []
  const createElement = document.createElement
  document.createElement = () => { const element = createElement(); elements.push(element); return element }
  const system = createInteractionSystem({ input })
  document.createElement = createElement
  const progressBar = elements[1]
  system.register(target, {
    prompt: 'Push trolley',
    holdSeconds: Infinity,
    onHoldStart: () => calls.push('start'),
    onHoldCancel: ({ reset }) => calls.push(reset ? 'reset' : 'cancel'),
    onHoldComplete: () => calls.push('complete')
  })

  input.state.interact = true
  for (let i = 0; i < 600; i++) system.update(player, 0, 1 / 60)
  assert.deepEqual(calls, ['start'], 'ten seconds of holding never completes')
  assert.equal(progressBar.style.display, 'none', 'there is nothing to fill')

  input.state.interact = false
  system.update(player, 0, 1 / 60)
  assert.deepEqual(calls, ['start', 'cancel'])

  input.state.interact = true
  system.update(player, 0, 1 / 60)
  assert.deepEqual(calls, ['start', 'cancel', 'start'], 'pressing again grabs again')
  system.dispose()
})

test('an entry that keeps focus answers E wherever you look, but not out of reach', () => {
  const scene = new THREE.Scene()
  const player = new THREE.Group()
  const target = makeTarget(scene, { y: 0.5, z: 1 })
  scene.add(player)
  let held = true
  let presses = 0
  const system = createInteractionSystem()
  system.register(target, {
    prompt: 'Let go of trolley',
    gesture: 'none',
    range: 1.5,
    keepFocus: () => held,
    onInteract: () => { presses += 1 }
  })

  // Facing straight away from it: still focused, and E still reaches it.
  system.update(player, Math.PI, 1 / 60)
  assert.equal(system.getFocused(), target)
  assert.equal(system.interact(), true)
  assert.equal(presses, 1)

  // No longer kept: back to the usual facing test.
  held = false
  system.update(player, Math.PI, 1 / 60)
  assert.equal(system.getFocused(), null)

  // Kept, but out of reach: nothing.
  held = true
  player.position.z = -2
  system.update(player, Math.PI, 1 / 60)
  assert.equal(system.getFocused(), null)
  system.dispose()
})

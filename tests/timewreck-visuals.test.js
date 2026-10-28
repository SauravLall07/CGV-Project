import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createWreckPanelGeometry } from '../src/environment/wreck-geometry.js'
import { createCarriageShake, createStormDebris, createLampMotion, createGrabHandles,
  CARRIAGE_SHAKE } from '../src/levels/timewreck-atmosphere.js'
import { createCarriageEnvironment } from '../src/environment/carriages.js'
import { createLightPool } from '../src/core/light-pool.js'
import { disposeObject } from '../src/core/dispose.js'

test('wreck shapes retain unit collision bounds with finite normals and a small triangle budget', () => {
  const signatures = new Set()
  for (const variant of [0, 1, 2]) {
    const geometry = createWreckPanelGeometry(variant)
    try {
      geometry.computeBoundingBox()
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Math.abs(geometry.boundingBox.min[axis] + 0.5) < 1e-6)
        assert.ok(Math.abs(geometry.boundingBox.max[axis] - 0.5) < 1e-6)
      }
      assert.ok(Array.from(geometry.attributes.normal.array).every(Number.isFinite))
      assert.ok((geometry.index?.count ?? geometry.attributes.position.count) / 3 < 250)
      signatures.add(Array.from(geometry.attributes.position.array).join(','))
    } finally { geometry.dispose() }
  }
  assert.equal(signatures.size, 3)
})

test('shake holds its exact pose in Freeze, reverses continuously and has no impact discontinuity', () => {
  const root = new THREE.Group(), shake = createCarriageShake(root)
  const pose = () => [...root.position.toArray(), root.rotation.z]
  const update = (t, delta = 1 / 60, frozen = false) =>
    shake.update(delta, { elapsed: t, unrest: 1.5, slamKick: 0, frozen })
  update(2)
  const held = pose()
  update(5, 0, true)
  assert.deepEqual(pose(), held)
  update(3); update(2, -1 / 60)
  assert.deepEqual(pose(), held)
  const boundary = 1 / CARRIAGE_SHAKE.joltChancePerSec
  update(boundary - 0.0001)
  const before = pose()
  update(boundary + 0.0001)
  assert.ok(pose().every((value, i) => Math.abs(value - before[i]) < 0.0001))
  const still = createCarriageShake(root, { ...CARRIAGE_SHAKE, joltChancePerSec: 0 })
  still.update(1 / 60, { elapsed: 1, unrest: 1, slamKick: 0, frozen: false })
  assert.ok(pose().every(Number.isFinite))
  shake.reset()
  assert.deepEqual(pose(), [0, 0, 0, 0])
})

test('decorative debris, handles and lamps hold at zero delta and return to the same reversed pose', () => {
  const root = new THREE.Group()
  const lamp = new THREE.PointLight(0xffcc88, 3, 6)
  lamp.userData.wreckAtmosphereLamp = true
  root.add(lamp)
  const hazard = new THREE.PointLight(0xff0000, 5, 6)
  root.add(hazard)
  const spans = { cab: { minZ: -30 }, vault: { maxZ: 30 }, cargo: { minZ: -10, maxZ: 10 } }
  const debris = createStormDebris(root, spans)
  const handles = createGrabHandles(root, spans)
  const lamps = createLampMotion(root)
  const snapshot = () => {
    const values = []
    root.traverse(node => { values.push(...node.position.toArray(), ...node.rotation.toArray().slice(0, 3)) })
    return values
  }
  const update = (elapsed, delta) => {
    const context = { elapsed, frozen: false, unrest: 1, slamKick: 0 }
    debris.update(delta, context); handles.update(delta, context)
    lamp.intensity = 3 // carriage environment owns the base intensity each moving frame
    lamps.update(delta, context)
  }
  try {
    update(1.25, 1 / 60)
    const held = snapshot()
    const lightIntensity = lamp.intensity
    const context = { elapsed: 100, frozen: false, unrest: 1, slamKick: 0 }
    debris.update(0, context); handles.update(0, context); lamps.update(0, context)
    assert.deepEqual(snapshot(), held)
    assert.equal(lamp.intensity, lightIntensity)
    update(2, 1 / 60); update(1.25, -1 / 60)
    assert.deepEqual(snapshot(), held)
    assert.equal(lamp.intensity, lightIntensity)
    assert.equal(hazard.intensity, 5, 'lamp motion must leave hazard lights alone')
    root.getObjectByName('storm-debris-field').traverse(node => {
      assert.equal(node.userData.noCameraCollision, node.name === 'storm-debris-field' ? undefined : true)
    })
  } finally { debris.dispose(); handles.dispose(); disposeObject(root) }
})

test('damaged metal retains wear maps and differentiated highlights without changing intact brass', () => {
  const intact = createCarriageEnvironment(), wreck = createCarriageEnvironment({ damaged: true })
  const materials = root => {
    const result = new Set()
    root.traverse(node => { if (node.material) result.add(node.material) })
    return [...result]
  }
  try {
    const brass = materials(wreck.root).find(mat => mat.metalness === 0.82 && mat.roughnessMap)
    assert.ok(brass?.normalMap)
    assert.equal(brass.roughness, 0.75)
    const intactBrass = materials(intact.root).find(mat => mat.color?.getHex() === 0xb08d3f)
    assert.equal(intactBrass.roughness, 0.3)
    assert.equal(intactBrass.roughnessMap, null)
  } finally { disposeObject([intact.root, wreck.root]) }
})

test('stationary light pool reassigns moving sources on the timed refresh', () => {
  const root = new THREE.Group(), viewer = new THREE.Vector3()
  const first = new THREE.PointLight(0xff0000, 1, 6), second = new THREE.PointLight(0x00ff00, 1, 6)
  first.position.x = 1; second.position.x = 5
  root.add(first, second)
  const pool = createLightPool({ root, size: 1 })
  const slot = root.getObjectByName('light-pool-0')
  pool.update(viewer, 0)
  assert.equal(slot.color.getHex(), 0xff0000)
  second.position.x = 0.1
  pool.update(viewer, 0.2)
  assert.equal(slot.color.getHex(), 0xff0000)
  pool.update(viewer, 0.05)
  assert.equal(slot.color.getHex(), 0x00ff00)
  disposeObject(root)
})

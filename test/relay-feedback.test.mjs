import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRelayFeedback } from '../src/levels/timewreck-relay-feedback.js'
import { disposeObject } from '../src/core/dispose.js'

function harness(t) {
  const doors = new THREE.Group(), linkage = new THREE.Group()
  const brass = new THREE.MeshStandardMaterial()
  doors.add(linkage)
  const feedback = createRelayFeedback({ doors, linkage, doorZ: 10, catchZ: 5, brass })
  const bars = doors.getObjectByName('relay-echo-hold-bars')
  const catchLink = doors.getObjectByName('relay-catch-linkage')
  t.after(() => disposeObject(doors))
  return { feedback, bars, linkage, catchLink }
}

test('relay idle output stays initialized without redundant instance or material updates', t => {
  const { feedback, bars, linkage, catchLink } = harness(t)
  const version = bars.instanceMatrix.version
  const initial = bars.instanceMatrix.array.slice()
  const matrices = t.mock.method(bars, 'setMatrixAt')
  const colors = t.mock.method(bars.material.emissive, 'setHex')
  for (let i = 0; i < 1200; i++) feedback.update(false, i / 60, false)
  assert.deepEqual(bars.instanceMatrix.array, initial)
  assert.equal(bars.instanceMatrix.version, version)
  assert.equal(matrices.mock.callCount(), 0)
  assert.equal(colors.mock.callCount(), 0)
  assert.equal(bars.material.emissive.getHex(), 0xffb060)
  assert.equal(linkage.position.y, 0.04)
  assert.equal(catchLink.position.y, 0.04)
})

test('relay full bars still change held/latched color and linkage when fill stays unchanged', t => {
  const { feedback, bars, linkage, catchLink } = harness(t)
  feedback.update(true, 0, false)
  const version = bars.instanceMatrix.version
  assert.equal(bars.material.emissive.getHex(), 0x22d3ee)
  assert.equal(linkage.position.y, 0.025)
  assert.equal(catchLink.position.y, 0.04)
  feedback.update(true, 6, true)
  assert.equal(bars.instanceMatrix.version, version)
  assert.equal(bars.material.emissive.getHex(), 0x4ade80)
  assert.equal(catchLink.position.y, 0.025)
  feedback.update(false, 5, true)
  assert.equal(bars.instanceMatrix.version, version)
  assert.equal(linkage.position.y, 0.04)
  feedback.update(true, 0, false)
  assert.equal(bars.instanceMatrix.version, version)
  assert.equal(bars.material.emissive.getHex(), 0x22d3ee)
  assert.equal(catchLink.position.y, 0.04)
  feedback.update(false, 0, false)
  assert.equal(bars.material.emissive.getHex(), 0xffb060)
  const resetVersion = bars.instanceMatrix.version
  feedback.update(false, 0, false)
  assert.equal(bars.instanceMatrix.version, resetVersion)
})

test('relay echo countdown retains smooth per-frame bar heights through boundaries and reset', t => {
  const { feedback, bars, linkage, catchLink } = harness(t)
  const matrix = new THREE.Matrix4()
  let previousVersion = bars.instanceMatrix.version
  for (let frame = 0; frame < 480; frame++) {
    const remaining = 8 - frame / 60
    feedback.update(true, remaining, false)
    assert.equal(bars.instanceMatrix.version, previousVersion + 1)
    previousVersion = bars.instanceMatrix.version
    for (let i = 0; i < 8; i++) {
      bars.getMatrixAt(i, matrix)
      const height = 0.12 + 0.88 * Math.min(1, Math.max(0, remaining - i))
      assert.ok(Math.abs(matrix.elements[5] - height) < 1e-6)
      assert.ok(Math.abs(matrix.elements[12] - (i - 3.5) * 0.15) < 1e-6)
    }
  }
  feedback.update(false, 0, false)
  for (let i = 0; i < 8; i++) {
    bars.getMatrixAt(i, matrix)
    assert.ok(Math.abs(matrix.elements[5] - 0.12) < 1e-6)
  }
  assert.equal(linkage.position.y, 0.04)
  assert.equal(catchLink.position.y, 0.04)
})

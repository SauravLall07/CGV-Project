import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { createStaircase } from '../src/core/stairs.js'

const STEPS = 10

function build(start, end) {
  const map = new THREE.Texture()
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  const runner = new THREE.MeshStandardMaterial({ map, userData: { metresPerRepeat: 1.2 } })
  return createStaircase({
    start,
    end,
    width: 3,
    steps: STEPS,
    wallHeight: 4,
    nosingMaterial: new THREE.MeshStandardMaterial(),
    runnerMaterial: runner,
    runnerWidth: 1.8
  })
}

function named(stair, name) {
  return stair.group.children.find((child) => child.name === name)
}

function instanceBox(mesh, index) {
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(index, matrix)
  mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox.clone().applyMatrix4(matrix)
}

for (const [label, start, end] of [
  ['descending', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -3, -8)],
  ['ascending', new THREE.Vector3(0, -2, 0), new THREE.Vector3(6, 0, 0)]
]) {
  test(`${label} staircase: one wall per side and one ceiling slab, following the flight`, () => {
    const stair = build(start, end)
    const walls = stair.group.children.filter((child) => child.name.startsWith('staircase-wall'))
    assert.equal(walls.length, 2, 'no per-step wall boxes')
    assert.ok(named(stair, 'staircase-ceiling'))

    // Each wall's top edge is a straight line wallHeight above the stair line,
    // so the highest point of the wall is wallHeight above the higher landing.
    for (const wall of walls) {
      wall.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(wall)
      assert.ok(Math.abs(box.max.y - (Math.max(start.y, end.y) + 4)) < 1e-6)
    }
  })

  test(`${label} staircase: nosings cap each riser and the runner lies on the treads`, () => {
    const stair = build(start, end)
    const nosings = named(stair, 'staircase-nosings')
    const treads = named(stair, 'staircase-runner-treads')
    const risers = named(stair, 'staircase-runner-risers')
    assert.equal(nosings.count, STEPS)
    assert.equal(treads.count, STEPS)
    assert.equal(risers.count, STEPS)

    const lineY = (t) => THREE.MathUtils.lerp(start.y, end.y, t)
    const rise = Math.abs(end.y - start.y) / STEPS
    for (let k = 0; k < STEPS; k++) {
      const high = Math.max(lineY(k / STEPS), lineY((k + 1) / STEPS))

      const nosing = instanceBox(nosings, k)
      assert.ok(nosing.min.y < high && nosing.min.y > high - 0.01, `nosing ${k} sits on the higher edge`)

      const riser = instanceBox(risers, k)
      assert.ok(Math.abs(riser.max.y - high) < 1e-6 && Math.abs(riser.min.y - (high - rise)) < 1e-6, `riser ${k} spans one rise`)

      const tread = instanceBox(treads, k)
      assert.ok(Math.abs(tread.min.y - lineY((k + 1) / STEPS)) < 1e-6, `runner ${k} rests on its tread`)
    }
  })
}

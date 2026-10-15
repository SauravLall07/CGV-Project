import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { setWreckStopShot } from '../src/cameras/wreck-stop-shot.js'

test('Wreck stop shot: locomotive and both missing-track edges project inside the view', () => {
  const target = new THREE.Vector3(0, 0, -70)
  for (const fov of [55, 60, 95]) for (const aspect of [4 / 3, 16 / 9]) for (const seconds of [0, 2.5, 4.8]) {
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200)
    setWreckStopShot(camera, target, seconds)
    camera.updateMatrixWorld(true)
    // Actual L3 offsets from cab centre: boiler, near and far gap edges.
    for (const [y, offset] of [[0.9, -5.7], [-0.33, -9], [-0.33, -24]]) {
      const p = new THREE.Vector3(0, y, target.z + offset).project(camera)
      assert.ok(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95 && Math.abs(p.z) < 1,
        `${aspect}/${seconds}: projected landmark ${offset}: ${p.toArray()}`)
    }
  }
})

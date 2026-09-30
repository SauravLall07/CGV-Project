import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createNearRaycastSet } from '../src/core/near-raycast.js'

// Deterministic pseudo-random numbers, so a failure reproduces.
function random(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

// A bumpy terrain large enough to be bucketed, placed off-origin and scaled
// so the stand-in's local-space segment is exercised.
function makeTerrain(side) {
  const geometry = new THREE.PlaneGeometry(40, 40, 48, 48)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    position.setY(i, Math.sin(position.getX(i) * 0.7) * Math.cos(position.getZ(i) * 0.5) * 1.5)
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side }))
  mesh.position.set(3, -0.5, -7)
  mesh.rotation.y = 0.3
  mesh.scale.set(1.2, 1, 0.9)
  return mesh
}

function signature(hits) {
  return hits.map((hit) => `${hit.object.id}:${hit.faceIndex ?? '-'}:${hit.distance.toFixed(9)}`)
}

test('bucketed large-mesh raycasts match three.js hit for hit', () => {
  const rand = random(7)
  let hits = 0
  for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
    const scene = new THREE.Scene()
    scene.add(makeTerrain(side))
    scene.updateMatrixWorld(true)
    const nearby = createNearRaycastSet()
    const raycaster = new THREE.Raycaster()
    for (let n = 0; n < 1000; n++) {
      const origin = new THREE.Vector3((rand() - 0.5) * 50, rand() * 6 - 2, (rand() - 0.5) * 50)
      const direction = new THREE.Vector3(rand() - 0.5, rand() - 0.7, rand() - 0.5).normalize()
      raycaster.set(origin, direction)
      raycaster.far = 1 + rand() * 9
      const expected = raycaster.intersectObject(scene, true)
      const actual = raycaster.intersectObjects(nearby.get(scene, origin, raycaster.far), false)
      assert.deepEqual(signature(actual), signature(expected), `side ${side}, ray ${n}`)
      hits += expected.length
    }
  }
  assert.ok(hits > 300, `the rays actually hit the terrain (${hits})`)
})

test('the nearby list keeps every object a short ray could hit', () => {
  const rand = random(11)
  const scene = new THREE.Scene()
  const box = new THREE.BoxGeometry(0.6, 0.6, 0.6)
  const material = new THREE.MeshBasicMaterial()
  for (let i = 0; i < 400; i++) {
    const mesh = new THREE.Mesh(box, material)
    mesh.position.set((rand() - 0.5) * 60, rand() * 3, (rand() - 0.5) * 60)
    scene.add(mesh)
  }
  scene.add(makeTerrain(THREE.FrontSide))
  scene.updateMatrixWorld(true)

  const nearby = createNearRaycastSet()
  const raycaster = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  let checked = 0
  // Walk the origin across the scene in steps shorter than the list's slack,
  // so most casts reuse a list built somewhere else.
  for (let step = 0; step < 600; step++) {
    origin.set(-25 + step * 0.08, 1.5, Math.sin(step * 0.05) * 20)
    const direction = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize()
    raycaster.set(origin, direction)
    raycaster.far = 5
    const expected = raycaster.intersectObject(scene, true)
    const list = nearby.get(scene, origin, 5)
    assert.ok(list.length < 400, 'distant objects are left out of the list')
    const actual = raycaster.intersectObjects(list, false)
    assert.deepEqual(signature(actual), signature(expected), `step ${step}`)
    checked += expected.length
  }
  assert.ok(checked > 50, 'the walk actually hit things')
})

test('a skipped subtree is left out and the list follows scene changes after invalidate()', () => {
  const scene = new THREE.Scene()
  const material = new THREE.MeshBasicMaterial()
  const player = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material)
  scene.add(player)
  scene.updateMatrixWorld(true)

  const nearby = createNearRaycastSet()
  const origin = new THREE.Vector3(0, 1, 0)
  assert.equal(nearby.get(scene, origin, 5, player).length, 0)

  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), material)
  wall.position.set(0, 1, -2)
  scene.add(wall)
  nearby.invalidate()
  const list = nearby.get(scene, origin, 5, player)
  assert.deepEqual(list, [wall])
})

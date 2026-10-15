import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCarriageEnvironment } from '../src/environment/carriages.js'
import { disposeObject } from '../src/core/dispose.js'

// Original fixture shapes: this contract checks positions, normals, UVs,
// topology and material groups, not just equivalent bounding boxes.
const shapes = [
  ['plate', THREE.BoxGeometry, [0.03, 0.22, 0.12]],
  ['shade', THREE.CylinderGeometry, [0.06, 0.09, 0.16, 8]],
  ['rod', THREE.CylinderGeometry, [0.012, 0.012, 0.35, 6]],
  ['cap', THREE.CylinderGeometry, [0.06, 0.16, 0.08, 8]],
  ['glass', THREE.CylinderGeometry, [0.13, 0.1, 0.26, 8]],
  ['base', THREE.CylinderGeometry, [0.11, 0.07, 0.05, 8]]
]

function collectFixtures(environment, references) {
  const carriages = []
  for (const group of Object.values(environment.carriages)) {
    const meshes = new Map(shapes.map(([name]) => [name, []]))
    group.traverse(node => {
      if (!node.isMesh) return
      for (const [name, reference] of references) {
        if (node.geometry.type === reference.type &&
          JSON.stringify(node.geometry.parameters) === JSON.stringify(reference.parameters)) {
          meshes.get(name).push(node)
        }
      }
    })
    if ([...meshes.values()].some(nodes => nodes.length)) carriages.push({ group, meshes })
  }
  return carriages
}

function harness(t) {
  const references = new Map(shapes.map(([name, Type, args]) => [name, new Type(...args)]))
  const environments = []
  t.after(() => {
    environments.forEach(environment => disposeObject(environment.root))
    references.forEach(geometry => geometry.dispose())
  })
  return {
    references,
    build() {
      const environment = createCarriageEnvironment()
      environments.push(environment)
      return { environment, fixtures: collectFixtures(environment, references) }
    },
    release(environment) {
      disposeObject(environment.root)
      environments.splice(environments.indexOf(environment), 1)
    }
  }
}

test('repeated carriage fixtures retain original topology, normals, UVs and independent meshes', t => {
  const h = harness(t)
  const { fixtures } = h.build()
  assert.ok(fixtures.length > 1, 'exercise multiple carriage visibility zones')
  const owners = new Map()
  const foundShapes = new Set()
  for (const { group, meshes } of fixtures) {
    for (const [name, nodes] of meshes) {
      if (!nodes.length) continue
      foundShapes.add(name)
      assert.ok(nodes.length > 1, `${name}: exercise repeated fixtures`)
      const geometry = nodes[0].geometry
      assert.equal(new Set(nodes.map(node => node.geometry)).size, 1, `${name}: share within carriage`)
      assert.equal(new Set(nodes).size, nodes.length, `${name}: keep meshes individually addressable`)
      assert.equal(owners.has(geometry), false, `${name}: separate geometry ownership across carriages`)
      owners.set(geometry, group)
      const reference = h.references.get(name)
      assert.deepEqual(geometry.index.array, reference.index.array)
      assert.deepEqual(geometry.groups, reference.groups)
      assert.deepEqual(geometry.drawRange, reference.drawRange)
      assert.deepEqual(Object.keys(geometry.attributes), Object.keys(reference.attributes))
      for (const [key, attribute] of Object.entries(geometry.attributes)) {
        assert.equal(attribute.itemSize, reference.attributes[key].itemSize)
        assert.equal(attribute.normalized, reference.attributes[key].normalized)
        assert.deepEqual(attribute.array, reference.attributes[key].array)
      }
      const sibling = nodes[1]
      const originalPosition = sibling.position.clone()
      nodes[0].visible = false
      nodes[0].position.x += 0.25
      assert.equal(sibling.visible, true, 'one hidden fixture must not hide its sibling')
      assert.deepEqual(sibling.position, originalPosition)
      if (name === 'shade') assert.ok(nodes.every(node => node.userData.noCameraCollision))
    }
  }
  assert.equal(foundShapes.size, shapes.length)
})

test('fixture resources dispose once per owner and remain isolated across live levels and restart', t => {
  const h = harness(t)
  const first = h.build(), second = h.build()
  const geometries = fixtureSet => new Set(fixtureSet.flatMap(({ meshes }) =>
    [...meshes.values()].flat().map(mesh => mesh.geometry)))
  const firstGeometries = geometries(first.fixtures), secondGeometries = geometries(second.fixtures)
  const disposed = new Map()
  for (const geometry of [...firstGeometries, ...secondGeometries]) {
    disposed.set(geometry, 0)
    geometry.addEventListener('dispose', () => disposed.set(geometry, disposed.get(geometry) + 1))
  }
  assert.ok(firstGeometries.size > 0)
  assert.ok([...secondGeometries].every(geometry => !firstGeometries.has(geometry)))
  h.release(first.environment)
  for (const geometry of firstGeometries) assert.equal(disposed.get(geometry), 1)
  for (const geometry of secondGeometries) assert.equal(disposed.get(geometry), 0)
  const restart = h.build()
  for (const geometry of geometries(restart.fixtures)) {
    assert.equal(firstGeometries.has(geometry), false, 'restart must not reuse disposed geometry')
    assert.equal(secondGeometries.has(geometry), false, 'live levels must not share fixture owners')
  }
  h.release(second.environment)
  for (const geometry of secondGeometries) assert.equal(disposed.get(geometry), 1)
})

test('fixture ray hits remain equivalent to the original shape after carriage movement and rotation', t => {
  const h = harness(t)
  const { environment, fixtures } = h.build()
  const { group, meshes } = fixtures.find(({ meshes }) => meshes.get('plate').length)
  const plate = meshes.get('plate')[0]
  group.position.x += 1.5
  group.rotation.set(0.12, 0.3, -0.08)
  environment.root.updateMatrixWorld(true)
  const original = new THREE.Mesh(h.references.get('plate'), plate.material)
  original.matrixAutoUpdate = false
  original.matrix.copy(plate.matrixWorld)
  original.updateMatrixWorld(true)
  const origin = plate.localToWorld(new THREE.Vector3(1, 0, 0))
  const direction = new THREE.Vector3(-1, 0, 0).transformDirection(plate.matrixWorld)
  const raycaster = new THREE.Raycaster(origin, direction, 0, 2)
  const hits = mesh => raycaster.intersectObject(mesh, false).map(hit => ({
    distance: hit.distance, point: hit.point.toArray(), uv: hit.uv.toArray(), faceIndex: hit.faceIndex
  }))
  assert.ok(hits(plate).length > 0)
  assert.deepEqual(hits(plate), hits(original))
})

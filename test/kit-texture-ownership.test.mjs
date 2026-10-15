import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { kitTexture } from '../src/environment/level1-kit/kit-textures.js'
import { getKitMaterials, resetKitMaterials } from '../src/environment/level1-kit/kit-materials.js'
import { disposeObject } from '../src/core/dispose.js'

function draw() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 8
  return canvas
}

test('kit textures share pixels/Source but retain independent UV, sampler and color-space settings', () => {
  let draws = 0
  const paint = () => { draws++; return draw() }
  const color = kitTexture('ownership-colour', paint, { repeat: [2, 3] })
  const sourceVersion = color.source.version
  const linear = kitTexture('ownership-colour', paint, { repeat: [4, 5], srgb: false })
  try {
    assert.equal(draws, 1)
    assert.notEqual(color, linear)
    assert.equal(color.isCanvasTexture, true)
    assert.equal(linear.isCanvasTexture, true)
    assert.equal(color.source, linear.source)
    assert.equal(color.source.version, sourceVersion, 'new wrappers do not dirty unchanged shared pixels')
    assert.equal(color.image, linear.image)
    assert.equal(color.colorSpace, THREE.SRGBColorSpace)
    assert.equal(linear.colorSpace, THREE.NoColorSpace)
    assert.equal(color.anisotropy, 4)
    assert.equal(color.wrapS, THREE.RepeatWrapping)
    assert.equal(color.minFilter, THREE.LinearMipmapLinearFilter)
    assert.ok(color.version > 0 && linear.version > 0, 'clones remain upload-ready')
    assert.deepEqual(color.repeat.toArray(), [2, 3])
    assert.deepEqual(linear.repeat.toArray(), [4, 5])
    color.repeat.set(6, 7); color.offset.set(0.25, 0.5)
    color.wrapS = THREE.ClampToEdgeWrapping
    color.userData.owner = 'first'
    assert.deepEqual(linear.repeat.toArray(), [4, 5])
    assert.deepEqual(linear.offset.toArray(), [0, 0])
    assert.equal(linear.wrapS, THREE.RepeatWrapping)
    assert.equal(linear.userData.owner, undefined)
    assert.equal(color.userData.sharedTexture, undefined, 'returned wrappers stay level-owned')
  } finally { color.dispose(); linear.dispose() }
})

test('kit normal strengths keep separate Sources and linear maps while equal strengths share', () => {
  const color = kitTexture('ownership-normal', draw)
  const normal = kitTexture('ownership-normal', draw, { normal: 1.2 })
  const repeated = kitTexture('ownership-normal', draw, { normal: 1.2, repeat: [3, 4] })
  const stronger = kitTexture('ownership-normal', draw, { normal: 2.4 })
  try {
    assert.notEqual(color.source, normal.source)
    assert.equal(normal.source, repeated.source)
    assert.notEqual(normal.source, stronger.source)
    assert.notEqual(normal.image, stronger.image)
    assert.equal(normal.colorSpace, THREE.NoColorSpace)
    assert.equal(repeated.colorSpace, THREE.NoColorSpace)
    assert.equal(stronger.colorSpace, THREE.NoColorSpace)
    assert.deepEqual(normal.repeat.toArray(), [1, 1])
    assert.deepEqual(repeated.repeat.toArray(), [3, 4])
  } finally { [color, normal, repeated, stronger].forEach(texture => texture.dispose()) }
})

test('kit material teardown releases owned clones once without poisoning live/restarted owners', () => {
  const roots = []
  function build() {
    resetKitMaterials()
    const kit = getKitMaterials(), root = new THREE.Group()
    for (const material of new Set(Object.values(kit).flat().filter(value => value?.isMaterial))) {
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
    }
    roots.push(root)
    return { kit, root }
  }
  const first = build(), second = build()
  let firstDisposals = 0, secondDisposals = 0
  const oldMap = first.kit.checker.map
  oldMap.addEventListener('dispose', () => firstDisposals++)
  second.kit.checker.map.addEventListener('dispose', () => secondDisposals++)
  try {
    assert.notEqual(oldMap, second.kit.checker.map)
    assert.equal(oldMap.source, second.kit.checker.map.source)
    assert.equal(first.kit.checker.normalMap.source, second.kit.checker.normalMap.source)
    disposeObject(first.root); roots.splice(roots.indexOf(first.root), 1)
    assert.equal(firstDisposals, 1)
    assert.equal(secondDisposals, 0)
    const restart = build()
    assert.notEqual(restart.kit.checker.map, oldMap)
    assert.equal(restart.kit.checker.map.source, oldMap.source)
    assert.equal(restart.kit.checker.map.image, oldMap.image)
    assert.equal(restart.kit.checker.map.colorSpace, THREE.SRGBColorSpace)
    assert.ok(restart.kit.checker.map.version > 0)
    assert.equal(secondDisposals, 0)
  } finally {
    roots.forEach(root => disposeObject(root))
    resetKitMaterials()
  }
  assert.equal(secondDisposals, 1)
})

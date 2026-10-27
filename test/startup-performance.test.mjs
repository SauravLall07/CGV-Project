import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { loadDetectiveVisual } from '../src/entities/detective-visual.js'
import { createTimeGhost } from '../src/entities/time-ghost.js'
import { createMinimapIcons } from '../src/ui/minimap-icons.js'

function sourceModel() {
  const root = new THREE.Group()
  const bone = new THREE.Bone()
  bone.name = 'Hips'
  const geometry = new THREE.BoxGeometry(1, 2, 1)
  const count = geometry.attributes.position.count
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4))
  const weights = new Float32Array(count * 4)
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshPhongMaterial({ map: new THREE.Texture() }))
  root.add(mesh, bone)
  mesh.bind(new THREE.Skeleton([bone]))
  root.animations = [new THREE.AnimationClip('fixture', 1, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 1, 0, 1])
  ])]
  return root
}

test('detective loads once for concurrent visuals, preserving independent skeletons, clips and materials', async () => {
  const loads = new Map(), originals = []
  const assets = { async loadFbx(url) {
    loads.set(url, (loads.get(url) ?? 0) + 1)
    const model = sourceModel()
    originals.push(model)
    return model
  } }
  const [player, ghost] = await Promise.all([loadDetectiveVisual(assets), loadDetectiveVisual(assets)])
  assert.equal(loads.size, 15)
  assert.ok([...loads.values()].every(count => count === 1))
  const playerMesh = player.root.getObjectsByProperty('isSkinnedMesh', true)[0]
  const ghostMesh = ghost.root.getObjectsByProperty('isSkinnedMesh', true)[0]
  assert.notEqual(playerMesh.skeleton.bones[0], ghostMesh.skeleton.bones[0])
  assert.notEqual(playerMesh.material, ghostMesh.material)
  assert.notEqual(playerMesh.geometry, ghostMesh.geometry)
  assert.equal(playerMesh.material.map, ghostMesh.material.map)
  assert.equal(playerMesh.material.map.userData.sharedTexture, true)
  assert.notEqual(player.actions.run.getClip(), ghost.actions.run.getClip())
  assert.equal(originals[0].animations[0].tracks[0].values[3], 1, 'source root motion stays intact')
  ghost.actions.idle.time = 0.75
  assert.equal(player.actions.idle.time, 0)
  let disposed = false
  playerMesh.geometry.addEventListener('dispose', () => { disposed = true })
  ghostMesh.geometry.dispose()
  assert.equal(disposed, false)
  player.dispose()
  ghost.dispose()
})

test('failed mandatory detective source can be retried', async () => {
  let fail = true
  const assets = { async loadFbx(url) {
    if (fail && url.endsWith('/Idle.fbx')) throw new Error('offline')
    return sourceModel()
  } }
  await assert.rejects(loadDetectiveVisual(assets), /offline/)
  fail = false
  const visual = await loadDetectiveVisual(assets)
  assert.ok(visual.actions.idle)
  visual.dispose()
})

test('ghost warmup compiles only its subtree and restores visibility on failure', () => {
  const ghost = createTimeGhost(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
  scene.add(ghost.mesh)
  const renderer = { compile(root, view, target) {
    assert.equal(root, ghost.mesh)
    assert.equal(view, camera)
    assert.equal(target, scene)
    assert.equal(root.visible, true)
    throw new Error('compile failed')
  } }
  assert.throws(() => ghost.warm(renderer, scene, camera), /compile failed/)
  assert.equal(ghost.mesh.visible, false)
  ghost.dispose()
})

test('minimap batches grow, retain transforms, clip moving obstacles and release instance buffers', () => {
  const scene = new THREE.Scene(), player = { mesh: new THREE.Group() }
  let boxes = Array.from({ length: 100 }, (_, i) => ({ minX: i, maxX: i + 0.5, minZ: 0, maxZ: 2 }))
  const icons = createMinimapIcons({ scene, player, getObstacles: () => boxes })
  icons.update()
  const batches = () => icons.root.children.filter(node => node.isInstancedMesh)
  assert.equal(batches().length, 1, '100 walls use one obstacle draw')
  assert.equal(batches()[0].count, 100)
  const matrix = new THREE.Matrix4()
  batches()[0].getMatrixAt(99, matrix)
  assert.equal(matrix.elements[12], 99.25)
  assert.equal(matrix.elements[0], 0.5)
  icons.update({ clip: { minX: 1, maxX: 3, minZ: 0, maxZ: 2 } })
  assert.equal(batches()[0].count, 3)
  boxes = [{ kind: 'crate', minX: 0, maxX: 1, minZ: 0, maxZ: 1 }]
  icons.update()
  assert.equal(batches().filter(batch => batch.visible).length, 1)
  assert.equal(batches().find(batch => batch.material.color.getHex() === 0xb45309).count, 1)
  let disposed = 0
  for (const batch of batches()) batch.addEventListener('dispose', () => disposed++)
  icons.dispose()
  assert.equal(disposed, 2)
  assert.equal(scene.children.length, 0)
})

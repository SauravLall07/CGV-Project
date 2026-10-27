import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createMinimap, collectMinimapFloors } from '../src/ui/minimap.js'
import { createMinimapIcons } from '../src/ui/minimap-icons.js'
import { createLevelManager } from '../src/core/level-manager.js'

test('all three levels use a local player-following camera with uniform scale and adjustable range', ({ mock }) => {
  const previousDocument = globalThis.document
  let mapWidth = 200, mapHeight = 300, now = 1000, range = 16
  mock.method(performance, 'now', () => now)
  const frame = { style: {}, dataset: {}, remove() {}, append() {}, getBoundingClientRect: () => ({
    left: 1050, bottom: 380, width: mapWidth, height: mapHeight
  }) }
  let createdFrame = false
  globalThis.document = { createElement: () => {
    if (createdFrame) return { style: {} }
    createdFrame = true
    return frame
  } }
  let state = 'Boarding'
  const player = { mesh: new THREE.Group() }
  const renders = []
  const volumes = Array.from({ length: 6 }, (_, i) => ({
    key: 'security', minX: -2.6, maxX: 2.6, minZ: i * 20, maxZ: (i + 1) * 20
  }))
  const viewports = []
  const renderer = {
    domElement: { clientWidth: 1280, clientHeight: 720,
      getBoundingClientRect: () => ({ left: 10, bottom: 740, width: 1280, height: 720 }) },
    setScissorTest() {}, setScissor() {}, setViewport: (...args) => viewports.push(args), clear() {},
    render: (...args) => renders.push(args)
  }
  const map = createMinimap({
    scene: new THREE.Scene(), mainCamera: new THREE.PerspectiveCamera(),
    hudRoot: { appendChild() {} }, player,
    getLevelState: () => state, getCarriageVolumes: () => volumes, getRange: () => range
  })
  try {
    map.render(renderer)
    assert.equal(renders.length, 0)
    map.setVisible(true)
    map.render(renderer)
    assert.deepEqual(viewports[0], [1042, 362, 196, 296], 'GL viewport follows the DOM within the canvas')
    assert.equal(map.camera.right - map.camera.left, 16)
    for (state of ['Boarding', 'MovingHeist', 'Timewreck']) {
      player.mesh.position.z = 50
      map.setVisible(false)
      map.setVisible(true)
      map.render(renderer)
      const span = map.camera.top - map.camera.bottom
      assert.equal(map.camera.right - map.camera.left, 16)
      assert.ok(Math.abs(16 / span - 196 / 296) < 1e-9, 'X and Z have equal pixel scale')
      map.camera.updateMatrixWorld()
      const projected = player.mesh.position.clone().project(map.camera)
      assert.ok(Math.abs(projected.x) < 1e-9)
      assert.ok(Math.abs(projected.y + 0.18) < 1e-9, 'player stays slightly below centre')
      const forward = state === 'Timewreck' ? -1 : 1
      assert.ok(player.mesh.position.clone().add(new THREE.Vector3(0, 0, forward)).project(map.camera).y > projected.y)
      const scene = renders.at(-1)[0]
      assert.ok(scene.getObjectByName('minimap-floors').count < volumes.length, 'only local floors are rendered')
      const previousZ = map.camera.position.z
      now += 16
      player.mesh.position.z += 2
      map.render(renderer)
      assert.ok(map.camera.position.z > previousZ && map.camera.position.z < previousZ + 2, 'camera follows smoothly')
      player.mesh.position.set(2, 0, 110)
      mapWidth = 140
      now += 16
      map.render(renderer)
      map.camera.updateMatrixWorld()
      const afterTeleport = player.mesh.position.clone().project(map.camera)
      assert.ok(Math.abs(afterTeleport.x) < 0.95 && Math.abs(afterTeleport.y) < 0.95)
      player.mesh.position.x = 0
      mapWidth = 200
    }
    range = 24
    map.render(renderer)
    assert.equal(map.camera.right - map.camera.left, 24, 'range changes the actual camera scale')
    map.setVisible(false)
    const count = renders.length
    map.render(renderer)
    assert.equal(renders.length, count)
    assert.equal(frame.style.display, 'none')
    state = 'Ending'
    map.setVisible(true)
    map.render(renderer)
    assert.equal(renders.length, count)
    assert.equal(frame.style.display, 'none')
  } finally {
    map.dispose()
    globalThis.document = previousDocument
  }
})

test('neighbor outlines preserve floor gaps without revealing remote obstacles or hidden guards', () => {
  const scene = new THREE.Scene()
  const player = { mesh: new THREE.Group() }
  player.mesh.position.set(1, 0, 30)
  player.mesh.rotation.y = Math.PI / 2
  const floors = [
    { minX: -2.6, maxX: 2.6, minZ: 20, maxZ: 40 },
    { minX: -2.6, maxX: 2.6, minZ: 45, maxZ: 65 }
  ]
  const guard = (z, visible = true) => {
    const group = new THREE.Group()
    group.position.z = z
    group.visible = visible
    return { group }
  }
  const icons = createMinimapIcons({
    scene, player,
    getObstacles: () => [25, 50].map(z => ({ kind: 'crate', minX: 0, maxX: 1, minZ: z, maxZ: z + 1 })),
    getGuards: () => [guard(30), guard(50), guard(32, false)]
  })
  try {
    icons.update({ clip: { minX: -10, maxX: 10, minZ: 0, maxZ: 80 },
      detailClip: floors[0], floorVolumes: floors, unitsPerPixel: 0.3 })
    const floor = scene.getObjectByName('minimap-floors')
    assert.equal(floor.count, 2)
    const matrix = new THREE.Matrix4()
    floor.getMatrixAt(1, matrix)
    assert.equal(matrix.elements[10], 20, 'floor length excludes the five-metre gap')
    assert.equal(matrix.elements[14], 55)
    assert.equal(icons.root.children.filter(n => n.name === 'minimap-guard').length, 1)
    const crates = icons.root.children.find(n => n.isInstancedMesh && n.material.color.getHex() === 0xb45309)
    assert.equal(crates.count, 1)
    const marker = scene.getObjectByName('minimap-player')
    assert.equal(marker.position.x, player.mesh.position.x)
    assert.equal(marker.position.z, player.mesh.position.z)
    assert.ok(Math.abs(marker.rotation.y - Math.PI / 2) < 1e-9)
    player.mesh.rotation.y = Math.PI / 4
    icons.update({ unitsPerPixel: 0.1 })
    marker.updateMatrix()
    const screenX = new THREE.Vector3().setFromMatrixColumn(marker.matrix, 0)
    const screenZ = new THREE.Vector3().setFromMatrixColumn(marker.matrix, 2)
    assert.ok(Math.abs(screenX.length() - screenZ.length()) < 1e-9, 'player marker has uniform scale')
    assert.ok(Math.abs(screenX.dot(screenZ)) < 1e-9)
    const tip = new THREE.Vector3(0, 0, 0.85).applyMatrix4(marker.matrix).sub(marker.position)
    assert.ok(Math.abs(tip.x / tip.z - 1) < 1e-9, 'arrow still follows the real facing direction')
  } finally { icons.dispose() }
})

test('station floors use transformed floor geometry and stair treads, excluding walls and ceilings', () => {
  const root = new THREE.Group()
  root.position.x = 10
  const material = new THREE.MeshBasicMaterial()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 12), material)
  floor.rotation.x = -Math.PI / 2
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), material)
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6, 12), material)
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = 4
  const tread = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 1), material)
  tread.userData.minimapFloor = true
  tread.position.set(0, -1, 8)
  root.add(floor, wall, ceiling, tread)
  const floors = collectMinimapFloors(root)
  assert.equal(floors.length, 2)
  assert.equal(floors[0].minX, 7)
  assert.equal(floors[0].maxX, 13)
  assert.equal(floors[0].minZ, -6)
  assert.equal(floors[0].maxZ, 6)
  assert.ok(Math.abs(floors[1].y + 0.9) < 1e-6)
  assert.equal(floors[0].source, floor)
  for (const node of root.children) node.geometry.dispose()
  material.dispose()
})

test('station floor batches grow beyond one train and release replaced instance buffers', () => {
  const scene = new THREE.Scene()
  const icons = createMinimapIcons({ scene, player: { mesh: new THREE.Group() } })
  const original = scene.getObjectByName('minimap-floors')
  let disposed = false
  original.addEventListener('dispose', () => { disposed = true })
  const floors = Array.from({ length: 30 }, (_, i) => ({ minX: i, maxX: i + 2, minZ: 0, maxZ: 3 }))
  icons.update({ floorVolumes: floors })
  assert.equal(disposed, true)
  assert.equal(scene.getObjectByName('minimap-floors').count, 30)
  icons.dispose()
  assert.equal(scene.children.length, 0)
})

test('level manager honors live minimap visibility through entry, restart, ending and unload', () => {
  const previousAnimationFrame = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = callback => { callback(); return 1 }
  let inside = false
  const manager = createLevelManager({
    scene: new THREE.Scene(), interaction: { setEnabled() {} },
    hud: { setObjective() {} }, player: { setPose() {} }, camera: { snap() {} },
    respawn: { reset() {}, setCheckpoint() {} },
    loadingScreen: { show() {}, hide() {} },
    levels: [
      { state: 'Boarding', create: () => {
        inside = false
        return { get minimapVisible() { return inside }, dispose() {} }
      } },
      { state: 'MovingHeist', create: () => ({ dispose() {} }) },
      { state: 'Timewreck', create: () => ({ dispose() {} }) },
      { state: 'Ending', create: () => ({ dispose() {} }) }
    ]
  })
  try {
    assert.equal(manager.minimapVisible, false)
    manager.enter('Boarding')
    assert.equal(manager.minimapVisible, false)
    inside = true
    assert.equal(manager.minimapVisible, true)
    manager.restart()
    assert.equal(manager.minimapVisible, false)
    for (const state of ['MovingHeist', 'Timewreck']) {
      manager.enter(state)
      assert.equal(manager.minimapVisible, true)
    }
    manager.enter('Ending')
    assert.equal(manager.minimapVisible, false)
    manager.unload()
    assert.equal(manager.minimapVisible, false)
  } finally {
    globalThis.requestAnimationFrame = previousAnimationFrame
  }
})

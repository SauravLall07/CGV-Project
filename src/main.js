import * as THREE from 'three'
import { createRenderer } from './core/renderer.js'
import { createScene } from './core/scene.js'
import { createCamera } from './core/camera.js'
import { createClock } from './core/clock.js'
import { createLoop } from './core/loop.js'
import { createLights } from './core/lights.js'
import { createDevControls } from './dev/dev-controls.js'

// Composition root. Keep this file short and readable — it wires
// infrastructure together, it isn't where logic lives.

const canvas = document.querySelector('#app')

// renderer/camera each wire their own resize() to window's resize event
const { renderer } = createRenderer(canvas)
const scene = createScene()
const { camera } = createCamera()
const clock = createClock()

for (const light of createLights()) {
  scene.add(light)
}

// Placeholder cube — proves geometry + material + lighting + camera +
// renderer are all wired correctly. Not part of the game itself.
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x4f8ef7 })
)
scene.add(cube)

const devControls = createDevControls(camera, renderer.domElement)

const loop = createLoop({ renderer, scene, camera, clock })
loop.add((delta) => {
  cube.rotation.x += delta * 0.5
  cube.rotation.y += delta * 0.5
  devControls.update()
})
loop.start()

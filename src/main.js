import { createRenderer } from './core/renderer.js'
import { createScene } from './core/scene.js'
import { createCamera } from './core/camera.js'
import { createClock } from './core/clock.js'
import { createLoop } from './core/loop.js'
import { createStationBlockout, createStationLighting } from './environment/station-blockout.js'
import { createTrain } from './entities/train.js'
import { createPlayer } from './entities/player.js'
import { createKeyboardState } from './input/keyboard-state.js'
import { createThirdPersonCamera } from './cameras/third-person-camera.js'

// Composition root for the Alpha preliminary implementation: a greyboxed
// slice of Level 1 (the boarding station) with a walkable placeholder
// player and a third-person camera. Keep this file short and readable — it
// wires things together, it isn't where logic lives.

const canvas = document.querySelector('#app')

// renderer/camera each wire their own resize() to window's resize event
const { renderer } = createRenderer(canvas)
const scene = createScene()
const { camera } = createCamera()
const clock = createClock()

const { group: station, bounds } = createStationBlockout()
scene.add(station)
for (const light of createStationLighting()) {
  scene.add(light)
}

const { train } = createTrain()
scene.add(train)

const player = createPlayer()
scene.add(player.mesh)

const keyboard = createKeyboardState()
const thirdPersonCamera = createThirdPersonCamera(camera, renderer.domElement)

const loop = createLoop({ renderer, scene, camera, clock })
loop.add((delta) => {
  player.update(delta, { keyboard: keyboard.state, cameraYaw: thirdPersonCamera.getYaw(), bounds })
  thirdPersonCamera.update(delta, player.mesh)
})
loop.start()

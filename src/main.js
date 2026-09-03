import { createRenderer } from './core/renderer.js'
import { createScene } from './core/scene.js'
import { createCamera } from './core/camera.js'
import { createClock } from './core/clock.js'
import { createLoop } from './core/loop.js'
import { createAssetLoader } from './core/assets.js'
import { createLevelManager } from './core/level-manager.js'
import { createPlayer } from './entities/player.js'
import { createKeyboardState } from './input/keyboard-state.js'
import { createThirdPersonCamera } from './cameras/third-person-camera.js'
import { createInteractionSystem } from './systems/interaction.js'
import { createRespawnSystem } from './systems/respawn.js'
import { createTimeSystem } from './systems/time-system.js'
import { createHud } from './ui/hud.js'
import { createLoadingScreen } from './ui/loading-screen.js'
import { createBoardingLevel } from './levels/boarding.js'
import { createMovingHeistLevel } from './levels/moving-heist.js'
import { createTimewreckLevel } from './levels/timewreck.js'
import { createCompleteLevel } from './levels/complete.js'

// Composition root. Everything persistent (renderer, camera, loop, input,
// HUD, asset loader, interaction/respawn/time systems) is created here once; the
// per-level content is owned by the level manager, which builds and disposes
// one level module at a time. Keep this file wiring-only.

const canvas = document.querySelector('#app')

const { renderer } = createRenderer(canvas)
const scene = createScene()
const { camera } = createCamera()
const clock = createClock()

const assets = createAssetLoader()
const hud = createHud()
const loadingScreen = createLoadingScreen(assets)

// The player persists across levels; the level manager repositions it to
// each level's checkpoint on load.
const player = createPlayer()
scene.add(player.mesh)

const keyboard = createKeyboardState()
const thirdPersonCamera = createThirdPersonCamera(camera, renderer.domElement)
const interaction = createInteractionSystem({ camera })
const respawn = createRespawnSystem({ player, hud, camera: thirdPersonCamera })
const timeSystem = createTimeSystem({ scene, player, hud })

// Key bindings for Time Abilities (1/Q: Slow, 2/F: Freeze, 3/C: Rewind, 4/G: Ghost)
keyboard.onKeyPress('Digit1', () => timeSystem.triggerSlow())
keyboard.onKeyPress('KeyQ', () => timeSystem.triggerSlow())

keyboard.onKeyPress('Digit2', () => timeSystem.triggerFreeze())
keyboard.onKeyPress('KeyF', () => timeSystem.triggerFreeze())

keyboard.onKeyPress('Digit3', () => timeSystem.triggerRewind())
keyboard.onKeyPress('KeyC', () => timeSystem.triggerRewind())

keyboard.onKeyPress('Digit4', () => timeSystem.triggerGhost())
keyboard.onKeyPress('KeyG', () => timeSystem.triggerGhost())

const levelManager = createLevelManager({
  scene,
  interaction,
  assets,
  hud,
  player,
  camera: thirdPersonCamera,
  respawn,
  timeSystem,
  loadingScreen,
  levels: [
    { state: 'Boarding', create: createBoardingLevel },
    { state: 'MovingHeist', create: createMovingHeistLevel },
    { state: 'Timewreck', create: createTimewreckLevel },
    { state: 'Complete', create: createCompleteLevel }
  ]
})

levelManager.enter('Boarding')

const loop = createLoop({ renderer, scene, camera, clock })
loop.add((delta) => {
  timeSystem.update(delta)
  levelManager.update(delta)

  player.update(delta, {
    keyboard: keyboard.state,
    cameraYaw: thirdPersonCamera.getYaw(),
    bounds: levelManager.bounds
  })

  thirdPersonCamera.update(delta, player.mesh, scene)
  interaction.update(player.mesh, thirdPersonCamera.getYaw())
  respawn.update()

  hud.updateTimeState({
    mode: timeSystem.getMode(),
    energy: timeSystem.getEnergy(),
    maxEnergy: timeSystem.getMaxEnergy(),
    ghostCooldown: timeSystem.getGhostCooldown(),
    hasGhost: timeSystem.getGhost().isPlaying()
  })
})
loop.start()

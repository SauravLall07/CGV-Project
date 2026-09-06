import { createRenderer, generateEnvironmentMap } from './core/renderer.js'
import { createScene } from './core/scene.js'
import { createCamera } from './core/camera.js'
import { createClock } from './core/clock.js'
import { createLoop } from './core/loop.js'
import { createAssetLoader } from './core/assets.js'
import { createLevelManager } from './core/level-manager.js'
import { createPlayer } from './entities/player.js'
import { createKeyboardState } from './input/keyboard-state.js'
import { createKeyboardLock } from './input/keyboard-lock.js'
import { createPlayerView } from './cameras/player-view.js'
import { createInteractionSystem } from './systems/interaction.js'
import { createRespawnSystem } from './systems/respawn.js'
import { createTimeSystem } from './systems/time-system.js'
import { createHud } from './ui/hud.js'
import { createLoadingScreen } from './ui/loading-screen.js'
import { createMainMenu } from './ui/main-menu.js'
import { createSettingsMenu } from './ui/settings-menu.js'
import { createPauseMenu } from './ui/pause-menu.js'
import { createBoardingLevel } from './levels/boarding.js'
import { createMovingHeistLevel } from './levels/moving-heist.js'
import { createTimewreckLevel } from './levels/timewreck.js'
import { createCompleteLevel } from './levels/complete.js'

// Composition root. Everything persistent (renderer, camera, loop, input,
// HUD, menus, asset loader, interaction/respawn/time systems) is created here
// once; the per-level content is owned by the level manager, which builds and
// disposes one level module at a time. Keep this file wiring-only.

const canvas = document.querySelector('#app')

const { renderer, setScene, initPostProcessing } = createRenderer(canvas)
const scene = createScene()
setScene(scene) // lets display settings recompile materials on a shadow toggle
const { camera } = createCamera()
const clock = createClock()

// Post-processing and image-based lighting. The composer needs the scene and
// the camera, so it is built here rather than inside createRenderer; the
// environment map is what gives the PBR materials something to reflect.
const composer = initPostProcessing(scene, camera)
scene.environment = generateEnvironmentMap(renderer)

const assets = createAssetLoader()
const hud = createHud()
const loadingScreen = createLoadingScreen(assets)

// The player persists across levels; the level manager repositions it to
// each level's checkpoint on load.
const player = createPlayer()
scene.add(player.mesh)

const keyboard = createKeyboardState()
// Browser shortcuts (Ctrl+W, Ctrl+T, Ctrl+Tab) fire above the page unless the
// document is fullscreen with the keyboard locked, so a run engages both and a
// menu hands them back. Fullscreen covers documentElement rather than the
// canvas so the HUD and menu overlays come along with it.
const keyboardLock = createKeyboardLock(document.documentElement)
const playerView = createPlayerView({
  camera,
  domElement: renderer.domElement,
  player,
  hud
})
const interaction = createInteractionSystem({ camera, input: keyboard })
const respawn = createRespawnSystem({ player, hud, camera: playerView })
const timeSystem = createTimeSystem({ scene, player, hud })

// Time abilities. The key codes live in core/settings.js and are rebindable
// from the settings screen — everything here works in actions, not keys.
keyboard.onAction('slow', () => timeSystem.triggerSlow())
keyboard.onAction('freeze', () => timeSystem.triggerFreeze())
keyboard.onAction('rewind', () => timeSystem.triggerRewind())
keyboard.onAction('ghost', () => timeSystem.triggerGhost())
keyboard.onAction('restart', () => { if (gameStarted) levelManager.restart() })

// First-person / third-person toggle (V by default, rebindable like the rest).
keyboard.onAction('toggleView', () => playerView.toggle())

// Checkpoint resets are one of the run stats the pause menu reports.
let resetCount = 0
respawn.onFail(() => { resetCount += 1 })

const levelManager = createLevelManager({
  scene,
  interaction,
  assets,
  hud,
  player,
  camera: playerView,
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

// ---------------------------------------------------------------
// Main Menu
// ---------------------------------------------------------------
// The station scene is built behind the loading screen so the menu
// has a live 3D backdrop. The menu then owns the camera until the
// player clicks NEW GAME, at which point the third-person camera
// takes over and gameplay begins.

let gameStarted = false
let paused = false
let elapsed = 0 // run clock, frozen while paused or in a menu
let titleBackdrop = null // the silently-built station behind the title screen

// Until NEW GAME is clicked there is no run to drive: the HUD is hidden, the
// third-person camera and pointer lock are off (the menu owns the camera), and
// gameplay input is silenced so a stray Q on the title screen cannot fire a
// time ability behind the overlay.
hud.setVisible(false)
playerView.setEnabled(false)
keyboard.setEnabled(false)

// Build the first level silently (no loading-screen flash) so the
// station geometry, lighting and outdoor environment render behind
// the menu overlay.
function buildTitleBackdrop() {
  const ctx = {
    scene, interaction, assets, hud, timeSystem,
    player, camera: playerView, respawn,
    advance: () => levelManager.advance()
  }
  // Nothing is interactable behind the title screen, and the player is parked
  // back on the level's spawn — otherwise quitting mid-run would leave the
  // figure standing wherever the run ended, in shot of the cinematic camera.
  interaction.setEnabled(false)
  const level = createBoardingLevel(ctx)
  if (level.checkpoint) player.setPose(level.checkpoint.position, level.checkpoint.yaw)
  return level
}

const settingsMenu = createSettingsMenu()
const menu = createMainMenu({ camera, renderer, settingsMenu })

// ---------------------------------------------------------------
// Pause menu
// ---------------------------------------------------------------
// Pausing stops the gameplay update (the loop keeps rendering, so the frozen
// frame stays on screen behind the overlay), releases the pointer lock and
// silences input, so nothing moves or fires while a menu is up.

const pauseMenu = createPauseMenu({
  settingsMenu,
  canPause: () => gameStarted,
  getStatus: () => ({
    level: levelManager.getState(),
    objective: hud.getObjective(),
    elapsed,
    energy: timeSystem.getEnergy(),
    maxEnergy: timeSystem.getMaxEnergy(),
    suspicion: hud.getSuspicion(),
    timeMode: timeSystem.getMode(),
    resets: resetCount
  }),
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
  onRestart: () => {
    setPaused(false)
    resetCount = 0
    elapsed = 0
    levelManager.restart()
  },
  onQuit: () => quitToTitle()
})

function setPaused(value) {
  if (paused === value) return
  paused = value

  keyboard.setEnabled(!value)
  interaction.setEnabled(!value)
  playerView.setEnabled(!value)

  if (value) {
    pauseMenu.open()
    // Menus should behave like an ordinary page — the player may well want
    // Ctrl+W once they are out of the run. Fullscreen is left alone so
    // resuming does not flash the whole window.
    keyboardLock.release({ exitFullscreen: false })
  } else if (gameStarted) {
    // Runs from the Resume click, which is the user gesture a fullscreen
    // request needs; resuming with Esc instead just leaves the lock off.
    keyboardLock.engage()
    // Re-grab the mouse straight away; if the browser refuses (it rate-limits
    // a re-lock right after an Escape-driven exit) clicking the canvas still
    // works, which is what the camera's own click handler is for.
    playerView.requestLock()
  }
}

// Losing the pointer lock is the only reliable signal that the player pressed
// Escape while the mouse was captured — browsers consume that keydown — so it
// doubles as a pause trigger.
playerView.onLockLost(() => {
  if (gameStarted && !paused && !settingsMenu.isOpen) setPaused(true)
})

function startGame() {
  // Clean up the silently-built backdrop level; the level manager will
  // rebuild Boarding through its normal enter() pipeline, which sets up
  // interaction, checkpoints, HUD objective, etc.
  if (titleBackdrop) {
    titleBackdrop.dispose()
    titleBackdrop = null
  }

  gameStarted = true
  elapsed = 0
  resetCount = 0
  playerView.reset() // every run opens in third person
  hud.setVisible(true)
  playerView.setEnabled(true)
  keyboard.setEnabled(true)
  keyboardLock.engage()
  levelManager.enter('Boarding')
}

// Quit to title: tear the run down and rebuild the title screen's backdrop,
// so the player lands back on the same live station shot they started from
// without a page refresh.
function quitToTitle() {
  gameStarted = false
  paused = false
  elapsed = 0
  resetCount = 0

  levelManager.unload()
  keyboard.setEnabled(false)
  keyboardLock.release()
  playerView.setEnabled(false)
  // Quitting mid-run from first person left the player figure hidden; the
  // title screen's cinematic shot needs it back.
  playerView.reset()
  hud.setVisible(false)
  hud.setSuspicion(0)
  hud.setObjective('')

  titleBackdrop = buildTitleBackdrop()
  menu.show()
}

// Defer by two animation frames: the first paints the loading screen,
// the second runs the synchronous station build. This matches the
// pattern used by levelManager.enter() — see core/level-manager.js.
requestAnimationFrame(() => requestAnimationFrame(() => {
  titleBackdrop = buildTitleBackdrop()

  // One more frame so the station has rendered behind the loading
  // overlay before it fades away to reveal the menu.
  requestAnimationFrame(() => {
    loadingScreen.setProgress(1)
    loadingScreen.hide()
    menu.show()
  })

  menu.onStart(startGame)
}))

const loop = createLoop({ renderer, composer, scene, camera, clock })
loop.add((delta) => {
  hud.updateStats(delta)

  // While the menu is visible, drift the camera and skip gameplay.
  if (!gameStarted) {
    menu.updateCinematicCamera(delta)
    return
  }

  // Paused: no simulation, but the loop keeps rendering so the frozen scene
  // stays behind the overlay.
  if (paused) return

  elapsed += delta

  timeSystem.update(delta)
  levelManager.update(delta)

  player.update(delta, {
    keyboard: keyboard.state,
    cameraYaw: playerView.getYaw(),
    bounds: levelManager.bounds,
    obstacles: levelManager.obstacles
  })

  playerView.update(delta, player.mesh, scene, {
    crouching: Boolean(keyboard.state.duck)
  })
  interaction.update(player.mesh, playerView.getYaw())
  respawn.update()

  hud.updateTimeState({
    mode: timeSystem.getMode(),
    energy: timeSystem.getEnergy(),
    maxEnergy: timeSystem.getMaxEnergy(),
    ghostCooldown: timeSystem.getGhostCooldown(),
    hasGhost: timeSystem.getGhost().isPlaying(),
    available: timeSystem.getAbilityAvailability()
  })
})
loop.start()

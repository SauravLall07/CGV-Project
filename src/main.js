import * as THREE from 'three'
import { settings } from './core/settings.js'
import { createRenderer } from './core/renderer.js'
import { createPostProcessing } from './core/postprocessing.js'
import { createScene } from './core/scene.js'
import { createCamera } from './core/camera.js'
import { createClock } from './core/clock.js'
import { createLoop } from './core/loop.js'
import { createAssetLoader } from './core/assets.js'
import { createLevelManager } from './core/level-manager.js'
import { resolveInputState } from './core/input-state.js'
import { initAudio, resumeAudio, getContext } from './core/audio.js'
import { preloadAbilitySfx } from './systems/ability-sfx.js'
import { createPlayer } from './entities/player.js'
import { preloadPoliceVisual } from './entities/police-visual.js'
import { createKeyboardState } from './input/keyboard-state.js'
import { createKeyboardLock } from './input/keyboard-lock.js'
import { createPlayerView } from './cameras/player-view.js'
import { createInteractionSystem } from './systems/interaction.js'
import { createRespawnSystem } from './systems/respawn.js'
import { createTimeSystem } from './systems/time-system.js'
import { loadTrack, startLevelMusic, stopLevelMusic } from './systems/level-music.js'
import { MusicSystem } from './systems/music-system.js'
import { createHud } from './ui/hud.js'
import { createMinimap } from './ui/minimap.js'
import { createLoadingScreen } from './ui/loading-screen.js'
import { createMainMenu } from './ui/main-menu.js'
import { createSettingsMenu } from './ui/settings-menu.js'
import { createPauseMenu } from './ui/pause-menu.js'
import { createCredits } from './ui/credits.js'
import { createBoardingLevel } from './levels/boarding.js'
import { LANDING_FIGURE } from './environment/landing/layout.js'
import { loadTrainModel } from './entities/train.js'
import { loadBoardingAssets } from './environment/nature-props.js'
import { createMovingHeistLevel } from './levels/moving-heist.js'
import { createTimewreckLevel } from './levels/timewreck.js'
import { createCompleteLevel } from './levels/complete.js'
import { createModelEditor } from './dev/model-editor.js'
import { mountRenderOverlay } from './dev/render-overlay.js'

// Composition root. Everything persistent (renderer, camera, loop, input,
// HUD, menus, asset loader, interaction/respawn/time systems) is created here
// once; the per-level content is owned by the level manager, which builds and
// disposes one level module at a time. Keep this file wiring-only.

const canvas = document.querySelector('#app')

const { renderer, setScene } = createRenderer(canvas)
const post = createPostProcessing(renderer)
const scene = createScene()
setScene(scene) // lets display settings recompile materials on a shadow toggle
const { camera } = createCamera()
const clock = createClock()

const assets = createAssetLoader()
const hud = createHud()
const loadingScreen = createLoadingScreen(assets)

// The player persists across levels; the level manager repositions it to
// each level's checkpoint on load.
const player = createPlayer()
scene.add(player.mesh)
const detectiveReady = player.loadVisual(assets)
const policeReady = preloadPoliceVisual(assets)

const minimap = createMinimap({
  scene,
  hudRoot: hud.root,
  mainCamera: camera,
  player,
  // levelManager is created below; these are only called from the render loop.
  getObstacles: () => levelManager.obstacles,
  getGuards: () => levelManager.guards,
  getLevelState: () => levelManager.getState(),
  getCarriageVolumes: () => levelManager.carriageVolumes
})

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

// Browsers keep the AudioContext suspended until a user gesture. The title
// menu overlay sits on top of the canvas, so NEW GAME / SETTINGS have to
// unlock it as well as the canvas click that later grabs pointer lock.
const LEVEL_TRACKS = {
  Boarding: { file: '../assets/audio/music/level1-constance.mp3', loop: true },
  MovingHeist: { file: '../assets/audio/music/level2-mistake-the-getaway.mp3', loop: true },
  Timewreck: { file: '../assets/audio/music/level3-final-count.mp3', loop: true },
  Complete: { file: '../assets/audio/music/victory-theme.mp3', loop: false }
}

let musicSystem = null

function ensureGameplayDrone() {
  if (musicSystem) return musicSystem
  if (!getContext()) return null
  musicSystem = new MusicSystem()
  musicSystem.setTimeDilation(1)
  if (import.meta.env.DEV) window.musicSystem = musicSystem
  return musicSystem
}

function disposeGameplayDrone() {
  if (!musicSystem) return
  musicSystem.dispose()
  musicSystem = null
  if (import.meta.env.DEV) window.musicSystem = null
}

function playMusicForState(state) {
  const spec = LEVEL_TRACKS[state]
  console.log(
    `[music ${new Date().toISOString()} t=${performance.now().toFixed(1)}] playMusicForState("${state}") drone=${musicSystem ? '#' + musicSystem.id : 'none'} spec=${spec ? spec.file : 'none'}`
  )
  if (!spec) {
    stopLevelMusic()
    disposeGameplayDrone()
    return
  }
  // Sampled tracks swap per level; the drone is one bed under L1–L3 only.
  if (state === 'Complete') disposeGameplayDrone()
  else ensureGameplayDrone()
  startLevelMusic(loadTrack(spec.file), { loop: spec.loop })
}

async function playMenuMusic() {
  console.log('playMenuMusic called')
  await startLevelMusic(loadTrack('../assets/audio/music/menu-theme.mp3'), { loop: true })
  console.log('playMenuMusic: startLevelMusic() resolved')
}

function unlockAudio() {
  console.log('unlockAudio() called')
  initAudio()
  const preloading = preloadAbilitySfx()
  if (preloading && typeof preloading.then === 'function') {
    preloading.then(() => {
      console.log('[ability-sfx] unlockAudio preload settled before/during menu')
    })
  }
  const ctx = getContext()
  console.log('unlockAudio context before resume: ' + (ctx ? ctx.state : 'none'))
  const unlocking = resumeAudio()
  console.log('unlockAudio resumeAudio() returned:', unlocking)

  const startMenu = async () => {
    console.log('startMenu called, gameStarted: ' + gameStarted)
    if (gameStarted) return
    await playMenuMusic()
  }

  const runStartMenu = () => {
    console.log('unlockAudio: calling startMenu()')
    const started = startMenu()
    if (started && typeof started.then === 'function') {
      return started.then(() => {
        console.log('unlockAudio: startMenu() finished')
      })
    }
    console.log('unlockAudio: startMenu() finished')
  }

  if (unlocking && typeof unlocking.then === 'function') unlocking.then(runStartMenu)
  else runStartMenu()
}

// Earliest possible unlock: any click, key, or touch — not just NEW GAME /
// SETTINGS. once-per-type plus an explicit remove so the three events share
// a single first-gesture fire.
const FIRST_GESTURES = ['click', 'keydown', 'touchstart']
function onFirstUserGesture() {
  for (const type of FIRST_GESTURES) {
    document.removeEventListener(type, onFirstUserGesture, true)
  }
  unlockAudio()
}
for (const type of FIRST_GESTURES) {
  document.addEventListener(type, onFirstUserGesture, { once: true, capture: true })
}

canvas.addEventListener('click', () => {
  console.log('Canvas clicked, attempting audio resume')
  unlockAudio()
})
console.log('Audio click listener attached to: ' + canvas.tagName)

const interaction = createInteractionSystem({ camera, input: keyboard })
const timeSystem = createTimeSystem({
  scene,
  player,
  hud,
  onTimeScale(scale) {
    if (musicSystem) musicSystem.setTimeDilation(scale)
  },
})
const respawn = createRespawnSystem({
  player,
  hud,
  camera: playerView,
  timeSystem,
  onStateChange: () => syncInputState()
})

// Time abilities. The key codes live in core/settings.js and are rebindable
// from the settings screen — everything here works in actions, not keys.
keyboard.onAction('slow', () => timeSystem.triggerSlow())
keyboard.onAction('freeze', () => timeSystem.triggerFreeze())
keyboard.onAction('rewind', () => timeSystem.triggerRewind())
keyboard.onAction('ghost', () => timeSystem.triggerGhost())

keyboard.onAction('restart', () => {
  if (gameStarted && !credits.isOpen) {
    respawn.resetLives()
    levelManager.restart()
  }
})

// Passage-specific action routing. Boarding owns the distraction mechanic, but
// the keyboard binding remains global/rebindable like every other action.
keyboard.onAction('distract', () => {
  if (gameStarted) levelManager.handleAction('distract')
})

// First-person / third-person toggle (V by default, rebindable like the rest).
keyboard.onAction('toggleView', () => playerView.toggle())

// Checkpoint resets are one of the run stats the pause
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
  renderer,
  timeSystem,
  loadingScreen,
  onEnter: (state) => {
    playMusicForState(state)
    // A level rebuild creates fresh Object3D instances. Phase 2 of the Model
    // Workshop remaps its stable scene keys here so saved dev-layout overrides
    // are reapplied before the loading overlay hands control back to the player.
    modelEditor?.sceneChanged?.()
    if (state === 'Complete') showCompleteCredits()
    else timeSystem.warmGhost(renderer, camera)
  },
  onLeave: stopLevelMusic,
  onInputStateChange: () => syncInputState(),
  levels: [
    { state: 'Boarding', create: createBoardingLevel },
    { state: 'MovingHeist', create: createMovingHeistLevel },
    { state: 'Timewreck', create: createTimewreckLevel },
    { state: 'Complete', create: createCompleteLevel, keepPrevious: true }
  ]
})
let renderOverlay = null
if (import.meta.env.DEV) {
  window.levelManager = levelManager
  window.musicSystem = musicSystem
  window.renderer = renderer
  window.scene = scene
  renderOverlay = mountRenderOverlay(renderer, { player, playerView })
}

// Disabled: running out of lives on Level 2 must not send the player back to
// Level 1. With no game-over handler, the respawn system keeps using the
// current checkpoint after every failure.
// respawn.setGameOverHandler(() => {
//   elapsed = 0
//   resetCount = 0
//   timeSystem.resetRun?.()
//   playerView.reset()
//   hud.setSuspicion(0)
//   respawn.resetLives()
//   levelManager.enter('Boarding')
// })

// ---------------------------------------------------------------
// Main Menu
// ---------------------------------------------------------------
// The station scene is built behind the loading screen so the menu
// has a live 3D backdrop. The menu then owns the camera until the
// player clicks NEW GAME, at which point the third-person camera
// takes over and gameplay begins.

let gameStarted = false
let arrival = null
let paused = false
let elapsed = 0 // run clock, frozen while paused or in a menu
let titleBackdrop = null // the silently-built station behind the title screen
let modelEditor = null // DEV-only live scene/model workshop (F2)

// Large walkthrough popups freeze gameplay and silence actions, but keep the
// rendered scene visible behind the guide. The HUD captures Enter/Space itself
// so those keys dismiss the guide without also triggering a gameplay action.
hud.onTutorialStateChange((open) => {
  const controlsEnabled = gameStarted && !paused && !open
  keyboard.setEnabled(controlsEnabled)
  interaction.setEnabled(controlsEnabled)
  playerView.setEnabled(controlsEnabled)
})

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
async function buildTitleBackdrop() {
  await Promise.all([loadBoardingAssets(), loadTrainModel()])
  const ctx = {
    scene, interaction, assets, hud, timeSystem, renderer,
    player, camera: playerView, respawn,
    advance: () => levelManager.advance(),
    beginCinematic() {
      respawn.cancel()
      syncInputState()
    }
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
const credits = createCredits({
  onDismiss: (source) => {
    if (source === 'complete') quitToTitle()
  }
})
const menu = createMainMenu({
  camera,
  player,
  renderer,
  settingsMenu,
  unlockAudio,
  onCredits: () => credits.open({ source: 'menu' }),
  isCreditsOpen: () => credits.isOpen
})

// ---------------------------------------------------------------
// Pause menu
// ---------------------------------------------------------------
// Pausing stops the gameplay update (the loop keeps rendering, so the frozen
// frame stays on screen behind the overlay), releases the pointer lock and
// silences input, so nothing moves or fires while a menu is up.

const pauseMenu = createPauseMenu({
  settingsMenu,
  canPause: () => gameStarted && !credits.isOpen && !modelEditor?.isOpen(),
  getStatus: () => ({
    level: levelManager.getState(),
    objective: hud.getObjective(),
    elapsed,
    energy: timeSystem.getEnergy(),
    maxEnergy: timeSystem.getMaxEnergy(),
    suspicion: hud.getSuspicion(),
    timeMode: timeSystem.getMode(),
    lives: respawn.getLives(),
    maxLives: respawn.getMaxLives(),
    resets: resetCount
  }),
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
  onRestart: () => {
    resetCount = 0
    elapsed = 0
    respawn.resetLives()
    timeSystem.resetRun?.()
    levelManager.restart()
    setPaused(false)
  },
  onQuit: () => quitToTitle()
})

// ---------------------------------------------------------------
// Development Model Workshop (F2)
// ---------------------------------------------------------------
// This is deliberately DEV-only. Phase 2 edits the live Three.js scene, pauses
// gameplay while open, and can persist transforms, names, materials, lights and
// camera bookmarks to .model-workshop/layout.json through the Vite dev server.
if (import.meta.env.DEV) {
  modelEditor = createModelEditor({
    scene,
    camera,
    renderer,
    player,
    getObstacles: () => levelManager.obstacles,
    getContextLabel: () => levelManager.getState() ?? 'Scene',
    canOpen: () => (
      gameStarted &&
      !paused &&
      !credits.isOpen &&
      !levelManager.isTransitioning() &&
      !levelManager.isCinematic() &&
      !respawn.isFailing()
    ),
    onOpen: () => {
      // Hiding the HUD makes the scene easier to inspect and, more
      // importantly, syncInputState() disables movement, interactions and the
      // pointer-lock player camera before OrbitControls takes over.
      hud.setVisible(false)
      syncInputState()
    },
    onClose: () => {
      // The PlayerView object still owns exactly the same first/third-person
      // mode and yaw/pitch as before. snap() simply puts the physical camera
      // back onto that mode after the editor has moved it around.
      syncInputState()
      playerView.snap()
      hud.setVisible(gameStarted && !credits.isOpen)
      if (getInputState() === 'PLAYING') playerView.requestLock()
    }
  })
  window.modelEditor = modelEditor
}

function getInputState() {
  return resolveInputState({
    gameStarted,
    creditsOpen: credits.isOpen,
    paused,
    transitioning: levelManager.isTransitioning(),
    caught: respawn.isFailing(),
    cinematic: levelManager.isCinematic() || Boolean(arrival),
    editor: Boolean(modelEditor?.isOpen())
  })
}

function syncInputState() {
  const enabled = getInputState() === 'PLAYING'
  keyboard.setEnabled(enabled)
  interaction.setEnabled(enabled)
  playerView.setEnabled(enabled)
}

function setPaused(value) {
  if (paused === value) return
  paused = value

  respawn.setPaused(value)
  syncInputState()

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
    if (getInputState() === 'PLAYING') playerView.requestLock()
  }
}

// Losing the pointer lock is the only reliable signal that the player pressed
// Escape while the mouse was captured — browsers consume that keydown — so it
// doubles as a pause trigger.
playerView.onLockLost(() => {
  if (getInputState() === 'PLAYING' && !settingsMenu.isOpen) setPaused(true)
})

function showCompleteCredits() {
  // Open first so the pointer-lock release is not treated as a pause.
  credits.open({ source: 'complete', completionTime: elapsed })
  hud.setVisible(false)
  syncInputState()
  keyboardLock.release({ exitFullscreen: false })
}

// Third-person offset, matching cameras/third-person-camera.js (pivot 1.5 m,
// default pitch 0.25). The glide ends on that pose so control starts with no pop.
const ARRIVAL_PIVOT_Y = 1.5
const ARRIVAL_PITCH = 0.25
const ARRIVAL_UP = new THREE.Vector3(0, 1, 0)
const arrivalEndMatrix = new THREE.Matrix4()

function beginForecourtArrival() {
  const yaw = LANDING_FIGURE.yaw
  const distance = settings.get('cameraDistance')
  const pivot = new THREE.Vector3(
    LANDING_FIGURE.x,
    LANDING_FIGURE.y + ARRIVAL_PIVOT_Y,
    LANDING_FIGURE.z
  )
  const horizontal = Math.cos(ARRIVAL_PITCH)
  const endPos = new THREE.Vector3(
    pivot.x - Math.sin(yaw) * horizontal * distance,
    pivot.y + Math.sin(ARRIVAL_PITCH) * distance,
    pivot.z - Math.cos(yaw) * horizontal * distance
  )
  arrivalEndMatrix.lookAt(endPos, pivot, ARRIVAL_UP)
  arrival = {
    t: 0,
    duration: 2,
    yaw,
    pitch: ARRIVAL_PITCH,
    startPos: camera.position.clone(),
    endPos,
    startQuat: camera.quaternion.clone(),
    endQuat: new THREE.Quaternion().setFromRotationMatrix(arrivalEndMatrix)
  }
}

function updateForecourtArrival(delta) {
  arrival.t += delta
  const u = Math.min(1, arrival.t / arrival.duration)
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
  camera.position.lerpVectors(arrival.startPos, arrival.endPos, e)
  camera.quaternion.copy(arrival.startQuat).slerp(arrival.endQuat, e)
  if (u < 1) return false
  playerView.setYaw(arrival.yaw)
  playerView.setPitch(arrival.pitch)
  playerView.snap()
  arrival = null
  return true
}

function startGame() {
  respawn.reset()
  timeSystem.resetForRun()
  gameStarted = true
  paused = false
  elapsed = 0
  resetCount = 0
  respawn.resetLives()
  timeSystem.resetRun?.()
  playerView.reset() // every run opens in third person
  hud.resetRunTimer()
  hud.setVisible(true)
  keyboardLock.engage()
  const devStart = devStartOptions()
  if (devStart) {
    // A skipped start still rebuilds through the level manager.
    if (titleBackdrop) {
      titleBackdrop.dispose()
      titleBackdrop = null
    }
    levelManager.enter(devStart.state, { levelOptions: devStart.levelOptions })
    return
  }
  if (titleBackdrop) {
    const level = titleBackdrop
    titleBackdrop = null
    levelManager.adopt('Boarding', level)
    beginForecourtArrival()
    return
  }
  levelManager.enter('Boarding')
}

// Dev builds only: ?start=<target> makes NEW GAME skip ahead for playtesting.
//   level2 / level3          — start that level from its beginning
//   security, relay, cargo,  — start Level 2 at that carriage (or on the
//   mechanical, convergence,   roof run or in the Vault), with every ability
//   roof, vault                and door from the earlier cars done
function devStartOptions() {
  if (!import.meta.env.DEV) return null
  const target = new URLSearchParams(window.location.search).get('start')?.toLowerCase()
  if (!target) return null
  if (target === 'level2') return { state: 'MovingHeist' }
  if (target === 'level3') return { state: 'Timewreck' }
  const carriages = ['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence', 'roof', 'vault']
  if (carriages.includes(target)) return { state: 'MovingHeist', levelOptions: { startAt: target } }
  console.warn(`?start=${target} is not a known start point`)
  return null
}

// Quit to title: tear the run down and rebuild the title screen's backdrop,
// so the player lands back on the same live station shot they started from
// without a page refresh.
async function quitToTitle() {
  gameStarted = false
  paused = false
  elapsed = 0
  resetCount = 0

  levelManager.unload()
  syncInputState()
  keyboardLock.release()

  // Quitting mid-run from first person left the player figure hidden; the
  // title screen's cinematic shot needs it back.
  playerView.reset()
  hud.setVisible(false)
  hud.setSuspicion(0)
  hud.setObjective('')
  hud.resetRunTimer()

  titleBackdrop = await buildTitleBackdrop()
  disposeGameplayDrone()
  menu.show()
  unlockAudio()
}

// Defer by two animation frames: the first paints the loading screen,
// the second runs the synchronous station build. This matches the
// pattern used by levelManager.enter() — see core/level-manager.js.
requestAnimationFrame(() => requestAnimationFrame(async () => {
  titleBackdrop = await buildTitleBackdrop()

  // Compile Ghost materials/lights while the loading overlay still covers
  // the canvas — first Ghost press must not pay that shader cost in-game.
  timeSystem.warmGhost(renderer, camera)

  await Promise.all([detectiveReady, policeReady])

  // One more frame so the station has rendered behind the loading
  // overlay before it fades away to reveal the menu.
  requestAnimationFrame(() => {
    loadingScreen.setProgress(1)
    loadingScreen.hide()
    menu.show()
  })

  menu.onStart(startGame)
}))

const loop = createLoop({
  renderer,
  scene,
  camera,
  clock,
  render: post.render,

  afterRender: (gl) => {
    const show = gameStarted && !credits.isOpen
    minimap.setVisible(show)

    if (show) {
      minimap.render(gl)
    }
  }
})

loop.add((delta) => {
  // Mixer tick is independent of gameplay input state. Title / transition /
  // cinematic / credits all used to return before player.update(), which
  // left the detective frozen in bind pose after the first frame.
  player.updateVisual(delta)

  hud.updateStats(delta)
  renderOverlay?.update(delta)

  // The model workshop owns the same render camera while open. Gameplay is
  // frozen, but the normal renderer keeps drawing the live level behind its
  // editor UI so transforms and light changes are immediate.
  if (modelEditor?.isOpen()) {
    modelEditor.update(delta)
    return
  }

  if (credits.isOpen) return

  // While the menu is visible, drift the camera and skip gameplay.
  if (!gameStarted) {
    menu.updateCinematicCamera(delta)
    titleBackdrop?.updateAtmosphere?.(delta, camera.position)
    return
  }

  // Walkthrough tutorials completely freeze gameplay while the scene remains
  // rendered behind the overlay. Check this before syncInputState() so the
  // tutorial's disabled controls cannot accidentally be re-enabled.
  if (hud.isTutorialOpen()) return

  syncInputState()

  const inputState = getInputState()

  if (
    inputState === 'PAUSED' ||
    inputState === 'TRANSITION' ||
    inputState === 'CAUGHT'
  ) {
    return
  }

  const heistComplete = levelManager.getState() === 'Complete'
  if (!heistComplete) elapsed += delta

  hud.updateRunTimer({
    elapsed,
    delta,
    mode: timeSystem.getMode(),
    ghostActive: timeSystem.getGhost().isPlaying(),
    running: !heistComplete
  })

  timeSystem.update(delta)
  levelManager.update(delta)

  // A level update may have opened a tutorial this frame. Stop immediately
  // so the player cannot move one extra frame into a hazard under the popup.
  if (hud.isTutorialOpen()) return

  // New Game keeps the title framing and eases down behind the detective
  // before the third-person camera takes over.
  if (arrival && !updateForecourtArrival(delta)) {
    syncInputState()
    return
  }

  // Cinematics and other non-playing states may still need level animation,
  // but movement and interaction must not resume during the same frame.
  if (getInputState() !== 'PLAYING') {
    syncInputState()
    return
  }

  player.update(delta, {
    keyboard: keyboard.state,
    cameraYaw: playerView.getYaw(),
    bounds: levelManager.bounds,
    obstacles: levelManager.obstacles,
    groundHeightAt: levelManager.groundHeightAt,
    supports: levelManager.supports,
    voids: levelManager.voids
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
    available: timeSystem.getAbilityAvailability(),
    strain: timeSystem.getStrain(),
    maxStrain: timeSystem.getMaxStrain(),
    strainEnabled: timeSystem.isStrainEnabled(),
    freezeLockout: timeSystem.getFreezeLockout()
  })
})

loop.start()

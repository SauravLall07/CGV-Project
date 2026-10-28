import * as THREE from 'three'
import { settings } from './core/settings.js'
import { createRenderer } from './core/renderer.js'
import { createPostProcessing } from './core/postprocessing.js'
import { createScene } from './core/scene.js'
import { createCamera } from './core/camera.js'
import { createClock } from './core/clock.js'
import { createLoop } from './core/loop.js'
import { createAssetLoader } from './core/assets.js'
import { createLoadingTasks } from './core/loading-tasks.js'
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
import { loadTrack, startLevelMusic, stopLevelMusic, LevelMusicPlayer } from './systems/level-music.js'
import { MusicSystem } from './systems/music-system.js'
import { createHud } from './ui/hud.js'
import { createMinimap } from './ui/minimap.js'
import { createLoadingScreen } from './ui/loading-screen.js'
import { createMainMenu } from './ui/main-menu.js'
import { createSettingsMenu } from './ui/settings-menu.js'
import { createPauseMenu } from './ui/pause-menu.js'
import { createCredits } from './ui/credits.js'
import { createStoryPlayer } from './ui/story-player.js'
import { createTitleBackdrop } from './ui/title-backdrop.js'
import { introBeat } from './story/intro-beat.js'
import { createTransitionPlayer } from './ui/transition-player.js'
import { l3TransitionBeat } from './story/l3-transition-beat.js'
import { createBoardingLevel } from './levels/boarding.js'
import { LANDING_CAMERA, LANDING_FIGURE, LANDING_VIEW } from './environment/landing/layout.js'
import { loadBoardingAssets } from './environment/nature-props.js'
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

// The existing renderer/composer subscriptions consume transient renderScale.
// Persist only the quality choice, never Auto's current tier or a benchmark.
const renderQuality = (() => {
  const tiers = [1, 0.85, 0.7]
  const fixed = { high: 1, balanced: 0.85, performance: 0.7 }
  let tier = 0, override = null, last = 0, smoothed = 0
  let slowFor = 0, fastFor = 0, holdUntil = 0
  function apply() {
    settings.setRuntimeRenderScale(override ?? fixed[settings.get('renderQuality')] ?? tiers[tier])
  }
  settings.subscribe((_values, changed) => {
    if (changed === 'renderQuality' || changed === 'options' || changed === 'all') {
      tier = 0; slowFor = 0; fastFor = 0; smoothed = 0; last = 0
      apply()
    }
  })
  apply()
  return {
    update(now) {
      const ms = last ? now - last : 0
      last = now
      if (!ms || ms > 250 || document.hidden || override !== null || settings.get('renderQuality') !== 'auto') {
        slowFor = 0; fastFor = 0; return
      }
      smoothed = smoothed ? smoothed + (ms - smoothed) * (1 - Math.exp(-ms / 500)) : ms
      if (now < holdUntil) return
      slowFor = smoothed > 33 ? slowFor + ms : 0
      fastFor = smoothed < 22 ? fastFor + ms : 0
      if ((slowFor >= 2000 && tier < 2) || (fastFor >= 4000 && tier > 0)) {
        tier += slowFor >= 2000 ? 1 : -1
        slowFor = 0; fastFor = 0; holdUntil = now + 2000
        apply()
      }
    },
    getScale: () => settings.get('renderScale'),
    setOverride(value) {
      override = value
      last = 0; smoothed = 0; slowFor = 0; fastFor = 0
      apply()
    }
  }
})()
let benchmark = null
const benchTarget = import.meta.env?.DEV ? new URLSearchParams(window.location.search).get('bench') : null
const scene = createScene()
setScene(scene) // lets display settings recompile materials on a shadow toggle
const { camera } = createCamera()
const clock = createClock()

const assets = createAssetLoader()
const hud = createHud()
const startupTasks = createLoadingTasks(['detective', 'police', 'ghost', 'backdrop', 'presentation'])
const loadingScreen = createLoadingScreen(assets, { tasks: startupTasks })
// The Level 2 → 3 story beat builds Level 3 while its own panel is on screen,
// so the level manager's loading overlay is suppressed for that one build.
let quietLevelLoad = false
const levelLoadingScreen = {
  show() { if (!quietLevelLoad) loadingScreen.show() },
  hide() { loadingScreen.hide() },
  setError() { quietLevelLoad = false; loadingScreen.show(); loadingScreen.setError?.() }
}

// The player persists across levels; the level manager repositions it to
// each level's checkpoint on load.
const player = createPlayer()
scene.add(player.mesh)
const detectiveReady = startupTasks.track('detective', player.loadVisual(assets))
const policeReady = startupTasks.track('police', preloadPoliceVisual(assets))
// Ghost Mixamo load starts after createTimeSystem() below; charactersReady
// is assigned there so the menu waits for player, police, and ghost visuals.
let charactersReady = Promise.all([detectiveReady, policeReady])
let startupPrepared = false

const minimap = createMinimap({
  scene,
  hudRoot: hud.minimapRoot,
  mainCamera: camera,
  player,
  // levelManager is created below; these are only called from the render loop.
  getObstacles: () => levelManager.obstacles,
  getGuards: () => levelManager.guards,
  getLevelState: () => levelManager.getState(),
  getCarriageVolumes: () => levelManager.carriageVolumes,
  getVoids: () => levelManager.voids,
  getSupports: () => levelManager.supports,
  getRange: () => settings.get('minimapRange')
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
  Ending: null, // Silent epilogue; stop both the sampled track and gameplay drone.
  Complete: { file: '../assets/audio/music/victory-theme.mp3', loop: false }
}

let musicSystem = null

function ensureGameplayDrone() {
  if (musicSystem) return musicSystem
  if (!getContext()) return null
  musicSystem = new MusicSystem()
  musicSystem.setTimeDilation(1)
  if (import.meta.env?.DEV) window.musicSystem = musicSystem
  return musicSystem
}

function disposeGameplayDrone() {
  if (!musicSystem) return
  musicSystem.dispose()
  musicSystem = null
  if (import.meta.env?.DEV) window.musicSystem = null
}

function playMusicForState(state) {
  const spec = LEVEL_TRACKS[state]
  if (import.meta.env?.DEV) console.log(
    `[music ${new Date().toISOString()} t=${performance.now().toFixed(1)}] playMusicForState("${state}") drone=${musicSystem ? '#' + musicSystem.id : 'none'} spec=${spec ? spec.file : 'none'}`
  )
  if (!spec) {
    stopLevelMusic()
    disposeGameplayDrone()
    return
  }
  // Sampled tracks swap per level; the drone is one bed under L1–L3 only.
  if (state === 'Complete') disposeGameplayDrone()
  else ensureGameplayDrone()?.setTimeDilation(1)
  startLevelMusic(loadTrack(spec.file), { loop: spec.loop })
}

async function playMenuMusic() {
  if (import.meta.env?.DEV) console.log('playMenuMusic called')
  await startLevelMusic(loadTrack('../assets/audio/music/menu-theme.mp3'), { loop: true })
  if (import.meta.env?.DEV) console.log('playMenuMusic: startLevelMusic() resolved')
}

function unlockAudio({ menuMusic = true } = {}) {
  if (import.meta.env?.DEV) console.log('unlockAudio() called')
  initAudio()
  // The title invokes this synchronously inside its New Game gesture.
  storyPlayer?.unlockAudio?.()
  const preloading = preloadAbilitySfx()
  if (preloading && typeof preloading.then === 'function') {
    preloading.then(() => {
      if (import.meta.env?.DEV) console.log('[ability-sfx] unlockAudio preload settled before/during menu')
    })
  }
  const ctx = getContext()
  if (import.meta.env?.DEV) console.log('unlockAudio context before resume: ' + (ctx ? ctx.state : 'none'))
  const unlocking = resumeAudio()
  if (import.meta.env?.DEV) console.log('unlockAudio resumeAudio() returned:', unlocking)

  const startMenu = async () => {
    if (import.meta.env?.DEV) console.log('startMenu called, gameStarted: ' + gameStarted)
    if (gameStarted || !menuMusic) return
    await playMenuMusic()
  }

  const runStartMenu = () => {
    if (import.meta.env?.DEV) console.log('unlockAudio: calling startMenu()')
    const started = startMenu()
    if (started && typeof started.then === 'function') {
      return started.then(() => {
        if (import.meta.env?.DEV) console.log('unlockAudio: startMenu() finished')
      })
    }
    if (import.meta.env?.DEV) console.log('unlockAudio: startMenu() finished')
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
  if (import.meta.env?.DEV) console.log('Canvas clicked, attempting audio resume')
  unlockAudio()
})
if (import.meta.env?.DEV) console.log('Audio click listener attached to: ' + canvas.tagName)

const interaction = createInteractionSystem({ camera, input: keyboard,
  onTap: ({ gesture }) => {
    if (getInputState() !== 'PLAYING') return
    if (gesture === 'pickup') player.playPickup()
    else if (gesture === 'press') player.playPress()
  }
})
player.onPoseReset(() => interaction.resetHold())
const timeSystem = createTimeSystem({
  scene,
  player,
  hud,
  onTimeScale(scale) {
    if (musicSystem) musicSystem.setTimeDilation(scale)
  },
})
const ghostReady = startupTasks.track('ghost', timeSystem.loadGhostVisual(assets))
charactersReady = Promise.all([detectiveReady, policeReady, ghostReady])
// Observe early rejection while the backdrop is still being prepared. The
// startup barrier below also awaits this same promise before showing the menu.
charactersReady.catch(() => {})
const respawn = createRespawnSystem({
  player,
  hud,
  camera: playerView,
  timeSystem,
  onStateChange: () => syncInputState()
})

// Time abilities. The key codes live in core/settings.js and are rebindable
// from the settings screen — everything here works in actions, not keys.
// Time powers are first introduced in Level 2. Silently ignore their input
// throughout Boarding (Level 1), including any rebound ability keys. Guard
// before calling the time system so no unavailable-ability HUD message plays.
function triggerTimeAbilityOutsideBoarding(trigger) {
  if (!gameStarted || levelManager.getState() === 'Boarding') return
  trigger()
}
keyboard.onAction('slow', () => triggerTimeAbilityOutsideBoarding(() => timeSystem.triggerSlow()))
keyboard.onAction('freeze', () => triggerTimeAbilityOutsideBoarding(() => timeSystem.triggerFreeze()))
keyboard.onAction('rewind', () => triggerTimeAbilityOutsideBoarding(() => timeSystem.triggerRewind()))
keyboard.onAction('ghost', () => triggerTimeAbilityOutsideBoarding(() => timeSystem.triggerGhost()))

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
  loadingScreen: levelLoadingScreen,
  onEnter: (state) => {
    if (gameStarted && !storyPlayer?.active && !awaitingIntro) playMusicForState(state)
    // A level rebuild creates fresh Object3D instances. Phase 2 of the Model
    // Workshop remaps its stable scene keys here so saved dev-layout overrides
    // are reapplied before the loading overlay hands control back to the player.
    modelEditor?.sceneChanged?.()
    if (state === 'Complete') showCompleteCredits()
    else if (state === 'Ending') hud.setVisible(false)
    else if (!awaitingIntro) timeSystem.warmGhost(renderer, camera)
    // Start the next module after presentation, never alongside boot FBXs.
    // Prefetch failure is optional; enter() will retry under the loading screen.
    const next = state === 'Boarding' ? 'MovingHeist' : state === 'MovingHeist' ? 'Timewreck' : state === 'Timewreck' ? 'Ending' : null
    if (next) requestAnimationFrame(() => requestAnimationFrame(() => {
      if (levelManager.getState() === state) levelManager.prefetch(next)
    }))
  },
  onLeave: () => {
    stopLevelMusic()
    releaseIdleLevel3Transition()
  },
  onInputStateChange: () => {
    startPreparedIntro()
    syncInputState()
  },
  levels: [
    { state: 'Boarding', load: async () => {
      await loadBoardingAssets()
      return ctx => createBoardingLevel({ ...ctx, renderCamera: camera })
    } },
    // Level 2's Core ending calls advance(); it now plays the Level 2 → 3
    // story beat, which builds Level 3 itself while panel 1 plays.
    { state: 'MovingHeist', load: () => import('./levels/moving-heist.js')
      .then(({ createMovingHeistLevel }) => ctx => {
        prepareLevel3Transition()
        startDevLevel3Cutscene()
        return createMovingHeistLevel({ ...ctx, post, advance: beginLevel3Transition })
      }) },
    { state: 'Timewreck', load: () => import('./levels/timewreck.js').then(({createTimewreckLevel}) => ctx => createTimewreckLevel({...ctx,post})) },
    // Prefetched during Level 3; held until the Level 2 → 3 beat has finished
    // so its module/painting decode cannot stutter the cutscene.
    { state: 'Ending', load: () => afterStoryBeat().then(() => import('./levels/ending.js'))
      .then(({ createEndingLevel, prefetchEndingPaintings }) => {
        // Paintings prefetch during Timewreck, but cannot hold the transition hostage.
        prefetchEndingPaintings().catch(error => {
          if (import.meta.env?.DEV) console.warn('Ending painting prefetch failed; using bounded in-level loading', error)
        })
        return ctx => createEndingLevel({ ...ctx, renderCamera: camera, post })
      }) },
    { state: 'Complete', create: createCompleteLevel, keepPrevious: true }
  ]
})
let renderOverlay = null
if (import.meta.env?.DEV) {
  window.levelManager = levelManager
  window.musicSystem = musicSystem
  window.renderer = renderer
  window.scene = scene
  renderOverlay = mountRenderOverlay(renderer, { player, playerView, post })
  if (benchTarget) {
    import('./dev/benchmark.js').then(({ createBenchmark }) => {
      benchmark = createBenchmark({
        camera, overlay: renderOverlay, quality: renderQuality,
        ready: () => gameStarted && getInputState() === 'PLAYING' && !hud.isTutorialOpen(),
        prepare() {
          if (benchTarget === 'platform') {
            renderOverlay.teleport('train')
            playerView.update(0, player.mesh, scene, { crouching: player.isCrouching() })
          }
        }
      })
    })
  }
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
// Boarding and the intro are prepared behind loading, before the title opens.

let gameStarted = false
let arrival = null
let paused = false
let elapsed = 0 // run clock, frozen while paused or in a menu
let titleBackdrop = null // independent scenery, never a gameplay level
let titleReturnPromise = null // coalesce returns and hold New Game until its backdrop is ready
let modelEditor = null // DEV-only live scene/model workshop (F2)
let storyPlayer = null
let storyRun = 0
let awaitingIntro = false
let introReady = Promise.resolve()
let boardingFilesReady = null
let preparedBoarding = null
let newGameClickedAt = 0
let firstLiveFramePending = false
let frameStartedAt = 0
let frameIntervalMs = 0
let ranFullGameFrame = false
let firstPlayableFramePending = false
let firstHiddenSystemsPending = true

function prepareIntro() {
  initAudio()
  const run = storyRun
  const owner = createStoryPlayer({ beat: introBeat, renderer,
    getRenderScale: () => settings.get('renderScale'), onRendererRestore: () => post.resize(), onCrossfade() {
    if (run !== storyRun || !gameStarted || storyPlayer !== owner) return
    warmGameplayAudio()
    // Keep HUD layout/paint preparation live under the smoke, without showing
    // it. display:none would defer layout until the first playable frame.
    hud.root.style.display = 'block'
    hud.root.style.visibility = 'hidden'
    beginForecourtArrival()
    firstLiveFramePending = true
  }, onComplete() {
    if (run !== storyRun || !gameStarted || storyPlayer !== owner) return
    storyPlayer = null
    firstPlayableFramePending = true
    playMusicForState(levelManager.getState())
    hud.root.style.visibility = ''
    hud.setVisible(true)
    syncInputState()
  } })
  storyPlayer = owner
  return owner.prefetch()
}

function setArrivalStartCamera() {
  const home = LANDING_CAMERA.position, aim = LANDING_CAMERA.target
  camera.position.set(home.x, home.y + Math.sin(0.6) * LANDING_CAMERA.driftY, home.z + LANDING_CAMERA.driftZ)
  camera.lookAt(aim.x, aim.y, aim.z)
}

function warmLevel1() {
  // Loading is still opaque in levelManager.onEnter. Exercise the SAME
  // renderer, shadows, bloom and output targets that the reveal will use.
  const spawnPosition = camera.position.clone(), spawnRotation = camera.quaternion.clone()
  setArrivalStartCamera()
  // Establish plaza visibility and lighting before any GPU preparation. The
  // hidden train and station reflections remain deferred until station entry.
  preparedBoarding.updateAtmosphere?.(0, camera.position)
  const textures = new Set()
  scene.traverseVisible(node => {
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
    for (const material of materials) {
      if (!material.isMaterial) continue
      for (const value of Object.values(material)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value)
      for (const uniform of Object.values(material.uniforms ?? {})) if (uniform.value?.isTexture && !uniform.value.isRenderTargetTexture) textures.add(uniform.value)
    }
  })
  if (scene.background?.isTexture && !scene.background.isRenderTargetTexture) textures.add(scene.background)
  if (scene.environment?.isTexture && !scene.environment.isRenderTargetTexture) textures.add(scene.environment)
  try {
    timeSystem.warmGhost(renderer, camera)
    for (const texture of textures) renderer.initTexture(texture)
    storyPlayer.warm(); storyPlayer.renderPrepared()
    scene.updateMatrixWorld(true)
    renderer.compile(scene, camera); post.render(scene, camera)
  } finally {
    camera.position.copy(spawnPosition); camera.quaternion.copy(spawnRotation)
  }
  if (import.meta.env?.DEV) console.log(`[load] level1 warmed ${performance.now().toFixed(1)}ms`)
}

function startPreparedIntro() {
  if (!awaitingIntro || !gameStarted || levelManager.getState() !== 'Boarding' || levelManager.isTransitioning()) return
  awaitingIntro = false
  setArrivalStartCamera()
  if (import.meta.env?.DEV) console.log(`[load] new game → intro ${(performance.now() - newGameClickedAt).toFixed(1)}ms`)
  storyPlayer.start()
}

// Large walkthrough popups freeze gameplay and silence actions, but keep the
// rendered scene visible behind the guide. The HUD captures Enter/Space itself
// so those keys dismiss the guide without also triggering a gameplay action.
hud.onTutorialStateChange((open) => {
  const controlsEnabled = getInputState() === 'PLAYING' && !open
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

// The manager adopts this exact instance on New Game; no second build.
function prefetchBoardingMusic() {
  const owner = new LevelMusicPlayer(loadTrack(LEVEL_TRACKS.Boarding.file))
  return owner.load().finally(() => owner.dispose())
}

function warmGameplayAudio() {
  let started = 0
  if (import.meta.env?.DEV) started = performance.now()
  const ctx = getContext(), drone = ensureGameplayDrone()
  if (!ctx || !drone) return
  // Construct the pink-noise PCM and nodes under cover, without an audible bed.
  drone.output.gain.cancelScheduledValues(ctx.currentTime)
  drone.output.gain.setValueAtTime(0, ctx.currentTime)
  if (import.meta.env?.DEV) console.log(`[perf] first hidden audio ${(performance.now() - started).toFixed(2)}ms`)
}

async function buildTitleBackdrop() {
  introReady = prepareIntro()
  boardingFilesReady = loadBoardingAssets()
  await Promise.all([introReady, charactersReady, boardingFilesReady, prefetchBoardingMusic()])
  preparedBoarding = createBoardingLevel({ scene, interaction, assets, hud, player,
    camera: playerView, renderCamera: camera, respawn, timeSystem, renderer,
    advance: () => levelManager.advance(), beginCinematic() { respawn.cancel(); syncInputState() } })
  const checkpoint = preparedBoarding.checkpoint
  player.setPose(checkpoint.position, checkpoint.yaw)
  playerView.setYaw(checkpoint.yaw ?? 0); playerView.setPitch(checkpoint.pitch)
  playerView.snap(); playerView.update(0, player.mesh, null)
  if (import.meta.env?.DEV) console.log(`[load] level1 built ${performance.now().toFixed(1)}ms`)
  warmLevel1()
  hud.setVisible(false)
  return createTitleBackdrop({ renderer, onRendererRestore: () => post.resize() })
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
  canPause: () => gameStarted && !storyPlayer?.active && !credits.isOpen && !modelEditor?.isOpen(),
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
if (import.meta.env?.DEV) {
  modelEditor = createModelEditor({
    scene,
    camera,
    renderer,
    player,
    getObstacles: () => levelManager.obstacles,
    getContextLabel: () => levelManager.getState() ?? 'Scene',
    canOpen: () => (
      gameStarted &&
      !storyPlayer?.active &&
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
    story: Boolean(storyPlayer?.active),
    creditsOpen: credits.isOpen,
    paused,
    transitioning: awaitingIntro || levelManager.isTransitioning(),
    caught: respawn.isFailing(),
    cinematic: levelManager.isCinematic() || Boolean(arrival),
    editor: Boolean(modelEditor?.isOpen())
  })
}

function syncInputState() {
  const state = getInputState()
  respawn.setPaused(paused || state === 'STORY')
  levelManager.setPresentationPaused(state !== 'PLAYING' && state !== 'CINEMATIC')
  const enabled = state === 'PLAYING' && !benchmark?.isHolding()
  if (!enabled) {
    if (state !== 'CINEMATIC' || !player.getCinematicView()?.allowPress) player.stopPress()
    // Successful boarding keeps its reversing pull alive during the cinematic.
    if (state !== 'CINEMATIC') player.resetInteractionAnimation()
    else player.cancelPickup()
  }
  keyboard.setEnabled(enabled)
  interaction.setEnabled(enabled)
  // The caught overlay freezes gameplay without releasing mouse capture.
  playerView.setEnabled(enabled || state === 'CAUGHT')
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
  if (['PLAYING', 'CAUGHT'].includes(getInputState()) && !settingsMenu.isOpen && !benchmark?.isHolding()) setPaused(true)
})

function showCompleteCredits() {
  // Open first so the pointer-lock release is not treated as a pause.
  credits.open({ source: 'complete', completionTime: elapsed })
  hud.setVisible(false)
  syncInputState()
  keyboardLock.release({ exitFullscreen: false })
}

// Third-person offset, matching cameras/third-person-camera.js (pivot 1.5 m)
// at the spawn's own pitch. The glide ends on that pose so control starts
// with no pop. The distance is capped where the camera's collision pass
// would stop it against the shop fronts behind the spawn.
const ARRIVAL_PIVOT_Y = LANDING_VIEW.pivotHeight
const ARRIVAL_PITCH = LANDING_FIGURE.pitch
const ARRIVAL_UP = new THREE.Vector3(0, 1, 0)
const arrivalEndMatrix = new THREE.Matrix4()

function beginForecourtArrival() {
  const yaw = LANDING_FIGURE.yaw
  const distance = Math.min(settings.get('cameraDistance'), LANDING_VIEW.maxDistance)
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
  if (titleReturnPromise) {
    titleReturnPromise.then(startGame)
    return
  }
  if (gameStarted) return
  newGameClickedAt = performance.now()
  firstHiddenSystemsPending = true
  firstPlayableFramePending = false
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
    storyRun++
    storyPlayer?.cancel()
    storyPlayer = null
    // A skipped start still rebuilds through the level manager.
    if (titleBackdrop) {
      titleBackdrop.dispose()
      titleBackdrop = null
    }
    preparedBoarding?.dispose(); preparedBoarding = null
    levelManager.enter(devStart.state, { levelOptions: devStart.levelOptions })
    return
  }
  stopLevelMusic()
  disposeGameplayDrone()
  awaitingIntro = true
  hud.setVisible(false)
  document.exitPointerLock?.()
  if (titleBackdrop) {
    titleBackdrop.dispose()
    titleBackdrop = null
  }
  const boarding = preparedBoarding; preparedBoarding = null
  levelManager.adopt('Boarding', boarding)
  startPreparedIntro()
  syncInputState()
}

// Dev builds only: ?start=<target> makes NEW GAME skip ahead for playtesting.
//   level2 / level3          — start that level from its beginning
//   security, relay, cargo,  — start Level 2 at that carriage (or on the
//   mechanical, convergence,   roof run or in the Vault), with every ability
//   roof, vault                and door from the earlier cars done
function devStartOptions() {
  if (!import.meta.env?.DEV) return null
  if (benchTarget === 'platform') return { state: 'Boarding' }
  const target = new URLSearchParams(window.location.search).get('start')?.toLowerCase()
  if (!target) return null
  if (target === 'level2') return { state: 'MovingHeist' }
  if (target === 'level3') return { state: 'Timewreck' }
  if (target === 'ending') return { state: 'Ending' }
  // Level 2 → 3 story beat straight away (as if the Core was just taken).
  if (target === 'l3cut') return { state: 'MovingHeist', levelOptions: { startAt: 'vault' }, cutscene: 'l3' }
  if (['level3-convergence', 'level3-mechanical', 'level3-passenger'].includes(target)) return { state: 'Timewreck', levelOptions: { startCarriage: target.slice(7) } }
  if (target === 'level3-security') return { state: 'Timewreck', levelOptions: { startCarriage: 'security' } }
  if (target === 'level3-relay') return { state: 'Timewreck', levelOptions: { startCarriage: 'relay' } }
  if (target === 'level3-cargo') return { state: 'Timewreck', levelOptions: { startCarriage: 'cargo' } }
  const carriages = ['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence', 'roof', 'vault']
  if (carriages.includes(target)) return { state: 'MovingHeist', levelOptions: { startAt: target } }
  console.warn(`?start=${target} is not a known start point`)
  return null
}

// ---------------------------------------------------------------
// Level 2 → Level 3 story beat
// ---------------------------------------------------------------
// Prepared (images + audio fetched) whenever Level 2 is built, consumed once
// when the Core ending calls advance(). While it runs it occupies the same
// storyPlayer slot as the intro, so STORY input, pause blocking, music gating
// and the minimap rules all apply unchanged.
let level3Transition = null
let devLevel3CutRun = -1

function prepareLevel3Transition() {
  if (level3Transition) return
  const owner = createTransitionPlayer({ beat: l3TransitionBeat, renderer,
    onRendererRestore: () => post.resize(),
    isLevelReady: () => levelManager.getState() === 'Timewreck' && !levelManager.isTransitioning(),
    onBlack() {
      if (storyPlayer !== owner) return
      // Already silent under the master fade; now actually stop them.
      stopLevelMusic()
      disposeGameplayDrone()
    },
    onBuild() {
      // Builds Level 3 (energy carried over) while panel 1 plays; panel 1
      // stays on screen instead of the loading overlay.
      if (storyPlayer !== owner) return
      quietLevelLoad = true
      levelManager.advance()
      // Fetch/decode Level 3's music in the background (shared cache), so it
      // starts instantly when the blue clears instead of decoding then.
      const music = new LevelMusicPlayer(loadTrack(LEVEL_TRACKS.Timewreck.file))
      music.load().catch(() => {}).finally(() => music.dispose())
    },
    onPrewarm() {
      // Right after the build, while panel 1 holds still: run and draw one
      // real Level 3 frame through the normal pipeline (post-processing), at
      // the spawn view. Its shader compiles, texture uploads and render
      // buffers happen here instead of when the cutscene ends. The player
      // draws panel 1 over it before the browser shows the frame.
      quietLevelLoad = false
      if (storyPlayer !== owner || levelManager.getState() !== 'Timewreck') return
      updateGameFrame(0, true)
      scene.updateMatrixWorld(true)
      // Everything, not just what the spawn view sees: parts of Level 3 that
      // come into view later would otherwise upload on their first frame.
      const textures = new Set(), culled = []
      scene.traverse(node => {
        if (node.frustumCulled && (node.isMesh || node.isPoints || node.isLine || node.isSprite)) { culled.push(node); node.frustumCulled = false }
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
        for (const material of materials) {
          for (const value of Object.values(material)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value)
          for (const uniform of Object.values(material.uniforms ?? {})) if (uniform?.value?.isTexture && !uniform.value.isRenderTargetTexture) textures.add(uniform.value)
        }
      })
      if (scene.background?.isTexture && !scene.background.isRenderTargetTexture) textures.add(scene.background)
      if (scene.environment?.isTexture && !scene.environment.isRenderTargetTexture) textures.add(scene.environment)
      try {
        for (const texture of textures) renderer.initTexture(texture)
        // Same pipeline as Level 3 gameplay (including its anti-aliasing pass).
        post.render(scene, camera, { antialias: true })
      } finally {
        for (const node of culled) node.frustumCulled = true
      }
      if (import.meta.env?.DEV) console.log(`[perf] level3 warm-up: ${textures.size} textures, ${culled.length} objects drawn once`)
    },
    onReveal() {
      // The blue surge is clearing onto Level 3: bring its music in with it.
      if (storyPlayer === owner) playMusicForState(levelManager.getState())
    },
    onComplete() {
      quietLevelLoad = false
      if (storyPlayer !== owner) return
      storyPlayer = null
      hud.root.style.visibility = ''
      hud.setVisible(true)
      syncInputState()
    } })
  level3Transition = owner
  owner.prefetch()
}

function beginLevel3Transition() {
  if (!gameStarted) { levelManager.advance(); return }
  if (storyPlayer?.active) return
  if (!level3Transition) prepareLevel3Transition()
  const owner = level3Transition
  level3Transition = null
  storyPlayer = owner
  hud.setVisible(false)
  owner.start()
  syncInputState()
}

// Resolves at once when no story beat is playing; otherwise shortly after it ends.
function afterStoryBeat(settleMs = 1500) {
  if (!storyPlayer?.active) return Promise.resolve()
  return new Promise(resolve => {
    const check = () => { if (storyPlayer?.active) requestAnimationFrame(check); else setTimeout(resolve, settleMs) }
    requestAnimationFrame(check)
  })
}

// A level teardown (restart, quit) drops an unused prepared beat; the next
// Level 2 build prepares a fresh one.
function releaseIdleLevel3Transition() {
  if (!level3Transition || storyPlayer === level3Transition) return
  level3Transition.cancel()
  level3Transition = null
}

// DEV ?start=l3cut: once per run, as soon as Level 2 has finished loading.
function startDevLevel3Cutscene() {
  if (!import.meta.env?.DEV || devLevel3CutRun === storyRun || devStartOptions()?.cutscene !== 'l3') return
  devLevel3CutRun = storyRun
  const check = () => {
    if (levelManager.getState() !== 'MovingHeist') return
    if (levelManager.isTransitioning() || !level3Transition?.prepared) { requestAnimationFrame(check); return }
    beginLevel3Transition()
  }
  requestAnimationFrame(check)
}

// Quit to title: tear the run down and rebuild the title screen's backdrop,
// so the player lands back on the same live station shot they started from
// without a page refresh.
async function quitToTitle() {
  if (titleReturnPromise) return titleReturnPromise
  storyRun++
  awaitingIntro = false
  storyPlayer?.cancel()
  storyPlayer = null
  arrival = null
  gameStarted = false
  paused = false
  elapsed = 0
  resetCount = 0

  syncInputState()
  keyboardLock.release({ exitFullscreen: false })

  // Quitting mid-run from first person left the player figure hidden; the
  // title screen's cinematic shot needs it back.
  playerView.reset()
  hud.setVisible(false)
  hud.root.style.visibility = ''
  hud.setSuspicion(0)
  hud.setObjective('')
  hud.resetRunTimer()

  // Keep audio unlock in the dismissal gesture, before the asynchronous fade.
  unlockAudio({ menuMusic: false })
  const veil = document.createElement('div')
  Object.assign(veil.style, { position: 'fixed', inset: '0', zIndex: '10000',
    background: '#000', opacity: '0', transition: 'opacity 200ms linear', pointerEvents: 'auto' })
  document.body.appendChild(veil)
  titleReturnPromise = (async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    veil.style.opacity = '1'
    await new Promise(resolve => setTimeout(resolve, 200))
    // Let the opaque veil paint before synchronous scene disposal/construction.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    levelManager.unload()
    preparedBoarding?.dispose(); preparedBoarding = null
    disposeGameplayDrone()
    // unload stops the outgoing track; request title music afterwards.
    playMenuMusic()
    titleBackdrop = await buildTitleBackdrop()
    titleBackdrop.show()
    menu.show()
    if (import.meta.env?.DEV) console.log(`[load] title ready ${performance.now().toFixed(1)}ms since page start`)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    veil.style.transition = 'opacity 400ms linear'
    veil.style.opacity = '0'
    await new Promise(resolve => setTimeout(resolve, 400))
  })().finally(() => { veil.remove(); titleReturnPromise = null })
  return titleReturnPromise
}

// Defer by two animation frames: the first paints the loading screen,
// the second starts asset preparation and title scenery. This matches the
// pattern used by levelManager.enter() — see core/level-manager.js.
requestAnimationFrame(() => requestAnimationFrame(async () => {
  try {
    titleBackdrop = await startupTasks.track('backdrop', buildTitleBackdrop())

    // Keep the existing extra frame before revealing the title scene.
    requestAnimationFrame(() => {
      startupTasks.complete('presentation')
      loadingScreen.hide()
      titleBackdrop.show()
      menu.show()
      startupPrepared = true
      if (import.meta.env?.DEV) console.log(`[load] title ready ${performance.now().toFixed(1)}ms since page start`)
      if (benchTarget) {
        menu.hide()
        startGame()
      }
    })

    menu.onStart(startGame)
  } catch (error) {
    startupTasks.fail()
    console.error('[startup] required preparation failed', error)
  }
}))

let loopInstrumentation = renderOverlay
let devMinimapCpuMs = 0
let devParts = null, devPartAt = 0, devPlayerX = 0, devPlayerZ = 0, devSpeed = 0, devRunning = false
if (import.meta.env?.DEV) {
  devParts = new Float64Array(8)
  let detector = null, previous = 0, started = 0, interval = 0
  let updateStarted = 0, updateMs = 0, drawStarted = 0, drawMs = 0
  let lastLevel = null, levelStarted = 0
  let sceneCpuMs = 0
  const drawWorld = renderer.render
  renderer.render = function (world, view) {
    if (!view?.isPerspectiveCamera) return drawWorld.call(this, world, view)
    const at = performance.now()
    try { return drawWorld.call(this, world, view) }
    finally { sceneCpuMs += performance.now() - at }
  }
  // Count only when a spike line is emitted, never on ordinary frames.
  // Zero-intensity visible lights still participate in shader light counts.
  const renderState = new Float64Array(3)
  function countLight(node) {
    if (!node.isLight || !node.layers.test(camera.layers)) return
    renderState[0]++
    if (node.castShadow) renderState[1]++
  }
  function getRenderState() {
    renderState.fill(0)
    scene.traverseVisible(countLight)
    renderState[2] = renderer.info.programs?.length ?? 0
    return renderState
  }
  import('./dev/lag-detector.js').then(({ createLagDetector }) => { detector = createLagDetector({ getRenderState }) })
  // Same boundaries as the overlay; sampleFrame() clones, so do not poll it.
  loopInstrumentation = {
    beginFrame(timestamp) {
      renderOverlay?.beginFrame(timestamp)
      started = performance.now(); interval = previous ? timestamp - previous : 0; previous = timestamp
      devMinimapCpuMs = 0
      devParts.fill(0)
      sceneCpuMs = 0
    },
    beginUpdate() { renderOverlay?.beginUpdate(); updateStarted = performance.now() },
    endUpdate() { updateMs = performance.now() - updateStarted; renderOverlay?.endUpdate() },
    beginDraw() { renderOverlay?.beginDraw(); drawStarted = performance.now() },
    endDraw() { drawMs = performance.now() - drawStarted; renderOverlay?.endDraw() },
    endFrame() {
      const now = performance.now(), level = levelManager.getState()
      if (level !== lastLevel) { lastLevel = level; levelStarted = now }
      detector?.record(now, Math.max(interval, now - started), updateMs, drawMs, devMinimapCpuMs,
        getInputState(), level ?? 'none', (now - levelStarted) / 1000, sceneCpuMs,
        devParts, player.mesh.position.x, player.mesh.position.z, devSpeed, devRunning)
      renderOverlay?.endFrame()
    }
  }
}

const loop = createLoop({
  renderer,
  scene,
  camera,
  clock,
  instrumentation: loopInstrumentation,
  render(world, view) {
    // Avoid rendering partial scenes while startup assets and lighting settle.
    if (!startupPrepared) return
    if (storyPlayer?.active) {
      if (storyPlayer.showGame) {
        // Same anti-aliasing choice as normal play, so a story beat that
        // hands over to Level 3 has already used Level 3's exact pipeline.
        post.render(world, view, { antialias: levelManager.getState?.() === 'Timewreck' })
        // Warm the real icon pools and their draw BEFORE the smoke quad,
        // otherwise the inset would paint over the opaque cover.
        minimap.setVisible(levelManager.minimapVisible)
        let mapStarted = 0
        if (import.meta.env?.DEV) mapStarted = performance.now()
        minimap.render(renderer)
        if (import.meta.env?.DEV) devMinimapCpuMs = performance.now() - mapStarted
      }
      storyPlayer.render()
      storyPlayer.recordFrame(Math.max(frameIntervalMs, performance.now() - frameStartedAt), ranFullGameFrame, performance.now())
      if (firstLiveFramePending && storyPlayer.showGame) {
        firstLiveFramePending = false
        if (import.meta.env?.DEV) console.log(`[perf] first live frame ${(performance.now() - frameStartedAt).toFixed(2)}ms frame time`)
      }
      return
    }
    if (!gameStarted && titleBackdrop) {
      titleBackdrop.render()
      return
    }
    // A DEV benchmark can retain a pose after gameplay stops; it must not
    // overwrite the boarding shot immediately before rendering.
    if (!player.getCinematicView()) benchmark?.beforeRender()
    post.render(world, view, { antialias: levelManager.getState() === 'Timewreck' })
  },

  afterRender: (gl) => {
    const show = gameStarted && !storyPlayer?.active && !credits.isOpen && startupPrepared && levelManager.minimapVisible
    // During the smoke, HUD visibility hides the frame while its layout and
    // icon pools are prepared by the render branch above. Do not reset them.
    const warming = startupPrepared && gameStarted && storyPlayer?.active && storyPlayer.showGame && !credits.isOpen && levelManager.minimapVisible
    minimap.setVisible(show || warming)

    if (show) {
      let mapStarted = 0
      if (import.meta.env?.DEV) mapStarted = performance.now()
      minimap.render(gl)
      if (import.meta.env?.DEV) devMinimapCpuMs = performance.now() - mapStarted
    }
    benchmark?.afterRender()
    if (import.meta.env?.DEV) {
      if (firstPlayableFramePending && ranFullGameFrame && getInputState() === 'PLAYING') {
        firstPlayableFramePending = false
        console.log(`[perf] first playable frame ${Math.max(frameIntervalMs, performance.now() - frameStartedAt).toFixed(2)}ms`)
      }
    }
  }
})

const cinematicParentRotation = new THREE.Quaternion()
loop.add((delta) => {
  if (!startupPrepared) return
  frameIntervalMs = frameStartedAt ? performance.now() - frameStartedAt : 0
  frameStartedAt = performance.now()
  ranFullGameFrame = false
  if (storyPlayer?.active) {
    storyPlayer.update(delta)
    // liveGame is false while the Level 2 → 3 beat fades over a frozen Level 2.
    if (storyPlayer?.showGame && storyPlayer.liveGame !== false) ranFullGameFrame = updateGameFrame(delta, true)
    return
  }
  if (!gameStarted && titleBackdrop) {
    titleBackdrop.update(delta, window.innerWidth, window.innerHeight)
    return
  }
  ranFullGameFrame = updateGameFrame(delta)
})

const presentationKeyboard = Object.freeze({ forward: false, back: false, left: false, right: false,
  run: false, duck: false, jump: false, interact: false })
const arrivalFramePosition = new THREE.Vector3(), arrivalFrameRotation = new THREE.Quaternion()

function updateGameFrame(delta, presentation = false) {
  let measureFirst = false, stageAt = 0, setupMs = 0, timeMs = 0, levelMs = 0, playerMs = 0, cameraMs = 0, interactionMs = 0
  if (import.meta.env?.DEV) {
    measureFirst = presentation && firstHiddenSystemsPending
    if (measureFirst) stageAt = performance.now()
  }
  renderQuality.update(performance.now())
  benchmark?.update()
  // Mixer tick is independent of gameplay input state. Title / transition /
  // cinematic / credits all used to return before player.update(), which
  // left the detective frozen in bind pose after the first frame.
  player.updateVisual(delta)

  if (import.meta.env?.DEV) devPartAt = performance.now()
  hud.updateStats(delta)
  if (import.meta.env?.DEV) devParts[6] += performance.now() - devPartAt
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
    return
  }

  // Walkthrough tutorials completely freeze gameplay while the scene remains
  // rendered behind the overlay. Check this before syncInputState() so the
  // tutorial's disabled controls cannot accidentally be re-enabled.
  if (hud.isTutorialOpen() && !presentation) return false

  syncInputState()

  const inputState = getInputState()

  if (
    inputState === 'PAUSED' ||
    inputState === 'TRANSITION' ||
    inputState === 'CAUGHT'
  ) {
    return
  }

  const heistComplete = levelManager.getState() === 'Complete' || levelManager.getState() === 'Ending'
  if (!heistComplete && !presentation) elapsed += delta

  if (import.meta.env?.DEV) devPartAt = performance.now()
  hud.updateRunTimer({
    elapsed,
    delta,
    mode: timeSystem.getMode(),
    ghostActive: timeSystem.getGhost().isPlaying(),
    running: !heistComplete && !presentation
  })
  if (import.meta.env?.DEV) devParts[6] += performance.now() - devPartAt

  if (import.meta.env?.DEV) { if (measureFirst) { setupMs = performance.now() - stageAt; stageAt = performance.now() } }
  if (import.meta.env?.DEV) devPartAt = performance.now()
  timeSystem.update(delta)
  if (import.meta.env?.DEV) { devParts[1] = performance.now() - devPartAt; devPartAt = performance.now() }
  if (import.meta.env?.DEV) { if (measureFirst) { timeMs = performance.now() - stageAt; stageAt = performance.now() } }
  levelManager.update(delta)
  if (import.meta.env?.DEV) { devParts[0] = performance.now() - devPartAt; devPartAt = performance.now() }
  if (import.meta.env?.DEV) { if (measureFirst) { levelMs = performance.now() - stageAt; stageAt = performance.now() } }

  // A level update may have opened a tutorial this frame. Stop immediately
  // so the player cannot move one extra frame into a hazard under the popup.
  if (hud.isTutorialOpen() && !presentation) return false

  // New Game keeps the title framing and eases down behind the detective
  // before the third-person camera takes over.
  if (arrival && !updateForecourtArrival(delta) && !presentation) {
    syncInputState()
    return
  }

  // Cinematics and other non-playing states may still need level animation,
  // but movement and interaction must not resume during the same frame.
  if (getInputState() !== 'PLAYING' && !presentation) {
    const view = player.getCinematicView()
    if (view?.mode === 'fixed') {
      view.moveElapsed = Math.min(view.moveSeconds, view.moveElapsed + delta)
      const t = view.moveElapsed / view.moveSeconds
      const ease = t * t * (3 - 2 * t)
      camera.position.lerpVectors(view.initialPosition, view.position, ease)
      camera.quaternion.slerpQuaternions(view.initialRotation, view.targetRotation, ease)
      // The render camera is currently unparented. Preserve the world-space
      // shot if a scene rig is attached later, without allocating per frame.
      if (camera.parent) {
        camera.parent.updateWorldMatrix(true, false)
        camera.parent.worldToLocal(camera.position)
        camera.parent.getWorldQuaternion(cinematicParentRotation).invert()
        camera.quaternion.premultiply(cinematicParentRotation)
      }
    }
    syncInputState()
    return
  }

  if (import.meta.env?.DEV) { devPartAt = performance.now(); devPlayerX = player.mesh.position.x; devPlayerZ = player.mesh.position.z }
  player.update(delta, {
    keyboard: presentation ? presentationKeyboard : keyboard.state,
    crouchPressed: !presentation && keyboard.consumePress('duck'),
    runPressed: !presentation && keyboard.consumePress('run'),
    cameraYaw: playerView.getYaw(),
    bounds: levelManager.bounds,
    obstacles: levelManager.obstacles,
    groundHeightAt: levelManager.groundHeightAt,
    supports: levelManager.supports,
    voids: levelManager.voids
  })
  if (import.meta.env?.DEV) {
    devParts[2] = performance.now() - devPartAt
    devSpeed = delta > 0 ? Math.hypot(player.mesh.position.x - devPlayerX, player.mesh.position.z - devPlayerZ) / delta : 0
    devRunning = player.isRunning(); devPartAt = performance.now()
  }
  if (import.meta.env?.DEV) { if (measureFirst) { playerMs = performance.now() - stageAt; stageAt = performance.now() } }

  if (presentation && arrival) {
    arrivalFramePosition.copy(camera.position); arrivalFrameRotation.copy(camera.quaternion)
  }
  const arrivalYaw = playerView.getYaw()
  const lookAngle = presentation ? storyPlayer?.lookAroundAngle || 0 : 0
  if (lookAngle) playerView.setYaw(arrivalYaw + lookAngle)
  playerView.update(delta, player.mesh, scene, {
    crouching: player.isCrouching(),
    stabilizeCollision: levelManager.getState() === 'Timewreck'
  })
  if (lookAngle) playerView.setYaw(arrivalYaw)
  if (presentation && arrival) {
    if (!lookAngle) { camera.position.copy(arrivalFramePosition); camera.quaternion.copy(arrivalFrameRotation) }
  }
  if (import.meta.env?.DEV) { devParts[3] = performance.now() - devPartAt; devPartAt = performance.now() }
  if (import.meta.env?.DEV) { if (measureFirst) { cameraMs = performance.now() - stageAt; stageAt = performance.now() } }

  // Keyboard remains disabled; only candidate selection is exercised here.
  if (presentation) interaction.setEnabled(true)
  try { interaction.update(player.mesh, playerView.getYaw(), delta) }
  finally { if (presentation) interaction.setEnabled(false) }
  if (import.meta.env?.DEV) { devParts[4] = performance.now() - devPartAt; devPartAt = performance.now() }
  respawn.update()
  if (import.meta.env?.DEV) { devParts[5] = performance.now() - devPartAt; devPartAt = performance.now() }
  if (import.meta.env?.DEV) { if (measureFirst) { interactionMs = performance.now() - stageAt; stageAt = performance.now() } }

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
  if (import.meta.env?.DEV) devParts[6] += performance.now() - devPartAt
  if (import.meta.env?.DEV) {
    if (measureFirst) {
      firstHiddenSystemsPending = false
      console.log(`[perf] first hidden systems visual/hud=${setupMs.toFixed(2)} time=${timeMs.toFixed(2)} level=${levelMs.toFixed(2)} player=${playerMs.toFixed(2)} camera=${cameraMs.toFixed(2)} interaction/respawn=${interactionMs.toFixed(2)} hud-state=${(performance.now() - stageAt).toFixed(2)}`)
    }
  }
  return true
}

loop.start()

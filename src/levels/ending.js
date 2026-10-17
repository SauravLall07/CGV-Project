import * as THREE from 'three'
import { createEndingGorge } from '../environment/ending-gorge.js'
import { createEndingTrain, TRAIN_SPEED, STOP_CENTER_X } from '../environment/ending-train.js'
import { createCinematicSkip } from '../ui/cinematic-skip.js'

export const ENDING_FADE_IN = 1.0
export const APPROACH = 2.5
export const BRAKE = 4.5
export const SETTLE = 1.6
export const HOLD = 2.0
export const FADE_OUT = 1.2
export const TITLE_HOLD = 2.5
const TITLE_FADE = 0.6
const BRAKING_DISTANCE = TRAIN_SPEED * BRAKE / 2
const APPROACH_DISTANCE = TRAIN_SPEED * APPROACH
export const START_CENTER_X = STOP_CENTER_X - APPROACH_DISTANCE - BRAKING_DISTANCE
// At 60 degrees / 16:9, z=46 clips the rear carriage. z=64 fits the consist.
export const ENDING_CAMERA_POSITION = new THREE.Vector3(-70, 12, 64)
export const ENDING_CAMERA_TARGET = new THREE.Vector3(-25, -3, 0)
const PHASES = ['fadeIn', 'approach', 'braking', 'settle', 'hold', 'fadeOut', 'title', 'done']
const DURATIONS = [ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, HOLD, FADE_OUT, TITLE_FADE + TITLE_HOLD]

export function createEndingLevel({ scene, player, camera, renderCamera, hud, beginCinematic, advance, renderer }) {
  let phaseIndex = 0
  let phaseTime = 0
  let initialized = false
  let disposed = false
  let advanced = false
  let timeline = 0
  const startedAt = typeof performance === 'undefined' ? 0 : performance.now()
  const previousHudDisplay = hud.root?.style.display
  const previousFog = scene.fog
  const previousBackground = scene.background
  const previousEnvironment = scene.environment
  const previousEnvironmentIntensity = scene.environmentIntensity
  const gorge = createEndingGorge(scene)
  const train = createEndingTrain()
  scene.add(train.root)
  train.update(START_CENTER_X, 0, -1)
  const viewRotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET, new THREE.Vector3(0, 1, 0)))
  const view = { mode: 'fixed', position: ENDING_CAMERA_POSITION.clone(), target: ENDING_CAMERA_TARGET.clone(),
    initialPosition: ENDING_CAMERA_POSITION.clone(), initialRotation: viewRotation.clone(),
    targetRotation: viewRotation, moveSeconds: 1, moveElapsed: 0, allowPress: false }
  const overlay = document.createElement('div')
  overlay.id = 'ending-overlay'
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '60', background: '#000',
    opacity: '1', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' })
  const title = document.createElement('div')
  Object.assign(title.style, { color: '#eee8dc', fontFamily: 'Georgia, serif', textAlign: 'center',
    letterSpacing: '0.22em', fontSize: 'clamp(24px, 4vw, 64px)', opacity: '0' })
  title.textContent = 'CHRONO EXPRESS'
  const subtitle = document.createElement('div')
  subtitle.textContent = 'THE END'
  Object.assign(subtitle.style, { fontSize: '14px', letterSpacing: '0.4em', marginTop: '24px' })
  title.appendChild(subtitle)
  overlay.appendChild(title)
  document.body.appendChild(overlay)
  player.mesh.visible = false
  // HUD is hidden, so mount the same native skip control in its own UI layer.
  const skipRoot = document.createElement('div')
  Object.assign(skipRoot.style, { position: 'fixed', inset: '0', zIndex: '65', pointerEvents: 'none' })
  document.body.appendChild(skipRoot)
  const skipControl = createCinematicSkip(skipRoot)
  const warmCamera = new THREE.PerspectiveCamera(renderCamera?.fov ?? 60, renderCamera?.aspect ?? 16 / 9, 0.1, 1800)
  warmCamera.position.copy(ENDING_CAMERA_POSITION)
  warmCamera.quaternion.copy(viewRotation)
  const savedViewport = new THREE.Vector4()
  const savedScissor = new THREE.Vector4()
  let budgetLogged = false

  function warmScene() {
    if (!renderer) return
    const target = new THREE.WebGLRenderTarget(128, 128)
    const previousTarget = renderer.getRenderTarget()
    renderer.getViewport(savedViewport)
    renderer.getScissor(savedScissor)
    const previousScissorTest = renderer.getScissorTest()
    const savedCulling = []
    gorge.root.traverse(node => { if (node.isMesh) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    train.root.traverse(node => { if (node.isMesh) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    try {
      scene.updateMatrixWorld(true)
      renderer.compile(scene, warmCamera)
      renderer.setRenderTarget(target)
      renderer.setScissorTest(false)
      renderer.render(scene, warmCamera)
    } finally {
      for (const [node, culling] of savedCulling) node.frustumCulled = culling
      renderer.setRenderTarget(previousTarget)
      renderer.setViewport(savedViewport)
      renderer.setScissor(savedScissor)
      renderer.setScissorTest(previousScissorTest)
      target.dispose()
    }
  }

  function enterPhase(index) {
    phaseIndex = index
    phaseTime = 0
    if (import.meta.env?.DEV) console.info(`[ending +${timeline.toFixed(3)}s @${(performance.now() - startedAt).toFixed(0)}ms] ${PHASES[index]}`)
    if (PHASES[index] === 'fadeOut') { hud.hideCinematicSkip?.(); skipControl.hide() }
    if (PHASES[index] === 'done' && !advanced) {
      advanced = true
      hud.hideCinematicSkip?.()
      skipControl.hide()
      advance()
    }
  }

  function skip() {
    if (disposed || advanced || phaseIndex >= PHASES.indexOf('fadeOut')) return
    enterPhase(PHASES.indexOf('fadeOut'))
  }

  function present() {
    const phase = PHASES[phaseIndex]
    overlay.style.opacity = String(phase === 'fadeIn' ? 1 - phaseTime / ENDING_FADE_IN
      : phase === 'fadeOut' ? phaseTime / FADE_OUT : phaseIndex >= 6 ? 1 : 0)
    title.style.opacity = phaseIndex >= 6 ? String(Math.min(1, phaseTime / TITLE_FADE)) : '0'
    let distance = 0
    let brakingProgress = -1
    let settleTime = -1
    if (phase === 'approach') distance = TRAIN_SPEED * phaseTime
    else if (phase === 'braking') {
      distance = APPROACH_DISTANCE + TRAIN_SPEED * phaseTime - TRAIN_SPEED * phaseTime * phaseTime / (2 * BRAKE)
      brakingProgress = phaseTime / BRAKE
    } else if (phaseIndex >= 3) {
      distance = APPROACH_DISTANCE + BRAKING_DISTANCE
      settleTime = phase === 'settle' ? phaseTime : SETTLE + (phase === 'hold' ? phaseTime : HOLD)
    }
    train.update(START_CENTER_X + distance, distance, brakingProgress, settleTime)
  }

  return {
    objective: '', checkpoint: { position: new THREE.Vector3(-7.6, 0, 0), yaw: 0 },
    isCinematic: true,
    update(delta) {
      if (disposed || advanced) return
      if (!initialized) {
        initialized = true
        camera.setMode?.('third', { announce: false })
        player.mesh.visible = false
        player.setCinematicView(view)
        hud.setVisible(false)
        beginCinematic?.()
        hud.showCinematicSkip?.(skip)
        skipControl.show(skip)
        warmScene()
        if (import.meta.env?.DEV) console.info('[ending] fadeIn')
      }
      player.mesh.visible = false
      gorge.update(delta)
      let remaining = Math.max(0, delta)
      while (remaining > 0 && !advanced) {
        const step = Math.min(remaining, DURATIONS[phaseIndex] - phaseTime)
        phaseTime += step
        timeline += step
        remaining -= step
        if (phaseTime >= DURATIONS[phaseIndex] - 1e-9) enterPhase(phaseIndex + 1)
      }
      present()
      if (import.meta.env?.DEV && !budgetLogged && timeline >= ENDING_FADE_IN + APPROACH + BRAKE + 1) {
        budgetLogged = true
        console.info('[ending render budget, previous rendered frame]', {
          calls: renderer?.info.render.calls, triangles: renderer?.info.render.triangles,
          timberInstances: gorge.timberCount })
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      hud.hideCinematicSkip?.()
      overlay.remove()
      skipControl.dispose()
      skipRoot.remove()
      player.setCinematicView(null)
      player.cancelScriptedWalk?.()
      player.mesh.visible = true
      gorge.dispose()
      train.dispose()
      scene.fog = previousFog
      scene.background = previousBackground
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      if (hud.root && previousHudDisplay !== undefined) hud.root.style.display = previousHudDisplay
      // Complete retains this level until quit; quit/startGame own HUD/music next.
    }
  }
}

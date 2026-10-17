import * as THREE from 'three'
import { createEndingGorge } from '../environment/ending-gorge.js'
import { createEndingTrain, TRAIN_SPEED, STOP_CENTER_Z, STOP_NOSE_Z } from '../environment/ending-train.js'
import { TRAIN_START_NOSE_Z } from '../environment/ending-landmarks.js'
import { createCinematicSkip } from '../ui/cinematic-skip.js'

export const ENDING_FADE_IN = 1.0
export const BRAKE = 4.5
export const APPROACH = (TRAIN_START_NOSE_Z - STOP_NOSE_Z - TRAIN_SPEED * BRAKE / 2) / TRAIN_SPEED
export const SETTLE = 1.6
export const HOLD = 2.0
export const FADE_OUT = 1.2
export const TITLE_HOLD = 2.5
const TITLE_FADE = 0.6
const BRAKING_DISTANCE = TRAIN_SPEED * BRAKE / 2
const APPROACH_DISTANCE = TRAIN_SPEED * APPROACH
export const START_CENTER_Z = STOP_CENTER_Z + APPROACH_DISTANCE + BRAKING_DISTANCE
export const ENDING_CAMERA_POSITION = new THREE.Vector3(47.1, 19.43, -3.01)
export const ENDING_CAMERA_TARGET = new THREE.Vector3(1.09, -1.13, 9.74)
export const ENDING_CAMERA_FOV = 45
const PHASES = ['fadeIn', 'approach', 'braking', 'settle', 'hold', 'fadeOut', 'title', 'done']
const DURATIONS = [ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, HOLD, FADE_OUT, TITLE_FADE + TITLE_HOLD]

export function createEndingLevel({ scene, player, camera, renderCamera, hud, beginCinematic, advance, renderer, post = null }) {
  // Timewreck and direct starts use the postprocessor's default grade; mirror Level 2's ownership.
  post?.setGrade({ warmth: 0 })
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
  const previousFov = renderCamera?.fov
  const gorge = createEndingGorge(scene, ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET, ENDING_CAMERA_FOV)
  const train = createEndingTrain()
  scene.add(train.root)
  train.update(START_CENTER_Z, 0, -1)
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
  const warmCamera = new THREE.PerspectiveCamera(ENDING_CAMERA_FOV, renderCamera?.aspect ?? 16 / 9, 0.1, 1800)
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
    gorge.root.traverse(node => { if (node.isMesh || node.isPoints) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    train.root.traverse(node => { if (node.isMesh || node.isPoints) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
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

  function present(delta) {
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
    const speed = phase === 'approach' ? TRAIN_SPEED : phase === 'braking' ? TRAIN_SPEED * (1 - phaseTime / BRAKE) : 0
    train.update(START_CENTER_Z - distance, distance, brakingProgress, settleTime, delta, speed)
  }

  return {
    objective: '', checkpoint: { position: new THREE.Vector3(0, 0, STOP_CENTER_Z), yaw: 0 },
    isCinematic: true,
    update(delta) {
      if (disposed || advanced) return
      if (!initialized) {
        initialized = true
        camera.setMode?.('third', { announce: false })
        if (renderCamera) { renderCamera.fov = ENDING_CAMERA_FOV; renderCamera.updateProjectionMatrix() }
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
      // Settings subscribers may run while paused; keep this shot's lens static.
      if (renderCamera && renderCamera.fov !== ENDING_CAMERA_FOV) {
        renderCamera.fov = ENDING_CAMERA_FOV; renderCamera.updateProjectionMatrix()
      }
      gorge.update(delta)
      let remaining = Math.max(0, delta)
      while (remaining > 0 && !advanced) {
        const step = Math.min(remaining, DURATIONS[phaseIndex] - phaseTime)
        phaseTime += step
        timeline += step
        remaining -= step
        if (phaseTime >= DURATIONS[phaseIndex] - 1e-9) enterPhase(phaseIndex + 1)
      }
      present(Math.max(0, delta))
      if (import.meta.env?.DEV && !budgetLogged && timeline >= ENDING_FADE_IN + APPROACH + BRAKE + 1) {
        budgetLogged = true
        console.info('[ending render budget, previous rendered frame]', {
          calls: renderer?.info.render.calls, triangles: renderer?.info.render.triangles,
          timberInstances: gorge.timberCount, terrainClearance: gorge.clearance })
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      post?.resetGrade()
      if (renderCamera && previousFov !== undefined) {
        renderCamera.fov = previousFov; renderCamera.updateProjectionMatrix()
      }
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

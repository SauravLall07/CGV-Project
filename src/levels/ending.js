import * as THREE from 'three'
import { createEndingGorge } from '../environment/ending-gorge.js'
import { createEndingTrain, TRAIN_SPEED, STOP_CENTER_Z, STOP_NOSE_Z } from '../environment/ending-train.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../shaders/ending-plate.js'
import { createCinematicSkip } from '../ui/cinematic-skip.js'
import { createEndingAudio } from '../systems/ending-audio.js'
import { brakeIntensity } from '../environment/ending-sparks.js'

export const ENDING_FADE_IN = 1.0
export const TRAIN_START_NOSE_Z = 125
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
export const ENDING_CAMERA_POSITION = PLATE_CAMERA_POSITION
export const ENDING_CAMERA_TARGET = PLATE_CAMERA_TARGET
export const ENDING_CAMERA_FOV = PLATE_CAMERA_FOV
export const WORLD_ALIGN_DEFAULTS = Object.freeze({ x: -0.75, y: -3.25, z: -0.75, yaw: -20.25, pitch: -2.75, roll: 0, scale: 1 })
const PHASES = ['fadeIn', 'approach', 'braking', 'settle', 'hold', 'fadeOut', 'title', 'done']
const DURATIONS = [ENDING_FADE_IN, APPROACH, BRAKE, SETTLE, HOLD, FADE_OUT, TITLE_FADE + TITLE_HOLD]

export function createEndingLevel({ scene, player, camera, renderCamera, hud, beginCinematic, advance, renderer, post = null,
  audioFactory = createEndingAudio }) {
  // Timewreck and direct starts use the postprocessor's default grade; mirror Level 2's ownership.
  post?.setGrade({ warmth: 0 })
  const previousPostEnabled = post?.isEnabled?.()
  if (previousPostEnabled !== undefined) post.setEnabled(false)
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
  const previousAspect = renderCamera?.aspect
  const gorge = createEndingGorge(scene, renderer)
  const train = createEndingTrain()
  const audio = audioFactory()
  const worldAlign = new THREE.Group()
  worldAlign.name = 'WORLD_ALIGN'
  worldAlign.position.set(WORLD_ALIGN_DEFAULTS.x, WORLD_ALIGN_DEFAULTS.y, WORLD_ALIGN_DEFAULTS.z)
  worldAlign.rotation.set(THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.pitch),
    THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.yaw), THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.roll))
  worldAlign.scale.setScalar(WORLD_ALIGN_DEFAULTS.scale)
  worldAlign.add(train.root); scene.add(worldAlign)
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
  const vignette = document.createElement('div')
  vignette.id = 'ending-time-vignette'
  Object.assign(vignette.style, { position: 'fixed', inset: '0', zIndex: '59', pointerEvents: 'none', opacity: '0',
    background: 'radial-gradient(ellipse at center, transparent 42%, rgba(61,125,255,0.9) 100%)' })
  document.body.appendChild(vignette)
  const timeState = { frozen: false, released: false, releaseCount: 0, rift: 1, freezeTime: 0, releaseTime: 0 }
  let releaseVignette = 0
  function freeze() {
    if (timeState.frozen || timeState.released) return
    timeState.frozen = true
    train.setTimeState(1, true)
    if (import.meta.env?.DEV) console.info('[ending] freeze')
  }
  function release() {
    if (disposed || timeState.released) return false
    releaseVignette = Number(vignette.style.opacity)
    timeState.released = true; timeState.frozen = false; timeState.releaseCount++
    train.setTimeState(1, false)
    gorge.plate.mesh.material.uniforms.uFlow.value = 1
    if (import.meta.env?.DEV) console.info('[ending] release')
    return true
  }
  function updateTimeEffects(delta) {
    const flow = gorge.plate.mesh.material.uniforms.uFlow
    if (timeState.released) {
      timeState.releaseTime += delta
      timeState.rift = Math.max(0, 1 - timeState.releaseTime / 0.6)
      flow.value = 1
      vignette.style.opacity = String(releaseVignette * timeState.rift)
    } else if (timeState.frozen) {
      timeState.freezeTime += delta
      flow.value = Math.max(0, 1 - timeState.freezeTime / 0.4)
      vignette.style.opacity = String(0.35 * Math.min(1, timeState.freezeTime / 0.5))
    }
    train.setTimeState(timeState.rift, timeState.frozen)
    const finalFlow = flow.value
    // Integrate the short linear flow ramp without moving the river while fully frozen.
    if (timeState.frozen && delta > 0) {
      const a = Math.min(0.4, Math.max(0, timeState.freezeTime - delta)), b = Math.min(0.4, timeState.freezeTime)
      flow.value = (b - a - (b * b - a * a) / 0.8) / delta
    }
    gorge.update(delta)
    flow.value = finalFlow
  }
  player.mesh.visible = false
  // HUD is hidden, so mount the same native skip control in its own UI layer.
  const skipRoot = document.createElement('div')
  Object.assign(skipRoot.style, { position: 'fixed', inset: '0', zIndex: '65', pointerEvents: 'none' })
  document.body.appendChild(skipRoot)
  const skipControl = createCinematicSkip(skipRoot)
  const warmCamera = new THREE.PerspectiveCamera(ENDING_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  warmCamera.position.copy(ENDING_CAMERA_POSITION)
  warmCamera.quaternion.copy(viewRotation)
  let shotFov = ENDING_CAMERA_FOV
  function setShotFov(value) {
    if (disposed) return shotFov
    shotFov = gorge.plate.setFov(value)
    if (renderCamera) {
      renderCamera.fov = shotFov; renderCamera.aspect = PLATE_CAMERA_ASPECT; renderCamera.updateProjectionMatrix()
    }
    warmCamera.fov = shotFov; warmCamera.updateProjectionMatrix()
    return shotFov
  }
  const savedViewport = new THREE.Vector4()
  const savedScissor = new THREE.Vector4()
  let budgetLogged = false
  let alignMode = false, removeAlignment = null
  if (import.meta.env?.DEV) {
    const parameters = new URLSearchParams(globalThis.location?.search ?? '')
    if (parameters.get('start') === 'ending' && parameters.has('align')) {
      alignMode = true
      phaseIndex = PHASES.indexOf('hold'); phaseTime = 0
      timeline = ENDING_FADE_IN + APPROACH + BRAKE + SETTLE + 1
      const values = { ...WORLD_ALIGN_DEFAULTS, fov: shotFov }
      let atApproachStart = false
      const materials = new Map()
      let translucent = false
      const apply = () => {
        worldAlign.position.set(values.x, values.y, values.z)
        worldAlign.rotation.set(THREE.MathUtils.degToRad(values.pitch), THREE.MathUtils.degToRad(values.yaw), THREE.MathUtils.degToRad(values.roll))
        worldAlign.scale.setScalar(values.scale)
        values.fov = setShotFov(values.fov)
      }
      const toggle = () => {
        if (!materials.size) worldAlign.traverse(node => {
          if (!node.material) return
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (!materials.has(material)) materials.set(material, { opacity: material.opacity,
              transparent: material.transparent, depthWrite: material.depthWrite, steam: material.uniforms?.uOpacity?.value })
          }
        })
        translucent = !translucent
        for (const [material, original] of materials) {
          material.opacity = original.opacity * (translucent ? 0.5 : 1)
          material.transparent = translucent || original.transparent
          material.depthWrite = translucent ? false : original.depthWrite
          if (original.steam !== undefined) material.uniforms.uOpacity.value = original.steam * (translucent ? 0.5 : 1)
          material.needsUpdate = true
        }
      }
      const key = event => {
        const tag = event.target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable || event.ctrlKey || event.metaKey) return
        const fine = event.altKey ? 0.1 : 1
        const movement = { KeyJ: ['x', 'yaw', -1], KeyL: ['x', 'yaw', 1],
          KeyI: ['z', 'pitch', -1], KeyK: ['z', 'pitch', 1], KeyU: ['y', 'roll', -1], KeyO: ['y', 'roll', 1] }[event.code]
        if (movement) values[movement[event.shiftKey ? 1 : 0]] += movement[2] * 0.25 * fine
        else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
          values.scale = Math.max(0.005, values.scale + (event.code === 'BracketRight' ? 1 : -1) * 0.005 * fine)
        } else if (event.code === 'KeyN' || event.code === 'KeyM') {
          values.fov += (event.code === 'KeyM' ? 1 : -1) * 0.5 * fine
        } else if (event.code === 'KeyG') {
          if (!event.repeat) {
            atApproachStart = !atApproachStart
            phaseIndex = PHASES.indexOf(atApproachStart ? 'approach' : 'hold'); phaseTime = 0
            present(0)
          }
        } else if (event.code === 'KeyP') console.info(`WORLD_ALIGN = ${JSON.stringify(values)}`)
        else if (event.code === 'KeyT') { if (!event.repeat) toggle() }
        else return
        event.preventDefault(); event.stopPropagation(); apply()
      }
      window.addEventListener('keydown', key, true)
      removeAlignment = () => { window.removeEventListener('keydown', key, true); materials.clear() }
    }
  }

  function warmScene() {
    if (!renderer) return
    const target = new THREE.WebGLRenderTarget(128, 128)
    const previousTarget = renderer.getRenderTarget()
    renderer.getViewport(savedViewport)
    renderer.getScissor(savedScissor)
    const previousScissorTest = renderer.getScissorTest()
    const savedCulling = []
    const savedRifts = new Map()
    const sparkIntensity = train.sparks.material.uniforms.uIntensity
    const previousSparkIntensity = sparkIntensity.value
    gorge.root.traverse(node => { if (node.isMesh || node.isPoints) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    train.root.traverse(node => { if (node.isMesh || node.isPoints || node.isSprite) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    train.root.traverse(node => {
      if (!node.material) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const uniform = material.userData.endingTimeDamage?.uRift ?? material.uniforms?.uRift
        if (uniform && !savedRifts.has(uniform)) savedRifts.set(uniform, uniform.value)
      }
    })
    if (gorge.plate.ready) renderer.initTexture?.(gorge.plate.texture)
    try {
      sparkIntensity.value = 1
      scene.updateMatrixWorld(true)
      renderer.compile(scene, warmCamera)
      renderer.setRenderTarget(target)
      renderer.setScissorTest(false)
      renderer.render(scene, warmCamera)
      // Frozen and released use the same compiled programs; exercise both uniform states under black.
      for (const uniform of savedRifts.keys()) uniform.value = 0
      renderer.render(scene, warmCamera)
    } finally {
      sparkIntensity.value = previousSparkIntensity
      for (const [uniform, value] of savedRifts) uniform.value = value
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
    if (PHASES[index] === 'hold') freeze()
    if (PHASES[index] === 'fadeOut') { release(); hud.hideCinematicSkip?.(); skipControl.hide() }
    if (PHASES[index] === 'done' && !advanced) {
      advanced = true
      hud.hideCinematicSkip?.()
      skipControl.hide()
      advance()
    }
  }

  function skip() {
    if (disposed || advanced || phaseIndex >= PHASES.indexOf('fadeOut')) return
    audio.stop()
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
    audio.update(brakingProgress, brakeIntensity(brakingProgress), delta)
  }

  return {
    objective: '', checkpoint: { position: new THREE.Vector3(0, 0, STOP_CENTER_Z), yaw: 0 },
    isCinematic: true,
    setShotFov, release, timeState,
    update(delta) {
      if (disposed || advanced) return
      if (!initialized) {
        initialized = true
        camera.setMode?.('third', { announce: false })
        if (renderCamera) {
          setShotFov(shotFov)
          renderCamera.position.copy(ENDING_CAMERA_POSITION); renderCamera.quaternion.copy(viewRotation)
          renderCamera.updateProjectionMatrix(); renderCamera.updateMatrixWorld(true)
        }
        player.mesh.visible = false
        player.setCinematicView(view)
        hud.setVisible(false)
        beginCinematic?.()
        if (!alignMode) { hud.showCinematicSkip?.(skip); skipControl.show(skip) }
        warmScene()
        if (import.meta.env?.DEV) console.info('[ending] fadeIn')
      }
      player.mesh.visible = false
      // Settings subscribers may run while paused; keep this shot's lens static.
      if (renderCamera && (renderCamera.fov !== shotFov || renderCamera.aspect !== PLATE_CAMERA_ASPECT)) {
        setShotFov(shotFov)
      }
      let remaining = gorge.plate.ready && !alignMode ? Math.max(0, delta) : 0
      while (remaining > 0 && !advanced) {
        const step = Math.min(remaining, DURATIONS[phaseIndex] - phaseTime)
        phaseTime += step
        timeline += step
        remaining -= step
        updateTimeEffects(step)
        present(step)
        if (phaseTime >= DURATIONS[phaseIndex] - 1e-9) enterPhase(phaseIndex + 1)
      }
      if (alignMode) { updateTimeEffects(Math.max(0, delta)); present(Math.max(0, delta)) }
      else present(0)
      if (import.meta.env?.DEV && !budgetLogged && timeline >= ENDING_FADE_IN + APPROACH + BRAKE + 1) {
        budgetLogged = true
        console.info('[ending render budget, previous rendered frame]', {
          calls: renderer?.info.render.calls, triangles: renderer?.info.render.triangles,
          trainOnly: true })
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      audio.dispose()
      removeAlignment?.()
      post?.resetGrade()
      if (previousPostEnabled !== undefined) post.setEnabled(previousPostEnabled)
      if (renderCamera && previousFov !== undefined) {
        renderCamera.fov = previousFov; renderCamera.aspect = previousAspect; renderCamera.updateProjectionMatrix()
      }
      hud.hideCinematicSkip?.()
      overlay.remove()
      vignette.remove()
      skipControl.dispose()
      skipRoot.remove()
      player.setCinematicView(null)
      player.cancelScriptedWalk?.()
      player.mesh.visible = true
      gorge.dispose()
      train.dispose()
      worldAlign.removeFromParent()
      scene.fog = previousFog
      scene.background = previousBackground
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      if (hud.root && previousHudDisplay !== undefined) hud.root.style.display = previousHudDisplay
      // Complete retains this level until quit; quit/startGame own HUD/music next.
    }
  }
}

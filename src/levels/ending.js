import * as THREE from 'three'
import { createEndingGorge } from '../environment/ending-gorge.js'
import { createEndingTrain, TRAIN_SPEED, STOP_CENTER_Z, STOP_NOSE_Z } from '../environment/ending-train.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../shaders/ending-plate.js'
import { createCinematicSkip } from '../ui/cinematic-skip.js'
import { createEndingAudio } from '../systems/ending-audio.js'
import { brakeIntensity } from '../environment/ending-sparks.js'
import { createEndingCore, CORE_FLIGHT_SECONDS, FLASH_SECONDS, SCREEN_FLASH_PEAK } from '../environment/ending-core.js'
import { DOOR_MOTION_SECONDS } from '../environment/ending-door.js'

export const DOOR_CAMERA_DISTANCE = 6.5
export const GORGE_CAMERA_DISTANCE = 15
export const GORGE_CAMERA_PITCH = 55
export const NEW_PLATE_ASPECT = 1672 / 941

export function createEndingShots(carriage, door) {
  carriage.updateWorldMatrix(true, false)
  const centre = door.threshold.clone().add(new THREE.Vector3(0, 1.05, 0)).applyMatrix4(carriage.matrixWorld)
  const outward = new THREE.Vector3(-1, 0, 0).transformDirection(carriage.matrixWorld)
  const horizontal = outward.clone(); horizontal.y = 0; horizontal.normalize()
  const a = new THREE.PerspectiveCamera(PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  a.position.copy(PLATE_CAMERA_POSITION); a.lookAt(PLATE_CAMERA_TARGET)
  const b = new THREE.PerspectiveCamera(40, NEW_PLATE_ASPECT, 0.1, 1800)
  b.position.copy(centre).addScaledVector(outward, DOOR_CAMERA_DISTANCE); b.position.y -= 0.3
  b.lookAt(centre)
  // Off-axis lens places the doorway slightly left without tilting the horizon.
  b.setViewOffset(1672, 941, 90, 0, 1672, 941)
  const c = new THREE.PerspectiveCamera(45, NEW_PLATE_ASPECT, 0.1, 1800)
  const rail = new THREE.Vector3(0, 0, door.threshold.z).applyMatrix4(carriage.matrixWorld)
  c.position.copy(rail).addScaledVector(horizontal, GORGE_CAMERA_DISTANCE); c.position.y += 2
  const down = THREE.MathUtils.degToRad(GORGE_CAMERA_PITCH)
  c.lookAt(c.position.clone().addScaledVector(horizontal, Math.cos(down)).add(new THREE.Vector3(0, -Math.sin(down), 0)))
  for (const shot of [a,b,c]) shot.updateMatrixWorld(true)
  return [a,b,c]
}

export const ENDING_FADE_IN = 1.0
export const TRAIN_START_NOSE_Z = 140
export const BRAKE = 4.5
export const APPROACH = (TRAIN_START_NOSE_Z - STOP_NOSE_Z - TRAIN_SPEED * BRAKE / 2) / TRAIN_SPEED
export const SETTLE = 1.6
export const BEAT = 0.6
export const DOOR_HOLD = 0.6
export const WHIP_SECONDS = 0.3
export const RELEASE_TO_WHIP = 0.3
export const SNAP_HOLD = 1.2
export const WIDE_HOLD = 2.5
export const DOOR_OPEN = 0.8
export const STEP_OUT = 1.0
export const HOLD_CORE = 0.8
export const THROW = 2.2 // Actual loaded Throw clip duration replaces this fallback.
export const THROW_RELEASE = 24 / 30
export const FALL = CORE_FLIGHT_SECONDS - RELEASE_TO_WHIP - WHIP_SECONDS
export const EMPTY_HOLD = 2.5
export const FADE_OUT = 1.5
export const TITLE_HOLD = 2.5
const TITLE_FADE = 0.6
const BRAKING_DISTANCE = TRAIN_SPEED * BRAKE / 2
const APPROACH_DISTANCE = TRAIN_SPEED * APPROACH
export const START_CENTER_Z = STOP_CENTER_Z + APPROACH_DISTANCE + BRAKING_DISTANCE
export const ENDING_CAMERA_POSITION = PLATE_CAMERA_POSITION
export const ENDING_CAMERA_TARGET = PLATE_CAMERA_TARGET
export const ENDING_CAMERA_FOV = PLATE_CAMERA_FOV
export const WORLD_ALIGN_DEFAULTS = Object.freeze({ x: -0.75, y: -3.25, z: -0.75, yaw: -20.25, pitch: -2.75, roll: 0, scale: 1 })
export const PHASES = Object.freeze(['fadeIn','approach','braking','settle','beat','cutB','doorHold','doorOpen','stepOut','holdCore','throw','whipDown','fallC','flash','snapHold','whipUp','emptyHold','cutA','wideHold','fadeOut','title','done'])
export const DURATIONS = Object.freeze([ENDING_FADE_IN,APPROACH,BRAKE,SETTLE,BEAT,0,DOOR_HOLD,DOOR_OPEN,STEP_OUT,HOLD_CORE,THROW_RELEASE+RELEASE_TO_WHIP,WHIP_SECONDS,FALL,FLASH_SECONDS,SNAP_HOLD,WHIP_SECONDS,EMPTY_HOLD,0,WIDE_HOLD,FADE_OUT,TITLE_FADE+TITLE_HOLD])

export function createEndingLevel({ scene, player, camera, renderCamera, hud, beginCinematic, advance, renderer, post = null,
  audioFactory = createEndingAudio }) {
  // Timewreck and direct starts use the postprocessor's default grade; mirror Level 2's ownership.
  post?.setGrade({ warmth: 0 })
  const previousPostEnabled = post?.isEnabled?.()
  if (previousPostEnabled !== undefined) post.setEnabled(false)
  let phaseIndex = 0
  let phaseTime = 0
  let initialized = false
  let warmed = false
  let disposed = false
  let advanced = false
  let timeline = 0
  const durations=[...DURATIONS]
  const startedAt = typeof performance === 'undefined' ? 0 : performance.now()
  const previousHudDisplay = hud.root?.style.display
  const previousFog = scene.fog
  const previousBackground = scene.background
  const previousEnvironment = scene.environment
  const previousEnvironmentIntensity = scene.environmentIntensity
  const previousFov = renderCamera?.fov
  const previousAspect = renderCamera?.aspect
  const previousCameraView = renderCamera?.view ? { ...renderCamera.view } : null
  const previousPlayer = {visible:player.mesh.visible,position:player.mesh.position.clone(),
    quaternion:player.mesh.quaternion.clone(),scale:player.mesh.scale.clone(),view:player.getCinematicView?.() ?? null}
  let visual=null,visualReady=true,actionStates=[],throwHandle=null,throwDuration=2.2
  if (player.loadVisual && player.mesh.getObjectByName('detective')) {
    visualReady=false
    player.loadVisual().then(value=>{
      if(disposed)return
      visual=value
      actionStates=Object.values(visual?.actions ?? {}).map(action=>({action,time:action.time,
        weight:action.getEffectiveWeight(),speed:action.getEffectiveTimeScale(),paused:action.paused,
        enabled:action.enabled,running:action.isRunning()}))
      throwDuration=visual?.actions.throw?.getClip().duration ?? 2.2
      visualReady=true
    })
  }
  const gorge = createEndingGorge(scene, renderer)
  const train = createEndingTrain()
  const audio = audioFactory()
  const core = createEndingCore(scene)
  const handFallback=new THREE.Group();handFallback.name='ending-core-hand-anchor'
  handFallback.position.set(0.3,1.2,0.2)
  const hand=player.mesh.getObjectByName('mixamorigRightHand') ?? handFallback
  if(hand===handFallback) player.mesh.add(handFallback)
  const inside=new THREE.Vector3(),threshold=new THREE.Vector3(),outward=new THREE.Vector3(),releasePosition=new THREE.Vector3()
  const walkPath=[inside,threshold]
  let outwardYaw=0,launched=false
  const worldAlign = new THREE.Group()
  worldAlign.name = 'WORLD_ALIGN'
  worldAlign.position.set(WORLD_ALIGN_DEFAULTS.x, WORLD_ALIGN_DEFAULTS.y, WORLD_ALIGN_DEFAULTS.z)
  worldAlign.rotation.set(THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.pitch),
    THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.yaw), THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.roll))
  worldAlign.scale.setScalar(WORLD_ALIGN_DEFAULTS.scale)
  worldAlign.add(train.root); scene.add(worldAlign)
  train.update(START_CENTER_Z, 0, -1)
  train.update(STOP_CENTER_Z, 0, -1, SETTLE)
  const shots = createEndingShots(train.carriages[0], train.door)
  core.setImpactCamera(shots[2])
  train.update(START_CENTER_Z, 0, -1)
  let activeShot = 0
  const viewRotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(ENDING_CAMERA_POSITION, ENDING_CAMERA_TARGET, new THREE.Vector3(0, 1, 0)))
  const view = { mode: 'fixed', position: ENDING_CAMERA_POSITION.clone(), target: ENDING_CAMERA_TARGET.clone(),
    initialPosition: ENDING_CAMERA_POSITION.clone(), initialRotation: viewRotation.clone(),
    targetRotation: viewRotation, moveSeconds: 1, moveElapsed: 0, allowPress: false }
  function selectShot(index) {
    activeShot = index
    const shot = shots[index]
    view.position.copy(shot.position); view.initialPosition.copy(shot.position)
    view.initialRotation.copy(shot.quaternion); view.targetRotation.copy(shot.quaternion)
    view.moveElapsed = view.moveSeconds
    shotFov = shot.fov
    gorge.plate.setShot(shot, index)
    if (renderCamera) {
      renderCamera.position.copy(shot.position); renderCamera.quaternion.copy(shot.quaternion)
      renderCamera.fov = shot.fov; renderCamera.aspect = shot.aspect
      renderCamera.view = shot.view ? { ...shot.view } : null
      renderCamera.updateProjectionMatrix(); renderCamera.updateMatrixWorld(true)
    }
  }
  function updateWhip(phase, time) {
    const down = phase === 'whipDown', t = Math.min(1, time / WHIP_SECONDS)
    const from = down ? 1 : 2, to = down ? 2 : 1
    if (activeShot !== (t < 0.5 ? from : to)) selectShot(t < 0.5 ? from : to)
    gorge.plate.setWhip(from, to, t*t*(3-2*t), Math.sin(Math.PI*t)*1.8, down ? -1 : 1)
    const visible = time < 0.06 || time > 0.24
    worldAlign.visible = visible
    core.root.visible = visible
    player.mesh.visible = visible && down
  }
  function placeDetective() {
    train.carriages[0].updateWorldMatrix(true,false)
    inside.copy(train.door.inside).applyMatrix4(train.carriages[0].matrixWorld)
    threshold.copy(train.door.threshold).applyMatrix4(train.carriages[0].matrixWorld)
    outward.set(-1,0,0).transformDirection(train.carriages[0].matrixWorld)
    outwardYaw=Math.atan2(outward.x,outward.z)
    player.setPose?.(inside,outwardYaw)
    player.mesh.position.copy(inside)
    player.setCinematicView(view)
    player.startScriptedWalk?.(walkPath,STEP_OUT)
    core.hold(hand);player.mesh.visible=true
  }
  function updateDetective(phase,time,delta) {
    if(phase==='stepOut') player.updateScriptedWalk?.(delta)
    if(phase==='holdCore') player.updateScriptedTurn?.(delta)
    if(phase==='throw' && !launched && time>=Math.min(THROW_RELEASE,throwDuration)-1e-9) {
      player.mesh.updateWorldMatrix(true,true)
      hand.getWorldPosition(releasePosition)
      core.launch(throwHandle?.releasePosition ?? releasePosition,CORE_FLIGHT_SECONDS);launched=true
    }
    if(phase==='flash' && time>=SCREEN_FLASH_PEAK) player.mesh.visible=false
  }
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
  const warmCamera = new THREE.PerspectiveCamera(ENDING_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  warmCamera.position.copy(ENDING_CAMERA_POSITION)
  warmCamera.quaternion.copy(viewRotation)
  let shotFov = ENDING_CAMERA_FOV
  function setShotFov(value) {
    if (disposed) return shotFov
    shotFov = gorge.plate.setFov(value)
    shots[activeShot].fov = shotFov; shots[activeShot].updateProjectionMatrix()
    if (renderCamera) {
      renderCamera.fov = shotFov; renderCamera.aspect = shots[activeShot].aspect; renderCamera.updateProjectionMatrix()
    }
    warmCamera.fov = shotFov; warmCamera.updateProjectionMatrix()
    return shotFov
  }
  const savedViewport = new THREE.Vector4()
  const savedScissor = new THREE.Vector4()
  let budgetLogged = false
  let alignMode = false, removeAlignment = null, holdMode = null
  if (import.meta.env?.DEV) {
    const parameters = new URLSearchParams(globalThis.location?.search ?? '')
    if(parameters.get('start')==='ending' && ['door','gorge'].includes(parameters.get('hold'))) {
      holdMode=parameters.get('hold');phaseIndex=PHASES.indexOf('beat')
      timeline=ENDING_FADE_IN+APPROACH+BRAKE+SETTLE
    }
    if(parameters.get('start')==='ending' && parameters.get('from')==='stop') {
      phaseIndex=PHASES.indexOf('beat');timeline=ENDING_FADE_IN+APPROACH+BRAKE+SETTLE
    }
    if (parameters.get('start') === 'ending' && parameters.has('align')) {
      alignMode = true
      phaseIndex = PHASES.indexOf('beat'); phaseTime = 0
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
            phaseIndex = PHASES.indexOf(atApproachStart ? 'approach' : 'beat'); phaseTime = 0
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
    const savedTimes = new Map()
    const sparkIntensity = train.sparks.material.uniforms.uIntensity
    const previousSparkIntensity = sparkIntensity.value
    const savedDoor=train.door.openness,savedPlayerPosition=player.mesh.position.clone(),
      savedPlayerQuaternion=player.mesh.quaternion.clone(),savedPlayerVisible=player.mesh.visible
    const savedTrainZ=train.root.position.z,savedPitch=train.locomotive.rotation.x
    train.update(STOP_CENTER_Z,0,-1,SETTLE)
    train.carriages[0].updateWorldMatrix(true,false)
    threshold.copy(train.door.threshold).applyMatrix4(train.carriages[0].matrixWorld)
    player.mesh.position.copy(threshold);player.mesh.visible=true
    core.hold(hand);core.update(0)
    gorge.root.traverse(node => { if (node.isMesh || node.isPoints) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    train.root.traverse(node => { if (node.isMesh || node.isPoints || node.isSprite) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    for(const root of [core.root,player.mesh]) root.traverse(node=>{
      if(node.isMesh||node.isSprite||node.isPoints){savedCulling.push([node,node.frustumCulled]);node.frustumCulled=false}
    })
    train.root.traverse(node => {
      if (!node.material) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const effects = material.userData.endingTimeDamage ?? material.userData.endingLamp ?? material.uniforms
        const time = effects?.uTime
        if (time && !savedTimes.has(time)) savedTimes.set(time,time.value)
      }
    })
    for(const texture of gorge.plate.textures) renderer.initTexture?.(texture)
    const savedShot=activeShot
    try {
      sparkIntensity.value = 1
      scene.updateMatrixWorld(true)
      renderer.compile(scene, warmCamera)
      renderer.setRenderTarget(target)
      renderer.setScissorTest(false)
      for(let index=0;index<shots.length;index++) {
        selectShot(index);warmCamera.copy(shots[index]);warmCamera.updateMatrixWorld(true)
        core.hold(hand);core.update(0)
        train.door.setOpen(0)
        for (const uniform of savedTimes.keys()) uniform.value = 4.23
        renderer.render(scene, warmCamera)
        train.door.setOpen(1)
        for (const uniform of savedTimes.keys()) uniform.value = 0.19
        renderer.render(scene, warmCamera)
        core.launch(threshold,CORE_FLIGHT_SECONDS);core.update(0,2)
        renderer.render(scene,warmCamera)
        core.update(0,-1,0.25);renderer.render(scene,warmCamera)
      }
    } finally {
      sparkIntensity.value = previousSparkIntensity
      core.reset();train.door.setOpen(savedDoor)
      train.root.position.z=savedTrainZ;train.locomotive.rotation.x=savedPitch
      player.mesh.position.copy(savedPlayerPosition);player.mesh.quaternion.copy(savedPlayerQuaternion)
      player.mesh.visible=savedPlayerVisible
      selectShot(savedShot)
      for (const [uniform, value] of savedTimes) uniform.value = value
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
    const phase=PHASES[index]
    if(phase==='cutB') selectShot(1)
    if(phase==='cutA' || phase==='fadeOut') selectShot(0)
    if(phase==='whipDown' || phase==='whipUp') audio.whip?.()
    if(phase==='fallC') {selectShot(2);worldAlign.visible=true;core.root.visible=true;player.mesh.visible=true}
    if(phase==='emptyHold') {selectShot(1);worldAlign.visible=true;core.root.visible=true}
    if(phase==='doorOpen') audio.door?.()
    if(phase==='stepOut') placeDetective()
    if(phase==='holdCore') {
      player.cancelScriptedWalk?.();player.mesh.position.copy(threshold)
      player.startScriptedTurn?.(outwardYaw,HOLD_CORE)
    }
    if(phase==='throw') {throwHandle=player.playThrow?.();audio.throw?.()}
    if(phase==='flash') {core.update(0,-1,0);audio.impact?.()}
    if(phase==='emptyHold') {player.mesh.visible=false;core.reset()}
    if (PHASES[index] === 'fadeOut') { audio.fadeOut?.();hud.hideCinematicSkip?.(); skipControl.hide() }
    if (PHASES[index] === 'done' && !advanced) {
      advanced = true
      audio.stop()
      hud.hideCinematicSkip?.()
      skipControl.hide()
      advance()
    }
  }

  function skip() {
    if (disposed || advanced || phaseIndex >= PHASES.indexOf('fadeOut')) return
    audio.stop()
    player.cancelScriptedWalk?.();player.resetInteractionAnimation?.()
    if(throwHandle) throwHandle.cancelled=true
    player.mesh.visible=false;core.reset();train.door.setOpen(1)
    worldAlign.visible=true;core.root.visible=true;selectShot(0)
    enterPhase(PHASES.indexOf('fadeOut'))
  }

  function present(delta) {
    const phase = PHASES[phaseIndex]
    overlay.style.opacity = String(phase === 'fadeIn' ? 1 - phaseTime / ENDING_FADE_IN
      : phase === 'fadeOut' ? phaseTime / FADE_OUT : phaseIndex >= PHASES.indexOf('title') ? 1 : 0)
    title.style.opacity = phaseIndex >= PHASES.indexOf('title') ? String(Math.min(1, phaseTime / TITLE_FADE)) : '0'
    let distance = 0
    let brakingProgress = -1
    let settleTime = -1
    if (phase === 'approach') distance = TRAIN_SPEED * phaseTime
    else if (phase === 'braking') {
      distance = APPROACH_DISTANCE + TRAIN_SPEED * phaseTime - TRAIN_SPEED * phaseTime * phaseTime / (2 * BRAKE)
      brakingProgress = phaseTime / BRAKE
    } else if (phaseIndex >= 3) {
      distance = APPROACH_DISTANCE + BRAKING_DISTANCE
      settleTime = phase === 'settle' ? phaseTime : SETTLE
    }
    const speed = phase === 'approach' ? TRAIN_SPEED : phase === 'braking' ? TRAIN_SPEED * (1 - phaseTime / BRAKE) : 0
    train.update(START_CENTER_Z - distance, distance, brakingProgress, settleTime, delta, speed)
    audio.update(brakingProgress, brakeIntensity(brakingProgress), delta)
    if(phase==='doorOpen') train.door.setOpen(Math.min(1,phaseTime/DOOR_MOTION_SECONDS))
    if(phaseIndex>PHASES.indexOf('doorOpen')) train.door.setOpen(1)
    updateDetective(phase,phaseTime,delta)
    const flightTime=phase==='throw' && launched ? Math.max(0,phaseTime-Math.min(THROW_RELEASE,throwDuration))
      : phase==='whipDown' ? RELEASE_TO_WHIP+phaseTime
      : phase==='fallC' ? RELEASE_TO_WHIP+WHIP_SECONDS+phaseTime : -1
    core.update(delta,flightTime,phase==='flash'?phaseTime:-1)
    if(phase==='whipDown' || phase==='whipUp') updateWhip(phase,phaseTime)
  }

  return {
    objective: '', checkpoint: { position: new THREE.Vector3(0, 0, STOP_CENTER_Z), yaw: 0 },
    isCinematic: true,
    setShotFov, core, plate:gorge.plate, door:train.door, shots, get activeShot(){return activeShot},
    get phase(){return PHASES[phaseIndex]},get phaseTime(){return phaseTime},
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
        if (import.meta.env?.DEV) console.info('[ending] fadeIn')
      }
      if(!warmed&&visualReady&&gorge.plate.ready){warmScene();warmed=true}
      // Settings subscribers may run while paused; keep this shot's lens static.
      if (renderCamera && (renderCamera.fov !== shotFov || renderCamera.aspect !== shots[activeShot].aspect)) {
        setShotFov(shotFov)
      }
      let remaining = gorge.plate.ready && visualReady && !alignMode ? Math.max(0, delta) : 0
      while (remaining > 0 && !advanced) {
        if(holdMode==='door' && PHASES[phaseIndex]==='holdCore') break
        if(holdMode==='gorge' && PHASES[phaseIndex]==='fallC' && phaseTime>=FALL-0.5-1e-9) break
        let boundary=durations[phaseIndex]
        if(holdMode==='gorge' && PHASES[phaseIndex]==='fallC') boundary=FALL-0.5
        if(PHASES[phaseIndex]==='throw' && phaseTime<Math.min(THROW_RELEASE,throwDuration)-1e-9)
          boundary=Math.min(boundary,Math.min(THROW_RELEASE,throwDuration))
        if(PHASES[phaseIndex]==='flash' && phaseTime<SCREEN_FLASH_PEAK-1e-9) boundary=SCREEN_FLASH_PEAK
        const step = Math.min(remaining, boundary - phaseTime)
        phaseTime += step
        timeline += step
        remaining -= step
        gorge.update(step)
        present(step)
        if (phaseTime >= durations[phaseIndex] - 1e-9) enterPhase(phaseIndex + 1)
      }
      if (alignMode) { gorge.update(Math.max(0, delta)); present(Math.max(0, delta)) }
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
        renderCamera.view = previousCameraView; renderCamera.updateProjectionMatrix()
      }
      hud.hideCinematicSkip?.()
      overlay.remove()
      skipControl.dispose()
      skipRoot.remove()
      if(throwHandle) throwHandle.cancelled=true
      player.cancelScriptedWalk?.()
      player.resetInteractionAnimation?.()
      player.setPose?.(previousPlayer.position,new THREE.Euler().setFromQuaternion(previousPlayer.quaternion).y)
      player.mesh.position.copy(previousPlayer.position);player.mesh.quaternion.copy(previousPlayer.quaternion)
      player.mesh.scale.copy(previousPlayer.scale);player.mesh.visible=previousPlayer.visible
      player.setCinematicView(previousPlayer.view)
      for(const state of actionStates) {
        state.action.stop();state.action.enabled=state.enabled;state.action.paused=state.paused
        state.action.time=state.time;state.action.setEffectiveWeight(state.weight);state.action.setEffectiveTimeScale(state.speed)
        if(state.running) state.action.play()
      }
      handFallback.removeFromParent()
      gorge.dispose()
      train.dispose()
      core.dispose()
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

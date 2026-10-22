import * as THREE from 'three'
import { createEndingGorge } from '../environment/ending-gorge.js'
import { createEndingTrain, TRAIN_SPEED, STOP_CENTER_Z, STOP_NOSE_Z } from '../environment/ending-train.js'
import { createEndingTrack } from '../environment/ending-track.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../shaders/ending-plate.js'
import { createCinematicSkip } from '../ui/cinematic-skip.js'
import { createEndingAudio } from '../systems/ending-audio.js'
import { brakeIntensity } from '../environment/ending-sparks.js'
import { createEndingCore, CORE_FLIGHT_SECONDS, FLASH_SECONDS, SCREEN_FLASH_PEAK } from '../environment/ending-core.js'
import { DOOR_MOTION_SECONDS } from '../environment/ending-door.js'

export const DOOR_CAMERA_DISTANCE = 6.6
export const DOOR_CAMERA_FOV = 32
export const DOOR_EYE_HEIGHT = 1.65
export const GORGE_CAMERA_DISTANCE = 15
export const GORGE_CAMERA_PITCH = 55
export const NEW_PLATE_ASPECT = 1672 / 941

export function createEndingShots(carriage, door) {
  carriage.updateWorldMatrix(true, false)
  const eye = new THREE.Vector3(-1.485,door.threshold.y+DOOR_EYE_HEIGHT,door.threshold.z).applyMatrix4(carriage.matrixWorld)
  const outward = new THREE.Vector3(-1, 0, 0).transformDirection(carriage.matrixWorld)
  const up = new THREE.Vector3(0,1,0).transformDirection(carriage.matrixWorld)
  const a = new THREE.PerspectiveCamera(PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  a.position.copy(PLATE_CAMERA_POSITION); a.lookAt(PLATE_CAMERA_TARGET)
  const b = new THREE.PerspectiveCamera(DOOR_CAMERA_FOV, NEW_PLATE_ASPECT, 0.1, 1800)
  b.up.copy(up);b.position.copy(eye).addScaledVector(outward,DOOR_CAMERA_DISTANCE)
  b.lookAt(eye)
  const c = new THREE.PerspectiveCamera(45, NEW_PLATE_ASPECT, 0.1, 1800)
  // Preserve the established gorge shot exactly while straightening the train.
  c.position.set(7.037561630396917,-0.4365810025828596,21.230065345537152)
  c.lookAt(new THREE.Vector3(7.577714548750396,-1.2557330468718513,21.42300251958971))
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
export const RELEASE_TO_WHIP = 2.0
export const SNAP_HOLD = 1.2
export const SALUTE_BEAT = 0.4
export const DIP_DOWN = 0.25
export const DIP_UP = 0.35
export const SALUTE = 3.0 // Replaced by the loaded Salute clip's duration.
export const TURN = 0.5
export const RUN = 2.1
export const EMPTY_BEAT = 0.6
export const TILT_UP = 3.5
export const TILT_DEGREES = 24
export const CRANE_HEIGHT = 6
export const SKY_HOLD = 2.5
export const DOOR_OPEN = 0.8
export const HOLD_CORE = 0.8
export const THROW = 2.2 // Actual loaded Throw clip duration replaces this fallback.
export const THROW_RELEASE = 24 / 30
export const FALL = CORE_FLIGHT_SECONDS - RELEASE_TO_WHIP - WHIP_SECONDS
const BRAKING_DISTANCE = TRAIN_SPEED * BRAKE / 2
const APPROACH_DISTANCE = TRAIN_SPEED * APPROACH
export const START_CENTER_Z = STOP_CENTER_Z + APPROACH_DISTANCE + BRAKING_DISTANCE
export const ENDING_CAMERA_POSITION = PLATE_CAMERA_POSITION
export const ENDING_CAMERA_TARGET = PLATE_CAMERA_TARGET
export const ENDING_CAMERA_FOV = PLATE_CAMERA_FOV
export const WORLD_ALIGN_DEFAULTS = Object.freeze({ x: -0.75, y: -3.25, z: -0.75, yaw: -20.25, pitch: -2.75, roll: 0, scale: 1 })
export const PHASES = Object.freeze(['fadeIn','approach','braking','settle','beat','cutB','doorHold','doorOpen','holdCore','throw','whipDown','fallC','flash','snapHold','dipDown','dipUp','salute','turn','run','emptyBeat','tiltUp','skyHold','done'])
export const DURATIONS = Object.freeze([ENDING_FADE_IN,APPROACH,BRAKE,SETTLE,BEAT,0,DOOR_HOLD,DOOR_OPEN,HOLD_CORE,THROW_RELEASE+RELEASE_TO_WHIP,WHIP_SECONDS,FALL,FLASH_SECONDS,SNAP_HOLD,DIP_DOWN,DIP_UP,SALUTE-DIP_UP,TURN,RUN,EMPTY_BEAT,TILT_UP,SKY_HOLD])

export function measureEndingRoofAngle(carriage,shot) {
  const left=new THREE.Vector3(-1.48,4,6.5).applyMatrix4(carriage.matrixWorld).project(shot)
  const right=new THREE.Vector3(-1.48,4,8.5).applyMatrix4(carriage.matrixWorld).project(shot)
  return THREE.MathUtils.radToDeg(Math.atan2(right.y-left.y,(right.x-left.x)*shot.aspect))
}

// Bounds are evaluated on the painted sphere, not near the craned camera.
export function measureEndingFrame(trainRoot,shot,projector) {
  trainRoot.updateWorldMatrix(true,true);shot.updateMatrixWorld(true);projector.updateMatrixWorld(true)
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(shot.projectionMatrix,shot.matrixWorldInverse))
  const box=new THREE.Box3(),point=new THREE.Vector3()
  let visibleBounds=0,overlap=0,maxPlateNdc=0
  trainRoot.traverseVisible(node=>{
    if(!node.isMesh && !node.isPoints && !node.isSprite)return
    box.setFromObject(node)
    if(!frustum.intersectsBox(box))return
    visibleBounds++
    let minX=1,minY=1,maxX=-1,maxY=-1
    for(let corner=0;corner<8;corner++) {
      point.set(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).project(shot)
      minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y)
    }
    overlap+=Math.max(0,Math.min(1,maxX)-Math.max(-1,minX))*Math.max(0,Math.min(1,maxY)-Math.max(-1,minY))*25
  })
  for(const x of [-1,1])for(const y of [-1,1]) {
    point.set(x,y,0.5).unproject(shot).sub(shot.position).normalize().multiplyScalar(1500).add(shot.position).project(projector)
    maxPlateNdc=Math.max(maxPlateNdc,Math.abs(point.x),Math.abs(point.y))
  }
  return {visibleTrainBounds:visibleBounds,trainOverlapPercent:Math.min(100,overlap),maxPlateNdc}
}

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
  const previousRenderCamera=renderCamera?.clone(false)
  const previousPlayer = {visible:player.mesh.visible,position:player.mesh.position.clone(),
    quaternion:player.mesh.quaternion.clone(),scale:player.mesh.scale.clone(),view:player.getCinematicView?.() ?? null}
  let visual=null,visualReady=true,actionStates=[],throwHandle=null,throwDuration=2.2
  let endingAction=null,runClipSpeed=2.7
  const footBones=[],footPoint=new THREE.Vector3(),floorInverse=new THREE.Matrix4()
  let headBone=null,actorScale=1
  const actorMetrics={footErrorCm:0,headMarginCm:0,lowestFootY:0,floorY:0,headY:0}
  const visualShadowStates=[]
  const floorNormal=new THREE.Vector3(),carriageRotation=new THREE.Quaternion(),localFacing=new THREE.Quaternion()
  const runEnd=new THREE.Vector3(),localUp=new THREE.Vector3(0,1,0)
  const runPosition=new THREE.Vector3(),runTangent=new THREE.Vector3()
  const runMetrics={distance:0,position:new THREE.Vector3(),fullyOccluded:false,hidden:false}
  let wasRunOccluded=false,lastRunCheck=-Infinity
  if (player.loadVisual && player.mesh.getObjectByName('detective')) {
    visualReady=false
    player.loadVisual().then(value=>{
      if(disposed)return
      visual=value
      actionStates=Object.values(visual?.actions ?? {}).map(action=>({action,time:action.time,
        weight:action.getEffectiveWeight(),speed:action.getEffectiveTimeScale(),paused:action.paused,
        enabled:action.enabled,running:action.isRunning()}))
      throwDuration=visual?.actions.throw?.getClip().duration ?? 2.2
      durations[PHASES.indexOf('salute')]=(visual?.actions.salute?.getClip().duration ?? SALUTE)-DIP_UP
      visual?.root.traverse(node=>{if(node.isMesh){visualShadowStates.push([node,node.castShadow,node.receiveShadow]);node.castShadow=false;node.receiveShadow=false}})
      for(const name of ['mixamorigLeftFoot','mixamorigRightFoot','mixamorigLeftToeBase','mixamorigRightToeBase']) {
        const bone=visual?.root.getObjectByName(name);if(bone)footBones.push(bone)
      }
      headBone=visual?.root.getObjectByName('mixamorigHead')??null
      sampleAnimation('idle',0);calibrateActor()
      measureRunStride()
      visualReady=true
    })
  }
  const gorge = createEndingGorge(scene, renderer)
  const train = createEndingTrain()
  const track = createEndingTrack()
  const audio = audioFactory()
  const core = createEndingCore(scene)
  const handFallback=new THREE.Group();handFallback.name='ending-core-hand-anchor'
  handFallback.position.set(0.3,1.2,0.2)
  const hand=player.mesh.getObjectByName('mixamorigRightHand') ?? handFallback
  if(hand===handFallback) player.mesh.add(handFallback)
  const inside=new THREE.Vector3(),threshold=new THREE.Vector3(),outward=new THREE.Vector3(),releasePosition=new THREE.Vector3()
  let outwardYaw=0,launched=false
  const worldAlign = new THREE.Group()
  worldAlign.name = 'WORLD_ALIGN'
  worldAlign.position.set(WORLD_ALIGN_DEFAULTS.x, WORLD_ALIGN_DEFAULTS.y, WORLD_ALIGN_DEFAULTS.z)
  worldAlign.rotation.set(THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.pitch),
    THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.yaw), THREE.MathUtils.degToRad(WORLD_ALIGN_DEFAULTS.roll))
  worldAlign.scale.setScalar(WORLD_ALIGN_DEFAULTS.scale)
  worldAlign.add(train.root,track.root); scene.add(worldAlign)
  train.update(START_CENTER_Z, 0, -1)
  train.update(STOP_CENTER_Z, 0, -1, SETTLE)
  const shots = createEndingShots(train.carriages[0], train.door)
  gorge.plate.configureDoor(shots[1])
  const doorRotation=shots[1].quaternion.clone(),tiltRotation=new THREE.Quaternion(),tiltAxis=new THREE.Vector3(1,0,0)
  const doorPosition=shots[1].position.clone()
  const craneUp=shots[1].up.clone()
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
    track.root.visible = index === 1
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
    const t = Math.min(1, time / WHIP_SECONDS)
    const from = 1, to = 2
    if (activeShot !== (t < 0.5 ? from : to)) selectShot(t < 0.5 ? from : to)
    gorge.plate.setWhip(from, to, t*t*(3-2*t), Math.sin(Math.PI*t)*1.8, -1)
    const visible = time < 0.06 || time > 0.24
    worldAlign.visible = visible
    core.root.visible = visible
    player.mesh.visible = visible
  }
  function tiltDoor(progress) {
    const t=THREE.MathUtils.clamp(progress,0,1),ease=t*t*(3-2*t)
    tiltRotation.setFromAxisAngle(tiltAxis,THREE.MathUtils.degToRad(TILT_DEGREES)*ease)
    shots[1].position.copy(doorPosition).addScaledVector(craneUp,CRANE_HEIGHT*ease)
    shots[1].quaternion.copy(doorRotation).multiply(tiltRotation);shots[1].updateMatrixWorld(true)
    view.position.copy(shots[1].position);view.initialPosition.copy(shots[1].position)
    view.initialRotation.copy(shots[1].quaternion);view.targetRotation.copy(shots[1].quaternion)
    view.moveElapsed=view.moveSeconds
    gorge.plate.updateRenderPose(shots[1])
    if(renderCamera) {
      renderCamera.position.copy(shots[1].position);renderCamera.quaternion.copy(shots[1].quaternion)
      renderCamera.updateMatrixWorld(true)
    }
  }
  function placeDetective() {
    train.carriages[0].updateWorldMatrix(true,false)
    inside.copy(train.door.inside).applyMatrix4(train.carriages[0].matrixWorld)
    threshold.copy(train.door.threshold).applyMatrix4(train.carriages[0].matrixWorld)
    runEnd.copy(train.door.runEnd).applyMatrix4(train.carriages[0].matrixWorld)
    outward.set(-1,0,0).transformDirection(train.carriages[0].matrixWorld)
    outwardYaw=Math.atan2(outward.x,outward.z)
    player.setPose?.(threshold,outwardYaw)
    player.mesh.position.copy(threshold)
    player.setCinematicView(view)
    core.hold(hand);player.mesh.visible=true
  }
  function sampleAnimation(name,time) {
    const action=visual?.actions[name]
    if(!action)return
    if(endingAction!==action || !action.isScheduled()) {
      visual.mixer.stopAllAction();action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play()
      action.paused=true;endingAction=action
    }
    // Player pose/interaction resets may disable an action between frames.
    // Reassert the sampled action after main.js has ticked the live mixer.
    for(const state of actionStates)if(state.action!==action)state.action.enabled=false
    action.enabled=true;action.stopFading().stopWarping().setEffectiveWeight(1);action.paused=true
    action.time=Math.max(0,Math.min(time,action.getClip().duration))
    visual.mixer.update(0)
  }
  function measureRunStride() {
    const left=visual?.root.getObjectByName('mixamorigLeftToeBase'),right=visual?.root.getObjectByName('mixamorigRightToeBase')
    if(!left||!right||!visual.actions.run)return
    const count=64,duration=visual.actions.run.getClip().duration, samples=new Float32Array((count+1)*6)
    const inverse=new THREE.Matrix4(),point=new THREE.Vector3()
    player.mesh.updateWorldMatrix(true,true);inverse.copy(player.mesh.matrixWorld).invert()
    for(let i=0;i<=count;i++) {
      sampleAnimation('run',duration*i/count);player.mesh.updateWorldMatrix(true,true)
      for(let foot=0;foot<2;foot++) {
        const bone=foot?right:left
        bone.getWorldPosition(point).applyMatrix4(inverse)
        point.toArray(samples,i*6+foot*3)
      }
    }
    let distance=0,seconds=0
    for(let i=1;i<=count;i++) {
      const offset=(samples[i*6+1]<samples[i*6+4]?0:3),a=(i-1)*6+offset,b=i*6+offset
      if(Math.abs(samples[b+1]-samples[a+1])>0.035)continue
      distance+=Math.hypot(samples[b]-samples[a],samples[b+2]-samples[a+2]);seconds+=duration/count
    }
    if(seconds>0 && distance/seconds>0.3)runClipSpeed=distance/seconds
    visual.mixer.stopAllAction();endingAction=null
  }
  function groundDetective() {
    if(!visual||!footBones.length)return
    player.mesh.updateWorldMatrix(true,true)
    floorInverse.copy(train.carriages[0].matrixWorld).invert()
    let minimum=Infinity
    for(const bone of footBones){bone.getWorldPosition(footPoint).applyMatrix4(floorInverse);minimum=Math.min(minimum,footPoint.y)}
    floorNormal.set(0,1,0).transformDirection(train.carriages[0].matrixWorld)
    if(Number.isFinite(minimum))player.mesh.position.addScaledVector(floorNormal,train.door.threshold.y-minimum)
    player.mesh.updateWorldMatrix(true,true)
    minimum=Infinity
    for(const bone of footBones){bone.getWorldPosition(footPoint);minimum=Math.min(minimum,footPoint.y)}
    actorMetrics.lowestFootY=minimum
    footPoint.copy(player.mesh.position).applyMatrix4(floorInverse);footPoint.y=train.door.threshold.y
    footPoint.applyMatrix4(train.carriages[0].matrixWorld);actorMetrics.floorY=footPoint.y
    actorMetrics.footErrorCm=(minimum-actorMetrics.floorY)*100
    if(headBone){headBone.getWorldPosition(footPoint).applyMatrix4(floorInverse);actorMetrics.headY=footPoint.y+0.15*actorScale;actorMetrics.headMarginCm=(3.65-actorMetrics.headY)*100}
  }
  function calibrateActor() {
    if(!headBone||!footBones.length)return
    player.mesh.updateWorldMatrix(true,true)
    let floor=Infinity
    for(const bone of footBones){bone.getWorldPosition(footPoint);floor=Math.min(floor,footPoint.y)}
    headBone.getWorldPosition(footPoint)
    const height=footPoint.y-floor+0.15
    actorScale=height>0?Math.min(1,1.85/height):1
    player.mesh.scale.copy(previousPlayer.scale).multiplyScalar(actorScale)
  }
  function updateDetective(phase,time,delta) {
    const index=PHASES.indexOf(phase)
    if(index>=PHASES.indexOf('doorOpen') && index<=PHASES.indexOf('run')) {
      train.carriages[0].getWorldQuaternion(carriageRotation)
      const turn=phase==='turn'?time/TURN:phase==='run'?1:0
      const smooth=turn*turn*(3-2*turn)
      localFacing.setFromAxisAngle(localUp,-Math.PI/2+Math.PI*smooth)
      player.mesh.quaternion.copy(carriageRotation).multiply(localFacing)
      player.mesh.position.copy(threshold)
      if(phase==='run') {
        runMetrics.distance=train.door.runDistance*Math.min(1,time/RUN)
        train.door.sampleRun(runMetrics.distance,runPosition,runTangent)
        runMetrics.position.copy(runPosition)
        player.mesh.position.copy(runPosition).applyMatrix4(train.carriages[0].matrixWorld)
        localFacing.setFromAxisAngle(localUp,Math.atan2(runTangent.x,runTangent.z))
        player.mesh.quaternion.copy(carriageRotation).multiply(localFacing)
      }
      if(phase==='salute'||phase==='dipUp')sampleAnimation('salute',phase==='dipUp'?time:time+DIP_UP)
      else if(phase==='run')sampleAnimation('run',(time*(train.door.runDistance/RUN)/runClipSpeed)%(visual?.actions.run?.getClip().duration??1))
      else if(index>=PHASES.indexOf('throw') && index<=PHASES.indexOf('dipDown'))
        sampleAnimation('throw',phase==='throw'?Math.min(time,throwDuration):throwDuration)
      else sampleAnimation('idle',0)
      groundDetective()
    }
    if(phase==='throw' && !launched && time>=Math.min(THROW_RELEASE,throwDuration)-1e-9) {
      player.mesh.updateWorldMatrix(true,true)
      hand.getWorldPosition(releasePosition)
      core.launch(throwHandle?.releasePosition ?? releasePosition,CORE_FLIGHT_SECONDS);launched=true
    }
    if(phase==='run') {
      runMetrics.fullyOccluded=train.door.fullyOccluded(shots[1].position,player.mesh.position)
      if(time>=RUN-1e-9 && runMetrics.fullyOccluded){player.mesh.visible=false;runMetrics.hidden=true}
      if(import.meta.env?.DEV && (time-lastRunCheck>=0.25 || runMetrics.fullyOccluded!==wasRunOccluded || runMetrics.hidden)) {
        lastRunCheck=time
        console.info('[ending-check] run',{distance:runMetrics.distance,position:runMetrics.position.toArray(),fullyOccluded:runMetrics.fullyOccluded,hidden:runMetrics.hidden})
      }
      wasRunOccluded=runMetrics.fullyOccluded
    }
  }
  const overlay = document.createElement('div')
  overlay.id = 'ending-overlay'
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '60', background: '#000',
    opacity: '1', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' })
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
  let phaseLabel=null,lastActorCheck=-Infinity,shaderCheckLogged=false
  let alignMode = false, removeAlignment = null, holdMode = null
  if (import.meta.env?.DEV) {
    phaseLabel=document.createElement('div');phaseLabel.id='ending-dev-phase'
    Object.assign(phaseLabel.style,{position:'fixed',left:'8px',top:'8px',zIndex:'80',color:'#d8e4ff',background:'#020b1bcc',padding:'4px 7px',font:'12px monospace',pointerEvents:'none'})
    document.body.appendChild(phaseLabel)
    let nearWindows=0,passengerBatches=0
    train.carriages[0].traverse(node=>{
      if(node.name==='ending-damage-interior')passengerBatches++
      if(node.userData.endingWindowBatch) {
        const positions=node.geometry.attributes.position
        for(let i=0;i<positions.count;i+=3)if((positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3<0)nearWindows++
      }
    })
    console.info('[ending-check] steam-room',{cameraSideWindowTriangles:nearWindows,passengerInteriorBatches:passengerBatches})
    const parameters = new URLSearchParams(globalThis.location?.search ?? '')
    if(parameters.get('start')==='ending' && ['door','gorge','salute'].includes(parameters.get('hold'))) {
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
    placeDetective();updateDetective('holdCore',0,0);core.update(0)
    gorge.root.traverse(node => { if (node.isMesh || node.isPoints) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    train.root.traverse(node => { if (node.isMesh || node.isPoints || node.isSprite) { savedCulling.push([node, node.frustumCulled]); node.frustumCulled = false } })
    track.root.traverse(node=>{if(node.isMesh){savedCulling.push([node,node.frustumCulled]);node.frustumCulled=false}})
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
        if(index===1) {
          sampleAnimation('salute',durations[PHASES.indexOf('salute')]/2);renderer.render(scene,warmCamera)
          sampleAnimation('run',0.2);renderer.render(scene,warmCamera)
          sampleAnimation('idle',0)
        }
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
      visual?.mixer.stopAllAction();endingAction=null
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
    if(phase==='whipDown') audio.whip?.()
    if(phase==='fallC') {selectShot(2);worldAlign.visible=true;core.root.visible=true;player.mesh.visible=true}
    if(phase==='dipUp') {selectShot(1);worldAlign.visible=true;core.root.visible=true;core.reset();player.mesh.visible=true;sampleAnimation('salute',0)}
    if(phase==='doorOpen') {placeDetective();audio.door?.()}
    if(phase==='holdCore') {
      player.cancelScriptedWalk?.();player.mesh.position.copy(threshold)
    }
    if(phase==='throw') audio.throw?.()
    if(phase==='flash') {core.update(0,-1,0);audio.impact?.()}
    if(phase==='emptyBeat') {if(runMetrics.fullyOccluded)player.mesh.visible=false;core.reset()}
    if(phase==='skyHold') {
      selectShot(1);tiltDoor(1);audio.fadeOut?.();hud.hideCinematicSkip?.();skipControl.hide()
      if(import.meta.env?.DEV)console.info('[ending-check] crane-end',measureEndingFrame(train.root,shots[1],gorge.plate.doorCamera))
    }
    updateDetective(phase,0,0)
    if(import.meta.env?.DEV)console.info('[ending-check] phase',{phase,animation:player.mesh.visible?endingAction?.getClip().name??'none':'none',shot:'ABC'[activeShot]})
    if (PHASES[index] === 'done' && !advanced) {
      advanced = true
      audio.stop()
      hud.hideCinematicSkip?.()
      skipControl.hide()
      advance()
    }
  }

  function skip() {
    if (disposed || advanced) return
    audio.stop()
    player.cancelScriptedWalk?.();player.resetInteractionAnimation?.()
    if(throwHandle) throwHandle.cancelled=true
    player.mesh.visible=false;core.reset();train.door.setOpen(1)
    worldAlign.visible=true;core.root.visible=true
    selectShot(1);tiltDoor(1)
    enterPhase(PHASES.indexOf('done'))
    present(0)
  }

  function present(delta) {
    const phase = PHASES[phaseIndex]
    overlay.style.background = phase==='dipDown'||phase==='dipUp'?'#020b1b':'#000'
    overlay.style.opacity = String(phase === 'fadeIn' ? 1 - phaseTime / ENDING_FADE_IN
      : phase==='dipDown'?phaseTime/DIP_DOWN:phase==='dipUp'?1-phaseTime/DIP_UP
      : 0)
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
    if(phase==='whipDown') updateWhip(phase,phaseTime)
    if(phase==='tiltUp')tiltDoor(phaseTime/TILT_UP)
  }

  return {
    objective: '', checkpoint: { position: new THREE.Vector3(0, 0, STOP_CENTER_Z), yaw: 0 },
    isCinematic: true,
    setShotFov, core, track, plate:gorge.plate, door:train.door, shots,
    actorMetrics, runMetrics, get activeAnimation(){return endingAction?.getClip().name??'none'},
    get runClipSpeed(){return runClipSpeed}, durationOf:phase=>durations[PHASES.indexOf(phase)], get activeShot(){return activeShot},
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
      if(import.meta.env?.DEV && warmed && !shaderCheckLogged) {
        shaderCheckLogged=true
        console.info('[ending-check] shaders',{failedPrograms:renderer?.info.programs?.filter(program=>program.diagnostics?.runnable===false).length??0})
      }
      // Settings subscribers may run while paused; keep this shot's lens static.
      if (renderCamera && (renderCamera.fov !== shotFov || renderCamera.aspect !== shots[activeShot].aspect)) {
        setShotFov(shotFov)
      }
      let remaining = gorge.plate.ready && visualReady && !alignMode ? Math.max(0, delta) : 0
      while (remaining > 0 && !advanced) {
        if(holdMode==='door' && PHASES[phaseIndex]==='holdCore') break
        if(holdMode==='gorge' && PHASES[phaseIndex]==='fallC' && phaseTime>=FALL-0.5-1e-9) break
        if(holdMode==='salute' && PHASES[phaseIndex]==='salute' && phaseTime>=durations[phaseIndex]/2-1e-9) break
        let boundary=durations[phaseIndex]
        if(holdMode==='gorge' && PHASES[phaseIndex]==='fallC') boundary=FALL-0.5
        if(holdMode==='salute' && PHASES[phaseIndex]==='salute') boundary=durations[phaseIndex]/2
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
      if(import.meta.env?.DEV) {
        if(phaseLabel)phaseLabel.textContent=PHASES[phaseIndex]+' '+phaseTime.toFixed(2)+'s'
        if(activeShot===1 && player.mesh.visible && timeline-lastActorCheck>=0.5) {
          lastActorCheck=timeline
          const centre=new THREE.Vector3(-1.485,train.door.threshold.y+1.05,train.door.threshold.z).applyMatrix4(train.carriages[0].matrixWorld).project(shots[1])
          const angles=new THREE.Euler().setFromQuaternion(shots[1].quaternion,'YXZ')
          console.info('[ending-check] B',{phase:PHASES[phaseIndex],animation:endingAction?.getClip().name??'none',footErrorCm:actorMetrics.footErrorCm,headMarginCm:actorMetrics.headMarginCm,doorCentreNdc:centre,cameraPitchDeg:THREE.MathUtils.radToDeg(angles.x),cameraRollDeg:THREE.MathUtils.radToDeg(angles.z),roofAngleDeg:measureEndingRoofAngle(train.carriages[0],shots[1]),doorLeafAnglesDeg:train.door.hinges.map(({hinge})=>THREE.MathUtils.radToDeg(hinge.rotation.y)),standingIntersections:train.door.standingIntersections()})
        }
      }
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
      if(renderCamera && previousRenderCamera)renderCamera.copy(previousRenderCamera,false)
      hud.hideCinematicSkip?.()
      overlay.remove()
      phaseLabel?.remove()
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
      for(const [node,castShadow,receiveShadow] of visualShadowStates){node.castShadow=castShadow;node.receiveShadow=receiveShadow}
      visual?.mixer.update(0)
      handFallback.removeFromParent()
      gorge.dispose()
      train.dispose()
      track.dispose()
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

import * as THREE from 'three'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { disposeObject } from '../core/dispose.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../shaders/ending-plate.js'

export const CORE_SIZE = 0.18
export const CORE_LIGHT_INTENSITY = 1.5
export const CORE_LIGHT_RANGE = 4
export const RIVER_TARGET_NDC = Object.freeze({x:0.41,y:-0.63})
export const GORGE_FLOOR_Y = -78.25 // 75 m below the aligned rail datum (-3.25).
export const CORE_FALL_SECONDS = 2.4
export const CORE_GRAVITY = -9.8
export const FLASH_GROW_SECONDS = 0.25
export const FLASH_SECONDS = 0.8
export const SCREEN_FLASH_PEAK = 0.08
export const SCREEN_FLASH_HOLD = 0.1
export const SCREEN_FLASH_FADE = 0.5

export function createEndingCore(scene) {
  const root=new THREE.Group();root.name='ending-core-effects';scene.add(root)
  const payload=new THREE.Group();payload.name='ending-chrono-core';root.add(payload)
  const crystal=new THREE.Mesh(new THREE.IcosahedronGeometry(CORE_SIZE/2,0),
    new THREE.MeshStandardMaterial({color:0x5ab8ff,emissive:0x5ab8ff,emissiveIntensity:3,roughness:0.22,metalness:0.2}))
  payload.add(crystal)
  const cage=new THREE.MeshStandardMaterial({color:0xb08d3f,roughness:0.35,metalness:0.8})
  const rings=new THREE.Group();payload.add(rings)
  for(const turn of [0,Math.PI/2]) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.11,0.009,5,16),cage)
    ring.rotation.y=turn;rings.add(ring)
  }
  const energy=createChronoFieldMaterial({baseColor:0x17395a,glowColor:0x5ab8ff,opacity:0.18,depthWrite:false})
  energy.uniforms.uMode.value=1;energy.uniforms.uIntensity.value=0.5
  payload.add(new THREE.Mesh(new THREE.SphereGeometry(0.125,12,8),energy))
  const pixels=new Uint8Array(32*32*4)
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
    const radius=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),i=(y*32+x)*4
    pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*Math.max(0,1-radius)**3)
  }
  const map=new THREE.DataTexture(pixels,32,32);map.needsUpdate=true
  const glowMaterial=new THREE.SpriteMaterial({map,color:0x5ab8ff,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})
  const glow=new THREE.Sprite(glowMaterial);glow.geometry=glow.geometry.clone();glow.scale.setScalar(0.8);payload.add(glow)
  // This light exists for the full level, even when the core is hidden.
  const light=new THREE.PointLight(0x5ab8ff,0,CORE_LIGHT_RANGE,2)
  light.name='ending-core-light';light.castShadow=false;root.add(light)
  const camera=new THREE.PerspectiveCamera(PLATE_CAMERA_FOV,PLATE_CAMERA_ASPECT,0.1,1800)
  camera.position.copy(PLATE_CAMERA_POSITION);camera.lookAt(PLATE_CAMERA_TARGET);camera.updateMatrixWorld(true)
  const ray=new THREE.Raycaster();ray.setFromCamera(RIVER_TARGET_NDC,camera)
  const impact=new THREE.Vector3()
  ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-GORGE_FLOOR_Y),impact)
  const start=new THREE.Vector3(),velocity=new THREE.Vector3(),gravity=new THREE.Vector3(0,CORE_GRAVITY,0)
  const trailGeometry=new THREE.PlaneGeometry(1,1)
  const ages=new Float32Array(8)
  for(let i=0;i<8;i++) ages[i]=(i+1)*0.045
  trailGeometry.setAttribute('aAge',new THREE.InstancedBufferAttribute(ages,1))
  const trailMaterial=new THREE.ShaderMaterial({
    uniforms:{uStart:{value:start},uVelocity:{value:velocity},uGravity:{value:gravity},uFlight:{value:0},uVisible:{value:0}},
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,
    vertexShader:'attribute float aAge;uniform vec3 uStart;uniform vec3 uVelocity;uniform vec3 uGravity;uniform float uFlight;varying vec2 vUv;varying float vFade;void main(){float t=max(0.0,uFlight-aAge);vec3 p=uStart+uVelocity*t+0.5*uGravity*t*t;vec4 view=viewMatrix*vec4(p,1.0);view.xy+=position.xy*(0.2+0.5*aAge);gl_Position=projectionMatrix*view;vUv=uv;vFade=(1.0-aAge/0.405)*step(aAge,uFlight);}',
    fragmentShader:'uniform float uVisible;varying vec2 vUv;varying float vFade;void main(){float a=pow(max(0.0,1.0-length(vUv-0.5)*2.0),2.0);gl_FragColor=vec4(0.2,0.6,1.0,a*vFade*uVisible*0.5);}'
  })
  const trail=new THREE.InstancedMesh(trailGeometry,trailMaterial,8)
  trail.name='ending-core-trail';trail.frustumCulled=false;root.add(trail)
  const flashMaterial=glowMaterial.clone();flashMaterial.color.setHex(0xd8f4ff)
  flashMaterial.depthTest=false
  const flash=new THREE.Sprite(flashMaterial);flash.geometry=flash.geometry.clone()
  flash.name='ending-impact-flash';flash.position.copy(impact);flash.renderOrder=90;root.add(flash)
  const screen=document.createElement('div');screen.id='ending-impact-screen-flash'
  Object.assign(screen.style,{position:'fixed',inset:'0',zIndex:'59',pointerEvents:'none',background:'#d8f4ff',opacity:'0'})
  document.body.appendChild(screen)
  let flight=-1,clock=0,disposed=false,flightDuration=CORE_FALL_SECONDS
  function pointAt(t,target) {return target.copy(start).addScaledVector(velocity,t).addScaledVector(gravity,t*t/2)}
  function reset() {
    root.attach(payload);payload.visible=false;trail.visible=false;flash.visible=false
    light.intensity=0;screen.style.opacity='0';flight=-1
  }
  function hold(hand) {
    hand.add(payload);payload.position.set(0,0,0);payload.quaternion.identity();payload.scale.setScalar(1)
    hand.updateWorldMatrix(true,false)
    hand.getWorldScale(payload.scale)
    payload.scale.set(1/payload.scale.x,1/payload.scale.y,1/payload.scale.z)
    payload.visible=true;flight=-1
  }
  function launch(position,duration=CORE_FALL_SECONDS) {
    flightDuration=duration
    start.copy(position);root.attach(payload)
    velocity.copy(impact).sub(start).addScaledVector(gravity,-duration*duration/2).divideScalar(duration)
    flight=0;payload.visible=true;trail.visible=true;trailMaterial.uniforms.uVisible.value=1
    pointAt(0,payload.position)
  }
  function update(delta,flightTime=-1,flashTime=-1) {
    clock+=Math.max(0,delta);energy.uniforms.uTime.value=clock
    if(flightTime>=0) {
      flight=Math.min(flightTime,flightDuration);pointAt(flight,payload.position)
      trailMaterial.uniforms.uFlight.value=flight
    }
    payload.updateWorldMatrix(true,false);payload.getWorldPosition(light.position)
    light.intensity=payload.visible && flashTime<0 ? CORE_LIGHT_INTENSITY*(0.92+0.08*Math.sin(clock*2.3)) : 0
    if(flashTime>=0) {
      payload.visible=false;trail.visible=false;flash.visible=flashTime<FLASH_SECONDS
      flash.scale.setScalar(18*Math.min(1,flashTime/FLASH_GROW_SECONDS))
      flashMaterial.opacity=Math.max(0,1-flashTime/FLASH_SECONDS)
      const alpha=flashTime<SCREEN_FLASH_PEAK ? flashTime/SCREEN_FLASH_PEAK
        : flashTime<SCREEN_FLASH_PEAK+SCREEN_FLASH_HOLD ? 1
        : Math.max(0,1-(flashTime-SCREEN_FLASH_PEAK-SCREEN_FLASH_HOLD)/SCREEN_FLASH_FADE)
      screen.style.opacity=String(alpha*0.85)
    }
  }
  reset()
  return {root,payload,light,trail,flash,screen,impact,start,velocity,gravity,camera,hold,launch,pointAt,update,reset,
    get flight(){return flight},
    get flightDuration(){return flightDuration},
    dispose(){if(disposed)return;disposed=true;root.attach(payload);root.removeFromParent();screen.remove();disposeObject(root)}}
}

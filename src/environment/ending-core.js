import * as THREE from 'three'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'
import { disposeObject } from '../core/dispose.js'
import { PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET, PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT } from '../shaders/ending-plate.js'
import { createEndingExplosion } from '../shaders/ending-explosion.js'

export const CORE_LIGHT_INTENSITY = 1.5
export const CORE_LIGHT_RANGE = 4
export const RIVER_TARGET_NDC = Object.freeze({x:0.20,y:-0.62})
export const GORGE_FLOOR_Y = -81.25 // 78 m below the aligned rail datum (-3.25).
export const CORE_GRAVITY = -9.8
// Solved against the real Throw hand at release and C's unchanged river ray:
// T = sqrt(2 * (horizontalRange * tan(50 degrees) - heightDifference) / 9.8).
// 25–40 degrees enters C through its side; this lob enters through its top.
export const CORE_FLIGHT_SECONDS = 5.271405625686219

export function createEndingCore(scene) {
  const root=new THREE.Group();root.name='ending-core-effects';scene.add(root)
  const payload=new THREE.Group();payload.name='ending-chrono-core';root.add(payload)
  // Faithful, independently owned copy of moving-heist.js's private createChronoCore.
  const design=new THREE.Group();design.name='chrono-core';design.scale.setScalar(0.13)
  design.position.y=-0.13*0.83;payload.add(design)
  const brass=new THREE.MeshStandardMaterial({color:0xb08d3f,roughness:0.28,metalness:0.92})
  function part(name,geometry,material,y) {
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.y=y;design.add(mesh);return mesh
  }
  part('chrono-core-base',new THREE.CylinderGeometry(0.5,0.62,0.16,18),brass,0.08)
  part('chrono-core-column',new THREE.CylinderGeometry(0.2,0.28,0.9,18),brass,0.56)
  part('chrono-core-cradle',new THREE.TorusGeometry(0.34,0.045,10,28),brass,1.12).rotation.x=Math.PI/2
  const energy=createChronoFieldMaterial({baseColor:0x0284c7,glowColor:0x38bdf8,opacity:0.92})
  const haloEnergy=createChronoFieldMaterial({baseColor:0x38bdf8,glowColor:0xa5f3fc,opacity:0.88,doubleSided:true})
  const orb=part('chrono-core-orb',new THREE.IcosahedronGeometry(0.32,2),energy,1.34)
  const halo=part('chrono-core-halo',new THREE.TorusGeometry(0.5,0.022,8,36),haloEnergy,1.34)
  halo.rotation.x=Math.PI/2.4
  const ringA=part('chrono-core-ring-a',new THREE.TorusGeometry(0.5,0.018,8,40),brass,1.34)
  const ringB=part('chrono-core-ring-b',new THREE.TorusGeometry(0.58,0.018,8,40),brass,1.34)
  design.userData.shaderMats=[energy,haloEnergy]
  const pixels=new Uint8Array(32*32*4)
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
    const radius=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),i=(y*32+x)*4
    pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*Math.max(0,1-radius)**3)
  }
  const map=new THREE.DataTexture(pixels,32,32);map.needsUpdate=true
  const glowMaterial=new THREE.SpriteMaterial({map,color:0x54dcff,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})
  const glow=new THREE.Sprite(glowMaterial);glow.geometry=glow.geometry.clone();glow.scale.setScalar(0.8);payload.add(glow)
  // This light exists for the full level, even when the core is hidden.
  const light=new THREE.PointLight(0x54dcff,0,CORE_LIGHT_RANGE,2)
  light.name='ending-core-light';light.castShadow=false;root.add(light)
  const camera=new THREE.PerspectiveCamera(PLATE_CAMERA_FOV,PLATE_CAMERA_ASPECT,0.1,1800)
  camera.position.copy(PLATE_CAMERA_POSITION);camera.lookAt(PLATE_CAMERA_TARGET);camera.updateMatrixWorld(true)
  const ray=new THREE.Raycaster();ray.setFromCamera(RIVER_TARGET_NDC,camera)
  const impact=new THREE.Vector3()
  ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-GORGE_FLOOR_Y),impact)
  const explosion=createEndingExplosion();root.add(explosion.mesh);explosion.configure(impact,camera)
  function setImpactCamera(shot) {
    camera.copy(shot);camera.updateMatrixWorld(true)
    ray.setFromCamera(RIVER_TARGET_NDC,camera)
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-GORGE_FLOOR_Y),impact)
    explosion.configure(impact,camera)
  }
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
  let flight=-1,clock=0,disposed=false,flightDuration=CORE_FLIGHT_SECONDS
  function pointAt(t,target) {return target.copy(start).addScaledVector(velocity,t).addScaledVector(gravity,t*t/2)}
  function reset() {
    root.attach(payload);payload.visible=false;trail.visible=false;explosion.update(-1)
    light.intensity=0;flight=-1
  }
  function hold(hand) {
    hand.add(payload);payload.position.set(0,0,0);payload.quaternion.identity();payload.scale.setScalar(1)
    hand.updateWorldMatrix(true,false)
    hand.getWorldScale(payload.scale)
    payload.scale.set(1/payload.scale.x,1/payload.scale.y,1/payload.scale.z)
    payload.visible=true;flight=-1
  }
  function launch(position,duration=CORE_FLIGHT_SECONDS) {
    flightDuration=duration
    start.copy(position);root.attach(payload)
    velocity.copy(impact).sub(start).addScaledVector(gravity,-duration*duration/2).divideScalar(duration)
    flight=0;payload.visible=true;trail.visible=true;trailMaterial.uniforms.uVisible.value=1
    pointAt(0,payload.position)
  }
  function update(delta,flightTime=-1,explosionTime=-1) {
    clock+=Math.max(0,delta)
    for(const material of design.userData.shaderMats) {
      material.uniforms.uTime.value=clock;material.uniforms.uIntensity.value=0.25
    }
    orb.rotation.set(clock*0.3,clock*0.7,0);orb.position.y=1.34+Math.sin(clock*1.6)*0.05
    halo.rotation.z=clock*1.1;halo.position.y=orb.position.y
    ringA.rotation.set(0.4,clock*0.6,0);ringB.rotation.x=clock*0.45
    if(flightTime>=0) {
      flight=Math.min(flightTime,flightDuration);pointAt(flight,payload.position)
      trailMaterial.uniforms.uFlight.value=flight
    }
    payload.updateWorldMatrix(true,false);payload.getWorldPosition(light.position)
    light.intensity=payload.visible && explosionTime<0 ? CORE_LIGHT_INTENSITY*(0.92+0.08*Math.sin(clock*2.3)) : 0
    explosion.update(explosionTime)
    if(explosionTime>=0){payload.visible=false;trail.visible=false}
  }
  reset()
  return {root,payload,light,trail,explosion,impact,start,velocity,gravity,camera,design,setImpactCamera,hold,launch,pointAt,update,reset,
    get flight(){return flight},
    get flightDuration(){return flightDuration},
    dispose(){if(disposed)return;disposed=true;root.attach(payload);root.removeFromParent();disposeObject(root)}}
}

import * as THREE from 'three'
import plateUrl from '../assets/textures/backdrop/ending-plate.jpg'
import doorUrl from '../assets/textures/backdrop/ending-plate-door.jpg'
import gorgeUrl from '../assets/textures/backdrop/ending-plate-gorge.jpg'

export const PLATE_CAMERA_POSITION = new THREE.Vector3(47.1, 19.43, -3.01)
export const PLATE_CAMERA_TARGET = new THREE.Vector3(1.09, -1.13, 9.74)
export const PLATE_CAMERA_FOV = 39.5
export const PLATE_CAMERA_ASPECT = 1671 / 941
export const DOOR_PLATE_WIDTH = 1322
export const DOOR_PLATE_HEIGHT = 1190
export const DOOR_PLATE_FOV = 74

export function createEndingPlate(onReady) {
  const camera = new THREE.PerspectiveCamera(PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  camera.position.copy(PLATE_CAMERA_POSITION); camera.lookAt(PLATE_CAMERA_TARGET); camera.updateMatrixWorld(true)
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const doorCamera = new THREE.PerspectiveCamera(DOOR_PLATE_FOV,DOOR_PLATE_WIDTH/DOOR_PLATE_HEIGHT,0.1,1800)
  const nativeUv=[new THREE.Matrix3(),new THREE.Matrix3(),new THREE.Matrix3()]
  let activeIndex=0,doorConfigured=false
  function configureDoor(shot) {
    doorCamera.position.copy(shot.position);doorCamera.quaternion.copy(shot.quaternion)
    doorCamera.setViewOffset(DOOR_PLATE_WIDTH,DOOR_PLATE_HEIGHT,
      0,-DOOR_PLATE_HEIGHT*0.15,DOOR_PLATE_WIDTH,DOOR_PLATE_HEIGHT)
    doorCamera.updateMatrixWorld(true)
    const e=new THREE.Matrix4().multiplyMatrices(doorCamera.projectionMatrix,shot.projectionMatrixInverse).elements
    nativeUv[1].set(e[0],e[4],e[12],e[1],e[5],e[13],0,0,1)
    doorConfigured=true
  }
  let ready = false, disposed = false
  let loadedCount = 0
  const textures = [plateUrl, doorUrl, gorgeUrl].map(url => new THREE.TextureLoader().load(url, loaded => {
    if (disposed) return
    ready = ++loadedCount === 3
    onReady?.(loaded)
  }))
  const texture = textures[0]
  for (const item of textures) {
    item.colorSpace = THREE.SRGBColorSpace
    item.minFilter = THREE.LinearFilter
    item.magFilter = THREE.LinearFilter
    item.generateMipmaps = false
  }
  const material = new THREE.ShaderMaterial({
    name: 'ending-projected-plate',
    uniforms: { uPlate: { value: texture }, uIncoming: { value: texture }, uPlateMix: { value: 0 },
      uWhip: { value: 0 }, uWhipDirection: { value: 1 }, uShot: { value: 0 },
      uOutgoingUv:{value:nativeUv[0]},uIncomingUv:{value:nativeUv[0]},
      uPlateViewProj: { value: viewProjection },
      uOutsideColor: { value: new THREE.Color(0x0d1426) }, uTime: { value: 0 }, uFlow: { value: 1 } },
    side: THREE.BackSide, toneMapped: false, fog: false, depthWrite: false, depthTest: false,
    vertexShader: `
      varying vec3 vWorld;
      varying vec4 vClip;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        vClip = gl_Position;
      }`,
    fragmentShader: `
      uniform sampler2D uPlate;
      uniform sampler2D uIncoming;
      uniform float uPlateMix;
      uniform float uWhip;
      uniform float uWhipDirection;
      uniform float uShot;
      uniform mat4 uPlateViewProj;
      uniform mat3 uOutgoingUv;
      uniform mat3 uIncomingUv;
      uniform vec3 uOutsideColor;
      uniform float uTime;
      uniform float uFlow;
      varying vec3 vWorld;
      varying vec4 vClip;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
          mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec4 projected = uPlateViewProj * vec4(vWorld, 1.0);
        vec3 color = uOutsideColor;
        if (projected.w > 0.0) {
          vec2 uv = projected.xy / projected.w * 0.5 + 0.5;
          if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            vec3 painting = vec3(0.0);
            for (int i = 0; i < 16; i++) {
              float offset = (float(i) / 15.0 - 0.25) * uWhip * uWhipDirection;
              vec2 outgoingUv=uv,incomingUv=uv;
              if(uWhip>0.00001) {
                vec3 screen=vec3(vClip.xy/vClip.w+vec2(0.0,offset*2.0),1.0);
                outgoingUv=(uOutgoingUv*screen).xy*0.5+0.5;
                incomingUv=(uIncomingUv*screen).xy*0.5+0.5;
              }
              painting += mix(texture2D(uPlate,clamp(outgoingUv,vec2(0.001),vec2(0.999))).rgb,
                texture2D(uIncoming,clamp(incomingUv,vec2(0.001),vec2(0.999))).rgb,uPlateMix)/16.0;
            }
            // Threshold in display colour; uPlate is decoded from sRGB by the texture sampler.
            vec3 displayColor = pow(max(painting, vec3(0.0)), vec3(1.0 / 2.2));
            float luma = dot(displayColor, vec3(0.2126, 0.7152, 0.0722));
            float river = smoothstep(0.15, 0.22, displayColor.b - displayColor.r) * smoothstep(0.35, 0.45, luma);
            // Exclude the moon, stars and the left foreground from the colour mask.
            river *= smoothstep(0.45, 0.5, uv.x) * (1.0 - smoothstep(0.9, 0.95, uv.x));
            river *= smoothstep(0.0, 0.03, uv.y) * (1.0 - smoothstep(0.64, 0.7, uv.y));
            if (uShot > 1.5) river *= 1.0 - smoothstep(0.48, 0.58, uv.y);
            if (uShot > 0.5 && uShot < 1.5) river = 0.0;
            float streak = smoothstep(0.65, 0.9, noise(vec2(uv.x * 650.0, uv.y * 150.0 + uTime * 0.7)));
            // Clock advancement is scaled by uFlow; zero freezes the existing shimmer phase.
            painting += vec3(0.62396, 0.7454, 1.0) * river * streak * 0.018;
            float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
            color = mix(uOutsideColor, painting, mix(smoothstep(0.0, 0.03, edge), 1.0, step(0.001, uWhip)));
          }
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 24), material)
  mesh.name = 'ending-plate-sphere'; mesh.position.copy(PLATE_CAMERA_POSITION)
  mesh.renderOrder = -10000; mesh.frustumCulled = false
  function setFov(value) {
    camera.fov = THREE.MathUtils.clamp(value, 10, 100)
    camera.updateProjectionMatrix()
    const projector=activeIndex===1&&doorConfigured?doorCamera:camera
    viewProjection.multiplyMatrices(projector.projectionMatrix,projector.matrixWorldInverse)
    return camera.fov
  }
  function setShot(shot, index) {
    activeIndex=index
    camera.copy(shot); camera.updateMatrixWorld(true)
    const projector=index===1&&doorConfigured?doorCamera:camera
    viewProjection.multiplyMatrices(projector.projectionMatrix,projector.matrixWorldInverse)
    mesh.position.copy(camera.position)
    material.uniforms.uPlate.value = textures[index]
    material.uniforms.uIncoming.value = textures[index]
    material.uniforms.uShot.value = index
    material.uniforms.uPlateMix.value = 0
    material.uniforms.uWhip.value = 0
  }
  function setWhip(outgoing, incoming, mix, strength, direction) {
    material.uniforms.uPlate.value = textures[outgoing]
    material.uniforms.uIncoming.value = textures[incoming]
    material.uniforms.uPlateMix.value = mix
    material.uniforms.uWhip.value = strength
    material.uniforms.uWhipDirection.value = direction
    material.uniforms.uOutgoingUv.value=nativeUv[outgoing]
    material.uniforms.uIncomingUv.value=nativeUv[incoming]
  }
  function updateRenderPose(shot) {
    camera.position.copy(shot.position);camera.quaternion.copy(shot.quaternion);camera.updateMatrixWorld(true)
    mesh.position.copy(shot.position)
  }
  return { mesh, camera, doorCamera, configureDoor, updateRenderPose, texture, textures, material, setShot, setWhip, get ready() { return ready },
    setFov,
    update(delta) { material.uniforms.uTime.value += Math.max(0, delta) * material.uniforms.uFlow.value },
    dispose() {
      if (disposed) return
      disposed = true; activeIndex=0
      camera.view=null;camera.aspect=PLATE_CAMERA_ASPECT;camera.position.copy(PLATE_CAMERA_POSITION)
      camera.lookAt(PLATE_CAMERA_TARGET);camera.updateMatrixWorld(true);setFov(PLATE_CAMERA_FOV)
      mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); textures.forEach(item => item.dispose())
    } }
}

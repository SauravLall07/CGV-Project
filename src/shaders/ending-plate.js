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

const paintingUrls = [plateUrl, doorUrl, gorgeUrl]
let prefetchedImages = null, prefetchPromise = null
export function prefetchEndingPaintings() {
  if (!prefetchPromise) {
    const images = [null, null, null]
    prefetchedImages = images
    prefetchPromise = Promise.all(paintingUrls.map((url, index) =>
      new THREE.ImageLoader().loadAsync(url).then(image => { images[index] = image })))
      .catch(error => { prefetchPromise = null; throw error })
  }
  return prefetchPromise
}

export function createEndingPlate(onReady) {
  const camera = new THREE.PerspectiveCamera(PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  camera.position.copy(PLATE_CAMERA_POSITION); camera.lookAt(PLATE_CAMERA_TARGET); camera.updateMatrixWorld(true)
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const initialCamera=camera.clone(false),initialProjection=viewProjection.clone()
  const doorCamera = new THREE.PerspectiveCamera(DOOR_PLATE_FOV,DOOR_PLATE_WIDTH/DOOR_PLATE_HEIGHT,0.1,1800)
  let activeIndex=0,doorConfigured=false
  function configureDoor(shot) {
    doorCamera.position.copy(shot.position);doorCamera.quaternion.copy(shot.quaternion);doorCamera.up.copy(shot.up)
    doorCamera.setViewOffset(DOOR_PLATE_WIDTH,DOOR_PLATE_HEIGHT,
      0,-DOOR_PLATE_HEIGHT*0.15,DOOR_PLATE_WIDTH,DOOR_PLATE_HEIGHT)
    doorCamera.updateMatrixWorld(true)
    doorConfigured=true
  }
  let ready = false, disposed = false
  let loadedCount = 0
  const images = prefetchedImages
  prefetchedImages = null; prefetchPromise = null
  const loaded = texture => {
    if (disposed) return
    ready = ++loadedCount === 3
    onReady?.(texture)
  }
  const textures = paintingUrls.map((url, index) => {
    if (!images?.[index]) return new THREE.TextureLoader().load(url, loaded)
    const texture = new THREE.Texture(images[index]); texture.needsUpdate = true
    return texture
  })
  const texture = textures[0]
  for (let index = 0; index < textures.length; index++) {
    const item = textures[index]
    item.colorSpace = THREE.SRGBColorSpace
    item.minFilter = THREE.LinearFilter
    item.magFilter = THREE.LinearFilter
    item.generateMipmaps = false
    if (images?.[index]) loaded(item)
  }
  const material = new THREE.ShaderMaterial({
    name: 'ending-projected-plate',
    uniforms: { uPlate: { value: texture }, uShot: { value: 0 },
      uPlateViewProj: { value: viewProjection },
      uOutsideColor: { value: new THREE.Color(0x0d1426) }, uTime: { value: 0 }, uFlow: { value: 1 } },
    side: THREE.BackSide, toneMapped: false, fog: false, depthWrite: false, depthTest: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D uPlate;
      uniform float uShot;
      uniform mat4 uPlateViewProj;
      uniform vec3 uOutsideColor;
      uniform float uTime;
      uniform float uFlow;
      varying vec3 vWorld;
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
            vec3 painting = texture2D(uPlate,uv).rgb;
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
            color = mix(uOutsideColor, painting, smoothstep(0.0, 0.03, edge));
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
    material.uniforms.uShot.value = index
  }
  function updateRenderPose(shot) {
    camera.position.copy(shot.position);camera.quaternion.copy(shot.quaternion);camera.updateMatrixWorld(true)
    mesh.position.copy(shot.position)
  }
  return { mesh, camera, doorCamera, configureDoor, updateRenderPose, texture, textures, material, setShot, get ready() { return ready },
    setFov,
    update(delta) { material.uniforms.uTime.value += Math.max(0, delta) * material.uniforms.uFlow.value },
    dispose() {
      if (disposed) return
      disposed = true; activeIndex=0
      camera.copy(initialCamera,false);viewProjection.copy(initialProjection)
      mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); textures.forEach(item => item.dispose())
    } }
}

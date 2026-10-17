import * as THREE from 'three'
import plateUrl from '../assets/textures/backdrop/ending-plate.jpg'

export const PLATE_CAMERA_POSITION = new THREE.Vector3(47.1, 19.43, -3.01)
export const PLATE_CAMERA_TARGET = new THREE.Vector3(1.09, -1.13, 9.74)
export const PLATE_CAMERA_FOV = 39.5
export const PLATE_CAMERA_ASPECT = 1671 / 941

export function createEndingPlate(onReady) {
  const camera = new THREE.PerspectiveCamera(PLATE_CAMERA_FOV, PLATE_CAMERA_ASPECT, 0.1, 1800)
  camera.position.copy(PLATE_CAMERA_POSITION); camera.lookAt(PLATE_CAMERA_TARGET); camera.updateMatrixWorld(true)
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  let ready = false, disposed = false
  const texture = new THREE.TextureLoader().load(plateUrl, loaded => {
    if (disposed) return
    ready = true
    onReady?.(loaded)
  })
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  const material = new THREE.ShaderMaterial({
    name: 'ending-projected-plate',
    uniforms: { uPlate: { value: texture }, uPlateViewProj: { value: viewProjection },
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
            vec3 painting = texture2D(uPlate, uv).rgb;
            // Threshold in display colour; uPlate is decoded from sRGB by the texture sampler.
            vec3 displayColor = pow(max(painting, vec3(0.0)), vec3(1.0 / 2.2));
            float luma = dot(displayColor, vec3(0.2126, 0.7152, 0.0722));
            float river = smoothstep(0.15, 0.22, displayColor.b - displayColor.r) * smoothstep(0.35, 0.45, luma);
            // Exclude the moon, stars and the left foreground from the colour mask.
            river *= smoothstep(0.45, 0.5, uv.x) * (1.0 - smoothstep(0.9, 0.95, uv.x));
            river *= smoothstep(0.0, 0.03, uv.y) * (1.0 - smoothstep(0.64, 0.7, uv.y));
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
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    return camera.fov
  }
  return { mesh, camera, texture, get ready() { return ready },
    setFov,
    update(delta) { material.uniforms.uTime.value += Math.max(0, delta) * material.uniforms.uFlow.value },
    dispose() {
      if (disposed) return
      disposed = true; setFov(PLATE_CAMERA_FOV)
      mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose()
    } }
}

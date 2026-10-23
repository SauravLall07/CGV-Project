import * as THREE from 'three'

export const FILM_GRAIN = 0.018
export const FILM_VIGNETTE = 0.28
export const FILM_FLICKER = 0.015
export const FILM_RAIN = 0.035
export const CARD_RAIN = 0.06

// Both images have independent cover and motion transforms, so transitions
// remain correctly framed even when future beats use different image sizes.
export function createStoryFilm() {
  const uniforms = {
    uTexA: { value: null }, uTexB: { value: null },
    uSizeA: { value: new THREE.Vector2(16, 9) },
    uSizeB: { value: new THREE.Vector2(16, 9) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBand: { value: new THREE.Vector2(0.20, 0.93) },
    uImage: { value: 1 }, uRain: { value: FILM_RAIN },
    uPanA: { value: new THREE.Vector2() },
    uPanB: { value: new THREE.Vector2() },
    uZoomA: { value: 1 }, uZoomB: { value: 1 },
    uMix: { value: 0 }, uTime: { value: 0 }, uFade: { value: 0 }
  }
  const material = new THREE.ShaderMaterial({
    name: 'story-film', uniforms, depthTest: false, depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexA, uTexB;
      uniform vec2 uSizeA, uSizeB, uResolution, uPanA, uPanB;
      uniform vec2 uBand;
      uniform float uImage, uRain;
      uniform float uZoomA, uZoomB, uMix, uTime, uFade;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      vec2 cover(vec2 size, float zoom, vec2 pan) {
        float screenAspect = uResolution.x / max(uResolution.y * (uBand.y - uBand.x), 1.0);
        float imageAspect = size.x / max(size.y, 1.0);
        vec2 fit = vec2(min(1.0, screenAspect / imageAspect),
                        min(1.0, imageAspect / screenAspect));
        // Pan is limited to the available crop; no border can be exposed.
        vec2 extent = fit / max(zoom, 1.0);
        vec2 bandUv = vec2(vUv.x, (vUv.y - uBand.x) / (uBand.y - uBand.x));
        return (bandUv - 0.5) * extent + 0.5
          + clamp(pan, -(1.0 - extent) * 0.5, (1.0 - extent) * 0.5);
      }
      void main() {
        if (vUv.y < uBand.x || vUv.y > uBand.y) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        vec3 a = texture2D(uTexA, cover(uSizeA, uZoomA, uPanA)).rgb;
        vec3 b = texture2D(uTexB, cover(uSizeB, uZoomB, uPanB)).rgb;
        vec3 color = mix(a, b, clamp(uMix, 0.0, 1.0)) * uImage;
        float grain = hash(floor(vUv * uResolution) + floor(uTime * 24.0)) - 0.5;
        float vignette = smoothstep(0.15, 0.72, length(vUv - 0.5));
        float flicker = sin(uTime * 17.0) * sin(uTime * 7.3);
        vec2 rainUv = vec2(vUv.x + vUv.y * 0.28, vUv.y);
        float lane = floor(rainUv.x * 180.0);
        float streak = pow(max(0.0, 1.0 - abs(fract(rainUv.x * 180.0) - 0.5) * 2.0), 12.0);
        streak *= step(0.78, hash(vec2(lane, 3.0)));
        streak *= pow(fract(rainUv.y * 5.0 + uTime * 0.8 + hash(vec2(lane, 7.0))), 8.0);
        color *= (1.0 - ${FILM_VIGNETTE} * vignette) * (1.0 + ${FILM_FLICKER} * flicker);
        color += grain * ${FILM_GRAIN} + streak * uRain;
        gl_FragColor = vec4(max(color, vec3(0.0)) * clamp(uFade, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }
    `
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  let disposed = false
  return {
    scene, camera, uniforms, material, geometry,
    dispose() {
      if (disposed) return
      disposed = true
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    }
  }
}

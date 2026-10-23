import * as THREE from 'three'

export const FILM_GRAIN = 0.010
export const FILM_VIGNETTE = 0.28
export const FILM_FLICKER = 0.010
export const FILM_RAIN = 0.025
export const CARD_RAIN = 0.06
export const SHARPEN = 0.35

// Both images have independent cover and motion transforms, so transitions
// remain correctly framed even when future beats use different image sizes.
export function createStoryFilm() {
  const uniforms = {
    uTexA: { value: null }, uTexB: { value: null },
    uSizeA: { value: new THREE.Vector2(16, 9) },
    uSizeB: { value: new THREE.Vector2(16, 9) },
    uSharpen: { value: SHARPEN },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBand: { value: new THREE.Vector2(0, 1) },
    uPaper: { value: null }, uTitle: { value: null },
    uPaperScale: { value: 0 }, uPaperAngle: { value: 0 }, uPaperOpacity: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uRipple: { value: -1 }, uTitleOpacity: { value: 0 }, uTitleDistortion: { value: 0 },
    uDissolve: { value: 0 },
    uImage: { value: 1 }, uRain: { value: FILM_RAIN },
    uPanA: { value: new THREE.Vector2() },
    uPanB: { value: new THREE.Vector2() },
    uZoomA: { value: 1 }, uZoomB: { value: 1 },
    uMix: { value: 0 }, uTime: { value: 0 }, uFade: { value: 0 }
  }
  const material = new THREE.ShaderMaterial({
    name: 'story-film', uniforms, depthTest: false, depthWrite: false,
    toneMapped: false, transparent: true,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexA, uTexB, uPaper, uTitle;
      uniform float uPaperScale, uPaperAngle, uPaperOpacity, uRipple;
      uniform float uTitleOpacity, uTitleDistortion, uDissolve;
      uniform vec2 uShake;
      uniform vec2 uSizeA, uSizeB, uResolution, uPanA, uPanB;
      uniform vec2 uBand;
      uniform float uImage, uRain;
      uniform float uZoomA, uZoomB, uMix, uTime, uFade;
      uniform float uSharpen;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      vec3 sharpen(sampler2D image, vec2 uv, vec2 size) {
        vec2 texel = 1.0 / max(size, vec2(1.0));
        vec3 center = texture2D(image, uv).rgb;
        vec3 left = texture2D(image, uv - vec2(texel.x, 0.0)).rgb;
        vec3 right = texture2D(image, uv + vec2(texel.x, 0.0)).rgb;
        vec3 down = texture2D(image, uv - vec2(0.0, texel.y)).rgb;
        vec3 up = texture2D(image, uv + vec2(0.0, texel.y)).rgb;
        vec3 blur = (left + right + down + up) * 0.25;
        // Clamp to the sampled neighbourhood to suppress bright/dark halos.
        vec3 low = min(center, min(min(left, right), min(down, up)));
        vec3 high = max(center, max(max(left, right), max(down, up)));
        return clamp(center + uSharpen * (center - blur), low, high);
      }
      vec2 cover(vec2 uv, vec2 size, float zoom, vec2 pan) {
        float screenAspect = uResolution.x / max(uResolution.y * (uBand.y - uBand.x), 1.0);
        float imageAspect = size.x / max(size.y, 1.0);
        vec2 fit = vec2(min(1.0, screenAspect / imageAspect),
                        min(1.0, imageAspect / screenAspect));
        // Pan is limited to the available crop; no border can be exposed.
        vec2 extent = fit / max(zoom, 1.0);
        vec2 bandUv = vec2(uv.x, (uv.y - uBand.x) / (uBand.y - uBand.x));
        return (bandUv - 0.5) * extent + 0.5
          + clamp(pan, -(1.0 - extent) * 0.5, (1.0 - extent) * 0.5);
      }
      void main() {
        if (vUv.y < uBand.x || vUv.y > uBand.y) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 centred = (vUv - 0.5) * vec2(aspect, 1.0);
        float radius = length(centred);
        float ring = uRipple < 0.0 ? 0.0 : exp(-pow((radius - uRipple * 1.35) / 0.045, 2.0));
        vec2 offset = normalize(centred + 0.0001) * ring * 0.025 / vec2(aspect, 1.0);
        vec2 imageUv = vUv + offset;
        vec3 a = sharpen(uTexA, cover(imageUv, uSizeA, uZoomA, uPanA), uSizeA);
        vec2 bUv = cover(imageUv, uSizeB, uZoomB, uPanB);
        vec3 b = sharpen(uTexB, bUv, uSizeB);
        b.r = texture2D(uTexB, bUv + offset * 0.15).r;
        b.b = texture2D(uTexB, bUv - offset * 0.15).b;
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
        // Screen-space subtitle grade. Use increasing smoothstep edges:
        // 1-smoothstep(0,.38,y) is the defined equivalent of the desired ramp.
        color *= mix(1.0, 0.25, 1.0 - smoothstep(0.0, 0.38, vUv.y));
        if (uPaperOpacity > 0.0) {
          float cs = cos(uPaperAngle), sn = sin(uPaperAngle);
          vec2 p = mat2(cs, -sn, sn, cs) * (centred + uShake);
          vec2 paperUv = p / (max(uPaperScale, 0.0001) * vec2(1024.0/1400.0, 1.0)) + 0.5;
          if (all(greaterThanEqual(paperUv, vec2(0.0))) && all(lessThanEqual(paperUv, vec2(1.0)))) {
            color = mix(color, texture2D(uPaper, paperUv).rgb, uPaperOpacity);
          }
        }
        // #38BDF8 converted to linear working colour (textures decode sRGB).
        vec3 blue = vec3(0.0395, 0.5089, 0.9387);
        color += blue * ring * 0.65;
        vec2 titleUv = (vUv - 0.5) / vec2(0.94, 0.94 * aspect / 4.0) + 0.5;
        titleUv += vec2(sin(titleUv.y * 42.0 + uTime * 8.0), cos(titleUv.x * 25.0)) * uTitleDistortion * 0.025;
        if (uTitleOpacity > 0.0 && all(greaterThanEqual(titleUv, vec2(0.0))) && all(lessThanEqual(titleUv, vec2(1.0)))) {
          vec4 title = texture2D(uTitle, titleUv);
          color = mix(color, title.rgb, title.a * uTitleOpacity);
        }
        float dissolveNoise = hash(floor(vUv * vec2(340.0, 190.0)));
        float threshold = uDissolve * 1.06 - 0.03;
        float alpha = uDissolve <= 0.0 ? 1.0 : smoothstep(threshold - 0.025, threshold + 0.025, dissolveNoise);
        if (uDissolve >= 1.0) alpha = 0.0;
        float edge = uDissolve > 0.0 ? (1.0 - smoothstep(0.0, 0.045, abs(dissolveNoise - threshold))) : 0.0;
        color += blue * edge * 0.7;
        gl_FragColor = vec4(max(color, vec3(0.0)) * clamp(uFade, 0.0, 1.0), alpha);
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

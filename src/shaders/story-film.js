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
    uPaper: { value: null }, uPaperSize: { value: new THREE.Vector2(1024, 1536) },
    uPaperShadowOffset: { value: new THREE.Vector2(0.012, -0.014) },
    uPaperShadowBlur: { value: 0.025 }, uPaperShadowOpacity: { value: 0.45 },
    uPaperFalloff: { value: 0.06 },
    uPaperScale: { value: 0 }, uPaperAngle: { value: 0 }, uPaperOpacity: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uOpacity: { value: 1 },
    uTrain: { value: null }, uTrainSize: { value: new THREE.Vector2(1536, 1024) },
    uTrainCenter: { value: new THREE.Vector2(-2, 0.42) },
    uTrainHeight: { value: 0 }, uTrainBlur: { value: 0 }, uTrainRattle: { value: 0 },
    uSteam: { value: 0 }, uReveal: { value: 0 },
    uImage: { value: 1 }, uRain: { value: FILM_RAIN },
    uPanA: { value: new THREE.Vector2() },
    uPanB: { value: new THREE.Vector2() },
    uZoomA: { value: 1 }, uZoomB: { value: 1 },
    uMix: { value: 0 }, uTime: { value: 0 }, uFade: { value: 0 }
  }
  const material = new THREE.ShaderMaterial({
    name: 'story-film', uniforms, depthTest: false, depthWrite: false,
    toneMapped: false, transparent: true, premultipliedAlpha: true,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexA, uTexB, uPaper;
      uniform float uPaperScale, uPaperAngle, uPaperOpacity, uOpacity;
      uniform vec2 uShake, uPaperSize, uPaperShadowOffset;
      uniform float uPaperShadowBlur, uPaperShadowOpacity, uPaperFalloff;
      uniform vec2 uSizeA, uSizeB, uResolution, uPanA, uPanB;
      uniform vec2 uBand;
      uniform float uImage, uRain;
      uniform float uZoomA, uZoomB, uMix, uTime, uFade;
      uniform float uSharpen;
      uniform sampler2D uTrain;
      uniform vec2 uTrainSize, uTrainCenter;
      uniform float uTrainHeight, uTrainBlur, uTrainRattle, uSteam, uReveal;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float cloudNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }
      float steamCloud(vec2 p) {
        float cloud = 0.0, amplitude = 0.5;
        for (int octave = 0; octave < 4; octave++) {
          cloud += amplitude * cloudNoise(p);
          p = p * 2.03 + vec2(7.1, 3.7); amplitude *= 0.5;
        }
        return cloud;
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
        vec2 imageUv = vUv;
        vec3 a = sharpen(uTexA, cover(imageUv, uSizeA, uZoomA, uPanA), uSizeA);
        vec2 bUv = cover(imageUv, uSizeB, uZoomB, uPanB);
        vec3 b = sharpen(uTexB, bUv, uSizeB);
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
          vec2 paperExtent = max(uPaperScale, 0.0001) * vec2(uPaperSize.x / uPaperSize.y, 1.0);
          vec2 shadowP = mat2(cs, -sn, sn, cs) * (centred + uShake - uPaperShadowOffset);
          vec2 d = abs(shadowP) - paperExtent * 0.5;
          float distance = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
          float shadow = 1.0 - smoothstep(-uPaperShadowBlur, uPaperShadowBlur, distance);
          color *= 1.0 - shadow * uPaperShadowOpacity * uPaperOpacity;
          vec2 paperUv = p / paperExtent + 0.5;
          if (all(greaterThanEqual(paperUv, vec2(0.0))) && all(lessThanEqual(paperUv, vec2(1.0)))) {
            // Composited AFTER the panel grade, so subtitles cannot darken
            // the newspaper. This is only a gentle centre-to-edge falloff.
            vec3 paper = texture2D(uPaper, paperUv).rgb;
            paper *= 1.0 - uPaperFalloff * smoothstep(0.0, 0.72, length(paperUv - 0.5));
            color = mix(color, paper, uPaperOpacity);
          }
        }
        if (uTrainHeight > 0.0) {
          vec2 extent = vec2(uTrainHeight * uTrainSize.x / uTrainSize.y / aspect, uTrainHeight);
          vec2 trainUv = (vUv - uTrainCenter - vec2(0.0, uTrainRattle / uResolution.y)) / extent + 0.5;
          vec4 train = vec4(0.0);
          // Premultiplied PNG upload and accumulation keep transparent edges clean.
          for (int tap = 0; tap < 8; tap++) {
            vec2 sampleUv = trainUv + vec2((float(tap) / 7.0 - 0.5) * uTrainBlur / extent.x, 0.0);
            if (all(greaterThanEqual(sampleUv, vec2(0.0))) && all(lessThanEqual(sampleUv, vec2(1.0))))
              train += texture2D(uTrain, sampleUv) * 0.125;
          }
          color = color * (1.0 - train.a) + train.rgb;
        }
        float cloud = 0.5;
        if (uSteam > 0.0) cloud = steamCloud(vec2(vUv.x * aspect * 3.0 + uTime * 0.13, vUv.y * 3.0 - uTime * 0.28));
        // Soft moving cloud front; the explicit full-cover endpoint is opaque
        // at EVERY pixel before main.js switches scenes behind this quad.
        float front = uSteam * 1.65 - vUv.y + (cloud - 0.5) * 0.35;
        float steamAlpha = mix(smoothstep(-0.18, 0.18, front) * smoothstep(0.0, 0.08, uSteam), 1.0, step(1.0, uSteam));
        vec3 steamColor = mix(vec3(0.48, 0.51, 0.54), vec3(0.88, 0.89, 0.90), cloud);
        color = mix(color, steamColor, steamAlpha);
        float alpha = uOpacity * mix(1.0, steamAlpha, uReveal);
        if (uReveal > 0.5) color = steamColor;
        gl_FragColor = vec4(max(color, vec3(0.0)) * clamp(uFade, 0.0, 1.0), alpha);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
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

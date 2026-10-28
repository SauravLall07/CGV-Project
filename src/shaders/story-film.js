import * as THREE from 'three'

export const FILM_GRAIN = 0.010
export const FILM_VIGNETTE = 0.28
export const FILM_FLICKER = 0.010
export const FILM_RAIN = 0.025
export const CARD_RAIN = 0.06
export const SHARPEN = 0.35

// Panel effects for later story beats (Level 2 → 3). uFx = 0 is the intro
// look exactly; every effect term below is multiplied out when it is 0.
export const FX_NONE = 0, FX_TREMOR = 1, FX_ROCKSLIDE = 2, FX_TIMEWARP = 3
export const RING_DISPLACE = 0.006
export const RING_GLOW = 0.15
export const RING_WIDTH = 0.045
export const WARP_DISPLACE = 0.007     // blue cracks flow (only blue pixels move)
export const WARP_FLOW_SPEED = 1.4
export const WARP_GHOST = 0.003       // faint doubled crack, "slipping in time"
export const WARP_GHOST_OPACITY = 0.25
export const WARP_GLOW = 0.75         // soft blue halo around the cracks
export const WARP_CORE = 0.35         // brightening of the cracks themselves
export const WARP_HALO_RADIUS = 0.006 // image-uv, two rings of 8 taps (r, 2r)
export const WARP_ENERGY_SPEED = 5.0  // bright bands travelling along the cracks
export const SURGE_HALO_SPREAD = 3.0  // crack halo radius grows ×(1+spread) at the surge peak
const CHRONO_BLUE = 'vec3(0.2196, 0.7412, 0.9725)' // #38BDF8
const glsl = value => Number(value).toFixed(5)

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
    uSteam: { value: 0 }, uSmokeClear: { value: 0 }, uSteamFront: { value: 0 },
    uImage: { value: 1 }, uRain: { value: FILM_RAIN },
    uPanA: { value: new THREE.Vector2() },
    uPanB: { value: new THREE.Vector2() },
    uZoomA: { value: 1 }, uZoomB: { value: 1 },
    uMix: { value: 0 }, uTime: { value: 0 }, uFade: { value: 0 },
    uFx: { value: FX_NONE }, uFxShake: { value: new THREE.Vector2() },
    uRingCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRingSquash: { value: 1 },
    uRingA: { value: new THREE.Vector2() }, uRingB: { value: new THREE.Vector2() },
    uWarp: { value: 0 }, uWarpPulseHz: { value: 0.7 },
    uDust: { value: 0 }, uSurge: { value: 0 }
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
      uniform float uTrainHeight, uTrainBlur, uTrainRattle, uSteam, uSmokeClear, uSteamFront;
      uniform float uFx, uRingSquash, uWarp, uWarpPulseHz, uDust, uSurge;
      uniform vec2 uFxShake, uRingCenter, uRingA, uRingB;
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
      // Expanding ellipse matching the ring drawn in the panel. ripple.x is
      // the radius (image-width units), ripple.y its current strength.
      float chronoRing(vec2 uv, vec2 ripple) {
        if (ripple.y <= 0.0) return 0.0;
        float dist = length((uv - uRingCenter) * vec2(1.0, 1.0 / uRingSquash));
        float x = (dist - ripple.x) / ${glsl(RING_WIDTH)};
        return exp(-x * x) * ripple.y;
      }
      float chronoBlue(vec3 c) { return smoothstep(0.10, 0.30, c.b - c.r); }
      float warpPulse() { return 0.6 + 0.4 * sin(uTime * 6.283185 * uWarpPulseHz); }
      // Displaces only the current panel's image coordinates.
      vec2 panelEffect(vec2 uv) {
        if (uFx < 0.5) return uv;
        float ring = chronoRing(uv, uRingA) + chronoRing(uv, uRingB);
        uv += normalize(uv - uRingCenter + 1e-5) * ring * ${glsl(RING_DISPLACE)};
        if (uWarp > 0.0) {
          float blue = chronoBlue(texture2D(uTexB, uv).rgb);
          float speed = ${glsl(WARP_FLOW_SPEED)};
          vec2 flow = vec2(cloudNoise(uv * 18.0 + vec2(uTime * speed, 0.0)),
                           cloudNoise(uv * 18.0 + vec2(13.0, -uTime * speed * 0.8))) - 0.5;
          uv += flow * 2.0 * ${glsl(WARP_DISPLACE)} * blue * warpPulse() * uWarp;
        }
        return uv;
      }
      vec3 panelEffectColor(vec3 color, vec2 uv) {
        if (uFx < 0.5) return color;
        float ring = chronoRing(uv, uRingA) + chronoRing(uv, uRingB);
        color += ${CHRONO_BLUE} * ring * ${glsl(RING_GLOW)};
        if (uWarp > 0.0) {
          // Halo: how much blue crack surrounds this pixel (two rings of taps).
          float halo = 0.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398;
            vec2 dir = vec2(cos(a), sin(a)) * ${glsl(WARP_HALO_RADIUS)} * (1.0 + uSurge * ${glsl(SURGE_HALO_SPREAD)});
            halo += chronoBlue(texture2D(uTexB, uv + dir).rgb) * 0.08;
            halo += chronoBlue(texture2D(uTexB, uv + dir * 2.0).rgb) * 0.045;
          }
          float core = chronoBlue(color);
          // Bright bands of energy travelling along the cracks.
          float energy = 0.5 + 0.5 * sin(uTime * ${glsl(WARP_ENERGY_SPEED)} - cloudNoise(uv * 14.0) * 12.0);
          float glow = (halo * ${glsl(WARP_GLOW)} + core * ${glsl(WARP_CORE)}) * mix(0.45, 1.0, energy) * warpPulse();
          color += ${CHRONO_BLUE} * glow * uWarp;
          vec3 ghost = texture2D(uTexB, uv - vec2(${glsl(WARP_GHOST)}, ${glsl(WARP_GHOST * 0.4)}) * warpPulse()).rgb;
          color += ghost * chronoBlue(ghost) * ${glsl(WARP_GHOST_OPACITY)} * uWarp;
        }
        return color;
      }
      // Sparse grey specks drifting downward (rockslide dust), kept out of
      // the subtitle area.
      float dustSpecks(vec2 uv, float aspect, float scale, float speed, float seed) {
        vec2 p = vec2(uv.x * aspect, uv.y) * scale + vec2(0.0, uTime * speed);
        vec2 cell = floor(p), f = fract(p) - 0.5;
        vec2 jitter = vec2(hash(cell + seed), hash(cell + seed + 7.7)) - 0.5;
        float speck = step(0.94, hash(cell + seed * 3.1)) * (1.0 - smoothstep(0.04, 0.14, length(f - jitter * 0.6)));
        return speck * smoothstep(0.2, 0.36, uv.y);
      }
      void main() {
        if (vUv.y < uBand.x || vUv.y > uBand.y) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 centred = (vUv - 0.5) * vec2(aspect, 1.0);
        vec2 imageUv = vUv;
        vec3 a = sharpen(uTexA, cover(imageUv, uSizeA, uZoomA, uPanA) + uFxShake, uSizeA);
        vec2 bUv = panelEffect(cover(imageUv, uSizeB, uZoomB, uPanB) + uFxShake);
        vec3 b = panelEffectColor(sharpen(uTexB, bUv, uSizeB), bUv);
        vec3 color = mix(a, b, clamp(uMix, 0.0, 1.0)) * uImage;
        if (uDust > 0.0) {
          float dust = max(dustSpecks(vUv, aspect, 34.0, 1.6, 1.0), dustSpecks(vUv, aspect, 21.0, 1.1, 5.0));
          color = mix(color, vec3(0.72) * uImage, dust * uDust);
        }
        // Time energy floods the frame: the ink is re-lit in chrono-blue
        // (dark → deep blue, light → white-hot cyan) with a bloom from the
        // centre. Built from the ungraded picture, blended in after the
        // vignette/subtitle grade so the flood covers the whole screen.
        vec3 surgeLight = vec3(0.0);
        if (uSurge > 0.0) {
          // Linear-light ramp: deep blue → #38BDF8 → white-hot.
          vec3 deep = vec3(0.004, 0.035, 0.090), chrono = vec3(0.039, 0.509, 0.939), hot = vec3(0.80, 0.95, 1.0);
          float l = clamp(sqrt(dot(color, vec3(0.2126, 0.7152, 0.0722))) * 1.3, 0.0, 1.0);
          surgeLight = mix(mix(deep, chrono, smoothstep(0.0, 0.6, l)), hot, smoothstep(0.6, 1.0, l));
          float core = 1.0 - smoothstep(0.0, 0.95, length((vUv - vec2(0.5, 0.52)) * vec2(aspect * 0.55, 1.0)));
          surgeLight += hot * core * core * (0.15 + 0.4 * uSurge);
        }
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
        if (uSurge > 0.0) color = mix(color, surgeLight, uSurge);
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
        float cloud = 0.5;
        if (uSteam > 0.0) cloud = steamCloud(vec2(vUv.x * aspect * 3.0 + uTime * 0.13, vUv.y * 3.0 - uTime * 0.28));
        float rise = smoothstep(vUv.y - 0.25, vUv.y + 0.25, uSteam * 1.5 + (cloud - 0.5) * 0.4);
        float behind = 1.0 - smoothstep(uSteamFront - 0.18, uSteamFront + 0.18, vUv.x);
        float cover = uSteam >= 1.0 ? 1.0 : rise * behind * smoothstep(0.0, 0.2, uSteam);
        // Continuous cloud opacity, with exact opaque/clear endpoints. The
        // rising noise field thins softly instead of a threshold/noise wipe.
        float thinning = clamp(1.0 - uSmokeClear + sin(uSmokeClear * 3.141593) * (cloud - 0.5) * 0.5, 0.0, 1.0);
        float smokeOpacity = cover * thinning;
        vec3 steamColor = mix(vec3(0.48, 0.51, 0.54), vec3(0.88, 0.89, 0.90), cloud);
        color = uSteam >= 1.0 ? steamColor : mix(color, steamColor, smokeOpacity);
        float alpha = uOpacity * (uSteam >= 1.0 ? smokeOpacity : 1.0);
        vec3 premul = max(color, vec3(0.0)) * clamp(uFade, 0.0, 1.0) * alpha;
        // The train is the TOP layer, never obscured by puff or trail.
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
          float trainAlpha = train.a * uOpacity;
          premul = premul * (1.0 - trainAlpha) + train.rgb * uOpacity;
          alpha += trainAlpha * (1.0 - alpha);
        }
        gl_FragColor = vec4(premul / max(alpha, 0.00001), alpha);
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

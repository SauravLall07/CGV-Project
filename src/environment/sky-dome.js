import * as THREE from 'three'
import { SUN_DIRECTION } from './station-blockout.js'
import { disposeObject } from '../core/dispose.js'

// One sky for every level. The mesh is a sphere drawn from the inside, kept
// on the camera so the horizon never slides off as the train moves. Presets
// only change uniforms — the shader is the same program everywhere.
//
// The base colour is the Preetham daylight model (Rayleigh + Mie scattering),
// adapted from the three.js Sky example:
//   https://github.com/mrdoob/three.js/blob/master/examples/jsm/objects/Sky.js
// Copyright (c) three.js authors. Licensed under the MIT License.
// Paper: "A Practical Analytic Model for Daylight" (Preetham, Shirley, Smits).
// Also useful: http://simonwallner.at/project/atmospheric-scattering/
// Stars, wispy clouds, the moon disc and the Timewreck tear bands are ours,
// drawn on top of that scattering result.
//
// The minimap renders a separate icon scene (ui/minimap.js), so this mesh is
// never in that draw. It stays on layer 0 anyway, which is the gameplay
// camera's layer and not the icon layer. castShadow is left off so the sun's
// shadow pass skips it.

const RADIUS = 480 // inside the camera's far plane (1000) and beyond the fog

// Just below the horizon, on the bearing the sun set along. High enough that
// Preetham still draws a thin afterglow (its sun intensity hits zero a little
// past -2°), low enough that the disc itself is gone.
const BOARDING_SET_ELEVATION = -1.6 * Math.PI / 180
const BOARDING_SET_AZIMUTH = new THREE.Vector3(16, 0, -10).normalize()
const BOARDING_SET_SUN = new THREE.Vector3(
  BOARDING_SET_AZIMUTH.x * Math.cos(BOARDING_SET_ELEVATION),
  Math.sin(BOARDING_SET_ELEVATION),
  BOARDING_SET_AZIMUTH.z * Math.cos(BOARDING_SET_ELEVATION)
)

const PRESETS = {
  // Blue hour. The sun is just below the horizon on the old sunset bearing
  // (16, 0, -10), so a thin afterglow stays there. Moonlight, and the shadow
  // it casts, is SUN_DIRECTION: 32° up, on a different bearing. The sky is
  // dim on purpose. Boarding's fog is a darker colour than this horizon,
  // set on the level, so the hills silhouette instead of picking up the glow.
  boarding: {
    turbidity: 10,
    rayleigh: 1.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.84,
    skyGain: 0.0019,
    highlightCompress: 0.35,
    saturation: 1.08,
    sunDirection: BOARDING_SET_SUN,
    showSunDisc: 0,
    moonDirection: SUN_DIRECTION.clone(),
    moonStrength: 1,
    nightLift: 0.8,
    starDensity: 0.026,
    starBrightness: 3.0,
    cloudAmount: 0.16,
    cloudSpeed: 0.008,
    glitch: 0,
    // Night-lift colours: purple just off the horizon, deep indigo overhead.
    horizon: 0x3a1848,
    zenith: 0x1a2458
  },
  // Clear night. The scattering sun is below the horizon, so Preetham goes
  // dark, and a moon disc plus the night lift carry the roof crossing.
  'moving-heist': {
    turbidity: 2,
    rayleigh: 1.2,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.75,
    skyGain: 0.04,
    highlightCompress: 0.15,
    saturation: 1,
    sunDirection: new THREE.Vector3(0.2, -0.28, -0.55).normalize(),
    showSunDisc: 0,
    moonDirection: new THREE.Vector3(0.25, 0.86, -0.44).normalize(),
    moonStrength: 1,
    nightLift: 0.95,
    starDensity: 0.022,
    starBrightness: 2.4,
    cloudAmount: 0.18,
    cloudSpeed: 0.004,
    glitch: 0,
    horizon: 0x1a3058,
    zenith: 0x0c1428
  },
  // Unstable sky. A low hazy sun, then the tear bands on top. The finale
  // raises uGrade to paint over this with its icy / dawn colours.
  timewreck: {
    turbidity: 16,
    rayleigh: 1.5,
    mieCoefficient: 0.018,
    mieDirectionalG: 0.72,
    skyGain: 0.02,
    highlightCompress: 0.45,
    saturation: 1.15,
    sunDirection: new THREE.Vector3(0.35, 0.07, -0.55).normalize(),
    showSunDisc: 1,
    moonDirection: new THREE.Vector3(0, 1, 0),
    moonStrength: 0,
    nightLift: 0.12,
    starDensity: 0.008,
    starBrightness: 1.8,
    cloudAmount: 0.48,
    cloudSpeed: 0.04,
    glitch: 0.85,
    horizon: 0x3a4a58,
    zenith: 0x1a2838
  }
}

function timeScaleOf(timeSystem) {
  const mode = timeSystem?.getMode?.()
  if (mode === 'SLOW') return 0.2
  if (mode === 'FREEZE') return 0
  if (mode === 'REWIND') return -2.5
  return 1
}

export function createSkyDome(presetName) {
  const preset = PRESETS[presetName]
  if (!preset) throw new Error(`sky-dome: unknown preset "${presetName}"`)

  // Live colours. scene.fog.color is assigned to uHorizonColor, and setLook()
  // copies into these objects rather than replacing them.
  const uniforms = {
    // Seconds the sky has been alive, already multiplied by Slow/Freeze/Rewind.
    uTime: { value: 0 },
    // 1 only while captureSkyEnvironment renders this dome into the env map.
    uEnvCapture: { value: 0 },
    // Exposure applied to the scattering before ACES. The three.js Sky
    // example uses 0.04. A bright low sun needs less or the tone map
    // flattens the sunset to white.
    uSkyGain: { value: preset.skyGain },
    // 0 leaves the scattering untouched. Higher values pull bright gold
    // out of the white clip of ACES. See the fragment shader.
    uHighlightCompress: { value: preset.highlightCompress },
    // 1 keeps the scattering hue. Above 1 separates gold from blue.
    uSaturation: { value: preset.saturation },
    // How hazy the air is. Higher turbidity warms the horizon and widens the
    // sun's glow. The three.js example defaults this to 2 (a clear day).
    uTurbidity: { value: preset.turbidity },
    // Rayleigh strength. Higher pulls the zenith toward deep blue, because
    // air molecules scatter short wavelengths the most.
    uRayleigh: { value: preset.rayleigh },
    // Mie strength. Larger aerosols scatter every wavelength forward, which
    // is the bright halo around the sun. The example defaults to 0.005.
    uMieCoefficient: { value: preset.mieCoefficient },
    // Mie anisotropy, 0..1. Closer to 1 keeps the halo tight around the sun.
    uMieDirectionalG: { value: preset.mieDirectionalG },
    // Unit vector toward the sun. Boarding's is just below the horizon.
    uSunDirection: { value: preset.sunDirection.clone() },
    // 1 draws the small solar disc from the Preetham shader. 0 hides it
    // (the night preset, where the light in the sky is the moon).
    uShowSunDisc: { value: preset.showSunDisc },
    // Unit vector toward the moon. Unused when uMoonStrength is 0.
    uMoonDirection: { value: preset.moonDirection.clone() },
    // 1 draws the moon disc and lights the clouds from it. Boarding's moon
    // matches the shadow-casting moonlight.
    uMoonStrength: { value: preset.moonStrength },
    // Extra deep-blue lift once the sun is below the horizon. Preetham has
    // no moonlight, so without this the night sky falls to black.
    uNightLift: { value: preset.nightLift },
    // Fraction of star cells that contain a star. The star itself is a
    // 1–2 px disc, not the whole cell.
    uStarDensity: { value: preset.starDensity },
    uStarBrightness: { value: preset.starBrightness },
    // 0 hides the wisps. They drift with uTime.
    uCloudAmount: { value: preset.cloudAmount },
    uCloudSpeed: { value: preset.cloudSpeed },
    // 0 is a stable sky. Timewreck raises this; the finale drops it again.
    uGlitch: { value: preset.glitch },
    // 0 leaves the scattering untouched. The Timewreck finale raises this
    // to blend the sky toward uHorizonColor / uZenithColor.
    uGrade: { value: 0 },
    // Horizon tint for fog, the night lift, and the finale grade.
    uHorizonColor: { value: new THREE.Color(preset.horizon) },
    // Zenith tint for the night lift and the finale grade.
    uZenithColor: { value: new THREE.Color(preset.zenith) }
  }

  const vertexShader = /* glsl */ `
    uniform vec3 uSunDirection;
    uniform float uRayleigh;
    uniform float uTurbidity;
    uniform float uMieCoefficient;

    // World position of this vertex. The fragment shader turns it into a
    // view direction. Doing that per pixel (not per vertex) keeps the
    // colour smooth across the dome's triangles.
    varying vec3 vWorldPosition;
    // Unit vector toward the sun. Same value everywhere; a varying only
    // because the scattering coefficients are computed here, once per vertex.
    varying vec3 vSunDirection;
    // Sun brightness after the horizon falloff. 0 once the sun has set.
    varying float vSunE;
    // How strongly air (Rayleigh) and haze (Mie) absorb each channel.
    // Blue is the largest Rayleigh component: blue light is scattered most.
    varying vec3 vBetaR;
    varying vec3 vBetaM;

    // Constants from the three.js Sky shader (Preetham).
    // Total Rayleigh scattering for Preetham's primaries (680, 550, 450 nm).
    // Replaces TotalRayleigh() in the example. Blue (z) is the largest.
    const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
    // MieConst = pi * pow((2 pi) / lambda, vec3(v - 2)) * K, with v = 4
    // and K the example's per-channel coefficients.
    const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
    // Sun intensity drops to 0 as the sun crosses the horizon. cutoffAngle
    // is pi / 1.95, steepness shapes the falloff, EE is the base intensity.
    const float cutoffAngle = 1.6110731556870734;
    const float steepness = 1.5;
    const float EE = 1000.0;

    float sunIntensity(float zenithAngleCos) {
      zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
      return EE * max(0.0, 1.0 - exp(-((cutoffAngle - acos(zenithAngleCos)) / steepness)));
    }

    // Haze density from turbidity. The 10E-18 brings MieConst back to a
    // usable scale. This is totalMie() from the example.
    vec3 totalMie(float T) {
      float c = (0.2 * T) * 10E-18;
      return 0.434 * c * MieConst;
    }

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      // Push the dome to the far plane so it never wins a depth test.
      gl_Position.z = gl_Position.w;

      vSunDirection = normalize(uSunDirection);
      // World up. The dome is never tilted.
      vec3 up = vec3(0.0, 1.0, 0.0);
      vSunE = sunIntensity(dot(vSunDirection, up));

      // The example's sunfade term uses a sun position in huge world units
      // (y / 450000). We pass a unit direction, so that term stays at 1 and
      // the dusk comes from the sun's angle through the air, plus turbidity.
      float rayleighCoefficient = uRayleigh;

      vBetaR = totalRayleigh * rayleighCoefficient;
      vBetaM = totalMie(uTurbidity) * uMieCoefficient;
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying float vSunE;
    varying vec3 vBetaR;
    varying vec3 vBetaM;

    uniform float uTime;
    uniform float uEnvCapture;
    uniform float uSkyGain;
    uniform float uHighlightCompress;
    uniform float uSaturation;
    uniform float uMieDirectionalG;
    uniform float uShowSunDisc;
    uniform vec3 uMoonDirection;
    uniform float uMoonStrength;
    uniform float uNightLift;
    uniform float uStarDensity;
    uniform float uStarBrightness;
    uniform float uCloudAmount;
    uniform float uCloudSpeed;
    uniform float uGlitch;
    uniform float uGrade;
    uniform vec3 uHorizonColor;
    uniform vec3 uZenithColor;

    // Repeatable 0..1 from a cell. No texture to upload or dispose.
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // Smooth value noise. One octave is four hashes.
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    const float pi = 3.141592653589793238462643383279502884197169;
    // How much air a ray travels looking straight up, in metres.
    const float rayleighZenithLength = 8.4E3;
    const float mieZenithLength = 1.25E3;
    // Cosine of the sun's angular radius (about 0.5°). The disc is this small
    // on purpose: the glow around it is Mie scattering, not a painted circle.
    const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
    // 3 / (16 pi) and 1 / (4 pi), the phase-function scales from the example.
    const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
    const float ONE_OVER_FOURPI = 0.07957747154594767;

    // Rayleigh phase: light scattered by air molecules. The (1 + cos^2) term
    // is why the sky is bright both toward the sun and opposite it.
    float rayleighPhase(float cosTheta) {
      return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
    }

    // Henyey-Greenstein phase: light scattered by haze, mostly forward.
    // g near 1 is a tight glow around the sun. This is hgPhase() in the example.
    float hgPhase(float cosTheta, float g) {
      float g2 = pow(g, 2.0);
      float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
      return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
    }

    void main() {
      // 1. View direction. The dome is only translated onto the camera, so
      //    this is the direction from the eye to this pixel of sky.
      //    y = 1 is straight up, y = 0 is the horizon.
      vec3 direction = normalize(vWorldPosition - cameraPosition);
      vec3 up = vec3(0.0, 1.0, 0.0);

      // 2. Preetham scattering, from the three.js Sky fragment shader.
      //    A ray toward the horizon travels through more air than a ray
      //    toward the zenith. inverse is that extra optical length.
      //    The max(0, ...) holds the angle at the horizon so the formula
      //    does not divide by zero below it.
      float zenithAngle = acos(max(0.0, dot(up, direction)));
      float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
      float sR = rayleighZenithLength * inverse;
      float sM = mieZenithLength * inverse;

      // How much light is left after travelling that air (extinction).
      vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

      // In-scattering: light bounced into this ray. cosTheta is how close
      // the view direction is to the sun.
      float cosTheta = dot(direction, vSunDirection);
      // The example remaps the angle into 0..1 before the Rayleigh phase.
      float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
      vec3 betaRTheta = vBetaR * rPhase;
      float mPhase = hgPhase(cosTheta, uMieDirectionalG);
      vec3 betaMTheta = vBetaM * mPhase;

      // Lin is the sky colour. The 1.5 power is the example's gamma on the
      // scattered light. The mix() warms the sky as the sun gets lower:
      // pow(1 - sunDotUp, 5) is ~0 at noon and ~1 at the horizon.
      vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
      Lin *= mix(
        vec3(1.0),
        pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)),
        clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0)
      );

      // L0 is the remaining direct light: a dim baseline (so night is not
      // pure black before the night lift) plus the solar disc.
      vec3 L0 = vec3(0.1) * Fex;
      float sundisc = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
      L0 += (vSunE * 19000.0 * Fex) * sundisc * uShowSunDisc;

    // The three.js example multiplies by 0.04 before tone mapping. uSkyGain
    // is that exposure.
    vec3 skyColor = (Lin + L0) * uSkyGain + vec3(0.0, 0.0003, 0.00075);
    // The sun's halo is much brighter than the blue sky. ACES would clip
    // that halo to white and the sunset would look flat. This divides the
    // highlight range down while keeping the hue, then the renderer's ACES
    // pass still runs on the result.
    float skyLuma = max(dot(skyColor, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
    skyColor *= (skyLuma / (1.0 + skyLuma * uHighlightCompress)) / skyLuma;
    // The analytic sunset is less saturated than it looks in photographs.
    // uSaturation 1 leaves the model alone; Boarding raises it so the gold
    // and the blue separate after ACES. Luma is taken again after the
    // highlight compress, or the mix would use the pre-compress brightness.
    float gradedLuma = dot(skyColor, vec3(0.2126, 0.7152, 0.0722));
    skyColor = max(mix(vec3(gradedLuma), skyColor, uSaturation), vec3(0.0));

      // 3. Night lift. Only when the sun is down. A wide ramp from the
      //    horizon colour to the zenith colour, added to the scattering,
      //    so the night stays deep blue without a hard ring in the sky.
      float sunDown = smoothstep(0.12, -0.15, vSunDirection.y);
      float liftHeight = clamp(direction.y * 0.85 + 0.05, 0.0, 1.0);
      vec3 airglow = mix(uHorizonColor, uZenithColor, liftHeight);
      skyColor += airglow * uNightLift * sunDown;

      // 4. Wispy clouds. Three noise samples, stretched into filaments.
      //    No upper cutoff: an elevation cutoff was the curved edge in the
      //    old sky. They only fade out at the horizon, so they don't sit
      //    on the hills. The side facing the sun (or the moon, at night)
      //    is brighter; the other side is darker than the sky behind it.
      float horizonMask = smoothstep(0.0, 0.14, direction.y);
      vec2 cloudUv = vec2(atan(direction.z, direction.x), direction.y);
      cloudUv.x += uTime * uCloudSpeed;
      float warp = noise(cloudUv * vec2(1.4, 3.2));
      float streak = noise(vec2(cloudUv.x * 1.15 + warp * 0.75, cloudUv.y * 5.5 + 2.0));
      float breakup = noise(cloudUv * vec2(4.2, 2.0) + 9.0);
      float wisp = smoothstep(0.58, 0.8, streak) * smoothstep(0.22, 0.66, breakup);
      wisp *= horizonMask;
      vec3 lightDir = normalize(mix(vSunDirection, normalize(uMoonDirection), clamp(uMoonStrength, 0.0, 1.0)));
      float light = clamp(dot(direction, lightDir), 0.0, 1.0);
      float rim = smoothstep(0.58, 0.68, streak) * (1.0 - smoothstep(0.76, 0.9, streak));
      vec3 warm = vec3(1.2, 0.72, 0.38);
      vec3 cool = vec3(0.72, 0.78, 0.92);
      vec3 litTint = mix(warm, cool, clamp(uMoonStrength, 0.0, 1.0));
      vec3 cloudColor = mix(skyColor * 0.38, skyColor + litTint * 0.55, light);
      cloudColor += litTint * rim * light;
      skyColor = mix(skyColor, cloudColor, wisp * uCloudAmount);

      // 5. Moon disc. A small soft circle plus a short halo. uMoonStrength
      //    is 0 on Timewreck, where the sky has no moon.
      float moonFacing = dot(direction, normalize(uMoonDirection));
      float moonDisc = smoothstep(0.99955, 0.9998, moonFacing);
      float moonHalo = pow(max(moonFacing, 0.0), 48.0);
      skyColor += vec3(0.85, 0.9, 1.0) * (moonDisc * 8.0 + moonHalo * 0.28) * uMoonStrength;

      // 6. Stars. The grid only decides WHERE a star is allowed. The mark
      //    itself is a soft disc sized with fwidth, so it stays about 1–2
      //    pixels instead of filling the whole cell (the old square stars).
      //    luminance() of the sky so far masks them out of the bright sunset.
      vec2 starUv = vec2(
        atan(direction.z, direction.x),
        asin(clamp(direction.y, -0.999, 0.999))
      ) * 36.0;
      vec2 starCell = floor(starUv);
      vec2 starLocal = fract(starUv) - 0.5;
      float starHash = hash(starCell);
      float present = step(1.0 - uStarDensity, starHash);
      vec2 jitter = (vec2(hash(starCell + 1.7), hash(starCell + 8.3)) - 0.5) * 0.65;
      float dist = length(starLocal - jitter);
      float px = clamp(fwidth(starUv.x), 0.001, 0.12);
      // Outer edge ~1.2 px, soft centre inside that, so a star stays a point.
      float star = smoothstep(px * 1.2, px * 0.15, dist) * present;
      float phase = hash(starCell + 4.2) * 6.28318;
      float twinkle = 0.6 + 0.4 * sin(uTime * 1.7 + phase);
      float brightness = 0.45 + 0.55 * hash(starCell + 3.1);
      float luma = dot(skyColor, vec3(0.2126, 0.7152, 0.0722));
      float inDarkSky = 1.0 - smoothstep(0.06, 0.32, luma);
      float aboveHorizon = smoothstep(0.04, 0.18, direction.y);
      skyColor += vec3(star * twinkle * brightness * inDarkSky * aboveHorizon * uStarBrightness);

      // 7. Finale grade. uGrade is 0 during play. Timewreck raises it to
      //    blend toward the freeze / dawn colours. The ramp is wide so it
      //    does not draw a ring the way the old elevation blend did.
      float gradeHeight = smoothstep(-0.2, 0.85, direction.y);
      vec3 gradeColor = mix(uHorizonColor, uZenithColor, gradeHeight);
      skyColor = mix(skyColor, gradeColor, clamp(uGrade, 0.0, 1.0));

      gl_FragColor = vec4(skyColor, 1.0);

      // Same ACES curve and output colour space as every other material.
      // Both chunks are what the three.js Sky example includes.
      #include <tonemapping_fragment>

      // 8. Timewreck tears, after tone mapping so the channel swap stays
      //    visible once ACES has compressed the sky. uGlitch is 0 elsewhere,
      //    and the finale sets it back to 0 when it recolours the sky.
      float slice = floor(direction.y * 22.0 + uTime * 1.6);
      float tear = step(0.62, hash(vec2(slice, floor(uTime * 4.0))));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.gbr, uGlitch * tear);

      #include <colorspace_fragment>

      // The environment-map capture reads the linear sky, before ACES and
      // before the sRGB encode. Materials tone-map the map themselves.
      if (uEnvCapture > 0.5) {
        gl_FragColor = vec4(skyColor, 1.0);
      }
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    // Tone mapping is applied by the tonemapping_fragment chunk above.
    toneMapped: true
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 48), material)
  mesh.name = 'sky-dome'
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = -1000
  mesh.layers.set(0)
  mesh.raycast = () => {}
  // The render camera is already in its final place for this frame by the
  // time the mesh draws, which is later than the level update. The renderer
  // rebuilds modelViewMatrix after onBeforeRender, so this position is the
  // one that gets drawn.
  mesh.onBeforeRender = function (_renderer, _scene, camera) {
    this.position.copy(camera.position)
    this.updateMatrixWorld()
  }

  const baseHorizon = new THREE.Color(preset.horizon)
  const baseZenith = new THREE.Color(preset.zenith)
  const baseGlow = new THREE.Color(0xffe0b0)

  function setLook({ horizon, zenith, glow, glitch, starBrightness, grade } = {}) {
    if (horizon) uniforms.uHorizonColor.value.copy(horizon)
    if (zenith) uniforms.uZenithColor.value.copy(zenith)
    if (glow) baseGlow.copy(glow)
    if (glitch !== undefined) uniforms.uGlitch.value = glitch
    if (starBrightness !== undefined) uniforms.uStarBrightness.value = starBrightness
    if (grade !== undefined) uniforms.uGrade.value = grade
  }

  function update(delta, timeSystem) {
    uniforms.uTime.value += delta * timeScaleOf(timeSystem)
  }

  function dispose() {
    mesh.onBeforeRender = function () {}
    disposeObject(mesh)
  }

  return {
    mesh,
    // Live horizon. Levels assign scene.fog.color to this object so setLook()
    // recolours the fog with the sky. scene.background stays a dark clear
    // colour: the dome covers the main view, and the minimap copies
    // scene.background into its own inset.
    horizonColor: uniforms.uHorizonColor.value,
    baseHorizon,
    baseZenith,
    baseGlow,
    baseGlitch: preset.glitch,
    update,
    setLook,
    dispose
  }
}

import * as THREE from 'three'
import { SUN_DIRECTION } from './station-blockout.js'
import { disposeObject } from '../core/dispose.js'
import { SKY_EVALUATE_GLSL } from '../shaders/sky-evaluate.js'

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

const RADIUS = 480 // recentred on the camera; the far plane is 1800

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
  // it casts, is SUN_DIRECTION: 30° up, mostly east, so it sits in the spawn
  // view (that camera looks along +X). The sky is dim on purpose. Boarding's
  // fog is a darker colour than this horizon, set on the level, so the hills
  // silhouette instead of picking up the glow.
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
    cloudAmount: 0.09,
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

    ${SKY_EVALUATE_GLSL}

    void main() {
      // View direction. Clouds and stars are sampled from this vector
      // inside evaluateSky(), not from an azimuth, so the sky has no seam.
      vec3 direction = normalize(vWorldPosition - cameraPosition);
      vec3 skyColor = evaluateSky(direction);

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
    // Valley lights sample this same clock so Slow/Freeze/Rewind twinkle them.
    timeUniform: uniforms.uTime,
    // The lake shares these objects, including uTime, so the reflection
    // and the ripples stay on the sky's clock.
    uniforms,
    baseHorizon,
    baseZenith,
    baseGlow,
    baseGlitch: preset.glitch,
    update,
    setLook,
    dispose
  }
}

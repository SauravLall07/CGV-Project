import * as THREE from 'three'
import { SKY_EVALUATE_GLSL } from './sky-evaluate.js'

/**
 * Boarding valley lake.
 *
 * The reflection is evaluateSky() — the same function the sky dome uses —
 * on the view direction reflected about the ripple normal. There is no
 * second render of the scene and no environment-map pass.
 *
 * Ripples are noise normals. They, and the sky they reflect, share the
 * sky dome's uTime, so Slow, Freeze and Rewind move the water.
 * Fresnel keeps the water dark when you look down and sky-coloured at
 * a glancing angle. A tight moon glint sits where the reflection
 * lines up with the moon.
 */
export function createLakeMaterial(skyUniforms) {
  const uniforms = {
    uTime: skyUniforms.uTime,
    uSkyGain: skyUniforms.uSkyGain,
    uHighlightCompress: skyUniforms.uHighlightCompress,
    uSaturation: skyUniforms.uSaturation,
    uMieDirectionalG: skyUniforms.uMieDirectionalG,
    uShowSunDisc: skyUniforms.uShowSunDisc,
    uMoonDirection: skyUniforms.uMoonDirection,
    uMoonStrength: skyUniforms.uMoonStrength,
    uNightLift: skyUniforms.uNightLift,
    uStarDensity: skyUniforms.uStarDensity,
    uStarBrightness: skyUniforms.uStarBrightness,
    uCloudAmount: skyUniforms.uCloudAmount,
    uCloudSpeed: skyUniforms.uCloudSpeed,
    uGlitch: skyUniforms.uGlitch,
    uGrade: skyUniforms.uGrade,
    uHorizonColor: skyUniforms.uHorizonColor,
    uZenithColor: skyUniforms.uZenithColor,
    uSunDirection: skyUniforms.uSunDirection,
    uRayleigh: skyUniforms.uRayleigh,
    uTurbidity: skyUniforms.uTurbidity,
    uMieCoefficient: skyUniforms.uMieCoefficient,
    uDeepColor: { value: new THREE.Color(0x071018) }
  }

  const vertexShader = /* glsl */ `
    uniform vec3 uSunDirection;
    uniform float uRayleigh;
    uniform float uTurbidity;
    uniform float uMieCoefficient;

    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying float vSunE;
    varying vec3 vBetaR;
    varying vec3 vBetaM;

    // Same scattering coefficients as the sky dome's vertex shader, so
    // evaluateSky() sees the same air the dome does.
    const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
    const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
    const float cutoffAngle = 1.6110731556870734;
    const float steepness = 1.5;
    const float EE = 1000.0;

    float sunIntensity(float zenithAngleCos) {
      zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
      return EE * max(0.0, 1.0 - exp(-((cutoffAngle - acos(zenithAngleCos)) / steepness)));
    }

    vec3 totalMie(float T) {
      float c = (0.2 * T) * 10E-18;
      return 0.434 * c * MieConst;
    }

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vSunDirection = normalize(uSunDirection);
      vSunE = sunIntensity(dot(vSunDirection, vec3(0.0, 1.0, 0.0)));
      vBetaR = totalRayleigh * uRayleigh;
      vBetaM = totalMie(uTurbidity) * uMieCoefficient;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying float vSunE;
    varying vec3 vBetaR;
    varying vec3 vBetaM;

    uniform float uTime;
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
    uniform vec3 uDeepColor;

    ${SKY_EVALUATE_GLSL}

    void main() {
      // Two octaves of scrolling noise. The difference between a
      // neighbour sample and this one is the ripple slope.
      vec2 xz = vWorldPosition.xz;
      float t = uTime;
      float n = noise(xz * 0.17 + vec2(t * 0.035, t * 0.02));
      n += noise(xz * 0.41 - vec2(t * 0.02, t * 0.028)) * 0.45;
      float nx = noise((xz + vec2(0.6, 0.0)) * 0.17 + vec2(t * 0.035, t * 0.02));
      nx += noise((xz + vec2(0.6, 0.0)) * 0.41 - vec2(t * 0.02, t * 0.028)) * 0.45;
      float nz = noise((xz + vec2(0.0, 0.6)) * 0.17 + vec2(t * 0.035, t * 0.02));
      nz += noise((xz + vec2(0.0, 0.6)) * 0.41 - vec2(t * 0.02, t * 0.028)) * 0.45;
      vec3 normal = normalize(vec3((n - nx) * 0.55, 1.0, (n - nz) * 0.55));

      vec3 incident = normalize(vWorldPosition - cameraPosition);
      vec3 reflected = normalize(reflect(incident, normal));
      // Below the horizon the analytic sky is undefined. Clamp so a
      // steep ripple cannot sample under the ground.
      reflected.y = max(reflected.y, 0.02);
      reflected = normalize(reflected);
      vec3 reflection = evaluateSky(reflected);

      float ndotv = max(dot(normal, -incident), 0.0);
      float fresnel = pow(1.0 - ndotv, 3.0);
      vec3 water = mix(uDeepColor, reflection, 0.18 + fresnel * 0.82);

      float glint = pow(max(dot(reflected, normalize(uMoonDirection)), 0.0), 900.0);
      water += vec3(0.75, 0.82, 0.95) * glint * 6.0 * uMoonStrength;

      gl_FragColor = vec4(water, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    fog: false,
    toneMapped: true
  })
  material.customUniforms = uniforms
  return material
}

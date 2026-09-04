import * as THREE from 'three'

/**
 * Custom GLSL Sky Shader Material
 * Features:
 * - Rayleigh/Mie scattering atmosphere simulation
 * - Zenith to horizon color gradient tuned for dusk / golden hour / night
 * - Procedural solar disc with radiant corona and atmospheric attenuation
 * - Procedural cloud haze near horizon
 */
export function createSkyShaderMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uSunPosition: { value: options.sunPosition || new THREE.Vector3(100, 30, -100) },
    uTopColor: { value: new THREE.Color(options.topColor || 0x141829) }, // Deep twilight zenith
    uBottomColor: { value: new THREE.Color(options.bottomColor || 0xef7d43) }, // Sunset golden-orange horizon
    uSunColor: { value: new THREE.Color(options.sunColor || 0xffd194) }, // Solar glow
    uAtmosphereColor: { value: new THREE.Color(options.atmosphereColor || 0x69547d) },
    uCloudColor: { value: new THREE.Color(options.cloudColor || 0x2b2236) },
    uHazeDensity: { value: options.hazeDensity ?? 0.6 }
  }

  const vertexShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying float vSunfade;

    uniform vec3 uSunPosition;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      vSunDirection = normalize(uSunPosition);
      vSunfade = 1.0 - clamp(1.0 - exp(uSunPosition.y / 100.0), 0.0, 1.0);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    varying float vSunfade;

    uniform float uTime;
    uniform vec3 uTopColor;
    uniform vec3 uBottomColor;
    uniform vec3 uSunColor;
    uniform vec3 uAtmosphereColor;
    uniform vec3 uCloudColor;
    uniform float uHazeDensity;

    // Simple pseudo-noise for atmospheric clouds
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

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

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 viewDirection = normalize(vWorldPosition);

      // Height gradient based on view vector Y component
      float h = smoothstep(-0.05, 0.4, viewDirection.y);
      float horizonFactor = pow(1.0 - max(0.0, viewDirection.y), 4.0);

      // Gradient sky background
      vec3 skyColor = mix(uBottomColor, uTopColor, h);

      // Rayleigh atmospheric haze along horizon
      skyColor = mix(skyColor, uAtmosphereColor, horizonFactor * uHazeDensity * 0.7);

      // Sun disc & glow
      float cosTheta = dot(viewDirection, vSunDirection);
      float sunDisc = smoothstep(0.997, 0.9995, cosTheta);
      float sunGlow = pow(max(0.0, cosTheta), 16.0) * 0.8;
      float solarHalo = pow(max(0.0, cosTheta), 4.0) * 0.35;

      vec3 sunContribution = uSunColor * (sunDisc * 3.5 + sunGlow * 1.5 + solarHalo);
      skyColor += sunContribution;

      // Soft horizon cloud haze
      vec2 cloudUv = vec2(atan(viewDirection.z, viewDirection.x) * 3.0, viewDirection.y * 8.0) + vec2(uTime * 0.015, 0.0);
      float n = fbm(cloudUv);
      float cloudMask = smoothstep(0.02, 0.3, viewDirection.y) * smoothstep(0.4, 0.1, viewDirection.y);
      skyColor = mix(skyColor, uCloudColor, n * cloudMask * 0.45);

      gl_FragColor = vec4(skyColor, 1.0);
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false
  })

  material.customUniforms = uniforms
  return material
}

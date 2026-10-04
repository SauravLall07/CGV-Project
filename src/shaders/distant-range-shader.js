import * as THREE from 'three'

/**
 * Distant mountain ranges for Boarding's opening view.
 *
 * The mesh is still one ring per layer (one draw call, no shadows). This
 * shader paints it:
 * - dark forest on the lower slopes of the nearer layers
 * - snow on the upper slopes and the crest
 * - a faint pink afterglow on slopes that face the sunset
 * - cool moonlight on the other faces
 * - per-layer haze, stronger on the farther rings (aerial perspective)
 * - a little mist at the foot, so the base sits in the valley
 *
 * Scene fog is off. These rings are past the terrain fog and would vanish
 * into it.
 */
export function createDistantRangeMaterial({
  baseColor = 0x1a221c,
  forestColor = 0x142016,
  snowColor = 0xc5ccd8,
  hazeColor = 0x3a1848,
  haze = 0.4,
  forest = 0,
  mist = 0.3,
  afterglowDir,
  moonDir
} = {}) {
  const uniforms = {
    uBaseColor: { value: new THREE.Color(baseColor) },
    uForestColor: { value: new THREE.Color(forestColor) },
    uSnowColor: { value: new THREE.Color(snowColor) },
    uHazeColor: { value: new THREE.Color(hazeColor) },
    uGlowColor: { value: new THREE.Color(0xc47858) },
    uMoonColor: { value: new THREE.Color(0x9aafd0) },
    uHaze: { value: haze },
    uForest: { value: forest },
    uMist: { value: mist },
    uAfterglowDir: { value: (afterglowDir || new THREE.Vector3(16, 0.25, -10)).clone().normalize() },
    uMoonDir: { value: (moonDir || new THREE.Vector3(0.85, 0.5, 0.16)).clone().normalize() }
  }

  const vertexShader = /* glsl */ `
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vWorld;

    void main() {
      // uv.y is 0 on the buried base and 1 on the crest.
      vAlong = uv.y;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorld = worldPosition.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    uniform vec3 uBaseColor;
    uniform vec3 uForestColor;
    uniform vec3 uSnowColor;
    uniform vec3 uHazeColor;
    uniform vec3 uGlowColor;
    uniform vec3 uMoonColor;
    uniform float uHaze;
    uniform float uForest;
    uniform float uMist;
    uniform vec3 uAfterglowDir;
    uniform vec3 uMoonDir;

    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vWorld;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      // The ring is double-sided. Flip so the face we see is the lit one.
      if (dot(normal, viewDir) < 0.0) normal = -normal;

      float forest = smoothstep(0.48, 0.08, vAlong) * uForest;
      float snow = smoothstep(0.62, 0.92, vAlong);
      // Ridgelines stay white a little further down the slope than the face.
      snow = max(snow, smoothstep(0.78, 0.98, vAlong));

      vec3 albedo = mix(uBaseColor, uForestColor, forest);
      albedo = mix(albedo, uSnowColor, snow);

      float moonL = max(dot(normal, normalize(uMoonDir)), 0.0);
      float glowL = max(dot(normal, normalize(uAfterglowDir)), 0.0);
      vec3 fill = vec3(0.07, 0.08, 0.12);
      vec3 lit = albedo * (fill + uMoonColor * moonL * 0.85 + uGlowColor * glowL * 0.7);
      // Snow takes the tint more clearly than the rock.
      lit += uSnowColor * (uMoonColor * moonL * 0.22 + uGlowColor * glowL * 0.4) * snow;

      vec3 color = mix(lit, uHazeColor, clamp(uHaze, 0.0, 1.0));

      // Mist at the foot of the range. Subtle, and only low down.
      float mist = smoothstep(55.0, 8.0, vWorld.y) * uMist * 0.45;
      color = mix(color, uHazeColor * 0.55 + vec3(0.03, 0.035, 0.05), mist);

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: true
  })
  material.customUniforms = uniforms
  return material
}

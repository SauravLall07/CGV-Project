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

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      // The ring is double-sided. Flip so the face we see is the lit one.
      if (dot(normal, viewDir) < 0.0) normal = -normal;

      float forest = smoothstep(0.42, 0.06, vAlong) * uForest;
      // Snow only on the upper slope. Noise shifts the line so it is a
      // broken contour, not a soft band around the whole ring.
      float line = 0.84 + (noise(vWorld.xz * 0.006) - 0.5) * 0.1;
      float snow = smoothstep(line, line + 0.045, vAlong);
      snow = max(snow, smoothstep(0.96, 0.995, vAlong));

      vec3 rock = uBaseColor * 0.42;
      vec3 albedo = mix(rock, uForestColor * 0.75, forest);
      albedo = mix(albedo, uSnowColor, snow);

      // A short ramp so a ridge facing the moon is bright and the
      // opposite face falls off into dark rock.
      float moonL = smoothstep(0.12, 0.62, max(dot(normal, normalize(uMoonDir)), 0.0));
      float glowL = smoothstep(0.25, 0.8, max(dot(normal, normalize(uAfterglowDir)), 0.0));
      vec3 fill = vec3(0.035, 0.04, 0.055);
      vec3 lit = albedo * (fill + uMoonColor * moonL * 1.25);
      // Afterglow stays a faint tint on sunset-facing slopes only.
      lit += uGlowColor * glowL * 0.16;

      vec3 color = mix(lit, uHazeColor, clamp(uHaze, 0.0, 1.0));

      // Foot mist only. vAlong keeps it off the faces, so it cannot
      // draw a band across the ridge.
      float mist = smoothstep(12.0, 3.0, vWorld.y) * smoothstep(0.16, 0.0, vAlong);
      mist *= uMist * 0.12;
      color = mix(color, uHazeColor * 0.45 + vec3(0.02, 0.022, 0.03), mist);

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

import * as THREE from 'three'

// Soft light shaft for vision cones and torch beams. The mesh is an open
// cone with its apex at the origin and its axis along +Z (uLength long).
// Additive, so overlapping beams brighten instead of stacking grey; bright
// at the source and fading with distance; faded at the silhouette (where
// the surface turns edge-on) so there is no hard outline; faint haze and
// motes drift through it on the level clock.
//
// `material.color` is the uniform colour, so callers keep using
// material.color.setHex() to signal state.

const VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 view = viewMatrix * world;
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-view.xyz);
    gl_Position = projectionMatrix * view;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLength;
  uniform float uStrength;
  uniform float uTime;

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    float along = clamp(vLocal.z / uLength, 0.0, 1.0);
    float fall = pow(1.0 - along, 1.35) * smoothstep(0.0, 0.05, along);

    vec3 n = normalize(vNormalView);
    float facing = abs(dot(n, normalize(vViewDir)));
    float edge = pow(facing, 1.6);

    vec3 drift = vec3(uTime * 0.05, uTime * 0.11, -uTime * 0.04);
    float haze = 0.7 + 0.6 * noise(vWorld * 1.2 + drift);
    float motes = pow(noise(vWorld * 8.0 + drift * 5.0), 9.0) * 2.5;

    float glow = fall * edge * (haze + motes) * uStrength;
    gl_FragColor = vec4(uColor * glow, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const defaultClock = { value: 0 }
let clock = defaultClock

// The level's time-scaled clock (the sky's uTime), so the dust slows and
// stops with the chrono abilities. null restores a still default.
export function setLightShaftClock(uniform) {
  clock = uniform || defaultClock
}

export function createLightShaftMaterial({ color = 0xffe2b0, length = 8, strength = 0.42 } = {}) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uLength: { value: length },
    uStrength: { value: strength },
    uTime: clock
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  })
  material.color = uniforms.uColor.value
  return material
}

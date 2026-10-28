import * as THREE from 'three'

// Soft, noise-edged billboards keep steam inside one small draw call per plume.
const material = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  uniforms: {},
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute float aOpacity;
    attribute float aShade;
    varying float vOpacity;
    varying float vShade;
    void main() {
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewPosition;
      gl_PointSize = clamp(aSize * (220.0 / max(1.0, -viewPosition.z)), 2.0, 96.0);
      vOpacity = aOpacity;
      vShade = aShade;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vOpacity;
    varying float vShade;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec2 p = (gl_PointCoord - 0.5) * 2.0;
      float r = length(p);
      float n = noise(p * 5.0) * 0.58 + noise(p * 10.0) * 0.28 + noise(p * 19.0) * 0.14;
      float edge = 1.0 - smoothstep(0.48 + (n - 0.5) * 0.34, 1.02, r);
      float core = exp(-r * r * 3.2);
      float alpha = edge * (0.19 + core * 0.46) * vOpacity;
      if (alpha < 0.008) discard;
      vec3 grey = mix(vec3(0.36, 0.39, 0.42), vec3(0.88, 0.89, 0.87), clamp(vShade + core * 0.34, 0.0, 1.0));
      gl_FragColor = vec4(grey, alpha);
    }
  `
})

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function noiseHash(seed, cycle, n, channel) {
  const value = Math.sin(seed * 127.1 + cycle * 311.7 + n * 74.7 + channel * 19.19) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function drift(seed, cycle, age, channel, frequency) {
  const t = age * frequency + seed * 13.7 + channel * 5.3
  const cell = Math.floor(t)
  const f = t - cell
  const blend = f * f * (3 - 2 * f)
  return THREE.MathUtils.lerp(noiseHash(seed, cycle, cell, channel), noiseHash(seed, cycle, cell + 1, channel), blend)
}

// Each point represents a short-lived puff. Its birth is evaluated against the
// source's existing schedule, so closing a valve stops new puffs and lets old
// ones fade without a separate particle simulation or per-frame allocations.
export function createSteamPlume({ count, life = 1.5, emission, sample, opacity = 1 } = {}) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const opacities = new Float32Array(count)
  const shades = new Float32Array(count)
  const seeds = new Float32Array(count)
  const out = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    const seed = (Math.sin((i + 1) * 127.1) * 43758.5453) % 1
    const random = seed < 0 ? seed + 1 : seed
    seeds[i] = random
      sizes[i] = 0.2 + random * 0.34
    shades[i] = 0.25 + ((random * 7.31) % 1) * 0.43
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shades, 1))
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.userData.noCameraCollision = true
  points.raycast = () => {}

  function update(time) {
    for (let i = 0; i < count; i++) {
      const seed = seeds[i]
      const particleLife = life * (0.72 + seed * 0.56)
      const age = ((time / particleLife + seed) % 1) * particleLife
      const bornAt = time - age
      const progress = age / particleLife
      const fadeIn = smoothstep(0, 0.14, progress)
      const fadeOut = smoothstep(0, 0.28, 1 - progress)
      const density = THREE.MathUtils.clamp(emission(bornAt), 0, 1)
      sample(progress, seed, density, out, i)
      const cycle = Math.floor(time / particleLife)
      const turbulence = progress * progress
      positions[i * 3] = out.x + turbulence * (0.19 * drift(seed, cycle, age, 0, 2.6) + 0.045 * drift(seed, cycle, age, 0, 7.1))
      positions[i * 3 + 1] = out.y + turbulence * (0.08 * drift(seed, cycle, age, 1, 2.1))
      positions[i * 3 + 2] = out.z + turbulence * (0.19 * drift(seed, cycle, age, 2, 2.4) + 0.045 * drift(seed, cycle, age, 2, 6.4))
      sizes[i] = (0.2 + seed * 0.34) * (0.62 + progress * 1.02)
      opacities[i] = density * fadeIn * fadeOut * opacity
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aSize.needsUpdate = true
    geometry.attributes.aOpacity.needsUpdate = true
  }

  update(0)
  return { points, update }
}

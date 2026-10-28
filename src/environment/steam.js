import * as THREE from 'three'

// Soft steam puffs: camera-facing quads with a cloudy alpha mask, each with
// its own size, opacity and spin. One draw call per emitter; callers write
// every puff each frame with set() and then call commit().

let cloudTexture = null

// Wraps into [0, 1) for negative input too, so puff cycles survive REWIND.
export const fract = (x) => x - Math.floor(x)
// Stable per-puff random in [0, 1), so puffs don't move in lockstep.
export const puffSeed = (n) => fract(Math.sin(n * 127.1 + 31.7) * 43758.5453)
// Opacity over a puff's life: quick fade in, long fade out as it thins.
export function puffFade(u) {
  const fadeIn = Math.min(1, u / 0.12)
  const out = Math.max(0, (u - 0.45) / 0.55)
  return fadeIn * (1 - out * out * (3 - 2 * out))
}

// A lumpy blob built from overlapping radial gradients, so a single puff
// reads as a wisp of vapour rather than a disc.
function getCloudTexture() {
  if (cloudTexture) return cloudTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  let seed = 11
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2
    const d = rand() * size * 0.16
    const x = size / 2 + Math.cos(a) * d
    const y = size / 2 + Math.sin(a) * d
    const r = size * (0.16 + rand() * 0.18)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.32)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.14)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  cloudTexture = new THREE.CanvasTexture(canvas)
  cloudTexture.userData.sharedTexture = true
  return cloudTexture
}

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRot;
  varying vec2 vUv;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
    float c = cos(aRot);
    float s = sin(aRot);
    mvPosition.xy += mat2(c, s, -s, c) * position.xy * aSize;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    float a = texture2D(uMap, vUv).a * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function createSteamPuffs(count, { color = 0xd9d5cc, opacity = 0.8 } = {}) {
  const geometry = new THREE.InstancedBufferGeometry()
  const quad = new THREE.PlaneGeometry(1, 1)
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('uv', quad.getAttribute('uv'))
  geometry.instanceCount = count

  const offsets = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const alphas = new Float32Array(count)
  const rotations = new Float32Array(count)
  const attrs = [
    ['aOffset', offsets, 3],
    ['aSize', sizes, 1],
    ['aAlpha', alphas, 1],
    ['aRot', rotations, 1]
  ].map(([name, array, itemSize]) => {
    const attr = new THREE.InstancedBufferAttribute(array, itemSize)
    attr.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute(name, attr)
    return attr
  })

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uMap: { value: null } }
    ]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true
  })
  // Assigned after merge(): merge clones textures, and the clone would lose
  // its shared flag and be disposed with the level.
  material.uniforms.uMap.value = getCloudTexture()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.userData.noCameraCollision = true
  mesh.raycast = () => {} // steam never blocks interaction or vision rays

  return {
    mesh,
    set(i, x, y, z, size, alpha, rotation = 0) {
      offsets[i * 3] = x
      offsets[i * 3 + 1] = y
      offsets[i * 3 + 2] = z
      sizes[i] = size
      alphas[i] = alpha
      rotations[i] = rotation
    },
    commit() {
      for (const attr of attrs) attr.needsUpdate = true
    }
  }
}

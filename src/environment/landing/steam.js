import * as THREE from 'three'

// Steam off the engines beyond the quay shops. Each puff is a point sprite whose
// whole life runs in the vertex shader from one seed: it rises fast and
// slows, swells, drifts off the square with the wind and fades out, then
// starts again at the stack. The fragment shader gives it a soft round
// edge, so no square shows. One draw, nothing updated per frame but the clock.

const STEAM_VERTEX = /* glsl */ `
  attribute vec4 aSeed;

  uniform float uTime;
  uniform float uPeriod;
  uniform float uHeight;
  uniform float uSpread;
  uniform float uSize;
  uniform float uScale;
  uniform vec3 uWind;

  varying float vAlpha;

  #include <fog_pars_vertex>

  void main() {
    float life = fract(uTime / uPeriod + aSeed.x);
    float ease = 1.0 - (1.0 - life) * (1.0 - life);
    vec2 side = (aSeed.yz * 2.0 - 1.0) * uSpread * (0.25 + life);
    vec3 offset = vec3(side.x, uHeight * ease, side.y) + uWind * life;
    vec4 mvPosition = modelViewMatrix * vec4(position + offset, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float size = uSize * (0.45 + life * 1.6) * (0.75 + 0.5 * aSeed.w);
    gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life));

    #include <fog_vertex>
  }
`

const STEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vAlpha;

  #include <fog_pars_fragment>

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float soft = (1.0 - r2) * (1.0 - r2) * exp(-1.6 * r2);
    float alpha = soft * vAlpha * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function createSteam({
  count = 40,
  height = 10.5,
  spread = 1.6,
  period = 9,
  size = 2.2,
  color = 0x9aa1ab,
  opacity = 0.34,
  wind = new THREE.Vector3(-1.6, 0, 1.1),
  seed = 23
} = {}) {
  const rand = random(seed)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rand() - 0.5) * 0.6
    positions[i * 3 + 2] = (rand() - 0.5) * 0.6
    // Even phases, so the column never empties out between puffs.
    seeds[i * 4] = (i + rand() * 0.6) / count
    seeds[i * 4 + 1] = rand()
    seeds[i * 4 + 2] = rand()
    seeds[i * 4 + 3] = rand()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPeriod: { value: period },
        uHeight: { value: height },
        uSpread: { value: spread },
        uSize: { value: size },
        uScale: { value: 400 },
        uWind: { value: wind.clone() },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      }
    ]),
    vertexShader: STEAM_VERTEX,
    fragmentShader: STEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'landing-steam'
  points.frustumCulled = false
  points.castShadow = false
  points.receiveShadow = false
  points.raycast = () => {}

  // World size to pixels: half the target height over tan(fov / 2), which
  // is projectionMatrix[5]. Read here so resizes and pixel ratio follow.
  const buffer = new THREE.Vector2()
  points.onBeforeRender = (renderer, _scene, camera) => {
    const target = renderer.getRenderTarget()
    const pixels = target ? target.height : renderer.getDrawingBufferSize(buffer).y
    material.uniforms.uScale.value = pixels * 0.5 * camera.projectionMatrix.elements[5]
  }

  function update(delta) {
    material.uniforms.uTime.value += delta
  }

  return { points, update }
}

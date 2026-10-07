import * as THREE from 'three'
import { mergeParts } from './geom.js'
import { PLAZA } from './layout.js'

// Painted light. Each pool is an additive disc on the cobbles that samples
// the same stone texture as the plaza, so the stones show through the warm
// light instead of a flat glow. No real light is involved, so a pool never
// switches off when the player walks away. One instanced draw for all of
// them; instance colour carries each pool's strength, which is how the
// flickering lamp dims its own pool.

const POOL_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  varying vec2 vWorld;
  varying vec3 vTint;

  void main() {
    vLocal = position.xz;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const POOL_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uOrigin;
  uniform vec3 uColor;
  uniform float uMinX;
  uniform vec2 uOpening;

  varying vec2 vLocal;
  varying vec2 vWorld;
  varying vec3 vTint;

  void main() {
    // West of the quay there is only ground inside the street opening.
    if (vWorld.x < uMinX && (vWorld.y < uOpening.x || vWorld.y > uOpening.y)) discard;
    float r = length(vLocal);
    if (r >= 1.0) discard;
    float fall = 1.0 - smoothstep(0.0, 1.0, r);
    fall = fall * fall * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.35, r)));
    vec3 albedo = texture2D(uMap, vec2(vWorld.x - uOrigin.x, uOrigin.y - vWorld.y)).rgb;
    vec3 light = uColor * vTint * fall;
    gl_FragColor = vec4(light * (albedo * 1.7 + 0.035), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function poolMaterial(cobbleMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: cobbleMap },
      uOrigin: { value: new THREE.Vector2(PLAZA.minX, PLAZA.maxZ) },
      uColor: { value: new THREE.Color(1.0, 0.6, 0.3) },
      uMinX: { value: PLAZA.minX - 0.05 },
      uOpening: { value: new THREE.Vector2(1, 0) }
    },
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false
  })
}

// pools: { x, z, radius, strength }
export function addLightPools(parent, pools, cobbleMap, stats) {
  const disc = new THREE.CircleGeometry(1, 40)
  disc.rotateX(-Math.PI / 2)
  const material = poolMaterial(cobbleMap)
  const mesh = new THREE.InstancedMesh(disc, material, pools.length)
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()
  pools.forEach((pool, index) => {
    matrix.makeScale(pool.radius, 1, pool.radius)
    matrix.setPosition(pool.x, PLAZA.y + 0.012, pool.z)
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, color.setScalar(pool.strength))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  mesh.name = 'landing-light-pools'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = 2
  mesh.frustumCulled = false
  parent.add(mesh)
  if (stats) {
    stats.draws += 1
    stats.triangles += 40 * pools.length
  }

  function setStrength(index, strength) {
    mesh.setColorAt(index, color.setScalar(strength))
    mesh.instanceColor.needsUpdate = true
  }

  function setOpening(minZ, maxZ) {
    material.uniforms.uOpening.value.set(minZ, maxZ)
  }

  return { mesh, setStrength, setOpening }
}

function glowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.12)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// Faint warm wash on a wall beside a lamp. glows: { x, y, z, yaw, width, height, strength }
// yaw 0 faces +X. One merged additive mesh.
export function addWallGlows(parent, glows, stats, color = 0xff9e52, name = 'landing-wall-glow') {
  if (!glows.length) return null
  const parts = []
  for (const glow of glows) {
    const plane = new THREE.PlaneGeometry(glow.width, glow.height)
    plane.rotateY(Math.PI / 2 + (glow.yaw || 0))
    plane.translate(glow.x, glow.y, glow.z)
    const shade = new Float32Array(plane.attributes.position.count * 3).fill(glow.strength)
    plane.setAttribute('color', new THREE.BufferAttribute(shade, 3))
    parts.push(plane)
  }
  return glowMesh(parent, parts, color, name, stats, 2 * glows.length)
}

// Painted light pool on a floor under a lamp. glows: { x, y, z, radius, strength }
export function addFloorGlows(parent, glows, stats, color = 0xff9e52, name = 'floor-glow') {
  if (!glows.length) return null
  const parts = []
  for (const glow of glows) {
    const plane = new THREE.PlaneGeometry(glow.radius * 2, glow.radius * 2)
    plane.rotateX(-Math.PI / 2)
    plane.translate(glow.x, glow.y + 0.015, glow.z)
    const shade = new Float32Array(plane.attributes.position.count * 3).fill(glow.strength)
    plane.setAttribute('color', new THREE.BufferAttribute(shade, 3))
    parts.push(plane)
  }
  return glowMesh(parent, parts, color, name, stats, 2 * glows.length)
}

function glowMesh(parent, parts, color, name, stats, triangles) {
  const geometry = mergeParts(parts)
  const material = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.renderOrder = 2
  parent.add(mesh)
  if (stats) {
    stats.draws += 1
    stats.triangles += triangles
  }
  return mesh
}

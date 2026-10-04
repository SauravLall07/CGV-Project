import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applyPassageSurfaceMaps } from './passageways/passage-exterior.js'

import pineSmallUrl from '../assets/models/nature/pine-sapling-small.glb?url'
import firSmallUrl from '../assets/models/nature/fir-sapling.glb?url'
import pineMediumUrl from '../assets/models/nature/pine-sapling-medium.glb?url'
import firMediumUrl from '../assets/models/nature/fir-sapling-medium.glb?url'
import fernUrl from '../assets/models/nature/fern.glb?url'
import fernBUrl from '../assets/models/nature/fern-b.glb?url'
import rockAUrl from '../assets/models/nature/rock-moss-a.glb?url'
import rockBUrl from '../assets/models/nature/rock-moss-b.glb?url'
import rockCUrl from '../assets/models/nature/rock-moss-c.glb?url'
import logUrl from '../assets/models/nature/dead-tree-trunk.glb?url'
import stumpUrl from '../assets/models/nature/tree-stump.glb?url'

import brickDiffUrl from '../assets/textures/nature/castle-brick-diff.jpg?url'
import brickNorUrl from '../assets/textures/nature/castle-brick-nor.jpg?url'
import roofDiffUrl from '../assets/textures/nature/corrugated-iron-diff.jpg?url'
import roofNorUrl from '../assets/textures/nature/corrugated-iron-nor.jpg?url'
import groundDiffUrl from '../assets/textures/nature/forest-ground-diff.jpg?url'
import groundNorUrl from '../assets/textures/nature/forest-ground-nor.jpg?url'
import rockDiffUrl from '../assets/textures/nature/rock-face-diff.jpg?url'
import rockNorUrl from '../assets/textures/nature/rock-face-nor.jpg?url'

// Poly Haven CC0 models, already simplified. scale is the instance multiplier
// range. swayHeight is the model's own height in metres, before that scale,
// because the wind offset is applied in local space.
const MODELS = [
  { key: 'pine-sapling-small', url: pineSmallUrl, kind: 'tree', swayHeight: 1.3, windStrength: 0.035, scale: [7.2, 10.2], capacity: 20 },
  { key: 'fir-sapling', url: firSmallUrl, kind: 'tree', swayHeight: 1.29, windStrength: 0.04, scale: [9.5, 13], capacity: 20 },
  { key: 'pine-sapling-medium', url: pineMediumUrl, kind: 'tree', swayHeight: 6.78, windStrength: 0.14, scale: [1.15, 1.85], capacity: 20 },
  { key: 'fir-sapling-medium', url: firMediumUrl, kind: 'tree', swayHeight: 8.61, windStrength: 0.16, scale: [1.25, 1.9], capacity: 20 },
  { key: 'fern', url: fernUrl, kind: 'fern', swayHeight: 0.43, windStrength: 0.05, scale: [0.75, 1.45], capacity: 100 },
  { key: 'fern-b', url: fernBUrl, kind: 'fern', swayHeight: 0.35, windStrength: 0.045, scale: [0.85, 1.6], capacity: 100 },
  { key: 'rock-moss-a', url: rockAUrl, kind: 'rock', scale: [0.55, 1.35], capacity: 16 },
  { key: 'rock-moss-b', url: rockBUrl, kind: 'rock', scale: [0.45, 1.15], capacity: 16 },
  { key: 'rock-moss-c', url: rockCUrl, kind: 'rock', scale: [0.6, 1.55], capacity: 16 },
  { key: 'dead-tree-trunk', url: logUrl, kind: 'log', scale: [0.7, 1.25], capacity: 16 },
  { key: 'tree-stump', url: stumpUrl, kind: 'stump', scale: [0.65, 1.35], capacity: 12 }
]

const gltfLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()

let ready = null
let assets = null

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject)
  })
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, resolve, undefined, reject)
  })
}

function prepTexture(texture, srgb) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.anisotropy = 4
  // Level teardown disposes materials. These stay for the next visit.
  texture.userData.sharedTexture = true
  return texture
}

function firstMesh(root) {
  let mesh = null
  root.traverse((obj) => {
    if (!mesh && obj.isMesh) mesh = obj
  })
  return mesh
}

// Crown sway on a glTF material. uTime is the sky clock, so Slow, Freeze
// and Rewind move the trees with the rest of Boarding. The offset is in
// local space and the instance matrix scales it.
export function enableWind(material, { swayHeight, windStrength, timeUniform }) {
  if (!timeUniform || material.userData.wind) return material
  material.userData.wind = true
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform
    shader.uniforms.uWindStrength = { value: windStrength }
    shader.uniforms.uSwayHeight = { value: swayHeight }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uWindStrength;
uniform float uSwayHeight;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float windHeight = smoothstep(0.05, uSwayHeight, transformed.y);
windHeight *= windHeight;
#ifdef USE_INSTANCING
vec4 windOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#else
vec4 windOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#endif
float windPhase = windOrigin.x * 0.37 + windOrigin.z * 0.23;
float windWave = sin(uTime * 1.8 + windPhase);
float gustWave = cos(uTime * 1.12 + windPhase * 1.7);
transformed.x += (windWave + gustWave * 0.45) * uWindStrength * windHeight;
transformed.z += cos(windWave) * 0.55 * uWindStrength * windHeight;`
      )
    // The standard chunks already flip normals on back faces when the
    // material is double sided. Leaves still go black on the moon's far
    // side, so add light transmitted through the card plus a soft wrap.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#if NUM_DIR_LIGHTS > 0
  float leafFront = gl_FrontFacing ? 1.0 : 0.0;
  vec3 leafLight = directionalLights[0].color;
  float throughLeaf = clamp(dot(-normal, directionalLights[0].direction), 0.0, 1.0);
  float wrapLeaf = clamp(dot(normal, directionalLights[0].direction) + 0.55, 0.0, 1.0) / 1.55;
  outgoingLight += diffuseColor.rgb * leafLight * (throughLeaf * (1.0 - leafFront) * 0.62 + wrapLeaf * 0.16);
#endif
#include <opaque_fragment>`
    )
  }
  material.side = THREE.DoubleSide
  material.customProgramCacheKey = () => `nature-wind-leaf-${swayHeight}`
  return material
}

async function loadModels() {
  const props = []
  for (const def of MODELS) {
    try {
      const gltf = await loadGltf(def.url)
      const mesh = firstMesh(gltf.scene)
      if (!mesh) throw new Error('no mesh')
      const material = mesh.material
      if (material.map) prepTexture(material.map, true)
      if (material.normalMap) prepTexture(material.normalMap, false)
      if (def.kind === 'tree' || def.kind === 'fern') {
        material.alphaTest = 0.5
        material.side = THREE.DoubleSide
      }
      props.push({ ...def, geometry: mesh.geometry, material })
    } catch (error) {
      console.warn(`[nature] skipped ${def.key}`, error)
    }
  }
  return props
}

async function loadSurface(url, srgb) {
  try {
    return prepTexture(await loadTexture(url), srgb)
  } catch (error) {
    console.warn('[nature] texture failed', url, error)
    return null
  }
}

export function getBoardingAssets() {
  return assets
}

export function loadBoardingAssets() {
  if (!ready) {
    ready = (async () => {
      const [props, brickMap, brickNormal, roofMap, roofNormal, groundMap, groundNormal, rockMap, rockNormal] = await Promise.all([
        loadModels(),
        loadSurface(brickDiffUrl, true),
        loadSurface(brickNorUrl, false),
        loadSurface(roofDiffUrl, true),
        loadSurface(roofNorUrl, false),
        loadSurface(groundDiffUrl, false),
        loadSurface(groundNorUrl, false),
        loadSurface(rockDiffUrl, false),
        loadSurface(rockNorUrl, false)
      ])
      if (brickMap && brickNormal && roofMap && roofNormal) {
        applyPassageSurfaceMaps({ brickMap, brickNormal, roofMap, roofNormal })
      }
      assets = { props, groundMap, groundNormal, rockMap, rockNormal }
      return assets
    })()
  }
  return ready
}

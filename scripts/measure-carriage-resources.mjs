// CPU-only resource census/equivalence evidence, not a browser FPS benchmark.
// Run: node --import ./scripts/register-test-assets.mjs scripts/measure-carriage-resources.mjs
import { createHash } from 'node:crypto'
import { createCarriageEnvironment } from '../src/environment/carriages.js'
import { disposeObject } from '../src/core/dispose.js'

function digestGeometry(geometry) {
  const hash = createHash('sha256')
  for (const [key, attribute] of [['index', geometry.index], ...Object.entries(geometry.attributes).sort()]) {
    if (!attribute) continue
    const array = attribute.array
    hash.update(JSON.stringify([key, attribute.itemSize, attribute.normalized, array.constructor.name]))
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
  }
  hash.update(JSON.stringify([geometry.groups, geometry.drawRange]))
  return hash.digest('hex')
}

function describeMaterial(material) {
  const result = {}
  for (const key of ['type', 'name', 'opacity', 'transparent', 'side', 'depthTest', 'depthWrite',
    'blending', 'alphaTest', 'toneMapped', 'roughness', 'metalness', 'emissiveIntensity',
    'vertexColors', 'wireframe', 'fog', 'envMapIntensity']) result[key] = material[key]
  for (const key of ['color', 'emissive', 'normalScale']) result[key] = material[key]?.toArray()
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) {
    const texture = material[key]
    if (texture) result[key] = { colorSpace: texture.colorSpace, wrapS: texture.wrapS, wrapT: texture.wrapT,
      repeat: texture.repeat.toArray(), offset: texture.offset.toArray(), rotation: texture.rotation }
  }
  return result
}

function census(environment) {
  const geometryHashes = new Map(), materials = new Set(), buffers = new Set()
  const sceneHash = createHash('sha256')
  let nodes = 0, meshes = 0, triangles = 0, lights = 0, shadowCasters = 0, geometryBufferBytes = 0
  environment.root.traverse(node => {
    nodes++
    if (node.isLight) lights++
    const description = { type: node.type, name: node.name, position: node.position.toArray(),
      quaternion: node.quaternion.toArray(), scale: node.scale.toArray(), visible: node.visible,
      castShadow: node.castShadow, receiveShadow: node.receiveShadow, renderOrder: node.renderOrder,
      layers: node.layers.mask, frustumCulled: node.frustumCulled, userData: node.userData,
      children: node.children.length }
    if (node.isLight) description.light = { color: node.color.toArray(), intensity: node.intensity,
      distance: node.distance, decay: node.decay }
    if (node.isMesh) {
      meshes++
      shadowCasters += Number(node.castShadow)
      const geometry = node.geometry
      if (!geometryHashes.has(geometry)) {
        geometryHashes.set(geometry, digestGeometry(geometry))
        for (const attribute of [geometry.index, ...Object.values(geometry.attributes)]) {
          if (!attribute || buffers.has(attribute.array.buffer)) continue
          buffers.add(attribute.array.buffer)
          geometryBufferBytes += attribute.array.buffer.byteLength
        }
      }
      description.geometry = geometryHashes.get(geometry)
      const meshMaterials = Array.isArray(node.material) ? node.material : [node.material]
      meshMaterials.forEach(material => materials.add(material))
      description.materials = meshMaterials.map(describeMaterial)
      const count = node.isInstancedMesh ? node.count : 1
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * count
      if (node.isInstancedMesh) description.instances = { count, matrices: Array.from(node.instanceMatrix.array),
        colors: node.instanceColor ? Array.from(node.instanceColor.array) : null }
    }
    sceneHash.update(JSON.stringify(description))
  })
  sceneHash.update(JSON.stringify({ spans: environment.spans, colliders: environment.colliders,
    interiorBounds: environment.interiorBounds, roofBounds: environment.roofBounds,
    vaultBounds: environment.vaultBounds }))
  return { nodes, meshes, uniqueGeometries: geometryHashes.size, uniqueMaterials: materials.size,
    allocatedTriangles: triangles, shadowCasters, lights, geometryBufferBytes,
    sceneDataSha256: sceneHash.digest('hex') }
}

const scenarios = []
for (const damaged of [false, true]) {
  const environment = createCarriageEnvironment({ damaged })
  scenarios.push({ scenario: damaged ? 'L3 carriage environment' : 'L2 carriage environment', ...census(environment) })
  disposeObject(environment.root)
}
console.log(JSON.stringify({ scope: 'Carriage factory only; mocked canvas; no renderer, models, audio or GPU. Buffer bytes exclude textures, instances and JS/driver overhead. Scene digest excludes resource identities and rasterized texture pixels.', scenarios }, null, 2))

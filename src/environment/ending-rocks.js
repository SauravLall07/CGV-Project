import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function endingRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

// All buffers/materials belong to the returned group; no asset cache is involved.
export function createEndingRocks(placements, seed = 1934) {
  const root = new THREE.Group()
  root.name = 'ending-faceted-rocks'
  const random = endingRandom(seed), pose = new THREE.Object3D(), color = new THREE.Color()
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: true })
  for (let variant = 0; variant < 4; variant++) {
    const source = new THREE.IcosahedronGeometry(1, 1)
    const geometry = source.index ? source.toNonIndexed() : source
    if (geometry !== source) source.dispose()
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
      // Position-based noise keeps duplicate vertices welded across facet edges.
      const noise = Math.sin(x * 41.7 + y * 29.3 + z * 73.1 + variant * 19.7 + seed) * 43758.5453
      const scale = 0.75 + (noise - Math.floor(noise)) * 0.5
      position.setXYZ(i, x * scale, y * scale, z * scale)
    }
    geometry.computeVertexNormals()
    const colors = new Float32Array(position.count * 3)
    const normals = geometry.attributes.normal
    for (let i = 0; i < position.count; i += 3) {
      color.set(normals.getY(i) > 0.6 ? 0x3e4f2c : 0x4b5361)
        .multiplyScalar(0.9 + random() * 0.2)
      for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const sites = placements.filter((_, i) => i % 4 === variant)
    const mesh = new THREE.InstancedMesh(geometry, material, sites.length)
    mesh.name = `ending-rock-variant-${variant}`
    sites.forEach((site, i) => {
      pose.position.set(site.x, site.y, site.z)
      pose.rotation.set(random() * 0.5, random() * Math.PI * 2, random() * 0.5)
      pose.scale.set(site.size, site.size * (0.6 + random() * 0.8), site.size * (0.7 + random() * 0.6))
      pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix)
      color.setScalar(0.92 + random() * 0.16)
      mesh.setColorAt(i, color)
    })
    mesh.computeBoundingBox(); mesh.computeBoundingSphere()
    root.add(mesh)
  }
  root.userData.rockCount = placements.length
  return root
}

export function createEndingPines(placements, seed = 1935) {
  const random = endingRandom(seed), pose = new THREE.Object3D(), color = new THREE.Color()
  const parts = []
  function add(geometry, tint) {
    const ready = geometry.index ? geometry.toNonIndexed() : geometry
    if (ready !== geometry) geometry.dispose()
    const colors = new Float32Array(ready.attributes.position.count * 3)
    color.set(tint)
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
    ready.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(ready)
  }
  const trunk = new THREE.CylinderGeometry(0.015, 0.025, 0.35, 6); trunk.translate(0, 0.175, 0)
  add(trunk, 0x302b24)
  for (let tier = 0; tier < 3; tier++) {
    const cone = new THREE.ConeGeometry(0.23 - tier * 0.055, 0.5 - tier * 0.05, 7)
    cone.translate(0, 0.4 + tier * 0.2, 0); add(cone, tier === 2 ? 0x294733 : tier === 1 ? 0x203b2b : 0x1b3326)
  }
  const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose())
  const mesh = new THREE.InstancedMesh(geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: true }), placements.length)
  mesh.name = 'ending-low-poly-pines'
  placements.forEach((site, i) => {
    const height = site.height ?? 6 + random() * 12
    pose.position.set(site.x, site.y, site.z)
    pose.rotation.set((random() - 0.5) * 0.098, random() * Math.PI * 2, (random() - 0.5) * 0.098)
    pose.scale.setScalar(height / 1.025); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix)
    color.setScalar(0.9 + random() * 0.2); mesh.setColorAt(i, color)
  })
  mesh.computeBoundingBox(); mesh.computeBoundingSphere()
  mesh.userData.pineCount = placements.length
  return mesh
}

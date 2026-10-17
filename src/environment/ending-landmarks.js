import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createEndingRocks, createEndingPines, endingRandom } from './ending-rocks.js'

export const TUNNEL_PORTAL_Z = 117
export const TUNNEL_START_INSET = 8
export const FAR_RIM_Z = -38

export function createEndingLandmarks(terrainHeight) {
  const root = new THREE.Group()
  root.name = 'ending-landmarks'
  const rock = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 1, flatShading: true })
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true })
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const batches = new Map()
  function add(material, geometry, x, y, z) {
    geometry.translate(x, y, z)
    const ready = geometry.index ? geometry.toNonIndexed() : geometry
    if (ready !== geometry) geometry.dispose()
    if (!batches.has(material)) batches.set(material, [])
    batches.get(material).push(ready)
  }
  function box(material, w, h, d, x, y, z, deform = false) {
    const geometry = new THREE.BoxGeometry(w, h, d, deform ? 3 : 1, deform ? 3 : 1, deform ? 2 : 1)
    if (deform) {
      const positions = geometry.attributes.position
      for (let i = 0; i < positions.count; i++) {
        const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i)
        const wave = Math.sin(px * 0.7 + py * 0.23 + pz * 0.37)
        positions.setXYZ(i, px + wave * 0.12, py + wave * 0.6, pz + wave * 1.1)
      }
      geometry.computeVertexNormals()
    }
    add(material, geometry, x, y, z)
  }
  const smooth = (a, b, value) => { const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  function mountainside(x, z) {
    const rear = smooth(114, 121, z - Math.sin(x * 0.08) * Math.min(3, Math.abs(x) * 0.08))
    const shoulder = smooth(28, 120, x) * (58 + 6 * Math.sin(z * 0.035))
    const noise = Math.sin(x * 0.11 + z * 0.07) * 2.4 + Math.sin(x * 0.43 - z * 0.37) * 0.9
    return -47 + Math.max(rear * 92, shoulder) + noise * Math.max(rear, smooth(20, 90, x))
  }
  function farCliff(x, z) {
    const rim = smooth(-35, -41, z + Math.sin(x * 0.08) * 0.8)
    return -47 + rim * (46.4 + Math.sin(x * 0.1) * 1.1 + Math.sin(z * 0.12) * 0.5)
  }
  // Dense, triangulated height fields: steep faces have irregular ledges, never a box silhouette.
  function mass(name, x0, x1, z0, z1, height, tunnel = false) {
    const xs = Array.from({ length: 65 }, (_, i) => x0 + (x1 - x0) * i / 64)
    const zs = Array.from({ length: 81 }, (_, i) => z0 + (z1 - z0) * i / 80)
    if (tunnel) { xs.push(-3.6, 3.6); xs.sort((a, b) => a - b); zs.push(114, 117, 121, 124); zs.sort((a, b) => a - b) }
    const positions = [], indices = [], colors = [], tint = new THREE.Color()
    for (const z of zs) for (const x of xs) {
      const y = height(x, z)
      positions.push(x, y, z)
      tint.setScalar(0.82 + 0.18 * (0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.23)))
      tint.toArray(colors, colors.length)
    }
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      // Open the cliff face around the arch; the roof behind it closes the mountain.
      if (tunnel && xs[i] >= -3.6 && xs[i + 1] <= 3.6 && zs[j] >= 114 && zs[j] < 121) continue
      const a = j * xs.length + i, b = a + xs.length
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
    const indexed = new THREE.BufferGeometry()
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    indexed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); indexed.setIndex(indices)
    const geometry = indexed.toNonIndexed(); indexed.dispose(); geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, rock); mesh.name = name; root.add(mesh)
    // Query the very same rendered triangles, including the cliff lip at the bents.
    return (x, z) => {
      if (x < x0 || x > x1 || z < z0 || z > z1) return -Infinity
      let i = 0, j = 0
      while (i < xs.length - 2 && xs[i + 1] < x) i++
      while (j < zs.length - 2 && zs[j + 1] < z) j++
      const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j])
      const y = (di, dj) => positions[((j + dj) * xs.length + i + di) * 3 + 1]
      return u + v <= 1 ? y(0, 0) * (1 - u - v) + y(1, 0) * u + y(0, 1) * v
        : y(1, 1) * (u + v - 1) + y(1, 0) * (1 - v) + y(0, 1) * (1 - u)
    }
  }
  rock.vertexColors = true
  const mountainHeight = mass('ending-tunnel-mountainside', -65, 145, -100, 205, mountainside, true)
  const cliffHeight = mass('ending-far-cliff', -65, 62, -145, -32, farCliff)
  function farSlope(x, z) {
    const rise = smooth(35, 210, -x) * (39 + 5 * Math.sin(z * 0.045))
    const riverZ = 33 + 13 * Math.sin(x * 0.029) + 5 * Math.sin(x * 0.057)
    const channel = Math.exp(-Math.pow((z - riverZ) / 19, 2))
    return -47 + rise * (1 - channel) + Math.sin(x * 0.19 + z * 0.13) * 1.2 * (1 - channel)
  }
  const farHeight = mass('ending-forested-gorge-slope', -270, -35, -145, 220, farSlope)
  const blocks = [], frameBlocks = [], random = endingRandom(117)
  function block(list, x, y, z, w, h, d, rotation = 0) { list.push({ x, y, z, w, h, d, rotation }) }
  for (let i = 0; i < 16; i++) {
    const angle = (i + 0.5) * Math.PI / 16
    block(blocks, Math.cos(angle) * 3.12, 4.1 + Math.sin(angle) * 3.12, 116.8, 0.57, 0.8, 2.1, angle - Math.PI / 2)
    block(frameBlocks, Math.cos(angle) * 3.58, 4.1 + Math.sin(angle) * 3.58, 116.65, 0.65, 0.2, 2.3, angle - Math.PI / 2)
  }
  for (const side of [-1, 1]) for (let row = 0; row < 6; row++) {
    block(blocks, side * 3.12, 0.34 + row * 0.68, 117, 0.8, 0.65, 2.4)
    block(frameBlocks, side * 3.63, 0.34 + row * 0.68, 116.7, 0.22, 0.65, 2.5)
  }
  block(frameBlocks, 0, 7.3, 116.6, 0.65, 1.05, 2.5)
  for (let i = -3; i <= 3; i++) block(blocks, i * 1.12, 7.95, 117, 1.08, 0.4, 2.7)
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
    block(blocks, (col - 2) * 1.25 + (row % 2) * 0.12, -0.9 - row * 0.8, -40.2, 1.21, 0.77, 4.5)
  }
  function masonry(sites, name, lighter) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, sites.length)
    const pose = new THREE.Object3D(), color = new THREE.Color()
    sites.forEach((site, i) => {
      pose.position.set(site.x, site.y, site.z); pose.rotation.z = site.rotation
      pose.scale.set(site.w * (0.98 + random() * 0.04), site.h * (0.98 + random() * 0.04), site.d)
      pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix)
      color.set(0x4a4640).multiplyScalar((lighter ? 1.15 : 1) * (0.94 + random() * 0.12)); mesh.setColorAt(i, color)
    })
    mesh.name = name; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh)
  }
  masonry(blocks, 'ending-portal-and-abutment-blocks', false)
  masonry(frameBlocks, 'ending-portal-frame', true)
  box(black, 5.4, 0.15, 36, 0, -0.12, TUNNEL_PORTAL_Z + 18)
  box(black, 5.4, 0.2, 36, 0, 6.8, TUNNEL_PORTAL_Z + 18)
  for (const side of [-1, 1]) box(black, 0.12, 6.8, 36, side * 2.74, 3.4, TUNNEL_PORTAL_Z + 18)
  box(black, 5.6, 7, 0.2, 0, 3.4, TUNNEL_PORTAL_Z + 36)
  const riverPositions = [], riverIndices = []
  for (let x = -300, i = 0; x <= 65; x += 4, i++) {
    const centerZ = 33 + 13 * Math.sin(x * 0.029) + 5 * Math.sin(x * 0.057)
    for (const z of [centerZ - 4, centerZ + 4]) riverPositions.push(x, heightAt(x, z) + 0.15, z)
    if (i > 0) { const a = (i - 1) * 2; riverIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const riverGeometry = new THREE.BufferGeometry()
  riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3))
  riverGeometry.setIndex(riverIndices); riverGeometry.computeVertexNormals()
  const river = new THREE.Mesh(riverGeometry, new THREE.MeshStandardMaterial({ color: 0x081827,
    roughness: 0.25, metalness: 0, side: THREE.DoubleSide }))
  river.name = 'ending-gorge-river'
  root.add(river)
  function heightAt(x, z) { return Math.max(terrainHeight(x, z), mountainHeight(x, z), cliffHeight(x, z), farHeight(x, z)) }
  const rocks = [], pines = []
  // Irregular ledges; leave the track aperture and the camera's sight corridor open.
  for (let i = 0; i < 64; i++) {
    const x = i < 44 ? -60 + random() * 145 : -52 + random() * 108
    const z = i < 44 ? 120 + random() * 65 : -44 - random() * 75
    if (Math.abs(x) < 7 && z > 114) { i--; continue }
    const size = 2 + random() * 8
    rocks.push({ x, y: heightAt(x, z) + size * 0.2, z, size })
  }
  for (let i = 0; i < 56; i++) {
    const x = -60 + random() * 145, z = 125 + random() * 68
    if (Math.abs(x) < 8) { i--; continue }
    pines.push({ x, y: heightAt(x, z), z })
  }
  // Foreground shoulder is well below the elevated camera, left of its train sightline.
  for (let i = 0; i < 12; i++) {
    const x = 75 + random() * 45, z = 45 + random() * 42
    rocks.push({ x, y: heightAt(x, z) + 1, z, size: 2 + random() * 5 })
    pines.push({ x, y: heightAt(x, z), z, height: 6 + random() * 7 })
  }
  root.add(createEndingRocks(rocks), createEndingPines(pines))
  const forest = []
  for (let i = 0; i < 100; i++) {
    const x = -240 + random() * 170, z = -100 + random() * 280
    const riverZ = 33 + 13 * Math.sin(x * 0.029) + 5 * Math.sin(x * 0.057)
    if (Math.abs(z - riverZ) < 16) { i--; continue }
    forest.push({ x, y: heightAt(x, z), z })
  }
  root.add(createEndingPines(forest, 2041))
  root.userData.sceneryCounts = { rocks: rocks.length, pines: pines.length, farSlopePines: forest.length }
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false)
    parts.forEach(part => part.dispose())
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = material === rock ? 'ending-rock-rims' : material === stone ? 'ending-portal-stone' : 'ending-tunnel-darkness'
    root.add(mesh)
  }
  return { root, heightAt }
}

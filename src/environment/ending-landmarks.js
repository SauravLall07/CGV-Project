import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const TUNNEL_PORTAL_Z = 117
export const TUNNEL_START_INSET = 8
export const FAR_RIM_Z = -38

export function createEndingLandmarks(terrainHeight) {
  const root = new THREE.Group()
  root.name = 'ending-landmarks'
  const rock = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 1, flatShading: true })
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.95 })
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
  // A genuine opening: neither rock bank covers the 5.4 m track aperture.
  for (const side of [-1, 1]) box(rock, 86, 86, 38, side * 46.4, 2, TUNNEL_PORTAL_Z + 20, true)
  box(rock, 7, 38, 38, 0, 26.5, TUNNEL_PORTAL_Z + 20, true)
  box(rock, 110, 41, 50, 0, -21.1, FAR_RIM_Z - 25, true)
  box(stone, 6.2, 3.4, 4, 0, -2.2, -40)
  // Twelve arch wedges plus keystone; arch centre y=4.1, crown y=6.8.
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12 - 0.012
    const shape = new THREE.Shape()
    shape.moveTo(2.7 * Math.cos(a), 4.1 + 2.7 * Math.sin(a))
    shape.lineTo(3.45 * Math.cos(a), 4.1 + 3.45 * Math.sin(a))
    shape.lineTo(3.45 * Math.cos(b), 4.1 + 3.45 * Math.sin(b))
    shape.lineTo(2.7 * Math.cos(b), 4.1 + 2.7 * Math.sin(b))
    shape.closePath()
    add(stone, new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false }), 0, 0, TUNNEL_PORTAL_Z - 0.6)
  }
  for (const side of [-1, 1]) box(stone, 0.75, 4.1, 2.2, side * 3.08, 2.05, TUNNEL_PORTAL_Z + 0.1)
  box(stone, 0.6, 1, 2, 0, 7.1, TUNNEL_PORTAL_Z)
  box(stone, 7.9, 0.45, 2.4, 0, 7.85, TUNNEL_PORTAL_Z)
  box(black, 5.4, 0.15, 36, 0, -0.12, TUNNEL_PORTAL_Z + 18)
  box(black, 5.4, 0.2, 36, 0, 6.8, TUNNEL_PORTAL_Z + 18)
  for (const side of [-1, 1]) box(black, 0.12, 6.8, 36, side * 2.74, 3.4, TUNNEL_PORTAL_Z + 18)
  box(black, 5.6, 7, 0.2, 0, 3.4, TUNNEL_PORTAL_Z + 36)
  const riverPositions = [], riverIndices = []
  const riverZ = TUNNEL_PORTAL_Z / 2
  for (let x = -100, i = 0; x <= 100; x += 4, i++) {
    for (const z of [riverZ - 3.5, riverZ + 3.5]) riverPositions.push(x, terrainHeight(x, z) + 0.15, z)
    if (i > 0) { const a = (i - 1) * 2; riverIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const riverGeometry = new THREE.BufferGeometry()
  riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3))
  riverGeometry.setIndex(riverIndices); riverGeometry.computeVertexNormals()
  const river = new THREE.Mesh(riverGeometry, new THREE.MeshStandardMaterial({ color: 0x081827,
    roughness: 0.25, metalness: 0, side: THREE.DoubleSide }))
  river.name = 'ending-gorge-river'
  root.add(river)
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false)
    parts.forEach(part => part.dispose())
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = material === rock ? 'ending-rock-rims' : material === stone ? 'ending-portal-stone' : 'ending-tunnel-darkness'
    root.add(mesh)
  }
  function heightAt(x, z) {
    if (z <= FAR_RIM_Z && Math.abs(x) <= 55) return -0.6
    if (z >= TUNNEL_PORTAL_Z && Math.abs(x) <= 90) return -0.6
    return terrainHeight(x, z)
  }
  return { root, heightAt }
}

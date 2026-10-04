import * as THREE from 'three'
import { brickMaterial, metalMaterial, signMaterial, woodMaterial } from '../textures.js'

// Visual skin for a passage building. Nothing here is a collider and nothing
// here is a real light. Door openings are left clear by skipping that end.
// Shared materials, merged boxes per material, so a shell is a handful of draws.

const brick = brickMaterial({ repeat: [3, 1.2], brick: 0x6e342c, mortar: 0x5c584e })
const stone = brickMaterial({ repeat: [1.5, 0.4], seed: 19, brick: 0x6e6a62, mortar: 0x4a4844 })
const roofMat = metalMaterial({ repeat: [6, 2], seed: 61, base: 0x3a4048, roughness: 0.55, metalness: 0.72 })
const iron = metalMaterial({ repeat: [2, 1], seed: 44, base: 0x1c2228, roughness: 0.42, metalness: 0.8 })
const warmGlass = new THREE.MeshStandardMaterial({
  color: 0xffe2b0,
  emissive: 0xffb15a,
  emissiveIntensity: 1.6,
  roughness: 0.25
})
const darkGlass = new THREE.MeshStandardMaterial({
  color: 0x14181e,
  emissive: 0x0a1018,
  emissiveIntensity: 0.15,
  roughness: 0.15
})
const crateMat = woodMaterial({ repeat: [1, 1], seed: 12, light: 0x6a4a30, dark: 0x3a2414 })

function addBox(parts, w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d)
  geo.translate(x, y, z)
  parts.push(geo)
}

function merge(parts) {
  if (!parts.length) return null
  const flat = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo))
  for (const geo of parts) {
    if (geo.index) geo.dispose()
  }
  parts = flat
  let count = 0
  for (const geo of parts) count += geo.attributes.position.count
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  let offset = 0
  for (const geo of parts) {
    if (!geo.attributes.normal) geo.computeVertexNormals()
    const pos = geo.attributes.position
    const norm = geo.attributes.normal
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const nx = Math.abs(norm.getX(i))
      const ny = Math.abs(norm.getY(i))
      const nz = Math.abs(norm.getZ(i))
      // Project onto the face so a photo tiles in metres, including the
      // sloped roof, instead of stretching one 0–1 UV across each box.
      let u
      let v
      if (ny >= nx && ny >= nz) {
        u = x
        v = z
      } else if (nx >= nz) {
        u = z
        v = y
      } else {
        u = x
        v = y
      }
      const o = offset + i
      positions[o * 3] = x
      positions[o * 3 + 1] = y
      positions[o * 3 + 2] = z
      normals[o * 3] = norm.getX(i)
      normals[o * 3 + 1] = norm.getY(i)
      normals[o * 3 + 2] = norm.getZ(i)
      uvs[o * 2] = u * 0.42
      uvs[o * 2 + 1] = v * 0.42
    }
    offset += pos.count
    geo.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  return geometry
}

export function applyPassageSurfaceMaps({ brickMap, brickNormal, roofMap, roofNormal }) {
  brick.color.set(0xffffff)
  brick.map = brickMap
  brick.normalMap = brickNormal
  brick.roughness = 0.84
  brick.metalness = 0.02
  brick.needsUpdate = true
  roofMat.color.set(0xffffff)
  roofMat.map = roofMap
  roofMat.normalMap = roofNormal
  roofMat.roughness = 0.58
  roofMat.metalness = 0.55
  roofMat.needsUpdate = true
}

function addMerged(group, parts, material, name) {
  const geometry = merge(parts)
  if (!geometry) return
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.castShadow = false
  mesh.receiveShadow = false
  group.add(mesh)
}

export function addPassageShell(parent, {
  name = 'passage-shell',
  minX,
  maxX,
  minZ,
  maxZ,
  floorY = 0,
  wallHeight = 5.2,
  skipWest = false,
  skipEast = false,
  signs = false
} = {}) {
  const group = new THREE.Group()
  group.name = name
  const length = maxX - minX
  const width = maxZ - minZ
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const base = floorY
  const top = floorY + wallHeight
  const skin = 0.16

  const walls = []
  const plinth = []
  const quoins = []
  addBox(walls, length, wallHeight - 0.7, skin, cx, base + (wallHeight - 0.7) / 2 + 0.7, maxZ + skin * 0.5)
  addBox(walls, length, wallHeight - 0.7, skin, cx, base + (wallHeight - 0.7) / 2 + 0.7, minZ - skin * 0.5)
  addBox(plinth, length + 0.2, 0.7, skin + 0.06, cx, base + 0.35, maxZ + skin * 0.5)
  addBox(plinth, length + 0.2, 0.7, skin + 0.06, cx, base + 0.35, minZ - skin * 0.5)
  if (!skipWest) {
    const doorW = 3.0
    const doorH = 2.85
    const sideW = (width - doorW) / 2
    const wallMid = base + 0.7 + (wallHeight - 0.7) / 2
    addBox(walls, skin, wallHeight - 0.7, sideW, minX - skin * 0.5, wallMid, cz - (doorW + sideW) / 2)
    addBox(walls, skin, wallHeight - 0.7, sideW, minX - skin * 0.5, wallMid, cz + (doorW + sideW) / 2)
    addBox(walls, skin, wallHeight - doorH, doorW, minX - skin * 0.5, base + doorH + (wallHeight - doorH) / 2, cz)
    addBox(plinth, skin + 0.06, 0.7, sideW, minX - skin * 0.5, base + 0.35, cz - (doorW + sideW) / 2)
    addBox(plinth, skin + 0.06, 0.7, sideW, minX - skin * 0.5, base + 0.35, cz + (doorW + sideW) / 2)
  }
  if (!skipEast) {
    addBox(walls, skin, wallHeight - 0.7, width, maxX + skin * 0.5, base + (wallHeight - 0.7) / 2 + 0.7, cz)
    addBox(plinth, skin + 0.06, 0.7, width + 0.12, maxX + skin * 0.5, base + 0.35, cz)
  }
  for (const [x, z] of [[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]]) {
    addBox(quoins, 0.42, wallHeight, 0.42, x, base + wallHeight / 2, z)
  }

  const roofParts = []
  const rise = 1.05
  const slopeLen = Math.hypot(width * 0.5 + 0.55, rise)
  const angle = Math.atan2(rise, width * 0.5 + 0.55)
  for (const side of [-1, 1]) {
    const geo = new THREE.BoxGeometry(length + 0.9, 0.07, slopeLen)
    geo.rotateX(side * angle)
    geo.translate(cx, top + rise * 0.55, cz + side * (width * 0.22))
    roofParts.push(geo)
  }
  const gutter = []
  addBox(gutter, length + 0.7, 0.08, 0.1, cx, top + 0.08, maxZ + 0.45)
  addBox(gutter, length + 0.7, 0.08, 0.1, cx, top + 0.08, minZ - 0.45)
  addBox(gutter, 0.08, top - base - 0.2, 0.08, minX + 0.4, base + (top - base) * 0.45, maxZ + 0.5)
  addBox(gutter, 0.08, top - base - 0.2, 0.08, maxX - 0.8, base + (top - base) * 0.45, minZ - 0.5)

  const warm = []
  const dark = []
  const frames = []
  const windows = Math.max(2, Math.floor(length / 4.5))
  for (let i = 0; i < windows; i += 1) {
    const x = minX + (i + 0.5) * (length / windows)
    const lit = i % 2 === 0
    const bucket = lit ? warm : dark
    addBox(bucket, 0.9, 1.15, 0.04, x, base + 2.5, maxZ + skin + 0.02)
    addBox(frames, 1.08, 1.32, 0.05, x, base + 2.5, maxZ + skin)
  }

  addMerged(group, walls, brick, `${name}-brick`)
  addMerged(group, plinth, stone, `${name}-plinth`)
  addMerged(group, quoins, stone, `${name}-quoins`)
  addMerged(group, roofParts, roofMat, `${name}-roof`)
  addMerged(group, gutter, iron, `${name}-gutter`)
  addMerged(group, frames, iron, `${name}-frames`)
  addMerged(group, warm, warmGlass, `${name}-warm-glass`)
  addMerged(group, dark, darkGlass, `${name}-dark-glass`)

  if (signs) {
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), signMaterial({
      text: 'CHRONO RAIL CO. - SECURITY',
      width: 1024,
      height: 180,
      background: 0x1a140c,
      foreground: 0xe2c27a
    }))
    plaque.position.set(minX - skin - 0.02, base + 3.15, cz + 1.7)
    plaque.rotation.y = -Math.PI / 2
    const small = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.28), signMaterial({
      text: 'AUTHORISED PERSONNEL ONLY',
      width: 768,
      height: 160,
      background: 0x2a120e,
      foreground: 0xf0e6d4,
      emissiveIntensity: 0.45
    }))
    small.position.set(minX - skin - 0.02, base + 2.55, cz - 1.55)
    small.rotation.y = -Math.PI / 2
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.28), iron)
    lamp.position.set(minX - 0.28, base + 3.55, cz)
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.16), warmGlass)
    glow.position.set(minX - 0.42, base + 3.44, cz)
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), iron)
    pipe.position.set(maxX - 0.3, base + 3.2, maxZ + 0.35)
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.22), iron)
    box.position.set(minX + 1.4, base + 1.5, maxZ + 0.28)
    const crates = []
    addBox(crates, 0.7, 0.55, 0.55, minX + 0.9, base + 0.28, maxZ + 0.7)
    addBox(crates, 0.5, 0.4, 0.5, minX + 1.5, base + 0.2, maxZ + 0.85)
    const barrel = new THREE.CylinderGeometry(0.28, 0.32, 0.7, 8)
    barrel.translate(minX + 2.2, base + 0.35, maxZ + 0.75)
    crates.push(barrel)
    for (const mesh of [plaque, small, lamp, glow, pipe, box]) {
      mesh.castShadow = false
      mesh.receiveShadow = false
      group.add(mesh)
    }
    addMerged(group, crates, crateMat, `${name}-crates`)
  }

  parent.add(group)
  return group
}

// Painted iron gantry rail: posts, a top rail and balusters. The old thin
// bars stay in the scene (invisible) so their camera blocks and the movement
// colliders are unchanged.
export function addIronRailing(parent, { min, max, fixed, axis = 'x', y = 0, height = 1.05 }) {
  const length = max - min
  const postCount = Math.max(2, Math.floor(length / 1.7) + 1)
  const balusterCount = Math.max(2, Math.floor(length / 0.22))
  const postGeo = new THREE.BoxGeometry(0.07, height, 0.07)
  const balusterGeo = new THREE.BoxGeometry(0.025, height - 0.18, 0.025)
  const posts = new THREE.InstancedMesh(postGeo, iron, postCount)
  const balusters = new THREE.InstancedMesh(balusterGeo, iron, balusterCount)
  const dummy = new THREE.Object3D()
  const place = (t, meshY) => {
    const along = min + t * length
    dummy.position.set(axis === 'x' ? along : fixed, meshY, axis === 'x' ? fixed : along)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
  }
  for (let i = 0; i < postCount; i += 1) {
    place(i / (postCount - 1), y + height / 2)
    posts.setMatrixAt(i, dummy.matrix)
  }
  for (let i = 0; i < balusterCount; i += 1) {
    place((i + 0.5) / balusterCount, y + 0.12 + (height - 0.18) / 2)
    balusters.setMatrixAt(i, dummy.matrix)
  }
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(axis === 'x' ? length : 0.05, 0.05, axis === 'x' ? 0.05 : length),
    iron
  )
  rail.position.set(
    axis === 'x' ? (min + max) / 2 : fixed,
    y + height,
    axis === 'x' ? fixed : (min + max) / 2
  )
  for (const mesh of [posts, balusters, rail]) {
    mesh.castShadow = false
    mesh.receiveShadow = false
  }
  parent.add(posts, balusters, rail)
}

import * as THREE from 'three'
import { signMaterial } from '../textures.js'
import { addMesh, box, mergeParts, place } from './geom.js'

// 1930s sawhorse barricade: two splayed trestles carrying a pair of striped
// boards. Built in a local frame with the boards along X and the front
// facing +Z, then merged per material across every barricade.

const STRIPE_TILE = 0.4
const LEG_SPLAY = 0.3

let stripeMaterial = null

function stripes() {
  if (stripeMaterial) return stripeMaterial
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#d8cfba'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#8a1a12'
  // One diagonal band per tile, drawn three times so it wraps cleanly.
  for (const shift of [-size, 0, size]) {
    ctx.beginPath()
    ctx.moveTo(shift, size)
    ctx.lineTo(shift + size * 0.5, size)
    ctx.lineTo(shift + size, 0)
    ctx.lineTo(shift + size * 0.5, 0)
    ctx.closePath()
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  stripeMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78 })
  return stripeMaterial
}

function frameParts(length) {
  const parts = []
  const end = length / 2 - 0.16
  for (const x of [-end, end]) {
    for (const side of [-1, 1]) {
      // Tilted about X so the tops meet under the cap and the feet splay.
      const leg = new THREE.BoxGeometry(0.06, 1.12, 0.06)
      leg.rotateX(-side * LEG_SPLAY)
      leg.translate(x, 0.53, side * 0.165)
      parts.push(leg)
    }
    parts.push(box(0.08, 0.07, 0.22, x, 1.06, 0))
    parts.push(box(0.04, 0.04, 0.56, x, 0.32, 0))
  }
  return parts
}

function boardParts(length) {
  return [
    box(length, 0.2, 0.03, 0, 0.96, 0.06, STRIPE_TILE),
    box(length, 0.18, 0.03, 0, 0.6, 0.18, STRIPE_TILE)
  ]
}

// spots: { x, y, z, yaw, length, sign, lantern }. Returns a collider per
// barricade.
export function addBarricades(parent, spots, materials, stats, text) {
  const wood = []
  const boards = []
  const signs = []
  const iron = []
  const glass = []
  const colliders = []
  const bounds = new THREE.Box3()
  for (const spot of spots) {
    const frame = frameParts(spot.length)
    const plank = boardParts(spot.length)
    const plate = []
    const cage = []
    const lens = []
    if (spot.sign) {
      for (const x of [-0.5, 0.5]) frame.push(box(0.04, 0.3, 0.03, x, 1.18, 0.06))
      const geometry = new THREE.PlaneGeometry(1.5, 0.42)
      geometry.translate(0, 1.42, 0.08)
      plate.push(geometry)
    }
    if (spot.lantern) {
      const x = spot.length / 2 - 0.16
      cage.push(box(0.13, 0.03, 0.13, x, 1.11, 0), box(0.14, 0.03, 0.14, x, 1.28, 0))
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        cage.push(box(0.015, 0.15, 0.015, x + ox * 0.055, 1.195, oz * 0.055))
      }
      const handle = new THREE.TorusGeometry(0.045, 0.008, 4, 10, Math.PI)
      handle.translate(x, 1.3, 0)
      cage.push(handle)
      lens.push(box(0.085, 0.13, 0.085, x, 1.195, 0))
    }
    const matrix = place(spot.x, spot.y, spot.z, spot.yaw || 0)
    bounds.makeEmpty()
    for (const part of [...frame, ...plank, ...plate, ...cage, ...lens]) {
      part.applyMatrix4(matrix)
      part.computeBoundingBox()
      bounds.union(part.boundingBox)
    }
    colliders.push({ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z })
    wood.push(...frame)
    boards.push(...plank)
    signs.push(...plate)
    iron.push(...cage)
    glass.push(...lens)
  }

  addMesh(parent, mergeParts(wood), materials.wood, { castShadow: true, name: 'landing-barricade-trestles' }, stats)
  addMesh(parent, mergeParts(boards), stripes(), { castShadow: true, receiveShadow: true, name: 'landing-barricade-boards' }, stats)
  if (signs.length) {
    const material = signMaterial({
      text,
      background: 0xd8cfba,
      foreground: 0x2a120c,
      width: 1024,
      height: 288,
      emissiveIntensity: 0.12
    })
    addMesh(parent, mergeParts(signs), material, { name: 'landing-barricade-sign' }, stats)
  }
  if (iron.length) {
    addMesh(parent, mergeParts(iron), materials.iron, { name: 'landing-barricade-lantern' }, stats)
    const red = new THREE.MeshStandardMaterial({
      color: 0x1a0604,
      emissive: 0xff3018,
      emissiveIntensity: 2.4,
      roughness: 0.2
    })
    addMesh(parent, mergeParts(glass), red, { name: 'landing-barricade-lantern-glass' }, stats)
  }
  return colliders
}

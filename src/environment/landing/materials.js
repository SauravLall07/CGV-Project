import * as THREE from 'three'
import { brickMaterial, signMaterial } from '../textures.js'

// One material per surface. Static architecture is merged onto these, and the
// repeated bays instance them, so the facade is a handful of draws.

const BRICK_TILE = 1.65
const STONE_TILE = 2.05

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function ashlarCanvas(size) {
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#c4baab'
  ctx.fillRect(0, 0, size, size)
  const cols = 4
  const rows = 6
  const bw = size / cols
  const bh = size / rows
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 ? bw * 0.5 : 0
    for (let col = -1; col <= cols; col += 1) {
      const shade = 0.9 + ((row * 3 + col * 5) % 7) * 0.018
      const v = Math.floor(214 * shade)
      ctx.fillStyle = `rgb(${v},${v - 6},${v - 16})`
      ctx.fillRect(col * bw + offset + 2, row * bh + 2, bw - 4, bh - 4)
    }
  }
  return canvas
}

function normalFromCanvas(source, strength) {
  const size = source.width
  const pixels = source.getContext('2d').getImageData(0, 0, size, size).data
  const heightAt = (x, y) => {
    const xi = (x + size) % size
    const yi = (y + size) % size
    const i = (yi * size + xi) * 4
    return (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255
  }
  const target = makeCanvas(size)
  const ctx = target.getContext('2d')
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength
      const dy = (heightAt(x, y - 1) - heightAt(x, y + 1)) * strength
      const length = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      image.data[i] = (dx / length * 0.5 + 0.5) * 255
      image.data[i + 1] = (dy / length * 0.5 + 0.5) * 255
      image.data[i + 2] = (1 / length * 0.5 + 0.5) * 255
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return target
}

function canvasTexture(canvas, repeat, srgb) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  texture.repeat.set(repeat[0], repeat[1])
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function clockCanvas() {
  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const c = size / 2
  ctx.fillStyle = '#1a120c'
  ctx.fillRect(0, 0, size, size)
  ctx.beginPath()
  ctx.arc(c, c, c * 0.9, 0, Math.PI * 2)
  ctx.fillStyle = '#f3e6c8'
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = '#c4a56a'
  ctx.stroke()

  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
  ctx.fillStyle = '#2a2118'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 42px Georgia, "Times New Roman", serif'
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
    const r = c * 0.68
    ctx.fillText(numerals[i], c + Math.cos(angle) * r, c + Math.sin(angle) * r)
  }
  for (let i = 0; i < 60; i += 1) {
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2
    const inner = i % 5 === 0 ? c * 0.8 : c * 0.84
    ctx.strokeStyle = '#3a2e22'
    ctx.lineWidth = i % 5 === 0 ? 4 : 2
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner)
    ctx.lineTo(c + Math.cos(angle) * c * 0.88, c + Math.sin(angle) * c * 0.88)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(c, c, 8, 0, Math.PI * 2)
  ctx.fillStyle = '#2a2118'
  ctx.fill()
  return canvas
}

function glassMaterial(color, intensity) {
  return new THREE.MeshStandardMaterial({
    color: 0x140e0a,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.16,
    metalness: 0.05,
    side: THREE.DoubleSide
  })
}

export function createLandingMaterials() {
  const stoneColor = ashlarCanvas(256)
  const stoneNormal = normalFromCanvas(stoneColor, 2.2)
  const stoneMap = canvasTexture(stoneColor, [1, 1], true)
  const stoneNorm = canvasTexture(stoneNormal, [1, 1], false)

  const stone = new THREE.MeshStandardMaterial({
    map: stoneMap,
    normalMap: stoneNorm,
    roughness: 0.78,
    metalness: 0.04
  })
  const stoneTrim = stone.clone()
  stoneTrim.roughness = 0.7

  const clockMap = canvasTexture(clockCanvas(), [1, 1], true)

  return {
    brickTile: BRICK_TILE,
    stoneTile: STONE_TILE,
    brick: brickMaterial({
      repeat: [1, 1],
      seed: 19,
      brick: 0x8a3830,
      mortar: 0xd9d0c2,
      roughness: 0.9
    }),
    stone,
    stoneTrim,
    iron: new THREE.MeshStandardMaterial({ color: 0x1c1916, roughness: 0.42, metalness: 0.78 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.86 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.72, metalness: 0.08 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x243830, roughness: 0.48, metalness: 0.42 }),
    soffit: new THREE.MeshStandardMaterial({
      color: 0x3a2a18,
      emissive: 0xffb15a,
      emissiveIntensity: 0.85,
      roughness: 0.6
    }),
    glass: [
      glassMaterial(0xffc98a, 3.4),
      glassMaterial(0xffb06a, 2.15),
      glassMaterial(0xa86838, 0.85),
      glassMaterial(0x1a120e, 0.02)
    ],
    archGlass: glassMaterial(0xffc07a, 2.6),
    clock: new THREE.MeshStandardMaterial({
      map: clockMap,
      emissiveMap: clockMap,
      emissive: 0xfff2d4,
      emissiveIntensity: 1.65,
      roughness: 0.4,
      metalness: 0.05,
      side: THREE.DoubleSide
    }),
    sign: signMaterial({
      text: 'CHRONO EXPRESS',
      background: 0x121610,
      foreground: 0xe6c56a,
      width: 1024,
      height: 160,
      emissiveIntensity: 1.35
    }),
    lantern: glassMaterial(0xffd7a2, 4.2)
  }
}

export function shadeOf(index) {
  const n = Math.sin(index * 12.9898 + 4.2) * 43758.5453
  const h = n - Math.floor(n)
  if (h < 0.08) return 3
  if (h < 0.3) return 2
  if (h < 0.62) return 1
  return 0
}

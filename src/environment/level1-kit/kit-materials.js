import * as THREE from 'three'
import { carpetMaterial, plasterMaterial, signMaterial, woodMaterial } from '../textures.js'
import {
  drawChecker,
  drawClockFace,
  drawConcrete,
  drawConcreteRoughness,
  drawCrate,
  drawDepartures,
  drawFrond,
  drawGlazedBrick,
  drawGreenTile,
  drawHazard,
  drawNightPlatform,
  drawPoster,
  drawSteelDoor,
  drawStencil,
  kitTexture,
  POSTER_COUNT
} from './kit-textures.js'

// One set of materials for every Level 1 interior, so the hall, the
// passages and the platform read as the same building. Built once per level
// and shared by every room that uses the kit.

let current = null

function standard(options) {
  return new THREE.MeshStandardMaterial(options)
}

function glow(color, intensity, extra = {}) {
  return standard({ color: 0x1a120a, emissive: color, emissiveIntensity: intensity, roughness: 0.3, ...extra })
}

function textured(draw, key, repeat, options = {}, normal = 0) {
  const map = kitTexture(key, draw, { repeat })
  const material = standard({ map, ...options })
  if (normal) material.normalMap = kitTexture(key, draw, { repeat, normal })
  return material
}

function decal(canvasDraw, key, options = {}) {
  return standard({
    map: kitTexture(key, canvasDraw),
    transparent: true,
    alphaTest: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.8,
    ...options
  })
}

function createMaterials() {
  const concreteRough = kitTexture('concrete-rough', drawConcreteRoughness, { repeat: [1, 1], srgb: false })
  concreteRough.colorSpace = THREE.NoColorSpace

  const posters = []
  for (let i = 0; i < POSTER_COUNT; i += 1) {
    posters.push(textured(() => drawPoster(i), `poster:${i}`, [1, 1], {
      roughness: 0.55,
      emissive: 0xffffff,
      emissiveIntensity: 0.04
    }))
    posters[i].emissiveMap = posters[i].map
  }

  const clock = textured(drawClockFace, 'clock-face', [1, 1], { roughness: 0.4, emissive: 0xfff2d4, emissiveIntensity: 0.35 })
  clock.emissiveMap = clock.map
  const departures = textured(drawDepartures, 'departures', [1, 1], { roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 1.1 })
  departures.emissiveMap = departures.map
  const nightView = textured(drawNightPlatform, 'night-platform', [1, 1], { roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.85 })
  nightView.emissiveMap = nightView.map

  return {
    // Walls and floors.
    plaster: plasterMaterial({ repeat: [1, 1], seed: 72, base: 0xd6c6a2, roughness: 0.86 }),
    ceiling: plasterMaterial({ repeat: [1, 1], seed: 73, base: 0x6f6656, roughness: 0.92 }),
    wainscot: woodMaterial({ repeat: [1, 1], seed: 14, light: 0x5a3720, dark: 0x2a170c, roughness: 0.48 }),
    checker: textured(drawChecker, 'checker', [1, 1], { roughness: 0.32, metalness: 0.02 }, 1.2),
    runner: carpetMaterial({ repeat: [1, 1], seed: 38, base: 0x6a1a22, accent: 0xa07a3a }),
    brick: textured(drawGlazedBrick, 'glazed-brick', [1, 1], { roughness: 0.38, metalness: 0.02 }, 2.2),
    tile: textured(drawGreenTile, 'green-tile', [1, 1], { roughness: 0.22, metalness: 0.04 }, 2.6),
    concrete: textured(drawConcrete, 'concrete', [1, 1], { roughness: 1, roughnessMap: concreteRough, metalness: 0.05 }, 1.4),
    // Paint, metal, wood.
    green: standard({ color: 0x1d3a2a, roughness: 0.45, metalness: 0.15 }),
    greenDark: standard({ color: 0x12241a, roughness: 0.5, metalness: 0.2 }),
    brass: standard({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 }),
    iron: standard({ color: 0x1c1f1f, roughness: 0.45, metalness: 0.75 }),
    pipe: standard({ color: 0x3b3a34, roughness: 0.42, metalness: 0.7 }),
    copper: standard({ color: 0x8a5232, roughness: 0.35, metalness: 0.85 }),
    wood: woodMaterial({ repeat: [1, 1], seed: 15, light: 0x7a4c2a, dark: 0x3b2312, roughness: 0.5 }),
    crate: textured(drawCrate, 'crate', [1, 1], { roughness: 0.85 }, 1.6),
    leather: standard({ color: 0x4a2a18, roughness: 0.62, metalness: 0.05 }),
    cushion: standard({ color: 0x5c1520, roughness: 0.9 }),
    steel: textured(drawSteelDoor, 'steel-door', [1, 1], { roughness: 0.55, metalness: 0.65 }, 2.4),
    steelFrame: standard({ color: 0x2b2f30, roughness: 0.4, metalness: 0.85 }),
    hazard: textured(drawHazard, 'hazard', [1, 1], { roughness: 0.6, metalness: 0.2 }),
    stencil: decal(() => drawStencil('AUTHORISED PERSONNEL ONLY'), 'stencil:auth'),
    security: decal(() => drawStencil('SECURITY', { width: 256 }), 'stencil:security'),
    // Lamps. Glows sit above the bloom threshold, so they read as lit.
    bulb: glow(0xffd9a0, 4.2),
    lantern: glow(0xffc27a, 3.2, { side: THREE.DoubleSide }),
    lampShade: glow(0xffe3b8, 0.9, { color: 0xe8dcc0, side: THREE.DoubleSide }),
    bulkhead: glow(0xffe1b0, 2.8, { transparent: false }),
    bankerGlass: glow(0x2f8a52, 1.6, { color: 0x1d5a36, roughness: 0.15 }),
    transom: glow(0xffcf8a, 2.2),
    redLens: glow(0xff2a1a, 3.5),
    // Pictures and signs.
    posters,
    poster: (i) => posters[i % posters.length],
    clock,
    departures,
    nightView,
    ticketSign: signMaterial({ text: 'TICKETS · BILLETS', background: 0x14110d, foreground: 0xe0b45c, width: 512, height: 96, emissiveIntensity: 0.8 }),
    glass: standard({ color: 0x1a2228, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.45 }),
    frond: standard({
      map: kitTexture('frond', drawFrond),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.7
    }),
    pot: standard({ color: 0x6a3a22, roughness: 0.7 }),
    soil: standard({ color: 0x1a120c, roughness: 1 })
  }
}

// Every caller in one level build gets the same set. The level calls
// resetKitMaterials() before it builds, since a reload disposes the old set.
export function resetKitMaterials() {
  current = null
}

export function getKitMaterials() {
  if (!current) current = createMaterials()
  return current
}

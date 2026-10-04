import * as THREE from 'three'

// Procedural material library. Every map here is generated into a <canvas> at
// runtime — no image files to download, credit, or blow the texture budget
// on, and every canvas is power-of-two. Colour maps are tagged sRGB; the
// normal maps derived from them stay linear, since they encode direction
// rather than colour. That map + normalMap pairing is what the brief means by
// textures "used for more than colour".
//
// Canvases and the Texture that owns each one are cached module-side. A level
// teardown disposes the textures on its materials; those are clones, so the
// cached Texture and its Source stay valid for the next visit. clone() shares
// that Source, and Three uploads a Source to the GPU once no matter how many
// clones (and repeat/offset variants) reference it.

const canvasCache = new Map()
const textureCache = new Map()

function cachedCanvas(key, build) {
  let canvas = canvasCache.get(key)
  if (!canvas) {
    canvas = build()
    canvasCache.set(key, canvas)
  }
  return canvas
}

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

// Deterministic PRNG so a rebuilt level looks identical to the first build.
function createRandom(seed) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Seamlessly tiling value noise: a coarse random grid, smoothstep-interpolated
// and wrapped, so the result repeats without a visible seam.
function tileableNoise(size, cells, random) {
  const grid = new Float32Array(cells * cells)
  for (let i = 0; i < grid.length; i++) grid[i] = random()

  const smooth = (t) => t * t * (3 - 2 * t)
  const out = new Float32Array(size * size)
  const scale = cells / size

  for (let y = 0; y < size; y++) {
    const fy = y * scale
    const y0 = Math.floor(fy) % cells
    const y1 = (y0 + 1) % cells
    const ty = smooth(fy - Math.floor(fy))

    for (let x = 0; x < size; x++) {
      const fx = x * scale
      const x0 = Math.floor(fx) % cells
      const x1 = (x0 + 1) % cells
      const tx = smooth(fx - Math.floor(fx))

      const top = grid[y0 * cells + x0] * (1 - tx) + grid[y0 * cells + x1] * tx
      const bottom = grid[y1 * cells + x0] * (1 - tx) + grid[y1 * cells + x1] * tx
      out[y * size + x] = top * (1 - ty) + bottom * ty
    }
  }
  return out
}

// Fractal sum of the above — a few octaves at doubling frequency.
function fbm(size, octaves, random, baseCells = 4) {
  const out = new Float32Array(size * size)
  let amplitude = 1
  let total = 0
  let cells = baseCells

  for (let octave = 0; octave < octaves; octave++) {
    const layer = tileableNoise(size, cells, random)
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude
    total += amplitude
    amplitude *= 0.5
    cells *= 2
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function mix(a, b, t) {
  return a + (b - a) * t
}

// Sobel-style height-to-normal conversion. Reads the luminance of a colour
// canvas as a heightfield and writes the tangent-space normal into a second
// canvas, wrapping at the edges so the normal map tiles like its source.
function normalFromCanvas(source, strength) {
  const size = source.width
  const pixels = source.getContext('2d').getImageData(0, 0, size, size).data

  const height = (x, y) => {
    const xi = (x + size) % size
    const yi = (y + size) % size
    const i = (yi * size + xi) * 4
    return (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255
  }

  const target = makeCanvas(size)
  const ctx = target.getContext('2d')
  const image = ctx.createImageData(size, size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (height(x - 1, y) - height(x + 1, y)) * strength
      const dy = (height(x, y - 1) - height(x, y + 1)) * strength
      const length = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      image.data[i] = ((dx / length) * 0.5 + 0.5) * 255
      image.data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255
      image.data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return target
}

function sharedTexture(key, canvas, srgb) {
  const cacheKey = `${key}:${srgb ? 'srgb' : 'linear'}`
  let texture = textureCache.get(cacheKey)
  if (!texture) {
    texture = new THREE.CanvasTexture(canvas)
    texture.name = cacheKey
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    // disposeObject skips this object. Materials receive clones instead.
    texture.userData.sharedTexture = true
    textureCache.set(cacheKey, texture)
  }
  return texture
}

function toTexture(key, canvas, repeat, { srgb = true } = {}) {
  const texture = sharedTexture(key, canvas, srgb).clone()
  // clone() copies userData, including the cache flag. This copy belongs to
  // the level and has to be released on teardown.
  delete texture.userData.sharedTexture
  texture.repeat.set(repeat[0], repeat[1])
  return texture
}

// --- Canvas generators -----------------------------------------------------

function woodCanvas(size, seed, light, dark) {
  const random = createRandom(seed)
  const noise = fbm(size, 4, random)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)

  const a = new THREE.Color(light)
  const b = new THREE.Color(dark)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Grain rings run along the plank (Y); the sine's frequency is a whole
      // number of cycles across the canvas so it tiles.
      const rings = Math.sin((x / size) * Math.PI * 2 * 7 + noise[i] * 7) * 0.5 + 0.5
      const t = Math.min(1, rings * 0.55 + noise[i] * 0.45)
      const p = i * 4
      image.data[p] = mix(b.r, a.r, t) * 255
      image.data[p + 1] = mix(b.g, a.g, t) * 255
      image.data[p + 2] = mix(b.b, a.b, t) * 255
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function marbleTileCanvas(size, seed, base, vein, grout, tiles) {
  const random = createRandom(seed)
  const noise = fbm(size, 5, random)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)

  const baseColor = new THREE.Color(base)
  const veinColor = new THREE.Color(vein)
  const groutColor = new THREE.Color(grout)
  const cell = size / tiles

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Ridged noise reads as marble veining.
      const ridged = 1 - Math.abs(noise[i] * 2 - 1)
      const veining = Math.pow(ridged, 6)

      let r = mix(baseColor.r, veinColor.r, veining)
      let g = mix(baseColor.g, veinColor.g, veining)
      let b = mix(baseColor.b, veinColor.b, veining)

      // Grout: distance to the nearest tile edge, in pixels.
      const edge = Math.min(x % cell, cell - (x % cell), y % cell, cell - (y % cell))
      if (edge < 2.5) {
        const t = 1 - edge / 2.5
        r = mix(r, groutColor.r, t)
        g = mix(g, groutColor.g, t)
        b = mix(b, groutColor.b, t)
      }

      const p = i * 4
      image.data[p] = r * 255
      image.data[p + 1] = g * 255
      image.data[p + 2] = b * 255
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function carpetCanvas(size, seed, base, accent) {
  const random = createRandom(seed)
  const fine = fbm(size, 5, random, 32)
  const broad = fbm(size, 3, random, 4)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)

  const baseColor = new THREE.Color(base)
  const accentColor = new THREE.Color(accent)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // A diamond lattice motif over a noisy pile.
      const lattice = Math.abs(Math.sin((x / size) * Math.PI * 8) * Math.sin((y / size) * Math.PI * 8))
      const t = Math.min(1, Math.pow(lattice, 3) * 0.55 + broad[i] * 0.2)
      const pile = 0.82 + fine[i] * 0.36

      const p = i * 4
      image.data[p] = mix(baseColor.r, accentColor.r, t) * pile * 255
      image.data[p + 1] = mix(baseColor.g, accentColor.g, t) * pile * 255
      image.data[p + 2] = mix(baseColor.b, accentColor.b, t) * pile * 255
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function brushedMetalCanvas(size, seed, base) {
  const random = createRandom(seed)
  // Stretch the noise along X by sampling a tall, thin field.
  const streaks = fbm(size, 4, random, 64)
  const blotch = fbm(size, 3, random, 6)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const color = new THREE.Color(base)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Sample the streak field mostly by Y so the grain runs horizontally.
      const grain = streaks[(y * size + ((x * 3) % size))]
      const shade = 0.78 + grain * 0.3 + blotch[i] * 0.12
      const p = i * 4
      image.data[p] = Math.min(255, color.r * shade * 255)
      image.data[p + 1] = Math.min(255, color.g * shade * 255)
      image.data[p + 2] = Math.min(255, color.b * shade * 255)
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function plasterCanvas(size, seed, base) {
  const random = createRandom(seed)
  const noise = fbm(size, 5, random, 8)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const color = new THREE.Color(base)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const shade = 0.86 + noise[i] * 0.28
      const p = i * 4
      image.data[p] = Math.min(255, color.r * shade * 255)
      image.data[p + 1] = Math.min(255, color.g * shade * 255)
      image.data[p + 2] = Math.min(255, color.b * shade * 255)
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

// Repeating strip of lit carriage windows: dark frames, warm glass. Used as
// both the colour map and the emissive map, so only the panes glow.
function windowStripCanvas(width, height, paneCount, glass, frame) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = `#${new THREE.Color(frame).getHexString()}`
  ctx.fillRect(0, 0, width, height)

  const pitch = width / paneCount
  const paneWidth = pitch * 0.62
  const paneHeight = height * 0.56
  const top = (height - paneHeight) / 2

  for (let i = 0; i < paneCount; i++) {
    const x = i * pitch + (pitch - paneWidth) / 2
    const gradient = ctx.createLinearGradient(0, top, 0, top + paneHeight)
    const glassColor = new THREE.Color(glass)
    gradient.addColorStop(0, `#${glassColor.getHexString()}`)
    gradient.addColorStop(1, `#${glassColor.clone().multiplyScalar(0.45).getHexString()}`)
    ctx.fillStyle = gradient
    ctx.fillRect(x, top, paneWidth, paneHeight)

    // Glazing bar down the middle of each pane.
    ctx.fillStyle = `#${new THREE.Color(frame).getHexString()}`
    ctx.fillRect(x + paneWidth / 2 - 1, top, 2, paneHeight)
  }
  return canvas
}

// Night landscape rushing past an interior window: a dark gradient with
// horizontally smeared light streaks.
function passingNightCanvas(width, height, seed) {
  const random = createRandom(seed)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#131a2e')
  sky.addColorStop(0.55, '#0d1120')
  sky.addColorStop(1, '#070a12')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  // Motion-blurred lights.
  for (let i = 0; i < 90; i++) {
    const x = random() * width
    const y = height * (0.25 + random() * 0.6)
    const length = 12 + random() * 70
    const alpha = 0.12 + random() * 0.5
    const warm = random() > 0.35
    const streak = ctx.createLinearGradient(x, y, x + length, y)
    const hex = warm ? '255,196,120' : '150,190,255'
    streak.addColorStop(0, `rgba(${hex},0)`)
    streak.addColorStop(0.5, `rgba(${hex},${alpha})`)
    streak.addColorStop(1, `rgba(${hex},0)`)
    ctx.fillStyle = streak
    ctx.fillRect(x, y - 1, length, 2 + random() * 2)
  }

  // Dark hills along the bottom.
  ctx.fillStyle = '#05070d'
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 16) {
    ctx.lineTo(x, height * (0.78 + Math.sin(x * 0.03) * 0.05 + random() * 0.03))
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()

  return canvas
}

// Station signage / departure board.
function signCanvas(text, background, foreground, width, height) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = `#${new THREE.Color(background).getHexString()}`
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = `#${new THREE.Color(foreground).getHexString()}`
  ctx.lineWidth = 4
  ctx.strokeRect(8, 8, width - 16, height - 16)

  ctx.fillStyle = `#${new THREE.Color(foreground).getHexString()}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const margin = Math.max(24, Math.floor(width * 0.04))
  let fontSize = Math.floor(height * 0.46)
  ctx.font = `bold ${fontSize}px Georgia, serif`
  while (fontSize > 14 && ctx.measureText(text).width > width - margin * 2) {
    fontSize -= 2
    ctx.font = `bold ${fontSize}px Georgia, serif`
  }
  ctx.fillText(text, width / 2, height / 2)
  return canvas
}

// --- Material factories ----------------------------------------------------

export function woodMaterial({ repeat = [1, 1], seed = 11, light = 0x8a5a33, dark = 0x4a2c17, roughness = 0.62 } = {}) {
  const key = `wood:${seed}:${light}:${dark}`
  const colour = cachedCanvas(key, () => woodCanvas(256, seed, light, dark))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 1.4))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness,
    metalness: 0.04
  })
}

export function marbleFloorMaterial({ repeat = [1, 1], seed = 23, base = 0xb8ab97, vein = 0x6d6255, grout = 0x4a4238, tiles = 4, roughness = 0.82 } = {}) {
  const key = `marble:${seed}:${base}:${vein}:${tiles}`
  const colour = cachedCanvas(key, () => marbleTileCanvas(512, seed, base, vein, grout, tiles))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 2.2))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness,
    metalness: 0.02
  })
}

export function carpetMaterial({ repeat = [1, 1], seed = 37, base = 0x5c2230, accent = 0x8d5a34 } = {}) {
  const key = `carpet:${seed}:${base}:${accent}`
  const colour = cachedCanvas(key, () => carpetCanvas(256, seed, base, accent))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 2.6))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness: 0.94,
    metalness: 0
  })
}

export function metalMaterial({ repeat = [1, 1], seed = 53, base = 0x8c8f96, roughness = 0.42, metalness = 0.85 } = {}) {
  const key = `metal:${seed}:${base}`
  const colour = cachedCanvas(key, () => brushedMetalCanvas(256, seed, base))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 1.1))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness,
    metalness
  })
}

function brickCanvas(size, seed, mortar, brick) {
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const random = createRandom(seed)
  ctx.fillStyle = `#${new THREE.Color(mortar).getHexString()}`
  ctx.fillRect(0, 0, size, size)
  const cols = 8
  const rows = 20
  const bw = size / cols
  const bh = size / rows
  const color = new THREE.Color(brick)
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 ? bw * 0.5 : 0
    for (let col = -1; col <= cols; col += 1) {
      const shade = 0.78 + random() * 0.32
      const r = Math.min(255, color.r * shade * 255)
      const g = Math.min(255, color.g * shade * 255)
      const b = Math.min(255, color.b * shade * 255)
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      ctx.fillRect(col * bw + offset + 1.5, row * bh + 1.5, bw - 3, bh - 3)
    }
  }
  return canvas
}

export function brickMaterial({ repeat = [1, 1], seed = 17, mortar = 0x6a645c, brick = 0x7a3b32, roughness = 0.86 } = {}) {
  const key = `brick:${seed}:${mortar}:${brick}`
  const colour = cachedCanvas(key, () => brickCanvas(256, seed, mortar, brick))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 2.4))
  return new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness,
    metalness: 0.02
  })
}

export function plasterMaterial({ repeat = [1, 1], seed = 71, base = 0xa79c8a, roughness = 0.82 } = {}) {
  const key = `plaster:${seed}:${base}`
  const colour = cachedCanvas(key, () => plasterCanvas(256, seed, base))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 1.6))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness,
    metalness: 0.02
  })
}

export function litWindowMaterial({ repeat = [1, 1], paneCount = 6, glass = 0xffd9a0, frame = 0x1a1512, emissiveIntensity = 1.5 } = {}) {
  const key = `window:${paneCount}:${glass}:${frame}`
  const canvas = cachedCanvas(key, () => windowStripCanvas(512, 128, paneCount, glass, frame))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, canvas, repeat),
    emissiveMap: toTexture(key, canvas, repeat),
    emissive: 0xffffff,
    emissiveIntensity,
    roughness: 0.28,
    metalness: 0.1
  })
}

export function nightViewMaterial({ repeat = [1, 1], seed = 91, emissiveIntensity = 0.9 } = {}) {
  const key = `night:${seed}`
  const canvas = cachedCanvas(key, () => passingNightCanvas(512, 256, seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, canvas, repeat),
    emissiveMap: toTexture(key, canvas, repeat),
    emissive: 0xffffff,
    emissiveIntensity,
    roughness: 0.15,
    metalness: 0
  })
}

export function signMaterial({ text = 'PLATFORM 1', background = 0x14110d, foreground = 0xd9b45e, width = 512, height = 128, emissiveIntensity = 1.1 } = {}) {
  const key = `sign:${text}:${background}:${foreground}:${width}x${height}`
  const canvas = cachedCanvas(key, () => signCanvas(text, background, foreground, width, height))

  return new THREE.MeshStandardMaterial({
    map: toTexture(key, canvas, [1, 1]),
    emissiveMap: toTexture(key, canvas, [1, 1]),
    emissive: 0xffffff,
    emissiveIntensity,
    roughness: 0.5,
    metalness: 0.2
  })
}

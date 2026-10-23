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

function woodCanvas(size, seed, light, dark, planks = false) {
  const random = createRandom(seed)
  const noise = fbm(size, 4, random)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)

  const a = new THREE.Color(light)
  const b = new THREE.Color(dark)
  const cols = 5
  const plankW = size / cols

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Grain rings run along the plank (Y); the sine's frequency is a whole
      // number of cycles across the canvas so it tiles.
      const rings = Math.sin((x / size) * Math.PI * 2 * 7 + noise[i] * 7) * 0.5 + 0.5
      const board = planks ? 0.86 + ((Math.floor(x / plankW) * 17) % 5) * 0.035 : 1
      const t = Math.min(1, (rings * 0.55 + noise[i] * 0.45) * board)
      const p = i * 4
      image.data[p] = mix(b.r, a.r, t) * 255
      image.data[p + 1] = mix(b.g, a.g, t) * 255
      image.data[p + 2] = mix(b.b, a.b, t) * 255
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  if (!planks) return canvas
  const rand = createRandom(seed + 9)
  ctx.fillStyle = 'rgba(28,16,8,0.72)'
  for (let c = 0; c < cols; c += 1) {
    ctx.fillRect(c * plankW, 0, 2, size)
    const joint = (0.12 + rand() * 0.76) * size
    ctx.fillRect(c * plankW, joint, plankW, 2)
  }
  ctx.strokeStyle = 'rgba(48,28,14,0.55)'
  ctx.lineWidth = 1
  for (let i = 0; i < 16; i += 1) {
    const x = rand() * size
    const y = rand() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 12 + rand() * 36, y + (rand() - 0.5) * 10)
    ctx.stroke()
  }
  for (let i = 0; i < 3; i += 1) {
    const x = rand() * size
    const y = rand() * size
    const rx = 18 + rand() * 34
    const ry = 8 + rand() * 16
    const wet = ctx.createRadialGradient(x, y, 2, x, y, rx)
    wet.addColorStop(0, 'rgba(36,24,14,0.42)')
    wet.addColorStop(1, 'rgba(36,24,14,0)')
    ctx.fillStyle = wet
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

function plankRoughnessCanvas(size, seed, roughness) {
  const rand = createRandom(seed + 9)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const mid = Math.round(Math.min(1, Math.max(0.2, roughness)) * 255)
  const cols = 5
  const plankW = size / cols
  for (let c = 0; c < cols; c += 1) {
    const tone = Math.min(255, Math.max(0, mid + ((c * 17) % 5 - 2) * 10))
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`
    ctx.fillRect(c * plankW, 0, plankW, size)
  }
  ctx.fillStyle = 'rgb(176,176,176)'
  for (let c = 0; c < cols; c += 1) {
    ctx.fillRect(c * plankW, 0, 2, size)
    const joint = (0.12 + rand() * 0.76) * size
    ctx.fillRect(c * plankW, joint, plankW, 2)
  }
  // Same seed stream as the colour scratches, so the shine sits on the stain.
  for (let i = 0; i < 16; i += 1) {
    rand(); rand(); rand(); rand()
  }
  for (let i = 0; i < 3; i += 1) {
    const x = rand() * size
    const y = rand() * size
    const rx = 18 + rand() * 34
    const ry = 8 + rand() * 16
    const wet = ctx.createRadialGradient(x, y, 2, x, y, rx)
    wet.addColorStop(0, 'rgb(48,48,48)')
    wet.addColorStop(1, `rgb(${mid},${mid},${mid})`)
    ctx.fillStyle = wet
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

// Height for the plank normal. Wet stains stay out of this map — they are
// roughness only. Dark seams and scratches become grooves; the colour canvas
// is not the height source, or the puddles would dent the floor.
function plankHeightCanvas(size, seed) {
  const noise = fbm(size, 3, createRandom(seed + 3), 4)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const cols = 5
  const plankW = size / cols

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const col = Math.floor(x / plankW)
      const grain = Math.sin((y / size) * Math.PI * 2 * 6 + noise[i] * 5) * 0.5 + 0.5
      let height = 0.74 + ((col * 17) % 5) * 0.028 + grain * 0.07 + noise[i] * 0.05
      if (x % plankW < 3) height = 0.06
      const value = Math.max(0, Math.min(255, height * 255))
      const p = i * 4
      image.data[p] = value
      image.data[p + 1] = value
      image.data[p + 2] = value
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)

  const rand = createRandom(seed + 9)
  ctx.fillStyle = 'rgb(8,8,8)'
  for (let c = 0; c < cols; c += 1) {
    const joint = (0.12 + rand() * 0.76) * size
    ctx.fillRect(c * plankW, joint, plankW, 3)
  }
  ctx.strokeStyle = 'rgb(16,16,16)'
  ctx.lineWidth = 1
  for (let i = 0; i < 16; i += 1) {
    const x = rand() * size
    const y = rand() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 12 + rand() * 36, y + (rand() - 0.5) * 10)
    ctx.stroke()
  }
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

// Grime and scratches drawn on a fresh brushed plate. wear is 0..1.
function wornMetalCanvas(size, seed, base, wear) {
  const canvas = brushedMetalCanvas(size, seed, base)
  const ctx = canvas.getContext('2d')
  const random = createRandom(seed + 91)
  const grime = Math.round(10 + wear * 16)
  for (let i = 0; i < grime; i += 1) {
    const x = random() * size
    const y = random() * size
    const rx = 8 + random() * 36 * wear
    const ry = rx * (0.28 + random() * 0.45)
    ctx.fillStyle = `rgba(22, 18, 14, ${0.08 + wear * 0.22})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = `rgba(255, 236, 206, ${0.18 + wear * 0.28})`
  const scratches = Math.round(8 + wear * 14)
  for (let i = 0; i < scratches; i += 1) {
    const x = random() * size
    const y = random() * size
    const len = 16 + random() * 80
    const ang = random() * Math.PI
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.35)
    ctx.stroke()
  }
  return canvas
}

// Linear roughness: dark is polished, light is grimy. Multiplied by material.roughness.
function metalRoughnessCanvas(size, seed, wear) {
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const mid = Math.round(108 + wear * 36)
  ctx.fillStyle = `rgb(${mid},${mid},${mid})`
  ctx.fillRect(0, 0, size, size)
  const random = createRandom(seed + 17)
  for (let i = 0; i < 16; i += 1) {
    const x = random() * size
    const y = random() * size
    const rx = 10 + random() * 40
    ctx.fillStyle = `rgba(210,210,210,${0.25 + wear * 0.35})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, rx * 0.4, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(28,28,28,0.75)'
  ctx.lineWidth = 1
  for (let i = 0; i < 12; i += 1) {
    const x = random() * size
    const y = random() * size
    const len = 20 + random() * 70
    const ang = random() * Math.PI
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.35)
    ctx.stroke()
  }
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
function signFont(ctx, size) {
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
}

function fitSignSize(ctx, text, maxWidth, startSize) {
  let size = startSize
  signFont(ctx, size)
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size -= 2
    signFont(ctx, size)
  }
  return size
}

function signCanvas(text, background, foreground, width, height) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const bg = `#${new THREE.Color(background).getHexString()}`
  const fg = `#${new THREE.Color(foreground).getHexString()}`
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const pad = Math.max(10, Math.floor(width * 0.035))
  ctx.strokeStyle = fg
  ctx.lineWidth = Math.max(3, Math.floor(height * 0.035))
  ctx.strokeRect(pad * 0.45, pad * 0.45, width - pad * 0.9, height - pad * 0.9)

  const maxWidth = width - pad * 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = fg
  // One line when it stays large enough to read from the gantry. A long
  // title drops to two lines, split on the dash, instead of shrinking
  // until the letters disappear.
  const splitAt = text.indexOf(' - ')
  let lines = [text]
  let size = fitSignSize(ctx, text, maxWidth, Math.floor(height * 0.46))
  if (splitAt > 0 && size < height * 0.3) {
    lines = [text.slice(0, splitAt), text.slice(splitAt + 3)]
    size = Math.min(
      fitSignSize(ctx, lines[0], maxWidth, Math.floor(height * 0.34)),
      fitSignSize(ctx, lines[1], maxWidth, Math.floor(height * 0.34))
    )
  }
  signFont(ctx, size)
  const lineGap = size * 1.15
  const top = height / 2 - ((lines.length - 1) * lineGap) / 2
  ctx.lineWidth = Math.max(3, size * 0.12)
  ctx.strokeStyle = '#140e08'
  for (let i = 0; i < lines.length; i += 1) {
    const y = top + i * lineGap
    ctx.strokeText(lines[i], width / 2, y)
    ctx.fillText(lines[i], width / 2, y)
  }
  return canvas
}

// --- Material factories ----------------------------------------------------

export function woodMaterial({
  repeat = [1, 1], seed = 11, light = 0x8a5a33, dark = 0x4a2c17, roughness = 0.62,
  clearcoat = 0, clearcoatRoughness = 0.48, planks = false
} = {}) {
  const key = `wood:${seed}:${light}:${dark}:${planks ? 'plank' : 'grain'}`
  const colour = cachedCanvas(key, () => woodCanvas(256, seed, light, dark, planks))
  const normal = cachedCanvas(`${key}:n`, () => (
    planks
      ? normalFromCanvas(plankHeightCanvas(256, seed), 3.2)
      : normalFromCanvas(colour, 1.4)
  ))
  const params = {
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness: planks ? 1 : roughness,
    metalness: 0.04
  }
  if (planks) {
    const rough = cachedCanvas(`${key}:r`, () => plankRoughnessCanvas(256, seed, roughness))
    params.roughnessMap = toTexture(`${key}:r`, rough, repeat, { srgb: false })
  }
  const material = clearcoat > 0
    ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat, clearcoatRoughness })
    : new THREE.MeshStandardMaterial(params)
  if (planks) material.normalScale.set(1.45, 1.2)
  else if (clearcoat > 0) material.normalScale.set(1.15, 1.15)
  return material
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

export function metalMaterial({
  repeat = [1, 1], seed = 53, base = 0x8c8f96, roughness = 0.42, metalness = 0.85,
  wear = 0, emissive = 0x000000, emissiveIntensity = 0
} = {}) {
  const worn = wear > 0
  const key = `metal:${seed}:${base}:${worn ? wear.toFixed(2) : 'plain'}`
  const colour = cachedCanvas(key, () => (
    worn ? wornMetalCanvas(256, seed, base, wear) : brushedMetalCanvas(256, seed, base)
  ))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, worn ? 2.4 : 1.1))
  const material = new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, repeat),
    normalMap: toTexture(`${key}:n`, normal, repeat, { srgb: false }),
    roughness: worn ? 1 : roughness,
    metalness
  })
  if (worn) {
    const rough = cachedCanvas(`${key}:r`, () => metalRoughnessCanvas(256, seed, wear))
    material.roughnessMap = toTexture(`${key}:r`, rough, repeat, { srgb: false })
    material.normalScale.set(1.25, 0.8)
  }
  if (emissiveIntensity > 0) {
    material.emissive.setHex(emissive)
    material.emissiveIntensity = emissiveIntensity
  }
  return material
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

// Distant lights share one seed so the colour view and the emissive map stay aligned.
function paintStormLights(ctx, width, height, seed, emissive) {
  const random = createRandom(seed + 17)
  for (let i = 0; i < 32; i += 1) {
    const x = random() * width
    const y = height * (0.2 + random() * 0.5)
    const length = 16 + random() * (emissive ? 86 : 58)
    const alpha = emissive ? 0.4 + random() * 0.5 : 0.28 + random() * 0.34
    const roll = random()
    const hex = roll > 0.74 ? '130,214,220' : roll > 0.6 ? '190,156,228' : '255,188,112'
    const streak = ctx.createLinearGradient(x, y, x + length, y)
    streak.addColorStop(0, `rgba(${hex},0)`)
    streak.addColorStop(0.5, `rgba(${hex},${alpha})`)
    streak.addColorStop(1, `rgba(${hex},0)`)
    ctx.fillStyle = streak
    const thick = 1.4 + random() * (emissive ? 2.4 : 1.6)
    ctx.fillRect(x, y - thick * 0.5, length, thick)
  }
  for (let i = 0; i < 5; i += 1) {
    const x = random() * width
    const y = height * (0.28 + random() * 0.32)
    const radius = 16 + random() * 34
    const hex = random() > 0.5 ? '170,150,214' : '100,196,206'
    const alpha = emissive ? 0.28 : 0.16
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, `rgba(${hex},${alpha})`)
    glow.addColorStop(1, `rgba(${hex},0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintStormClouds(ctx, width, height, seed, emissive) {
  const random = createRandom(seed + 41)
  for (const [count, y0, y1, alpha, scale] of [
    [7, 0.06, 0.4, 0.22, 1],
    [9, 0.26, 0.6, 0.28, 0.62]
  ]) {
    for (let i = 0; i < count; i += 1) {
      const x = random() * width
      const y = height * (y0 + random() * (y1 - y0))
      const rx = (40 + random() * 90) * scale
      const ry = (12 + random() * 24) * scale
      const rot = random() * 0.4
      const g = ctx.createRadialGradient(x, y, ry * 0.15, x, y, rx)
      if (emissive) {
        g.addColorStop(0, 'rgba(0,0,0,0.88)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
      } else {
        g.addColorStop(0, `rgba(198, 208, 220, ${alpha})`)
        g.addColorStop(1, 'rgba(198, 208, 220, 0)')
      }
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function stormWindowCanvas(width, height, seed) {
  const random = createRandom(seed)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#2c3c56')
  sky.addColorStop(0.36, '#41556e')
  sky.addColorStop(0.58, '#53486e')
  sky.addColorStop(0.72, '#3d6c76')
  sky.addColorStop(0.84, '#2c4250')
  sky.addColorStop(1, '#1c262e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  const horizon = ctx.createLinearGradient(0, height * 0.64, 0, height * 0.84)
  horizon.addColorStop(0, 'rgba(70, 120, 140, 0)')
  horizon.addColorStop(0.45, 'rgba(120, 170, 176, 0.35)')
  horizon.addColorStop(0.72, 'rgba(190, 140, 90, 0.22)')
  horizon.addColorStop(1, 'rgba(20, 24, 30, 0)')
  ctx.fillStyle = horizon
  ctx.fillRect(0, height * 0.64, width, height * 0.2)

  paintStormLights(ctx, width, height, seed, false)
  paintStormClouds(ctx, width, height, seed, false)

  ctx.fillStyle = '#12181e'
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 12) {
    ctx.lineTo(x, height * (0.78 + Math.sin(x * 0.02 + seed) * 0.04))
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(210, 224, 230, 0.2)'
  ctx.lineWidth = 1
  for (let i = 0; i < 28; i += 1) {
    const x = random() * width
    const y = random() * height * 0.72
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 10 + random() * 26, y + 1)
    ctx.stroke()
  }
  return canvas
}

function stormWindowLightsCanvas(width, height, seed) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  paintStormLights(ctx, width, height, seed, true)
  paintStormClouds(ctx, width, height, seed, true)
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 12) {
    ctx.lineTo(x, height * (0.78 + Math.sin(x * 0.02 + seed) * 0.04))
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()
  return canvas
}

function glassRoughnessCanvas(size, seed) {
  const random = createRandom(seed + 5)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const edge = Math.min(u, 1 - u, v, 1 - v)
      const grime = 1 - Math.min(1, edge / 0.16)
      const lane = Math.abs(Math.sin(u * Math.PI * 14 + seed * 0.7))
      const streak = lane > 0.92 ? (lane - 0.92) / 0.08 : 0
      const speckle = ((x * 13 + y * 29 + seed * 7) & 255) / 255
      const value = Math.max(0, Math.min(255, 112 + grime * 78 - streak * 62 + (speckle - 0.5) * 10))
      const p = (y * size + x) * 4
      image.data[p] = value
      image.data[p + 1] = value
      image.data[p + 2] = value
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  for (let i = 0; i < 5; i += 1) {
    const x = random() * size
    const y = random() * size
    const rx = 10 + random() * 28
    ctx.fillStyle = `rgba(214,214,214,${0.32 + random() * 0.28})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, rx * 0.32, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

function glassRainHeightCanvas(size, seed) {
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgb(128,128,128)'
  ctx.fillRect(0, 0, size, size)
  const random = createRandom(seed + 29)
  ctx.strokeStyle = 'rgb(214,214,214)'
  ctx.lineWidth = 2
  for (let i = 0; i < 16; i += 1) {
    const x = random() * size
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + (random() - 0.5) * 12, size)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgb(236,236,236)'
  for (let i = 0; i < 12; i += 1) {
    const x = random() * size
    const y = random() * size
    ctx.beginPath()
    ctx.ellipse(x, y, 1.4, 3 + random() * 7, 0.15, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

// Level 3 carriage glass. Flicker stays in this pane shader. It never writes
// wall, trim, or scene lighting. `aBayPhase` keeps neighbouring windows apart.
export function stormWindowMaterial({ seed = 7 } = {}) {
  const key = `storm-window:${seed}`
  const colour = cachedCanvas(key, () => stormWindowCanvas(512, 256, seed))
  const lights = cachedCanvas(`${key}:e`, () => stormWindowLightsCanvas(512, 256, seed))
  const rough = cachedCanvas(`${key}:r`, () => glassRoughnessCanvas(256, seed))
  const rainHeight = cachedCanvas('storm-window-rain-h', () => glassRainHeightCanvas(256, 7))
  const rainNormal = cachedCanvas('storm-window-rain-n', () => normalFromCanvas(rainHeight, 2.2))
  const material = new THREE.MeshStandardMaterial({
    map: toTexture(key, colour, [1, 1]),
    emissiveMap: toTexture(`${key}:e`, lights, [1, 1]),
    roughnessMap: toTexture(`${key}:r`, rough, [1, 1], { srgb: false }),
    normalMap: toTexture('storm-window-rain-n', rainNormal, [1, 1], { srgb: false }),
    roughness: 1,
    metalness: 0.12,
    emissive: 0xffffff,
    emissiveIntensity: 0.52,
    envMapIntensity: 0.5
  })
  material.normalScale.set(0.28, 0.62)
  material.customProgramCacheKey = () => 'storm-window-glass-rain'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStormTime = { value: 0 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBayPhase;\nvarying float vBayPhase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBayPhase = aBayPhase;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uStormTime;\nvarying float vBayPhase;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float lane = abs(fract(vRoughnessMapUv.x * 8.0 + vBayPhase * 5.1) - 0.5);
        float onStreak = smoothstep(0.05, 0.0, lane);
        float fall = fract(vRoughnessMapUv.y * 2.5 - uStormTime * 0.06 + vBayPhase * 2.7);
        float bead = smoothstep(0.16, 0.0, abs(fall - 0.42));
        roughnessFactor = mix(roughnessFactor, max(0.18, roughnessFactor * 0.62), onStreak * 0.75);
        float paneEdge = min(min(vRoughnessMapUv.x, 1.0 - vRoughnessMapUv.x), min(vRoughnessMapUv.y, 1.0 - vRoughnessMapUv.y));
        roughnessFactor = mix(min(1.0, roughnessFactor + 0.22), roughnessFactor, smoothstep(0.0, 0.16, paneEdge));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float laneN = abs(fract(vRoughnessMapUv.x * 8.0 + vBayPhase * 5.1) - 0.5);
        float onStreakN = smoothstep(0.05, 0.0, laneN);
        float fallN = fract(vRoughnessMapUv.y * 2.5 - uStormTime * 0.06 + vBayPhase * 2.7);
        float beadN = smoothstep(0.16, 0.0, abs(fallN - 0.42));
        normal.x += onStreakN * 0.07;
        normal.y += beadN * onStreakN * 0.16;
        normal = normalize(normal);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wobble = sin(uStormTime * (1.7 + vBayPhase * 2.8) + vBayPhase * 17.0);
        float twitch = sin(uStormTime * (6.4 + vBayPhase * 4.1) + vBayPhase * 2.6);
        float flicker = clamp(0.82 + 0.2 * wobble + 0.28 * twitch * step(0.72, fract(wobble)), 0.5, 1.45);
        float cycle = 7.4 + vBayPhase * 4.2;
        float boltU = fract((uStormTime + vBayPhase * 13.0) / cycle);
        float strike = exp(-pow((boltU - 0.08) * 26.0, 2.0));
        float echo = exp(-pow((boltU - 0.13) * 40.0, 2.0)) * 0.35;
        float flash = clamp(strike + echo, 0.0, 1.0);
        float column = fract(vEmissiveMapUv.x * 2.0 + vBayPhase * 5.7);
        float boltX = mix(0.22, 0.78, fract(vBayPhase * 3.1));
        float band = exp(-pow((column - boltX) * 8.0, 2.0));
        float sky = smoothstep(0.22, 0.42, vEmissiveMapUv.y);
        vec3 boltCol = mix(vec3(0.5, 0.88, 0.96), vec3(0.62, 0.4, 0.92), step(0.55, fract(vBayPhase * 2.3)));
        vec3 cityLights = totalEmissiveRadiance;
        totalEmissiveRadiance = cityLights * flicker + cityLights * flash * 1.15 + boltCol * flash * band * sky * 0.8;`)
    material.userData.stormShader = shader
  }
  return material
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

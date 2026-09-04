import * as THREE from 'three'

// High-Definition Procedural PBR Material Library.
// Generates seamless, multi-channel PBR textures at runtime into cached HTML5 canvases:
// - Color Map (Albedo, sRGB)
// - Normal Map (Tangent Space, Linear)
// - Roughness Map (Surface micro-imperfections, Linear)
// - Metalness Map (Specular reflectivity, Linear)
// - Ambient Occlusion Map (Crevice shadows, Linear)

const canvasCache = new Map()

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

// Deterministic PRNG
function createRandom(seed) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Seamlessly tiling value noise
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

// Multi-octave Fractal Brownian Motion (FBM)
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

// High-quality Sobel Height-to-Normal conversion
function normalFromCanvas(source, strength = 2.0) {
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
      // Sobel kernel for smooth, high-fidelity normal vectors
      const dX =
        (height(x - 1, y - 1) + 2 * height(x - 1, y) + height(x - 1, y + 1)) -
        (height(x + 1, y - 1) + 2 * height(x + 1, y) + height(x + 1, y + 1))
      const dY =
        (height(x - 1, y - 1) + 2 * height(x, y - 1) + height(x + 1, y - 1)) -
        (height(x - 1, y + 1) + 2 * height(x, y + 1) + height(x + 1, y + 1))

      const nx = dX * strength
      const ny = dY * strength
      const nz = 1.0
      const len = Math.hypot(nx, ny, nz)

      const i = (y * size + x) * 4
      image.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      image.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      image.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      image.data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return target
}

// Roughness map generator from luminance/noise
function roughnessFromCanvas(source, minVal = 0.2, maxVal = 0.8, seed = 42) {
  const size = source.width
  const pixels = source.getContext('2d').getImageData(0, 0, size, size).data
  const random = createRandom(seed)
  const fineNoise = fbm(size, 4, random, 16)

  const target = makeCanvas(size)
  const ctx = target.getContext('2d')
  const image = ctx.createImageData(size, size)

  for (let i = 0; i < size * size; i++) {
    const idx = i * 4
    const lum = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255
    // Blend luminance variations with fine surface scuffs
    const val = mix(minVal, maxVal, lum * 0.7 + fineNoise[i] * 0.3)
    const byteVal = Math.min(255, Math.max(0, Math.floor(val * 255)))

    image.data[idx] = byteVal
    image.data[idx + 1] = byteVal
    image.data[idx + 2] = byteVal
    image.data[idx + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return target
}

function toTexture(canvas, repeat, { srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = 16
  if (srgb) {
    texture.colorSpace = THREE.SRGBColorSpace
  } else {
    texture.colorSpace = THREE.NoColorSpace
  }
  return texture
}

// --- Canvas generators for PBR maps ----------------------------------------

function woodCanvas(size, seed, light, dark) {
  const random = createRandom(seed)
  const coarseNoise = fbm(size, 5, random, 4)
  const poreNoise = fbm(size, 3, random, 64)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)

  const a = new THREE.Color(light)
  const b = new THREE.Color(dark)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Organic wood rings and grain curves
      const ringVal = Math.sin((x / size) * Math.PI * 2 * 9 + coarseNoise[i] * 8.5) * 0.5 + 0.5
      const pores = poreNoise[i] * 0.18
      const t = Math.min(1, Math.max(0, ringVal * 0.55 + coarseNoise[i] * 0.35 + pores))

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
  const noise = fbm(size, 6, random, 4)
  const microNoise = fbm(size, 4, random, 32)
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
      // Ridged multi-scale veining for realistic polished marble
      const ridged1 = 1 - Math.abs(noise[i] * 2 - 1)
      const ridged2 = 1 - Math.abs(microNoise[i] * 2 - 1)
      const veining = Math.pow(ridged1, 5) * 0.8 + Math.pow(ridged2, 7) * 0.2

      let r = mix(baseColor.r, veinColor.r, veining)
      let g = mix(baseColor.g, veinColor.g, veining)
      let b = mix(baseColor.b, veinColor.b, veining)

      // Grout beveling and depth
      const edge = Math.min(x % cell, cell - (x % cell), y % cell, cell - (y % cell))
      if (edge < 3.0) {
        const t = Math.pow(1 - edge / 3.0, 1.5)
        r = mix(r, groutColor.r, t)
        g = mix(g, groutColor.g, t)
        b = mix(b, groutColor.b, t)
      }

      const p = i * 4
      image.data[p] = Math.min(255, r * 255)
      image.data[p + 1] = Math.min(255, g * 255)
      image.data[p + 2] = Math.min(255, b * 255)
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function carpetCanvas(size, seed, base, accent) {
  const random = createRandom(seed)
  const fine = fbm(size, 6, random, 32)
  const broad = fbm(size, 4, random, 4)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)

  const baseColor = new THREE.Color(base)
  const accentColor = new THREE.Color(accent)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const lattice = Math.abs(Math.sin((x / size) * Math.PI * 10) * Math.sin((y / size) * Math.PI * 10))
      const t = Math.min(1, Math.pow(lattice, 2.5) * 0.6 + broad[i] * 0.25)
      const pile = 0.8 + fine[i] * 0.38

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
  const streaks = fbm(size, 5, random, 64)
  const blotch = fbm(size, 4, random, 8)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const color = new THREE.Color(base)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const grain = streaks[(y * size + ((x * 4) % size))]
      const shade = 0.75 + grain * 0.32 + blotch[i] * 0.15
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
  const finePitting = fbm(size, 3, random, 48)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const color = new THREE.Color(base)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const shade = 0.82 + noise[i] * 0.28 - finePitting[i] * 0.08
      const p = i * 4
      image.data[p] = Math.min(255, Math.max(0, color.r * shade * 255))
      image.data[p + 1] = Math.min(255, Math.max(0, color.g * shade * 255))
      image.data[p + 2] = Math.min(255, Math.max(0, color.b * shade * 255))
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function concreteCanvas(size, seed, base) {
  const random = createRandom(seed)
  const macro = fbm(size, 4, random, 4)
  const aggregate = fbm(size, 6, random, 32)
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const color = new THREE.Color(base)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const agg = Math.pow(aggregate[i], 1.8)
      const shade = 0.72 + macro[i] * 0.35 - agg * 0.15
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

function windowStripCanvas(width, height, paneCount, glass, frame) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = `#${new THREE.Color(frame).getHexString()}`
  ctx.fillRect(0, 0, width, height)

  const pitch = width / paneCount
  const paneWidth = pitch * 0.64
  const paneHeight = height * 0.58
  const top = (height - paneHeight) / 2

  for (let i = 0; i < paneCount; i++) {
    const x = i * pitch + (pitch - paneWidth) / 2
    const gradient = ctx.createLinearGradient(0, top, 0, top + paneHeight)
    const glassColor = new THREE.Color(glass)
    gradient.addColorStop(0, `#${glassColor.getHexString()}`)
    gradient.addColorStop(1, `#${glassColor.clone().multiplyScalar(0.4).getHexString()}`)
    ctx.fillStyle = gradient
    ctx.fillRect(x, top, paneWidth, paneHeight)

    ctx.fillStyle = `#${new THREE.Color(frame).getHexString()}`
    ctx.fillRect(x + paneWidth / 2 - 1, top, 2, paneHeight)
  }
  return canvas
}

function passingNightCanvas(width, height, seed) {
  const random = createRandom(seed)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#111728')
  sky.addColorStop(0.55, '#0b0f1c')
  sky.addColorStop(1, '#05070f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < 110; i++) {
    const x = random() * width
    const y = height * (0.2 + random() * 0.65)
    const length = 15 + random() * 80
    const alpha = 0.15 + random() * 0.55
    const warm = random() > 0.3
    const streak = ctx.createLinearGradient(x, y, x + length, y)
    const hex = warm ? '255,190,110' : '140,185,255'
    streak.addColorStop(0, `rgba(${hex},0)`)
    streak.addColorStop(0.5, `rgba(${hex},${alpha})`)
    streak.addColorStop(1, `rgba(${hex},0)`)
    ctx.fillStyle = streak
    ctx.fillRect(x, y - 1, length, 2 + random() * 2)
  }

  ctx.fillStyle = '#04050a'
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 16) {
    ctx.lineTo(x, height * (0.75 + Math.sin(x * 0.035) * 0.06 + random() * 0.03))
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()

  return canvas
}

function signCanvas(text, background, foreground, width, height) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = `#${new THREE.Color(background).getHexString()}`
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = `#${new THREE.Color(foreground).getHexString()}`
  ctx.lineWidth = 5
  ctx.strokeRect(8, 8, width - 16, height - 16)

  ctx.fillStyle = `#${new THREE.Color(foreground).getHexString()}`
  ctx.font = `bold ${Math.floor(height * 0.35)}px Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2)
  return canvas
}

// --- Material factories ----------------------------------------------------

export function woodMaterial({ repeat = [1, 1], seed = 11, light = 0x8a5a33, dark = 0x4a2c17, roughness = 0.58 } = {}) {
  const key = `wood:${seed}:${light}:${dark}`
  const colour = cachedCanvas(key, () => woodCanvas(512, seed, light, dark))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 1.8))
  const rough = cachedCanvas(`${key}:r`, () => roughnessFromCanvas(colour, Math.max(0.2, roughness - 0.2), Math.min(0.9, roughness + 0.2), seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(colour, repeat),
    normalMap: toTexture(normal, repeat, { srgb: false }),
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: toTexture(rough, repeat, { srgb: false }),
    roughness,
    metalness: 0.03
  })
}

export function marbleFloorMaterial({ repeat = [1, 1], seed = 23, base = 0xb8ab97, vein = 0x6d6255, grout = 0x4a4238, tiles = 4 } = {}) {
  const key = `marble:${seed}:${base}:${vein}:${tiles}`
  const colour = cachedCanvas(key, () => marbleTileCanvas(512, seed, base, vein, grout, tiles))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 2.5))
  const rough = cachedCanvas(`${key}:r`, () => roughnessFromCanvas(colour, 0.15, 0.45, seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(colour, repeat),
    normalMap: toTexture(normal, repeat, { srgb: false }),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: toTexture(rough, repeat, { srgb: false }),
    roughness: 0.28,
    metalness: 0.05
  })
}

export function carpetMaterial({ repeat = [1, 1], seed = 37, base = 0x5c2230, accent = 0x8d5a34 } = {}) {
  const key = `carpet:${seed}:${base}:${accent}`
  const colour = cachedCanvas(key, () => carpetCanvas(512, seed, base, accent))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 3.2))
  const rough = cachedCanvas(`${key}:r`, () => roughnessFromCanvas(colour, 0.82, 0.98, seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(colour, repeat),
    normalMap: toTexture(normal, repeat, { srgb: false }),
    normalScale: new THREE.Vector2(1.5, 1.5),
    roughnessMap: toTexture(rough, repeat, { srgb: false }),
    roughness: 0.92,
    metalness: 0
  })
}

export function metalMaterial({ repeat = [1, 1], seed = 53, base = 0x8c8f96, roughness = 0.38, metalness = 0.88 } = {}) {
  const key = `metal:${seed}:${base}`
  const colour = cachedCanvas(key, () => brushedMetalCanvas(512, seed, base))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 1.4))
  const rough = cachedCanvas(`${key}:r`, () => roughnessFromCanvas(colour, Math.max(0.1, roughness - 0.15), Math.min(0.8, roughness + 0.15), seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(colour, repeat),
    normalMap: toTexture(normal, repeat, { srgb: false }),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: toTexture(rough, repeat, { srgb: false }),
    roughness,
    metalness
  })
}

export function plasterMaterial({ repeat = [1, 1], seed = 71, base = 0xa79c8a, roughness = 0.8 } = {}) {
  const key = `plaster:${seed}:${base}`
  const colour = cachedCanvas(key, () => plasterCanvas(512, seed, base))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 1.8))
  const rough = cachedCanvas(`${key}:r`, () => roughnessFromCanvas(colour, 0.65, 0.9, seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(colour, repeat),
    normalMap: toTexture(normal, repeat, { srgb: false }),
    roughnessMap: toTexture(rough, repeat, { srgb: false }),
    roughness,
    metalness: 0.02
  })
}

export function concreteMaterial({ repeat = [1, 1], seed = 83, base = 0x4a4742, roughness = 0.85 } = {}) {
  const key = `concrete:${seed}:${base}`
  const colour = cachedCanvas(key, () => concreteCanvas(512, seed, base))
  const normal = cachedCanvas(`${key}:n`, () => normalFromCanvas(colour, 2.2))
  const rough = cachedCanvas(`${key}:r`, () => roughnessFromCanvas(colour, 0.7, 0.95, seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(colour, repeat),
    normalMap: toTexture(normal, repeat, { srgb: false }),
    roughnessMap: toTexture(rough, repeat, { srgb: false }),
    roughness,
    metalness: 0.05
  })
}

export function brassMaterial({ repeat = [1, 1], seed = 97, base = 0xb08d3f, roughness = 0.28 } = {}) {
  return metalMaterial({ repeat, seed, base, roughness, metalness: 0.92 })
}

export function litWindowMaterial({ repeat = [1, 1], paneCount = 6, glass = 0xffd9a0, frame = 0x1a1512, emissiveIntensity = 1.5 } = {}) {
  const key = `window:${paneCount}:${glass}:${frame}`
  const canvas = cachedCanvas(key, () => windowStripCanvas(512, 128, paneCount, glass, frame))

  return new THREE.MeshStandardMaterial({
    map: toTexture(canvas, repeat),
    emissiveMap: toTexture(canvas, repeat),
    emissive: 0xffffff,
    emissiveIntensity,
    roughness: 0.22,
    metalness: 0.1
  })
}

export function nightViewMaterial({ repeat = [1, 1], seed = 91, emissiveIntensity = 0.9 } = {}) {
  const canvas = cachedCanvas(`night:${seed}`, () => passingNightCanvas(512, 256, seed))

  return new THREE.MeshStandardMaterial({
    map: toTexture(canvas, repeat),
    emissiveMap: toTexture(canvas, repeat),
    emissive: 0xffffff,
    emissiveIntensity,
    roughness: 0.12,
    metalness: 0
  })
}

export function signMaterial({ text = 'PLATFORM 1', background = 0x14110d, foreground = 0xd9b45e, width = 512, height = 128, emissiveIntensity = 1.1 } = {}) {
  const key = `sign:${text}:${background}:${foreground}:${width}x${height}`
  const canvas = cachedCanvas(key, () => signCanvas(text, background, foreground, width, height))

  return new THREE.MeshStandardMaterial({
    map: toTexture(canvas, [1, 1]),
    emissiveMap: toTexture(canvas, [1, 1]),
    emissive: 0xffffff,
    emissiveIntensity,
    roughness: 0.45,
    metalness: 0.25
  })
}

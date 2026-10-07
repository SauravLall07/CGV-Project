import * as THREE from 'three'

// Painted canvases for the Level 1 kit: checkerboard marble, glazed brick,
// green tiles, damp concrete, posters, the clock face, the riveted steel of
// the security doors and its hazard stripes. Each canvas is drawn once per
// session and shared; every level build wraps it in a fresh texture so the
// level can dispose its own.

const canvases = new Map()

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function css(color, shade = 1, alpha = 1) {
  const c = new THREE.Color(color)
  const r = Math.min(255, Math.max(0, c.r * shade * 255)) | 0
  const g = Math.min(255, Math.max(0, c.g * shade * 255)) | 0
  const b = Math.min(255, Math.max(0, c.b * shade * 255)) | 0
  return `rgba(${r},${g},${b},${alpha})`
}

function cached(key, draw) {
  if (!canvases.has(key)) canvases.set(key, draw())
  return canvases.get(key)
}

// Height from luminance, slopes to a tangent-space normal.
function normalCanvas(source, strength) {
  const { width, height } = source
  const out = makeCanvas(width, height)
  const src = source.getContext('2d').getImageData(0, 0, width, height).data
  const ctx = out.getContext('2d')
  const image = ctx.createImageData(width, height)
  const data = image.data
  if (!data || !src) return out
  const lum = (x, y) => {
    const i = (((y + height) % height) * width + ((x + width) % width)) * 4
    return (src[i] + src[i + 1] + src[i + 2]) / 765
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * width + x) * 4
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255
      data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return out
}

export function kitTexture(key, draw, { repeat = [1, 1], srgb = true, normal = 0 } = {}) {
  const colour = cached(key, draw)
  const texture = new THREE.CanvasTexture(normal ? cached(`${key}:n${normal}`, () => normalCanvas(colour, normal)) : colour)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = 4
  if (srgb && !normal) texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function speckle(ctx, size, rand, count, color, alpha, radius) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = css(color, 0.7 + rand() * 0.6, alpha * rand())
    const r = radius * (0.3 + rand())
    ctx.fillRect(rand() * size, rand() * size, r, r)
  }
}

function vein(ctx, size, rand, color, alpha) {
  ctx.strokeStyle = css(color, 1, alpha)
  ctx.lineWidth = 0.6 + rand() * 1.4
  ctx.beginPath()
  let x = rand() * size
  let y = rand() * size
  ctx.moveTo(x, y)
  for (let i = 0; i < 6; i += 1) {
    x += (rand() - 0.3) * size * 0.25
    y += (rand() - 0.5) * size * 0.25
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// Cream and charcoal marble, 4 × 4 tiles per repeat.
export function drawChecker() {
  return cached('checker', () => {
    const size = 512
    const canvas = makeCanvas(size)
    const ctx = canvas.getContext('2d')
    const rand = random(41)
    const tile = size / 4
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const dark = (row + col) % 2 === 1
        const base = dark ? 0x2c2b2e : 0xd8ccb2
        ctx.fillStyle = css(base, 0.94 + rand() * 0.1)
        ctx.fillRect(col * tile, row * tile, tile, tile)
        ctx.save()
        ctx.beginPath()
        ctx.rect(col * tile, row * tile, tile, tile)
        ctx.clip()
        for (let v = 0; v < 4; v += 1) vein(ctx, size, rand, dark ? 0x77746c : 0x9c8f78, dark ? 0.35 : 0.3)
        ctx.restore()
        // Bevelled edge: light top-left, dark bottom-right.
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(col * tile, row * tile, tile, 3)
        ctx.fillRect(col * tile, row * tile, 3, tile)
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(col * tile, row * tile + tile - 3, tile, 3)
        ctx.fillRect(col * tile + tile - 3, row * tile, 3, tile)
      }
    }
    speckle(ctx, size, rand, 1400, 0x000000, 0.06, 1.5)
    return canvas
  })
}

// Glazed cream brick, 6 courses × 2 bricks per repeat (about 0.45 m square).
export function drawGlazedBrick() {
  return cached('glazed-brick', () => {
    const size = 256
    const canvas = makeCanvas(size)
    const ctx = canvas.getContext('2d')
    const rand = random(7)
    ctx.fillStyle = css(0x8f8573)
    ctx.fillRect(0, 0, size, size)
    const rows = 6
    const bh = size / rows
    const bw = size / 2
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 ? bw / 2 : 0
      for (let col = -1; col <= 2; col += 1) {
        const x = col * bw + offset + 2
        const y = row * bh + 2
        const shade = 0.9 + rand() * 0.14
        const grad = ctx.createLinearGradient(x, y, x, y + bh)
        grad.addColorStop(0, css(0xe6dcc4, shade * 1.05))
        grad.addColorStop(0.5, css(0xd9cdb1, shade))
        grad.addColorStop(1, css(0xc4b797, shade * 0.95))
        ctx.fillStyle = grad
        ctx.fillRect(x, y, bw - 4, bh - 4)
        // Glaze highlight, and the odd craze or chip.
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(x + 3, y + 2, bw - 12, 2)
        if (rand() < 0.25) {
          ctx.fillStyle = css(0x6b604e, 1, 0.5)
          ctx.fillRect(x + rand() * bw, y + rand() * bh * 0.6, 2 + rand() * 4, 1 + rand() * 3)
        }
      }
    }
    // Grime that collects low on the wall.
    const grime = ctx.createLinearGradient(0, size * 0.55, 0, size)
    grime.addColorStop(0, 'rgba(40,32,20,0)')
    grime.addColorStop(1, 'rgba(40,32,20,0.12)')
    ctx.fillStyle = grime
    ctx.fillRect(0, 0, size, size)
    return canvas
  })
}

// Dark green glazed wall tiles, 4 × 8 per repeat (15 × 7.5 cm tiles).
export function drawGreenTile() {
  return cached('green-tile', () => {
    const size = 256
    const canvas = makeCanvas(size)
    const ctx = canvas.getContext('2d')
    const rand = random(13)
    ctx.fillStyle = css(0x0d1510)
    ctx.fillRect(0, 0, size, size)
    const cols = 4
    const rows = 8
    const tw = size / cols
    const th = size / rows
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * tw + 1.5
        const y = row * th + 1.5
        const shade = 0.82 + rand() * 0.3
        const grad = ctx.createLinearGradient(x, y, x, y + th)
        grad.addColorStop(0, css(0x2f6a50, shade))
        grad.addColorStop(0.4, css(0x1f4c38, shade))
        grad.addColorStop(1, css(0x153626, shade))
        ctx.fillStyle = grad
        ctx.fillRect(x, y, tw - 3, th - 3)
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.fillRect(x + 2, y + 1.5, tw - 8, 1.5)
      }
    }
    return canvas
  })
}

// Damp concrete. The colour map darkens where it is wet; the matching
// roughness map is near zero in the same puddles.
function concreteBase(wet) {
  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')
  const rand = random(29)
  ctx.fillStyle = wet ? '#c8c8c8' : css(0x4f4c47)
  ctx.fillRect(0, 0, size, size)
  if (!wet) speckle(ctx, size, rand, 5000, 0x9a948a, 0.18, 2.2)
  if (!wet) speckle(ctx, size, rand, 3000, 0x1a1816, 0.25, 2)
  const pr = random(31)
  for (let i = 0; i < 9; i += 1) {
    const x = pr() * size
    const y = pr() * size
    const r = 30 + pr() * 90
    const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
    grad.addColorStop(0, wet ? 'rgba(20,20,20,0.95)' : 'rgba(18,16,14,0.45)')
    grad.addColorStop(1, wet ? 'rgba(20,20,20,0)' : 'rgba(18,16,14,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * (0.5 + pr() * 0.5), pr() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  // Expansion joints every half repeat.
  ctx.fillStyle = wet ? 'rgba(255,255,255,0.6)' : 'rgba(10,9,8,0.7)'
  ctx.fillRect(0, size / 2 - 1, size, 2)
  ctx.fillRect(size / 2 - 1, 0, 2, size)
  ctx.fillRect(0, 0, size, 2)
  ctx.fillRect(0, 0, 2, size)
  if (!wet) {
    ctx.strokeStyle = 'rgba(12,10,9,0.55)'
    for (let i = 0; i < 5; i += 1) {
      ctx.lineWidth = 0.8
      ctx.beginPath()
      let x = rand() * size
      let y = rand() * size
      ctx.moveTo(x, y)
      for (let k = 0; k < 8; k += 1) {
        x += (rand() - 0.5) * 40
        y += (rand() - 0.5) * 40
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  return canvas
}

export function drawConcrete() {
  return cached('concrete', () => concreteBase(false))
}

export function drawConcreteRoughness() {
  return cached('concrete-rough', () => concreteBase(true))
}

// Wood with stencilled freight marks, for crates.
export function drawCrate() {
  return cached('crate', () => {
    const size = 256
    const canvas = makeCanvas(size)
    const ctx = canvas.getContext('2d')
    const rand = random(17)
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = css(0x7a5a36, 0.85 + rand() * 0.25)
      ctx.fillRect(0, i * 64, size, 62)
      for (let g = 0; g < 18; g += 1) {
        ctx.fillStyle = css(0x3e2a16, 1, 0.25)
        ctx.fillRect(0, i * 64 + rand() * 62, size, 1)
      }
    }
    ctx.fillStyle = css(0x2a1c10)
    ctx.fillRect(0, 0, size, 10)
    ctx.fillRect(0, size - 10, size, 10)
    ctx.fillRect(0, 0, 10, size)
    ctx.fillRect(size - 10, 0, 10, size)
    ctx.save()
    ctx.translate(size / 2, size / 2)
    ctx.fillStyle = 'rgba(28,20,12,0.75)'
    ctx.font = 'bold 30px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('CHRONO', 0, -36)
    ctx.fillText('EXPRESS', 0, -4)
    ctx.font = 'bold 18px serif'
    ctx.fillText('FRAGILE · ↑ ↑', 0, 34)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(28,20,12,0.7)'
    ctx.beginPath()
    ctx.arc(0, -20, 64, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    return canvas
  })
}

const POSTERS = [
  { title: 'CHRONO EXPRESS', line: 'PARIS · VIENNE · ISTANBUL', sky: [0x1d2a52, 0xe0875a], ground: 0x1a1414, accent: 0xf0c060 },
  { title: 'RIVIERA', line: 'LE TRAIN BLEU', sky: [0x2a6a9a, 0xf4d29a], ground: 0x1f3e5a, accent: 0xffffff },
  { title: 'ALPENBLICK', line: 'SCHNELLZUG · 1934', sky: [0x31475e, 0xd9e4ec], ground: 0x2a3b2e, accent: 0xe8d8a8 }
]

export const POSTER_COUNT = POSTERS.length

// Travel posters: sky, hills, a locomotive in silhouette, the title.
export function drawPoster(index) {
  return cached(`poster:${index}`, () => {
    const spec = POSTERS[index % POSTERS.length]
    const w = 256
    const h = 384
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7)
    sky.addColorStop(0, css(spec.sky[0]))
    sky.addColorStop(1, css(spec.sky[1]))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = css(spec.accent, 1, 0.85)
    ctx.beginPath()
    ctx.arc(w * 0.72, h * 0.22, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = css(spec.ground, 1.3)
    ctx.beginPath()
    ctx.moveTo(0, h * 0.62)
    ctx.lineTo(w * 0.3, h * 0.42)
    ctx.lineTo(w * 0.52, h * 0.56)
    ctx.lineTo(w * 0.78, h * 0.38)
    ctx.lineTo(w, h * 0.58)
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.fill()
    ctx.fillStyle = css(spec.ground, 0.6)
    ctx.fillRect(0, h * 0.68, w, h)
    // Locomotive and smoke.
    ctx.fillStyle = '#0c0b0c'
    ctx.fillRect(w * 0.14, h * 0.6, w * 0.5, h * 0.06)
    ctx.fillRect(w * 0.48, h * 0.55, w * 0.14, h * 0.06)
    ctx.fillRect(w * 0.2, h * 0.57, w * 0.05, h * 0.04)
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath()
      ctx.arc(w * 0.22 - i * 18, h * 0.62 - 6, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(230,230,230,0.5)'
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath()
      ctx.arc(w * 0.22 + i * 22, h * 0.54 - i * 9, 10 + i * 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = css(spec.ground, 0.35)
    ctx.fillRect(0, h * 0.74, w, h * 0.26)
    ctx.fillStyle = css(spec.accent)
    ctx.textAlign = 'center'
    ctx.font = 'bold 34px serif'
    ctx.fillText(spec.title, w / 2, h * 0.86, w - 24)
    ctx.font = '15px serif'
    ctx.fillText(spec.line, w / 2, h * 0.93, w - 24)
    ctx.strokeStyle = css(spec.accent, 1, 0.8)
    ctx.lineWidth = 4
    ctx.strokeRect(8, 8, w - 16, h - 16)
    return canvas
  })
}

export function drawClockFace() {
  return cached('clock-face', () => {
    const size = 256
    const canvas = makeCanvas(size)
    const ctx = canvas.getContext('2d')
    const c = size / 2
    ctx.fillStyle = '#efe6cf'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#1b1a18'
    ctx.fillStyle = '#1b1a18'
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * Math.PI * 2
      const long = i % 5 === 0
      ctx.lineWidth = long ? 5 : 2
      ctx.beginPath()
      ctx.moveTo(c + Math.sin(a) * (c - 10), c - Math.cos(a) * (c - 10))
      ctx.lineTo(c + Math.sin(a) * (c - (long ? 30 : 18)), c - Math.cos(a) * (c - (long ? 30 : 18)))
      ctx.stroke()
    }
    ctx.font = 'bold 26px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 1; i <= 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      ctx.fillText(String(i), c + Math.sin(a) * (c - 50), c - Math.cos(a) * (c - 50))
    }
    // Twenty to midnight, as on the departure board.
    const hand = (angle, length, width) => {
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.lineTo(c + Math.sin(angle) * length, c - Math.cos(angle) * length)
      ctx.stroke()
    }
    hand((11.66 / 12) * Math.PI * 2, c * 0.5, 8)
    hand((40 / 60) * Math.PI * 2, c * 0.78, 5)
    ctx.beginPath()
    ctx.arc(c, c, 7, 0, Math.PI * 2)
    ctx.fill()
    return canvas
  })
}

// Departure board: rows of destinations in amber on black.
export function drawDepartures() {
  return cached('departures', () => {
    const w = 512
    const h = 256
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0b0c0e'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e8b44a'
    ctx.font = 'bold 30px monospace'
    ctx.fillText('DEPARTURES', 18, 38)
    ctx.font = '22px monospace'
    const rows = [
      ['23:40', 'CHRONO EXPRESS', '1'],
      ['23:55', 'VIENNE', '3'],
      ['00:10', 'MARSEILLE', '2'],
      ['00:25', 'BRUXELLES', '4'],
      ['00:40', 'MILANO', '5']
    ]
    rows.forEach((row, i) => {
      const y = 82 + i * 36
      ctx.fillStyle = i === 0 ? '#ffd27a' : '#c99a3e'
      ctx.fillText(row[0], 18, y)
      ctx.fillText(row[1], 120, y)
      ctx.fillText(row[2], w - 40, y)
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.fillRect(10, y + 8, w - 20, 1)
    })
    return canvas
  })
}

// Riveted steel for the security doors: recessed panels, scuffs, scratches.
export function drawSteelDoor() {
  return cached('steel-door', () => {
    const size = 512
    const canvas = makeCanvas(size)
    const ctx = canvas.getContext('2d')
    const rand = random(61)
    ctx.fillStyle = css(0x3a3f3d)
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, rand, 4000, 0x5a605c, 0.15, 2)
    // Two recessed panels: a dark shadow line below/right, a light lip above.
    for (const [x, y, w, h] of [[40, 40, 432, 190], [40, 282, 432, 190]]) {
      ctx.fillStyle = css(0x30353a)
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(x, y, w, 6)
      ctx.fillRect(x, y, 6, h)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(x, y + h - 4, w, 4)
      ctx.fillRect(x + w - 4, y, 4, h)
    }
    // Rivet rows along the frame and the middle rail.
    for (const y of [18, 256, 494]) {
      for (let x = 22; x < size; x += 32) {
        const grad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7)
        grad.addColorStop(0, '#9aa09c')
        grad.addColorStop(1, '#1c1f1e')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    for (const x of [18, 494]) {
      for (let y = 50; y < size - 30; y += 32) {
        const grad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7)
        grad.addColorStop(0, '#9aa09c')
        grad.addColorStop(1, '#1c1f1e')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // Scratches and worn paint at the edges.
    ctx.strokeStyle = 'rgba(170,175,170,0.35)'
    for (let i = 0; i < 60; i += 1) {
      ctx.lineWidth = 0.5 + rand()
      ctx.beginPath()
      const x = rand() * size
      const y = rand() * size
      ctx.moveTo(x, y)
      ctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 18)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(110,84,60,0.25)'
    for (let i = 0; i < 30; i += 1) {
      ctx.beginPath()
      ctx.arc(rand() * size, size - rand() * 60, 2 + rand() * 8, 0, Math.PI * 2)
      ctx.fill()
    }
    return canvas
  })
}

export function drawHazard() {
  return cached('hazard', () => {
    const w = 256
    const h = 32
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#d99a1c'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#121212'
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + 16, h)
      ctx.lineTo(x + 16 + h, 0)
      ctx.lineTo(x + h, 0)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    const rand = random(5)
    for (let i = 0; i < 80; i += 1) ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 4, 1)
    return canvas
  })
}

// Stencil lettering on a transparent ground.
export function drawStencil(text, { width = 512, height = 64, color = '#e7dcc0' } = {}) {
  return cached(`stencil:${text}:${color}`, () => {
    const canvas = makeCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = color
    ctx.font = `bold ${Math.floor(height * 0.62)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2, width - 16)
    // Stencil bridges.
    ctx.globalCompositeOperation = 'destination-out'
    for (let x = 6; x < width; x += 23) ctx.fillRect(x, height * 0.47, 2, height * 0.08)
    return canvas
  })
}

// Moonlit platform seen through a window: sky, moon, a lit carriage, lamps.
export function drawNightPlatform() {
  return cached('night-platform', () => {
    const w = 512
    const h = 256
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#0b1430')
    sky.addColorStop(0.6, '#1d2a52')
    sky.addColorStop(1, '#2a2440')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    const rand = random(3)
    for (let i = 0; i < 70; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`
      ctx.fillRect(rand() * w, rand() * h * 0.5, 1, 1)
    }
    const moon = ctx.createRadialGradient(w * 0.78, h * 0.2, 4, w * 0.78, h * 0.2, 40)
    moon.addColorStop(0, 'rgba(255,250,230,1)')
    moon.addColorStop(0.35, 'rgba(255,250,230,0.9)')
    moon.addColorStop(0.4, 'rgba(200,210,255,0.25)')
    moon.addColorStop(1, 'rgba(200,210,255,0)')
    ctx.fillStyle = moon
    ctx.fillRect(w * 0.6, 0, w * 0.4, h * 0.5)
    // Station roofs.
    ctx.fillStyle = '#0a0c14'
    ctx.fillRect(0, h * 0.42, w * 0.3, h * 0.2)
    ctx.beginPath()
    ctx.moveTo(0, h * 0.42)
    ctx.lineTo(w * 0.15, h * 0.3)
    ctx.lineTo(w * 0.3, h * 0.42)
    ctx.fill()
    // Carriage with warm windows.
    ctx.fillStyle = '#12261c'
    ctx.fillRect(0, h * 0.55, w, h * 0.25)
    ctx.fillStyle = '#0c1912'
    ctx.fillRect(0, h * 0.52, w, h * 0.04)
    for (let x = 12; x < w; x += 46) {
      ctx.fillStyle = '#ffcf86'
      ctx.fillRect(x, h * 0.6, 30, h * 0.1)
      ctx.fillStyle = 'rgba(150,20,20,0.85)'
      ctx.fillRect(x, h * 0.6, 7, h * 0.1)
      ctx.fillRect(x + 23, h * 0.6, 7, h * 0.1)
    }
    ctx.fillStyle = '#c9a44a'
    ctx.fillRect(0, h * 0.74, w, 2)
    ctx.fillStyle = '#16151a'
    ctx.fillRect(0, h * 0.8, w, h * 0.2)
    // Lamp posts with halos.
    for (const x of [w * 0.18, w * 0.55, w * 0.9]) {
      ctx.fillStyle = '#0a0a0c'
      ctx.fillRect(x - 1.5, h * 0.4, 3, h * 0.45)
      const halo = ctx.createRadialGradient(x, h * 0.4, 1, x, h * 0.4, 18)
      halo.addColorStop(0, 'rgba(255,220,150,1)')
      halo.addColorStop(1, 'rgba(255,200,120,0)')
      ctx.fillStyle = halo
      ctx.fillRect(x - 18, h * 0.4 - 18, 36, 36)
    }
    return canvas
  })
}

// A lit carriage window: lamplit saloon behind, seat backs and a table lamp,
// red curtains tied back at the sides under a fringed pelmet.
export function drawCarriageWindow() {
  return cached('carriage-window', () => {
    const w = 256
    const h = 212
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    const room = ctx.createRadialGradient(w * 0.5, h * 0.3, 8, w * 0.5, h * 0.45, w * 0.62)
    room.addColorStop(0, '#ffe6b0')
    room.addColorStop(0.45, '#f0a85a')
    room.addColorStop(1, '#6e3416')
    ctx.fillStyle = room
    ctx.fillRect(0, 0, w, h)
    // Panelled far wall.
    ctx.strokeStyle = 'rgba(90,40,14,0.35)'
    ctx.lineWidth = 2
    for (let x = 40; x < w; x += 58) ctx.strokeRect(x, h * 0.2, 44, h * 0.36)
    // Ceiling lamp.
    const lamp = ctx.createRadialGradient(w * 0.5, h * 0.17, 1, w * 0.5, h * 0.17, 36)
    lamp.addColorStop(0, 'rgba(255,250,225,1)')
    lamp.addColorStop(1, 'rgba(255,220,160,0)')
    ctx.fillStyle = lamp
    ctx.fillRect(w * 0.5 - 36, h * 0.17 - 36, 72, 72)
    // Seat backs.
    for (const x of [w * 0.12, w * 0.62]) {
      ctx.fillStyle = '#4a1812'
      ctx.beginPath()
      ctx.roundRect(x, h * 0.6, w * 0.26, h * 0.4, 14)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,190,120,0.18)'
      ctx.fillRect(x + 6, h * 0.62, w * 0.26 - 12, 4)
    }
    // Table with a cloth and a shaded lamp.
    ctx.fillStyle = '#efe4cc'
    ctx.fillRect(w * 0.38, h * 0.74, w * 0.24, h * 0.26)
    ctx.fillStyle = '#b08d3f'
    ctx.fillRect(w * 0.495, h * 0.6, 3, h * 0.14)
    ctx.fillStyle = '#ff9a6a'
    ctx.beginPath()
    ctx.moveTo(w * 0.46, h * 0.6)
    ctx.lineTo(w * 0.54, h * 0.6)
    ctx.lineTo(w * 0.525, h * 0.53)
    ctx.lineTo(w * 0.475, h * 0.53)
    ctx.fill()
    // Curtains, gathered at a tie-back.
    for (const side of [-1, 1]) {
      const edge = side < 0 ? 0 : w
      const drape = ctx.createLinearGradient(edge, 0, edge - side * w * 0.24, 0)
      drape.addColorStop(0, '#5a0a10')
      drape.addColorStop(0.5, '#a8182a')
      drape.addColorStop(1, '#6e0c14')
      ctx.fillStyle = drape
      ctx.beginPath()
      ctx.moveTo(edge, 0)
      ctx.lineTo(edge - side * w * 0.26, 0)
      ctx.quadraticCurveTo(edge - side * w * 0.1, h * 0.4, edge - side * w * 0.07, h * 0.58)
      ctx.quadraticCurveTo(edge - side * w * 0.16, h * 0.8, edge - side * w * 0.2, h)
      ctx.lineTo(edge, h)
      ctx.fill()
      ctx.strokeStyle = 'rgba(40,0,4,0.45)'
      ctx.lineWidth = 2
      for (let i = 1; i < 4; i += 1) {
        ctx.beginPath()
        ctx.moveTo(edge - side * w * 0.06 * i, 0)
        ctx.quadraticCurveTo(edge - side * w * 0.025 * i, h * 0.45, edge - side * w * 0.02 * i, h * 0.58)
        ctx.stroke()
      }
      ctx.fillStyle = '#c9a44a'
      ctx.fillRect(edge - side * w * 0.11 - 6, h * 0.56, 12, 6)
    }
    // Pelmet with a gold fringe.
    ctx.fillStyle = '#7e0e18'
    ctx.fillRect(0, 0, w, h * 0.1)
    ctx.fillStyle = '#d6b05a'
    for (let x = 0; x < w; x += 6) ctx.fillRect(x, h * 0.1, 3, 6)
    // Frame shadow.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.72)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(20,6,0,0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, w, h)
    return canvas
  })
}

// Canopy valance: two painted boards per repeat with pointed ends, on a
// transparent ground so the points cut a saw-tooth edge.
export function drawValance() {
  return cached('valance', () => {
    const w = 128
    const h = 256
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    const rand = random(9)
    for (let i = 0; i < 2; i += 1) {
      const x0 = i * 64 + 2
      const x1 = x0 + 60
      const paint = ctx.createLinearGradient(x0, 0, x1, 0)
      paint.addColorStop(0, '#b8ad8e')
      paint.addColorStop(0.5, '#ddd2b4')
      paint.addColorStop(1, '#a89e80')
      ctx.fillStyle = paint
      ctx.beginPath()
      ctx.moveTo(x0, 0)
      ctx.lineTo(x1, 0)
      ctx.lineTo(x1, h * 0.8)
      ctx.lineTo((x0 + x1) / 2, h)
      ctx.lineTo(x0, h * 0.8)
      ctx.fill()
      // Weathering and grain.
      for (let g = 0; g < 14; g += 1) {
        ctx.fillStyle = `rgba(70,55,35,${0.05 + rand() * 0.08})`
        ctx.fillRect(x0 + rand() * 60, 0, 1, h * (0.5 + rand() * 0.3))
      }
      ctx.fillStyle = 'rgba(40,30,18,0.35)'
      ctx.fillRect(x0, h * 0.12, 60, 3)
      ctx.beginPath()
      ctx.arc((x0 + x1) / 2, h * 0.55, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    return canvas
  })
}

// Gold shaded serif lettering on a transparent ground, for the bodyside.
export function drawLettering(text, { width = 1024, height = 96 } = {}) {
  return cached(`lettering:${text}`, () => {
    const canvas = makeCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    ctx.font = `bold ${Math.floor(height * 0.66)}px Georgia, "Times New Roman", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const spaced = text.split('').join(String.fromCharCode(8202))
    ctx.fillStyle = 'rgba(30,14,4,0.85)'
    ctx.fillText(spaced, width / 2 + 3, height / 2 + 3, width - 24)
    const gold = ctx.createLinearGradient(0, height * 0.2, 0, height * 0.8)
    gold.addColorStop(0, '#fbe7a6')
    gold.addColorStop(0.5, '#d4a443')
    gold.addColorStop(1, '#8a6224')
    ctx.fillStyle = gold
    ctx.fillText(spaced, width / 2, height / 2, width - 24)
    return canvas
  })
}

// One palm frond on a transparent ground; leaflets fan off a curved rib.
export function drawFrond() {
  return cached('frond', () => {
    const w = 128
    const h = 256
    const canvas = makeCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#3d5a24'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(w / 2, h)
    ctx.quadraticCurveTo(w / 2 + 6, h / 2, w / 2, 4)
    ctx.stroke()
    for (let i = 0; i < 22; i += 1) {
      const t = i / 22
      const y = h - t * (h - 12)
      const len = 50 * Math.sin(Math.PI * (0.15 + t * 0.85))
      for (const side of [-1, 1]) {
        ctx.fillStyle = i % 2 ? '#3f6e2c' : '#355f26'
        ctx.beginPath()
        ctx.moveTo(w / 2, y)
        ctx.quadraticCurveTo(w / 2 + side * len * 0.6, y - 10, w / 2 + side * len, y - 22)
        ctx.quadraticCurveTo(w / 2 + side * len * 0.5, y - 4, w / 2, y + 3)
        ctx.fill()
      }
    }
    return canvas
  })
}

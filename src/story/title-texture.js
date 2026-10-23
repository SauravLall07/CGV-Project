import * as THREE from 'three'

export function createTitleTexture(doc = document) {
  const canvas = doc.createElement('canvas'); canvas.width = 2048; canvas.height = 512
  const c = canvas.getContext('2d')
  c.clearRect(0, 0, canvas.width, canvas.height)
  // Explicit character advances reproduce CSS letter-spacing on Canvas
  // without depending on browser support for context.letterSpacing.
  function spaced(text, y, font, px, spacing, color) {
    c.font = font; c.fillStyle = color
    let width = -spacing
    for (const character of text) width += c.measureText(character).width + spacing
    let x = (2048 - width) / 2
    for (const character of text) {
      c.fillText(character, x, y)
      x += c.measureText(character).width + spacing
    }
  }
  c.shadowColor = '#38BDF8'; c.shadowBlur = 28
  spaced('CHRONO EXPRESS', 260, '800 150px Georgia, "Times New Roman", "Palatino Linotype", serif', 150, 150 * 0.14, '#f0e6cf')
  c.shadowBlur = 12
  spaced('THE LAST HEIST', 352, '600 46px Georgia, serif', 46, 46 * 0.5, 'rgba(176,141,63,0.8)')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false; texture.minFilter = texture.magFilter = THREE.LinearFilter
  return texture
}

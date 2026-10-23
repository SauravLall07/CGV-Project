import * as THREE from 'three'

// One canvas painting per prepared player. The GPU animates the finished
// texture; no fonts, paths or noise are drawn during playback.
export function createNewspaperTexture(doc = document) {
  const canvas = doc.createElement('canvas')
  canvas.width = 1024; canvas.height = 1400
  const c = canvas.getContext('2d')
  c.fillStyle = '#e7d9b9'; c.fillRect(0, 0, 1024, 1400)
  let seed = 1934
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 18000; i++) {
    c.fillStyle = `rgba(65,45,20,${random() * 0.06})`
    c.fillRect(random() * 1024, random() * 1400, 1 + random() * 3, 1 + random() * 3)
  }
  const edge = c.createRadialGradient(512, 650, 280, 512, 650, 880)
  edge.addColorStop(0, 'rgba(80,48,15,0)'); edge.addColorStop(1, 'rgba(80,48,15,0.4)')
  c.fillStyle = edge; c.fillRect(0, 0, 1024, 1400)
  c.fillStyle = '#242019'; c.textAlign = 'center'
  c.font = 'bold 57px Georgia, serif'; c.fillText('THE EVENING CHRONICLE', 512, 98, 940)
  c.fillRect(42, 124, 940, 3); c.fillRect(42, 132, 940, 1)
  c.font = '22px Georgia, serif'; c.fillText('OCTOBER 23, 1934', 512, 171)
  c.fillRect(42, 191, 940, 2)
  c.font = '900 83px Georgia, serif'; c.fillText('VANE CLEARED', 512, 294, 936)
  c.fillText('AGAIN', 512, 389)
  c.font = 'italic 35px Georgia, serif'
  c.fillText('Key witness vanishes on eve of trial', 512, 456, 930)
  c.fillStyle = '#302e28'; c.fillRect(72, 495, 880, 390)
  c.save(); c.beginPath(); c.rect(72, 495, 880, 390); c.clip()
  c.strokeStyle = '#686251'; c.lineWidth = 1
  for (let x = -400; x < 1400; x += 12) {
    c.beginPath(); c.moveTo(x, 495); c.lineTo(x + 390, 885); c.stroke()
    c.beginPath(); c.moveTo(x, 885); c.lineTo(x + 390, 495); c.stroke()
  }
  c.fillStyle = '#181916'
  c.beginPath(); c.ellipse(530, 657, 82, 99, 0, 0, Math.PI * 2); c.fill()
  c.fillRect(400, 595, 260, 23); c.fillRect(455, 547, 152, 55)
  c.beginPath(); c.moveTo(350, 885); c.lineTo(445, 735); c.lineTo(610, 735); c.lineTo(725, 885); c.fill()
  c.restore()
  c.fillStyle = '#554e40'; c.font = 'italic 20px Georgia, serif'
  c.fillText('Rail magnate walks free as inquiry collapses', 512, 920)
  c.fillStyle = '#777061'
  for (let col = 0; col < 3; col++) for (let row = 0; row < 22; row++) {
    c.fillRect(58 + col * 311, 961 + row * 16, 270 - (row % 7 === 6 ? 65 : random() * 20), 3)
  }
  c.fillStyle = '#393328'; c.fillRect(42, 1340, 940, 1)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false; texture.minFilter = texture.magFilter = THREE.LinearFilter
  return texture
}

import * as THREE from 'three'
import { addInstances, box, mergeParts, place } from './geom.js'

// One bay: a stone surround and sill, a dark frame with muntins, and a pane.
// Built once and instanced across both wings and the returns. `yaw` turns the
// bay's outside (-X) onto the wall it sits in.

const WIDTH = 1.18
const HEIGHT = 2.16

function frameGeometry() {
  const w = WIDTH
  const h = HEIGHT
  const t = 0.055
  const d = 0.07
  const x = 0.02
  return mergeParts([
    box(d, h, t, x, 0, -w / 2 + t / 2),
    box(d, h, t, x, 0, w / 2 - t / 2),
    box(d, t, w, x, h / 2 - t / 2, 0),
    box(d, t, w - t * 2, x, -h / 2 + t / 2, 0),
    box(d * 0.65, h - t * 2, t * 0.48, x - 0.012, 0, 0),
    box(d * 0.65, t * 0.48, w - t * 2, x - 0.012, h * 0.14, 0),
    box(d * 0.65, t * 0.48, w - t * 2, x - 0.012, -h * 0.2, 0)
  ])
}

function surroundGeometry() {
  const w = WIDTH + 0.28
  const h = HEIGHT + 0.22
  const t = 0.1
  const d = 0.12
  const tile = 1.35
  return mergeParts([
    box(d, h, t, -0.02, 0.04, -w / 2 + t / 2, tile),
    box(d, h, t, -0.02, 0.04, w / 2 - t / 2, tile),
    box(d, t, w, -0.02, h / 2 - t / 2 + 0.04, 0, tile),
    box(d + 0.06, 0.08, w + 0.08, -0.01, -h / 2 + 0.02, 0, tile)
  ])
}

function glassGeometry() {
  const geometry = new THREE.PlaneGeometry(WIDTH - 0.14, HEIGHT - 0.14)
  geometry.rotateY(Math.PI / 2)
  geometry.translate(0.045, 0, 0)
  return geometry
}

export function addWindowBays(parent, openings, materials, stats) {
  const buckets = [[], [], [], []]
  const surrounds = []
  const frames = []
  openings.forEach((opening, index) => {
    const matrix = place(opening.x, opening.y, opening.z, opening.yaw || 0)
    surrounds.push(matrix)
    frames.push(matrix)
    buckets[opening.shade ?? 0].push(matrix.clone())
  })

  addInstances(parent, surroundGeometry(), materials.stoneTrim, surrounds, {
    name: 'landing-window-surrounds',
    receiveShadow: true
  }, stats)
  addInstances(parent, frameGeometry(), materials.iron, frames, {
    name: 'landing-window-frames'
  }, stats)

  const glass = glassGeometry()
  buckets.forEach((matrices, shade) => {
    addInstances(parent, glass.clone(), materials.glass[shade], matrices, {
      name: `landing-window-glass-${shade}`
    }, stats)
  })
  glass.dispose()
}

export const WINDOW_BAY = { width: WIDTH, height: HEIGHT }

import * as THREE from 'three'
import { addMesh, box, mergeParts } from './geom.js'

// Centrepiece of the square: a stepped stone plinth, a fluted cast-iron
// column and three lanterns on scrolled arms. It carries one of the few
// real lights; the warm disc on the cobbles is painted by the light pools.

const LANTERN_Y = 4.95
const ARM_REACH = 0.62

export const CENTRE_LAMP_BASE = 0.82

function ironGeometry(x, y, z) {
  const parts = []
  const column = new THREE.CylinderGeometry(0.1, 0.15, 3.7, 12)
  column.translate(0, y + 0.95 + 1.85, 0)
  parts.push(column)
  for (const ring of [
    { h: 1.05, r: 0.22, t: 0.12 },
    { h: 1.32, r: 0.17, t: 0.06 },
    { h: 3.2, r: 0.14, t: 0.05 },
    { h: 4.62, r: 0.18, t: 0.08 }
  ]) {
    const collar = new THREE.CylinderGeometry(ring.r, ring.r, ring.t, 12)
    collar.translate(0, y + ring.h, 0)
    parts.push(collar)
  }
  const finial = new THREE.ConeGeometry(0.09, 0.42, 10)
  finial.translate(0, y + 5.42, 0)
  parts.push(finial)
  const ball = new THREE.SphereGeometry(0.09, 10, 8)
  ball.translate(0, y + 5.15, 0)
  parts.push(ball)

  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6
    const cx = Math.cos(angle)
    const cz = Math.sin(angle)
    const arm = new THREE.BoxGeometry(ARM_REACH, 0.05, 0.05)
    arm.translate(ARM_REACH / 2, 0, 0)
    arm.rotateY(-angle)
    arm.translate(0, y + 4.66, 0)
    parts.push(arm)
    const scroll = new THREE.TorusGeometry(0.12, 0.02, 6, 14, Math.PI * 1.5)
    scroll.rotateY(-angle + Math.PI / 2)
    scroll.translate(cx * ARM_REACH * 0.5, y + 4.52, cz * ARM_REACH * 0.5)
    parts.push(scroll)
    const lx = cx * ARM_REACH
    const lz = cz * ARM_REACH
    for (const [ox, oz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
      parts.push(box(0.04, 0.32, 0.04, lx + ox, y + LANTERN_Y, lz + oz))
    }
    parts.push(box(0.26, 0.05, 0.26, lx, y + LANTERN_Y + 0.18, lz))
    parts.push(box(0.2, 0.04, 0.2, lx, y + LANTERN_Y - 0.17, lz))
    const cap = new THREE.ConeGeometry(0.17, 0.16, 4)
    cap.rotateY(Math.PI / 4)
    cap.translate(lx, y + LANTERN_Y + 0.28, lz)
    parts.push(cap)
  }
  const geometry = mergeParts(parts)
  geometry.translate(x, 0, z)
  return geometry
}

function glowGeometry(x, y, z) {
  const parts = []
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6
    parts.push(box(0.16, 0.28, 0.16, x + Math.cos(angle) * ARM_REACH, y + LANTERN_Y, z + Math.sin(angle) * ARM_REACH))
  }
  return mergeParts(parts)
}

export function addCentreLamp(parent, spot, materials, stats) {
  const { x, y, z } = spot
  const tile = materials.stoneTile
  addMesh(parent, mergeParts([
    box(1.64, 0.22, 1.64, x, y + 0.11, z, tile),
    box(1.24, 0.5, 1.24, x, y + 0.47, z, tile),
    box(1.36, 0.1, 1.36, x, y + 0.77, z, tile),
    box(0.62, 0.16, 0.62, x, y + 0.9, z, tile)
  ]), materials.stone, { castShadow: true, receiveShadow: true, name: 'landing-centre-plinth' }, stats)
  addMesh(parent, ironGeometry(x, y, z), materials.iron, { name: 'landing-centre-lamp' }, stats)
  const glow = materials.lantern.clone()
  glow.emissiveIntensity = 5
  addMesh(parent, glowGeometry(x, y, z), glow, { name: 'landing-centre-glow' }, stats)

  const light = new THREE.PointLight(0xffb468, 90, 9, 2)
  light.name = 'landing-centre-light'
  light.castShadow = false
  light.position.set(x, y + LANTERN_Y, z)
  parent.add(light)
}

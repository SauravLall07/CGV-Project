import * as THREE from 'three'
import { addInstances, box, mergeParts } from './geom.js'

// One 1930s sedan, instanced. Length runs along local Z, ground at y = 0.
// Body casts a shadow; lamps, wheels and the running boards do not.

const PAINTS = [0x1a2824, 0x2c1e1a, 0x161b22]

function bodyGeometry() {
  return mergeParts([
    box(1.48, 0.42, 4.05, 0, 0.62, 0),
    box(1.32, 0.38, 1.55, 0, 0.95, 1.05),
    box(1.38, 0.62, 1.45, 0, 1.22, -0.35),
    box(1.22, 0.1, 1.15, 0, 1.56, -0.32),
    box(1.28, 0.36, 0.72, 0, 0.92, -1.55),
    box(1.5, 0.08, 0.9, 0, 0.48, 1.85),
    box(1.5, 0.08, 0.55, 0, 0.46, -1.85)
  ])
}

function darkGeometry() {
  const wheels = []
  for (const x of [-0.72, 0.72]) {
    for (const z of [1.25, -1.25]) {
      const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.16, 12)
      wheel.rotateZ(Math.PI / 2)
      wheel.translate(x, 0.36, z)
      wheels.push(wheel)
      const arch = new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
      arch.scale(1, 0.7, 1.15)
      arch.translate(x, 0.5, z)
      wheels.push(arch)
    }
  }
  wheels.push(box(1.62, 0.06, 2.3, 0, 0.32, 0))
  wheels.push(box(0.9, 0.42, 0.06, 0, 0.78, 1.82))
  wheels.push(box(1.15, 0.38, 0.04, 0, 1.28, -0.35))
  wheels.push(box(1.15, 0.32, 0.04, 0, 1.28, -1.05))
  return mergeParts(wheels)
}

function lampGeometry() {
  const lamps = []
  for (const x of [-0.48, 0.48]) {
    const lamp = new THREE.SphereGeometry(0.1, 8, 6)
    lamp.translate(x, 0.72, 2.02)
    lamps.push(lamp)
  }
  return mergeParts(lamps)
}

function chromeGeometry() {
  const parts = []
  for (const x of [-0.72, 0.72]) {
    for (const z of [1.25, -1.25]) {
      const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8)
      hub.rotateZ(Math.PI / 2)
      hub.translate(x, 0.36, z)
      parts.push(hub)
    }
  }
  parts.push(box(0.55, 0.22, 0.04, 0, 0.72, 2.04))
  return mergeParts(parts)
}

export function addCars(parent, spots, materials, stats) {
  const bodies = []
  const darks = []
  const lamps = []
  const chromes = []
  const colors = new Float32Array(spots.length * 3)
  spots.forEach((spot, index) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(spot.x, spot.y, spot.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw || 0),
      new THREE.Vector3(1, 1, 1)
    )
    bodies.push(matrix)
    darks.push(matrix.clone())
    lamps.push(matrix.clone())
    chromes.push(matrix.clone())
    const paint = new THREE.Color(PAINTS[index % PAINTS.length])
    colors[index * 3] = paint.r
    colors[index * 3 + 1] = paint.g
    colors[index * 3 + 2] = paint.b
  })

  const paint = materials.roof.clone()
  paint.color.set(0xffffff)
  paint.roughness = 0.32
  paint.metalness = 0.55
  const body = addInstances(parent, bodyGeometry(), paint, bodies, {
    castShadow: true,
    receiveShadow: true,
    name: 'landing-cars'
  }, stats)
  if (body) {
    body.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  }
  addInstances(parent, darkGeometry(), materials.iron, darks, { name: 'landing-car-dark' }, stats)
  addInstances(parent, lampGeometry(), materials.lantern, lamps, { name: 'landing-car-lamps' }, stats)
  addInstances(parent, chromeGeometry(), materials.brass, chromes, { name: 'landing-car-chrome' }, stats)
}

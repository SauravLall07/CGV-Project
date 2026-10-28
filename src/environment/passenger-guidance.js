import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { signMaterial } from './textures.js'

// Floor-local direction, outside the rack footprint and before the real hole.
// No luminous ribbon spans air or suggests that markings themselves support feet.
export function addPassengerGuidance(root, center, brass) {
  const parts = []
  for (const [x, z, yaw] of [[0.85, 7.4, 0], [-0.7, 4.3, 0.6], [0, 2.25, -0.6]]) {
    const shape = new THREE.Shape()
    shape.moveTo(-0.25, -0.1)
    for (const p of [[0, 0.25], [0.25, -0.1], [0.16, -0.18], [0, 0.06], [-0.16, -0.18]]) shape.lineTo(...p)
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2); geometry.rotateY(yaw)
    geometry.translate(x, 0.025, center + z)
    parts.push(geometry)
  }
  const marks = new THREE.Mesh(mergeGeometries(parts, false), brass)
  parts.forEach(part => part.dispose())
  marks.name = 'passenger-right-then-centre-guidance'
  marks.userData.noCameraCollision = true
  root.add(marks)
  for (const [name, text, z, y] of [
    ['passenger-weave-sign', 'RIGHT OF RACK / LEFT OF SEAT / CENTRE FOR GAP', 8.1, 2.8],
    ['passenger-exit-sign', 'DUCK BEAM / STAND / JUMP RAIL', -3.7, 2.7]
  ]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.3), signMaterial({ text, width: 2048, emissiveIntensity: 0.3 }))
    sign.name = name; sign.position.set(0, y, center + z)
    sign.userData.noCameraCollision = true; root.add(sign)
  }
}

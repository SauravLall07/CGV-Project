import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Unit bounds retain the existing debris collision envelope after scaling.
export function createWreckPanelGeometry(variant = 0) {
  if (variant === 2) return new RoundedBoxGeometry(1, 1, 1, 1, 0.06)
  const shape = new THREE.Shape()
  const outline = variant === 0
    ? [[-0.5, -0.5], [0.3, -0.5], [0.5, -0.32], [0.46, 0.24],
      [0.5, 0.5], [0.05, 0.44], [-0.16, 0.5], [-0.5, 0.36]]
    : [[-0.5, -0.5], [0.32, -0.44], [0.5, -0.26], [0.5, 0.5],
      [0.12, 0.41], [-0.08, 0.5], [-0.5, 0.38]]
  shape.moveTo(...outline[0])
  outline.slice(1).forEach(point => shape.lineTo(...point))
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12, steps: 1, bevelEnabled: true,
    bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 1
  })
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i)
    position.setY(i, position.getY(i) + Math.max(0, z) * 0.16 + x * z * 0.06)
  }
  geometry.computeBoundingBox()
  const size = geometry.boundingBox.getSize(new THREE.Vector3())
  const center = geometry.boundingBox.getCenter(new THREE.Vector3())
  geometry.translate(-center.x, -center.y, -center.z)
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

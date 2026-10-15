import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Static L3 reference landmark: a ceiling service header has pulled towards
// the blown left window. Keep every piece above body height and by the wall;
// it dresses an existing opening, never implies a new floor/support or blocker.
// Three material batches replace the old rupture strip and two glowing tears.
export function addMechanicalReference(group, { wallX, brass, darkSteel }) {
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x29464b, emissive: 0x69bdcd, emissiveIntensity: 0.25,
    metalness: 0.12, roughness: 0.65
  })
  const batches = [[], [], []]
  const matrix = new THREE.Matrix4()
  const pose = new THREE.Object3D()
  function piece(batch, size, position, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(...size)
    pose.position.set(...position); pose.rotation.set(...rotation); pose.updateMatrix()
    matrix.copy(pose.matrix)
    geometry.applyMatrix4(matrix)
    batches[batch].push(geometry)
  }
  const x = -wallX + 0.25
  // Broken lengths retain the luxury handrail's brass profile. Their offset
  // and the bent rib ends tell one directional failure instead of random litter.
  piece(0, [0.07, 0.07, 1.5], [x, 3.12, 1.9])
  piece(0, [0.07, 0.07, 1.2], [x + 0.08, 3.02, 3.25], [-0.16, 0.08, 0])
  piece(0, [0.07, 0.07, 1.3], [x + 0.16, 2.86, 4.5], [-0.08, 0, 0])
  piece(0, [0.48, 0.07, 0.1], [x + 0.1, 3.2, 1.55], [0, 0, -0.12])
  piece(0, [0.48, 0.07, 0.1], [x + 0.16, 3.0, 4.9], [0, 0, -0.25])
  // Two lining leaves hang from the failed header, exposing the cool exterior
  // in the existing viewport. Broad silhouettes stay below the warm ceiling.
  piece(1, [0.035, 0.35, 0.75], [x + 0.08, 2.9, 2.15], [0, 0, -0.2])
  piece(1, [0.035, 0.28, 0.65], [x + 0.18, 2.75, 4.25], [0, 0, -0.32])
  piece(2, [0.04, 0.025, 0.62], [x + 0.23, 2.88, 4.25])

  const names = ['mechanical-buckled-header', 'mechanical-torn-header-lining', 'mechanical-header-time-seam']
  for (let i = 0; i < batches.length; i++) {
    const geometry = mergeGeometries(batches[i], false)
    batches[i].forEach(part => part.dispose())
    const mesh = new THREE.Mesh(geometry, [brass, darkSteel, cyan][i])
    mesh.name = names[i]
    mesh.userData.noCameraCollision = true
    group.add(mesh)
  }
}

// Same footprint and one draw as the original filled pad. A bracket outline
// leaves its solid wood floor visible; chevrons face the upcoming shutter.
export function switchingRecessGeometry() {
  const pieces = []
  for (const [w, d, x, z, yaw] of [
    [0.045, 2, -0.5275, 0, 0], [0.045, 2, 0.5275, 0, 0],
    [1.1, 0.045, 0, 0.9775, 0], [0.3, 0.045, -0.125, -0.76, 0.45],
    [0.3, 0.045, 0.125, -0.76, -0.45]
  ]) {
    const geometry = new THREE.PlaneGeometry(w, d)
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(yaw)
    geometry.translate(x, 0, z)
    pieces.push(geometry)
  }
  const result = mergeGeometries(pieces, false)
  pieces.forEach(part => part.dispose())
  return result
}

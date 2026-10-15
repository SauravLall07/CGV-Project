import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// L3 only. Replace an existing generic glow strip with one static brass batch.
// These are overhead remnants, not floors, supports, occluders or repair targets.
// Real moving gangways, linkage and suspended decks remain level-owned.
export function refineWreckLandmark(group, key, half, wallX) {
  const strip = group.getObjectByName(`${key}-rupture-strip`)
  if (!strip) return
  const pieces = []
  const pose = new THREE.Object3D()
  function box(size, position, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(...size)
    pose.position.set(...position); pose.rotation.set(...rotation); pose.updateMatrix()
    geometry.applyMatrix4(pose.matrix)
    pieces.push(geometry)
  }
  const edge = wallX - 0.2
  let landmark
  switch (key) {
    case 'vault': {
      landmark = 'ruptured-core-containment'
      // Empty, broken armillary crown echoes L2's brass Core display. It has
      // pulled upward/outward; nothing occupies the empty centre below it.
      const crown = new THREE.TorusGeometry(0.9, 0.045, 4, 24, Math.PI * 1.55)
      crown.rotateX(Math.PI / 2)
      crown.translate(0, 2.98, half - 2.6)
      pieces.push(crown)
      for (const s of [-1, 1]) {
        box([1.25, 0.08, 0.1], [s * 1.45, 3.17, half - 2.6], [0, 0, s * 0.18])
        box([0.08, 0.3, 0.1], [s * edge, 3.2, half - 2.6])
      }
      break
    }
    case 'convergence':
      landmark = 'split-junction-header'
      // L2's brass junction frame splits towards the two existing lanes.
      box([2.9, 0.1, 0.18], [-0.77, 3.2, 9], [0, -0.1, 0.04])
      box([1.55, 0.1, 0.18], [1.75, 3.08, 8.85], [0, 0.15, -0.08])
      box([0.08, 0.3, 0.18], [0.85, 3.2, 9])
      break
    case 'cargo':
      landmark = 'folded-luggage-header'
      // A broad folded luggage-rack fascia points towards the real gangway;
      // it stays by the wall so it cannot masquerade as a crossing.
      box([0.16, 0.12, 2.1], [-edge, 3.12, 7.2])
      box([0.5, 0.1, 1.5], [-edge + 0.2, 2.93, 5.65], [-0.18, 0, -0.16])
      box([0.16, 0.12, 1.25], [-edge + 0.15, 2.72, 4.3], [-0.12, 0, 0])
      break
    case 'relay':
      landmark = 'operator-station-header'
      // Brass route-board surround recalls L2's operator station, above the
      // existing release platform/linkage rather than another glowing rift.
      box([0.12, 0.08, 2.6], [-edge, 3.08, 2])
      box([0.12, 0.3, 0.08], [-edge, 2.97, 3.3])
      box([0.12, 0.38, 0.08], [-edge + 0.08, 2.93, 0.7], [0, 0, -0.18])
      break
    case 'security':
      landmark = 'sheared-security-ribs'
      // The intact island is framed by two sheared ceiling ribs. No new
      // diagonal spans the holes or competes with the broad moving decks.
      for (const s of [-1, 1]) {
        box([0.7, 0.1, 0.18], [s * (edge - 0.2), 3.12, 0.8], [0, 0, s * 0.22])
        box([0.12, 0.1, 1.7], [s * edge, 3.2, 0])
      }
      break
    case 'passenger':
      landmark = 'torn-saloon-arch'
      // L2's saloon arch peels outwards at the forward end, leaving a clear
      // central view to the existing broken bridge. No finale logic changes.
      for (const s of [-1, 1]) {
        box([0.12, 0.45, 0.14], [s * edge, 2.99, -half + 2])
        box([0.85, 0.09, 0.14], [s * (edge - 0.2), 3.26, -half + 2], [0, s * 0.2, s * 0.22])
      }
      break
    default: return
  }
  const geometry = mergeGeometries(pieces, false)
  pieces.forEach(piece => piece.dispose())
  strip.geometry.dispose()
  strip.geometry = geometry
  strip.position.set(0, 0, 0)
  strip.name = `${key}-${landmark}`
  strip.material.color.setHex(0xc4a052)
  strip.material.emissive.setHex(0x3a2810)
  strip.material.emissiveIntensity = 0.12
  strip.material.metalness = 0.8
  strip.material.roughness = 0.48
  strip.userData.noCameraCollision = true
  strip.userData.wreckLandmark = key
}

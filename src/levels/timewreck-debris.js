import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'

// Track the visible panels, not the oversized Cannon shapes used for bouncing.
export function createDebrisCollision(player, meshes) {
  const previousPlayer = player.mesh.position.clone()
  const position = new THREE.Vector3(), scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion(), sampleRotation = new THREE.Quaternion()
  const samplePosition = new THREE.Vector3(), matrix = new THREE.Matrix4()
  const debrisBox = new OBB(), bodyBox = new OBB()
  const pieces = meshes.map(mesh => {
    mesh.geometry.computeBoundingBox()
    return { mesh, box: new OBB().fromBox3(mesh.geometry.boundingBox),
      position: new THREE.Vector3(), rotation: new THREE.Quaternion(), visible: false }
  })

  function reset(mesh) {
    for (const piece of pieces) if (!mesh || piece.mesh === mesh) piece.visible = false
    if (!mesh) previousPlayer.copy(player.mesh.position)
  }

  function update(enabled = true) {
    const playerPosition = player.mesh.position
    const height = player.isCrouching() ? 1.15 : 1.85
    const playerTravel = previousPlayer.distanceTo(playerPosition)
    const teleported = playerTravel > 2
    bodyBox.halfSize.set(0.18, height / 2, 0.18)
    let hit = false
    for (const piece of pieces) {
      let visible = true
      for (let node = piece.mesh; node; node = node.parent) visible &&= node.visible
      piece.mesh.updateWorldMatrix(true, false)
      piece.mesh.matrixWorld.decompose(position, rotation, scale)
      visible &&= piece.mesh.scale.lengthSq() > 0
      visible &&= !piece.mesh.material.transparent || piece.mesh.material.opacity > 0
      if (enabled && visible && !hit) {
        // Sample both bodies' travel so fast debris cannot tunnel between frames.
        const sweep = piece.visible && !teleported
        const steps = sweep ? Math.max(1,
          Math.ceil((piece.position.distanceTo(position) + playerTravel) / 0.035),
          Math.ceil(piece.rotation.angleTo(rotation) / 0.08)) : 1
        for (let i = sweep ? 0 : steps; i <= steps; i++) {
          const u = i / steps
          samplePosition.lerpVectors(piece.position, position, u)
          sampleRotation.slerpQuaternions(piece.rotation, rotation, u)
          matrix.compose(samplePosition, sampleRotation, scale)
          debrisBox.copy(piece.box).applyMatrix4(matrix)
          bodyBox.center.lerpVectors(previousPlayer, playerPosition, u)
          bodyBox.center.y += height / 2
          if (debrisBox.intersectsOBB(bodyBox)) { hit = true; break }
        }
      }
      piece.position.copy(position)
      piece.rotation.copy(rotation)
      piece.visible = enabled && visible
    }
    previousPlayer.copy(playerPosition)
    return hit
  }

  return { update, reset }
}

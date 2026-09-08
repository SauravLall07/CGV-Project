import * as THREE from 'three'

// Terminal state of the sequence. The last heist frame is left in the
// scene (level-manager keepPrevious) and frozen under the credits overlay —
// this factory must not replace lighting, fog or geometry.

export function createCompleteLevel() {
  return {
    objective: '',
    checkpoint: { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
    dispose() {}
  }
}

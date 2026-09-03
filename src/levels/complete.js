import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'

// Terminal state of the sequence. No level content — a dark room holding the
// completion message until the player restarts (R). Phase 8 replaces this
// with a proper end screen and the hand-off to the credits.

export function createCompleteLevel({ scene }) {
  const key = new THREE.DirectionalLight(0xd8c9ff, 1.4)
  key.position.set(3, 6, 4)
  const ambient = new THREE.AmbientLight(0x6a5f80, 0.8)
  scene.add(key, ambient)

  scene.background = new THREE.Color(0x0d0b14)
  scene.fog = new THREE.Fog(0x0d0b14, 4, 20)

  return {
    objective: 'Heist complete — press R to run it again',
    checkpoint: { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
    bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },

    dispose() {
      scene.remove(key, ambient)
      disposeObject(key)
      disposeObject(ambient)
    }
  }
}

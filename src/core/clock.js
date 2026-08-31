import * as THREE from 'three'

// Thin wrapper exposing getDelta() for the render loop. Built on THREE.Timer
// rather than the deprecated THREE.Clock. Pure infrastructure plumbing
// today; useful later as the basis for the time-manipulation system, but
// adds no gameplay logic itself.
export function createClock() {
  const timer = new THREE.Timer()
  timer.connect(document)

  return {
    getDelta: (timestamp) => {
      timer.update(timestamp)
      return timer.getDelta()
    }
  }
}

import * as THREE from 'three'

// Creates the PerspectiveCamera with a sensible default FOV/near/far,
// positioned back from the origin. resize() keeps aspect ratio in sync with
// the window and should be called from a `window.resize` listener.
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(3, 3, 5)
  camera.lookAt(0, 0, 0)

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }

  window.addEventListener('resize', resize)

  return { camera, resize }
}

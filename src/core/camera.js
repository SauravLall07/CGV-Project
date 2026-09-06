import * as THREE from 'three'
import { settings } from '../core/settings.js'

// Creates the PerspectiveCamera with a sensible default near/far, positioned
// back from the origin. The vertical FOV comes from the player's settings and
// is re-applied whenever it changes. resize() keeps aspect ratio in sync with
// the window and should be called from a `window.resize` listener.
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    settings.get('fov'),
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

  function applySettings() {
    const fov = settings.get('fov')
    if (camera.fov === fov) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }

  const unsubscribe = settings.subscribe(applySettings)
  window.addEventListener('resize', resize)

  function dispose() {
    unsubscribe()
    window.removeEventListener('resize', resize)
  }

  return { camera, resize, dispose }
}

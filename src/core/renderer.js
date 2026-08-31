import * as THREE from 'three'

// Creates and owns the WebGLRenderer. Pixel ratio is capped to protect
// performance on lab hardware; resize() keeps the renderer in sync with the
// window and should be called from a `window.resize` listener.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  window.addEventListener('resize', resize)

  return { renderer, resize }
}

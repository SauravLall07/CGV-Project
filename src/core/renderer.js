import * as THREE from 'three'

// Creates and owns the WebGLRenderer. Pixel ratio is capped to protect
// performance on lab hardware; resize() keeps the renderer in sync with the
// window and should be called from a `window.resize` listener.
//
// Tone mapping matters here: three's lighting is physically based, so raw
// linear output clips highlights (lamp bulbs, emissive window panes) into flat
// white. ACES filmic rolls those off instead, which is most of the difference
// between "programmer lighting" and something that reads as lit.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  window.addEventListener('resize', resize)

  return { renderer, resize }
}

import * as THREE from 'three'
import { settings } from '../core/settings.js'

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  // Scene reference for the shadow-toggle recompile below; supplied by the
  // composition root once the scene exists.
  let sceneRef = null

  function resize() {
    // Render resolution is the device pixel ratio scaled by the player's
    // setting, so dropping it to 50% is a real fill-rate saving rather than
    // just a canvas-size change.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * settings.get('renderScale'))
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  // Toggling shadowMap.enabled or its type after materials have compiled
  // needs every affected program rebuilt, otherwise the change only shows up
  // on objects created afterwards.
  function invalidateMaterials() {
    if (!sceneRef) return
    sceneRef.traverse((node) => {
      const material = node.material
      if (!material) return
      for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true
    })
  }

  function applySettings() {
    renderer.toneMappingExposure = settings.get('brightness')

    const shadows = settings.get('shadows')
    const type = settings.get('softShadows') ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap
    const shadowsChanged = renderer.shadowMap.enabled !== shadows || renderer.shadowMap.type !== type
    renderer.shadowMap.enabled = shadows
    renderer.shadowMap.type = type
    if (shadowsChanged) {
      renderer.shadowMap.needsUpdate = true
      invalidateMaterials()
    }

    const scale = Math.min(window.devicePixelRatio, 2) * settings.get('renderScale')
    if (Math.abs(renderer.getPixelRatio() - scale) > 1e-4) resize()
  }

  applySettings()
  resize()

  const unsubscribe = settings.subscribe(applySettings)
  window.addEventListener('resize', resize)

  function dispose() {
    unsubscribe()
    window.removeEventListener('resize', resize)
  }

  return {
    renderer,
    resize,
    dispose,
    // Called once from main.js so shadow-toggle recompiles can reach the
    // whole scene graph.
    setScene(scene) { sceneRef = scene }
  }
}

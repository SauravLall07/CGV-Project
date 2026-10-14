import * as THREE from 'three'
import { settings, shadowMapSize } from '../core/settings.js'

// Creates and owns the WebGLRenderer. Pixel ratio is capped at 1.25 so a
// 2x display does not draw four times the pixels. The render-scale setting
// still multiplies that cap. resize() keeps the renderer in sync with the
// window and should be called from a `window.resize` listener.
//
// Tone mapping matters here: three's lighting is physically based, so raw
// linear output clips highlights (lamp bulbs, emissive window panes) into flat
// white. ACES filmic rolls those off instead, which is most of the difference
// between "programmer lighting" and something that reads as lit.
//
// No MSAA on the canvas: the scene is drawn into the single-sample post
// target, and only the final full-screen pass reaches the canvas, so a
// multisampled backbuffer would just add a resolve every frame.
const MAX_PIXEL_RATIO = 1.25

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  // Scene reference for the shadow-toggle recompile below; supplied by the
  // composition root once the scene exists.
  let sceneRef = null

  function resize() {
    // Render resolution is the device pixel ratio scaled by the player's
    // setting, so dropping it to 50% is a real fill-rate saving rather than
    // just a canvas-size change.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) * settings.get('renderScale'))
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

  function applyShadowMapSize(size) {
    if (!sceneRef || !size) return
    sceneRef.traverse((node) => {
      if (!node.isDirectionalLight || !node.castShadow) return
      const shadow = node.shadow
      if (shadow.mapSize.x === size && shadow.mapSize.y === size) return
      shadow.mapSize.set(size, size)
      // Three only allocates the depth target when shadow.map is null, so a
      // live resolution change has to drop the old target first.
      if (shadow.map) {
        shadow.map.depthTexture?.dispose()
        shadow.map.dispose()
        shadow.map = null
      }
      shadow.needsUpdate = true
    })
  }

  function applySettings() {
    renderer.toneMappingExposure = settings.get('brightness')

    const quality = settings.get('shadowQuality')
    const enabled = quality !== 'off'
    const enabledChanged = renderer.shadowMap.enabled !== enabled
    const typeChanged = renderer.shadowMap.type !== THREE.PCFShadowMap
    renderer.shadowMap.enabled = enabled
    renderer.shadowMap.type = THREE.PCFShadowMap
    applyShadowMapSize(shadowMapSize(quality) || 2048)
    if (enabledChanged || typeChanged) {
      renderer.shadowMap.needsUpdate = true
      invalidateMaterials()
    }

    const scale = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) * settings.get('renderScale')
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

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { settings } from '../core/settings.js'

// Creates and owns the WebGLRenderer and the post-processing chain. Pixel
// ratio is capped to protect performance on lab hardware; resize() keeps the
// renderer, the composer and the render resolution setting in sync with the
// window and should be called from a `window.resize` listener.
//
// Tone mapping matters here: three's lighting is physically based, so raw
// linear output clips highlights (lamp bulbs, emissive window panes) into flat
// white. ACES filmic rolls those off instead, which is most of the difference
// between "programmer lighting" and something that reads as lit. The exposure
// itself is the player's Brightness setting rather than a constant, so the
// slider in the settings screen moves it.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  // Scene reference for the shadow-toggle recompile below; supplied by the
  // composition root once the scene exists.
  let sceneRef = null
  let composer = null

  // Post-processing is opt-in from the composition root, which is the only
  // place that has both the scene and the camera. Until it is called the loop
  // renders straight through the renderer.
  function initPostProcessing(scene, camera) {
    composer = new EffectComposer(renderer)

    composer.addPass(new RenderPass(scene, camera))

    // Subtle bloom for light sources, lit windows, lasers & time abilities
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.2,  // strength (subtle glow, not blinding)
      0.4,  // radius
      0.92  // threshold (only truly emissive surfaces glow)
    )
    composer.addPass(bloomPass)

    composer.addPass(new OutputPass())

    // The composer sizes itself off the renderer at construction, which was
    // sized before it existed; re-run resize() so it picks up the player's
    // render resolution too.
    resize()
    return composer
  }

  function getComposer() {
    return composer
  }

  function resize() {
    // Render resolution is the device pixel ratio scaled by the player's
    // setting, so dropping it to 50% is a real fill-rate saving rather than
    // just a canvas-size change.
    const pixelRatio = Math.min(window.devicePixelRatio, 2) * settings.get('renderScale')
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height)
    if (composer) {
      // The composer keeps its own render targets, so it needs both the ratio
      // and the size or the post-processed image renders at the old scale.
      composer.setPixelRatio(pixelRatio)
      composer.setSize(width, height)
    }
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
    composer?.dispose()
  }

  return {
    renderer,
    resize,
    dispose,
    initPostProcessing,
    getComposer,
    // Called once from main.js so shadow-toggle recompiles can reach the
    // whole scene graph.
    setScene(scene) { sceneRef = scene }
  }
}

// Builds a small gradient sky as an image-based lighting probe. Every PBR
// material in the game reads it through scene.environment, which is what gives
// metal and glass something to reflect — without it they render as flat colour
// no matter how the lights are set.
export function generateEnvironmentMap(renderer, skyColor = 0x3d4b6e, groundColor = 0x1f1915) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  pmremGenerator.compileEquirectangularShader()

  const envScene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(100, 32, 16)
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTopColor: { value: new THREE.Color(skyColor) },
      uBottomColor: { value: new THREE.Color(groundColor) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = smoothstep(-0.2, 0.5, dir.y);
        gl_FragColor = vec4(mix(uBottomColor, uTopColor, h), 1.0);
      }
    `
  })

  const mesh = new THREE.Mesh(geometry, material)
  envScene.add(mesh)

  const sunLight = new THREE.DirectionalLight(0xffd8b0, 0.8)
  sunLight.position.set(25, 45, -30)
  envScene.add(sunLight)

  const envMap = pmremGenerator.fromScene(envScene).texture
  pmremGenerator.dispose()
  geometry.dispose()
  material.dispose()

  return envMap
}

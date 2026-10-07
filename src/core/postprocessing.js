import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { settings } from './settings.js'

// Global finish for every level. The scene is drawn into a floating-point
// buffer with no MSAA (a 4x half-float target was most of the GPU cost),
// bloom is added at quarter resolution, then one pass does the grade, the
// vignette and the ACES + sRGB the renderer already used.
//
// Three skips material tone-mapping while the target is offscreen and applies
// it once in that final pass, so highlights are not crushed before they glow.
// UnrealBloomPass halves whatever size it is given, so it is handed half the
// drawing buffer and the first mip is a quarter of the screen. Only the first
// three mips are blurred. There is no FXAA pass: another full-resolution
// resolve would spend the fill-rate the MSAA target was using.

const FINAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform float uVignette;
  uniform float uSaturation;
  uniform float uWarmth;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);

    vec3 color = gl_FragColor.rgb;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, uSaturation);
    float shadow = 1.0 - smoothstep(0.02, 0.55, luma);
    color += vec3(uWarmth, uWarmth * 0.45, 0.0) * shadow;
    vec2 p = vUv * 2.0 - 1.0;
    float vig = smoothstep(1.22, 0.28, length(p * vec2(0.82, 1.0)));
    color *= mix(1.0 - uVignette, 1.0, vig);
    gl_FragColor.rgb = max(color, 0.0);

    #ifdef LINEAR_TONE_MAPPING
      gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
    #elif defined(REINHARD_TONE_MAPPING)
      gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
    #elif defined(CINEON_TONE_MAPPING)
      gl_FragColor.rgb = CineonToneMapping(gl_FragColor.rgb);
    #elif defined(ACES_FILMIC_TONE_MAPPING)
      gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
    #elif defined(AGX_TONE_MAPPING)
      gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);
    #elif defined(NEUTRAL_TONE_MAPPING)
      gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
    #elif defined(CUSTOM_TONE_MAPPING)
      gl_FragColor.rgb = CustomToneMapping(gl_FragColor.rgb);
    #endif

    gl_FragColor = linearToOutputTexel(gl_FragColor);
  }
`

export function createPostProcessing(renderer) {
  const size = new THREE.Vector2()
  renderer.getSize(size)
  const ratio = renderer.getPixelRatio()

  const target = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(size.x * ratio)),
    Math.max(1, Math.floor(size.y * ratio)),
    { type: THREE.HalfFloatType }
  )
  target.texture.name = 'chrono-post-target'

  const composer = new EffectComposer(renderer, target)
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera())
  // Tight and high. Bulbs clear the threshold; windows, the door glass and
  // the clock face stay under it so they cannot fog the frame.
  const bloomPass = new UnrealBloomPass(size.clone(), 0.14, 0.18, 1.35)
  const outputPass = new OutputPass()

  // The pass halves its input. Handing it half the buffer makes the blur
  // chain a quarter of the screen. The last two mips are tiny and unused.
  bloomPass.nMips = 3
  const bloomSetSize = bloomPass.setSize.bind(bloomPass)
  bloomPass.setSize = (width, height) => {
    bloomSetSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)))
  }
  const bloomFactors = bloomPass.compositeMaterial.uniforms.bloomFactors.value
  bloomFactors[3] = 0
  bloomFactors[4] = 0

  outputPass.uniforms.uVignette = { value: 0.34 }
  outputPass.uniforms.uSaturation = { value: 1.06 }
  outputPass.uniforms.uWarmth = { value: 0.04 }
  outputPass.material.fragmentShader = FINAL_FRAGMENT
  outputPass.material.needsUpdate = true

  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(outputPass)

  let enabled = true
  let gpu = null

  function applyBloom() {
    bloomPass.enabled = enabled && settings.get('bloom') !== false
  }

  function resize() {
    renderer.getSize(size)
    composer._pixelRatio = renderer.getPixelRatio()
    composer.setSize(Math.max(1, size.x), Math.max(1, size.y))
    for (let i = 3; i < bloomPass.renderTargetsHorizontal.length; i += 1) {
      bloomPass.renderTargetsHorizontal[i].setSize(1, 1)
      bloomPass.renderTargetsVertical[i].setSize(1, 1)
    }
  }

  function render(scene, camera) {
    if (!enabled) {
      renderer.render(scene, camera)
      return
    }
    renderPass.scene = scene
    renderPass.camera = camera
    composer.render()
  }

  const bloomRender = bloomPass.render.bind(bloomPass)
  bloomPass.render = function bloomTimed(...args) {
    gpu?.begin('bloom')
    bloomRender(...args)
    gpu?.endIf('bloom')
  }
  const outputRender = outputPass.render.bind(outputPass)
  outputPass.render = function outputTimed(...args) {
    gpu?.begin('final')
    outputRender(...args)
    gpu?.endIf('final')
  }

  applyBloom()
  resize()

  const unsubscribe = settings.subscribe((values, changed) => {
    if (changed === 'bloom' || changed === 'options' || changed === 'all') applyBloom()
    if (changed === 'renderScale' || changed === 'options' || changed === 'all') resize()
  })
  window.addEventListener('resize', resize)

  function dispose() {
    unsubscribe()
    window.removeEventListener('resize', resize)
    bloomPass.dispose()
    outputPass.dispose()
    composer.dispose()
  }

  return {
    render,
    resize,
    dispose,
    setEnabled(value) {
      enabled = Boolean(value)
      applyBloom()
    },
    isEnabled: () => enabled,
    setGpuTimer(timer) { gpu = timer }
  }
}

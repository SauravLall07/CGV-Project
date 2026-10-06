import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { settings } from './settings.js'

// Global finish for every level. The scene is drawn into a floating-point
// buffer (so lamp and window emissives stay brighter than the night sky),
// bloom is added, then a cheap grade, then the same ACES + sRGB the renderer
// already used. Three skips material tone-mapping while the target is an
// offscreen buffer and applies it once in OutputPass, so highlights are not
// crushed before they can glow.
//
// UnrealBloomPass blurs at half the resolution it is given (its first mip is
// width/2). The composer passes the drawing-buffer size, so the bloom itself
// is half resolution. Strength stays low: the moon disc and emissive glass
// should halo, not fog the whole frame.

const GRADE_SHADER = {
  name: 'ChronoGrade',
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.34 },
    uSaturation: { value: 1.06 },
    uWarmth: { value: 0.04 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uWarmth;
    varying vec2 vUv;

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      // A little warmth in the shadows only. Highlights (lamps, moon) stay.
      float shadow = 1.0 - smoothstep(0.02, 0.55, luma);
      color += vec3(uWarmth, uWarmth * 0.45, 0.0) * shadow;
      vec2 p = vUv * 2.0 - 1.0;
      float vig = smoothstep(1.22, 0.28, length(p * vec2(0.82, 1.0)));
      color *= mix(1.0 - uVignette, 1.0, vig);
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `
}

export function createPostProcessing(renderer) {
  const size = new THREE.Vector2()
  renderer.getSize(size)
  const ratio = renderer.getPixelRatio()

  // samples keeps the MSAA the canvas already had. The composer target
  // would otherwise be a hard-edged resolve of the antialiased framebuffer.
  const target = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(size.x * ratio)),
    Math.max(1, Math.floor(size.y * ratio)),
    { type: THREE.HalfFloatType, samples: 4 }
  )
  target.texture.name = 'chrono-post-target'

  const composer = new EffectComposer(renderer, target)
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera())
  const bloomPass = new UnrealBloomPass(size.clone(), 0.38, 0.62, 1.05)
  const gradePass = new ShaderPass(GRADE_SHADER)
  const outputPass = new OutputPass()

  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(gradePass)
  composer.addPass(outputPass)

  function applyBloom() {
    bloomPass.enabled = settings.get('bloom') !== false
  }

  function resize() {
    renderer.getSize(size)
    // Assign the ratio directly. setPixelRatio() also resizes from the
    // previous logical size, and on the first call that size is still the
    // target's pixel dimensions, which would allocate a huge buffer first.
    composer._pixelRatio = renderer.getPixelRatio()
    composer.setSize(Math.max(1, size.x), Math.max(1, size.y))
  }

  function render(scene, camera) {
    renderPass.scene = scene
    renderPass.camera = camera
    composer.render()
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
    gradePass.dispose()
    outputPass.dispose()
    composer.dispose()
  }

  return { render, resize, dispose }
}

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// High-Fidelity WebGL Renderer with Physically-Based Tone Mapping & Post-Processing
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  })
  
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  // Enhanced Soft Shadow Mapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Color Space & ACES Filmic Tone Mapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95

  let composer = null

  function initPostProcessing(scene, camera) {
    composer = new EffectComposer(renderer)
    
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    // Subtle bloom for light sources, lit windows, lasers & time abilities
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.2,  // strength (subtle glow, not blinding)
      0.4,  // radius
      0.92  // threshold (only truly emissive surfaces glow)
    )
    composer.addPass(bloomPass)

    const outputPass = new OutputPass()
    composer.addPass(outputPass)

    return composer
  }

  function getComposer() {
    return composer
  }

  function resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setSize(width, height)
    if (composer) {
      composer.setSize(width, height)
    }
  }

  window.addEventListener('resize', () => resize())

  return { renderer, getComposer, initPostProcessing, resize }
}

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

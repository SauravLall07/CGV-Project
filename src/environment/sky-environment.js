import * as THREE from 'three'

// One generator for the session. Calling dispose() on a PMREMGenerator
// retires every generator, so this one stays alive. Levels dispose the
// render target they were given, not the generator.
let generator = null
const envScene = new THREE.Scene()

/**
 * Render a sky dome into a PMREM environment map and return the render
 * target. Call when a level loads or its sky preset changes, never per frame.
 * The dome is moved into a scene that holds nothing else, captured in linear
 * colour (uEnvCapture), then put back on its previous parent.
 */
export function captureSkyEnvironment(renderer, skyMesh) {
  if (!generator) generator = new THREE.PMREMGenerator(renderer)

  const parent = skyMesh.parent
  const capture = skyMesh.material.uniforms.uEnvCapture
  const previous = capture.value
  capture.value = 1
  envScene.add(skyMesh)

  try {
    // Far past the dome radius (480). The sky shader also pins depth to the
    // far plane, so the cube faces are not clipped.
    return generator.fromScene(envScene, 0, 0.1, 800)
  } finally {
    capture.value = previous
    if (parent) parent.add(skyMesh)
    else envScene.remove(skyMesh)
  }
}

// L3 reuses its one-time reflection capture for the visible sky. The full
// scattering/cloud shader otherwise shades every pixel before the train does.
// This stays a direction-sampled sky, independent of camera position.
export function useCapturedSkyBackground(sky, texture) {
  const shader = THREE.ShaderLib.backgroundCube
  const uniforms = THREE.UniformsUtils.clone(shader.uniforms)
  uniforms.envMap.value = texture
  uniforms.stormTint = sky.uniforms.uHorizonColor
  uniforms.stormGrade = sky.uniforms.uGrade
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader
      .replace('uniform float backgroundBlurriness;', 'uniform vec3 stormTint;\nuniform float stormGrade;\nuniform float backgroundBlurriness;')
      .replace('texColor.rgb *= backgroundIntensity;', 'texColor.rgb = mix(texColor.rgb, stormTint * 0.7, stormGrade) * backgroundIntensity;'),
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
  })
  // Three uses this field to supply its CubeUV layout defines.
  material.envMap = texture
  sky.mesh.material.dispose()
  sky.mesh.material = material
  // The level owns the render target. Unbind it before mesh disposal so its
  // texture is not disposed a second time through material uniforms.
  return () => { material.envMap = null; uniforms.envMap.value = null }
}

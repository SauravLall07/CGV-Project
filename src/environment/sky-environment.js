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

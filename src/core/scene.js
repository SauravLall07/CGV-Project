import * as THREE from 'three'

// Creates the THREE.Scene. Background is set to a visible colour (not left
// default black) so it's immediately obvious whether something is rendering.
export function createScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)
  return scene
}

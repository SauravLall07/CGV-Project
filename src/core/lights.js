import * as THREE from 'three'

// Minimal lighting so the scene isn't pitch black. Not the "warm station
// lighting" or level-specific atmosphere from the concept doc — that's real
// implementation work for later.
export function createLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.4)

  const directional = new THREE.DirectionalLight(0xffffff, 1)
  directional.position.set(5, 10, 7)

  return [ambient, directional]
}

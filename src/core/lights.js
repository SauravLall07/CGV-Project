import * as THREE from 'three'

// Physically based global lighting setup with soft shadows and balanced color temperature
export function createLights() {
  // Hemisphere light: warm sky tint, cool ground bounce
  const hemi = new THREE.HemisphereLight(0xffe6cc, 0x1f2430, 0.35)

  // Primary key light (Sun / Moon / Overhead Rig) with high-res soft shadow mapping
  const directional = new THREE.DirectionalLight(0xfff0dd, 1.0)
  directional.position.set(12, 28, 15)
  directional.castShadow = true

  directional.shadow.mapSize.width = 2048
  directional.shadow.mapSize.height = 2048
  directional.shadow.camera.near = 0.5
  directional.shadow.camera.far = 80

  const d = 35
  directional.shadow.camera.left = -d
  directional.shadow.camera.right = d
  directional.shadow.camera.top = d
  directional.shadow.camera.bottom = -d

  // Prevent shadow acne & peter-panning
  directional.shadow.bias = -0.0002
  directional.shadow.normalBias = 0.02

  return [hemi, directional]
}

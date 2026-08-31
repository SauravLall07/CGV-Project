import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// TEMPORARY SCAFFOLDING — this is a development convenience only, used to
// confirm the scene renders correctly from any angle before any real camera
// system exists. It is NOT the game's camera and should be removed/replaced
// once real third-person camera work begins.
export function createDevControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement)
  controls.enableDamping = true

  function update() {
    controls.update()
  }

  return { controls, update }
}

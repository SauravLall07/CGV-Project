import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createEndingPlate, PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET } from '../shaders/ending-plate.js'

export const MOON_ELEVATION_DEGREES = 40
export const MOON_CAMERA_RIGHT_DEGREES = 25
export const MOON_COLOR = 0xc4d2ff
export const MOON_INTENSITY = 2.2
export const HEMISPHERE_SKY = 0x34467a
export const HEMISPHERE_GROUND = 0x0e1118
export const HEMISPHERE_INTENSITY = 2.4

export function createEndingGorge(scene, renderer) {
  const root = new THREE.Group()
  root.name = 'ending-gorge'
  const plate = createEndingPlate(texture => renderer?.initTexture?.(texture))
  const front = new THREE.Vector3().subVectors(PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET)
  front.y = 0; front.normalize()
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), front)
  const azimuth = THREE.MathUtils.degToRad(MOON_CAMERA_RIGHT_DEGREES)
  const elevation = THREE.MathUtils.degToRad(MOON_ELEVATION_DEGREES)
  const moonDirection = front.multiplyScalar(Math.cos(azimuth)).addScaledVector(right, Math.sin(azimuth))
    .multiplyScalar(Math.cos(elevation))
  moonDirection.y = Math.sin(elevation)
  const fill = new THREE.HemisphereLight(HEMISPHERE_SKY, HEMISPHERE_GROUND, HEMISPHERE_INTENSITY)
  const moonlight = new THREE.DirectionalLight(MOON_COLOR, MOON_INTENSITY)
  moonlight.name = 'ending-moonlight'; fill.name = 'ending-hemisphere'
  moonlight.target.position.copy(PLATE_CAMERA_TARGET)
  moonlight.position.copy(moonlight.target.position).addScaledVector(moonDirection, 50)
  root.add(fill, moonlight, moonlight.target)
  scene.add(plate.mesh, root)
  scene.background = new THREE.Color(0x0d1426)
  scene.environment = null
  // Every distant surface is painted; fog would only darken the train.
  scene.fog = null
  let disposed = false
  return { root, plate, moonDirection,
    update(delta) { plate.update(delta) },
    dispose() {
      if (disposed) return
      disposed = true
      root.removeFromParent()
      plate.dispose()
      disposeObject(root)
    } }
}

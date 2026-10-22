import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createEndingPlate, PLATE_CAMERA_POSITION, PLATE_CAMERA_TARGET } from '../shaders/ending-plate.js'

export const MOON_ELEVATION_DEGREES = 40
export const MOON_CAMERA_RIGHT_DEGREES = 25
export const MOON_COLOR = 0xc4d2ff
export const MOON_INTENSITY = 2.6
export const HEMISPHERE_SKY = 0x34467a
export const HEMISPHERE_GROUND = 0x0e1118
export const HEMISPHERE_INTENSITY = 2.8
export const DOOR_MOON_ELEVATION_DEGREES = 40
export const DOOR_MOON_LEFT_DEGREES = 25
export const DOOR_MOON_INTENSITY = MOON_INTENSITY * 1.5
export const DOOR_HEMISPHERE_INTENSITY = HEMISPHERE_INTENSITY * 1.4
export const DOOR_KEY_TARGET_HEIGHT = 1.15
export const DOOR_KEY_DISTANCE = 50

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
  const originalPosition = moonlight.position.clone(), originalTarget = moonlight.target.position.clone()
  const doorPosition = new THREE.Vector3(), doorTarget = new THREE.Vector3()
  function configureDoorLighting(shot, target) {
    doorTarget.copy(target)
    const front = new THREE.Vector3().subVectors(shot.position, target)
    front.y = 0; front.normalize()
    const left = new THREE.Vector3().crossVectors(front, new THREE.Vector3(0, 1, 0))
    const azimuth = THREE.MathUtils.degToRad(DOOR_MOON_LEFT_DEGREES)
    const elevation = THREE.MathUtils.degToRad(DOOR_MOON_ELEVATION_DEGREES)
    front.multiplyScalar(Math.cos(azimuth)).addScaledVector(left, Math.sin(azimuth)).multiplyScalar(Math.cos(elevation))
    front.y = Math.sin(elevation)
    doorPosition.copy(target).addScaledVector(front, DOOR_KEY_DISTANCE)
  }
  function setShot(index) {
    const door = index === 1
    moonlight.position.copy(door ? doorPosition : originalPosition)
    moonlight.target.position.copy(door ? doorTarget : originalTarget)
    moonlight.intensity = door ? DOOR_MOON_INTENSITY : MOON_INTENSITY
    fill.intensity = door ? DOOR_HEMISPHERE_INTENSITY : HEMISPHERE_INTENSITY
  }
  root.add(fill, moonlight, moonlight.target)
  scene.add(plate.mesh, root)
  scene.background = new THREE.Color(0x0d1426)
  scene.environment = null
  // Every distant surface is painted; fog would only darken the train.
  scene.fog = null
  let disposed = false
  return { root, plate, moonDirection, configureDoorLighting, setShot,
    update(delta) { plate.update(delta) },
    dispose() {
      if (disposed) return
      disposed = true
      root.removeFromParent()
      plate.dispose()
      disposeObject(root)
    } }
}

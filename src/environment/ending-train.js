import * as THREE from 'three'
import { createTrain, RAIL_OFFSET } from '../entities/train.js'
import { getKitMaterials } from './level1-kit/kit-materials.js'
import { disposeObject } from '../core/dispose.js'

export const TRAIN_SPEED = 22
export const STOP_NOSE_Z = 0.6
export const STOP_CENTER_Z = 7.6
export const SETTLE_PITCH = THREE.MathUtils.degToRad(1.5)
export const COUPLING_BUMP = 0.22
export const COUPLING_DELAY = 0.12
const YAW_DEGREES = [0.6, -1.2, 0.9, -0.5]
const ROLL_DEGREES = [0.6, -0.6, 0.6, -0.6]
const SPRING_FREQUENCY = 9
const SPRING_DAMPING = 3.8
const SPRING_GAIN = 1.8
const GLOW_PEAK = 5

export function createEndingTrain() {
  const sharedMaterials = new Set(Object.values(getKitMaterials()).flat().filter(value => value?.isMaterial))
  const source = createTrain()
  const root = new THREE.Group()
  root.name = 'ending-train'
  const materialClones = new Map()
  const textureClones = new Map()
  const factoryMaterials = new Set()
  function cloneTexture(texture) {
    if (!textureClones.has(texture)) {
      const owned = texture.clone()
      delete owned.userData.sharedTexture
      textureClones.set(texture, owned)
    }
    return textureClones.get(texture)
  }
  function ownMaterial(material) {
    if (!materialClones.has(material)) {
      const owned = material.clone()
      for (const [key, value] of Object.entries(material)) if (value?.isTexture) owned[key] = cloneTexture(value)
      for (const [key, uniform] of Object.entries(material.uniforms ?? {})) {
        if (uniform.value?.isTexture) owned.uniforms[key].value = cloneTexture(uniform.value)
      }
      materialClones.set(material, owned)
      if (!sharedMaterials.has(material)) factoryMaterials.add(material)
    }
    return materialClones.get(material)
  }
  // Factory geometries are fresh; cached kit materials and texture wrappers are not ours.
  for (const object of [source.train, source.stationSteam]) object.traverse(node => {
    if (node.material) node.material = Array.isArray(node.material) ? node.material.map(ownMaterial) : ownMaterial(node.material)
    node.castShadow = false
    node.receiveShadow = false
  })
  // Door/steam/marker originals may alias kit maps: release only their material objects.
  factoryMaterials.forEach(material => material.dispose())
  source.closeDoor()
  source.hideBoardingCues()
  source.stationSteam.visible = false
  const visual = source.train.getObjectByName('chrono-express-visual')
  const engine = source.train.getObjectByName('locomotive-and-tender')
  const bounds = new THREE.Box3()
  function makePivot(name, meshes, centerZ) {
    const pivot = new THREE.Group()
    pivot.name = name
    pivot.position.z = centerZ
    source.train.add(pivot)
    for (const mesh of meshes) {
      mesh.geometry.translate(0, 0, -centerZ)
      mesh.geometry.computeBoundingBox()
      mesh.geometry.computeBoundingSphere()
      pivot.add(mesh)
    }
    return pivot
  }
  bounds.makeEmpty()
  for (const mesh of engine.children) {
    mesh.geometry.computeBoundingBox()
    bounds.union(mesh.geometry.boundingBox)
  }
  const engineCenter = (bounds.min.z + bounds.max.z) / 2
  const noseOffset = bounds.max.z - engineCenter
  const locomotive = makePivot('ending-locomotive', [...engine.children], engineCenter)
  const carriages = []
  const carCenters = []
  for (let i = 0; i < 4; i++) {
    const batches = visual.children.filter(mesh => mesh.name.startsWith(`carriage-${i}-`))
    // Union the vehicle's batches: an individual roof/window batch may be asymmetric.
    bounds.makeEmpty()
    for (const mesh of batches) {
      mesh.geometry.computeBoundingBox(); bounds.union(mesh.geometry.boundingBox)
    }
    const center = (bounds.min.z + bounds.max.z) / 2
    const pivot = makePivot(`ending-carriage-${i + 1}`, batches, center)
    pivot.rotation.y = THREE.MathUtils.degToRad(YAW_DEGREES[i])
    pivot.rotation.z = THREE.MathUtils.degToRad(ROLL_DEGREES[i])
    carriages.push(pivot); carCenters.push(center)
  }
  // Undo the station translation, retain the factory's pi yaw, and centre the engine.
  source.train.position.set(0, 0, engineCenter)
  source.train.name = 'ending-real-train'
  const vehicles = new Set([locomotive, ...carriages])
  for (const child of source.train.children) if (!vehicles.has(child)) child.visible = false
  root.add(source.train, source.stationSteam)
  const glow = new THREE.MeshStandardMaterial({ color: 0x492108, emissive: 0xff650b, emissiveIntensity: 0 })
  function glowStrips(pivot, length) {
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, length), glow)
      strip.position.set(side * RAIL_OFFSET, 0.09, 0)
      pivot.add(strip)
    }
  }
  glowStrips(locomotive, 10)
  glowStrips(carriages[0], 17)
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24),
    new THREE.MeshStandardMaterial({ color: 0xffebba, emissive: 0xffdc8c, emissiveIntensity: 3 }))
  lamp.position.set(0, 2.8, noseOffset - 0.25)
  locomotive.add(lamp)
  const coneGeometry = new THREE.ConeGeometry(1.05, 6, 24, 4, true)
  const positions = coneGeometry.attributes.position
  const colors = new Float32Array(positions.count * 4)
  for (let i = 0; i < positions.count; i++) {
    const along = (positions.getY(i) + 3) / 6
    colors.set([1, 0.75, 0.4, along * along * 0.16], i * 4)
  }
  coneGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  coneGeometry.rotateX(-Math.PI / 2) // Tip at local -Z; widens towards world -Z after pi yaw.
  const cone = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color: 0xffdc9a,
    vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide }))
  cone.name = 'ending-headlight-cone'
  cone.position.set(0, 2.8, noseOffset + 2.75)
  locomotive.add(cone)
  let disposed = false
  function update(centerZ, _distance, brakingProgress, settleTime = -1) {
    const stopCenter = STOP_NOSE_Z + noseOffset
    root.position.z = Math.max(stopCenter, centerZ + stopCenter - STOP_CENTER_Z)
    locomotive.rotation.x = settleTime >= 0
      ? SETTLE_PITCH * SPRING_GAIN * Math.exp(-SPRING_DAMPING * settleTime) * Math.sin(SPRING_FREQUENCY * settleTime) : 0
    for (let i = 0; i < carriages.length; i++) {
      const t = settleTime - (i + 1) * COUPLING_DELAY
      carriages[i].position.z = carCenters[i] + (settleTime >= 0 && t > 0
        ? COUPLING_BUMP * Math.exp(-SPRING_DAMPING * t) * Math.sin(SPRING_FREQUENCY * t) : 0)
    }
    glow.emissiveIntensity = brakingProgress >= 0 ? GLOW_PEAK * Math.sin(Math.PI * (0.15 + brakingProgress * 0.7))
      : settleTime >= 0 ? GLOW_PEAK * 0.45 * Math.exp(-3 * settleTime) : 0
    // Factory update animates steam/cues, disabled here. Its wheels are baked into batches.
  }
  return { root, locomotive, carriages, noseOffset, update,
    dispose() {
      if (disposed) return
      disposed = true
      root.removeFromParent()
      disposeObject(root)
    } }
}

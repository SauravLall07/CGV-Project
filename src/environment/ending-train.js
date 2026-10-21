import * as THREE from 'three'
import { createTrain, RAIL_OFFSET } from '../entities/train.js'
import { getKitMaterials } from './level1-kit/kit-materials.js'
import { disposeObject } from '../core/dispose.js'
import { createEndingLocomotive } from './ending-locomotive.js'
import { CARRIAGE_HOLES, createDamageUniforms, patchTimeDamage } from '../shaders/ending-time-damage.js'
import { createEndingDebris } from './ending-debris.js'
import { createEndingOutline } from '../shaders/ending-outline.js'
import { createEndingSparks } from './ending-sparks.js'

export const TRAIN_SPEED = 26
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
  const kit = getKitMaterials()
  const sharedMaterials = new Set(Object.values(kit).flat().filter(value => value?.isMaterial))
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
      for (const [key, value] of Object.entries(material)) if (value?.isTexture) {
        // The distant finale uses even lamplight, without the station's curtain illustration.
        owned[key] = material === kit.carriageWindow && (key === 'map' || key === 'emissiveMap') ? null : cloneTexture(value)
      }
      for (const [key, uniform] of Object.entries(material.uniforms ?? {})) {
        if (uniform.value?.isTexture) owned.uniforms[key].value = cloneTexture(uniform.value)
      }
      if (material === kit.carriageGreen || material === kit.carriageRoof) {
        const color = material === kit.carriageGreen ? 0x2c4a36 : 0x2a2e33
        owned.color.setHex(color); owned.emissive.setHex(color); owned.emissiveIntensity = 0.04
        owned.roughness = material === kit.carriageGreen ? 0.52 : 0.72
        owned.metalness = 0.08; owned.envMapIntensity = 1
      } else if (material === kit.carriageWindow) {
        owned.name = 'ending-amber-windows'
        owned.color.setHex(0x6a3d16); owned.emissive.setHex(0xffb35c)
        owned.emissiveIntensity = 0.85; owned.roughness = 0.3; owned.metalness = 0
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
  let noseOffset = bounds.max.z - engineCenter
  const locomotive = makePivot('ending-locomotive', [...engine.children], engineCenter)
  const carriages = []
  const carCenters = []
  const damageUniforms = []
  for (let i = 0; i < 4; i++) {
    const batches = visual.children.filter(mesh => mesh.name.startsWith(`carriage-${i}-`))
    // Union the vehicle's batches: an individual roof/window batch may be asymmetric.
    bounds.makeEmpty()
    for (const mesh of batches) {
      mesh.geometry.computeBoundingBox(); bounds.union(mesh.geometry.boundingBox)
    }
    const center = (bounds.min.z + bounds.max.z) / 2
    const pivot = makePivot(`ending-carriage-${i + 1}`, batches, center)
    const uniforms = createDamageUniforms(CARRIAGE_HOLES[i])
    damageUniforms.push(uniforms)
    pivot.userData.holes = CARRIAGE_HOLES[i]
    const patches = new Map()
    for (const mesh of batches) {
      const patch = material => {
        if (!patches.has(material)) patches.set(material, patchTimeDamage(material.clone(), uniforms))
        return patches.get(material)
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material)
    }
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
  // Retain only complete tender triangles in our fresh, already-owned factory geometries.
  const tender = new THREE.Group(); tender.name = 'ending-tender'
  for (const mesh of [...locomotive.children]) {
    const geometry = mesh.geometry, position = geometry.attributes.position, keep = []
    for (let i = 0; i < position.count; i += 3) {
      if ([0, 1, 2].every(j => position.getZ(i + j) < -3.6)) keep.push(i, i + 1, i + 2)
    }
    mesh.removeFromParent()
    if (keep.length) {
      const retained = new THREE.BufferGeometry()
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const values = []
        for (const vertex of keep) for (let component = 0; component < attribute.itemSize; component++) values.push(attribute.array[vertex * attribute.itemSize + component])
        retained.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize))
      }
      mesh.geometry = retained; tender.add(mesh)
    }
    geometry.dispose()
  }
  locomotive.add(tender)
  const locomotivePaint = ownMaterial(kit.carriageGreen).clone()
  locomotivePaint.color.setHex(0x252a30); locomotivePaint.emissive.setHex(0x252a30)
  locomotivePaint.emissiveIntensity = 0.03; locomotivePaint.metalness = 0.12
  const hero = createEndingLocomotive(locomotivePaint)
  locomotive.add(hero.root)
  const tenderDamage = createDamageUniforms()
  damageUniforms.push(tenderDamage)
  for (const mesh of tender.children) {
    if (!mesh.material.userData.endingTimeDamage) patchTimeDamage(mesh.material, tenderDamage)
  }
  noseOffset = 0
  hero.root.traverse(node => {
    if (!node.isMesh || node.isInstancedMesh || node.name === 'ending-headlight-cone') return
    node.geometry.computeBoundingBox()
    noseOffset = Math.max(noseOffset, node.geometry.boundingBox.max.z)
  })
  const glow = new THREE.MeshStandardMaterial({ color: 0x291207, emissive: 0xff650b, emissiveIntensity: 0 })
  const contactGeometry = new THREE.SphereGeometry(1, 8, 6)
  const contactPose = new THREE.Object3D()
  function contactGlows(pivot, sites) {
    const mesh = new THREE.InstancedMesh(contactGeometry, glow, sites.length * 2)
    mesh.name = 'ending-wheel-contact-glow'
    let index = 0
    for (const side of [-1, 1]) for (const z of sites) {
      contactPose.position.set(side * RAIL_OFFSET, 0.035, z)
      contactPose.scale.set(0.13, 0.025, 0.32); contactPose.updateMatrix()
      mesh.setMatrixAt(index++, contactPose.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); pivot.add(mesh)
  }
  contactGlows(locomotive, [-0.8, 1, 2.8, 4.4, 5.25])
  contactGlows(carriages[0], [-8.25, -5.75, 5.75, 8.25])
  const debris = createEndingDebris(root, carriages, hero.root)
  damageUniforms.push(...debris.uniforms)
  const outline = createEndingOutline([locomotive, ...carriages])
  const sparks = createEndingSparks(source.train, [locomotive, carriages[0], carriages[1]], RAIL_OFFSET)
  // Per-carriage copies share only ending-owned texture wrappers. Release unused base material objects.
  const usedMaterials = new Set()
  root.traverse(node => {
    if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) usedMaterials.add(material)
  })
  for (const material of materialClones.values()) if (!usedMaterials.has(material)) material.dispose()
  let disposed = false
  function setTimeState(value, steamFrozen) {
    hero.setSteamFrozen(steamFrozen)
    for (const uniforms of damageUniforms) uniforms.uRift.value = value
    hero.damage.uRift.value = value
  }
  function update(centerZ, distance, brakingProgress, settleTime = -1, delta = 0, speed = 0) {
    const stopCenter = STOP_NOSE_Z + noseOffset
    root.position.z = Math.max(stopCenter, centerZ + stopCenter - STOP_CENTER_Z)
    locomotive.rotation.x = settleTime >= 0
      ? SETTLE_PITCH * SPRING_GAIN * Math.exp(-SPRING_DAMPING * settleTime) * Math.sin(SPRING_FREQUENCY * settleTime) : 0
    for (let i = 0; i < carriages.length; i++) {
      const t = settleTime - (i + 1) * COUPLING_DELAY
      carriages[i].position.z = carCenters[i] + (settleTime >= 0 && t > 0
        ? COUPLING_BUMP * Math.exp(-SPRING_DAMPING * t) * Math.sin(SPRING_FREQUENCY * t) : 0)
    }
    glow.emissiveIntensity = brakingProgress >= 0 ? GLOW_PEAK * Math.sin(Math.PI * brakingProgress) : 0
    hero.update(distance, delta, speed, settleTime)
    sparks.update(delta, brakingProgress)
    for (const uniforms of damageUniforms) uniforms.uTime.value += Math.max(0, delta)
  }
  return { root, locomotive, carriages, noseOffset, damageUniforms, debris, outline, sparks, update, setTimeState,
    dispose() {
      if (disposed) return
      disposed = true
      root.removeFromParent()
      disposeObject(root)
    } }
}

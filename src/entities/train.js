import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'

import trainUrl from '../assets/models/train/chrono-express-train.glb?url'
import crestUrl from '../assets/textures/chrono-express-crest.png?url'
import crestPlacements from '../assets/models/train/crest-placements.json'

// Level 1's Chrono Express. The group sits on the station track and the
// departure cinematic still slides it along +Z. The GLB is the visual only:
// each car is one mesh, crests are decals, and the hidden boxes are what
// interaction line-of-sight hits.
//
// Idle.fbx stands 183.48 cm; the detective visual scales that by 0.01, so
// the figure is 1.8348 m. A DRB 01.10 is about 4.5 m tall — 2.5× a 1.8 m
// person — and about 24 m with its tender. MODEL_SCALE fits the locomotive
// height to this detective. The coupled length lands about 5% over the
// matching 24 m, inside the 10% band. Wheel bottoms in the file sit at
// y = -165.065; the visual root is lifted so they rest on the rail head.
// RAIL_OFFSET is half the scaled tread gauge, so the rails move with it.

export const TRACK_X = 7
export const TRACK_LEVEL = -1

const DETECTIVE_HEIGHT = 1.8348
const WHEEL_BOTTOM_Y = -165.065
const LOCO_TOP_Y = 295.82501220703125
const LOCO_HEIGHT_UNITS = LOCO_TOP_Y - WHEEL_BOTTOM_Y
const MODEL_SCALE = (DETECTIVE_HEIGHT * (4.5 / 1.8)) / LOCO_HEIGHT_UNITS
const MODEL_WHEEL_GAUGE = 175.9
const RAIL_CLEARANCE = 0.012
const COUPLING_GAP = 16
const WINDOW_EMISSIVE = 2.75

export const RAIL_OFFSET = (MODEL_WHEEL_GAUGE * MODEL_SCALE) / 2

// Front (+Z, the direction the train departs) to rear. Bounds are the
// part meshes' own local Z, which is where the crest positions live too.
const PARTS = [
  { part: 'DRB0110', name: 'locomotive', minZ: -832.9400024414062, maxZ: 879.0969848632812 },
  { part: 'Tender', name: 'tender', minZ: -451.9649963378906, maxZ: 400.9599914550781 },
  { part: 'Wagon1', name: 'carriage-0', minZ: -1313.25, maxZ: 1306.0899658203125 },
  { part: 'Mitropa', name: 'carriage-1', minZ: -1210.199951171875, maxZ: 1620.02001953125 },
  { part: 'Wagon2', name: 'carriage-2', minZ: -1296.8399658203125, maxZ: 1322.5 },
  { part: 'Baggage', name: 'carriage-3', minZ: -1030.97998046875, maxZ: 1043.3599853515625 }
]

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'lightMap']

function consistUnits() {
  let total = 0
  for (let i = 0; i < PARTS.length; i++) {
    total += PARTS[i].maxZ - PARTS[i].minZ
    if (i > 0) total += COUPLING_GAP
  }
  return total
}

// Rest length in metres. The track bed adds clearance for the departure roll.
export const TRAIN_LENGTH = consistUnits() * MODEL_SCALE

// Platform runs z = ±28, and the playable edge is z ≈ 27. The nose sits just
// inside that end, beside the boarding pedestal at z = 25. The group origin
// is the consist centre, so the long tail hangs off the back of the platform.
export const LOCO_NOSE_Z = 26
export const TRAIN_Z = LOCO_NOSE_Z - TRAIN_LENGTH / 2

const gltfLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()

let template = null
let crestTexture = null
let ready = null

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject)
  })
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, resolve, undefined, reject)
  })
}

function shareTextures(material) {
  for (const key of MAP_KEYS) {
    const value = material?.[key]
    if (value?.isTexture) value.userData.sharedTexture = true
  }
}

function findNamed(root, name) {
  let found = null
  root.traverse((node) => {
    if (node.name === name) found = node
  })
  return found
}

function partLayout() {
  const total = consistUnits()
  let cursor = total / 2
  const placed = []
  for (const spec of PARTS) {
    const length = spec.maxZ - spec.minZ
    placed.push({ ...spec, positionZ: cursor - spec.maxZ })
    cursor -= length + COUPLING_GAP
  }
  return placed
}

function doorZ(partName, fallback) {
  const side = crestPlacements.placements.find((entry) => entry.part === partName && entry.normal[0] < 0)
  return side ? side.position[2] : fallback
}

function tuneBodyMaterial(source) {
  const material = source.clone()
  shareTextures(material)
  if (material.emissiveMap) {
    material.emissive.set(0xfff3e0)
    material.emissiveIntensity = WINDOW_EMISSIVE
  }
  // The cars are double sided. The shadow pass only needs the outside,
  // otherwise every wheel and lamp pays for a second shadow draw.
  material.shadowSide = THREE.FrontSide
  return material
}

function clonePart(source) {
  const part = source.clone(true)
  part.traverse((node) => {
    if (!node.isMesh) return
    node.geometry = node.geometry.clone()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const tuned = materials.map(tuneBodyMaterial)
    node.material = Array.isArray(node.material) ? tuned : tuned[0]
    // One mesh per car. It may cast the moonlight shadow. Decals and the
    // hidden boxes do not — they are the small parts.
    node.castShadow = true
    node.receiveShadow = true
    node.raycast = THREE.Object3D.prototype.raycast
    node.userData.noInteractionBlocker = true
  })
  return part
}

function firstMesh(root) {
  let mesh = null
  root.traverse((node) => {
    if (!mesh && node.isMesh) mesh = node
  })
  return mesh
}

function addColliders(part, mesh, partName, material) {
  mesh.geometry.computeBoundingBox()
  const bounds = mesh.geometry.boundingBox
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())

  const body = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  body.name = `${part.name}-collider`
  body.position.copy(center)
  body.visible = false
  body.castShadow = false
  body.userData.interactionCollider = true
  part.add(body)

  // Platform is -X of the track. The door volume sits on that face, at the
  // side crest's Z (the car centre when a car has no crest).
  const doorDepth = Math.min(size.x * 0.16, 0.42 / MODEL_SCALE)
  const doorHeight = Math.min(size.y * 0.62, 2.15 / MODEL_SCALE)
  const doorWidth = Math.min(size.z * 0.18, 1.05 / MODEL_SCALE)
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorDepth, doorHeight, doorWidth), material)
  const z = THREE.MathUtils.clamp(doorZ(partName, center.z), bounds.min.z + doorWidth * 0.5, bounds.max.z - doorWidth * 0.5)
  // About 1.15 m above the rail, which is the platform-side door.
  const doorY = WHEEL_BOTTOM_Y + 1.15 / MODEL_SCALE
  door.name = 'door'
  door.position.set(bounds.min.x + doorDepth * 0.5, doorY, z)
  door.visible = false
  door.castShadow = false
  door.userData.interactionCollider = true
  part.add(door)
}

function addCrests(part, mesh, partName, material) {
  const placements = crestPlacements.placements.filter((entry) => entry.part === partName)
  if (!placements.length) return
  mesh.updateMatrixWorld(true)
  const aim = new THREE.Object3D()
  for (const entry of placements) {
    const position = new THREE.Vector3(entry.position[0], entry.position[1], entry.position[2])
    const normal = new THREE.Vector3(entry.normal[0], entry.normal[1], entry.normal[2]).normalize()
    aim.position.copy(position)
    aim.up.set(0, 1, 0)
    aim.lookAt(position.x + normal.x, position.y + normal.y, position.z + normal.z)
    const depth = Math.max(40, entry.size * 0.35)
    const geometry = new DecalGeometry(mesh, position, aim.rotation, new THREE.Vector3(entry.size, entry.size, depth))
    const count = geometry.attributes.position?.count ?? 0
    if (count < 3) {
      geometry.dispose()
      continue
    }
    const decal = new THREE.Mesh(geometry, material)
    decal.name = `${partName}-crest`
    decal.castShadow = false
    decal.receiveShadow = true
    decal.renderOrder = 2
    decal.raycast = THREE.Object3D.prototype.raycast
    decal.userData.noInteractionBlocker = true
    part.add(decal)
  }
}

function addHeadlamp(part) {
  // Between the two buffer-beam lamps (model y ≈ -92, z ≈ 861), aimed down
  // the rails. The boarding spot pool copies this source; it is not an
  // extra real light of its own.
  const lamp = new THREE.SpotLight(0xffe7b8, 28, 28, Math.PI / 7, 0.5, 2)
  lamp.name = 'headlamp-spot'
  lamp.castShadow = false
  lamp.position.set(0, -90, 870)
  const target = new THREE.Object3D()
  target.name = 'headlamp-spot-target'
  target.position.set(0, -155, 2100)
  part.add(lamp, target)
  lamp.target = target
}

function crestMaterial() {
  const material = new THREE.MeshStandardMaterial({
    map: crestTexture,
    color: 0xfff1c9,
    metalness: 0.86,
    roughness: 0.34,
    emissive: 0xffffff,
    emissiveMap: crestTexture,
    emissiveIntensity: 0.28,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  })
  shareTextures(material)
  return material
}

function countVisual(root) {
  let drawCalls = 0
  let triangles = 0
  root.traverse((node) => {
    if (!node.isMesh || !node.visible) return
    drawCalls += Array.isArray(node.material) ? node.material.length : 1
    const geometry = node.geometry
    triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
  })
  return { drawCalls, triangles }
}

export function loadTrainModel() {
  if (!ready) {
    ready = (async () => {
      const [gltf, texture] = await Promise.all([
        loadGltf(trainUrl),
        loadTexture(crestUrl)
      ])
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.userData.sharedTexture = true
      gltf.scene.traverse((node) => {
        const materials = node.material
          ? (Array.isArray(node.material) ? node.material : [node.material])
          : []
        materials.forEach(shareTextures)
      })
      crestTexture = texture
      template = gltf.scene
      return template
    })()
  }
  return ready
}

export function createTrain() {
  if (!template || !crestTexture) {
    throw new Error('loadTrainModel() must finish before createTrain()')
  }

  const train = new THREE.Group()
  train.name = 'train'

  const visual = new THREE.Group()
  visual.name = 'chrono-express-visual'
  visual.scale.setScalar(MODEL_SCALE)
  visual.position.y = -WHEEL_BOTTOM_Y * MODEL_SCALE + RAIL_CLEARANCE

  const colliders = new THREE.MeshBasicMaterial()
  const crests = crestMaterial()

  for (const spec of partLayout()) {
    const source = findNamed(template, spec.part)
    if (!source) throw new Error(`Chrono Express GLB is missing ${spec.part}`)
    const part = clonePart(source)
    part.name = spec.name
    part.userData.part = spec.part
    part.position.set(0, 0, 0)
    part.rotation.set(0, 0, 0)
    part.scale.set(1, 1, 1)
    part.updateMatrixWorld(true)

    const mesh = firstMesh(part)
    addCrests(part, mesh, spec.part, crests)
    addColliders(part, mesh, spec.part, colliders)
    if (spec.part === 'DRB0110') addHeadlamp(part)

    part.position.z = spec.positionZ
    visual.add(part)
  }

  train.add(visual)
  train.position.set(TRACK_X, TRACK_LEVEL, TRAIN_Z)
  train.updateMatrixWorld(true)

  const stats = countVisual(visual)
  train.userData.drawCalls = stats.drawCalls
  train.userData.triangles = stats.triangles
  const bodyBox = (name) => new THREE.Box3().setFromObject(firstMesh(train.getObjectByName(name)))
  const locoBox = bodyBox('locomotive')
  const tenderBox = bodyBox('tender')
  const carriageBox = bodyBox('carriage-0')
  const locoSize = locoBox.getSize(new THREE.Vector3())
  const carriageSize = carriageBox.getSize(new THREE.Vector3())
  console.info(
    `[train] Chrono Express visual: ${stats.drawCalls} draw calls, ${stats.triangles} triangles. ` +
    `Locomotive ${locoSize.y.toFixed(2)} m tall, with tender ${(locoBox.max.z - tenderBox.min.z).toFixed(2)} m. ` +
    `Carriage ${carriageSize.z.toFixed(2)} m long, ${carriageSize.y.toFixed(2)} m tall.`
  )

  return { train }
}

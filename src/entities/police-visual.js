import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Mixamo police: Walking With Shopping Bag.fbx is the skinned mesh + walk
// clip. Unarmed Idle Looking is animation-only (no skin) retargeted onto
// that skeleton. Catwalk Twist is loaded but not played yet.
// A torch is parented to mixamorigRightHand.

const MIXAMO_CM_SCALE = 0.01

// Tuned in-hand on mixamorigRightHand (Mixamo cm). Scale 200 matches the
// baked Sketchfab flashlight to the skinned palm.
const TORCH_GRIP_POS = { x: -0.19, y: 7.5, z: 2.39 }
const TORCH_GRIP_ROT = { x: 0.01265, y: 0.45633, z: 0.17537 }
const TORCH_GRIP_SCALE = 200

const FILES = {
  walk: new URL('../assets/models/police/Walking With Shopping Bag.fbx', import.meta.url),
  idle: new URL('../assets/models/police/Unarmed Idle Looking Ver. 2.fbx', import.meta.url),
  turn: new URL('../assets/models/police/Catwalk Twist L To Walk 180.fbx', import.meta.url),
  torch: new URL('../assets/models/props/torch/scene.gltf', import.meta.url)
}

const HIPS_POSITION = /(?:^|mixamorig[:.]?)Hips\.position$/
const HIPS_POSITION_AXIS = /(?:^|mixamorig[:.]?)Hips\.position\[([xyz])\]$/

function firstClip(fbx, name) {
  const clip = fbx?.animations?.[0]
  if (!clip) return null
  clip.name = name
  return clip
}

function stripRootMotion(clip) {
  const notes = []
  if (!clip?.tracks) return notes

  clip.tracks = clip.tracks.filter((track) => {
    const axis = track.name.match(HIPS_POSITION_AXIS)
    if (axis) {
      if (axis[1] === 'y') {
        notes.push(`kept ${track.name}`)
        return true
      }
      notes.push(`removed ${track.name}`)
      return false
    }

    if (HIPS_POSITION.test(track.name)) {
      const size = typeof track.getValueSize === 'function' ? track.getValueSize() : 3
      if (size === 3) {
        const keys = track.values.length / 3
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = 0
          track.values[i + 2] = 0
        }
        notes.push(`zeroed X/Z on ${track.name} (${keys} keys, Y kept)`)
        return true
      }
      notes.push(`removed ${track.name}`)
      return false
    }

    return true
  })

  return notes
}

function logRootMotion(label, clip) {
  if (!clip) return
  const notes = stripRootMotion(clip)
  const extras = clip.tracks
    .filter((track) => track.name.endsWith('.position') && !HIPS_POSITION.test(track.name))
    .map((track) => track.name)
  console.log(
    `[police] ${label} root motion: ` +
    (notes.length ? notes.join('; ') : 'no Hips.position tracks') +
    (extras.length ? ` | other position tracks left as-is: ${extras.join(', ')}` : '')
  )
}

function smoothGeometry(mesh) {
  const geometry = mesh.geometry
  const position = geometry?.getAttribute('position')
  if (!position) return

  geometry.deleteAttribute('normal')
  geometry.computeVertexNormals()

  const normal = geometry.getAttribute('normal')
  if (!normal || position.count === 0) return

  const sums = new Map()
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
    let acc = sums.get(key)
    if (!acc) {
      acc = new THREE.Vector3()
      sums.set(key, acc)
    }
    acc.x += normal.getX(i)
    acc.y += normal.getY(i)
    acc.z += normal.getZ(i)
  }
  for (const acc of sums.values()) acc.normalize()
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
    const n = sums.get(key)
    normal.setXYZ(i, n.x, n.y, n.z)
  }
  normal.needsUpdate = true
}

function toStandardMaterial(material) {
  if (!material) return material
  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    material.flatShading = false
    material.needsUpdate = true
    return material
  }

  const standard = new THREE.MeshStandardMaterial()
  standard.name = material.name
  if (material.color) standard.color.copy(material.color)
  if (material.emissive) standard.emissive.copy(material.emissive)
  standard.map = material.map ?? null
  standard.normalMap = material.normalMap ?? null
  standard.emissiveMap = material.emissiveMap ?? null
  standard.alphaMap = material.alphaMap ?? null
  standard.aoMap = material.aoMap ?? null
  standard.transparent = Boolean(material.transparent)
  standard.opacity = material.opacity
  standard.side = material.side
  standard.alphaTest = material.alphaTest
  standard.vertexColors = material.vertexColors
  standard.flatShading = false
  standard.roughness = material.isMeshPhongMaterial ? 0.55 : 0.75
  standard.metalness = 0.04
  standard.needsUpdate = true
  return standard
}

function prepareModel(model) {
  const wrapper = new THREE.Group()
  wrapper.name = 'police'
  wrapper.add(model)

  model.updateMatrixWorld(true)
  const raw = new THREE.Box3().setFromObject(wrapper)
  const rawSize = raw.getSize(new THREE.Vector3())
  const scale = rawSize.y > 10 ? MIXAMO_CM_SCALE : 1
  model.scale.setScalar(scale)
  wrapper.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(wrapper)
  if (Number.isFinite(box.min.y)) wrapper.position.y -= box.min.y

  model.traverse((node) => {
    if (!node.isMesh) return
    smoothGeometry(node)

    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const converted = materials.map(toStandardMaterial)
    node.material = Array.isArray(node.material) ? converted : converted[0]

    node.castShadow = true
    node.receiveShadow = true
    if (node.isSkinnedMesh) node.frustumCulled = false
  })

  const worldSize = box.getSize(new THREE.Vector3())
  return {
    wrapper,
    model,
    scale,
    rawHeight: rawSize.y,
    worldHeight: worldSize.y,
    rotation: model.rotation.clone()
  }
}

function findFirstBone(root, mixamoName) {
  const names = [`mixamorig${mixamoName}`, `mixamorig:${mixamoName}`, mixamoName]
  let found = null
  root.traverse((node) => {
    if (found || !node.isBone) return
    if (names.includes(node.name)) found = node
  })
  return found
}

function applyTorchGrip(torch) {
  if (!torch) return
  torch.position.set(TORCH_GRIP_POS.x, TORCH_GRIP_POS.y, TORCH_GRIP_POS.z)
  torch.rotation.set(TORCH_GRIP_ROT.x, TORCH_GRIP_ROT.y, TORCH_GRIP_ROT.z)
  torch.scale.setScalar(TORCH_GRIP_SCALE)
}

function bakeTorchWorldTransforms(root) {
  root.updateMatrixWorld(true)
  const meshes = []
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node)
  })
  for (const mesh of meshes) {
    mesh.geometry = mesh.geometry.clone()
    mesh.geometry.applyMatrix4(mesh.matrixWorld)
    mesh.geometry.computeVertexNormals()
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
  }
  root.traverse((node) => {
    node.position.set(0, 0, 0)
    node.quaternion.identity()
    node.rotation.set(0, 0, 0)
    node.scale.set(1, 1, 1)
    node.updateMatrix()
  })
  root.updateMatrixWorld(true)
}

function prepareTorchScene(scene) {
  let meshCount = 0
  scene.traverse((node) => {
    if (!node.isMesh) return
    meshCount += 1
    node.castShadow = true
    node.receiveShadow = true
    node.frustumCulled = false
    node.visible = true
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const next = materials.map((material) => {
      if (!material) return material
      const patched = material.clone()
      patched.transparent = false
      patched.depthWrite = true
      patched.opacity = 1
      patched.alphaTest = 0
      patched.side = THREE.DoubleSide
      if ('transmission' in patched) patched.transmission = 0
      if (patched.emissiveMap) {
        patched.emissive.set(0xffffff)
        patched.emissiveIntensity = Math.max(patched.emissiveIntensity || 0, 1.4)
      }
      patched.needsUpdate = true
      return patched
    })
    node.material = Array.isArray(node.material) ? next : next[0]
  })
  bakeTorchWorldTransforms(scene)
  return meshCount
}

function placeBeamAtLens(torch, beamOrigin) {
  torch.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(torch)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  let axis = 'z'
  if (size.x >= size.y && size.x >= size.z) axis = 'x'
  else if (size.y >= size.x && size.y >= size.z) axis = 'y'

  const towardMax = Math.abs(box.max[axis]) >= Math.abs(box.min[axis])
  const lens = towardMax ? box.max[axis] : box.min[axis]
  beamOrigin.position.copy(center)
  beamOrigin.position[axis] = lens

  const dir = new THREE.Vector3()
  dir[axis] = towardMax ? 1 : -1
  beamOrigin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
}

function wrapTorchModel(torchScene) {
  const cloned = torchScene.clone(true)
  const model = new THREE.Group()
  model.name = 'torch-model'
  // GLTFLoader returns a Scene; parent the contents so we never nest a Scene
  // under a Mixamo bone (some render paths skip nested Scene graphs).
  while (cloned.children.length) model.add(cloned.children[0])
  if (cloned.isMesh) model.add(cloned)
  return model
}

function createTorch(torchScene) {
  const torch = new THREE.Group()
  torch.name = 'torch'

  const model = wrapTorchModel(torchScene)
  torch.add(model)

  const beamOrigin = new THREE.Group()
  beamOrigin.name = 'torch-beam'
  placeBeamAtLens(torch, beamOrigin)

  // Visual only — gameplay detection still uses getBeamWorldPosition + the
  // yellow cone in stealth.js. Target is a child so the beam follows +Z.
  const spot = new THREE.SpotLight(0xffc07a, 22, 9, Math.PI / 4.5, 0.55, 2)
  spot.name = 'torch-spot'
  spot.castShadow = false
  const spotTarget = new THREE.Object3D()
  spotTarget.name = 'torch-spot-target'
  spotTarget.position.set(0, 0, 12)
  beamOrigin.add(spot, spotTarget)
  spot.target = spotTarget

  torch.add(beamOrigin)
  applyTorchGrip(torch)
  return { torch, beamOrigin }
}

function attachTorch(root, torchScene) {
  if (!torchScene) {
    console.warn('[police] torch attach skipped — torchScene is null (GLTF did not load)')
    return { torch: null, beamOrigin: null }
  }
  const hand = findFirstBone(root, 'RightHand')
  if (!hand) {
    console.warn('[police] mixamorigRightHand missing — torch not attached')
    return { torch: null, beamOrigin: null }
  }
  const { torch, beamOrigin } = createTorch(torchScene)
  hand.add(torch)
  return { torch, beamOrigin }
}

let loadPromise = null
let template = null

async function loadTemplate(assets) {
  const [walkFbx, idleFbx, turnFbx, torchGltf] = await Promise.all([
    assets.loadFbx(FILES.walk.href),
    assets.loadFbx(FILES.idle.href).catch((error) => {
      console.warn('[police] idle clip failed to load', error)
      return null
    }),
    assets.loadFbx(FILES.turn.href).catch((error) => {
      console.warn('[police] turn clip failed to load (unused for now)', error)
      return null
    }),
    assets.loadModel(FILES.torch.href).catch((error) => {
      console.warn('[police] torch GLTF failed to load', error)
      return null
    })
  ])

  const info = prepareModel(walkFbx)
  console.log(
    `[police] scale=${info.scale} rawHeight=${info.rawHeight.toFixed(1)} ` +
    `worldHeight=${info.worldHeight.toFixed(2)}m feetY=${info.wrapper.position.y.toFixed(3)} ` +
    `rootRot=(${info.rotation.x.toFixed(3)}, ${info.rotation.y.toFixed(3)}, ${info.rotation.z.toFixed(3)})`
  )

  const walkClip = firstClip(walkFbx, 'walk')
  if (!walkClip) {
    throw new Error('[police] Walking With Shopping Bag.fbx has no animation clip')
  }
  logRootMotion('walk', walkClip)
  console.log(
    `[police] clip walk: duration=${walkClip.duration.toFixed(3)}s tracks=${walkClip.tracks.length}`
  )

  const idleClip = firstClip(idleFbx, 'idle')
  if (idleClip) {
    logRootMotion('idle', idleClip)
    console.log(
      `[police] clip idle: duration=${idleClip.duration.toFixed(3)}s tracks=${idleClip.tracks.length}`
    )
  } else {
    console.warn('[police] Unarmed Idle Looking clip missing — stopped guards have no idle')
  }

  const turnClip = firstClip(turnFbx, 'turn')
  if (turnClip) {
    logRootMotion('turn', turnClip)
    console.log(
      `[police] clip turn: duration=${turnClip.duration.toFixed(3)}s tracks=${turnClip.tracks.length} (loaded, unused)`
    )
  } else {
    console.warn('[police] Catwalk Twist clip missing — walk still works')
  }

  let torchScene = null
  if (torchGltf?.scene) {
    torchScene = torchGltf.scene
    const meshCount = prepareTorchScene(torchScene)
    if (!meshCount) console.warn('[police] torch GLTF has zero meshes after prepare')
  } else {
    console.warn('[police] flashlight GLTF missing — guards have no torch')
  }

  return {
    wrapper: info.wrapper,
    walkClip,
    idleClip,
    turnClip,
    torchScene,
    scale: info.scale,
    worldHeight: info.worldHeight,
    feetY: info.wrapper.position.y
  }
}

export function preloadPoliceVisual(assets) {
  if (!assets?.loadFbx || !assets?.loadModel) return Promise.resolve(null)
  if (!loadPromise) {
    loadPromise = loadTemplate(assets)
      .then((loaded) => {
        template = loaded
        return loaded
      })
      .catch((error) => {
        console.warn('[police] FBX failed, guards keep humanoid', error)
        loadPromise = null
        template = null
        return null
      })
  }
  return loadPromise
}

export function getPoliceTemplate() {
  return template
}

// One skinned instance + mixer per guard. Geometry/materials/clips stay on
// the shared template so eight patrols don't reload the 11 MB FBX.
export function createPoliceGuardVisual(tmpl = template) {
  if (!tmpl?.wrapper || !tmpl.walkClip) return null

  const root = cloneSkinned(tmpl.wrapper)
  root.name = 'police'
  const model = root.children[0] ?? root
  const { beamOrigin } = attachTorch(root, tmpl.torchScene)
  const mixer = new THREE.AnimationMixer(model)

  const walkAction = mixer.clipAction(tmpl.walkClip)
  walkAction.enabled = false
  walkAction.setEffectiveWeight(1)
  walkAction.setLoop(THREE.LoopRepeat)

  const idleAction = tmpl.idleClip ? mixer.clipAction(tmpl.idleClip) : null
  if (idleAction) {
    idleAction.enabled = true
    idleAction.setEffectiveWeight(1)
    idleAction.setLoop(THREE.LoopRepeat)
    idleAction.play()
  }

  let walking = false

  function setWalking(next) {
    const want = Boolean(next)
    if (want === walking) return
    walking = want
    if (walking) {
      if (idleAction) {
        idleAction.stop()
        idleAction.enabled = false
        idleAction.setEffectiveWeight(0)
      }
      walkAction.enabled = true
      walkAction.reset()
      walkAction.setEffectiveWeight(1)
      walkAction.play()
    } else {
      walkAction.stop()
      walkAction.enabled = false
      walkAction.setEffectiveWeight(0)
      if (idleAction) {
        idleAction.enabled = true
        idleAction.reset()
        idleAction.setEffectiveWeight(1)
        idleAction.play()
      }
    }
  }

  function update(delta) {
    mixer.update(delta)
  }

  function dispose() {
    mixer.stopAllAction()
    mixer.uncacheRoot(model)
    // Geometry and maps belong to the shared template. The bone DataTexture
    // does not: the renderer builds one per cloned skeleton on first draw.
    root.traverse((node) => {
      if (node.skeleton?.boneTexture) node.skeleton.dispose()
    })
  }

  function getBeamWorldPosition(target) {
    if (!beamOrigin) return null
    return beamOrigin.getWorldPosition(target)
  }

  return { root, mixer, walkAction, idleAction, setWalking, update, dispose, getBeamWorldPosition }
}

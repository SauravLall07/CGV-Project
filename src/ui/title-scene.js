import * as THREE from 'three'
import { createMoonlitValley } from '../environment/moonlit-valley.js'
import { createSkyDome } from '../environment/sky-dome.js'
import { createTrain } from '../entities/train.js'
import { getKitMaterials } from '../environment/level1-kit/kit-materials.js'
import { safeMerge } from '../environment/level1-kit/kit-props.js'

export const TITLE_VALLEY_SPEED = -38
export const TITLE_SWAY_METRES = 0.03
export const TITLE_SWAY_RADIANS = 0.35 * Math.PI / 180
export const TITLE_TRAIN_YAW = 22 * Math.PI / 180
export const TITLE_VIEW_YAW = -3 * Math.PI / 180 // 25 degrees toward the -X valley
export const TITLE_VIEW_PITCH = -2 * Math.PI / 180
export const TITLE_FOV = 50
export const TITLE_ROOF_Y = 3.75 + 2.6 - Math.sqrt(2.6 ** 2 - 1.52 ** 2)
export const TITLE_EYE_Y = TITLE_ROOF_Y + 1.6
export const TITLE_COACH_Z = -38
export const TITLE_CHUNKS = 5
export const TITLE_GROUND_SCALE_X = 2
export const TITLE_GROUND_SCALE_Z = 3

export function countTitleBudget(root) {
  const stats = { drawCalls: 0, triangles: 0 }
  root.traverseVisible(node => {
    if (!node.isMesh && !node.isPoints && !node.isLine) return
    const geometry = node.geometry, positions = geometry?.getAttribute('position')
    // Empty/incomplete geometry cannot submit a draw, even with an index.
    if (!positions?.count) return
    const instances = node.isInstancedMesh ? Math.max(0, Math.min(node.count, node.instanceMatrix.count)) : 1
    const available = geometry.index?.count ?? positions.count
    const count = Math.max(0, Math.min(available - geometry.drawRange.start, geometry.drawRange.count))
    if (!count || !instances) return
    stats.drawCalls++
    if (node.isMesh) stats.triangles += Math.floor(count / 3) * instances
  })
  return stats
}

// Factory geometry is fresh, but its kit materials are borrowed. Batch only
// exterior meshes, cloning every borrowed material/texture before use. Never
// reset/dispose the kit cache. Steam remains the factory's own animated nodes.
export function createTitleTrain() {
  const shared = new Set(Object.values(getKitMaterials()))
  const source = createTrain(), train = source.train
  train.position.set(0, 0, 0); train.rotation.set(0, 0, 0); train.updateMatrixWorld(true)
  const materials = new Map(), maps = new Map(), batches = new Map()
  const geometries = new Set(), discardedMaterials = new Set(), keptGeometry = new Set()
  for (const root of [train, source.stationSteam]) root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry)
    if (node.material && !shared.has(node.material)) discardedMaterials.add(node.material)
  })
  for (const name of ['chrono-express-visual', 'locomotive-and-tender']) {
    train.getObjectByName(name).traverse(node => {
      if (!node.isMesh) return
      if (!materials.has(node.material)) {
        const material = node.material.clone()
        for (const [key, value] of Object.entries(material)) if (value?.isTexture) {
          if (!maps.has(value)) { const map = value.clone(); map.source = new THREE.Source(value.image); maps.set(value, map) }
          material[key] = maps.get(value)
        }
        materials.set(node.material, material)
      }
      if (!batches.has(node.material)) batches.set(node.material, [])
      batches.get(node.material).push(node.geometry.clone().applyMatrix4(node.matrixWorld))
    })
  }
  const steam = train.children.filter(node => node.isPoints)
  for (const points of steam) { keptGeometry.add(points.geometry); discardedMaterials.delete(points.material) }
  train.clear()
  for (const [original, parts] of batches) {
    const mesh = new THREE.Mesh(safeMerge(parts), materials.get(original)); mesh.name = 'title-train-exterior'
    train.add(mesh)
  }
  for (const points of steam) train.add(points)
  for (const geometry of geometries) if (!keptGeometry.has(geometry)) geometry.dispose()
  for (const material of discardedMaterials) material.dispose()
  train.rotation.y = TITLE_TRAIN_YAW
  let disposed = false
  return { train, update(delta) {
    // Retain only the five displayed emitters, not factory closures holding
    // removed doorway/station-fog geometry after its GPU disposal.
    for (const points of steam) points.material.uniforms.uTime.value += delta
  },
    dispose() {
      if (disposed) return
      disposed = true
      train.traverse(node => { node.geometry?.dispose(); if (node.isPoints) node.material.dispose() })
      for (const material of materials.values()) material.dispose()
      for (const map of maps.values()) map.dispose()
      train.clear()
    }
  }
}

// Independent owner: no gameplay scene, cached models or environment maps.
export function createTitleScene({ valleyFactory = createMoonlitValley, skyFactory = createSkyDome, trainFactory = createTitleTrain } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(TITLE_FOV, 1, 0.1, 2200)
  camera.position.set(Math.sin(TITLE_TRAIN_YAW) * TITLE_COACH_Z, TITLE_EYE_Y, Math.cos(TITLE_TRAIN_YAW) * TITLE_COACH_Z)
  camera.lookAt(camera.position.x + Math.sin(TITLE_VIEW_YAW) * 100,
    TITLE_EYE_Y + Math.tan(TITLE_VIEW_PITCH) * 100, camera.position.z + Math.cos(TITLE_VIEW_YAW) * 100)
  const rotation = camera.rotation.clone()
  const sky = skyFactory('moving-heist')
  scene.fog = new THREE.Fog(sky.horizonColor, 70, 900)
  const valley = valleyFactory({ speed: TITLE_VALLEY_SPEED, chunkCount: TITLE_CHUNKS,
    omitHillSide: false, rails: false, poles: false, centerZ: camera.position.z / TITLE_GROUND_SCALE_Z,
    fogColor: sky.horizonColor })
  // Broader owned chunks cover BOTH sides and exceed the scenery's 780 m
  // discard radius, including every recycle position. Mountain rings retain
  // their original shape and their saddle beneath the moon.
  for (const chunk of valley.chunks ?? []) chunk.group.scale.set(TITLE_GROUND_SCALE_X, 1, TITLE_GROUND_SCALE_Z)
  const train = trainFactory()
  scene.add(sky.mesh, valley.group, train.train)
  // Lambert foliage needs sky illumination, without a shadow pass.
  const light = new THREE.HemisphereLight(0x9fb4d8, 0x17251f, 1)
  scene.add(light)
  let elapsed = 0, disposed = false, aspect = 0
  const stats = countTitleBudget(scene)
  return {
    scene, camera, stats,
    update(delta, width, height) {
      if (disposed) return
      elapsed += Math.max(0, delta)
      const nextAspect = width / Math.max(1, height)
      if (aspect !== nextAspect) { aspect = nextAspect; camera.aspect = aspect; camera.updateProjectionMatrix() }
      camera.position.y = TITLE_EYE_Y + Math.sin(elapsed * 0.23) * TITLE_SWAY_METRES
      camera.rotation.copy(rotation)
      camera.rotation.z += Math.sin(elapsed * 0.17) * TITLE_SWAY_RADIANS
      valley.update(delta / TITLE_GROUND_SCALE_Z)
      for (const chunk of valley.chunks ?? []) chunk.group.position.z *= TITLE_GROUND_SCALE_Z
      train.update(delta); sky.update(delta, null)
    },
    dispose() {
      if (disposed) return
      disposed = true
      valley.dispose(); sky.dispose(); train.dispose(); light.dispose(); scene.clear()
    }
  }
}

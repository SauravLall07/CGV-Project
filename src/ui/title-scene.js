import * as THREE from 'three'
import { createMoonlitValley } from '../environment/moonlit-valley.js'
import { createSkyDome } from '../environment/sky-dome.js'

export const TITLE_VALLEY_SPEED = -38
export const TITLE_SWAY_METRES = 0.025
export const TITLE_SWAY_RADIANS = 0.2 * Math.PI / 180

// Independent owner: no gameplay scene, cached models or environment maps.
export function createTitleScene({ valleyFactory = createMoonlitValley, skyFactory = createSkyDome } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2200)
  camera.position.set(0, 5, 0)
  camera.lookAt(-478, 65, 828)
  const rotation = camera.rotation.clone()
  const sky = skyFactory('moving-heist')
  scene.fog = new THREE.Fog(sky.horizonColor, 70, 900)
  const valley = valleyFactory({ speed: TITLE_VALLEY_SPEED, chunkCount: 3,
    omitHillSide: true, rails: false, poles: false, centerZ: 0,
    fogColor: sky.horizonColor })
  scene.add(sky.mesh, valley.group)
  // Lambert foliage needs sky illumination, without a shadow pass.
  const light = new THREE.HemisphereLight(0x9fb4d8, 0x17251f, 1)
  scene.add(light)
  let elapsed = 0, disposed = false, aspect = 0
  return {
    scene, camera, stats: { drawCalls: valley.stats.drawCalls + 1,
      triangles: valley.stats.triangles + 64 * 47 * 2 },
    update(delta, width, height) {
      if (disposed) return
      elapsed += Math.max(0, delta)
      const nextAspect = width / Math.max(1, height)
      if (aspect !== nextAspect) { aspect = nextAspect; camera.aspect = aspect; camera.updateProjectionMatrix() }
      camera.position.y = 5 + Math.sin(elapsed * 0.23) * TITLE_SWAY_METRES
      camera.rotation.copy(rotation)
      camera.rotation.z += Math.sin(elapsed * 0.17) * TITLE_SWAY_RADIANS
      valley.update(delta); sky.update(delta, null)
    },
    dispose() {
      if (disposed) return
      disposed = true
      valley.dispose(); sky.dispose(); light.dispose(); scene.clear()
    }
  }
}

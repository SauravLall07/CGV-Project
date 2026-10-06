import * as THREE from 'three'
import { buildFacade } from './facade.js'
import { emptyStats } from './geom.js'
import { LANDING_FOCUS } from './layout.js'
import { createLandingMaterials } from './materials.js'

// Title-screen station. Props on the plaza are added by the forecourt module;
// this group is the house itself plus whatever the forecourt attaches.
export function createLandingScene() {
  const group = new THREE.Group()
  group.name = 'landing-station'
  const materials = createLandingMaterials()
  const stats = emptyStats()

  buildFacade(group, materials, stats)

  group.traverse((node) => {
    node.userData.noCameraCollision = true
    if (node.isLight) node.castShadow = false
  })

  const focus = LANDING_FOCUS.clone()

  return {
    group,
    stats,
    shadowFocus: focus,
    update() {}
  }
}

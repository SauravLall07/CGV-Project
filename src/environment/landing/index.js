import * as THREE from 'three'
import { buildFacade } from './facade.js'
import { buildForecourt } from './forecourt.js'
import { emptyStats } from './geom.js'
import { LANDING_FOCUS } from './layout.js'
import { createLandingMaterials } from './materials.js'
import { buildTown, STREET } from './town.js'

// Title-screen station. Props on the plaza are added by the forecourt module;
// this group is the house itself plus whatever the forecourt attaches.
export function createLandingScene() {
  const group = new THREE.Group()
  group.name = 'landing-station'
  const materials = createLandingMaterials()
  const stats = emptyStats()

  const facadeColliders = buildFacade(group, materials, stats)
  const forecourt = buildForecourt(group, materials, stats)

  // Keep tiny forecourt details out of the camera obstruction test, but do
  // NOT ignore the station's physical façade. Previously every façade mesh
  // was exempt, allowing the orbit camera to pass through walls and doors
  // and reveal the station interior from the street.
  const facadeCameraObstacles = new Set([
    'landing-brick',
    'landing-stone',
    'landing-stone-trim',
    'landing-roof',
    'landing-doors',
    'landing-door-glass',
    'landing-arch-glass',
    'landing-hall-glow',
    'landing-canopy',
    'landing-canopy-pier'
  ])
  group.traverse((node) => {
    node.userData.noCameraCollision = !facadeCameraObstacles.has(node.name)
    if (node.isLight) node.castShadow = false
  })

  // Built after the pass above, which would clear the town's camera walls.
  const town = buildTown(group, materials, stats)
  forecourt.pools.setOpening(STREET.minZ, STREET.maxZ)

  const focus = LANDING_FOCUS.clone()

  return {
    group,
    town: town.group,
    stats,
    shadowFocus: focus,
    colliders: [...facadeColliders, ...forecourt.colliders, ...town.colliders],
    update(delta) { forecourt.update(delta) }
  }
}

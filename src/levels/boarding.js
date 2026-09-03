import * as THREE from 'three'
import { createStationBlockout, createStationLighting } from '../environment/station-blockout.js'
import { createTrain } from '../entities/train.js'
import { disposeObject } from '../core/dispose.js'

// Level 1 — "The Boarding". The station concourse and the train drawn up
// alongside it. Phase 2 fills in guards, cameras, laser barriers and the real
// stealth loop; the interactable boarding control already triggers the
// transition into Level 2.

export function createBoardingLevel({ scene, interaction, advance }) {
  const { group: station, bounds, boardingControl } = createStationBlockout()
  const { train } = createTrain()
  const lights = createStationLighting()

  scene.add(station, train, ...lights)

  // Dusk outside the shed, with just enough fog to give the platform depth
  // down its 40-metre length.
  scene.background = new THREE.Color(0x1d1a26)
  scene.fog = new THREE.Fog(0x241d24, 22, 78)

  const unregister = interaction.register(boardingControl, {
    prompt: 'Board train',
    onInteract: () => {
      interaction.flashPrompt('Boarding…')
      advance()
    }
  })

  return {
    objective: 'Follow the platform to the boarding control and get aboard',
    checkpoint: { position: new THREE.Vector3(2.2, 0, -13), yaw: 0 },
    bounds,

    dispose() {
      unregister()
      scene.remove(station, train, ...lights)
      disposeObject(station)
      disposeObject(train)
      lights.forEach(disposeObject)
    }
  }
}

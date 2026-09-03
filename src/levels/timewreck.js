import * as THREE from 'three'
import { createCarriageInterior } from '../environment/carriage-interior.js'
import { disposeObject } from '../core/dispose.js'

// Level 3 — "The Timewreck". Still a STUB for Phase 4 in gameplay terms (no
// frozen / fast-time / time-loop carriages yet), but it demonstrates the
// concept doc's stated scope strategy for real: the SAME carriage-interior
// module as Level 2, re-dressed with `damaged: true` — emergency lighting,
// wreckage, torn ceiling panels and sparks — rather than a second set of
// modelled carriages.

const LENGTH = 26
const HALF = LENGTH / 2

function createEmergencyBrake() {
  const brake = new THREE.Group()
  brake.name = 'emergency-brake'

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.85, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.55 })
  )
  housing.position.y = 0.62
  housing.castShadow = true
  brake.add(housing)

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xd8c47a, emissive: 0x54430f, emissiveIntensity: 1.4, roughness: 0.5 })
  )
  plate.position.set(0, 0.86, 0.19)
  brake.add(plate)

  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.2, 12),
    new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.35, metalness: 0.9 })
  )
  pivot.rotation.z = Math.PI / 2
  pivot.position.set(0, 1.02, 0.1)
  brake.add(pivot)

  // The lever itself, angled up and ready to be pulled.
  const lever = new THREE.Group()
  lever.name = 'brake-lever'
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.62, 10),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.32, metalness: 0.92 })
  )
  shaft.position.y = 0.31
  shaft.castShadow = true
  lever.add(shaft)

  const grip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd0342a, emissive: 0x6a120c, emissiveIntensity: 1.8, roughness: 0.45 })
  )
  grip.position.y = 0.64
  grip.castShadow = true
  lever.add(grip)

  lever.position.set(0, 1.02, 0.1)
  lever.rotation.x = -0.4
  brake.add(lever)

  const warning = new THREE.PointLight(0xff4a2a, 8, 4.5, 2)
  warning.position.set(0, 1.1, 0.4)
  brake.add(warning)

  return brake
}

export function createTimewreckLevel({ scene, interaction, advance }) {
  const { group, update: updateInterior } = createCarriageInterior({ length: LENGTH, damaged: true })

  const brake = createEmergencyBrake()
  brake.position.set(0, 0, HALF - 2)
  group.add(brake)

  scene.add(group)
  scene.background = new THREE.Color(0x140708)
  scene.fog = new THREE.Fog(0x1a0708, 5, 26)

  const unregister = interaction.register(brake, {
    prompt: 'Pull the emergency brake',
    onInteract: () => {
      interaction.flashPrompt('The train grinds to a halt…')
      advance()
    }
  })

  const lever = brake.getObjectByName('brake-lever')
  let elapsed = 0

  return {
    objective: 'Survive the collapsing train and reach the emergency brake',
    checkpoint: { position: new THREE.Vector3(0, 0, -HALF + 6.5), yaw: 0 },
    bounds: { minX: -0.58, maxX: 0.58, minZ: -HALF + 1.2, maxZ: HALF - 3.4 },

    update(delta) {
      updateInterior(delta)
      elapsed += delta
      // The whole carriage lurches — the train is coming apart.
      group.rotation.z = Math.sin(elapsed * 1.7) * 0.012 + Math.sin(elapsed * 4.3) * 0.004
      group.position.y = Math.sin(elapsed * 6.1) * 0.012
      lever.rotation.x = -0.4 + Math.sin(elapsed * 2.2) * 0.05
    },

    dispose() {
      unregister()
      scene.remove(group)
      disposeObject(group)
    }
  }
}

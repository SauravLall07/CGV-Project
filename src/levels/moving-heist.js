import * as THREE from 'three'
import { createCarriageInterior } from '../environment/carriage-interior.js'
import { disposeObject } from '../core/dispose.js'

// Level 2 — "The Moving Heist". Still a STUB for Phase 3 in gameplay terms
// (no time-manipulation system, no carriage-to-carriage traversal yet), but
// it now plays out inside a real carriage interior rather than a grey box, so
// the Level 2 environment work in Phase 3 extends this rather than replacing
// it wholesale.

const LENGTH = 26
const HALF = LENGTH / 2

function createChronoCore() {
  const core = new THREE.Group()
  core.name = 'chrono-core'

  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.28, metalness: 0.92 })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.12, 16), brass)
  base.position.y = 0.06
  base.castShadow = true
  core.add(base)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.85, 16), brass)
  column.position.y = 0.52
  column.castShadow = true
  core.add(column)

  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 20), brass)
  cradle.rotation.x = Math.PI / 2
  cradle.position.y = 0.98
  core.add(cradle)

  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.24, 1),
    new THREE.MeshStandardMaterial({
      color: 0x5ce6ff,
      emissive: 0x2ab8e0,
      emissiveIntensity: 3.2,
      roughness: 0.15,
      metalness: 0.3
    })
  )
  orb.position.y = 1.2
  orb.name = 'chrono-core-orb'
  core.add(orb)

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.018, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x4fd8f5, emissiveIntensity: 2.4 })
  )
  halo.rotation.x = Math.PI / 2.4
  halo.position.y = 1.2
  halo.name = 'chrono-core-halo'
  core.add(halo)

  const glow = new THREE.PointLight(0x54dcff, 14, 7, 2)
  glow.position.y = 1.2
  core.add(glow)

  return core
}

export function createMovingHeistLevel({ scene, interaction, advance }) {
  const { group, update: updateInterior } = createCarriageInterior({ length: LENGTH })

  const core = createChronoCore()
  core.position.set(0, 0, HALF - 2)
  group.add(core)

  scene.add(group)
  scene.background = new THREE.Color(0x090b12)
  scene.fog = new THREE.Fog(0x090b12, 8, 32)

  const unregister = interaction.register(core, {
    prompt: 'Take the Chrono Core',
    onInteract: () => {
      interaction.flashPrompt('Chrono Core secured…')
      advance()
    }
  })

  const orb = core.getObjectByName('chrono-core-orb')
  const halo = core.getObjectByName('chrono-core-halo')
  let elapsed = 0

  return {
    objective: 'Traverse the carriages and break into the vault',
    // Well clear of the end bulkhead, so the opening shot looks down the
    // aisle rather than pressed against a wall.
    checkpoint: { position: new THREE.Vector3(0, 0, -HALF + 6.5), yaw: 0 },
    bounds: { minX: -0.58, maxX: 0.58, minZ: -HALF + 1.2, maxZ: HALF - 3.4 },

    update(delta) {
      updateInterior(delta)
      elapsed += delta
      orb.rotation.y += delta * 0.7
      orb.rotation.x += delta * 0.3
      orb.position.y = 1.2 + Math.sin(elapsed * 1.6) * 0.04
      halo.rotation.z += delta * 1.1
      halo.position.y = orb.position.y
    },

    dispose() {
      unregister()
      scene.remove(group)
      disposeObject(group)
    }
  }
}

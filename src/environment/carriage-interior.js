import * as THREE from 'three'
import {
  carpetMaterial,
  metalMaterial,
  nightViewMaterial,
  plasterMaterial,
  woodMaterial
} from './textures.js'

// The inside of a carriage: panelled walls, a carpeted aisle between seat
// bays, brass-framed windows onto the passing night, luggage racks and a
// coved ceiling. Built as one reusable module because the concept doc's scope
// strategy for Level 3 is explicitly "reuse Level 2's carriages with changed
// lighting and damage" — so `damaged: true` re-dresses the same geometry with
// emergency lighting, wreckage and sparks instead of modelling it twice.
//
// Repeated furniture (seats, tables, lamps, rivets) goes through InstancedMesh
// rather than one mesh per item: a carriage of loose meshes would be a few
// hundred draw calls on its own, which is exactly the frame-budget trap the
// brief's performance section warns about.

const HALF_WIDTH = 1.7
// Generous for a real carriage, but the third-person camera needs headroom
// behind the player — at 2.4 m it spends the whole level clamped against the
// ceiling.
const WALL_TOP = 2.3
const CEILING_Y = 2.6
const BAY_SPACING = 3.6
const SEAT_X = 1.15

export function createCarriageInterior({ length = 26, damaged = false } = {}) {
  const group = new THREE.Group()
  group.name = damaged ? 'carriage-interior-damaged' : 'carriage-interior'
  const halfLength = length / 2
  const dummy = new THREE.Object3D()

  // --- Materials ---------------------------------------------------------
  const panelWood = woodMaterial({
    repeat: [Math.round(length / 3), 1],
    light: damaged ? 0x4d3620 : 0x8a5c33,
    dark: damaged ? 0x1e1409 : 0x452a16
  })
  const floorCarpet = carpetMaterial({
    repeat: [2, Math.round(length / 2)],
    base: damaged ? 0x2e1418 : 0x5e1f28,
    accent: damaged ? 0x4a3520 : 0x9a7238
  })
  const upperPanel = plasterMaterial({
    repeat: [Math.round(length / 4), 1],
    base: damaged ? 0x51473f : 0xbfae94
  })
  const brass = new THREE.MeshStandardMaterial({
    color: damaged ? 0x6d5628 : 0xb08d3f,
    roughness: damaged ? 0.62 : 0.28,
    metalness: 0.9
  })
  const upholstery = new THREE.MeshStandardMaterial({
    color: damaged ? 0x2f2a30 : 0x4a5c74,
    roughness: 0.88,
    metalness: 0.03
  })
  const steel = metalMaterial({ repeat: [2, 1], base: 0x6d727a, roughness: 0.5, metalness: 0.85 })

  // --- Shell -------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, length), floorCarpet)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  const wainscotGeometry = new THREE.BoxGeometry(0.12, 0.95, length)
  const upperGeometry = new THREE.BoxGeometry(0.12, WALL_TOP - 0.95, length)
  for (const side of [-1, 1]) {
    const wainscot = new THREE.Mesh(wainscotGeometry, panelWood)
    wainscot.position.set(side * HALF_WIDTH, 0.475, 0)
    wainscot.receiveShadow = true
    group.add(wainscot)

    const upper = new THREE.Mesh(upperGeometry, upperPanel)
    upper.position.set(side * HALF_WIDTH, 0.95 + (WALL_TOP - 0.95) / 2, 0)
    upper.receiveShadow = true
    group.add(upper)

    // Brass dado rail along the top of the panelling.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, length), brass)
    rail.position.set(side * HALF_WIDTH, 0.98, 0)
    group.add(rail)

    // Cove sloping from the wall top in to the ceiling.
    const cove = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, length), upperPanel)
    cove.position.set(side * (HALF_WIDTH - 0.16), (WALL_TOP + CEILING_Y) / 2, 0)
    cove.rotation.z = side * 0.55
    group.add(cove)
  }

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_WIDTH * 2 - 0.7, 0.1, length),
    upperPanel
  )
  ceiling.position.y = CEILING_Y
  group.add(ceiling)

  // End bulkheads with glazed connecting doors.
  const bulkheadGeometry = new THREE.BoxGeometry(HALF_WIDTH * 2, WALL_TOP + 0.4, 0.14)
  const doorGlass = new THREE.MeshStandardMaterial({
    color: damaged ? 0x40201c : 0xffd9a8,
    emissive: damaged ? 0xa02418 : 0xffc98a,
    emissiveIntensity: damaged ? 1.6 : 1.2,
    roughness: 0.25
  })
  for (const side of [-1, 1]) {
    const bulkhead = new THREE.Mesh(bulkheadGeometry, panelWood)
    bulkhead.position.set(0, (WALL_TOP + 0.4) / 2, side * halfLength)
    group.add(bulkhead)

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.95, 0.18), brass)
    doorFrame.position.set(0, 0.97, side * halfLength)
    group.add(doorFrame)

    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.5, 0.2), doorGlass)
    glass.position.set(0, 1.15, side * halfLength)
    group.add(glass)
  }

  // --- Windows -----------------------------------------------------------
  const windowMaterial = nightViewMaterial({
    repeat: [1, 1],
    emissiveIntensity: damaged ? 0.35 : 0.95
  })
  const windowGeometry = new THREE.BoxGeometry(0.06, 0.92, 1.55)
  const windowFrameGeometry = new THREE.BoxGeometry(0.05, 1.06, 1.7)
  const windowCount = Math.floor(length / BAY_SPACING)
  const firstWindowZ = -((windowCount - 1) * BAY_SPACING) / 2

  for (let i = 0; i < windowCount; i++) {
    const z = firstWindowZ + i * BAY_SPACING
    for (const side of [-1, 1]) {
      const frame = new THREE.Mesh(windowFrameGeometry, brass)
      frame.position.set(side * (HALF_WIDTH - 0.05), 1.5, z)
      group.add(frame)

      const pane = new THREE.Mesh(windowGeometry, windowMaterial)
      pane.position.set(side * (HALF_WIDTH - 0.04), 1.5, z)
      group.add(pane)
    }
  }

  // --- Luggage racks -----------------------------------------------------
  const rackGeometry = new THREE.BoxGeometry(0.5, 0.05, length - 1)
  for (const side of [-1, 1]) {
    const rack = new THREE.Mesh(rackGeometry, brass)
    rack.position.set(side * (HALF_WIDTH - 0.3), 2.02, 0)
    rack.castShadow = true
    group.add(rack)
  }

  // --- Seat bays (instanced) --------------------------------------------
  const bayCount = Math.max(1, Math.floor((length - 5) / BAY_SPACING))
  const firstBayZ = -((bayCount - 1) * BAY_SPACING) / 2
  const seatCount = bayCount * 4 // two facing seats, both sides of the aisle

  const seatBases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.16, 1), upholstery, seatCount)
  const seatBacks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.85, 0.18), upholstery, seatCount)
  const tables = new THREE.InstancedMesh(new THREE.BoxGeometry(0.82, 0.06, 0.72), panelWood, bayCount * 2)
  const lampCount = bayCount * 2
  const lampShades = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.16, 10),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x4a3524 : 0xffe6b8,
      emissive: damaged ? 0x220d06 : 0xffca7a,
      emissiveIntensity: damaged ? 0.2 : 2.6
    }),
    lampCount
  )

  let seatIndex = 0
  let tableIndex = 0
  // Deterministic wreckage offsets so a rebuilt level looks identical.
  const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1

  for (let bay = 0; bay < bayCount; bay++) {
    const bayZ = firstBayZ + bay * BAY_SPACING

    for (const side of [-1, 1]) {
      for (const facing of [-1, 1]) {
        const seatZ = bayZ + facing * 0.95
        const tilt = damaged ? skew(seatIndex + 1) * 0.45 : 0
        const drop = damaged ? Math.abs(skew(seatIndex + 7)) * 0.1 : 0

        dummy.rotation.set(0, 0, tilt)
        dummy.position.set(side * SEAT_X, 0.44 - drop, seatZ)
        dummy.updateMatrix()
        seatBases.setMatrixAt(seatIndex, dummy.matrix)

        dummy.position.set(side * SEAT_X, 0.87 - drop, seatZ + facing * 0.41)
        dummy.updateMatrix()
        seatBacks.setMatrixAt(seatIndex, dummy.matrix)
        seatIndex++
      }

      dummy.rotation.set(0, 0, damaged ? skew(tableIndex + 3) * 0.3 : 0)
      dummy.position.set(side * SEAT_X, 0.7, bayZ)
      dummy.updateMatrix()
      tables.setMatrixAt(tableIndex, dummy.matrix)

      dummy.rotation.set(0, 0, 0)
      dummy.position.set(side * (SEAT_X + 0.28), 0.81, bayZ)
      dummy.updateMatrix()
      lampShades.setMatrixAt(tableIndex, dummy.matrix)
      tableIndex++
    }
  }

  for (const mesh of [seatBases, seatBacks, tables, lampShades]) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // --- Lighting ----------------------------------------------------------
  const ceilingStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.05, length - 2),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x5a1712 : 0xfff2d6,
      emissive: damaged ? 0xcc2a18 : 0xffe0ae,
      emissiveIntensity: damaged ? 2 : 2.4
    })
  )
  ceilingStrip.position.y = CEILING_Y - 0.06
  group.add(ceilingStrip)

  const lampLights = []
  const lightCount = Math.max(2, Math.round(length / 7))
  for (let i = 0; i < lightCount; i++) {
    const z = -halfLength + (length / (lightCount + 1)) * (i + 1)
    const light = new THREE.PointLight(
      damaged ? 0xff5a3c : 0xffcf96,
      damaged ? 16 : 26,
      damaged ? 9 : 13,
      2
    )
    light.position.set(0, CEILING_Y - 0.25, z)
    group.add(light)
    lampLights.push({ light, base: light.intensity, seed: i * 3.7 })
  }

  // Base exposure. The point lights above are warm pools along the aisle;
  // these two stop the ends of the carriage and the bulkheads from falling
  // to black between them.
  const ambient = new THREE.AmbientLight(damaged ? 0x4a2620 : 0x6b6355, damaged ? 0.7 : 1.05)
  group.add(ambient)

  const fill = new THREE.HemisphereLight(
    damaged ? 0x7a3428 : 0x8a7f6c,
    damaged ? 0x2a1210 : 0x3a3128,
    damaged ? 0.4 : 0.6
  )
  group.add(fill)

  // --- Damage dressing ---------------------------------------------------
  if (damaged) {
    const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.95 })
    const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.16, 0.34), debrisMaterial, 22)
    for (let i = 0; i < 22; i++) {
      dummy.position.set(
        skew(i + 11) * 1.2,
        0.08 + Math.abs(skew(i + 5)) * 0.1,
        skew(i + 2) * (halfLength - 1.5)
      )
      dummy.rotation.set(skew(i) * 2, skew(i + 4) * 3, skew(i + 8) * 2)
      dummy.updateMatrix()
      debris.setMatrixAt(i, dummy.matrix)
    }
    debris.instanceMatrix.needsUpdate = true
    debris.castShadow = true
    // Loose scatter at floor level — colliding the camera against it would
    // make it twitch every time the player walked past a piece.
    debris.userData.noCameraCollision = true
    group.add(debris)
    dummy.rotation.set(0, 0, 0)

    // Torn ceiling panels exposing bare structure.
    const ribGeometry = new THREE.BoxGeometry(HALF_WIDTH * 2 - 0.8, 0.08, 0.12)
    for (let z = -halfLength + 3; z < halfLength - 3; z += 2.4) {
      const rib = new THREE.Mesh(ribGeometry, steel)
      rib.position.set(0, CEILING_Y - 0.02, z)
      group.add(rib)
    }

    // Sparking cables — emissive specks that the update() below flickers.
    const sparkMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      emissive: 0xffb054,
      emissiveIntensity: 4
    })
    const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), sparkMaterial, 14)
    for (let i = 0; i < 14; i++) {
      dummy.position.set(skew(i + 21) * 1.4, 1.9 + skew(i + 13) * 0.4, skew(i + 6) * (halfLength - 1.5))
      dummy.updateMatrix()
      sparks.setMatrixAt(i, dummy.matrix)
    }
    sparks.instanceMatrix.needsUpdate = true
    sparks.userData.noCameraCollision = true
    group.add(sparks)
    group.userData.sparkMaterial = sparkMaterial
  }

  // Emergency lighting flickers; normal lighting is steady, so update() is a
  // no-op cost in Level 2.
  let elapsed = 0
  function update(delta) {
    if (!damaged) return
    elapsed += delta
    for (const entry of lampLights) {
      const flicker = 0.65 + 0.35 * Math.abs(Math.sin(elapsed * 9 + entry.seed) * Math.sin(elapsed * 3.1 + entry.seed))
      entry.light.intensity = entry.base * flicker
    }
    const spark = group.userData.sparkMaterial
    if (spark) {
      spark.emissiveIntensity = 1 + Math.abs(Math.sin(elapsed * 17)) * 6
    }
  }

  const bounds = {
    minX: -0.58,
    maxX: 0.58,
    minZ: -halfLength + 1.2,
    maxZ: halfLength - 1.2
  }

  return { group, bounds, update, halfLength }
}

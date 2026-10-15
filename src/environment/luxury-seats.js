import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Level-3 luxury passenger seating — visual kit only.
// Shared geometries + materials keep draw calls low across every wrecked car.
// Local seat space: origin on the floor under the backrest, +Z toward the aisle.

const SEAT_DEPTH = 0.48 // local +Z extent into the aisle
const SEAT_WIDTH = 0.78 // local X (along the carriage)
const BACK_H = 0.78

function noCam(obj) {
  obj.userData.noCameraCollision = true
  return obj
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

function merge(list) {
  const usable = list.filter(Boolean)
  if (!usable.length) return null
  const merged = mergeGeometries(usable, false)
  for (const g of usable) g.dispose()
  return merged
}

function buildKit() {
  // Deep burgundy velvet — soft, not neon; holds up under ACES.
  const velvet = new THREE.MeshStandardMaterial({
    color: 0x6e1c28,
    roughness: 0.92,
    metalness: 0.02,
    emissive: 0x1a0608,
    emissiveIntensity: 0.08
  })
  const velvetWorn = new THREE.MeshStandardMaterial({
    color: 0x5a1822,
    roughness: 0.95,
    metalness: 0.02,
    emissive: 0x140508,
    emissiveIntensity: 0.06
  })
  const velvetDark = new THREE.MeshStandardMaterial({
    color: 0x3a0e14,
    roughness: 0.96,
    metalness: 0,
    emissive: 0x100306,
    emissiveIntensity: 0.05
  })
  const wood = new THREE.MeshStandardMaterial({
    color: 0x4a2e1a,
    roughness: 0.55,
    metalness: 0.08,
    emissive: 0x1a1008,
    emissiveIntensity: 0.06
  })
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc4a052,
    roughness: 0.38,
    metalness: 0.9,
    emissive: 0x3a2810,
    emissiveIntensity: 0.14
  })
  const stuffing = new THREE.MeshStandardMaterial({
    color: 0xd8cfc0,
    roughness: 0.88,
    metalness: 0,
    emissive: 0x2a2418,
    emissiveIntensity: 0.04
  })

  // --- Intact seat (merged per material) ---------------------------------
  const woodIntact = merge([
    // Base plinth
    box(SEAT_WIDTH * 0.92, 0.1, 0.36, 0, 0.11, 0.22),
    // Back wood shell
    box(SEAT_WIDTH * 0.96, BACK_H, 0.07, 0, 0.12 + BACK_H * 0.5, 0.035),
    // Side wings / armrest wood
    box(0.07, 0.28, 0.38, -SEAT_WIDTH * 0.42, 0.34, 0.22),
    box(0.07, 0.28, 0.38, SEAT_WIDTH * 0.42, 0.34, 0.22),
    // Front apron
    box(SEAT_WIDTH * 0.88, 0.08, 0.04, 0, 0.18, 0.42),
    // Short legs
    box(0.06, 0.1, 0.06, -SEAT_WIDTH * 0.34, 0.05, 0.12),
    box(0.06, 0.1, 0.06, SEAT_WIDTH * 0.34, 0.05, 0.12),
    box(0.06, 0.1, 0.06, -SEAT_WIDTH * 0.34, 0.05, 0.36),
    box(0.06, 0.1, 0.06, SEAT_WIDTH * 0.34, 0.05, 0.36)
  ])

  const velvetIntact = merge([
    // Seat cushion (slightly proud of the frame)
    box(SEAT_WIDTH * 0.82, 0.11, 0.34, 0, 0.22, 0.24),
    // Rounded front lip (second, thinner slab)
    box(SEAT_WIDTH * 0.78, 0.05, 0.08, 0, 0.2, 0.4),
    // Back cushion pad
    box(SEAT_WIDTH * 0.84, BACK_H * 0.78, 0.09, 0, 0.2 + BACK_H * 0.42, 0.09),
    // Soft crown on the backrest
    box(SEAT_WIDTH * 0.72, 0.08, 0.1, 0, 0.12 + BACK_H - 0.02, 0.08)
  ])

  // Tufting / seams — dark velvet strips + button nubs (no texture maps).
  const tuftParts = []
  for (const y of [0.42, 0.58, 0.74]) {
    tuftParts.push(box(SEAT_WIDTH * 0.7, 0.012, 0.02, 0, y, 0.145))
  }
  for (const x of [-0.16, 0.16]) {
    tuftParts.push(box(0.012, BACK_H * 0.55, 0.02, x, 0.48, 0.145))
  }
  for (const [x, y] of [[-0.16, 0.42], [0.16, 0.42], [-0.16, 0.58], [0.16, 0.58], [-0.16, 0.74], [0.16, 0.74], [0, 0.5], [0, 0.66]]) {
    tuftParts.push(box(0.035, 0.035, 0.03, x, y, 0.155))
  }
  // Cushion piping
  tuftParts.push(box(SEAT_WIDTH * 0.8, 0.015, 0.015, 0, 0.275, 0.4))
  tuftParts.push(box(0.015, 0.015, 0.32, -SEAT_WIDTH * 0.4, 0.275, 0.24))
  tuftParts.push(box(0.015, 0.015, 0.32, SEAT_WIDTH * 0.4, 0.275, 0.24))
  const tuftIntact = merge(tuftParts)

  const brassIntact = merge([
    // Top rail behind the crown
    box(SEAT_WIDTH * 0.9, 0.03, 0.04, 0, 0.12 + BACK_H + 0.01, 0.04),
    // Armrest brass caps
    box(0.08, 0.04, 0.28, -SEAT_WIDTH * 0.42, 0.48, 0.2),
    box(0.08, 0.04, 0.28, SEAT_WIDTH * 0.42, 0.48, 0.2),
    // Front corner studs
    box(0.04, 0.04, 0.04, -SEAT_WIDTH * 0.4, 0.2, 0.42),
    box(0.04, 0.04, 0.04, SEAT_WIDTH * 0.4, 0.2, 0.42)
  ])

  // --- Damaged seat: torn cushion, stuffing, missing arm ----------------
  const woodDamaged = merge([
    box(SEAT_WIDTH * 0.92, 0.1, 0.36, 0, 0.11, 0.22),
    box(SEAT_WIDTH * 0.96, BACK_H, 0.07, 0, 0.12 + BACK_H * 0.5, 0.035),
    box(0.07, 0.28, 0.38, -SEAT_WIDTH * 0.42, 0.34, 0.22),
    box(SEAT_WIDTH * 0.88, 0.08, 0.04, 0, 0.18, 0.42),
    box(0.06, 0.1, 0.06, -SEAT_WIDTH * 0.34, 0.05, 0.12),
    box(0.06, 0.1, 0.06, SEAT_WIDTH * 0.34, 0.05, 0.12),
    box(0.06, 0.1, 0.06, -SEAT_WIDTH * 0.34, 0.05, 0.36),
    box(0.06, 0.1, 0.06, SEAT_WIDTH * 0.34, 0.05, 0.36)
  ])

  const velvetDamaged = merge([
    // Partial seat cushion (torn / shifted)
    box(SEAT_WIDTH * 0.55, 0.09, 0.28, -0.08, 0.21, 0.22),
    // Ripped back remnant
    box(SEAT_WIDTH * 0.5, BACK_H * 0.45, 0.08, 0.12, 0.35, 0.09)
  ])

  const stuffingGeo = merge([
    box(0.22, 0.14, 0.18, 0.12, 0.24, 0.3),
    box(0.16, 0.2, 0.12, -0.05, 0.55, 0.12),
    box(0.1, 0.08, 0.14, 0.18, 0.28, 0.18)
  ])

  const brassDamaged = merge([
    box(SEAT_WIDTH * 0.9, 0.03, 0.04, 0, 0.12 + BACK_H + 0.01, 0.04),
    box(0.08, 0.04, 0.28, -SEAT_WIDTH * 0.42, 0.48, 0.2),
    box(0.04, 0.04, 0.04, -SEAT_WIDTH * 0.4, 0.2, 0.42)
  ])

  // --- Bare frame (cushion missing) ------------------------------------
  const woodBare = merge([
    box(SEAT_WIDTH * 0.92, 0.1, 0.36, 0, 0.11, 0.22),
    box(SEAT_WIDTH * 0.96, BACK_H, 0.07, 0, 0.12 + BACK_H * 0.5, 0.035),
    box(0.07, 0.28, 0.38, -SEAT_WIDTH * 0.42, 0.34, 0.22),
    box(0.07, 0.28, 0.38, SEAT_WIDTH * 0.42, 0.34, 0.22),
    box(SEAT_WIDTH * 0.88, 0.08, 0.04, 0, 0.18, 0.42),
    box(SEAT_WIDTH * 0.8, 0.03, 0.3, 0, 0.17, 0.24),
    box(0.06, 0.1, 0.06, -SEAT_WIDTH * 0.34, 0.05, 0.12),
    box(0.06, 0.1, 0.06, SEAT_WIDTH * 0.34, 0.05, 0.12),
    box(0.06, 0.1, 0.06, -SEAT_WIDTH * 0.34, 0.05, 0.36),
    box(0.06, 0.1, 0.06, SEAT_WIDTH * 0.34, 0.05, 0.36)
  ])

  const brassBare = merge([
    box(SEAT_WIDTH * 0.9, 0.03, 0.04, 0, 0.12 + BACK_H + 0.01, 0.04),
    box(0.08, 0.04, 0.28, -SEAT_WIDTH * 0.42, 0.48, 0.2),
    box(0.08, 0.04, 0.28, SEAT_WIDTH * 0.42, 0.48, 0.2)
  ])

  return {
    mats: { velvet, velvetWorn, velvetDark, wood, brass, stuffing },
    geos: {
      woodIntact, velvetIntact, tuftIntact, brassIntact,
      woodDamaged, velvetDamaged, stuffingGeo, brassDamaged,
      woodBare, brassBare
    }
  }
}

function facingYaw(side) {
  // Local +Z faces the aisle: right wall (−X), left wall (+X).
  return side > 0 ? -Math.PI / 2 : Math.PI / 2
}

function writeInstance(mesh, index, dummy, x, y, z, side, rx, ryExtra, rz) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(rx, facingYaw(side) + ryExtra, rz)
  dummy.scale.set(1, 1, 1)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

/**
 * Place wall-hugging luxury benches. Decorative when `cameraSafe` is true.
 * @param {THREE.Object3D} parent
 * @param {{ namePrefix: string, zs: number[], wallX: number, cameraSafe?: boolean, wreckChance?: number }} opts
 */
export function addLuxuryWallBenches(parent, {
  namePrefix,
  zs,
  wallX,
  cameraSafe = true,
  wreckChance = 0.28
}) {
  // Fresh kit per carriage so level disposeObject() can free GPU resources
  // without poisoning a process-wide singleton.
  const { mats, geos } = buildKit()
  const placements = []
  let seed = namePrefix.length * 17
  const rand = () => {
    seed = (seed * 16807 + 7) % 2147483647
    return (seed % 1000) / 1000
  }

  for (const z of zs) {
    for (const side of [-1, 1]) {
      const roll = rand()
      let variant = 'intact'
      if (roll < wreckChance * 0.35) variant = 'bare'
      else if (roll < wreckChance) variant = 'damaged'
      else if (roll < wreckChance + 0.22) variant = 'worn'
      placements.push({
        x: side * (wallX - 0.28),
        z,
        side,
        variant,
        tilt: variant === 'damaged' || variant === 'bare' ? (rand() - 0.5) * 0.14 : (rand() - 0.5) * 0.03,
        yaw: variant !== 'intact' ? (rand() - 0.5) * 0.08 : 0,
        drop: variant === 'damaged' ? rand() * 0.04 : 0
      })
    }
  }

  return addPlacements(parent, namePrefix, placements, { cameraSafe, mats, geos })
}

/**
 * Passenger-car aisle bays — positions match carriage-bounds seat colliders
 * at (side * 1.02, z) with half extents (0.35, 0.48).
 */
export function addLuxuryPassengerBays(parent, half, {
  nearSite,
  sites,
  skew
} = {}) {
  const { mats, geos } = buildKit()
  const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
  const placements = []
  let i = 0
  for (let b = 0; b < bays; b++) {
    const z = -half + 3 + b * 3.4
    for (const side of [-1, 1]) {
      const wrecked = nearSite && sites ? nearSite(sites, z, side, 1.8) : false
      const roll = Math.abs(skew ? skew(i + 11) : (i * 0.37) % 1)
      let variant = 'intact'
      if (wrecked) {
        if (roll < 0.35) variant = 'bare'
        else if (roll < 0.75) variant = 'damaged'
        else variant = 'worn'
      } else if (roll < 0.18) {
        variant = 'worn'
      } else if (roll < 0.28) {
        variant = 'damaged'
      }
      const tilt = wrecked ? (skew ? skew(i + 1) : 0) * 0.16 : (variant !== 'intact' ? 0.04 : 0)
      const yaw = wrecked ? (skew ? skew(i + 4) : 0) * 0.08 : 0
      const drop = wrecked ? Math.abs(skew ? skew(i + 7) : 0) * 0.05 : 0
      // Back anchor toward the wall so the cushion centres near collider x=±1.02.
      placements.push({
        x: side * 1.24,
        z,
        side,
        variant,
        tilt,
        yaw,
        drop
      })
      i++
    }
  }
  return addPlacements(parent, 'seats-passenger', placements, {
    cameraSafe: false,
    mats,
    geos
  })
}

function addPlacements(parent, namePrefix, placements, { cameraSafe, mats, geos }) {
  const intact = []
  const worn = []
  const damaged = []
  const bare = []
  for (const p of placements) {
    if (p.variant === 'bare') bare.push(p)
    else if (p.variant === 'damaged') damaged.push(p)
    else if (p.variant === 'worn') worn.push(p)
    else intact.push(p)
  }

  const dummy = new THREE.Object3D()
  const meshes = []

  function addPool(list, parts, tag) {
    if (!list.length) return
    for (const [geo, mat, suffix] of parts) {
      if (!geo) continue
      const mesh = new THREE.InstancedMesh(geo, mat, list.length)
      mesh.name = `${namePrefix}-${tag}-${suffix}`
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.castShadow = true
      mesh.receiveShadow = true
      list.forEach((p, i) => {
        writeInstance(mesh, i, dummy, p.x, -p.drop, p.z, p.side, p.tilt, p.yaw, p.tilt * 0.35)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (cameraSafe) noCam(mesh)
      parent.add(mesh)
      meshes.push(mesh)
    }
  }

  addPool(intact, [
    [geos.woodIntact, mats.wood, 'wood'],
    [geos.velvetIntact, mats.velvet, 'velvet'],
    [geos.tuftIntact, mats.velvetDark, 'tuft'],
    [geos.brassIntact, mats.brass, 'brass']
  ], 'intact')

  addPool(worn, [
    [geos.woodIntact, mats.wood, 'wood'],
    [geos.velvetIntact, mats.velvetWorn, 'velvet'],
    [geos.tuftIntact, mats.velvetDark, 'tuft'],
    [geos.brassIntact, mats.brass, 'brass']
  ], 'worn')

  addPool(damaged, [
    [geos.woodDamaged, mats.wood, 'wood'],
    [geos.velvetDamaged, mats.velvetWorn, 'velvet'],
    [geos.stuffingGeo, mats.stuffing, 'stuffing'],
    [geos.brassDamaged, mats.brass, 'brass']
  ], 'damaged')

  addPool(bare, [
    [geos.woodBare, mats.wood, 'wood'],
    [geos.brassBare, mats.brass, 'brass']
  ], 'bare')

  return meshes
}

/** Shared kit metrics for callers aligning props / colliders. */
export const LUXURY_SEAT = {
  depth: SEAT_DEPTH,
  width: SEAT_WIDTH,
  backHeight: BACK_H
}

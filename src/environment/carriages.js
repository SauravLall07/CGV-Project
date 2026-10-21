import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { addMechanicalReference } from './mechanical-reference.js'
import { refineWreckLandmark } from './wreck-landmarks.js'
import { addCargoWreckBenchmark } from './cargo-wreck-benchmark.js'
import { addLuxuryWallBenches, addLuxuryPassengerBays } from './luxury-seats.js'
import {
  carpetMaterial,
  metalMaterial,
  nightViewMaterial,
  stormWindowMaterial,
  plasterMaterial,
  signMaterial,
  woodMaterial
} from './textures.js'
import {
  WALL_X as HEIST_WALL_X,
  wallXFor,
  DOOR_W,
  CAB_LENGTH,
  layoutFor,
  floorPits,
  CONV_HATCH_Z,
  ROOF_RUN,
  SEAT_INNER_X,
  SEAT_DEPTH,
  SEAT_BACK_DEPTH,
  SEAT_BACK_TOP,
  passengerBooths,
  BOOTH_BENCH_OFFSET,
  BOOTH_TABLE,
  windowBayZs,
  routeControlLayout,
  localInteriorBoxes
} from './carriage-bounds.js'

export {
  listCarriageVolumes,
  carriageVolumeAt,
  listCarriageWallBoxes,
  listCarriageInteriorBoxes
} from './carriage-bounds.js'

// The train's interior playspace: the progression carriages — Passenger ->
// Security -> Relay -> Cargo -> Mechanical -> Convergence -> Vault — built end to end as
// child groups of ONE parent group, so the Alpha plan's Train/Carriage
// parent-child hierarchy now carries real, distinct interior content. Each
// carriage is a shared shell (floor, walls, ceiling, end bulkheads with a
// centred doorway) plus a type-specific dressing pass that gives it its own
// geometry, props and lighting so the progression reads at a glance.
//
// `damaged: true` re-dresses THE SAME builders as Level 3's timewreck —
// scorched materials, red emergency lighting that flickers, scattered debris,
// torn ceiling panels and sparking cables — plus a locomotive cab on the front
// for the final emergency-brake sequence, and no roof catwalk. That reuse is
// the concept doc's stated scope strategy for Level 3: don't model new
// carriages, re-light and damage the ones you have.
//
// Above Mechanical, Convergence, and Vault (Level 2 only) sits a walkable roof
// catwalk: the carriage-to-carriage exterior route for the Slow-Time wind set
// piece. The forward bulkhead of the Vault is sealed, so the roof is the only
// way in.
//
// Repeated furniture (seats, lockers, crates, debris, rivets) goes through
// InstancedMesh — a carriage of loose meshes would be hundreds of draw calls
// on its own, the frame-budget trap the brief's performance section warns of.

export const CARRIAGE_CEILING_Y = 3.5
// Level 2 Vault: the top of the dais the Chrono Core stands on, and its local Z.
export const VAULT_DAIS_TOP = 0.22
export const VAULT_CORE_FROM_END = 2.6

const DOOR_H = 2.7
export const CARRIAGE_ROOF_Y = 4.2 // top surface of the roof catwalk; clears the taller interior shell
const ROOF_Y = CARRIAGE_ROOF_Y

// Shell half-width for the build in progress. Level 2 builds wide cars and
// Level 3 narrow ones; createCarriageEnvironment sets this before any builder
// runs, and every builder is synchronous, so the builders can read it directly.
let WALL_X = HEIST_WALL_X

// Outlined hourglass — the train's Chrono Line crest — as a flat mesh facing
// +Z, `height` tall. Used on the Security car's pillars and hazard panels.
let hourglassGeometry = null
export function makeHourglassEmblem(material, height = 0.6) {
  if (!hourglassGeometry) {
    const outline = new THREE.Shape()
    outline.moveTo(-0.22, 0.5)
    outline.lineTo(0.22, 0.5)
    outline.lineTo(0.22, 0.44)
    outline.lineTo(0.05, 0)
    outline.lineTo(0.22, -0.44)
    outline.lineTo(0.22, -0.5)
    outline.lineTo(-0.22, -0.5)
    outline.lineTo(-0.22, -0.44)
    outline.lineTo(-0.05, 0)
    outline.lineTo(-0.22, 0.44)
    outline.closePath()
    const top = new THREE.Path()
    top.moveTo(-0.15, 0.4)
    top.lineTo(0, 0.05)
    top.lineTo(0.15, 0.4)
    top.closePath()
    const bottom = new THREE.Path()
    bottom.moveTo(-0.15, -0.4)
    bottom.lineTo(0.15, -0.4)
    bottom.lineTo(0, -0.05)
    bottom.closePath()
    outline.holes.push(top, bottom)
    hourglassGeometry = new THREE.ShapeGeometry(outline)
  }
  const mesh = new THREE.Mesh(hourglassGeometry, material)
  mesh.scale.setScalar(height)
  mesh.userData.noCameraCollision = true
  return mesh
}

// Deterministic scatter so a rebuilt level looks identical to the first build.
const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1

// ACES + dark L3 fill crush low-luminance albedo maps. Multiply the map by a
// soft tint so luxury woods stay readable without raising light counts.
function liftAlbedo(mat, tintHex) {
  mat.color.setHex(tintHex)
  return mat
}

// Open 8-side bead. `axis` 'z' is a rail along the carriage, 'y' a stile.
// A full round reads the same from both walls. The old chamfer was a box lip
// rotated in XY, so vertical stiles stayed square and the right-hand lip
// pointed into the wall.
function roundedRail(radius, length, axis) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 8, 1, true)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  return geo
}

// View-space graze on a round bead: wood goes matte on the silhouette,
// brass picks up a tighter highlight. Flat wall materials are left alone.
function applyBeadWear(material, kind) {
  const wood = kind === 'wood'
  material.customProgramCacheKey = () => (wood ? 'l3-wood-bead-wear' : 'l3-brass-bead-wear')
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      float graze = 1.0 - abs(normalize(vNormal).z);
      float edge = smoothstep(${wood ? '0.28, 0.82' : '0.18, 0.7'}, graze);
      roughnessFactor = mix(roughnessFactor, ${wood ? 'min(1.0, roughnessFactor + 0.2)' : 'roughnessFactor * 0.58'}, edge);`
    )
  }
  material.normalScale.set(wood ? 1.35 : 1.65, wood ? 0.85 : 0.5)
}

function addLuxuryCeilingRun(g, half, shared, name) {
  const run = new THREE.Group()
  run.name = name
  const count = Math.max(2, Math.min(5, Math.round(half / 3.5)))
  const reach = Math.max(2.4, half * 2 - 3.2)
  const shell = new THREE.BoxGeometry(0.36, 0.03, 1.02)
  shell.translate(0, 0.02, 0)
  const recess = new THREE.BoxGeometry(0.2, 0.018, 0.72)
  recess.translate(0, 0.004, 0)
  const housingGeo = mergeGeometries([shell, recess], false)
  shell.dispose()
  recess.dispose()
  const diffuserMat = new THREE.MeshStandardMaterial({
    color: 0xf4e6cc,
    emissive: 0xffc890,
    emissiveIntensity: 0.36,
    roughness: 0.62
  })
  const housings = new THREE.InstancedMesh(housingGeo, shared.brass, count)
  const diffusers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 0.56), diffuserMat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i += 1) {
    const z = -reach / 2 + (i + 0.5) * (reach / count)
    dummy.position.set(0, CARRIAGE_CEILING_Y - 0.055, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    housings.setMatrixAt(i, dummy.matrix)
    dummy.position.y = CARRIAGE_CEILING_Y - 0.074
    dummy.updateMatrix()
    diffusers.setMatrixAt(i, dummy.matrix)
  }
  housings.instanceMatrix.needsUpdate = true
  diffusers.instanceMatrix.needsUpdate = true
  noCam(housings)
  noCam(diffusers)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.018, 1.05),
    new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.88, metalness: 0.06 })
  )
  panel.position.set(0.35, CARRIAGE_CEILING_Y - 0.03, reach * 0.18)
  panel.rotation.z = 0.05
  noCam(panel)
  run.add(housings, diffusers, panel)
  g.add(run)
}

function makeShared(damaged) {
  return {
    steel: metalMaterial({
      repeat: [3, 2],
      base: damaged ? 0x6a727c : 0x6b7078,
      roughness: damaged ? 1 : 0.5,
      metalness: 0.85,
      seed: damaged ? 61 : 53,
      wear: damaged ? 0.55 : 0
    }),
    darkSteel: damaged
      ? metalMaterial({
        repeat: [2, 2],
        base: 0x4a5460,
        roughness: 1,
        metalness: 0.72,
        seed: 67,
        wear: 0.8,
        emissive: 0x141820,
        emissiveIntensity: 0.07
      })
      : new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.65, metalness: 0.6 }),
    // Damaged: worn brass with a small warm lift so ACES does not crush the grain.
    brass: damaged
      ? metalMaterial({
        repeat: [2, 1],
        base: 0xc4a052,
        roughness: 1,
        metalness: 0.82,
        seed: 71,
        wear: 0.75,
        emissive: 0x3a2810,
        emissiveIntensity: 0.1
      })
      : new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 }),
    rivet: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.7 }),
    warmGlass: new THREE.MeshStandardMaterial({
      color: damaged ? 0xffe0b8 : 0xffe0ac,
      emissive: damaged ? 0xffb060 : 0xffce8a,
      emissiveIntensity: damaged ? 1.05 : 1.3,
      roughness: 0.25
    })
  }
}

const WRECK_WOOD_SHEEN = { clearcoat: 0.16, clearcoatRoughness: 0.5 }

function wallMaterialFor(key, length, damaged) {
  const r = [Math.max(1, Math.round(length / 4)), 1]
  switch (key) {
    case 'passenger':
      // L3 luxury wreck: muted teal wood, lifted so viewport bands read under ACES.
      return damaged
        ? liftAlbedo(woodMaterial({
          repeat: r,
          light: 0x6a9a90,
          dark: 0x2a4a44,
          roughness: 0.55,
          seed: 41,
          ...WRECK_WOOD_SHEEN
        }), 0xd2ebe6)
        : woodMaterial({ repeat: r, light: 0x8a5c33, dark: 0x452a16 })
    case 'security':
      return damaged
        ? liftAlbedo(woodMaterial({
          repeat: r,
          light: 0x5f8f86,
          dark: 0x243e3a,
          roughness: 0.56,
          seed: 43,
          ...WRECK_WOOD_SHEEN
        }), 0xd0e8e2)
        : woodMaterial({ repeat: r, light: 0x7a4a26, dark: 0x3a2211 })
    case 'relay':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      // L3 Room 5: deep teal luxury panels (dash-door / temporal-rift car).
      return liftAlbedo(woodMaterial({
        repeat: r,
        light: 0x5f8f86,
        dark: 0x243e3a,
        roughness: 0.52,
        seed: 47,
        ...WRECK_WOOD_SHEEN
      }), 0xd4ebe4)
    case 'cargo':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      // L3 Room 4: deep teal luxury panels (time-loop luggage car).
      return liftAlbedo(woodMaterial({
        repeat: r,
        light: 0x5f8f86,
        dark: 0x243e3a,
        roughness: 0.52,
        seed: 109,
        ...WRECK_WOOD_SHEEN
      }), 0xd4ebe4)
    case 'freight':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      return metalMaterial({ repeat: r, base: damaged ? 0x282c33 : 0x3c4149, roughness: 0.6, metalness: 0.75 })
    case 'mechanical':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      // L3 Room 3: deep teal wood panels (luggage-storm carriage).
      return liftAlbedo(woodMaterial({
        repeat: r,
        light: 0x5a8a80,
        dark: 0x1e3a34,
        roughness: 0.52,
        seed: 97,
        ...WRECK_WOOD_SHEEN
      }), 0xd2ebe4)
    case 'convergence':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      // L3 Room 2: deep teal lower-panel wood (reference shattered luxury car).
      return liftAlbedo(woodMaterial({
        repeat: r,
        light: 0x5f8f86,
        dark: 0x243e3a,
        roughness: 0.52,
        seed: 77,
        ...WRECK_WOOD_SHEEN
      }), 0xd4ebe4)
    case 'vault':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      // L3 Room 1 only: dark polished teal-wood (industrial metal was crushing to black).
      return liftAlbedo(woodMaterial({
        repeat: r,
        light: 0x5a7a72,
        dark: 0x1c322e,
        roughness: 0.5,
        seed: 61,
        ...WRECK_WOOD_SHEEN
      }), 0xd8ebe4)
    case 'cab':
      // L3 Room 8: deep teal luxury panels (locomotive / emergency-brake car).
      return damaged
        ? liftAlbedo(woodMaterial({
          repeat: r,
          light: 0x5a8a80,
          dark: 0x1e3a34,
          roughness: 0.5,
          seed: 151,
          ...WRECK_WOOD_SHEEN
        }), 0xd2ebe4)
        : metalMaterial({ repeat: r, base: 0x2e3339, roughness: 0.62, metalness: 0.78 })
    default:
      return plasterMaterial({ repeat: r })
  }
}

// Level-3-only carriage door leaf: teal wood, brass border, small glass lite.
// Dimensions match the existing doorway — never placed across an open passage
// unless `sealed` (end-of-train plate). Shared materials keep draw cost low.
let wreckDoorMatsCache = null
function createWreckDoorMaterials() {
  if (wreckDoorMatsCache) return wreckDoorMatsCache
  wreckDoorMatsCache = {
    panel: liftAlbedo(woodMaterial({
      repeat: [1, 2], light: 0x4a6e66, dark: 0x1e342e, roughness: 0.55, seed: 91,
      ...WRECK_WOOD_SHEEN
    }), 0xc8e0d8),
    glass: new THREE.MeshStandardMaterial({
      color: 0xa8c8d8,
      emissive: 0xffc090,
      emissiveIntensity: 0.22,
      roughness: 0.2,
      metalness: 0.05,
      transparent: true,
      opacity: 0.55
    })
  }
  return wreckDoorMatsCache
}

function addWreckDoorLeaf(parent, shared, mats, { x = 0, y = DOOR_H / 2, z = 0, openYaw = 0 } = {}) {
  const leaf = new THREE.Group()
  leaf.name = 'wreck-carriage-door'
  const body = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W * 0.48, DOOR_H - 0.08, 0.07), mats.panel)
  leaf.add(body)
  for (const [w, h, px, py] of [
    [DOOR_W * 0.5, 0.05, 0, (DOOR_H - 0.08) / 2],
    [DOOR_W * 0.5, 0.05, 0, -(DOOR_H - 0.08) / 2],
    [0.05, DOOR_H - 0.08, -DOOR_W * 0.22, 0],
    [0.05, DOOR_H - 0.08, DOOR_W * 0.22, 0]
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), shared.brass)
    bar.position.set(px, py, 0.01)
    leaf.add(bar)
  }
  const lite = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W * 0.22, 0.32, 0.02), mats.glass)
  lite.position.set(0, 0.55, 0.045)
  leaf.add(lite)
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06), shared.brass)
  handle.position.set(DOOR_W * 0.14, 0, 0.06)
  leaf.add(handle)
  leaf.position.set(x, y, z)
  leaf.rotation.y = openYaw
  noCam(leaf)
  parent.add(leaf)
  return leaf
}

// Two side panels and a lintel around a centred doorway, plus a brass surround.
// `sealed` fills the doorway in with a solid plate — used at the two ends of
// the train, where an open doorway would otherwise look straight out of the
// train at the scrolling outdoor scenery.
// When `damaged`, Level 3 uses teal/brass wreck-door styling (visual only).
function addBulkhead(group, z, shared, sealed = false, damaged = false) {
  const sideW = (WALL_X * 2 - DOOR_W) / 2
  const panelMat = damaged
    ? liftAlbedo(woodMaterial({
      repeat: [1, 2], light: 0x5a7a72, dark: 0x1c322e, roughness: 0.55, seed: 93
    }), 0xd0e6de)
    : shared.darkSteel
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(sideW, CARRIAGE_CEILING_Y, 0.14),
      panelMat
    )
    panel.position.set(s * (DOOR_W / 2 + sideW / 2), CARRIAGE_CEILING_Y / 2, z)
    panel.receiveShadow = true
    // L3 visibility uses only these complete solid boxes, never damaged walls.
    if (damaged) panel.userData.wreckOccluder = true
    group.add(panel)
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W, CARRIAGE_CEILING_Y - DOOR_H, 0.14),
    panelMat
  )
  lintel.position.set(0, DOOR_H + (CARRIAGE_CEILING_Y - DOOR_H) / 2, z)
  if (damaged) lintel.userData.wreckOccluder = true
  group.add(lintel)

  const surround = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.12, DOOR_H + 0.06, 0.05), shared.brass)
  surround.name = damaged ? 'wreck-door-surround' : 'door-surround'
  surround.position.set(0, DOOR_H / 2, z)
  group.add(surround)

  // Warm overhead lamp cue on the lintel (emissive mesh — no new PointLight).
  if (damaged) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.06, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0xffe2b8, emissive: 0xffb060, emissiveIntensity: 1.05, roughness: 0.35
      })
    )
    lamp.name = 'wreck-door-lamp'
    lamp.position.set(0, DOOR_H + 0.12, z + (z >= 0 ? -0.1 : 0.1))
    noCam(lamp)
    group.add(lamp)
  }

  if (sealed) {
    if (damaged) {
      const mats = createWreckDoorMaterials()
      // Closed end-cap: two leaves filling the opening (same footprint as old plate).
      addWreckDoorLeaf(group, shared, mats, { x: -DOOR_W * 0.25, y: DOOR_H / 2, z })
      addWreckDoorLeaf(group, shared, mats, { x: DOOR_W * 0.25, y: DOOR_H / 2, z })
    } else {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.1), shared.darkSteel)
      plate.position.set(0, DOOR_H / 2, z)
      group.add(plate)
    }
  } else if (damaged) {
    // Open passage: park leaves against the bulkhead sides — never block the aisle.
    const mats = createWreckDoorMaterials()
    const toward = z >= 0 ? -1 : 1
    addWreckDoorLeaf(group, shared, mats, {
      x: -(DOOR_W / 2 + 0.02),
      y: DOOR_H / 2,
      z: z + toward * 0.08,
      openYaw: toward * 1.15
    })
    addWreckDoorLeaf(group, shared, mats, {
      x: DOOR_W / 2 + 0.02,
      y: DOOR_H / 2,
      z: z + toward * 0.08,
      openYaw: -toward * 1.15
    })
  }
}

function buildShell(key, length, shared, damaged, seals = {}, { ceiling: hasCeiling = true } = {}) {
  const g = new THREE.Group()
  g.name = `carriage-${key}`
  g.userData.type = key
  const half = length / 2

  let floorMat
  if (key === 'passenger' && damaged) {
    // Aged polished wood — midtones raised so the aisle reads under storm fill.
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x8a6440,
      dark: 0x3a2414,
      roughness: 0.46,
      seed: 19,
      planks: true
    }), 0xf0dcc4)
  } else if (key === 'vault' && damaged) {
    // Room 1: dark reflective plank aisle (collision/floor mesh unchanged).
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x7a5234,
      dark: 0x2e1a10,
      roughness: 0.42,
      seed: 67,
      planks: true
    }), 0xead2b6)
  } else if (key === 'convergence' && damaged) {
    // Room 2: warm plank deck (same mesh/collision — visual only).
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x8a6440,
      dark: 0x3a2414,
      roughness: 0.44,
      seed: 79,
      planks: true
    }), 0xf0dcc4)
  } else if (key === 'mechanical' && damaged) {
    // Room 3: dark polished wood aisle under floating trunks.
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x7a5234,
      dark: 0x2e1a10,
      roughness: 0.44,
      seed: 101,
      planks: true
    }), 0xead2b6)
  } else if (key === 'cargo' && damaged) {
    // Room 4: dark wood under the track/walkway overlay.
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x7a5234,
      dark: 0x2e1a10,
      roughness: 0.44,
      seed: 111,
      planks: true
    }), 0xead2b6)
  } else if (key === 'relay' && damaged) {
    // Room 5: dark polished plank aisle under the dash-door run.
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x7a5234,
      dark: 0x2e1a10,
      roughness: 0.42,
      seed: 121,
      planks: true
    }), 0xead2b6)
  } else if (key === 'security' && damaged) {
    // Room 6: dark polished wood under / around the freeze-tile gap.
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x7a5234,
      dark: 0x2e1a10,
      roughness: 0.42,
      seed: 131,
      planks: true
    }), 0xead2b6)
  } else if (key === 'cab' && damaged) {
    // Room 8: dark polished plank deck toward the emergency brake.
    floorMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 2)],
      light: 0x7a5234,
      dark: 0x2e1a10,
      roughness: 0.42,
      seed: 153,
      planks: true
    }), 0xead2b6)
  } else if (['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence', 'freight', 'vault'].includes(key) && !damaged) {
    floorMat = woodMaterial({ repeat: [2, Math.round(length / 2)], light: 0x6b4526, dark: 0x2e1a0c })
  } else {
    floorMat = metalMaterial({
      repeat: [3, Math.round(length / 2)],
      base: damaged ? 0x454b54 : 0x50555d,
      roughness: damaged ? 0.75 : 0.6,
      metalness: 0.7
    })
  }
  let floorGeometry
  const pits = damaged ? [] : floorPits(key, half)
  if (pits.length > 0) {
    const outline = new THREE.Shape()
    outline.moveTo(-WALL_X, -half)
    outline.lineTo(WALL_X, -half)
    outline.lineTo(WALL_X, half)
    outline.lineTo(-WALL_X, half)
    outline.closePath()
    // Plane Y becomes negative world Z after the floor's rotation.
    for (const pit of pits) {
      const y = -pit.z
      const hole = new THREE.Path()
      hole.moveTo(-pit.halfX, y - pit.halfZ)
      hole.lineTo(-pit.halfX, y + pit.halfZ)
      hole.lineTo(pit.halfX, y + pit.halfZ)
      hole.lineTo(pit.halfX, y - pit.halfZ)
      hole.closePath()
      outline.holes.push(hole)
    }
    floorGeometry = new THREE.ShapeGeometry(outline)
    const uv = floorGeometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / (WALL_X * 2) + 0.5, uv.getY(i) / length + 0.5)
    }
  } else {
    floorGeometry = new THREE.PlaneGeometry(WALL_X * 2, length)
  }
  const floor = new THREE.Mesh(floorGeometry, floorMat)
  floor.name = `floor-${key}`
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  g.add(floor)

  const wallMat = wallMaterialFor(key, length, damaged)
  // Open sides: passenger/cab + L3 Vault–Relay + Security — storm reads through.
  const openSides = damaged && (
    key === 'passenger' || key === 'cab' || key === 'vault'
    || key === 'convergence' || key === 'mechanical' || key === 'cargo'
    || key === 'relay' || key === 'security'
  )
  if (!openSides) {
    const wallGeo = new THREE.BoxGeometry(0.12, CARRIAGE_CEILING_Y, length)
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wallGeo, wallMat)
      w.name = `wall-${key}`
      w.position.set(s * WALL_X, CARRIAGE_CEILING_Y / 2, 0)
      w.receiveShadow = true
      g.add(w)
    }
  }

  let ceilingMat
  if ((key === 'security' || key === 'vault') && !damaged) {
    ceilingMat = plasterMaterial({ repeat: [2, Math.round(length / 3)], base: 0xd8ccb0, roughness: 0.85 })
  } else if ((key === 'vault' || key === 'convergence' || key === 'mechanical' || key === 'cargo'
    || key === 'relay' || key === 'security' || key === 'passenger' || key === 'cab') && damaged) {
    const warmCeil = key === 'convergence' || key === 'mechanical' || key === 'cargo'
      || key === 'relay' || key === 'security' || key === 'passenger' || key === 'cab'
    ceilingMat = liftAlbedo(woodMaterial({
      repeat: [2, Math.round(length / 3)],
      light: warmCeil ? 0x6a4a2e : 0x4a6a62,
      dark: warmCeil ? 0x2e1a10 : 0x1a2e2a,
      roughness: 0.58,
      seed: key === 'cab' ? 155 : key === 'passenger' ? 141 : key === 'security' ? 133 : key === 'relay' ? 123
        : key === 'cargo' ? 113 : key === 'mechanical' ? 103 : key === 'convergence' ? 81 : 63
    }), warmCeil ? 0xe8d2b4 : 0xc5ddd6)
  } else if (damaged) {
    ceilingMat = metalMaterial({
      repeat: [2, Math.round(length / 3)],
      base: 0x424850,
      roughness: 0.72,
      metalness: 0.62
    })
  } else {
    ceilingMat = wallMat
  }
  if (hasCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.1, length), ceilingMat)
    ceiling.name = `ceiling-${key}`
    ceiling.position.y = CARRIAGE_CEILING_Y
    g.add(ceiling)
  }

  addBulkhead(g, -half, shared, Boolean(seals.min), damaged)
  addBulkhead(g, half, shared, Boolean(seals.max), damaged)

  return { group: g, half }
}

// Shared damage pass applied on top of every dressed carriage in Level 3:
// recognisable torn-train pieces, exposed ceiling ribs, and sparking cables.
function damageSites(half) {
  if (half < 5) return [{ z: 0.4, side: -1 }]
  return [
    { z: -half + 2.4, side: -1 },
    { z: half - 2.4, side: 1 }
  ]
}

function nearSite(sites, z, side, span = 1.35) {
  return sites.some((c) => Math.abs(z - c.z) < span && c.side === side)
}

// Pier centres between the canonical Level 3 bays, including both end piers.
// Decorative meshes that used a damage-site Z were landing on the glass.
function standardPierCenters(half) {
  const paneD = 2.49
  const centers = []
  let cursor = -half
  for (let z = -half + 2.4; z <= half - 2.4 + 0.01; z += 3.4) {
    const edge = z - paneD / 2
    if (edge - cursor > 0.2) centers.push((cursor + edge) / 2)
    cursor = z + paneD / 2
  }
  if (half - cursor > 0.2) centers.push((cursor + half) / 2)
  return centers
}

// Level-3 wall: lower and upper bands plus piers leave window openings.
// Glass is recessed in those openings with a brass surround. Collision
// still uses carriage-bounds, not these meshes.
function addBlownViewports(g, half, key, shared) {
  const wallMat = wallMaterialFor(key, half * 2, true)
  // Cab and door lights stay the smaller openings. Standard glass is ~27%
  // larger in both directions (1.46 × 2.14 m). Piers stay about 0.9 m.
  const cab = key === 'cab'
  const paneH = cab ? 0.92 : 1.66
  const paneD = cab ? 1.48 : 2.49
  const paneY = cab ? 1.58 : 1.64
  const glassFillH = cab ? 0.78 : 0.88
  const glassFillD = cab ? 0.74 : 0.86
  const zs = []
  if (key === 'cab') {
    zs.push(0.6)
  } else {
    for (let z = -half + 2.4; z <= half - 2.4 + 0.01; z += 3.4) zs.push(z)
  }

  const sillY = paneY - paneH / 2
  const lintelY = paneY + paneH / 2
  const lowerH = Math.max(0.2, sillY)
  const upperH = Math.max(0.2, CARRIAGE_CEILING_Y - lintelY)
  const dummy = new THREE.Object3D()

  for (const s of [-1, 1]) {
    const x = s * WALL_X
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.12, lowerH, half * 2), wallMat)
    lower.name = `wall-band-${key}-lower`
    lower.position.set(x, lowerH / 2, 0)
    lower.receiveShadow = true
    g.add(lower)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, upperH, half * 2), wallMat)
    upper.name = `wall-band-${key}-upper`
    upper.position.set(x, lintelY + upperH / 2, 0)
    upper.receiveShadow = true
    g.add(upper)

  }
  const piers = []
  for (const s of [-1, 1]) {
    let cursor = -half
    for (const z of zs) {
      const a = z - paneD / 2
      const span = a - cursor
      if (span > 0.06) piers.push({ x: s * WALL_X, z: cursor + span / 2, span })
      cursor = z + paneD / 2
    }
    const tail = half - cursor
    if (tail > 0.06) piers.push({ x: s * WALL_X, z: cursor + tail / 2, span: tail })
  }
  if (piers.length) {
    const pierMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, paneH, 1), wallMat, piers.length)
    pierMesh.name = `wall-piers-${key}`
    pierMesh.receiveShadow = true
    piers.forEach((pier, i) => {
      dummy.position.set(pier.x, paneY, pier.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, pier.span)
      dummy.updateMatrix()
      pierMesh.setMatrixAt(i, dummy.matrix)
    })
    pierMesh.instanceMatrix.needsUpdate = true
    g.add(pierMesh)
  }

  // Nested reveal: wood casing, brass bevel, dark seal, then glass set
  // back in the opening. Damage is hashed per bay so cars do not repeat.
  const openings = []
  const salt = key.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  for (const s of [-1, 1]) {
    zs.forEach((z, i) => {
      const h = Math.abs(Math.sin((salt + i * 19 + s * 11) * 12.9898) * 43758.5453) % 1
      const kind = h < 0.48 ? 0 : h < 0.74 ? 1 : h < 0.9 ? 2 : 3
      openings.push({ s, z, kind, h })
    })
  }
  if (!openings.length) return
  const glassMat = stormWindowMaterial({ seed: 11 + salt })
  const sealMat = new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.92, metalness: 0.04 })
  const crackMat = new THREE.MeshStandardMaterial({
    color: 0xc5d0d8, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.45, depthWrite: false
  })
  const n = openings.length
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, paneH * glassFillH, paneD * glassFillD), glassMat, n)
  glass.name = `wreck-window-glass-${key}`
  const phases = new Float32Array(n)
  const woodTrim = wallMat.clone()
  const brassTrim = shared.brass.clone()
  applyBeadWear(woodTrim, 'wood')
  applyBeadWear(brassTrim, 'brass')
  const railR = cab ? 0.02 : 0.028
  const stileR = cab ? 0.016 : 0.022
  const beadR = cab ? 0.008 : 0.011
  const brassSpanZ = paneD * (glassFillD * 0.5 + 0.04)
  const brassSpanY = paneH * (glassFillH * 0.5 + 0.035)
  const woodH = new THREE.InstancedMesh(roundedRail(railR, paneD + stileR * 0.7, 'z'), woodTrim, n * 2)
  const woodV = new THREE.InstancedMesh(roundedRail(stileR, paneH + railR * 0.7, 'y'), woodTrim, n * 2)
  const brassH = new THREE.InstancedMesh(roundedRail(beadR, brassSpanZ * 2 + beadR * 0.7, 'z'), brassTrim, n * 2)
  const brassV = new THREE.InstancedMesh(roundedRail(beadR, brassSpanY * 2 + beadR * 0.7, 'y'), brassTrim, n * 2)
  const sealH = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.016, paneD * glassFillD), sealMat, n * 2)
  const sealV = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, paneH * glassFillH, 0.016), sealMat, n * 2)
  const cracks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, paneH * 0.55, 0.01), crackMat, n * 2)
  const splinters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.36, 0.04), shared.darkSteel, n)
  woodH.name = `wreck-window-casing-${key}`
  sealH.name = `wreck-window-seal-${key}`
  cracks.name = `wreck-window-crack-${key}`
  let woodHI = 0
  let woodVI = 0
  let brassHI = 0
  let brassVI = 0
  let crackI = 0
  const hide = () => {
    dummy.position.set(0, -30, 0)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(0.001, 0.001, 0.001)
    dummy.updateMatrix()
  }
  openings.forEach((open, index) => {
    const { s, z, kind, h } = open
    phases[index] = (h * 0.71 + (s < 0 ? 0.13 : 0.47) + index * 0.09) % 1
    const glassX = s * (WALL_X + 0.03)
    const sealX = s * (WALL_X - 0.005)
    const brassX = s * (WALL_X - 0.05)
    const woodX = s * (WALL_X - 0.085)
    const corner = h > 0.6 ? 1 : -1
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    // Kind 2 used to shrink the pane to 0.38 × 0.34 and drop one stile.
    // That left a full wall opening with a small bright rectangle, which
    // read as a different window size. Damage stays on the cracks and splinter.
    dummy.position.set(glassX, paneY, z)
    dummy.updateMatrix()
    glass.setMatrixAt(index, dummy.matrix)

    dummy.scale.set(1, 1, 1)
    dummy.rotation.set(0, 0, 0)
    for (const edge of [-1, 1]) {
      dummy.position.set(sealX, paneY + edge * paneH * glassFillH * 0.5, z)
      dummy.updateMatrix()
      sealH.setMatrixAt(index * 2 + (edge < 0 ? 0 : 1), dummy.matrix)
      dummy.position.set(sealX, paneY, z + edge * paneD * glassFillD * 0.5)
      dummy.updateMatrix()
      sealV.setMatrixAt(index * 2 + (edge < 0 ? 0 : 1), dummy.matrix)
    }

    for (const edge of [-1, 1]) {
      const bent = kind === 3 && edge === corner
      dummy.scale.set(1, 1, 1)
      dummy.rotation.set(0, 0, bent ? s * 0.22 : 0)
      dummy.position.set(edge < 0 ? s * (WALL_X - 0.13) : woodX, paneY + edge * paneH * 0.5, z)
      if (edge < 0) dummy.scale.set(1.55, 0.62, 1)
      dummy.updateMatrix()
      woodH.setMatrixAt(woodHI++, dummy.matrix)
      dummy.scale.set(1, 1, 1)
      dummy.position.set(brassX, paneY + edge * paneH * (glassFillH * 0.5 + 0.035), z)
      dummy.rotation.set(0, 0, bent ? s * 0.28 : 0)
      dummy.updateMatrix()
      brassH.setMatrixAt(brassHI++, dummy.matrix)

      dummy.rotation.set(bent ? s * 0.55 : 0, 0, bent ? s * 0.18 : 0)
      dummy.position.set(woodX + (bent ? -s * 0.03 : 0), paneY + (bent ? 0.08 : 0), z + edge * paneD * 0.5)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      woodV.setMatrixAt(woodVI++, dummy.matrix)
      dummy.scale.set(1, 1, 1)
      dummy.position.set(brassX + (bent ? -s * 0.02 : 0), paneY, z + edge * paneD * (glassFillD * 0.5 + 0.04))
      dummy.updateMatrix()
      brassV.setMatrixAt(brassVI++, dummy.matrix)
      dummy.rotation.set(0, 0, 0)
    }

    if (kind === 1 || kind === 2) {
      for (const k of [0, 1]) {
        dummy.position.set(s * (WALL_X - 0.02), paneY + (k ? 0.08 : -0.05), z + (k ? 0.12 : -0.08))
        dummy.rotation.set(0, 0, 0.4 + k * 0.7 + h)
        dummy.scale.set(1, 0.7 + h * 0.4, 1)
        dummy.updateMatrix()
        cracks.setMatrixAt(crackI++, dummy.matrix)
      }
    }
    if (kind === 2 || kind === 3) {
      dummy.position.set(woodX - s * 0.02, paneY + paneH * 0.18, z + corner * paneD * 0.46)
      dummy.rotation.set(s * 0.8, 0.2, s * (0.4 + h))
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      splinters.setMatrixAt(index, dummy.matrix)
    } else {
      hide()
      splinters.setMatrixAt(index, dummy.matrix)
    }
  })
  while (crackI < cracks.count) {
    hide()
    cracks.setMatrixAt(crackI++, dummy.matrix)
  }
  while (brassHI < brassH.count) {
    hide()
    brassH.setMatrixAt(brassHI++, dummy.matrix)
  }
  while (brassVI < brassV.count) {
    hide()
    brassV.setMatrixAt(brassVI++, dummy.matrix)
  }
  glass.geometry.setAttribute('aBayPhase', new THREE.InstancedBufferAttribute(phases, 1))
  glass.onBeforeRender = () => {
    const time = performance.now() * 0.001
    const scroll = (time * 0.062) % 1
    if (glassMat.map) glassMat.map.offset.x = scroll
    if (glassMat.emissiveMap) glassMat.emissiveMap.offset.x = scroll
    const shader = glassMat.userData.stormShader
    if (shader) shader.uniforms.uStormTime.value = time
  }
  for (const mesh of [glass, woodH, woodV, brassH, brassV, sealH, sealV, cracks, splinters]) {
    mesh.instanceMatrix.needsUpdate = true
    noCam(mesh)
    g.add(mesh)
  }
}

function addWreckage(g, half, shared, fx, key) {
  // Torn lining edges pick up a faint cyan rim from the storm / chrono leak.
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x3a3e45,
    roughness: 0.72,
    metalness: 0.58,
    emissive: 0x0e7490,
    emissiveIntensity: 0.1
  })
  const sites = damageSites(half)
  const n = sites.length
  const openView = key === 'passenger' || key === 'cab' || key === 'vault'
    || key === 'convergence' || key === 'mechanical' || key === 'cargo'
    || key === 'relay' || key === 'security'

  // Torn lining hinged off the wall at the ceiling joint — still wall-aligned.
  // On cars with blown viewports, hang it inside the opening instead of filling it.
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, openView ? 0.82 : 1.45, openView ? 0.7 : 1.45), panelMat, n), n, (d, i) => {
    const c = sites[i]
    // The -Z left-wall site used to sit on the first window centre, so that
    // pane was covered and read as a much smaller window. Park the sheet on
    // the end pier, clear of the glass.
    const panelZ = openView ? c.z + (c.z < 0 ? -1.7 : 1.7) : c.z
    d.position.set(c.side * (WALL_X - (openView ? 0.48 : 0.06)), openView ? 2.08 : 1.45, panelZ)
    d.rotation.set(0, 0, c.side * (openView ? 0.18 : 0.14))
  }))

  // Ceiling tile still attached at the wall-roof corner, sagging inward a little.
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.03, 1.15), panelMat, n), n, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.2, CARRIAGE_CEILING_Y - 0.06, c.z)
    d.rotation.set(0, 0, c.side * 0.22)
  }))

  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1.35), shared.steel, n), n, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.16), CARRIAGE_CEILING_Y - 0.12, c.z)
    d.rotation.set(0, 0, c.side * 0.05)
  }))

  const ribGeo = new THREE.BoxGeometry(WALL_X * 2 - 0.55, 0.08, 0.12)
  for (const c of sites) {
    const rib = new THREE.Mesh(ribGeo, shared.steel)
    rib.position.set(0, CARRIAGE_CEILING_Y - 0.02, c.z)
    g.add(rib)
  }

  const sparkMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0, emissive: 0xffb054, emissiveIntensity: 2.2
  })
  const sparkCount = n * 2
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 5), sparkMat, sparkCount), sparkCount, (d, i) => {
    const c = sites[i >> 1]
    d.position.set(c.side * (WALL_X - 0.14), CARRIAGE_CEILING_Y - 0.16, c.z + (i % 2 ? 0.16 : -0.1))
    d.rotation.set(0.25, 0, c.side * 0.15)
  }))
  fx.sparkMats.push(sparkMat)

  const cableMat = new THREE.MeshStandardMaterial({ color: 0x2a2d32, roughness: 0.72, metalness: 0.3 })
  for (const c of sites) {
    addSagCable(
      g, cableMat,
      c.side * (WALL_X - 0.1), CARRIAGE_CEILING_Y - 0.08, c.z - 0.2,
      c.side * (WALL_X - 0.12), 1.15, c.z + 0.5,
      0.22
    )
  }
}

// Registers a point light for the emergency-lighting flicker in update().
function addLight(g, fx, light, damaged) {
  g.add(light)
  if (!damaged) return
  light.intensity *= 1.45
  light.distance *= 1.35
  const i = fx.lights.length
  fx.lights.push({
    light,
    base: light.intensity,
    seed: i * 3.7,
    pattern: i % 4,
    car: fx.car || '',
    dead: false,
    pendingKill: false,
    surge: 0
  })
}

// Level-3-only dressing: wall-hugging wreckage so the ±0.58 aisle stays clear.
function noCam(obj) {
  obj.userData.noCameraCollision = true
  return obj
}

function scatterInstances(mesh, count, place) {
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    place(dummy, i)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  noCam(mesh)
  return mesh
}

function addSagCable(g, mat, ax, ay, az, bx, by, bz, sag = 0.32) {
  const a = new THREE.Vector3(ax, ay, az)
  const b = new THREE.Vector3(bx, by, bz)
  const mid = a.clone().lerp(b, 0.5)
  mid.y -= sag
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 7, 0.015, 5, false),
    mat
  )
  noCam(mesh)
  g.add(mesh)
}

function dressDamagedMechanical(g, half, shared, fx) {
  const sites = damageSites(half)
  const stripeYel = new THREE.MeshStandardMaterial({
    color: 0xd97706, emissive: 0x7c2d12, emissiveIntensity: 0.7, roughness: 0.55
  })
  const stripeBlk = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85, metalness: 0.2 })
  const stripeGeo = new THREE.BoxGeometry(0.06, 0.11, 0.48)
  const stripeCount = sites.length * 2
  for (const [mat, offset] of [[stripeYel, -0.24], [stripeBlk, 0.24]]) {
    g.add(scatterInstances(new THREE.InstancedMesh(stripeGeo, mat, stripeCount), stripeCount, (d, i) => {
      const c = sites[i >> 1]
      d.position.set(c.side * (WALL_X - 0.18), 0.07, c.z + offset)
      d.rotation.set(0, 0, 0)
    }))
  }

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f47, roughness: 0.5, metalness: 0.72, emissive: 0x1a1816, emissiveIntensity: 0.08
  })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.85, 1.05), panelMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.14), 0.7, c.z)
    d.rotation.set(0, 0, c.side * 0.1)
  }))

  const grateMat = metalMaterial({ repeat: [1, 1], base: 0x4b515a, roughness: 0.6, metalness: 0.8 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.04, 0.7), grateMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.12, 0.28, c.z + 0.2)
    d.rotation.set(0.06, 0, c.side * 0.55)
  }))

  const burstMat = metalMaterial({ repeat: [1, 1], base: 0x4a4e55, roughness: 0.55, metalness: 0.8 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.05, 1.15, 8), burstMat, sites.length * 2), sites.length * 2, (d, i) => {
    const c = sites[i >> 1]
    d.position.set(c.side * (WALL_X - 0.16), 1.05 + (i % 2) * 0.32, c.z)
    d.rotation.set(Math.PI / 2, 0, c.side * 0.08)
  }))

  const glow = new THREE.PointLight(0xff5a1e, 5.5, 5, 2)
  glow.position.set(sites[0].side * 0.95, 1.1, sites[0].z)
  addLight(g, fx, glow, true)
}

function dressDamagedCargo(g, half, shared, fx) {
  // Kept for call-site compatibility; L3 damaged Cargo uses dressDamagedCargoLuxury.
  dressDamagedCargoLuxury(g, half, shared, fx)
}

// Low-poly antique clock face (decorative only — no gameplay).
function addCargoAntiqueClock(g, x, y, z, facing = 1, brass = null) {
  const clock = new THREE.Group()
  clock.name = 'cargo-antique-clock'
  const rimMat = brass ?? new THREE.MeshStandardMaterial({
    color: 0xc4a052, roughness: 0.42, metalness: 0.88, emissive: 0x3a2810, emissiveIntensity: 0.12
  })
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 20),
    new THREE.MeshStandardMaterial({ color: 0xf2ebe0, roughness: 0.55, metalness: 0.02 })
  )
  face.position.z = 0.02
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), rimMat)
  const cyan = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.018, 6, 20),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.85, roughness: 0.35
    })
  )
  const handH = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.01), rimMat)
  handH.position.set(0, 0.06, 0.03)
  const handM = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22, 0.01), rimMat)
  handM.position.set(0.04, 0.08, 0.03)
  handM.rotation.z = -0.7
  clock.add(face, rim, cyan, handH, handM)
  clock.position.set(x, y, z)
  clock.rotation.y = facing * Math.PI / 2
  noCam(clock)
  g.add(clock)
  return clock
}

// L3 Room 4: shattered luxury Cargo — teal walls, luggage crates, clock, amber fill.
function dressDamagedCargoLuxury(g, half, shared, fx) {
  addBlownViewports(g, half, 'cargo', shared)

  addLuxuryCeilingRun(g, half, shared, 'cargo-ceiling-strip')

  const rupture = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, half * 0.85),
    new THREE.MeshStandardMaterial({
      color: 0x2a1848, emissive: 0x7c3aed, emissiveIntensity: 1.2, roughness: 0.4
    })
  )
  rupture.name = 'cargo-rupture-strip'
  rupture.position.set(0, CARRIAGE_CEILING_Y - 0.05, 0)
  g.add(rupture)

  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 3), shared.brass)
    rail.name = 'cargo-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 2), shared.brass)
    edge.name = 'cargo-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
  }

  // Side luggage trunks (static InstancedMesh — aisle kept clear for loop hazards).
  const trunkWood = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x6a4a2c, dark: 0x2e1a10, roughness: 0.62, seed: 115
  }), 0xe0c8a8)
  const trunkLeather = new THREE.MeshStandardMaterial({
    color: 0x3a2818, roughness: 0.88, metalness: 0.04, emissive: 0x120c08, emissiveIntensity: 0.06
  })
  addCargoWreckBenchmark(g, { wood: trunkWood, leather: trunkLeather, brass: shared.brass })
  const spots = []
  for (let z = -half + 2.4; z <= half - 2.4; z += 2.8) {
    spots.push([-(WALL_X - 0.5), 0.42, z, 0])
    spots.push([WALL_X - 0.5, 0.42, z, 1])
  }
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.72, 0.55, 0.95), trunkWood, spots.length)
  const lids = new THREE.InstancedMesh(new THREE.BoxGeometry(0.74, 0.12, 0.97), trunkLeather, spots.length)
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.76, 0.04, 0.99), shared.brass, spots.length)
  bodies.name = 'cargo-luggage-bodies'
  const dummy = new THREE.Object3D()
  const sites = damageSites(half)
  spots.forEach(([x, y, z, seed], k) => {
    const wrecked = nearSite(sites, z, Math.sign(x) || -1, 1.6)
    dummy.position.set(x, wrecked ? y - 0.04 : y, z)
    dummy.rotation.set(wrecked ? 0.06 : 0, skew(seed + k) * 0.25, wrecked ? Math.sign(x) * 0.08 : 0)
    dummy.updateMatrix()
    bodies.setMatrixAt(k, dummy.matrix)
    dummy.position.y += 0.28
    dummy.updateMatrix()
    lids.setMatrixAt(k, dummy.matrix)
    dummy.position.y -= 0.12
    dummy.updateMatrix()
    bands.setMatrixAt(k, dummy.matrix)
  })
  for (const mesh of [bodies, lids, bands]) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    noCam(mesh)
    g.add(mesh)
  }

  // Luxury wall benches — ends only (centre clear for door/beam). Decorative.
  addLuxuryWallBenches(g, {
    namePrefix: 'cargo-bench',
    zs: [-half + 3.2, half - 3.2],
    wallX: WALL_X,
    wreckChance: 0.3
  })

  // Wall clock + faint second clock deeper in the rupture (cheap geometry).
  addCargoAntiqueClock(g, -(WALL_X - 0.2), 2.05, -half * 0.15, 1, shared.brass)
  addCargoAntiqueClock(g, WALL_X + 0.55, 1.85, half * 0.35, -1, shared.brass)

  // Sparse floating luggage outside the hull (storm read — not walkable).
  const floatN = 6
  const floatBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.4, 0.75), trunkWood, floatN)
  floatBody.name = 'cargo-float-luggage'
  for (let i = 0; i < floatN; i++) {
    const s = i % 2 ? 1 : -1
    dummy.position.set(s * (WALL_X + 0.9), 0.5 + (i % 3) * 0.4, -half + 3.5 + i * 3.8)
    dummy.rotation.set(0.08 * s, 0.35 * s, s * 0.15)
    dummy.updateMatrix()
    floatBody.setMatrixAt(i, dummy.matrix)
  }
  floatBody.instanceMatrix.needsUpdate = true
  noCam(floatBody)
  g.add(floatBody)

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.35, roughness: 0.35
  })
  for (const z of [-half + 5, half - 5]) {
    for (const s of [-1, 1]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), glassMat)
      shade.name = 'cargo-sconce'
      shade.position.set(s * (WALL_X - 0.35), 2.05, z)
      noCam(shade)
      g.add(shade)
    }
  }

  // Ceiling hang point (visual only — moving girder/trunk is in timewreck.js).
  const hangChain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), shared.brass)
  hangChain.position.set(0, CARRIAGE_CEILING_Y - 0.45, half * 0.05)
  noCam(hangChain)
  g.add(hangChain)

  // Cargo identity: warm aisle + stronger violet loop accent (same 3 lights).
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(0xffc090, 7.8, 7.5, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    addLight(g, fx, l, true)
  }
  const loopGlow = new THREE.PointLight(0xa855f7, 4.8, 5.5, 2)
  loopGlow.position.set(sites[0].side * 0.95, 1.5, sites[0].z)
  addLight(g, fx, loopGlow, true)
}

// L3 Room 6: shattered luxury Security — teal wood, burgundy benches, clock,
// amber fill, storm openings. Freeze tiles are built in timewreck.js.
function dressDamagedSecurity(g, half, shared, fx) {
  addBlownViewports(g, half, 'security', shared)

  addLuxuryCeilingRun(g, half, shared, 'security-ceiling-strip')

  const rupture = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, half * 0.9),
    new THREE.MeshStandardMaterial({
      color: 0x2a1848, emissive: 0x7c3aed, emissiveIntensity: 1.2, roughness: 0.4
    })
  )
  rupture.name = 'security-rupture-strip'
  rupture.position.set(0, CARRIAGE_CEILING_Y - 0.05, 0)
  g.add(rupture)

  const cyanEdge = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.7, roughness: 0.35
  })
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 3), shared.brass)
    rail.name = 'security-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 2), shared.brass)
    edge.name = 'security-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
    const cyan = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, half * 2 - 2.4), cyanEdge)
    cyan.name = 'security-floor-cyan'
    cyan.position.set(s * (WALL_X - 0.32), 0.02, 0)
    noCam(cyan)
    g.add(cyan)
  }

  // Benches sit on the end piers. The old ±(half-3.2) centres landed on the
  // first and last panes and hid part of the glass. Centre stays clear.
  const piers = standardPierCenters(half)
  addLuxuryWallBenches(g, {
    namePrefix: 'security-bench',
    zs: [piers[0], piers[piers.length - 1]],
    wallX: WALL_X,
    wreckChance: 0.32
  })

  // Clock on an interior pier. half*0.55 sat inside the forward-left pane.
  addCargoAntiqueClock(g, -(WALL_X - 0.2), 2.05, piers[piers.length - 2], 1, shared.brass)

  // A few static floating panels in the exterior void (not walkable).
  const panelWood = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x6a4a2c, dark: 0x2e1a10, roughness: 0.62, seed: 137
  }), 0xe0c8a8)
  const floatN = 4
  const floatPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.08, 1.1), panelWood, floatN)
  floatPanels.name = 'security-float-panels'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < floatN; i++) {
    const s = i % 2 ? 1 : -1
    dummy.position.set(s * (WALL_X + 0.85), 1.2 + (i % 3) * 0.35, -half * 0.2 + i * 2.4)
    dummy.rotation.set(0.2 * s, 0.3 * s, s * 0.25)
    dummy.updateMatrix()
    floatPanels.setMatrixAt(i, dummy.matrix)
  }
  floatPanels.instanceMatrix.needsUpdate = true
  noCam(floatPanels)
  g.add(floatPanels)

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.35, roughness: 0.35
  })
  for (const z of [piers[1], piers[Math.max(1, piers.length - 3)]]) {
    for (const s of [-1, 1]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), glassMat)
      shade.name = 'security-sconce'
      shade.position.set(s * (WALL_X - 0.35), 2.05, z)
      noCam(shade)
      g.add(shade)
    }
  }

  // Soft cyan fracture cue on torn lining (emissive only — no PointLight).
  const cyanTear = new THREE.MeshStandardMaterial({
    color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 0.55, roughness: 0.4
  })
  for (const c of damageSites(half)) {
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.7), cyanTear)
    tear.name = 'security-chrono-tear'
    tear.position.set(c.side * (WALL_X - 0.45), 1.4, c.z + (c.z < 0 ? -1.7 : 1.7))
    tear.rotation.z = c.side * 0.1
    noCam(tear)
    g.add(tear)
  }

  // Security identity: warm ends + cool centre wash over the freeze walkway
  // (same 3 PointLights — no pool growth).
  for (const [z, hex, intensity] of [
    [-half * 0.55, 0xffc090, 7.5],
    [0, 0xb8d4e8, 6.8],
    [half * 0.55, 0xffc090, 7.5]
  ]) {
    const l = new THREE.PointLight(hex, intensity, 7.5, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    addLight(g, fx, l, true)
  }
}

// L3 Room 7 finale dress: luxury accents + storm read. Seats/lights are added
// by dressPassenger; collapse/detach/debris live in timewreck.js.
function dressDamagedPassenger(g, half, shared, fx) {
  const sites = damageSites(half)

  const rupture = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.05, half * 1.15),
    new THREE.MeshStandardMaterial({
      color: 0x2a1848, emissive: 0x7c3aed, emissiveIntensity: 1.35, roughness: 0.4
    })
  )
  rupture.name = 'passenger-rupture-strip'
  rupture.position.set(0, CARRIAGE_CEILING_Y - 0.05, half * 0.1)
  g.add(rupture)

  // Soft violet storm veils outside the hull — intensifies purple read through openings.
  const veilMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a30, emissive: 0x7c3aed, emissiveIntensity: 1.05,
    roughness: 1, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide
  })
  for (const s of [-1, 1]) {
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(half * 1.6, CARRIAGE_CEILING_Y * 1.2), veilMat)
    veil.name = 'passenger-storm-veil'
    veil.position.set(s * (WALL_X + 1.4), CARRIAGE_CEILING_Y * 0.45, 0)
    veil.rotation.y = s * Math.PI / 2
    noCam(veil)
    g.add(veil)
  }

  const cyanEdge = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.75, roughness: 0.35
  })
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 3), shared.brass)
    rail.name = 'passenger-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 2), shared.brass)
    edge.name = 'passenger-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
    const cyan = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, half * 2 - 2.4), cyanEdge)
    cyan.name = 'passenger-floor-cyan'
    cyan.position.set(s * (WALL_X - 0.32), 0.02, 0)
    noCam(cyan)
    g.add(cyan)
  }

  // Burgundy runner — visual only on the existing floor.
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, half * 2 - 3.5),
    new THREE.MeshStandardMaterial({
      color: 0x6a1824, roughness: 0.92, metalness: 0,
      emissive: 0x1a0608, emissiveIntensity: 0.08
    })
  )
  runner.name = 'passenger-runner'
  runner.rotation.x = -Math.PI / 2
  runner.position.y = 0.015
  noCam(runner)
  g.add(runner)

  // Exposed brass ceiling beams at damage sites.
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(WALL_X * 1.6, 0.07, 0.1), shared.brass, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(0, CARRIAGE_CEILING_Y - 0.14, c.z)
    d.rotation.set(0, 0, c.side * 0.04)
  }))

  const luggageMat = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x6a4a2c, dark: 0x2e1a10, roughness: 0.65, seed: 143
  }), 0xe0c8a8)
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.2, 0.5), luggageMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.08, 0.58, c.z + 0.55)
    d.rotation.set(0.04, 0.12 * c.side, 0)
  }))

  const seatFrag = new THREE.MeshStandardMaterial({
    color: 0x7a2430,
    roughness: 0.9,
    metalness: 0.02,
    emissive: 0x1a0608,
    emissiveIntensity: 0.08
  })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.1, 0.4), seatFrag, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.12, 0.12, c.z - 0.35)
    d.rotation.set(0.05, 0.08 * c.side, c.side * 0.12)
  }))

  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.9, 0.08), shared.brass, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.05), 1.45, c.z + 0.72)
    d.rotation.set(0.04, 0, c.side * 0.12)
  }))

  // Sparse floating wall panels in the exterior void (static, not walkable).
  const panelWood = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x4a6a62, dark: 0x1a2e2a, roughness: 0.55, seed: 145
  }), 0xc8ddd6)
  const floatN = 5
  const floatPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.0, 1.2), panelWood, floatN)
  floatPanels.name = 'passenger-float-panels'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < floatN; i++) {
    const s = i % 2 ? 1 : -1
    dummy.position.set(s * (WALL_X + 1.1), 0.9 + (i % 3) * 0.45, -half * 0.35 + i * 2.8)
    dummy.rotation.set(0.15 * s, 0.35 * s, s * 0.35)
    dummy.updateMatrix()
    floatPanels.setMatrixAt(i, dummy.matrix)
  }
  floatPanels.instanceMatrix.needsUpdate = true
  noCam(floatPanels)
  g.add(floatPanels)

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.35, roughness: 0.35
  })
  for (const z of [-half + 4.5, half - 4.5]) {
    for (const s of [-1, 1]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), glassMat)
      shade.name = 'passenger-sconce'
      shade.position.set(s * (WALL_X - 0.35), 2.05, z)
      noCam(shade)
      g.add(shade)
    }
  }

  const cyanTear = new THREE.MeshStandardMaterial({
    color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 0.6, roughness: 0.4
  })
  for (const c of sites) {
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.75), cyanTear)
    tear.name = 'passenger-chrono-tear'
    tear.position.set(c.side * (WALL_X - 0.45), 1.4, c.z + (c.z < 0 ? -1.7 : 1.7))
    tear.rotation.z = c.side * 0.12
    noCam(tear)
    g.add(tear)
  }
}

function rememberVaultPiece(fx, mesh) {
  if (!fx.vaultPieces) fx.vaultPieces = []
  if (fx.vaultPieces.length >= 4) return
  fx.vaultPieces.push({
    mesh,
    x: mesh.position.x,
    y: mesh.position.y,
    z: mesh.position.z,
    rx: mesh.rotation.x,
    ry: mesh.rotation.y,
    rz: mesh.rotation.z
  })
}

function rememberVaultMat(fx, mat) {
  if (!fx.vaultMats) fx.vaultMats = []
  fx.vaultMats.push(mat)
}

// L3 Vault luxury wreck: side benches hug the walls so the centre aisle and
// laser gates stay clear. Decorative only — no colliders / noCam.
function addVaultLuxuryBenches(g, half, shared) {
  void shared
  // Keep |x| high so the walkway (±~1.0) stays empty; lasers still span the aisle.
  addLuxuryWallBenches(g, {
    namePrefix: 'vault-bench',
    zs: [-half + 3.2, 0.4, half - 5.2],
    wallX: WALL_X,
    wreckChance: 0.22
  })
}

function dressDamagedVault(g, half, shared, fx) {
  const sites = [{ z: half - 1.8, side: -1 }, { z: half - 1.8, side: 1 }]
  // Torn wall plates — wood with restrained cyan chrono-edge (fracture FX still drives these mats).
  const plateMat = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x4a6a62, dark: 0x1a2e2a, roughness: 0.52, seed: 73
  }), 0xc8ddd6)
  plateMat.emissive.setHex(0x0e7490)
  plateMat.emissiveIntensity = 0.18
  rememberVaultMat(fx, plateMat)
  const plates = scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1.2, 1.15), plateMat, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.48), 1.15, c.z)
    d.rotation.set(0, 0, c.side * 0.12)
  })
  g.add(plates)
  rememberVaultPiece(fx, plates)

  const rails = scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), shared.brass, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.35, 0.14, c.z)
    d.rotation.set(0, 0, c.side * 0.05)
  })
  g.add(rails)
  rememberVaultPiece(fx, rails)

  const scorch = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b, emissive: 0x6d28d9, emissiveIntensity: 0.7, roughness: 0.7
  })
  rememberVaultMat(fx, scorch)
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.015, 1.05), scorch, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.35, 0.02, c.z)
    d.rotation.set(0, 0, 0)
  }))

  const vein = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.95, roughness: 0.35
  })
  rememberVaultMat(fx, vein)
  for (const c of sites) {
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.08), vein)
    streak.name = 'vault-chrono-vein'
    streak.position.set(c.side * (WALL_X - 0.42), 1.15, c.z)
    noCam(streak)
    g.add(streak)
    rememberVaultPiece(fx, streak)
    addSagCable(g, vein, c.side * (WALL_X - 0.45), 2.18, c.z - 0.3, c.side * 1.2, 0.7, c.z + 0.25, 0.24)
  }

  // Vault identity: stronger violet rupture wash (same single PointLight).
  const coreGlow = new THREE.PointLight(0x8b5cf6, 6.4, 6.5, 2)
  coreGlow.position.set(0, 1.4, half - 1.2)
  addLight(g, fx, coreGlow, true)
}
// --- Per-carriage dressing -------------------------------------------------

function dressPassenger(g, half, shared, damaged, fx) {
  if (!damaged) {
    dressFirstClass(g, half, shared, fx)
    return
  }
  addBlownViewports(g, half, 'passenger', shared)
  addWreckedSeatBays(g, half)

  addLuxuryCeilingRun(g, half, shared, 'passenger-ceiling-strip')
  // Passenger identity: warmer aisle fills against violet storm veils/rupture.
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(0xffb888, 9.0, 6.8, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    addLight(g, fx, l, true)
  }
  dressDamagedPassenger(g, half, shared, fx)
}

// Level 3 passenger bays — luxury kit at the same Z/X as carriage-bounds seat
// colliders (side * 1.02). Visual wreck tilt does not move the AABB.
function addWreckedSeatBays(g, half) {
  addLuxuryPassengerBays(g, half, {
    sites: damageSites(half),
    nearSite,
    skew
  })
}

// Level 2 first-class carriage — the stealth introduction. Booths of red
// velvet benches face each other across window tables down both sides of a
// red runner; brass luggage racks with suitcases run overhead; wood panelling,
// red curtains, sconces and a caramel arched ceiling with gold ribs and
// hanging lanterns. The bench backs stand SEAT_BACK_TOP high — above a
// crouched player's detection point, below a standing one's — so the space
// between a booth's benches is cover. Layout and colliders: carriage-bounds.js.
function dressFirstClass(g, half, shared, fx) {
  const booths = passengerBooths(half)
  addVintageFitOut(g, half, shared, {
    runnerBase: 0x5a1620, runnerAccent: 0xa07a3a, curtains: true, trunks: false,
    bays: booths, curtainColor: 0x6a1a20
  })
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a44e, roughness: 0.3, metalness: 0.9 })
  addArchedCeiling(g, half, 0xa87a4a, gold)
  const glassMat = lampGlassMaterial()
  addLanterns(g, half, shared, fx, glassMat, 4)
  for (let k = 0; k < booths.length - 1; k++) {
    for (const s of [-1, 1]) addSconce(g, s, (booths[k] + booths[k + 1]) / 2, shared, glassMat)
  }

  // Benches: one per booth end, per side. [geometry, material, y, z offset
  // toward the booth's outer end, x offset toward the aisle]
  const width = WALL_X - 0.08 - SEAT_INNER_X
  const velvet = new THREE.MeshStandardMaterial({ color: 0x7a1e24, roughness: 0.9, metalness: 0 })
  const velvetDark = new THREE.MeshStandardMaterial({ color: 0x5a1419, roughness: 0.92, metalness: 0 })
  const backOut = (SEAT_DEPTH + SEAT_BACK_DEPTH) / 2
  const parts = [
    [new THREE.BoxGeometry(width, 0.3, SEAT_DEPTH - 0.1), shared.darkSteel, 0.15, 0, 0],
    [new THREE.BoxGeometry(width, 0.16, SEAT_DEPTH), velvet, 0.38, 0, 0],
    [new THREE.BoxGeometry(width, SEAT_BACK_TOP - 0.1, SEAT_BACK_DEPTH), velvet, (SEAT_BACK_TOP - 0.1) / 2, backOut, 0],
    // Tufting: two darker seams across the back.
    [new THREE.BoxGeometry(width - 0.1, 0.03, SEAT_BACK_DEPTH + 0.01), velvetDark, 0.7, backOut, 0],
    [new THREE.BoxGeometry(width - 0.1, 0.03, SEAT_BACK_DEPTH + 0.01), velvetDark, 0.9, backOut, 0],
    // Brass rail along the top of the back and a post at the aisle end.
    [new THREE.BoxGeometry(width, 0.05, SEAT_BACK_DEPTH + 0.04), shared.brass, SEAT_BACK_TOP - 0.05, backOut, 0],
    [new THREE.BoxGeometry(0.06, SEAT_BACK_TOP + 0.08, 0.06), shared.brass, (SEAT_BACK_TOP + 0.08) / 2, backOut, -(width / 2 - 0.03)],
    [new THREE.BoxGeometry(0.07, 0.07, SEAT_DEPTH - 0.04), shared.brass, 0.62, 0, -(width / 2 - 0.035)]
  ]
  const benches = []
  for (const zc of booths) {
    for (const s of [-1, 1]) {
      for (const dir of [-1, 1]) benches.push({ s, z: zc + dir * BOOTH_BENCH_OFFSET, dir })
    }
  }
  const dummy = new THREE.Object3D()
  for (const [geometry, material, y, outward, towardAisle] of parts) {
    const mesh = new THREE.InstancedMesh(geometry, material, benches.length)
    benches.forEach(({ s, z, dir }, i) => {
      dummy.position.set(s * (SEAT_INNER_X + width / 2 + towardAisle), y, z + dir * outward)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    g.add(mesh)
  }

  // Sightline blockers across each booth's aisle side, waist high. They stand
  // in for the bench ends and table that hide a crouched body from someone
  // walking the aisle; a standing player's head is above them. Invisible, and
  // only guards' vision rays meet them — they are not colliders.
  const coverGeo = new THREE.BoxGeometry(0.04, 1.0, BOOTH_BENCH_OFFSET * 2 - 0.4)
  for (const zc of booths) {
    for (const s of [-1, 1]) {
      const cover = new THREE.Mesh(coverGeo, shared.darkSteel)
      cover.name = 'booth-cover'
      cover.visible = false
      cover.position.set(s * SEAT_INNER_X, 0.5, zc)
      noCam(cover)
      cover.userData.noInteractionBlocker = true
      g.add(cover)
    }
  }

  // Window tables with a pedestal and a shaded table lamp.
  const tableWood = woodMaterial({ repeat: [1, 1], light: 0x5a3418, dark: 0x2a160a })
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d6, emissive: 0xffd49a, emissiveIntensity: 1.1, roughness: 0.6
  })
  const tableX = WALL_X - BOOTH_TABLE.inset
  booths.forEach((zc, k) => {
    for (const s of [-1, 1]) {
      const x = s * tableX
      const top = new THREE.Mesh(new THREE.BoxGeometry(BOOTH_TABLE.halfX * 2, 0.05, BOOTH_TABLE.halfZ * 2), tableWood)
      top.position.set(x, 0.74, zc)
      const edge = new THREE.Mesh(new THREE.BoxGeometry(BOOTH_TABLE.halfX * 2 + 0.02, 0.02, BOOTH_TABLE.halfZ * 2 + 0.02), shared.brass)
      edge.position.set(x, 0.715, zc)
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.7, 10), shared.darkSteel)
      pedestal.position.set(x, 0.35, zc)
      g.add(top, edge, pedestal)
      const lampX = x + s * 0.18
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12), shared.brass)
      base.position.set(lampX, 0.785, zc)
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), shared.brass)
      stem.position.set(lampX, 0.93, zc)
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.16, 14, 1, true), shadeMat)
      shade.position.set(lampX, 1.1, zc)
      noCam(shade)
      g.add(base, stem, shade)
      const l = new THREE.PointLight(0xffc98a, 2.6, 3.2, 2)
      l.position.set(lampX, 1.05, zc)
      g.add(l)
      // The odd book or vase to break up the repetition.
      if ((k + (s > 0 ? 1 : 0)) % 3 === 0) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.04, 0.26),
          new THREE.MeshStandardMaterial({ color: k % 2 ? 0x1f3b5b : 0x6b1f1f, roughness: 0.8 })
        )
        book.position.set(x - s * 0.15, 0.785, zc + 0.08)
        book.rotation.y = 0.3
        g.add(book)
      }
    }
  })

  // Brass luggage racks overhead with suitcases along them.
  // Set in from the wall so the suitcases clear the curtain pelmets.
  const rackX = WALL_X - 0.5
  const leather = [0x4a3526, 0x2b211b, 0x5a2a1a]
  for (const s of [-1, 1]) {
    for (const dx of [-0.24, 0.24]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, half * 2 - 1.6, 8), shared.brass)
      rail.rotation.x = Math.PI / 2
      rail.position.set(s * (rackX + dx), 2.36, 0)
      noCam(rail)
      g.add(rail)
    }
    for (let z = -half + 1.4; z <= half - 1.4; z += 1.6) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.04), shared.brass)
      bracket.position.set(s * rackX, 2.34, z)
      g.add(bracket)
    }
  }
  const cases = []
  booths.forEach((zc, k) => {
    for (const s of [-1, 1]) {
      cases.push({ s, z: zc - 0.7 + skew(k * 3 + s) * 0.2, h: 0.32, k })
      if ((k + s) % 2 === 0) cases.push({ s, z: zc + 0.6, h: 0.26, k: k + 7 })
    }
  })
  leather.forEach((colour, c) => {
    const subset = cases.filter((_, i) => i % leather.length === c)
    const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, metalness: 0.05 })
    g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 1, 0.7), mat, subset.length),
      subset.length, (d, i) => {
        const { s, z, h, k } = subset[i]
        d.position.set(s * rackX, 2.38 + h / 2, z)
        d.scale.set(1, h, 1)
        d.rotation.set(0, skew(k + 11) * 0.15, 0)
      }))
  })

  // Landscape paintings on the end walls, either side of each doorway.
  const frameWood = woodMaterial({ repeat: [1, 1], light: 0x4a2c16, dark: 0x24140a })
  const canvasMat = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: 0.35 })
  for (const e of [-1, 1]) {
    for (const s of [-1, 1]) {
      const z = e * (half - 0.09)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.05), frameWood)
      frame.position.set(s * 1.6, 1.85, z)
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.03), gold)
      trim.position.set(s * 1.6, 1.85, z - e * 0.02)
      const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.02), canvasMat)
      canvas.position.set(s * 1.6, 1.85, z - e * 0.035)
      g.add(frame, trim, canvas)
    }
  }
}

// Level 2's old-world luxury cars share one fit-out: wood panelling, a
// patterned runner with a gold border, dado and picture rails, windows with
// brass trim, and leather trunks beneath each window. No glowing trim — the
// light comes from lamps, not strips.
function addVintageFitOut(g, half, shared, {
  runnerBase, runnerAccent, curtains, windows = true, trunks = true,
  bays = windowBayZs(half), curtainColor = 0x1b2a4a
}) {
  const length = half * 2
  const runnerLength = length - 0.4
  const runnerMat = carpetMaterial({ repeat: [1, Math.round(length / 2)], base: runnerBase, accent: runnerAccent })
  const border = new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.8, metalness: 0.2 })
  const runnerGroup = new THREE.Group()
  runnerGroup.name = `floor-runner-${g.userData.type}`
  g.add(runnerGroup)

  // The shell floor has real openings. Split the decorative runner and its
  // borders at the same Z spans so they cannot paint a fake floor over a pit.
  function addRunnerSection(fromZ, toZ) {
    const segmentLength = toZ - fromZ
    if (segmentLength <= 0) return
    const centerZ = (fromZ + toZ) / 2
    const geometry = new THREE.PlaneGeometry(2.2, segmentLength)
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      uv.setY(i, 0.5 - centerZ / runnerLength + (uv.getY(i) - 0.5) * segmentLength / runnerLength)
    }
    const runner = new THREE.Mesh(geometry, runnerMat)
    runner.rotation.x = -Math.PI / 2
    runner.position.set(0, 0.006, centerZ)
    runner.receiveShadow = true
    runnerGroup.add(runner)
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.06, segmentLength), border)
      edge.rotation.x = -Math.PI / 2
      edge.position.set(s * 1.0, 0.008, centerZ)
      runnerGroup.add(edge)
    }
  }

  let sectionStart = -half + 0.2
  for (const pit of [...floorPits(g.userData.type, half)].sort((a, b) => a.z - b.z)) {
    addRunnerSection(sectionStart, pit.z - pit.halfZ)
    sectionStart = pit.z + pit.halfZ
  }
  addRunnerSection(sectionStart, half - 0.2)

  const darkWood = woodMaterial({ repeat: [1, 1], light: 0x4a2c16, dark: 0x24140a })
  const curtain = new THREE.MeshStandardMaterial({ color: curtainColor, roughness: 0.95, metalness: 0 })
  const windowMat = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: 0.85 })
  for (const s of [-1, 1]) {
    // Dado rail and picture rail run the length of the car.
    for (const y of [0.95, 2.72]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, length), darkWood)
      rail.position.set(s * (WALL_X - 0.08), y, 0)
      g.add(rail)
    }
  }

  for (const z of windows ? bays : []) {
    for (const s of [-1, 1]) {
      const x = s * WALL_X
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.22, 1.42), darkWood)
      frame.position.set(x - s * 0.05, 1.62, z)
      g.add(frame)
      // Glass sits proud of the brass trim so the trim reads as a thin border.
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 1.3), shared.brass)
      trim.position.set(x - s * 0.09, 1.62, z)
      g.add(trim)
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.04, 1.24), windowMat)
      pane.position.set(x - s * 0.12, 1.62, z)
      g.add(pane)
      if (!curtains) continue
      for (const e of [-1, 1]) {
        const drape = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.3), curtain)
        drape.position.set(x - s * 0.13, 1.5, z + e * 0.8)
        drape.castShadow = true
        noCam(drape)
        g.add(drape)
      }
      const valance = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 1.95), curtain)
      valance.position.set(x - s * 0.14, 2.56, z)
      noCam(valance)
      g.add(valance)
    }
  }

  if (!trunks) return

  // Leather luggage trunks under each window, brass-strapped; every other bay
  // carries a smaller case on top. Footprints match carriage-bounds.js.
  const leather = new THREE.MeshStandardMaterial({ color: 0x2b211b, roughness: 0.78, metalness: 0.05 })
  const leatherLight = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.8, metalness: 0.05 })
  const trunkSpots = []
  bays.forEach((z, k) => { for (const s of [-1, 1]) trunkSpots.push({ s, z, k }) })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.55, 1.0), leather, trunkSpots.length),
    trunkSpots.length, (d, i) => {
      const { s, z } = trunkSpots[i]
      d.position.set(s * (WALL_X - 0.45), 0.275, z)
      d.rotation.set(0, 0, 0)
    }))
  const straps = trunkSpots.length * 2
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.77, 0.57, 0.05), shared.brass, straps),
    straps, (d, i) => {
      const { s, z } = trunkSpots[i >> 1]
      d.position.set(s * (WALL_X - 0.45), 0.275, z + (i % 2 ? 0.3 : -0.3))
      d.rotation.set(0, 0, 0)
    }))
  const cases = trunkSpots.filter((t) => (t.k + (t.s > 0 ? 1 : 0)) % 2 === 0)
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.36, 0.75), leatherLight, cases.length),
    cases.length, (d, i) => {
      const { s, z, k } = cases[i]
      d.position.set(s * (WALL_X - 0.47), 0.73, z + 0.05)
      d.rotation.set(0, skew(k + 3) * 0.2, 0)
    }))
}

// Level 2 Security: navy runner, curtained windows, and a cream beamed
// ceiling lit by small warm downlights.
function dressVintageSecurity(g, half, shared, fx) {
  const length = half * 2
  addVintageFitOut(g, half, shared, { runnerBase: 0x1c2640, runnerAccent: 0x9a7a3a, curtains: true })

  // Beamed ceiling: cross beams every two metres, two long beams, and a small
  // warm downlight in each coffer.
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xc9b894, roughness: 0.8, metalness: 0.05 })
  for (let z = -half + 1; z <= half - 1; z += 2) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.12, 0.14), beamMat)
    beam.position.set(0, CARRIAGE_CEILING_Y - 0.1, z)
    noCam(beam)
    g.add(beam)
  }
  for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, length), beamMat)
    beam.position.set(s * 1.2, CARRIAGE_CEILING_Y - 0.1, 0)
    noCam(beam)
    g.add(beam)
  }
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2b0, emissiveIntensity: 1.2 })
  const bulbs = []
  for (let z = -half + 2; z <= half - 2; z += 2) for (const x of [-1.9, 0, 1.9]) bulbs.push([x, z])
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), bulbMat, bulbs.length),
    bulbs.length, (d, i) => {
      d.position.set(bulbs[i][0], CARRIAGE_CEILING_Y - 0.06, bulbs[i][1])
      d.rotation.set(0, 0, 0)
    }))

  for (const z of [-half * 0.6, 0, half * 0.6]) {
    const l = new THREE.PointLight(0xffd6a0, 13, 10, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.4, z)
    addLight(g, fx, l, false)
  }
}

function dressSecurity(g, half, shared, damaged, fx) {
  if (!damaged) {
    dressVintageSecurity(g, half, shared, fx)
    return
  }
  dressDamagedSecurity(g, half, shared, fx)
}

// Warm lamp glass shared by lanterns and sconces.
function lampGlassMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.6, roughness: 0.3
  })
}

// Brass handrail on stand-offs down both walls, at waist height.
function addHandrail(g, half, shared) {
  const railGeo = new THREE.CylinderGeometry(0.03, 0.03, half * 2 - 1, 10)
  railGeo.rotateX(Math.PI / 2)
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, shared.brass)
    rail.position.set(s * (WALL_X - 0.12), 1.02, 0)
    noCam(rail)
    g.add(rail)
    for (let z = -half + 1; z <= half - 1; z += 1.3) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), shared.brass)
      post.rotation.z = Math.PI / 2
      post.position.set(s * (WALL_X - 0.06), 1.02, z)
      g.add(post)
    }
  }
}

// Hanging lanterns down the centreline: brass canopy, rod, glass and cap.
function addLanterns(g, half, shared, fx, glassMat, spacing = 4) {
  // Geometry stays immutable and belongs to this carriage's fixture set.
  // Keep separate meshes/transforms so visibility and raycasts are unchanged.
  let geometries = null
  for (let z = -half + 2.5; z <= half - 2; z += spacing) {
    geometries ??= {
      rod: new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6),
      cap: new THREE.CylinderGeometry(0.06, 0.16, 0.08, 8),
      glass: new THREE.CylinderGeometry(0.13, 0.1, 0.26, 8),
      base: new THREE.CylinderGeometry(0.11, 0.07, 0.05, 8)
    }
    const lantern = new THREE.Group()
    const rod = new THREE.Mesh(geometries.rod, shared.brass)
    rod.position.y = -0.18
    const cap = new THREE.Mesh(geometries.cap, shared.brass)
    cap.position.y = -0.38
    const glass = new THREE.Mesh(geometries.glass, glassMat)
    glass.position.y = -0.55
    const base = new THREE.Mesh(geometries.base, shared.brass)
    base.position.y = -0.7
    lantern.add(rod, cap, glass, base)
    lantern.position.set(0, CARRIAGE_CEILING_Y, z)
    noCam(lantern)
    g.add(lantern)
    const l = new THREE.PointLight(0xffc98a, 11, 9, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.6, z)
    addLight(g, fx, l, false)
  }
}

// Wall sconce: brass back plate with a small shaded lamp.
// A weak carriage key prevents sharing disposed geometry with another level
// or retaining an old level. disposeObject deduplicates these at teardown.
const sconceGeometries = new WeakMap()
function addSconce(g, s, z, shared, glassMat, y = 1.95) {
  let geometries = sconceGeometries.get(g)
  if (!geometries) {
    geometries = {
      plate: new THREE.BoxGeometry(0.03, 0.22, 0.12),
      shade: new THREE.CylinderGeometry(0.06, 0.09, 0.16, 8)
    }
    sconceGeometries.set(g, geometries)
  }
  const x = s * WALL_X
  const plate = new THREE.Mesh(geometries.plate, shared.brass)
  plate.position.set(x - s * 0.02, y, z)
  const shade = new THREE.Mesh(geometries.shade, glassMat)
  shade.position.set(x - s * 0.16, y + 0.1, z)
  noCam(shade)
  g.add(plate, shade)
  const l = new THREE.PointLight(0xffc27a, 3, 3.5, 2)
  l.position.set(x - s * 0.3, y + 0.05, z)
  g.add(l)
}

// Level 2 Route Control: burgundy runner, bare windows, a dark wood ceiling
// hung with brass lanterns, wall sconces, a brass handrail down both walls,
// and a framed route poster. The operator platform, relay boxes, route board
// and exit doors are interactive, so moving-heist.js builds those.
function dressRouteControl(g, half, shared, fx) {
  const layout = routeControlLayout(half)
  addVintageFitOut(g, half, shared, { runnerBase: 0x4a1119, runnerAccent: 0xa07a3a, curtains: false })

  addHandrail(g, half, shared)
  const glassMat = lampGlassMaterial()
  addLanterns(g, half, shared, fx, glassMat)
  for (const { s, z } of layout.sconces) addSconce(g, s, z, shared, glassMat)

  // Framed route poster between two windows.
  const { s: ps, z: pz } = layout.poster
  const darkWood = woodMaterial({ repeat: [1, 1], light: 0x4a2c16, dark: 0x24140a })
  const posterFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.85), darkWood)
  posterFrame.position.set(ps * (WALL_X - 0.04), 1.75, pz)
  g.add(posterFrame)
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.18),
    signMaterial({ text: 'ROUTE CONTROL', background: 0xe6d6b4, foreground: 0x3a2412, emissiveIntensity: 0.15 })
  )
  poster.position.set(ps * (WALL_X - 0.07), 2.06, pz)
  poster.rotation.y = -ps * Math.PI / 2
  g.add(poster)
  const chart = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.56),
    new THREE.MeshStandardMaterial({ color: 0xd9c7a0, roughness: 0.9 })
  )
  chart.position.set(ps * (WALL_X - 0.07), 1.62, pz)
  chart.rotation.y = -ps * Math.PI / 2
  g.add(chart)
  // A few inked route lines across the chart.
  const ink = new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.9 })
  for (let k = 0; k < 3; k++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, 0.6), ink)
    line.position.set(ps * (WALL_X - 0.075), 1.45 + k * 0.14, pz)
    line.rotation.x = (k - 1) * 0.25
    g.add(line)
  }
}

function dressRelay(g, half, shared, damaged, fx) {
  if (!damaged) {
    dressRouteControl(g, half, shared, fx)
    return
  }
  dressDamagedRelayLuxury(g, half, shared, fx)
}

// L3 Room 5: shattered luxury Relay — teal wood, burgundy benches, antique clock,
// amber fill, storm openings. Dash blast doors are built in timewreck.js.
function dressDamagedRelayLuxury(g, half, shared, fx) {
  addBlownViewports(g, half, 'relay', shared)

  addLuxuryCeilingRun(g, half, shared, 'relay-ceiling-strip')

  const rupture = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, half * 0.95),
    new THREE.MeshStandardMaterial({
      color: 0x2a1848, emissive: 0x7c3aed, emissiveIntensity: 1.2, roughness: 0.4
    })
  )
  rupture.name = 'relay-rupture-strip'
  rupture.position.set(0, CARRIAGE_CEILING_Y - 0.05, -half * 0.08)
  g.add(rupture)

  const cyanEdge = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.7, roughness: 0.35
  })
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 3), shared.brass)
    rail.name = 'relay-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 2), shared.brass)
    edge.name = 'relay-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
    const cyan = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, half * 2 - 2.4), cyanEdge)
    cyan.name = 'relay-floor-cyan'
    cyan.position.set(s * (WALL_X - 0.32), 0.02, 0)
    noCam(cyan)
    g.add(cyan)
  }

  // Thin burgundy runner — visual only on the existing floor mesh.
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, half * 2 - 3.2),
    new THREE.MeshStandardMaterial({
      color: 0x6a1824, roughness: 0.92, metalness: 0,
      emissive: 0x1a0608, emissiveIntensity: 0.08
    })
  )
  runner.name = 'relay-runner'
  runner.rotation.x = -Math.PI / 2
  runner.position.y = 0.015
  noCam(runner)
  g.add(runner)

  // Luxury high-back benches — centre clear for the dash. Decorative.
  addLuxuryWallBenches(g, {
    namePrefix: 'relay-bench',
    zs: [-half + 3.4, -half * 0.15, half * 0.4, half - 3.6],
    wallX: WALL_X,
    wreckChance: 0.3
  })

  // Antique clock on the approach wall (reuse Room 4 helper).
  addCargoAntiqueClock(g, -(WALL_X - 0.2), 2.05, half * 0.55, 1, shared.brass)

  // Sparse floating luggage in the exterior void (static, non-interactive).
  const trunkWood = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x6a4a2c, dark: 0x2e1a10, roughness: 0.62, seed: 127
  }), 0xe0c8a8)
  const floatN = 5
  const floatBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.4, 0.75), trunkWood, floatN)
  floatBody.name = 'relay-float-luggage'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < floatN; i++) {
    const s = i % 2 ? 1 : -1
    dummy.position.set(s * (WALL_X + 0.95), 0.55 + (i % 3) * 0.45, -half + 3.2 + i * 3.2)
    dummy.rotation.set(0.1 * s, 0.4 * s, s * 0.18)
    dummy.updateMatrix()
    floatBody.setMatrixAt(i, dummy.matrix)
  }
  floatBody.instanceMatrix.needsUpdate = true
  noCam(floatBody)
  g.add(floatBody)

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.35, roughness: 0.35
  })
  for (const z of [-half + 4.5, 0, half - 4.5]) {
    for (const s of [-1, 1]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), glassMat)
      shade.name = 'relay-sconce'
      shade.position.set(s * (WALL_X - 0.35), 2.05, z)
      noCam(shade)
      g.add(shade)
    }
  }

  // Soft cyan fracture cue on torn lining (emissive only — no PointLight).
  const cyanTear = new THREE.MeshStandardMaterial({
    color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 0.55, roughness: 0.4
  })
  for (const c of damageSites(half)) {
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.7), cyanTear)
    tear.name = 'relay-chrono-tear'
    tear.position.set(c.side * (WALL_X - 0.45), 1.4, c.z + (c.z < 0 ? -1.7 : 1.7))
    tear.rotation.z = c.side * 0.1
    noCam(tear)
    g.add(tear)
  }

  // Relay identity: warmer warning amber so cyan blast scars read cooler.
  for (const z of [-half * 0.55, 0, half * 0.55]) {
    const light = new THREE.PointLight(0xffb070, 7.8, 8, 2)
    light.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    addLight(g, fx, light, true)
  }
}

// Level 2 Cargo: a luxury baggage car. Wood panelling and a dark runner,
// strapped crates stacked down both walls, framed landscapes above them, wall
// sconces, a brass handrail and hanging lanterns. The moving loads are the
// level's hazards, so moving-heist.js builds those.
function dressVintageCargo(g, half, shared, fx) {
  addVintageFitOut(g, half, shared, {
    runnerBase: 0x3a1a12, runnerAccent: 0x9a7a3a, curtains: false, windows: false, trunks: false
  })

  // Crates: footprints match carriage-bounds.js. The stacked crate is smaller
  // than the one beneath it so it sits clear of the handrail.
  const crateMat = woodMaterial({ repeat: [1, 1], light: 0x8a6a40, dark: 0x4c3620 })
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.7, metalness: 0.3 })
  const lower = []
  const upper = []
  for (let z = -half + 2; z <= half - 2; z += 2.2) {
    lower.push([-(WALL_X - 0.45), z], [WALL_X - 0.45, z])
    if ((z | 0) % 2 === 0) upper.push([-(WALL_X - 0.55), z])
  }
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat, lower.length),
    lower.length, (d, i) => {
      d.position.set(lower[i][0], 0.4, lower[i][1])
      d.rotation.set(0, skew(i + 5) * 0.12, 0)
    }))
  const bands = lower.length * 2
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.82, 0.06, 0.82), bandMat, bands),
    bands, (d, i) => {
      const [x, z] = lower[i >> 1]
      d.position.set(x, i % 2 ? 0.68 : 0.12, z)
      d.rotation.set(0, skew((i >> 1) + 5) * 0.12, 0)
    }))
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), crateMat, upper.length),
    upper.length, (d, i) => {
      d.position.set(upper[i][0], 1.1, upper[i][1])
      d.rotation.set(0, skew(i + 9) * 0.3, 0)
    }))

  // Framed landscapes above the crates, alternating walls, each facing a
  // sconce on the opposite wall.
  const darkWood = woodMaterial({ repeat: [1, 1], light: 0x4a2c16, dark: 0x24140a })
  const canvasMat = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: 0.35 })
  const glassMat = lampGlassMaterial()
  let k = 0
  for (let z = -half + 3.1; z <= half - 3; z += 2.2, k++) {
    const s = k % 2 ? 1 : -1
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 1.05), darkWood)
    frame.position.set(s * (WALL_X - 0.05), 2.15, z)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.95), shared.brass)
    trim.position.set(s * (WALL_X - 0.08), 2.15, z)
    const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.87), canvasMat)
    canvas.position.set(s * (WALL_X - 0.11), 2.15, z)
    g.add(frame, trim, canvas)
    addSconce(g, -s, z, shared, glassMat, 1.9)
  }

  addHandrail(g, half, shared)
  addLanterns(g, half, shared, fx, glassMat, 4.5)
}

function dressCargo(g, half, shared, damaged, fx) {
  if (!damaged) {
    dressVintageCargo(g, half, shared, fx)
    return
  }
  dressDamagedCargoLuxury(g, half, shared, fx)
}
// Level 2 Mechanical: the rewind car. A burgundy runner, curtained windows
// with trunks beneath, a brass handrail, sconces between the windows and
// hanging lanterns. Its machinery is interactive, so moving-heist.js builds it.
function dressVintageMechanical(g, half, shared, fx) {
  addVintageFitOut(g, half, shared, { runnerBase: 0x5a1620, runnerAccent: 0xa07a3a, curtains: true })
  addHandrail(g, half, shared)
  const glassMat = lampGlassMaterial()
  addLanterns(g, half, shared, fx, glassMat, 4.5)
  const bays = windowBayZs(half)
  bays.slice(1).forEach((z, i) => {
    const mid = (z + bays[i]) / 2
    addSconce(g, i % 2 ? 1 : -1, mid, shared, glassMat)
  })
}

// Brass valve wheel on a wall-mounted flange, face turned to the aisle.
function addValveWheel(g, s, z, shared, y = 1.45) {
  const mount = new THREE.Group()
  mount.position.set(s * (WALL_X - 0.1), y, z)
  mount.rotation.y = -s * Math.PI / 2
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 18), shared.darkSteel)
  flange.rotation.x = Math.PI / 2
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 28), shared.brass)
  rim.position.z = 0.12
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), shared.brass)
  hub.rotation.x = Math.PI / 2
  hub.position.z = 0.12
  mount.add(flange, rim, hub)
  for (let k = 0; k < 3; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.66, 0.03), shared.brass)
    spoke.position.z = 0.12
    spoke.rotation.z = k * Math.PI / 3
    mount.add(spoke)
  }
  noCam(mount)
  g.add(mount)
}

// Level 2 Convergence, the last car before the Chrono Core: the same fit-out
// as Mechanical, dressed heavier with engine-room brass — valve wheels
// between the windows and steam pipes run along the ceiling line.
function dressVintageConvergence(g, half, shared, fx) {
  addVintageFitOut(g, half, shared, { runnerBase: 0x5a1620, runnerAccent: 0xa07a3a, curtains: true })
  addHandrail(g, half, shared)
  const glassMat = lampGlassMaterial()
  addLanterns(g, half, shared, fx, glassMat, 4.5)
  const bays = windowBayZs(half)
  bays.slice(1).forEach((z, i) => {
    const mid = (z + bays[i]) / 2
    if (i % 3 === 1) addValveWheel(g, i % 2 ? 1 : -1, mid, shared)
    else addSconce(g, i % 2 ? 1 : -1, mid, shared, glassMat)
  })
  const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, half * 2 - 1, 10)
  pipeGeo.rotateX(Math.PI / 2)
  for (const s of [-1, 1]) {
    for (const y of [2.95, 3.12]) {
      const pipe = new THREE.Mesh(pipeGeo, shared.brass)
      pipe.position.set(s * (WALL_X - 0.12), y, 0)
      noCam(pipe)
      g.add(pipe)
    }
  }
  return addRoofAccess(g, CONV_HATCH_Z, shared)
}

function dressMechanical(g, half, shared, damaged, fx) {
  // L3 damaged Mechanical is the luggage-storm luxury carriage (Room 3).
  if (damaged) return dressDamagedMechanicalLuxury(g, half, shared, fx)

  const pipeMat = metalMaterial({
    repeat: [1, 4], base: 0x707781, roughness: 0.45, metalness: 0.85
  })
  const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, half * 2 - 1.2, 10)
  pipeGeo.rotateX(Math.PI / 2)
  for (const s of [-1, 1]) {
    for (const y of [0.5, 0.95, 2.05]) {
      const pipe = new THREE.Mesh(pipeGeo, pipeMat)
      pipe.position.set(s * (WALL_X - 0.14), y, 0)
      g.add(pipe)
    }
  }

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.09, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.9, roughness: 0.3 })
  )
  wheel.position.set(-(WALL_X - 0.16), 1.3, -half + 3)
  g.add(wheel)
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), shared.rivet)
    spoke.position.copy(wheel.position)
    spoke.rotation.x = k * Math.PI / 4
    g.add(spoke)
  }

  const boilerLight = new THREE.PointLight(0xff7a3c, 18, 12, 2)
  boilerLight.position.set(0, 1.4, half - 4)
  addLight(g, fx, boilerLight, damaged)

  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0x2a1508, emissive: 0xff5a1e, emissiveIntensity: 2.6, roughness: 0.7
    })
  )
  grate.position.set(0, 0.6, half - 0.3)
  g.add(grate)

  const ceil = new THREE.PointLight(0xffb066, 12, 10, 2)
  ceil.position.set(0, CARRIAGE_CEILING_Y - 0.3, -half * 0.4)
  addLight(g, fx, ceil, damaged)

  return addRoofAccess(g, half - 2.5, shared)
}

// L3 Room 3 shell: teal wood, burgundy benches, amber fill. Moving luggage trunks
// are built in timewreck.js on the existing piston heads (motion/collision unchanged).
function dressDamagedMechanicalLuxury(g, half, shared, fx) {
  addBlownViewports(g, half, 'mechanical', shared)

  addLuxuryCeilingRun(g, half, shared, 'mechanical-ceiling-strip')

  addMechanicalReference(g, { wallX: WALL_X, brass: shared.brass, darkSteel: shared.darkSteel })

  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 3), shared.brass)
    rail.name = 'mechanical-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 2), shared.brass)
    edge.name = 'mechanical-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
  }

  // Luxury benches — clear of the centre piston sweep. Decorative.
  addLuxuryWallBenches(g, {
    namePrefix: 'mechanical-bench',
    zs: [-half + 3.5, half - 4.5],
    wallX: WALL_X,
    wreckChance: 0.34
  })

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffdeb0, emissive: 0xffc27a, emissiveIntensity: 0.95, roughness: 0.48
  })
  for (const z of [-half + 5, half - 5]) {
    for (const s of [-1, 1]) {
      // Rectangular lantern glass recalls L2's practical fixtures. Replaces
      // cylinder shades, retaining four fixtures with fewer static triangles.
      const shade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.16), glassMat)
      shade.name = 'mechanical-sconce'
      shade.position.set(s * (WALL_X - 0.35), 2.05, z)
      noCam(shade)
      g.add(shade)
    }
  }

  // Warm practicals — cool storm accent is added in timewreck.js (same budget).
  const boilerLight = new THREE.PointLight(0xffb070, 10.5, 9, 2)
  boilerLight.position.set(0, 1.6, half - 4)
  addLight(g, fx, boilerLight, true)
  const ceil = new THREE.PointLight(0xffc090, 8.2, 9, 2)
  ceil.position.set(0, CARRIAGE_CEILING_Y - 0.3, -half * 0.35)
  addLight(g, fx, ceil, true)

  return addRoofAccess(g, half - 2.5, shared)
}

// Warm amber fill for the Timewreck Convergence car (existing 4-light budget).
// Registered through addLight so they pick up that car's flicker only.
// Phase-1: slightly warmer practicals so cyan surge arcs read as cool contrast.
function addConvergenceFlickerLights(g, half, fx) {
  const spots = [-half + 5, -half * 0.35, half * 0.15, half - 3.2]
  for (const z of spots) {
    const light = new THREE.PointLight(0xffb888, 5.6, 7.2, 2)
    light.position.set(0, 2.15, z)
    addLight(g, fx, light, true)
  }
}

// L3 Room 2: shattered luxury Convergence — wood platforms look, burgundy
// benches, cyan fracture accents, storm openings. Ladder preserved; no new lights.
function dressDamagedConvergence(g, half, shared, fx) {
  addBlownViewports(g, half, 'convergence', shared)

  addLuxuryCeilingRun(g, half, shared, 'convergence-ceiling-strip')

  // Violet accent band — temporal rupture cue (emissive mesh, not a PointLight).
  const rupture = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, half * 1.1),
    new THREE.MeshStandardMaterial({
      color: 0x2a1848, emissive: 0x7c3aed, emissiveIntensity: 1.2, roughness: 0.4
    })
  )
  rupture.name = 'convergence-rupture-strip'
  rupture.position.set(0, CARRIAGE_CEILING_Y - 0.05, half * 0.15)
  g.add(rupture)

  // Brass rails + floor edging.
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 3), shared.brass)
    rail.name = 'convergence-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 2), shared.brass)
    edge.name = 'convergence-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
  }

  // "Broken platform" deck plates on the existing floor — same walkable surface.
  const plankWood = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x8a6440, dark: 0x3a2414, roughness: 0.48, seed: 83
  }), 0xf0dcc4)
  const cyanEdge = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.85, roughness: 0.35
  })
  const deckZs = []
  for (let z = -half + 3.5; z <= half - 3.5; z += 3.6) deckZs.push(z)
  const deckN = deckZs.length
  const decks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 0.04, 1.15), plankWood, deckN)
  decks.name = 'convergence-platform-decks'
  const edges = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.025, 0.06), cyanEdge, deckN * 2)
  edges.name = 'convergence-platform-cyan-edges'
  const dummy = new THREE.Object3D()
  deckZs.forEach((z, i) => {
    dummy.position.set(0, 0.03, z)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    decks.setMatrixAt(i, dummy.matrix)
    dummy.position.set(0, 0.04, z - 0.56)
    dummy.updateMatrix()
    edges.setMatrixAt(i * 2, dummy.matrix)
    dummy.position.set(0, 0.04, z + 0.56)
    dummy.updateMatrix()
    edges.setMatrixAt(i * 2 + 1, dummy.matrix)
  })
  decks.instanceMatrix.needsUpdate = true
  edges.instanceMatrix.needsUpdate = true
  noCam(decks)
  noCam(edges)
  g.add(decks, edges)

  // Luxury benches along walls — aisle clear for surges / player. Decorative.
  addLuxuryWallBenches(g, {
    namePrefix: 'convergence-bench',
    zs: [-half + 4.5, -half * 0.2, half * 0.35, half - 6],
    wallX: WALL_X,
    wreckChance: 0.28
  })

  // Static floating debris planks outside the hull — storm rupture read, not walkable.
  const floatN = 8
  const floatPlank = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.08, 1.05), plankWood, floatN)
  const floatCyan = new THREE.InstancedMesh(new THREE.BoxGeometry(0.74, 0.03, 0.05), cyanEdge, floatN * 2)
  floatPlank.name = 'convergence-float-debris'
  for (let i = 0; i < floatN; i++) {
    const s = i % 2 ? 1 : -1
    const z = -half + 4 + i * 4.2
    dummy.position.set(s * (WALL_X + 0.85), 0.35 + (i % 3) * 0.35, z)
    dummy.rotation.set(0.05 * s, 0.2 * s, s * 0.12)
    dummy.updateMatrix()
    floatPlank.setMatrixAt(i, dummy.matrix)
    dummy.position.y += 0.05
    dummy.position.z -= 0.5
    dummy.updateMatrix()
    floatCyan.setMatrixAt(i * 2, dummy.matrix)
    dummy.position.z += 1.0
    dummy.updateMatrix()
    floatCyan.setMatrixAt(i * 2 + 1, dummy.matrix)
  }
  floatPlank.instanceMatrix.needsUpdate = true
  floatCyan.instanceMatrix.needsUpdate = true
  noCam(floatPlank)
  noCam(floatCyan)
  g.add(floatPlank, floatCyan)

  // Vintage lamp shades (emissive geometry only — fill comes from existing pool lights).
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.35, roughness: 0.35
  })
  for (const z of [-half + 6, 0, half - 5]) {
    for (const s of [-1, 1]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), glassMat)
      shade.name = 'convergence-sconce'
      shade.position.set(s * (WALL_X - 0.35), 2.05, z)
      noCam(shade)
      g.add(shade)
    }
  }

  // Keep roof ladder / hatch — required climb set piece.
  return addRoofAccess(g, half - 2.5, shared)
}

// Roof hatch (a sliding cover in the ceiling) and the ladder up to it.
function addRoofAccess(g, hatchZ, shared) {
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.06, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x2c2f36, metalness: 0.8, roughness: 0.4 })
  )
  rim.position.set(0, CARRIAGE_CEILING_Y - 0.03, hatchZ)
  g.add(rim)
  const hatchCover = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.08, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.85, roughness: 0.35 })
  )
  hatchCover.position.set(0, CARRIAGE_CEILING_Y + 0.02, hatchZ)
  hatchCover.userData.noCameraCollision = true
  g.add(hatchCover)

  const ladder = new THREE.Group()
  ladder.name = 'roof-ladder'
  const railGeo = new THREE.CylinderGeometry(0.03, 0.03, CARRIAGE_CEILING_Y, 8)
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railGeo, shared.steel)
    r.position.set(s * 0.22, CARRIAGE_CEILING_Y / 2, 0)
    ladder.add(r)
  }
  for (let y = 0.35; y < CARRIAGE_CEILING_Y; y += 0.4) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), shared.steel)
    rung.rotation.z = Math.PI / 2
    rung.position.set(0, y, 0)
    ladder.add(rung)
  }
  ladder.position.set(0.0, 0, hatchZ - 0.55)
  g.add(ladder)

  return { hatchCover, hatchRim: rim, ladder }
}

// Arched ceiling: a flattened half-barrel from the picture rail up to the
// ceiling line, with gold ribs every two metres and a gold cove each side.
function addArchedCeiling(g, half, color, gold) {
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, half * 2, 32, 1, true, -Math.PI / 2, Math.PI),
    plasterMaterial({ repeat: [4, Math.round(half / 2)], base: color, roughness: 0.8 })
  )
  arch.material.side = THREE.BackSide
  // Barrel axis along Z, crown up. Scale is in the barrel's own frame.
  arch.rotation.x = -Math.PI / 2
  arch.scale.set(WALL_X, 1, 0.62)
  arch.position.y = 2.86
  noCam(arch)
  g.add(arch)
  for (let z = -half + 1; z <= half - 1; z += 2) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 32, Math.PI), gold)
    rib.scale.set(WALL_X - 0.02, 0.6, 1)
    rib.position.set(0, 2.86, z)
    noCam(rib)
    g.add(rib)
  }
  for (const s of [-1, 1]) {
    const cove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, half * 2), gold)
    cove.position.set(s * (WALL_X - 0.06), 2.86, 0)
    g.add(cove)
  }
}

// Level 2 Vault: the Chrono Core's reading room. Wood panelling, curtained
// windows, framed blueprints and sconces under a cream arched ceiling with
// gold ribs; a navy runner with a compass rose leads to a two-tier dais in
// front of a navy wall with the vault door and two hourglass banners.
function dressVintageVault(g, half, shared, fx) {
  addVintageFitOut(g, half, shared, { runnerBase: 0x1c2640, runnerAccent: 0xb08d3f, curtains: true })
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a44e, roughness: 0.3, metalness: 0.9 })
  const navy = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.8, metalness: 0.05 })
  const darkWood = woodMaterial({ repeat: [1, 1], light: 0x4a2c16, dark: 0x24140a })
  const glassMat = lampGlassMaterial()
  const coreZ = half - VAULT_CORE_FROM_END

  addArchedCeiling(g, half, 0xe0d2b0, gold)
  // Brass-framed ceiling hatch the player drops through.
  const hatchFrame = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 4), gold)
  hatchFrame.rotation.set(Math.PI / 2, 0, Math.PI / 4)
  hatchFrame.position.set(0, 3.47, -half + 3.2)
  g.add(hatchFrame)

  addLanterns(g, half, shared, fx, glassMat, 5)

  // Between the windows: sconces and framed blueprints.
  const bays = windowBayZs(half)
  const mids = bays.slice(1).map((z, i) => (z + bays[i]) / 2)
  const paper = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 })
  const ink = new THREE.MeshStandardMaterial({ color: 0x3d2a18, roughness: 0.9 })
  mids.forEach((z, i) => {
    for (const s of [-1, 1]) {
      if (i % 2 === 0) {
        addSconce(g, s, z, shared, glassMat)
        continue
      }
      const x = s * WALL_X
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.8), darkWood)
      frame.position.set(x - s * 0.04, 1.9, z)
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 0.66), gold)
      mat.position.set(x - s * 0.07, 1.9, z)
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.72, 0.58), paper)
      sheet.position.set(x - s * 0.085, 1.9, z)
      g.add(frame, mat, sheet)
      // A locomotive in profile: boiler, cab, chimney and wheels.
      for (const [h, w, y, dz] of [
        [0.14, 0.34, 1.86, 0.05], [0.2, 0.12, 1.9, -0.17], [0.1, 0.04, 2.0, 0.17],
        [0.01, 0.46, 1.73, 0], [0.24, 0.005, 1.96, 0.08], [0.24, 0.005, 1.96, -0.1]
      ]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.005, h, w), ink)
        line.position.set(x - s * 0.092, y, z + dz)
        g.add(line)
      }
      for (const dz of [-0.14, 0, 0.14]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 12), ink)
        wheel.rotation.y = Math.PI / 2
        wheel.position.set(x - s * 0.092, 1.7, z + dz)
        g.add(wheel)
      }
    }
  })

  // Compass rose on the runner.
  const roseZ = -1.5
  for (const [r0, r1] of [[0.74, 0.8], [0.48, 0.51]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), gold)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(0, 0.012, roseZ)
    g.add(ring)
  }
  const star = new THREE.Shape()
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2
    const r = k % 2 === 0 ? 0.72 : 0.12
    const x = Math.sin(a) * r
    const y = Math.cos(a) * r
    if (k === 0) star.moveTo(x, y)
    else star.lineTo(x, y)
  }
  star.closePath()
  for (const turn of [0, Math.PI / 4]) {
    const rose = new THREE.Mesh(new THREE.ShapeGeometry(star), gold)
    rose.rotation.set(-Math.PI / 2, 0, turn)
    rose.scale.setScalar(turn ? 0.6 : 1)
    rose.position.set(0, turn ? 0.015 : 0.013, roseZ)
    g.add(rose)
  }

  // A brass armillary globe on one trunk, books on another, and potted palms.
  const globe = new THREE.Group()
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.22, 10), gold)
  stand.position.y = 0.11
  globe.add(stand)
  for (const [rx, rz] of [[Math.PI / 2, 0], [Math.PI / 2, Math.PI / 3], [0.4, 0]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 28), gold)
    ring.rotation.set(rx, 0, rz)
    ring.position.y = 0.44
    globe.add(ring)
  }
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2c4a6e, roughness: 0.5, metalness: 0.3 })
  )
  sphere.position.y = 0.44
  globe.add(sphere)
  globe.position.set(-(WALL_X - 0.45), 0.55, bays[1])
  g.add(globe)
  ;[[0x6b1f1f, 0.05], [0x1f3b5b, 0.1], [0x5b4a1f, 0.15]].forEach(([colour, y], k) => {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.05, 0.24),
      new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 })
    )
    book.position.set(WALL_X - 0.45, 0.55 + y - 0.02, bays[2] + (k - 1) * 0.02)
    book.rotation.y = k * 0.2
    g.add(book)
  })
  const potMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.6, metalness: 0.3 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.8 })
  for (const [x, z] of [[-(WALL_X - 0.5), mids[mids.length - 1]], [WALL_X - 0.5, mids[mids.length - 1]]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12), potMat)
    pot.position.set(x, 0.2, z)
    g.add(pot)
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 5), leafMat)
      const a = k / 6 * Math.PI * 2
      leaf.position.set(x + Math.sin(a) * 0.1, 0.62, z + Math.cos(a) * 0.1)
      leaf.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5)
      g.add(leaf)
    }
  }

  // Forward wall: navy panelling, the brass-framed vault door and banners.
  const wallZ = half - 0.1
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, CARRIAGE_CEILING_Y, 0.06), navy)
  backWall.position.set(0, CARRIAGE_CEILING_Y / 2, wallZ)
  g.add(backWall)
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x142038, roughness: 0.6, metalness: 0.2 })
  )
  door.position.set(0, 1.3, wallZ - 0.05)
  g.add(door)
  for (const [w, h, x, y] of [[0.05, 2.6, -0.7, 1.3], [0.05, 2.6, 0.7, 1.3], [1.45, 0.05, 0, 2.6]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), gold)
    bar.position.set(x, y, wallZ - 0.08)
    g.add(bar)
  }
  const doorCrest = makeHourglassEmblem(gold, 0.36)
  doorCrest.position.set(0, 2.25, wallZ - 0.09)
  doorCrest.rotation.y = Math.PI
  g.add(doorCrest)
  for (const s of [-1, 1]) {
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.7, 0.02), navy)
    banner.position.set(s * 1.4, 1.85, wallZ - 0.06)
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), gold)
    rod.rotation.z = Math.PI / 2
    rod.position.set(s * 1.4, 2.72, wallZ - 0.08)
    const hem = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.03), gold)
    hem.position.set(s * 1.4, 1.02, wallZ - 0.08)
    const crest = makeHourglassEmblem(gold, 0.5)
    crest.position.set(s * 1.4, 1.95, wallZ - 0.08)
    crest.rotation.y = Math.PI
    g.add(banner, rod, hem, crest)
    for (const x of [s * 0.85, s * 1.98]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.06, CARRIAGE_CEILING_Y - 0.6, 0.05), gold)
      pilaster.position.set(x, (CARRIAGE_CEILING_Y - 0.6) / 2, wallZ - 0.07)
      g.add(pilaster)
    }
  }

  // Two-tier dais with a glowing blue pool; the Core stands at its centre.
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.4, 0.12, 40), darkWood)
  tier1.position.set(0, 0.06, coreZ)
  const rim1 = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.03, 6, 48), gold)
  rim1.rotation.x = Math.PI / 2
  rim1.position.set(0, 0.12, coreZ)
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.08, 0.1, 40), navy)
  tier2.position.set(0, 0.17, coreZ)
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.03, 6, 48), gold)
  rim2.rotation.x = Math.PI / 2
  rim2.position.set(0, VAULT_DAIS_TOP, coreZ)
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 40),
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, emissive: 0x2f7bff, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.85
    })
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.set(0, VAULT_DAIS_TOP + 0.004, coreZ)
  g.add(tier1, rim1, tier2, rim2, pool)
  const poolLight = new THREE.PointLight(0x5aa0ff, 6, 4, 2)
  poolLight.position.set(0, 0.8, coreZ)
  g.add(poolLight)
}

function dressVault(g, half, shared, damaged, fx) {
  // Heavy circular blast door on the forward bulkhead — sealed in Level 2, so
  // the roof is the way in.
  const door = new THREE.Group()
  door.name = 'vault-door'
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.24, 32),
    new THREE.MeshStandardMaterial({ color: damaged ? 0x1f2228 : 0x2b2e35, metalness: 0.92, roughness: 0.3 })
  )
  disc.rotation.x = Math.PI / 2
  door.add(disc)
  const hubWheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 24), shared.brass)
  hubWheel.position.z = 0.14
  door.add(hubWheel)
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.06), shared.brass)
    spoke.position.z = 0.14
    spoke.rotation.z = k * Math.PI / 4
    door.add(spoke)
  }
  // Aged-brass door rim (visual only — door transform/collision unchanged).
  if (damaged) {
    for (const [w, h, x, y] of [
      [0.08, 2.3, -1.1, 0], [0.08, 2.3, 1.1, 0], [2.28, 0.08, 0, 1.15], [2.28, 0.08, 0, -1.15]
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), shared.brass)
      bar.name = 'vault-door-brass-frame'
      bar.position.set(x, y, -0.02)
      noCam(bar)
      door.add(bar)
    }
  }
  door.position.set(0, 1.2, half - 0.16)
  g.add(door)

  if (damaged) {
    // Warm amber aisle fill (retune of existing strip + PointLight — no new lights).
    addLuxuryCeilingRun(g, half, shared, 'vault-ceiling-strip')
    // Short violet accent over the temporal fracture end (same mesh budget).
    const ruptureStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.04, 2.4),
      new THREE.MeshStandardMaterial({
        color: 0x2a1848,
        emissive: 0x7c3aed,
        emissiveIntensity: 1.35
      })
    )
    ruptureStrip.name = 'vault-rupture-strip'
    ruptureStrip.position.set(0, CARRIAGE_CEILING_Y - 0.05, half - 2.2)
    g.add(ruptureStrip)
    rememberVaultMat(fx, ruptureStrip.material)
    const l = new THREE.PointLight(0xffc090, 9, 8, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, 0)
    addLight(g, fx, l, damaged)

    addBlownViewports(g, half, 'vault', shared)

    // Brass wall rails + floor edging — low poly, noCam, aisle clear.
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.04, half * 2 - 2.4),
        shared.brass
      )
      rail.name = 'vault-wall-rail'
      rail.position.set(s * (WALL_X - 0.2), 0.68, 0)
      noCam(rail)
      g.add(rail)
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.02, half * 2 - 1.8),
        shared.brass
      )
      edge.name = 'vault-floor-edge'
      edge.position.set(s * (WALL_X - 0.22), 0.012, 0)
      noCam(edge)
      g.add(edge)
    }

    addVaultLuxuryBenches(g, half, shared)
    dressDamagedVault(g, half, shared, fx)
  } else {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.05, half * 2 - 2),
      new THREE.MeshStandardMaterial({
        color: 0xbfe0ff,
        emissive: 0x5ab6ff,
        emissiveIntensity: 1.6
      })
    )
    strip.position.y = CARRIAGE_CEILING_Y - 0.06
    g.add(strip)
    const l = new THREE.PointLight(0x7cc4ff, 16, 12, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, 0)
    addLight(g, fx, l, damaged)
  }

  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.06, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2c2f36, metalness: 0.8, roughness: 0.4 })
  )
  hatch.position.set(0, CARRIAGE_CEILING_Y - 0.03, -half + 2.5)
  hatch.userData.noCameraCollision = true
  g.add(hatch)

  return { door }
}

// --- Locomotive cab (Level 3's escape target) ------------------------------

// Room 8 luxury wreck dressing — decorative only. Keeps the centre aisle clear
// for the brake approach; floating storm props sit outside WALL_X.
function dressDamagedCabLuxury(g, half, shared, fx) {
  const sites = damageSites(half)

  // Soft violet storm veils outside the hull.
  const veilMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a30, emissive: 0x7c3aed, emissiveIntensity: 1.15,
    roughness: 1, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide
  })
  for (const s of [-1, 1]) {
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(half * 2.2, CARRIAGE_CEILING_Y * 1.25), veilMat)
    veil.name = 'cab-storm-veil'
    veil.position.set(s * (WALL_X + 1.55), CARRIAGE_CEILING_Y * 0.48, 0)
    veil.rotation.y = s * Math.PI / 2
    noCam(veil)
    g.add(veil)
  }

  // Cyan temporal glow along broken floor / wall edges (not walkable geometry).
  const cyanEdge = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.8, roughness: 0.35
  })
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, half * 2 - 1.2), shared.brass)
    rail.name = 'cab-wall-rail'
    rail.position.set(s * (WALL_X - 0.22), 0.68, 0)
    noCam(rail)
    g.add(rail)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, half * 2 - 0.8), shared.brass)
    edge.name = 'cab-floor-edge'
    edge.position.set(s * (WALL_X - 0.24), 0.012, 0)
    noCam(edge)
    g.add(edge)
    const cyan = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, half * 2 - 1.0), cyanEdge)
    cyan.name = 'cab-floor-cyan'
    cyan.position.set(s * (WALL_X - 0.32), 0.02, 0)
    noCam(cyan)
    g.add(cyan)
  }

  // Warm amber sconces framing the blown openings.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.4, roughness: 0.35
  })
  for (const s of [-1, 1]) {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), glassMat)
    shade.name = 'cab-sconce'
    shade.position.set(s * (WALL_X - 0.35), 2.05, 0.6)
    noCam(shade)
    g.add(shade)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.18), shared.brass)
    arm.position.set(s * (WALL_X - 0.28), 2.05, 0.6)
    noCam(arm)
    g.add(arm)
  }

  // Red velvet curtain scraps at the viewport (visual only).
  const velvet = new THREE.MeshStandardMaterial({
    color: 0x7a2430, roughness: 0.92, metalness: 0, emissive: 0x1a0608, emissiveIntensity: 0.1
  })
  for (const s of [-1, 1]) {
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.28), velvet)
    drape.name = 'cab-curtain'
    drape.position.set(s * (WALL_X - 0.2), 1.55, 0.6 + s * 0.55)
    drape.rotation.z = s * 0.12
    noCam(drape)
    g.add(drape)
  }

  // Ceiling brass ribs + violet rupture accent (replaces flat red strip).
  g.add(scatterInstances(
    new THREE.InstancedMesh(new THREE.BoxGeometry(WALL_X * 1.55, 0.06, 0.09), shared.brass, 3),
    3,
    (d, i) => {
      d.position.set(0, CARRIAGE_CEILING_Y - 0.14, -half + 1.4 + i * 2.1)
      d.rotation.set(0, 0, (i - 1) * 0.03)
    }
  ))
  const rupture = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.05, half * 1.4),
    new THREE.MeshStandardMaterial({
      color: 0x2a1848, emissive: 0x7c3aed, emissiveIntensity: 1.25, roughness: 0.4
    })
  )
  rupture.name = 'cab-rupture-strip'
  rupture.position.set(0, CARRIAGE_CEILING_Y - 0.05, 0.2)
  g.add(rupture)

  // Static cyan “lightning” shards around openings (emissive boxes, no particles).
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 1.35, roughness: 0.3
  })
  const bolts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.55, 0.04), boltMat, 6)
  bolts.name = 'cab-chrono-bolts'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1
    dummy.position.set(s * (WALL_X + 0.55), 1.1 + (i % 3) * 0.35, -0.4 + (i % 3) * 0.7)
    dummy.rotation.set(0.4 * s, 0.2, s * (0.55 + (i % 3) * 0.2))
    dummy.updateMatrix()
    bolts.setMatrixAt(i, dummy.matrix)
  }
  bolts.instanceMatrix.needsUpdate = true
  noCam(bolts)
  g.add(bolts)

  // Floating luggage / panels / clock in the exterior void — outside the aisle.
  const luggageMat = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x6a4a2c, dark: 0x2e1a10, roughness: 0.65, seed: 157
  }), 0xe0c8a8)
  g.add(scatterInstances(
    new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.22, 0.55), luggageMat, 4),
    4,
    (d, i) => {
      const s = i % 2 ? 1 : -1
      d.position.set(s * (WALL_X + 1.35), 0.7 + (i % 2) * 0.55, -half * 0.2 + i * 1.1)
      d.rotation.set(0.12 * s, 0.4 * s, s * 0.25)
    }
  ))
  const panelWood = liftAlbedo(woodMaterial({
    repeat: [1, 1], light: 0x4a6a62, dark: 0x1a2e2a, roughness: 0.55, seed: 159
  }), 0xc8ddd6)
  g.add(scatterInstances(
    new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.95, 1.05), panelWood, 3),
    3,
    (d, i) => {
      const s = i % 2 ? 1 : -1
      d.position.set(s * (WALL_X + 1.85), 1.0 + i * 0.25, -1.2 + i * 1.4)
      d.rotation.set(0.1 * s, 0.5 * s, s * 0.4)
    }
  ))
  addCargoAntiqueClock(g, -(WALL_X + 1.65), 1.35, half * 0.15, -1, shared.brass)
  addCargoAntiqueClock(g, WALL_X + 1.7, 0.95, -half * 0.35, 1, shared.brass)

  // Wall-hugging seat scraps (keep |x| high).
  const seatFrag = new THREE.MeshStandardMaterial({
    color: 0x7a2430, roughness: 0.9, metalness: 0.02, emissive: 0x1a0608, emissiveIntensity: 0.08
  })
  g.add(scatterInstances(
    new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.1, 0.36), seatFrag, sites.length * 2),
    sites.length * 2,
    (d, i) => {
      const c = sites[i >> 1]
      const s = i % 2 ? 1 : -1
      d.position.set(s * 1.15, 0.12, c.z + (i % 2 ? 0.35 : -0.35))
      d.rotation.set(0.05, 0.1 * s, s * 0.1)
    }
  ))

  // Cab identity: violet storm fill vs warm firebox/brake (one light, pool-capped).
  const stormFill = new THREE.PointLight(0x8b5cf6, 5.6, 7, 2)
  stormFill.position.set(0, 1.6, half * 0.35)
  addLight(g, fx, stormFill, false)
}

function buildLocomotiveCab(shared, fx) {
  // The front bulkhead is sealed — this is the head of the train.
  const { group, half } = buildShell('cab', CAB_LENGTH, shared, true, { min: true })
  group.name = 'locomotive-cab'

  // Backhead: same footprint as carriage-bounds `backhead` collider.
  const backheadWood = liftAlbedo(woodMaterial({
    repeat: [2, 1], light: 0x4a6e66, dark: 0x1e342e, roughness: 0.5, seed: 161
  }), 0xc8e0d8)
  const backhead = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 0.35),
    backheadWood
  )
  backhead.name = 'cab-backhead'
  backhead.position.set(0, 0.9, -half + 0.5)
  backhead.castShadow = true
  group.add(backhead)
  // Brass framing / rivet plate over the backhead (visual only).
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.35, 0.04), shared.brass)
  backPlate.position.set(0, 0.9, -half + 0.68)
  group.add(backPlate)
  for (const [x, y] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, 0.4], [0.95, 0.4]]) {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), shared.brass)
    rivet.position.set(x, y, -half + 0.72)
    group.add(rivet)
  }

  // Pressure gauges — small emissive dials across the backhead.
  const dialFace = new THREE.MeshStandardMaterial({
    color: 0xf2ead6, emissive: 0xffcf8a, emissiveIntensity: 1.55, roughness: 0.5
  })
  for (const [x, y] of [[-0.62, 1.32], [0, 1.4], [0.62, 1.32], [-0.35, 0.95], [0.35, 0.95]]) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), dialFace)
    dial.rotation.x = Math.PI / 2
    dial.position.set(x, y, -half + 0.74)
    group.add(dial)
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 16), shared.brass)
    bezel.position.set(x, y, -half + 0.76)
    group.add(bezel)
  }

  // Firebox: same collider footprint — restyled as a warm brass grate (not a flat orange slab).
  const firebox = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x2a2218, emissive: 0xff8a3c, emissiveIntensity: 1.65, roughness: 0.55, metalness: 0.45
    })
  )
  firebox.name = 'cab-firebox'
  firebox.position.set(0, 0.42, -half + 0.72)
  group.add(firebox)
  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.48, 0.03),
    shared.brass
  )
  grate.position.set(0, 0.42, -half + 0.8)
  group.add(grate)
  const fireLight = new THREE.PointLight(0xffb060, 11, 6.5, 2)
  fireLight.position.set(0, 0.6, -half + 1.1)
  addLight(group, fx, fireLight, true)

  // Regulator and reverser levers (brass / steel — wall-side of aisle).
  for (const [x, tilt] of [[-0.75, -0.5], [0.75, 0.35]]) {
    const lever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.8, 10),
      shared.brass
    )
    lever.position.set(x, 1.15, -half + 1.05)
    lever.rotation.x = tilt
    lever.castShadow = true
    group.add(lever)
  }

  // Blown side openings onto the temporal storm.
  addBlownViewports(group, half, 'cab', shared)

  dressDamagedCabLuxury(group, half, shared, fx)
  addWreckage(group, half, shared, fx, 'cab')
  return { group, half }
}

// --- Roof catwalk (Level 2 only) -------------------------------------------

// Open freight wagon: a dark wooden body with loose cargo inside, seen only
// through the openings in the rooftop deck above it.
function dressFreightWagon(g, half, shared) {
  const crateMat = woodMaterial({ repeat: [1, 1], light: 0x6a4a2c, dark: 0x33210f })
  const spots = []
  for (let z = -half + 1.5; z <= half - 1.5; z += 2.4) {
    spots.push([-(WALL_X - 0.6), z, 0], [WALL_X - 0.6, z + 1.2, 1])
  }
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), crateMat, spots.length),
    spots.length, (d, i) => {
      d.position.set(spots[i][0], 0.5, spots[i][1])
      d.rotation.set(0, skew(i + 2) * 0.3, 0)
    }))
  // The deck rests on heavy side beams along the top of the wagon walls.
  for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, ROOF_Y - CARRIAGE_CEILING_Y, half * 2), shared.darkSteel)
    beam.position.set(s * (WALL_X - 0.05), (ROOF_Y + CARRIAGE_CEILING_Y) / 2 - 0.06, 0)
    g.add(beam)
  }
}

// Level 2 roof. The long roof covers Passenger to Convergence; the rooftop
// run starts over the tail of Convergence, crosses the open freight wagon on
// wooden decking — with gaps, openings and lanterns on posts — and finishes
// on the rear of the Vault roof at the drop hatch.
function buildRoof(spans, shared, fx) {
  const group = new THREE.Group()
  group.name = 'carriage-roof'
  const deckW = WALL_X * 2 + 0.3
  const roofMat = metalMaterial({ repeat: [3, 20], base: 0x3b4048, roughness: 0.6, metalness: 0.7 })
  const deckMat = woodMaterial({ repeat: [2, 6], light: 0x9a6c3e, dark: 0x5a3a1e })
  // One unlit HDR bulb finish for all roof lanterns, including decorations:
  // identical warm bloom even when no pooled point light is assigned nearby.
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(3) })

  function roofSlab(minZ, maxZ) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2 + 0.2, 0.2, maxZ - minZ), roofMat)
    slab.position.set(0, CARRIAGE_CEILING_Y + 0.45, (minZ + maxZ) / 2)
    slab.receiveShadow = true
    group.add(slab)
    for (const s of [-1, 1]) {
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, maxZ - minZ), shared.darkSteel)
      fascia.position.set(s * (WALL_X + 0.1), CARRIAGE_CEILING_Y + 0.25, (minZ + maxZ) / 2)
      group.add(fascia)
    }
  }

  // Wooden deck with an edge beam each side and cross battens.
  function deck(minZ, maxZ) {
    const len = maxZ - minZ
    const boards = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.12, len), deckMat)
    boards.position.set(0, ROOF_Y - 0.06, (minZ + maxZ) / 2)
    boards.receiveShadow = true
    group.add(boards)
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, len), shared.darkSteel)
      edge.position.set(s * (deckW / 2 - 0.08), ROOF_Y + 0.02, (minZ + maxZ) / 2)
      group.add(edge)
    }
    for (let z = minZ + 0.4; z < maxZ - 0.2; z += 1.1) {
      const batten = new THREE.Mesh(new THREE.BoxGeometry(deckW - 0.4, 0.02, 0.1), shared.rivet)
      batten.position.set(0, ROOF_Y + 0.005, z)
      group.add(batten)
    }
  }

  // Five sources alternate +X/-X along the roof; every bulb glows equally.
  const roofPointLanterns = new Set([0, 2, 5, 6, 9])
  let lanternCount = 0
  function lantern(s, z) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), shared.darkSteel)
    post.position.set(s * (deckW / 2 - 0.1), ROOF_Y + 0.45, z)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.06, 8), shared.brass)
    cap.position.set(post.position.x, ROOF_Y + 1.12, z)
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 8), glassMat)
    glass.position.set(post.position.x, ROOF_Y + 0.99, z)
    group.add(post, cap, glass)
    if (roofPointLanterns.has(lanternCount++)) {
      const l = new THREE.PointLight(0xffc27a, 9, 8, 2)
      l.position.set(post.position.x - s * 0.3, ROOF_Y + 1.0, z)
      addLight(group, fx, l, false)
    }
  }

  const F0 = spans.freight.minZ
  const V0 = spans.vault.minZ
  const zStart = spans.convergence.maxZ - 3.2
  const zEnd = V0 + ROOF_RUN.vaultDeck

  // Exterior-only rear roofs. Merge static parts by material, sharing the
  // existing roof finish, iron, brass and emissive glass without new lights.
  const unitBox = new THREE.BoxGeometry(1, 1, 1)
  const lampPost = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8)
  const lampCap = new THREE.CylinderGeometry(0.05, 0.12, 0.06, 8)
  const lampGlass = new THREE.CylinderGeometry(0.09, 0.08, 0.2, 8)
  const slabY = CARRIAGE_CEILING_Y + 0.45
  const slabTop = slabY + 0.1
  function addPart(parts, material, geometry, x, y, z, sx = 1, sy = 1, sz = 1) {
    if (!parts.has(material)) parts.set(material, [])
    parts.get(material).push(geometry.clone().scale(sx, sy, sz).translate(x, y, z))
  }
  function addBox(parts, material, w, h, d, x, y, z) {
    addPart(parts, material, unitBox, x, y, z, w, h, d)
  }
  function finishParts(parts, name, noCameraCollision = false, parent = group) {
    for (const [material, geometries] of parts) {
      const geometry = mergeGeometries(geometries, false)
      geometries.forEach((part) => part.dispose())
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = name
      mesh.receiveShadow = true
      mesh.userData.noCameraCollision = noCameraCollision
      parent.add(mesh)
    }
  }
  const rearKeys = ['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence']
  rearKeys.forEach((key, index) => {
    const span = spans[key]
    const minZ = span.minZ + (index === 0 ? 0 : 0.4)
    const maxZ = index === rearKeys.length - 1 ? zStart : span.maxZ - 0.4
    const centre = (minZ + maxZ) / 2
    const length = maxZ - minZ
    const parts = new Map()
    addBox(parts, roofMat, WALL_X * 2 + 0.2, 0.2, length, 0, slabY, centre)
    for (const side of [-1, 1]) {
      addBox(parts, shared.darkSteel, 0.12, 0.55, length, side * (WALL_X + 0.1), CARRIAGE_CEILING_Y + 0.25, centre)
    }
    for (let z = minZ + 1; z < maxZ - 0.5; z += 2) {
      addBox(parts, shared.rivet, WALL_X * 2 + 0.2, 0.04, 0.08, 0, slabTop + 0.02, z)
    }
    for (const fraction of [0.28, 0.72]) {
      const z = minZ + length * fraction
      addBox(parts, shared.darkSteel, 0.8, 0.24, 0.6, 0, slabTop + 0.12, z)
      for (let slat = 0; slat < 4; slat += 1) {
        addBox(parts, shared.rivet, 0.7, 0.03, 0.04, 0, slabTop + 0.255, z - 0.21 + slat * 0.14)
      }
      const x = fraction < 0.5 ? -2.35 : 2.35
      addPart(parts, shared.darkSteel, lampPost, x, slabTop + 0.45, z)
      addPart(parts, shared.brass, lampCap, x, slabTop + 1.12, z)
      addPart(parts, glassMat, lampGlass, x, slabTop + 0.99, z)
    }
    if (index < rearKeys.length - 1) {
      // Low dark bellows bridge the 0.8 m roof gap above the unchanged ceiling.
      const z = span.maxZ
      addBox(parts, shared.rivet, WALL_X * 2 - 0.2, 0.12, 0.8, 0, slabY - 0.13, z)
      for (let fold = 0; fold < 4; fold += 1) {
        addBox(parts, shared.rivet, WALL_X * 2 - 0.1, 0.04, 0.05, 0, slabY - 0.03, z - 0.3 + fold * 0.2)
      }
    }
    finishParts(parts, `rear-roof-${key}`)
  })

  // Behind the reachable bound (zStart + 0.5), clear of the ladder, hatch and
  // roof arrival at zStart + 0.8. Bounds already block walking and jumping.
  const barrier = new Map()
  for (const x of [-2.71, -1.35, 0, 1.35, 2.71]) {
    addBox(barrier, shared.darkSteel, 0.08, 1.25, 0.08, x, ROOF_Y + 0.475, zStart)
  }
  for (const y of [ROOF_Y + 0.45, ROOF_Y + 1.06]) {
    addBox(barrier, shared.darkSteel, deckW, 0.08, 0.1, 0, y, zStart)
  }
  for (const x of [-1.6, 0, 1.6]) {
    const z = zStart - 0.65
    addBox(barrier, deckMat, 1.0, 0.7, 0.8, x, slabTop + 0.35, z)
    addBox(barrier, shared.darkSteel, 1.02, 0.025, 0.06, x, slabTop + 0.7125, z)
    addBox(barrier, shared.darkSteel, 0.06, 0.025, 0.82, x, slabTop + 0.7125, z)
    for (const side of [-1, 1]) {
      addBox(barrier, shared.darkSteel, 0.025, 0.7, 0.06, x + side * 0.51, slabTop + 0.35, z)
      addBox(barrier, shared.darkSteel, 0.06, 0.7, 0.025, x, slabTop + 0.35, z + side * 0.41)
    }
  }
  finishParts(barrier, 'rear-roof-entry-barrier', true)

  // The +Z bound is zEnd - 0.4; the nearest rail face remains 0.35 m
  // beyond it, clear of the drop hatch at V0 + 3.2. No collider is needed.
  const vaultBarrier = new Map()
  for (const x of [-2.71, -1.35, 0, 1.35, 2.71]) {
    addBox(vaultBarrier, shared.darkSteel, 0.08, 1.25, 0.08, x, ROOF_Y + 0.475, zEnd)
  }
  for (const y of [ROOF_Y + 0.45, ROOF_Y + 1.06]) {
    addBox(vaultBarrier, shared.darkSteel, deckW, 0.08, 0.1, 0, y, zEnd)
  }
  finishParts(vaultBarrier, 'vault-roof-end-barrier', true)

  // A separate exterior group leaves the existing roof's culling bounds
  // unchanged. It lies beyond every playable carriage span and has no gameplay.
  const exteriorContinuation = new THREE.Group()
  exteriorContinuation.name = 'decorative-vault-continuation'
  const exteriorWindow = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: 0.85 })
  const exteriorFrame = woodMaterial({ repeat: [1, 1], light: 0x4a2c16, dark: 0x24140a })
  let extensionEnd = spans.vault.maxZ
  const extensions = [{ key: 'passenger', length: 20 }, { key: 'security', length: 20 }, { key: 'relay', length: 18 }]
  extensions.forEach(({ key, length }, index) => {
    const minZ = extensionEnd + 0.8
    const maxZ = minZ + length
    const centre = (minZ + maxZ) / 2
    const parts = new Map()
    const body = wallMaterialFor(key, length, false)
    for (const side of [-1, 1]) {
      addBox(parts, body, 0.12, CARRIAGE_CEILING_Y, length, side * WALL_X, CARRIAGE_CEILING_Y / 2, centre)
      addBox(parts, shared.darkSteel, 0.12, 0.55, length, side * (WALL_X + 0.1), CARRIAGE_CEILING_Y + 0.25, centre)
      for (const y of [0.95, 2.72]) {
        addBox(parts, exteriorFrame, 0.05, 0.06, length, side * (WALL_X + 0.085), y, centre)
      }
      for (const localZ of windowBayZs(length / 2)) {
        const z = centre + localZ
        // The same framed pane pattern, placed on the exterior face of the
        // solid shell; no room, curtains or interior geometry is built.
        addBox(parts, exteriorFrame, 0.07, 1.22, 1.42, side * (WALL_X + 0.07), 1.62, z)
        addBox(parts, shared.brass, 0.04, 1.1, 1.3, side * (WALL_X + 0.11), 1.62, z)
        addBox(parts, exteriorWindow, 0.02, 1.04, 1.24, side * (WALL_X + 0.135), 1.62, z)
      }
    }
    for (const z of [minZ + 0.06, maxZ - 0.06]) {
      addBox(parts, body, WALL_X * 2, CARRIAGE_CEILING_Y, 0.12, 0, CARRIAGE_CEILING_Y / 2, z)
    }
    addBox(parts, roofMat, WALL_X * 2 + 0.2, 0.2, length, 0, slabY, centre)
    for (let z = minZ + 1; z < maxZ - 0.5; z += 2) {
      addBox(parts, shared.rivet, WALL_X * 2 + 0.2, 0.04, 0.08, 0, slabTop + 0.02, z)
    }
    for (const fraction of [0.28, 0.72]) {
      const z = minZ + length * fraction
      addBox(parts, shared.darkSteel, 0.8, 0.24, 0.6, 0, slabTop + 0.12, z)
      for (let slat = 0; slat < 4; slat += 1) {
        addBox(parts, shared.rivet, 0.7, 0.03, 0.04, 0, slabTop + 0.255, z - 0.21 + slat * 0.14)
      }
      const x = fraction < 0.5 ? -2.35 : 2.35
      addPart(parts, shared.darkSteel, lampPost, x, slabTop + 0.45, z)
      addPart(parts, shared.brass, lampCap, x, slabTop + 1.12, z)
      addPart(parts, glassMat, lampGlass, x, slabTop + 0.99, z)
    }
    const gapCentre = extensionEnd + 0.4
    addBox(parts, shared.rivet, WALL_X * 2 - 0.4, CARRIAGE_CEILING_Y, 0.8, 0, CARRIAGE_CEILING_Y / 2, gapCentre)
    addBox(parts, shared.rivet, WALL_X * 2 - 0.2, 0.12, 0.8, 0, slabY - 0.13, gapCentre)
    for (let fold = 0; fold < 4; fold += 1) {
      const z = gapCentre - 0.3 + fold * 0.2
      addBox(parts, shared.rivet, WALL_X * 2 - 0.2, CARRIAGE_CEILING_Y, 0.05, 0, CARRIAGE_CEILING_Y / 2, z)
      addBox(parts, shared.rivet, WALL_X * 2 - 0.1, 0.04, 0.05, 0, slabY - 0.03, z)
    }
    finishParts(parts, `decorative-carriage-${index + 1}`, true, exteriorContinuation)
    extensionEnd = maxZ
  })
  unitBox.dispose(); lampPost.dispose(); lampCap.dispose(); lampGlass.dispose()

  // Keep the underlying slab and every existing deck/prop on the walkable run.
  roofSlab(zStart, spans.convergence.maxZ)
  roofSlab(V0, spans.vault.maxZ)
  deck(zStart, spans.convergence.maxZ)
  for (const [a, b] of ROOF_RUN.decks) deck(F0 + a, F0 + b)
  deck(V0, zEnd)

  lantern(1, zStart + 0.8)
  lantern(-1, zStart + 2.4)
  for (const [a, b] of ROOF_RUN.decks) {
    if (b - a < 2) continue
    lantern(-1, F0 + a + 0.6)
    lantern(1, F0 + b - 0.6)
  }
  lantern(-1, V0 + 1.0)
  lantern(1, zEnd - 0.6)

  // Slipstream streaks — the level fades them with the gusts.
  const streaks = []
  const span = zEnd - zStart
  for (let k = 0; k < 10; k++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe2c0, transparent: true, opacity: 0.05, depthWrite: false
    })
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 2.2 + (k % 3)), mat)
    streak.position.set(((k % 2) ? 1 : -1) * (0.8 + (k % 3) * 0.6), ROOF_Y + 0.4 + (k % 4) * 0.35, zStart + k * (span / 10))
    streak.userData.noCameraCollision = true
    streaks.push(streak)
    group.add(streak)
  }

  const dropHatch = new THREE.Group()
  dropHatch.name = 'roof-drop-hatch'
  const hatchLid = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.1, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7, metalness: 0.2 })
  )
  const hatchRim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 4), shared.brass)
  hatchRim.rotation.set(Math.PI / 2, 0, Math.PI / 4)
  hatchRim.position.y = 0.06
  const hatchRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), shared.brass)
  hatchRing.rotation.x = Math.PI / 2
  hatchRing.position.set(0, 0.07, 0.3)
  dropHatch.add(hatchLid, hatchRim, hatchRing)
  dropHatch.position.set(0, ROOF_Y + 0.02, V0 + 3.2)
  group.add(dropHatch)

  return { group, exteriorContinuation, zStart, zEnd, streaks, dropHatch }
}

// -----------------------------------------------------------------------

// Padding stands in for a body radius: player and guards collide as points.
const COLLIDER_PAD = 0.2
const COLLIDER_KINDS = new Set(['seat', 'trunk', 'relaybox', 'locker', 'crate', 'rack', 'wheel'])

function buildInteriorColliders(spans, layout) {
  const colliders = []
  for (let i = 1; i < layout.length; i++) {
    const z = spans[layout[i].key].minZ
    for (const s of [-1, 1]) {
      const a = s * (DOOR_W / 2)
      const b = s * WALL_X
      colliders.push({
        minX: Math.min(a, b), maxX: Math.max(a, b),
        minZ: z - 0.07 - COLLIDER_PAD, maxZ: z + 0.07 + COLLIDER_PAD
      })
    }
  }
  for (const cfg of layout) {
    const { center } = spans[cfg.key]
    // Only called for the heist build (see the damaged check at the call
    // site), so the wreck dressing is never the one wanted here.
    for (const box of localInteriorBoxes(cfg.key, cfg.length / 2, WALL_X, false)) {
      if (!COLLIDER_KINDS.has(box.kind)) continue
      colliders.push({
        minX: box.minX - COLLIDER_PAD, maxX: box.maxX + COLLIDER_PAD,
        minZ: box.minZ + center - COLLIDER_PAD, maxZ: box.maxZ + center + COLLIDER_PAD
      })
    }
  }
  return colliders
}

export function createCarriageEnvironment({ damaged = false } = {}) {
  WALL_X = wallXFor(damaged)
  const root = new THREE.Group()
  root.name = damaged ? 'train-interior-wrecked' : 'train-interior'
  const shared = makeShared(damaged)
  const fx = { lights: [], sparkMats: [] }

  const layout = layoutFor(damaged)
  const total = layout.reduce((s, c) => s + c.length, 0)
  let cursor = -total / 2
  const carriages = {}
  const spans = {}
  const parts = {}

  layout.forEach((cfg, index) => {
    spans[cfg.key] = { minZ: cursor, maxZ: cursor + cfg.length, center: cursor + cfg.length / 2 }

    // Level 2's open freight wagon: a shorter, open-topped body inside its
    // span, leaving real gaps between it and its neighbours for the roof run.
    if (cfg.key === 'freight') {
      const [a, b] = ROOF_RUN.shell
      const wagon = buildShell('freight', b - a, shared, damaged, { min: true, max: true }, { ceiling: false })
      wagon.group.position.z = cursor + (a + b) / 2
      dressFreightWagon(wagon.group, wagon.half, shared)
      root.add(wagon.group)
      carriages.freight = wagon.group
      cursor += cfg.length
      return
    }

    const seals = {
      // Head of the train: sealed in Level 2, joined to the locomotive cab in
      // Level 3. Tail of the train is always the end of the world. In Level 2
      // the cars either side of the roof run are sealed too, so the gaps do
      // not look straight into a lit interior.
      min: (index === 0 || cfg.key === 'vault') && !damaged,
      max: index === layout.length - 1 || (cfg.key === 'convergence' && !damaged)
    }
    const { group, half } = buildShell(cfg.key, cfg.length, shared, damaged, seals)
    const center = cursor + half
    group.position.z = center
    root.add(group)
    carriages[cfg.key] = group

    if (damaged) fx.car = cfg.key
    if (cfg.key === 'passenger') dressPassenger(group, half, shared, damaged, fx)
    else if (cfg.key === 'security') dressSecurity(group, half, shared, damaged, fx)
    else if (cfg.key === 'relay') dressRelay(group, half, shared, damaged, fx)
    else if (cfg.key === 'cargo') dressCargo(group, half, shared, damaged, fx)
    else if (cfg.key === 'mechanical' && !damaged) dressVintageMechanical(group, half, shared, fx)
    else if (cfg.key === 'mechanical') parts.mechanical = dressMechanical(group, half, shared, damaged, fx)
    else if (cfg.key === 'convergence' && !damaged) parts.convergence = dressVintageConvergence(group, half, shared, fx)
    else if (cfg.key === 'convergence') {
      parts.convergence = dressDamagedConvergence(group, half, shared, fx)
      addConvergenceFlickerLights(group, half, fx)
    }
    else if (cfg.key === 'vault' && !damaged) dressVintageVault(group, half, shared, fx)
    else if (cfg.key === 'vault') parts.vault = dressVault(group, half, shared, damaged, fx)

    if (damaged) {
      addWreckage(group, half, shared, fx, cfg.key)
      refineWreckLandmark(group, cfg.key, half, WALL_X)
    }

    cursor += cfg.length
  })

  // Level 2 gets the roof catwalk; Level 3 gets the locomotive cab instead.
  let roof = null
  if (!damaged) {
    roof = buildRoof(spans, shared, fx)
    root.add(roof.group)
    root.add(roof.exteriorContinuation)
  } else {
    fx.car = 'cab'
    const cab = buildLocomotiveCab(shared, fx)
    const cabCenter = spans.passenger.minZ - cab.half
    cab.group.position.z = cabCenter
    root.add(cab.group)
    carriages.cab = cab.group
    spans.cab = { minZ: cabCenter - cab.half, maxZ: cabCenter + cab.half, center: cabCenter }
  }

  // Base exposure so no corner falls to pure black between the point lights.
  const ambient = new THREE.AmbientLight(damaged ? 0x343c48 : 0x5b5750, damaged ? 0.58 : 0.5)
  const hemi = new THREE.HemisphereLight(
    damaged ? 0x6a7e98 : 0x8a8272,
    damaged ? 0x1e242c : 0x2a2620,
    damaged ? 0.62 : 0.55
  )
  root.add(ambient, hemi)

  // Axis-aligned volumes the player is clamped to per traversal section.
  // Level 3 is one continuous run from the vault down to the cab, so it gets a
  // single volume; Level 2 swaps between corridor / roof / vault.
  // Both levels open up almost wall to wall. Level 3 used to clamp the player
  // to a 0.82 m half-aisle, which left the wreck feeling like a corridor even
  // though it is the same shell; its fall checks are Z-ranges rather than X
  // ones, so the wider lane does not let the walkway puzzles be sidestepped.
  const aisleX = WALL_X - 0.3
  const interiorBounds = damaged
    ? { minX: -aisleX, maxX: aisleX, minZ: spans.cab.minZ + 1.2, maxZ: spans.vault.maxZ - 1.0 }
    : { minX: -aisleX, maxX: aisleX, minZ: spans.passenger.minZ + 1.2, maxZ: spans.convergence.maxZ - 1.4 }

  const roofBounds = roof
    ? { minX: -(WALL_X - 0.25), maxX: WALL_X - 0.25, minZ: roof.zStart + 0.5, maxZ: roof.zEnd - 0.4 }
    : null
  const vaultBounds = {
    minX: -aisleX, maxX: aisleX, minZ: spans.vault.minZ + 0.9, maxZ: spans.vault.maxZ - 0.8
  }

  // World-space AABBs for the interior walk (Level 2 only — Level 3's aisle
  // never reaches the furniture): the bulkhead panels either side of each
  // doorway, plus the seats and wall furniture now within reach.
  const colliders = damaged ? [] : buildInteriorColliders(spans, layout)

  // Emergency lighting flickers and severed cables spark; Level 2's steady
  // interior lighting makes this a no-op, so levels can call it unconditionally.
  let elapsed = 0
  function passengerLightWorldZ(entry) {
    return (entry.light.parent?.position.z || 0) + entry.light.position.z
  }

  function update(delta) {
    if (!damaged) return
    if (delta === 0) return
    elapsed += delta
    const t = elapsed
    for (const entry of fx.lights) {
      if (entry.dead) {
        entry.light.intensity = 0
        continue
      }
      if (entry.surge > 0) {
        entry.surge = Math.max(0, entry.surge - Math.abs(delta))
        entry.light.intensity = entry.base * (0.05 + 0.95 * Math.abs(Math.sin(t * 46 + entry.seed)))
        if (entry.surge === 0 && entry.pendingKill) {
          entry.dead = true
          entry.light.intensity = 0
        }
        continue
      }
      const seed = entry.seed
      let mul = 1
      if (entry.pattern === 0) {
        const a = Math.sin(t * 11.3 + seed)
        const b = Math.sin(t * 2.7 + seed * 1.4)
        const c = Math.sin(t * 0.83 + seed)
        mul = 0.42 + 0.58 * Math.abs(a * b)
        if (c > 0.78) mul *= 0.12
      } else if (entry.pattern === 1) {
        const drop = Math.sin(t * 0.55 + seed) * Math.sin(t * 1.21 + seed * 2)
        mul = drop > 0.84 ? 0.08 : drop > 0.62 ? 0.38 : 0.88 + 0.12 * Math.sin(t * 4.2 + seed)
      } else if (entry.pattern === 2) {
        mul = 0.55 + 0.45 * Math.abs(Math.sin(t * 8.4 + seed) * Math.sin(t * 3.05 + seed))
      } else {
        mul = 0.9 + 0.1 * Math.sin(t * 2.2 + seed)
      }
      if (damaged) mul = Math.max(mul, 0.65)
      // Convergence is the second car on the Timewreck run (after the Vault).
      // Extra irregular electrical flicker on its existing lamps only.
      if (entry.car === 'convergence') {
        const buzz = Math.sin(t * 23 + seed * 4) * Math.sin(t * 9.4 + seed)
        const stutter = Math.sin(t * 1.7 + seed * 1.6)
        let dip = 0.9 + 0.1 * buzz
        if (stutter > 0.62 && buzz > 0.1) dip = 0.58
        else if (stutter > 0.38) dip = 0.74
        mul = Math.max(0.55, mul * dip)
      }
      entry.light.intensity = entry.base * mul
    }
    for (const mat of fx.sparkMats) {
      mat.emissiveIntensity = 0.7 + Math.abs(Math.sin(t * 17)) * 2.4
    }
  }

  function shockPassengerLights() {
    if (!damaged) return
    let kill = null
    let killZ = -Infinity
    for (const entry of fx.lights) {
      if (entry.car !== 'passenger' || entry.dead) continue
      entry.surge = 0.85
      const wz = passengerLightWorldZ(entry)
      if (wz > killZ) {
        killZ = wz
        kill = entry
      }
    }
    if (kill) kill.pendingKill = true
  }

  function restorePassengerLights(collapsed) {
    if (!damaged) return
    let kill = null
    let killZ = -Infinity
    for (const entry of fx.lights) {
      if (entry.car !== 'passenger') continue
      const wz = passengerLightWorldZ(entry)
      if (wz > killZ) {
        killZ = wz
        kill = entry
      }
    }
    for (const entry of fx.lights) {
      if (entry.car !== 'passenger') continue
      entry.surge = 0
      entry.pendingKill = false
      entry.dead = Boolean(collapsed && entry === kill)
      entry.light.intensity = entry.dead ? 0 : entry.base
    }
  }

  return {
    root, carriages, spans, roof, parts, interiorBounds, roofBounds, vaultBounds, colliders,
    update, shockPassengerLights, restorePassengerLights,
    getVaultFracture: () => ({
      lights: fx.lights.filter((e) => e.car === 'vault'),
      mats: fx.vaultMats || [],
      pieces: fx.vaultPieces || []
    })
  }
}

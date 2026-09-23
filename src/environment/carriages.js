import * as THREE from 'three'
import {
  carpetMaterial,
  metalMaterial,
  nightViewMaterial,
  plasterMaterial,
  woodMaterial
} from './textures.js'
import { WALL_X, DOOR_W, CAB_LENGTH, LAYOUT } from './carriage-bounds.js'

export {
  listCarriageVolumes,
  carriageVolumeAt,
  listCarriageWallBoxes,
  listCarriageInteriorBoxes
} from './carriage-bounds.js'

// The train's interior playspace: the five carriages the concept doc calls for
// — Passenger -> Security -> Cargo -> Mechanical -> Vault — built end to end as
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
// Above the Mechanical and Vault cars (Level 2 only) sits a walkable roof
// catwalk: the carriage-to-carriage exterior route for the Slow-Time wind set
// piece. The forward bulkhead of the Vault is sealed, so the roof is the only
// way in.
//
// Repeated furniture (seats, lockers, crates, debris, rivets) goes through
// InstancedMesh — a carriage of loose meshes would be hundreds of draw calls
// on its own, the frame-budget trap the brief's performance section warns of.

export const CARRIAGE_CEILING_Y = 2.6

const DOOR_H = 2.0
const ROOF_Y = 3.3 // top surface of the roof catwalk — player pose height up there

// Deterministic scatter so a rebuilt level looks identical to the first build.
const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1

function makeShared(damaged) {
  return {
    steel: metalMaterial({ repeat: [3, 2], base: damaged ? 0x565b62 : 0x6b7078, roughness: damaged ? 0.7 : 0.5, metalness: 0.85 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: damaged ? 0x1b1d22 : 0x23262c, roughness: 0.65, metalness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: damaged ? 0x6d5628 : 0xb08d3f, roughness: damaged ? 0.62 : 0.3, metalness: 0.9 }),
    rivet: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.7 }),
    warmGlass: new THREE.MeshStandardMaterial({
      color: damaged ? 0x40201c : 0xffe0ac,
      emissive: damaged ? 0xa02418 : 0xffce8a,
      emissiveIntensity: damaged ? 1.5 : 1.3,
      roughness: 0.25
    })
  }
}

function wallMaterialFor(key, length, damaged) {
  const r = [Math.max(1, Math.round(length / 4)), 1]
  switch (key) {
    case 'passenger':
      return woodMaterial({ repeat: r, light: damaged ? 0x4d3620 : 0x8a5c33, dark: damaged ? 0x1e1409 : 0x452a16 })
    case 'security':
      return metalMaterial({ repeat: r, base: damaged ? 0x2f343c : 0x474d57, roughness: damaged ? 0.7 : 0.45, metalness: 0.8 })
    case 'cargo':
      return woodMaterial({ repeat: r, light: damaged ? 0x3e2b18 : 0x6a4a2c, dark: damaged ? 0x1b1209 : 0x33210f })
    case 'mechanical':
      return metalMaterial({ repeat: r, base: damaged ? 0x282c33 : 0x3c4149, roughness: 0.6, metalness: 0.75 })
    case 'vault':
      return metalMaterial({ repeat: r, base: damaged ? 0x1f2228 : 0x2b2e35, roughness: 0.45, metalness: 0.9 })
    case 'cab':
      return metalMaterial({ repeat: r, base: 0x2e3339, roughness: 0.62, metalness: 0.78 })
    default:
      return plasterMaterial({ repeat: r })
  }
}

// Two side panels and a lintel around a centred doorway, plus a brass surround.
// `sealed` fills the doorway in with a solid plate — used at the two ends of
// the train, where an open doorway would otherwise look straight out of the
// train at the scrolling outdoor scenery.
function addBulkhead(group, z, shared, sealed = false) {
  const sideW = (WALL_X * 2 - DOOR_W) / 2
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(sideW, CARRIAGE_CEILING_Y, 0.14),
      shared.darkSteel
    )
    panel.position.set(s * (DOOR_W / 2 + sideW / 2), CARRIAGE_CEILING_Y / 2, z)
    panel.receiveShadow = true
    group.add(panel)
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W, CARRIAGE_CEILING_Y - DOOR_H, 0.14),
    shared.darkSteel
  )
  lintel.position.set(0, DOOR_H + (CARRIAGE_CEILING_Y - DOOR_H) / 2, z)
  group.add(lintel)

  const surround = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.12, DOOR_H + 0.06, 0.05), shared.brass)
  surround.position.set(0, DOOR_H / 2, z)
  group.add(surround)

  if (sealed) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.1), shared.darkSteel)
    plate.position.set(0, DOOR_H / 2, z)
    group.add(plate)
  }
}

function buildShell(key, length, shared, damaged, seals = {}) {
  const g = new THREE.Group()
  g.name = `carriage-${key}`
  g.userData.type = key
  const half = length / 2

  let floorMat
  if (key === 'passenger') {
    floorMat = carpetMaterial({
      repeat: [2, Math.round(length / 2)],
      base: damaged ? 0x2e1418 : 0x5e1f28,
      accent: damaged ? 0x4a3520 : 0x9a7238
    })
  } else {
    floorMat = metalMaterial({
      repeat: [3, Math.round(length / 2)],
      base: key === 'vault' ? (damaged ? 0x282c33 : 0x3a3f47) : (damaged ? 0x3a3e45 : 0x50555d),
      roughness: damaged ? 0.75 : 0.6,
      metalness: 0.7
    })
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, length), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  g.add(floor)

  const wallMat = wallMaterialFor(key, length, damaged)
  const wallGeo = new THREE.BoxGeometry(0.12, CARRIAGE_CEILING_Y, length)
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wallGeo, wallMat)
    w.position.set(s * WALL_X, CARRIAGE_CEILING_Y / 2, 0)
    w.receiveShadow = true
    g.add(w)
  }

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.1, length), wallMat)
  ceiling.position.y = CARRIAGE_CEILING_Y
  g.add(ceiling)

  addBulkhead(g, -half, shared, Boolean(seals.min))
  addBulkhead(g, half, shared, Boolean(seals.max))

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

function addWreckage(g, half, shared, fx) {
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.72, metalness: 0.58 })
  const sites = damageSites(half)
  const n = sites.length

  // Torn lining hinged off the wall at the ceiling joint — still wall-aligned.
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1.45, 1.45), panelMat, n), n, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.06), 1.45, c.z)
    d.rotation.set(0, 0, c.side * 0.14)
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
  if (damaged) fx.lights.push({ light, base: light.intensity, seed: fx.lights.length * 3.7 })
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
    color: 0x3a3f47, roughness: 0.5, metalness: 0.72, emissive: 0x4a1808, emissiveIntensity: 0.22
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

  const burstMat = metalMaterial({ repeat: [1, 1], base: 0x6a3a22, roughness: 0.55, metalness: 0.8 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.05, 1.15, 8), burstMat, sites.length * 2), sites.length * 2, (d, i) => {
    const c = sites[i >> 1]
    d.position.set(c.side * (WALL_X - 0.16), 1.05 + (i % 2) * 0.32, c.z)
    d.rotation.set(Math.PI / 2, 0, c.side * 0.08)
  }))

  const glow = new THREE.PointLight(0xff5a1e, 8, 7, 2)
  glow.position.set(sites[0].side * 0.95, 1.1, sites[0].z)
  addLight(g, fx, glow, true)
}

function dressDamagedCargo(g, half, shared, fx) {
  const sites = damageSites(half)
  const lidMat = woodMaterial({ repeat: [1, 1], light: 0x6a4e28, dark: 0x2a1a0c })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.04, 0.58), lidMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.12, 0.88, c.z)
    d.rotation.set(0.05, 0.12 * c.side, c.side * 0.18)
  }))

  const slatMat = woodMaterial({ repeat: [1, 1], light: 0x5c4320, dark: 0x241608 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.035, 0.62), slatMat, sites.length * 2), sites.length * 2, (d, i) => {
    const c = sites[i >> 1]
    d.position.set(c.side * 1.12, 0.06, c.z + (i % 2 ? 0.2 : -0.16))
    d.rotation.set(0, 0.08 * c.side, 0)
  }))

  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.TorusGeometry(0.07, 0.016, 6, 10), shared.steel, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.15, CARRIAGE_CEILING_Y - 0.55, c.z)
    d.rotation.set(1.15, 0, 0)
  }))

  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1.15), shared.darkSteel, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.15, CARRIAGE_CEILING_Y - 0.2, c.z)
    d.rotation.set(0, 0, c.side * 0.08)
  }))

  const purple = new THREE.MeshStandardMaterial({
    color: 0x3b0764, emissive: 0xa855f7, emissiveIntensity: 1.15, roughness: 0.4
  })
  for (const c of sites) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 0.18), purple)
    mark.position.set(c.side * (WALL_X - 0.08), 1.35, c.z)
    noCam(mark)
    g.add(mark)
  }
  const loopGlow = new THREE.PointLight(0xa855f7, 3.6, 5, 2)
  loopGlow.position.set(sites[0].side * 0.95, 1.5, sites[0].z)
  addLight(g, fx, loopGlow, true)
}

function dressDamagedSecurity(g, half, shared, fx) {
  const sites = damageSites(half)
  const doorMat = metalMaterial({ repeat: [1, 1], base: 0x2a3140, roughness: 0.5, metalness: 0.75 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1.15, 0.48), doorMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.08), 0.95, c.z)
    d.rotation.set(0.04, c.side * -0.45, c.side * 0.06)
  }))

  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.028, 0.028, 1.35, 6), shared.darkSteel, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.12), 1.55, c.z)
    d.rotation.set(Math.PI / 2, 0, c.side * 0.04)
  }))

  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, emissive: 0x1d4ed8, emissiveIntensity: 0.45, roughness: 0.45, metalness: 0.6
  })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.05, 0.5), fixtureMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.18, CARRIAGE_CEILING_Y - 0.12, c.z)
    d.rotation.set(0, 0, c.side * 0.18)
  }))
}

function dressDamagedPassenger(g, half, shared, fx) {
  const sites = damageSites(half)
  const luggageMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.82, metalness: 0.05 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.2, 0.5), luggageMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.08, 0.58, c.z + 0.55)
    d.rotation.set(0.04, 0.12 * c.side, 0)
  }))

  const seatFrag = new THREE.MeshStandardMaterial({ color: 0x2a262c, roughness: 0.88, metalness: 0.04 })
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
}

function dressDamagedVault(g, half, shared, fx) {
  const sites = [{ z: half - 1.8, side: -1 }, { z: half - 1.8, side: 1 }]
  const plateMat = metalMaterial({ repeat: [1, 1], base: 0x252830, roughness: 0.48, metalness: 0.82 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1.2, 1.15), plateMat, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.08), 1.15, c.z)
    d.rotation.set(0, 0, c.side * 0.08)
  }))

  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), shared.steel, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.18, 0.14, c.z)
    d.rotation.set(0, 0, c.side * 0.05)
  }))

  const scorch = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b, emissive: 0x6d28d9, emissiveIntensity: 0.85, roughness: 0.7
  })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.015, 1.05), scorch, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.18, 0.02, c.z)
    d.rotation.set(0, 0, 0)
  }))

  const vein = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 1.35, roughness: 0.35
  })
  for (const c of sites) {
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.08), vein)
    streak.position.set(c.side * (WALL_X - 0.07), 1.15, c.z)
    noCam(streak)
    g.add(streak)
    addSagCable(g, vein, c.side * (WALL_X - 0.1), 2.18, c.z - 0.3, c.side * 1.12, 0.7, c.z + 0.25, 0.24)
  }

  const coreGlow = new THREE.PointLight(0x7c3aed, 5, 6, 2)
  coreGlow.position.set(0, 1.4, half - 1.2)
  addLight(g, fx, coreGlow, true)
}
// --- Per-carriage dressing -------------------------------------------------

function dressPassenger(g, half, shared, damaged, fx) {
  const windowMat = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: damaged ? 0.3 : 0.95 })
  const winGeo = new THREE.BoxGeometry(0.05, 0.9, 1.5)
  const frameGeo = new THREE.BoxGeometry(0.05, 1.04, 1.66)
  for (let z = -half + 2.4; z <= half - 2.4; z += 3.4) {
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(frameGeo, shared.brass)
      f.position.set(s * (WALL_X - 0.05), 1.5, z)
      g.add(f)
      const p = new THREE.Mesh(winGeo, windowMat)
      p.position.set(s * (WALL_X - 0.045), 1.5, z)
      g.add(p)
    }
  }

  // Seat bays down both sides of the aisle (instanced). Damaged seats are
  // tilted and dropped so the same instanced set reads as thrown about.
  const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
  const seatMat = new THREE.MeshStandardMaterial({
    color: damaged ? 0x2f2a30 : 0x4a5c74, roughness: 0.88, metalness: 0.03
  })
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.16, 0.95), seatMat, bays * 2)
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.8, 0.16), seatMat, bays * 2)
  const dummy = new THREE.Object3D()
  const sites = damaged ? damageSites(half) : []
  let i = 0
  for (let b = 0; b < bays; b++) {
    const z = -half + 3 + b * 3.4
    for (const s of [-1, 1]) {
      const wrecked = damaged && nearSite(sites, z, s, 1.8)
      const tilt = wrecked ? skew(i + 1) * 0.18 : 0
      const yaw = wrecked ? skew(i + 4) * 0.08 : 0
      const drop = wrecked ? Math.abs(skew(i + 7)) * 0.05 : 0
      dummy.rotation.set(wrecked ? Math.abs(skew(i + 2)) * 0.08 : 0, yaw, tilt)
      dummy.position.set(s * 1.02, 0.42 - drop, z); dummy.updateMatrix()
      bases.setMatrixAt(i, dummy.matrix)
      dummy.position.set(s * 1.24, 0.82 - drop, z); dummy.updateMatrix()
      backs.setMatrixAt(i, dummy.matrix)
      i++
    }
  }
  for (const m of [bases, backs]) { m.instanceMatrix.needsUpdate = true; m.castShadow = true; g.add(m) }

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.05, half * 2 - 2),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x5a1712 : 0xfff2d6,
      emissive: damaged ? 0xcc2a18 : 0xffe0ae,
      emissiveIntensity: damaged ? 2 : 2.3
    })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  g.add(strip)
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(damaged ? 0xff5a3c : 0xffcf96, damaged ? 15 : 22, damaged ? 9 : 12, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    addLight(g, fx, l, damaged)
  }
  if (damaged) dressDamagedPassenger(g, half, shared, fx)
}

function dressSecurity(g, half, shared, damaged, fx) {
  const slitMat = new THREE.MeshStandardMaterial({
    color: 0x1b2733, emissive: damaged ? 0x3a1410 : 0x22405a, emissiveIntensity: 0.5, roughness: 0.4
  })
  for (let z = -half + 2; z <= half - 2; z += 2.6) {
    for (const s of [-1, 1]) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.9), slitMat)
      slit.position.set(s * (WALL_X - 0.04), 1.7, z)
      g.add(slit)
      for (let k = -1; k <= 1; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.03), shared.rivet)
        bar.position.set(s * (WALL_X - 0.03), 1.7, z + k * 0.28)
        g.add(bar)
      }
    }
  }

  const lockerMat = metalMaterial({
    repeat: [1, 1], base: damaged ? 0x262b32 : 0x39414b, roughness: 0.55, metalness: 0.7
  })
  const cols = Math.max(2, Math.floor((half * 2 - 5) / 0.62))
  const lockers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1.7, 0.5), lockerMat, cols * 2)
  const dummy = new THREE.Object3D()
  const sites = damaged ? damageSites(half) : []
  let i = 0
  for (let c = 0; c < cols; c++) {
    const z = -half + 2.5 + c * 0.62
    for (const s of [-1, 1]) {
      dummy.rotation.set(0, damaged && nearSite(sites, z, s, 0.9) ? s * -0.18 : 0, 0)
      dummy.position.set(s * (WALL_X - 0.32), 0.86, z); dummy.updateMatrix()
      lockers.setMatrixAt(i++, dummy.matrix)
    }
  }
  lockers.instanceMatrix.needsUpdate = true
  lockers.castShadow = true
  g.add(lockers)

  for (const z of [-half * 0.55, 0, half * 0.55]) {
    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.5),
      new THREE.MeshStandardMaterial({
        color: damaged ? 0x4a1a14 : 0xbfe4ff,
        emissive: damaged ? 0xd03018 : 0x7fd0ff,
        emissiveIntensity: 2.2
      })
    )
    cage.position.set(0, CARRIAGE_CEILING_Y - 0.07, z)
    g.add(cage)
    const l = new THREE.PointLight(damaged ? 0xff5030 : 0x9fd0ff, damaged ? 12 : 14, damaged ? 8 : 10, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    addLight(g, fx, l, damaged)
  }
  if (damaged) dressDamagedSecurity(g, half, shared, fx)
}

function dressCargo(g, half, shared, damaged, fx) {
  const crateMat = woodMaterial({
    repeat: [1, 1], light: damaged ? 0x54401f : 0x8a6a40, dark: damaged ? 0x2a1d0e : 0x4c3620
  })
  const spots = []
  for (let z = -half + 2; z <= half - 2; z += 2.2) {
    spots.push([-(WALL_X - 0.45), 0.45, z, 0])
    spots.push([WALL_X - 0.45, 0.45, z, 1])
    if ((z | 0) % 2 === 0) spots.push([-(WALL_X - 0.5), 1.35, z, 2])
  }
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat, spots.length)
  const dummy = new THREE.Object3D()
  const sites = damaged ? damageSites(half) : []
  spots.forEach(([x, y, z, seed], k) => {
    const wrecked = damaged && nearSite(sites, z, Math.sign(x) || -1, 1.6)
    dummy.position.set(x, wrecked ? y - 0.05 : y, z)
    dummy.rotation.set(
      wrecked ? 0.08 : 0,
      skew(seed + k) * 0.4,
      wrecked ? Math.sign(x) * 0.1 : 0
    )
    dummy.updateMatrix()
    crates.setMatrixAt(k, dummy.matrix)
  })
  crates.instanceMatrix.needsUpdate = true
  crates.castShadow = true
  crates.receiveShadow = true
  g.add(crates)

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, half * 2 - 2), shared.darkSteel)
  rail.position.set(0, CARRIAGE_CEILING_Y - 0.2, 0)
  g.add(rail)
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), shared.rivet)
  chain.position.set(0, CARRIAGE_CEILING_Y - 0.55, half - 4)
  g.add(chain)
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 12), shared.steel)
  hook.position.set(0, CARRIAGE_CEILING_Y - 0.95, half - 4)
  g.add(hook)

  const work = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.4),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x5a2410 : 0xffdca0,
      emissive: damaged ? 0xd83c14 : 0xffb454,
      emissiveIntensity: 2.4
    })
  )
  work.position.set(0, CARRIAGE_CEILING_Y - 0.09, 0)
  g.add(work)
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(damaged ? 0xff6438 : 0xffb264, damaged ? 13 : 16, damaged ? 8 : 11, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    addLight(g, fx, l, damaged)
  }
  if (damaged) dressDamagedCargo(g, half, shared, fx)
}
function dressMechanical(g, half, shared, damaged, fx) {
  const pipeMat = metalMaterial({
    repeat: [1, 4], base: damaged ? 0x555b63 : 0x707781, roughness: damaged ? 0.7 : 0.45, metalness: 0.85
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

  const boilerLight = new THREE.PointLight(damaged ? 0xff4a1e : 0xff7a3c, damaged ? 22 : 18, 12, 2)
  boilerLight.position.set(0, 1.4, half - 4)
  addLight(g, fx, boilerLight, damaged)

  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0x2a1508, emissive: 0xff5a1e, emissiveIntensity: damaged ? 3.4 : 2.6, roughness: 0.7
    })
  )
  grate.position.set(0, 0.6, half - 0.3)
  g.add(grate)

  const ceil = new THREE.PointLight(damaged ? 0xff6030 : 0xffb066, 12, 10, 2)
  ceil.position.set(0, CARRIAGE_CEILING_Y - 0.3, -half * 0.4)
  addLight(g, fx, ceil, damaged)

  // Roof hatch (a sliding cover in the ceiling) + ladder up to it.
  const hatchZ = half - 2.5
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

  if (damaged) dressDamagedMechanical(g, half, shared, fx)

  return { hatchCover, ladder }
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
  door.position.set(0, 1.2, half - 0.16)
  g.add(door)

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.05, half * 2 - 2),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x4a1a14 : 0xbfe0ff,
      emissive: damaged ? 0xd83018 : 0x5ab6ff,
      emissiveIntensity: 2.0
    })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  g.add(strip)
  const l = new THREE.PointLight(damaged ? 0xff5030 : 0x7cc4ff, damaged ? 13 : 16, damaged ? 9 : 12, 2)
  l.position.set(0, CARRIAGE_CEILING_Y - 0.3, 0)
  addLight(g, fx, l, damaged)

  const chevron = new THREE.MeshStandardMaterial({
    color: 0xd8b23a, emissive: 0x3a2c08, emissiveIntensity: 1, roughness: 0.6
  })
  for (let z = -half + 1.5; z < half - 3; z += 1.1) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.28), chevron)
    c.position.set(0, 0.02, z)
    g.add(c)
  }

  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.06, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2c2f36, metalness: 0.8, roughness: 0.4 })
  )
  hatch.position.set(0, CARRIAGE_CEILING_Y - 0.03, -half + 2.5)
  hatch.userData.noCameraCollision = true
  g.add(hatch)

  if (damaged) dressDamagedVault(g, half, shared, fx)

  return { door }
}

// --- Locomotive cab (Level 3's escape target) ------------------------------

function buildLocomotiveCab(shared, fx) {
  // The front bulkhead is sealed — this is the head of the train.
  const { group, half } = buildShell('cab', CAB_LENGTH, shared, true, { min: true })
  group.name = 'locomotive-cab'

  // Backhead: the driver's control face, pressed against the front bulkhead.
  const backhead = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.55, metalness: 0.7 })
  )
  backhead.position.set(0, 0.9, -half + 0.5)
  backhead.castShadow = true
  group.add(backhead)

  // Pressure gauges — small emissive dials across the backhead.
  const dialFace = new THREE.MeshStandardMaterial({
    color: 0xf2ead6, emissive: 0xffcf8a, emissiveIntensity: 1.6, roughness: 0.5
  })
  for (const [x, y] of [[-0.62, 1.32], [0, 1.4], [0.62, 1.32], [-0.35, 0.95], [0.35, 0.95]]) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), dialFace)
    dial.rotation.x = Math.PI / 2
    dial.position.set(x, y, -half + 0.68)
    group.add(dial)
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 16), shared.brass)
    bezel.position.set(x, y, -half + 0.7)
    group.add(bezel)
  }

  // Firebox: the strongest light source in the cab, flickering hard.
  const firebox = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x2a1004, emissive: 0xff5210, emissiveIntensity: 4.2, roughness: 0.8 })
  )
  firebox.position.set(0, 0.42, -half + 0.72)
  group.add(firebox)
  const fireLight = new THREE.PointLight(0xff6a24, 26, 9, 2)
  fireLight.position.set(0, 0.6, -half + 1.1)
  addLight(group, fx, fireLight, true)

  // Regulator and reverser levers.
  for (const [x, tilt, colour] of [[-0.75, -0.5, 0xb08d3f], [0.75, 0.35, 0x8d939c]]) {
    const lever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.8, 10),
      new THREE.MeshStandardMaterial({ color: colour, metalness: 0.9, roughness: 0.32 })
    )
    lever.position.set(x, 1.15, -half + 1.05)
    lever.rotation.x = tilt
    lever.castShadow = true
    group.add(lever)
  }

  // Side windows onto the night rushing past.
  const nightMat = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: 0.55 })
  for (const s of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 1.3), nightMat)
    pane.position.set(s * (WALL_X - 0.045), 1.6, 0.6)
    group.add(pane)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.94, 1.46), shared.brass)
    frame.position.set(s * (WALL_X - 0.05), 1.6, 0.6)
    group.add(frame)
  }

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, CAB_LENGTH - 2),
    new THREE.MeshStandardMaterial({ color: 0x5a1712, emissive: 0xcc2a18, emissiveIntensity: 1.8 })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  group.add(strip)

  addWreckage(group, half, shared, fx)
  return { group, half }
}

// --- Roof catwalk (Level 2 only) -------------------------------------------

function buildRoof(spans, shared) {
  const group = new THREE.Group()
  group.name = 'carriage-roof'

  const minZ = spans.passenger.minZ
  const maxZ = spans.vault.maxZ
  const roofline = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.2, maxZ - minZ),
    metalMaterial({ repeat: [3, 20], base: 0x3b4048, roughness: 0.6, metalness: 0.7 })
  )
  roofline.position.set(0, CARRIAGE_CEILING_Y + 0.45, (minZ + maxZ) / 2)
  roofline.receiveShadow = true
  group.add(roofline)

  for (const s of [-1, 1]) {
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, maxZ - minZ), shared.darkSteel)
    fascia.position.set(s * 1.5, CARRIAGE_CEILING_Y + 0.25, (minZ + maxZ) / 2)
    group.add(fascia)
  }

  // The walkable catwalk — from the Mechanical roof hatch across to the Vault.
  const zStart = spans.mechanical.maxZ - 4
  const zEnd = spans.vault.maxZ - 1.5
  const midZ = (zStart + zEnd) / 2
  const span = zEnd - zStart

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.12, span),
    metalMaterial({ repeat: [3, 8], base: 0x5c6169, roughness: 0.7, metalness: 0.6 })
  )
  deck.position.set(0, ROOF_Y - 0.06, midZ)
  deck.receiveShadow = true
  group.add(deck)

  for (let z = zStart + 0.6; z < zEnd; z += 0.8) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.03, 0.08), shared.rivet)
    rib.position.set(0, ROOF_Y + 0.01, z)
    group.add(rib)
  }
  const railGeo = new THREE.CylinderGeometry(0.03, 0.03, span - 1, 8)
  railGeo.rotateX(Math.PI / 2)
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, shared.steel)
    rail.position.set(s * 0.42, ROOF_Y + 0.35, midZ)
    group.add(rail)
    for (let z = zStart + 0.5; z < zEnd; z += 2.0) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), shared.steel)
      post.position.set(s * 0.42, ROOF_Y + 0.17, z)
      group.add(post)
    }
  }

  for (const z of [zStart + 2, zEnd - 2.5]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.7), shared.darkSteel)
    vent.position.set(0.9, ROOF_Y + 0.14, z)
    vent.userData.noCameraCollision = true
    group.add(vent)
  }

  const streaks = []
  for (let k = 0; k < 8; k++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbfe4ff, transparent: true, opacity: 0.05, depthWrite: false
    })
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 2.2 + (k % 3)), mat)
    s.position.set(((k % 2) ? 1 : -1) * (0.8 + (k % 3) * 0.4), ROOF_Y + 0.3 + (k % 4) * 0.35, zStart + k * (span / 8))
    s.userData.noCameraCollision = true
    streaks.push(s)
    group.add(s)
  }

  const dropHatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.1, 1.0),
    new THREE.MeshStandardMaterial({
      color: 0x2f333b, emissive: 0x1c2530, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.4
    })
  )
  dropHatch.name = 'roof-drop-hatch'
  dropHatch.position.set(0, ROOF_Y + 0.02, zEnd - 0.6)
  group.add(dropHatch)
  const beacon = new THREE.PointLight(0x38bdf8, 4, 4, 2)
  beacon.position.set(0, ROOF_Y + 0.4, zEnd - 0.6)
  group.add(beacon)

  return { group, zStart, zEnd, streaks, dropHatch }
}

// -----------------------------------------------------------------------

export function createCarriageEnvironment({ damaged = false } = {}) {
  const root = new THREE.Group()
  root.name = damaged ? 'train-interior-wrecked' : 'train-interior'
  const shared = makeShared(damaged)
  const fx = { lights: [], sparkMats: [] }

  const total = LAYOUT.reduce((s, c) => s + c.length, 0)
  let cursor = -total / 2
  const carriages = {}
  const spans = {}
  const parts = {}

  LAYOUT.forEach((cfg, index) => {
    const seals = {
      // Head of the train: sealed in Level 2, joined to the locomotive cab in
      // Level 3. Tail of the train is always the end of the world.
      min: index === 0 && !damaged,
      max: index === LAYOUT.length - 1
    }
    const { group, half } = buildShell(cfg.key, cfg.length, shared, damaged, seals)
    const center = cursor + half
    group.position.z = center
    root.add(group)
    carriages[cfg.key] = group
    spans[cfg.key] = { minZ: cursor, maxZ: cursor + cfg.length, center }

    if (cfg.key === 'passenger') dressPassenger(group, half, shared, damaged, fx)
    else if (cfg.key === 'security') dressSecurity(group, half, shared, damaged, fx)
    else if (cfg.key === 'cargo') dressCargo(group, half, shared, damaged, fx)
    else if (cfg.key === 'mechanical') parts.mechanical = dressMechanical(group, half, shared, damaged, fx)
    else if (cfg.key === 'vault') parts.vault = dressVault(group, half, shared, damaged, fx)

    if (damaged) addWreckage(group, half, shared, fx)

    cursor += cfg.length
  })

  // Level 2 gets the roof catwalk; Level 3 gets the locomotive cab instead.
  let roof = null
  if (!damaged) {
    roof = buildRoof(spans, shared)
    root.add(roof.group)
  } else {
    const cab = buildLocomotiveCab(shared, fx)
    const cabCenter = spans.passenger.minZ - cab.half
    cab.group.position.z = cabCenter
    root.add(cab.group)
    carriages.cab = cab.group
    spans.cab = { minZ: cabCenter - cab.half, maxZ: cabCenter + cab.half, center: cabCenter }
  }

  // Base exposure so no corner falls to pure black between the point lights.
  const ambient = new THREE.AmbientLight(damaged ? 0x4a2620 : 0x5b5750, damaged ? 0.45 : 0.5)
  const hemi = new THREE.HemisphereLight(
    damaged ? 0x7a3428 : 0x8a8272,
    damaged ? 0x2a1210 : 0x2a2620,
    damaged ? 0.4 : 0.55
  )
  root.add(ambient, hemi)

  // Axis-aligned volumes the player is clamped to per traversal section.
  // Level 3 is one continuous run from the vault down to the cab, so it gets a
  // single volume; Level 2 swaps between corridor / roof / vault.
  const interiorBounds = damaged
    ? { minX: -0.58, maxX: 0.58, minZ: spans.cab.minZ + 1.2, maxZ: spans.vault.maxZ - 1.0 }
    : { minX: -0.58, maxX: 0.58, minZ: spans.passenger.minZ + 1.2, maxZ: spans.mechanical.maxZ - 1.4 }

  const roofBounds = roof
    ? { minX: -1.35, maxX: 1.35, minZ: roof.zStart + 0.5, maxZ: roof.zEnd - 0.5 }
    : null
  const vaultBounds = {
    minX: -0.58, maxX: 0.58, minZ: spans.vault.minZ + 0.9, maxZ: spans.vault.maxZ - 0.8
  }

  // Emergency lighting flickers and severed cables spark; Level 2's steady
  // interior lighting makes this a no-op, so levels can call it unconditionally.
  let elapsed = 0
  function update(delta) {
    if (!damaged) return
    elapsed += delta
    for (const entry of fx.lights) {
      const flicker = 0.6 + 0.4 * Math.abs(
        Math.sin(elapsed * 9 + entry.seed) * Math.sin(elapsed * 3.1 + entry.seed)
      )
      entry.light.intensity = entry.base * flicker
    }
    for (const mat of fx.sparkMats) {
      mat.emissiveIntensity = 0.7 + Math.abs(Math.sin(elapsed * 17)) * 2.4
    }
  }

  return { root, carriages, spans, roof, parts, interiorBounds, roofBounds, vaultBounds, update }
}

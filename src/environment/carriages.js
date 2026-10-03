import * as THREE from 'three'
import {
  carpetMaterial,
  metalMaterial,
  nightViewMaterial,
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

function makeShared(damaged) {
  return {
    steel: metalMaterial({ repeat: [3, 2], base: damaged ? 0x626870 : 0x6b7078, roughness: damaged ? 0.7 : 0.5, metalness: 0.85 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: damaged ? 0x282c34 : 0x23262c, roughness: 0.65, metalness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: damaged ? 0x6d5628 : 0xb08d3f, roughness: damaged ? 0.62 : 0.3, metalness: 0.9 }),
    rivet: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.7 }),
    warmGlass: new THREE.MeshStandardMaterial({
      color: damaged ? 0x5a2a22 : 0xffe0ac,
      emissive: damaged ? 0xc43a22 : 0xffce8a,
      emissiveIntensity: damaged ? 1.15 : 1.3,
      roughness: 0.25
    })
  }
}

function wallMaterialFor(key, length, damaged) {
  const r = [Math.max(1, Math.round(length / 4)), 1]
  switch (key) {
    case 'passenger':
      return woodMaterial({ repeat: r, light: damaged ? 0x454240 : 0x8a5c33, dark: damaged ? 0x242628 : 0x452a16 })
    case 'security':
      return damaged
        ? metalMaterial({ repeat: r, base: 0x2f343c, roughness: 0.7, metalness: 0.8 })
        : woodMaterial({ repeat: r, light: 0x7a4a26, dark: 0x3a2211 })
    case 'relay':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      return metalMaterial({ repeat: r, base: damaged ? 0x293138 : 0x344957, roughness: damaged ? 0.72 : 0.48, metalness: 0.8 })
    case 'cargo':
      return woodMaterial({ repeat: r, light: damaged ? 0x323230 : 0x6e3b1e, dark: damaged ? 0x161616 : 0x2e160a })
    case 'mechanical':
    case 'convergence':
    case 'freight':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
      return metalMaterial({ repeat: r, base: damaged ? 0x282c33 : 0x3c4149, roughness: 0.6, metalness: 0.75 })
    case 'vault':
      if (!damaged) return woodMaterial({ repeat: r, light: 0x6e3b1e, dark: 0x2e160a })
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

function buildShell(key, length, shared, damaged, seals = {}, { ceiling: hasCeiling = true } = {}) {
  const g = new THREE.Group()
  g.name = `carriage-${key}`
  g.userData.type = key
  const half = length / 2

  let floorMat
  if (key === 'passenger' && damaged) {
    floorMat = carpetMaterial({
      repeat: [2, Math.round(length / 2)],
      base: damaged ? 0x342e34 : 0x5e1f28,
      accent: damaged ? 0x484448 : 0x9a7238
    })
  } else if (['passenger', 'security', 'relay', 'cargo', 'mechanical', 'convergence', 'freight', 'vault'].includes(key) && !damaged) {
    floorMat = woodMaterial({ repeat: [2, Math.round(length / 2)], light: 0x6b4526, dark: 0x2e1a0c })
  } else {
    floorMat = metalMaterial({
      repeat: [3, Math.round(length / 2)],
      base: key === 'vault' ? (damaged ? 0x323840 : 0x3a3f47) : (damaged ? 0x454b54 : 0x50555d),
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
  // Level 3 passenger/cab: omit the solid side walls so blown viewports can
  // look through to the rushing exterior. Other cars keep a continuous hull.
  const openSides = damaged && (key === 'passenger' || key === 'cab')
  if (!openSides) {
    const wallGeo = new THREE.BoxGeometry(0.12, CARRIAGE_CEILING_Y, length)
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wallGeo, wallMat)
      w.position.set(s * WALL_X, CARRIAGE_CEILING_Y / 2, 0)
      w.receiveShadow = true
      g.add(w)
    }
  }

  const ceilingMat = (key === 'security' || key === 'vault') && !damaged
    ? plasterMaterial({ repeat: [2, Math.round(length / 3)], base: 0xd8ccb0, roughness: 0.85 })
    : damaged
      ? metalMaterial({
        repeat: [2, Math.round(length / 3)],
        base: 0x424850,
        roughness: 0.72,
        metalness: 0.62
      })
      : wallMat
  if (hasCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.1, length), ceilingMat)
    ceiling.position.y = CARRIAGE_CEILING_Y
    g.add(ceiling)
  }

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

// Level-3 passenger/cab: wall bands + pillars leave real openings so the
// storm and exterior wreckage read through the windows. Frames only — glass
// is gone. Player collision still uses carriage-bounds, not these meshes.
function addBlownViewports(g, half, key, shared) {
  const wallMat = wallMaterialFor(key, half * 2, true)
  const paneH = key === 'cab' ? 0.92 : 1.12
  const paneD = key === 'cab' ? 1.48 : 1.68
  const paneY = key === 'cab' ? 1.58 : 1.48
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
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x4a5560, roughness: 0.08, metalness: 0.18,
    transparent: true, opacity: 0.07, depthWrite: false
  })
  const shardCount = zs.length * 2
  const shards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.14, 0.12), shardMat, shardCount)
  const dummy = new THREE.Object3D()
  let shardI = 0

  for (const s of [-1, 1]) {
    const x = s * WALL_X
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.12, lowerH, half * 2), wallMat)
    lower.position.set(x, lowerH / 2, 0)
    lower.receiveShadow = true
    g.add(lower)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, upperH, half * 2), wallMat)
    upper.position.set(x, lintelY + upperH / 2, 0)
    upper.receiveShadow = true
    g.add(upper)

    let cursor = -half
    for (const z of zs) {
      const a = z - paneD / 2
      const span = a - cursor
      if (span > 0.06) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, paneH, span), wallMat)
        pillar.position.set(x, paneY, cursor + span / 2)
        pillar.receiveShadow = true
        g.add(pillar)
      }
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, paneH + 0.1, paneD + 0.12),
        shared.brass
      )
      frame.position.set(s * (WALL_X - 0.01), paneY, z)
      g.add(frame)
      dummy.position.set(s * (WALL_X - 0.02), paneY - 0.28, z + paneD * 0.28)
      dummy.rotation.set(0.2, 0, s * 0.55)
      dummy.updateMatrix()
      shards.setMatrixAt(shardI++, dummy.matrix)
      cursor = z + paneD / 2
    }
    const tail = half - cursor
    if (tail > 0.06) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, paneH, tail), wallMat)
      pillar.position.set(x, paneY, cursor + tail / 2)
      pillar.receiveShadow = true
      g.add(pillar)
    }
  }
  shards.count = shardI
  shards.instanceMatrix.needsUpdate = true
  noCam(shards)
  g.add(shards)
}

function addWreckage(g, half, shared, fx, key) {
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.72, metalness: 0.58 })
  const sites = damageSites(half)
  const n = sites.length
  const openView = key === 'passenger' || key === 'cab'

  // Torn lining hinged off the wall at the ceiling joint — still wall-aligned.
  // On cars with blown viewports, hang it inside the opening instead of filling it.
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, openView ? 0.82 : 1.45, openView ? 0.7 : 1.45), panelMat, n), n, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - (openView ? 0.48 : 0.06)), openView ? 2.08 : 1.45, c.z)
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
  const sites = damageSites(half)
  const lidMat = woodMaterial({ repeat: [1, 1], light: 0x4a463c, dark: 0x1c1b18 })
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.04, 0.58), lidMat, sites.length), sites.length, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.12, 0.88, c.z)
    d.rotation.set(0.05, 0.12 * c.side, c.side * 0.18)
  }))

  const slatMat = woodMaterial({ repeat: [1, 1], light: 0x3e3c36, dark: 0x181714 })
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

  const seatFrag = new THREE.MeshStandardMaterial({ color: 0x3a4552, roughness: 0.88, metalness: 0.04 })
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

function dressDamagedVault(g, half, shared, fx) {
  const sites = [{ z: half - 1.8, side: -1 }, { z: half - 1.8, side: 1 }]
  const plateMat = metalMaterial({ repeat: [1, 1], base: 0x252830, roughness: 0.48, metalness: 0.82 })
  rememberVaultMat(fx, plateMat)
  const plates = scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1.2, 1.15), plateMat, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * (WALL_X - 0.08), 1.15, c.z)
    d.rotation.set(0, 0, c.side * 0.08)
  })
  g.add(plates)
  rememberVaultPiece(fx, plates)

  const rails = scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), shared.steel, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.18, 0.14, c.z)
    d.rotation.set(0, 0, c.side * 0.05)
  })
  g.add(rails)
  rememberVaultPiece(fx, rails)

  const scorch = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b, emissive: 0x6d28d9, emissiveIntensity: 0.85, roughness: 0.7
  })
  rememberVaultMat(fx, scorch)
  g.add(scatterInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.015, 1.05), scorch, 2), 2, (d, i) => {
    const c = sites[i]
    d.position.set(c.side * 1.18, 0.02, c.z)
    d.rotation.set(0, 0, 0)
  }))

  const vein = new THREE.MeshStandardMaterial({
    color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 1.35, roughness: 0.35
  })
  rememberVaultMat(fx, vein)
  for (const c of sites) {
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.08), vein)
    streak.position.set(c.side * (WALL_X - 0.07), 1.15, c.z)
    noCam(streak)
    g.add(streak)
    rememberVaultPiece(fx, streak)
    addSagCable(g, vein, c.side * (WALL_X - 0.1), 2.18, c.z - 0.3, c.side * 1.12, 0.7, c.z + 0.25, 0.24)
  }

  const coreGlow = new THREE.PointLight(0x7c3aed, 5, 6, 2)
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

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.05, half * 2 - 2),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x6a2218 : 0xfff2d6,
      emissive: damaged ? 0xc42818 : 0xffe0ae,
      emissiveIntensity: damaged ? 1.35 : 2.3
    })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  g.add(strip)
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(damaged ? 0xff6a48 : 0xffcf96, damaged ? 8.5 : 22, damaged ? 6.5 : 12, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    addLight(g, fx, l, damaged)
  }
  if (damaged) dressDamagedPassenger(g, half, shared, fx)
}

// Level 3: the original narrow-car seat bays, tilted and dropped near the
// damage sites so the same instanced set reads as thrown about.
function addWreckedSeatBays(g, half) {
  const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x3d4a58, roughness: 0.88, metalness: 0.03 })
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.16, 0.95), seatMat, bays * 2)
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.8, 0.16), seatMat, bays * 2)
  const dummy = new THREE.Object3D()
  const sites = damageSites(half)
  let i = 0
  for (let b = 0; b < bays; b++) {
    const z = -half + 3 + b * 3.4
    for (const s of [-1, 1]) {
      const wrecked = nearSite(sites, z, s, 1.8)
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
  const slitMat = new THREE.MeshStandardMaterial({
    color: 0x1b2733, emissive: 0x1e3a5f, emissiveIntensity: 0.5, roughness: 0.4
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
    repeat: [1, 1], base: 0x262b32, roughness: 0.55, metalness: 0.7
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
        color: 0x1e3a4a,
        emissive: 0x3b82f6,
        emissiveIntensity: 1.6
      })
    )
    cage.position.set(0, CARRIAGE_CEILING_Y - 0.07, z)
    g.add(cage)
    const l = new THREE.PointLight(0x8fb4d4, 8, 7, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    addLight(g, fx, l, damaged)
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
  for (let z = -half + 2.5; z <= half - 2; z += spacing) {
    const lantern = new THREE.Group()
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), shared.brass)
    rod.position.y = -0.18
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.08, 8), shared.brass)
    cap.position.y = -0.38
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 8), glassMat)
    glass.position.y = -0.55
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.05, 8), shared.brass)
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
function addSconce(g, s, z, shared, glassMat, y = 1.95) {
  const x = s * WALL_X
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.12), shared.brass)
  plate.position.set(x - s * 0.02, y, z)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.16, 8), glassMat)
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
  const rackMat = metalMaterial({
    repeat: [1, 1],
    base: damaged ? 0x252c31 : 0x33434f,
    roughness: 0.55,
    metalness: 0.78
  })

  const statusMat = new THREE.MeshStandardMaterial({
    color: damaged ? 0x6b261d : 0x38bdf8,
    emissive: damaged ? 0xc43120 : 0x38bdf8,
    emissiveIntensity: 2.2,
    roughness: 0.2
  })

  // Electrical racks down both walls.
  for (let z = -half + 2.2; z <= half - 2.2; z += 2.8) {
    for (const side of [-1, 1]) {
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 1.9, 1.35),
        rackMat
      )

      rack.position.set(
        side * (WALL_X - 0.3),
        0.95,
        z
      )

      rack.castShadow = true
      g.add(rack)

      const status = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.16, 0.75),
        statusMat
      )

      status.position.set(
        side * (WALL_X - 0.045),
        1.4,
        z
      )

      g.add(status)
    }
  }

  // Central ceiling power conduit.
  const conduit = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.08, half * 2 - 2),
    shared.darkSteel
  )

  conduit.position.set(0, CARRIAGE_CEILING_Y - 0.12, 0)
  g.add(conduit)

  for (const z of [-half * 0.55, 0, half * 0.55]) {
    const light = new THREE.PointLight(
      damaged ? 0xff5030 : 0x67c8ff,
      damaged ? 12 : 15,
      9,
      2
    )

    light.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    addLight(g, fx, light, damaged)
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
  const crateMat = woodMaterial({
    repeat: [1, 1], light: damaged ? 0x4a463c : 0x8a6a40, dark: damaged ? 0x1c1b18 : 0x4c3620
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
      color: damaged ? 0x6a2818 : 0xffdca0,
      emissive: damaged ? 0xc43414 : 0xffb454,
      emissiveIntensity: 1.6
    })
  )
  work.position.set(0, CARRIAGE_CEILING_Y - 0.09, 0)
  g.add(work)
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(damaged ? 0xff7048 : 0xffb264, damaged ? 7.5 : 16, damaged ? 6 : 11, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    addLight(g, fx, l, damaged)
  }
  if (damaged) dressDamagedCargo(g, half, shared, fx)
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

  const boilerLight = new THREE.PointLight(damaged ? 0xff6a32 : 0xff7a3c, damaged ? 14 : 18, damaged ? 8 : 12, 2)
  boilerLight.position.set(0, 1.4, half - 4)
  addLight(g, fx, boilerLight, damaged)

  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0x2a1508, emissive: 0xff5a1e, emissiveIntensity: damaged ? 2.6 : 2.6, roughness: 0.7
    })
  )
  grate.position.set(0, 0.6, half - 0.3)
  g.add(grate)

  const ceil = new THREE.PointLight(damaged ? 0xd8c8b8 : 0xffb066, damaged ? 7 : 12, damaged ? 8 : 10, 2)
  ceil.position.set(0, CARRIAGE_CEILING_Y - 0.3, -half * 0.4)
  addLight(g, fx, ceil, damaged)

  const access = addRoofAccess(g, half - 2.5, shared)
  if (damaged) dressDamagedMechanical(g, half, shared, fx)
  return access
}

// Extra emergency lamps for the Timewreck Convergence car (the ladder room).
// Registered through addLight so they pick up that car's flicker only.
function addConvergenceFlickerLights(g, half, fx) {
  const spots = [-half + 5, -half * 0.35, half * 0.15, half - 3.2]
  for (const z of spots) {
    const light = new THREE.PointLight(0xff6a40, 4.2, 6.5, 2)
    light.position.set(0, 2.15, z)
    addLight(g, fx, light, true)
  }
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
  door.position.set(0, 1.2, half - 0.16)
  g.add(door)

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.05, half * 2 - 2),
    new THREE.MeshStandardMaterial({
      color: damaged ? 0x2a1848 : 0xbfe0ff,
      emissive: damaged ? 0x7c3aed : 0x5ab6ff,
      emissiveIntensity: 1.6
    })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  g.add(strip)
  if (damaged) rememberVaultMat(fx, strip.material)
  const l = new THREE.PointLight(damaged ? 0x8b6cff : 0x7cc4ff, damaged ? 9 : 16, damaged ? 8 : 12, 2)
  l.position.set(0, CARRIAGE_CEILING_Y - 0.3, 0)
  addLight(g, fx, l, damaged)

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
  const fireLight = new THREE.PointLight(0xff6a24, 16, 7, 2)
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

  // Blown side openings onto the night rushing past.
  addBlownViewports(group, half, 'cab', shared)

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, CAB_LENGTH - 2),
    new THREE.MeshStandardMaterial({ color: 0x4a1c16, emissive: 0xc42818, emissiveIntensity: 1.35 })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  group.add(strip)

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
  const glassMat = lampGlassMaterial()

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

  // Lantern on a short post at the deck edge; every other one casts light.
  let lanternCount = 0
  function lantern(s, z) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), shared.darkSteel)
    post.position.set(s * (deckW / 2 - 0.1), ROOF_Y + 0.45, z)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.06, 8), shared.brass)
    cap.position.set(post.position.x, ROOF_Y + 1.12, z)
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 8), glassMat)
    glass.position.set(post.position.x, ROOF_Y + 0.99, z)
    group.add(post, cap, glass)
    if (lanternCount++ % 2 === 0) {
      const l = new THREE.PointLight(0xffc27a, 9, 8, 2)
      l.position.set(post.position.x - s * 0.3, ROOF_Y + 1.0, z)
      addLight(group, fx, l, false)
    }
  }

  const F0 = spans.freight.minZ
  const V0 = spans.vault.minZ
  roofSlab(spans.passenger.minZ, spans.convergence.maxZ)
  roofSlab(V0, spans.vault.maxZ)

  const zStart = spans.convergence.maxZ - 3.2
  const zEnd = V0 + ROOF_RUN.vaultDeck
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

  return { group, zStart, zEnd, streaks, dropHatch }
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
      parts.convergence = dressMechanical(group, half, shared, damaged, fx)
      if (damaged) addConvergenceFlickerLights(group, half, fx)
    }
    else if (cfg.key === 'vault' && !damaged) dressVintageVault(group, half, shared, fx)
    else if (cfg.key === 'vault') parts.vault = dressVault(group, half, shared, damaged, fx)

    if (damaged) addWreckage(group, half, shared, fx, cfg.key)

    cursor += cfg.length
  })

  // Level 2 gets the roof catwalk; Level 3 gets the locomotive cab instead.
  let roof = null
  if (!damaged) {
    roof = buildRoof(spans, shared, fx)
    root.add(roof.group)
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

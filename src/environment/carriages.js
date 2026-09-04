import * as THREE from 'three'
import {
  carpetMaterial,
  metalMaterial,
  nightViewMaterial,
  plasterMaterial,
  woodMaterial
} from './textures.js'

// Level 2's playspace: the five carriages the concept doc calls for —
// Passenger -> Security -> Cargo -> Mechanical -> Vault — built end to end as
// child groups of ONE parent group, so the Alpha plan's Train/Carriage
// parent-child hierarchy now carries real, distinct interior content. Each
// carriage is a shared shell (floor, walls, coved ceiling, end bulkheads with
// a centred doorway) plus a type-specific dressing pass that gives it its own
// geometry, props and lighting so the progression reads at a glance.
//
// Above the Mechanical and Vault cars sits a walkable roof catwalk: the
// carriage-to-carriage exterior route for the Slow-Time wind set piece. The
// forward bulkhead of the Vault is sealed, so the roof is the only way in.
//
// Repeated furniture (seats, lockers, crates, rivets) goes through
// InstancedMesh — a carriage of loose meshes would be hundreds of draw calls
// on its own, the frame-budget trap the brief's performance section warns of.

export const CARRIAGE_CEILING_Y = 2.6

const WALL_X = 1.6 // inside face of the side walls (player is bounded to ±0.58)
const DOOR_W = 1.12
const DOOR_H = 2.0
const ROOF_Y = 3.3 // top surface of the roof catwalk — player pose height up there

// key, interior length (m). Order is the concept doc's progression.
const LAYOUT = [
  { key: 'passenger', length: 16 },
  { key: 'security', length: 14 },
  { key: 'cargo', length: 14 },
  { key: 'mechanical', length: 16 },
  { key: 'vault', length: 12 }
]

function makeShared() {
  return {
    steel: metalMaterial({ repeat: [3, 2], base: 0x6b7078, roughness: 0.5, metalness: 0.85 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.6, metalness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 }),
    rivet: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.7 }),
    warmGlass: new THREE.MeshStandardMaterial({
      color: 0xffe0ac, emissive: 0xffce8a, emissiveIntensity: 1.3, roughness: 0.25
    })
  }
}

function wallMaterialFor(key, length) {
  const r = [Math.max(1, Math.round(length / 4)), 1]
  switch (key) {
    case 'passenger': return woodMaterial({ repeat: r, light: 0x8a5c33, dark: 0x452a16 })
    case 'security': return metalMaterial({ repeat: r, base: 0x474d57, roughness: 0.45, metalness: 0.8 })
    case 'cargo': return woodMaterial({ repeat: r, light: 0x6a4a2c, dark: 0x33210f })
    case 'mechanical': return metalMaterial({ repeat: r, base: 0x3c4149, roughness: 0.55, metalness: 0.75 })
    case 'vault': return metalMaterial({ repeat: r, base: 0x2b2e35, roughness: 0.4, metalness: 0.9 })
    default: return plasterMaterial({ repeat: r })
  }
}

// Two side panels and a lintel around a centred doorway, plus a brass surround.
function addBulkhead(group, z, shared) {
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
}

function buildShell(key, length, shared) {
  const g = new THREE.Group()
  g.name = `carriage-${key}`
  g.userData.type = key
  const half = length / 2

  const floorMat = key === 'passenger'
    ? carpetMaterial({ repeat: [2, Math.round(length / 2)], base: 0x5e1f28, accent: 0x9a7238 })
    : metalMaterial({
        repeat: [3, Math.round(length / 2)],
        base: key === 'vault' ? 0x3a3f47 : 0x50555d,
        roughness: 0.6,
        metalness: 0.7
      })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, length), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  g.add(floor)

  const wallMat = wallMaterialFor(key, length)
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

  addBulkhead(g, -half, shared)
  addBulkhead(g, half, shared)

  return { group: g, half }
}

// --- Per-carriage dressing -------------------------------------------------

function dressPassenger(g, half, shared) {
  // Warm night landscape through the windows.
  const windowMat = nightViewMaterial({ repeat: [1, 1], emissiveIntensity: 0.95 })
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

  // Seat bays down both sides of the aisle (instanced).
  const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a5c74, roughness: 0.88, metalness: 0.03 })
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.16, 0.95), seatMat, bays * 2)
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.8, 0.16), seatMat, bays * 2)
  const dummy = new THREE.Object3D()
  let i = 0
  for (let b = 0; b < bays; b++) {
    const z = -half + 3 + b * 3.4
    for (const s of [-1, 1]) {
      dummy.position.set(s * 1.02, 0.42, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
      bases.setMatrixAt(i, dummy.matrix)
      dummy.position.set(s * 1.24, 0.82, z); dummy.updateMatrix()
      backs.setMatrixAt(i, dummy.matrix)
      i++
    }
  }
  for (const m of [bases, backs]) { m.instanceMatrix.needsUpdate = true; m.castShadow = true; g.add(m) }

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.05, half * 2 - 2),
    new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffe0ae, emissiveIntensity: 2.3 })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  g.add(strip)
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(0xffcf96, 22, 12, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    g.add(l)
  }
}

function dressSecurity(g, half, shared) {
  // Barred slit windows.
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x1b2733, emissive: 0x22405a, emissiveIntensity: 0.5, roughness: 0.4 })
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

  // Wall lockers, both sides (instanced), with a break for the door.
  const lockerMat = metalMaterial({ repeat: [1, 1], base: 0x39414b, roughness: 0.5, metalness: 0.7 })
  const cols = Math.max(2, Math.floor((half * 2 - 5) / 0.62))
  const lockers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1.7, 0.5), lockerMat, cols * 2)
  const dummy = new THREE.Object3D()
  let i = 0
  for (let c = 0; c < cols; c++) {
    const z = -half + 2.5 + c * 0.62
    for (const s of [-1, 1]) {
      dummy.position.set(s * (WALL_X - 0.32), 0.86, z); dummy.updateMatrix()
      lockers.setMatrixAt(i++, dummy.matrix)
    }
  }
  lockers.instanceMatrix.needsUpdate = true
  lockers.castShadow = true
  g.add(lockers)

  // Cold cyan overhead cage lights.
  for (const z of [-half * 0.55, 0, half * 0.55]) {
    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xbfe4ff, emissive: 0x7fd0ff, emissiveIntensity: 2.2 })
    )
    cage.position.set(0, CARRIAGE_CEILING_Y - 0.07, z)
    g.add(cage)
    const l = new THREE.PointLight(0x9fd0ff, 14, 10, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.3, z)
    g.add(l)
  }
}

function dressCargo(g, half, shared) {
  const crateMat = woodMaterial({ repeat: [1, 1], light: 0x8a6a40, dark: 0x4c3620 })
  // Stacked crates along the walls (instanced), aisle kept clear.
  const spots = []
  for (let z = -half + 2; z <= half - 2; z += 2.2) {
    spots.push([-(WALL_X - 0.45), 0.45, z, 0])
    spots.push([WALL_X - 0.45, 0.45, z, 1])
    if ((z | 0) % 2 === 0) spots.push([-(WALL_X - 0.5), 1.35, z, 2])
  }
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat, spots.length)
  const dummy = new THREE.Object3D()
  const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1
  spots.forEach(([x, y, z, seed], k) => {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, skew(seed + k) * 0.4, 0)
    dummy.updateMatrix()
    crates.setMatrixAt(k, dummy.matrix)
  })
  crates.instanceMatrix.needsUpdate = true
  crates.castShadow = true
  crates.receiveShadow = true
  g.add(crates)

  // Overhead gantry rail + hook.
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
    new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb454, emissiveIntensity: 2.4 })
  )
  work.position.set(0, CARRIAGE_CEILING_Y - 0.09, 0)
  g.add(work)
  for (const z of [-half * 0.5, half * 0.5]) {
    const l = new THREE.PointLight(0xffb264, 16, 11, 2)
    l.position.set(0, CARRIAGE_CEILING_Y - 0.35, z)
    g.add(l)
  }
}

// Returns the roof-hatch cover and the ladder up to it.
function dressMechanical(g, half, shared) {
  // Pipe runs along both walls.
  const pipeMat = metalMaterial({ repeat: [1, 4], base: 0x707781, roughness: 0.45, metalness: 0.85 })
  const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, half * 2 - 1.2, 10)
  pipeGeo.rotateX(Math.PI / 2)
  for (const s of [-1, 1]) {
    for (const y of [0.5, 0.95, 2.05]) {
      const pipe = new THREE.Mesh(pipeGeo, pipeMat)
      pipe.position.set(s * (WALL_X - 0.14), y, 0)
      g.add(pipe)
    }
  }

  // Decorative wall flywheel.
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

  // Boiler glow.
  const boilerLight = new THREE.PointLight(0xff7a3c, 18, 12, 2)
  boilerLight.position.set(0, 1.4, half - 4)
  g.add(boilerLight)
  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x2a1508, emissive: 0xff5a1e, emissiveIntensity: 2.6, roughness: 0.7 })
  )
  grate.position.set(0, 0.6, half - 0.3)
  g.add(grate)
  const ceil = new THREE.PointLight(0xffb066, 12, 10, 2)
  ceil.position.set(0, CARRIAGE_CEILING_Y - 0.3, -half * 0.4)
  g.add(ceil)

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

  return { hatchCover, ladder }
}

function dressVault(g, half, shared) {
  // Sealed circular blast door on the forward bulkhead — the roof is the way in.
  const door = new THREE.Group()
  door.name = 'vault-door'
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.24, 32),
    new THREE.MeshStandardMaterial({ color: 0x2b2e35, metalness: 0.92, roughness: 0.3 })
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

  // Cold security lighting + floor hazard markings.
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.05, half * 2 - 2),
    new THREE.MeshStandardMaterial({ color: 0xbfe0ff, emissive: 0x5ab6ff, emissiveIntensity: 2.0 })
  )
  strip.position.y = CARRIAGE_CEILING_Y - 0.06
  g.add(strip)
  const l = new THREE.PointLight(0x7cc4ff, 16, 12, 2)
  l.position.set(0, CARRIAGE_CEILING_Y - 0.3, 0)
  g.add(l)

  const chevron = new THREE.MeshStandardMaterial({ color: 0xd8b23a, emissive: 0x3a2c08, emissiveIntensity: 1, roughness: 0.6 })
  for (let z = -half + 1.5; z < half - 3; z += 1.1) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.28), chevron)
    c.position.set(0, 0.02, z)
    g.add(c)
  }

  // Drop-in hatch in the ceiling at the rear (where the player comes down).
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.06, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2c2f36, metalness: 0.8, roughness: 0.4 })
  )
  hatch.position.set(0, CARRIAGE_CEILING_Y - 0.03, -half + 2.5)
  hatch.userData.noCameraCollision = true
  g.add(hatch)

  return { door }
}

// --- Roof catwalk --------------------------------------------------------

function buildRoof(spans, shared) {
  const group = new THREE.Group()
  group.name = 'carriage-roof'

  // The whole train's roofline, low-detail, so the crossing reads as being on
  // top of a moving train rather than a floating plank.
  const minZ = spans.passenger.minZ
  const maxZ = spans.vault.maxZ
  const roofline = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.2, maxZ - minZ),
    metalMaterial({ repeat: [3, 20], base: 0x3b4048, roughness: 0.6, metalness: 0.7 })
  )
  roofline.position.set(0, CARRIAGE_CEILING_Y + 0.45, (minZ + maxZ) / 2)
  roofline.receiveShadow = true
  group.add(roofline)

  // Fascia dropping to the carriage tops so the roofline isn't a hovering slab.
  for (const s of [-1, 1]) {
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.55, maxZ - minZ),
      shared.darkSteel
    )
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

  // Anti-slip ribs and a low centre grab-rail.
  const ribMat = shared.rivet
  for (let z = zStart + 0.6; z < zEnd; z += 0.8) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.03, 0.08), ribMat)
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

  // A couple of roof vents to break the deck silhouette.
  for (const z of [zStart + 2, zEnd - 2.5]) {
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.28, 0.7),
      shared.darkSteel
    )
    vent.position.set(0.9, ROOF_Y + 0.14, z)
    vent.userData.noCameraCollision = true
    group.add(vent)
  }

  // Slipstream streaks — long thin billboards the level fades in with the gust.
  const streaks = []
  const streakMat = () => new THREE.MeshBasicMaterial({
    color: 0xbfe4ff, transparent: true, opacity: 0.05, depthWrite: false
  })
  for (let k = 0; k < 8; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 2.2 + (k % 3)), streakMat())
    s.position.set(((k % 2) ? 1 : -1) * (0.8 + (k % 3) * 0.4), ROOF_Y + 0.3 + (k % 4) * 0.35, zStart + k * (span / 8))
    s.userData.noCameraCollision = true
    streaks.push(s)
    group.add(s)
  }

  // The drop hatch down into the Vault.
  const dropHatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.1, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x2f333b, emissive: 0x1c2530, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.4 })
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

export function createCarriageEnvironment() {
  const root = new THREE.Group()
  root.name = 'train-interior'
  const shared = makeShared()

  const total = LAYOUT.reduce((s, c) => s + c.length, 0)
  let cursor = -total / 2
  const carriages = {}
  const spans = {}
  const parts = {}

  LAYOUT.forEach((cfg) => {
    const { group, half } = buildShell(cfg.key, cfg.length, shared)
    const center = cursor + half
    group.position.z = center
    root.add(group)
    carriages[cfg.key] = group
    spans[cfg.key] = { minZ: cursor, maxZ: cursor + cfg.length, center }

    if (cfg.key === 'passenger') dressPassenger(group, half, shared)
    else if (cfg.key === 'security') dressSecurity(group, half, shared)
    else if (cfg.key === 'cargo') dressCargo(group, half, shared)
    else if (cfg.key === 'mechanical') parts.mechanical = dressMechanical(group, half, shared)
    else if (cfg.key === 'vault') parts.vault = dressVault(group, half, shared)

    cursor += cfg.length
  })

  const roof = buildRoof(spans, shared)
  root.add(roof.group)

  // Base exposure so no corner falls to pure black between the point lights.
  const ambient = new THREE.AmbientLight(0x5b5750, 0.5)
  const hemi = new THREE.HemisphereLight(0x8a8272, 0x2a2620, 0.55)
  root.add(ambient, hemi)

  // Axis-aligned volumes the player is clamped to per traversal section.
  const interiorBounds = {
    minX: -0.58,
    maxX: 0.58,
    minZ: spans.passenger.minZ + 1.2,
    maxZ: spans.mechanical.maxZ - 1.4
  }
  const roofBounds = {
    minX: -1.35,
    maxX: 1.35,
    minZ: roof.zStart + 0.5,
    maxZ: roof.zEnd - 0.5
  }
  const vaultBounds = {
    minX: -0.58,
    maxX: 0.58,
    minZ: spans.vault.minZ + 0.9,
    maxZ: spans.vault.maxZ - 0.8
  }

  // Steady interior lighting => cheap no-op; kept so the level can call it
  // unconditionally alongside its own animation.
  function update() {}

  return { root, carriages, spans, roof, parts, interiorBounds, roofBounds, vaultBounds, update }
}

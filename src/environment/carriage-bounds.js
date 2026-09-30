// Shared carriage XZ layout for gameplay spans and the minimap.
// No Three.js — seats/crates/lockers here match the InstancedMesh loops in
// carriages.js (local Z relative to the car centre, converted to world below).

// Level 2's heist cars are wide enough to move around in; Level 3 keeps the
// narrower shell its floor holes and collapse pits were cut for.
export const WALL_X = 2.6
export const WRECK_WALL_X = 1.7
export const DOOR_W = 1.12

// Half-width of the lane the Level 2 hazards were tuned for. Chokepoint
// housings narrow the wide cars back down to this at each hazard.
export const HAZARD_AISLE_X = 0.82

export function wallXFor(damaged) {
  return damaged ? WRECK_WALL_X : WALL_X
}

// Level 2 first-class seating: booths down both sides of a central aisle.
// Each booth is two benches facing each other across a window table, their
// backs on the booth's outer ends; the space between the benches is where the
// player hides. Shared by the meshes and the colliders.
// The aisle is 2 × SEAT_INNER_X wide. The conductor walks its centre line and
// bumps anyone within 0.72 m of him (stealth.js GUARD_BUMP_RADIUS); with the
// 0.2 m seat collider pad, 1.2 leaves room to step aside and let him pass.
export const SEAT_INNER_X = 1.2
export const SEAT_DEPTH = 0.55
export const SEAT_BACK_DEPTH = 0.14
export const SEAT_BACK_TOP = 1.15
export const BOOTH_BENCH_OFFSET = 1.0 // bench centre from booth centre
// Tables sit close to the window so the hiding space between the benches
// stays deep enough to crouch in.
export const BOOTH_TABLE = { halfX: 0.42, halfZ: 0.34, inset: 0.52 } // centre at ±(wallX - inset)

// Level 2 vintage cars (Security, Route Control): one window bay — window with
// a trunk below — per entry.
export function windowBayZs(half) {
  const zs = []
  for (let z = -half + 2; z <= half - 2; z += 2.6) zs.push(z)
  return zs
}

// Level 2 Route Control car. Wall fixtures sit on the panels between window
// bays; `s` is the wall side (+1 = +X, which is screen-left walking forward).
// Local Z, relative to the carriage centre.
export function routeControlLayout(half) {
  const bays = windowBayZs(half)
  const mids = bays.slice(1).map((z, i) => (z + bays[i]) / 2)
  return {
    bays,
    platform: { s: -1, z: mids[1] },
    gear: { s: 1, z: mids[1] },
    poster: { s: 1, z: mids[3] },
    sconces: [{ s: 1, z: mids[0] }, { s: -1, z: mids[0] }, { s: -1, z: mids[3] }],
    relays: [
      { label: 'A', s: 1, z: mids[2] },
      { label: 'B', s: 1, z: mids[4] },
      { label: 'C', s: -1, z: mids[2] },
      { label: 'D', s: -1, z: mids[4] }
    ]
  }
}

// Relay box: depth off the wall, width along it. Shared by mesh and collider.
export const RELAY_BOX_DEPTH = 0.36
export const RELAY_BOX_WIDTH = 0.6

export function passengerBooths(half) {
  const booths = []
  for (let z = -half + 3.0; z <= half - 1.6; z += 3.0) booths.push(z)
  return booths
}
export const CAB_LENGTH = 8

// key, interior length (m). Order is the concept doc's progression.
export const LAYOUT = [
  { key: 'passenger', length: 20 },
  { key: 'security', length: 20 },
  { key: 'relay', length: 18 },
  { key: 'cargo', length: 20 },
  { key: 'mechanical', length: 22 },
  { key: 'convergence', length: 26 },
  { key: 'vault', length: 18 }
]

// Level 2 lengthens Cargo, Mechanical and Convergence to fit their obstacles.
// Level 3 keeps the original lengths — its set pieces are placed at fixed
// world positions.
const HEIST_LENGTHS = { cargo: 28, mechanical: 30, convergence: 40 }

// Level 2's rooftop run crosses an open freight wagon between Convergence and
// the Vault. The wagon is never entered; only its deck is walked. Distances
// are from the wagon's rear end (its span's minZ).
export const ROOF_RUN = {
  freightLength: 36,
  shell: [1.5, 31.5], // wagon body; open gaps before and after it
  decks: [[1.5, 2.5], [6.7, 11.5], [16.3, 21.6], [26.0, 31.5]],
  openings: [[2.5, 6.7], [11.5, 16.3], [21.6, 26.0]],
  vaultDeck: 5.2 // walkable deck at the rear of the Vault roof
}

export function layoutFor(damaged) {
  if (damaged) return LAYOUT
  const layout = LAYOUT.map((cfg) => ({ ...cfg, length: HEIST_LENGTHS[cfg.key] ?? cfg.length }))
  layout.splice(layout.length - 1, 0, { key: 'freight', length: ROOF_RUN.freightLength })
  return layout
}

// Level 2 floor openings, in local coordinates: the Cargo moving-platform
// pit, and the rewind-platform pits in Mechanical and Convergence.
export const CARGO_PIT = { z: 1.5, halfZ: 1.3, halfX: 0.95 }
export const MECH_PITS = [
  { z: -5.2, halfZ: 1.3, halfX: 0.95 },
  { z: 7.6, halfZ: 1.3, halfX: 0.95 }
]
export const CONV_PITS = [
  { z: -7.0, halfZ: 1.3, halfX: 0.95 },
  { z: 9.5, halfZ: 1.3, halfX: 0.95 }
]
// Level 2 Convergence roof hatch, local Z (the ladder stands just behind it).
export const CONV_HATCH_Z = 18.2

export function floorPits(key, half) {
  if (key === 'cargo') return [CARGO_PIT]
  if (key === 'mechanical') return MECH_PITS
  if (key === 'convergence') return CONV_PITS
  return []
}

export function buildCarriageSpans({ damaged = false } = {}) {
  const layout = layoutFor(damaged)
  const total = layout.reduce((s, c) => s + c.length, 0)
  let cursor = -total / 2
  const spans = {}
  for (const cfg of layout) {
    const center = cursor + cfg.length / 2
    spans[cfg.key] = { minZ: cursor, maxZ: cursor + cfg.length, center }
    cursor += cfg.length
  }
  if (damaged) {
    const cabHalf = CAB_LENGTH / 2
    const cabCenter = spans.passenger.minZ - cabHalf
    spans.cab = { minZ: cabCenter - cabHalf, maxZ: cabCenter + cabHalf, center: cabCenter }
  }
  return spans
}

export function listCarriageVolumes(spans) {
  if (!spans) return []
  const keys = LAYOUT.map((c) => c.key)
  if (spans.cab) keys.unshift('cab')
  // Only Level 3's spans carry a cab, so it doubles as the wreck flag.
  const wallX = wallXFor(Boolean(spans.cab))
  return keys.filter((key) => spans[key]).map((key) => ({
    key,
    minX: -wallX,
    maxX: wallX,
    minZ: spans[key].minZ,
    maxZ: spans[key].maxZ,
    sealedMin: key === 'cab' || (key === 'passenger' && !spans.cab),
    sealedMax: key === 'vault'
  }))
}

export function carriageVolumeAt(z, volumes) {
  if (!volumes || volumes.length === 0) return null
  for (let i = 0; i < volumes.length; i++) {
    const v = volumes[i]
    const last = i === volumes.length - 1
    if (z >= v.minZ && (last ? z <= v.maxZ : z < v.maxZ)) return v
  }
  let best = volumes[0]
  let bestDist = Infinity
  for (const v of volumes) {
    const dist = z < v.minZ ? v.minZ - z : z > v.maxZ ? z - v.maxZ : 0
    if (dist < bestDist) {
      bestDist = dist
      best = v
    }
  }
  return best
}

const MINIMAP_WALL_THICK = 0.12
const MINIMAP_BULKHEAD_THICK = 0.14

export function listCarriageWallBoxes(volume) {
  if (!volume) return []
  const { minX, maxX, minZ, maxZ } = volume
  const boxes = [
    { kind: 'wall', minX, maxX: minX + MINIMAP_WALL_THICK, minZ, maxZ },
    { kind: 'wall', minX: maxX - MINIMAP_WALL_THICK, maxX, minZ, maxZ }
  ]

  const doorMin = -DOOR_W / 2
  const doorMax = DOOR_W / 2

  function addBulkheadBoxes(z0, z1, sealed) {
    if (sealed) {
      boxes.push({ kind: 'wall', minX, maxX, minZ: z0, maxZ: z1 })
      return
    }
    boxes.push({ kind: 'wall', minX, maxX: doorMin, minZ: z0, maxZ: z1 })
    boxes.push({ kind: 'wall', minX: doorMax, maxX, minZ: z0, maxZ: z1 })
  }

  const zStroke = Math.max(MINIMAP_BULKHEAD_THICK, (maxZ - minZ) * 0.04)
  addBulkheadBoxes(minZ, minZ + zStroke, Boolean(volume.sealedMin))
  addBulkheadBoxes(maxZ - zStroke, maxZ, Boolean(volume.sealedMax))
  return boxes
}

function box(kind, x, z, halfX, halfZ) {
  return {
    kind,
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ
  }
}

// Local XZ footprints matching dressPassenger / dressSecurity / dressCargo /
// dressMechanical / dressVault / buildLocomotiveCab. Z is relative to the
// carriage group origin (world Z = local Z + span.center).
export function localInteriorBoxes(key, half, wallX = WALL_X) {
  const boxes = []
  if (key === 'passenger' && wallX === WRECK_WALL_X) {
    const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
    for (let b = 0; b < bays; b++) {
      const z = -half + 3 + b * 3.4
      for (const s of [-1, 1]) boxes.push(box('seat', s * 1.02, z, 0.35, 0.48))
    }
  } else if (key === 'passenger') {
    const outer = wallX - 0.08
    const halfX = (outer - SEAT_INNER_X) / 2
    const halfZ = (SEAT_DEPTH + SEAT_BACK_DEPTH) / 2
    for (const zc of passengerBooths(half)) {
      for (const s of [-1, 1]) {
        // Seat bases centre on the bench line; each back is on the booth's
        // outer end, so the footprint shifts outward by half a back.
        for (const dir of [-1, 1]) {
          const cz = zc + dir * (BOOTH_BENCH_OFFSET + SEAT_BACK_DEPTH / 2)
          boxes.push(box('seat', s * (SEAT_INNER_X + halfX), cz, halfX, halfZ))
        }
        boxes.push(box('seat', s * (wallX - BOOTH_TABLE.inset), zc, BOOTH_TABLE.halfX, BOOTH_TABLE.halfZ))
      }
    }
  } else if (key === 'security' && wallX !== WRECK_WALL_X) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'security') {
    const cols = Math.max(2, Math.floor((half * 2 - 5) / 0.62))
    for (let c = 0; c < cols; c++) {
      const z = -half + 2.5 + c * 0.62
      for (const s of [-1, 1]) boxes.push(box('locker', s * (wallX - 0.32), z, 0.28, 0.25))
    }
  } else if (key === 'cargo') {
    for (let z = -half + 2; z <= half - 2; z += 2.2) {
      boxes.push(box('crate', -(wallX - 0.45), z, 0.4, 0.4))
      boxes.push(box('crate', wallX - 0.45, z, 0.4, 0.4))
      if ((z | 0) % 2 === 0) boxes.push(box('crate', -(wallX - 0.5), z, 0.4, 0.4))
    }
  } else if (key === 'mechanical' && wallX !== WRECK_WALL_X) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'mechanical') {
    boxes.push(box('grate', 0, half - 0.3, 0.35, 0.08))
    boxes.push(box('wheel', -(wallX - 0.16), -half + 3, 0.6, 0.6))
    boxes.push(box('ladder', 0, half - 2.5 - 0.55, 0.28, 0.2))
  } else if (key === 'vault' && wallX !== WRECK_WALL_X) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'convergence' && wallX !== WRECK_WALL_X) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'convergence') {
    // Level 3 keeps this car clear in the minimap.
  } else if (key === 'relay' && wallX !== WRECK_WALL_X) {
    const layout = routeControlLayout(half)
    for (const z of layout.bays) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
    for (const r of layout.relays) {
      boxes.push(box('relaybox', r.s * (wallX - RELAY_BOX_DEPTH / 2), r.z, RELAY_BOX_DEPTH / 2, RELAY_BOX_WIDTH / 2))
    }
  } else if (key === 'relay') {
    for (let z = -half + 2.2; z <= half - 2.2; z += 2.8) {
      for (const s of [-1, 1]) boxes.push(box('rack', s * (wallX - 0.3), z, 0.24, 0.675))
    }
    const zs = [-half + 3.5, 0, half - 4.0]
    const xs = [-0.52, 0.52, -0.52]
    zs.forEach((z, i) => boxes.push(box('terminal', xs[i], z, 0.3, 0.3)))
  } else if (key === 'cab') {
    boxes.push(box('backhead', 0, -half + 0.5, 1.1, 0.18))
    boxes.push(box('firebox', 0, -half + 0.72, 0.45, 0.1))
  }
  return boxes
}

export function listCarriageInteriorBoxes(volume) {
  if (!volume) return []
  const half = (volume.maxZ - volume.minZ) / 2
  const center = (volume.minZ + volume.maxZ) * 0.5
  return localInteriorBoxes(volume.key, half, volume.maxX).map((entry) => ({
    ...entry,
    minZ: entry.minZ + center,
    maxZ: entry.maxZ + center
  }))
}

export function boxOverlapsClip(box, clip) {
  if (!clip) return true
  return box.maxX >= clip.minX && box.minX <= clip.maxX &&
    box.maxZ >= clip.minZ && box.minZ <= clip.maxZ
}

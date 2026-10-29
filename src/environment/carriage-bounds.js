// Shared carriage XZ layout for gameplay spans and the minimap.
import { WRECK_DAMAGE, retainedWallRuns } from './wreck-damage.js'
// No Three.js — seats/crates/lockers here match the InstancedMesh loops in
// carriages.js (local Z relative to the car centre, converted to world below).

// Both levels build the same shell: wide enough to move around in. Level 3
// used to keep a narrower shell (half-width 1.7), which made the wreck feel
// cramped next to Level 2 — its hazards are scaled to the shell in
// levels/timewreck.js rather than assuming the old narrow width.
export const WALL_X = 2.6
export const WRECK_WALL_X = WALL_X
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

// Level 2 porter's station: some booth bays give way to other uses. `booth`
// indexes passengerBooths(); `s` is the wall side.
//  - luggage: stacked trunks on the booth's footprint, cover in the same way.
//  - lounge:  no furniture at all. Most of the conductor's beat is open floor
//             wall to wall, to get round him, with walls to push the trolley
//             against so he turns his back on the aisle. Booths stay at
//             either end of the car as cover.
//  - cabinet: a louvred wardrobe the player can shut themselves inside. He
//             walks past it on every lap.
export const PASSENGER_STOWAGE = [
  { kind: 'luggage', booth: 1, s: -1 },
  { kind: 'lounge', booth: 2, s: -1 },
  { kind: 'lounge', booth: 2, s: 1 },
  { kind: 'lounge', booth: 3, s: -1 },
  { kind: 'lounge', booth: 3, s: 1 },
  { kind: 'lounge', booth: 4, s: -1 },
  { kind: 'cabinet', booth: 4, s: 1 }
]

export function passengerStowageAt(booth, s) {
  return PASSENGER_STOWAGE.find((bay) => bay.booth === booth && bay.s === s)?.kind ?? null
}

// Where a booth's benches end, measured from its centre along the car.
const BOOTH_OUTER_HALF = BOOTH_BENCH_OFFSET + SEAT_BACK_DEPTH / 2 + (SEAT_DEPTH + SEAT_BACK_DEPTH) / 2
const BOOTH_SPACING = 3.0

// The lounge's open floor along each wall, local Z: one run per side for each
// stretch of consecutive lounge bays, from the bench backs (or trunks) behind
// it to those in front. Runs, not bays, so a trolley can slide along a wall
// from one bay into the next.
export function passengerLoungeRuns(half) {
  const booths = passengerBooths(half)
  const edge = BOOTH_SPACING - BOOTH_OUTER_HALF
  const runs = []
  for (const s of [-1, 1]) {
    let run = null
    booths.forEach((z, booth) => {
      if (passengerStowageAt(booth, s) !== 'lounge') {
        run = null
        return
      }
      if (run) run.maxZ = z + edge
      else runs.push(run = { s, minZ: z - edge, maxZ: z + edge })
    })
  }
  return runs
}

// Cabinet carcass, local to the Passenger car: the front faces the aisle at
// |x| = frontX, the back stands clear of the curtains.
export const LUGGAGE_CABINET = { frontX: SEAT_INNER_X + 0.04, backX: WALL_X - 0.2, halfZ: 0.85, height: 2.25 }

export function passengerCabinetLocal(half) {
  const { booth, s } = PASSENGER_STOWAGE.find((bay) => bay.kind === 'cabinet')
  return { ...LUGGAGE_CABINET, s, z: passengerBooths(half)[booth] }
}
export const CAB_LENGTH = 8

// key, interior length (m). Order is the concept doc's progression.
// Cargo, Mechanical and Convergence are the long cars Level 2's obstacle
// courses need; Level 3 builds the same shells so both levels read as the
// same train. Every Level 3 set piece is positioned from its carriage span
// (see levels/timewreck.js), so these lengths can change without moving
// anything out of its car.
export const LAYOUT = [
  { key: 'passenger', length: 20 },
  { key: 'security', length: 20 },
  { key: 'relay', length: 18 },
  { key: 'cargo', length: 28 },
  { key: 'mechanical', length: 30 },
  { key: 'convergence', length: 40 },
  { key: 'vault', length: 18 }
]

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
  // Only Level 2 adds the open freight wagon, and only because its rooftop
  // run crosses the wagon's deck. The wagon is sealed at both bulkheads, so
  // it is a roof-run set piece rather than a carriage, and the wreck (which
  // has no roof run) must not get one.
  if (damaged) return LAYOUT.map((cfg) => ({ ...cfg }))
  const layout = LAYOUT.map((cfg) => ({ ...cfg }))
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
  const damaged = Boolean(spans.cab)
  return keys.filter((key) => spans[key]).map((key) => ({
    key,
    damaged,
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
  const boxes = []
  const center = (minZ + maxZ) / 2, cut = volume.damaged && WRECK_DAMAGE[volume.key]
  for (const side of [-1,1]) {
    const x0 = side < 0 ? minX : maxX - MINIMAP_WALL_THICK
    const x1 = side < 0 ? minX + MINIMAP_WALL_THICK : maxX
    const runs = cut ? retainedWallRuns(volume.key,side,minZ-center,maxZ-center) : [[minZ-center,maxZ-center]]
    for (const [a,b] of runs) boxes.push({ kind:'wall',minX:x0,maxX:x1,minZ:center+a,maxZ:center+b })
    // Dashed low guard: movement boundary, with no full-height wall above it.
    if (cut && side === cut.side) for (let z=center+cut.minZ;z<center+cut.maxZ;z+=0.85)
      boxes.push({kind:'boundary',minX:x0,maxX:x1,minZ:z,maxZ:Math.min(z+0.36,center+cut.maxZ)})
  }

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

  const zStroke = MINIMAP_BULKHEAD_THICK
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
// `damaged` picks the wreck's dressing (bare benches, lockers, server racks)
// over the heist's (booths, trunks, relay boxes). It used to be inferred by
// comparing wallX against WRECK_WALL_X; both levels now build the same width,
// so the flag has to be passed in.
export function localInteriorBoxes(key, half, wallX = WALL_X, damaged = false) {
  const boxes = []
  if (key === 'passenger' && damaged) {
    const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
    for (let b = 0; b < bays; b++) {
      const z = -half + 3 + b * 3.4
      for (const s of [-1, 1]) boxes.push(box('seat', s * 1.02, z, 0.35, 0.48))
    }
  } else if (key === 'passenger') {
    const outer = wallX - 0.08
    const halfX = (outer - SEAT_INNER_X) / 2
    const halfZ = (SEAT_DEPTH + SEAT_BACK_DEPTH) / 2
    passengerBooths(half).forEach((zc, booth) => {
      for (const s of [-1, 1]) {
        const stowage = passengerStowageAt(booth, s)
        if (stowage === 'lounge') continue
        if (stowage === 'cabinet') {
          const { frontX, backX, halfZ: cabinetHalfZ } = LUGGAGE_CABINET
          boxes.push(box('cabinet', s * (frontX + backX) / 2, zc, (backX - frontX) / 2, cabinetHalfZ))
          continue
        }
        const kind = stowage === 'luggage' ? 'luggage' : 'seat'
        // Seat bases centre on the bench line; each back is on the booth's
        // outer end, so the footprint shifts outward by half a back.
        for (const dir of [-1, 1]) {
          const cz = zc + dir * (BOOTH_BENCH_OFFSET + SEAT_BACK_DEPTH / 2)
          boxes.push(box(kind, s * (SEAT_INNER_X + halfX), cz, halfX, halfZ))
        }
        boxes.push(box(kind, s * (wallX - BOOTH_TABLE.inset), zc, BOOTH_TABLE.halfX, BOOTH_TABLE.halfZ))
      }
    })
  } else if (key === 'security' && !damaged) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'security') {
    // L3 Room 6: aisle kept clear for freeze-tile crossing (benches are noCam).
  } else if (key === 'cargo') {
    for (let z = -half + 2; z <= half - 2; z += 2.2) {
      boxes.push(box('crate', -(wallX - 0.45), z, 0.4, 0.4))
      boxes.push(box('crate', wallX - 0.45, z, 0.4, 0.4))
      if ((z | 0) % 2 === 0) boxes.push(box('crate', -(wallX - 0.5), z, 0.4, 0.4))
    }
  } else if (key === 'mechanical' && !damaged) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'mechanical') {
    boxes.push(box('grate', 0, half - 0.3, 0.35, 0.08))
    boxes.push(box('wheel', -(wallX - 0.16), -half + 3, 0.6, 0.6))
    boxes.push(box('ladder', 0, half - 2.5 - 0.55, 0.28, 0.2))
  } else if (key === 'vault' && !damaged) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'convergence' && !damaged) {
    for (const z of windowBayZs(half)) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
  } else if (key === 'convergence') {
    // Level 3 keeps this car clear in the minimap.
  } else if (key === 'relay' && !damaged) {
    const layout = routeControlLayout(half)
    for (const z of layout.bays) {
      for (const s of [-1, 1]) boxes.push(box('trunk', s * (wallX - 0.45), z, 0.375, 0.5))
    }
    for (const r of layout.relays) {
      boxes.push(box('relaybox', r.s * (wallX - RELAY_BOX_DEPTH / 2), r.z, RELAY_BOX_DEPTH / 2, RELAY_BOX_WIDTH / 2))
    }
  } else if (key === 'relay') {
    // L3 Room 5: aisle kept clear for the dash-door run (benches are noCam).
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
  return localInteriorBoxes(volume.key, half, volume.maxX, Boolean(volume.damaged)).map((entry) => ({
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

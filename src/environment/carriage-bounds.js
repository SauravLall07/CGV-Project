// Shared carriage XZ layout for gameplay spans and the minimap.
// No Three.js — seats/crates/lockers here match the InstancedMesh loops in
// carriages.js (local Z relative to the car centre, converted to world below).

export const WALL_X = 1.6
export const DOOR_W = 1.12
export const CAB_LENGTH = 8

export const LAYOUT = [
  { key: 'passenger', length: 16 },
  { key: 'security', length: 14 },
  { key: 'cargo', length: 14 },
  { key: 'mechanical', length: 16 },
  { key: 'vault', length: 12 }
]

export function buildCarriageSpans({ damaged = false } = {}) {
  const total = LAYOUT.reduce((s, c) => s + c.length, 0)
  let cursor = -total / 2
  const spans = {}
  for (const cfg of LAYOUT) {
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
  return keys.filter((key) => spans[key]).map((key) => ({
    key,
    minX: -WALL_X,
    maxX: WALL_X,
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
export function localInteriorBoxes(key, half) {
  const boxes = []
  if (key === 'passenger') {
    const bays = Math.max(1, Math.floor((half * 2 - 4) / 3.4))
    for (let b = 0; b < bays; b++) {
      const z = -half + 3 + b * 3.4
      for (const s of [-1, 1]) boxes.push(box('seat', s * 1.02, z, 0.35, 0.48))
    }
  } else if (key === 'security') {
    const cols = Math.max(2, Math.floor((half * 2 - 5) / 0.62))
    for (let c = 0; c < cols; c++) {
      const z = -half + 2.5 + c * 0.62
      for (const s of [-1, 1]) boxes.push(box('locker', s * (WALL_X - 0.32), z, 0.28, 0.25))
    }
  } else if (key === 'cargo') {
    for (let z = -half + 2; z <= half - 2; z += 2.2) {
      boxes.push(box('crate', -(WALL_X - 0.45), z, 0.4, 0.4))
      boxes.push(box('crate', WALL_X - 0.45, z, 0.4, 0.4))
      if ((z | 0) % 2 === 0) boxes.push(box('crate', -(WALL_X - 0.5), z, 0.4, 0.4))
    }
  } else if (key === 'mechanical') {
    boxes.push(box('grate', 0, half - 0.3, 0.35, 0.08))
    boxes.push(box('wheel', -(WALL_X - 0.16), -half + 3, 0.6, 0.6))
    boxes.push(box('ladder', 0, half - 2.5 - 0.55, 0.28, 0.2))
  } else if (key === 'vault') {
    boxes.push(box('door', 0, half - 0.16, 1.0, 0.2))
    for (let z = -half + 1.5; z < half - 3; z += 1.1) {
      boxes.push(box('chevron', 0, z, 0.5, 0.14))
    }
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
  return localInteriorBoxes(volume.key, half).map((entry) => ({
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

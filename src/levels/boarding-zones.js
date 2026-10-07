import { ONBOARDING_PASSAGE_BOUNDS } from '../environment/passageways/passage-onboarding.js'
import { TUTORIAL_PASSAGE_BOUNDS } from '../environment/passageways/passage-tutorial.js'
import { GUARD_PASSAGE_BOUNDS } from '../environment/passageways/passage-guards.js'
import { BRIDGE_PASSAGE_BOUNDS } from '../environment/passageways/passage-bridge.js'
import { APPROACH_CENTER_Z, APPROACH_START_X, APPROACH_WIDTH } from '../environment/station-blockout.js'

// Level 1 draws the room the player is in and the rooms that can be seen
// from it, nothing else. Each zone is a box on the route; each region is a
// set of objects that are shown or hidden together. A zone lists the regions
// visible from inside it, so a neighbour is already drawn before its door
// opens and nothing appears in view when the zone changes.
//
// Route order: forecourt → (door) → Passageway 1 (laser training, ref 03)
// → stairs down → Passageway 2 (guards) → vent → Passageway 3 (maintenance)
// → stairs up → Passageway 4 (station hall, ref 02) → platform and train
// (ref 05). Passageway 0 sits west of Passageway 1 behind a closed door.

const HALL_MIN_Z = APPROACH_CENTER_Z - APPROACH_WIDTH / 2 - 0.4
const HALL_MAX_Z = APPROACH_CENTER_Z + APPROACH_WIDTH / 2 + 0.4
// Past this the hall's last doorway lines up with the platform arch, and the
// view reaches across the track.
const HALL_EAST_X = -20

const ZONES = [
  {
    name: 'plaza',
    region: 'platform',
    box: { minX: 6, maxX: 36, minZ: -10, maxZ: 48 },
    show: ['landing']
  },
  {
    name: 'p0',
    region: 'p0',
    box: { ...ONBOARDING_PASSAGE_BOUNDS, minY: -1 },
    show: ['p0', 'p1', 'outdoor']
  },
  {
    name: 'p1',
    region: 'p1',
    box: { ...TUTORIAL_PASSAGE_BOUNDS, minY: -6 },
    show: ['p0', 'p1', 'p2']
  },
  {
    name: 'p2',
    region: 'p2',
    box: { ...GUARD_PASSAGE_BOUNDS, maxY: -1.5 },
    show: ['p1', 'p2', 'p3']
  },
  {
    name: 'p3',
    region: 'p3',
    box: { ...BRIDGE_PASSAGE_BOUNDS },
    show: ['p2', 'p3', 'p4']
  },
  {
    name: 'p4-west',
    region: 'p4',
    box: { minX: APPROACH_START_X, maxX: HALL_EAST_X, minZ: HALL_MIN_Z, maxZ: HALL_MAX_Z, minY: -1 },
    show: ['p3', 'p4', 'platform', 'train', 'landing']
  },
  {
    name: 'p4-east',
    region: 'p4',
    outdoor: true,
    box: { minX: HALL_EAST_X, maxX: -4.6, minZ: HALL_MIN_Z, maxZ: HALL_MAX_Z, minY: -1 },
    show: ['p4', 'platform', 'train', 'landing', 'outdoor']
  }
]

const PLATFORM = {
  name: 'platform',
  region: 'platform',
  outdoor: true,
  box: null,
  show: ['p4', 'platform', 'train', 'landing', 'outdoor']
}

// Leaving a zone needs this much overshoot, so standing on a threshold
// does not flip it back and forth.
const HYSTERESIS = 0.6

function inside(box, p, pad = 0) {
  if (!box) return false
  if (p.x < box.minX - pad || p.x > box.maxX + pad) return false
  if (p.z < box.minZ - pad || p.z > box.maxZ + pad) return false
  if (box.minY !== undefined && p.y < box.minY - pad) return false
  if (box.maxY !== undefined && p.y > box.maxY + pad) return false
  return true
}

export function zoneAt(position) {
  for (const zone of ZONES) {
    if (inside(zone.box, position)) return zone
  }
  return PLATFORM
}

// `dynamic` returns objects that move between regions (guards, cameras,
// lasers). Each is placed in the region of the zone it stands in whenever
// the visible set changes.
export function createZoneVisibility({ dynamic = () => [], onChange } = {}) {
  const regions = new Map()
  let current = null

  function addRegion(name, ...objects) {
    if (!regions.has(name)) regions.set(name, [])
    regions.get(name).push(...objects.filter(Boolean))
  }

  function apply() {
    const shown = new Set(current.show)
    for (const [name, objects] of regions) {
      const visible = shown.has(name)
      for (const object of objects) object.visible = visible
    }
    for (const object of dynamic()) {
      object.visible = shown.has(zoneAt(object.position).region)
    }
    onChange?.(current)
  }

  function update(viewer) {
    if (!viewer) return
    if (current && current.box && inside(current.box, viewer, HYSTERESIS)) return
    const next = zoneAt(viewer)
    if (next === current) return
    current = next
    apply()
  }

  return {
    addRegion,
    update,
    refresh() {
      if (current) apply()
    },
    get zone() {
      return current
    }
  }
}

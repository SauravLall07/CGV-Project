import {
  buildCarriageSpans,
  listCarriageVolumes,
  carriageVolumeAt,
  listCarriageWallBoxes,
  listCarriageInteriorBoxes,
  boxOverlapsClip
} from '../src/environment/carriage-bounds.js'

function report(label, volume, extraIncoming = []) {
  const incoming = [
    ...extraIncoming,
    ...listCarriageWallBoxes(volume),
    ...listCarriageInteriorBoxes(volume)
  ]
  const kept = incoming.filter((box) => boxOverlapsClip(box, volume))
  const byKind = {}
  for (const box of kept) {
    const k = box.kind || 'wall'
    byKind[k] = (byKind[k] || 0) + 1
  }
  const samples = incoming.slice(0, 6).map((box) => ({
    kind: box.kind || 'wall',
    x: +((box.minX + box.maxX) * 0.5).toFixed(2),
    z: +((box.minZ + box.maxZ) * 0.5).toFixed(2),
    pass: boxOverlapsClip(box, volume)
  }))
  const payload = {
    created: incoming.length,
    afterFilter: kept.length,
    clip: {
      minX: volume.minX,
      maxX: volume.maxX,
      minZ: +volume.minZ.toFixed(2),
      maxZ: +volume.maxZ.toFixed(2)
    },
    byKind,
    samples
  }
  console.log('[minimap-obstacles] enter', label, payload)
  return payload
}

const spans = buildCarriageSpans()
const volumes = listCarriageVolumes(spans)
for (const key of ['passenger', 'security', 'cargo', 'mechanical', 'vault']) {
  const volume = volumes.find((v) => v.key === key)
  report(key, volume)
}

// Same clip the minimap uses: player standing at passenger centre.
const atPassenger = carriageVolumeAt(spans.passenger.center, volumes)
console.log('[minimap-obstacles] playerAt passenger.center ->', atPassenger.key)

// Lightweight position-triggered tutorial hints.
//
// By default a zone behaves like the original hint system and uses a small HUD
// toast. Set `modal: true` on the few mechanics that deserve the large guided
// walkthrough overlay. This lets Level 1 teach new inputs without interrupting
// the player every few metres.

// Modal walkthroughs are remembered for the lifetime of this page session.
// Rebuilding/restarting levels creates new hint-system instances, but this set
// remains alive until the browser tab is reloaded/closed.
const SESSION_SEEN_MODALS = new Set()

function resolveValue(value) {
  return typeof value === 'function' ? value() : value
}

function isInside(position, center, size) {
  if (!position || !center || !size) return false

  const halfX = (size.x ?? 0) / 2
  const halfY = (size.y ?? Number.POSITIVE_INFINITY) / 2
  const halfZ = (size.z ?? 0) / 2

  return (
    Math.abs(position.x - center.x) <= halfX &&
    Math.abs(position.y - center.y) <= halfY &&
    Math.abs(position.z - center.z) <= halfZ
  )
}

export function createTutorialHintSystem({ player, hud } = {}) {
  const zones = []
  const seen = new Set()
  let disposed = false

  function addZone(zone = {}) {
    if (!zone.id) throw new Error('tutorial-hints: every zone needs a unique id')
    if (!zone.center || !zone.size) throw new Error(`tutorial-hints: zone "${zone.id}" needs center and size`)

    zones.push({ ...zone })
    return () => {
      const index = zones.findIndex((entry) => entry.id === zone.id)
      if (index >= 0) zones.splice(index, 1)
      seen.delete(zone.id)
    }
  }

  function showZone(zone) {
    const text = resolveValue(zone.text) ?? ''

    if (zone.modal && hud?.showTutorial) {
      hud.showTutorial({
        eyebrow: resolveValue(zone.eyebrow) ?? 'Field Guide',
        title: resolveValue(zone.title) ?? 'New Mechanic',
        text,
        controls: resolveValue(zone.controls) ?? [],
        footer: resolveValue(zone.footer)
      })
    } else {
      hud?.showToast?.(text, zone.duration ?? 3200)
    }
  }

  function update() {
    if (disposed) return

    // A modal tutorial freezes gameplay in main.js. Do not queue another one
    // behind it just because two trigger boxes overlap at a doorway.
    if (hud?.isTutorialOpen?.()) return

    const position = player?.mesh?.position ?? player?.position
    if (!position) return

    for (const zone of zones) {
      if (seen.has(zone.id)) continue
      if (zone.modal && SESSION_SEEN_MODALS.has(zone.id)) {
        seen.add(zone.id)
        continue
      }
      if (zone.condition && !zone.condition()) continue
      if (!isInside(position, zone.center, zone.size)) continue

      seen.add(zone.id)
      if (zone.modal) SESSION_SEEN_MODALS.add(zone.id)
      showZone(zone)
      // Only one tutorial notification per frame. This also prevents a modal
      // and a toast firing on the same threshold.
      break
    }
  }

  function reset() {
    seen.clear()
  }

  function dispose() {
    disposed = true
    zones.length = 0
    seen.clear()
  }

  return {
    addZone,
    update,
    reset,
    dispose,
    hasSeen: (id) => seen.has(id)
  }
}

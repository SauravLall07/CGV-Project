// Lightweight, non-blocking tutorial hint zones. Each hint fires once when the
// player enters its volume and delegates presentation to hud.showToast(), so it
// automatically inherits the existing fade animation and HUD styling.

export function createTutorialHintSystem({ player, hud } = {}) {
  const zones = []
  const fired = new Set()

  function addZone({ id, center, size, radius, text, duration = 2600, condition } = {}) {
    if (!id) throw new Error('tutorial-hints: every hint zone needs a stable id')
    if (!center) throw new Error(`tutorial-hints: hint "${id}" needs a center`)
    if (!text) throw new Error(`tutorial-hints: hint "${id}" needs text`)

    const zone = {
      id,
      center: { x: center.x, y: center.y ?? 0, z: center.z },
      size: size ? { x: size.x, y: size.y ?? Infinity, z: size.z } : null,
      radius: radius ?? null,
      text,
      duration,
      condition
    }

    zones.push(zone)
    return zone
  }

  function contains(zone, position) {
    if (zone.radius != null) {
      const dx = position.x - zone.center.x
      const dz = position.z - zone.center.z
      return dx * dx + dz * dz <= zone.radius * zone.radius
    }

    if (!zone.size) return false

    return (
      Math.abs(position.x - zone.center.x) <= zone.size.x / 2 &&
      Math.abs(position.z - zone.center.z) <= zone.size.z / 2 &&
      Math.abs(position.y - zone.center.y) <= zone.size.y / 2
    )
  }

  function update() {
    const position = player?.mesh?.position
    if (!position || !hud?.showToast) return

    for (const zone of zones) {
      if (fired.has(zone.id)) continue
      if (zone.condition && !zone.condition()) continue
      if (!contains(zone, position)) continue

      fired.add(zone.id)
      const message = typeof zone.text === 'function' ? zone.text() : zone.text
      hud.showToast(message, zone.duration)
    }
  }

  function reset() {
    fired.clear()
  }

  function dispose() {
    zones.length = 0
    fired.clear()
  }

  return {
    addZone,
    update,
    reset,
    dispose,
    hasFired: (id) => fired.has(id)
  }
}

// Shared AABB push-out collision. Used by both the player (player.js) and
// guard patrol movement (stealth.js) so nobody — player or guard — can walk
// through a partition wall. `position` is mutated in place; `obstacles` is
// an array of { minX, maxX, minZ, maxZ } boxes in world space.
export function resolveBoxCollision(position, obstacles, radius = 0) {
  if (!obstacles) return
  const r = Math.max(0, radius || 0)

  for (const box of obstacles) {
    if (box.enabled === false) continue

    // Point collision is still useful for guards, which intentionally call
    // this helper without a radius.
    if (r <= 0) {
      if (
        position.x > box.minX && position.x < box.maxX &&
        position.z > box.minZ && position.z < box.maxZ
      ) {
        const penLeft = position.x - box.minX
        const penRight = box.maxX - position.x
        const penNear = position.z - box.minZ
        const penFar = box.maxZ - position.z
        const minPen = Math.min(penLeft, penRight, penNear, penFar)
        if (minPen === penLeft) position.x = box.minX
        else if (minPen === penRight) position.x = box.maxX
        else if (minPen === penNear) position.z = box.minZ
        else position.z = box.maxZ
      }
      continue
    }

    // True circle-vs-AABB collision. The old implementation expanded the box
    // in X and Z, which effectively made the player a square and fattened
    // corners enough to close visually passable gaps beside furniture.
    const closestX = Math.max(box.minX, Math.min(position.x, box.maxX))
    const closestZ = Math.max(box.minZ, Math.min(position.z, box.maxZ))
    const dx = position.x - closestX
    const dz = position.z - closestZ
    const distSq = dx * dx + dz * dz

    const inside = (
      position.x > box.minX && position.x < box.maxX &&
      position.z > box.minZ && position.z < box.maxZ
    )

    if (inside) {
      // If the centre managed to enter the box (large frame, spawn, etc.),
      // push it to the nearest face plus the player's radius.
      const toLeft = position.x - box.minX
      const toRight = box.maxX - position.x
      const toNear = position.z - box.minZ
      const toFar = box.maxZ - position.z
      const minPen = Math.min(toLeft, toRight, toNear, toFar)
      if (minPen === toLeft) position.x = box.minX - r
      else if (minPen === toRight) position.x = box.maxX + r
      else if (minPen === toNear) position.z = box.minZ - r
      else position.z = box.maxZ + r
      continue
    }

    if (distSq >= r * r) continue

    const dist = Math.sqrt(distSq)
    if (dist > 1e-6) {
      const push = r - dist
      position.x += (dx / dist) * push
      position.z += (dz / dist) * push
    }
  }
}

export function resolveCircleCollision(position, circles) {
  if (!circles) return
  for (const circle of circles) {
    const dx = position.x - circle.x
    const dz = position.z - circle.z
    const distSq = dx * dx + dz * dz
    if (distSq >= circle.radius * circle.radius) continue

    const dist = Math.sqrt(distSq)
    if (dist > 1e-4) {
      const overlap = circle.radius - dist
      position.x += (dx / dist) * overlap
      position.z += (dz / dist) * overlap
    } else {
      position.x += circle.radius
    }

    if (circle.onCollide) circle.onCollide()
  }
}
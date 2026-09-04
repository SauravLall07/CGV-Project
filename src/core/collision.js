// Shared AABB push-out collision. Used by both the player (player.js) and
// guard patrol movement (stealth.js) so nobody — player or guard — can walk
// through a partition wall. `position` is mutated in place; `obstacles` is
// an array of { minX, maxX, minZ, maxZ } boxes in world space.
export function resolveBoxCollision(position, obstacles) {
  if (!obstacles) return
  for (const box of obstacles) {
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
  }
}
// Local carriage coordinates. The same cut drives shell, fixtures and map.
// roofInner is measured towards the damaged side: side * X > roofInner is open.
export const WRECK_DAMAGE = Object.freeze({
  vault:       Object.freeze({ side: 1, minZ: -0.8, maxZ: 3.0, sill: 1.35, roofInner: 1.0 }),
  convergence: Object.freeze({ side: -1, minZ: -5.0, maxZ: 10.0, sill: 0.88, roofInner: -0.48 }),
  mechanical:  Object.freeze({ side: -1, minZ: -6.2, maxZ: 3.4, sill: 0.88, roofInner: 0.25 }),
  cargo:       Object.freeze({ side: -1, minZ: -4.5, maxZ: 8.4, sill: 0.88, roofInner: -0.65 }),
  relay:       Object.freeze({ side: 1, minZ: -4.8, maxZ: -0.4, sill: 1.0, roofInner: 0.4 }),
  security:    Object.freeze({ side: 1, minZ: -4.9, maxZ: 5.2, sill: 0.88, roofInner: -0.8 }),
  passenger:   Object.freeze({ side: 1, minZ: -5.6, maxZ: 2.4, sill: 0.88, roofInner: -0.45 }),
  cab:         Object.freeze({ side: -1, minZ: 0.1, maxZ: 1.4, sill: 1.5, roofInner: 1.15 })
})

export function retainedWallRuns(key, side, minZ, maxZ) {
  const cut = WRECK_DAMAGE[key]
  if (!cut || cut.side !== side) return [[minZ, maxZ]]
  return [[minZ, Math.min(maxZ, cut.minZ)], [Math.max(minZ, cut.maxZ), maxZ]]
    .filter(([a, b]) => b - a > 0.001)
}

export function roofMissingAt(key, x, z, margin = 0) {
  const cut = WRECK_DAMAGE[key]
  return Boolean(cut && z > cut.minZ - margin && z < cut.maxZ + margin &&
    x * cut.side > cut.roofInner - margin)
}

import * as THREE from 'three'

// The head house stands east of the rails (track centre x = 7). Its public
// face looks west, back across the tracks toward the platform, which is the
// station's front. The whole footprint is outside the walkable concourse:
// the player is clamped at x = 4.3 and the west-wing passages stay at z < -14.
// Nothing here adds a collider.
//
// Screen-right while looking east (+X) is world +Z, so the locomotive nose
// (z = 26) and the steam sit on the right of the title shot. The moon is
// almost due east, so that same view puts it in the upper right.

export const FACADE_X = 23.4
export const DEPTH = 10.8
export const Z_MIN = -1.4
export const Z_MAX = 38.6
export const CENTER_Z = 18.6
export const CENTER_HALF = 7.05

export const WING_TOP = 12.05
export const PARAPET_TOP = 13.25
export const CROWN_TOP = 17.45

// Raised pad under the house and the plaza. Terrain is rewritten to this
// height so the hills and the corridor's -2.5 m floor do not cut the building.
export const LANDING_CLEAR = { minX: 8.4, maxX: 38.2, minZ: -7.5, maxZ: 46, y: -0.32 }

export const LANDING_FOCUS = new THREE.Vector3(FACADE_X - 1.5, 6.2, CENTER_Z)

// Title camera stands on the plaza, a little south of the arch, looking up
// the west face. Drift stays small so the sign and the buttons hold still.
export const LANDING_CAMERA = {
  position: { x: 10.15, y: 1.62, z: 11.35 },
  target: { x: 23.55, y: 7.35, z: 17.15 },
  driftX: 0.18,
  driftY: 0.07,
  driftZ: 0.1,
  driftSpeed: 0.055
}

// Left foreground: lower Z is screen-left when the camera looks east, and a
// larger X puts him between the camera and the doors. Yaw π/2 faces +X.
export const LANDING_FIGURE = {
  x: 13.85,
  y: 0.06,
  z: 6.15,
  yaw: Math.PI / 2
}

export function insideLanding(x, z, margin = 0) {
  const box = LANDING_CLEAR
  return x >= box.minX - margin && x <= box.maxX + margin && z >= box.minZ - margin && z <= box.maxZ + margin
}

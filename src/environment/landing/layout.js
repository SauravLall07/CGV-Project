import * as THREE from 'three'

// The head house stands east of the rails (track centre x = 7). Its public
// face looks west, back across the tracks toward the platform, which is the
// station's front. The plaza is the opening of Boarding: the detective spawns
// here, and the doors are the way into the west-wing gantry. Colliders live
// with the props; the level widens its walk clamp to cover this pad.
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
// A little south of due east, so the moon (nearly due east) sits in the
// upper right and the locomotive, further +Z, sits on the right.
export const LANDING_CAMERA = {
  position: { x: 9.9, y: 1.64, z: 19.8 },
  target: { x: 23.55, y: 6.9, z: 15.6 },
  driftX: 0.16,
  driftY: 0.06,
  driftZ: 0.1,
  driftSpeed: 0.05
}

// Left foreground: lower Z is screen-left when the camera looks east, and a
// larger X puts him between the camera and the doors. Yaw π/2 faces +X,
// so the shot sees his back.
export const LANDING_FIGURE = {
  x: 13.55,
  y: 0.05,
  z: 14.35,
  yaw: Math.PI / 2
}

// Cobbles in front of the west face. The west edge is the quay above the
// rails; the player is stopped there and cannot cross onto the track.
export const PLAZA = {
  minX: 8.7,
  maxX: FACADE_X - 0.15,
  minZ: Z_MIN - 2.2,
  maxZ: Z_MAX + 2.2,
  y: 0.05
}

export function insideLanding(x, z, margin = 0) {
  const box = LANDING_CLEAR
  return x >= box.minX - margin && x <= box.maxX + margin && z >= box.minZ - margin && z <= box.maxZ + margin
}

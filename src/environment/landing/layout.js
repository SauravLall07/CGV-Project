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

// The detective spawns on the door axis facing the doors (yaw π/2 faces +X).
// The follow camera sits behind him, a little low and looking up (negative
// pitch), so the doors, the sign on the canopy and the clock (top ≈ 10.6 m)
// all fit in a 60° view. He stands far enough forward that the camera, at
// the default 4.8 m follow distance, stays clear of the shops on the quay.
export const LANDING_FIGURE = {
  x: 13.6,
  y: 0.05,
  z: CENTER_Z,
  yaw: Math.PI / 2,
  pitch: -0.15
}

// Third-person pivot height and the default `cameraDistance` setting; the
// title shot is the same pose the New Game glide ends on. The shop fronts at
// x = 8.4 leave room for at most `maxDistance` behind the spawn.
export const LANDING_VIEW = {
  pivotHeight: 1.5,
  distance: 4.8,
  maxDistance: 5.0
}

function spawnCameraPosition() {
  const pitch = LANDING_FIGURE.pitch
  return {
    x: LANDING_FIGURE.x - Math.cos(pitch) * LANDING_VIEW.distance,
    y: LANDING_FIGURE.y + LANDING_VIEW.pivotHeight + Math.sin(pitch) * LANDING_VIEW.distance,
    z: LANDING_FIGURE.z
  }
}

// Drift runs along the door axis and up and down only, so the shot stays
// centred.
export const LANDING_CAMERA = {
  position: spawnCameraPosition(),
  target: { x: LANDING_FIGURE.x, y: LANDING_FIGURE.y + LANDING_VIEW.pivotHeight, z: LANDING_FIGURE.z },
  driftX: 0.08,
  driftY: 0.04,
  driftZ: 0,
  driftSpeed: 0.05
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

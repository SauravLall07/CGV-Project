import * as THREE from 'three'
import { getKitMaterials } from '../environment/level1-kit/kit-materials.js'
import { createKitBuilder, kbox, rod } from '../environment/level1-kit/kit-props.js'
import { createSteam } from '../environment/landing/steam.js'
import { addFloorGlows } from '../environment/landing/light-pools.js'

// Level 1's Chrono Express, built from the Level 1 kit: four deep green
// carriages with gold lining, panelled sides, curved roofs, bogies and
// underframe gear, lamplit windows with red curtains, and a steam locomotive.
//
// The front car's forward door stands open with steps down to the platform.
// That doorway is the boarding interaction. The group sits on the station
// track and the departure cinematic slides it along +Z, so the steam rolls
// away with it. Train-local y = 0 is the rail head; the platform is y = 1.

export const TRACK_X = 7
export const TRACK_LEVEL = -1
export const RAIL_OFFSET = 0.75

const CAR_LENGTH = 20
const CAR_GAP = 1.2
const CAR_COUNT = 4
const HALF = CAR_LENGTH / 2
const BODY_HALF = 1.45
const BODY_BOTTOM = 1.25
const BODY_TOP = 3.75
const FLOOR_Y = 1.55
const WALL = 0.07
const WINDOW_BOTTOM = 2.25
const WINDOW_TOP = 3.2
const WINDOW_WIDTH = 1.15
const WINDOW_Z = [-6.6, -4.95, -3.3, -1.65, 0, 1.65, 3.3, 4.95, 6.6]
const DOOR_Z = 8.9
const DOOR_WIDTH = 0.86
const DOOR_TOP = 3.5
const DROP_WIDTH = 0.5
const ROOF_RADIUS = 2.6
const ROOF_HALF = 1.52
const ROOF_ANGLE = Math.asin(ROOF_HALF / ROOF_RADIUS)
const ROOF_RISE = ROOF_RADIUS * (1 - Math.cos(ROOF_ANGLE))
const BOGIE_Z = 7
const AXLE_HALF = 1.25
const WHEEL_RADIUS = 0.46
const DOOR_OPEN_ANGLE = 0.65
const PLATFORM_END_Z = 62

export const TRAIN_LENGTH = CAR_COUNT * CAR_LENGTH + (CAR_COUNT - 1) * CAR_GAP

// Front-car doorway at world z=43.2, clear of columns and cover clusters.
const BOARDING_CAR = 0
// Fixed independently of which carriage is boarded: never slide the consist
// when relocating its open doorway.
export const TRAIN_FRONT_Z = 44.3
export const TRAIN_Z = TRAIN_FRONT_Z - TRAIN_LENGTH / 2

function carZ(index) {
  return TRAIN_LENGTH / 2 - HALF - index * (CAR_LENGTH + CAR_GAP)
}

function translate(x, y, z) {
  return new THREE.Matrix4().makeTranslation(x, y, z)
}

// Intervals of [z0, z1] left after cutting out `holes`.
function spans(z0, z1, holes) {
  const out = []
  let cursor = z0
  for (const [a, c] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (a > cursor) out.push([cursor, a])
    cursor = Math.max(cursor, c)
  }
  if (cursor < z1) out.push([cursor, z1])
  return out
}

// A box on the bodyside of side s (-1 platform, +1 far), whose outer face
// stands `outset` off the body.
function sideBox(b, mat, M, s, outset, depth, y0, y1, z0, z1, shadow = false) {
  const x = s * (BODY_HALF + outset - depth / 2)
  b.add(mat, kbox(depth, y1 - y0, z1 - z0, x, (y0 + y1) / 2, (z0 + z1) / 2), M, shadow)
}

// Rectangle of four bars around an opening; t is the bar width.
function frame(b, mat, M, s, z0, z1, y0, y1, t, outset, bottom = true) {
  if (bottom) sideBox(b, mat, M, s, outset, 0.02, y0 - t, y0, z0 - t, z1 + t)
  sideBox(b, mat, M, s, outset, 0.02, y1, y1 + t, z0 - t, z1 + t)
  sideBox(b, mat, M, s, outset, 0.02, y0, y1, z0 - t, z0)
  sideBox(b, mat, M, s, outset, 0.02, y0, y1, z1, z1 + t)
}

function sidePlane(b, mat, M, s, width, height, y, z, inset) {
  const plane = new THREE.PlaneGeometry(width, height)
  plane.rotateY(s * Math.PI / 2)
  plane.translate(s * (BODY_HALF - inset), y, z)
  b.add(mat, plane, M)
}

function lowerPanel(b, k, M, s, z, halfWidth) {
  sideBox(b, k.carriageGreen, M, s, 0.016, 0.02, 1.47, 2.03, z - halfWidth, z + halfWidth)
  frame(b, k.brass, M, s, z - halfWidth + 0.06, z + halfWidth - 0.06, 1.53, 1.97, 0.016, 0.03)
}

function bodyside(b, k, M, s, openZ) {
  const windows = WINDOW_Z.map((z) => [z - WINDOW_WIDTH / 2, z + WINDOW_WIDTH / 2])
  const closed = [-DOOR_Z, DOOR_Z].filter((z) => z !== openZ)
  const drops = closed.map((z) => [z - DROP_WIDTH / 2, z + DROP_WIDTH / 2])
  const open = openZ == null ? [] : [[openZ - DOOR_WIDTH / 2, openZ + DOOR_WIDTH / 2]]
  const doors = [-DOOR_Z, DOOR_Z].map((z) => [z - DOOR_WIDTH / 2 - 0.04, z + DOOR_WIDTH / 2 + 0.04])

  const wall = (y0, y1, holes) => {
    for (const [z0, z1] of spans(-HALF, HALF, holes)) sideBox(b, k.carriageGreen, M, s, 0, WALL, y0, y1, z0, z1, true)
  }
  wall(BODY_BOTTOM, WINDOW_BOTTOM, open)
  wall(WINDOW_BOTTOM, WINDOW_TOP, [...windows, ...drops, ...open])
  wall(WINDOW_TOP, DOOR_TOP, open)
  wall(DOOR_TOP, BODY_TOP, [])

  // Lamplit glazing set back in the openings, in brass frames.
  const windowHeight = WINDOW_TOP - WINDOW_BOTTOM
  const windowY = (WINDOW_BOTTOM + WINDOW_TOP) / 2
  for (const z of WINDOW_Z) {
    sidePlane(b, k.carriageWindow, M, s, WINDOW_WIDTH, windowHeight, windowY, z, WALL - 0.01)
    frame(b, k.brass, M, s, z - WINDOW_WIDTH / 2, z + WINDOW_WIDTH / 2, WINDOW_BOTTOM, WINDOW_TOP, 0.035, 0.012)
    lowerPanel(b, k, M, s, z, 0.62)
  }

  // Gold lining, broken at the doors.
  for (const y of [1.36, 2.13, 3.27]) {
    for (const [z0, z1] of spans(-HALF + 0.12, HALF - 0.12, doors)) {
      sideBox(b, k.brass, M, s, 0.008, 0.012, y - 0.011, y + 0.011, z0, z1)
    }
  }
  sideBox(b, k.carriageRoof, M, s, 0.03, 0.05, BODY_TOP - 0.06, BODY_TOP + 0.01, -HALF, HALF)

  // Closed doors: shut line, lining, droplight, panel, handle, grab rails
  // and a footboard.
  for (const z of closed) {
    frame(b, k.bellows, M, s, z - DOOR_WIDTH / 2, z + DOOR_WIDTH / 2, BODY_BOTTOM + 0.03, DOOR_TOP, 0.012, 0.004)
    frame(b, k.brass, M, s, z - DOOR_WIDTH / 2 + 0.07, z + DOOR_WIDTH / 2 - 0.07, BODY_BOTTOM + 0.12, DOOR_TOP - 0.07, 0.016, 0.012)
    sidePlane(b, k.carriageWindow, M, s, DROP_WIDTH, windowHeight, windowY, z, WALL - 0.01)
    frame(b, k.brass, M, s, z - DROP_WIDTH / 2, z + DROP_WIDTH / 2, WINDOW_BOTTOM, WINDOW_TOP, 0.03, 0.012)
    lowerPanel(b, k, M, s, z, 0.3)
    sideBox(b, k.brass, M, s, 0.05, 0.04, 2.13, 2.18, z - 0.36, z - 0.22)
    for (const e of [-1, 1]) {
      const rz = z + e * (DOOR_WIDTH / 2 + 0.1)
      const rx = s * (BODY_HALF + 0.06)
      b.add(k.brass, rod(new THREE.Vector3(rx, 1.75, rz), new THREE.Vector3(rx, 3.05, rz), 0.016, 6), M)
      for (const y of [1.8, 3.0]) {
        b.add(k.brass, rod(new THREE.Vector3(s * BODY_HALF, y, rz), new THREE.Vector3(rx, y, rz), 0.012, 4), M)
      }
    }
    b.add(k.iron, kbox(0.3, 0.05, DOOR_WIDTH + 0.3, s * (BODY_HALF + 0.15), 0.98, z), M)
    for (const e of [-1, 1]) {
      b.add(k.iron, kbox(0.04, 0.27, 0.05, s * (BODY_HALF + 0.05), 1.12, z + e * (DOOR_WIDTH / 2 + 0.05)), M)
    }
  }

  if (openZ != null) {
    frame(b, k.brass, M, s, openZ - DOOR_WIDTH / 2, openZ + DOOR_WIDTH / 2, BODY_BOTTOM, DOOR_TOP, 0.03, 0.012, false)
  }

  sidePlane(b, k.carriageLettering, M, s, 4.4, 0.41, 3.51, 0, -0.004)
}

function roofAndEnds(b, k, M, front, rear) {
  const roof = new THREE.CylinderGeometry(ROOF_RADIUS, ROOF_RADIUS, CAR_LENGTH - 0.02, 26, 1, true, Math.PI - ROOF_ANGLE, ROOF_ANGLE * 2)
  roof.rotateX(Math.PI / 2)
  roof.translate(0, BODY_TOP - ROOF_RADIUS * Math.cos(ROOF_ANGLE), 0)
  b.add(k.carriageRoof, roof, M, true)
  for (const s of [-1, 1]) {
    b.add(k.iron, rod(new THREE.Vector3(s * ROOF_HALF, BODY_TOP, -HALF + 0.05), new THREE.Vector3(s * ROOF_HALF, BODY_TOP, HALF - 0.05), 0.03, 6), M)
    // Rain strip a little up the curve.
    const a = ROOF_ANGLE * 0.6
    const x = s * ROOF_RADIUS * Math.sin(a)
    const y = BODY_TOP - ROOF_RADIUS * Math.cos(ROOF_ANGLE) + ROOF_RADIUS * Math.cos(a)
    b.add(k.iron, rod(new THREE.Vector3(x, y + 0.01, -HALF + 0.3), new THREE.Vector3(x, y + 0.01, HALF - 0.3), 0.018, 4), M)
  }
  // Torpedo ventilators along the ridge.
  for (let z = -7.5; z <= 7.5; z += 2.5) {
    const vent = new THREE.SphereGeometry(0.1, 10, 6)
    vent.scale(1, 0.8, 2.2)
    vent.translate(0, BODY_TOP + ROOF_RISE + 0.05, z)
    b.add(k.iron, vent, M)
  }

  // End walls up into the roof curve.
  const shape = new THREE.Shape()
  shape.moveTo(-BODY_HALF, BODY_BOTTOM)
  shape.lineTo(BODY_HALF, BODY_BOTTOM)
  shape.lineTo(BODY_HALF, BODY_TOP)
  const yOff = BODY_TOP - ROOF_RADIUS * Math.cos(ROOF_ANGLE)
  for (let i = 0; i <= 12; i += 1) {
    const t = Math.PI - ROOF_ANGLE + (i / 12) * ROOF_ANGLE * 2
    shape.lineTo(ROOF_RADIUS * Math.sin(t), yOff - ROOF_RADIUS * Math.cos(t))
  }
  shape.lineTo(-BODY_HALF, BODY_TOP)
  for (const e of [-1, 1]) {
    const end = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, curveSegments: 1 })
    end.translate(0, 0, e > 0 ? HALF - 0.08 : -HALF)
    b.add(k.carriageGreen, end, M, true)
    const coupled = e > 0 ? !front : !rear
    if (coupled) {
      b.add(k.bellows, kbox(1.0, 2.05, CAR_GAP / 2 - 0.02, 0, FLOOR_Y + 1.02, e * (HALF + CAR_GAP / 4 - 0.01)), M)
    } else {
      b.add(k.bellows, kbox(0.8, 1.95, 0.02, 0, FLOOR_Y + 0.98, e * (HALF + 0.005)), M)
    }
  }
}

function underframe(b, k, M) {
  for (const s of [-1, 1]) {
    b.add(k.iron, kbox(0.12, 0.26, CAR_LENGTH - 0.3, s * 1.22, BODY_BOTTOM - 0.13, 0), M, true)
    // Queen-post trussing.
    const x = s * 1.12
    const p = (y, z) => new THREE.Vector3(x, y, z)
    b.add(k.iron, rod(p(1.0, -8.2), p(0.66, -3), 0.025, 5), M)
    b.add(k.iron, rod(p(0.66, -3), p(0.66, 3), 0.025, 5), M)
    b.add(k.iron, rod(p(0.66, 3), p(1.0, 8.2), 0.025, 5), M)
    for (const z of [-3, 3]) b.add(k.iron, rod(p(0.66, z), p(1.12, z), 0.03, 5), M)
    b.add(k.iron, kbox(0.95, 0.45, 1.3, s * 0.6, 0.85, s * 1.6), M)
  }
  const vacuum = new THREE.CylinderGeometry(0.28, 0.28, 0.85, 16)
  vacuum.rotateZ(Math.PI / 2)
  vacuum.translate(0, 0.86, 4.6)
  b.add(k.iron, vacuum, M)
  for (const e of [-1, 1]) {
    b.add(k.iron, kbox(2.7, 0.3, 0.14, 0, 1.1, e * (HALF - 0.07)), M)
    b.add(k.iron, kbox(0.12, 0.1, 0.3, 0, 1.1, e * (HALF + 0.12)), M)
    for (const x of [-0.88, 0.88]) {
      const stock = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 10)
      stock.rotateX(Math.PI / 2)
      stock.translate(x, 1.1, e * (HALF + 0.25))
      b.add(k.iron, stock, M)
      const head = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 16)
      head.rotateX(Math.PI / 2)
      head.translate(x, 1.1, e * (HALF + 0.555))
      b.add(k.tyre, head, M)
    }
  }
}

function bogie(b, k, M) {
  for (const s of [-1, 1]) {
    b.add(k.iron, kbox(0.12, 0.3, 3.2, s * 0.98, 0.6, 0), M)
    for (const a of [-1, 1]) {
      const z = a * AXLE_HALF
      b.add(k.iron, kbox(0.2, 0.28, 0.3, s * 1.0, WHEEL_RADIUS, z), M)
      for (let i = 0; i < 3; i += 1) {
        b.add(k.pipe, kbox(0.12, 0.04, 1.1 - i * 0.25, s * 0.98, 0.79 + i * 0.04, z), M)
      }
      const disc = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.12, 18)
      disc.rotateZ(Math.PI / 2)
      disc.translate(s * RAIL_OFFSET, WHEEL_RADIUS, z)
      b.add(k.iron, disc, M)
      const flange = new THREE.CylinderGeometry(WHEEL_RADIUS + 0.04, WHEEL_RADIUS + 0.04, 0.025, 18)
      flange.rotateZ(Math.PI / 2)
      flange.translate(s * (RAIL_OFFSET - 0.07), WHEEL_RADIUS, z)
      b.add(k.iron, flange, M)
      const tyre = new THREE.TorusGeometry(WHEEL_RADIUS - 0.02, 0.025, 4, 16)
      tyre.rotateY(Math.PI / 2)
      tyre.translate(s * (RAIL_OFFSET + 0.065), WHEEL_RADIUS, z)
      b.add(k.tyre, tyre, M)
      const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10)
      hub.rotateZ(Math.PI / 2)
      hub.translate(s * (RAIL_OFFSET + 0.08), WHEEL_RADIUS, z)
      b.add(k.tyre, hub, M)
      b.add(k.iron, kbox(0.1, 0.32, 0.1, s * RAIL_OFFSET, 0.5, a * (AXLE_HALF - WHEEL_RADIUS - 0.08)), M)
    }
    for (const z of [-0.3, 0.3]) {
      const spring = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10)
      spring.translate(s * 0.98, 0.88, z)
      b.add(k.pipe, spring, M)
    }
  }
  for (const a of [-1, 1]) {
    b.add(k.iron, rod(new THREE.Vector3(-RAIL_OFFSET, WHEEL_RADIUS, a * AXLE_HALF), new THREE.Vector3(RAIL_OFFSET, WHEEL_RADIUS, a * AXLE_HALF), 0.07, 8), M)
    b.add(k.iron, kbox(1.86, 0.16, 0.16, 0, 0.62, a * 0.45), M)
  }
  b.add(k.iron, kbox(2.1, 0.16, 0.42, 0, 0.98, 0), M)
}

// The open doorway: leaf swung out on its hinge, steps down to the platform
// and the lit vestibule behind. Everything here has its own materials, so
// the interaction highlight lights the doorway and nothing else.
function createBoardingDoor(k) {
  const own = new Map()
  const mat = (source) => {
    if (!own.has(source)) own.set(source, source.clone())
    return own.get(source)
  }
  const panel = k.wainscot.clone()
  panel.emissive.set(0x5a2c12)
  panel.emissiveMap = panel.map
  panel.emissiveIntensity = 0.75

  const door = new THREE.Group()
  door.name = 'boarding-door'
  door.position.set(-BODY_HALF - 0.05, 2.0, 0)
  const content = new THREE.Group()
  content.position.set(BODY_HALF + 0.05, -2.0, 0)
  door.add(content)

  const b = createKitBuilder()
  const W = DOOR_WIDTH
  const v = (x, y, z) => new THREE.Vector3(x, y, z)

  // Tread, threshold and riser: platform (y 1.0) → 1.24 → floor 1.55.
  b.add(mat(k.iron), kbox(0.5, 0.04, 0.8, -BODY_HALF - 0.25, 1.22, 0))
  b.add(mat(k.brass), kbox(0.03, 0.045, 0.8, -BODY_HALF - 0.485, 1.222, 0))
  for (const z of [-0.39, 0.39]) {
    b.add(mat(k.iron), rod(v(-BODY_HALF - 0.48, 1.2, z), v(-BODY_HALF + 0.02, 1.52, z), 0.02, 5))
    b.add(mat(k.iron), kbox(0.5, 0.06, 0.02, -BODY_HALF - 0.25, 1.17, z))
  }
  b.add(mat(k.brass), kbox(0.14, 0.03, W, -BODY_HALF + 0.05, 1.235, 0))
  b.add(mat(k.iron), kbox(0.04, 0.3, W, -BODY_HALF + 0.14, 1.4, 0))

  // Grab rails on both jambs.
  for (const z of [-W / 2 + 0.06, W / 2 - 0.06]) {
    b.add(mat(k.brass), rod(v(-BODY_HALF + 0.1, 1.65, z), v(-BODY_HALF + 0.1, 3.2, z), 0.018, 6))
  }

  // Vestibule: carpet, panelled walls, a glazed door through to the saloon,
  // a lit ceiling and its lamp.
  const inner = BODY_HALF - WALL
  b.add(mat(k.runner), kbox(inner * 2, 0.05, 1.95, 0, FLOOR_Y - 0.025, 0.07))
  b.add(panel, kbox(inner * 2, 2.15, 0.06, 0, FLOOR_Y + 1.075, -0.95))
  b.add(panel, kbox(0.04, 2.15, 1.95, inner - 0.02, FLOOR_Y + 1.075, 0.07))
  b.add(panel, kbox(inner * 2, 2.15, 0.04, 0, FLOOR_Y + 1.075, 1.03))
  b.add(mat(k.bellows), kbox(0.8, 1.9, 0.01, 0, FLOOR_Y + 0.95, 1.005))
  const saloon = new THREE.PlaneGeometry(0.7, 1.15)
  saloon.translate(0.25, 2.8, -0.915)
  b.add(mat(k.carriageWindow), saloon)
  b.add(mat(k.brass), kbox(0.78, 0.04, 0.02, 0.25, 3.4, -0.915))
  b.add(mat(k.brass), kbox(0.78, 0.04, 0.02, 0.25, 2.2, -0.915))
  b.add(mat(k.lampShade), kbox(inner * 2, 0.04, 1.95, 0, BODY_TOP - 0.1, 0.07))
  const bulb = new THREE.SphereGeometry(0.08, 10, 6)
  bulb.translate(0, BODY_TOP - 0.2, 0.05)
  b.add(mat(k.bulb), bulb)
  // Small porter's step, beyond the x=4.5 track barrier and patrol lanes.
  // World centre (4.75, 0, 22); decor only, not a new walking obstacle.
  b.add(mat(k.wood), kbox(0.5, 0.07, 0.62, -2.25, 1.22, 0))
  for (const x of [-2.43, -2.07]) for (const z of [-0.23, 0.23]) {
    b.add(mat(k.wood), kbox(0.06, 0.19, 0.06, x, 1.095, z))
  }
  b.build(content, 'boarding-door')
  const spill = addFloorGlows(content, [{ x: -2.5, y: 1, z: 0, radius: 1.2, strength: 0.24 }], null, 0xffbd75, 'boarding-door-spill')
  spill.userData.decor = true
  spill.userData.noInteractionBlocker = true
  spill.userData.noCameraCollision = true

  // The leaf, hinged on the +Z jamb. Closed, its outer face is the bodyside.
  const hinge = new THREE.Group()
  hinge.name = 'boarding-door-leaf'
  hinge.position.set(-BODY_HALF, 0, W / 2)
  hinge.rotation.y = DOOR_OPEN_ANGLE
  content.add(hinge)
  const leafHeight = DOOR_TOP - BODY_BOTTOM - 0.02
  const leafY = (BODY_BOTTOM + DOOR_TOP) / 2
  b.add(mat(k.carriageGreen), kbox(0.06, leafHeight, W - 0.02, 0.03, leafY, -W / 2), null, true)
  const lining = (z0, z1, y0, y1, t) => {
    b.add(mat(k.brass), kbox(0.012, t, z1 - z0 + t * 2, -0.006, y0 - t / 2, (z0 + z1) / 2))
    b.add(mat(k.brass), kbox(0.012, t, z1 - z0 + t * 2, -0.006, y1 + t / 2, (z0 + z1) / 2))
    b.add(mat(k.brass), kbox(0.012, y1 - y0, t, -0.006, (y0 + y1) / 2, z0 - t / 2))
    b.add(mat(k.brass), kbox(0.012, y1 - y0, t, -0.006, (y0 + y1) / 2, z1 + t / 2))
  }
  lining(-W + 0.08, -0.08, BODY_BOTTOM + 0.12, DOOR_TOP - 0.08, 0.016)
  const drop = new THREE.PlaneGeometry(0.5, 0.72)
  drop.rotateY(-Math.PI / 2)
  drop.translate(-0.004, 2.78, -W / 2)
  b.add(mat(k.carriageWindow), drop)
  lining(-W / 2 - 0.25, -W / 2 + 0.25, 2.42, 3.14, 0.03)
  b.add(mat(k.carriageGreen), kbox(0.016, 0.55, 0.6, -0.008, 1.75, -W / 2))
  lining(-W / 2 - 0.24, -W / 2 + 0.24, 1.53, 1.97, 0.014)
  b.add(mat(k.brass), kbox(0.05, 0.05, 0.14, -0.03, 2.15, -W + 0.14))
  const back = new THREE.PlaneGeometry(W - 0.08, leafHeight - 0.1)
  back.rotateY(Math.PI / 2)
  back.translate(0.061, leafY, -W / 2)
  b.add(panel, back)
  b.build(hinge, 'boarding-door-leaf')

  return { door, hinge }
}

function addSteam(train) {
  const steams = []
  const emit = (x, y, z, options) => {
    const steam = createSteam(options)
    steam.points.position.set(x, y, z)
    steam.points.name = 'train-steam'
    train.add(steam.points)
    steams.push(steam)
  }
  // Leaking from under every car, curling out over the platform edge and
  // drifting back along the train.
  for (let i = 0; i < CAR_COUNT; i += 1) {
    emit(0.3, 0.35, carZ(i) + 4, {
      count: 22, height: 1.4, spread: 1.3, period: 8, size: 2.6,
      color: 0xa7adb5, opacity: 0.2, wind: new THREE.Vector3(-1.8, 0, -3.0), seed: 31 + i
    })
  }
  // A bank past the platform end that swallows the front of the train.
  const banks = [
    { z: PLATFORM_END_Z + 3 - TRAIN_Z, color: 0x8d939b, opacity: 0.4, seed: 51 },
    { z: 54 - TRAIN_Z, color: 0x6a7079, opacity: 0.46, seed: 52 },
    { z: 60 - TRAIN_Z, color: 0x3c4048, opacity: 0.55, seed: 53 }
  ]
  // Locomotive chimney/cylinders. All emitters move with the departing train.
  emit(0, 4.7, 56.5 - TRAIN_Z, {
    count: 34, height: 7, spread: 2, period: 9, size: 4.5,
    color: 0x9da9b5, opacity: 0.36, wind: new THREE.Vector3(-0.8, 0, -2), seed: 63
  })
  emit(-7, 0.9, 63 - TRAIN_Z, {
    count: 28, height: 3.5, spread: 5.5, period: 13, size: 5,
    color: 0x667c91, opacity: 0.28, wind: new THREE.Vector3(-0.1, 0, -0.8), seed: 64
  })
  for (const bank of banks) {
    emit(0.4, 2.6, bank.z, {
      count: 46, height: 6.5, spread: 2.4, period: 11, size: 5.5,
      color: bank.color, opacity: bank.opacity, wind: new THREE.Vector3(-1.2, 0, -2.4), seed: bank.seed
    })
  }
  emit(-0.6, 0.8, PLATFORM_END_Z - 1.5 - TRAIN_Z, {
    count: 30, height: 2.2, spread: 1.8, period: 9, size: 3.4,
    color: 0x9aa1ab, opacity: 0.28, wind: new THREE.Vector3(-1.4, 0, -3.2), seed: 57
  })
  return steams
}

function countVisual(root) {
  let drawCalls = 0
  let triangles = 0
  root.traverse((node) => {
    if (!node.isMesh || !node.visible) return
    drawCalls += 1
    const geometry = node.geometry
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
  })
  return { drawCalls, triangles: Math.round(triangles) }
}

// Objective cues are siblings of the interaction target, so highlighting the
// door cannot change their materials. Train-local coordinates keep alignment
// with the gap; the existing level teardown disposes both meshes/materials.
function createBoardingMarker(doorZ) {
  const group = new THREE.Group()
  group.name = 'boarding-objective-marker'
  const time = { value: 0 }
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const fragmentShader = `
    uniform float uTime;
    uniform float uFloor;
    uniform float uOpacity;
    uniform vec3 uGold;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      vec2 q = abs(p) - vec2(0.72, 0.80);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
      float halo = exp(-pow(d / 0.09, 2.0));
      float fill = 1.0 - smoothstep(-0.12, 0.08, d);
      float ring = halo * 0.8 + fill * 0.12;
      float edges = smoothstep(0.0, 0.18, vUv.x) * smoothstep(0.0, 0.18, 1.0-vUv.x)
        * smoothstep(0.0, 0.12, vUv.y) * smoothstep(0.0, 0.12, 1.0-vUv.y);
      float shimmer = edges * (0.88 + 0.12 * sin(vUv.y * 18.0 - uTime * 1.5));
      float pulse = 0.8 + 0.2 * cos(uTime * 6.28318530718 / 1.6);
      float alpha = mix(shimmer, ring, uFloor) * uOpacity * pulse;
      gl_FragColor = vec4(uGold * 1.8, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
  const addCue = (name, width, height, floor, opacity) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uFloor: { value: floor }, uOpacity: { value: opacity },
        uGold: { value: new THREE.Color(0xffcd75) } },
      vertexShader, fragmentShader,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    mesh.name = name
    mesh.userData.decor = true
    mesh.userData.noInteractionBlocker = true
    mesh.userData.noCameraCollision = true
    mesh.raycast = () => {}
    group.add(mesh)
    return mesh
  }
  const floor = addCue('boarding-objective-floor', 0.9, 1.6, 1, 0.42)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(4.45 - TRACK_X, 0.025 - TRACK_LEVEL, doorZ)
  const shimmer = addCue('boarding-objective-doorway', DOOR_WIDTH - 0.06, DOOR_TOP - BODY_BOTTOM, 0, 0.18)
  shimmer.rotation.y = -Math.PI / 2
  shimmer.position.set(-BODY_HALF - 0.08, (DOOR_TOP + BODY_BOTTOM) / 2, doorZ)
  return { group, update: delta => { time.value += delta } }
}

export function createTrain() {
  const k = getKitMaterials()
  const train = new THREE.Group()
  train.name = 'train'

  let b = createKitBuilder()
  const visual = new THREE.Group()
  visual.name = 'chrono-express-visual'
  const doorZ = carZ(BOARDING_CAR) + DOOR_Z
  for (let i = 0; i < CAR_COUNT; i += 1) {
    const M = translate(0, 0, carZ(i))
    bodyside(b, k, M, -1, i === BOARDING_CAR ? DOOR_Z : null)
    bodyside(b, k, M, 1, null)
    roofAndEnds(b, k, M, i === 0, i === CAR_COUNT - 1)
    underframe(b, k, M)
    for (const z of [-BOGIE_Z, BOGIE_Z]) bogie(b, k, translate(0, 0, carZ(i) + z))
    // Each 20 m car is its own material batch, allowing useful frustum culling.
    b.build(visual, `carriage-${i}`)
    b = createKitBuilder()
  }
  train.add(visual)

  const engine = new THREE.Group()
  engine.name = 'locomotive-and-tender'
  const loco = createKitBuilder()
  const part = (mat, w, h, d, x, y, z) => loco.add(mat, kbox(w, h, d, x, y, z - TRAIN_Z))
  part(k.iron, 2.5, 0.35, 14, 0, 1.05, 52.3)
  part(k.carriageGreen, 2.6, 1.7, 3.4, 0, 2.1, 46.8) // tender
  part(k.iron, 2.2, 0.2, 3.1, 0, 3, 46.8)
  part(k.carriageGreen, 2.6, 2.6, 2.1, 0, 2.65, 50)
  part(k.carriageRoof, 2.95, 0.16, 2.5, 0, 4.02, 50)
  for (const side of [-1, 1]) {
    part(k.lampShade, 0.025, 0.8, 0.8, side * 1.31, 3.1, 50)
    part(k.brass, 0.03, 0.035, 12.8, side * 1.26, 1.4, 52.3)
  }
  const boiler = new THREE.CylinderGeometry(1.02, 1.02, 6.4, 16)
  boiler.rotateX(Math.PI / 2); boiler.translate(0, 2.55, 54.2 - TRAIN_Z)
  loco.add(k.iron, boiler)
  for (const z of [52, 54, 56.4]) {
    const band = new THREE.TorusGeometry(1.03, 0.025, 4, 16)
    band.translate(0, 2.55, z - TRAIN_Z); loco.add(k.brass, band)
  }
  for (const [z, radius, height] of [[56.5, 0.25, 1.05], [53, 0.34, 0.5]]) {
    const chimney = new THREE.CylinderGeometry(radius * 1.2, radius, height, 12)
    chimney.translate(0, 3.4 + height / 2, z - TRAIN_Z); loco.add(k.iron, chimney)
  }
  for (const z of [46, 48, 51.6, 53.4, 55.2, 57.3]) for (const side of [-1, 1]) {
    const radius = z > 50 && z < 57 ? 0.69 : 0.43
    const wheel = new THREE.CylinderGeometry(radius, radius, 0.16, 16)
    wheel.rotateZ(Math.PI / 2); wheel.translate(side * 0.88, radius, z - TRAIN_Z)
    loco.add(k.iron, wheel)
    const rim = new THREE.TorusGeometry(radius - 0.04, 0.04, 4, 16)
    rim.rotateY(Math.PI / 2); rim.translate(side * 0.98, radius, z - TRAIN_Z)
    loco.add(k.brass, rim)
  }
  for (const side of [-1, 1]) part(k.brass, 0.07, 0.08, 4.2, side * 1.01, 0.72, 53.4)
  part(k.iron, 2.7, 0.3, 0.25, 0, 1.2, 58.8)
  part(k.lampShade, 0.35, 0.35, 0.1, 0, 2.8, 57.46)
  loco.build(engine, 'locomotive')
  train.add(engine)

  const { door, hinge } = createBoardingDoor(k)
  door.position.z = doorZ
  train.add(door)
  const boardingMarker = createBoardingMarker(doorZ)
  train.add(boardingMarker.group)

  // Hidden boxes so interaction rays stop at the bodies. The door target
  // stands just outside its car's box.
  const colliderMaterial = new THREE.MeshBasicMaterial()
  for (let i = 0; i < CAR_COUNT; i += 1) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(BODY_HALF * 2, BODY_TOP - BODY_BOTTOM, CAR_LENGTH), colliderMaterial)
    box.name = `carriage-${i}-collider`
    box.position.set(0, (BODY_TOP + BODY_BOTTOM) / 2, carZ(i))
    box.visible = false
    box.userData.interactionCollider = true
    train.add(box)
  }

  const steams = addSteam(train)

  train.traverse((node) => {
    if (node.isMesh && !node.userData.interactionCollider) node.userData.noInteractionBlocker = true
  })
  train.position.set(TRACK_X, TRACK_LEVEL, TRAIN_Z)
  train.updateMatrixWorld(true)

  const stats = countVisual(train)
  train.userData.drawCalls = stats.drawCalls
  train.userData.triangles = stats.triangles

  let doorTarget = DOOR_OPEN_ANGLE
  function closeDoor() {
    boardingMarker.group.visible = false
    doorTarget = 0
  }

  function update(delta) {
    boardingMarker.update(delta)
    for (const steam of steams) steam.update(delta)
    if (hinge.rotation.y > doorTarget) hinge.rotation.y = Math.max(doorTarget, hinge.rotation.y - delta * 3.4)
  }

  return { train, boardingDoor: door, closeDoor, update }
}

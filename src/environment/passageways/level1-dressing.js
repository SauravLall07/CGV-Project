import * as THREE from 'three'
import { getKitMaterials } from '../level1-kit/kit-materials.js'
import {
  at,
  bulkheadLamp,
  coatHooks,
  crate,
  crateBattens,
  createKitBuilder,
  deskChair,
  filingCabinet,
  framedPoster,
  guardDesk,
  lockers,
  luggageTrolley,
  nightWindow,
  noticeBoard,
  pipeRun,
  suitcase,
  trunk,
  wallSign,
  wasteBin
} from '../level1-kit/kit-props.js'
import { addLanterns } from '../landing/lantern.js'
import { addWallGlows } from '../landing/light-pools.js'

// Props for every Level 1 corridor and room, from the shared kit. Wall
// pieces are decor (they never block sight, interaction or the camera);
// floor pieces stand against a wall with a box collider and are kept out of
// the walking routes, guard patrols, camera sweeps, lasers and puzzles.
//
// A wall is { axis, face, out, floorY }: `axis` is the direction it runs,
// `face` its inner face coordinate, `out` the sign of the normal into the
// room. Props are placed by their position `a` along it.

const domeDown = new THREE.Matrix4().makeRotationX(Math.PI)

function wall(axis, face, out, floorY = 0) {
  const facing = axis === 'x' ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2)
  const point = (a, off) => {
    const n = face + out * off
    return axis === 'x' ? { x: a, z: n } : { x: n, z: a }
  }
  return {
    axis,
    face,
    out,
    floorY,
    point,
    lanternYaw: axis === 'x' ? (-out * Math.PI) / 2 : (out > 0 ? 0 : Math.PI),
    M(a, y = 0, off = 0) {
      const p = point(a, off)
      return at(p.x, floorY + y, p.z, facing)
    },
    rect(a0, a1, n0, n1) {
      const lo = Math.min(face + out * n0, face + out * n1)
      const hi = Math.max(face + out * n0, face + out * n1)
      return axis === 'x' ? { minX: a0, maxX: a1, minZ: lo, maxZ: hi } : { minX: lo, maxX: hi, minZ: a0, maxZ: a1 }
    },
    vec(a, y, off) {
      const p = point(a, off)
      return new THREE.Vector3(p.x, floorY + y, p.z)
    },
    inward: axis === 'x' ? new THREE.Vector3(0, 0, -out) : new THREE.Vector3(-out, 0, 0)
  }
}

const local = (M, x, y, z, yaw = 0) => new THREE.Matrix4().multiplyMatrices(M, at(x, y, z, yaw))

function createDresser(group, colliders, name) {
  const k = getKitMaterials()
  const kit = createKitBuilder()
  const decor = createKitBuilder()
  const lanterns = []
  const glows = []
  const counts = {}
  let room = 'room'
  const tally = (item, n = 1) => {
    counts[room] ??= {}
    counts[room][item] = (counts[room][item] ?? 0) + n
  }
  const solid = (r) => colliders.push(r)

  const d = {
    k,
    kit,
    decor,
    tally,
    room(next) { room = next },
    lantern(w, a, y = 2.6) {
      const p = w.point(a, 0.3)
      lanterns.push({ x: p.x, y: w.floorY + y, z: p.z, yaw: w.lanternYaw })
      const g = w.point(a, 0.02)
      glows.push({ x: g.x, y: w.floorY + y + 0.15, z: g.z, yaw: w.lanternYaw, width: 1.9, height: 2.3, strength: 0.24 })
      tally('wall lantern')
    },
    poster(w, a, y, index, pw = 0.62, ph = 0.9) {
      framedPoster(decor, k, w.M(a, y, 0.005), index, pw, ph)
      tally('framed poster')
    },
    notice(w, a, y, nw = 1.1, nh = 0.8) {
      noticeBoard(decor, k, w.M(a, y, 0.005), nw, nh)
      tally('notice board')
    },
    sign(w, a, y, text, sw = 1.6) {
      wallSign(decor, k, w.M(a, y, 0.005), k.sign(text), sw, 0.32)
      tally('sign')
    },
    pipes(w, a0, a1, runs) {
      for (const [y, off, radius, mat] of runs) {
        pipeRun(decor, k, w.vec(a0, y, off), w.vec(a1, y, off), radius, mat ?? k.pipe, w.inward)
      }
      tally('ceiling pipe run', runs.length)
    },
    bulkhead(x, y, z) {
      bulkheadLamp(decor, k, at(x, y, z).multiply(domeDown))
      tally('caged bulkhead lamp')
    },
    window(w, a, y, ww = 2.4, wh = 1.4) {
      nightWindow(decor, k, w.M(a, y, 0), ww, wh)
      tally('window to the platform')
    },
    // Floor clusters, back against the wall. Returns nothing; adds colliders.
    cluster(w, a, kind) {
      const M = w.M(a)
      if (kind === 'crates') {
        crate(kit, k, local(M, -0.3, 0, 0.42), 0.9, 0.8, 0.8)
        crate(kit, k, local(M, -0.28, 0.8, 0.44, 0.18), 0.55, 0.45, 0.55)
        trunk(kit, k, local(M, 0.45, 0, 0.3, 0.06), 0.55, 0.42, 0.5)
        solid(w.rect(a - 0.76, a + 0.76, 0, 0.86))
        tally('crate', 2)
        tally('trunk')
      } else if (kind === 'trunks') {
        trunk(kit, k, local(M, 0, 0, 0.3), 0.9, 0.45, 0.55)
        trunk(kit, k, local(M, 0.03, 0.45, 0.3, -0.08), 0.72, 0.38, 0.48)
        suitcase(kit, k, local(M, 0, 0.83, 0.3, 0.1), 0.5, 0.36, 0.16)
        solid(w.rect(a - 0.5, a + 0.5, 0, 0.6))
        tally('trunk', 2)
        tally('suitcase')
      } else if (kind === 'cases') {
        suitcase(kit, k, local(M, -0.08, 0, 0.26), 0.66, 0.18, 0.44, { lying: true })
        suitcase(kit, k, local(M, -0.06, 0.18, 0.25, 0.12), 0.56, 0.16, 0.38, { lying: true, material: k.coatTan })
        suitcase(kit, k, local(M, 0.42, 0, 0.12, -0.08), 0.4, 0.34, 0.15)
        solid(w.rect(a - 0.43, a + 0.64, 0, 0.5))
        tally('suitcase', 3)
      } else if (kind === 'trolley') {
        luggageTrolley(kit, k, local(M, 0, 0, 0.6, Math.PI / 2))
        solid(w.rect(a - 0.9, a + 0.9, 0, 1.18))
        tally('luggage trolley (loaded)')
      }
    },
    bin(w, a) {
      const p = w.point(a, 0.25)
      wasteBin(kit, k, at(p.x, w.floorY, p.z))
      solid(w.rect(a - 0.19, a + 0.19, 0.06, 0.44))
      tally('waste bin')
    },
    desk(w, a) {
      guardDesk(kit, k, w.M(a))
      deskChair(kit, k, local(w.M(a), 0.05, 0, 0.9, Math.PI))
      solid(w.rect(a - 0.62, a + 0.62, 0, 0.66))
      solid(w.rect(a - 0.18, a + 0.28, 0.66, 1.14))
      tally('guard desk')
      tally('telephone')
      tally('desk lamp')
      tally('chair')
    },
    lockers(w, a, count = 3) {
      lockers(kit, k, w.M(a), count)
      solid(w.rect(a - count * 0.21, a + count * 0.21, 0, 0.47))
      tally('locker', count)
    },
    coats(w, a, length = 0.9) {
      coatHooks(kit, k, w.M(a, 1.75), length)
      solid(w.rect(a - length / 2, a + length / 2, 0, 0.34))
      tally('coat hook rail')
      tally('coat', 2)
      tally('hat')
    },
    filing(w, a) {
      filingCabinet(kit, k, w.M(a))
      solid(w.rect(a - 0.25, a + 0.25, 0, 0.63))
      tally('filing cabinet')
    },
    build() {
      kit.build(group, `${name}-props`)
      decor.build(group, `${name}-decor`, { decor: true })
      if (lanterns.length) {
        const lanternGroup = new THREE.Group()
        lanternGroup.name = `${name}-lanterns`
        addLanterns(lanternGroup, lanterns, { iron: k.iron, lantern: k.lantern })
        addWallGlows(lanternGroup, glows, null, 0xff9e52, `${name}-lantern-glow`)
        lanternGroup.traverse((node) => {
          node.userData.decor = true
          node.userData.noInteractionBlocker = true
          node.userData.noCameraCollision = true
        })
        group.add(lanternGroup)
      }
      group.userData.propCounts = { ...(group.userData.propCounts ?? {}), ...counts }
    }
  }
  return d
}

// Passageway 0: the onboarding gallery behind the blast door.
export function dressOnboardingGallery(group, colliders) {
  const d = createDresser(group, colliders, 'onboarding')
  const { k } = d
  const north = wall('x', -27.38, 1)
  const south = wall('x', -21.62, -1)
  d.room('Passageway 0 gallery')

  // The two old plain luggage boxes become stencilled crates.
  for (const [nodeName, size] of [['onboarding-luggage-a', [1.25, 1.0, 0.72]], ['onboarding-luggage-b', [1.0, 0.8, 0.72]]]) {
    const box = group.getObjectByName(nodeName)
    if (!box) continue
    box.material = k.crate
    crateBattens(d.kit, k, at(box.position.x, 0, box.position.z), ...size)
    d.tally('crate')
  }

  d.pipes(north, -176.6, -161.6, [[4.75, 0.16, 0.07], [4.45, 0.13, 0.045, k.copper]])
  d.pipes(south, -176.6, -161.6, [[4.85, 0.16, 0.055]])
  d.lantern(north, -174.5)
  d.lantern(south, -170.5)
  d.lantern(north, -166.5)
  d.lantern(south, -162.8)
  d.poster(north, -172.5, 2.4, 6)
  d.poster(north, -164.5, 2.4, 7)
  d.sign(north, -170.5, 3.4, 'PLATFORMS  \u2192', 1.5)
  d.poster(south, -174.5, 2.4, 1)
  d.notice(south, -168.6, 2.2)
  d.poster(south, -165.2, 2.4, 3)

  d.cluster(north, -175.2, 'trunks')
  d.cluster(north, -164.6, 'crates')
  d.cluster(south, -172.2, 'cases')
  d.cluster(south, -163.4, 'trolley')
  d.build()
}

// Passageway 1 beyond the arrival hall: the security-training gallery,
// the turn room behind the cipher door and the lower landing.
export function dressTutorialPassage(group, colliders) {
  const d = createDresser(group, colliders, 'tutorial')
  const north = wall('x', -27.38, 1)
  const south = wall('x', -21.62, -1)

  // The gallery already has pipes, eight lanterns, bulkheads, a green door,
  // a window and crate-dressed cover. Notices, posters, signs and luggage
  // clear of the camera sweep (x -153..-139), the timed grid and the puzzle.
  d.room('Passageway 1 gallery')
  d.notice(north, -143.6, 2.2)
  d.poster(north, -137.9, 2.4, 2)
  d.poster(south, -147.7, 2.4, 5)
  d.poster(south, -141.6, 2.4, 0)
  d.sign(north, -147.5, 3.3, 'PLATFORMS  \u2192', 1.4)
  d.sign(south, -133.6, 3.4, '\u2190  LOWER CONCOURSE', 1.7)
  d.cluster(north, -138.6, 'crates')
  d.cluster(south, -137.3, 'trunks')

  // Turn room: the office behind the first security door. The route runs
  // from the door (west wall) to the stair opening (north wall, x -130.6..
  // -127.4), so the furniture lines the south and east walls.
  d.room('Passageway 1 turn room (security office)')
  const tSouth = wall('x', -21.625, -1)
  const tEast = wall('z', -126.125, -1)
  d.desk(tSouth, -130.4)
  d.filing(tSouth, -129.2)
  d.notice(tSouth, -129.8, 2.15, 1.0, 0.7)
  d.lockers(tEast, -25.0, 3)
  d.coats(tEast, -26.6, 0.8)
  d.lantern(tEast, -23.5, 2.4)

  // Lower landing: stairs arrive at x -129, the exit is the east side.
  d.room('Passageway 1 lower landing')
  const lWest = wall('z', -131.875, 1, -4)
  const lSouth = wall('x', -39.875, 1, -4)
  d.cluster(lWest, -39.0, 'crates')
  d.poster(lSouth, -129.6, 2.4, 4)
  d.sign(lSouth, -129.6, 3.6, 'PASSAGEWAY 2  \u2192', 1.6)
  d.lantern(lSouth, -127.4)
  d.pipes(lSouth, -131.6, -126.2, [[4.75, 0.16, 0.06]])
  d.build()
}

// Passageway 2: the guard-training hall and the bay behind its exit door.
export function dressGuardPassage(group, colliders) {
  const d = createDresser(group, colliders, 'guards')
  const { k } = d
  const floor = -4
  const minZ = wall('x', -41.78, 1, floor)
  const maxZ = wall('x', -34.82, -1, floor)
  const entryMinZ = wall('x', -39.88, 1, floor)
  const entryMaxZ = wall('x', -36.72, -1, floor)

  d.room('Passageway 2 entry corridor')
  d.lantern(entryMinZ, -124)
  d.poster(entryMaxZ, -124, 2.4, 6)
  d.pipes(entryMaxZ, -125.8, -122.2, [[4.6, 0.15, 0.06]])

  // Main hall. Floor clusters only where no guard, camera, laser or puzzle
  // plate is: the west shoulders and the stretch before the exit door.
  // Guard 1 crosses at x -116.6, guard 2 walks x -110..-104.4, the camera
  // and both lasers cover x -102..-92.8, the plates sit at x -90.1..-86.
  d.room('Passageway 2 guard hall')
  d.pipes(minZ, -121.6, -84.2, [[4.6, 0.16, 0.07], [4.35, 0.13, 0.045, k.copper]])
  d.pipes(maxZ, -121.6, -102.2, [[4.72, 0.16, 0.06]])
  d.pipes(maxZ, -99.2, -84.2, [[4.72, 0.16, 0.06]])
  for (const x of [-116, -108, -100, -92, -86]) d.lantern(minZ, x)
  for (const x of [-120, -112, -104, -96, -84.6]) d.lantern(maxZ, x)
  d.poster(maxZ, -117.5, 2.4, 1)
  d.poster(maxZ, -109, 2.4, 3)
  d.poster(maxZ, -98.4, 2.4, 5)
  d.poster(maxZ, -92.2, 2.5, 7)
  d.notice(minZ, -113.6, 2.2)
  d.poster(minZ, -105, 2.4, 2)
  d.poster(minZ, -96.2, 2.4, 4)
  d.notice(minZ, -88.6, 2.3)
  d.sign(minZ, -110.5, 3.4, 'PLATFORMS  \u2192', 1.5)
  d.sign(maxZ, -114, 3.4, '\u2190  PLATFORMS', 1.5)
  d.cluster(maxZ, -121.2, 'cases')
  d.cluster(minZ, -121.1, 'trunks')
  d.cluster(maxZ, -91.2, 'crates')
  d.cluster(minZ, -91.4, 'cases')
  d.cluster(maxZ, -85.2, 'trunks')
  d.cluster(minZ, -85.0, 'crates')

  // Exit bay: the guard post behind the security door. The route runs
  // straight from the door to the vent (z -39.1..-37.5).
  d.room('Passageway 2 exit bay (guard post)')
  const bayMinZ = wall('x', -40.88, 1, floor)
  const bayMaxZ = wall('x', -35.72, -1, floor)
  d.desk(bayMinZ, -82.5)
  d.filing(bayMinZ, -80.75)
  d.notice(bayMinZ, -82.5, 2.1, 0.9, 0.6)
  d.lockers(bayMaxZ, -82.27, 3)
  d.coats(bayMaxZ, -81.0, 0.8)
  d.build()
}

// Passageway 3: vent landing, the guarded south hall, the laser passage,
// the relay chamber and the stair return.
export function dressBridgePassage(group, colliders) {
  const d = createDresser(group, colliders, 'bridge')
  const { k } = d
  const floor = -4
  const ceiling = 0.9

  d.room('Passageway 3 entry room')
  const eEast = wall('z', -69.82, -1, floor)
  const eNorth = wall('x', -36.02, -1, floor)
  d.cluster(eEast, -36.7, 'trunks')
  d.lantern(eNorth, -72.1)
  d.poster(eEast, -39.2, 2.4, 0)
  d.pipes(eNorth, -74.2, -70.0, [[4.6, 0.15, 0.06]])

  // South hall: guard A, two cover boxes and the camera. Walls only.
  d.room('Passageway 3 south hall')
  const sWest = wall('z', -74.38, 1, floor)
  const sEast = wall('z', -69.82, -1, floor)
  d.lantern(sWest, -43.5)
  d.lantern(sEast, -45.6)
  d.poster(sEast, -42.8, 2.4, 6)
  d.notice(sWest, -41.4, 2.25, 0.9, 0.6)
  d.pipes(sEast, -40.9, -46.4, [[4.6, 0.15, 0.06]])

  d.room('Passageway 3 south room')
  const rWest = wall('z', -74.38, 1, floor)
  const rSouth = wall('x', -51.28, 1, floor)
  d.cluster(rSouth, -73.6, 'trunks')
  d.cluster(rWest, -49.6, 'crates')
  d.lantern(rSouth, -71.4)
  d.sign(rSouth, -71.4, 3.7, 'PLATFORMS  \u2192', 1.4)

  // The laser passage (reference 03): caged bulkheads, pipes, the window
  // onto the platform. Its floor is all laser rows, so the stencilled
  // crates and the loaded trolley stand in the rooms at either end.
  d.room('Passageway 3 laser passage')
  const hSouth = wall('x', -51.28, 1, floor)
  const hNorth = wall('x', -46.72, -1, floor)
  for (const x of [-68.2, -63.6]) d.bulkhead(x, ceiling, -49)
  d.pipes(hNorth, -69.6, -61.5, [[4.62, 0.16, 0.07], [4.38, 0.13, 0.045, k.copper]])
  d.pipes(hSouth, -69.6, -61.5, [[4.7, 0.16, 0.055]])
  d.window(hSouth, -65.5, 2.6, 2.4, 1.4)
  d.lantern(hNorth, -67.6)
  d.lantern(hNorth, -63.4)

  d.room('Passageway 3 laser room')
  const lrSouth = wall('x', -51.28, 1, floor)
  const lrEast = wall('z', -56.72, -1, floor)
  d.cluster(lrSouth, -59.8, 'trolley')
  d.lantern(lrEast, -49)
  d.poster(lrEast, -50.4, 2.4, 3)
  d.pipes(lrEast, -51.1, -46.8, [[4.6, 0.15, 0.06]])

  d.room('Passageway 3 security hall')
  const shWest = wall('z', -61.28, 1, floor)
  const shEast = wall('z', -56.72, -1, floor)
  d.lantern(shWest, -44.15)
  d.poster(shEast, -44.15, 2.4, 1)

  // Relay chamber, behind the last security door: the guard's office
  // furniture lines the south wall either side of the entrance.
  d.room('Passageway 3 relay chamber (security office)')
  const pSouth = wall('x', -43.58, 1, floor)
  const pWest = wall('z', -64.13, 1, floor)
  d.desk(pSouth, -62.9)
  d.notice(pSouth, -62.9, 2.15, 0.9, 0.6)
  d.lockers(pSouth, -55.27, 3)
  d.filing(pSouth, -54.33)
  d.coats(pWest, -43.15, 0.6)

  d.room('Passageway 3 stair landings')
  const vWest = wall('z', -61.28, 1, floor)
  const vEast = wall('z', -56.72, -1, floor)
  const mNorth = wall('x', -22.22, -1, -2)
  d.lantern(vWest, -34)
  d.poster(vEast, -34, 2.4, 2)
  d.cluster(mNorth, -60.6, 'trunks')
  d.poster(mNorth, -58.2, 2.3, 5)
  d.build()
}

// The approach hall (reference 02) is already furnished; this adds its
// notices, signs and luggage in the free wall stretches, clear of the
// patrol at x -37..-31 and the gates at x -40, -29 and -18.
export function dressApproachHall(group, colliders) {
  const d = createDresser(group, colliders, 'hall')
  // Plaster faces for wall pieces; floor pieces stand on the skirting.
  const zMin = wall('x', -27.1, 1)
  const zMax = wall('x', -21.9, -1)
  const zMinFloor = wall('x', -26.99, 1)
  const zMaxFloor = wall('x', -22.01, -1)
  d.room('Approach hall')
  d.notice(zMin, -10.0, 2.3)
  d.notice(zMax, -25.5, 2.4)
  d.sign(zMin, -49.8, 3.2, 'PLATFORMS  \u2192', 1.5)
  d.sign(zMin, -16.0, 3.6, 'PLATFORM 1  \u2192', 1.5)
  d.sign(zMax, -38.6, 3.7, '\u2190  PLATFORMS', 1.5)
  d.cluster(zMaxFloor, -49.0, 'trunks')
  d.cluster(zMaxFloor, -15.6, 'cases')
  d.cluster(zMaxFloor, -1.0, 'crates')
  d.cluster(zMinFloor, -2.0, 'trunks')
  d.bin(zMinFloor, -6.6)
  d.build()
}

import * as THREE from 'three'
import { getKitMaterials } from '../level1-kit/kit-materials.js'
import {
  at,
  createKitBuilder,
  cushionedBench,
  departureBoard,
  framedPoster,
  luggageTrolley,
  newspaperStand,
  pendantLamp,
  pottedPalm,
  kbox,
  suitcase,
  ticketOffice,
  trunk,
  wallClock,
  wallSign,
  wasteBin
} from '../level1-kit/kit-props.js'

// The ticket hall the player arrives in through the station door
// (reference 02): Passageway 1's west end, between the Passageway 0 blast
// door at x -161.15 and the first sweeping laser (west limit x -153.25).
// Everything stands against the two long walls, leaving z -26.45..-22.8
// clear down the middle, and every floor piece gets a box collider.

const NORTH = -27.38
const SOUTH = -21.62
const PARTITION = -161.025
const PASSAGE_ENTRY_FACE = -158.72
const CENTER_Z = -24.5
const CEILING = 5.1

function scaled(M, sx, sy, sz) {
  return M.multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
}

function stationExit(decor, k, transform) {
  const wood = (w, h, d, x, y, z) => decor.add(k.entranceWood, kbox(w, h, d, x, y, z), transform)
  const glass = (w, h, x, y, z) => decor.add(k.entranceGlass, kbox(w, h, 0.04, x, y, z), transform)
  const doorWidth = 1.38
  const doorSpan = doorWidth + 0.42

  // The same three glazed timber doors seen outside the main station entrance.
  // These are decorative: the existing solid rear wall still controls collision
  // and the exterior E interaction still handles entry into the station.
  for (const center of [-doorSpan, 0, doorSpan]) {
    for (const side of [-1, 1]) {
      wood(0.12, 3.15, 0.12, center + side * doorWidth / 2, 1.575, 0.12)
    }
    wood(doorWidth, 0.1, 0.12, center, 3.1, 0.12)
    wood(doorWidth - 0.18, 1.35, 0.1, center, 0.75, 0.15)
    wood(0.06, 3.05, 0.09, center, 1.55, 0.17)
    for (const offset of [-0.29, 0.29]) {
      glass(0.51, 1.45, center + offset, 2.18, 0.19)
    }
    glass(doorWidth - 0.16, 0.42, center, 3.4, 0.19)
    for (const offset of [-doorWidth / 6, doorWidth / 6]) {
      wood(0.03, 0.42, 0.06, center + offset, 3.4, 0.22)
    }
  }

  // A common surround makes the three doors read as one station entrance.
  for (const side of [-1, 1]) {
    wood(0.16, 3.8, 0.18, side * 2.61, 1.9, 0.09)
  }
  wood(5.38, 0.17, 0.18, 0, 3.78, 0.09)
}

export function dressArrivalHall(group, colliders) {
  const k = getKitMaterials()
  const kit = createKitBuilder()
  const decor = createKitBuilder()
  const entrance = createKitBuilder()
  const solid = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ })

  // North wall, west to east: palm, bench, luggage, bench, newspaper stand,
  // luggage, palm, bin.
  const northZ = NORTH + 0.4
  const palm = (x, z) => {
    pottedPalm(kit, k, at(x, 0, z, x * 1.7), 0.85)
    solid(x - 0.24, x + 0.24, z - 0.24, z + 0.24)
  }
  const bench = (x, z, yaw, length) => {
    cushionedBench(kit, k, scaled(at(x, 0, z, yaw), 1, 1, length / 2))
    solid(x - length / 2, x + length / 2, z - 0.42, z + 0.42)
  }
  palm(-160.62, northZ)
  bench(-159.6, NORTH + 0.45, -Math.PI / 2, 1.4)
  trunk(kit, k, at(-158.45, 0, northZ), 0.78, 0.4, 0.5)
  suitcase(kit, k, at(-158.42, 0.4, northZ + 0.02, 0.06), 0.62, 0.17, 0.4, { lying: true })
  suitcase(kit, k, at(-158.48, 0.57, northZ, -0.14), 0.5, 0.15, 0.34, { lying: true, material: k.coatTan })
  solid(-158.85, -158.05, NORTH, northZ + 0.28)
  bench(-157.3, NORTH + 0.45, -Math.PI / 2, 1.4)
  newspaperStand(kit, k, at(-156.15, 0, NORTH + 0.02))
  solid(-156.51, -155.79, NORTH, NORTH + 0.48)
  trunk(kit, k, at(-155.35, 0, northZ, 0.04), 0.72, 0.44, 0.52)
  suitcase(kit, k, at(-155.33, 0.44, northZ + 0.03, -0.1), 0.56, 0.16, 0.38, { lying: true, material: k.coatTan })
  suitcase(kit, k, at(-155.38, 0.6, northZ - 0.02, 0.12), 0.46, 0.34, 0.15)
  solid(-155.72, -154.98, NORTH, northZ + 0.28)
  palm(-154.68, northZ)
  wasteBin(kit, k, at(-154.1, 0, NORTH + 0.25))
  solid(-154.29, -153.91, NORTH, NORTH + 0.44)

  // South wall: loaded porter's trolley, the ticket office, palm, bench.
  luggageTrolley(kit, k, at(-159.95, 0, SOUTH - 0.6, Math.PI / 2))
  solid(-160.85, -159.05, SOUTH - 1.18, SOUTH)
  ticketOffice(kit, k, at(-157.5, 0, SOUTH, Math.PI), 2.9, 3)
  solid(-159.02, -155.98, SOUTH - 0.64, SOUTH)
  palm(-155.62, SOUTH - 0.4)
  bench(-154.45, SOUTH - 0.45, Math.PI / 2, 1.3)

  // Walls: six posters, the clock, the platform sign.
  framedPoster(decor, k, at(-159.6, 2.35, NORTH + 0.005, 0), 0, 0.7, 1.0)
  framedPoster(decor, k, at(-156.15, 2.5, NORTH + 0.005, 0), 2, 0.62, 0.9)
  framedPoster(decor, k, at(-159.95, 2.4, SOUTH - 0.005, Math.PI), 3, 0.7, 1.0)
  framedPoster(decor, k, at(-154.2, 2.4, SOUTH - 0.005, Math.PI), 4, 0.62, 0.9)
  framedPoster(decor, k, at(PARTITION + 0.005, 2.0, -26.9, Math.PI / 2), 5, 0.55, 0.8)
  framedPoster(decor, k, at(PARTITION + 0.005, 2.0, -22.1, Math.PI / 2), 1, 0.55, 0.8)
  // Keep the entrance style consistent with the landing facade.
  // Put the return-facing doors on the ROOM side of the solid west wall.
  // Previously they were behind the wall, making the whole entrance invisible.
  stationExit(entrance, k, at(PASSAGE_ENTRY_FACE, 0, CENTER_Z, Math.PI / 2))
  wallClock(decor, k, at(-157.3, 3.2, NORTH, 0), 0.55)
  wallSign(decor, k, at(-159.6, 3.45, NORTH, 0), k.sign('TO PLATFORMS  \u2192'), 1.7, 0.34)

  // Ceiling: brass pendants down the middle and the departure board,
  // hung high enough to stay clear of the follow camera.
  for (const x of [-160.4, -157.7, -155.0]) pendantLamp(decor, k, at(x, CEILING, CENTER_Z), 1.2)
  departureBoard(decor, k, at(-153.95, 4.1, CENTER_Z, -Math.PI / 2), 2.4, 0.9, CEILING - 4.1 - 0.45)

  kit.build(group, 'arrival-hall-kit')
  decor.build(group, 'arrival-hall-decor', { decor: true })
  // The entry doors must remain raycastable for the follow camera. Keep them
  // decorative for guard sight and interaction, but unlike other wall dressing
  // do NOT set noCameraCollision (which allowed the camera through the doors).
  for (const mesh of entrance.build(group, 'arrival-hall-entrance')) {
    mesh.userData.decor = true
    mesh.userData.noInteractionBlocker = true
  }
}

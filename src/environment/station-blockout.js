import * as THREE from 'three'
import { TRACK_LEVEL, TRACK_X } from '../entities/train.js'
import { createHumanoid, GUARD_PALETTE } from '../entities/humanoid.js'
import {
  carpetMaterial,
  marbleFloorMaterial,
  metalMaterial,
  plasterMaterial,
  signMaterial,
  woodMaterial
} from './textures.js'

// Level 1's station: a covered platform with a marble concourse, cast-iron
// columns under a glazed train shed, a panelled rear wall with lit arched
// windows, and the track trench alongside. Still primitives — no modelled or
// downloaded assets — but textured and lit for the concept doc's "warm,
// controlled, believable" Level 1 identity rather than left as greybox.
//
// The platform surface is y = 0 and the track floor is TRACK_LEVEL, so the
// train's floor lines up with the platform and its wheels sit in the trench.

export const PLATFORM_WIDTH = 10
export const PLATFORM_LENGTH = 40

const HALF_WIDTH = PLATFORM_WIDTH / 2
const HALF_LENGTH = PLATFORM_LENGTH / 2
const ROOF_Y = 6
const WALL_X = -HALF_WIDTH
const PILLAR_X = 4.6
const PILLAR_Z = [-16, -8, 0, 8, 16]

// Axis-aligned bounds the player is clamped to. Inset from the platform edge
// so the player stops short of the coping stone rather than hovering over the
// track, and short of the rear wall.
export const bounds = {
  minX: -HALF_WIDTH + 0.7,
  maxX: 4.3,
  minZ: -HALF_LENGTH + 0.8,
  maxZ: HALF_LENGTH - 0.8
}

function createConcourse() {
  const group = new THREE.Group()

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATFORM_WIDTH, PLATFORM_LENGTH),
    marbleFloorMaterial({ repeat: [5, 20], base: 0xa89a86, vein: 0x6a6053, grout: 0x453e35 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // Coping stone and the tactile safety strip that runs along the edge.
  const coping = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.1, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0xb9b09c, roughness: 0.72 })
  )
  coping.position.set(HALF_WIDTH - 0.22, 0.05, 0)
  coping.receiveShadow = true
  group.add(coping)

  const safetyLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.03, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0xd8a63c, roughness: 0.6, emissive: 0x3a2a08, emissiveIntensity: 1 })
  )
  safetyLine.position.set(HALF_WIDTH - 0.75, 0.03, 0)
  group.add(safetyLine)

  // The vertical face dropping from the platform down past the rail head to
  // the ballast.
  const edgeFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 1.5, PLATFORM_LENGTH),
    plasterMaterial({ repeat: [1, 20], base: 0x50483f, roughness: 0.9 })
  )
  edgeFace.position.set(HALF_WIDTH, -0.75, 0)
  edgeFace.receiveShadow = true
  group.add(edgeFace)

  return group
}

function createTrackBed() {
  const group = new THREE.Group()
  const length = PLATFORM_LENGTH + 16

  // TRACK_LEVEL is the top of the rail head — the height the train's wheel
  // treads rest on — so everything here stacks downwards from it.
  const ballast = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.4, length),
    plasterMaterial({ repeat: [3, 24], base: 0x3b3830, roughness: 1 })
  )
  ballast.position.set(TRACK_X, TRACK_LEVEL - 0.5, 0)
  ballast.receiveShadow = true
  group.add(ballast)

  // Sleepers: one InstancedMesh for the whole run rather than ~55 meshes.
  const sleeperCount = Math.floor(length / 0.8)
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.8, 0.14, 0.28),
    woodMaterial({ repeat: [2, 1], light: 0x4a3826, dark: 0x241a11, roughness: 0.95 }),
    sleeperCount
  )
  const dummy = new THREE.Object3D()
  for (let i = 0; i < sleeperCount; i++) {
    dummy.position.set(TRACK_X, TRACK_LEVEL - 0.25, -length / 2 + i * 0.8 + 0.4)
    dummy.updateMatrix()
    sleepers.setMatrixAt(i, dummy.matrix)
  }
  sleepers.instanceMatrix.needsUpdate = true
  sleepers.receiveShadow = true
  group.add(sleepers)

  const railMaterial = metalMaterial({ repeat: [1, 30], base: 0x8d8a83, roughness: 0.34, metalness: 0.95 })
  for (const offset of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, length), railMaterial)
    rail.position.set(TRACK_X + offset, TRACK_LEVEL - 0.09, 0)
    rail.castShadow = true
    group.add(rail)
  }

  return group
}

function createRearWall() {
  const group = new THREE.Group()

  const wainscot = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.5, PLATFORM_LENGTH),
    woodMaterial({ repeat: [1, 16], light: 0x7c5330, dark: 0x3d2615 })
  )
  wainscot.position.set(WALL_X - 0.2, 0.75, 0)
  wainscot.receiveShadow = true
  group.add(wainscot)

  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, ROOF_Y - 0.9, PLATFORM_LENGTH),
    plasterMaterial({ repeat: [2, 14], base: 0x8e8172 })
  )
  upper.position.set(WALL_X - 0.2, 1.5 + (ROOF_Y - 0.9) / 2, 0)
  upper.receiveShadow = true
  group.add(upper)

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0xa9832f, roughness: 0.35, metalness: 0.85 })
  )
  rail.position.set(WALL_X - 0.16, 1.55, 0)
  group.add(rail)

  // Arched windows: dusk light coming in from outside the station.
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fb4d8,
    emissive: 0xbcd0f0,
    emissiveIntensity: 1.5,
    roughness: 0.2
  })
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7, metalness: 0.3 })
  const paneGeometry = new THREE.BoxGeometry(0.08, 2.4, 1.5)
  // A half-cylinder is a semicircular disc lying in XZ with its thickness in
  // Y; rotating it a quarter turn about Z stands it up as an arch head facing
  // down the platform, with its flat edge sitting on top of the pane.
  const archGeometry = new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16, 1, false, 0, Math.PI)
  archGeometry.rotateZ(Math.PI / 2)
  const frameGeometry = new THREE.BoxGeometry(0.05, 2.6, 1.7)

  for (let z = -15; z <= 15; z += 6) {
    const frame = new THREE.Mesh(frameGeometry, frameMaterial)
    frame.position.set(WALL_X + 0.02, 3.4, z)
    group.add(frame)

    const pane = new THREE.Mesh(paneGeometry, glassMaterial)
    pane.position.set(WALL_X + 0.01, 3.4, z)
    group.add(pane)

    const arch = new THREE.Mesh(archGeometry, glassMaterial)
    arch.position.set(WALL_X + 0.01, 4.6, z)
    group.add(arch)
  }

  return group
}

function createPillars() {
  const group = new THREE.Group()

  const ironMaterial = metalMaterial({ repeat: [1, 3], base: 0x33413c, roughness: 0.55, metalness: 0.6 })
  const brassMaterial = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })

  const baseGeometry = new THREE.BoxGeometry(0.85, 0.3, 0.85)
  const shaftGeometry = new THREE.CylinderGeometry(0.24, 0.3, 5.1, 14)
  const collarGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14)
  const capitalGeometry = new THREE.BoxGeometry(0.75, 0.3, 0.75)
  const bracketGeometry = new THREE.BoxGeometry(0.12, 0.1, 1.6)

  for (const z of PILLAR_Z) {
    const base = new THREE.Mesh(baseGeometry, ironMaterial)
    base.position.set(PILLAR_X, 0.15, z)
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    const shaft = new THREE.Mesh(shaftGeometry, ironMaterial)
    shaft.position.set(PILLAR_X, 2.85, z)
    shaft.castShadow = true
    group.add(shaft)

    for (const y of [0.45, 5.25]) {
      const collar = new THREE.Mesh(collarGeometry, brassMaterial)
      collar.position.set(PILLAR_X, y, z)
      group.add(collar)
    }

    const capital = new THREE.Mesh(capitalGeometry, ironMaterial)
    capital.position.set(PILLAR_X, 5.55, z)
    capital.castShadow = true
    group.add(capital)

    // Decorative brackets fanning out to the roof deck.
    for (const side of [-1, 1]) {
      const bracket = new THREE.Mesh(bracketGeometry, ironMaterial)
      bracket.position.set(PILLAR_X, 5.75, z + side * 0.8)
      bracket.rotation.x = side * 0.35
      group.add(bracket)
    }
  }

  return group
}

function createTrainShed() {
  const group = new THREE.Group()

  // Roof deck. Deliberately does NOT cast shadows: the sun rakes in from the
  // open track side, and a shadow-casting deck would flatten the whole
  // platform into darkness for no visual gain.
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_WIDTH + 2.4, 0.25, PLATFORM_LENGTH),
    plasterMaterial({ repeat: [4, 16], base: 0x453f38, roughness: 0.95 })
  )
  deck.position.set(-0.3, ROOF_Y, 0)
  group.add(deck)

  // Glazed skylight strips let the shed read as a Victorian train shed and
  // give the ceiling something to catch the eye.
  const skylightMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8bcd8,
    emissive: 0x93aed4,
    emissiveIntensity: 1.1,
    roughness: 0.25
  })
  for (const x of [-2.6, 1.4]) {
    const skylight = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.08, PLATFORM_LENGTH - 3),
      skylightMaterial
    )
    skylight.position.set(x, ROOF_Y - 0.13, 0)
    group.add(skylight)
  }

  // Lattice trusses spanning the platform.
  const trussMaterial = metalMaterial({ repeat: [4, 1], base: 0x3a3a3c, roughness: 0.6, metalness: 0.7 })
  const chordGeometry = new THREE.BoxGeometry(PLATFORM_WIDTH + 2, 0.16, 0.2)
  const webGeometry = new THREE.BoxGeometry(0.9, 0.09, 0.12)

  for (let z = -18; z <= 18; z += 4) {
    const chord = new THREE.Mesh(chordGeometry, trussMaterial)
    chord.position.set(-0.3, ROOF_Y - 0.45, z)
    chord.castShadow = true
    group.add(chord)

    // Alternating diagonals give the chord a lattice read rather than a row
    // of parallel bars.
    let brace = 0
    for (let x = -5; x <= 4; x += 1.5) {
      const web = new THREE.Mesh(webGeometry, trussMaterial)
      web.position.set(x, ROOF_Y - 0.28, z)
      web.rotation.z = (brace++ % 2 === 0 ? 1 : -1) * 0.5
      group.add(web)
    }
  }

  return group
}

function createPendantLamps() {
  const group = new THREE.Group()

  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.9 })
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0cc,
    emissive: 0xffdda0,
    emissiveIntensity: 3.2
  })
  const rodGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6)
  const shadeGeometry = new THREE.ConeGeometry(0.45, 0.38, 14, 1, true)
  const bulbGeometry = new THREE.SphereGeometry(0.13, 10, 8)

  for (const z of [-14, -7, 0, 7, 14]) {
    const rod = new THREE.Mesh(rodGeometry, brass)
    rod.position.set(0.4, ROOF_Y - 0.75, z)
    group.add(rod)

    // A cone's wide end is already its -Y end, so it hangs mouth-down as-is.
    const shade = new THREE.Mesh(shadeGeometry, brass)
    shade.position.set(0.4, ROOF_Y - 1.5, z)
    group.add(shade)

    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial)
    bulb.position.set(0.4, ROOF_Y - 1.62, z)
    group.add(bulb)

    // Accent only — the platform's base exposure comes from the directional
    // and hemisphere lights, and none of these cast shadows.
    const lamp = new THREE.PointLight(0xffc98a, 22, 13, 2)
    lamp.position.set(0.4, ROOF_Y - 1.7, z)
    group.add(lamp)
  }

  return group
}

// Materials are passed in rather than built per bench: four benches each
// allocating their own wood texture would be four GPU uploads of identical
// pixels.
function createBench(z, { timber, iron }) {
  const bench = new THREE.Group()

  const slatGeometry = new THREE.BoxGeometry(0.5, 0.07, 2)
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(slatGeometry, timber)
    slat.position.set(0, 0.46, 0)
    slat.position.x = -0.18 + i * 0.18
    slat.castShadow = true
    bench.add(slat)
  }
  // Backrest.
  for (let i = 0; i < 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 2), timber)
    slat.position.set(-0.3, 0.72 + i * 0.24, 0)
    slat.castShadow = true
    bench.add(slat)
  }
  for (const side of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.44, 0.1), iron)
    leg.position.set(0, 0.22, side)
    leg.castShadow = true
    bench.add(leg)
  }

  bench.position.set(WALL_X + 0.75, 0, z)
  return bench
}

function createDepartureBoard() {
  const board = new THREE.Group()

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.1, 3.2),
    signMaterial({ text: 'CHRONO EXPRESS  ·  23:40', background: 0x0d0f14, foreground: 0xe0b45c, width: 512, height: 180 })
  )
  panel.rotation.y = Math.PI / 2
  board.add(panel)

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 1.28, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.6, metalness: 0.5 })
  )
  frame.rotation.y = Math.PI / 2
  frame.position.x = 0.02
  board.add(frame)

  for (const side of [-1.3, 1.3]) {
    const hanger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c322f, metalness: 0.8, roughness: 0.4 })
    )
    hanger.position.set(0, 1.4, side)
    board.add(hanger)
  }

  board.position.set(-1.6, 3.6, -6)
  return board
}

function createPlatformSign() {
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.52, 2),
    signMaterial({ text: 'PLATFORM 1', background: 0x11223a, foreground: 0xf0e6cf, width: 512, height: 128 })
  )
  sign.rotation.y = Math.PI / 2
  sign.position.set(PILLAR_X - 0.35, 3.1, 0)
  return sign
}

function createStationClock() {
  const clock = new THREE.Group()

  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0xf2ead6, emissive: 0x6b6250, emissiveIntensity: 0.6, roughness: 0.5 })
  )
  face.rotation.z = Math.PI / 2
  clock.add(face)

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.5, metalness: 0.6 })
  )
  rim.rotation.z = Math.PI / 2
  rim.position.x = -0.02
  clock.add(rim)

  const handMaterial = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4 })
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.3), handMaterial)
  hourHand.position.set(0.07, 0.08, 0.13)
  clock.add(hourHand)
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.05), handMaterial)
  minuteHand.position.set(0.07, 0.2, 0)
  clock.add(minuteHand)

  clock.position.set(WALL_X + 0.45, 4.3, 10)
  return clock
}

function createLuggage() {
  const group = new THREE.Group()

  const leather = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.7, metalness: 0.1 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.9 })
  const crateMaterial = woodMaterial({ repeat: [1, 1], light: 0x8a6a40, dark: 0x4c3620 })

  // A porter's trolley with stacked trunks.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.8), crateMaterial)
  deck.position.set(0, 0.32, 0)
  deck.castShadow = true
  group.add(deck)

  for (const z of [-0.6, 0.6]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.16, 12), leather)
    axle.rotation.z = Math.PI / 2
    axle.position.set(0, 0.16, z)
    group.add(axle)
  }

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), brass)
  handle.position.set(0, 0.95, -0.85)
  group.add(handle)

  const trunkGeometry = new THREE.BoxGeometry(0.8, 0.42, 1.2)
  for (let i = 0; i < 2; i++) {
    const trunk = new THREE.Mesh(trunkGeometry, leather)
    trunk.position.set(0, 0.58 + i * 0.44, i * 0.12)
    trunk.castShadow = true
    group.add(trunk)

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.1), brass)
    strap.position.set(0, 0.58 + i * 0.44, i * 0.12)
    group.add(strap)
  }

  group.position.set(-3.4, 0, -13)
  group.rotation.y = 0.3
  return group
}

function createGuardPlaceholder() {
  // Static figure standing in for a patrolling guard. Non-functional — no
  // patrol or detection logic exists yet (Phase 2), but it now shares the
  // player's humanoid builder so the eventual guards inherit the same rig.
  const { group } = createHumanoid(GUARD_PALETTE)
  group.name = 'guard-placeholder'
  group.position.set(1.8, 0, 9)
  group.rotation.y = Math.PI * 0.85
  return group
}

function createCameraPlaceholder(z) {
  // Wall-mounted PTZ camera. Non-functional — no detection cone exists yet.
  const placeholder = new THREE.Group()
  placeholder.name = 'camera-placeholder'

  const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.6 })

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), bracketMaterial)
  arm.position.x = 0.25
  placeholder.add(arm)

  const housing = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), bracketMaterial)
  housing.position.x = 0.55
  housing.castShadow = true
  placeholder.add(housing)

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.15, metalness: 0.3 })
  )
  lens.rotation.z = Math.PI / 2
  lens.rotation.y = 0.5
  lens.position.set(0.72, -0.04, 0.1)
  placeholder.add(lens)

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a20, emissiveIntensity: 4 })
  )
  led.position.set(0.66, 0.14, 0.14)
  placeholder.add(led)

  placeholder.position.set(WALL_X + 0.3, 4.6, z)
  return placeholder
}

function createBoardingControl() {
  // Brass pedestal with a lit screen, on the platform edge opposite the
  // train's doors. Target for the Phase 1 interaction system; interacting
  // with it triggers the level-manager transition into Level 2.
  const control = new THREE.Group()
  control.name = 'boarding-control'

  const brass = new THREE.MeshStandardMaterial({ color: 0xa9812f, roughness: 0.3, metalness: 0.92 })
  const casing = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.55, metalness: 0.5 })

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.12, 14), brass)
  foot.position.y = 0.06
  foot.castShadow = true
  control.add(foot)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.95, 14), brass)
  column.position.y = 0.55
  column.castShadow = true
  control.add(column)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.34), casing)
  head.position.y = 1.18
  head.rotation.x = -0.32
  head.castShadow = true
  control.add(head)

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.28, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x36e0a4, emissive: 0x1fbf88, emissiveIntensity: 2.4, roughness: 0.25 })
  )
  screen.position.set(0, 1.24, 0.19)
  screen.rotation.x = -0.32
  control.add(screen)

  const glow = new THREE.PointLight(0x3ce0a8, 4, 3.5, 2)
  glow.position.set(0, 1.3, 0.35)
  control.add(glow)

  control.position.set(4, 0, 2)
  return control
}

function createExteriorLightFixtures() {
  const group = new THREE.Group()
  group.name = 'exterior-light-fixtures'

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.4, metalness: 0.8 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff0cc,
    emissive: 0xffb86c,
    emissiveIntensity: 4.5,
    roughness: 0.1
  })

  // 1. Roof Exterior Floodlight Fixtures (3 mounted along rear eave X = -5.0, Y = 6.2, facing -X towards mountains)
  for (const z of [-12, 0, 12]) {
    const fixture = new THREE.Group()
    fixture.position.set(-5.0, 6.2, z)

    // Base bracket attached to roof eave
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), metalMat)
    base.position.set(0.15, 0, 0)
    base.castShadow = true
    fixture.add(base)

    // Swivel arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), brassMat)
    arm.rotation.z = Math.PI / 4
    arm.position.set(-0.1, 0, 0)
    fixture.add(arm)

    // Floodlight housing cone angled towards negative X (towards mountain)
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.25, 0.55, 12), metalMat)
    housing.rotation.z = -Math.PI / 3.2
    housing.position.set(-0.35, 0.1, 0)
    housing.castShadow = true
    fixture.add(housing)

    // Emissive Lens Face
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12), bulbMat)
    lens.rotation.z = -Math.PI / 3.2
    lens.position.set(-0.55, 0.22, 0)
    fixture.add(lens)

    group.add(fixture)
  }

  // 2. Wall Sconces on Outer Face of Rear Wall (X = -5.2, Y = 3.8, Z = -12, -4, 4, 12)
  for (const z of [-12, -4, 4, 12]) {
    const sconce = new THREE.Group()
    sconce.position.set(-5.2, 3.8, z)

    const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.25), brassMat)
    sconce.add(wallPlate)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), brassMat)
    neck.rotation.z = -Math.PI / 2
    neck.position.set(-0.18, 0, 0)
    sconce.add(neck)

    const glassGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), bulbMat)
    glassGlobe.position.set(-0.32, 0, 0)
    sconce.add(glassGlobe)

    group.add(sconce)
  }

  return group
}

export function createStationBlockout({ includePlaceholders = false } = {}) {
  const group = new THREE.Group()
  group.name = 'station'

  group.add(createConcourse())
  group.add(createTrackBed())
  group.add(createRearWall())
  group.add(createPillars())
  group.add(createTrainShed())
  group.add(createPendantLamps())
  group.add(createDepartureBoard())
  group.add(createPlatformSign())
  group.add(createStationClock())
  group.add(createLuggage())
  group.add(createExteriorLightFixtures())

  if (includePlaceholders) {
    group.add(createGuardPlaceholder())
    group.add(createCameraPlaceholder(-8))
    group.add(createCameraPlaceholder(12))
  }

  const benchMaterials = {
    timber: woodMaterial({ repeat: [2, 1], light: 0x8a5c33, dark: 0x452a16 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2c322f, roughness: 0.6, metalness: 0.6 })
  }
  for (const z of [-12, -4, 4, 12]) {
    group.add(createBench(z, benchMaterials))
  }

  // A red carpet runner leading to the boarding point — luxury cue, and it
  // quietly signposts where the player is meant to go.
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 22),
    carpetMaterial({ repeat: [1, 12], base: 0x5e1f28, accent: 0x9a7238 })
  )
  runner.rotation.x = -Math.PI / 2
  runner.position.set(2.2, 0.015, -3)
  runner.receiveShadow = true
  group.add(runner)

  const boardingControl = createBoardingControl()
  group.add(boardingControl)

  return { group, bounds, boardingControl }
}

// Warm, controlled station lighting for Level 1's visual identity. Base
// exposure comes from the hemisphere + directional pair (both resolution- and
// unit-stable); the pendant lamps inside the blockout add warm accents.
export function createStationLighting() {
  // Low evening sun raking in under the shed from the open track side.
  const sunlight = new THREE.DirectionalLight(0xffb173, 2.4)
  sunlight.position.set(16, 8, -10)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  sunlight.shadow.camera.left = -26
  sunlight.shadow.camera.right = 26
  sunlight.shadow.camera.top = 26
  sunlight.shadow.camera.bottom = -26
  sunlight.shadow.camera.near = 1
  sunlight.shadow.camera.far = 70
  sunlight.shadow.bias = -0.0008
  sunlight.shadow.normalBias = 0.02

  const sky = new THREE.HemisphereLight(0x5e6f96, 0x2e241a, 0.85)
  const fill = new THREE.AmbientLight(0x3b3346, 0.35)

  // -------------------------------------------------------------
  // Exterior Mountain Floodlights & Architectural Spotlights
  // -------------------------------------------------------------
  const spotLights = []
  const spotTargets = []

  // Floodlight 1 — Left mountain sector
  const spotLeft = new THREE.SpotLight(0xffb86c, 48.0, 145.0, Math.PI / 2.8, 0.75, 1.5)
  spotLeft.position.set(-5.0, 6.2, -12.0)
  const targetLeft = new THREE.Object3D()
  targetLeft.position.set(-65.0, 18.0, -25.0)
  spotLeft.target = targetLeft
  spotLights.push(spotLeft)
  spotTargets.push(targetLeft)

  // Floodlight 2 — Center mountain peak (Primary shadow caster)
  const spotCenter = new THREE.SpotLight(0xffc480, 62.0, 165.0, Math.PI / 2.6, 0.8, 1.4)
  spotCenter.position.set(-5.0, 6.4, 0.0)
  const targetCenter = new THREE.Object3D()
  targetCenter.position.set(-75.0, 24.0, 0.0)
  spotCenter.target = targetCenter
  spotCenter.castShadow = true
  spotCenter.shadow.mapSize.set(1024, 1024)
  spotCenter.shadow.camera.near = 2.0
  spotCenter.shadow.camera.far = 170.0
  spotCenter.shadow.bias = -0.0005
  spotLights.push(spotCenter)
  spotTargets.push(targetCenter)

  // Floodlight 3 — Right mountain sector
  const spotRight = new THREE.SpotLight(0xffb86c, 48.0, 145.0, Math.PI / 2.8, 0.75, 1.5)
  spotRight.position.set(-5.0, 6.2, 12.0)
  const targetRight = new THREE.Object3D()
  targetRight.position.set(-65.0, 18.0, 25.0)
  spotRight.target = targetRight
  spotLights.push(spotRight)
  spotTargets.push(targetRight)

  // Wall sconce accent pointlights on outer rear wall
  const sconceLights = []
  for (const z of [-12, -4, 4, 12]) {
    const sconceLight = new THREE.PointLight(0xffb86c, 14.0, 12.0, 2.0)
    sconceLight.position.set(-5.5, 3.8, z)
    sconceLights.push(sconceLight)
  }

  const allLights = [sunlight, sky, fill, ...spotLights, ...spotTargets, ...sconceLights]
  allLights.spotLights = spotLights

  return allLights
}

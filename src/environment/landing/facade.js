import * as THREE from 'three'
import { addMesh, box, mergeParts } from './geom.js'
import { addLanterns } from './lantern.js'
import {
  CENTER_HALF,
  CENTER_Z,
  CROWN_TOP,
  DEPTH,
  FACADE_X,
  PARAPET_TOP,
  WING_TOP,
  Z_MAX,
  Z_MIN
} from './layout.js'
import { shadeOf } from './materials.js'
import { addWindowBays } from './window-bay.js'

// West-facing head house. Local geometry is written in world metres: the
// front skin is x = FACADE_X and the building runs east (deeper +X). Wings
// are red brick with stone bands; the centre is a stone Art Deco pavilion.

const CENTER_0 = CENTER_Z - CENTER_HALF
const CENTER_1 = CENTER_Z + CENTER_HALF
const ARCH_SPRING = 6.2
const ARCH_RADIUS = 4.7
const ARCH_BASE = 4.72

function bays(z0, z1, spacing) {
  const count = Math.max(1, Math.round((z1 - z0) / spacing))
  const step = (z1 - z0) / count
  const out = []
  for (let i = 0; i < count; i += 1) out.push(z0 + step * (i + 0.5))
  return out
}

function archTop(z) {
  const dz = Math.abs(z - CENTER_Z)
  if (dz >= ARCH_RADIUS - 0.08) return ARCH_SPRING
  return ARCH_SPRING + Math.sqrt(ARCH_RADIUS * ARCH_RADIUS - dz * dz)
}

function archHalfWidth(y) {
  if (y <= ARCH_SPRING) return ARCH_RADIUS - 0.12
  const dy = y - ARCH_SPRING
  if (dy >= ARCH_RADIUS - 0.08) return 0
  return Math.sqrt(Math.max(0, ARCH_RADIUS * ARCH_RADIUS - dy * dy)) - 0.12
}

function archGlassGeometry() {
  const shape = new THREE.Shape()
  const half = ARCH_RADIUS - 0.28
  shape.moveTo(-half, ARCH_BASE)
  shape.lineTo(-half, ARCH_SPRING)
  shape.absarc(0, ARCH_SPRING, half, Math.PI, 0, true)
  shape.lineTo(half, ARCH_BASE)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape, 20)
  geometry.rotateY(Math.PI / 2)
  geometry.translate(FACADE_X + 0.16, 0, CENTER_Z)
  return geometry
}

function clockFace() {
  const face = new THREE.CircleGeometry(1.72, 40)
  face.rotateY(Math.PI / 2)
  face.translate(FACADE_X - 0.08, ARCH_SPRING + 2.55, CENTER_Z)
  return face
}

function clockRim() {
  const rim = new THREE.TorusGeometry(1.86, 0.07, 8, 36)
  rim.rotateY(Math.PI / 2)
  rim.translate(FACADE_X - 0.1, ARCH_SPRING + 2.55, CENTER_Z)
  return rim
}

export function buildFacade(parent, materials, stats) {
  const brick = []
  const stone = []
  const trim = []
  const iron = []
  const roof = []
  const wood = []
  const doorGlass = []
  const tileB = materials.brickTile
  const tileS = materials.stoneTile

  const leftZs = bays(Z_MIN + 1.15, CENTER_0 - 0.7, 2.35)
  const rightZs = bays(CENTER_1 + 0.7, Z_MAX - 1.15, 2.35)
  const floors = [
    { y: 2.48 },
    { y: 6.32 },
    { y: 9.92 }
  ]

  function wingBlock(z0, z1) {
    const length = z1 - z0
    const z = (z0 + z1) / 2
    brick.push(box(DEPTH, WING_TOP, length, FACADE_X + DEPTH / 2 + 0.15, WING_TOP / 2, z, tileB))
    trim.push(box(0.34, 0.62, length + 0.2, FACADE_X - 0.02, 0.31, z, tileS))
    for (const y of [4.48, 8.22, WING_TOP + 0.02]) {
      trim.push(box(0.46, 0.2, length + 0.3, FACADE_X - 0.12, y, z, tileS))
    }
    trim.push(box(0.4, PARAPET_TOP - WING_TOP, length, FACADE_X + 0.02, (WING_TOP + PARAPET_TOP) / 2, z, tileS))
    trim.push(box(0.62, 0.16, length + 0.4, FACADE_X - 0.08, PARAPET_TOP, z, tileS))
    roof.push(box(DEPTH + 0.7, 0.16, length + 0.15, FACADE_X + DEPTH / 2 + 0.1, WING_TOP + 0.08, z))
  }

  wingBlock(Z_MIN, CENTER_0)
  wingBlock(CENTER_1, Z_MAX)

  // Corner and bay pilasters. They sit proud of the brick and break the
  // wall into the vertical rhythm of the reference.
  function pilaster(z, height, width = 0.42) {
    stone.push(box(0.38, height, width, FACADE_X - 0.06, height / 2, z, tileS))
    trim.push(box(0.46, 0.16, width + 0.12, FACADE_X - 0.1, height - 0.02, z, tileS))
  }
  for (const z of [Z_MIN + 0.28, CENTER_0 - 0.28, CENTER_1 + 0.28, Z_MAX - 0.28]) {
    pilaster(z, PARAPET_TOP, 0.55)
  }
  function betweenBays(zs) {
    const out = []
    for (let i = 0; i < zs.length - 1; i += 1) out.push((zs[i] + zs[i + 1]) / 2)
    return out
  }
  for (const z of [...betweenBays(leftZs), ...betweenBays(rightZs)]) {
    pilaster(z, WING_TOP - 0.15, 0.22)
  }

  // Returns and the east wall, so the house is a volume from the platform
  // and from the hills, not a billboard.
  function returnWall(z, yawSign) {
    const x = FACADE_X + DEPTH / 2 + 0.15
    brick.push(box(DEPTH, WING_TOP, 0.45, x, WING_TOP / 2, z, tileB))
    trim.push(box(DEPTH + 0.3, 0.2, 0.4, x, WING_TOP + 0.02, z, tileS))
    const openings = []
    for (const floor of floors) {
      openings.push({
        x: FACADE_X + DEPTH * 0.38,
        y: floor.y,
        z: z + yawSign * 0.24,
        yaw: yawSign > 0 ? Math.PI / 2 : -Math.PI / 2,
        shade: shadeOf(z * 3 + floor.y)
      })
    }
    return openings
  }

  const openings = []
  let shadeCursor = 0
  for (const z of [...leftZs, ...rightZs]) {
    for (const floor of floors) {
      openings.push({
        x: FACADE_X - 0.02,
        y: floor.y,
        z,
        yaw: 0,
        shade: shadeOf(shadeCursor)
      })
      shadeCursor += 1
    }
  }
  openings.push(...returnWall(Z_MIN + 0.22, -1))
  openings.push(...returnWall(Z_MAX - 0.22, 1))

  const backZs = bays(Z_MIN + 3, Z_MAX - 3, 4.2)
  for (const z of backZs) {
    for (const floor of floors.slice(0, 2)) {
      openings.push({
        x: FACADE_X + DEPTH + 0.28,
        y: floor.y,
        z,
        yaw: Math.PI,
        shade: shadeOf(z + floor.y * 2)
      })
    }
  }
  brick.push(box(
    0.45, WING_TOP, Z_MAX - Z_MIN,
    FACADE_X + DEPTH + 0.15, WING_TOP / 2, CENTER_Z, tileB
  ))

  // Central pavilion, built as a frame so the arch stays an opening.
  // A solid box here would bury the glass and the clock.
  const pierW = (CENTER_1 - CENTER_0 - ARCH_RADIUS * 2) / 2
  stone.push(box(DEPTH, CROWN_TOP, pierW, FACADE_X + DEPTH / 2, CROWN_TOP / 2, CENTER_0 + pierW / 2, tileS))
  stone.push(box(DEPTH, CROWN_TOP, pierW, FACADE_X + DEPTH / 2, CROWN_TOP / 2, CENTER_1 - pierW / 2, tileS))
  const archCrown = ARCH_SPRING + ARCH_RADIUS
  stone.push(box(
    DEPTH * 0.92, CROWN_TOP - archCrown, ARCH_RADIUS * 2 + 0.4,
    FACADE_X + DEPTH * 0.46, (CROWN_TOP + archCrown) / 2, CENTER_Z, tileS
  ))
  stone.push(box(0.4, CROWN_TOP, CENTER_1 - CENTER_0, FACADE_X + DEPTH - 0.15, CROWN_TOP / 2, CENTER_Z, tileS))
  stone.push(box(0.55, 0.7, ARCH_RADIUS * 2 + 0.2, FACADE_X + 0.15, 4.35, CENTER_Z, tileS))
  for (const step of [
    { y: 13.15, h: 1.15, inset: 0.35 },
    { y: 14.45, h: 1.2, inset: 1.15 },
    { y: 15.75, h: 1.05, inset: 2.05 },
    { y: 16.85, h: 0.7, inset: 2.9 }
  ]) {
    stone.push(box(
      DEPTH * 0.72, step.h, CENTER_1 - CENTER_0 - step.inset * 2,
      FACADE_X + DEPTH * 0.36, step.y, CENTER_Z, tileS
    ))
  }
  roof.push(box(DEPTH + 0.4, 0.14, CENTER_1 - CENTER_0 + 0.5, FACADE_X + DEPTH / 2, CROWN_TOP + 0.08, CENTER_Z))

  for (const side of [-1, 1]) {
    const z0 = CENTER_Z + side * (ARCH_RADIUS + 0.55)
    for (let i = 0; i < 7; i += 1) {
      const z = z0 + side * i * 0.22
      trim.push(box(0.1, 10.4, 0.08, FACADE_X - 0.1, 10.2, z, tileS))
    }
  }

  // Arch ring, jambs and a grid of mullions clipped to the curve.
  const rim = new THREE.TorusGeometry(ARCH_RADIUS, 0.22, 8, 28, Math.PI)
  rim.rotateY(Math.PI / 2)
  rim.translate(FACADE_X - 0.06, ARCH_SPRING, CENTER_Z)
  stone.push(rim)
  for (const side of [-1, 1]) {
    stone.push(box(0.42, ARCH_SPRING - 0.4, 0.48, FACADE_X - 0.08, (ARCH_SPRING - 0.4) / 2 + 0.4, CENTER_Z + side * ARCH_RADIUS, tileS))
  }
  trim.push(box(0.5, 0.36, 0.7, FACADE_X - 0.12, archTop(CENTER_Z) + 0.05, CENTER_Z, tileS))

  for (let z = CENTER_Z - ARCH_RADIUS + 0.55; z <= CENTER_Z + ARCH_RADIUS - 0.5; z += 0.72) {
    const top = archTop(z) - 0.2
    const height = top - ARCH_BASE
    if (height < 0.4) continue
    iron.push(box(0.06, height, 0.045, FACADE_X - 0.02, ARCH_BASE + height / 2, z))
  }
  for (const y of [6.15, 7.85, 9.45]) {
    const half = archHalfWidth(y)
    if (half < 0.3) continue
    iron.push(box(0.06, 0.045, half * 2, FACADE_X - 0.02, y, CENTER_Z))
  }

  // Chimneys on the wings, behind the parapet so the caps clear the skyline.
  for (const z of [Z_MIN + 2.4, CENTER_0 - 1.6, CENTER_1 + 1.6, Z_MAX - 2.4]) {
    brick.push(box(0.7, 2.15, 0.7, FACADE_X + 3.2, WING_TOP + 1.2, z, tileB))
    trim.push(box(0.92, 0.16, 0.92, FACADE_X + 3.2, WING_TOP + 2.28, z, tileS))
  }

  addMesh(parent, mergeParts(brick), materials.brick, {
    castShadow: true, receiveShadow: true, name: 'landing-brick'
  }, stats)
  addMesh(parent, mergeParts(stone), materials.stone, {
    castShadow: true, receiveShadow: true, name: 'landing-stone'
  }, stats)
  addMesh(parent, mergeParts(trim), materials.stoneTrim, {
    receiveShadow: true, name: 'landing-stone-trim'
  }, stats)
  addMesh(parent, mergeParts(iron), materials.iron, { name: 'landing-mullions' }, stats)
  addMesh(parent, mergeParts(roof), materials.roof, {
    castShadow: true, name: 'landing-roof'
  }, stats)

  addMesh(parent, archGlassGeometry(), materials.archGlass, { name: 'landing-arch-glass' }, stats)
  // A warm wall a couple of metres inside, so the arch reads as a lit hall.
  addMesh(parent, box(0.2, 8.4, ARCH_RADIUS * 1.7, FACADE_X + 2.4, 8.6, CENTER_Z), materials.archGlass, {
    name: 'landing-hall-glow'
  }, stats)

  addMesh(parent, clockFace(), materials.clock, { name: 'landing-clock' }, stats)
  addMesh(parent, clockRim(), materials.brass, { name: 'landing-clock-rim' }, stats)
  const hands = new THREE.Group()
  const handMat = materials.iron
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.05, 0.07), handMat)
  hour.geometry.translate(0, 0.48, 0)
  hour.rotation.x = -55 * Math.PI / 180
  hour.castShadow = false
  const minute = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.45, 0.06), handMat)
  minute.geometry.translate(0, 0.68, 0)
  minute.rotation.x = 60 * Math.PI / 180
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), materials.brass)
  pin.rotation.z = Math.PI / 2
  hands.add(hour, minute, pin)
  hands.position.set(FACADE_X - 0.16, ARCH_SPRING + 2.55, CENTER_Z)
  parent.add(hands)
  stats.draws += 3
  stats.triangles += 12 + 12 + 20

  addWindowBays(parent, openings, materials, stats)

  // Entrance: three doors, transoms, a projecting canopy and the sign.
  const doorW = 1.38
  const doorGap = 0.42
  const doorSpan = doorW + doorGap
  const doorZs = [-1, 0, 1].map((i) => CENTER_Z + i * doorSpan)
  for (const z of doorZs) {
    wood.push(box(0.12, 3.15, 0.1, FACADE_X - 0.02, 2.15, z - doorW / 2))
    wood.push(box(0.12, 3.15, 0.1, FACADE_X - 0.02, 2.15, z + doorW / 2))
    wood.push(box(0.12, 0.1, doorW, FACADE_X - 0.02, 3.68, z))
    wood.push(box(0.08, 1.35, doorW - 0.18, FACADE_X - 0.04, 1.25, z))
    wood.push(box(0.06, 3.05, 0.05, FACADE_X - 0.05, 2.1, z))
    doorGlass.push(box(0.04, 1.45, (doorW - 0.28) / 2 - 0.04, FACADE_X - 0.06, 2.75, z - doorW * 0.22))
    doorGlass.push(box(0.04, 1.45, (doorW - 0.28) / 2 - 0.04, FACADE_X - 0.06, 2.75, z + doorW * 0.22))
    doorGlass.push(box(0.04, 0.42, doorW - 0.16, FACADE_X - 0.06, 3.95, z))
  }
  addMesh(parent, mergeParts(wood), materials.wood, { name: 'landing-doors' }, stats)
  addMesh(parent, mergeParts(doorGlass), materials.glass[0], { name: 'landing-door-glass' }, stats)

  const canopyZ = CENTER_Z
  const canopyW = doorSpan * 2 + doorW + 1.1
  const canopy = []
  canopy.push(box(3.7, 0.16, canopyW, FACADE_X - 1.7, 4.42, canopyZ))
  canopy.push(box(0.12, 0.55, canopyW, FACADE_X - 3.5, 4.15, canopyZ))
  addMesh(parent, mergeParts(canopy), materials.roof, {
    castShadow: true, receiveShadow: true, name: 'landing-canopy'
  }, stats)
  addMesh(parent, box(3.3, 0.06, canopyW - 0.3, FACADE_X - 1.65, 4.3, canopyZ), materials.soffit, {
    name: 'landing-soffit'
  }, stats)
  for (const side of [-1, 1]) {
    addMesh(parent, box(0.32, 4.2, 0.32, FACADE_X - 3.15, 2.1, canopyZ + side * (canopyW / 2 - 0.2), tileS), materials.stone, {
      castShadow: true, name: 'landing-canopy-pier'
    }, stats)
  }

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.78), materials.sign)
  sign.rotateY(-Math.PI / 2)
  sign.position.set(FACADE_X - 3.58, 4.15, canopyZ)
  sign.name = 'landing-sign'
  parent.add(sign)
  stats.draws += 1
  stats.triangles += 2

  // Steps up to the three doors. Treads get wider as they come forward.
  const steps = []
  for (let i = 0; i < 4; i += 1) {
    const depth = 0.72
    const x = FACADE_X - 0.35 - i * depth
    steps.push(box(depth, 0.16 + i * 0.02, canopyW - 0.4 + i * 0.35, x - depth / 2, 0.1 + (3 - i) * 0.14, canopyZ, tileS))
  }
  addMesh(parent, mergeParts(steps), materials.stone, {
    castShadow: true, receiveShadow: true, name: 'landing-steps'
  }, stats)
  const rails = []
  for (const side of [-1, 1]) {
    const z = canopyZ + side * (canopyW / 2 + 0.15)
    rails.push(box(2.6, 0.06, 0.06, FACADE_X - 1.7, 1.05, z))
    rails.push(box(0.06, 0.85, 0.06, FACADE_X - 0.5, 0.55, z))
    rails.push(box(0.06, 0.55, 0.06, FACADE_X - 2.9, 0.4, z))
  }
  addMesh(parent, mergeParts(rails), materials.iron, { name: 'landing-step-rails' }, stats)

  const lanterns = []
  for (const side of [-1, 1]) {
    lanterns.push({
      x: FACADE_X - 0.35,
      y: 3.15,
      z: canopyZ + side * (canopyW / 2 + 0.55),
      light: true
    })
  }
  for (const z of [leftZs[0], leftZs[leftZs.length - 1], rightZs[0], rightZs[rightZs.length - 1]]) {
    lanterns.push({ x: FACADE_X - 0.28, y: 3.15, z, light: false })
    lanterns.push({ x: FACADE_X - 0.28, y: 7.15, z, light: z === leftZs[0] || z === rightZs[rightZs.length - 1] })
  }
  // Two lamps tucked under the canopy, in addition to the wall lanterns.
  for (const side of [-1, 1]) {
    const light = new THREE.PointLight(0xffb067, 10, 10, 2)
    light.name = 'landing-canopy-light'
    light.castShadow = false
    light.position.set(FACADE_X - 1.8, 4.05, canopyZ + side * 1.6)
    parent.add(light)
  }
  addLanterns(parent, lanterns, materials, stats)
}

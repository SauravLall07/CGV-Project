import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { disposeObject } from '../core/dispose.js'

export const TRAIN_SPEED = 22
export const LOCOMOTIVE_HALF_LENGTH = 7
export const STOP_NOSE_X = -0.6
export const STOP_CENTER_X = STOP_NOSE_X - LOCOMOTIVE_HALF_LENGTH
export const TRAIN_LENGTH = 78
export const SETTLE_PITCH = THREE.MathUtils.degToRad(1.5)
export const COUPLING_BUMP = 0.22
export const COUPLING_DELAY = 0.12
const YAW_DEGREES = [0.6, -1.2, 0.9, -0.5]
const ROLL_DEGREES = [0.6, -0.6, 0.6, -0.6]
const SPRING_FREQUENCY = 9
const SPRING_DAMPING = 3.8
const SPRING_GAIN = 1.8 // Compensates damping: first pitch peak is about 1.5 degrees.
const WHEEL_RADIUS = 0.75
const GLOW_PEAK = 5

export function createEndingTrain() {
  const root = new THREE.Group()
  root.name = 'ending-train'
  const paint = new THREE.MeshStandardMaterial({ color: 0x12231e, roughness: 0.7, metalness: 0.35 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x20252d, roughness: 0.58, metalness: 0.7 })
  const roof = new THREE.MeshStandardMaterial({ color: 0x151a23, roughness: 0.85 })
  const interior = new THREE.MeshStandardMaterial({ color: 0x050807, roughness: 1 })
  const windows = new THREE.MeshStandardMaterial({ color: 0x6c411c, emissive: 0xffb453, emissiveIntensity: 1.65, roughness: 0.5 })
  const headlamp = new THREE.MeshStandardMaterial({ color: 0xffebba, emissive: 0xffdc8c, emissiveIntensity: 4 })
  const glow = new THREE.MeshStandardMaterial({ color: 0x492108, emissive: 0xff650b, emissiveIntensity: 0, roughness: 0.5 })
  const wheels = []
  const cars = []
  function builder(group) {
    const batches = new Map()
    function add(material, geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz)
      geometry.translate(x, y, z)
      // Uniform non-indexed attributes make box/cylinder/cone merges predictable.
      const ready = geometry.index ? geometry.toNonIndexed() : geometry
      if (ready !== geometry) geometry.dispose()
      if (!batches.has(material)) batches.set(material, [])
      batches.get(material).push(ready)
    }
    function box(material, w, h, d, x, y, z) { add(material, new THREE.BoxGeometry(w, h, d), x, y, z) }
    function finish() {
      for (const [material, parts] of batches) {
        const geometry = mergeGeometries(parts, false)
        parts.forEach(part => part.dispose())
        group.add(new THREE.Mesh(geometry, material))
      }
    }
    return { add, box, finish }
  }
  const wheelParts = [new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.18, 12),
    new THREE.TorusGeometry(WHEEL_RADIUS - 0.08, 0.07, 4, 12)]
  wheelParts[0].rotateX(Math.PI / 2)
  const wheelGeometry = mergeGeometries(wheelParts)
  wheelParts.forEach(part => part.dispose())
  function addWheels(group, sites) {
    for (const x of sites) for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, metal)
      wheel.position.set(x, WHEEL_RADIUS, side * 1.22)
      group.add(wheel); wheels.push(wheel)
    }
  }
  const locomotive = new THREE.Group()
  locomotive.name = 'ending-locomotive'
  root.add(locomotive)
  const engine = builder(locomotive)
  engine.box(metal, 13.8, 0.45, 2.7, 0, 1.12, 0)
  engine.add(metal, new THREE.CylinderGeometry(1.22, 1.22, 7.8, 14), 1.6, 2.62, 0, 0, 0, Math.PI / 2)
  engine.add(metal, new THREE.CylinderGeometry(1.27, 1.27, 0.25, 14), 5.5, 2.62, 0, 0, 0, Math.PI / 2)
  engine.box(paint, 3.3, 2.8, 2.9, -4.65, 2.7, 0)
  engine.box(roof, 3.7, 0.22, 3.25, -4.65, 4.2, 0)
  for (const side of [-1, 1]) engine.box(windows, 1.3, 1.15, 0.035, -4.35, 3.1, side * 1.47)
  engine.add(metal, new THREE.CylinderGeometry(0.42, 0.28, 1.6, 10), 4.1, 4.1, 0)
  for (const x of [-0.5, 1.5]) engine.add(metal, new THREE.SphereGeometry(0.48, 10, 6), x, 3.8, 0)
  engine.add(headlamp, new THREE.CylinderGeometry(0.36, 0.36, 0.08, 16), 5.67, 2.9, 0, 0, 0, Math.PI / 2)
  // Sloped low cowcatcher reaches the exact +7 m nose envelope.
  const catcherCenter = LOCOMOTIVE_HALF_LENGTH - 0.6 * Math.cos(0.24) - 0.06 * Math.sin(0.24)
  engine.add(metal, new THREE.BoxGeometry(1.2, 0.12, 2.7), catcherCenter, 0.56, 0, 0, 0, -0.24)
  for (const side of [-1, 1]) engine.box(glow, 6.3, 0.055, 0.075, 0.2, 0.12, side * 1.22)
  engine.finish()
  addWheels(locomotive, [-2.2, 0, 2.2])

  // One additive cone; vertex alpha softens both its rim and distant end.
  const beamGeometry = new THREE.ConeGeometry(1.4, 9, 20, 1, true)
  const beamPositions = beamGeometry.attributes.position
  const colors = new Float32Array(beamPositions.count * 4)
  for (let i = 0; i < beamPositions.count; i++) {
    const atTip = beamPositions.getY(i) > 0
    colors[i * 4] = 1; colors[i * 4 + 1] = 0.7; colors[i * 4 + 2] = 0.32
    colors[i * 4 + 3] = atTip ? 0.12 : 0
  }
  beamGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  beamGeometry.rotateZ(Math.PI / 2) // tip is at -X; cone widens towards +X.
  const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: 0xffcf83,
    vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide }))
  beam.position.set(10.22, 2.9, 0)
  beam.name = 'ending-headlight-cone'
  locomotive.add(beam)

  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group()
    group.name = `ending-carriage-${i + 1}`
    const baseX = -15.5 - i * 16
    group.position.x = baseX
    group.rotation.y = THREE.MathUtils.degToRad(YAW_DEGREES[i])
    group.rotation.x = THREE.MathUtils.degToRad(ROLL_DEGREES[i])
    root.add(group); cars.push({ group, baseX })
    const car = builder(group)
    car.box(metal, 15, 0.35, 2.8, 0, 1.1, 0)
    car.box(interior, 14.7, 1.85, 2.65, 0, 2.15, 0)
    // Dark inset ceiling prevents a straight view through the missing roof.
    car.box(interior, 14.7, 0.08, 2.9, 0, 3.18, 0)
    for (const side of [-1, 1]) {
      for (let panel = 0; panel < 10; panel++) {
        const x = -6.75 + panel * 1.5
        const missingWall = i === 2 && (panel === 3 || panel === 4) && side === 1
        if (!missingWall) {
          car.box(paint, 1.46, 0.9, 0.12, x, 1.72, side * 1.48)
          car.box(paint, 1.46, 0.43, 0.12, x, 3.22, side * 1.48)
          car.box(paint, 0.18, 1.1, 0.12, x - 0.65, 2.6, side * 1.48)
          car.box(windows, 1.08, 0.84, 0.035, x + 0.04, 2.6, side * 1.55)
        }
      }
    }
    for (const end of [-1, 1]) car.box(paint, 0.12, 2.3, 3.0, end * 7.45, 2.25, 0)
    for (let panel = 0; panel < 6; panel++) {
      if ((i === 1 && (panel === 2 || panel === 3)) || (i === 2 && panel >= 2 && panel <= 4)) continue
      const cap = new THREE.CylinderGeometry(1.65, 1.65, 2.48, 12, 1, true, 0, Math.PI)
      cap.rotateZ(Math.PI / 2); cap.scale(1, 0.48, 1)
      car.add(roof, cap, -6.25 + panel * 2.5, 3.43, 0)
    }
    if (i === 0) for (const side of [-1, 1]) car.box(glow, 12, 0.055, 0.075, 0, 0.12, side * 1.22)
    car.finish()
    addWheels(group, [-5.5, 5.5])
  }

  function update(centerX, distance, brakingProgress, settleTime = -1) {
    root.position.x = Math.min(STOP_CENTER_X, centerX)
    for (const wheel of wheels) wheel.rotation.z = -distance / WHEEL_RADIUS
    locomotive.rotation.z = settleTime >= 0
      ? -SETTLE_PITCH * SPRING_GAIN * Math.exp(-SPRING_DAMPING * settleTime) * Math.sin(SPRING_FREQUENCY * settleTime) : 0
    for (let i = 0; i < cars.length; i++) {
      const t = settleTime - (i + 1) * COUPLING_DELAY
      cars[i].group.position.x = cars[i].baseX + (settleTime >= 0 && t > 0
        ? COUPLING_BUMP * Math.exp(-SPRING_DAMPING * t) * Math.sin(SPRING_FREQUENCY * t) : 0)
    }
    glow.emissiveIntensity = brakingProgress >= 0 ? GLOW_PEAK * Math.sin(Math.PI * (0.15 + brakingProgress * 0.7))
      : settleTime >= 0 ? GLOW_PEAK * 0.45 * Math.exp(-3 * settleTime) : 0
  }
  return { root, locomotive, carriages: cars.map(car => car.group), update,
    dispose() { root.removeFromParent(); disposeObject(root) } }
}

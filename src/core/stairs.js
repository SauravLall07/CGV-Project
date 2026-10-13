import * as THREE from 'three'
import { applyWorldUvs, projectUvs } from './world-uvs.js'

// Builds visible stepped geometry while exposing a smooth floor-height sampler
// for the player controller. The player therefore travels cleanly up/down the
// stairs without requiring a full 3D character controller rewrite.
//
// Side walls and the ceiling are single sloped pieces that follow the flight,
// not one box per step: per-step boxes left a sawtooth along the top of each
// wall and a stepped ceiling above it. Optional brass nosings and a carpet
// runner (stair rods, a riser cover per step) are drawn as instanced meshes,
// one draw call each however long the flight is.
const WALL_THICKNESS = 0.18
const NOSING_HEIGHT = 0.03
const NOSING_DEPTH = 0.07
const RUNNER_THICKNESS = 0.012

export function createStaircase({
  start,
  end,
  width = 3.2,
  steps = 14,
  wallHeight = 4.6,
  stepMaterial,
  wallMaterial,
  ceilingMaterial,
  addCeiling = true,
  nosingMaterial = null,
  runnerMaterial = null,
  runnerWidth = width * 0.6
} = {}) {
  if (!start || !end) throw new Error('stairs: start and end are required')

  const group = new THREE.Group()
  group.name = 'staircase'

  const dx = end.x - start.x
  const dz = end.z - start.z
  const dy = end.y - start.y
  const runLength = Math.hypot(dx, dz)
  if (runLength < 0.01) throw new Error('stairs: start and end must differ in X/Z')

  const ux = dx / runLength
  const uz = dz / runLength
  const px = uz
  const pz = -ux
  const yaw = Math.atan2(ux, uz)
  const stepDepth = runLength / steps
  const rise = Math.abs(dy) / steps
  const descending = dy < 0
  const lowY = Math.min(start.y, end.y) - 0.25

  const stairMat = stepMaterial ?? new THREE.MeshStandardMaterial({
    color: 0x4b4650,
    roughness: 0.78,
    metalness: 0.08
  })
  const sideMat = wallMaterial ?? new THREE.MeshStandardMaterial({
    color: 0x665d55,
    roughness: 0.9,
    metalness: 0.02
  })
  const roofMat = ceilingMaterial ?? sideMat

  const lineY = (t) => THREE.MathUtils.lerp(start.y, end.y, t)

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const tc = (t0 + t1) / 2
    const topY = lineY(t1)
    const height = Math.max(0.18, topY - lowY)

    const cx = start.x + dx * tc
    const cz = start.z + dz * tc

    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, stepDepth * 1.04),
      stairMat
    )
    tread.position.set(cx, lowY + height / 2, cz)
    tread.rotation.y = yaw
    tread.castShadow = true
    tread.receiveShadow = true
    group.add(tread)
    applyWorldUvs(tread)
  }

  // One wall per side, a parallelogram in the plane of the flight: its top
  // runs parallel to the stair line at wallHeight, its bottom one rise (plus
  // a margin) under the line so it reaches below every tread top.
  const wallShape = new THREE.Shape()
  wallShape.moveTo(0, start.y - rise - 0.05)
  wallShape.lineTo(runLength, end.y - rise - 0.05)
  wallShape.lineTo(runLength, end.y + wallHeight)
  wallShape.lineTo(0, start.y + wallHeight)
  wallShape.closePath()

  for (const side of [-1, 1]) {
    const geometry = new THREE.ExtrudeGeometry(wallShape, { depth: WALL_THICKNESS, bevelEnabled: false })
    geometry.translate(0, 0, -WALL_THICKNESS / 2)
    const wall = new THREE.Mesh(geometry, sideMat)
    wall.name = `staircase-wall-${side}`
    wall.position.set(
      start.x + px * side * (width / 2 + WALL_THICKNESS / 2),
      0,
      start.z + pz * side * (width / 2 + WALL_THICKNESS / 2)
    )
    // Shape X runs along the flight.
    wall.rotation.y = Math.atan2(-uz, ux)
    wall.castShadow = true
    wall.receiveShadow = true
    group.add(wall)
    applyWorldUvs(wall)
  }

  if (addCeiling) {
    const slopeLength = Math.hypot(runLength, dy)
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width + WALL_THICKNESS * 2, 0.18, slopeLength + 0.2),
      roofMat
    )
    ceiling.name = 'staircase-ceiling'
    ceiling.position.set(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2 + wallHeight,
      (start.z + end.z) / 2
    )
    ceiling.rotation.set(-Math.atan2(dy, runLength), yaw, 0, 'YXZ')
    ceiling.receiveShadow = true
    group.add(ceiling)
    applyWorldUvs(ceiling)
  }

  if (nosingMaterial || runnerMaterial) addStairDressing()

  // Every step boundary k (0..steps-1) is a riser: the surface before it is
  // at lineY(k / steps) and the one after at lineY((k + 1) / steps). The
  // nosing caps the higher side's edge; the riser face itself stands out
  // 2% of a step from the boundary, because treads overlap their neighbours.
  function addStairDressing() {
    const dummy = new THREE.Object3D()
    const inward = descending ? -1 : 1 // from the boundary onto the higher tread
    const riserFace = stepDepth * 0.02 + 0.002

    function place(mesh, index, along, y) {
      dummy.position.set(start.x + ux * along, y, start.z + uz * along)
      dummy.rotation.set(0, yaw, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }

    function instanced(geometry, material, name) {
      const mesh = new THREE.InstancedMesh(geometry, material, steps)
      mesh.name = name
      mesh.receiveShadow = true
      group.add(mesh)
      return mesh
    }

    const nosings = nosingMaterial
      ? instanced(new THREE.BoxGeometry(width - 0.12, NOSING_HEIGHT, NOSING_DEPTH), nosingMaterial, 'staircase-nosings')
      : null

    let treadRunners = null
    let riserRunners = null
    if (runnerMaterial) {
      const treadGeometry = new THREE.BoxGeometry(runnerWidth, RUNNER_THICKNESS, stepDepth - NOSING_DEPTH)
      const riserGeometry = new THREE.BoxGeometry(runnerWidth, rise, RUNNER_THICKNESS)
      // Instances share UVs, so project in the pieces' own space.
      projectUvs(treadGeometry, runnerMaterial)
      projectUvs(riserGeometry, runnerMaterial)
      treadRunners = instanced(treadGeometry, runnerMaterial, 'staircase-runner-treads')
      riserRunners = instanced(riserGeometry, runnerMaterial, 'staircase-runner-risers')
    }

    for (let k = 0; k < steps; k++) {
      const edge = k * stepDepth
      const high = Math.max(lineY(k / steps), lineY((k + 1) / steps))
      const front = edge - inward * riserFace

      if (nosings) {
        place(nosings, k, front + inward * NOSING_DEPTH / 2 - inward * 0.01, high + NOSING_HEIGHT / 2 - 0.004)
      }
      if (riserRunners) {
        place(riserRunners, k, front - inward * RUNNER_THICKNESS / 2, high - rise / 2)
      }
      if (treadRunners) {
        // Step k's own top, shortened at whichever edge carries its nosing.
        place(treadRunners, k, (k + 0.5) * stepDepth - (descending ? 1 : -1) * NOSING_DEPTH / 2, lineY((k + 1) / steps) + RUNNER_THICKNESS / 2)
      }
    }

    for (const mesh of [nosings, treadRunners, riserRunners]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  }

  function getFloorHeight(x, z) {
    const rx = x - start.x
    const rz = z - start.z
    const along = rx * ux + rz * uz
    const lateral = Math.abs(rx * px + rz * pz)

    if (along < -0.15 || along > runLength + 0.15) return null
    if (lateral > width / 2 - 0.08) return null

    const t = THREE.MathUtils.clamp(along / runLength, 0, 1)
    return THREE.MathUtils.lerp(start.y, end.y, t)
  }

  return {
    group,
    getFloorHeight,
    start: start.clone(),
    end: end.clone(),
    width,
    runLength
  }
}

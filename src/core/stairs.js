import * as THREE from 'three'

// Merged stair volumes cast on this layer. The sun's shadow camera enables it;
// the gameplay camera does not, so the volumes never draw into the colour pass.
export const SUN_SHADOW_LAYER = 1

// Builds visible stepped geometry while exposing a smooth floor-height sampler
// for the player controller. The player therefore travels cleanly up/down the
// stairs without requiring a full 3D character controller rewrite.
export function createStaircase({
  start,
  end,
  width = 3.2,
  steps = 14,
  wallHeight = 4.6,
  stepMaterial,
  wallMaterial,
  ceilingMaterial,
  addCeiling = true
} = {}) {
  if (!start || !end) throw new Error('stairs: start and end are required')

  const group = new THREE.Group()
  group.name = 'staircase'

  const dx = end.x - start.x
  const dz = end.z - start.z
  const runLength = Math.hypot(dx, dz)
  if (runLength < 0.01) throw new Error('stairs: start and end must differ in X/Z')

  const ux = dx / runLength
  const uz = dz / runLength
  const px = uz
  const pz = -ux
  const yaw = Math.atan2(ux, uz)
  const stepDepth = runLength / steps
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

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const tc = (t0 + t1) / 2
    const topY = THREE.MathUtils.lerp(start.y, end.y, t1)
    const height = Math.max(0.18, topY - lowY)

    const cx = start.x + dx * tc
    const cz = start.z + dz * tc

    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, stepDepth * 1.04),
      stairMat
    )
    tread.position.set(cx, lowY + height / 2, cz)
    tread.rotation.y = yaw
    tread.receiveShadow = true
    group.add(tread)

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, wallHeight, stepDepth * 1.08),
        sideMat
      )
      wall.position.set(
        cx + px * side * (width / 2 + 0.09),
        topY + wallHeight / 2,
        cz + pz * side * (width / 2 + 0.09)
      )
      wall.rotation.y = yaw
      wall.receiveShadow = true
      group.add(wall)
    }

    if (addCeiling) {
      const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.36, 0.18, stepDepth * 1.08),
        roofMat
      )
      ceiling.position.set(cx, topY + wallHeight, cz)
      ceiling.rotation.y = yaw
      ceiling.receiveShadow = true
      group.add(ceiling)
    }
  }

  // One shadow volume for the step mass, one per side wall, and one for the
  // ceiling. The per-step meshes stay visible and receive shadows; these
  // proxies are what actually occlude the sun, so a flight is a handful of
  // casters instead of three meshes per step.
  const shadowMat = new THREE.MeshBasicMaterial()
  const yMin = Math.min(start.y, end.y)
  const yMax = Math.max(start.y, end.y)
  const midX = (start.x + end.x) / 2
  const midZ = (start.z + end.z) / 2

  function addShadowVolume(sizeX, sizeY, sizeZ, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), shadowMat)
    mesh.name = 'stair-shadow-volume'
    mesh.position.set(x, y, z)
    mesh.rotation.y = yaw
    mesh.castShadow = true
    mesh.layers.set(SUN_SHADOW_LAYER)
    group.add(mesh)
  }

  addShadowVolume(width, yMax - lowY, runLength, midX, (lowY + yMax) / 2, midZ)
  const wallSpan = (yMax - yMin) + wallHeight
  for (const side of [-1, 1]) {
    addShadowVolume(
      0.22,
      wallSpan,
      runLength + stepDepth,
      midX + px * side * (width / 2 + 0.09),
      yMin + wallSpan / 2,
      midZ + pz * side * (width / 2 + 0.09)
    )
  }
  if (addCeiling) {
    const ceilLow = yMin + wallHeight
    const ceilHigh = yMax + wallHeight + 0.18
    addShadowVolume(
      width + 0.36,
      ceilHigh - ceilLow,
      runLength + stepDepth,
      midX,
      (ceilLow + ceilHigh) / 2,
      midZ
    )
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

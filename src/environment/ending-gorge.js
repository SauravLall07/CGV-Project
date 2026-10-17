import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createSkyDome } from './sky-dome.js'
import { disposeObject } from '../core/dispose.js'

export const BRIDGE_START = -260
export const GAP_START = 0
export const GAP_END = 9
export const STUB_END = 40
export const GORGE_FLOOR = -42
// Camera forward + 0.65 right + 0.42 up: moon lands in the upper-right quadrant.
export const MOON_DIRECTION = new THREE.Vector3(1.142, 0.224, -0.494).normalize()
const BENT_SPACING = 6
const BRACE_HEIGHT = 8
const SLEEPER_SPACING = 0.6
const PINE_COUNT = 32

// X-only envelope keeps every rock/tree well below or outside the camera rays.
export function endingTerrainHeight(x) {
  if (x <= -150 || x >= 60) return -2
  if (x < -24) return -42 + 40 * Math.pow((-24 - x) / 126, 1.15)
  if (x <= -6) return GORGE_FLOOR
  return -42 + 40 * Math.pow((x + 6) / 66, 1.15)
}

export function createEndingGorge(scene) {
  const root = new THREE.Group()
  root.name = 'ending-gorge'
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x252c36, roughness: 0.6, metalness: 0.65 })
  const cliff = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 1, flatShading: true })
  const segments = []
  const pose = new THREE.Object3D()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const direction = new THREE.Vector3()
  function box(x, y, z, sx, sy, sz, rx = 0, rz = 0) {
    pose.position.set(x, y, z)
    pose.rotation.set(rx, 0, rz)
    pose.scale.set(sx, sy, sz)
    pose.updateMatrix()
    segments.push(pose.matrix.clone())
  }
  function beam(ax, ay, az, bx, by, bz, width = 0.32) {
    a.set(ax, ay, az); b.set(bx, by, bz)
    direction.subVectors(b, a)
    pose.position.copy(a).add(b).multiplyScalar(0.5)
    pose.quaternion.setFromUnitVectors(up, direction.normalize())
    pose.scale.set(width, a.distanceTo(b), width)
    pose.updateMatrix()
    segments.push(pose.matrix.clone())
  }
  function section(start, end, brokenStart, brokenEnd) {
    for (let x = start + 0.3; x < end; x += SLEEPER_SPACING) {
      const broken = (brokenEnd && x > end - 1.5) || (brokenStart && x < start + 1.5)
      if (broken && Math.floor(x * 10) % 3 === 0) continue
      box(x, -0.28, broken ? Math.sin(x * 9) * 0.12 : 0, 0.25, 0.26, 3.2,
        broken ? Math.sin(x * 7) * 0.12 : 0)
    }
    for (const z of [-1.35, 1.35]) box((start + end) / 2, -0.62, z, end - start, 0.5, 0.42)
    let lastX = null
    for (let x = start + 2; x < end - 1; x += BENT_SPACING) {
      const floor = Math.min(-2.3, endingTerrainHeight(x))
      for (const side of [-1, 1]) beam(x, -0.85, side * 1.28, x, floor, side * 2.25, 0.42)
      box(x, -0.94, 0, 0.6, 0.5, 3.6)
      for (let y = -2; y > floor + 0.5; y -= BRACE_HEIGHT) {
        const low = Math.max(floor + 0.2, y - BRACE_HEIGHT)
        box(x, low, 0, 0.3, 0.25, 4.1)
        if (lastX !== null) for (const side of [-1, 1]) {
          beam(lastX, y, side * 1.65, x, low, side * 1.65, 0.24)
          beam(lastX, low, side * 1.65, x, y, side * 1.65, 0.24)
        }
      }
      lastX = x
    }
    for (const z of [-1.22, 1.22]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(end - start, 0.16, 0.1), steel)
      rail.position.set((start + end) / 2, -0.08, z)
      root.add(rail)
    }
  }
  section(BRIDGE_START, GAP_START, false, true)
  section(GAP_END, STUB_END, true, false)
  for (let i = 0; i < 5; i++) {
    box(-0.3 - i * 0.2, -1.5 - i * 0.35, -1.3 + i * 0.62,
      0.22, 2.8 + i * 0.15, 0.3, 0.15 + i * 0.13, -0.15 - i * 0.12)
    box(9.4 + i * 0.16, -1.2 - i * 0.3, -1.3 + i * 0.62,
      0.22, 2.4 + i * 0.12, 0.3, -0.2 - i * 0.1, 0.2 + i * 0.1)
  }
  const timber = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, segments.length)
  timber.name = 'ending-all-timber'
  segments.forEach((matrix, i) => timber.setMatrixAt(i, matrix))
  timber.instanceMatrix.needsUpdate = true
  timber.computeBoundingSphere()
  root.add(timber)

  // Coarse faceted banks, spanning Z without a foreground wall above the rays.
  const terrain = new THREE.PlaneGeometry(580, 700, 40, 14)
  terrain.rotateX(-Math.PI / 2)
  const positions = terrain.attributes.position
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - 80
    const z = positions.getZ(i)
    const rough = x > -24 && x < -6 ? 0 : Math.sin(x * 0.11 + z * 0.07) * 1.1
    positions.setXYZ(i, x, endingTerrainHeight(x) + rough - 0.5, z)
  }
  terrain.computeVertexNormals()
  const banks = new THREE.Mesh(terrain, cliff)
  banks.name = 'ending-gorge-banks'
  root.add(banks)
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), cliff, 24)
  for (let i = 0; i < 24; i++) {
    const x = i % 2 ? 68 + (i * 19 % 90) : -105 - (i * 23 % 100)
    const z = -130 + (i * 47 % 250)
    pose.position.set(x, endingTerrainHeight(x) - 3, z)
    pose.rotation.set(i * 0.7, i * 1.3, i * 0.3)
    pose.scale.set(5 + i % 3, 4 + i % 4, 5 + i % 2)
    pose.updateMatrix(); rocks.setMatrixAt(i, pose.matrix)
  }
  rocks.instanceMatrix.needsUpdate = true
  rocks.computeBoundingSphere()
  root.add(rocks)
  const river = new THREE.Mesh(new THREE.PlaneGeometry(17, 700),
    new THREE.MeshStandardMaterial({ color: 0x132e48, roughness: 0.28, metalness: 0 }))
  river.rotation.x = -Math.PI / 2
  river.position.set(-15, -41.8, 0)
  river.name = 'ending-river'
  root.add(river)

  const needles = new THREE.MeshStandardMaterial({ color: 0x14241c, roughness: 1, flatShading: true })
  const crownParts = [0, 1, 2].map(i => {
    const geometry = new THREE.ConeGeometry(2.3 - i * 0.45, 4, 5)
    geometry.translate(0, 4 + i * 2.2, 0)
    return geometry
  })
  const crownGeometry = mergeGeometries(crownParts)
  crownParts.forEach(geometry => geometry.dispose())
  const crowns = new THREE.InstancedMesh(crownGeometry, needles, PINE_COUNT)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 3, 5), wood, PINE_COUNT)
  for (let i = 0; i < PINE_COUNT; i++) {
    const x = i % 2 ? 72 + (i * 31 % 80) : -112 - (i * 37 % 120)
    const z = -115 + (i * 53 % 250)
    const size = 0.65 + (i * 17 % 11) / 15
    pose.position.set(x, endingTerrainHeight(x), z)
    pose.rotation.set(0, i * 2.4, 0); pose.scale.setScalar(size)
    pose.updateMatrix(); crowns.setMatrixAt(i, pose.matrix)
    pose.position.y += 1.5 * size
    pose.updateMatrix(); trunks.setMatrixAt(i, pose.matrix)
  }
  for (const mesh of [crowns, trunks]) {
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); root.add(mesh)
  }
  const sky = createSkyDome('moving-heist')
  sky.uniforms.uMoonDirection.value.copy(MOON_DIRECTION)
  sky.uniforms.uCloudAmount.value = 0.12
  root.add(sky.mesh)
  const fill = new THREE.HemisphereLight(0x708dbb, 0x121825, 1.4)
  const moon = new THREE.DirectionalLight(0xa4c7ff, 2.4)
  moon.position.copy(MOON_DIRECTION).multiplyScalar(100)
  root.add(fill, moon)
  scene.add(root)
  scene.background = new THREE.Color(0x050e22)
  scene.fog = new THREE.Fog(0x071226, 145, 480)
  scene.environment = null
  return { root, timberCount: segments.length, update: delta => sky.update(delta),
    dispose() { root.removeFromParent(); disposeObject(root) } }
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createSteam } from './landing/steam.js'
import { BOILER_HOLE, createDamageUniforms, patchTimeDamage } from '../shaders/ending-time-damage.js'

export const HEADLIGHT_GLOW_SIZE = 2.2

export function createEndingLocomotive(paint) {
  const root = new THREE.Group()
  root.name = 'ending-hero-locomotive'
  const metal = new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: 0.48, metalness: 0.3,
    emissive: 0x252a30, emissiveIntensity: 0.03 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xb69851, roughness: 0.4, metalness: 0.55,
    emissive: 0xb69851, emissiveIntensity: 0.025 })
  const red = new THREE.MeshStandardMaterial({ color: 0x942a20, roughness: 0.7,
    emissive: 0x942a20, emissiveIntensity: 0.03 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x6a3d16, emissive: 0xffa84a, emissiveIntensity: 0.75, roughness: 0.4 })
  const lens = new THREE.MeshStandardMaterial({ color: 0xffdb98, emissive: 0xffd68a, emissiveIntensity: 1.8 })
  const damage = createDamageUniforms([BOILER_HOLE])
  for (const material of [paint, metal, brass, red, glass]) patchTimeDamage(material, damage)
  root.userData.holes = [BOILER_HOLE]
  const parts = new Map()
  function add(mat, geometry, x, y, z, rx = 0, ry = 0, rz = 0) {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z)
    const ready = geometry.index ? geometry.toNonIndexed() : geometry
    if (ready !== geometry) geometry.dispose()
    if (!parts.has(mat)) parts.set(mat, [])
    parts.get(mat).push(ready)
  }
  function box(mat, w, h, d, x, y, z) { add(mat, new THREE.BoxGeometry(w, h, d), x, y, z) }
  function rod(mat, a, b, radius = 0.025) {
    const geometry = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6)
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    const center = a.clone().add(b).multiplyScalar(0.5)
    add(mat, geometry, center.x, center.y, center.z)
  }
  box(metal, 1.65, 0.28, 9, 0, 1.03, 1)
  add(paint, new THREE.CylinderGeometry(0.85, 0.85, 5.7, 32), 0, 2.6, 1.65, Math.PI / 2)
  for (const z of [-0.8, 0.7, 2.2, 3.7]) add(brass, new THREE.TorusGeometry(0.86, 0.018, 6, 32), 0, 2.6, z)
  add(metal, new THREE.CylinderGeometry(0.93, 0.93, 1, 32), 0, 2.6, 4.65, Math.PI / 2)
  add(metal, new THREE.CylinderGeometry(0.85, 0.85, 0.12, 32), 0, 2.6, 5.22, Math.PI / 2)
  box(brass, 0.85, 0.07, 0.07, 0, 2.6, 5.3)
  box(metal, 0.12, 1.3, 0.08, -0.65, 2.6, 5.3)
  add(brass, new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16), 0, 2.96, 5.32, Math.PI / 2)
  for (const side of [-1, 1]) {
    rod(brass, new THREE.Vector3(side * 0.94, 2.9, -0.6), new THREE.Vector3(side * 0.94, 2.9, 4.3))
    box(metal, 0.26, 0.1, 7.5, side * 1.07, 1.5, 1)
    add(metal, new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16), side * 0.9, 0.9, 4.6, Math.PI / 2)
  }
  add(metal, new THREE.CylinderGeometry(0.25, 0.2, 1.6, 20), 0, 4.05, 3.8)
  add(metal, new THREE.CylinderGeometry(0.39, 0.25, 0.3, 20), 0, 4.95, 3.8)
  for (const z of [0.1, 1.7]) {
    add(brass, new THREE.CylinderGeometry(0.35, 0.4, 0.45, 20), 0, 3.5, z)
    add(brass, new THREE.SphereGeometry(0.35, 20, 10), 0, 3.72, z)
  }
  add(brass, new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), 0.35, 3.9, -0.2)
  box(paint, 2.6, 2.7, 3, 0, 2.5, -2.2)
  box(metal, 2.9, 0.16, 3.3, 0, 3.93, -2.2)
  for (const side of [-1, 1]) {
    box(brass, 0.05, 1.05, 1.3, side * 1.32, 3, -1.8)
    box(glass, 0.065, 0.83, 1.07, side * 1.35, 3, -1.8)
    box(paint, 0.08, 0.85, 0.06, side * 1.39, 3, -1.8)
  }
  box(red, 2.6, 0.38, 0.26, 0, 1.1, 5.9)
  for (const side of [-1, 1]) {
    add(metal, new THREE.CylinderGeometry(0.12, 0.12, 0.55, 12), side * 0.85, 1.1, 6.23, Math.PI / 2)
    add(metal, new THREE.CylinderGeometry(0.25, 0.25, 0.09, 16), side * 0.85, 1.1, 6.54, Math.PI / 2)
  }
  for (let i = -5; i <= 5; i++) rod(metal, new THREE.Vector3(i * 0.21, 0.93, 5.9), new THREE.Vector3(i * 0.24, 0.27, 7.04), 0.035)
  box(metal, 2.55, 0.08, 0.08, 0, 0.25, 7.06)
  // Housing is physically joined to the smokebox. The beam tip coincides with its lens.
  box(metal, 0.25, 0.45, 0.35, 0, 3.23, 5.05)
  add(metal, new THREE.CylinderGeometry(0.32, 0.32, 0.55, 24), 0, 3.55, 5.35, Math.PI / 2)
  add(lens, new THREE.CircleGeometry(0.265, 24), 0, 3.55, 5.63)
  for (const [mat, geometries] of parts) {
    const geometry = mergeGeometries(geometries)
    geometries.forEach(part => part.dispose())
    root.add(new THREE.Mesh(geometry, mat))
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x151716, roughness: 0.95 })
  const coreGeometry = new THREE.CylinderGeometry(0.57, 0.57, 2.45, 20)
  coreGeometry.rotateX(Math.PI / 2); coreGeometry.translate(0, 2.6, 1.65)
  const core = new THREE.Mesh(coreGeometry, dark); core.name = 'ending-boiler-interior'; root.add(core)
  const ribs = []
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.TorusGeometry(0.73, 0.035, 6, 24)
    rib.translate(0, 2.6, 0.7 + i * 0.38); ribs.push(rib)
  }
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x665d49, roughness: 0.6, metalness: 0.3 })
  patchTimeDamage(ribMaterial, createDamageUniforms())
  const ribMesh = new THREE.Mesh(mergeGeometries(ribs), ribMaterial)
  ribs.forEach(rib => rib.dispose()); ribMesh.name = 'ending-boiler-ribs'; root.add(ribMesh)
  const wheelParts = []
  const disc = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 24); disc.rotateZ(Math.PI / 2)
  // Open spokes over a small hub; avoid an opaque disc hiding the spokes.
  disc.scale(1, 0.25, 0.25); wheelParts.push(disc)
  const tyre = new THREE.TorusGeometry(0.74, 0.06, 6, 24); tyre.rotateY(Math.PI / 2); wheelParts.push(tyre)
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.BoxGeometry(0.1, 0.07, 1.36); spoke.rotateX(i * Math.PI / 8); wheelParts.push(spoke)
  }
  const weight = new THREE.BoxGeometry(0.16, 0.28, 0.48); weight.translate(0.06, -0.3, 0); wheelParts.push(weight)
  const wheelGeometry = mergeGeometries(wheelParts); wheelParts.forEach(part => part.dispose())
  const drivers = new THREE.InstancedMesh(wheelGeometry, metal, 6)
  drivers.name = 'ending-driving-wheels'
  const leadingGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.14, 16); leadingGeometry.rotateZ(Math.PI / 2)
  const leading = new THREE.InstancedMesh(leadingGeometry, metal, 4)
  const rods = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), brass, 6)
  root.add(drivers, leading, rods)
  const beamGeometry = new THREE.ConeGeometry(1.2, 6, 24, 4, true)
  const color = new Float32Array(beamGeometry.attributes.position.count * 4)
  for (let i = 0; i < beamGeometry.attributes.position.count; i++) {
    const life = (beamGeometry.attributes.position.getY(i) + 3) / 6
    color.set([1, 0.8, 0.5, life * life * 0.12], i * 4)
  }
  beamGeometry.setAttribute('color', new THREE.BufferAttribute(color, 4)); beamGeometry.rotateX(-Math.PI / 2)
  const cone = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
    opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  cone.name = 'ending-headlight-cone'; cone.position.set(0, 3.55, 8.63); root.add(cone)
  const glowPixels = new Uint8Array(64 * 64 * 4)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5)
    const index = (y * 64 + x) * 4
    glowPixels[index] = glowPixels[index + 1] = glowPixels[index + 2] = 255
    glowPixels[index + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 2 * Math.exp(-2 * radius * radius))
  }
  const glowMap = new THREE.DataTexture(glowPixels, 64, 64)
  glowMap.needsUpdate = true
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffd69a,
    blending: THREE.AdditiveBlending, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, fog: false }))
  // Sprite's default quad is shared by Three.js: clone before ending-owned teardown.
  glow.geometry = glow.geometry.clone()
  glow.name = 'ending-headlight-glow'; glow.position.set(0, 3.55, 5.66)
  glow.scale.set(HEADLIGHT_GLOW_SIZE, HEADLIGHT_GLOW_SIZE, 1); root.add(glow)
  const plume = createSteam({ count: 46, height: 6, spread: 1.7, period: 7, size: 0.96,
    color: 0xc8ccd4, opacity: 0.3, wind: new THREE.Vector3(0, 0.6, -5) })
  plume.points.name = 'ending-chimney-steam'
  plume.points.position.set(0, 5.15, 3.8)
  root.add(plume.points)
  const hisses = [-1, 1].map(side => {
    const hiss = createSteam({ count: 4, height: 0.7, spread: 0.25, period: 2, size: 0.6,
      opacity: 0, wind: new THREE.Vector3(side * 1.2, 0.2, -0.5), seed: 51 + side })
    hiss.points.name = 'ending-cylinder-hiss'
    hiss.points.position.set(side * 0.9, 0.9, 4.6)
    root.add(hiss.points)
    return hiss
  })
  const pose = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const sides = [-1, 1], driverSites = [-0.8, 1, 2.8], leadingSites = [4.4, 5.25]
  let wheelAngle = 0
  let steamFrozen = false
  function update(distance, delta = 0, speed = 0, settleTime = -1) {
    plume.update(steamFrozen ? 0 : delta * (0.2 + 0.8 * speed / 26))
    plume.points.material.uniforms.uWind.value.z = -5 - speed * 0.18
    for (const hiss of hisses) {
      hiss.update(steamFrozen ? 0 : delta)
      hiss.points.material.uniforms.uOpacity.value = settleTime >= 0 && settleTime < 0.6
        ? 0.12 * (1 - settleTime / 0.6) : 0
    }
    wheelAngle = distance / 0.8
    let n = 0
    for (const side of sides) for (const z of driverSites) {
      pose.position.set(side * 0.75, 0.8, z); pose.rotation.set(wheelAngle, 0, 0); pose.scale.setScalar(1)
      pose.updateMatrix(); drivers.setMatrixAt(n++, pose.matrix)
    }
    n = 0
    for (const side of sides) for (const z of leadingSites) {
      pose.position.set(side * 0.75, 0.35, z); pose.rotation.set(distance / 0.35, 0, 0)
      pose.updateMatrix(); leading.setMatrixAt(n++, pose.matrix)
    }
    n = 0
    const crankY = 0.8 + Math.cos(wheelAngle) * 0.22, crankZ = Math.sin(wheelAngle) * 0.22
    for (const side of sides) for (let rod = 0; rod < 3; rod++) {
      a.set(side * 0.94, rod === 2 ? 0.9 : crankY, rod === 0 ? -0.8 + crankZ : 2.8 + crankZ)
      b.set(side * 0.94, rod === 0 ? crankY : 0.9, rod === 0 ? 2.8 + crankZ : 4.65 + crankZ)
      direction.subVectors(b, a)
      pose.position.copy(a).add(b).multiplyScalar(0.5)
      pose.quaternion.setFromUnitVectors(up, direction.normalize()); pose.scale.set(0.07, a.distanceTo(b), 0.08)
      pose.updateMatrix(); rods.setMatrixAt(n++, pose.matrix)
    }
    drivers.instanceMatrix.needsUpdate = true; leading.instanceMatrix.needsUpdate = true; rods.instanceMatrix.needsUpdate = true
    damage.uTime.value += Math.max(0, delta)
    ribMaterial.userData.endingTimeDamage.uTime.value = damage.uTime.value
    ribMaterial.userData.endingTimeDamage.uRift.value = damage.uRift.value
  }
  // Known animated envelopes avoid per-frame bounds rebuilding.
  for (const mesh of [drivers, leading, rods]) { mesh.frustumCulled = false }
  update(0)
  return { root, update, damage, setSteamFrozen(value) { steamFrozen = value }, chimney: new THREE.Vector3(0, 5.15, 3.8) }
}

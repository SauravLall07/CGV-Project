import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createParticleField } from './particles.js'

// Level-3-only scenery off the hull: sparse wreckage, trail sparks, and
// near-track streaks so blown windows read as a train tearing itself apart
// at speed. Dark unlit / low-emissive materials keep the interior path
// brighter than the night outside. The large brown plates are gameplay
// obstacles in levels/timewreck-flying-panels.js; only small scrap stays here.

const skew = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1

function noCam(obj) {
  obj.userData.noCameraCollision = true
  return obj
}

export function createTimewreckExterior({ minZ = -50, maxZ = 40, speed = 45 } = {}) {
  const group = new THREE.Group()
  group.name = 'timewreck-exterior'
  noCam(group)

  const dummy = new THREE.Object3D()
  const wrapSpan = maxZ - minZ + 28
  const wrapMin = minZ - 14

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20, roughness: 0.72, metalness: 0.62, emissive: 0x080605, emissiveIntensity: 0.15
  })
  const streakMat = new THREE.MeshBasicMaterial({ color: 0x0c0a09 })

  // --- Fast near-track sleepers / ballast flashes (one wrap group) --------
  const STREAK_N = 36
  const streakMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.9, 0.05, 0.18),
    streakMat,
    STREAK_N
  )
  streakMesh.name = 'wreck-underfloor-sleepers'
  streakMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  noCam(streakMesh)
  streakMesh.castShadow = false
  streakMesh.receiveShadow = false
  const streakPeriod = 10
  for (let i = 0; i < STREAK_N; i++) {
    const side = i % 2 === 0 ? -1 : 1
    dummy.position.set(side * (2.12 + Math.abs(skew(i + 2)) * 0.18), -0.42, (i / STREAK_N) * streakPeriod)
    dummy.rotation.set(0, skew(i + 5) * 0.08, 0)
    dummy.scale.set(0.7 + Math.abs(skew(i + 8)) * 0.5, 1, 0.8 + Math.abs(skew(i + 11)) * 0.7)
    dummy.updateMatrix()
    streakMesh.setMatrixAt(i, dummy.matrix)
  }
  streakMesh.instanceMatrix.needsUpdate = true
  const streakGroup = new THREE.Group()
  streakGroup.add(streakMesh)
  group.add(streakGroup)

  // Longer motion-smear rails just outside the hull, both sides.
  const smearGeo = new THREE.BoxGeometry(0.04, 0.03, 3.6)
  const smearMat = new THREE.MeshBasicMaterial({
    color: 0x16120f, transparent: true, opacity: 0.45, depthWrite: false
  })
  const SMEAR_N = 16
  const smearMesh = new THREE.InstancedMesh(smearGeo, smearMat, SMEAR_N)
  smearMesh.name = 'wreck-underfloor-rail-smears'
  smearMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  noCam(smearMesh)
  for (let i = 0; i < SMEAR_N; i++) {
    const side = i < 8 ? -1 : 1
    dummy.position.set(side * 2.08, -0.28 + (i % 4) * 0.04, (i % 8) * 1.15)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 0.7 + (i % 3) * 0.25)
    dummy.updateMatrix()
    smearMesh.setMatrixAt(i, dummy.matrix)
  }
  smearMesh.instanceMatrix.needsUpdate = true
  const smearGroup = new THREE.Group()
  smearGroup.add(smearMesh)
  group.add(smearGroup)

  // --- Occasional hull fragments streaming past the windows ---------------
  const beamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 1.9), steelMat, 6)
  beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  noCam(beamMesh)
  beamMesh.castShadow = false
  group.add(beamMesh)

  function makeFlyer(n, closeBias) {
    const side = skew(n + 1) < 0 ? -1 : 1
    const close = Math.abs(skew(n + 4)) < closeBias
    return {
      x: side * (close ? 4.5 + Math.abs(skew(n + 7)) * 0.35 : 5.2 + Math.abs(skew(n + 9)) * 2.4),
      y: close ? 1.15 + Math.abs(skew(n + 13)) * 0.9 : 0.35 + Math.abs(skew(n + 15)) * 2.2,
      z: wrapMin + Math.abs(skew(n + 19)) * wrapSpan,
      vz: speed * (0.72 + Math.abs(skew(n + 23)) * 0.7),
      rx: skew(n + 29) * 0.8,
      ry: skew(n + 31) * Math.PI,
      rz: skew(n + 37) * 0.6,
      wrx: skew(n + 41) * 1.4,
      wry: skew(n + 43) * 1.8,
      wrz: skew(n + 47) * 1.1,
      sx: 0.7 + Math.abs(skew(n + 53)) * 0.55,
      sy: 0.75 + Math.abs(skew(n + 59)) * 0.4,
      sz: 0.8 + Math.abs(skew(n + 61)) * 0.7
    }
  }

  const beams = Array.from({ length: 6 }, (_, i) => makeFlyer(i * 5 + 80, 0.4))

  function writeFlyer(mesh, flyer, i) {
    dummy.position.set(flyer.x, flyer.y, flyer.z)
    dummy.rotation.set(flyer.rx, flyer.ry, flyer.rz)
    dummy.scale.set(flyer.sx, flyer.sy, flyer.sz)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }

  function stepFlyer(flyer, dt) {
    flyer.z += flyer.vz * dt
    flyer.rx += flyer.wrx * dt
    flyer.ry += flyer.wry * dt
    flyer.rz += flyer.wrz * dt
    if (flyer.z > wrapMin + wrapSpan) flyer.z -= wrapSpan
    if (flyer.z < wrapMin) flyer.z += wrapSpan
  }

  const sparks = createParticleField({
    count: 64,
    area: {
      halfX: 7.5,
      minAbsX: 3.4,
      minY: 0.15,
      maxY: 2.9,
      minZ: minZ - 6,
      maxZ: maxZ + 10
    },
    color: 0xff6a32,
    size: 0.042,
    opacity: 0.32,
    gravity: -0.22,
    drift: 0.18,
    streamZ: speed * 0.85,
    seed: 71
  })
  sparks.material.color.setHex(0xc44a22)
  group.add(sparks.points)

  const embers = createParticleField({
    count: 40,
    area: {
      halfX: 9.5,
      minAbsX: 3.2,
      minY: 0.6,
      maxY: 3.6,
      minZ: minZ - 4,
      maxZ: maxZ + 8
    },
    color: 0xa03818,
    size: 0.07,
    opacity: 0.2,
    gravity: 0.12,
    drift: 0.12,
    streamZ: speed * 0.55,
    seed: 83
  })
  group.add(embers.points)

  let streakScroll = 0
  let smearScroll = 0

  function paintFlyers() {
    for (let i = 0; i < beams.length; i++) writeFlyer(beamMesh, beams[i], i)
    beamMesh.instanceMatrix.needsUpdate = true
  }
  paintFlyers()

  return {
    group,
    update(delta, speedScale = 1) {
      const travel = delta * Math.max(0, speedScale)
      if (travel <= 0) {
        sparks.update(0)
        embers.update(0)
        return
      }

      streakScroll += travel * speed * 1.55
      smearScroll += travel * speed * 2.1
      streakGroup.position.z = minZ + ((streakScroll % streakPeriod + streakPeriod) % streakPeriod)
      smearGroup.position.z = minZ + ((smearScroll % 9.2 + 9.2) % 9.2) * 0.5

      for (const flyer of beams) stepFlyer(flyer, travel)
      paintFlyers()

      sparks.update(travel)
      embers.update(travel)
    },
    dispose() {
      disposeObject(group)
    },
    setFrozenLook(on) {
      steelMat.emissive.setHex(on ? 0x7dd3fc : 0x080605)
      steelMat.emissiveIntensity = on ? 1.1 : 0.15
      sparks.material.color.setHex(on ? 0xe0f2fe : 0xc44a22)
      sparks.material.size = on ? 0.1 : 0.042
      sparks.material.opacity = on ? 0.85 : 0.32
      embers.material.color.setHex(on ? 0xbfdbfe : 0xa03818)
      embers.material.size = on ? 0.13 : 0.07
      embers.material.opacity = on ? 0.7 : 0.2
    }
  }
}

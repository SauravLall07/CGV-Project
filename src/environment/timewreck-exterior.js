import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createParticleField } from './particles.js'

// Level-3-only scenery off the hull: sparse wreckage, trail sparks, and
// near-track streaks so blown windows read as a train tearing itself apart
// at speed. Dark unlit / low-emissive materials keep the interior path
// brighter than the night outside. No Cannon bodies, no blockers.

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
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x241c18, roughness: 0.82, metalness: 0.28, emissive: 0x1a0a06, emissiveIntensity: 0.22
  })
  const rustMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a12, roughness: 0.88, metalness: 0.2, emissive: 0x120804, emissiveIntensity: 0.18
  })
  const streakMat = new THREE.MeshBasicMaterial({ color: 0x0c0a09 })

  // --- Fast near-track sleepers / ballast flashes (one wrap group) --------
  const STREAK_N = 36
  const streakMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.9, 0.05, 0.18),
    streakMat,
    STREAK_N
  )
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
  const flyGeos = [
    new THREE.BoxGeometry(0.85, 0.07, 1.45),
    new THREE.BoxGeometry(0.12, 0.12, 1.9),
    new THREE.BoxGeometry(1.15, 0.05, 0.42)
  ]
  const FLY_N = 9
  const flyMesh = new THREE.InstancedMesh(flyGeos[0], panelMat, FLY_N)
  flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  noCam(flyMesh)
  flyMesh.castShadow = false
  group.add(flyMesh)

  const beamMesh = new THREE.InstancedMesh(flyGeos[1], steelMat, 6)
  beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  noCam(beamMesh)
  beamMesh.castShadow = false
  group.add(beamMesh)

  const ribMesh = new THREE.InstancedMesh(flyGeos[2], rustMat, 5)
  ribMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  noCam(ribMesh)
  ribMesh.castShadow = false
  group.add(ribMesh)

  function makeFlyer(n, closeBias) {
    const side = skew(n + 1) < 0 ? -1 : 1
    const close = Math.abs(skew(n + 4)) < closeBias
    return {
      x: side * (close ? 2.22 + Math.abs(skew(n + 7)) * 0.35 : 3.4 + Math.abs(skew(n + 9)) * 2.4),
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

  const panels = Array.from({ length: FLY_N }, (_, i) => makeFlyer(i * 3 + 2, 0.55))
  const beams = Array.from({ length: 6 }, (_, i) => makeFlyer(i * 5 + 80, 0.4))
  const ribs = Array.from({ length: 5 }, (_, i) => makeFlyer(i * 7 + 140, 0.3))

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

  // --- A few larger skin plates hanging / drifting beside the train -------
  const hangers = []
  const hangerGeo = new THREE.BoxGeometry(1.6, 0.08, 2.4)
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(hangerGeo, i === 1 ? steelMat : panelMat)
    noCam(mesh)
    mesh.castShadow = false
    group.add(mesh)
    hangers.push({
      mesh,
      side: i === 1 ? 1 : -1,
      xBase: (i === 1 ? 1 : -1) * (2.55 + i * 0.35),
      yBase: 1.15 + i * 0.35,
      z: minZ + 10 + i * 18,
      vz: speed * 0.14,
      seed: i * 11.3
    })
  }

  // Temporal-collapse pieces: same stream, but they hitch, hang, or reverse.
  const glitches = []
  const glitchGeo = new THREE.BoxGeometry(0.55, 0.1, 0.9)
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(glitchGeo, rustMat)
    noCam(mesh)
    mesh.castShadow = false
    group.add(mesh)
    glitches.push({
      mesh,
      flyer: makeFlyer(200 + i * 13, 0.7),
      hold: 0,
      mode: 0, // 0 stream, 1 hold, 2 reverse
      next: 2.5 + i * 1.8
    })
  }

  const sparks = createParticleField({
    count: 64,
    area: {
      halfX: 7.5,
      minAbsX: 2.15,
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
  let elapsed = 0

  function paintFlyers() {
    for (let i = 0; i < panels.length; i++) writeFlyer(flyMesh, panels[i], i)
    flyMesh.instanceMatrix.needsUpdate = true
    for (let i = 0; i < beams.length; i++) writeFlyer(beamMesh, beams[i], i)
    beamMesh.instanceMatrix.needsUpdate = true
    for (let i = 0; i < ribs.length; i++) writeFlyer(ribMesh, ribs[i], i)
    ribMesh.instanceMatrix.needsUpdate = true
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
      elapsed += travel

      streakScroll += travel * speed * 1.55
      smearScroll += travel * speed * 2.1
      streakGroup.position.z = minZ + ((streakScroll % streakPeriod + streakPeriod) % streakPeriod)
      smearGroup.position.z = minZ + ((smearScroll % 9.2 + 9.2) % 9.2) * 0.5

      for (const flyer of panels) stepFlyer(flyer, travel)
      for (const flyer of beams) stepFlyer(flyer, travel)
      for (const flyer of ribs) stepFlyer(flyer, travel)
      paintFlyers()

      for (const h of hangers) {
        const t = elapsed + h.seed
        h.z += h.vz * travel
        if (h.z > wrapMin + wrapSpan) h.z -= wrapSpan
        h.mesh.position.set(
          h.xBase + Math.sin(t * 0.35) * 0.12,
          h.yBase + Math.sin(t * 0.55) * 0.18,
          h.z
        )
        h.mesh.rotation.set(
          Math.sin(t * 0.4) * 0.2,
          t * 0.15,
          h.side * (0.35 + Math.sin(t * 0.25) * 0.12)
        )
      }

      for (const g of glitches) {
        g.next -= travel
        if (g.next <= 0) {
          g.mode = (g.mode + 1) % 3
          g.hold = g.mode === 1 ? 0.7 + Math.abs(skew(elapsed * 3)) * 0.6 : 0
          g.next = g.mode === 0 ? 3.2 + Math.abs(skew(elapsed * 5)) * 2.4 : 0.9
        }
        let dt = travel
        if (g.mode === 1) dt = 0
        else if (g.mode === 2) dt = -travel * 0.45
        stepFlyer(g.flyer, dt)
        if (g.mode === 1) {
          g.flyer.y += Math.sin(elapsed * 2.2) * 0.004
        }
        g.mesh.position.set(g.flyer.x, g.flyer.y, g.flyer.z)
        g.mesh.rotation.set(g.flyer.rx, g.flyer.ry, g.flyer.rz)
      }

      sparks.update(travel)
      embers.update(travel)
    },
    dispose() {
      disposeObject(group)
    },
    setFrozenLook(on) {
      steelMat.emissive.setHex(on ? 0x7dd3fc : 0x080605)
      steelMat.emissiveIntensity = on ? 1.1 : 0.15
      panelMat.emissive.setHex(on ? 0x93c5fd : 0x1a0a06)
      panelMat.emissiveIntensity = on ? 1.25 : 0.22
      rustMat.emissive.setHex(on ? 0xdbeafe : 0x120804)
      rustMat.emissiveIntensity = on ? 1.35 : 0.18
      sparks.material.color.setHex(on ? 0xe0f2fe : 0xc44a22)
      sparks.material.size = on ? 0.1 : 0.042
      sparks.material.opacity = on ? 0.85 : 0.32
      embers.material.color.setHex(on ? 0xbfdbfe : 0xa03818)
      embers.material.size = on ? 0.13 : 0.07
      embers.material.opacity = on ? 0.7 : 0.2
    }
  }
}

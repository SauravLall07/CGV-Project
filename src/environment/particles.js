import * as THREE from 'three'

// Lightweight CPU particle fields on a single THREE.Points per field — one
// draw call each, one shared material, and every buffer allocated once up
// front. update() mutates the existing Float32Array in place and flips
// needsUpdate; nothing is allocated per frame, which is exactly what the
// brief's performance section asks for.
//
// Used for the Timewreck's embers and falling dust; the same factory is what
// Phase 7's station dust motes should reuse rather than a second system.

// Deterministic PRNG so a rebuilt level looks identical to the first build.
function createRandom(seed) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function createParticleField({
  count = 200,
  area = { halfX: 1.4, minY: 0, maxY: 2.5, minZ: -10, maxZ: 10 },
  color = 0xff8a3c,
  size = 0.05,
  opacity = 0.8,
  gravity = -0.4, // negative falls, positive rises
  drift = 0.25, // lateral wander speed
  streamZ = 0, // along-track drift (0 keeps the original wander)
  seed = 7
} = {}) {
  const random = createRandom(seed)

  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const phases = new Float32Array(count)

  const spanY = area.maxY - area.minY
  const spanZ = area.maxZ - area.minZ
  const minAbsX = Math.max(0, Math.min(area.minAbsX || 0, area.halfX * 0.95))

  function seedParticle(i, initial, fromZWrap = false) {
    const p = i * 3
    if (minAbsX > 0) {
      const side = random() < 0.5 ? -1 : 1
      positions[p] = side * (minAbsX + random() * (area.halfX - minAbsX))
    } else {
      positions[p] = (random() * 2 - 1) * area.halfX
    }
    // On the first fill spread through the volume; on recycle, re-enter from
    // the edge the particle is drifting away from.
    positions[p + 1] = initial
      ? area.minY + random() * spanY
      : (gravity < 0 ? area.maxY : area.minY)
    if (fromZWrap) {
      positions[p + 2] = streamZ >= 0 ? area.minZ : area.maxZ
    } else {
      positions[p + 2] = area.minZ + random() * spanZ
    }

    velocities[p] = (random() * 2 - 1) * drift
    velocities[p + 1] = gravity * (0.5 + random())
    velocities[p + 2] = streamZ * (0.72 + random() * 0.5) + (random() * 2 - 1) * drift
    phases[i] = random() * Math.PI * 2
  }

  for (let i = 0; i < count; i++) seedParticle(i, true)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  // The field covers a whole level; culling it against its (stale) bounding
  // sphere just makes it pop out of view.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, (area.minY + area.maxY) / 2, (area.minZ + area.maxZ) / 2),
    Math.max(spanZ, spanY, area.halfX) * 0.75
  )

  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'particle-field'
  points.frustumCulled = false
  // Decorative scatter — colliding the third-person camera against it would
  // make it twitch constantly.
  points.userData.noCameraCollision = true

  let elapsed = 0
  const attribute = geometry.attributes.position

  function update(delta) {
    elapsed += delta
    for (let i = 0; i < count; i++) {
      const p = i * 3
      // A slow sine on X/Z reads as air movement without a second buffer.
      const wobble = Math.sin(elapsed * 1.6 + phases[i]) * drift * 0.6
      positions[p] += (velocities[p] + wobble) * delta
      positions[p + 1] += velocities[p + 1] * delta
      positions[p + 2] += velocities[p + 2] * delta

      const outOfRange = gravity < 0
        ? positions[p + 1] < area.minY
        : positions[p + 1] > area.maxY
      const wrapZ = streamZ > 0
        ? positions[p + 2] > area.maxZ
        : streamZ < 0
          ? positions[p + 2] < area.minZ
          : false
      const outX = Math.abs(positions[p]) > area.halfX * 1.6
        || (minAbsX > 0 && Math.abs(positions[p]) < minAbsX * 0.72)
      if (outOfRange || wrapZ || outX) {
        seedParticle(i, false, wrapZ)
      }
    }
    attribute.needsUpdate = true
  }

  return { points, update, material }
}

// Sparse Chrono motes for Level 3: orbital drift around home points so Slow
// dampens, Freeze holds, and Rewind visibly reverses without extra meshes.
export function createChronoMoteField({
  ambient = { count: 70, halfX: 1.15, minY: 0.35, maxY: 2.2, minZ: -20, maxZ: 20 },
  loop = { count: 26, z: 0, halfZ: 4, halfX: 1.2 },
  walkway = { count: 20, minZ: -3, maxZ: 3, halfX: 1.1 },
  wave = { count: 32, halfZ: 3.2, halfX: 1.2 },
  seed = 47
} = {}) {
  const random = createRandom(seed)
  const total = ambient.count + loop.count + walkway.count + wave.count
  const positions = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  const homes = new Float32Array(total * 3)
  const phases = new Float32Array(total)
  const amps = new Float32Array(total)
  const speeds = new Float32Array(total)
  const zones = new Uint8Array(total) // 0 ambient, 1 loop, 2 walkway, 3 wave
  const waveOff = new Float32Array(wave.count)

  const tint = {
    ambient: [0.45, 0.78, 1.0],
    loop: [0.72, 0.38, 0.98],
    walkway: [0.42, 0.78, 0.98],
    wave: [0.78, 0.42, 1.0]
  }

  let i = 0
  function addMote(zone, x, y, z, amp, speed, rgb) {
    const p = i * 3
    homes[p] = x
    homes[p + 1] = y
    homes[p + 2] = z
    positions[p] = x
    positions[p + 1] = y
    positions[p + 2] = z
    colors[p] = rgb[0]
    colors[p + 1] = rgb[1]
    colors[p + 2] = rgb[2]
    phases[i] = random() * Math.PI * 2
    amps[i] = amp
    speeds[i] = speed
    zones[i] = zone
    i++
  }

  for (let n = 0; n < ambient.count; n++) {
    addMote(
      0,
      (random() * 2 - 1) * ambient.halfX,
      ambient.minY + random() * (ambient.maxY - ambient.minY),
      ambient.minZ + random() * (ambient.maxZ - ambient.minZ),
      0.07 + random() * 0.11,
      0.55 + random() * 0.7,
      tint.ambient
    )
  }
  for (let n = 0; n < loop.count; n++) {
    addMote(
      1,
      (random() * 2 - 1) * loop.halfX,
      0.4 + random() * 1.7,
      loop.z + (random() * 2 - 1) * loop.halfZ,
      0.1 + random() * 0.14,
      0.7 + random() * 0.9,
      tint.loop
    )
  }
  for (let n = 0; n < walkway.count; n++) {
    addMote(
      2,
      (random() * 2 - 1) * walkway.halfX,
      0.25 + random() * 1.4,
      walkway.minZ + random() * (walkway.maxZ - walkway.minZ),
      0.08 + random() * 0.1,
      0.45 + random() * 0.5,
      tint.walkway
    )
  }
  for (let n = 0; n < wave.count; n++) {
    waveOff[n] = (random() * 2 - 1) * wave.halfZ
    addMote(
      3,
      (random() * 2 - 1) * wave.halfX,
      0.3 + random() * 1.8,
      80,
      0.12 + random() * 0.16,
      0.9 + random() * 1.1,
      tint.wave
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 80)

  const material = new THREE.PointsMaterial({
    size: 0.038,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    sizeAttenuation: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'chrono-motes'
  points.frustumCulled = false
  points.userData.noCameraCollision = true

  const posAttr = geometry.attributes.position
  const tintColor = new THREE.Color(1, 1, 1)
  const slowTint = new THREE.Color(0.75, 0.9, 1)
  const freezeTint = new THREE.Color(0.55, 0.82, 1)
  const rewindTint = new THREE.Color(0.92, 0.7, 1)
  const normalTint = new THREE.Color(1, 1, 1)
  let clock = 0
  let loopClock = 0

  function update(delta, {
    motionScale = 1,
    mode = 'NORMAL',
    loopPeriod = 9,
    loopTime = 0,
    waveZ = null,
    depleted = false,
    walkwaySettle = 0,
    fade = 1
  } = {}) {
    const freezeHold = mode === 'FREEZE'
    const rewindBoost = mode === 'REWIND' ? 1.4 : 1
    const loopPhase = ((loopTime % loopPeriod) + loopPeriod) % loopPeriod
    const loopRewind = loopPhase >= 7.5
    const loopDanger = loopPhase >= 3 && loopPhase < 7.5

    clock += delta * motionScale
    let loopMotion = motionScale
    if (!freezeHold) {
      if (loopRewind) loopMotion = -Math.max(0.45, Math.abs(motionScale) || 1)
      else if (loopDanger) loopMotion = (motionScale === 0 ? 0 : motionScale * 1.75)
    }
    loopClock += delta * loopMotion

    let waveI = 0
    for (let n = 0; n < total; n++) {
      const p = n * 3
      const t = (zones[n] === 1 ? loopClock : clock) * speeds[n] + phases[n]
      const ampScale = rewindBoost * (zones[n] === 2 ? 1 - walkwaySettle * 0.55 : 1)
      const a = amps[n] * ampScale
      let hx = homes[p]
      const hy = homes[p + 1]
      let hz = homes[p + 2]
      if (zones[n] === 3) {
        hz = depleted && waveZ != null ? waveZ + waveOff[waveI] : 90
        waveI++
      }
      positions[p] = hx + Math.sin(t * 1.3) * a
      positions[p + 1] = hy + Math.cos(t * 0.9) * a * 0.7
      positions[p + 2] = hz + Math.sin(t * 0.7 + 1.1) * a * 1.15
    }
    posAttr.needsUpdate = true

    if (mode === 'SLOW') tintColor.copy(slowTint)
    else if (mode === 'FREEZE') tintColor.copy(freezeTint)
    else if (mode === 'REWIND') tintColor.copy(rewindTint)
    else tintColor.copy(normalTint)
    material.color.copy(tintColor)
    material.opacity = (freezeHold ? 0.55 : mode === 'SLOW' ? 0.3 : mode === 'REWIND' ? 0.5 : 0.38) * fade
    material.size = freezeHold ? 0.055 : depleted ? 0.052 : 0.045
  }

  return { points, update, material }
}

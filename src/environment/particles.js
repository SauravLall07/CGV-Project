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
  seed = 7
} = {}) {
  const random = createRandom(seed)

  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const phases = new Float32Array(count)

  const spanY = area.maxY - area.minY
  const spanZ = area.maxZ - area.minZ

  function seedParticle(i, initial) {
    const p = i * 3
    positions[p] = (random() * 2 - 1) * area.halfX
    // On the first fill spread through the volume; on recycle, re-enter from
    // the edge the particle is drifting away from.
    positions[p + 1] = initial
      ? area.minY + random() * spanY
      : (gravity < 0 ? area.maxY : area.minY)
    positions[p + 2] = area.minZ + random() * spanZ

    velocities[p] = (random() * 2 - 1) * drift
    velocities[p + 1] = gravity * (0.5 + random())
    velocities[p + 2] = (random() * 2 - 1) * drift
    phases[i] = random() * Math.PI * 2
  }

  for (let i = 0; i < count; i++) seedParticle(i, true)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  // The field covers a whole level; culling it against its (stale) bounding
  // sphere just makes it pop out of view.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, (area.minY + area.maxY) / 2, (area.minZ + area.maxZ) / 2),
    Math.max(spanZ, spanY) * 0.75
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
      if (outOfRange || Math.abs(positions[p]) > area.halfX * 1.6) {
        seedParticle(i, false)
      }
    }
    attribute.needsUpdate = true
  }

  return { points, update, material }
}

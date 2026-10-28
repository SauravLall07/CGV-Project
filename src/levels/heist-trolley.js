import * as THREE from 'three'

// Level 2 Passenger: the dining-service trolley.
//
// Held (Hold E) it rides at a fixed offset from the player, so walking,
// strafing and backing up push, slide and pull it. Grabbing steps the player
// to a push bar (or the side rail) so the hands land on it. Let go while it is
// moving and it rolls on under rolling friction. `zones` is the open floor
// it may cover: rectangles that together make up the aisle and the lounge
// walls, and striking any edge hard enough rattles everything on board.
//
// Held, it is guided quietly. Letting go is what gets heard: it rattles as
// the hands come off, keeps rattling while it rolls on, and clatters if it
// hits something hard. update() returns those noise events and the level
// decides who hears them (stealth.investigate); all this module knows about
// guards is the circles it is told not to roll through.

export const TROLLEY_HALF_X = 0.31
export const TROLLEY_HALF_Z = 0.47
// Rolling friction once let go: a shove at walking pace runs about 4 m.
const ROLL_DECEL = 1.9
const MAX_RELEASE_SPEED = 4.5
const WALL_RESTITUTION = 0.3
const NOISE_MIN_SPEED = 0.3
const NOISE_INTERVAL = 0.45
const CLATTER_SPEED = 1.1
export const CLATTER_RADIUS = 12
// The rattle of letting go, even from a standstill.
export const RELEASE_RADIUS = 9
const PLAYER_RADIUS = 0.18
const WHEEL_RADIUS = 0.055
// Where the player stands to push: this far from the bar or rail they hold.
const PUSH_STANCE = 0.36
// How long stepping up to that stance takes.
const GRAB_SETTLE = 0.16
// Push bar and side rail, trolley-local: hands at ±GRIP_SPREAD along them.
const BAR = { y: 0.98, out: TROLLEY_HALF_Z + 0.02, spread: 0.2 }
const RAIL = { y: 0.95, out: TROLLEY_HALF_X - 0.03, spread: 0.22 }
// The grip point is the wrist, a palm's width short of the bar.
const PALM = 0.06

// How far the wheels carry at a given speed. A crouched nudge is heard a few
// metres away; a run is heard from most of the car.
export function trolleyNoiseRadius(speed) {
  return THREE.MathUtils.clamp(3.5 + speed * 2.6, 4.5, 11)
}

function buildTrolley() {
  const group = new THREE.Group()
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a2e16, roughness: 0.55, metalness: 0.05 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85, metalness: 0 })
  const linen = new THREE.MeshStandardMaterial({ color: 0xefe9dc, roughness: 0.95, metalness: 0 })
  const add = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }
  const hx = TROLLEY_HALF_X
  const hz = TROLLEY_HALF_Z

  // Frame: corner posts, two wooden tiers and a gallery rail round the top.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(group, new THREE.CylinderGeometry(0.018, 0.018, 0.84, 8), brass, sx * (hx - 0.03), 0.54, sz * (hz - 0.05))
  }
  add(group, new THREE.BoxGeometry(hx * 2 - 0.02, 0.035, hz * 2 - 0.06), wood, 0, 0.84, 0).receiveShadow = true
  add(group, new THREE.BoxGeometry(hx * 2 - 0.04, 0.03, hz * 2 - 0.08), wood, 0, 0.3, 0).receiveShadow = true
  for (const sx of [-1, 1]) add(group, new THREE.BoxGeometry(0.02, 0.02, hz * 2 - 0.08), brass, sx * (hx - 0.03), 0.95, 0)
  // Push bars at both ends — it is a caster cart and goes any way it is shoved.
  for (const sz of [-1, 1]) {
    add(group, new THREE.BoxGeometry(hx * 2 - 0.04, 0.02, 0.02), brass, 0, 0.95, sz * (hz - 0.05))
    const bar = add(group, new THREE.CylinderGeometry(0.02, 0.02, hx * 2 - 0.02, 10), brass, 0, 0.98, sz * (hz + 0.02))
    bar.rotation.z = Math.PI / 2
    for (const sx of [-1, 1]) add(group, new THREE.BoxGeometry(0.02, 0.02, 0.08), brass, sx * (hx - 0.05), 0.97, sz * (hz - 0.02))
  }

  // Cargo: bottles and an ice bucket up top, linen and a hamper below, and a
  // towel over one push bar. The bottles rattle while it rolls.
  const rattlers = []
  const bottleColours = [0x1f3d22, 0x4a1420, 0x1f3d22]
  bottleColours.forEach((colour, i) => {
    const glass = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.12, metalness: 0.15 })
    const bottle = new THREE.Group()
    bottle.position.set(-0.13 + (i % 2) * 0.1, 0.8575, -0.2 + i * 0.14)
    add(bottle, new THREE.CylinderGeometry(0.038, 0.038, 0.22, 12), glass, 0, 0.11, 0)
    add(bottle, new THREE.CylinderGeometry(0.013, 0.03, 0.1, 10), glass, 0, 0.27, 0)
    add(bottle, new THREE.CylinderGeometry(0.015, 0.015, 0.025, 8), brass, 0, 0.33, 0)
    group.add(bottle)
    rattlers.push({ object: bottle, phase: i * 1.7 })
  })
  const bucket = new THREE.Group()
  bucket.position.set(0.14, 0.8575, 0.12)
  add(bucket, new THREE.CylinderGeometry(0.09, 0.07, 0.17, 16), brass, 0, 0.085, 0)
  const chilled = add(bucket, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a1420, roughness: 0.12 }), 0, 0.2, 0)
  chilled.rotation.z = 0.35
  group.add(bucket)
  rattlers.push({ object: bucket, phase: 4.1 })
  add(group, new THREE.BoxGeometry(0.4, 0.12, 0.3), linen, -0.05, 0.375, -0.18)
  add(group, new THREE.BoxGeometry(0.42, 0.24, 0.32), new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.9 }), 0.02, 0.435, 0.2)
  const towel = add(group, new THREE.BoxGeometry(0.22, 0.012, 0.09), linen, 0.12, 0.995, hz + 0.02)
  add(towel, new THREE.BoxGeometry(0.22, 0.26, 0.012), linen, 0, -0.13, 0.045)

  // Swivel casters: the fork turns to trail the motion, the wheel rolls.
  const casters = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const swivel = new THREE.Group()
      swivel.position.set(sx * (hx - 0.06), 0, sz * (hz - 0.09))
      add(swivel, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), brass, 0, 0.12, 0)
      add(swivel, new THREE.BoxGeometry(0.045, 0.07, 0.02), brass, 0, 0.08, -0.012)
      const wheel = add(swivel, new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.03, 14), rubber, 0, WHEEL_RADIUS, 0)
      wheel.rotation.z = Math.PI / 2
      group.add(swivel)
      casters.push({ swivel, wheel })
    }
  }
  return { group, casters, rattlers }
}

function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function createServiceTrolley({ position, zones, guardPad = 0.4 }) {
  const { group, casters, rattlers } = buildTrolley()
  group.name = 'service-trolley'
  const home = position.clone()
  // Centre limits that keep the footprint inside each zone.
  const limits = zones.map((zone) => ({
    minX: zone.minX + TROLLEY_HALF_X,
    maxX: zone.maxX - TROLLEY_HALF_X,
    minZ: zone.minZ + TROLLEY_HALF_Z,
    maxZ: zone.maxZ - TROLLEY_HALF_Z
  }))
  const constrained = { x: 0, z: 0, hitX: false, hitZ: false }

  // The nearest centre position inside any zone, and which axes it stopped.
  function constrain(nx, nz) {
    let best = Infinity
    for (const zone of limits) {
      const cx = THREE.MathUtils.clamp(nx, zone.minX, zone.maxX)
      const cz = THREE.MathUtils.clamp(nz, zone.minZ, zone.maxZ)
      const d = (cx - nx) ** 2 + (cz - nz) ** 2
      if (d < best) {
        best = d
        constrained.x = cx
        constrained.z = cz
        constrained.hitX = cx !== nx
        constrained.hitZ = cz !== nz
      }
      if (d === 0) break
    }
    return constrained
  }

  // The player collides with the footprint (they carry their own radius);
  // guards collide as points, so theirs is padded by a body radius.
  const playerBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, enabled: true }
  const guardBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }

  let x = 0
  let z = 0
  let vx = 0
  let vz = 0
  let grabbed = false
  let offX = 0
  let offZ = 0
  let settle = 0
  // Hand targets in the player's frame (+X left, +Z toward the trolley).
  const grip = { left: new THREE.Vector3(), right: new THREE.Vector3() }
  let speed = 0
  let noiseTimer = 0
  let rolled = 0
  let heading = 0
  let jolt = 0
  // Let go since the last update: rattle on the next one.
  let rattle = false
  let elapsed = 0
  const events = []

  function place() {
    group.position.set(x, home.y, z)
    playerBox.minX = x - TROLLEY_HALF_X
    playerBox.maxX = x + TROLLEY_HALF_X
    playerBox.minZ = z - TROLLEY_HALF_Z
    playerBox.maxZ = z + TROLLEY_HALF_Z
    guardBox.minX = playerBox.minX - guardPad
    guardBox.maxX = playerBox.maxX + guardPad
    guardBox.minZ = playerBox.minZ - guardPad
    guardBox.maxZ = playerBox.maxZ + guardPad
  }

  function hitsCircle(cx, cz, circle) {
    const dx = circle.x - THREE.MathUtils.clamp(circle.x, cx - TROLLEY_HALF_X, cx + TROLLEY_HALF_X)
    const dz = circle.z - THREE.MathUtils.clamp(circle.z, cz - TROLLEY_HALF_Z, cz + TROLLEY_HALF_Z)
    return dx * dx + dz * dz < circle.radius * circle.radius - 1e-6
  }

  function blockedBy(nx, nz, circles) {
    for (const circle of circles) {
      if (!hitsCircle(nx, nz, circle)) continue
      // Already touching: only moving closer counts, so a trolley pressed
      // against someone can still be drawn away from them.
      if (!hitsCircle(x, z, circle)) return true
      if (Math.hypot(circle.x - nx, circle.z - nz) < Math.hypot(circle.x - x, circle.z - z)) return true
    }
    return false
  }

  function noise(kind, radius) {
    events.push({ type: 'noise', kind, radius, position: group.position.clone() })
  }

  function impact(normalSpeed) {
    if (normalSpeed < CLATTER_SPEED) return
    jolt = 1
    noise('clatter', CLATTER_RADIUS)
  }

  function roll(delta, circles) {
    const current = Math.hypot(vx, vz)
    const slowed = Math.max(0, current - ROLL_DECEL * delta)
    if (slowed < 0.02) {
      vx = 0
      vz = 0
      return
    }
    vx *= slowed / current
    vz *= slowed / current
    const { x: nx, z: nz, hitX, hitZ } = constrain(x + vx * delta, z + vz * delta)
    if (hitX) {
      impact(Math.abs(vx))
      vx = -vx * WALL_RESTITUTION
    }
    if (hitZ) {
      impact(Math.abs(vz))
      vz = -vz * WALL_RESTITUTION
    }
    if (blockedBy(nx, nz, circles)) {
      impact(slowed)
      vx = 0
      vz = 0
      return
    }
    x = nx
    z = nz
  }

  // `circles` are bodies the trolley must not roll through ({ x, z, radius }).
  // Shoving a held trolley into one reports a 'ram' instead of moving.
  function update(delta, { playerPosition = null, circles = [] } = {}) {
    events.length = 0
    if (!(delta > 0)) return events
    elapsed += delta
    const fromX = x
    const fromZ = z

    if (grabbed && settle > 0) {
      // Still stepping up to the bar: the trolley waits for the hands.
      settle = Math.max(0, settle - delta)
    } else if (grabbed && playerPosition) {
      const { x: tx, z: tz } = constrain(playerPosition.x + offX, playerPosition.z + offZ)
      if (blockedBy(tx, tz, circles)) {
        events.push({ type: 'ram' })
      } else {
        x = tx
        z = tz
      }
      // Track what the player is actually doing, for the hand-off on release.
      const k = 1 - Math.exp(-14 * delta)
      vx += ((x - fromX) / delta - vx) * k
      vz += ((z - fromZ) / delta - vz) * k
    } else if (vx !== 0 || vz !== 0) {
      const bodies = playerPosition ? [...circles, { x: playerPosition.x, z: playerPosition.z, radius: PLAYER_RADIUS }] : circles
      roll(delta, bodies)
    }
    place()

    speed = Math.hypot(x - fromX, z - fromZ) / delta
    if (rattle) {
      rattle = false
      jolt = Math.max(jolt, 0.6)
      noise('release', RELEASE_RADIUS)
      noiseTimer = NOISE_INTERVAL
    } else if (!grabbed && speed > NOISE_MIN_SPEED) {
      noiseTimer -= delta
      if (noiseTimer <= 0) {
        noise('roll', trolleyNoiseRadius(speed))
        noiseTimer = NOISE_INTERVAL
      }
    } else {
      noiseTimer = 0
    }

    // Casters trail the motion, wheels roll, cargo rattles.
    rolled += speed * delta
    if (speed > 0.05) heading = Math.atan2(x - fromX, z - fromZ)
    for (const { swivel, wheel } of casters) {
      swivel.rotation.y += shortestAngle(swivel.rotation.y, heading) * Math.min(1, delta * 10)
      wheel.rotation.x = rolled / WHEEL_RADIUS
    }
    jolt = Math.max(0, jolt - delta * 3)
    const shake = Math.min(1, speed / 3) * 0.04 + jolt * 0.12
    for (const { object, phase } of rattlers) {
      object.rotation.z = Math.sin(elapsed * 38 + phase) * shake
      object.rotation.x = Math.sin(elapsed * 31 + phase * 2) * shake * 0.7
    }
    return events
  }

  // Takes hold from whichever face the player is at: an end (push bar) or a
  // side (gallery rail). `canStand(x, z)` says whether the push stance there
  // is clear floor; if not, the player holds on from where they are.
  function grab(playerPosition, canStand = () => true) {
    const dx = x - playerPosition.x
    const dz = z - playerPosition.z
    const fromEnd = Math.abs(dz) / TROLLEY_HALF_Z >= Math.abs(dx) / TROLLEY_HALF_X
    const hold = fromEnd ? BAR : RAIL
    const reach = hold.out + PUSH_STANCE
    const stanceX = fromEnd ? 0 : Math.sign(dx || 1) * reach
    const stanceZ = fromEnd ? Math.sign(dz || 1) * reach : 0
    const snap = canStand(x - stanceX, z - stanceZ)
    offX = snap ? stanceX : dx
    offZ = snap ? stanceZ : dz
    settle = snap ? GRAB_SETTLE : 0
    // Facing the trolley centre, the bar is straight ahead; the hands spread
    // along it either side.
    const ahead = Math.hypot(offX, offZ) - hold.out - PALM
    grip.left.set(hold.spread, hold.y, ahead)
    grip.right.set(-hold.spread, hold.y, ahead)
    grabbed = true
    vx = 0
    vz = 0
    playerBox.enabled = false
  }

  function release() {
    if (!grabbed) return
    grabbed = false
    settle = 0
    rattle = true
    playerBox.enabled = true
    // Letting go while pulling stops it dead rather than rolling it into you.
    if (vx * offX + vz * offZ < 0) {
      vx = 0
      vz = 0
    }
    const current = Math.hypot(vx, vz)
    if (current > MAX_RELEASE_SPEED) {
      vx *= MAX_RELEASE_SPEED / current
      vz *= MAX_RELEASE_SPEED / current
    }
  }

  // Where the player belongs while holding on. A held trolley that cannot
  // follow (a wall, a guard) holds the player back to this.
  function holdPosition(out) {
    out.x = x - offX
    out.z = z - offZ
    return out
  }

  function reset() {
    grabbed = false
    settle = 0
    playerBox.enabled = true
    x = home.x
    z = home.z
    vx = 0
    vz = 0
    speed = 0
    noiseTimer = 0
    jolt = 0
    rattle = false
    place()
  }

  reset()

  return {
    group,
    playerBox,
    guardBox,
    update,
    grab,
    release,
    holdPosition,
    reset,
    isGrabbed: () => grabbed,
    isSettling: () => grabbed && settle > 0,
    getGrip: () => grip,
    getSpeed: () => speed,
    getVelocity: () => ({ x: vx, z: vz }),
    // Heading from the player toward the handle they are holding.
    getGrabYaw: () => Math.atan2(offX, offZ)
  }
}

// Expanding rings that show how far a noise carries: each one grows to the
// radius the guards were asked to hear it from.
export function createNoiseRings(scene, count = 4) {
  const geometry = new THREE.RingGeometry(0.93, 1, 48)
  geometry.rotateX(-Math.PI / 2)
  const rings = Array.from({ length: count }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xfbbf24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'trolley-noise-ring'
    mesh.visible = false
    mesh.userData.noInteractionBlocker = true
    mesh.userData.noCameraCollision = true
    scene.add(mesh)
    return { mesh, material, age: 0, radius: 1 }
  })
  let next = 0
  const LIFE = 0.9

  function emit(position, radius, colour = 0xfbbf24) {
    const ring = rings[next]
    next = (next + 1) % rings.length
    ring.age = 0
    ring.radius = radius
    ring.material.color.setHex(colour)
    ring.mesh.position.set(position.x, position.y + 0.04, position.z)
    ring.mesh.visible = true
  }

  function update(delta) {
    for (const ring of rings) {
      if (!ring.mesh.visible) continue
      ring.age += delta
      const t = Math.min(1, ring.age / LIFE)
      ring.mesh.scale.setScalar(0.3 + (ring.radius - 0.3) * (1 - (1 - t) * (1 - t)))
      ring.material.opacity = 0.42 * (1 - t)
      if (t >= 1) ring.mesh.visible = false
    }
  }

  function clear() {
    for (const ring of rings) ring.mesh.visible = false
  }

  function dispose() {
    for (const ring of rings) {
      scene.remove(ring.mesh)
      ring.material.dispose()
    }
    geometry.dispose()
  }

  return { emit, update, clear, dispose }
}

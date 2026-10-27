import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// N2/N3 only. Geometry and contact tests derive from these same analytic clocks.
export const FREIGHT = Object.freeze({ offset: -7, length: 1.8, anchorY: 3.15,
  halfX: 0.85, halfY: 0.575, halfZ: 0.45, amplitude: 0.82, period: 4.4, warning: 0.8 })
export const STEAM = Object.freeze({ offset: 11, period: 5, warnAt: 1.6,
  activeAt: 2.35, clearAt: 3.65, halfZ: 0.32, minY: 0.2, maxY: 2.3 })

export function freightAngle(clock) {
  return FREIGHT.amplitude * Math.cos(Math.max(0, clock - FREIGHT.warning) * Math.PI * 2 / FREIGHT.period)
}
export function steamStage(clock) {
  const remainder = clock % STEAM.period
  const t = remainder < 0 ? remainder + STEAM.period : remainder
  return t >= STEAM.activeAt && t < STEAM.clearAt ? 'active' : t >= STEAM.warnAt && t < STEAM.activeAt ? 'warning' : 'clear'
}

// Separating-axis test of the rotated case against the upright player body.
// No whole-sweep AABB: a frozen case at the side leaves the centre clear.
export function freightContact(clock, x, y, localZ, height, radius = 0.18) {
  if (Math.abs(localZ) > FREIGHT.halfZ + radius) return false
  const angle = freightAngle(clock), s = Math.sin(angle), c = Math.cos(angle)
  const dx = x - s * FREIGHT.length
  const dy = y + height / 2 - (FREIGHT.anchorY - c * FREIGHT.length)
  const hy = height / 2
  return Math.abs(dx) < FREIGHT.halfX * c + FREIGHT.halfY * Math.abs(s) + radius &&
    Math.abs(dy) < FREIGHT.halfX * Math.abs(s) + FREIGHT.halfY * c + hy &&
    Math.abs(dx * c + dy * s) < FREIGHT.halfX + radius * c + hy * Math.abs(s) &&
    Math.abs(-dx * s + dy * c) < FREIGHT.halfY + radius * Math.abs(s) + hy * c
}

function batch(parent, name, material, pieces) {
  const geometry = mergeGeometries(pieces, false)
  pieces.forEach(g => g.dispose())
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name; parent.add(mesh)
  return mesh
}
function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z)
}
function marker(parent, z, halfZ, material) {
  const parts = []
  for (const side of [-1, 1]) {
    parts.push(box(0.04, 0.018, halfZ * 2, side * 2.35, 0.018, z))
    for (const end of [-1, 1]) parts.push(box(0.6, 0.018, 0.04, side * 2.07, 0.018, z + end * halfZ))
  }
  return batch(parent, 'hazard-footprint-brackets', material, parts)
}

function steamPuffTexture() {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const blob = Math.hypot(dx / 0.46, dy / 0.36)
      const wobble = Math.sin(x * 0.45) * 0.04 + Math.cos(y * 0.38) * 0.04
      const falloff = Math.max(0, 1 - blob + wobble)
      const alpha = falloff * falloff * (0.55 + 0.45 * falloff)
      const i = (y * size + x) * 4
      data[i] = 214
      data[i + 1] = 220
      data[i + 2] = 224
      data[i + 3] = Math.round(alpha * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function steamPuffMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uStrength: { value: 0.2 }
    },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aLayer;
      varying vec2 vUv;
      varying float vLife;
      varying float vLayer;
      void main() {
        vUv = uv;
        vLife = aLife;
        vLayer = aLayer;
        vec4 localCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 viewCenter = modelViewMatrix * localCenter;
        // Keep the puff in the view plane. A pure flow-aligned streak is
        // only a few centimetres tall from the aisle camera and disappears.
        vec3 flow = (modelViewMatrix * vec4(1.0, 0.12, 0.0, 0.0)).xyz;
        flow.z = 0.0;
        float fl = length(flow);
        flow = fl > 0.001 ? flow / fl : vec3(1.0, 0.0, 0.0);
        vec3 wing = vec3(-flow.y, flow.x, 0.0);
        float sx = length(instanceMatrix[0].xyz);
        float sy = length(instanceMatrix[1].xyz);
        vec3 offset = flow * position.x * sx + wing * position.y * sy;
        gl_Position = projectionMatrix * (viewCenter + vec4(offset, 0.0));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uStrength;
      varying vec2 vUv;
      varying float vLife;
      varying float vLayer;
      void main() {
        float sprite = texture2D(uMap, vUv).a;
        float fade = smoothstep(0.0, 0.04, vLife) * (1.0 - smoothstep(0.9, 1.0, vLife));
        float alpha = sprite * fade * uStrength * mix(0.62, 1.0, vLayer);
        if (alpha < 0.02) discard;
        vec3 col = mix(vec3(0.7, 0.75, 0.78), vec3(0.9, 0.93, 0.94), vLayer);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false
  })
}

// Tracks both player travel and hazard travel between checks. The main loop caps
// delta at 100 ms; <=20 ms sampling also catches a fast crossing of a thin jet.
// Pose teleports used by respawn/dev starts test the destination only.
function temporalContact({ clock, previousClock, previous, position, height, hit }) {
  const distance = previous.distanceTo(position)
  const teleport = distance > 2
  const steps = Math.min(128, Math.max(1, Math.ceil(Math.abs(clock - previousClock) / 0.02), Math.ceil(distance / 0.06)))
  for (let i = teleport ? steps : 0; i <= steps; i++) {
    const u = i / steps
    if (hit(previousClock + (clock - previousClock) * u,
      previous.x + (position.x - previous.x) * u,
      previous.y + (position.y - previous.y) * u,
      previous.z + (position.z - previous.z) * u, height)) return true
  }
  return false
}

export function createExpansionHazards({ root, spans, player, timeSystem, unregisters, fail, warn, audio }) {
  const group = new THREE.Group(); group.name = 'wreck-expansion-hazards'; root.add(group)
  const brass = new THREE.MeshStandardMaterial({ color: 0xba9455, metalness: 0.78, roughness: 0.46 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x293a3b, metalness: 0.45, roughness: 0.7 })
  const leather = new THREE.MeshStandardMaterial({ color: 0x69442e, roughness: 0.85 })
  const amber = new THREE.MeshStandardMaterial({ color: 0xc28b36, emissive: 0x986420, emissiveIntensity: 0.35 })
  const load = new THREE.Group(); load.name = 'cargo-swinging-freight'; load.position.z = spans.cargo.center + FREIGHT.offset; group.add(load)
  batch(load, 'freight-suspension-header', brass, [box(4.9, 0.12, 0.22, 0, FREIGHT.anchorY, 0),
    box(0.12, 0.42, 0.22, -2.38, 2.94, 0), box(0.12, 0.42, 0.22, 2.38, 2.94, 0)])
  const pivot = new THREE.Group(); pivot.name = 'freight-pendulum'; pivot.position.y = FREIGHT.anchorY; load.add(pivot)
  batch(pivot, 'swinging-leather-case', leather, [box(1.7, 1.15, 0.9, 0, -FREIGHT.length, 0)])
  const straps = []
  for (const x of [-0.58, 0.58]) {
    straps.push(box(0.065, 1.17, 0.92, x, -FREIGHT.length, 0))
    // Suspension rods terminate inside the real top of the case, not in air.
    straps.push(box(0.035, FREIGHT.length - FREIGHT.halfY, 0.035, x, -(FREIGHT.length - FREIGHT.halfY) / 2, 0))
  }
  straps.push(box(0.24, 0.12, 0.035, 0, -FREIGHT.length, 0.465))
  batch(pivot, 'freight-straps-and-suspension', brass, straps)
  marker(load, 0, FREIGHT.halfZ + 0.18, amber)
  const loadSignal = batch(load, 'freight-warning-arm', amber, [box(0.6, 0.07, 0.08, 0, 0, 0)])
  loadSignal.position.set(0, 2.97, 0.2)

  const vent = new THREE.Group(); vent.name = 'mechanical-steam-crossing'; vent.position.z = spans.mechanical.center + STEAM.offset; group.add(vent)
  batch(vent, 'pressure-assembly-body', dark, [box(0.22, 2.6, 0.8, -2.4, 1.4, 0), box(0.28, 1.5, 0.08, -2.25, 1.3, 0.48)])
  batch(vent, 'ruptured-brass-pipes', brass, [box(0.13, 2.8, 0.13, -2.2, 1.45, -0.48),
    box(0.42, 0.16, 0.18, -2.17, 1.25, 0), box(0.16, 0.9, 0.9, -2.21, 1.95, 0)])
  const needle = batch(vent, 'pressure-gauge-needle', amber, [box(0.03, 0.33, 0.025, 0, 0.13, 0)])
  needle.position.set(-2.1, 1.95, 0.46)
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 5, 12), brass)
  valve.name = 'steam-valve-wheel'; valve.position.set(-2.1, 1.2, 0.5); vent.add(valve)
  const signal = batch(vent, 'steam-clearance-signal', amber.clone(), [box(0.65, 0.08, 0.08, 0, 0, 0)])
  signal.position.set(-1.7, 2.65, 0)
  marker(vent, 0, STEAM.halfZ, amber)
  const STEAM_PUFFS = 72
  const steamMap = steamPuffTexture()
  const steamLife = new Float32Array(STEAM_PUFFS)
  const steamLayer = new Float32Array(STEAM_PUFFS)
  const puffGeo = new THREE.PlaneGeometry(1, 1)
  puffGeo.setAttribute('aLife', new THREE.InstancedBufferAttribute(steamLife, 1))
  puffGeo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(steamLayer, 1))
  const mist = new THREE.InstancedMesh(puffGeo, steamPuffMaterial(steamMap), STEAM_PUFFS)
  mist.name = 'timed-steam-jet'
  mist.frustumCulled = false
  mist.renderOrder = 2
  vent.add(mist)
  const puff = new THREE.Object3D()

  const previous = player.mesh.position.clone()
  let freightClock = 0, steamClock = STEAM.warnAt
  let freightStarted = false, steamStarted = false
  let checkedFreight = freightClock, checkedSteam = steamClock, lastStage = 'clear'
  function applyFreight() {
    pivot.rotation.z = freightAngle(freightClock)
    loadSignal.rotation.z = freightStarted && freightClock > FREIGHT.warning ? pivot.rotation.z * 0.4 : 0.5
  }
  function applySteam() {
    const stage = steamStarted ? steamStage(steamClock) : 'clear'
    signal.rotation.z = stage === 'clear' ? 0 : Math.PI / 2
    signal.material.color.setHex(stage === 'clear' ? 0x50c9a5 : 0xe9a844)
    needle.rotation.z = stage === 'active' ? -0.9 : stage === 'warning' ? 0 : 0.9
    valve.rotation.z = steamClock * 0.45
    mist.visible = stage !== 'clear'
    const active = stage === 'active'
    mist.material.uniforms.uStrength.value = active ? 0.82 : 0.36
    const reach = active ? 4.6 : 0.42
    for (let i = 0; i < STEAM_PUFFS; i++) {
      const core = i < 30
      steamLayer[i] = core ? 1 : 0
      const seed = (i * 0.173 + 0.11) % 1
      const u = ((seed + i * 0.019 + steamClock * (active ? 0.95 : 0.32)) % 1 + 1) % 1
      steamLife[i] = u
      const along = core ? u * (0.28 + 0.72 * u) : u
      const cone = (core ? 0.4 : 1) * (0.08 + along * along * (active ? 1 : 0.22))
      const turb = Math.sin(along * 10.5 + seed * 24 + steamClock * 2.6)
      const turb2 = Math.cos(along * 6.4 + seed * 15 - steamClock * 1.8)
      puff.position.set(
        -2.16 + along * reach + turb * cone * 0.1,
        1.16 + along * (active ? 0.62 : 0.18) + turb * cone * 0.36,
        turb2 * STEAM.halfZ * cone * 1.05
      )
      const length = (core ? 0.7 : 0.95) + along * (active ? 1.05 : 0.22)
      const girth = (core ? 0.42 : 0.58) + along * cone * (active ? 0.85 : 0.16)
      puff.scale.set(length, girth, 1)
      puff.rotation.set(0, 0, 0)
      puff.updateMatrix()
      mist.setMatrixAt(i, puff.matrix)
    }
    mist.instanceMatrix.needsUpdate = true
    mist.geometry.attributes.aLife.needsUpdate = true
    mist.geometry.attributes.aLayer.needsUpdate = true
  }
  unregisters.push(timeSystem.register(load, {
    onUpdate(dt) { if (freightStarted) { freightClock += dt; applyFreight() } },
    getSnapshot: () => ({ clock: freightClock, started: freightStarted }),
    restoreSnapshot(s) { freightClock = s.clock; freightStarted = s.started; applyFreight() }
  }))
  unregisters.push(timeSystem.register(vent, {
    onUpdate(dt) { if (steamStarted) { steamClock += dt; applySteam() } },
    getSnapshot: () => ({ clock: steamClock, started: steamStarted }),
    restoreSnapshot(s) { steamClock = s.clock; steamStarted = s.started; applySteam() }
  }))
  group.traverse(n => { n.userData.noCameraCollision = true })
  applyFreight(); applySteam()

  function steamHit(clock, x, y, z, height) {
    return steamStarted && steamStage(clock) === 'active' && Math.abs(x) < 2.6 + 0.18 &&
      Math.abs(z - vent.position.z) < STEAM.halfZ + 0.18 && y < STEAM.maxY && y + height > STEAM.minY
  }
  return {
    group,
    // Read-only diagnostic values; gameplay state lives in the closure/snapshots.
    getState: () => ({ freightClock, steamClock, freightStarted, steamStarted, steamStage: steamStarted ? steamStage(steamClock) : 'clear' }),
    update(enabled = true) {
      const p = player.mesh.position, mode = timeSystem.getMode()
      const nearLoad = Math.abs(p.z - load.position.z) < 6
      const nearSteam = Math.abs(p.z - vent.position.z) < 5
      if (enabled && mode !== 'REWIND') {
        if (!freightStarted && p.z < load.position.z + 2.5 && p.z > load.position.z - 2.5) {
          freightStarted = true; warn('freight')
        }
        if (!steamStarted && p.z < vent.position.z + 2.3 && p.z > vent.position.z - 2) {
          steamStarted = true; applySteam()
        }
      }
      const stage = steamStarted ? steamStage(steamClock) : 'clear'
      if (enabled && nearSteam && stage === 'warning' && lastStage !== 'warning' && mode !== 'REWIND') warn('steam')
      lastStage = stage
      if (enabled) {
        const height = player.isCrouching() ? 1.15 : 1.85
        if (nearLoad && temporalContact({ clock: freightClock, previousClock: checkedFreight, previous, position: p, height,
          hit: (t, x, y, z, h) => freightContact(t, x, y, z - load.position.z, h) })) fail('The swinging freight caught you! Wait for the case to clear, or hold a clear pose.')
        if (nearSteam && temporalContact({ clock: steamClock, previousClock: checkedSteam, previous, position: p, height,
          hit: steamHit })) fail('Steam burst! Wait on the marked approach for the horizontal clearance bar.')
      }
      const moving = enabled && mode !== 'FREEZE' && mode !== 'REWIND'
      audio?.update(moving && nearLoad && freightStarted ? Math.abs(Math.sin(pivot.rotation.z)) : 0,
        moving && nearSteam && steamStarted ? stage === 'active' ? 1 : stage === 'warning' ? 0.15 : 0 : 0)
      checkedFreight = freightClock; checkedSteam = steamClock; previous.copy(p)
    },
    reset() {
      freightClock = 0; steamClock = STEAM.warnAt; freightStarted = false; steamStarted = false
      checkedFreight = freightClock; checkedSteam = steamClock; lastStage = 'clear'
      previous.copy(player.mesh.position); applyFreight(); applySteam()
    }
  }
}

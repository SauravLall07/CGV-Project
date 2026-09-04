import * as THREE from 'three'
import { disposeObject } from '../core/dispose.js'
import { createCarriageEnvironment, CARRIAGE_CEILING_Y } from '../environment/carriages.js'
import { createChronoFieldMaterial } from '../shaders/chrono-field.js'

// Level 2 — "The Moving Heist". Carriage-by-carriage traversal of the five
// interiors from environment/carriages.js, one signature time ability per car:
//
//   Passenger  — SLOW   : time the gap under a swinging luggage lamp
//   Security   — FREEZE  : stop the sweeping internal scanner and walk through
//   Cargo      — REWIND  : restore a walkway that collapses as you approach
//   Mechanical — GHOST   : a Time Ghost holds a pressure plate open while you climb
//   Roof       — SLOW    : cross the exterior catwalk against the slipstream
//   Vault      — FREEZE  : freeze the spinning lock ring, breach the cage,
//                          take the Chrono Core -> train destabilises -> Level 3
//
// The forward bulkhead of the Vault is sealed; the roof is the only way in.
// A single `bounds` object is returned and MUTATED as the player moves between
// the interior corridor, the roof, and the vault room — the level manager's
// bounds getter hands the same reference to the player each frame.

const MODE_INT = { NORMAL: 0, SLOW: 1, FREEZE: 2, REWIND: 3 }

function createChronoCore() {
  const core = new THREE.Group()
  core.name = 'chrono-core'
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.28, metalness: 0.92 })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.12, 16), brass)
  base.position.y = 0.06
  base.castShadow = true
  core.add(base)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.85, 16), brass)
  column.position.y = 0.52
  column.castShadow = true
  core.add(column)

  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 20), brass)
  cradle.rotation.x = Math.PI / 2
  cradle.position.y = 0.98
  core.add(cradle)

  const shaderMats = []
  const orbMat = createChronoFieldMaterial({ baseColor: 0x0284c7, glowColor: 0x38bdf8, opacity: 0.9 })
  shaderMats.push(orbMat)
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), orbMat)
  orb.position.y = 1.2
  orb.name = 'chrono-core-orb'
  core.add(orb)

  const haloMat = createChronoFieldMaterial({
    baseColor: 0x38bdf8, glowColor: 0xa5f3fc, opacity: 0.85, doubleSided: true
  })
  shaderMats.push(haloMat)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 8, 32), haloMat)
  halo.rotation.x = Math.PI / 2.4
  halo.position.y = 1.2
  halo.name = 'chrono-core-halo'
  core.add(halo)

  const glow = new THREE.PointLight(0x54dcff, 14, 7, 2)
  glow.position.y = 1.2
  core.add(glow)

  core.userData.shaderMats = shaderMats
  return core
}

function makeConsole(accent) {
  const g = new THREE.Group()
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 1.0, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 })
  )
  box.position.y = 0.5
  box.castShadow = true
  g.add(box)
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.2, 0.03),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.2 })
  )
  screen.position.set(0, 0.78, 0.15)
  screen.rotation.x = -0.3
  g.add(screen)
  return g
}

export function createMovingHeistLevel({ scene, interaction, timeSystem, hud, player, camera, respawn, advance }) {
  if (timeSystem?.setLevelMultiplier) timeSystem.setLevelMultiplier(1.0)

  const env = createCarriageEnvironment()
  const { root, spans, roof } = env
  scene.add(root)
  scene.background = new THREE.Color(0x090b12)
  scene.fog = new THREE.Fog(0x090b12, 12, 52)

  const unregisters = [] // interaction + time-system unregister callbacks
  const bounds = { ...env.interiorBounds } // mutated on section transitions

  const addProp = (obj, z, x = 0, y = 0) => { obj.position.set(x, y, z); root.add(obj); return obj }

  // Throttled fail so a hazard the player is standing in doesn't respawn-spam.
  let failCooldown = 0
  function failSoft(message, reason = 'caught') {
    if (failCooldown > 0) return
    failCooldown = 1.2
    respawn.fail(reason)
    if (message) hud.showToast(message, 1800)
  }

  let section = 'interior' // 'interior' | 'roof' | 'vault'
  function setBounds(b) {
    bounds.minX = b.minX; bounds.maxX = b.maxX; bounds.minZ = b.minZ; bounds.maxZ = b.maxZ
  }

  // One-time contextual hint as the player first enters each carriage.
  const hintsShown = new Set()
  function hint(key, playerZ, enterZ, message) {
    if (hintsShown.has(key) || playerZ < enterZ) return
    hintsShown.add(key)
    hud.showToast(message, 3200)
  }

  // Mid-corridor checkpoints so an interior fail doesn't send the player back
  // through cars they already cleared.
  let lastCheckpointZ = spans.passenger.minZ + 3
  const corridorCheckpoints = [
    spans.passenger.center - 2.5, // just before the swinging lamp
    spans.security.minZ + 1.5,
    spans.cargo.minZ + 1.5,
    spans.mechanical.minZ + 1.5
  ]

  // ============================================================
  // PASSENGER — SLOW: swinging luggage lamp
  // ============================================================
  const pendulum = new THREE.Group()
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.05, 8),
    new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.9, roughness: 0.3 })
  )
  rod.position.y = -0.52
  pendulum.add(rod)
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffca7a, emissiveIntensity: 2.4 })
  )
  lamp.position.y = -1.06
  pendulum.add(lamp)
  const lampLight = new THREE.PointLight(0xffcaa0, 7, 6, 2)
  lampLight.position.y = -1.06
  pendulum.add(lampLight)
  const pendulumZ = spans.passenger.center + 2
  addProp(pendulum, pendulumZ, 0, CARRIAGE_CEILING_Y - 0.02)

  let pendT = 0
  const pendSwing = () => Math.sin(pendT * 1.9) * 0.8
  unregisters.push(timeSystem.register(pendulum, {
    onUpdate(scaledDelta) { pendT += scaledDelta; pendulum.rotation.x = pendSwing() },
    getSnapshot: () => ({ pendT }),
    restoreSnapshot: (s) => { pendT = s.pendT; pendulum.rotation.x = pendSwing() }
  }))

  // ============================================================
  // SECURITY — FREEZE: sweeping internal scanner
  // ============================================================
  const scanner = new THREE.Group()
  const scanBeamMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, emissive: 0x00d4ff, emissiveIntensity: 3, transparent: true, opacity: 0.55
  })
  const scanBeam = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, CARRIAGE_CEILING_Y - 0.2, 0.05),
    scanBeamMat
  )
  scanBeam.position.y = (CARRIAGE_CEILING_Y - 0.2) / 2
  scanner.add(scanBeam)
  const scanRange = 3.2
  const scanRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, scanRange * 2 + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
  )
  scanRail.position.y = CARRIAGE_CEILING_Y - 0.12
  scanner.add(scanRail)
  const scannerZ = spans.security.center
  addProp(scanner, scannerZ)

  let scanT = 0
  unregisters.push(timeSystem.register(scanner, {
    onUpdate(scaledDelta) { scanT += scaledDelta; scanBeam.position.z = Math.sin(scanT * 1.6) * scanRange },
    getSnapshot: () => ({ scanT }),
    restoreSnapshot: (s) => { scanT = s.scanT; scanBeam.position.z = Math.sin(scanT * 1.6) * scanRange }
  }))

  const secConsole = makeConsole(0x38bdf8)
  addProp(secConsole, spans.security.minZ + 2, 0.44)
  unregisters.push(interaction.register(secConsole, {
    prompt: 'Read the security notice',
    onInteract: () => interaction.flashPrompt('"Internal scanner active — authorised chrono-tech may FREEZE ([2]/F) to pass."', 2800)
  }))

  // ============================================================
  // CARGO — REWIND: collapsing walkway
  // ============================================================
  const gapZ = spans.cargo.center
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.12, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7, metalness: 0.05 })
  )
  let plankY = 0.06
  let plankTriggered = false
  let plankCollapsing = false
  let plankFuse = 1.4
  plank.position.set(0, plankY, gapZ)
  root.add(plank)

  const pit = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 3.2, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x04050a, roughness: 1 })
  )
  pit.position.set(0, -1.62, gapZ)
  pit.userData.noCameraCollision = true
  root.add(pit)

  function resetPlank() {
    plankY = 0.06; plankTriggered = false; plankCollapsing = false; plankFuse = 1.4
    plank.position.y = plankY
  }
  unregisters.push(timeSystem.register(plank, {
    onUpdate(scaledDelta, timeScale) {
      if (timeScale > 0) {
        if (plankCollapsing) plankY = Math.max(-3, plankY - scaledDelta * 4)
        else if (plankTriggered) { plankFuse -= scaledDelta; if (plankFuse <= 0) plankCollapsing = true }
      }
      plank.position.y = plankY
    },
    getSnapshot: () => ({ plankY, plankTriggered, plankCollapsing, plankFuse }),
    restoreSnapshot: (s) => {
      plankY = s.plankY; plankTriggered = s.plankTriggered
      plankCollapsing = s.plankCollapsing; plankFuse = s.plankFuse
      plank.position.y = plankY
    }
  }))

  // Loose crates in the aisle — nudge targets for the Phase 6 physics pass;
  // static for now, just dressing the Rewind puzzle.
  const looseMat = new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.75, metalness: 0.05 })
  for (const [x, z] of [[-0.32, gapZ - 3.4], [0.3, gapZ - 3.0], [0.36, gapZ + 3.2]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), looseMat)
    c.position.set(x, 0.28, z)
    c.rotation.y = x
    c.castShadow = true
    root.add(c)
  }

  // ============================================================
  // MECHANICAL — GHOST: pressure plate holds the roof hatch, + blade hazard
  // ============================================================
  const blade = new THREE.Group()
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.14, 14),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 })
  )
  hub.rotation.x = Math.PI / 2
  blade.add(hub)
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, emissive: 0x00d4ff, emissiveIntensity: 3, roughness: 0.1
  })
  blade.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.05), bladeMat))
  blade.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 0.05), bladeMat))
  const bladeZ = spans.mechanical.center - 3
  addProp(blade, bladeZ, 0, 1.35)

  let bladeA = 0
  unregisters.push(timeSystem.register(blade, {
    onUpdate(scaledDelta) { bladeA += scaledDelta * 7; blade.rotation.z = bladeA },
    getSnapshot: () => ({ bladeA }),
    restoreSnapshot: (s) => { bladeA = s.bladeA; blade.rotation.z = bladeA }
  }))

  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x334155, emissive: 0xf59e0b, emissiveIntensity: 1.2, roughness: 0.3
  })
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.95), plateMat)
  const platePos = new THREE.Vector3(0, 0.03, spans.mechanical.center - 1)
  plate.position.copy(platePos)
  root.add(plate)

  const { hatchCover, ladder } = env.parts.mechanical
  let hatchHold = 0
  let hatchLatch = 0
  let hatchOpen = 0

  unregisters.push(interaction.register(ladder, {
    prompt: 'Climb to the carriage roof',
    onInteract: () => {
      if (hatchOpen < 0.6) {
        interaction.flashPrompt('The roof hatch is sealed — hold the pressure plate open.')
        return
      }
      enterRoof()
    }
  }))

  // ============================================================
  // ROOF — SLOW: the slipstream
  // ============================================================
  let gustPhase = 0
  let sweptTime = 0

  function enterRoof() {
    section = 'roof'
    setBounds(env.roofBounds)
    const start = new THREE.Vector3(0, 3.3, roof.zStart + 1)
    player.setPose(start, 0)
    respawn.setCheckpoint(start, 0)
    camera.snap()
    gustPhase = 0
    sweptTime = 0
    hud.showToast('On the roof — the slipstream will tear you off. SLOW ([1]/Q) to cross.', 3400)
  }

  unregisters.push(interaction.register(roof.dropHatch, {
    prompt: 'Drop into the vault car',
    onInteract: () => enterVault()
  }))

  // ============================================================
  // VAULT — FREEZE: lock ring, cage, Chrono Core
  // ============================================================
  const barMat = new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.9, roughness: 0.3 })
  const cage = new THREE.Group()
  cage.name = 'chrono-core-cage'
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), barMat)
    bar.position.set(Math.cos(a) * 0.56, 0.95, Math.sin(a) * 0.56)
    cage.add(bar)
  }
  const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 8, 24), barMat)
  capRing.rotation.x = Math.PI / 2
  capRing.position.y = 1.9
  cage.add(capRing)

  const lockRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.06, 10, 28),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a08, emissiveIntensity: 1 })
  )
  lockRing.rotation.x = Math.PI / 2
  lockRing.position.y = 0.95
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.2), barMat)
    tooth.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62)
    tooth.rotation.y = -a
    lockRing.add(tooth)
  }
  cage.add(lockRing)
  addProp(cage, spans.vault.center + 2.6)

  let lockA = 0
  unregisters.push(timeSystem.register(lockRing, {
    onUpdate(scaledDelta) { lockA += scaledDelta * 3.2; lockRing.rotation.z = lockA },
    getSnapshot: () => ({ lockA }),
    restoreSnapshot: (s) => { lockA = s.lockA; lockRing.rotation.z = lockA }
  }))

  const core = createChronoCore()
  addProp(core, spans.vault.center + 4.4)

  let breached = false
  let taken = false
  let destabT = 0

  const unregisterCage = interaction.register(cage, {
    prompt: 'Breach the Chrono Core cage',
    onInteract: () => {
      if (timeSystem.getMode() !== 'FREEZE') {
        interaction.flashPrompt('The lock ring is spinning — FREEZE ([2]/F) it to breach.')
        return
      }
      breached = true
      cage.visible = false
      unregisterCage()
      hud.showToast('Cage breached — take the Chrono Core!', 2600)
    }
  })
  unregisters.push(unregisterCage)

  unregisters.push(interaction.register(core, {
    prompt: 'Take the Chrono Core',
    onInteract: () => {
      if (taken) return
      if (!breached) { interaction.flashPrompt('Breach the cage first.'); return }
      taken = true
      interaction.flashPrompt('Chrono Core secured!')
      hud.setObjective('The train is destabilising — brace!')
    }
  }))

  function enterVault() {
    section = 'vault'
    setBounds(env.vaultBounds)
    const p = new THREE.Vector3(0, 0, spans.vault.center - 3)
    player.setPose(p, 0)
    respawn.setCheckpoint(p, 0)
    camera.snap()
    hud.showToast('Inside the vault car — breach the Chrono Core cage.', 3000)
  }

  // ============================================================
  const orb = core.getObjectByName('chrono-core-orb')
  const halo = core.getObjectByName('chrono-core-halo')
  let elapsed = 0

  return {
    objective: 'Cross the five carriages to the vault — [1] Slow · [2] Freeze · [3] Rewind · [4] Ghost',
    checkpoint: { position: new THREE.Vector3(0, 0, spans.passenger.minZ + 3), yaw: 0 },
    bounds,

    update(delta) {
      env.update(delta)
      elapsed += delta
      failCooldown = Math.max(0, failCooldown - delta)
      const pp = player.mesh.position
      const mode = timeSystem.getMode()

      // Chrono Core idle animation + shader reaction (Phase 5 hook).
      orb.rotation.y += delta * 0.7
      orb.rotation.x += delta * 0.3
      orb.position.y = 1.2 + Math.sin(elapsed * 1.6) * 0.04
      halo.rotation.z += delta * 1.1
      halo.position.y = orb.position.y
      for (const m of core.userData.shaderMats) {
        if (!m.customUniforms) continue
        m.customUniforms.uTime.value += delta
        m.customUniforms.uMode.value = MODE_INT[mode] ?? 0
        m.customUniforms.uIntensity.value = mode === 'NORMAL' ? 0.25 : 0.9
      }

      // Destabilisation cinematic on pickup, then hand off to Level 3.
      if (taken) {
        destabT += delta
        root.rotation.z = Math.sin(destabT * 7) * 0.012 * Math.min(2, destabT)
        root.position.y = Math.sin(destabT * 11) * 0.012 * Math.min(1, destabT)
        if (destabT > 2.4) { taken = false; root.rotation.z = 0; root.position.y = 0; advance() }
        return
      }

      if (section === 'interior') {
        hint('passenger', pp.z, spans.passenger.minZ + 3,
          'Passenger car — a luggage lamp swings the aisle. [1]/Q SLOW to time your walk-through.')
        hint('security', pp.z, spans.security.minZ,
          'Security car — an internal scanner sweeps the corridor. [2]/F FREEZE it, then cross.')
        hint('cargo', pp.z, spans.cargo.minZ,
          'Cargo car — the walkway collapses as you near it. [3]/C REWIND to restore it and run across.')
        hint('mechanical', pp.z, spans.mechanical.minZ,
          'Mechanical car — record yourself on the plate, then send your [4]/G GHOST to hold it while you climb.')

        // Rolling corridor checkpoints.
        for (const z of corridorCheckpoints) {
          if (pp.z > z && z > lastCheckpointZ) {
            lastCheckpointZ = z
            respawn.setCheckpoint(new THREE.Vector3(0, 0, z), 0)
          }
        }

        // Passenger: swinging lamp. SLOW (crawl it) or FREEZE (stop it clear of
        // centre) both let you slip past; at normal time you time the gap.
        const lampZ = pendulumZ + Math.sin(pendulum.rotation.x) * 1.06
        if (mode === 'NORMAL' && Math.abs(pp.z - lampZ) < 0.42 && Math.abs(pp.x) < 0.55) {
          failSoft('The swinging lamp knocked you back!')
        }

        // Security: sweeping scanner. Only harmless while FREEZE holds it still.
        const beamWorldZ = scannerZ + scanBeam.position.z
        if (Math.abs(pp.z - beamWorldZ) < 0.34 && mode !== 'FREEZE') {
          failSoft('The security scanner swept you — reset to the checkpoint.')
        }

        // Cargo: collapsing walkway. REWIND restores it; walking away resets it.
        if (!plankTriggered && pp.z < gapZ && Math.abs(pp.z - gapZ) < 3.0) plankTriggered = true
        if (Math.abs(pp.z - gapZ) < 1.05 && Math.abs(pp.x) < 0.7 && plankY < -0.4) {
          failSoft('The walkway gave way!', 'fell')
        }
        if (plankCollapsing && plankY <= -3 && pp.z < gapZ - 5) resetPlank()

        // Mechanical: spinning blade. SLOW or FREEZE make it passable.
        if (Math.abs(pp.z - bladeZ) < 0.7 && Math.abs(pp.x) < 0.85 && mode === 'NORMAL') {
          failSoft('The chrono-blade clipped you!')
        }

        // Mechanical: pressure plate -> roof hatch. A held plate (Ghost or the
        // player) fills the latch; once latched the hatch stays open ~6s.
        const ghost = timeSystem.getGhost()
        const ghostOnPlate = ghost.isOccupying(platePos, 0.72)
        const playerOnPlate = Math.abs(pp.z - platePos.z) < 0.62 && Math.abs(pp.x - platePos.x) < 0.62
        const pressed = ghostOnPlate || playerOnPlate

        if (pressed) hatchHold = Math.min(1.2, hatchHold + delta)
        else hatchHold = Math.max(0, hatchHold - delta * 0.7)
        if (hatchHold >= 1.2) hatchLatch = 6
        hatchLatch = Math.max(0, hatchLatch - delta)

        const wantOpen = pressed || hatchLatch > 0
        hatchOpen += ((wantOpen ? 1 : 0) - hatchOpen) * Math.min(1, delta * 4)
        hatchCover.position.x = -1.15 * hatchOpen
        plateMat.emissive.setHex(pressed ? 0x10b981 : (hatchLatch > 0 ? 0x38bdf8 : 0xf59e0b))
        plate.position.y = pressed ? 0.012 : 0.03
      } else if (section === 'roof') {
        // Slipstream. SLOW both slows the gust cycle and damps its force, so
        // the crossing opens up; at normal time the gusts sweep you off.
        const slowed = mode === 'SLOW'
        gustPhase += delta * (slowed ? 0.16 : 1)
        const raw = Math.sin(gustPhase * 1.7)
        const gust = Math.pow(Math.max(0, raw), 0.6) * (slowed ? 0.25 : 1)

        // Teeter toward the leeward edge (clamped by bounds — reads as bracing).
        pp.x += gust * 2.4 * delta

        roof.streaks.forEach((s) => { s.material.opacity = 0.05 + gust * 0.5 })

        if (gust > 0.45) {
          sweptTime += delta * gust * (1 + Math.max(0, Math.abs(pp.x) - 0.6))
        } else {
          sweptTime = Math.max(0, sweptTime - delta * 1.7)
        }
        if (sweptTime > 1.5) {
          sweptTime = 0
          respawn.fail('fell')
          hud.showToast('Blown off the roof!', 1800)
        }
      }
      // section === 'vault': cage/core interactions carry it; nothing per-frame.
    },

    dispose() {
      unregisters.forEach((fn) => fn())
      scene.remove(root)
      disposeObject(root)
    }
  }
}

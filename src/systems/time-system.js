import * as THREE from 'three'
import { createTimeGhost } from '../entities/time-ghost.js'

// Chrono Express — Time-Manipulation Core Engine (Phase 3 foundation).
// Provides Slow (0.2x), Freeze (0.0x), Rewind (state restoration), and
// Time Ghost (temporal echo replaying player actions).
//
// Designed to be consumed by Level 2, Level 3, and Custom Shaders.

export const TIME_MODES = {
  NORMAL: 'NORMAL',
  SLOW: 'SLOW',
  FREEZE: 'FREEZE',
  REWIND: 'REWIND'
}

const MAX_ENERGY = 100
const RECHARGE_RATE = 15 // energy per second when normal
const DRAIN_RATES = {
  SLOW: 18,
  FREEZE: 28,
  REWIND: 32
}
const GHOST_ENERGY_COST = 35
const GHOST_BUFFER_SECONDS = 5.0

// Chrono Strain — thermal load on the Chrono Interface.
//
// Energy is the *budget* for using time powers; strain is the *penalty* for
// leaning on one of them. Only Freeze (and, mildly, Rewind) heats the
// interface, so a player who answers every hazard with Freeze overheats it and
// loses Freeze for a few seconds while Slow / Rewind / Ghost keep working.
// Levels opt in via setStrainEnabled() so Level 1 and Level 3 are unaffected.
const MAX_STRAIN = 100
const STRAIN_RATES = { SLOW: 0, FREEZE: 34, REWIND: 8 }
// Flat cost per Freeze activation, so tapping it on and off is not a way to
// dodge the sustained-use penalty.
const FREEZE_ACTIVATION_STRAIN = 14
const STRAIN_DECAY = 13 // per second while not heating
const STRAIN_LOCKOUT_SECONDS = 8.0
const SNAPSHOT_INTERVAL = 0.05 // 20 snapshots per second
const REWIND_SPEED = 2.5
// Continuous objects keep ten seconds of history. One-shot machinery can
// use recordWhen to retain the failure animation without recording idle time.
const MAX_SNAPSHOT_HISTORY = 10.0

// Which abilities the player currently has. Level 3's scripted Chrono Core
// depletion locks everything but Freeze, which is why this lives here rather
// than in a level: the key bindings in main.js and the HUD both read it.
const ALL_ABILITIES = { SLOW: true, FREEZE: true, REWIND: true, GHOST: true }

export function createTimeSystem({ scene, player, hud }) {
  let mode = TIME_MODES.NORMAL
  let energy = MAX_ENERGY
  let ghost = createTimeGhost()
  let availability = { ...ALL_ABILITIES }
  scene.add(ghost.mesh)

  // Rolling history of player transforms for Time Ghost
  const playerHistory = []

  // Set of registered time-affected objects
  const registered = new Set()
  const ghostPads = new Set()

  let snapshotTimer = 0
  let rewindPlaybackTime = 0
  let ghostCooldown = 0
  let strain = 0
  let strainEnabled = false
  let freezeLockout = 0
  let levelMultiplier = 1.0 // 1.0 for Level 2 (controlled), 1.8 for Level 3 (unstable timewreck)

  // Shader uniforms exposed for custom materials
  const uniforms = {
    uTime: { value: 0.0 },
    uTimeScale: { value: 1.0 },
    uTimeMode: { value: 0 }, // 0: normal, 1: slow, 2: freeze, 3: rewind
    uMode: { value: 0 },
    uIntensity: { value: 0.0 },
    uTimeDistortionIntensity: { value: 0.0 }
  }

  function setMode(newMode) {
    const previousMode = mode
    if (mode === newMode) {
      // Toggle off back to normal
      mode = TIME_MODES.NORMAL
    } else {
      if (newMode !== TIME_MODES.NORMAL && !availability[newMode]) {
        if (hud) hud.showToast('That chrono ability is offline', 1200)
        return
      }
      if (newMode !== TIME_MODES.NORMAL && energy < 10) {
        if (hud) hud.showToast('Chrono Core energy depleted!', 1200)
        return
      }
      if (newMode === TIME_MODES.FREEZE && freezeLockout > 0) {
        if (hud) {
          hud.showToast(
            `Chrono Interface overheated — FREEZE offline for ${freezeLockout.toFixed(1)}s`,
            1400
          )
        }
        return
      }
      mode = newMode
      if (strainEnabled && mode === TIME_MODES.FREEZE) {
        strain = Math.min(MAX_STRAIN, strain + FREEZE_ACTIVATION_STRAIN)
      }
    }

    if (mode !== previousMode) rewindPlaybackTime = 0

    // Notify registered objects of state changes
    registered.forEach((entry) => {
      if (entry.options.onSlow) entry.options.onSlow(mode === TIME_MODES.SLOW)
      if (entry.options.onFreeze) entry.options.onFreeze(mode === TIME_MODES.FREEZE)
      if (entry.options.onRewind) entry.options.onRewind(mode === TIME_MODES.REWIND)
    })

    updateUniforms()
  }

  // Levels that want the anti-Freeze-spam pressure turn this on; everything
  // else keeps the original behaviour with no strain bar at all.
  function setStrainEnabled(enabled) {
    strainEnabled = Boolean(enabled)
    if (!strainEnabled) {
      strain = 0
      freezeLockout = 0
    }
  }

  function setLevelMultiplier(mult) {
    levelMultiplier = mult || 1.0
    updateUniforms()
  }

  // Pass a partial map, e.g. { SLOW: false, REWIND: false, GHOST: false }.
  // Anything omitted is re-enabled, so `setAbilityAvailability({})` restores
  // the full kit — which is what level teardown does.
  function setAbilityAvailability(map = {}) {
    availability = { ...ALL_ABILITIES, ...map }
    // If the ability currently running just went offline, drop to normal time.
    if (mode !== TIME_MODES.NORMAL && !availability[mode]) setMode(TIME_MODES.NORMAL)
  }

  function getAbilityAvailability() {
    return { ...availability }
  }

  function resetGhost() {
    ghost.stop()
    playerHistory.length = 0
    ghostCooldown = 0
  }

  function registerGhostPad(center, halfSize) {
    const pad = { center, halfSize }
    ghostPads.add(pad)
    return () => ghostPads.delete(pad)
  }

  function triggerGhost() {
    if (ghost.isPlaying()) {
      ghost.stop()
      return
    }
    if (!availability.GHOST) {
      if (hud) hud.showToast('Time Ghost is offline', 1200)
      return
    }
    if (ghostCooldown > 0) {
      if (hud) hud.showToast('Time Ghost on cooldown!', 1000)
      return
    }
    if (energy < GHOST_ENERGY_COST) {
      if (hud) hud.showToast('Not enough Chrono energy for Time Ghost!', 1200)
      return
    }
    const onPad = [...ghostPads].some(({ center, halfSize }) => {
      const position = player.mesh.position
      return Math.abs(position.y - center.y) < 0.25 &&
        Math.abs(position.x - center.x) < halfSize &&
        Math.abs(position.z - center.z) < halfSize
    })
    if (!onPad && playerHistory.length < 5) {
      if (hud) hud.showToast('Recording movement trajectory… try again in 1s', 1000)
      return
    }

    energy -= GHOST_ENERGY_COST
    ghostCooldown = 4.0

    // Clone trajectory from player history
    const trajectory = onPad ? [0, 0.001].map((time) => ({
      time,
      position: player.mesh.position.clone(),
      rotationY: player.mesh.rotation.y,
      stridePhase: 0
    })) : playerHistory.map((p) => ({
      time: p.time,
      position: p.position.clone(),
      rotationY: p.rotationY,
      stridePhase: p.stridePhase
    }))
    // Include the summon position, even if the player just stepped onto a pad
    // since the last history sample.
    trajectory.push({
      ...trajectory[trajectory.length - 1],
      time: trajectory[trajectory.length - 1].time + 0.001,
      position: player.mesh.position.clone(),
      rotationY: player.mesh.rotation.y
    })

    ghost.startReplay(trajectory, {
      onComplete: () => {
        if (hud) hud.showToast('Time Ghost faded', 1000)
      }
    })

    if (hud) hud.showToast(onPad ? 'Ghost holding pad — move ahead! (8 seconds)' : 'Time Ghost summoned!', 1800)
  }

  function updateUniforms() {
    let scale = 1.0
    let modeInt = 0
    let distortion = 0.0

    switch (mode) {
      case TIME_MODES.SLOW:
        scale = 0.2
        modeInt = 1
        distortion = 0.5 * levelMultiplier
        break
      case TIME_MODES.FREEZE:
        scale = 0.0
        modeInt = 2
        distortion = 0.8 * levelMultiplier
        break
      case TIME_MODES.REWIND:
        scale = -REWIND_SPEED
        modeInt = 3
        distortion = 1.0 * levelMultiplier
        break
      default:
        scale = 1.0
        modeInt = 0
        distortion = 0.0
    }

    uniforms.uTimeScale.value = scale
    uniforms.uTimeMode.value = modeInt
    uniforms.uMode.value = modeInt
    uniforms.uIntensity.value = distortion
    uniforms.uTimeDistortionIntensity.value = distortion
  }

  function register(object, options = {}) {
    const entry = {
      object,
      options,
      snapshots: []
    }
    const initial = captureSnapshot(entry)
    if (initial) entry.snapshots.push(initial)
    registered.add(entry)

    return function unregister() {
      registered.delete(entry)
    }
  }

  function captureSnapshot(entry) {
    if (entry.options.getSnapshot) return entry.options.getSnapshot()
    if (!entry.object) return null
    return {
      position: entry.object.position.clone(),
      rotation: entry.object.rotation.clone()
    }
  }

  function update(delta, now = performance.now() / 1000) {
    uniforms.uTime.value += delta

    if (ghostCooldown > 0) {
      ghostCooldown = Math.max(0, ghostCooldown - delta)
    }

    // Chrono Strain. Heats while Freeze (or Rewind) runs, cools otherwise, and
    // takes Freeze offline entirely once it tops out.
    if (strainEnabled) {
      if (freezeLockout > 0) {
        freezeLockout = Math.max(0, freezeLockout - delta)
        if (freezeLockout === 0 && hud) {
          hud.showToast('Chrono Interface re-synchronised — FREEZE online', 1600)
        }
      }

      const strainRate = STRAIN_RATES[mode] || 0
      if (strainRate > 0) {
        strain = Math.min(MAX_STRAIN, strain + strainRate * delta)
        if (strain >= MAX_STRAIN && mode === TIME_MODES.FREEZE) {
          freezeLockout = STRAIN_LOCKOUT_SECONDS
          setMode(TIME_MODES.NORMAL)
          if (hud) hud.showToast('CHRONO INTERFACE OVERHEATED — FREEZE offline', 2400)
        }
      } else {
        strain = Math.max(0, strain - STRAIN_DECAY * delta)
      }
    }

    // Energy drain & recharge
    if (mode === TIME_MODES.NORMAL) {
      energy = Math.min(MAX_ENERGY, energy + RECHARGE_RATE * delta)
    } else {
      const drain = (DRAIN_RATES[mode] || 20) * delta
      energy -= drain
      if (energy <= 0) {
        energy = 0
        setMode(TIME_MODES.NORMAL)
        if (hud) hud.showToast('Chrono energy depleted — time normalized', 1500)
      }
    }

    // Record player trajectory for Ghost
    if (player && player.mesh) {
      playerHistory.push({
        time: now,
        position: player.mesh.position.clone(),
        rotationY: player.mesh.rotation.y,
        stridePhase: now * 4
      })

      // Trim player history to max duration
      const cutoff = now - GHOST_BUFFER_SECONDS
      while (playerHistory.length > 0 && playerHistory[0].time < cutoff) {
        playerHistory.shift()
      }
    }

    // Calculate effective time scale for objects
    let timeScale = 1.0
    if (mode === TIME_MODES.SLOW) timeScale = 0.2
    else if (mode === TIME_MODES.FREEZE) timeScale = 0.0
    else if (mode === TIME_MODES.REWIND) timeScale = -REWIND_SPEED

    const scaledDelta = delta * timeScale

    // Update Ghost
    ghost.update(delta)

    if (mode === TIME_MODES.REWIND) {
      snapshotTimer = 0
      rewindPlaybackTime += delta * REWIND_SPEED
      const stepsToPop = Math.floor((rewindPlaybackTime + 1e-9) / SNAPSHOT_INTERVAL)
      rewindPlaybackTime -= stepsToPop * SNAPSHOT_INTERVAL
      // Replay registered snapshots backwards
      registered.forEach((entry) => {
        if (entry.snapshots.length > 0) {
          for (let i = 0; i < stepsToPop; i++) {
            // Keep the oldest state so an exhausted buffer remains stable.
            if (entry.snapshots.length > 1) entry.snapshots.pop()
            const snap = entry.snapshots[entry.snapshots.length - 1]
            if (entry.options.restoreSnapshot) {
              entry.options.restoreSnapshot(snap)
            } else if (entry.object) {
              if (snap.position) entry.object.position.copy(snap.position)
              if (snap.rotation) entry.object.rotation.copy(snap.rotation)
            }
          }
        } else if (entry.options.onUpdate) {
          // Snapshot-driven objects must not also integrate backwards after
          // restoration; doing both applies rewind twice.
          entry.options.onUpdate(scaledDelta, timeScale, delta)
        }
      })
    } else {
      // Split slow frames at sample boundaries so recording stays at 20 Hz
      // even below 20 FPS. Each callback still receives elapsed real time.
      let remaining = delta
      while (remaining > 1e-9) {
        const step = Math.min(remaining, SNAPSHOT_INTERVAL - snapshotTimer)
        snapshotTimer += step
        remaining -= step
        const shouldRecordSnapshot = snapshotTimer >= SNAPSHOT_INTERVAL - 1e-9
        registered.forEach((entry) => {
          const record = !entry.options.recordWhen || (timeScale > 0 && entry.options.recordWhen())
          entry.options.onUpdate?.(step * timeScale, timeScale, step)
          if (shouldRecordSnapshot && record) {
            const snapData = captureSnapshot(entry)
            if (snapData) {
              entry.snapshots.push(snapData)
              const maxSnaps = Math.round(MAX_SNAPSHOT_HISTORY / SNAPSHOT_INTERVAL)
              if (entry.snapshots.length > maxSnaps) {
                // Selectively recorded failure histories retain their intact
                // baseline even after several failed attempts.
                entry.snapshots.splice(entry.options.recordWhen ? 1 : 0, 1)
              }
            }
          }
        })
        if (shouldRecordSnapshot) snapshotTimer = 0
      }
    }

    updateUniforms()
  }

  function dispose() {
    availability = { ...ALL_ABILITIES }
    strainEnabled = false
    strain = 0
    freezeLockout = 0
    setMode(TIME_MODES.NORMAL)
    registered.clear()
    ghostPads.clear()
    playerHistory.length = 0
    if (ghost) {
      scene.remove(ghost.mesh)
      ghost.dispose()
    }
  }

  return {
    register,
    registerGhostPad,
    setMode,
    setLevelMultiplier,
    setAbilityAvailability,
    getAbilityAvailability,
    setStrainEnabled,
    triggerSlow: () => setMode(TIME_MODES.SLOW),
    triggerFreeze: () => setMode(TIME_MODES.FREEZE),
    triggerRewind: () => setMode(TIME_MODES.REWIND),
    triggerGhost,
    resetGhost,
    getMode: () => mode,
    getEnergy: () => energy,
    getMaxEnergy: () => MAX_ENERGY,
    getGhostCooldown: () => ghostCooldown,
    getStrain: () => strain,
    getMaxStrain: () => MAX_STRAIN,
    isStrainEnabled: () => strainEnabled,
    getFreezeLockout: () => freezeLockout,
    getGhost: () => ghost,
    getUniforms: () => uniforms,
    update,
    dispose
  }
}

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
const CHECKPOINT_ENERGY_FLOOR = 50
const RECHARGE_RATE = 15 // energy per second when normal
const DRAIN_RATES = {
  SLOW: 18,
  FREEZE: 28,
  REWIND: 32
}
const GHOST_ENERGY_COST = 35
const GHOST_BUFFER_SECONDS = 5.0
const SNAPSHOT_INTERVAL = 0.05 // 20 snapshots per second
const MAX_SNAPSHOT_HISTORY = 6.0 // max rewind buffer seconds
const REWIND_RATE = 2.5 // seconds of recorded history restored per real second
const TIME_EPSILON = 1e-7

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

  // activeTime only advances while update() is called, so opening a menu or
  // pausing cannot insert a wall-clock hole into a Time Ghost recording.
  let activeTime = 0

  // timelineTime is the timestamp carried by object snapshots. It advances
  // during forward play and moves backwards during Rewind.
  let timelineTime = 0
  let snapshotAccumulator = 0
  let ghostCooldown = 0
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
    let nextMode = newMode

    if (previousMode === nextMode) {
      // Toggle off back to normal
      nextMode = TIME_MODES.NORMAL
    } else {
      if (nextMode !== TIME_MODES.NORMAL && !availability[nextMode]) {
        if (hud) hud.showToast('That chrono ability is offline', 1200)
        return
      }
      if (nextMode !== TIME_MODES.NORMAL && energy < 10) {
        if (hud) hud.showToast('Chrono Core energy depleted!', 1200)
        return
      }
    }

    if (previousMode === TIME_MODES.REWIND && nextMode !== TIME_MODES.REWIND) {
      finishRewindBranch()
    }

    if (nextMode === TIME_MODES.REWIND) {
      // Capture the exact state at the button press. The regular recorder may
      // be part-way to its next fixed boundary at this point.
      captureAllSnapshots(timelineTime)
      snapshotAccumulator = 0

      if (!hasRewindHistory()) {
        if (hud) hud.showToast('Nothing left to rewind', 1200)
        return
      }
    }

    mode = nextMode

    // Notify registered objects of state changes
    registered.forEach((entry) => {
      if (entry.options.onSlow) entry.options.onSlow(mode === TIME_MODES.SLOW)
      if (entry.options.onFreeze) entry.options.onFreeze(mode === TIME_MODES.FREEZE)
      if (entry.options.onRewind) entry.options.onRewind(mode === TIME_MODES.REWIND)
    })

    updateUniforms()
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
    if (playerHistory.length < 5) {
      if (hud) hud.showToast('Recording movement trajectory… try again in 1s', 1000)
      return
    }

    energy -= GHOST_ENERGY_COST
    ghostCooldown = 4.0

    // Clone trajectory from player history
    const trajectory = playerHistory.map((p) => ({
      time: p.time,
      position: p.position.clone(),
      rotationY: p.rotationY,
      stridePhase: p.stridePhase
    }))

    ghost.startReplay(trajectory, {
      onComplete: () => {
        if (hud) hud.showToast('Time Ghost faded', 1000)
      }
    })

    if (hud) hud.showToast('Time Ghost summoned!', 1200)
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
        scale = -1.5
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
    registered.add(entry)
    captureSnapshot(entry, timelineTime)

    return function unregister() {
      registered.delete(entry)
    }
  }

  function readSnapshot(entry) {
    if (entry.options.getSnapshot) return entry.options.getSnapshot()
    if (!entry.object) return null

    return {
      position: entry.object.position.clone(),
      rotation: entry.object.rotation.clone()
    }
  }

  function captureSnapshot(entry, time) {
    const state = readSnapshot(entry)
    if (state == null) return

    const snapshots = entry.snapshots
    const last = snapshots[snapshots.length - 1]
    if (last && Math.abs(last.time - time) <= TIME_EPSILON) {
      last.state = state
    } else {
      snapshots.push({ time, state })
    }

    const cutoff = time - MAX_SNAPSHOT_HISTORY
    while (snapshots.length > 1 && snapshots[1].time < cutoff - TIME_EPSILON) {
      snapshots.shift()
    }
  }

  function captureAllSnapshots(time) {
    registered.forEach((entry) => captureSnapshot(entry, time))
  }

  function interpolateValue(before, after, t) {
    if (typeof before === 'number' && typeof after === 'number') {
      return THREE.MathUtils.lerp(before, after, t)
    }
    if (before?.isVector2 && after?.isVector2) return before.clone().lerp(after, t)
    if (before?.isVector3 && after?.isVector3) return before.clone().lerp(after, t)
    if (before?.isVector4 && after?.isVector4) return before.clone().lerp(after, t)
    if (before?.isQuaternion && after?.isQuaternion) return before.clone().slerp(after, t)
    if (before?.isEuler && after?.isEuler) {
      return new THREE.Euler(
        THREE.MathUtils.lerp(before.x, after.x, t),
        THREE.MathUtils.lerp(before.y, after.y, t),
        THREE.MathUtils.lerp(before.z, after.z, t),
        before.order
      )
    }
    if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
      return before.map((value, index) => interpolateValue(value, after[index], t))
    }
    if (
      before && after &&
      Object.getPrototypeOf(before) === Object.prototype &&
      Object.getPrototypeOf(after) === Object.prototype
    ) {
      const result = {}
      for (const key of Object.keys(before)) {
        result[key] = key in after
          ? interpolateValue(before[key], after[key], t)
          : before[key]
      }
      return result
    }

    // Discrete state changes (booleans, strings and unsupported objects) take
    // effect at the newer snapshot boundary, not halfway between samples.
    return t >= 1 ? after : before
  }

  function restoreSnapshot(entry, state) {
    if (entry.options.restoreSnapshot) {
      entry.options.restoreSnapshot(state)
    } else if (entry.object) {
      if (state.position) entry.object.position.copy(state.position)
      if (state.rotation) entry.object.rotation.copy(state.rotation)
    }
  }

  function restoreAtTime(entry, targetTime) {
    const snapshots = entry.snapshots
    if (snapshots.length === 0) return false

    if (targetTime <= snapshots[0].time + TIME_EPSILON) {
      restoreSnapshot(entry, snapshots[0].state)
      return true
    }

    const last = snapshots[snapshots.length - 1]
    if (targetTime >= last.time - TIME_EPSILON) {
      restoreSnapshot(entry, last.state)
      return true
    }

    let low = 0
    let high = snapshots.length - 1
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (snapshots[middle].time <= targetTime) low = middle
      else high = middle
    }

    const before = snapshots[low]
    const after = snapshots[high]
    const span = Math.max(TIME_EPSILON, after.time - before.time)
    const t = THREE.MathUtils.clamp((targetTime - before.time) / span, 0, 1)
    const state = entry.options.interpolateSnapshot
      ? entry.options.interpolateSnapshot(before.state, after.state, t)
      : interpolateValue(before.state, after.state, t)
    restoreSnapshot(entry, state)
    return true
  }

  function oldestHistoryTime() {
    let oldest = Infinity
    registered.forEach((entry) => {
      if (entry.snapshots.length > 0) oldest = Math.min(oldest, entry.snapshots[0].time)
    })
    return oldest
  }

  function hasRewindHistory() {
    const oldest = oldestHistoryTime()
    return Number.isFinite(oldest) && timelineTime - oldest > TIME_EPSILON
  }

  function finishRewindBranch() {
    // Rewind creates a new future. Discard snapshots from the abandoned
    // branch, then store the exact interpolated state at the branch point.
    registered.forEach((entry) => {
      while (
        entry.snapshots.length > 0 &&
        entry.snapshots[entry.snapshots.length - 1].time > timelineTime + TIME_EPSILON
      ) {
        entry.snapshots.pop()
      }
      captureSnapshot(entry, timelineTime)
    })
    snapshotAccumulator = 0
  }

  function updateForward(delta, timeScale) {
    let remaining = delta

    // Subdivide only at snapshot boundaries. Objects still receive all of the
    // elapsed time, while every history sample represents the same simulation
    // instant regardless of display refresh rate or uneven frame intervals.
    while (remaining > TIME_EPSILON) {
      const untilSnapshot = SNAPSHOT_INTERVAL - snapshotAccumulator
      const step = Math.min(remaining, untilSnapshot)

      registered.forEach((entry) => {
        if (entry.options.onUpdate) {
          entry.options.onUpdate(step * timeScale, timeScale, step)
        }
      })

      timelineTime += step
      snapshotAccumulator += step
      remaining -= step

      if (snapshotAccumulator >= SNAPSHOT_INTERVAL - TIME_EPSILON) {
        captureAllSnapshots(timelineTime)
        snapshotAccumulator = Math.max(0, snapshotAccumulator - SNAPSHOT_INTERVAL)
      }
    }
  }

  function updateRewind(delta) {
    const oldest = oldestHistoryTime()
    if (!Number.isFinite(oldest) || timelineTime <= oldest + TIME_EPSILON) {
      setMode(TIME_MODES.NORMAL)
      if (hud) hud.showToast('Rewind history exhausted', 1200)
      return
    }

    const affordableDelta = Math.min(delta, energy / DRAIN_RATES.REWIND)
    const requestedHistory = affordableDelta * REWIND_RATE
    const restoredHistory = Math.min(requestedHistory, timelineTime - oldest)
    const targetTime = timelineTime - restoredHistory

    registered.forEach((entry) => restoreAtTime(entry, targetTime))
    timelineTime = targetTime

    const consumedRealTime = restoredHistory / REWIND_RATE
    energy = Math.max(0, energy - DRAIN_RATES.REWIND * consumedRealTime)

    if (energy <= TIME_EPSILON) {
      energy = 0
      setMode(TIME_MODES.NORMAL)
      if (hud) hud.showToast('Chrono energy depleted — time normalized', 1500)
    } else if (timelineTime <= oldest + TIME_EPSILON) {
      setMode(TIME_MODES.NORMAL)
      if (hud) hud.showToast('Rewind history exhausted', 1200)
    }
  }

  function update(delta) {
    uniforms.uTime.value += delta
    activeTime += delta

    if (ghostCooldown > 0) {
      ghostCooldown = Math.max(0, ghostCooldown - delta)
    }

    // Energy drain & recharge. Rewind accounts for its own consumption so an
    // update that reaches the end of history does not charge for unused time.
    if (mode === TIME_MODES.NORMAL) {
      energy = Math.min(MAX_ENERGY, energy + RECHARGE_RATE * delta)
    } else if (mode !== TIME_MODES.REWIND) {
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
        time: activeTime,
        position: player.mesh.position.clone(),
        rotationY: player.mesh.rotation.y,
        stridePhase: activeTime * 4
      })

      // Trim player history to max duration
      const cutoff = activeTime - GHOST_BUFFER_SECONDS
      while (playerHistory.length > 0 && playerHistory[0].time < cutoff) {
        playerHistory.shift()
      }
    }

    // Update Ghost
    ghost.update(delta)

    if (mode === TIME_MODES.REWIND) {
      updateRewind(delta)
    } else {
      let timeScale = 1.0
      if (mode === TIME_MODES.SLOW) timeScale = 0.2
      else if (mode === TIME_MODES.FREEZE) timeScale = 0.0
      updateForward(delta, timeScale)
    }

    updateUniforms()
  }

  function clearTransientState() {
    setMode(TIME_MODES.NORMAL)
    ghost.cancel()
    ghostCooldown = 0
    playerHistory.length = 0
    timelineTime = 0
    activeTime = 0
    snapshotAccumulator = 0
    uniforms.uTime.value = 0
  }

  // Normal level progression carries remaining energy, but grants a 50-point
  // floor so the next puzzle cannot begin in an unusable state. Restarts and
  // new runs use the default and receive the complete initial kit.
  function resetForLevel({ preserveEnergy = false } = {}) {
    clearTransientState()
    registered.clear()
    levelMultiplier = 1.0
    availability = { ...ALL_ABILITIES }
    energy = preserveEnergy ? Math.max(energy, CHECKPOINT_ENERGY_FLOOR) : MAX_ENERGY
    updateUniforms()
  }

  function resetForRun() {
    resetForLevel()
  }

  function captureCheckpointState() {
    return {
      energy,
      availability: { ...availability },
      levelMultiplier
    }
  }

  // Puzzle state is restored by the level-owned checkpoint callback. Once it
  // has done so, discard every pre-death recording and seed a fresh rewind
  // timeline from the safe checkpoint state.
  function resetForCheckpoint(snapshot = captureCheckpointState()) {
    clearTransientState()
    energy = Math.max(snapshot.energy, CHECKPOINT_ENERGY_FLOOR)
    availability = { ...snapshot.availability }
    levelMultiplier = snapshot.levelMultiplier
    for (const entry of registered) entry.snapshots.length = 0
    captureAllSnapshots(0)
    updateUniforms()
  }

  function dispose() {
    resetForRun()
    if (ghost) {
      scene.remove(ghost.mesh)
      ghost.dispose()
    }
  }

  return {
    register,
    setMode,
    setLevelMultiplier,
    setAbilityAvailability,
    getAbilityAvailability,
    resetForLevel,
    resetForRun,
    resetForCheckpoint,
    captureCheckpointState,
    triggerSlow: () => setMode(TIME_MODES.SLOW),
    triggerFreeze: () => setMode(TIME_MODES.FREEZE),
    triggerRewind: () => setMode(TIME_MODES.REWIND),
    triggerGhost,
    getMode: () => mode,
    getEnergy: () => energy,
    getMaxEnergy: () => MAX_ENERGY,
    getGhostCooldown: () => ghostCooldown,
    getGhost: () => ghost,
    getUniforms: () => uniforms,
    update,
    dispose
  }
}

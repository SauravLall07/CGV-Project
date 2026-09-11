import * as THREE from 'three'

// Game state / level manager (Phase 1 foundation): an explicit state machine
// over the level sequence. enter(state) tears the current level down —
// removing its objects from the scene and disposing their GPU resources —
// then instantiates the next. restart() is just enter(currentState), which
// is what makes restart-without-a-page-refresh possible. advance() steps to
// the next state in sequence, and is what level completion triggers call.
//
// A level factory receives ctx and returns:
//   { objective, checkpoint: { position, yaw }, bounds?, update?(delta), dispose() }
// dispose() is mandatory and must undo everything the factory added.
//
// enter() defers the actual build by two animation frames so the loading
// screen is on screen before the (synchronous) build blocks — see the comment
// in enter(). Everything that reads level state tolerates the brief gap:
// `bounds` reports null and update() no-ops while no level is built.

const DEFAULT_CHECKPOINT = { position: new THREE.Vector3(0, 0, 0), yaw: 0 }

export function createLevelManager({
  scene, interaction, assets, hud, player, camera, respawn, loadingScreen, timeSystem, levels,
  onEnter, onLeave, onInputStateChange
}) {
  const sequence = levels.map((l) => l.state)
  const factories = new Map(levels.map((l) => [l.state, l.create]))
  const keepPrevious = new Set(levels.filter((l) => l.keepPrevious).map((l) => l.state))

  let current = null
  let currentState = null
  let pendingToken = 0
  let held = null
  let transitioning = false

  const ctx = {
    scene, interaction, assets, hud, timeSystem, player, camera, respawn, advance,
    beginCinematic() {
      respawn.cancel()
      onInputStateChange?.()
    }
  }

  function teardown() {
    console.log(
      `[music ${new Date().toISOString()} t=${performance.now().toFixed(1)}] level-manager teardown currentState=${currentState} hasCurrent=${Boolean(current)}`
    )
    if (onLeave) onLeave()
    if (held) {
      held.dispose()
      held = null
    }
    if (!current) return
    current.dispose()
    current = null
  }

  function build(state, preserveEnergy) {
    const preserve = keepPrevious.has(state) && current
    if (preserve) {
      // Credits (and anything else flagged keepPrevious) freeze the outgoing
      // level in the scene instead of disposing it. held is disposed on the
      // next real teardown (quit to title, restart).
      held = current
      current = null
    } else {
      teardown()
    }

    timeSystem?.resetForLevel({ preserveEnergy })
    currentState = state
    current = factories.get(state)(ctx)

    if (!preserve) {
      const checkpoint = current.checkpoint ?? DEFAULT_CHECKPOINT
      respawn.setCheckpoint(checkpoint.position, checkpoint.yaw, checkpoint)
      player.setPose(checkpoint.position, checkpoint.yaw)
      // Movement is camera-relative, so the spawn yaw has to reach the camera or
      // "forward" would still mean whatever the previous level was facing.
      if (camera.setYaw) camera.setYaw(checkpoint.yaw ?? 0)
      camera.snap()
      hud.setObjective(current.objective ?? '')
    }
    console.log(
      `[music ${new Date().toISOString()} t=${performance.now().toFixed(1)}] level-manager onEnter("${state}") preserve=${Boolean(preserve)} pendingToken=${pendingToken}`
    )
    if (onEnter) onEnter(state)
  }

  function setTransitioning(value) {
    transitioning = value
    if (value) interaction.setEnabled(false)
    onInputStateChange?.()
  }

  function enter(state, { preserveEnergy = false } = {}) {
    if (!factories.has(state)) throw new Error(`level-manager: unknown state "${state}"`)
    console.log(
      `[music ${new Date().toISOString()} t=${performance.now().toFixed(1)}] level-manager enter("${state}") currentState=${currentState} pendingToken=${pendingToken}`
    )
    const token = ++pendingToken
    setTransitioning(true)
    respawn.reset()

    // Keep-previous states (Complete / credits) must not flash the loading
    // screen or dispose the outgoing level — the last frame stays up.
    if (keepPrevious.has(state) && current) {
      build(state, preserveEnergy)
      loadingScreen.hide()
      setTransitioning(false)
      return
    }

    loadingScreen.show()
    // No interacting mid-transition: the outgoing level's interactables stay
    // registered until teardown runs, and a second E press would fire the
    // same transition twice.
    interaction.setEnabled(false)

    // Two frames before building. Levels generate their procedural textures
    // synchronously, which blocks the main thread for a few hundred
    // milliseconds on a first build — running that in the same tick as show()
    // would freeze before the overlay ever reached the screen, which is
    // exactly the "slow load looks like a crash" case the brief warns about.
    // The first frame lets the loading screen paint; the second does the work.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== pendingToken) return
      build(state, preserveEnergy)

      // And one more so the built level has rendered behind the overlay
      // before it fades away.
      requestAnimationFrame(() => {
        if (token !== pendingToken) return
        loadingScreen.hide()
        setTransitioning(false)
        if (!onInputStateChange) interaction.setEnabled(true)
      })
    }))
  }

  function restart() {
    if (!currentState) return
    // Restarts the current level. On the terminal state it starts the whole
    // sequence over instead — both without a page refresh, which is what the
    // pause menu's RESTART LEVEL button and the restart key both call.
    const isLast = sequence.indexOf(currentState) === sequence.length - 1
    enter(isLast ? sequence[0] : currentState)
  }

  // Tear the current level down without building another. Quitting to the
  // title screen needs the level gone but the manager alive, so this is
  // teardown() plus dropping the state — a later enter() starts clean.
  function unload() {
    pendingToken += 1 // cancel any build still waiting on its deferred frames
    respawn.reset()
    teardown()
    timeSystem?.resetForRun()
    currentState = null
    loadingScreen.hide()
    setTransitioning(false)
    interaction.setEnabled(false)
  }

  function advance() {
    const index = sequence.indexOf(currentState)
    if (index >= 0 && index < sequence.length - 1) {
      enter(sequence[index + 1], { preserveEnergy: true })
    }
  }

  function update(delta) {
    if (!transitioning && current?.update) current.update(delta)
  }

  function dispose() {
    unload()
  }

  return {
    enter,
    restart,
    unload,
    advance,
    update,
    dispose,
    getState: () => currentState,
    isTransitioning: () => transitioning,
    isCinematic: () => Boolean(current?.isCinematic),
    get bounds() {
      return current && current.bounds ? current.bounds : null
    },
    get obstacles() {
      return current && current.obstacles ? current.obstacles : null
    },
    // Live guard list from the current level (Boarding stealth). Other
    // levels omit getGuards and the minimap simply draws no enemy icons.
    get guards() {
      return current && typeof current.getGuards === 'function'
        ? current.getGuards()
        : null
    },
    // L2/L3 expose one AABB per carriage (see carriages.listCarriageVolumes).
    // Boarding has none; the minimap stays on its follow-cam frustum there.
    get carriageVolumes() {
      return current && typeof current.getCarriageVolumes === 'function'
        ? current.getCarriageVolumes()
        : null
    }
  }
}

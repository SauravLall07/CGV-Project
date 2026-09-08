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
  onEnter, onLeave
}) {
  const sequence = levels.map((l) => l.state)
  const factories = new Map(levels.map((l) => [l.state, l.create]))
  const keepPrevious = new Set(levels.filter((l) => l.keepPrevious).map((l) => l.state))

  let current = null
  let currentState = null
  let pendingToken = 0
  let held = null

  const ctx = { scene, interaction, assets, hud, timeSystem, player, camera, respawn, advance }

  function teardown() {
    if (onLeave) onLeave()
    if (timeSystem) timeSystem.setMode('NORMAL')
    if (held) {
      held.dispose()
      held = null
    }
    if (!current) return
    current.dispose()
    current = null
  }

  function build(state) {
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

    currentState = state
    current = factories.get(state)(ctx)

    if (!preserve) {
      const checkpoint = current.checkpoint ?? DEFAULT_CHECKPOINT
      respawn.setCheckpoint(checkpoint.position, checkpoint.yaw)
      player.setPose(checkpoint.position, checkpoint.yaw)
      // Movement is camera-relative, so the spawn yaw has to reach the camera or
      // "forward" would still mean whatever the previous level was facing.
      if (camera.setYaw) camera.setYaw(checkpoint.yaw ?? 0)
      camera.snap()
      hud.setObjective(current.objective ?? '')
    }
    if (onEnter) onEnter(state)
  }

  function enter(state) {
    if (!factories.has(state)) throw new Error(`level-manager: unknown state "${state}"`)

    // Keep-previous states (Complete / credits) must not flash the loading
    // screen or dispose the outgoing level — the last frame stays up.
    if (keepPrevious.has(state) && current) {
      pendingToken += 1
      interaction.setEnabled(false)
      build(state)
      return
    }

    loadingScreen.show()
    // No interacting mid-transition: the outgoing level's interactables stay
    // registered until teardown runs, and a second E press would fire the
    // same transition twice.
    interaction.setEnabled(false)

    const token = ++pendingToken

    // Two frames before building. Levels generate their procedural textures
    // synchronously, which blocks the main thread for a few hundred
    // milliseconds on a first build — running that in the same tick as show()
    // would freeze before the overlay ever reached the screen, which is
    // exactly the "slow load looks like a crash" case the brief warns about.
    // The first frame lets the loading screen paint; the second does the work.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== pendingToken) return
      build(state)

      // And one more so the built level has rendered behind the overlay
      // before it fades away.
      requestAnimationFrame(() => {
        if (token !== pendingToken) return
        interaction.setEnabled(true)
        loadingScreen.hide()
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
    teardown()
    currentState = null
    loadingScreen.hide()
    interaction.setEnabled(false)
  }

  function advance() {
    const index = sequence.indexOf(currentState)
    if (index >= 0 && index < sequence.length - 1) enter(sequence[index + 1])
  }

  function update(delta) {
    if (current && current.update) current.update(delta)
  }

  // One-shot gameplay actions that belong to the active level (for example the
  // Passageway 2 distraction throw) are forwarded here instead of making main.js
  // know which level currently owns them.
  function handleAction(action, payload) {
    if (!current || typeof current.handleAction !== 'function') return false
    return Boolean(current.handleAction(action, payload))
  }

  function dispose() {
    teardown()
  }

  return {
    enter,
    restart,
    unload,
    advance,
    update,
    handleAction,
    dispose,
    getState: () => currentState,
    get bounds() {
      return current && current.bounds ? current.bounds : null
    },
    get obstacles() {
      return current && current.obstacles ? current.obstacles : null
    },
    get groundHeightAt() {
      return current && current.groundHeightAt ? current.groundHeightAt : null
    }
  }
}

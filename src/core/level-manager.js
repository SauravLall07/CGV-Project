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
  scene, interaction, assets, hud, player, camera, respawn, loadingScreen, timeSystem, levels
}) {
  const sequence = levels.map((l) => l.state)
  const factories = new Map(levels.map((l) => [l.state, l.create]))

  let current = null
  let currentState = null
  let pendingToken = 0

  const ctx = { scene, interaction, assets, hud, timeSystem, player, advance }

  function teardown() {
    if (timeSystem) timeSystem.setMode('NORMAL')
    if (!current) return
    current.dispose()
    current = null
  }

  function build(state) {
    teardown()

    currentState = state
    current = factories.get(state)(ctx)

    const checkpoint = current.checkpoint ?? DEFAULT_CHECKPOINT
    respawn.setCheckpoint(checkpoint.position, checkpoint.yaw)
    player.setPose(checkpoint.position, checkpoint.yaw)
    camera.snap()
    hud.setObjective(current.objective ?? '')
  }

  function enter(state) {
    if (!factories.has(state)) throw new Error(`level-manager: unknown state "${state}"`)

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
    // Mid-run, R restarts the current level. On the terminal state it starts
    // the whole sequence over (both without a page refresh — Phase 8's pause
    // / end menus will front proper buttons for this).
    const isLast = sequence.indexOf(currentState) === sequence.length - 1
    enter(isLast ? sequence[0] : currentState)
  }

  function advance() {
    const index = sequence.indexOf(currentState)
    if (index >= 0 && index < sequence.length - 1) enter(sequence[index + 1])
  }

  function update(delta) {
    if (current && current.update) current.update(delta)
  }

  // Debug affordance until Phase 8's pause menu owns restart. It works
  // without a refresh precisely because enter() = teardown + rebuild.
  function onKeyDown(event) {
    if (event.code === 'KeyR' && !event.repeat) restart()
  }
  window.addEventListener('keydown', onKeyDown)

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    teardown()
  }

  return {
    enter,
    restart,
    advance,
    update,
    dispose,
    getState: () => currentState,
    get bounds() {
      return current && current.bounds ? current.bounds : null
    }
  }
}

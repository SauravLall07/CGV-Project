// Owns the requestAnimationFrame loop. Registered callbacks are called each
// frame as update(delta), then the scene is rendered.
//
// Delta is clamped: after a pause, an alt-tab or a long level build, the first
// frame back reports the whole gap, and an unclamped delta that large
// teleports the player and every timed system through walls. Clamping simply
// makes that frame a slow one instead.
const MAX_DELTA = 0.1 // seconds

export function createLoop({ renderer, scene, camera, clock, afterRender }) {
  const updateCallbacks = []

  function add(callback) {
    updateCallbacks.push(callback)
  }

  function tick(timestamp) {
    const delta = Math.min(clock.getDelta(timestamp), MAX_DELTA)
    for (const update of updateCallbacks) {
      update(delta)
    }

    // Full-canvas main view. autoClear is off so a later inset render
    // (minimap) cannot wipe this pass. Viewport/scissor are reset every
    // frame in case the previous tick left an inset region active.
    const width = renderer.domElement.clientWidth
    const height = renderer.domElement.clientHeight
    renderer.autoClear = false
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.setScissor(0, 0, width, height)
    renderer.clear()
    renderer.render(scene, camera)
    if (afterRender) afterRender(renderer)

    requestAnimationFrame(tick)
  }

  function start() {
    requestAnimationFrame(tick)
  }

  return { add, start }
}

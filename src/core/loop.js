// Owns the requestAnimationFrame loop. Registered callbacks are called each
// frame as update(delta), then the scene is rendered.
//
// Delta is clamped: after a pause, an alt-tab or a long level build, the first
// frame back reports the whole gap, and an unclamped delta that large
// teleports the player and every timed system through walls. Clamping simply
// makes that frame a slow one instead.
const MAX_DELTA = 0.1 // seconds

export function createLoop({ renderer, scene, camera, clock }) {
  const updateCallbacks = []

  function add(callback) {
    updateCallbacks.push(callback)
  }

  function tick(timestamp) {
    const delta = Math.min(clock.getDelta(timestamp), MAX_DELTA)
    for (const update of updateCallbacks) {
      update(delta)
    }
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }

  function start() {
    requestAnimationFrame(tick)
  }

  return { add, start }
}

// Owns the requestAnimationFrame loop. Registered callbacks are called each
// frame as update(delta), then the scene is rendered.
export function createLoop({ renderer, scene, camera, clock }) {
  const updateCallbacks = []

  function add(callback) {
    updateCallbacks.push(callback)
  }

  function tick(timestamp) {
    const delta = clock.getDelta(timestamp)
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

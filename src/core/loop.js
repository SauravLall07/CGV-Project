// Owns the requestAnimationFrame loop. Registered callbacks are called each
// frame as update(delta), then the scene is rendered (via EffectComposer if active).
export function createLoop({ renderer, composer, scene, camera, clock }) {
  const updateCallbacks = []

  function add(callback) {
    updateCallbacks.push(callback)
  }

  function tick(timestamp) {
    const delta = clock.getDelta(timestamp)
    for (const update of updateCallbacks) {
      update(delta)
    }
    if (composer && composer.passes && composer.passes.length > 0) {
      composer.render()
    } else {
      renderer.render(scene, camera)
    }
    requestAnimationFrame(tick)
  }

  function start() {
    requestAnimationFrame(tick)
  }

  return { add, start }
}

import * as THREE from 'three'

// Forward rendering evaluates every point light in the scene for every lit
// pixel, so a train full of lanterns and sconces costs frame rate everywhere.
// The pool keeps a fixed handful of real PointLights and, each frame, hands
// them to the placed lights nearest the viewer. The placed lights stay in the
// scene graph, hidden, as the source of truth: anything that animates their
// intensity or colour, or hides one of their parents, still works.
//
// The real-light count never changes, so no material ever recompiles. Lights
// near the edge of the selected set fade out rather than popping on and off.

const FADE_METRES = 3

export function createLightPool({ root, size = 12 }) {
  const sources = []
  root.traverse((node) => {
    if (!node.isPointLight) return
    node.visible = false
    sources.push({ light: node, distance: 0 })
  })

  const pool = []
  for (let i = 0; i < size; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 1, 2)
    light.name = `light-pool-${i}`
    root.add(light)
    pool.push(light)
  }

  const world = new THREE.Vector3()
  const local = new THREE.Vector3()

  // A source whose own ancestors are hidden (a collected pickup, say) is off.
  function ancestorsVisible(light) {
    for (let node = light.parent; node; node = node.parent) {
      if (!node.visible) return false
    }
    return true
  }

  function update(viewer) {
    const live = []
    for (const source of sources) {
      const { light } = source
      if (light.intensity <= 0 || !ancestorsVisible(light)) continue
      light.getWorldPosition(world)
      source.distance = world.distanceTo(viewer)
      live.push(source)
    }
    live.sort((a, b) => a.distance - b.distance)
    const cutoff = live.length > size ? live[size].distance : Infinity

    for (let i = 0; i < size; i++) {
      const target = pool[i]
      const source = live[i]
      if (!source) {
        target.intensity = 0
        continue
      }
      const { light } = source
      light.getWorldPosition(world)
      target.position.copy(target.parent ? target.parent.worldToLocal(local.copy(world)) : world)
      target.color.copy(light.color)
      target.distance = light.distance
      target.decay = light.decay
      const fade = cutoff === Infinity ? 1 : THREE.MathUtils.clamp((cutoff - source.distance) / FADE_METRES, 0, 1)
      target.intensity = light.intensity * fade
    }
  }

  return { update, sourceCount: sources.length }
}

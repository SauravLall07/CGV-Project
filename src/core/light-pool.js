import * as THREE from 'three'

// Forward rendering evaluates every point light in the scene for every lit
// pixel, so a station or a wreck full of lamps costs frame rate everywhere.
// The pool keeps a fixed handful of real lights and hands them to the placed
// lights nearest the viewer. The placed lights stay in the scene graph,
// hidden, as the source of truth: anything that animates their intensity or
// colour, or hides one of their parents, still works.
//
// Pool lights are created once and stay visible. An unused slot is intensity
// 0, never removed or hidden, because a changing visible-light count rebuilds
// every lit shader. Which sources own those slots is refreshed on a timer,
// when the viewer moves, or when a source switches on or off. Colour and
// intensity are copied from the assigned source every frame, so a pulsing
// lamp still animates between refreshes. The update path does not allocate.

// Boarding and Timewreck. Moving Heist passes its own size.
export const POINT_LIGHT_POOL_SIZE = 8
// Boarding guard torches only. The three mountain floods stay real lights.
export const TORCH_SPOT_POOL_SIZE = 4

const REASSIGN_SECONDS = 0.25
const REASSIGN_MOVE_SQ = 3 * 3
const FADE_METRES = 3

export function createLightPool({ root, roots, host, size = POINT_LIGHT_POOL_SIZE, accept, name = 'light-pool', kind = 'point' }) {
  const search = roots && roots.length ? roots : [root]
  const parent = host || root
  const wants = accept || ((node) => node.isPointLight)

  const sources = []
  for (const node of search) {
    if (!node) continue
    node.traverse((child) => {
      if (!wants(child) || child.userData.lightPoolSlot) return
      child.visible = false
      child.userData.lightPoolSource = true
      sources.push({ light: child, distance: Infinity, wasOn: child.intensity > 0 })
    })
  }

  const spotMode = kind === 'spot'
  const pool = []
  for (let i = 0; i < size; i++) {
    const light = spotMode
      ? new THREE.SpotLight(0xffffff, 0, 1, Math.PI / 4, 0, 2)
      : new THREE.PointLight(0xffffff, 0, 1, 2)
    light.name = `${name}-${i}`
    light.castShadow = false
    light.userData.lightPoolSlot = true
    if (spotMode) {
      const target = new THREE.Object3D()
      target.name = `${name}-target-${i}`
      parent.add(target)
      light.target = target
    }
    parent.add(light)
    pool.push(light)
  }

  const ranked = new Array(sources.length)
  const assigned = new Array(size)
  const slotFade = new Float64Array(size)
  const world = new THREE.Vector3()
  const local = new THREE.Vector3()
  const lastViewer = new THREE.Vector3()
  let since = 0
  let assignedOnce = false

  // A source whose own ancestors are hidden (a collected pickup, say) is off.
  // The source light itself stays hidden for the life of the pool.
  function ancestorsVisible(light) {
    for (let node = light.parent; node; node = node.parent) {
      if (!node.visible) return false
    }
    return true
  }

  // `lightPoolOff` lets a level park a source without touching its
  // intensity, which an animation may own.
  function sourceOn(source) {
    return source.light.intensity > 0 && !source.light.userData.lightPoolOff && ancestorsVisible(source.light)
  }

  function place(object, from) {
    from.getWorldPosition(world)
    if (object.parent) {
      local.copy(world)
      object.parent.worldToLocal(local)
      object.position.copy(local)
    } else {
      object.position.copy(world)
    }
  }

  function reassign(viewer) {
    let live = 0
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      const on = sourceOn(source)
      source.wasOn = on
      if (!on) continue
      source.light.getWorldPosition(world)
      const dx = world.x - viewer.x
      const dy = world.y - viewer.y
      const dz = world.z - viewer.z
      source.distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      ranked[live++] = source
    }
    for (let i = 1; i < live; i++) {
      const item = ranked[i]
      let j = i - 1
      while (j >= 0 && ranked[j].distance > item.distance) {
        ranked[j + 1] = ranked[j]
        j--
      }
      ranked[j + 1] = item
    }

    const cutoff = live > size ? ranked[size].distance : Infinity
    for (let i = 0; i < size; i++) {
      const source = i < live ? ranked[i] : null
      assigned[i] = source
      slotFade[i] = !source || cutoff === Infinity
        ? (source ? 1 : 0)
        : THREE.MathUtils.clamp((cutoff - source.distance) / FADE_METRES, 0, 1)
    }
  }

  function apply() {
    for (let i = 0; i < size; i++) {
      const slot = pool[i]
      const source = assigned[i]
      if (!source || !sourceOn(source)) {
        slot.intensity = 0
        continue
      }
      const light = source.light
      place(slot, light)
      slot.color.copy(light.color)
      slot.distance = light.distance
      slot.decay = light.decay
      if (slot.isSpotLight && light.target) {
        slot.angle = light.angle
        slot.penumbra = light.penumbra
        place(slot.target, light.target)
      }
      slot.intensity = light.intensity * slotFade[i]
    }
  }

  function update(viewer, delta = 0) {
    since += delta
    const dx = viewer.x - lastViewer.x
    const dy = viewer.y - lastViewer.y
    const dz = viewer.z - lastViewer.z
    let due = !assignedOnce || since >= REASSIGN_SECONDS || dx * dx + dy * dy + dz * dz >= REASSIGN_MOVE_SQ
    if (!due) {
      for (let i = 0; i < sources.length; i++) {
        const on = sourceOn(sources[i])
        if (on !== sources[i].wasOn) {
          due = true
          break
        }
      }
    }
    if (due) {
      reassign(viewer)
      since = 0
      lastViewer.copy(viewer)
      assignedOnce = true
    }
    apply()
  }

  return { update, sourceCount: sources.length, size }
}

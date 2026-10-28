// Registered hazards retain their world coordinates and history. Their visual
// counterparts retire only when Passenger's existing rear boundary closes.
export function createWreckRetirement(objects) {
  const nodes = [...new Set(objects.filter(Boolean))]
  const state = nodes.map(node => ({ node, visible: node.visible, off: node.userData.lightPoolOff }))
  const sources = []
  for (const node of nodes) node.traverse(child => {
    if (child.userData.lightPoolSource) sources.push({node:child,off:child.userData.lightPoolOff})
  })
  let active = false
  return {
    get active() { return active },
    apply(value) {
      if (!value && active) {
        for (const entry of state) { entry.node.visible = entry.visible; entry.node.userData.lightPoolOff = entry.off }
        for (const entry of sources) entry.node.userData.lightPoolOff = entry.off
      }
      active = value
      if (value) {
        for (const entry of state) { entry.node.visible = false; entry.node.userData.lightPoolOff = true }
        for (const entry of sources) entry.node.userData.lightPoolOff = true
      }
    }
  }
}

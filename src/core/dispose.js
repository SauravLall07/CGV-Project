// Recursive GPU-resource cleanup. The brief's memory-management warning is
// explicit that geometries, materials and textures must be released on level
// teardown or memory climbs across a full playthrough — the level manager
// calls disposeObject() on everything a level added before instantiating the
// next one.

export function disposeObject(root) {
  if (!root) return

  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()
  const nodes = new Set()

  function disposeTexture(value) {
    if (value?.isTexture && !textures.has(value)) {
      textures.add(value)
      value.dispose()
    } else if (Array.isArray(value)) {
      value.forEach(disposeTexture)
    }
  }

  function disposeMaterial(material) {
    if (!material || materials.has(material)) return
    materials.add(material)
    Object.values(material).forEach(disposeTexture)
    Object.values(material.uniforms ?? {}).forEach((uniform) => disposeTexture(uniform.value))
    material.dispose()
  }

  function disposeNode(node) {
    if (nodes.has(node)) return
    nodes.add(node)

    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry)
      node.geometry.dispose()
    }

    const material = node.material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)

    // WebGLObjects listens for this event to release instanceMatrix and
    // instanceColor GPU attributes owned by InstancedMesh.
    if (node.isInstancedMesh && typeof node.dispose === 'function') node.dispose()

    // DirectionalLight/PointLight/SpotLight own a shadow render target that
    // their own dispose() releases.
    if (node.isLight && typeof node.dispose === 'function') node.dispose()
  }

  // Accepting multiple roots lets a level deduplicate shared resources across
  // all of its scene branches in a single teardown pass.
  for (const object of Array.isArray(root) ? root : [root]) object?.traverse(disposeNode)
}

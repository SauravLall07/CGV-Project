// Recursive GPU-resource cleanup. The brief's memory-management warning is
// explicit that geometries, materials and textures must be released on level
// teardown or memory climbs across a full playthrough — the level manager
// calls disposeObject() on everything a level added before instantiating the
// next one.

function disposeMaterial(material) {
  // Any texture-typed property (map, normalMap, roughnessMap, ...) holds a
  // GPU resource of its own.
  for (const value of Object.values(material)) {
    if (value && value.isTexture) value.dispose()
  }
  material.dispose()
}

export function disposeObject(root) {
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose()

    const material = node.material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)

    // DirectionalLight/PointLight/SpotLight own a shadow render target that
    // their own dispose() releases.
    if (node.isLight && typeof node.dispose === 'function') node.dispose()
  })
}

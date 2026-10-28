import * as THREE from 'three'
import illustration from '../assets/textures/story/story-menu.jpg'
import { createMenuFilm } from '../shaders/menu-film.js'

export async function createTitleBackdrop({ renderer, keys = globalThis.window,
  loadImage = url => new THREE.ImageLoader().loadAsync(url), onRendererRestore = () => {} } = {}) {
  const texture = new THREE.Texture(await loadImage(illustration))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  texture.needsUpdate = true
  const { material, uniforms } = createMenuFilm(texture)
  const geometry = new THREE.PlaneGeometry(2, 2), mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  scene.add(mesh)
  const viewport = new THREE.Vector4(), size = new THREE.Vector2()
  let saved = null, disposed = false
  function show() {
    if (disposed || saved) return
    renderer.getViewport(viewport)
    saved = { ratio: renderer.getPixelRatio(), color: renderer.outputColorSpace,
      tone: renderer.toneMapping, exposure: renderer.toneMappingExposure, autoClear: renderer.autoClear }
    update(0)
  }
  function hide() {
    if (!saved) return
    renderer.setPixelRatio(saved.ratio); renderer.outputColorSpace = saved.color
    renderer.toneMapping = saved.tone; renderer.toneMappingExposure = saved.exposure
    renderer.autoClear = saved.autoClear; renderer.setViewport(viewport)
    saved = null; onRendererRestore()
  }
  function update(delta) {
    if (disposed || !saved) return
    const ratio = Math.min(keys.devicePixelRatio || 1, 2)
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    uniforms.uTime.value += Math.max(0, delta)
    renderer.getDrawingBufferSize(size); uniforms.uResolution.value.copy(size)
  }
  renderer.initTexture(texture); renderer.compile(scene, camera)
  return { scene, camera, material, uniforms, texture, geometry, show, hide, update,
    render() { if (!disposed && saved) { update(0); renderer.setRenderTarget(null); renderer.render(scene, camera) } },
    dispose() { if (disposed) return; hide(); disposed = true; scene.clear(); geometry.dispose(); material.dispose(); texture.dispose() }
  }
}

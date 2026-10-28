// Browser-only diagnostic harness, loaded by lvl3-browser-check.mjs; not a game entry point.
import * as THREE from 'three'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayerView } from '../src/cameras/player-view.js'
import { createRespawnSystem } from '../src/systems/respawn.js'
import { createHud } from '../src/ui/hud.js'
import { createPostProcessing } from '../src/core/postprocessing.js'
import { settings } from '../src/core/settings.js'
import { mountRenderOverlay } from '../src/dev/render-overlay.js'
import { createMinimap } from '../src/ui/minimap.js'

settings.set('renderQuality', 'high')
const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(1)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15
document.body.style.margin = '0'
document.body.append(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1800)
const player = createPlayer()
scene.add(player.mesh)
const hud = createHud()
const view = createPlayerView({ camera, domElement: renderer.domElement, player, hud })
view.setEnabled(false)
const time = createTimeSystem({ scene, player, hud })
const respawn = createRespawnSystem({ player, hud, timeSystem: time, camera: view })
const post = createPostProcessing(renderer)
const overlay = mountRenderOverlay(renderer, { player, playerView: view, post })
overlay.setBenchmarkActive(true)
document.getElementById('dev-render-overlay').style.visibility = 'hidden'
const interactions = new Map()
let level, fixed = null, running = false, frame = 0, last = performance.now()
const keys = {}
const samples = [], errors = []
const gpuSamples = []
let mainRender = {}
const render = renderer.render
renderer.render = function(scene, camera) {
  render.call(this, scene, camera)
  if (camera.isPerspectiveCamera) mainRender = { ...renderer.info.render }
}
const minimap = createMinimap({ scene, hudRoot: hud.minimapRoot, mainCamera: camera, player,
  getObstacles: () => level?.obstacles, getGuards: () => [], getLevelState: () => 'Timewreck',
  getCarriageVolumes: () => level?.getCarriageVolumes(), getVoids: () => level?.voids, getSupports: () => level?.supports })
minimap.setVisible(true)
const interaction = { register: (mesh, options) => { interactions.set(mesh.name, { mesh, options }); return () => interactions.delete(mesh.name) }, registerBlocker: () => () => {}, flashPrompt() {} }
function start(startCarriage = null) {
  level?.dispose()
  time.resetForLevel()
  level = createTimewreckLevel({ scene, player, camera: view, renderer, post, timeSystem: time, hud, respawn,
    interaction, startCarriage, debrisSeed: 12345, advance() { errors.push('advance') } })
  player.setPose(level.checkpoint.position, level.checkpoint.yaw)
  respawn.setCheckpoint(level.checkpoint.position, level.checkpoint.yaw, level.checkpoint)
  view.setYaw(Math.PI); view.setPitch(0.12); view.snap()
  view.update(0, player.mesh, scene, { stabilizeCollision: true })
  fixed = null; running = false
  level.update(0)
}
const stats = () => {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info')
  return { gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), viewport: [innerWidth, innerHeight],
    pixelRatio: renderer.getPixelRatio(), exposure: renderer.toneMappingExposure,
    resources: { ...renderer.info.memory, programs: renderer.info.programs.length },
    render: mainRender, samples: samples.splice(0), gpuSamples: gpuSamples.splice(0), gpuStatus: overlay.gpuStatus(), errors,
    player: player.mesh.position.toArray(), mode: time.getMode() }
}
window.review = { scene, renderer, camera, player, view, time, respawn, interactions, keys, stats, start,
  get level() { return level },
  run(value) { running = value },
  pose(x, y, z, mode = 'third', yaw = Math.PI, pitch = 0.12) {
    player.setPose(new THREE.Vector3(x, y, z), yaw); view.setMode(mode); view.setYaw(yaw); view.setPitch(pitch); view.snap()
    view.update(0, player.mesh, scene, { stabilizeCollision: true }); fixed = null
  },
  cameraAt(position, target) { fixed = { position, target } },
  resize(width, height, scale = 1) { renderer.setPixelRatio(scale); renderer.setSize(width, height); post.resize(); camera.aspect = width / height; camera.updateProjectionMatrix() }
}
start()
function animate(now) {
  requestAnimationFrame(animate)
  const interval = now - last; last = now
  const dt = Math.min(0.05, interval / 1000)
  overlay.beginFrame(now); overlay.beginUpdate()
  if (running) {
    time.update(dt); level.update(dt)
    player.update(dt, { keyboard: keys, cameraYaw: view.getYaw(), bounds: level.bounds, obstacles: level.obstacles,
      supports: level.supports, voids: level.voids, crouchPressed: keys.crouchPressed })
    keys.crouchPressed = false
    view.update(dt, player.mesh, scene, { crouching: player.isCrouching(), stabilizeCollision: true })
  }
  overlay.endUpdate(); overlay.beginDraw()
  if (fixed) { camera.position.fromArray(fixed.position); camera.lookAt(...fixed.target); camera.updateMatrixWorld() }
  renderer.info.reset()
  post.render(scene, camera, { antialias: true })
  minimap.render(renderer)
  overlay.endDraw(); overlay.update(dt)
  const sample = overlay.sampleFrame()
  gpuSamples.push(...overlay.takeGpuSamples())
  if (frame++ > 15 && sample) samples.push({ ...sample, calls: mainRender.calls, triangles: mainRender.triangles })
  overlay.endFrame()
}
requestAnimationFrame(animate)

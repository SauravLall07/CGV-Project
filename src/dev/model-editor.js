import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { createModelEditorUI } from './model-editor-ui.js'

const INTERNAL_FLAG = 'modelEditorInternal'
const DEG = 180 / Math.PI
const RAD = Math.PI / 180

function isInternal(object) {
  let current = object
  while (current) {
    if (current.userData?.[INTERNAL_FLAG]) return true
    current = current.parent
  }
  return false
}

function markInternal(object) {
  object.userData[INTERNAL_FLAG] = true
  return object
}

function geometryLabel(object) {
  if (!object.isMesh && !object.isInstancedMesh) return object.type
  const type = object.geometry?.type?.replace('Geometry', '') ?? 'Mesh'
  return object.isInstancedMesh ? `${type} instances` : type
}

function displayName(object) {
  if (object.name) return object.name
  if (object.isLight) return object.type
  if (object.isGroup) return 'Group'
  return geometryLabel(object)
}

function objectPath(object) {
  const path = []
  let current = object
  while (current && !current.isScene) {
    path.push(displayName(current))
    current = current.parent
  }
  return path.reverse().join(' / ')
}

function snapshotObject(object) {
  const data = {
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray(),
    visible: object.visible
  }
  if (object.isLight) {
    data.light = {
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      distance: 'distance' in object ? object.distance : undefined,
      decay: 'decay' in object ? object.decay : undefined,
      angle: object.isSpotLight ? object.angle : undefined,
      penumbra: object.isSpotLight ? object.penumbra : undefined
    }
  }
  return data
}

function sameNumber(a, b) {
  return Math.abs((a ?? 0) - (b ?? 0)) < 1e-7
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, i) => sameNumber(value, b[i]))
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false
  if (!arraysEqual(a.position, b.position)) return false
  if (!arraysEqual(a.rotation, b.rotation)) return false
  if (!arraysEqual(a.scale, b.scale)) return false
  if (a.visible !== b.visible) return false
  if (Boolean(a.light) !== Boolean(b.light)) return false
  if (a.light) {
    for (const key of ['color', 'intensity', 'distance', 'decay', 'angle', 'penumbra']) {
      if (key === 'color') {
        if (a.light[key] !== b.light[key]) return false
      } else if (!sameNumber(a.light[key], b.light[key])) return false
    }
  }
  return true
}

function sceneFingerprint(scene) {
  return scene.children
    .filter((child) => !isInternal(child))
    .map((child) => child.uuid)
    .join('|')
}

function buildTree(scene, objectMap) {
  objectMap.clear()

  function walk(object) {
    if (isInternal(object)) return null
    objectMap.set(object.uuid, object)
    const children = []
    for (const child of object.children) {
      const next = walk(child)
      if (next) children.push(next)
    }
    return {
      id: object.uuid,
      label: displayName(object),
      type: object.isLight ? 'light' : object.isGroup ? 'group' : object.isInstancedMesh ? 'instances' : object.isMesh ? 'mesh' : object.type.toLowerCase(),
      children
    }
  }

  return scene.children.map(walk).filter(Boolean)
}

function selectionData(object) {
  if (!object) return null
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  if (!box.isEmpty()) box.getSize(size)

  const data = {
    name: displayName(object),
    type: object.type,
    path: objectPath(object),
    visible: object.visible,
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.rotation.x * DEG, y: object.rotation.y * DEG, z: object.rotation.z * DEG },
    scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
    dimensions: { x: size.x, y: size.y, z: size.z }
  }

  if (object.isLight) {
    data.light = {
      kind: object.type,
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      distance: 'distance' in object ? object.distance : 0,
      decay: 'decay' in object ? object.decay : 0,
      angle: object.isSpotLight ? object.angle * DEG : 0,
      penumbra: object.isSpotLight ? object.penumbra : 0
    }
  }

  return data
}

export function createModelEditor({
  scene,
  camera,
  renderer,
  player,
  getObstacles = () => null,
  getContextLabel = () => 'Scene',
  canOpen = () => true,
  onOpen,
  onClose
}) {
  const domElement = renderer.domElement
  const orbit = new OrbitControls(camera, domElement)
  orbit.enabled = false
  orbit.enableDamping = true
  orbit.dampingFactor = 0.08
  orbit.screenSpacePanning = true
  orbit.minDistance = 0.25
  orbit.maxDistance = 260
  orbit.maxPolarAngle = Math.PI

  const transform = new TransformControls(camera, domElement)
  transform.setMode('translate')
  transform.setSpace('local')
  transform.setSize(0.78)
  const transformHelper = markInternal(transform.getHelper())
  scene.add(transformHelper)

  const grid = markInternal(new THREE.GridHelper(220, 220, 0x6f8095, 0x313b48))
  grid.material.transparent = true
  grid.material.opacity = 0.38
  grid.position.y = 0.005
  grid.visible = false
  scene.add(grid)

  const selectionBox = markInternal(new THREE.BoxHelper(new THREE.Object3D(), 0x66c7ff))
  selectionBox.material.depthTest = false
  selectionBox.material.transparent = true
  selectionBox.material.opacity = 0.95
  selectionBox.renderOrder = 999
  selectionBox.visible = false
  scene.add(selectionBox)

  const collisionGroup = markInternal(new THREE.Group())
  collisionGroup.name = 'model-editor-colliders'
  collisionGroup.visible = false
  scene.add(collisionGroup)

  const lightHelpers = []
  const objectMap = new Map()
  const initialSnapshots = new WeakMap()
  const changed = new Set()
  const wireframeOriginal = new Map()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pointerDown = new THREE.Vector2()

  let open = false
  let selected = null
  let mode = 'translate'
  let space = 'local'
  let justTransformed = false
  let lastFingerprint = ''
  let treeDirty = true
  let collisionDirty = true
  let options = {
    grid: true,
    bounds: true,
    lights: false,
    collisions: false,
    wireframe: false
  }

  const ui = createModelEditorUI({ onCommand: handleCommand })

  transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = open && !event.value
    if (!event.value) {
      justTransformed = true
      setTimeout(() => { justTransformed = false }, 0)
    }
  })

  transform.addEventListener('objectChange', () => {
    if (!selected) return
    markChanged(selected)
    refreshSelection()
  })

  function ensureInitial(object) {
    if (!initialSnapshots.has(object)) initialSnapshots.set(object, snapshotObject(object))
    return initialSnapshots.get(object)
  }

  function markChanged(object) {
    const initial = ensureInitial(object)
    const current = snapshotObject(object)
    if (snapshotsEqual(initial, current)) changed.delete(object.uuid)
    else changed.add(object.uuid)
    updateStatus()
  }

  function updateStatus(message = '') {
    if (message) {
      ui.setStatus(message)
      return
    }
    const liveCount = [...changed].filter((uuid) => objectMap.has(uuid)).length
    ui.setStatus(liveCount ? `${liveCount} runtime change${liveCount === 1 ? '' : 's'} pending export.` : 'No unsaved editor changes.')
  }

  function rebuildTree() {
    const tree = buildTree(scene, objectMap)
    ui.setTree(tree)
    treeDirty = false
    updateStatus()
  }

  function clearLightHelpers() {
    for (const helper of lightHelpers) {
      scene.remove(helper)
      helper.dispose?.()
    }
    lightHelpers.length = 0
  }

  function rebuildLightHelpers() {
    clearLightHelpers()
    if (!options.lights) return

    scene.traverse((object) => {
      if (isInternal(object) || !object.isLight) return
      let helper = null
      if (object.isPointLight) helper = new THREE.PointLightHelper(object, 0.22)
      else if (object.isSpotLight) helper = new THREE.SpotLightHelper(object)
      else if (object.isDirectionalLight) helper = new THREE.DirectionalLightHelper(object, 1)
      else if (object.isHemisphereLight) helper = new THREE.HemisphereLightHelper(object, 0.7)
      if (!helper) return
      markInternal(helper)
      scene.add(helper)
      lightHelpers.push(helper)
    })
  }

  function rebuildCollisionHelpers() {
    collisionGroup.traverse((object) => {
      if (object !== collisionGroup) object.geometry?.dispose?.()
    })
    collisionGroup.userData.material?.dispose?.()
    collisionGroup.clear()
    const obstacles = getObstacles?.() ?? []
    const material = new THREE.LineBasicMaterial({ color: 0xff7f50, transparent: true, opacity: 0.9, depthTest: false })
    collisionGroup.userData.material = material

    for (const box of obstacles) {
      if (![box.minX, box.maxX, box.minZ, box.maxZ].every(Number.isFinite)) continue
      const minY = Number.isFinite(box.minY) ? box.minY : 0
      const maxY = Number.isFinite(box.maxY) ? box.maxY : 3.2
      const width = Math.max(0.01, box.maxX - box.minX)
      const height = Math.max(0.01, maxY - minY)
      const depth = Math.max(0.01, box.maxZ - box.minZ)
      const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth))
      const wire = new THREE.LineSegments(geometry, material)
      markInternal(wire)
      wire.position.set((box.minX + box.maxX) / 2, (minY + maxY) / 2, (box.minZ + box.maxZ) / 2)
      wire.renderOrder = 998
      collisionGroup.add(wire)
    }
    collisionGroup.visible = options.collisions
    collisionDirty = false
  }

  function setWireframe(enabled) {
    options.wireframe = enabled
    if (enabled) {
      scene.traverse((object) => {
        if (isInternal(object) || !object.material) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (!material || !('wireframe' in material)) continue
          if (!wireframeOriginal.has(material.uuid)) wireframeOriginal.set(material.uuid, material.wireframe)
          material.wireframe = true
          material.needsUpdate = true
        }
      })
    } else {
      scene.traverse((object) => {
        if (!object.material) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (!material || !wireframeOriginal.has(material.uuid)) continue
          material.wireframe = wireframeOriginal.get(material.uuid)
          material.needsUpdate = true
        }
      })
      wireframeOriginal.clear()
    }
    ui.setToggle('wireframe', enabled)
  }

  function select(object) {
    if (!object || object === scene || isInternal(object)) {
      deselect()
      return
    }
    selected = object
    ensureInitial(object)
    transform.attach(object)
    ui.setSelectedId(object.uuid)
    refreshSelection()
  }

  function deselect() {
    selected = null
    transform.detach()
    selectionBox.visible = false
    ui.setSelectedId(null)
    ui.setSelection(null)
  }

  function refreshSelection() {
    if (!selected || !selected.parent) {
      if (selected) deselect()
      return
    }
    selected.updateMatrixWorld(true)
    if (options.bounds) {
      selectionBox.setFromObject(selected)
      selectionBox.visible = true
    } else selectionBox.visible = false
    ui.setSelection(selectionData(selected))
    for (const helper of lightHelpers) helper.update?.()
  }

  function focusSelected() {
    if (!selected) return
    selected.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(selected)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    if (box.isEmpty()) {
      selected.getWorldPosition(center)
      size.setScalar(2)
    } else {
      box.getCenter(center)
      box.getSize(size)
    }
    const radius = Math.max(size.length() * 0.55, 0.75)
    const direction = camera.position.clone().sub(orbit.target)
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.65, 1)
    direction.normalize()
    orbit.target.copy(center)
    camera.position.copy(center).addScaledVector(direction, radius * 2.2)
    camera.lookAt(center)
    orbit.update()
  }

  function resetSelected() {
    if (!selected) return
    const initial = ensureInitial(selected)
    selected.position.fromArray(initial.position)
    selected.rotation.set(...initial.rotation)
    selected.scale.fromArray(initial.scale)
    selected.visible = initial.visible
    if (selected.isLight && initial.light) {
      selected.color.set(initial.light.color)
      selected.intensity = initial.light.intensity
      if ('distance' in selected && initial.light.distance !== undefined) selected.distance = initial.light.distance
      if ('decay' in selected && initial.light.decay !== undefined) selected.decay = initial.light.decay
      if (selected.isSpotLight) {
        selected.angle = initial.light.angle
        selected.penumbra = initial.light.penumbra
      }
    }
    selected.updateMatrixWorld(true)
    markChanged(selected)
    refreshSelection()
  }

  function setTransformField({ group, axis, value }) {
    if (!selected || !['x', 'y', 'z'].includes(axis)) return
    ensureInitial(selected)
    if (group === 'position') selected.position[axis] = value
    else if (group === 'rotation') selected.rotation[axis] = value * RAD
    else if (group === 'scale') selected.scale[axis] = Math.abs(value) < 1e-5 ? 1e-5 : value
    else return
    selected.updateMatrixWorld(true)
    markChanged(selected)
    refreshSelection()
  }

  function setLightField({ property, value }) {
    if (!selected?.isLight) return
    ensureInitial(selected)
    if (property === 'color') selected.color.set(value)
    else if (property === 'intensity') selected.intensity = Math.max(0, value)
    else if (property === 'distance' && 'distance' in selected) selected.distance = Math.max(0, value)
    else if (property === 'decay' && 'decay' in selected) selected.decay = Math.max(0, value)
    else if (property === 'angle' && selected.isSpotLight) selected.angle = THREE.MathUtils.clamp(value * RAD, 0.001, Math.PI / 2)
    else if (property === 'penumbra' && selected.isSpotLight) selected.penumbra = THREE.MathUtils.clamp(value, 0, 1)
    else return
    markChanged(selected)
    refreshSelection()
  }

  function exportPayload() {
    const entries = []
    for (const uuid of changed) {
      const object = objectMap.get(uuid)
      if (!object || !object.parent) continue
      const current = snapshotObject(object)
      const entry = {
        name: displayName(object),
        type: object.type,
        uuid,
        path: objectPath(object),
        position: current.position.map((v) => Number(v.toFixed(6))),
        rotationRadians: current.rotation.map((v) => Number(v.toFixed(6))),
        rotationDegrees: current.rotation.map((v) => Number((v * DEG).toFixed(3))),
        scale: current.scale.map((v) => Number(v.toFixed(6))),
        visible: current.visible
      }
      if (current.light) entry.light = current.light
      entries.push(entry)
    }
    return {
      format: 'chrono-express-model-workshop/v1',
      level: getContextLabel?.() ?? 'Scene',
      generatedAt: new Date().toISOString(),
      note: 'These are runtime edits. Copy the values into the object constructors/configuration you want to make permanent.',
      changes: entries
    }
  }

  function exportJSON() {
    const payload = exportPayload()
    const text = `${JSON.stringify(payload, null, 2)}\n`
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeLevel = String(payload.level || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    link.href = url
    link.download = `model-workshop-${safeLevel || 'scene'}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    updateStatus(payload.changes.length ? `Exported ${payload.changes.length} change${payload.changes.length === 1 ? '' : 's'} to JSON.` : 'Nothing changed yet; exported an empty change set.')
  }

  async function copyJSON() {
    const payload = exportPayload()
    const text = JSON.stringify(payload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      updateStatus(`Copied ${payload.changes.length} change${payload.changes.length === 1 ? '' : 's'} to clipboard.`)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      updateStatus(ok ? 'Copied changes to clipboard.' : 'Clipboard copy was blocked; use EXPORT JSON instead.')
    }
  }

  function setMode(next) {
    if (!['translate', 'rotate', 'scale'].includes(next)) return
    mode = next
    transform.setMode(mode)
    ui.setMode(mode)
  }

  function toggleSpace() {
    space = space === 'local' ? 'world' : 'local'
    transform.setSpace(space)
    ui.setSpace(space)
  }

  function toggleOption(name) {
    if (!(name in options)) return
    const next = !options[name]
    if (name === 'wireframe') {
      setWireframe(next)
      return
    }
    options[name] = next
    ui.setToggle(name, next)
    if (name === 'grid') grid.visible = open && next
    if (name === 'bounds') refreshSelection()
    if (name === 'lights') rebuildLightHelpers()
    if (name === 'collisions') {
      collisionDirty = true
      if (next) rebuildCollisionHelpers()
      collisionGroup.visible = open && next
    }
  }

  function handleCommand(command, detail) {
    if (command === 'close') close()
    else if (command === 'refresh') { treeDirty = true; collisionDirty = true; rebuildTree(); if (options.collisions) rebuildCollisionHelpers() }
    else if (command === 'select') select(objectMap.get(detail.id))
    else if (command.startsWith('mode:')) setMode(command.slice(5))
    else if (command === 'space') toggleSpace()
    else if (command === 'focus') focusSelected()
    else if (command === 'reset') resetSelected()
    else if (command === 'deselect') deselect()
    else if (command === 'visible' && selected) { ensureInitial(selected); selected.visible = detail.value; markChanged(selected); refreshSelection() }
    else if (command === 'transform') setTransformField(detail)
    else if (command === 'light') setLightField(detail)
    else if (command.startsWith('toggle:')) toggleOption(command.slice(7))
    else if (command === 'export') exportJSON()
    else if (command === 'copy') copyJSON()
  }

  function onPointerDown(event) {
    if (!open || event.button !== 0) return
    pointerDown.set(event.clientX, event.clientY)
  }

  function onPointerUp(event) {
    if (!open || event.button !== 0 || justTransformed || transform.axis) return
    const dx = event.clientX - pointerDown.x
    const dy = event.clientY - pointerDown.y
    if (dx * dx + dy * dy > 16) return

    const rect = domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(scene.children, true)
    const hit = hits.find(({ object }) => !isInternal(object) && object !== camera)
    if (hit) select(hit.object)
    else deselect()
  }

  function onKeyDown(event) {
    if (event.code === 'F2') {
      event.preventDefault()
      if (open) close()
      else openEditor()
      return
    }
    if (!open) return
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

    if (event.code === 'KeyW') setMode('translate')
    else if (event.code === 'KeyE') setMode('rotate')
    else if (event.code === 'KeyR') setMode('scale')
    else if (event.code === 'KeyF') focusSelected()
    else if (event.code === 'Escape') deselect()
    else return
    event.preventDefault()
  }

  function openEditor() {
    if (open) return true
    if (!canOpen?.()) return false

    const fingerprint = sceneFingerprint(scene)
    if (fingerprint !== lastFingerprint) {
      changed.clear()
      objectMap.clear()
      lastFingerprint = fingerprint
    }

    open = true
    orbit.enabled = true
    grid.visible = options.grid
    collisionGroup.visible = options.collisions
    ui.show()
    rebuildTree()
    if (options.lights) rebuildLightHelpers()
    if (options.collisions && collisionDirty) rebuildCollisionHelpers()

    const target = player?.mesh?.position
      ? player.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0))
      : new THREE.Vector3()
    orbit.target.copy(target)
    orbit.update()
    onOpen?.()
    updateStatus()
    return true
  }

  function close() {
    if (!open) return
    open = false
    orbit.enabled = false
    transform.detach()
    selectionBox.visible = false
    grid.visible = false
    collisionGroup.visible = false
    clearLightHelpers()
    if (options.wireframe) setWireframe(false)
    ui.hide()
    onClose?.()
  }

  function update() {
    if (!open) return
    orbit.update()
    if (selected) refreshSelection()
    for (const helper of lightHelpers) helper.update?.()
  }

  function dispose() {
    close()
    window.removeEventListener('keydown', onKeyDown, true)
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointerup', onPointerUp)
    clearLightHelpers()
    collisionGroup.traverse((object) => object.geometry?.dispose?.())
    collisionGroup.userData.material?.dispose?.()
    scene.remove(transformHelper, grid, selectionBox, collisionGroup)
    selectionBox.geometry?.dispose?.()
    selectionBox.material?.dispose?.()
    orbit.dispose()
    transform.dispose()
    ui.dispose()
  }

  window.addEventListener('keydown', onKeyDown, true)
  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointerup', onPointerUp)

  return {
    open: openEditor,
    close,
    update,
    dispose,
    refresh: rebuildTree,
    isOpen: () => open,
    getSelected: () => selected,
    getChangeCount: () => [...changed].filter((uuid) => objectMap.has(uuid)).length,
    exportChanges: exportPayload
  }
}

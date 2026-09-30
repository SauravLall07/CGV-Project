import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { createModelEditorUI } from './model-editor-ui.js'

const INTERNAL_FLAG = 'modelEditorInternal'
const WORKSPACE_FORMAT = 'chrono-express-model-workshop/v2'
const WORKSPACE_ROUTE = '/__model-workshop/layout'
const LOCAL_STORAGE_KEY = 'chrono-express:model-workshop:v2'
const DEG = 180 / Math.PI
const RAD = Math.PI / 180

function emptyWorkspace() {
  return { format: WORKSPACE_FORMAT, contexts: {} }
}

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

function stableSegment(object) {
  const siblings = object.parent?.children?.filter((child) => !isInternal(child)) ?? [object]
  const hasName = Boolean(object.name)
  const identity = (candidate) => hasName
    ? candidate.name === object.name && candidate.type === object.type
    : !candidate.name && candidate.type === object.type
  let ordinal = 0
  for (const sibling of siblings) {
    if (sibling === object) break
    if (identity(sibling)) ordinal += 1
  }
  const token = hasName ? `name:${encodeURIComponent(object.name)}|${object.type}` : `type:${object.type}`
  return `${token}@${ordinal}`
}

function materialArray(object) {
  if (!object?.material) return []
  return Array.isArray(object.material) ? object.material : [object.material]
}

function materialSnapshot(material) {
  if (!material) return null
  const data = {
    type: material.type,
    opacity: Number.isFinite(material.opacity) ? material.opacity : undefined,
    transparent: 'transparent' in material ? Boolean(material.transparent) : undefined,
    side: Number.isFinite(material.side) ? material.side : undefined
  }
  if (material.color?.isColor) data.color = `#${material.color.getHexString()}`
  if (material.emissive?.isColor) data.emissive = `#${material.emissive.getHexString()}`
  if (Number.isFinite(material.emissiveIntensity)) data.emissiveIntensity = material.emissiveIntensity
  if (Number.isFinite(material.roughness)) data.roughness = material.roughness
  if (Number.isFinite(material.metalness)) data.metalness = material.metalness
  return data
}

function snapshotObject(object) {
  const data = {
    name: object.name ?? '',
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
  const materials = materialArray(object).map(materialSnapshot).filter(Boolean)
  if (materials.length) data.materials = materials
  return data
}

function sameNumber(a, b) {
  if (a === undefined && b === undefined) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b
  return Math.abs(a - b) < 1e-7
}

function arraysEqual(a = [], b = []) {
  return a.length === b.length && a.every((value, i) => sameNumber(value, b[i]))
}

function materialSnapshotsEqual(a = [], b = []) {
  if (a.length !== b.length) return false
  const keys = ['type', 'color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'opacity', 'transparent', 'side']
  return a.every((material, index) => keys.every((key) => {
    const left = material?.[key]
    const right = b[index]?.[key]
    return typeof left === 'number' || typeof right === 'number' ? sameNumber(left, right) : left === right
  }))
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false
  if (a.name !== b.name) return false
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
  return materialSnapshotsEqual(a.materials, b.materials)
}

function applyMaterialSnapshot(material, state) {
  if (!material || !state) return
  if (state.color !== undefined && material.color?.isColor) material.color.set(state.color)
  if (state.emissive !== undefined && material.emissive?.isColor) material.emissive.set(state.emissive)
  if (state.emissiveIntensity !== undefined && 'emissiveIntensity' in material) material.emissiveIntensity = Math.max(0, state.emissiveIntensity)
  if (state.roughness !== undefined && 'roughness' in material) material.roughness = THREE.MathUtils.clamp(state.roughness, 0, 1)
  if (state.metalness !== undefined && 'metalness' in material) material.metalness = THREE.MathUtils.clamp(state.metalness, 0, 1)
  if (state.opacity !== undefined && 'opacity' in material) material.opacity = THREE.MathUtils.clamp(state.opacity, 0, 1)
  if (state.transparent !== undefined && 'transparent' in material) material.transparent = Boolean(state.transparent)
  if (state.side !== undefined && 'side' in material) material.side = Number(state.side)
  material.needsUpdate = true
}

function sceneFingerprint(scene) {
  return scene.children
    .filter((child) => !isInternal(child))
    .map((child) => child.uuid)
    .join('|')
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
  let objectMap = new Map()
  let keyMap = new Map()
  let sourceByKey = new Map()
  let sourceSnapshots = new WeakMap()
  let savedSnapshots = new WeakMap()
  let stableKeyCache = new WeakMap()
  let localizedMaterials = new WeakSet()
  const changed = new Set()
  const dirty = new Set()
  const wireframeOriginal = new Map()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pointerDown = new THREE.Vector2()

  let workspace = emptyWorkspace()
  let workspaceLoaded = false
  let workspaceLoadPromise = null
  let workspaceMetaDirty = false
  let workspaceSource = 'loading'
  let open = false
  let selected = null
  let selectedMaterialSlot = 0
  let mode = 'translate'
  let space = 'local'
  let snapEnabled = false
  let justTransformed = false
  let lastFingerprint = ''
  let collisionDirty = true
  let isolationVisibility = null
  let options = {
    grid: true,
    bounds: true,
    lights: false,
    collisions: false,
    wireframe: false
  }

  const ui = createModelEditorUI({ onCommand: handleCommand })

  function contextName() {
    return String(getContextLabel?.() ?? 'Scene') || 'Scene'
  }

  function contextWorkspace(create = false) {
    const name = contextName()
    let context = workspace.contexts?.[name]
    if (!context && create) {
      context = { objects: {}, views: [] }
      workspace.contexts[name] = context
    }
    if (context && !context.objects) context.objects = {}
    if (context && !Array.isArray(context.views)) context.views = []
    return context ?? null
  }

  function stableKey(object) {
    if (stableKeyCache.has(object)) return stableKeyCache.get(object)
    const parts = []
    let current = object
    while (current && !current.isScene) {
      parts.push(stableSegment(current))
      current = current.parent
    }
    const key = parts.reverse().join('/')
    stableKeyCache.set(object, key)
    return key
  }

  function buildTree() {
    objectMap.clear()
    keyMap.clear()

    function walk(object) {
      if (isInternal(object)) return null
      const key = stableKey(object)
      objectMap.set(object.uuid, object)
      keyMap.set(key, object)
      const children = []
      for (const child of object.children) {
        const next = walk(child)
        if (next) children.push(next)
      }
      return {
        id: object.uuid,
        key,
        label: displayName(object),
        type: object.isLight ? 'light' : object.isGroup ? 'group' : object.isInstancedMesh ? 'instances' : object.isMesh ? 'mesh' : object.type.toLowerCase(),
        changed: changed.has(object.uuid),
        children
      }
    }

    return scene.children.map(walk).filter(Boolean)
  }

  function rebuildTree() {
    ui.setTree(buildTree())
    updateStatus()
  }

  function ensureSource(object) {
    if (sourceSnapshots.has(object)) return sourceSnapshots.get(object)
    const snapshot = snapshotObject(object)
    const key = stableKey(object)
    sourceSnapshots.set(object, snapshot)
    sourceByKey.set(key, snapshot)
    return snapshot
  }

  function ensureSaved(object) {
    if (!savedSnapshots.has(object)) savedSnapshots.set(object, snapshotObject(object))
    return savedSnapshots.get(object)
  }

  function markChanged(object) {
    const source = ensureSource(object)
    const saved = ensureSaved(object)
    const current = snapshotObject(object)
    if (snapshotsEqual(source, current)) changed.delete(object.uuid)
    else changed.add(object.uuid)
    if (snapshotsEqual(saved, current)) dirty.delete(object.uuid)
    else dirty.add(object.uuid)
    updateStatus()
  }

  function activeOverrideCount() {
    return [...changed].filter((uuid) => objectMap.has(uuid)).length
  }

  function dirtyCount() {
    return [...dirty].filter((uuid) => objectMap.has(uuid)).length
  }

  function updateStatus(message = '') {
    if (message) {
      ui.setStatus(message)
      return
    }
    if (!workspaceLoaded) {
      ui.setStatus('Loading Model Workshop workspace…')
      return
    }
    const unsaved = dirtyCount() + (workspaceMetaDirty ? 1 : 0)
    const active = activeOverrideCount()
    const source = workspaceSource === 'server' ? '.model-workshop/layout.json' : 'browser fallback'
    if (unsaved) {
      ui.setStatus(`${unsaved} unsaved editor change${unsaved === 1 ? '' : 's'} · ${active} active override${active === 1 ? '' : 's'} · save target: ${source}.`)
    } else if (active) {
      ui.setStatus(`${active} saved workspace override${active === 1 ? '' : 's'} active for ${contextName()} · ${source}.`)
    } else {
      ui.setStatus(`Workspace ready for ${contextName()} · no model overrides · ${source}.`)
    }
  }

  function ensureUniqueMaterials(object) {
    if (!object?.material || localizedMaterials.has(object)) return
    ensureSource(object)
    ensureSaved(object)
    const originals = materialArray(object)
    const clones = originals.map((material) => {
      const clone = material.clone()
      if (options.wireframe && 'wireframe' in clone) {
        const originalWireframe = wireframeOriginal.get(material.uuid) ?? material.wireframe
        clone.wireframe = originalWireframe
        wireframeOriginal.set(clone.uuid, originalWireframe)
        clone.wireframe = true
      }
      return clone
    })
    object.material = Array.isArray(object.material) ? clones : clones[0]
    localizedMaterials.add(object)
  }

  function restoreSnapshot(object, snapshot) {
    if (!object || !snapshot) return
    object.name = snapshot.name ?? ''
    object.position.fromArray(snapshot.position)
    object.rotation.set(...snapshot.rotation)
    object.scale.fromArray(snapshot.scale)
    object.visible = snapshot.visible
    if (object.isLight && snapshot.light) {
      object.color.set(snapshot.light.color)
      object.intensity = snapshot.light.intensity
      if ('distance' in object && snapshot.light.distance !== undefined) object.distance = snapshot.light.distance
      if ('decay' in object && snapshot.light.decay !== undefined) object.decay = snapshot.light.decay
      if (object.isSpotLight) {
        if (snapshot.light.angle !== undefined) object.angle = snapshot.light.angle
        if (snapshot.light.penumbra !== undefined) object.penumbra = snapshot.light.penumbra
      }
    }
    if (snapshot.materials?.length && object.material) {
      ensureUniqueMaterials(object)
      materialArray(object).forEach((material, index) => applyMaterialSnapshot(material, snapshot.materials[index]))
    }
    object.updateMatrixWorld(true)
  }

  function applyWorkspaceEntry(object, entry) {
    ensureSource(object)
    if (entry.name !== undefined) object.name = String(entry.name)
    if (Array.isArray(entry.position) && entry.position.length === 3) object.position.fromArray(entry.position)
    const rotation = entry.rotationRadians ?? entry.rotation
    if (Array.isArray(rotation) && rotation.length === 3) object.rotation.set(...rotation)
    if (Array.isArray(entry.scale) && entry.scale.length === 3) object.scale.fromArray(entry.scale)
    if (entry.visible !== undefined) object.visible = Boolean(entry.visible)
    if (object.isLight && entry.light) {
      if (entry.light.color !== undefined) object.color.set(entry.light.color)
      if (Number.isFinite(entry.light.intensity)) object.intensity = Math.max(0, entry.light.intensity)
      if ('distance' in object && Number.isFinite(entry.light.distance)) object.distance = Math.max(0, entry.light.distance)
      if ('decay' in object && Number.isFinite(entry.light.decay)) object.decay = Math.max(0, entry.light.decay)
      if (object.isSpotLight && Number.isFinite(entry.light.angle)) object.angle = THREE.MathUtils.clamp(entry.light.angle, 0.001, Math.PI / 2)
      if (object.isSpotLight && Number.isFinite(entry.light.penumbra)) object.penumbra = THREE.MathUtils.clamp(entry.light.penumbra, 0, 1)
    }
    if (entry.materials?.length && object.material) {
      ensureUniqueMaterials(object)
      materialArray(object).forEach((material, index) => applyMaterialSnapshot(material, entry.materials[index]))
    }
    object.updateMatrixWorld(true)
  }

  function applyWorkspaceToScene({ announce = false } = {}) {
    if (!workspaceLoaded) return
    buildTree()
    changed.clear()
    dirty.clear()
    workspaceMetaDirty = false
    const context = contextWorkspace(false)
    let matched = 0
    let unmatched = 0

    for (const [key, entry] of Object.entries(context?.objects ?? {})) {
      const object = keyMap.get(key)
      if (!object) {
        unmatched += 1
        continue
      }
      applyWorkspaceEntry(object, entry)
      savedSnapshots.set(object, snapshotObject(object))
      if (!snapshotsEqual(ensureSource(object), snapshotObject(object))) changed.add(object.uuid)
      matched += 1
    }

    ui.setViews(context?.views ?? [])
    ui.setTree(buildTree())
    if (selected && selected.parent) refreshSelection()
    if (announce) {
      updateStatus(unmatched
        ? `Loaded ${matched} saved override${matched === 1 ? '' : 's'} for ${contextName()}; ${unmatched} saved object${unmatched === 1 ? '' : 's'} no longer matched the scene.`
        : `Loaded ${matched} saved override${matched === 1 ? '' : 's'} for ${contextName()}.`)
    } else updateStatus()
  }

  async function fetchWorkspace() {
    const response = await fetch(WORKSPACE_ROUTE, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (data?.format !== WORKSPACE_FORMAT || typeof data.contexts !== 'object' || !data.contexts) throw new Error('Invalid workspace format')
    return data
  }

  function loadBrowserFallback() {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (!saved) return emptyWorkspace()
      const data = JSON.parse(saved)
      return data?.format === WORKSPACE_FORMAT && data.contexts ? data : emptyWorkspace()
    } catch {
      return emptyWorkspace()
    }
  }

  async function loadWorkspace({ force = false, announce = false } = {}) {
    if (workspaceLoadPromise && !force) return workspaceLoadPromise
    workspaceLoadPromise = (async () => {
      try {
        workspace = await fetchWorkspace()
        workspaceSource = 'server'
      } catch (error) {
        console.warn('Model Workshop: Vite save endpoint unavailable; using browser storage fallback.', error)
        workspace = loadBrowserFallback()
        workspaceSource = 'browser'
      }
      workspaceLoaded = true
      applyWorkspaceToScene({ announce })
      return workspace
    })()
    return workspaceLoadPromise
  }

  function serializeEntry(object) {
    const current = snapshotObject(object)
    const entry = {
      key: stableKey(object),
      sourcePath: objectPath(object),
      name: current.name,
      type: object.type,
      position: current.position.map((v) => Number(v.toFixed(6))),
      rotationRadians: current.rotation.map((v) => Number(v.toFixed(6))),
      rotationDegrees: current.rotation.map((v) => Number((v * DEG).toFixed(3))),
      scale: current.scale.map((v) => Number(v.toFixed(6))),
      visible: current.visible
    }
    if (current.light) entry.light = current.light
    if (current.materials) entry.materials = current.materials
    return entry
  }

  async function saveWorkspace() {
    await loadWorkspace()
    buildTree()
    const context = contextWorkspace(true)
    const matchedExisting = Object.keys(context.objects).filter((key) => keyMap.has(key))

    for (const key of matchedExisting) {
      const object = keyMap.get(key)
      if (!object || !changed.has(object.uuid)) delete context.objects[key]
    }
    for (const uuid of changed) {
      const object = objectMap.get(uuid)
      if (!object || !object.parent) continue
      context.objects[stableKey(object)] = serializeEntry(object)
    }

    workspace.updatedAt = new Date().toISOString()
    try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(workspace)) } catch {}

    try {
      const response = await fetch(WORKSPACE_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
      workspaceSource = 'server'
      for (const object of objectMap.values()) {
        if (sourceSnapshots.has(object) || changed.has(object.uuid)) savedSnapshots.set(object, snapshotObject(object))
      }
      dirty.clear()
      workspaceMetaDirty = false
      updateStatus(`Saved ${Object.keys(context.objects).length} ${contextName()} override${Object.keys(context.objects).length === 1 ? '' : 's'} to ${result.file ?? '.model-workshop/layout.json'}.`)
    } catch (error) {
      workspaceSource = 'browser'
      for (const object of objectMap.values()) {
        if (sourceSnapshots.has(object) || changed.has(object.uuid)) savedSnapshots.set(object, snapshotObject(object))
      }
      dirty.clear()
      workspaceMetaDirty = false
      updateStatus(`Vite file save failed (${error.message}); changes were kept in browser storage only.`)
    }
    ui.setTree(buildTree())
  }

  async function reloadWorkspace() {
    if ((dirtyCount() || workspaceMetaDirty) && !window.confirm('Discard unsaved Model Workshop edits and reload the saved workspace?')) return
    for (const [key, snapshot] of sourceByKey) {
      const object = keyMap.get(key)
      if (object) restoreSnapshot(object, snapshot)
    }
    changed.clear()
    dirty.clear()
    workspaceMetaDirty = false
    workspaceLoadPromise = null
    await loadWorkspace({ force: true, announce: true })
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
    collisionGroup.visible = open && options.collisions
    collisionDirty = false
  }

  function setWireframe(enabled) {
    options.wireframe = enabled
    if (enabled) {
      scene.traverse((object) => {
        if (isInternal(object) || !object.material) return
        for (const material of materialArray(object)) {
          if (!material || !('wireframe' in material)) continue
          if (!wireframeOriginal.has(material.uuid)) wireframeOriginal.set(material.uuid, material.wireframe)
          material.wireframe = true
          material.needsUpdate = true
        }
      })
    } else {
      scene.traverse((object) => {
        if (!object.material) return
        for (const material of materialArray(object)) {
          if (!material || !wireframeOriginal.has(material.uuid)) continue
          material.wireframe = wireframeOriginal.get(material.uuid)
          material.needsUpdate = true
        }
      })
      wireframeOriginal.clear()
    }
    ui.setToggle('wireframe', enabled)
  }

  function materialSelectionData(object) {
    const materials = materialArray(object)
    if (!materials.length) return null
    selectedMaterialSlot = THREE.MathUtils.clamp(selectedMaterialSlot, 0, materials.length - 1)
    const state = materialSnapshot(materials[selectedMaterialSlot])
    return state ? { ...state, count: materials.length, slot: selectedMaterialSlot } : null
  }

  function selectionData(object) {
    if (!object) return null
    object.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object)
    const size = new THREE.Vector3()
    if (!box.isEmpty()) box.getSize(size)

    const data = {
      name: displayName(object),
      rawName: object.name ?? '',
      key: stableKey(object),
      type: object.type,
      path: objectPath(object),
      visible: object.visible,
      hasEditableParent: Boolean(object.parent && !object.parent.isScene && !isInternal(object.parent)),
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotation: { x: object.rotation.x * DEG, y: object.rotation.y * DEG, z: object.rotation.z * DEG },
      scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
      dimensions: { x: size.x, y: size.y, z: size.z },
      material: materialSelectionData(object)
    }

    if (object.isLight) {
      data.light = {
        kind: object.type,
        color: `#${object.color.getHexString()}`,
        intensity: object.intensity,
        distance: 'distance' in object ? object.distance : undefined,
        decay: 'decay' in object ? object.decay : undefined,
        angle: object.isSpotLight ? object.angle * DEG : undefined,
        penumbra: object.isSpotLight ? object.penumbra : undefined
      }
    }
    return data
  }

  function select(object) {
    if (!object || object === scene || isInternal(object)) {
      deselect()
      return
    }
    if (isolationVisibility && selected !== object) restoreIsolation()
    selected = object
    selectedMaterialSlot = 0
    stableKey(object)
    ensureSource(object)
    ensureSaved(object)
    transform.attach(object)
    ui.setSelectedId(object.uuid)
    refreshSelection()
  }

  function deselect() {
    if (isolationVisibility) restoreIsolation()
    selected = null
    selectedMaterialSlot = 0
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

  function selectParent() {
    if (!selected?.parent || selected.parent.isScene || isInternal(selected.parent)) return
    select(selected.parent)
  }

  function restoreIsolation() {
    if (!isolationVisibility) return
    for (const [object, visible] of isolationVisibility) {
      if (object.parent || object.isScene) object.visible = visible
    }
    isolationVisibility = null
    ui.setIsolation(false)
  }

  function toggleIsolation() {
    if (isolationVisibility) {
      restoreIsolation()
      return
    }
    if (!selected) return
    isolationVisibility = new Map()
    const keep = new Set()
    let current = selected
    while (current) {
      keep.add(current)
      current = current.parent
    }
    selected.traverse((object) => keep.add(object))

    scene.traverse((object) => {
      if (object === scene || isInternal(object) || object.isLight || object.isCamera || keep.has(object)) return
      isolationVisibility.set(object, object.visible)
      object.visible = false
    })
    ui.setIsolation(true)
  }

  function resetSelected() {
    if (!selected) return
    const source = ensureSource(selected)
    restoreSnapshot(selected, source)
    markChanged(selected)
    rebuildTree()
    refreshSelection()
  }

  function revertSelected() {
    if (!selected) return
    const saved = ensureSaved(selected)
    restoreSnapshot(selected, saved)
    markChanged(selected)
    rebuildTree()
    refreshSelection()
  }

  function setName(value) {
    if (!selected) return
    ensureSource(selected)
    ensureSaved(selected)
    selected.name = String(value ?? '').slice(0, 80)
    markChanged(selected)
    rebuildTree()
    refreshSelection()
  }

  function setTransformField({ group, axis, value }) {
    if (!selected || !['x', 'y', 'z'].includes(axis)) return
    ensureSource(selected)
    ensureSaved(selected)
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
    ensureSource(selected)
    ensureSaved(selected)
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

  function setMaterialSlot(slot) {
    if (!selected) return
    const count = materialArray(selected).length
    selectedMaterialSlot = count ? THREE.MathUtils.clamp(slot, 0, count - 1) : 0
    refreshSelection()
  }

  function setMaterialField({ property, value }) {
    if (!selected?.material) return
    ensureSource(selected)
    ensureSaved(selected)
    ensureUniqueMaterials(selected)
    const materials = materialArray(selected)
    selectedMaterialSlot = THREE.MathUtils.clamp(selectedMaterialSlot, 0, Math.max(0, materials.length - 1))
    const material = materials[selectedMaterialSlot]
    if (!material) return

    if (property === 'color' && material.color?.isColor) material.color.set(value)
    else if (property === 'emissive' && material.emissive?.isColor) material.emissive.set(value)
    else if (property === 'emissiveIntensity' && 'emissiveIntensity' in material) material.emissiveIntensity = Math.max(0, Number(value))
    else if (property === 'roughness' && 'roughness' in material) material.roughness = THREE.MathUtils.clamp(Number(value), 0, 1)
    else if (property === 'metalness' && 'metalness' in material) material.metalness = THREE.MathUtils.clamp(Number(value), 0, 1)
    else if (property === 'opacity' && 'opacity' in material) material.opacity = THREE.MathUtils.clamp(Number(value), 0, 1)
    else if (property === 'transparent' && 'transparent' in material) material.transparent = Boolean(value)
    else if (property === 'side' && 'side' in material) material.side = THREE.MathUtils.clamp(Number(value), THREE.FrontSide, THREE.DoubleSide)
    else return
    material.needsUpdate = true
    markChanged(selected)
    refreshSelection()
  }

  function currentViews() {
    return contextWorkspace(false)?.views ?? []
  }

  function saveCameraView(name) {
    const context = contextWorkspace(true)
    const trimmed = String(name ?? '').trim()
    const view = {
      id: globalThis.crypto?.randomUUID?.() ?? `view-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: trimmed || `View ${context.views.length + 1}`,
      position: camera.position.toArray().map((v) => Number(v.toFixed(6))),
      target: orbit.target.toArray().map((v) => Number(v.toFixed(6))),
      up: camera.up.toArray().map((v) => Number(v.toFixed(6)))
    }
    context.views.push(view)
    workspaceMetaDirty = true
    ui.setViews(context.views)
    updateStatus(`Saved camera bookmark “${view.name}” in memory. Use SAVE WORKSPACE to keep it after reload.`)
  }

  function goCameraView(id) {
    const view = currentViews().find((item) => item.id === id)
    if (!view) return
    if (Array.isArray(view.position)) camera.position.fromArray(view.position)
    if (Array.isArray(view.target)) orbit.target.fromArray(view.target)
    if (Array.isArray(view.up)) camera.up.fromArray(view.up)
    camera.lookAt(orbit.target)
    orbit.update()
  }

  function deleteCameraView(id) {
    const context = contextWorkspace(false)
    if (!context) return
    const index = context.views.findIndex((item) => item.id === id)
    if (index < 0) return
    const [removed] = context.views.splice(index, 1)
    workspaceMetaDirty = true
    ui.setViews(context.views)
    updateStatus(`Removed camera bookmark “${removed.name}” in memory. Save the workspace to make that permanent.`)
  }

  function exportPayload() {
    buildTree()
    const entries = []
    for (const uuid of changed) {
      const object = objectMap.get(uuid)
      if (!object || !object.parent) continue
      entries.push(serializeEntry(object))
    }
    return {
      format: WORKSPACE_FORMAT,
      level: contextName(),
      generatedAt: new Date().toISOString(),
      note: 'Model Workshop overrides are development data. Static transforms/materials can be copied into source; collision-owned or animated objects still need their gameplay configuration updated.',
      changes: entries,
      views: currentViews()
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
    updateStatus(payload.changes.length ? `Exported ${payload.changes.length} active override${payload.changes.length === 1 ? '' : 's'} to JSON.` : 'No object overrides; exported the current camera bookmarks only.')
  }

  async function copyJSON() {
    const payload = exportPayload()
    const text = JSON.stringify(payload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      updateStatus(`Copied ${payload.changes.length} active override${payload.changes.length === 1 ? '' : 's'} to clipboard.`)
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

  function toggleSnap() {
    snapEnabled = !snapEnabled
    transform.setTranslationSnap(snapEnabled ? 0.25 : null)
    transform.setRotationSnap(snapEnabled ? 15 * RAD : null)
    transform.setScaleSnap(snapEnabled ? 0.1 : null)
    ui.setSnap(snapEnabled)
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

  function handleCommand(command, detail = {}) {
    if (command === 'close') close()
    else if (command === 'refresh') { rebuildTree(); collisionDirty = true; if (options.collisions) rebuildCollisionHelpers() }
    else if (command === 'select') select(objectMap.get(detail.id))
    else if (command.startsWith('mode:')) setMode(command.slice(5))
    else if (command === 'space') toggleSpace()
    else if (command === 'snap') toggleSnap()
    else if (command === 'focus') focusSelected()
    else if (command === 'parent') selectParent()
    else if (command === 'isolate') toggleIsolation()
    else if (command === 'reset') resetSelected()
    else if (command === 'revert') revertSelected()
    else if (command === 'deselect') deselect()
    else if (command === 'name') setName(detail.value)
    else if (command === 'visible' && selected) { ensureSource(selected); ensureSaved(selected); selected.visible = detail.value; markChanged(selected); refreshSelection() }
    else if (command === 'transform') setTransformField(detail)
    else if (command === 'light') setLightField(detail)
    else if (command === 'material-slot') setMaterialSlot(detail.slot)
    else if (command === 'material') setMaterialField(detail)
    else if (command.startsWith('toggle:')) toggleOption(command.slice(7))
    else if (command === 'workspace:save') saveWorkspace()
    else if (command === 'workspace:reload') reloadWorkspace()
    else if (command === 'view:save') saveCameraView(detail.name)
    else if (command === 'view:go') goCameraView(detail.id)
    else if (command === 'view:delete') deleteCameraView(detail.id)
    else if (command === 'export') exportJSON()
    else if (command === 'copy') copyJSON()
  }

  transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = open && !event.value
    if (!event.value) {
      justTransformed = true
      setTimeout(() => { justTransformed = false }, 0)
    }
  })

  transform.addEventListener('objectChange', () => {
    if (!selected) return
    ensureSource(selected)
    ensureSaved(selected)
    markChanged(selected)
    refreshSelection()
  })

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

  function resetSceneTracking() {
    if (isolationVisibility) restoreIsolation()
    if (selected) {
      transform.detach()
      selected = null
      ui.setSelectedId(null)
      ui.setSelection(null)
    }
    objectMap = new Map()
    keyMap = new Map()
    sourceByKey = new Map()
    sourceSnapshots = new WeakMap()
    savedSnapshots = new WeakMap()
    stableKeyCache = new WeakMap()
    localizedMaterials = new WeakSet()
    changed.clear()
    dirty.clear()
    workspaceMetaDirty = false
    collisionDirty = true
    lastFingerprint = sceneFingerprint(scene)
  }

  function sceneChanged() {
    resetSceneTracking()
    buildTree()
    if (workspaceLoaded) applyWorkspaceToScene()
    else loadWorkspace().catch((error) => console.warn('Model Workshop workspace load failed.', error))
  }

  function openEditor() {
    if (open) return true
    if (!canOpen?.()) return false

    const fingerprint = sceneFingerprint(scene)
    if (fingerprint !== lastFingerprint) sceneChanged()

    open = true
    orbit.enabled = true
    grid.visible = options.grid
    collisionGroup.visible = options.collisions
    ui.show()
    rebuildTree()
    ui.setViews(currentViews())
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
    if (isolationVisibility) restoreIsolation()
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

  lastFingerprint = sceneFingerprint(scene)
  buildTree()
  loadWorkspace().catch((error) => {
    console.warn('Model Workshop: workspace initialization failed.', error)
    workspaceLoaded = true
    workspaceSource = 'browser'
    workspace = emptyWorkspace()
    updateStatus('Workspace could not be loaded; editor remains usable with manual JSON export.')
  })

  return {
    open: openEditor,
    close,
    update,
    dispose,
    refresh: rebuildTree,
    sceneChanged,
    saveWorkspace,
    reloadWorkspace,
    isOpen: () => open,
    getSelected: () => selected,
    getChangeCount: activeOverrideCount,
    getDirtyCount: dirtyCount,
    exportChanges: exportPayload
  }
}

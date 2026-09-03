import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Asset loading pipeline (Phase 1 foundation): one shared THREE.LoadingManager
// feeding a GLTFLoader, with Draco decompression available on demand, plus
// progress callbacks the loading screen subscribes to. Nothing loads models
// yet — this is the plumbing every later phase's assets go through.
//
// DRACOLoader is imported lazily on the first model load, not at module top:
// it pulls in a ~1.5 MB decoder, and importing it eagerly makes Vite emit
// that decoder up front even while no model uses it. Lazy-importing keeps it
// in its own async chunk. DRACOLoader's built-in decoder path (a
// `new URL(..., import.meta.url)` that Vite fingerprints and rewrites) is
// left as-is: it resolves relative to the bundle, so it is deploy-safe from
// a subdirectory (matches vite base: './') with no external dependency.

export function createAssetLoader() {
  const manager = new THREE.LoadingManager()
  const gltf = new GLTFLoader(manager)

  let draco = null
  let dracoWiring = null

  function ensureDraco() {
    if (draco) return Promise.resolve()
    if (!dracoWiring) {
      dracoWiring = import('three/examples/jsm/loaders/DRACOLoader.js').then(({ DRACOLoader }) => {
        draco = new DRACOLoader(manager)
        gltf.setDRACOLoader(draco)
      })
    }
    return dracoWiring
  }

  // Subscriber lists so multiple consumers (loading screen now, telemetry
  // later) can react without fighting over manager.onX slots.
  const progressListeners = new Set()
  const loadListeners = new Set()
  const errorListeners = new Set()

  manager.onProgress = (url, loaded, total) => {
    for (const fn of progressListeners) fn(total > 0 ? loaded / total : 1, { url, loaded, total })
  }
  manager.onLoad = () => {
    for (const fn of loadListeners) fn()
  }
  manager.onError = (url) => {
    console.error(`[assets] failed to load ${url}`)
    for (const fn of errorListeners) fn(url)
  }

  function subscribe(set, fn) {
    set.add(fn)
    return () => set.delete(fn)
  }

  async function loadModel(url) {
    await ensureDraco()
    return new Promise((resolve, reject) => {
      gltf.load(url, resolve, undefined, reject)
    })
  }

  function dispose() {
    if (draco) draco.dispose()
    progressListeners.clear()
    loadListeners.clear()
    errorListeners.clear()
  }

  return {
    manager,
    loadModel,
    onProgress: (fn) => subscribe(progressListeners, fn),
    onLoad: (fn) => subscribe(loadListeners, fn),
    onError: (fn) => subscribe(errorListeners, fn),
    dispose
  }
}

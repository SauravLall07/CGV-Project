import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

// Asset loading pipeline (Phase 1 foundation): one shared THREE.LoadingManager
// feeding GLTFLoader and FBXLoader, with Draco decompression available on
// demand, plus progress callbacks the loading screen subscribes to.
//
// DRACOLoader is wired lazily for callers that may need compression support.
// Its JS stays in an async chunk; known uncompressed callers can skip wiring.
// Decoder scripts/WASM are still emitted via the loader's built-in new URL
// references, which Vite rewrites for the relative deployment base. Wiring
// alone does not fetch those decoder payloads; decoding/preload does that.

export function createAssetLoader() {
  const manager = new THREE.LoadingManager()
  const gltf = new GLTFLoader(manager)
  const fbx = new FBXLoader(manager)

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

  // Known uncompressed assets can skip optional decoder-module wiring. Default
  // behavior retains Draco support for existing/future callers.
  async function loadModel(url, { draco: useDraco = true } = {}) {
    if (useDraco) await ensureDraco()
    return new Promise((resolve, reject) => {
      gltf.load(url, resolve, undefined, reject)
    })
  }

  function loadFbx(url) {
    return new Promise((resolve, reject) => {
      fbx.load(url, resolve, undefined, reject)
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
    loadFbx,
    onProgress: (fn) => subscribe(progressListeners, fn),
    onLoad: (fn) => subscribe(loadListeners, fn),
    onError: (fn) => subscribe(errorListeners, fn),
    dispose
  }
}

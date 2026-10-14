import { register } from 'node:module'

// Loaded by npm test only; Vite continues to handle production asset imports.
register('./node-asset-loader.mjs', import.meta.url)

// passage-exterior builds procedural materials during module evaluation,
// before time-puzzles can install its own canvas stub. These tests exercise
// real geometry/simulation, not raster output; provide only canvas drawing.
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`Unsupported test DOM element: ${tag}`)
    const pixels = (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })
    const context = new Proxy({
      createImageData: pixels,
      getImageData: (_x, _y, width, height) => pixels(width, height),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: (text) => ({ width: String(text).length * 8 })
    }, { get: (target, key) => target[key] ?? (() => {}) })
    return { getContext: () => context }
  }
}

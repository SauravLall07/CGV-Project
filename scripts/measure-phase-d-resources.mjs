// Resource identity and fake-I/O concurrency probe, not browser memory/FPS.
// Run with: node --import ./scripts/register-test-assets.mjs scripts/measure-phase-d-resources.mjs
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { kitTexture } from '../src/environment/level1-kit/kit-textures.js'
import { getKitMaterials, resetKitMaterials } from '../src/environment/level1-kit/kit-materials.js'
import { initAudio } from '../src/core/audio.js'
import { LevelMusicPlayer } from '../src/systems/level-music.js'

function textureInventory() {
  const repeated = Array.from({ length: 100 }, () => kitTexture('phase-d-probe', () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; return canvas
  }))
  const repeatedSources = new Set(repeated.map(texture => texture.source)).size
  const textures = new Set(), materials = new Set(), hash = createHash('sha256')
  for (let build = 0; build < 3; build++) {
    resetKitMaterials()
    const kit = getKitMaterials()
    for (const [name, value] of Object.entries(kit)) {
      for (const material of Array.isArray(value) ? value : [value]) {
        if (!material?.isMaterial) continue
        materials.add(material)
        for (const [channel, texture] of Object.entries(material)) {
          if (!texture?.isTexture) continue
          textures.add(texture)
          hash.update(JSON.stringify({ name, channel, width: texture.image?.width, height: texture.image?.height,
            canvas: texture.isCanvasTexture, colorSpace: texture.colorSpace, repeat: texture.repeat.toArray(),
            offset: texture.offset.toArray(), wrapS: texture.wrapS, wrapT: texture.wrapT, anisotropy: texture.anisotropy,
            format: texture.format, type: texture.type, minFilter: texture.minFilter, magFilter: texture.magFilter,
            flipY: texture.flipY, generateMipmaps: texture.generateMipmaps }))
        }
      }
    }
  }
  const result = { repeatedTextures: 100, repeatedSources, materialBuilds: 3, textures: textures.size,
    sources: new Set([...textures].map(texture => texture.source)).size,
    images: new Set([...textures].map(texture => texture.image)).size, samplerSha256: hash.digest('hex') }
  for (const texture of [...repeated, ...textures]) texture.dispose()
  materials.forEach(material => material.dispose())
  resetKitMaterials()
  return result
}

async function audioConcurrency() {
  let fetches = 0, decodes = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch, oldLog = console.log
  const players = []
  try {
    console.log = () => {}
    globalThis.window = { AudioContext: class {
      state = 'running'; destination = {}
      createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} } }
      decodeAudioData(_bytes, success) {
        decodes++
        const buffer = { length: 96000, numberOfChannels: 2, sampleRate: 48000, duration: 2 }
        success(buffer)
        return Promise.resolve(buffer)
      }
    } }
    globalThis.fetch = async () => {
      fetches++
      await gate
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    }
    initAudio()
    for (let i = 0; i < 3; i++) players.push(new LevelMusicPlayer('https://fixture.invalid/same-track.mp3'))
    const loads = players.map(player => player.load())
    release()
    const buffers = await Promise.all(loads)
    return { concurrentLoads: 3, fetches, decodes, distinctDecodedBuffers: new Set(buffers).size,
      fixtureOnly: true }
  } finally {
    players.forEach(player => player.dispose())
    globalThis.window = oldWindow; globalThis.fetch = oldFetch; console.log = oldLog
  }
}

console.log(JSON.stringify({ scope: 'Node texture Source identities and mocked audio I/O; no raster/GPU/heap/real MP3 decode or FPS measurement.',
  textures: textureInventory(), audio: await audioConcurrency() }, null, 2))

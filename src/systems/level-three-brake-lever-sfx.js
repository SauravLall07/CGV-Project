import { getContext, getSfxGain } from '../core/audio.js'

// The same mechanical tile-turn used in Level 1 Puzzle 3.
const tileClickUrl = new URL('../assets/audio/sfx/security/tile-turn.mp3', import.meta.url)
let cachedBuffer = null
let loading = null

async function loadBuffer() {
  if (cachedBuffer) return cachedBuffer
  if (!loading) {
    loading = (async () => {
      const response = await fetch(tileClickUrl)
      if (!response.ok) throw new Error(`brake lever click HTTP ${response.status}`)
      const ctx = getContext()
      if (!ctx) return null
      cachedBuffer = await ctx.decodeAudioData(await response.arrayBuffer())
      return cachedBuffer
    })().catch(error => {
      console.warn('[brake lever sfx]', error)
      return null
    }).finally(() => { loading = null })
  }
  return loading
}

export function createBrakeLeverClickSfx() {
  let disposed = false
  const playing = new Set()
  function playBuffer(buffer) {
    const ctx = getContext()
    const output = getSfxGain()
    if (disposed || !buffer || !ctx || !output || ctx.state !== 'running') return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    gain.gain.value = 0.58
    source.connect(gain).connect(output)
    playing.add(source)
    source.onended = () => {
      playing.delete(source)
      source.disconnect()
      gain.disconnect()
    }
    source.start()
  }
  return {
    preload: loadBuffer,
    play() {
      if (disposed) return
      if (cachedBuffer) playBuffer(cachedBuffer)
      else void loadBuffer().then(buffer => { if (!disposed) playBuffer(buffer) })
    },
    dispose() {
      disposed = true
      for (const source of playing) { try { source.stop() } catch {} }
      playing.clear()
    }
  }
}

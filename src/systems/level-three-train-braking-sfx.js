import { getContext, getSfxGain } from '../core/audio.js'

const pressureUrl = new URL('../assets/audio/sfx/level3/brake-pressure.mp3', import.meta.url)
const screechUrl = new URL('../assets/audio/sfx/level3/brake-screech.mp3', import.meta.url)
const urls = [pressureUrl, screechUrl]

// Keep the complete uploaded recordings; the next clip starts when the first ends.
export function createTrainBrakingSfx() {
  let disposed = false
  let started = false
  let completed = false
  let failed = false
  let phase = 0
  let loading = null
  let source = null
  let gain = null

  async function preload() {
    const ctx = getContext()
    if (!ctx) return null
    if (!loading) loading = Promise.all(urls.map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`train brake: HTTP ${response.status}`)
      return ctx.decodeAudioData(await response.arrayBuffer())
    })).catch((error) => {
      console.warn('[train braking]', error)
      failed = true
      loading = null
      return null
    })
    return loading
  }

  function disconnect() {
    source?.disconnect()
    gain?.disconnect()
    source = null
    gain = null
  }

  function playPart(buffers, index) {
    if (disposed) return
    const ctx = getContext(), bus = getSfxGain()
    if (!ctx || !bus || ctx.state !== 'running') { failed = true; return }
    disconnect()
    phase = index + 1
    source = ctx.createBufferSource()
    gain = ctx.createGain()
    source.buffer = buffers[index]
    gain.gain.value = index === 0 ? 0.76 : 0.72
    source.connect(gain).connect(bus)
    source.onended = () => {
      if (disposed) return
      if (index === 0) playPart(buffers, 1)
      else { completed = true; phase = 3; disconnect() }
    }
    source.start()
    started = true
  }

  return {
    preload,
    play() {
      if (disposed || started) return
      void preload().then(async (buffers) => {
        if (disposed || started) return
        if (!buffers) { failed = true; return }
        const ctx = getContext()
        if (ctx?.state === 'suspended') {
          try { await ctx.resume() } catch { failed = true; return }
        }
        if (!disposed) playPart(buffers, 0)
      })
    },
    get started() { return started },
    get completed() { return completed },
    get failed() { return failed },
    get phase() { return phase },
    dispose() {
      disposed = true
      if (source) { source.onended = null; try { source.stop() } catch {} }
      disconnect()
    }
  }
}

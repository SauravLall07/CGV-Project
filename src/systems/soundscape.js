import { isWorldAudioPaused, onAudioPause } from '../core/audio.js'
import { playSfx } from './sound-effects.js'

// Only moving-train and exposed-roof environments get a bed. Station decor
// remains quiet; L3's existing wreck/hazard systems own its machinery.
export function createSoundscape() {
  let name = null, handle = null, volume = null
  function stop() { handle?.stop(); handle = null; name = null; volume = null }
  const unsubscribe = onAudioPause(value => { if (value) stop() })
  return {
    update(state, roof = false, stasis = false) {
      const next = state === 'MovingHeist' ? (roof ? 'roof-wind' : 'train-air') : null
      if (next !== name || isWorldAudioPaused()) stop()
      if (!next || isWorldAudioPaused()) return
      name = next
      if (!handle) handle = playSfx(next, { category: 'ambience', loop: true, volume: roof ? 0.4 : 0.26, maxInstances: 1 })
      const nextVolume = stasis ? 0.015 : roof ? 0.4 : 0.26
      if (handle && volume !== nextVolume) { handle.setVolume(nextVolume); volume = nextVolume }
    },
    stop,
    dispose() { stop(); unsubscribe() }
  }
}

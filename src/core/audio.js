import { settings } from '../core/settings.js'

// Shared Web Audio plumbing: one AudioContext and a master GainNode every
// later sound routes through. Created once; browsers start the context
// suspended until a user gesture, so resumeAudio() exists to unlock it from
// a click/keydown handler. No gameplay, no sound loading — just the graph.
// Master gain follows settings.masterVolume / settings.mute so the settings
// screen can change the mix immediately, including before initAudio() has run.

let context = null
let master = null
let musicBus = null
let sfxBus = null

function effectiveMasterVolume() {
  if (settings.get('mute')) return 0
  const value = settings.get('masterVolume')
  return typeof value === 'number' && Number.isFinite(value) ? value : 0.5
}

function applyMixVolumes() {
  if (musicBus) musicBus.gain.value = settings.get('musicVolume') ?? 1
  if (sfxBus) sfxBus.gain.value = settings.get('sfxVolume') ?? 1
}

function applyMasterVolume() {
  if (!master) return
  master.gain.value = effectiveMasterVolume()
}

export function initAudio() {
  if (context) return

  const AudioCtx = window.AudioContext || window.webkitAudioContext
  context = new AudioCtx()
  master = context.createGain()
  applyMasterVolume()
  master.connect(context.destination)
  musicBus = context.createGain()
  sfxBus = context.createGain()
  musicBus.connect(master)
  sfxBus.connect(master)
  applyMixVolumes()
  console.log('Audio context created, state: ' + context.state)
}

export function getContext() {
  return context
}

export function getMasterGain() {
  return master
}

export function getMusicGain() {
  return musicBus
}

export function getSfxGain() {
  return sfxBus
}

export function setMasterVolume(v) {
  if (!master) return
  master.gain.value = v
}

settings.subscribe((_values, changed) => {
  if (
    changed !== undefined &&
    changed !== 'masterVolume' &&
    changed !== 'mute' &&
    changed !== 'musicVolume' &&
    changed !== 'sfxVolume' &&
    changed !== 'options' &&
    changed !== 'all'
  ) return
  applyMasterVolume()
  applyMixVolumes()
})

export function resumeAudio() {
  if (!context) return
  console.log('Audio context state before resume: ' + context.state)
  // Always resume on a user gesture, even if state already reads "running".
  // Chrome/Firefox can report running for a context created at page load
  // while still blocking audible output until resume() runs in a gesture.
  const p = context.resume()
  if (p && typeof p.then === 'function') {
    return p.then(() => {
      console.log('Audio context state after resume: ' + context.state)
    })
  }
  console.log('Audio context state after resume: ' + context.state)
}

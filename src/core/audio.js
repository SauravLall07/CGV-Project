// Shared Web Audio plumbing: one AudioContext and a master GainNode every
// later sound routes through. Created once; browsers start the context
// suspended until a user gesture, so resumeAudio() exists to unlock it from
// a click/keydown handler. No gameplay, no sound loading — just the graph.

let context = null
let master = null

export function initAudio() {
  if (context) return

  const AudioCtx = window.AudioContext || window.webkitAudioContext
  context = new AudioCtx()
  master = context.createGain()
  master.gain.value = 0.5
  master.connect(context.destination)
  console.log('Audio context created, state: ' + context.state)
}

export function getContext() {
  return context
}

export function getMasterGain() {
  return master
}

export function setMasterVolume(v) {
  if (!master) return
  master.gain.value = v
}

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

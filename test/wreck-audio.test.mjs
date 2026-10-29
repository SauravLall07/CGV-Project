import test from 'node:test'
import assert from 'node:assert/strict'
import { createWreckAudio } from '../src/systems/wreck-audio.js'
import { initAudio, getMasterGain } from '../src/core/audio.js'
import { settings } from '../src/core/settings.js'

test('exposure wind uses one quiet master-routed voice, holds in stasis, pauses and releases its buffer graph', () => {
  const nodes=[], sources=[]
  const parameter=()=>({value:0,setTargetAtTime(v){this.target=v}})
  const node=()=>{
    const n={gain:parameter(),frequency:parameter(),connect(target){this.destination=target;return target},disconnect(){this.disconnected=true},start(){},stop(){this.stopped=true}}
    nodes.push(n);return n
  }
  const ctx={state:'running',currentTime:0,sampleRate:100,createGain:node,createBiquadFilter:node,
    createBufferSource(){const n=node();sources.push(n);return n},createBuffer:()=>({getChannelData:()=>new Float32Array(100)})}
  const master={},sound=createWreckAudio({context:()=>ctx,output:()=>master})
  sound.exposure(1)
  const count=nodes.length
  for(let i=0;i<30;i++)sound.exposure(0.5)
  assert.equal(nodes.length,count);assert.equal(sources.length,1)
  const bus=nodes[0],wind=sources[0],gain=wind.destination.destination
  assert.equal(bus.destination,master);assert.equal(gain.gain.target,0.006)
  sound.exposure(1,true);assert.equal(gain.gain.target,0.0003)
  sound.setPaused(true);assert.equal(bus.gain.value,0)
  sound.setPaused(false);assert.equal(bus.gain.value,1)
  sound.exposure(0);assert.equal(gain.gain.value,0)
  sound.dispose();assert.ok(wind.stopped);assert.ok(nodes.every(n=>n.disconnected))
  sound.exposure(1);assert.equal(nodes.length,count)
})

test('Wreck audio: silent before unlock; real master/mute, hush, pause, settling and disposal ownership', () => {
  const nodes = [], sources = []
  const parameter = () => ({ value: 0,
    setValueAtTime(v) { this.value = v }, exponentialRampToValueAtTime(v) { this.target = v },
    setTargetAtTime(v) { this.target = v }
  })
  const node = kind => {
    const n = { kind, gain: parameter(), frequency: parameter(),
      connect(destination) { this.destination = destination; return destination },
      disconnect() { this.disconnected = true }, start() {}, stop() { this.stopped = true }
    }
    nodes.push(n); return n
  }
  const ctx = { state: 'running', currentTime: 0, destination: {},
    createGain: () => node('gain'),
    createOscillator: () => { const n = node('oscillator'); sources.push(n); return n }
  }
  const silent = createWreckAudio({ context: () => null, output: () => null })
  silent.warning(); silent.snap(); silent.debris('cargo'); silent.brake(); silent.update(true, false); silent.dispose()
  assert.equal(nodes.length, 0)
  const oldWindow = globalThis.window
  const volume = settings.get('masterVolume'), mute = settings.get('mute')
  let sound
  try {
    globalThis.window = { AudioContext: class { constructor() { return ctx } } }
    initAudio()
    sound = createWreckAudio()
    sound.update(false, false)
    assert.equal(nodes.length, 1, 'inactive L3 does not start machinery')
    sound.update(true, false)
    const master = getMasterGain(), bed = sources[0].destination.destination, bus = bed.destination
    assert.equal(bus.destination.destination.destination, master, 'ambience through world gate to master')
    assert.equal(bed.gain.target, 0.045)
    sound.update(true, true)
    assert.equal(bed.gain.target, 0.0005)
    sound.warning()
    assert.equal(sources.at(-1).destination.destination, bus, 'warning bypasses the hushed bed')
    const beforeSnap = sources.length
    sound.snap()
    assert.equal(sources.length, beforeSnap + 2, 'one connector snap uses two bounded short tones')
    assert.ok(sources.slice(-2).every(s => s.destination.destination === bus && s.stopped))
    const beforeDebris = sources.length
    sound.debris('cargo'); sound.debris('passenger'); sound.debris('convergence')
    assert.equal(sources.length, beforeDebris + 1, 'background cues share one bounded transient voice')
    assert.equal(sources.at(-1).destination.destination, bus)
    settings.set('mute', true); assert.equal(master.gain.value, 0)
    settings.set('masterVolume', 0.23); assert.equal(master.gain.value, 0)
    settings.set('mute', false); assert.equal(master.gain.value, 0.23)
    sound.setPaused(true); assert.equal(bus.gain.value, 0)
    const count = sources.length
    sound.warning(); sound.snap(); sound.debris('cargo'); assert.equal(sources.length, count)
    sound.setPaused(false); assert.equal(bus.gain.value, 1)
    assert.equal(master.gain.value, 0.23, 'resuming must not override master volume')
    sound.brake(); sound.update(true, false, 0)
    sound.update(true, false, 2.5)
    assert.equal(bed.gain.target, 0)
    const settled = sources.length
    sound.update(true, false, 3.5); assert.equal(sources.length, settled, 'settling sound occurs once')
    sound.reset()
    assert.ok(sources.every(s => s.stopped && s.disconnected))
    assert.ok(nodes.slice(nodes.indexOf(bus)).every(n => n.disconnected))
    sound.update(true, false); assert.ok(sources.length > settled, 'checkpoint can start fresh audio')
    sound.dispose()
    const disposedCount = nodes.length
    sound.warning(); sound.brake(); sound.update(true, false)
    assert.equal(nodes.length, disposedCount)
    assert.ok(sources.every(s => s.stopped && s.disconnected))
  } finally {
    sound?.dispose()
    settings.set('masterVolume', volume); settings.set('mute', mute)
    globalThis.window = oldWindow
  }
})

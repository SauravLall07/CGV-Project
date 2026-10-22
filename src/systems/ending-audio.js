import { getContext, getMasterGain } from '../core/audio.js'

// Uses the shared gesture-unlocked context and settings-controlled master bus.
// No AudioContext is created here, including in Node tests.
export function createEndingAudio({ context = getContext, output = getMasterGain } = {}) {
  let graph = null, disposed = false, stopped = false, tail = -1
  const voices=new Set()
  let noiseBuffer=null,ambient=null
  function clearBrake() {
    if (!graph) return
    graph.bus.gain.cancelScheduledValues(graph.ctx.currentTime)
    graph.bus.gain.value = 0
    for (const source of graph.sources) {
      try { source.stop() } catch { /* A scheduled source may already have ended. */ }
      source.disconnect()
    }
    for (const node of graph.nodes) node.disconnect()
    graph = null; tail = -1
  }
  function stop() {
    stopped=true;clearBrake()
    for(const voice of voices) {
      for(const source of voice.sources) {try{source.stop()}catch{/* Already ended. */}source.disconnect()}
      for(const node of voice.nodes) node.disconnect()
    }
    voices.clear();ambient=null
  }
  function cue(kind) {
    const ctx=context(),master=output()
    if(disposed||stopped||!ctx||!master||ctx.state!=='running')return
    if(kind==='ambient'&&ambient)return
    const sources=[],nodes=[],duration=kind==='impact'?1.2:kind==='ambient'?Infinity:kind==='door'?0.65:0.35
    const bus=ctx.createGain();bus.gain.value=1;bus.connect(master);nodes.push(bus)
    function tone(frequency,end,volume,type='sine',seconds=duration) {
      const source=ctx.createOscillator(),gain=ctx.createGain()
      source.type=type;source.frequency.setValueAtTime(frequency,ctx.currentTime)
      source.frequency.setTargetAtTime(end,ctx.currentTime,seconds/4)
      gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.setTargetAtTime(0,ctx.currentTime,seconds/4)
      source.connect(gain).connect(bus);source.start();source.stop(ctx.currentTime+seconds)
      sources.push(source);nodes.push(gain)
    }
    if(kind==='impact') {
      tone(90,35,0.32)
      tone(2100,430,0.035,'triangle',0.4)
      tone(3170,790,0.02,'sine',0.3)
    } else {
      if(!noiseBuffer) {
        noiseBuffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate)
        const data=noiseBuffer.getChannelData(0)
        let seed=771
        for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1}
      }
      if(kind==='door')tone(950,230,0.035,'triangle',0.07)
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain()
      source.buffer=noiseBuffer;source.loop=true;filter.type=kind==='ambient'?'lowpass':'bandpass'
      filter.frequency.value=kind==='ambient'?650:kind==='door'?800:1800
      filter.Q.value=0.7;gain.gain.value=kind==='ambient'?0:0.025
      gain.gain.setTargetAtTime(kind==='ambient'?0.012:0,ctx.currentTime,kind==='ambient'?0.8:duration/3)
      source.connect(filter).connect(gain).connect(bus);source.start()
      if(Number.isFinite(duration))source.stop(ctx.currentTime+duration)
      sources.push(source);nodes.push(filter,gain)
    }
    const voice={sources,nodes,bus,remaining:duration}
    voices.add(voice);if(kind==='ambient')ambient=voice
  }
  function start() {
    const ctx = context(), master = output()
    if (disposed || stopped || graph || !ctx || !master || ctx.state !== 'running') return
    const bus = ctx.createGain(), sources = [], nodes = [bus], tones = []
    bus.gain.value = 0; bus.connect(master)
    const vibrato = ctx.createOscillator(), vibratoGain = ctx.createGain()
    vibrato.frequency.value = 6.3; vibratoGain.gain.value = 13
    vibrato.connect(vibratoGain); sources.push(vibrato); nodes.push(vibratoGain)
    for (let i = 0; i < 3; i++) {
      const oscillator = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
      oscillator.type = i === 1 ? 'square' : 'sawtooth'
      oscillator.frequency.value = 710 + i * 23; oscillator.detune.value = (i - 1) * 11
      filter.type = 'bandpass'; filter.frequency.value = 2400 + i * 480; filter.Q.value = 7
      gain.gain.value = 0.018
      vibratoGain.connect(oscillator.frequency); oscillator.connect(filter).connect(gain).connect(bus)
      sources.push(oscillator); nodes.push(filter, gain); tones.push(oscillator)
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), samples = buffer.getChannelData(0)
    // One startup allocation; no frame-time synthesis or assets.
    let seed = 391
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      samples[i] = (seed / 4294967296) * 2 - 1
    }
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    noise.buffer = buffer; noise.loop = true
    filter.type = 'bandpass'; filter.frequency.value = 2900; filter.Q.value = 1.2
    gain.gain.value = 0.035; noise.connect(filter).connect(gain).connect(bus)
    sources.push(noise); nodes.push(filter, gain)
    graph = { ctx, bus, sources, nodes, tones }
    for (const source of sources) source.start()
  }
  return {
    get active() { return graph !== null },
    get voiceCount(){return voices.size+(graph?1:0)},
    door:()=>cue('door'),throw:()=>cue('throw'),
    impact(){cue('impact');cue('ambient')},
    fadeOut(){if(ambient)ambient.bus.gain.setTargetAtTime(0,context().currentTime,0.3)},
    update(progress, intensity, delta = 0) {
      if (disposed || stopped) return
      for(const voice of voices) {
        voice.remaining-=Math.max(0,delta)
        if(voice.remaining<=0) {
          for(const source of voice.sources)source.disconnect()
          for(const node of voice.nodes)node.disconnect()
          voices.delete(voice)
        }
      }
      if (progress >= 0 && progress < 1) {
        start()
        if (!graph) return
        const now = graph.ctx.currentTime
        graph.bus.gain.setTargetAtTime(Math.max(0, intensity), now, 0.035)
        for (let i = 0; i < graph.tones.length; i++)
          graph.tones[i].frequency.setTargetAtTime((710 + i * 23) * (1 - progress * 0.2), now, 0.05)
      } else if (graph) {
        if (tail < 0) {
          tail = 0
          graph.bus.gain.cancelScheduledValues(graph.ctx.currentTime)
          graph.bus.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.1)
        }
        tail += Math.max(0, delta)
        if (tail >= 0.4) clearBrake()
      }
    },
    stop,
    dispose() { stop(); disposed = true }
  }
}

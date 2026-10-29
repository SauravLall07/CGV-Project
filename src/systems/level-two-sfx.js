import { getContext, getSfxGain } from '../core/audio.js'

// Level 2 carriage audio; the SFX bus still provides master/SFX/mute control.
const urls = {
  train: new URL('../assets/audio/sfx/level2/train.mp3', import.meta.url),
  slide: new URL('../assets/audio/sfx/level2/slide.mp3', import.meta.url),
  steam: new URL('../assets/audio/sfx/level2/steam.mp3', import.meta.url),
  warp: new URL('../assets/audio/sfx/level2/warp.mp3', import.meta.url),
  click: new URL('../assets/audio/sfx/level2/pickup-click.mp3', import.meta.url)
}
const buffers = new Map(), loading = new Map()
function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (loading.has(name)) return loading.get(name)
  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)
  const promise = fetch(urls[name]).then(r => { if (!r.ok) throw Error(`${name}: HTTP ${r.status}`); return r.arrayBuffer() })
    .then(b => ctx.decodeAudioData(b)).then(b => {buffers.set(name,b); return b})
    .catch(e => {console.warn('[level2-sfx]',e);return null}).finally(() => loading.delete(name))
  loading.set(name,promise);return promise
}
export function createLevelTwoAudio(player, spans) {
  const active = new Set()
  let disposed = false, started = false, lastCar = null
  const entries = Object.entries(spans).filter(([,v]) => Number.isFinite(v.minZ) && Number.isFinite(v.maxZ))
  const carriageAt = z => entries.find(([,v]) => z >= v.minZ && z <= v.maxZ)?.[0] ?? null
  function oneShot(name, volume) {
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
    if (!ctx || ctx.state !== 'running' || !bus || !buffer || disposed) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer;gain.gain.value = volume
    source.connect(gain).connect(bus);source.start()
    source.onended = () => {source.disconnect();gain.disconnect()}
  }
  function loop(name, carriage, position, volume, radius = 11) {
    const entry = {name,carriage,position,volume,radius,source:null,gain:null,ctx:null}
    active.add(entry)
    function start() {
      if(disposed || !active.has(entry) || entry.source) return
      const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
      if (!ctx || ctx.state !== 'running' || !bus || !buffer) return
      const src = ctx.createBufferSource(), gain = ctx.createGain()
      src.buffer=buffer;src.loop=true;gain.gain.value=0
      src.connect(gain).connect(bus);src.start()
      entry.source=src;entry.gain=gain;entry.ctx=ctx
    }
    void load(name).then(start)
    return entry
  }
  const train = loop('train',null,null,0.12)
  function stop(entry) {
    if(entry.source){try{entry.source.stop()}catch{};entry.source.disconnect();entry.gain.disconnect()}
    entry.source=null;entry.gain=null
  }
  const slide = loop('slide','security',null,0.20,9)
  let previousSlideX = null
  let slideMotion = 0
  const vents = []
  function addSteam(position) {const e=loop('steam','security',position,0.22,9);vents.push(e);return e}
  function preload(){if(started)return;started=true;Object.keys(urls).forEach(name=>void load(name))}
  function update(delta,timeScale,scannerPosition,steamBanks) {
    if(disposed)return
    if(getContext()&&!started)preload()
    const p=player?.mesh?.position
    if(!p)return
    const car=carriageAt(p.z)
    lastCar=car
    // The moving panel animates on its LOCAL X axis. Use that precise value,
    // rather than a possibly stale world matrix sampled before rendering.
    // Measure only actual movement: no sliding sound when the panel is still.
    slide.position = scannerPosition
    const slideX = steamBanks?.slideX
    if (Number.isFinite(slideX) && previousSlideX !== null && delta > 0 && delta < 0.15) {
      const speed = Math.abs(slideX - previousSlideX) / delta
      const targetMotion = Math.min(1, speed / 1.0)
      slideMotion += (targetMotion - slideMotion) * (1 - Math.exp(-delta / 0.018))
    } else {
      slideMotion = 0
    }
    previousSlideX = Number.isFinite(slideX) ? slideX : null
    const clampedRate=Math.max(0,Math.min(2.5,Math.abs(timeScale)))
    for(const e of active){
      if(!e.source && buffers.has(e.name)) {
        const ctx=getContext(),bus=getSfxGain()
        if(ctx?.state==='running' && bus){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers.get(e.name);s.loop=true;g.gain.value=0;s.connect(g).connect(bus);s.start();e.source=s;e.gain=g;e.ctx=ctx}
      }
      if(!e.source)continue
      const sameCar=!e.carriage || car===e.carriage
      const dist=e.position ? Math.hypot(p.x-e.position.x,p.z-e.position.z) : 0
      const falloff=e.position ? Math.pow(Math.max(0,1-Math.max(0,dist-1.5)/(e.radius-1.5)),2) : 1
      let intensity=1
      if(e===slide) intensity=slideMotion
      if(vents.includes(e)){const index=vents.indexOf(e);intensity=Math.min(1,Math.max(0,steamBanks.banks[index]?.density??0))}
      const gain=(sameCar && clampedRate>0.005) ? e.volume*falloff*intensity : 0
      e.gain.gain.setTargetAtTime(gain,e.ctx.currentTime,0.055)
      // Chalk Slide is a slow recording: run it fast enough to match the
      // actual mechanical sweep. Time abilities still slow/freeze the audio.
      const playback = e === slide ? Math.max(0.08, 3.5 * clampedRate) : Math.max(0.08, clampedRate)
      e.source.playbackRate.setTargetAtTime(playback,e.ctx.currentTime,0.025)
    }
  }
  return {preload,addSteam,update,pickup(){
    // Queue one-shots until first decoded; they must not disappear on a cold load.
    void Promise.all([load('click'),load('warp')]).then(()=>{
      if(disposed)return
      oneShot('click',0.22)
      const ctx=getContext();if(!ctx||ctx.state!=='running')return
      const buffer=buffers.get('warp'),bus=getSfxGain();if(!buffer||!bus)return
      const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffer;g.gain.value=0.17;s.connect(g).connect(bus)
      s.start(ctx.currentTime+0.09);s.onended=()=>{s.disconnect();g.disconnect()}
    })
  },dispose(){disposed=true;for(const e of active)stop(e);active.clear()}}
}

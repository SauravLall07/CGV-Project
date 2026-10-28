import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { summarizeFrames, summarizeGpu } from '../src/dev/frame-metrics.js'

const captures = {}
for (const phase of ['profile-before','profile-after','profile-cached','profile-seeded-before','profile-seeded-after']) {
  let data
  try {data=JSON.parse(await readFile(`reports/lvl3-rebuild/${phase}/measurements.json`,'utf8'))}
  catch(error){if(error.code==='ENOENT')continue;throw error}
  captures[phase]={}
  for(const [key,value] of Object.entries(data)) {
    const frames=value.samples.filter(f=>!f.exclusion&&f.frameMs>0)
    const ids=new Set(frames.map(f=>f.frameId))
    const mean=field=>frames.reduce((sum,f)=>sum+f[field],0)/frames.length
    captures[phase][key]={frames:summarizeFrames(frames),
      cpu:Object.fromEntries(['updateCpuMs','sceneCpuMs','drawCpuMs','minimapCpuMs'].map(k=>[k,mean(k)])),
      gpu:summarizeGpu(value.gpuSamples.filter(s=>ids.has(s.frameId))),gpuStatus:value.gpuStatus,
      calls:mean('calls'),triangles:mean('triangles'),resources:value.resources,
      hardware:value.gpu,viewport:value.viewport,ratio:value.pixelRatio,exposure:value.exposure,
      player:value.player,errors:value.errors}
  }
}
const names=new Set([
  ...execFileSync('git',['diff','--name-only','--','src'],{encoding:'utf8'}).trim().split(/\r?\n/),
  ...execFileSync('git',['ls-files','--others','--exclude-standard','--','src'],{encoding:'utf8'}).trim().split(/\r?\n/)
].filter(Boolean))
const hashes={}
for(const file of [...names].sort())hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile('reports/lvl3-rebuild/performance-summary.json',JSON.stringify({
  baseline:'bd92a56e2c85d5322f188fe96afa58eeefb8039b',sourceHashes:hashes,
  protocol:'Isolated headless Chrome; 1280x720, pixel ratio 1, High, exposure 1.15, debris seed 12345, actual level/cameras/post/minimap with procedural fallback player. profile-seeded-* additionally pins only legacy scenery scatter to 7143 through a diagnostic browser response transform; game source is unchanged. Other captures retain randomized scenery and are exploratory. Paused overhead: 4 s capture after approach/interior/exterior warmup. Active first person: 3 s warmup + 6 s capture, standing at checkpoint. Runs sequential, no test suite or second task browser running. GPU samples filtered by measured frame IDs; pending tails not estimated. Short diagnostic, not a normal-play FPS claim.',captures
},null,2))
for(const [phase,rows] of Object.entries(captures))for(const [key,row]of Object.entries(rows))
  console.log(phase,key,JSON.stringify({n:row.frames.frames,ms:row.frames.meanFrameMs,p95:row.frames.p95FrameMs,p99:row.frames.p99FrameMs,
    update:row.cpu.updateCpuMs,sceneCpu:row.cpu.sceneCpuMs,map:row.cpu.minimapCpuMs,
    gpu:row.gpu.scene?.meanMs,bloom:row.gpu.bloom?.meanMs,final:row.gpu.final?.meanMs,shadow:row.gpu.shadow?.meanMs,
    calls:row.calls,triangles:row.triangles,resources:row.resources,disjoints:row.gpuStatus.disjointEvents,errors:row.errors}))

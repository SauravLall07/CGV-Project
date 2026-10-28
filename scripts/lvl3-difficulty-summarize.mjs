import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { summarizeFrames, summarizeGpu } from '../src/dev/frame-metrics.js'
const captures={}
for(const phase of ['baseline-final','after-final','after-opaque']) {
  const data=JSON.parse(await readFile(`reports/lvl3-rebuild/profile-seeded-difficulty-${phase}/measurements.json`,'utf8'))
  captures[phase]={}
  for(const [key,value] of Object.entries(data)) {
    const frames=value.samples.filter(f=>!f.exclusion&&f.frameMs>0)
    const ids=new Set(frames.map(f=>f.frameId))
    const mean=k=>frames.reduce((sum,f)=>sum+f[k],0)/frames.length
    captures[phase][key]={frames:summarizeFrames(frames),
      cpu:Object.fromEntries(['updateCpuMs','sceneCpuMs','drawCpuMs','minimapCpuMs'].map(k=>[k,mean(k)])),
      gpu:summarizeGpu(value.gpuSamples.filter(s=>ids.has(s.frameId))),gpuStatus:value.gpuStatus,
      calls:mean('calls'),triangles:mean('triangles'),resources:value.resources,
      hardware:value.gpu,viewport:value.viewport,ratio:value.pixelRatio,exposure:value.exposure,
      player:value.player,errors:value.errors}
  }
}
const hashes={}
for(const file of ['src/levels/timewreck-flying-panels.js','src/levels/timewreck-spatial.js','src/levels/timewreck-routes.js','src/levels/timewreck.js','src/environment/passenger-guidance.js'])
  hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex')
const output={baseline:'e87e45d',sourceHashes:hashes,
  sourceNotes:'after-final is the preliminary final capture with the four authored panels still using transparent materials at opacity 1; after-opaque matches the final source hashes. All other encounter geometry and schedules are identical between those two captures.',
  protocol:'Sequential isolated headless Chrome on Iris Xe; 1280x720, pixel ratio 1, High, exposure 1.15, debris seed 12345. Existing diagnostic harness with actual level, controller, both cameras, post and minimap; procedural fallback player. Pins only legacy scenery scatter to 7143 in the diagnostic response. Same views in each run. Fixed overhead: 4 seconds after approach/interior/exterior shader warmup. Active first person: 3 seconds warmup then 6 seconds stationary at checkpoint. Raw rAF intervals; CPU submission is not GPU completion. No concurrent tests or second task browser during either capture. GPU samples limited to returned matching frame IDs; pending tails not extrapolated. Not a full-game FPS claim.',captures}
await writeFile('reports/lvl3-difficulty/performance-summary.json',JSON.stringify(output,null,2))
for(const [phase,rows] of Object.entries(captures))for(const [key,row] of Object.entries(rows))
  console.log(phase,key,JSON.stringify({median:row.frames?.p50FrameMs,p95:row.frames?.p95FrameMs,
    update:row.cpu.updateCpuMs,submission:row.cpu.sceneCpuMs,calls:row.calls,triangles:row.triangles,
    resources:row.resources,gpu:row.gpu,gpuStatus:row.gpuStatus}))

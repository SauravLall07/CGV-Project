import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { summarizeFrames, summarizeGpu } from '../src/dev/frame-metrics.js'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/hpars/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright')
await mkdir('reports/lvl3-difficulty/profile',{recursive:true})
const summaries=[]
// ABBA order reduces the influence of warmup/clock drift on this short check.
for(const [index,variant] of ['baseline','new','new','baseline'].entries()) {
  const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling']})
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}})
    await page.route('**/src/environment/outdoor-environment.js*',async route=>{
      const response=await route.fetch()
      let body=(await response.text()).replaceAll('Math.random()','captureRandom()')
        .replace(/(function createOutdoorEnvironment\([^\n]+\)\s*\{)/,'$1\n captureSeed=7143;')
      body='let captureSeed=7143; function captureRandom(){captureSeed=(Math.imul(captureSeed,1664525)+1013904223)>>>0;return captureSeed/4294967296;}\n'+body
      await route.fulfill({response,body})
    })
    await page.route('**/difficulty-profile.html',route=>route.fulfill({contentType:'text/html',body:'<html><body><script type="module" src="/scripts/lvl3-review-page.js"></script></body></html>'}))
    await page.goto(`http://127.0.0.1:${variant==='baseline'?5177:5175}/difficulty-profile.html`,{waitUntil:'domcontentloaded',timeout:120000})
    await page.waitForFunction(()=>window.review,null,{timeout:120000})
    await page.evaluate(()=>{review.start('cargo');const v=review.level.getCarriageVolumes().find(v=>v.key==='cargo');review.pose(0,0,v.maxZ-1.5,'first');review.run(true)})
    await page.waitForTimeout(10000)
    await page.evaluate(()=>review.stats())
    await page.waitForTimeout(20000)
    await page.waitForTimeout(20000)
    const raw=await page.evaluate(()=>review.stats())
    await writeFile(`reports/lvl3-difficulty/profile/${index}-${variant}.json`,JSON.stringify(raw))
    const frames=raw.samples.filter(f=>!f.exclusion&&f.frameMs>0), ids=new Set(frames.map(f=>f.frameId))
    const mean=field=>frames.reduce((sum,f)=>sum+f[field],0)/frames.length
    const summary={index,variant,frames:summarizeFrames(frames),update:mean('updateCpuMs'),submission:mean('sceneCpuMs'),
      calls:mean('calls'),triangles:mean('triangles'),gpu:summarizeGpu(raw.gpuSamples.filter(s=>ids.has(s.frameId))),
      resources:raw.resources,gpuStatus:raw.gpuStatus,hardware:raw.gpu,errors:raw.errors}
    summaries.push(summary)
    console.log(JSON.stringify(summary))
    await writeFile('reports/lvl3-difficulty/profile/summary.json',JSON.stringify({
      protocol:'Cargo active first person, fixed checkpoint, seed 12345, scenery seed 7143, 1280x720 DPR1 High exposure1.15. Separate Chrome per run, 10s shader warmup + 40s sample, ABBA order, no other task browser/tests/build running. Same existing diagnostic harness as the short captures. Samples exclude flagged frames and pending GPU tails.',summaries},null,2))
  } finally {await browser.close()}
}

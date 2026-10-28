import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/hpars/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-background-timer-throttling'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', error => console.error(error.message))
const phase = process.argv[2] || 'before'
const origin = process.env.LVL3_ORIGIN || 'http://127.0.0.1:5175'
const directory = `reports/lvl3-rebuild/${phase}`
await mkdir(directory, { recursive: true })
if (phase.startsWith('parity')) {
  const observations=[]
  try {
    await page.goto(`${origin}/?start=level2`,{waitUntil:'domcontentloaded',timeout:120000})
    await page.getByRole('button',{name:/new game/i}).click({timeout:180000})
    await page.waitForFunction(()=>window.levelManager?.getState()==='MovingHeist'&&!levelManager.isTransitioning(),null,{timeout:120000})
    await page.waitForTimeout(1000)
    await page.screenshot({path:`${directory}/level2-third.jpg`})
    await page.keyboard.press('v');await page.waitForTimeout(300)
    await page.screenshot({path:`${directory}/level2-first.jpg`})
    if(phase==='parity-before') {await browser.close();process.exit(0)}
    for(let round=0;round<3;round++) {
      await page.evaluate(()=>levelManager.enter('Timewreck',{levelOptions:{startCarriage:'cargo'}}))
      await page.waitForFunction(()=>!levelManager.isTransitioning(),null,{timeout:120000})
      await page.waitForTimeout(700)
      observations.push(await page.evaluate(()=>({level:levelManager.getState(),memory:{...renderer.info.memory},
        skyDomes:scene.children.filter(n=>n.name==='sky-dome').length,roots:scene.children.map(n=>n.name)})))
      await page.evaluate(()=>levelManager.enter('Ending'))
      await page.waitForFunction(()=>levelManager.getState()==='Ending'&&!levelManager.isTransitioning(),null,{timeout:120000})
      await page.waitForTimeout(1000)
      observations.push(await page.evaluate(()=>({level:levelManager.getState(),memory:{...renderer.info.memory},
        skyDomes:scene.children.filter(n=>n.name==='sky-dome').length,roots:scene.children.map(n=>n.name)})))
    }
    await page.waitForTimeout(5000)
    await page.screenshot({path:`${directory}/ending.jpg`})
    await writeFile(`${directory}/resources.json`,JSON.stringify(observations,null,2))
    console.log(observations.map(({level,memory,skyDomes})=>({level,memory,skyDomes})))
  } finally {await browser.close()}
  process.exit(0)
}
if (phase === 'play' || phase === 'finale') {
  const result = { errors: [], events: [] }
  page.on('pageerror',e=>result.errors.push(e.message))
  const position=()=>page.evaluate(()=>scene.getObjectByName('player').position.toArray())
  const shot=async name=>{await page.screenshot({path:`${directory}/${name}.jpg`});result.events.push({name,position:await position()});console.log(name,await position())}
  async function move(keys, axis, target, direction, limit=15000) {
    for(const key of keys)await page.keyboard.down(key)
    try {
      const result=await page.evaluate(({keys,axis,target,direction,limit})=>new Promise(resolve=>{
        const started=performance.now()
        const codes={w:'KeyW',a:'KeyA',d:'KeyD',Shift:'ShiftLeft'}
        function check(){
          const p=scene.getObjectByName('player').position
          const crossed=direction*(p.getComponent(axis)-target)>=0
          const failed=p.y<-.3||performance.now()-started>limit
          if(crossed||failed){
            for(const key of keys)window.dispatchEvent(new KeyboardEvent('keyup',{code:codes[key],key,bubbles:true}))
            resolve({position:p.toArray(),failed:!crossed})
          }else requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      }),{keys,axis,target,direction,limit})
      if(result.failed)throw Error(`movement failed at ${result.position} aiming for ${target}`)
      return result.position
    } finally {for(const key of keys)await page.keyboard.up(key)}
  }
  async function enter(key) {
    await page.evaluate(key=>levelManager.enter('Timewreck',{levelOptions:{startCarriage:key}}),key)
    await page.waitForFunction(()=>!levelManager.isTransitioning(),null,{timeout:120000})
    return page.evaluate(key=>levelManager.carriageVolumes.find(v=>v.key===key),key)
  }
  try {
    if(phase==='finale') {
      await page.goto(`${origin}/?start=level3-passenger`,{waitUntil:'domcontentloaded',timeout:120000})
      await page.getByRole('button',{name:/new game/i}).click({timeout:180000})
      await page.waitForFunction(()=>window.levelManager?.getState()==='Timewreck'&&!levelManager.isTransitioning(),null,{timeout:120000})
      const center=await page.evaluate(()=>{const v=levelManager.carriageVolumes.find(v=>v.key==='passenger');return(v.minZ+v.maxZ)/2})
      await page.keyboard.press('v')
      await move(['d'],0,0.72,1)
      await move(['w','Shift'],2,center+7.85,-1)
      await page.keyboard.down('Space');await move(['w','Shift'],2,center+3.6,-1);await page.keyboard.up('Space')
      await page.keyboard.press('f');await shot('passenger-held-floor-approach')
      await move(['a'],0,0.3,-1)
      await page.keyboard.down('Space');await move(['w','Shift'],2,center-5.2,-1);await page.keyboard.up('Space')
      await shot('passenger-real-collapse-crossed')
      await page.keyboard.press('f')
      const brakeZ=await page.evaluate(()=>scene.getObjectByName('emergency-brake').position.z)
      await move(['w','Shift'],2,brakeZ+1.5,-1)
      await shot('brake-aim')
      await page.keyboard.press('e')
      await page.waitForTimeout(300);await shot('brake-handoff')
      await page.waitForFunction(()=>levelManager.getState()==='Ending'&&!levelManager.isTransitioning(),null,{timeout:60000})
      await page.waitForTimeout(800);await shot('brake-into-ending')
      await writeFile(`${directory}/results.json`,JSON.stringify(result,null,2));await browser.close();process.exit(0)
    }
    await page.goto(`${origin}/?start=level3-cargo`,{waitUntil:'domcontentloaded',timeout:120000})
    await page.getByRole('button',{name:/new game/i}).click({timeout:180000})
    await page.waitForFunction(()=>window.levelManager?.getState()==='Timewreck'&&!levelManager.isTransitioning(),null,{timeout:120000})
    await page.keyboard.press('f')
    await shot('cargo-held-approach')
    await page.keyboard.press('v');await shot('cargo-first-person')
    const c=await page.evaluate(()=>{const v=levelManager.carriageVolumes.find(v=>v.key==='cargo');return(v.minZ+v.maxZ)/2})
    try {
      await move(['w','Shift'],2,c+3.1,-1)
      await shot('cargo-real-gangway-crossed')
      await page.keyboard.press('f')
      await page.waitForFunction(()=>scene.getObjectByName('cargo-loop-door').position.y>3.49,null,{timeout:20000})
      await page.keyboard.press('f')
      await move(['w','Shift'],2,c-2.8,-1)
      await shot('cargo-real-loop-crossed')
    } catch(error) {result.events.push({cargoAttempt:error.message});await shot('cargo-attempt-state')}
    const security=await enter('security'),center=(security.minZ+security.maxZ)/2
    await page.keyboard.press('v')
    await move(['a'],0,-0.7,-1)
    await page.keyboard.press('f')
    await shot('security-held-decks')
    try {
      await move(['w'],2,center+5.25,-1)
      await move(['w','d'],0,0.3,1)
      await move(['w'],2,center+0.3,-1)
      await shot('security-real-island')
      await page.keyboard.press('f')
      await page.waitForTimeout(7000)
      await page.keyboard.press('f')
      await move(['w'],2,center-2.8,-1)
      await page.keyboard.down('Space')
      await move(['w','Shift'],2,center-6.6,-1)
      await page.keyboard.up('Space')
      await move(['w'],2,center-7.4,-1)
      await shot('security-real-jump-exit')
    } catch(error){await page.keyboard.up('Space');result.events.push({securityAttempt:error.message});await shot('security-attempt-state')}
    await enter('convergence')
    await page.keyboard.press('Escape');await shot('pause')
    const resume=page.getByRole('button',{name:/^resume$/i})
    if(await resume.isVisible())await resume.click()
    await page.keyboard.press('g');await page.waitForTimeout(500);await shot('ghost-active')
    await page.keyboard.press('g');await shot('ghost-cancelled')
    await page.evaluate(()=>levelManager.restart())
    await page.waitForFunction(()=>!levelManager.isTransitioning(),null,{timeout:120000})
    await shot('restart')
    for(const tier of ['high','balanced','performance','auto']) {
      await page.evaluate(async tier=>{const {settings}=await import('/src/core/settings.js');settings.set('renderQuality',tier)},tier)
      await page.waitForTimeout(1600);await shot(`quality-${tier}`)
    }
    await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(600);await shot('aspect-4-3')
    await page.setViewportSize({width:768,height:1024});await page.waitForTimeout(600);await shot('aspect-portrait')
    await page.setViewportSize({width:1280,height:720})
    await page.evaluate(()=>levelManager.enter('Ending'))
    await page.waitForFunction(()=>levelManager.getState()==='Ending'&&!levelManager.isTransitioning(),null,{timeout:120000})
    await page.waitForTimeout(1200);await shot('ending-transition')
  } catch(error){result.events.push({failure:error.message});console.log(error.message);await page.screenshot({path:`${directory}/failure.jpg`})}
  finally {await writeFile(`${directory}/results.json`,JSON.stringify(result,null,2));await browser.close()}
  process.exit(0)
}
if (phase === 'main') {
  const consoleErrors = []
  page.on('console', message => { if(message.type()==='error')consoleErrors.push(message.text()) })
  try {
    await page.goto(`${origin}/?start=level3&bench=review`, {waitUntil:'domcontentloaded',timeout:120000})
    await page.waitForFunction(()=>window.levelManager?.getState()==='Timewreck'&&!levelManager.isTransitioning(),null,{timeout:180000})
    console.log('Main game ready')
    await page.screenshot({path:`${directory}/vault.jpg`})
    await page.keyboard.press('Space'); await page.keyboard.press('Space')
    for(const key of ['cargo','security','convergence','passenger']) {
      await page.evaluate(key=>levelManager.enter('Timewreck',{levelOptions:{startCarriage:key}}),key)
      await page.waitForFunction(()=>!levelManager.isTransitioning(),null,{timeout:120000})
      await page.waitForTimeout(1000)
      await page.screenshot({path:`${directory}/${key}.jpg`})
      console.log(key,await page.evaluate(()=>({state:levelManager.getState(),player:scene.getObjectByName('player').position.toArray(),memory:renderer.info.memory})))
    }
    await page.keyboard.press('Escape')
    await page.screenshot({path:`${directory}/pause.jpg`})
    await page.evaluate(()=>levelManager.enter('Ending'))
    await page.waitForFunction(()=>levelManager.getState()==='Ending'&&!levelManager.isTransitioning(),null,{timeout:120000})
    await page.waitForTimeout(1500)
    await page.screenshot({path:`${directory}/ending.jpg`})
    await writeFile(`${directory}/console-errors.json`,JSON.stringify(consoleErrors,null,2))
  } catch(error) {
    console.log('Main runtime check:',error.message)
    console.log(await page.locator('body').innerText())
    await page.screenshot({path:`${directory}/blocked.jpg`})
    await writeFile(`${directory}/console-errors.json`,JSON.stringify(consoleErrors,null,2))
    process.exitCode=1
  } finally { await browser.close() }
  process.exit(process.exitCode || 0)
}
try {
  if(phase.startsWith('profile-seeded')) {
    // Diagnostic-only: the legacy moving scenery uses Math.random. Pin its
    // own scatter stream, independent of Three UUID calls and shell counts.
    await page.route('**/src/environment/outdoor-environment.js*',async route=>{
      const response=await route.fetch()
      let source=await response.text()
      source=source.replaceAll('Math.random()','captureRandom()')
        .replace(/(function createOutdoorEnvironment\([^\n]+\)\s*\{)/,'$1\n captureSeed=7143;')
      source='let captureSeed=7143; function captureRandom(){captureSeed=(Math.imul(captureSeed,1664525)+1013904223)>>>0;return captureSeed/4294967296;}\n'+source
      await route.fulfill({response,body:source})
    })
  }
  await page.route('**/lvl3-review.html', route => route.fulfill({ contentType: 'text/html', body: '<html><body><script type="module" src="/scripts/lvl3-review-page.js"></script></body></html>' }))
  await page.goto(`${origin}/lvl3-review.html`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.review, null, { timeout: 120000 })
  console.log('Review harness ready')
  const evidence = {}
  for (const key of (process.argv[3] ? process.argv[3].split(',') : ['vault','convergence','mechanical','cargo','relay','security','passenger','cab'])) {
    const span = await page.evaluate(key => {
      review.start(key === 'cab' ? 'passenger' : key)
      return review.level.getCarriageVolumes().find(v => v.key === key)
    }, key)
    for (const mode of ['third','first']) {
      await page.evaluate(({ key, span, mode }) => review.pose(0, 0, key === 'vault' ? (span.minZ + span.maxZ) / 2 + 3 : span.maxZ - 1.5, mode), {key, span, mode})
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${directory}/${key}-${mode}.jpg`, type: 'jpeg', quality: 88 })
    }
    if (key === 'cargo' || key === 'security') {
      const center = (span.minZ + span.maxZ) / 2
      for (const [name, position, target] of [
        ['inside', [0,1.65,center+7], [-2.6,2.4,center+2]],
        ['outside', [-13,7,center+14], [0,1.5,center]],
        ['above', [-7,18,center+5], [0,0.5,center]]
      ]) {
        await page.evaluate(({position,target}) => review.cameraAt(position,target), {position,target})
        await page.waitForTimeout(800)
        await page.screenshot({ path: `${directory}/${key}-${name}.jpg`, type: 'jpeg', quality: 88 })
      }
    }
    await page.evaluate(() => review.stats())
    await page.waitForTimeout(4000)
    evidence[key] = await page.evaluate(() => review.stats())
    console.log(key, evidence[key].resources)
    if(phase.startsWith('profile')) {
      const center=(span.minZ+span.maxZ)/2
      await page.evaluate(({center,span})=>{review.pose(0,0,span.maxZ-1.5,'first');review.run(true)}, {center,span})
      await page.waitForTimeout(3000);await page.evaluate(()=>review.stats())
      await page.waitForTimeout(6000)
      evidence[`${key}-active`]=await page.evaluate(()=>review.stats())
      await page.evaluate(()=>review.run(false))
    }
  }
  if(phase==='states') {
    await page.evaluate(()=>{
      review.start('convergence');const span=review.level.getCarriageVolumes().find(v=>v.key==='convergence')
      review.pose(1.75,0,(span.minZ+span.maxZ)/2+7.4,'first');review.keys.duck=true;review.run(true)
    })
    await page.waitForTimeout(1200);await page.screenshot({path:`${directory}/convergence-low-first.jpg`})
    await page.evaluate(()=>{review.view.setMode('third');review.view.snap()})
    await page.waitForTimeout(500);await page.screenshot({path:`${directory}/convergence-low-third.jpg`})
    await page.evaluate(()=>{review.start('cargo');review.keys.duck=false;review.run(true)})
    await page.waitForTimeout(3500);await page.screenshot({path:`${directory}/cargo-failed.jpg`})
    await page.evaluate(()=>review.time.triggerRewind());await page.waitForTimeout(1200)
    await page.evaluate(()=>review.time.triggerFreeze());await page.waitForTimeout(400)
    await page.screenshot({path:`${directory}/cargo-restored-held.jpg`})
    await page.evaluate(()=>{review.start('security');review.time.triggerFreeze();review.run(true)})
    await page.waitForTimeout(1300);await page.screenshot({path:`${directory}/security-held-decks.jpg`})
    await page.evaluate(()=>{const v=review.level.getCarriageVolumes().find(v=>v.key==='security');review.pose(0,0,(v.minZ+v.maxZ)/2,'first')})
    await page.waitForTimeout(700);await page.screenshot({path:`${directory}/security-island.jpg`})
    await page.evaluate(()=>{review.start('passenger');review.run(true)})
    await page.waitForTimeout(5000)
    await page.evaluate(()=>{review.run(false);const p=review.player.mesh.position;review.cameraAt([p.x+8,5,p.z-5],[0,1,p.z+18])})
    await page.waitForTimeout(600);await page.screenshot({path:`${directory}/rearward-breakup.jpg`})
    evidence.states=await page.evaluate(()=>review.stats())
  }
  await writeFile(`${directory}/measurements.json`, JSON.stringify(evidence, null, 2))
} finally { await browser.close() }

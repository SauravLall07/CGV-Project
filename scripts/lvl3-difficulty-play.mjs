import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/hpars/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright')
const mode = process.argv[2] || 'cargo'
const directory = `reports/lvl3-difficulty/${mode}`
await mkdir(directory,{recursive:true})
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling']})
const page=await browser.newPage({viewport:{width:mode.includes('narrow')?900:1280,height:720}})
const result={errors:[],events:[]}
page.on('pageerror',e=>result.errors.push(e.message))
// Read-only handles in this diagnostic response only. Gameplay, collisions,
// controller, input, energy and render loop remain the main game's own.
await page.route('**/src/main.js*',async route=>{
  const response=await route.fetch()
  const body=(await response.text()).replace('window.levelManager = levelManager',
    'window.difficulty = {timeSystem, player, playerView, respawn}; window.levelManager = levelManager')
  await route.fulfill({response,body})
})
const state=()=>page.evaluate(()=>({position:difficulty.player.mesh.position.toArray(),energy:difficulty.timeSystem.getEnergy(),
  mode:difficulty.timeSystem.getMode(),view:difficulty.playerView.getMode(),failed:difficulty.respawn.isFailing(),level:levelManager.getState(),
  wave:scene.getObjectByName('time-wave')?.position.z,crouching:difficulty.player.isCrouching()}))
async function shot(name){await page.screenshot({path:`${directory}/${name}.jpg`});const s=await state();result.events.push({name,...s});console.log(name,JSON.stringify(s))}
async function move(keys,axis,target,direction,limit=12000){
  for(const key of keys)await page.keyboard.down(key)
  try {
    const s=await page.evaluate(({keys,axis,target,direction,limit})=>new Promise(resolve=>{
      const start=performance.now(), codes={w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',Shift:'ShiftLeft',x:'KeyX',Space:'Space'}
      function check(){
        const p=difficulty.player.mesh.position
        const reached=direction*(p.getComponent(axis)-target)>=0
        if(reached||difficulty.respawn.isFailing()||performance.now()-start>limit){
          for(const key of keys)window.dispatchEvent(new KeyboardEvent('keyup',{code:codes[key],key,bubbles:true}))
          resolve({reached,p:p.toArray(),failed:difficulty.respawn.isFailing()})
        }else requestAnimationFrame(check)
      }requestAnimationFrame(check)
    }),{keys,axis,target,direction,limit})
    if(!s.reached||s.failed)throw Error(`blocked movement ${JSON.stringify(s)} -> ${target}`)
  }finally{for(const key of keys)await page.keyboard.up(key)}
}
const wait=condition=>page.waitForFunction(condition,null,{timeout:20000})
async function enter(key){
  await page.evaluate(key=>levelManager.enter('Timewreck',{levelOptions:{startCarriage:key,debrisSeed:12345}}),key)
  await wait(()=>!levelManager.isTransitioning())
  return page.evaluate(key=>{const v=levelManager.carriageVolumes.find(v=>v.key===key);return(v.minZ+v.maxZ)/2},key)
}
async function cargo(c){
  await shot('01-protected-observation-third')
  await page.keyboard.press('v');await shot('02-protected-observation-first')
  await wait(()=>{const m=scene.getObjectByName('cargo-flying-brown-panel');return m.visible&&m.rotation.x<0.21})
  await move(['d','Shift'],0,1.7,1)
  await move(['w','Shift'],2,c+10.4,-1)
  await shot('03-right-burst')
  await wait(()=>!scene.getObjectByName('cargo-flying-brown-panel').visible)
  await move(['a','Shift'],0,-1.7,-1)
  await page.keyboard.press('v')
  await shot('04-clear-reposition')
  await wait(()=>{const m=scene.getObjectByName('cargo-flying-brown-panel-3');return m.visible&&m.rotation.x>0.6})
  await shot('05-left-burst')
  await wait(()=>!scene.getObjectByName('cargo-flying-brown-panel-3').visible)
  await page.waitForTimeout(1150)
  await move(['d','Shift'],0,0,1)
  await page.keyboard.press('c');await page.waitForTimeout(360);await page.keyboard.press('f')
  await move(['w','Shift'],2,c+3.15,-1)
  await shot('06-repaired-gangway-landing')
  await page.keyboard.press('f')
  await wait(()=>difficulty.timeSystem.getEnergy()>99&&scene.getObjectByName('cargo-loop-door').position.y>3.49)
  await page.keyboard.press('f');await move(['w','Shift'],2,c-3,-1)
  await page.keyboard.press('f');await move(['w','Shift'],2,c-5,-1)
  await wait(()=>difficulty.timeSystem.getEnergy()>99&&Math.abs(scene.getObjectByName('freight-pendulum').rotation.z)>0.8)
  await page.keyboard.press('f');await move(['w','Shift'],2,c-9,-1)
  await page.keyboard.press('f');await shot('07-freight-exit')
}
async function relayAndSecurity(){
  const centers=await page.evaluate(()=>Object.fromEntries(levelManager.carriageVolumes.map(v=>[v.key,(v.minZ+v.maxZ)/2])))
  const r=centers.relay, s=centers.security
  await move(['w','Shift'],2,r+2,-1)
  await wait(()=>difficulty.timeSystem.getEnergy()>99)
  await page.keyboard.press('g')
  await wait(()=>!difficulty.timeSystem.getGhost().isPlaying())
  await shot('08-relay-ghost-expired-on-pad')
  await wait(()=>difficulty.timeSystem.getEnergy()>99)
  await page.keyboard.press('g')
  await move(['d'],0,0.72,1)
  await move(['w','Shift'],2,r-1.95,-1)
  await move(['a'],0,0,-1)
  await move(['w'],2,r-3.8,-1)
  await wait(()=>document.body.innerText.includes('Latch emergency fire door open'))
  for(let attempt=0;attempt<3;attempt++) {
    await page.keyboard.press('e');await page.waitForTimeout(120)
    if(await page.evaluate(()=>scene.getObjectByName('relay-manual-catch').children.some(m=>m.rotation.z<-.7)))break
  }
  await wait(()=>scene.getObjectByName('relay-manual-catch').children.some(m=>m.rotation.z<-.7))
  if(await page.evaluate(()=>difficulty.timeSystem.getGhost().isPlaying()))await page.keyboard.press('g')
  await shot('09-relay-latched-ghost-cancelled')
  await move(['w','Shift'],2,s+7.15,-1)
  await wait(()=>difficulty.timeSystem.getEnergy()>99)
  await move(['a'],0,-0.9,-1)
  await page.keyboard.press('f')
  await page.waitForFunction(s=>levelManager.supports.some(p=>p.minZ>s+5&&p.y>0.1),s,{timeout:20000})
  await move(['w'],2,s+4.8,-1)
  await move(['w','d'],0,0.42,1)
  await move(['w'],2,s+0.4,-1)
  await page.keyboard.press('f')
  await shot('10-security-island')
  await move(['d'],0,0.52,1)
  await wait(()=>difficulty.timeSystem.getEnergy()>99)
  await page.keyboard.press('f')
  await page.waitForTimeout(300)
  await move(['w'],2,s-2.8,-1)
  await page.keyboard.down('Space')
  await move(['w','Shift'],2,s-6.4,-1)
  await page.keyboard.up('Space')
  await move(['w'],2,s-7.4,-1)
  await page.keyboard.press('f')
  await move(['a'],0,0,-1)
  await wait(()=>difficulty.timeSystem.getEnergy()>99)
  await shot('11-security-exit')
  await move(['w','Shift'],2,centers.passenger+8.5,-1)
  return centers.passenger
}
async function passenger(c){
  const crouchMode=mode.includes('hold')?'hold':'toggle'
  const desiredView=mode.includes('first')?'first':'third'
  if(await page.evaluate(()=>difficulty.playerView.getMode())!==desiredView)await page.keyboard.press('v')
  result.events.push({passengerView:await page.evaluate(()=>difficulty.playerView.getMode()),crouchMode})
  await page.evaluate(async value=>(await import('/src/core/settings.js')).settings.set('crouchMode',value),crouchMode)
  // Keep all decisions in one rAF input sequence so tool latency is not a
  // stationary wait during the chase. These are the reboundable keyboard events.
  const traversal=page.evaluate(({c,crouchMode})=>new Promise(resolve=>{
    const held=new Set(), events=[], start=performance.now()
    const codes={w:'KeyW',a:'KeyA',d:'KeyD',Shift:'ShiftLeft',x:'KeyX',Space:'Space',f:'KeyF'}
    let stage=0, stageAt=0, minGap=Infinity, minEnergy=Infinity
    window.difficultyStage=0
    function key(k,down){window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code:codes[k],key:k,bubbles:true}))}
    function set(keys){for(const k of held)if(!keys.includes(k)){key(k,false);held.delete(k)}for(const k of keys)if(!held.has(k)){key(k,true);held.add(k)}}
    function tap(k){key(k,true);key(k,false)}
    function next(){events.push({stage,p:difficulty.player.mesh.position.toArray(),energy:difficulty.timeSystem.getEnergy()});stage++;window.difficultyStage=stage;stageAt=performance.now()}
    function frame(){
      const p=difficulty.player.mesh.position, now=performance.now(), wave=scene.getObjectByName('time-wave')
      if(wave?.visible)minGap=Math.min(minGap,wave.position.z-p.z)
      minEnergy=Math.min(minEnergy,difficulty.timeSystem.getEnergy())
      if(difficulty.respawn.isFailing()||now-start>30000){set([]);resolve({failed:true,events,p:p.toArray(),minGap,minEnergy});return}
      switch(stage){
        case 0:set(['d','Shift']);if(p.x>=0.72)next();break
        case 1:set(['w','Shift']);if(p.z<=c+4.7){set([]);tap('f');next()}break
        case 2:set(['a','Shift']);if(p.x<=-0.65)next();break
        case 3:set(['w','Shift']);if(p.z<=c+2.8)next();break
        case 4:set(['d','Shift']);if(p.x>=0){set([]);next()}break
        case 5:if(levelManager.supports.some(s=>s.minZ<c+1.4&&s.maxZ>c+0.5&&s.y>0.2))next();break
        case 6:set(['w','Shift']);if(p.z<=c-3.65){tap('f');next()}break
        case 7:set(['w','Shift']);if(p.z<=c-4.1){set([]);if(crouchMode==='toggle')tap('x');next()}break
        case 8:set(crouchMode==='hold'?['w','x']:['w']);if(p.z<=c-5.1){set([]);if(crouchMode==='toggle')tap('x');next()}break
        case 9:set(['w','Shift']);if(p.z<=c-5.9){set([]);next()}break
        case 10:set(['w','Shift','Space']);if(p.z<c-7.5&&p.y<0.1){set([]);next()}break
        case 11:set(['w','Shift']);if(p.z<=scene.getObjectByName('emergency-brake').position.z+1.5){set([]);resolve({failed:false,events,p:p.toArray(),minGap,minEnergy});return}break
      }
      requestAnimationFrame(frame)
    }requestAnimationFrame(frame)
  }),{c,crouchMode})
  const captures=(async()=>{
    for(const [stage,name] of [[3,'passenger-left-decision'],[7,'passenger-collapse-landing'],[9,'passenger-duck-exit'],[11,'passenger-jump-landing']]) {
      await page.waitForFunction(stage=>window.difficultyStage>=stage,stage,{timeout:30000})
      await page.screenshot({path:`${directory}/${name}.jpg`})
    }
  })()
  const outcome=await traversal
  await captures.catch(error=>result.events.push({captureError:error.message}))
  result.events.push({passenger:outcome});console.log('Passenger',JSON.stringify(outcome))
  if(outcome.failed)throw Error('Passenger route failed')
  await shot('passenger-brake-approach')
  await page.keyboard.press('e')
  await wait(()=>levelManager.isCinematic()||levelManager.getState()==='Ending')
  await wait(()=>levelManager.getState()==='Ending'&&!levelManager.isTransitioning())
  await shot('brake-into-ending')
}
try{
  await page.goto(`http://127.0.0.1:5175/?start=level3-${mode.startsWith('passenger')?'passenger':'cargo'}`,{waitUntil:'domcontentloaded',timeout:120000})
  await page.getByRole('button',{name:/new game/i}).click({timeout:180000})
  await page.waitForFunction(()=>window.difficulty&&levelManager.getState()==='Timewreck'&&!levelManager.isTransitioning(),null,{timeout:180000})
  await page.evaluate(async tier=>(await import('/src/core/settings.js')).settings.set('renderQuality',tier),mode.includes('performance')?'performance':'high')
  if(mode.startsWith('passenger')){
    const c=await page.evaluate(()=>{const v=levelManager.carriageVolumes.find(v=>v.key==='passenger');return(v.minZ+v.maxZ)/2})
    if(mode.includes('first'))await page.keyboard.press('v')
    if(mode.includes('retry')) {
      await page.keyboard.press('f')
      await wait(()=>difficulty.timeSystem.getEnergy()<47)
      await page.keyboard.press('f')
      await page.keyboard.down('w');await page.keyboard.down('Shift')
      await wait(()=>difficulty.respawn.isFailing())
      await page.keyboard.up('w');await page.keyboard.up('Shift')
      await shot('blind-sprint-failure')
      await wait(()=>!difficulty.respawn.isFailing())
      result.events.push({retry:await state()})
      // Pausing must hold both wave and the new posture/collision state.
      await page.keyboard.press('Escape')
      const before=await state();await page.waitForTimeout(400);const after=await state()
      result.events.push({pause:{before,after}})
      await page.keyboard.press('Escape')
    }
    await passenger(c)
    if(mode.includes('repeat')) {
      await passenger(await enter('passenger'))
      await page.evaluate(()=>levelManager.restart())
      await page.waitForFunction(()=>!levelManager.isTransitioning(),null,{timeout:120000})
      await shot('restart-after-ending')
      await page.keyboard.press('Escape')
      const quit=page.getByRole('button',{name:/quit to (menu|title)/i})
      if(await quit.count())await quit.click()
      else await page.evaluate(()=>levelManager.unload())
      result.events.push({quit:{roots:await page.evaluate(()=>scene.children.map(n=>n.name))}})
    }
  }else{
    const c=await page.evaluate(()=>{const v=levelManager.carriageVolumes.find(v=>v.key==='cargo');return(v.minZ+v.maxZ)/2})
    if(mode.includes('retry')) {
      await page.keyboard.down('w');await page.keyboard.down('Shift')
      await wait(()=>difficulty.respawn.isFailing())
      await page.keyboard.up('w');await page.keyboard.up('Shift')
      await shot('cargo-blind-fall')
      await wait(()=>!difficulty.respawn.isFailing())
      result.events.push({cargoRetry:await state()})
      await page.keyboard.press('q');await page.waitForTimeout(400)
      result.events.push({slow:await state()})
      await page.keyboard.press('f');await page.waitForTimeout(150)
      result.events.push({freezeAfterSlow:await state()})
      await page.keyboard.press('f')
      await wait(()=>difficulty.timeSystem.getEnergy()>99)
    }
    await cargo(c)
    if(mode.startsWith('full'))await passenger(await relayAndSecurity())
    if(mode.includes('retry')) {
      await page.keyboard.press('r')
      await page.waitForFunction(()=>!levelManager.isTransitioning()&&difficulty.player.mesh.position.z>-3,null,{timeout:120000})
      await shot('cargo-keyboard-restart')
      await page.keyboard.press('Escape')
      await page.getByRole('button',{name:'Quit to Title',exact:true}).click()
      await page.getByRole('button',{name:/new game/i}).waitFor({timeout:120000})
      result.events.push({quit:{level:await page.evaluate(()=>levelManager.getState()),
        wreckRoots:await page.evaluate(()=>scene.children.filter(n=>n.name==='train-interior-wrecked').length)}})
      await page.screenshot({path:`${directory}/quit-to-title.jpg`})
    }
  }
}catch(error){result.failure=error.message;console.error(error.message);await shot('failure');process.exitCode=1}
finally{await writeFile(`${directory}/results.json`,JSON.stringify(result,null,2));await browser.close()}

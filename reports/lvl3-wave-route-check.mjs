import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/hpars/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright')
const dir = process.env.WAVE_REPORT_DIR || 'reports/lvl3-wave-restored-route'
await mkdir(dir, { recursive: true })
// Replay the existing real-controller integration route through actual game input.
const source = await readFile('tests/timewreck-escape.test.js', 'utf8')
const integration = source.indexOf("test('Integration: continuous Vault-to-brake")
let body = source.slice(source.indexOf('      const gates = []', integration),
  source.indexOf("      h.interactions.get('emergency-brake').onInteract()", integration))
body = body.replace(/      \/\/ Retry on the island[\s\S]*?(?=      move\('x', 0.52\))/, '')
body = body.replace("move('z', center(stage) - 4.4)", "move('z', center(stage) - 3.8)")
body = body.replace(/      assert.ok\(h.interactions.get\('relay-manual-catch'\).isEligible\(\)\)\s+h.interactions.get\('relay-manual-catch'\).onInteract\(\)/,
  "      await waitUntil(() => document.body.innerText.includes('Latch emergency fire door open')); tap('e'); await waitUntil(() => scene.getObjectByName('relay-manual-catch').children.some(m => m.rotation.z < -0.7))")
body = body.replace(/\b(move|waitUntil|recharge|repair|passengerRoute)\(/g, 'await $1(').replace(/h\.tick\(/g, 'await h.tick(').replace(/await await /g, 'await ')
body = body.replace("await recharge(); h.time.triggerFreeze()\n      await move('x', -0.9)",
  "await recharge(); await waitUntil(() => securityLaneClear(center(stage), 1)); h.time.triggerFreeze()\n      await move('x', -0.9)")
body = body.replace("h.time.triggerFreeze(); await h.tick(0.23)\n      await h.tick(0.81",
  "await waitUntil(() => securityLaneClear(center(stage), 2)); h.time.triggerFreeze(); await h.tick(0.23)\n      await h.tick(0.81")
for (const [next, cleared] of [['convergence','vault'],['mechanical','convergence'],['cargo','mechanical'],['relay','cargo'],['security','relay'],['passenger','security']]) {
  body = body.replace(`stage = '${next}'`, `await mark('${cleared}'); stage = '${next}'`)
}
body += "\n await mark('brake'); tap('e');"
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const result = { errors: [], captures: [] }
page.on('pageerror', e => result.errors.push(e.message))
await page.route('**/src/main.js*', async route => {
  const response = await route.fetch()
  await route.fulfill({ response, body: (await response.text()).replace('window.levelManager = levelManager',
    'window.waveRoute = {timeSystem, player, playerView, respawn}; window.levelManager = levelManager')
    .replace('createTimewreckLevel({...ctx,post})', 'createTimewreckLevel({...ctx,post,debrisSeed:12345})') })
})
try {
  await page.goto('http://127.0.0.1:5175/?start=level3')
  await page.getByRole('button', { name: /new game/i }).click({ timeout: 180000 })
  await page.waitForFunction(() => window.waveRoute && !levelManager.isTransitioning(), null, { timeout: 180000 })
  await page.evaluate(async () => {
    const { settings } = await import('/src/core/settings.js')
    settings.set('crouchMode', 'hold'); settings.set('renderQuality', 'performance')
  })
  await page.evaluate(body => {
    window.routeResult = { events: [], samples: [] }
    const r = window.routeResult, w = window.waveRoute, initialWave = scene.getObjectByName('time-wave')
    const centers = Object.fromEntries(levelManager.carriageVolumes.map(v => [v.key, (v.minZ + v.maxZ) / 2]))
    const codes = { forward:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD', run:'ShiftLeft', duck:'KeyX', jump:'Space', f:'KeyF', q:'KeyQ', c:'KeyC', g:'KeyG', e:'KeyE' }
    const held = new Set()
    const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: codes[k], key:k, bubbles:true }))
    const tap = k => { key(k,true); key(k,false) }
    const set = keys => {
      for (const k of held) if (!keys.includes(k)) { key(k,false); held.delete(k) }
      for (const k of keys) if (!held.has(k)) { key(k,true); held.add(k) }
    }
    const clock = () => w.timeSystem.getUniforms().uTime.value
    const state = () => ({ p:w.player.mesh.position.toArray(), wave:initialWave.position.z,
      gap:initialWave.position.z-w.player.mesh.position.z, energy:w.timeSystem.getEnergy(), mode:w.timeSystem.getMode() })
    const check = () => {
      if (w.respawn.isFailing()) throw Error('Caught: '+JSON.stringify(state()))
      if (scene.getObjectByName('time-wave') !== initialWave || !initialWave.visible) throw Error('Field disappeared/replaced')
    }
    let sampled = -1
    const frame = () => new Promise((resolve,reject) => requestAnimationFrame(() => {
      try {
        check()
        if (clock()-sampled >= 1) { r.samples.push(state()); sampled=clock() }
        resolve()
      } catch(e) { reject(e) }
    }))
    const waitUntil = async condition => { const start=clock(); while(!condition()) { check(); if(clock()-start>20)throw Error('Timed out: '+JSON.stringify(state())); await frame() } }
    const tick = async (seconds, keys={}) => { const start=clock(); set(Object.keys(keys).filter(k=>keys[k])); while(clock()-start<seconds)await frame(); set([]); check() }
    const mode = value => { const current=w.timeSystem.getMode(); if(current===value)return; tap(({FREEZE:'f',SLOW:'q',REWIND:'c'})[value==='NORMAL'?current:value]) }
    const h = { scene, player:w.player, respawn:w.respawn, level:levelManager, tick,
      time:{ setMode:mode, triggerFreeze:()=>tap('f'), triggerRewind:()=>tap('c'), triggerGhost:()=>tap('g'),
        resetGhost:()=>{if(w.timeSystem.getGhost().isPlaying())tap('g')}, getGhost:()=>w.timeSystem.getGhost() } }
    const assert = { ok:(v,message)=>{if(!v)throw Error(message||'Assertion failed')}, equal:(a,b,message)=>{if(a!==b)throw Error(message||`${a} != ${b}`)} }
    const move = async (axis,target,extra={}) => {
      const start=clock(), positive=w.player.mesh.position[axis]<target
      const direction=axis==='x' ? positive?'right':'left' : positive?'back':'forward'
      set([...Object.keys(extra).filter(k=>extra[k]), direction])
      while((positive?1:-1)*(target-w.player.mesh.position[axis])>0.025) { if(clock()-start>20)throw Error('Blocked '+axis+' -> '+target+' '+JSON.stringify(state())); await frame() }
      set([]); check()
    }
    const recharge = async () => { mode('NORMAL'); await tick(7) }
    // Observe the existing debris before freezing a pose across the marked decks.
    const securityLaneClear = (c,leg) => scene.getObjectByName('wreck-flying-panels').children.every(mesh => {
      if (!mesh.visible || !mesh.name.startsWith('security-flying-brown-panel')) return true
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)
      const minZ = leg===1 ? c+0.2 : c-7.6, maxZ = leg===1 ? c+7.6 : c-0.2
      return b.max.z<minZ || b.min.z>maxZ || b.max.x < -1.3 || b.min.x > 1.3 || b.min.y > 2.05 || b.max.y < 0
    })
    const repair = async (unused,name) => { await tick(1.4); await tick(14); tap('c'); await tick(0.55); assert.ok(scene.getObjectByName(name).children[0].position.y>3.5,'repair failed'); tap('f') }
    const mark = async name => { set([]); r.events.push({name,...state()}); window.routeMark=name; await waitUntil(()=>window.routeAck===name) }
    const passengerRoute = async (unused,c) => {
      const m=(axis,target,keys={})=>move(axis,target,{run:true,...keys})
      await m('x',0.72); await m('z',c+4.7); tap('f')
      await m('x',-0.65); await m('z',c+2.8); await m('x',0); await tick(0.22)
      await m('z',c-3.65); mode('NORMAL'); await m('z',c-4.1)
      await m('z',c-5.1,{duck:true}); await tick(0.03)
      await m('z',c-5.9); await tick(0.7,{forward:true,run:true,jump:true}); await tick(0.02)
      await m('z',scene.getObjectByName('emergency-brake').position.z+1.5)
    }
    r.running=true
    const run = new Function('h','move','waitUntil','recharge','repair','center','check','assert','passengerRoute','mark','tap','scene','securityLaneClear',
      "return (async()=>{let stage='vault';const route='direct',fps=60;await mark('spawn');"+body+"})()")
    run(h,move,waitUntil,recharge,repair,k=>centers[k],check,assert,passengerRoute,mark,tap,scene,securityLaneClear)
      .then(()=>{r.done=true;set([])}).catch(e=>{set([]);r.failure=e.message;r.done=true})
  }, body)
  for (const name of ['spawn','vault','convergence','mechanical','cargo','relay','security','brake']) {
    await page.waitForFunction(name => window.routeMark===name || window.routeResult?.done, name, { timeout: 180000 })
    const status = await page.evaluate(() => window.routeResult)
    if (status.failure) throw Error(status.failure)
    await page.screenshot({ path:`${dir}/${name}-forward.jpg` })
    await page.evaluate(() => waveRoute.playerView.setYaw(0))
    await page.screenshot({ path:`${dir}/${name}-behind.jpg` })
    await page.evaluate(name => { waveRoute.playerView.setYaw(Math.PI); window.routeAck=name }, name)
    result.captures.push(name); console.log(name,JSON.stringify(status.events.at(-1)))
  }
  await page.waitForFunction(()=>levelManager.getState()==='Ending'&&!levelManager.isTransitioning(),null,{timeout:60000})
  await page.screenshot({path:`${dir}/ending.jpg`})
  result.route=await page.evaluate(()=>window.routeResult)
} catch(e) { result.failure=e.message; result.route=await page.evaluate(()=>window.routeResult).catch(()=>null); await page.screenshot({path:`${dir}/failure.jpg`}); process.exitCode=1 }
finally { await writeFile(`${dir}/results.json`,JSON.stringify(result,null,2)); await browser.close() }

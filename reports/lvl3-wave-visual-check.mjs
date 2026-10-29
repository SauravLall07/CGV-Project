import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/hpars/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const result = { errors: [], events: [] }
const dir = process.env.WAVE_REPORT_DIR || 'reports/lvl3-wave-restored'
await mkdir(dir, { recursive: true })
page.on('pageerror', e => result.errors.push(e.message))
await page.route('**/src/main.js*', async route => {
  const response = await route.fetch()
  const body = (await response.text()).replace('window.levelManager = levelManager',
    'window.waveCheck = {timeSystem, player, playerView, respawn}; window.levelManager = levelManager')
  await route.fulfill({ response, body })
})
const state = () => page.evaluate(() => ({ z: waveCheck.player.mesh.position.z,
  wave: scene.getObjectByName('time-wave').position.z, mode: waveCheck.timeSystem.getMode(),
  energy: waveCheck.timeSystem.getEnergy(), failed: waveCheck.respawn.isFailing() }))
try {
  await page.goto('http://127.0.0.1:5175/?start=level3')
  await page.getByRole('button', { name: /new game/i }).click({ timeout: 180000 })
  await page.waitForFunction(() => window.waveCheck && !levelManager.isTransitioning(), null, { timeout: 180000 })
  result.events.push({ start: await state() })
  await page.screenshot({ path: `${dir}/vault-spawn-third.jpg` })
  await page.keyboard.press('v')
  await page.screenshot({ path: `${dir}/vault-spawn-first.jpg` })
  await page.evaluate(() => { waveCheck.playerView.setYaw(0); waveCheck.playerView.setPitch(0) })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${dir}/vault-wave-at-spawn.jpg` })
  await page.keyboard.press('f')
  await page.screenshot({ path: `${dir}/vault-wave-frozen.jpg` })
  const frozen = await state()
  await page.waitForTimeout(400)
  const held = await state()
  if (held.wave !== frozen.wave) throw Error('Freeze failed to hold the wave')
  result.events.push({ frozen, held })
  await page.keyboard.press('f')
  await page.screenshot({ path: `${dir}/vault-wave-purple.jpg` })
  await page.keyboard.press('Escape')
  const paused = await state()
  await page.waitForTimeout(400)
  const pausedAfter = await state()
  if (JSON.stringify(paused) !== JSON.stringify(pausedAfter)) throw Error('Pause changed pursuit state')
  result.events.push({ paused, pausedAfter })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => waveCheck.respawn.isFailing(), null, { timeout: 45000 })
  result.events.push({ caught: await state() })
  await page.waitForFunction(() => !waveCheck.respawn.isFailing())
  const retry = await state()
  if (retry.wave - retry.z < 5.3) throw Error('Retry did not restore wave lead')
  result.events.push({ retry })
  await page.screenshot({ path: `${dir}/vault-retry.jpg` })
} catch (e) { result.failure = e.message; process.exitCode = 1 }
finally { await writeFile(`${dir}/visual-results.json`, JSON.stringify(result, null, 2)); await browser.close() }

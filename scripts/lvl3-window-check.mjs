import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/hpars/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright')
const phase = process.argv[2] || 'after'
const directory = `reports/lvl3-windows/${phase}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = [], evidence = {}
page.on('pageerror', error => errors.push(error.message))
try {
  await page.route('**/lvl3-review.html', route => route.fulfill({ contentType: 'text/html', body: '<html><body><script type="module" src="/scripts/lvl3-review-page.js"></script></body></html>' }))
  await page.goto(`${process.env.LVL3_ORIGIN || 'http://127.0.0.1:5176'}/lvl3-review.html`, { timeout: 120000 })
  await page.waitForFunction(() => window.review, null, { timeout: 120000 })
  for (const key of ['vault','convergence','mechanical','cargo','relay','security','passenger','cab']) {
    const span = await page.evaluate(key => {
      review.start(key === 'cab' ? 'passenger' : key)
      return review.level.getCarriageVolumes().find(v => v.key === key)
    }, key)
    for (const mode of ['first','third']) {
      await page.evaluate(({span, mode}) => review.pose(0,0,span.maxZ-1.5,mode), {span,mode})
      await page.waitForTimeout(500)
      await page.screenshot({path:`${directory}/${key}-${mode}.jpg`,quality:85})
    }
    for (const side of [-1,1]) {
      await page.evaluate(({span,side}) => {
        const z = (span.minZ+span.maxZ)/2
        review.cameraAt([0,1.7,z+2],[side*3,1.7,z])
      }, {span,side})
      await page.waitForTimeout(400)
      await page.screenshot({path:`${directory}/${key}-side-${side}.jpg`,quality:85})
    }
    evidence[key] = await page.evaluate(key => {
      const glass = review.scene.getObjectByName(`wreck-window-glass-${key}`)
      const casing = review.scene.getObjectByName(`wreck-window-casing-${key}`)
      const {gpu,viewport,pixelRatio,exposure,resources,render} = review.stats()
      return { windows:casing?.count/2, intactPanes:glass?.count, transparent:glass?.material.transparent, opacity:glass?.material.opacity, gpu,viewport,pixelRatio,exposure,resources,render }
    },key)
    console.log(key, evidence[key].windows)
  }
  await writeFile(`${directory}/results.json`,JSON.stringify({errors,evidence},null,2))
  if (errors.length) throw new Error(errors.join('\n'))
} finally { await browser.close() }

// Dependency-free Chrome DevTools check. Optional CHROME_PATH override.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'chrono-audio-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9337', '--remote-allow-origins=*', '--autoplay-policy=document-user-activation-required',
  '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let browserError = ''
browser.stderr.on('data', data => { browserError = (browserError + data).slice(-4000) })
browser.on('error', error => { browserError = error.message })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, seconds = 30) {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) { try { const value = await fn(); if (value) return value } catch { /* starting */ } await delay(100) }
  throw Error('Browser check timed out; Chrome diagnostics: ' + browserError)
}
let ws, closeBrowser
try {
  console.log('Waiting for local Vite and Chrome DevTools...')
  const pages = await until(async () => {
    await fetch('http://127.0.0.1:4187/test/fixtures/audio-browser.html', { signal: AbortSignal.timeout(1000) })
    return (await fetch('http://127.0.0.1:9337/json', { signal: AbortSignal.timeout(1000) })).json()
  })
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('DevTools websocket unavailable')), 10000)
    ws.onopen = () => { clearTimeout(timer); resolve() }
    ws.onerror = error => { clearTimeout(timer); reject(error) }
  })
  let id = 0
  const calls = new Map()
  ws.onmessage = event => {
    const msg = JSON.parse(event.data)
    if (msg.id) { const entry = calls.get(msg.id); calls.delete(msg.id); msg.error ? entry.reject(Error(msg.error.message)) : entry.resolve(msg.result) }
  }
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id
    const timer = setTimeout(() => { calls.delete(callId); reject(Error('DevTools timed out: ' + method)) }, 10000)
    calls.set(callId, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    ws.send(JSON.stringify({ id: callId, method, params }))
  })
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text)
    return result.result?.value
  }
  closeBrowser = () => cdp('Browser.close').catch(() => {})
  await cdp('Page.navigate', { url: 'http://127.0.0.1:4187/test/fixtures/audio-browser.html' })
  await until(() => evaluate('window.audioReady'))
  const initial = await evaluate('window.audioInitialState')
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 18, button: 'left', clickCount: 1 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 18, button: 'left', clickCount: 1 })
  const result = await until(() => evaluate('window.audioResult'))
  console.log(JSON.stringify({ initial, ...result }, null, 2))
  if (!result.ok) process.exitCode = 1
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await closeBrowser?.()
  ws?.close()
  browser.kill(); server.kill()
  // The browser owns this OS temporary profile. Leave it for OS temp cleanup
  // if Chrome is still shutting down or Windows has files locked.
  await delay(300)
  if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('chrono-audio-')) {
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {})
  }
  browser.unref(); server.unref()
}

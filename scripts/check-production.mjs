// Build first. This checks local packaging/HTTP paths, not browser rendering.
import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
async function inventory(dir, prefix = '') {
  const result = []
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const relative = prefix + entry.name
    if (entry.isDirectory()) result.push(...await inventory(path.join(dir, entry.name), relative + '/'))
    else result.push(relative)
  }
  return result
}
const files = await inventory(dist)
assert.ok(files.includes('index.html'), 'Build first: dist/index.html is required')
const mount = '/chrono-express-qa/'
const refs = new Set()
let byteCount = 0
for (const file of files) {
  byteCount += (await stat(path.join(dist,file))).size
  if (!/\.(?:html|js|css)$/.test(file)) continue
  const text = await readFile(path.join(dist,file),'utf8')
  assert.ok(!/["'`]\/assets\//.test(text), `${file}: absolute-root asset URL`)
  const source = new URL(mount + file, 'http://127.0.0.1')
  if (file.endsWith('.html')) {
    for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!match[1].startsWith('data:') && !match[1].startsWith('http')) refs.add(new URL(match[1],source).pathname)
    }
  }
  for (const match of text.matchAll(/["'`]((?:\.\/)?(?:assets\/)?[^/"'`\n]*?-[\w-]{8}\.(?:js|css|fbx|glb|png|jpe?g|mp3|wav|wasm))["'`]/g)) {
    refs.add(new URL(match[1],source).pathname)
  }
}
assert.ok(refs.size > 40, `Expected a substantial asset inventory, found ${refs.size}`)
const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)
    const relative = pathname.slice(mount.length)
    // Exact inventory membership also checks case on case-insensitive hosts.
    if (!pathname.startsWith(mount) || !files.includes(relative)) {res.writeHead(404).end();return}
    res.writeHead(200, {'Content-Length':(await stat(path.join(dist,relative))).size})
    if(req.method === 'HEAD') res.end()
    else res.end(await readFile(path.join(dist,relative)))
  } catch {res.writeHead(500).end()}
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
try {
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const reference of refs) {
    assert.ok(reference.startsWith(mount), `Escaped subdirectory: ${reference}`)
    const response = await fetch(origin + reference, {method:'HEAD'})
    assert.equal(response.status,200,reference)
  }
  console.log(`Production packaging: ${files.length} files, ${(byteCount/1024/1024).toFixed(2)} MiB; ${refs.size} asset references pass case-sensitive subdirectory HTTP checks.`)
  console.log('This does not verify rendering, shader compilation, gameplay, FPS, memory or remote deployment.')
} finally {await new Promise(resolve => server.close(resolve))}

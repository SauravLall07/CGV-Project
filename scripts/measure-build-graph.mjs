// Local emitted bytes and module ownership; not transferred bytes or timings.
// node scripts/measure-build-graph.mjs
import { build } from 'vite'
import { gzipSync } from 'node:zlib'

const result = await build({ logLevel: 'silent', build: { write: false } })
const output = result.output
const chunks = output.filter(item => item.type === 'chunk')
const moduleOwners = new Map()
for (const chunk of chunks) for (const id of chunk.moduleIds) {
  moduleOwners.set(id, (moduleOwners.get(id) ?? 0) + 1)
}
const entry = chunks.find(chunk => chunk.isEntry)
const initial = new Set()
function visit(fileName) {
  if (initial.has(fileName)) return
  initial.add(fileName)
  for (const dependency of chunks.find(chunk => chunk.fileName === fileName)?.imports ?? []) visit(dependency)
}
visit(entry.fileName)
const summary = {
  files: output.length,
  totalBytes: output.reduce((sum, item) => sum + (item.type === 'chunk' ? Buffer.byteLength(item.code) : Buffer.byteLength(item.source)), 0),
  entryBytes: Buffer.byteLength(entry.code), entryGzipBytes: gzipSync(entry.code).length,
  initialJavaScriptBytes: chunks.filter(chunk => initial.has(chunk.fileName)).reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
  initialJavaScriptGzipBytes: chunks.filter(chunk => initial.has(chunk.fileName)).reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0),
  workshopShipped: chunks.some(chunk => /__model-workshop|chrono-express-model-workshop/.test(chunk.code)),
  duplicateModuleIds: [...moduleOwners].filter(([, owners]) => owners > 1).map(([id]) => id),
  threePackageRoots: [...new Set(chunks.flatMap(chunk => chunk.moduleIds)
    .filter(id => id.includes('/node_modules/three/')).map(id => id.split('/node_modules/three/')[0] + '/node_modules/three'))],
  cannonPackageRoots: [...new Set(chunks.flatMap(chunk => chunk.moduleIds)
    .filter(id => id.includes('/node_modules/cannon-es/')).map(id => id.split('/node_modules/cannon-es/')[0] + '/node_modules/cannon-es'))],
  chunks: chunks.map(chunk => ({ file: chunk.fileName, bytes: Buffer.byteLength(chunk.code),
    initial: initial.has(chunk.fileName), moduleCount: chunk.moduleIds.length,
    cannonModules: chunk.moduleIds.filter(id => id.includes('/cannon-es/')).length,
    threeCoreModules: chunk.moduleIds.filter(id => /\/three\/build\//.test(id)).length,
    levelModules: chunk.moduleIds.filter(id => /\/levels\/(moving-heist|timewreck)\.js$/.test(id)).map(id => id.split('/').at(-1)),
    imports: chunk.imports, dynamicImports: chunk.dynamicImports }))
}
console.log(JSON.stringify(summary, null, 2))

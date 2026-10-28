// Read-only replay of the preserved pre-rebuild source; no checkout or file swap.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createServer } from 'vite'
const revision = 'bd92a56e2c85d5322f188fe96afa58eeefb8039b'
const files = execFileSync('git',['ls-tree','-r','--name-only',revision,'src'],{encoding:'utf8'}).trim().split(/\r?\n/)
const baseline = new Map(files.filter(file=>file.endsWith('.js')).map(file=>[
  path.resolve(file).replaceAll('\\','/'),execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8',maxBuffer:4*1024*1024})
]))
const server=await createServer({configFile:false,base:'./',assetsInclude:['**/*.fbx'],
  plugins:[{name:'read-only-lvl3-baseline',enforce:'pre',load(id){return baseline.get(id.split('?')[0])}}],
  server:{host:'127.0.0.1',port:5176,strictPort:true}})
await server.listen()
console.log(`Baseline ${revision} on http://127.0.0.1:5176 (current working tree untouched)`)

// Serve the exact untouched implementation baseline without changing checkout.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createServer } from 'vite'
const revision = 'e87e45d'
const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'src'],{encoding:'utf8'}).trim().split(/\r?\n/)
const baseline=new Map(files.filter(file=>file.endsWith('.js')).map(file=>[
  path.resolve(file).replaceAll('\\','/'),execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8',maxBuffer:4*1024*1024})
]))
const server=await createServer({configFile:false,base:'./',assetsInclude:['**/*.fbx'],
  plugins:[{name:'difficulty-read-only-baseline',enforce:'pre',load(id){return baseline.get(id.split('?')[0])}}],
  server:{host:'127.0.0.1',port:5177,strictPort:true}})
await server.listen()
console.log(`Read-only ${revision} baseline: http://127.0.0.1:5177`)

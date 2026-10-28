import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCarriageEnvironment } from '../src/environment/carriages.js'
import { WRECK_DAMAGE } from '../src/environment/wreck-damage.js'
import { listCarriageVolumes, listCarriageWallBoxes } from '../src/environment/carriage-bounds.js'
import { wreckMinimapFloors } from '../src/ui/minimap.js'
import { createWreckVisibility } from '../src/environment/wreck-visibility.js'
import { createWreckRetirement } from '../src/environment/wreck-ownership.js'
import { createTimewreckExterior } from '../src/environment/timewreck-exterior.js'
import { disposeObject } from '../src/core/dispose.js'
import { createSkyDome } from '../src/environment/sky-dome.js'
import { useCapturedSkyBackground } from '../src/environment/sky-environment.js'

test('every L3 tear passes through wall, panes, lining and roof, retaining floor names and sheltered ends', () => {
  const env = createCarriageEnvironment({damaged:true})
  env.root.updateMatrixWorld(true)
  try {
    for (const [key,cut] of Object.entries(WRECK_DAMAGE)) {
      const car = env.carriages[key], span = env.spans[key]
      assert.ok(car.getObjectByName(`floor-${key}`))
      const z = span.center+cut.minZ+(cut.maxZ-cut.minZ)*0.37
      const ray = new THREE.Raycaster(new THREE.Vector3(0,2.5,z),new THREE.Vector3(cut.side,0,0),0,4)
      const solidHits = ray.intersectObject(car,true).filter(hit=>hit.object.visible)
      assert.equal(solidHits.length,0,`${key}: real open wall ray`)
      ray.set(new THREE.Vector3(cut.side*1.8,3.22,z),new THREE.Vector3(0,1,0))
      assert.equal(ray.intersectObject(car,true).length,0,`${key}: real open roof ray`)
      ray.set(new THREE.Vector3(-cut.side*2.0,3.22,span.maxZ-0.6),new THREE.Vector3(0,1,0))
      assert.ok(ray.intersectObject(car,true).length,`${key}: retained shelter`)
      const roof = car.getObjectByName(`ceiling-${key}`)
      assert.notEqual(roof.geometry.type,'BoxGeometry')
      assert.ok(Array.from(roof.geometry.attributes.normal.array).every(Number.isFinite))
      assert.deepEqual(roof.material.map.repeat.toArray(),[1,1])
      car.traverse(node=>{
        if (node.userData.wreckTorn) {
          assert.equal(node.parent,car)
          assert.notEqual(node.userData.minimapFloor,true)
          assert.notEqual(node.userData.wreckOccluder,true)
        }
      })
    }
    assert.deepEqual(env.interiorBounds,{minX:-2.3000000000000003,maxX:2.3000000000000003,minZ:-93.8,maxZ:86})
  } finally { disposeObject(env.root) }
})

test('retained storm panes use the scaled carriage clock through Freeze and reverse to the same texture pose', () => {
  const env=createCarriageEnvironment({damaged:true})
  try {
    const pane=env.carriages.cargo.getObjectByName('wreck-window-glass-cargo')
    env.update(0.5);pane.onBeforeRender()
    const offset=pane.material.map.offset.x
    env.update(0);pane.onBeforeRender();assert.equal(pane.material.map.offset.x,offset)
    env.update(0.4);pane.onBeforeRender();assert.notEqual(pane.material.map.offset.x,offset)
    env.update(-0.4);pane.onBeforeRender();assert.equal(pane.material.map.offset.x,offset)
  } finally {disposeObject(env.root)}
})

test('new structure clears the traversable body/jump volume and Cargo gap has no loose floor furniture', () => {
  const env = createCarriageEnvironment({damaged:true})
  env.root.updateMatrixWorld(true)
  try {
    const matrix = new THREE.Matrix4(), box = new THREE.Box3()
    for (const [key,car] of Object.entries(env.carriages)) {
      const span = env.spans[key]
      const art=[]; car.traverse(node=>{if(node.userData.wreckTorn)art.push(node)})
      // Rays across the entire player width at standing and maximum jump-head
      // heights cannot hit the new hull/guard/fold geometry.
      for (let z=span.minZ+0.5;z<span.maxZ-0.5;z+=0.17) for(const y of [0.2,0.55,0.9,1.15,1.4,1.65,1.85,2.2,2.65,3.0]) {
        const ray=new THREE.Raycaster(new THREE.Vector3(-2.48,y,z),new THREE.Vector3(1,0,0),0,4.96)
        assert.equal(ray.intersectObjects(art).length,0,`${key}: clearance at ${z}, ${y}`)
      }
      if(key==='cargo') car.traverse(node=>{
        if(!node.isInstancedMesh || node.name !== 'cargo-luggage-bodies')return
        for(let i=0;i<node.count;i++){
          node.getMatrixAt(i,matrix);box.setFromBufferAttribute(node.geometry.attributes.position).applyMatrix4(matrix)
          assert.ok(box.max.z<=3.8 || box.min.z>=8.6,'no luggage left over the gangway void')
        }
      })
    }
  } finally { disposeObject(env.root) }
})

test('map shows solid wall runs and dashed guards; voids retain only actual registered supports', () => {
  const volumes=listCarriageVolumes({cargo:{minZ:-14,maxZ:14,center:0},cab:{minZ:-22,maxZ:-14,center:-18}})
  const cargo=volumes.find(v=>v.key==='cargo'),cut=WRECK_DAMAGE.cargo
  const walls=listCarriageWallBoxes(cargo)
  assert.ok(walls.some(v=>v.kind==='boundary'))
  assert.ok(walls.filter(v=>v.kind==='wall' && v.maxX<-2).every(v=>v.maxZ<=cut.minZ||v.minZ>=cut.maxZ||v.maxZ-v.minZ<0.2))
  const hole={minX:-2.6,maxX:2.6,minZ:3.8,maxZ:8.6}
  const support={minX:-0.8,maxX:0.8,minZ:3.8,maxZ:5.8,y:0.1}
  const floors=wreckMinimapFloors([cargo],[hole],[support])
  const at=(x,z)=>floors.some(v=>x>v.minX&&x<v.maxX&&z>v.minZ&&z<v.maxZ)
  assert.equal(at(0,4.5),true)
  assert.equal(at(2,4.5),false)
  assert.equal(at(0,7),false)
  assert.equal(at(0,2),true)
})

test('torn boxes cannot become full occluders and retired world-coordinate visuals reset without reparenting', () => {
  const root=new THREE.Group(),car=new THREE.Group();root.add(car)
  const panel=new THREE.Mesh(new THREE.BoxGeometry(2,3,0.1),new THREE.MeshStandardMaterial())
  panel.position.set(1,1.5,0);panel.userData.wreckOccluder=true;panel.userData.wreckTorn=true;car.add(panel)
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.5,3);camera.lookAt(0,1.5,0);camera.updateMatrixWorld()
  const visibility=createWreckVisibility({root,carriages:{cargo:car},spans:{cargo:{minZ:-5,maxZ:5}},wallX:2.6,ceilingY:3.5})
  visibility.beforeRender(camera)
  assert.equal(visibility.getStats().panels,0)
  visibility.dispose()
  const source=new THREE.PointLight();source.visible=false;source.userData.lightPoolSource=true;car.add(source)
  const retired=createWreckRetirement([car,car])
  retired.apply(true);assert.equal(car.visible,false);assert.equal(source.userData.lightPoolOff,true)
  retired.apply(false);assert.equal(car.visible,true);assert.equal(source.visible,false)
  assert.equal(source.userData.lightPoolOff,undefined);assert.equal(car.parent,root)
  const counts=new Map();root.traverse(n=>{if(n.geometry){counts.set(n.geometry,0);n.geometry.addEventListener('dispose',()=>counts.set(n.geometry,counts.get(n.geometry)+1))}})
  disposeObject(root);assert.ok([...counts.values()].every(count=>count===1))
})

test('exterior scraps clear the entire shell, while named track cues stay below the floor', () => {
  const exterior=createTimewreckExterior({minZ:-90,maxZ:90})
  const box=new THREE.Box3(),matrix=new THREE.Matrix4()
  try {
    for(const dt of [0,0.1,0.5,1,2]) {
      exterior.update(dt)
      exterior.group.traverse(node=>{
        if(!node.isInstancedMesh)return
        for(let i=0;i<node.count;i++){
          node.getMatrixAt(i,matrix);box.setFromBufferAttribute(node.geometry.attributes.position).applyMatrix4(matrix)
          if(node.name.startsWith('wreck-underfloor'))assert.ok(box.max.y<0)
          else assert.ok(box.max.x < -2.6 || box.min.x > 2.6,'exterior fragment cannot enter shell')
        }
      })
    }
  } finally { exterior.dispose() }
})

test('cached L3 sky shares its existing capture, keeps grade uniforms and leaves render-target disposal to the level', () => {
  const sky=createSkyDome('timewreck'),texture=new THREE.Texture()
  let oldMaterial=0,textures=0
  sky.mesh.material.addEventListener('dispose',()=>oldMaterial++)
  texture.addEventListener('dispose',()=>textures++)
  const release=useCapturedSkyBackground(sky,texture)
  assert.equal(oldMaterial,1)
  assert.equal(sky.mesh.material.envMap,texture)
  assert.equal(sky.mesh.material.uniforms.stormGrade,sky.uniforms.uGrade)
  release();sky.dispose();assert.equal(textures,0)
  texture.dispose();assert.equal(textures,1)
})

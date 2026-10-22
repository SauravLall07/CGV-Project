import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAIL_OFFSET } from '../entities/train.js'
import { woodMaterial } from './textures.js'
import { disposeObject } from '../core/dispose.js'

export const TRACK_RAIL_TOP = 0
export const TRACK_LENGTH = 112
export function createEndingTrack() {
  const root = new THREE.Group(); root.name = 'ending-track'; root.visible = false
  const timber = woodMaterial({repeat:[1,8],seed:181,light:0x3b2d22,dark:0x100e0c,roughness:0.9})
  const steel = new THREE.MeshStandardMaterial({color:0x555b62,roughness:0.4,metalness:0.85})
  const woodParts=[],steelParts=[]
  function box(parts,w,h,d,x,y,z) {
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);parts.push(geometry)
  }
  for(let z=0.45;z<TRACK_LENGTH;z+=0.7) box(woodParts,2.5,0.14,0.23,0,-0.31,z)
  // Rail head is exactly y=0, matching the factory's wheel rolling radius.
  for(const side of [-1,1]) {
    box(steelParts,0.12,0.10,TRACK_LENGTH,side*RAIL_OFFSET,-0.05,TRACK_LENGTH/2)
    box(steelParts,0.045,0.12,TRACK_LENGTH,side*RAIL_OFFSET,-0.16,TRACK_LENGTH/2)
    box(steelParts,0.20,0.04,TRACK_LENGTH,side*RAIL_OFFSET,-0.24,TRACK_LENGTH/2)
    box(woodParts,0.20,0.50,TRACK_LENGTH,side*1.68,-0.58,TRACK_LENGTH/2)
  }
  for(let z=0.25;z<TRACK_LENGTH;z+=0.5) box(woodParts,3.55,0.12,0.47,0,-0.44,z)
  for(const [name,parts,material] of [['timber',woodParts,timber],['rails',steelParts,steel]]) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name='ending-track-'+name
    root.add(mesh);parts.forEach(geometry=>geometry.dispose())
  }
  let disposed=false
  return {root,railTop:TRACK_RAIL_TOP,railOffset:RAIL_OFFSET,
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();disposeObject(root)}}
}

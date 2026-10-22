import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ENDING_DOOR_HOLE } from '../shaders/ending-time-damage.js'
import { woodMaterial } from './textures.js'

export const DOOR_WIDTH = 1.3
export const DOOR_HEIGHT = 2.1
export const DOOR_FLOOR_Y = 1.55
export const DOOR_Z = 7.5
export const DOOR_OPEN_ANGLE = THREE.MathUtils.degToRad(172)
export const DOOR_MOTION_SECONDS = 0.6
export const CORRIDOR_DEPTH = 3.5
export const RUN_IN = 1
export const RUN_RADIUS = 0.4
export const RUN_CORRIDOR = 3.4
export const RUN_DISTANCE = RUN_IN+Math.PI*RUN_RADIUS/2+RUN_CORRIDOR

export function createEndingDoor(pivot, source) {
  const root = new THREE.Group(); root.name = 'ending-doorway'; pivot.add(root)
  root.position.z = DOOR_Z
  // Source materials and texture wrappers are already ending-owned clones.
  const paint = source.paint.clone(), brass = source.brass.clone()
  // Local copies of the damaged cab's look; no Level 3 builders or resources.
  const wood = woodMaterial({repeat:[1,2],light:0x5a8a80,dark:0x1e3a34,roughness:0.5,seed:151})
  wood.color.setHex(0xd2ebe4)
  const floor = woodMaterial({repeat:[2,2],light:0x7a5234,dark:0x2e1a10,roughness:0.42,seed:153})
  floor.color.setHex(0xead2b6)
  const ceiling = woodMaterial({repeat:[2,1],light:0x6a4a2e,dark:0x2e1a10,roughness:0.58,seed:155})
  ceiling.color.setHex(0xe8d2b4)
  const lamp = new THREE.MeshStandardMaterial({color:0xffe2b0,emissive:0xffc27a,emissiveIntensity:1.4,roughness:0.35})
  const velvet = new THREE.MeshStandardMaterial({color:0x7a2430,roughness:0.92,emissive:0x1a0608,emissiveIntensity:0.1})
  const dark = new THREE.MeshStandardMaterial({color:0x060908,roughness:1})
  const batches = new Map(), hinges = []
  function box(parent, material, w,h,d,x,y,z,role='solid') {
    const geometry = new THREE.BoxGeometry(w,h,d); geometry.translate(x,y,z)
    geometry.computeBoundingBox();geometry.userData.endingSolid={bounds:geometry.boundingBox.clone(),role}
    if (!batches.has(parent)) batches.set(parent,new Map())
    const group = batches.get(parent)
    if (!group.has(material)) group.set(material,[])
    group.get(material).push(geometry)
  }
  box(root,floor,2.95,0.06,1.9,-0.075,DOOR_FLOOR_Y-0.03,0,'floor')
  // +Z is screen-right in B. Keep that wall closed; leave a -Z corridor portal.
  box(root,wood,2.6,2.15,0.06,0,2.625,0.95)
  box(root,wood,0.7,2.15,0.08,-0.95,2.625,-0.95,'occluder')
  box(root,wood,0.4,2.15,0.08,1.1,2.625,-0.95)
  box(root,ceiling,2.95,0.06,1.9,-0.075,3.68,0)
  // Sealed dog-leg corridor: floor, ceiling, camera-side wall, far wall and cap.
  const corridorLength=4.1,corridorZ=-0.95-corridorLength/2
  box(root,floor,1.5,0.06,corridorLength,0.15,DOOR_FLOOR_Y-0.03,corridorZ,'floor')
  box(root,ceiling,1.5,0.08,corridorLength,0.15,3.68,corridorZ)
  box(root,wood,0.08,2.15,corridorLength,-0.6,2.625,corridorZ,'occluder')
  box(root,dark,0.08,2.15,corridorLength,0.9,2.625,corridorZ)
  box(root,dark,1.58,2.15,0.08,0.15,2.625,-5.05,'back')
  for(const z of [-1.7,-3.7]) {
    box(root,lamp,0.1,0.16,0.18,0.82,3.2,z)
    box(root,brass,0.05,0.25,0.22,0.86,3.1,z)
  }
  for(const side of [-1,1]) {
    box(root,lamp,0.18,0.16,0.16,0.45,3.15,side*0.86)
    box(root,brass,0.04,0.2,0.18,0.45,3.0,side*0.84)
  }
  box(root,dark,0.08,2.15,1.9,1.34,2.625,0,'back')
  // Brake-room identity: brass instrument cabinet, amber firebox slots, red lever.
  box(root,wood,0.6,0.75,0.12,0.45,2.1,0.84)
  box(root,brass,0.65,0.04,0.16,0.45,2.5,0.82)
  for(const x of [0.25,0.45,0.65]) box(root,lamp,0.04,0.22,0.025,x,2.05,0.765)
  box(root,velvet,0.06,0.4,0.06,0.75,2.55,0.75)
  box(root,brass,0.14,0.04,DOOR_WIDTH,-1.43,DOOR_FLOOR_Y,0)
  box(root,brass,0.5,0.06,1.45,-1.7,1.3,0)
  for (const z of [-0.7,0.7]) {
    box(root,paint,0.11,2.25,0.1,-1.49,2.6,z)
  }
  box(root,paint,0.1,0.1,1.5,-1.49,3.7,0)
  box(root,lamp,0.18,0.16,0.24,1.17,3.35,0)
  for (const side of [-1,1]) {
    const hinge = new THREE.Group(); hinge.name = 'ending-door-leaf'
    hinge.position.set(-1.485,0,side*DOOR_WIDTH/2);root.add(hinge)
    const width=DOOR_WIDTH/2-0.012, center=-side*DOOR_WIDTH/4
    box(hinge,paint,0.03,DOOR_HEIGHT-0.02,width,0.015,2.6,center)
    for (const y of [1.69,2.08,2.4,3.14,3.53])
      box(hinge,brass,0.012,0.018,width-0.08,-0.006,y,center)
    for (const edge of [-1,1])
      box(hinge,brass,0.012,DOOR_HEIGHT-0.24,0.018,-0.006,2.6,center+edge*(width/2-0.04))
    box(hinge,wood,0.042,0.62,width-0.12,0.012,2.88,center)
    box(hinge,wood,0.012,0.48,width-0.12,0.036,1.91,center)
    box(hinge,brass,0.04,0.14,0.03,-0.04,2.24,-side*(DOOR_WIDTH/2-0.06))
    hinges.push({hinge,side})
  }
  for (const [parent,groups] of batches) for (const [material,parts] of groups) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),material)
    mesh.userData.endingSolids=parts.map(part=>part.userData.endingSolid)
    parent.add(mesh);parts.forEach(part=>part.dispose())
  }
  const glowMaterial = new THREE.ShaderMaterial({
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,
    forceSinglePass:true,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;void main(){float a=pow(max(0.0,1.0-length(vUv-0.5)*2.0),2.0);gl_FragColor=vec4(1.0,0.65,0.27,a*0.4);}'
  })
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.7),glowMaterial)
  glow.rotation.y=-Math.PI/2;glow.position.set(1.05,3.35,0);root.add(glow)
  let openness=0
  function setOpen(value) {
    openness=THREE.MathUtils.clamp(value,0,1)
    for (const {hinge,side} of hinges) hinge.rotation.y=side*DOOR_OPEN_ANGLE*openness
  }
  const standingVolume=new THREE.Box3(new THREE.Vector3(-1.65,DOOR_FLOOR_Y+0.04,-0.32),new THREE.Vector3(-0.85,DOOR_FLOOR_Y+1.95,0.32))
  function standingIntersections() {
    root.updateWorldMatrix(true,true)
    const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),bounds=new THREE.Box3()
    let count=0
    root.traverse(node=>{
      if(!node.isMesh||!node.userData.endingSolids)return
      matrix.multiplyMatrices(inverse,node.matrixWorld)
      if(node.userData.endingSolids.some(solid=>solid.role!=='floor'&&solid.role!=='back'&&bounds.copy(solid.bounds).applyMatrix4(matrix).intersectsBox(standingVolume)))count++
    })
    return count
  }
  function sampleRun(distance,position=new THREE.Vector3(),tangent=new THREE.Vector3()) {
    const d=THREE.MathUtils.clamp(distance,0,RUN_DISTANCE),arc=Math.PI*RUN_RADIUS/2
    if(d<=RUN_IN) {position.set(-1.25+d,DOOR_FLOOR_Y,DOOR_Z);tangent.set(1,0,0)}
    else if(d<=RUN_IN+arc) {
      const angle=(d-RUN_IN)/RUN_RADIUS
      position.set(-0.25+RUN_RADIUS*Math.sin(angle),DOOR_FLOOR_Y,DOOR_Z+RUN_RADIUS*(Math.cos(angle)-1))
      tangent.set(Math.cos(angle),0,-Math.sin(angle))
    } else {position.set(0.15,DOOR_FLOOR_Y,DOOR_Z-RUN_RADIUS-(d-RUN_IN-arc));tangent.set(0,0,-1)}
    return {position,tangent}
  }
  function fullyOccluded(cameraPosition,actorPosition) {
    root.updateWorldMatrix(true,true)
    const inverse=root.matrixWorld.clone().invert(),origin=cameraPosition.clone().applyMatrix4(inverse)
    const centre=actorPosition.clone().applyMatrix4(inverse),ray=new THREE.Ray(),point=new THREE.Vector3(),hit=new THREE.Vector3()
    const walls=[]
    for(const node of root.children)for(const solid of node.userData.endingSolids??[])if(solid.role==='occluder')walls.push(solid.bounds)
    // Conservative running-body envelope, including arms, checked at 12 corners.
    for(const x of [-0.45,0.45])for(const y of [0.08,1,1.95])for(const z of [-0.45,0.45]) {
      point.set(centre.x+x,DOOR_FLOOR_Y+y,centre.z+z)
      const distance=origin.distanceTo(point);ray.set(origin,point.clone().sub(origin).normalize())
      if(!walls.some(wall=>ray.intersectBox(wall,hit)&&origin.distanceTo(hit)<distance-0.02))return false
    }
    return true
  }
  return {root,hinges,hole:ENDING_DOOR_HOLE,setOpen,get openness(){return openness},
    standingVolume,standingIntersections,sampleRun,fullyOccluded,runDistance:RUN_DISTANCE,
    inside:new THREE.Vector3(-0.25,DOOR_FLOOR_Y,DOOR_Z),
    corridorDepth:CORRIDOR_DEPTH,
    runEnd:sampleRun(RUN_DISTANCE).position,
    threshold:new THREE.Vector3(-1.25,DOOR_FLOOR_Y,DOOR_Z)}
}

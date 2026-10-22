import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { woodMaterial, carpetMaterial } from './textures.js'
import { CARRIAGE_HOLES, createDamageUniforms, patchEndingLamp, LAMP_FLICKER_GLSL } from '../shaders/ending-time-damage.js'

function coloredBox(parts, color, w, h, d, x, y, z) {
  const indexed = new THREE.BoxGeometry(w, h, d)
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed
  if (geometry !== indexed) indexed.dispose()
  geometry.translate(x, y, z)
  const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry)
}

// Static ripped sheet metal. Extrusion sidewalls are rust, outside is paint,
// inside is dark steel; each flap stays hinged to its carriage.
export function createTornFlaps(pivot, holes, paint = 0x2c4a36, boiler = false) {
  const shape = new THREE.Shape()
  shape.moveTo(-0.55, 0); shape.lineTo(0.55, 0)
  for (const [x, y] of [[0.48,0.55],[0.28,0.43],[0.2,0.92],[-0.08,0.65],[-0.3,0.82],[-0.5,0.47]]) shape.lineTo(x,y)
  shape.closePath()
  const template = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false })
  const colors = new Float32Array(template.attributes.position.count * 3)
  for (let n = 0; n < template.attributes.position.count; n++) {
    const normal = template.attributes.normal.getZ(n)
    const color = new THREE.Color(normal > 0.5 ? paint : normal < -0.5 ? 0x252a30 : 0x8a4b22)
    colors.set([color.r, color.g, color.b], n * 3)
  }
  template.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const pieces = [], descriptions = [], pose = new THREE.Object3D()
  for (const hole of holes) {
    for (let n = 0; n < 6; n++) {
      const roof = n >= 3, z = hole.center.z + (n % 3 - 1) * hole.halfSize.z * 0.72
      pose.position.set(roof ? 0.24 : -1.48, roof ? 4.22 : 1.28, z)
      if (boiler) pose.position.set(-0.76, hole.center.y + (roof ? 0.5 : -0.5), z)
      pose.rotation.set(0, -Math.PI / 2, roof ? -0.9 : 0)
      pose.rotateX(THREE.MathUtils.degToRad(roof ? 35 + n * 5 : 25 + n * 15))
      pose.scale.set(1.05, roof ? 0.8 : 0.7, 1)
      if (boiler) pose.scale.set(0.65,0.5,1)
      pose.updateMatrix()
      const geometry = template.clone().applyMatrix4(pose.matrix)
      geometry.computeBoundingBox()
      descriptions.push({ bounds: geometry.boundingBox.clone(), angle: roof ? 35 + n * 5 : 25 + n * 15 })
      pieces.push(geometry)
    }
  }
  template.dispose()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85,
    metalness: 0.15, side: THREE.DoubleSide, emissive: 0x17130e, emissiveIntensity: 0.12 })
  const mesh = new THREE.Mesh(mergeGeometries(pieces), material)
  pieces.forEach(piece => piece.dispose())
  mesh.name = 'ending-peeled-metal'; mesh.userData.flaps = descriptions
  pivot.add(mesh)
  return mesh
}

function addBrokenFrame(pivot, holes) {
  const parts = []
  let ribs = 0
  for (const hole of holes) {
    for (let z = hole.center.z - hole.halfSize.z + 0.65; z < hole.center.z + hole.halfSize.z; z += 1.2) {
      const snapped = ribs % 3 === 1
      coloredBox(parts, 0x302c24, 0.08, snapped ? 1.1 : 2.35, 0.1, -1.38, snapped ? 1.85 : 2.47, z)
      if (snapped) {
        const start = parts.length
        coloredBox(parts, 0x302c24, 0.08, 0.75, 0.1, 0, 0.375, 0)
        parts[start].rotateZ(-0.55); parts[start].translate(-1.38, 2.4, z)
      }
      ribs++
    }
    for (const sign of [-1, 1]) {
      const z = hole.center.z + sign * hole.halfSize.z
      coloredBox(parts, 0x71572b, 0.1, 0.08, 0.8, -1.5, 3.15, z)
      coloredBox(parts, 0x71572b, 0.1, 0.65, 0.07, -1.5, 2.85, z + sign * 0.35)
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, emissive: 0x21180e, emissiveIntensity: 0.15
  }))
  parts.forEach(part => part.dispose())
  mesh.name = 'ending-broken-frame'; mesh.userData.ribCount = ribs; pivot.add(mesh)
  return mesh
}

// Ending-owned interior geometry only; nothing detaches from the train.
function createSteamRoom(pivot) {
  const wall=woodMaterial({repeat:[1,6],light:0x5a8a80,dark:0x1e3a34,roughness:0.5,seed:151});wall.color.setHex(0xd2ebe4)
  const floor=woodMaterial({repeat:[2,9],light:0x7a5234,dark:0x2e1a10,roughness:0.42,seed:153});floor.color.setHex(0xead2b6)
  const ceiling=woodMaterial({repeat:[2,6],light:0x6a4a2e,dark:0x2e1a10,roughness:0.58,seed:155});ceiling.color.setHex(0xe8d2b4)
  const brass=new THREE.MeshStandardMaterial({color:0xb08d3f,roughness:0.3,metalness:0.9})
  const dial=new THREE.MeshStandardMaterial({color:0xf2ead6,emissive:0xffcf8a,emissiveIntensity:1.55,roughness:0.5})
  const fire=new THREE.MeshStandardMaterial({color:0x2a2218,emissive:0xff8a3c,emissiveIntensity:1.65,roughness:0.55,metalness:0.45})
  const batches=new Map(),meshes=[]
  const add=(material,geometry)=>{if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geometry)}
  const box=(material,w,h,d,x,y,z)=>add(material,new THREE.BoxGeometry(w,h,d).translate(x,y,z))
  box(floor,2.65,0.1,19.4,0,1.50,0)
  box(wall,0.09,2.45,16,1.29,2.77,-1.7)
  for(const z of [-9.7,9.7])box(wall,2.65,2.45,0.08,0,2.77,z)
  box(ceiling,2.65,0.08,19.4,0,3.98,0)
  // Keep waist rails outside the doorway and its entire inward approach.
  for(const x of [-1.1,1.1])for(const [from,to] of [[-9.5,6.3],[8.7,9.5]])
    box(brass,0.05,0.04,to-from,x,2.6,(from+to)/2)
  for(const z of [-8,-4,0,4])box(brass,2.4,0.06,0.09,0,3.8,z)
  // Brake-room backhead, five pressure dials, firebox and regulator levers.
  box(wall,0.35,1.5,2.2,1.02,2.45,-3)
  box(brass,0.04,1.35,2.05,0.82,2.45,-3)
  for(const [z,y] of [[-3.62,2.87],[-3,2.95],[-2.38,2.87],[-3.35,2.5],[-2.65,2.5]]) {
    add(dial,new THREE.CylinderGeometry(0.13,0.13,0.05,16).rotateZ(Math.PI/2).translate(0.78,y,z))
    add(brass,new THREE.TorusGeometry(0.14,0.02,8,16).rotateY(Math.PI/2).translate(0.74,y,z))
  }
  box(fire,0.12,0.6,0.9,0.76,1.97,-3)
  for(let z=-3.35;z<-2.6;z+=0.12)box(brass,0.04,0.48,0.035,0.68,1.97,z)
  for(const z of [-4,-2])add(brass,new THREE.CylinderGeometry(0.035,0.045,0.8,10).rotateX(0.35).translate(0.72,2.1,z))
  for(const [material,parts] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name='ending-steam-room-interior'
    parts.forEach(part=>part.dispose());pivot.add(mesh);meshes.push(mesh)
  }
  return meshes
}
export function createEndingDebris(root, carriages) {
  const shells = [], uniforms = [], glows = []
  const wood = woodMaterial({ repeat: [1, 4], light: 0x8a5c33, dark: 0x452a16 })
  const tableWood = woodMaterial({ light: 0x5a3418, dark: 0x2a160a })
  const carpet = carpetMaterial({ repeat: [1, 8], base: 0x5a1620, accent: 0xa07a3a })
  const velvet = new THREE.MeshStandardMaterial({ color: 0x7a1e24, roughness: 0.9 })
  const velvetDark = new THREE.MeshStandardMaterial({ color: 0x5a1419, roughness: 0.92 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.65, metalness: 0.6 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x8aa6a8, roughness: 0.2, metalness: 0.25 })
  for (const material of [wood, tableWood, carpet, velvet, velvetDark, brass, steel, glass]) {
    material.emissive.copy(material.color); material.emissiveIntensity = 0.22
    if (material.map) material.emissiveMap = material.map
  }
  for (let i = 0; i < carriages.length; i++) {
    const pivot = carriages[i], hole = CARRIAGE_HOLES[i][0], center = hole.center.z
    createTornFlaps(pivot, CARRIAGE_HOLES[i]); addBrokenFrame(pivot, CARRIAGE_HOLES[i])
    if(i===0){shells.push(...createSteamRoom(pivot));continue}
    const effects = createDamageUniforms(CARRIAGE_HOLES[i]); uniforms.push(effects)
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff0d6, emissive: 0xffd49a, emissiveIntensity: 1.6, roughness: 0.6 })
    patchEndingLamp(lamp, effects)
    const batches = new Map(), pose = new THREE.Object3D()
    function add(material, geometry, x, y, z, rx = 0, ry = 0, rz = 0, matrix = null) {
      geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z)
      if (matrix) geometry.applyMatrix4(matrix)
      const ready = geometry.index ? geometry.toNonIndexed() : geometry
      if (ready !== geometry) geometry.dispose()
      if (!batches.has(material)) batches.set(material, [])
      batches.get(material).push(ready)
    }
    function box(material, w, h, d, x, y, z, matrix = null) {
      add(material, new THREE.BoxGeometry(w,h,d), x,y,z,0,0,0,matrix)
    }
    box(wood, 2.65, 0.1, 19.4, 0,1.25,0)
    box(wood, 0.09, 2.7, 19.4, 1.29,2.64,0)
    for (const z of [-9.7,9.7]) box(wood, 2.65,2.7,0.08,0,2.64,z)
    // Solid far wall and far ceiling prevent sky showing through the destroyed side.
    box(wood, 1.0,0.08,19.4,0.82,3.98,0)
    const from = Math.max(-9.7, center-hole.halfSize.z-0.4), to = Math.min(9.7, center+hole.halfSize.z+0.4)
    if (from > -9.7) box(wood,2.65,0.08,from+9.7,0,3.98,(-9.7+from)/2)
    if (to < 9.7) box(wood,2.65,0.08,9.7-to,0,3.98,(to+9.7)/2)
    box(carpet,1.8,0.018,19.1,0,1.31,0)
    for (const x of [-0.92,0.92]) box(brass,0.04,0.012,19.1,x,1.325,0)
    for (const y of [2.24,3.85]) box(tableWood,0.055,0.06,19.2,1.22,y,0)
    for (let z=-9.3;z<9.4;z+=0.7) box(tableWood,0.025,2.5,0.035,1.23,2.64,z)
    // Faithful Level 2 bench construction, narrowed to the platform train shell.
    for (const booth of [center-1.6,center+1.6]) for (const dir of [-1,1]) {
      const knocked = dir === -1 && booth > center
      pose.position.set(0.25,1.31,booth+dir*0.9)
      pose.rotation.set(knocked ? 0.35 : 0, dir > 0 ? 0 : Math.PI, knocked ? -0.18 : 0)
      pose.updateMatrix()
      const matrix = pose.matrix
      box(steel,1.05,0.3,0.45,0,0.15,0,matrix)
      box(velvet,1.05,0.16,0.55,0,0.38,0,matrix)
      box(velvet,1.05,1.05,0.14,0,0.525,0.345,matrix)
      for (const y of [0.7,0.9]) box(velvetDark,0.95,0.03,0.15,0,y,0.345,matrix)
      for (const x of [-0.3,0,0.3]) box(velvetDark,0.025,0.6,0.025,x,0.7,0.26,matrix)
      box(brass,1.05,0.05,0.18,0,1.1,0.345,matrix)
      for (const x of [-0.49,0.49]) {
        box(brass,0.06,1.23,0.06,x,0.615,0.345,matrix)
        box(brass,0.07,0.07,0.51,x,0.62,0,matrix)
      }
    }
    const glowParts = []
    function glow(x,y,z,wall = false) {
      const geometry = new THREE.PlaneGeometry(0.65,0.65)
      geometry.rotateY(wall ? -Math.PI/2 : 0)
      geometry.translate(x,y,z); glowParts.push(geometry)
    }
    for (const z of [center-1.6,center+1.6]) {
      box(tableWood,0.84,0.05,0.68,0.35,2.05,z)
      box(brass,0.86,0.02,0.7,0.35,2.025,z)
      add(steel,new THREE.CylinderGeometry(0.05,0.14,0.7,10),0.35,1.66,z)
      add(brass,new THREE.CylinderGeometry(0.06,0.08,0.04,12),0.53,2.095,z)
      add(brass,new THREE.CylinderGeometry(0.012,0.012,0.3,6),0.53,2.24,z)
      add(lamp,new THREE.CylinderGeometry(0.08,0.15,0.16,14,1,true),0.53,2.41,z)
      glow(0.53,2.41,z+0.02)
    }
    for (const z of [center-2.8,center,center+2.8]) {
      box(brass,0.03,0.22,0.12,1.2,3.26,z)
      add(lamp,new THREE.CylinderGeometry(0.06,0.09,0.16,8),1.05,3.36,z)
      glow(1.02,3.36,z,true)
    }
    // Brass luggage rack rails and brackets copied from Level 2.
    for (const x of [0.64,1.12]) add(brass,new THREE.CylinderGeometry(0.02,0.02,7.2,8),x,3.67,center,Math.PI/2)
    for (let z=center-3.2;z<center+3.3;z+=1.6) box(brass,0.62,0.03,0.04,0.88,3.65,z)
    for (const z of [center-2.4,center+2.4]) box(tableWood,0.46,0.26,0.7,0.88,3.82,z)
    const debrisBounds = []
    for (let n=0;n<8;n++) {
      const z=center+(n-3.5)*0.55, x=-0.7+(n%3)*0.36
      const geometry = n%3 === 0 ? new THREE.CircleGeometry(0.13,3) : new THREE.BoxGeometry(0.07,0.04,0.55)
      if (n%3 === 0) geometry.rotateX(-Math.PI/2)
      geometry.rotateY(n*0.7); geometry.translate(x,1.35,z)
      geometry.computeBoundingBox(); debrisBounds.push(geometry.boundingBox.clone())
      add(n%3===0 ? glass : tableWood,geometry,0,0,0)
    }
    for (const [material,parts] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(parts),material)
      parts.forEach(part=>part.dispose())
      mesh.name = 'ending-damage-interior'; mesh.userData.debrisBounds = debrisBounds
      pivot.add(mesh); shells.push(mesh)
    }
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: effects.uTime, uRift: effects.uRift },
      transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
      side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:LAMP_FLICKER_GLSL+'varying vec2 vUv;uniform float uTime;uniform float uRift;void main(){float a=pow(max(0.0,1.0-length(vUv-0.5)*2.0),3.0);float flicker=mix(1.0,endingLampFlicker(uTime,2.1),uRift);gl_FragColor=vec4(1.0,0.61,0.23,a*0.5*flicker);}'
    })
    const mesh = new THREE.Mesh(mergeGeometries(glowParts),glowMaterial)
    glowParts.forEach(part=>part.dispose())
    mesh.name='ending-interior-lamp-glows';pivot.add(mesh);glows.push(mesh)
  }
  return { shells, glows, uniforms }
}

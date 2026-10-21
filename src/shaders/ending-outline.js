import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DAMAGE_DECLARATIONS } from './ending-time-damage.js'

export const OUTLINE_WIDTH = 0.05
export const OUTLINE_COLOR = 0x4aa8ff

function outlineMaterial(damage) {
  return new THREE.ShaderMaterial({
    uniforms: { ...damage, uWidth: { value: OUTLINE_WIDTH }, uColor: { value: new THREE.Color(OUTLINE_COLOR) } },
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, toneMapped: false,
    vertexShader: `
      uniform float uWidth;
      varying vec3 vDamageLocal;
      void main() {
        vec4 local=vec4(position,1.0);
        vec3 n=normal;
        #ifdef USE_INSTANCING
          local=instanceMatrix*local;
          n=mat3(instanceMatrix)*n;
        #endif
        vDamageLocal=local.xyz;
        vec4 view=modelViewMatrix*local;
        vec3 viewNormal=normalize(normalMatrix*n);
        // Keep the nominal five-centimetre shell readable over the shot's depth range.
        view.xyz+=viewNormal*uWidth*clamp(-view.z/100.0,0.8,1.2);
        gl_Position=projectionMatrix*view;
      }
    `,
    fragmentShader: DAMAGE_DECLARATIONS + `
      uniform vec3 uColor;
      void main() {
        for(int h=0;h<4;h++) {
          vec2 field=damageEdge(vDamageLocal,uHoles[h]);
          if(field.y<0.0 && field.x<0.0) discard;
        }
        float pulse=0.92+0.08*sin(uTime*1.7);
        gl_FragColor=vec4(uColor*1.8,uRift*pulse*0.85);
      }
    `
  })
}

// Merge the opaque exterior batches by vehicle and damage field. Interior and
// transparent effects are excluded. Every resulting geometry belongs to the ending.
export function createEndingOutline(pivots) {
  const meshes = []
  for (const pivot of pivots) {
    pivot.updateWorldMatrix(true, true)
    const inverse = pivot.matrixWorld.clone().invert(), groups = new Map(), instances = []
    pivot.traverse(node => {
      if (!node.isMesh || node.name === 'ending-damage-interior') return
      const material = Array.isArray(node.material) ? node.material[0] : node.material
      const damage = material?.userData.endingTimeDamage
      if (!damage || material.transparent) return
      if (node.isInstancedMesh) { instances.push({ node, damage }); return }
      const geometry = new THREE.BufferGeometry()
      for (const name of ['position', 'normal']) geometry.setAttribute(name, node.geometry.getAttribute(name).clone())
      if (node.geometry.index) geometry.setIndex(node.geometry.index.clone())
      const ready = geometry.index ? geometry.toNonIndexed() : geometry
      if (ready !== geometry) geometry.dispose()
      ready.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld))
      if (!groups.has(damage)) groups.set(damage, [])
      groups.get(damage).push(ready)
    })
    for (const [damage, parts] of groups) {
      const mesh = new THREE.Mesh(mergeGeometries(parts), outlineMaterial(damage))
      parts.forEach(part => part.dispose())
      mesh.name = 'ending-blue-outline'; mesh.userData.endingDecoration = true
      pivot.add(mesh); meshes.push(mesh)
    }
    for (const { node, damage } of instances) {
      const mesh = new THREE.InstancedMesh(node.geometry.clone(), outlineMaterial(damage), node.count)
      // The matrices are owned by the ending's source mesh and updated with the wheels.
      mesh.instanceMatrix = node.instanceMatrix
      mesh.name = 'ending-blue-outline'; mesh.userData.endingDecoration = true
      mesh.frustumCulled = false; node.parent.add(mesh); meshes.push(mesh)
    }
  }
  return { meshes }
}

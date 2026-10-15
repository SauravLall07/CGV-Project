# Chrono Express performance baseline

Recorded 15 October 2026, Africa/Johannesburg. This is the pre-optimization baseline. Only documentation was created. [Audit findings](PERFORMANCE_AUDIT.md) and [implementation plan](PERFORMANCE_OPTIMIZATION_PLAN.md) distinguish measured evidence from risks and hypotheses.

## What was actually measured

| Metric | Result | Interpretation / limitation |
|---|---|---|
| Production output | 53 files, 76,154,769 B (72.63 MiB) | Fresh Vite production output held in memory with `build.write=false`; existing `dist/` untouched. Not initial network transfer. |
| Entry JavaScript | 1,511,152 B; local gzip 443,703 B; local Brotli 359,997 B | Compression using Node zlib defaults. Not measured server response sizes. |
| Async DRACO loader chunk | 7,398 B; gzip 2,950 B; Brotli 2,673 B | Decoder support assets are separate emitted files. Lazy import is not the same as fetching all decoder binaries. |
| Asset/reference packaging | PASS: 52 references; 53 files | In-memory adaptation of `scripts/check-production.mjs`: case-sensitive inventory membership and HEAD requests under `/chrono-express-qa/`, no root `/assets/` paths. Local HTTP only; no rendering/deployment claim. |
| Correctness tests | 89 passed; 0 failed/skipped/cancelled; 44,837.4094 ms suite duration | `npm.cmd test`, Node test runner plus existing asset hook. Duration includes intentional asynchronous timer tests and concurrent execution; not a benchmark. |
| Source syntax | 122 modules checked, 0 failures | `node --check` for every `src/**/*.js`. |
| Source inventory | 122 JS files, 47,395 lines by newline splitting | Includes development modules and unreachable legacy helpers; line count includes terminal empty lines. |
| Asset inventory | 52 files including 2 text attribution/readme files | Full-file SHA-256 scan: no identical whole files. Embedded duplicates separately measured below. |
| L2/L3 construction, CPU-only updates and census | Tables below | Actual game factories/time/player logic; browser drawing and HUD mocked. Not FPS, browser CPU use, gameplay completion, GPU work or real character animation. |
| Guard refresh dependence | 0.399078 / 0.797242 / 1.911735 rad at 30/60/144 FPS after 1 s | Direct `createStealthSystem` reproduction of ALERT lost-target search; real function, no code change. |
| Average / 1% low FPS | **Not measured** | No browser available. Do not derive from CPU-only update timing. |
| Browser frame-time distribution / spikes | **Not measured** | Node update duration excludes rendering and browser scheduling. |
| CPU/GPU utilization, GPU pass time | **Not measured** | No live browser, graphics context, timer-query samples or OS utilization trace. |
| Browser heap / VRAM / decoded audio | **Not measured** | Census is object/resource identity counting, not residency. |
| GC frequency / pause duration | **Not measured** | No browser allocation/GC trace collected. Node outliers cannot be attributed to GC without a trace. |
| Initial usable/load/asset time | **Not measured in browser** | Emitted bytes and mocked construction do not substitute for cold/warm browser timings. |
| Input-to-visible latency | **Not measured** | Simulation ordering inspected; no physical or browser input-to-presentation capture. |
| Long-session and restart memory trends | **Not measured in browser** | Three mocked constructions/teardowns per L2/L3 tested scene removal only. |

## Environment and constraints

- Windows `10.0.19045`, x64; Intel Core i7-6600U @ 2.60 GHz, 4 logical processors; OS-reported RAM 8,236,654,592 B (about 7.67 GiB).
- Node `v24.13.1`; npm `11.8.0`; installed Vite `8.2.2`, Three `0.185.1`, Cannon ES `0.20.0`.
- Browser/version, physical GPU, driver, display refresh, power mode and real viewport: unavailable. Mock harness specifies only `innerWidth=1280`, DPR=1, not a rendered viewport.
- The available `cua.getState()` inventory returned `apps: []`, `browsers: []`. Thus no local game UI, GPU trace, browser profiler or automated browser gameplay was accessible through the provided UI surface. No substitute browser/package was installed.
- PowerShell blocks `npm.ps1` under execution policy; `npm.cmd` works without changing policy. Git ownership warning was handled with the per-command `-c safe.directory=...` option, not a global configuration change.
- Existing `dist/` was stale relative to current source and deliberately neither rebuilt nor used for a gameplay baseline. Vite's JS API generated fresh output entirely in memory. No benchmark script, screenshot, build artifact or application change was written; no package installation or cache-writing build was invoked.
- Installed optional Vite peer/platform packages reported as unmet are optional; build succeeded. No duplicate runtime library versions appeared in `npm.cmd ls --all`. No dependency update/install was performed.

## Production inventory

| Extension | Files | Bytes |
|---|---:|---:|
| `.fbx` | 13 | 28,425,664 |
| `.mp3` | 5 | 28,370,855 |
| `.jpg` | 8 | 7,447,936 |
| `.glb` | 12 | 6,181,236 |
| `.js` | 5 | 2,355,179 |
| `.wav` | 4 | 2,303,418 |
| `.png` | 3 | 591,873 |
| `.wasm` | 2 | 478,167 |
| `.html` | 1 | 441 |
| **Total** | **53** | **76,154,769** |

The five JS files are the entry, DRACO loader chunk, and three decoder JS support files. The support files plus WASM total 1,314,796 B; they are emitted because the decoder module references them. The audited GLBs list no Draco extension, so this is a packaging cost, not evidence of 1.31 MB of boot decoder traffic.

Entry module contributors reported by Vite's pre-final-minification `renderedLength`: Three module 531,533 characters, Three core 482,948, Cannon 158,392, carriages 113,320, Timewreck 100,708, Moving Heist 89,241, GLTFLoader 82,638, FBXLoader 82,636. These are diagnostic contributor sizes, not separately downloadable/minified byte counts; do not add them to the entry size.

Development editor and overlay bodies were removed. Their surviving top-level residues report 97 and 103 pre-minification characters. `Model Workshop` and `dev-render-overlay` strings are absent; recurring `mixer.update #` and music diagnostic strings are present. No source maps were emitted. Relative `base: './'` was retained.

The first build-plus-analysis command took 7,922.78 ms **including gzip/Brotli compression and output analysis**. It did not isolate Vite build time and must not be quoted as a pure build-duration benchmark. No production HTTP encoding/cache headers were sampled.

## Asset evidence

Largest individual source assets:

| Asset | Bytes |
|---|---:|
| `src/assets/models/police/Walking With Shopping Bag.fbx` | 11,661,296 |
| `src/assets/models/detective/Idle.fbx` | 11,395,520 |
| `src/assets/audio/music/menu-theme.mp3` | 8,225,055 |
| `src/assets/audio/music/level3-final-count.mp3` | 8,130,268 |
| `src/assets/audio/music/level1-constance.mp3` | 5,614,341 |
| `src/assets/audio/music/level2-mistake-the-getaway.mp3` | 4,906,857 |
| `src/assets/audio/music/victory-theme.mp3` | 1,494,334 |
| `src/assets/textures/nature/forest-ground-nor.jpg` | 1,428,763 |

Header parsing, not image decoding, established these dimensions:

- All eight nature surface JPEGs: 1024x1024 each; 7,447,936 compressed bytes total.
- Nature GLBs: one mesh/primitive each; 2,248-3,000 triangles/model. Tree images: 1024x512 or 1536x512; other nature images: 512x512. Torch: one primitive, 1,464 triangles, four 512x512 embedded images.
- Emitted backdrop PNGs: broadleaf 512x512; two pine cards 256x512.
- Source-only images not emitted: night mountains 1024x512, cracked stone 463x295, train tracks 418x220. Source-only FBXs not emitted: detective Walking and Jumping.

SHA-256 of embedded GLB bufferView image bytes confirmed four duplicate pairs:

| Pair | Excess identical embedded payload |
|---|---:|
| `fern.glb` / `fern-b.glb`, image 0 | 22,202 B |
| Same pair, image 1 | 293,677 B |
| `rock-moss-a.glb` / `rock-moss-b.glb`, image 0 | 38,625 B |
| Same pair, image 1 | 37,728 B |
| **Total** | **392,232 B** |

This excludes container/externalization overhead and is not a promised final download saving. Eight 1024-square RGBA8 textures with mip chains approximate `8 * 1024 * 1024 * 4 * 4/3 = 42.67 MiB`; this is a capacity model, not measured GPU allocation. Actual formats, mips, sharing and driver behavior can differ. MP3 durations/channels/sample rates and PCM cache size were not decoded/measured; use `duration * sampleRate * channels * 4` only after reading actual AudioBuffer properties.

## CPU-only scene microbenchmark

One Node process sequentially built Moving Heist three times, then Timewreck three times. Each run created a fresh scene/player/time system. Existing procedural texture caches persisted between runs. Canvas pixel arrays existed, but drawing methods were no-ops; image elements never decoded. HUD/interaction/camera/respawn were controlled stubs. No asset loader, real FBX characters, AudioContext, WebGLRenderer, post, minimap or visibility-render hooks were executed.

Each run advanced a stationary spawn for 900 simulated ticks at delta=1/60. The first 300 were warmup; the next 600 measured `time.update`, `level.update`, `player.update` and one `scene.updateMatrixWorld` using performance.now. These loops ran as fast as Node allowed, not at wall-clock 60 FPS. Samples include any incidental Node/system scheduling pauses. Console output was suppressed during this harness only. No memory/GC instrumentation was enabled. Samples were sorted; P99 uses nearest-rank index `ceil(n*.99)-1`.

| Level/run | Build ms | Mean update ms | P99 update ms | Max update ms | Dispose ms |
|---|---:|---:|---:|---:|---:|
| L2 initial | 1,021.8894 | 1.8411 | 3.5290 | 14.3958 | 6.7488 |
| L2 repeat 1 | 461.3845 | 1.8251 | 3.1664 | 8.6444 | 3.0217 |
| L2 repeat 2 | 420.5846 | 1.6447 | 3.0696 | 5.2058 | 2.5238 |
| L3 first in same process | 832.7287 | 0.9962 | 2.1202 | 2.4844 | 3.3822 |
| L3 repeat 1 | 89.3760 | 1.1904 | 2.2026 | 3.0000 | 2.8881 |
| L3 repeat 2 | 78.0164 | 1.0187 | 2.0798 | 9.1748 | 2.3493 |

L3's first run is not a fully cold process: shared L2 imports/texture caches already existed. Differences across runs combine cache reuse, JIT, allocation/GC and machine noise. No optimization was made between runs, so none of these differences is a before/after improvement.

| Scene census before simulated updates | L2, all 3 runs | L3, all 3 runs |
|---|---:|---:|
| Object3D nodes | 3,394 | 2,311 |
| Mesh nodes | 3,069 | 2,018 |
| Unique geometry identities | 2,773 | 1,772 |
| Unique material identities | 272 | 317 |
| Meshes with castShadow=true | 346 | 132 |
| PointLight nodes, including hidden pool sources | 115 | 55 |
| Allocated mesh triangles, including instances/hidden objects | 269,092 | 136,478 / 135,410 / 135,350 |
| Scene children after level/time disposal | 1 | 1 |

The surviving child is the persistent player. Counts are **not draw calls**, visible light counts, triangles actually rasterized, or GPU resource counters. L3 generated triangle counts varied across constructions; the harness did not seed all procedural randomness. L1 was inspected statically, not run in this mocked benchmark. Demanding scenes and restarts need real browser sampling.

Reproduce this microbenchmark from repository root in PowerShell without creating a script file:

```powershell
@'
import * as THREE from 'three';
import {performance} from 'node:perf_hooks';
const pixels=(w,h)=>({data:new Uint8ClampedArray(w*h*4)});
const context=new Proxy({
  createImageData:pixels,
  getImageData:(_x,_y,w,h)=>pixels(w,h),
  measureText:t=>({width:String(t).length*8}),
  createLinearGradient:()=>({addColorStop(){}}),
  createRadialGradient:()=>({addColorStop(){}})
},{get:(target,key)=>target[key]??(()=>{})});
globalThis.document={
  createElement:()=>({getContext:()=>context}),
  createElementNS:()=>({addEventListener(){},removeEventListener(){}})
};
globalThis.window={devicePixelRatio:1,innerWidth:1280};
const {createPlayer}=await import('./src/entities/player.js');
const {createTimeSystem}=await import('./src/systems/time-system.js');
const {createMovingHeistLevel}=await import('./src/levels/moving-heist.js');
const {createTimewreckLevel}=await import('./src/levels/timewreck.js');
const log=console.log; console.log=()=>{}; console.warn=()=>{};
for(const [name,create] of [
  ['MovingHeist',createMovingHeistLevel],['Timewreck',createTimewreckLevel]
]) {
  const runs=[];
  for(let run=0;run<3;run++) {
    const scene=new THREE.Scene(),player=createPlayer();scene.add(player.mesh);
    const hud=new Proxy({},{get:()=>()=>{}});
    const time=createTimeSystem({scene,player,hud});
    const start=performance.now();
    const level=create({scene,player,hud,timeSystem:time,
      interaction:{register:()=>()=>{},registerBlocker:()=>()=>{},flashPrompt(){}},
      respawn:{setCheckpoint(){},fail(){},isFailing:()=>false,cancel(){}},
      camera:{snap(){}},advance(){}});
    const buildMs=performance.now()-start;
    player.setPose(level.checkpoint.position,level.checkpoint.yaw);
    const geos=new Set(),mats=new Set();
    let nodes=0,meshes=0,casters=0,triangles=0,point=0;
    scene.traverse(n=>{
      nodes++; if(n.isPointLight)point++;
      if(!n.isMesh)return;
      meshes++;casters+=!!n.castShadow;geos.add(n.geometry);
      for(const m of Array.isArray(n.material)?n.material:[n.material])mats.add(m);
      triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3*
        (n.isInstancedMesh?n.count:1);
    });
    const samples=[];
    for(let i=0;i<900;i++) {
      const t=performance.now();time.update(1/60);level.update(1/60);
      player.update(1/60,{keyboard:{},cameraYaw:level.checkpoint.yaw??0,
        bounds:level.bounds,obstacles:level.obstacles,
        supports:level.supports,voids:level.voids});
      scene.updateMatrixWorld();
      if(i>=300)samples.push(performance.now()-t);
    }
    samples.sort((a,b)=>a-b);
    const end=performance.now();level.dispose();time.dispose();
    runs.push({run,buildMs,nodes,meshes,uniqueGeometry:geos.size,
      uniqueMaterial:mats.size,shadowCasterMeshes:casters,
      allocatedTriangles:triangles,pointLightsIncludingHidden:point,
      updateMeanMs:samples.reduce((a,b)=>a+b,0)/samples.length,
      updateP99Ms:samples[Math.ceil(samples.length*.99)-1],
      updateMaxMs:samples.at(-1),disposeMs:performance.now()-end,
      remainingSceneChildren:scene.children.length});
  }
  log(JSON.stringify({name,runs}));
}
'@ | node --import ./scripts/register-test-assets.mjs --input-type=module
```

## Confirmed refresh-rate issue reproduction

This uses an isolated real guard, no obstacles and a distant player. At one second the guard remains in its ALERT search/grace interval. It establishes a timing defect in that branch, not full AI behavior across a playthrough.

```powershell
@'
import * as THREE from 'three';
import {createStealthSystem} from './src/systems/stealth.js';
for(const fps of [30,60,144]) {
  const scene=new THREE.Scene(),player={mesh:new THREE.Group()};
  player.mesh.position.set(100,0,100);
  const stealth=createStealthSystem({scene,player,collidables:[],obstacles:[]});
  const guard=stealth.addGuard({waypoints:[new THREE.Vector3(),new THREE.Vector3(0,0,3)]});
  guard.state='ALERT';guard.facing=0;guard.lookAroundTimer=0;
  for(let i=0;i<fps;i++)stealth.update(1/fps);
  console.log({fps,facingRadians:guard.facing,seconds:guard.lookAroundTimer});
  stealth.dispose();
}
'@ | node --input-type=module
```

## Reproduce non-writing build and existing tests

```powershell
npm.cmd ls --all
npm.cmd test
@'
import {build} from 'vite';
import {gzipSync,brotliCompressSync} from 'node:zlib';
const result=await build({build:{write:false},logLevel:'warn'});
const output=(Array.isArray(result)?result:[result]).flatMap(x=>x.output||[]);
let total=0;
for(const item of output) {
  const bytes=Buffer.from(item.type==='chunk'?item.code:item.source);
  total+=bytes.length;
  if(item.type==='chunk')console.log({file:item.fileName,bytes:bytes.length,
    gzip:gzipSync(bytes).length,brotli:brotliCompressSync(bytes).length});
}
console.log({files:output.length,totalBytes:total});
'@ | node --input-type=module
```

For a normal future deployment validation, `npm.cmd run build` then `node scripts/check-production.mjs` is the existing on-disk path. Those commands would write/inspect `dist/`; they were replaced by the in-memory equivalent during this documentation-only audit. The HTTP check verifies paths and file inventory, not MIME headers, shader compilation, gameplay or remote hosting.

## Browser baseline collection protocol still required

1. Record commit/source revision, browser version, OS/GPU/driver, display refresh, viewport, DPR, power mode and temperature conditions. Use AC power for comparable desktop runs; test battery/thermal behavior separately. Close unrelated heavy applications. Capture current settings and restore them after tests. Use High fixed render quality for comparisons; collect Auto behavior separately.
2. Serve a fresh production build over local HTTP (`npm.cmd run preview -- --host 127.0.0.1` after an authorized normal build). Never use `file://`. Measure production for decisions; use a separate dev-server run for existing debug hooks. Development bundles/overlays are not production baselines.
3. Capture cold startup with disabled HTTP cache and a clean per-run page; capture warm reload separately. In Network/Performance record navigation start, entry download/evaluation, every mandatory model/texture fetch/decode, factory start/end, shader compile/upload, menu-ready, New Game and first controllable rendered frame. Include user-gesture time and audio load timing. Report transferred bytes versus decoded size and startup subset versus total package.
4. Use the scenarios below. Warm an established scene for 15 s, then record 60 s of rAF wall-clock intervals. Repeat each scenario at least three times for baseline and candidate on the same machine. Preserve pose, route, settings, puzzle state and seed; if procedural randomness cannot be fixed, record that uncertainty and add repetitions. Do not remove outliers merely because they are slow.
5. Record CPU spans for update subsystems, visibility hooks, scene matrix traversal/submission, post and minimap. Use browser Performance traces for long tasks, layout/paint, shader first use, script allocation and GC. CPU percentages are sampled utilization, not the same thing as synchronous JS milliseconds.
6. Where `EXT_disjoint_timer_query_webgl2` is supported, collect fresh completed query IDs tagged shadow/scene/bloom/final/minimap; discard invalid/disjoint intervals. Sum compatible pass samples for total GPU duration; never compare scene-only time with whole-frame CPU time. Unsupported/disjoint GPU data must be `n/a`. Browser GPU-process utilization can supplement, not replace, pass timing.
7. Store raw rAF intervals. Average FPS = frames / wall elapsed seconds; mean frame time = sum intervals / N. Report P50/P95/P99/max and counts >16.67, >33.33 and >50 ms. Define 1% low as `1000 / mean(slowest ceil(N*.01) frame intervals)` and use that same definition before/after. Also report P99 frame ms separately: its reciprocal is a different statistic. Sampling must use uncapped wall time, not game delta.
8. For memory, record JS heap after warmup and a manually requested GC where DevTools supports it; record renderer geometry/texture/program counts per frame with explicit reset boundaries, active audio sources and decoded PCM sizes. Take retaining-path snapshots at the same level/checkpoint after 20 restarts/quit cycles and a 30-minute route. Expect persistent caches to plateau; distinguish reachable caches, garbage awaiting GC and growing leaked owners. Renderer counters are not bytes of VRAM.
9. Mark key/mouse event, movement update, locomotion selection, mixer and render submission in a diagnostic build. Correlate them in browser traces; use high-frame-rate camera footage/appropriate presentation tooling for physical input-to-visible latency, at least 30 repeated actions. Label software estimates and physical measurements separately. Validate pointer-lock/fullscreen denial, rebinding and pause/resume as well as steady play.
10. Compare medians across runs and the spread of results, not one favorable run. Accept a performance claim only if it exceeds observed run-to-run noise, has no gameplay/visual regression, and states the tested device/scenario. Do not extrapolate to unsupported mobile browsers.

| Scenario | Reproducible sequence | Evidence to collect |
|---|---|---|
| Cold/warm startup | Reload -> loading -> title -> New Game -> arrival/control | Network waterfall, long tasks, asset readiness, first frame, shader/texture work |
| Title/menu/settings | Leave cinematic 60 s; open each settings tab; change and restore resolution/shadows; resize | Idle GPU/CPU, layout, shader variants/target reallocations |
| L1 route | Forecourt -> tutorial lasers -> guards -> maintenance/bridge router -> hall -> platform departure | Zone changes, foliage, shadows, LOS, puzzle timing, input and collision |
| L2 normal/demanding | Passenger -> security/relay -> cargo -> mechanical -> convergence -> roof -> vault; exercise each ability | Culling, point pool, updates, roof view, time buffers, first-use SFX/animation |
| L3 demanding | Vault surge -> relay echo/catch -> moving luggage/gangway -> security decks -> passenger breakup -> freeze sprint -> brake | Culling cost, particles/uploads, Cannon burst, dynamic light choices, frame spikes |
| Pause/background | Pause 30 s, tutorial 30 s, hide tab 30 s, restore and resume; both camera modes | Frozen gameplay policy, rAF/audio activity, missed keyup, first resumed delta |
| Restarts/transitions | 20 restarts per level, 10 quit/title/new runs; verify checkpoints and credits | Post-GC heap, geometry/texture/program counts, listener/timer/source growth |
| Extended session | 30-minute repeatable route including ability use and repeated failures | Memory plateau, GC events, heat/throttling, frame-time drift |

Existing dev diagnostics: `npm.cmd run dev -- --host 127.0.0.1`; open `/?bench=platform` for the auto-start fixed-camera sweep, or `/?start=level2`, `/?start=level3`, `/?start=roof`, `/?start=vault`, and named Level 3 starts from `src/main.js:642` for manual tests (click New Game on non-benchmark starts). F9 shows the render overlay; Shift+1..0 provide isolated diagnostic toggles/teleports. `?bench=<nonempty>` enables the benchmark; only `platform` supplies its special preparation. The sweep uses 3 s warmup + 4 s measurement per condition, 100% baseline, and continues level simulation with a held camera. It is a diagnostic, not a deterministic gameplay replay or substitute for the production protocol. Its current GPU averages/metric gaps are P19 in the audit. Restore all toggles and record whether counters include shadows/post/minimap before comparing runs.

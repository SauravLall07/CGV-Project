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

## Phase A session evidence - 15 October 2026

This append preserves the original audit above. Session source revision:
`26e415ebf9a9c5efcea4bc621d5e5748119d44a7`; the initial working tree was clean.
Phase A is **BLOCKED**, with partial A0 diagnostic work only. See
[the implementation progress tracker](PERFORMANCE_IMPLEMENTATION_PROGRESS.md).
No A1-A4 optimization or later phase was implemented.

### Reconfirmed source baseline

The audit commit `d00a6c6` precedes the current merge. Comparing it to HEAD shows
Level 3 audio, camera, escape/guidance and associated test changes. Before any
session edits, there were 91 passing tests, not the audit's 89, and production
output was 3,000 bytes larger. These existing committed changes were preserved.
The historical measurements above are not the before values for this session.

Both byte measurements below used the same Vite JS API with `build.write=false`,
Node Buffer byte counts and default `gzipSync`, on installed dependencies.
The after production CLI build was also written to ignored `dist/` and checked
with `scripts/check-production.mjs`. File names/hashes changed with the entry.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Total production output, 53 files | 76,157,769 B | 76,157,905 B | None; +136 B |
| Entry JavaScript | 1,514,152 B | 1,514,288 B | None; +136 B |
| Entry JavaScript, local gzip | 444,859 B | 444,921 B | None; +62 B |

This is instrumentation preparation, not a demonstrated speedup. The dormant
optional loop boundaries account for the small entry increase. Emitted JS was
checked for absence of `chrono-express-benchmark/v1`, `chronoBenchmark`,
`dev-render-overlay` and `onePercentLowFps`. No production capture switch was
added; the revised diagnostic tools remain DEV-only.

### Runtime measurement blocker

The fresh `cua.getState()` result was again `apps: []`, `browsers: []`.
There was no accessible browser tab or graphics context for the game.
Average FPS, 1% low FPS, browser frame times, startup times, heap/GC, GPU pass
times, screenshot parity and instrumentation overhead were **not measured**.
Synthetic test values validate arithmetic and boundaries only; they are not
game performance measurements. No browser or dependency was installed.

The plan explicitly requires a real-browser baseline before the first
optimization. A1-A4 therefore remain pending. Collect the production baseline
using the unchanged protocol above, with the source revision and fixed quality
recorded. Complete A0 production/startup capture and HUD counter work, then
compare capture overhead and collect three 60 s runs per scenario before
claiming any runtime benefit or continuing the gated optimization work.

### Revised development diagnostic interpretation

The sweep remains 3 s warmup + 4 s per condition, with live simulation and a
held camera. It now retains uncapped rAF timestamps and raw frame IDs; exports
include mean FPS, 1% low, P50/P95/P99/max, threshold counts and raw CPU/GPU data.
Visible slow intervals, including gaps over 500 ms, stay in the sample.
Hidden-tab and visibility-transition frames are labeled and excluded;
interrupted measurement attempts remain in the export and restart warmup.
This also handles a hidden interval during which the browser ran no rAF.

After completion or cancellation, use DevTools to save:

```js
copy(JSON.stringify(window.chronoBenchmark.exportResults(), null, 2))
```

`copy()` is the browser DevTools helper. Dismissing results leaves the export
available; disposing the benchmark removes it. It contains the browser user
agent, viewport, DPR, diagnostic toggles and render scale. Record source
revision, GPU/driver, refresh rate, power mode, complete game settings, route
and procedural-randomness limitations alongside the JSON; those are not
automatically detected.

CPU update is bounded by the actual loop callbacks. Scene CPU includes Three
traversal, visibility hooks, shadow work and submission. Draw CPU includes
viewport/clear/composer work and overlaps scene CPU; **do not add them**.
Minimap CPU/counters include only the named icon camera, not bloom/output quads.
Individual post CPU spans and startup readiness/compile/upload markers remain
unimplemented A0 work. The in-game HUD FPS counter is still unchanged and uses
simulation delta; do not use it as a baseline measurement yet.

GPU samples retain unique query IDs, originating frame IDs and completion frame
IDs. They are consumed once, with warmup/previous-condition queries deleted at
measurement boundaries. Disjoint events invalidate the measurement attempt's
GPU data, including already drained samples. Unsupported/missing/invalid GPU
data is unavailable. A completed pass mean is not total frame GPU time. Query
results still pending at condition end are counted but not waited for or
estimated, so pass coverage can be incomplete. The pending queue is bounded;
skipped queries and dropped results are reported in the export.

### Validation evidence

- Before: `npm.cmd test`: 91 passed, 0 failed/skipped/cancelled.
- After: `npm.cmd test`: 98 passed, 0 failed/skipped/cancelled (seven new
  diagnostic contract tests); final suite duration 33,560.5709 ms, not a benchmark.
- `node --check`: all 126 current `src/**/*.js` modules and the new test passed.
- `npm.cmd run build`: passed; existing large-entry chunk warning remains.
- `node scripts/check-production.mjs`: passed, 53 files / 52 references under
  the case-sensitive local HTTP subdirectory check. No deployment occurred.
- No repository type-check or lint script/configuration is available. Syntax
  checking and `git diff --check` are not substitutes for those tools.
- Browser integration, real GPU queries, visual checks and manual user testing
  remain pending. The new graphics/DOM tests use controlled test doubles.

## Phase B session evidence - 15 October 2026

The user explicitly instructed "Move on to Phase B". Source reference:
`51ca6450ebbf677a1309188494aa3b98a8062110`, with a clean initial working tree.
Phase A's partial/blocked status was retained; no manual approval was inferred.
This session changes only B1's first fixture-geometry substep, plus its
measurement script, tests and documentation. B1 batching and B2-B4 remain
pending the real-browser profiling/screenshot gates. See the progress tracker
for the documented scope deviation and outstanding work.

### Carriage geometry census before/after

Both measurements ran the same `createCarriageEnvironment` factory with
`damaged=false`, then `damaged=true`, in Node with the existing canvas/asset
hook. This is a subset of a complete L2/L3 scene: no level-specific puzzles,
player, real model loading, renderer, audio or GPU work. The canvas does not
rasterize, and procedural texture caches persist within each measurement
process. No FPS, browser frame/load time, heap/GC or GPU time was measured.

The changed family consists of L2 hanging lanterns and wall sconces. Their six
shape geometries are shared only within their owning carriage; meshes and
lights remain separate. Buffer bytes count unique backing ArrayBuffers for
geometry indices/attributes. They exclude object/driver overhead, instance
matrices, textures and GPU residency; they are not total memory usage.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| L2 unique geometry objects | 1,615 | 1,431 | 184 fewer (11.39%) |
| L2 geometry buffer bytes | 2,477,392 B | 2,189,360 B | 288,032 B fewer (11.63%) |
| L2 Object3D nodes | 1,802 | 1,802 | Unchanged |
| L2 meshes | 1,644 | 1,644 | Unchanged |
| L2 allocated triangles, including instances | 55,656 | 55,656 | Unchanged |
| L2 unique materials | 131 | 131 | Unchanged |
| L2 shadow-caster meshes | 207 | 207 | Unchanged |
| L2 lights, including nonrendered sources | 102 | 102 | Unchanged |
| L3 unique geometry objects | 846 | 846 | Unchanged |
| L3 geometry buffer bytes | 918,332 B | 918,332 B | Unchanged |
| L3 nodes / meshes / allocated triangles | 928 / 855 / 22,138 | 928 / 855 / 22,138 | Unchanged |

These are verified resource reductions, not draw-call or FPS reductions.
Less geometry construction/storage/upload is an expected benefit; wall-clock
construction, upload and frame improvements remain unmeasured.

### Source-data equivalence

The measurement script hashes ordered node/mesh/instance transforms, geometry
index and attribute bytes, material groups, draw ranges, sampled material/
texture-sampler settings, visibility/shadow/render flags, light settings and
collision/bounds metadata. It excludes resource IDs/UUIDs, rasterized texture
pixels and browser rendering. Both checksums match before and after:

| Factory | Before and after `sceneDataSha256` |
|---|---|
| L2 | `a6c8dea2f1218f6d1b5d42533a0953df03f9eb74a3b3309ea2e3f044c1d59284` |
| L3 | `106754b4de37b9a489e3c2ff16c1c4c1badc083c093c02da0f012cf8ee142f9e` |

Reproduce from repository root:

```powershell
node --import ./scripts/register-test-assets.mjs scripts/measure-carriage-resources.mjs
node --import ./scripts/register-test-assets.mjs --test test/carriage-fixtures.test.mjs
```

To reproduce the before census, copy only the new measurement script into an
isolated checkout of the source reference above, using the same installed
dependencies and asset hook. Run it against that checkout's unchanged source.
Do not compare this carriage-only count to the earlier full-level census.

### Production bytes

Same installed toolchain, Node Buffer byte counts and default `gzipSync`.
Before used fresh in-memory Vite output; after used fresh production output.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Total output, 53 files | 76,157,905 B | 76,158,052 B | None; +147 B |
| Entry JavaScript | 1,514,288 B | 1,514,435 B | None; +147 B |
| Entry JavaScript, local gzip | 444,921 B | 445,037 B | None; +116 B |

The small code-size increase implements scoped geometry ownership. No asset,
dependency, render quality, light budget, culling, shadow, bloom or timing policy
was changed. No package-size or draw-call saving is claimed.

### Verification and remaining runtime gate

- Pre-change suite: 98 tests passed, 0 failed/skipped/cancelled.
- Three new fixture tests passed: original topology/normals/UV/material groups,
  independent meshes and carriage owners, dispose-once behavior, simultaneous
  live environments, restart freshness, and equivalent transformed ray hits.
- Final full suite: 101 tests passed, 0 failed/skipped/cancelled. Its
  40,468.143 ms duration is not a game performance metric.
- All 126 source modules and both new modules passed `node --check`.
- Production build and 53-file/52-reference subdirectory HTTP check passed.
  The existing large-entry warning remains. Type/lint commands are unconfigured.
- The fresh UI inventory still returned `apps: []`, `browsers: []`. Browser
  screenshots, actual rendering, query/driver behavior, startup/frame timing,
  memory/GC and manual testing remain unavailable/uncompleted.

Follow the existing production protocol above and the Phase B manual checklist
in the progress tracker before accepting/expanding B1 or selecting B2-B4 work.
No B2-B4 bottleneck was established by this CPU-only resource census.

## Phase C session evidence - 15 October 2026

The user reported testing the delivered B fixture change and explicitly
authorized Phase C. That delivered scope is approved; broader unimplemented
B tasks remain deferred. This agent executed no commit. At session start HEAD
was `51ca645`, with the five Phase B paths modified/untracked. An external/user
commit subsequently recorded exactly that B scope as `e64da95`; C remains
uncommitted. The before application source is reproducible at `e64da95`, not
bare `51ca645` or the original audit revision. Copy the new workload script into
an isolated `e64da95` checkout to reproduce its before counts/hashes.

Only the C1 immutable-availability/direct-rewind-scan substeps and C3 relay
unchanged-state guards were implemented. Temporal history storage, C2, broader
C3 scheduling, C4 timing and C5 mixer ordering remain deferred behind their
measurement/behavior gates. Browser inventory again returned no apps/browsers.

### Reproducible workload counts

Run from repository root:

```powershell
node --import ./scripts/register-test-assets.mjs scripts/measure-phase-c-work.mjs
```

This is a deterministic Node probe, not a frame-time benchmark. Availability
reads are taken without changes to the ability map. Relay idle counts exclude
the initial setup and count actual `setMatrixAt`/emissive calls and
`instanceMatrix.version` increments. No renderer consumes the dirty attributes,
so these are not measured GPU uploads. No heap/GC/FPS improvement is inferred.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Distinct objects returned by 1,000 availability reads | 1,000 | 1 | 999 fewer returned object identities |
| Matrix writes across 1,200 idle relay updates | 9,600 | 0 | 9,600 avoided writes |
| Buffer dirty/version marks across 1,200 idle relay updates | 1,200 | 0 | 1,200 avoided marks |
| Emissive assignments across 1,200 idle relay updates | 1,200 | 0 | 1,200 avoided assignments |

Rewind metadata now scans registered entries directly rather than constructing
two Set-spread arrays and a mapped array. This is a code-supported removal of
those temporary arrays, not a browser allocation profile of all temporal work.
Player recording and snapshot allocations/cadences remain unchanged.

### Before/after behavior evidence

The same script was captured before runtime edits and after them. Per-update
time-system state hashes match for all five schedules below. Traces span twelve
seconds of recording (past the snapshot horizon), reverse playback, resumed
recording, concurrent ghost playback, Freeze, availability changes, checkpoint
restore and level reset. Input/state sequences are identical within each
before/after pair; this is not a claim of identical trajectories across
different schedules or a complete browser gameplay replay.

| Schedule | Updates | Before and after state SHA-256 |
|---|---:|---|
| 10 Hz | 160 | `53dbedd75f11358f9375e8f38bb21ca68788ce72bd02493513ee3db1fae75702` |
| 30 Hz | 478 | `2df58ebac6af024c6388bf273fcdade57b10fe175ca02d35f2f33dd9bfd3544d` |
| 60 Hz | 954 | `e4d3ca4a67a7f1e81bbbcb864760763f1e5a5b7933370da732d80043010440d5` |
| 144 Hz | 2,292 | `7ae9b756942a71f7870ddaafb3cc2a80708d96bebad85a4a0f94397565d4eee3` |
| Irregular: 100 ms, 1/144 s, 13 ms, 1/30 s | 421 | `baf7f2f35ff38ab9bc28f6abfc0e2d5891d8e428924e68bc56687e2453005211` |

The relay presentation probe compares all instance matrices, emissive values
and linkage Y positions across empty/full bars, 480 countdown frames, latch,
release and reset. Before/after presentation SHA-256:
`080c7ff818606082e3e064504556a9877ab97527ba12060fd1203996b73f4c66`.
Matching data does not substitute for screenshots, visual review or traces on
actual graphics hardware. New tests independently exercise availability-view
ownership and mixed/exhausted rewind histories, plus relay idle and transitions.

### Production bytes and validation

Same installed toolchain, Node Buffer byte counts and default `gzipSync`.
Before used fresh in-memory Vite output; after used a fresh production build.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Total output, 53 files | 76,158,052 B | 76,158,180 B | None; +128 B |
| Entry JavaScript | 1,514,435 B | 1,514,563 B | None; +128 B |
| Entry JavaScript, local gzip | 445,037 B | 445,102 B | None; +65 B |

- Before full suite: 101 passed, 0 failed/skipped/cancelled.
- Targeted time/relay feedback/relay integration: 19 passed.
- Final full suite: 107 passed, 0 failed/skipped/cancelled; six new tests.
  Duration 41,838.89 ms is not a game performance metric.
- All 126 source modules, the workload script and both changed/new test modules
  passed `node --check`. No repository type-check/lint command is configured.
- Production build and the 53-file/52-reference subdirectory HTTP check passed.
  The existing large-entry warning remains; existing geometry/audio diagnostics
  in Node tests were not changed as part of this phase.
- Runtime profiling, actual GPU/heap/GC behavior and Phase C manual testing
  remain pending. No save-data, physics, difficulty, animation or clock policy
  changed. The availability getter now provides an explicit read-only view;
  setters and checkpoint capture/restore maintain separate ownership.

Use the Phase C manual checklist in the progress tracker and the production
baseline protocol above before asserting FPS, memory, GC or latency gains or
expanding the remaining C work. No Phase D implementation began.

## Phase D session evidence - 15 October 2026

The user reported checking/verifying delivered C changes and explicitly
authorized D. Delivered C substeps are approved; broader C tasks remain
deferred. D source reference: `7f85201` (clean initial working tree). No commit,
push, dependency installation or deployment was performed in this session.

D1 kit Source sharing and D2 shared in-flight music loads were implemented.
Broader texture/PCM budgets, asset repackaging and D3 shutdown remain pending
their profiling/lifecycle prerequisites. A fresh browser inventory again
returned `apps: []`, `browsers: []`. The progress tracker records the deliberate
limitation to verifiable resource ownership/concurrency work before browser
snapshots and lists remaining gates.

### Reproduce the resource and concurrency probe

```powershell
node --import ./scripts/register-test-assets.mjs scripts/measure-phase-d-resources.mjs
node --import ./scripts/register-test-assets.mjs --test test/kit-texture-ownership.test.mjs test/level-music-cache.test.mjs
```

For before values, copy only the measurement script into an isolated `7f85201`
checkout using the same installed dependencies and asset hook. The same script
was run before runtime edits and afterward in this session. It uses the real
kit material/texture factories with mocked canvas drawing, plus real music
load ownership with controlled fetch/AudioContext doubles. It does not sample
heap, GC, GPU residency, decoded real music, audible output or frame timing.

### Measured counts

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Source identities for 100 same-canvas kit textures | 100 | 1 | 99 fewer |
| Source identities across three kit material builds | 115 | 47 | 68 fewer |
| Texture wrappers across those builds | 144 | 144 | Unchanged; independent owners/settings |
| Canvas images across those builds | 47 | 47 | Unchanged; no image conversion |
| Fetches for three concurrent same-URL music loads | 3 | 1 | Two duplicates avoided in fixture |
| Decodes for those same loads | 3 | 1 | Two duplicates avoided in fixture |
| Distinct decoded results for those same loads | 3 | 1 | One shared result in fixture |

The kit probe's sampler/settings hash is identical before/after:
`b5de10bed4fc69211926b2e82eb53b23ef2b7b303555cbb113a82f9899f3ea0c`.
It covers map channel, image dimensions, CanvasTexture flag, color space,
repeat/offset, wrapping, anisotropy, format/type, filters, flipY and mip policy.
It excludes Source identities and does not rasterize canvas pixels. New tests
verify the shared cached canvas, independent wrappers, normal-strength/color
separation and teardown/restart ownership.

The music fixture has an arbitrary two-second stereo AudioBuffer-shaped object.
Its values are not measurements of any game MP3. No decoded music memory saving
or total PCM residency is claimed from this probe. The existing successful
music buffer retention policy remains unchanged; only redundant concurrent
fetch/decode work and disposed-owner reattachment were removed.

### Ownership and runtime interpretation

Kit Sources are cached under weak canvas keys; materials receive disposable
independent wrappers. New wrappers do not dirty the existing Source or retain
extra template Textures. The existing canvas cache remains the session owner.
Installed Three Texture.copy shares Sources; WebGLTextures keys GPU ownership
by Source plus upload/sampler settings including colorSpace, forces upload for
new variants and tracks use counts on disposal. Thus independent normal/color/
sampler views preserve their settings; real GPU allocation/upload savings and
first-render parity still need driver measurements. Source counts are not VRAM.

Music pending promises are URL-keyed and clear on success/failure. Canceling a
player cancels its playback intent, not another owner's shared request. The
existing playback token still suppresses stale starts. A disposed player does
not reacquire a buffer when a pending load finishes. Active failures remain
observable and retryable; no eviction, streaming, pitch/fade or autoplay policy
change was introduced.

To collect actual decoded music metadata in a dev-server tab after normal
gesture unlock and track playback:

```js
const music = await import('/src/systems/level-music.js')
console.table(music.getMusicCacheInfo().tracks)
music.getMusicCacheInfo().totalPcmBytes
```

The on-demand snapshot returns duration, rate, channels, sample length,
`length * channels * 4` PCM bytes, total PCM bytes and pending URLs. It exposes
no AudioBuffer/source/gain objects. This is a dev module diagnostic, not a
production global. Actual MP3 buffer metadata/long-session trends were not
collected in this environment, so an eviction budget remains undecided.

### Production bytes and validation

Same installed toolchain; Node Buffer byte counts and default gzipSync.
Before used fresh in-memory Vite output; after used fresh production output.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Total output, 53 files | 76,158,180 B | 76,158,519 B | None; +339 B |
| Entry JavaScript | 1,514,563 B | 1,514,902 B | None; +339 B |
| Entry JavaScript, local gzip | 445,102 B | 445,239 B | None; +137 B |

- Before full suite: 107 passed, 0 failed/skipped/cancelled.
- New targeted tests: 11 passed (three texture and eight music).
- Final full suite: 118 passed, 0 failed/skipped/cancelled. Its 62,287.9764 ms
  duration is validation evidence, not a game performance measurement.
- All 126 source modules and three new modules passed node --check.
- Production build and 53-file/52-reference local subdirectory HTTP check passed.
  The existing large-entry warning remains. Type/lint commands are unconfigured.
- Tests cover Source/sampler/color/normal/UV isolation, simultaneous live and
  rebuilt texture owners, shared-load failures/retries, callback/promise decode,
  disposed player isolation, latest playback intent, one-shot/master-mute routing
  and stop/disconnection. Existing full gameplay/lifecycle suites also passed.
- Browser graphics, audible mix/cues, real MP3 decode/PCM, heap/GC, GPU residency,
  startup/frame-time improvements and Phase D manual testing remain pending.

No runtime FPS/memory/latency improvement was proven. Follow the established
production baseline protocol and Phase D checklist in the progress tracker
before accepting or expanding this work. Phase E was not started.

## Phase E: required readiness and later-level delivery (15 October 2026)

Reference: clean committed `1221bea` (`Memory improvements`). The user explicitly
authorized E; this does not establish D testing acceptance. E is partial: required
startup readiness, bounded nature jobs and later-level splitting are delivered;
profile-dependent staging, character conversion and remote hosting remain gated.

### Reproduction and comparison limits

```powershell
node --import ./scripts/register-test-assets.mjs scripts/measure-phase-e-loading.mjs
node scripts/measure-build-graph.mjs
npm.cmd run build
node scripts/check-production.mjs
```

The nature probe was run against the reference before runtime edits, then against
the candidate. It exercises the real nature module with controlled GLTFLoader/
TextureLoader callbacks and a non-rendering canvas stub. Each wave completes all
currently pending top-level jobs in reverse order. A wave has no time unit; models
are not really fetched, decoded or drawn. The same 19 jobs are requested in both.

The graph probe builds with installed Vite and `write: false`. Initial JavaScript
is the entry plus the recursive static-import closure, including extracted shared
Three core; quoting entry size alone would overstate the saving. gzip is local
gzipSync output, summed per initial chunk, not a measured server response. Source
and model bytes were not converted. Reference packaging was freshly built before
edits. Before E3, an intermediate E1 graph also established that both later levels
and Cannon were still in the initial chunk (1,516,359 B, local gzip 445,887 B).

### Measured counts and emitted bytes

| Metric | Reference `1221bea` | Candidate | Change |
|---|---:|---:|---|
| Top-level nature load jobs | 19 | 19 | Same work |
| Peak active top-level nature jobs in fixture | 9 | 4 | Shared four-slot budget |
| Fixture completion waves | 11 | 5 | Serialized model chain removed |
| Nature catalogue entries | 11 | 11 | Same order/settings hash |
| Emitted files | 53 | 57 | Four additional JS chunks |
| Total output | 76,158,519 B | 76,164,581 B | +6,062 B |
| Entry JS alone | 1,514,902 B | 952,631 B | -562,271 B; see initial closure below |
| Initial JS, including static dependencies | 1,514,902 B | 1,231,307 B | -283,595 B (18.7%) |
| Initial JS, local gzip | 445,239 B | 356,295 B | -88,944 B (20.0%) |

Nature catalogue/material-settings SHA256 matches before and after:
`7ee58fa599ef14b2e62e5c770d3b550267ab8f3b7b7df0fe229072bf43699239`.
It covers ordered keys, kind, scale/capacity, wind parameters, alpha/side, map/normal
color space, wrapping and anisotropy. This is not a pixel or whole-scene hash.
Tests also retain each geometry/material's association with its definition.

### Candidate dependency graph

| Chunk role | Emitted bytes | Initial? |
|---|---:|---|
| Entry | 952,631 | Yes |
| Shared Three core | 278,676 | Yes |
| Shared later-level environment/shader chunk | 68,629 | No |
| Moving Heist | 51,327 | No |
| Timewreck, including Cannon | 169,598 | No |
| Optional DRACOLoader | 7,419 | No |

There is one Three package root, one Cannon package root and no duplicated module
IDs across chunks. Workshop route/format strings are absent from production JS.
The guard torch's actual GLB JSON has no extensionsUsed/Required; its load now
opts out of Draco wiring. Default loadModel callers still wire/share Draco.
This skips an unused module import; it does not claim a decoder-binary saving.

Boarding stays eager and its title scene is adopted for New Game. L2 prefetch
starts two frames after Boarding entry/adoption; L3 prefetch starts after L2 entry.
Neither starts alongside boot FBXs. Failed optional prefetch is observed; a real
transition retries factory resolution under the overlay. Browser module-load
failure caching may still require reload. Canceled imports may finish and cache
a factory but cannot construct a stale scene or dismiss a newer transition.
Complete remains a tiny eager factory to preserve immediate keepPrevious credits.

Startup progress counts four required steps (detective, police, nature-backed
Boarding construction, presentation including Ghost warmup/extra frame). It is
step completion, not bytes or estimated remaining time. Existing asset fallbacks
still settle their steps; a rejected required task shows a reload message. The
asset manager never dismisses the overlay independently of the scene owner.

### Validation and outstanding measurements

- Reference full suite: 118 passed, no failures/skips/cancellations.
- Final full suite: 136 passed, no failures/skips/cancellations. Its 35,238.3672 ms
  duration is validation evidence, not a game performance measurement.
- Syntax passed for 128 source modules plus six new probe/test modules.
- Production build passed; the existing large-chunk warning remains.
- Local production HTTP checks passed: 57 files and 56 relative subdirectory
  references. This does not inspect deployed MIME, compression or cache headers.
- New tests exercise bounded successful/failed jobs, reversed model completion,
  missing/meshless optional nature assets, readiness completion orders, fallback
  results, mandatory rejection, loader unsubscribe, prefetch/cold-load sharing,
  cancellation before/after import and construction, failure/retry, checkpoint/
  energy/options, credits retention and optional decoder capability.
- No accessible apps/browsers were returned by a fresh UI inventory. Real cold/
  warm timing, first-use/transition spikes, frame distributions, shader/upload
  work, peak decode memory, screenshots and manual playthrough remain unmeasured.
- Procedural import-time drawing/building/compile/upload may remain on the
  critical path. Four concurrent GLBs may increase peak model decode residency;
  fewer fixture waves cannot establish lower browser load time or memory.
- E2 character conversion/parity and E4 real-host header policy remain unresolved.
  No server config, deployment, asset conversion or Phase F work was performed.

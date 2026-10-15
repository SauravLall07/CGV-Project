# Chrono Express performance implementation progress

Session: 15 October 2026 (Africa/Johannesburg).
Plan: [PERFORMANCE_OPTIMIZATION_PLAN.md](PERFORMANCE_OPTIMIZATION_PLAN.md).
Source at session start: `26e415ebf9a9c5efcea4bc621d5e5748119d44a7`.
Initial working tree: clean. No commit, push, dependency installation or deployment.

## Phase register

The user tested the delivered Phase B fixture change and explicitly authorized
Phase C: "Ok ive tested it, give me a git commit message and can move onto
Phase C". The delivered Phase B scope is APPROVED. Its unimplemented broader
tasks remain deferred, not silently completed. Phase C is the active scope;
Phase A remains incomplete and unapproved. Earlier session details below are
historical evidence; current Phase C results are appended.

| Phase | Plan tasks | Status | Completed / remaining |
|---|---|---|---|
| A - Quick wins | A0-A4 | BLOCKED | Partial A0 diagnostic tooling and automated checks completed. Real-browser prerequisite and remaining A0 work block A1-A4. |
| B - Rendering improvements | B1-B4 | APPROVED | User tested/accepted the delivered fixture-sharing substep. Broader B1 batching and B2-B4 remain unimplemented and deferred behind profiling gates. |
| C - CPU and game loop improvements | C1-C5 | BLOCKED | C1 immutable availability/direct rewind scan and C3 relay unchanged-state guards implemented, awaiting user testing. Remaining storage/raycast/scheduling/timing work needs profiling or an agreed behavior reference. |
| D - Memory improvements | D1-D3 | NOT STARTED | All tasks remain; query cleanup here belongs to A0 diagnostic ownership, not application shutdown. |
| E - Loading and build improvements | E1-E4 | NOT STARTED | All tasks remain; no readiness, loading, asset or hosting behavior change. |
| F - Advanced optimizations | F1-F2 | NOT STARTED | All tasks and their measurement/architecture gates remain. |

Allowed statuses: NOT STARTED, IN PROGRESS, IMPLEMENTED — AWAITING USER TESTING,
APPROVED, BLOCKED. Only explicit user acceptance can set APPROVED. Phase A is
not complete and must not be reported as implemented or approved.

## Phase A blocker and scope decision (initial session)

The plan says: "Establish a source revision and a real-browser baseline before
the first optimization." A0 also requires a browser on actual hardware. A fresh
computer/browser inventory returned `apps: []`, `browsers: []`. There is no
accessible game browser/GPU context to satisfy that requirement or establish
the A2-A4 screenshot/transition references. This is an environment limitation,
not an approval-review rejection.

Safe independent A0 diagnostic preparation was implemented and tested. The
performance optimizations A1-A4 were left pending rather than bypassing the
plan's gate. No later phase was entered in that session. The subsequent explicit
Phase B instruction supersedes the earlier resume-Phase-A-only scope decision;
it does not complete or approve Phase A's outstanding tasks.

## A0 - Establish trustworthy measurement

Completed portions:

- Reconfirmed source revision, current production bytes and pre-change tests.
- Investigated audit discrepancy: the merge after audit commit `d00a6c6` adds
  Level 3 audio/camera/guidance/escape changes and tests. Current pre-change
  output is +3,000 B and suite count is 91 rather than 89. Existing work retained.
- Added explicit optional loop boundaries for frame, update callbacks and
  main draw. Simulation delta remains capped at 0.1 seconds as before.
- Replaced global rAF wrapping in the DEV overlay with the actual loop's rAF
  timestamps and frame IDs. Other loading/UI rAF callbacks no longer pollute
  the game-frame boundaries.
- Kept visible slow frames, including >500 ms gaps. Added hidden and
  visibility-transition exclusion labels, including hidden periods without rAF.
- Added raw benchmark frame export and mathematically defined FPS, slowest-1%
  FPS, frame-time percentiles, maximum and long-frame threshold counts.
- Separated update CPU, scene traversal/shadow/submission CPU, draw CPU and
  minimap icon CPU. Draw includes scene; no summed CPU total is claimed.
- Fixed minimap CPU/counters being overwritten by orthographic post quads.
- Added uniquely tagged, drain-once GPU results for shadow/scene/bloom/final/
  minimap; reset queries/histories between conditions and warmup/measurement.
- Invalidated unavailable queries on disjoint events, not just ready queries.
  An affected attempt reports no GPU means; pending tails remain unavailable.
- Bounded pending queries and completed-result retention; export reports pending,
  skipped and dropped results. No synchronous GPU waits.
- Preserved the existing overlay UI/toggles, held-camera diagnostic and timing.
  Panel writes during measurement are limited to four per second.
- Preserved interrupted attempts in exports; saved settings are restored on
  completion, cancellation and disposal. Release query objects/listeners and
  restore both render wrappers when disposing these diagnostics.
- Kept development diagnostics out of production and verified emitted strings.

Remaining A0 work (not completed):

- Actual-hardware browser access and the three 60 s production runs per scenario,
  cold/warm startup recordings, memory snapshots and instrumentation overhead.
- Opt-in production capture/export and complete environment/settings metadata.
  The updated short DEV sweep is not a production baseline or gameplay replay.
- Mandatory-ready, level factory/construction, compile/upload, menu-ready and
  first controllable rendered-frame markers in main/level-manager.
- Individual post CPU boundaries and finer traversal/visibility CPU spans
  verified against browser Performance traces.
- Change HUD FPS to wall-clock timing without changing gameplay delta; the
  existing HUD counter remains unsuitable for baseline measurements.
- Validate real GPU extension availability/disjoint handling and shader counters
  against browser tools, and check partial-query coverage on actual hardware.
- Visual/gameplay parity and manual user testing.

## A1-A4 pending tasks

| Task | Status | Work still required |
|---|---|---|
| A1 - Gate recurring production diagnostics | NOT STARTED | Production log gates; off/on build/string checks; controlled missing optional asset; ability/music transition smoke tests. |
| A2 - Write DOM only when displayed values change | NOT STARTED | Presentation guards for HUD/prompt/minimap; warning/mode/binding/reset parity; controlled DOM mutation comparison and screenshot checks. |
| A3 - Cache static minimap data and bound icon reuse | NOT STARTED | Inspect mutable obstacles, cache/revision invalidation, bounded icon pools; carriage/roof/dynamic obstacle/restart checks and allocation evidence. |
| A4 - Restore light-pool update contract | NOT STARTED | Supply L3 delta and cover early returns after source changes; stationary-view moving-source/visibility/Freeze/brake/restart reference and tests. |

## Files changed in the initial Phase A session

| File | Change | Reason |
|---|---|---|
| `src/core/loop.js` | Optional diagnostic begin/end frame/update/draw calls | Attribute CPU work to actual game-loop boundaries; retain simulation behavior. |
| `src/main.js` | Pass existing DEV overlay as loop instrumentation (null in production) | Wire the explicit measurement boundaries. |
| `src/dev/render-overlay.js` | Raw wall-time IDs/visibility policy, exact CPU labels, isolated minimap, tagged GPU adapter, reset/drain APIs, diagnostic cleanup | Correct P19 attribution and freshness while preserving overlay controls. |
| `src/dev/gpu-timer.js` | Query/frame/completion IDs, fresh result drain, reset, disjoint invalidation, bounded queues/status, dispose | Avoid stale/reused GPU samples and release diagnostic resources. |
| `src/dev/frame-metrics.js` (new) | Frame distribution and per-pass GPU summaries | Apply baseline formulas only to eligible raw samples. |
| `src/dev/benchmark.js` | Export raw attempts/settings/environment, corrected summaries, condition resets, explicit missing GPU coverage, throttled panel | Make the short development diagnostic reviewable without claiming a production baseline. |
| `test/performance-instrumentation.test.mjs` (new) | Seven focused contract/integration tests using controlled doubles | Validate arithmetic, boundaries, GPU lifecycle and capture interruptions. |
| `docs/performance/PERFORMANCE_BASELINE.md` | Append session evidence, discrepancy, byte table and export instructions | Preserve the original audit and distinguish real measurements from synthetic tests. |
| `docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md` (new) | Track every phase, partial completion, remaining work, checks and blocker | Required progress record; no approval implied. |

Ignored `dist/` was regenerated by the required production build. Temporary test
logs are outside the repository in the OS temp directory. No tracked file was
deleted; no unrelated change was overwritten.

## Validation results

| Check | Result | Limits |
|---|---|---|
| Pre-change automated suite | PASS: 91 tests | Current merged source, not the older 89-test audit. |
| Focused diagnostic tests | PASS: 7 tests | Synthetic intervals and GL/DOM doubles, not a browser benchmark. |
| Post-change full automated suite | PASS: 98 tests; 0 failed/skipped/cancelled | Includes existing gameplay, level lifecycle, time, camera/cinematic and visibility tests. |
| Syntax | PASS: 126 source modules and new test via `node --check` | Not type checking or linting. |
| Type checking | UNAVAILABLE | Plain JavaScript repository with no configured type-check command. |
| Linting | UNAVAILABLE | No lint script/configuration; no dependency added. |
| Production build | PASS: `npm.cmd run build` | Existing >500 kB chunk warning remains; splitting is a later phase. |
| Local production packaging/HTTP | PASS: `node scripts/check-production.mjs` | 53 files / 52 references; no rendering, MIME/remote-host or gameplay claim. |
| Production diagnostic exclusion | PASS | New export/metric and overlay identifier strings absent from emitted JS. |
| Runtime profiling / browser gameplay | BLOCKED | No accessible browser/context. |
| Manual user testing | NOT COMPLETED | No testing or acceptance feedback received. |

The new tests cover slowest-1% versus P99, long visible gaps, hidden-return
boundaries, unsupported queries, unavailable disjoint queries, delayed/fresh
GPU samples, nested-query prevention, reset/disposal, stalled-query bounds,
unchanged simulation clamp/order, post-versus-map attribution, raw export,
interrupted attempts and settings restoration. Initial focused failures (an
obsolete timestamp variable and test-fixture cleanup ordering) were fixed
before the passing full suite.

## Measured performance results

Same installed toolchain, source baseline and in-memory build procedure:

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Total production output, 53 files | 76,157,769 B | 76,157,905 B | None; +136 B |
| Entry JavaScript | 1,514,152 B | 1,514,288 B | None; +136 B |
| Entry JavaScript, local gzip | 444,859 B | 444,921 B | None; +62 B |

No FPS, 1% low, frame-time, startup, memory, GC or GPU comparison was measured.
Synthetic test numbers and suite/build execution time are not runtime gains.
This partial A0 work improves the measurement contract; it makes no speedup claim.

## Manual testing and baseline collection

1. **Production reference:** use a separate clean checkout of source revision
   `26e415ebf9a9c5efcea4bc621d5e5748119d44a7`. Build and preview over local HTTP.
   Record environment and fixed High settings. Follow the baseline document's
   cold/warm startup and three 60 s route runs in browser Performance/Network.
   Do not use the HUD counter or historical CPU-only scene numbers for FPS.
   Watch asset/readiness failures, frame spikes and source/setting mismatches.
2. **Platform diagnostic:** in this working tree run
   `npm.cmd run dev -- --host 127.0.0.1` and open `/?bench=platform`.
   Let all six conditions finish. Expect the same held platform camera, normal
   gameplay simulation, FPS/1% low and scene GPU with a sample count in export.
   Watch missing scenery/post effects after restoration and new console errors.
   Save JSON with `copy(JSON.stringify(window.chronoBenchmark.exportResults(), null, 2))`.
   Check that each GPU `queryId` appears once and maps to a measured `frameId`;
   unsupported GPU values must be unavailable, never fake zero-duration frames.
3. **Long visible frame:** repeat the platform diagnostic and cause a controlled
   main-thread stall while the tab stays visible (DevTools CPU throttle or a
   test-only busy task). Expect the long raw interval and worse tail metrics;
   a >500 ms stall must not silently restart/remove the attempt. Compare to
   the browser trace using the same boundaries, not the old rolling GPU mean.
4. **Background/pause:** during measurement hide the tab for 30 s, restore it,
   then repeat with pause/tutorial interruption where reachable. Expect a
   retained interrupted attempt with a labeled exclusion and fresh warmup;
   exclude the resumed visibility gap even if no hidden rAF ran. Watch resumed
   state, frozen controls and settings restoration on cancel/dismiss.
5. **L2/L3 and map attribution:** open `/?start=level2` and `/?start=level3`, click
   New Game, show F9 and traverse carriages/roof/gaps. Toggle post (Shift+8),
   minimap (Shift+5), then restore both. Expect unchanged visible game/map and
   separate CPU/pass counters; bloom/output quads must not become minimap work.
   Compare the raw diagnostic labels with browser Performance spans.
6. **Restoration and regression smoke:** cancel and complete sweeps from nondefault
   settings, dismiss results, and verify prior shadow/post/DPR/quality settings.
   Exercise movement, every available ability, interactions, pause/resume,
   restart, quit/title/New Game and L3 brake/credits. Watch visual differences,
   stuck controls, duplicate events and timing changes; none are intended.
   Compare the same route/settings against the clean source reference.
7. **Diagnostic lifetime:** in a local harness mount/use/dispose diagnostics,
   including a pending GPU query, then mount again. Expect original render and
   shadow hooks restored and listeners/queries released. Check actual GPU query
   behavior against browser tools; the passing doubles alone cannot prove it.

The short DEV sweep is a diagnostic only. Full 60 s production runs, startup,
memory, overhead, environment capture and screenshot comparisons remain A0 gates.

## Risks, limitations and plan deviations

- Phase A is partial and blocked; no optimization benefit or user approval.
- Production startup/HUD/complete per-pass CPU capture is still pending.
- Draw and scene CPU spans overlap, and scene includes traversal/visibility
  and driver submission. Raw exports must not be summed as disjoint totals.
- GPU tails are not synchronously waited for; export reports pending counts.
  Disjoint attempts deliberately report GPU data unavailable. Real-driver
  accuracy, query support and instrumentation overhead are not established.
- The DEV sweep runs live simulation with a fixed camera, not a seeded replay;
  use phase/pose/seed control for eventual comparisons and preserve slow samples.
- The 136-byte entry increase is dormant instrumentation wiring. No quality,
  light budget, gameplay timing, asset packaging or dependency change was made.
- New helper/test files support A0; query cleanup and restoring the diagnostic
  shadow wrapper are necessary for safe A0 ownership. General D3 application
  shutdown remains untouched.
- The plan requests isolated commits, but the user's explicit no-commit
  instruction takes precedence. Changes remain uncommitted for review.
- Do not set APPROVED without explicit user testing/acceptance. Do not start
  Phase B on a request to fix/resume this blocked Phase A.

## Git change summary

`git status --short`:

```text
 M docs/performance/PERFORMANCE_BASELINE.md
 M src/core/loop.js
 M src/dev/benchmark.js
 M src/dev/gpu-timer.js
 M src/dev/render-overlay.js
 M src/main.js
?? docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md
?? src/dev/frame-metrics.js
?? test/performance-instrumentation.test.mjs
```

`git diff --stat`:

```text
 docs/performance/PERFORMANCE_BASELINE.md | 103 +++++++++++++++++++++
 src/core/loop.js                         |   8 +-
 src/dev/benchmark.js                     | 149 ++++++++++++++++++++++++-------
 src/dev/gpu-timer.js                     |  76 ++++++++++++++--
 src/dev/render-overlay.js                | 146 ++++++++++++++++++------------
 src/main.js                              |   1 +
 6 files changed, 383 insertions(+), 100 deletions(-)
```

The meaningful changes are the scoped A0 diagnostic corrections, tests,
append-only baseline evidence and this tracker. Three new files are untracked
until the user chooses to stage them; ordinary `git diff --stat` omits them.
Final `git diff --check` passed. Per-command safe-directory handling was used;
no global Git configuration was changed. Git reports its existing inaccessible
global ignore path and Windows LF/CRLF conversion notices. These did not prevent
repository inspection or indicate whitespace errors.

## Phase B session - 15 October 2026

**Status at original session close: BLOCKED - partial B1 implemented.**
Subsequent feedback: the user tested and accepted the delivered fixture change
and authorized Phase C. The delivered scope is APPROVED; broader B work remains
deferred. See the Phase C feedback record below.

Authorization: "Move on to Phase B". This explicitly changes the active phase;
it is not evidence that the user has tested or accepted Phase A. No work on
Phase A or Phases C-F was performed in this session.

Source revision: `51ca6450ebbf677a1309188494aa3b98a8062110`
(`Implement partial baseline performance upgrades`). Initial working tree was
clean: prior Phase A changes had been committed outside this session. This
agent made no commit, push, dependency installation or deployment.

### Scope, dependencies and evidence gate

A fresh browser inventory still returned `apps: []`, `browsers: []`. Real render
CPU/draw-call traces, screenshots and GPU pass data remain unavailable.

B1's first substep is sharing identical immutable geometry, starting with one
repeated prop family. This session implements that bounded fixture substep
using measurable resource ownership and exact geometry/scene-data comparisons.
It does not claim that B1's browser gate has been met. This is a documented
deviation from waiting for all A0/render-trace/screenshot prerequisites before
any B1 code: the change is limited to geometry identity/ownership, with no mesh,
material, transform, culling, light, collision or shader policy change. Browser
verification remains required for acceptance and broader B1 work.

| Task | Status | Completed / remaining |
|---|---|---|
| B1 - Share geometry, then batch static props | IN PROGRESS | Repeated L2 lantern/sconce geometry sharing implemented. Manual visual/runtime verification and further profiling-selected sharing/batching remain. |
| B2 - Reduce culling overhead | NOT STARTED | Need hook timings and finalized B1 object boundaries before removing matrix work or adding bound/portal caches. |
| B3 - Optimize post/shadow/fill | NOT STARTED | Need fresh GPU/fallback browser traces and reference images before choosing a target. No clears, shadow policy, grade or bloom changed. |
| B4 - Spatially partition grass | NOT STARTED | Need grass placement/vertex/fill evidence and tiling comparison; more draws could offset culling gains. |

### Implementation and resource ownership

Only `addLanterns` and `addSconce` in `src/environment/carriages.js` changed.
Each hanging-lantern set now creates its four immutable geometries once, lazily
on the first fixture. Sconce plates/shades share two immutable geometries per
carriage, held under a weak carriage key. No fixture geometry is shared across
carriages, simultaneously live environments or rebuilt levels. Empty lantern
sets do not create orphan geometries.

Meshes, groups, lights and materials remain individually addressable in their
original hierarchy with original positions, rotations, UVs, normals, indices,
shadow flags, render order and collision metadata. Existing `disposeObject`
already deduplicates geometry disposal within a level root, so it needed no
change. There is no permanent global geometry cache, resource ownership flag,
new dependency or renderer/culling rewrite.

### Files changed in Phase B

| File | Change | Reason |
|---|---|---|
| `src/environment/carriages.js` | Share four lantern and two sconce shape geometries within each owning carriage | Avoid repeated immutable geometry allocations/buffers while retaining individual meshes. |
| `scripts/measure-carriage-resources.mjs` (new) | CPU-only factory census, buffer byte counts and scene-data SHA-256 | Reproduce resource counts and compare source data before/after without inventing browser metrics. |
| `test/carriage-fixtures.test.mjs` (new) | Three geometry/ownership/raycast contract tests | Verify original shape data, separate meshes/owners, disposal, restart and transformed ray hits. |
| `docs/performance/PERFORMANCE_BASELINE.md` | Append Phase B resource measurements, reference hashes and limitations | Preserve earlier evidence and make the comparison reproducible. |
| `docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md` | Record explicit phase change, pending approval, results and remaining gates | Keep the current and historical state accurate. |

Ignored `dist/` was regenerated for production validation. Test logs and before/
after census JSON are in the OS temp directory; no tracked file was deleted.

### Measured before/after results

Scope: carriage environment factory only, using the existing Node canvas/asset
hook. This excludes the rest of the level, real rasterization, asset decoding,
the renderer, audio, driver overhead and GPU memory. Bytes below are unique
backing buffers for geometry index/attribute arrays, not heap usage or VRAM.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| L2 carriage unique geometries | 1,615 | 1,431 | 184 fewer (11.39%) |
| L2 carriage geometry buffer bytes | 2,477,392 B | 2,189,360 B | 288,032 B fewer (11.63%) |
| L2 carriage meshes | 1,644 | 1,644 | Unchanged |
| L2 carriage allocated triangles, including instances | 55,656 | 55,656 | Unchanged |
| L3 carriage unique geometries | 846 | 846 | Unchanged; this fixture family is L2-only |
| L3 carriage geometry buffer bytes | 918,332 B | 918,332 B | Unchanged |
| Total production output, 53 files | 76,157,905 B | 76,158,052 B | None; +147 B |
| Entry JavaScript | 1,514,288 B | 1,514,435 B | None; +147 B |
| Entry JavaScript, local gzip | 444,921 B | 445,037 B | None; +116 B |

These verify fewer resource allocations/buffer storage, not higher FPS or
fewer draw calls. No startup/frame-time/heap/GC/GPU comparison was measured.
Object, material, light and shadow-caster counts remained unchanged. The L2/L3
scene-data hashes match before/after for all geometry data, mesh/instance
transforms, sampled material settings, draw flags, lights and collision metadata.
This is not a screenshot comparison: the canvas hook does not rasterize images.
Full hashes and the reproduction command are appended to the baseline document.

### Validation results

| Check | Result |
|---|---|
| Before `npm.cmd test` | PASS: 98 tests; 0 failed/skipped/cancelled |
| New fixture tests | PASS: 3 tests |
| After `npm.cmd test` | PASS: 101 tests; 0 failed/skipped/cancelled |
| Syntax | PASS: all 126 source modules and both new modules via `node --check` |
| Type checking / linting | UNAVAILABLE: repository has no configured commands; none added |
| Production build | PASS: `npm.cmd run build`; existing >500 kB chunk warning remains |
| Packaging/HTTP | PASS: `node scripts/check-production.mjs`, 53 files / 52 references |
| Scene-data equivalence | PASS: matching L2 and L3 before/after hashes |
| Cleanup | PASS: one disposal event per shared fixture geometry; live sibling/rebuilt environments isolated |
| Raycasts | PASS: fixture hit distance/point/UV/face match original geometry after carriage translation/rotation |
| Browser integration / runtime profiling | BLOCKED: no accessible browser or graphics context |
| Manual user testing | NOT COMPLETED; no approval inferred |

Existing gameplay integration, visibility, camera/collision, temporal puzzle,
wreck detachment and cinematic suites remain included in the full test command.
The full suite duration (40,468.143 ms) is validation evidence, not a benchmark.

### Manual testing checklist

Use a clean source reference at `51ca6450ebbf677a1309188494aa3b98a8062110` for
comparisons with the same quality, camera pose, route and effect phase. Production
profiling still requires the baseline protocol: warmup, three 60 s samples per
scenario, cold/warm loading separately, and browser Performance/Network traces.

1. **L2 fixture appearance:** run the dev server, open `/?start=level2`, click
   New Game, and inspect Passenger lanterns and wall sconces up close, including
   both sides and overhead. Compare identical camera poses with the reference.
   Brass shapes, glass shading, UVs, glow, lights and shadows should look the
   same. Watch missing faces, changed normals, flicker or shared state spreading
   from one fixture to another.
2. **Other fixture carriages:** use `/?start=relay`, `/?start=cargo`,
   `/?start=mechanical`, `/?start=convergence` and `/?start=vault` (New Game after
   each load). Inspect hanging and wall fixtures; operate nearby controls/doors
   and encounter guards. Expect the same prompts, camera collision and stealth
   behavior. Compare the same actions with the reference; watch blocked routes,
   changed focus/LOS, stale highlights or altered lighting.
3. **Visibility boundaries:** in L2 look through doors/windows, move across
   carriage boundaries, then visit `/?start=roof`. Turn toward interiors and
   change camera mode. Expect the same visible fixtures/shadows and conservative
   culling as the reference; watch disappearing lights/fixtures, popping or
   camera clipping. No object was batched across a visibility zone.
4. **Ownership/restarts:** after visiting fixture-heavy carriages, restart the
   same level 20 times and quit/title/New Game 10 times. Expect intact fixtures
   after each rebuild and renderer resource counts that plateau after warmup.
   Compare the same sequence against the reference. Watch missing geometry,
   monotonic growth, black fixtures or disposed-resource errors. Lazy uploads
   mean browser geometry counts need not equal the full CPU factory census.
5. **L3 regression:** open `/?start=level3`, click New Game, and exercise Freeze,
   Rewind, moving wreck pieces, restart and the brake/credits sequence. This
   factory's data hash is unchanged; behavior and visuals should match the
   reference. Watch broken detachment, changed hazard lighting or disposal errors.
6. **Performance:** collect actual CPU/render/GPU/frame-time and memory traces
   with fixed quality along the same L2 route on both revisions. The verified
   reduction is geometry storage; do not expect fewer mesh draw submissions or
   infer FPS from the census. Report observed runtime differences with run-to-run
   spread before accepting or expanding the change.

### Risks, remaining work and stop condition

- B1 is a first prop-family substep, not a completed batching project. Sharing
  assumes these shape buffers stay immutable; any future per-fixture vertex
  deformation must first clone geometry. Current fixture code changes only
  mesh transforms/materials and does not mutate these buffers.
- Screenshot parity, real render/driver counts, restart GPU trends and FPS
  remain unverified. Automated source-data equality cannot prove raster parity.
- Browser-dependent B1 acceptance, broader batching, and B2-B4 remain blocked.
  No culling, post, shadow, shader, grass, light budget or gameplay timing change
  was attempted to work around missing profiling evidence.
- User authorization to enter B was recorded; Phase A remains incomplete and
  unapproved. No phase will be set APPROVED without explicit testing acceptance.
- No work proceeds to Phase C. Stop here after the Phase B report; resume the
  remaining Phase B scope when measurement evidence or explicit steering arrives.

### Phase B Git change summary

```text
 M docs/performance/PERFORMANCE_BASELINE.md
 M docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md
 M src/environment/carriages.js
?? scripts/measure-carriage-resources.mjs
?? test/carriage-fixtures.test.mjs
```

The tracked diff comprises the two performance documents and one scoped runtime
file. Ordinary `git diff --stat` excludes the two untracked new modules. The
runtime diff is 26 insertions and 6 deletions in `carriages.js`; it changes only
fixture geometry construction and reuse. No tracked file was deleted. Final
`git diff --check` passed. Nothing was staged, committed, pushed or deployed.

## Phase C session - 15 October 2026

**Status: BLOCKED - C1/C3 substeps implemented, awaiting user testing.**

### Prior-phase feedback, authorization and Git boundary

The user explicitly reported testing the delivered Phase B change and authorized
Phase C. That fixture-sharing scope is now APPROVED; the remaining original B
tasks are still unimplemented. The request was for a commit message, not for
execution of `git commit`. Suggested Phase B message:

```text
perf(rendering): share carriage fixture geometry
```

At the start of this
session, all five Phase B paths from its Git summary above were still modified/
untracked against `51ca6450ebbf677a1309188494aa3b98a8062110`. During this session,
an external/user commit recorded exactly that B scope as `e64da95`
(`perf(rendering): share carriage fixture geometry`). This agent did not create
the commit. The C baseline application source is therefore reproducible at
`e64da95`. Those existing changes were preserved. In particular, Phase B's
`carriages.js`, census script and fixture tests were not edited in Phase C.
The two shared performance documents received the authorized progress/evidence
updates. No staging, commit, push, dependency install or deployment occurred.

### Scope, dependencies and task status

A fresh browser inventory again returned `apps: []`, `browsers: []`. Browser
allocation/GC, per-subsystem CPU and input-to-presentation traces remain
unavailable. This session therefore implements bounded C1/C3 work whose
redundant operations can be counted and whose behavior can be compared offline.
This is a documented deviation from waiting for A0/browser evidence before any
C implementation; it does not waive the remaining measurement/behavior gates.

| Task | Status | Completed / remaining |
|---|---|---|
| C1 - Bound temporal storage with stable ownership | IN PROGRESS | Immutable stable availability views and direct rewind metadata scan implemented. Circular player/snapshot storage, reusable transform slots and custom snapshot ownership changes remain deferred until allocation evidence and expanded wrap/alias tests. |
| C2 - Optimize measured raycast/collision work | NOT STARTED | Need candidate/grid/triangle/collision timings before choosing work. Existing raycast cadence and collision substeps are untouched. |
| C3 - Skip unchanged cosmetic uploads/schedule visuals | IN PROGRESS | Relay bars/material/linkage guards implemented. Particle/atmosphere/valley scheduling remains deferred; logical clocks, PRNG progression and hazards are untouched. |
| C4 - Repair refresh dependence | NOT STARTED | Intended guard search/glitch-bob trajectory and difficulty reference must be agreed before retiming. No 30/60/144 Hz behavior was silently normalized. |
| C5 - Animation response ordering | NOT STARTED | Need input-to-pose/render trace and pause policy before moving the single mixer tick or Throw release. |

### Implemented changes

- `getAbilityAvailability()` returns a frozen point-in-time view instead of a
  new mutable copy on every read. All repository consumers were checked: the
  production caller passes it read-only to the HUD. Setters/checkpoint restores
  replace the view, so retained old views stay unchanged. Checkpoint capture
  still returns an independent editable copy. Default abilities are immutable.
- Rewind metadata is collected by one direct pass over registered entries.
  This replaces two Set spreads and one mapped array per rewind update while
  preserving the maximum history, procedural reverse fallback, energy charge,
  snapshot restoration order and exhaustion behavior.
- Relay bar matrices are recomputed/marked dirty only when displayed fill
  changes. Emissive color is assigned only when its displayed color changes;
  release and catch linkage Y are written only when different. Color/linkage
  transitions still run when the row stays full. Echo countdown remains smooth
  at the original update frequency and uses the original arithmetic.

No snapshot frequency, horizon, ghost recording cadence, player integration,
energy/strain rule, input, collision, difficulty, animation timing or save data
was changed. Temporal ring storage was not partially introduced. The relay
adapter still owns no puzzle clocks, occupancy or collision state and creates
no new timers, listeners or resources requiring cleanup.

### Files created or modified in Phase C

| File | Change | Reason |
|---|---|---|
| `src/systems/time-system.js` | Frozen stable availability views and direct rewind metadata scan | Remove per-frame copies/temporary metadata arrays while retaining state ownership. |
| `src/levels/timewreck-relay-feedback.js` | Independent guards for fill, emissive color and linkage positions | Avoid identical matrix writes/dirty marks without freezing active countdowns or transitions. |
| `test/time-system.test.mjs` | Three ownership/rewind regression tests | Verify immutable views, checkpoint isolation, mixed procedural history and maximum-history exhaustion. |
| `test/relay-feedback.test.mjs` (new) | Three idle/transition/countdown tests | Check unchanged-state suppression and smooth bar/indicator parity. |
| `scripts/measure-phase-c-work.mjs` (new) | Deterministic operation counts and temporal/presentation trace hashes | Reproduce actual work reductions and before/after behavior comparison in Node. |
| `docs/performance/PERFORMANCE_BASELINE.md` | Append Phase C measurements/reference hashes | Preserve prior evidence and separate workload counts from browser performance. |
| `docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md` | Record Phase B feedback and Phase C status/results/limitations | Track acceptance of delivered work and the remaining original plan. |

Ignored `dist/` was rebuilt for validation. Before/after workload JSON and test
logs are in the OS temp directory. No tracked file was deleted.

### Measured results

Identical Node workload before and after; no renderer or real GPU uploads.
Relay idle counts exclude the necessary initial display setup.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Distinct availability objects across 1,000 unchanged reads | 1,000 | 1 | 999 fewer returned object identities |
| Relay matrix writes across 1,200 idle updates | 9,600 | 0 | 9,600 avoided writes |
| Relay buffer-version increments across 1,200 idle updates | 1,200 | 0 | 1,200 avoided dirty marks |
| Relay emissive assignments across 1,200 idle updates | 1,200 | 0 | 1,200 avoided assignments |
| Total production output, 53 files | 76,158,052 B | 76,158,180 B | None; +128 B |
| Entry JavaScript | 1,514,435 B | 1,514,563 B | None; +128 B |
| Entry JavaScript, local gzip | 445,037 B | 445,102 B | None; +65 B |

Per-update temporal state hashes match before/after for 10/30/60/144 Hz and an
irregular schedule. Each trace records across the snapshot horizon, rewind,
resumed recording, concurrent ghost playback, Freeze, availability changes and
checkpoint/level resets. Relay presentation hashes match over full/empty bars,
a 480-frame countdown, latch, release and reset. This proves equivalence for
those scripted states, not every gameplay path or browser raster result.

Expected benefits are less CPU matrix work and fewer allocations/
dirty uploads in stable states. No average/1% low FPS, frame-time, browser heap,
GC, startup, actual GPU transfer or input-latency improvement was measured.
The direct rewind scan's removed arrays are code-supported, not an allocation
profile of the entire update function. Other temporal allocations remain.

### Validation results

| Check | Result |
|---|---|
| Before full suite | PASS: 101 tests; 0 failed/skipped/cancelled |
| Targeted time/feedback/relay integration suites | PASS: 19 tests |
| After full suite | PASS: 107 tests; 0 failed/skipped/cancelled |
| Syntax | PASS: 126 source modules plus the probe and both changed/new test modules |
| Type checking / linting | UNAVAILABLE: no repository commands/configuration |
| Production build | PASS; existing >500 kB chunk warning remains |
| Production packaging/HTTP | PASS: 53 files / 52 subdirectory asset references |
| Before/after state comparison | PASS: all five temporal schedule hashes and relay presentation hash match |
| Cleanup/ownership | PASS: availability cannot mutate live state; checkpoint copies remain separate; existing lifecycle/teardown suites pass |
| Runtime profiling / browser integration | BLOCKED: no accessible browser/GPU context |
| Phase C manual user testing | NOT COMPLETED; awaiting feedback |

The full suite includes refresh-schedule puzzle, continuous L3 route, relay,
cargo/security, camera, Throw and disposal coverage. Existing Node test warnings
from already-non-indexed geometry and ability-SFX timing/absent AudioContext are
unrelated; no audio/geometry conversion changes were made here. Test duration
41,838.89 ms is not a game performance benchmark.

### Manual test checklist

Reference: the session-start source at `51ca645` plus the already-tested Phase B
changes, now committed as `e64da95`. Use that reference in a separate matching
checkout/copy with identical settings; do not compare away the accepted B work.

1. **L2 HUD/ability availability:** launch `/?start=level2`, click New Game,
   exercise Slow/Freeze/Rewind/Ghost, then restart and return through title.
   Availability and warning states should match the reference; watch stale
   disabled slots, exceptions from accidental writes to the read-only view or
   failure to exit an ability when it goes offline.
2. **L3 checkpoints/depletion:** launch `/?start=level3`, progress through
   checkpoint/failure and final core depletion. Expect the original available
   kit on respawn, then the original Freeze-only sprint and reset recovery.
   Watch availability leaking between checkpoints/levels. Compare the same
   route/state with the reference; no energy or progression rule changed.
3. **Rewind histories:** in L2 mechanical/convergence and L3 collapsing/moving
   puzzles, record long enough to fill history, partially rewind, resume, then
   rewind to exhaustion. Expect identical restoration, energy cost and procedural
   repair behavior. Try different frame rates and watch early exhaustion,
   duplicate reverse integration or old-life states after respawn.
4. **Relay idle/hold/countdown:** launch `/?start=level3-relay`, click New Game,
   inspect idle tick marks, stand on release, summon Ghost and leave, then
   use Freeze. Bars should stay full for physical occupancy and drain smoothly
   with the echo's real lifetime during Freeze. Compare the same remaining-time
   values to the reference; watch frozen bars, color changes or stepped motion.
5. **Relay latch/reset:** latch the catch while held, then leave the plate;
   cancel/expire an echo and restart/fail before the catch. Color and release/
   catch linkage should change even when bar fill stays full, and reset should
   restore tick marks. Watch a stale cyan/green display or linkage after reset.
6. **Performance:** warm identical fixed-quality routes and collect three 60 s
   browser captures plus allocation/GC traces. Compare idle relay versus active
   countdown separately. Save raw diagnostic exports and environment/settings.
   Actual GPU writes, heap/FPS and overhead require browser evidence; dirty-mark
   counts and Node timings cannot stand in for those measurements.

### Risks, deviations and stop

- The availability getter is now explicitly read-only. Repository callers were
  checked; external debugging/extensions that assigned into its old detached
  copy must instead copy the view or use `setAbilityAvailability`. No persisted
  data format changed, and checkpoint data remains editable/separate.
- Relay caches cover only adapter-owned presentation. Actual echo fill changes
  still rebuild matrices at full frequency; no quantization or throttling was
  introduced. Puzzle clocks/hazard state are untouched.
- C1 history storage/reuse, C2 and broader C3 need profiling; C4 needs an agreed
  intended trajectory; C5 needs latency evidence. These remain unimplemented.
- Delivered C substeps await user testing; Phase C is not APPROVED or complete.
  Phase B acceptance covers delivered fixtures, not its deferred original tasks.
- Stop here after reporting Phase C. Do not begin Phase D without explicit
  authorization, and do not commit/push/deploy automatically.
- Phase B is now committed externally as `e64da95`; Phase C remains
  uncommitted. Suggested C message:
  `perf(time): avoid redundant availability and relay display work`.

### Phase C Git summary

```text
 M docs/performance/PERFORMANCE_BASELINE.md
 M docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md
 M src/levels/timewreck-relay-feedback.js
 M src/systems/time-system.js
 M test/time-system.test.mjs
?? scripts/measure-phase-c-work.mjs
?? test/relay-feedback.test.mjs
```

Only C changes remain in this diff. The two new modules are untracked and
omitted from ordinary `git diff --stat`. No tracked file was deleted. Final
`git diff --check` passed. No agent staging/commit/push/deployment occurred.

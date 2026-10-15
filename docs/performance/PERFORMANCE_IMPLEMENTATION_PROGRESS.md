# Chrono Express performance implementation progress

Session: 15 October 2026 (Africa/Johannesburg).
Plan: [PERFORMANCE_OPTIMIZATION_PLAN.md](PERFORMANCE_OPTIMIZATION_PLAN.md).
Source at session start: `26e415ebf9a9c5efcea4bc621d5e5748119d44a7`.
Initial working tree: clean. No commit, push, dependency installation or deployment.

## Phase register

The user explicitly authorized Phase E after committing D as `1221bea`.
The delivered B and C scopes are APPROVED; their broader unimplemented tasks
remain deferred. D testing acceptance was not explicitly reported and remains
pending. E is the active scope; its E1/E3 results and remaining gates are below.
Phase A remains incomplete and unapproved. Earlier session details are history.

| Phase | Plan tasks | Status | Completed / remaining |
|---|---|---|---|
| A - Quick wins | A0-A4 | BLOCKED | Partial A0 diagnostic tooling and automated checks completed. Real-browser prerequisite and remaining A0 work block A1-A4. |
| B - Rendering improvements | B1-B4 | APPROVED | User tested/accepted the delivered fixture-sharing substep. Broader B1 batching and B2-B4 remain unimplemented and deferred behind profiling gates. |
| C - CPU and game loop improvements | C1-C5 | APPROVED | User tested/verified the delivered C1 availability/scan and C3 relay guards. Remaining storage/raycast/scheduling/timing work is unimplemented and deferred. |
| D - Memory improvements | D1-D3 | BLOCKED | D1 kit Source sharing and D2 in-flight music deduplication/inventory implemented, awaiting user testing. Broader texture/audio budgets and D3 require profiling or a demonstrated lifecycle need. |
| E - Loading and build improvements | E1-E4 | BLOCKED | E1 required startup readiness/bounded nature jobs and E3 lazy factories/prefetch/optional Draco implemented and awaiting user testing. Broad staging, E2 conversion and E4 host verification remain gated. |
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

**Status at original session close: BLOCKED - C1/C3 substeps implemented.**
Subsequent feedback: the user checked and verified the delivered changes and
authorized Phase D. The delivered scope is APPROVED; remaining C tasks stay
deferred. See the Phase D feedback record below.

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

## Phase D session - 15 October 2026

**Status: BLOCKED - D1/D2 substeps implemented, awaiting user testing.**

### Feedback, authorization and reference

The user said "ok checked and verified" about delivered Phase C and explicitly
authorized Phase D. Delivered C1/C3 substeps are now APPROVED; the remaining
original C tasks stay deferred, not completed. Phase C was committed as
`7f85201` (`perf(time): avoid redundant availability and relay display work`).
This D session began with a clean working tree at that reference. No agent
commit, staging, push, dependency installation or deployment occurred.

The user also requested clearing chat context. Chat history cannot be erased
by this coding workflow; the repository tracker is the continuity source and
only Phase D was treated as active scope. No Phase E work began.

### Scope and remaining gates

Browser inventory again returned `apps: []`, `browsers: []`. Real renderer/heap
snapshots, actual decoded MP3 PCM sizes, GPU residency and long-session traces
are unavailable. This session implements bounded D1 Source sharing and D2
overlapping-load deduplication using reproducible identity/request counts,
explicit ownership and integration tests. Implementing these before browser
profiling is a recorded plan deviation, not evidence that the browser gates
have passed. No cache budget, compression or streaming choice was invented.

| Task | Status | Completed / remaining |
|---|---|---|
| D1 - Texture/cache ownership and duplicate reuse | IN PROGRESS | Kit texture Source inventory/sharing and owner/restart tests completed. Broader image deduplication, replaced-map cleanup and actual CPU/GPU residency investigation remain deferred. |
| D2 - Audio load deduplication and decoded budget | IN PROGRESS | URL-keyed in-flight fetch/decode coalescing, retry cleanup, disposed-owner isolation and on-demand decoded PCM inventory completed. Unlock/start coalescing, cancellation, eviction/streaming decisions and actual MP3/long-session measurements remain deferred. |
| D3 - Application shutdown for a demonstrated need | NOT STARTED | No remount/HMR/context-loss leak or embedding requirement has been demonstrated. Ordinary level restart remains separate; no speculative root teardown added. |

### Ownership inventory

| Resource | Owner / lifetime | Disposal or sharing contract |
|---|---|---|
| Kit painted/normal canvases | Existing module canvas cache, intentional session lifetime | Paint once per key/normal strength; pixels and cache keys unchanged. |
| Kit texture Sources | Private weak map keyed by cached canvas | One Source per canvas; no independent image lifetime or extra template Texture wrapper. |
| Kit material texture wrappers | Individual level/material owners | Separate Texture/UV/sampler settings, shared Source; existing disposeObject releases owned wrappers. No sharedTexture exemption added to returned wrappers. |
| Core procedural textures | Existing session canonical library plus level-owned clones | Already shares Sources; unchanged. Canonical shared flags and clone disposal retained. |
| Nature surfaces/models | Existing session asset owner | Existing sharedTexture resources retained; embedded duplicate images not repackaged or merged here. |
| Passage exterior maps/materials | Existing module-held material/asset owners | Unchanged; cleanup of replaced private maps remains D1 follow-up. |
| Decoded music | Existing session URL-keyed cache | Same successful-buffer retention policy; no eviction/cancellation change without real PCM evidence. |
| Pending music loads | URL-keyed promise map | One fetch/decode per URL; removed on success or failure; one player's dispose cannot cancel another player's shared load. |
| Music playback buffer/source/gain | Individual LevelMusicPlayer plus existing active-player token | Disposed players cannot reacquire buffers or play after late load completion. Existing playback/mix/source-stop logic retained. |
| SFX, procedural drone, AudioContext/master | Existing audio/session owners | Unchanged; no D3-wide shutdown or alternate streaming playback. |

Installed Three source was checked: Texture.copy shares the Source; the
renderer caches GPU textures by Source plus sampler/upload parameters including
colorSpace and tracks use counts on disposal. Different UV repeats remain
per-texture settings; different color-space/sampler variants retain distinct
GPU cache keys. New GPU variants force upload even when sharing a Source.
This supports the ownership design, but is not a real-driver memory benchmark.

### Implemented changes

- `kitTexture` assigns a cached canvas Source to each new owned wrapper instead
  of retaining an independent Source for every wrapper. New wrappers do not
  dirty unchanged shared pixels or retain an extra template Texture. Color,
  normal strength, color-space,
  wrapping, filters, anisotropy and UV repeat defaults are preserved. Normal
  maps of different strengths keep separate canvases/Sources.
- Music loads share a promise by normalized URL across players. Successful
  buffers retain the original cache policy; fetch/body/decode failures remove
  pending state and permit retry. Requests before AudioContext initialization
  fail observably before fetching and can retry after normal audio unlock.
- Late shared-load completion returns its result without reattaching a buffer
  to a disposed player. Existing latest-request token checks still decide
  playback; no shared request is aborted merely because one owner leaves.
- `getMusicCacheInfo()` returns an on-demand detached metadata snapshot:
  duration, sample rate, channels, sample length, PCM bytes per track, pending
  URLs and total PCM bytes. It exposes no AudioBuffer/node references and does
  not run every frame. It is an ES-module diagnostic export, not a new UI.

### Files created or modified in Phase D

| File | Change | Reason |
|---|---|---|
| `src/environment/level1-kit/kit-textures.js` | Private weak canvas Source cache with level-owned wrappers | Share identical Sources without sharing mutable sampler/UV wrappers or dirtying unchanged pixels. |
| `src/systems/level-music.js` | In-flight URL cache, retry cleanup, disposed-owner guard, PCM metadata snapshot | Avoid duplicate fetch/decode and preserve async playback ownership. |
| `scripts/measure-phase-d-resources.mjs` (new) | Kit Source/sampler inventory and mocked overlapping music probe | Reproduce source/request counts before/after; clearly exclude browser memory claims. |
| `test/kit-texture-ownership.test.mjs` (new) | Three texture ownership/variant/restart tests | Verify independent settings, normal/color separation, stable Source version and wrapper disposal. |
| `test/level-music-cache.test.mjs` (new) | Eight async load/playback tests | Verify shared loads, failure/retry, PCM snapshot isolation, cancellation, latest intent, one-shot/mute routing and observable errors. |
| `docs/performance/PERFORMANCE_BASELINE.md` | Append D evidence, measurements and limitations | Preserve previous source evidence and reproducible comparisons. |
| `docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md` | Record C acceptance, D scope, ownership and remaining work | Maintain the phase/testing handoff. |

Ignored `dist/` was rebuilt for validation. Test logs and before/after probe
JSON are in the OS temp directory. No tracked files were deleted.

### Measured before/after results

Probe scope: Node with the existing canvas/asset hook; music network/decoder
are controlled doubles. Texture wrappers/settings and image count remain
unchanged. These are resource identities and request counts, not heap/VRAM.

| Metric | Before | After | Improvement |
|---|---:|---:|---|
| Sources for 100 same-canvas kit textures | 100 | 1 | 99 fewer Source identities |
| Sources across three kit-material builds | 115 | 47 | 68 fewer Source identities |
| Texture wrappers across those builds | 144 | 144 | Unchanged; owners remain separate |
| Images across those builds | 47 | 47 | Unchanged; cached pixels preserved |
| Fetches for three concurrent same-URL music loads | 3 | 1 | Two duplicate requests avoided in fixture |
| Decodes for those loads | 3 | 1 | Two duplicate decodes avoided in fixture |
| Distinct decoded buffers for those loads | 3 | 1 | One shared decoded result in fixture |
| Total production output, 53 files | 76,158,180 B | 76,158,519 B | None; +339 B |
| Entry JavaScript | 1,514,563 B | 1,514,902 B | None; +339 B |
| Entry JavaScript, local gzip | 445,102 B | 445,239 B | None; +137 B |

Texture sampler metadata hash matches before/after:
`b5de10bed4fc69211926b2e82eb53b23ef2b7b303555cbb113a82f9899f3ea0c`.
The probe does not rasterize canvases or decode actual music. Its synthetic
two-second stereo buffer is only a test fixture; no real-track PCM total was
measured or inferred from compressed MP3 sizes. Expected benefits are fewer
duplicate resource owners/uploads and overlapping fetch/decode work. No FPS,
frame-time, startup, heap/GC, actual GPU bytes or audible latency gain is proven.

### Validation results

| Check | Result |
|---|---|
| Before full suite | PASS: 107 tests; 0 failed/skipped/cancelled |
| New targeted tests | PASS: 11 tests (three texture, eight music) |
| After full suite | PASS: 118 tests; 0 failed/skipped/cancelled |
| Syntax | PASS: all 126 source modules and three new modules |
| Type checking / linting | UNAVAILABLE: repository has no configured commands |
| Production build | PASS; existing >500 kB entry/chunk warning remains |
| Production packaging/HTTP | PASS: 53 files / 52 subdirectory references |
| Texture settings equivalence | PASS: sampler hash and color/normal/UV ownership tests |
| Audio async ownership | PASS: shared load survives one owner's disposal; disposed player cannot reacquire buffer/play; stale global starts never start a source |
| Playback/source graph | PASS with doubles: one latest active source, original loop/volume/master-mute routing, one-shot completion and stop/disconnect behavior |
| Failure paths | PASS: HTTP/decode failures are retryable and active-load failures remain observable |
| Browser profiling / actual audio and GPU | BLOCKED: no accessible browser/context |
| Phase D manual user testing | NOT COMPLETED; awaiting feedback |

Final full-suite duration 62,287.9764 ms is validation evidence, not a performance
benchmark. No existing warnings or unrelated audio/rendering behavior were
changed to make validation quieter.

### Manual testing and measurement

Compare against clean reference `7f85201` using identical display/audio settings
and browser/device conditions. Use the established production protocol for
actual before/after FPS, memory, cold/warm load and trace measurements.

1. **L1 appearance:** New Game -> forecourt -> hall -> passages/bridge ->
   platform. Inspect checker floors, brick/tile, concrete/roughness, posters,
   clock, signs, train windows and valance. Expect identical UV repeats, normal
   direction, color/emissive response, transparency and bloom. Compare matching
   views to the reference; watch wrong color space, stretched repeats or missing
   normal/roughness channels.
2. **Texture lifetime:** restart Boarding 20 times and quit/title/New Game 10
   times after visiting the same route. Expect intact surfaces after rebuilds
   and resource counts that plateau after warmup; watch black/disposed textures
   or growth at the same checkpoint. Inspect renderer/heap snapshots on both
   revisions. Source counts are not VRAM bytes and GPU reuse depends on matching
   upload parameters.
3. **Rapid music transitions:** with network/CPU throttling, unlock audio and
   rapidly click New Game, quit/title, restart and enter levels. Expect one
   intended audible track with no stale track starting after a late request.
   Compare Network fetch/decode tasks and audible behavior with the reference;
   watch overlapping tracks, changed timing or a disposed player starting later.
4. **Retry paths:** block one music request, then unblock and trigger it again;
   repeat a controlled decode failure where available. Expect an observable
   error, no stale source and a working retry. Compare request count with the
   reference; no rejected promise may permanently poison the pending cache.
5. **Audio policy and mix:** test initial gesture unlock, mute/volume, every
   time mode, pause/background/resume, victory one-shot and credits/title exit.
   Expect the same pitch, loop/cue/fade behavior and master mix. Watch repeated
   unlock/source restarts, missing cues or audio continuing from an old level.
   Broader unlock/start coalescing and cache eviction were not implemented.
6. **PCM inventory:** in a dev-server tab after normal gesture unlock, use
   `const music = await import('/src/systems/level-music.js')`, then inspect
   `music.getMusicCacheInfo()` after each track has decoded. Save actual buffer
   rates/channels/lengths/PCM totals and pending URLs. Compare long-session heap
   retaining paths and active source graphs before choosing a cache budget.
   This module diagnostic is for dev-server inspection, not a production global.

### Risks, remaining work and stop condition

- Shared Sources intentionally follow the existing cached canvas lifetime.
  No pixel/texture budget or cache release policy was chosen without evidence.
  Embedded nature image duplication and replaced procedural-map cleanup remain.
- Same-source texture settings are independent, but real GPU reuse/first-upload
  behavior and screenshots still require browser testing on actual drivers.
- Music cache retention remains unchanged and may retain all decoded tracks.
  In-flight coalescing avoids duplicates; it does not prove a smaller steady
  PCM cache. Real music PCM totals and long-session retention remain unmeasured.
- Shared fetches are deliberately not aborted on a single player's cancellation.
  Pending entries clear on settlement; network requests that never settle retain
  their pending entry. No speculative timeout or new autoplay policy was added.
- Playback source/gain behavior was retained. General application shutdown,
  streaming, eviction and coalescing every unlock/start call remain separate
  work behind the plan's evidence/behavior gates.
- D's delivered substeps await user testing. No Phase D approval is inferred
  from the earlier Phase C acceptance. Phase E was not started and requires
  explicit authorization. No commit/push/deployment is automatic.

### Phase D Git summary

```text
 M docs/performance/PERFORMANCE_BASELINE.md
 M docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md
 M src/environment/level1-kit/kit-textures.js
 M src/systems/level-music.js
?? scripts/measure-phase-d-resources.mjs
?? test/kit-texture-ownership.test.mjs
?? test/level-music-cache.test.mjs
```

Two runtime files, two performance documents and three new probe/test modules
comprise this session. Ordinary `git diff --stat` omits the three untracked
modules. No unrelated source change or tracked deletion occurred. Final
`git diff --check` passed. Everything remains uncommitted against `7f85201`.

## Phase E session: loading readiness and later-level modules

### A. Scope and status

User instruction: "Move on to phase E". Session reference is clean HEAD `1221bea`
(`Memory improvements`); the prior D changes are committed. D manual acceptance
was not explicitly reported, so its status remains pending. This instruction
authorizes E work, not an automatic D approval or any Phase F implementation.

E1 required readiness/parallelism and E3 async module resolution are implemented.
Broad E1 procedural staging, E2 character conversion and E4 deployed-host policy
remain blocked by the missing browser traces/parity references or host access.
The delivered E scope awaits user testing. Overall E is partial, not approved.

### B. Files and responsibilities

| File | Change and purpose |
|---|---|
| `src/core/loading-tasks.js` (new) | Fixed required-step progress/readiness; failures latch, duplicate completion does not inflate progress. |
| `src/core/load-queue.js` (new) | FIFO budget for full async jobs; rejected/thrown jobs release slots. |
| `src/environment/nature-props.js` | Four slots shared across 11 GLBs and eight surface maps; ordered Promise.all preserves catalogue/seed consumers and existing per-asset fallback. |
| `src/ui/loading-screen.js` | Required-step startup progress; manager completion cannot hide overlay; transition reset and visible reload error. |
| `src/main.js` | Track four startup steps, preserve title adoption/Ghost warmup/frame boundary; dynamically import L2/L3 and prefetch next module after entry presentation. |
| `src/core/level-manager.js` | Resolve/cached-share factories before teardown; token checks before construction and after presentation; optional prefetch failure and required error paths. |
| `src/core/assets.js` | Allow known uncompressed model callers to skip Draco wiring; default compressed capability unchanged. |
| `src/entities/police-visual.js` | Opt the verified uncompressed guard torch out of Draco wiring. |
| `scripts/measure-phase-e-loading.mjs` (new) | Reproducible controlled nature-load counts/waves and ordered settings hash. |
| `scripts/measure-build-graph.mjs` (new) | In-memory emitted byte graph, initial static closure, gzip, ownership and workshop exclusion. |
| Four new `test/*loading*.test.mjs` / `test/optional-draco.test.mjs` modules | Readiness, actual nature module, async transition/prefetch/cancellation/error and decoder contracts. Exact files listed under Git summary. |
| Both performance baseline/progress documents | Append evidence, limitations and manual checklist. |

No dependency/lockfile, model binary, visual shader, movement, puzzle, time-power,
animation clip or remote hosting configuration changed. `dist/` is ignored and
was regenerated. No unrelated working-tree changes existed or were overwritten.

### C. Tasks and readiness manifest

| Plan task | Delivered | Remaining |
|---|---|---|
| E1 | Required-task startup accounting; owner-only dismissal; shared four-job nature queue; order/fallback preservation; required failure message. | Profile/move import-time procedural preparation; stage proven long factories; actual browser compile/upload/peak-memory verification. |
| E2 | None; original FBXs, clips and torch transforms retained. | Offline conversion/provenance and fixed-pose/clip/release parity plus actual browser decode/visual references. |
| E3 | Lazy L2/L3 factories; post-entry prefetch; cold-load barrier; shared successful/pending factories; token cancellation; optional Draco opt-out. | Actual cold/warm transition traces and manual/browser render/cancellation checks. Complete stays eager to preserve instant credits. |
| E4 | Existing local relative HTTP checker rerun against new chunks. | Actual hosting URL/read access, header/cache/compression policy and remote browser verification. No speculative .htaccess written. |

Required startup steps are declared before any load completion can report progress:

| Step | Completion contract | Failure/fallback policy |
|---|---|---|
| Detective | Existing player visual load settles. | Existing primitive character fallback remains valid. |
| Police | Existing template, walk/idle/turn/torch loading settles. | Existing humanoid/optional clip/torch fallbacks remain valid. |
| Backdrop | All 19 nature top-level jobs settle, surface maps apply, Boarding/title construction finishes. | Existing missing/meshless prop omission and null-map fallback remain valid; rejected construction is a required failure. |
| Presentation | Ghost warmup and the existing final startup rAF boundary complete after the above steps. | Required preparation exception keeps overlay visible and reports reload recovery. |

These are four equally counted work units, not a network percentage or time
estimate. Nature requests inside a GLB remain loader-owned and can exceed the
four top-level slots. Audio retains its gesture-driven policy. Later modules
are optional prefetch until transition: L2 after Boarding adoption/entry, L3
after L2 entry, each delayed two frames and state-checked. The title backdrop
is still adopted without a rebuild. Credits stay eager and hold the outgoing
scene without a loading flash.

### D. Measured results

| Metric | Before `1221bea` | After | Interpretation |
|---|---:|---:|---|
| Controlled peak top-level nature jobs | 9 | 4 | Shared bounded budget; not total requests/decoded-memory bytes. |
| Controlled completion waves | 11 | 5 | Same 19 jobs; no wave duration or browser timing implied. |
| Initial JavaScript, full static closure | 1,514,902 B | 1,231,307 B | -283,595 B (18.7%). |
| Initial JavaScript, local per-chunk gzip | 445,239 B | 356,295 B | -88,944 B (20.0%); no server transfer claim. |
| Total emitted output | 76,158,519 B | 76,164,581 B | +6,062 B; 53 -> 57 files. |

The ordered catalogue/material-settings hash is unchanged:
`7ee58fa599ef14b2e62e5c770d3b550267ab8f3b7b7df0fe229072bf43699239`.
It does not cover raster pixels or complete scene output. The candidate initial
closure includes the 952,631 B entry and 278,676 B shared Three core. L2, L3,
their shared later-level chunk and Cannon are outside it. No duplicated module
IDs, extra Three/Cannon package roots or production workshop strings were found.
See the baseline's chunk table and reproduction commands for full detail.

Expected benefits are less initial JS evaluation and less serialized nature
loading. No FPS, ready-time, longest-task, decode-memory or first-use latency
improvement was measured. The remaining procedural work can still block before
the overlay first paints or during construction/material compilation/upload.

### E. Validation results

| Check | Result |
|---|---|
| Reference full suite | PASS: 118 tests; 0 failed/skipped/cancelled. |
| New targeted behavior contracts | PASS: 18 tests across four modules, including two final cancellation/presentation boundaries. |
| Final full suite | PASS: 136 tests; 0 failed/skipped/cancelled. Duration 35,238.3672 ms is validation evidence, not a game benchmark. |
| Syntax | PASS: 128 source modules and six new probe/test modules. |
| Type checking / linting | UNAVAILABLE: plain JS repository has no configured commands. |
| Production build | PASS; existing large-chunk warning remains; default Vite splitting, no arbitrary vendor config. |
| Local production packaging/HTTP | PASS: 57 files / 56 case-sensitive relative subdirectory references. |
| Runtime profiling / rendered comparison | BLOCKED: fresh UI inventory returned apps: [], browsers: []. |
| Phase E manual user testing | NOT COMPLETED; awaiting feedback. |

Tests include delayed character-versus-nature completion in either order, no
manager-driven dismissal, required rejection/fallback, failure slot release,
reversed nature callback order, optional failures, cold imports, coalesced
prefetch/enter, cancellation before load/after load/before presentation, stale
rejection isolation, retry after failed prefetch, preserved energy/checkpoints/
options, restart cache reuse, title adoption and held-scene credits disposal.
The first focused decoder test incorrectly expected an isDRACOLoader marker;
it was corrected to verify the installed loader's decode capability and shared
identity. Existing geometry/audio warning behavior was preserved.

### F. Manual testing and comparison checklist

Compare a production build with clean `1221bea`, identical browser/device,
quality, camera/route and cache conditions. Run at least three cold and warm
attempts per case. Use the baseline raw frame/startup protocol, not test duration.

1. **Cold/warm title:** load with cache disabled, then repeat warm. Delay nature
   GLBs/JPGs while FBXs finish, then reverse the delays. Expect the loading screen
   to remain visible until the station, both character paths and presentation
   are ready. Progress advances per completed step and reaches 100% at readiness.
   Watch premature fade, blank/partial scene, permanently stuck progress or an
   early New Game click. Capture menu/control-ready time and longest tasks.
2. **Nature appearance/fallback:** New Game -> forecourt -> hall -> passages ->
   platform. Compare trees/fern/rock placement, wind, leaf alpha, roofs, brick and
   ground at matching views/phase. Block one nature GLB/JPG, reload, then unblock.
   Expect the established omission/map fallback and a usable menu; watch changed
   seeded placement on successful full loads, wrong map settings or a stalled
   queue. Measure actual simultaneous decode residency with memory tools.
3. **New Game/title adoption:** click New Game as soon as available; inspect the
   camera arrival, detective pose and first Ghost use. Quit/title and start again
   ten times. Expect the same camera glide and ready station without a rebuild
   flash, duplicate input handler, missing character or first-use shader surprise.
4. **Cold later-level transitions:** throttle CPU/network, progress L1 -> L2 ->
   L3, and separately use dev ?start=level2 / ?start=level3. Expect the overlay to
   cover module loading/build/presentation and block gameplay until complete.
   Check checkpoint/yaw, energy carry and every level's initial objective. Watch
   missing module assets, old-level interaction or a stale camera. Capture first
   play frame, transition longest task and network waterfalls against reference.
5. **Cancellation/restart:** with a later-level chunk delayed, quit/title or
   restart where controls permit; in dev, exercise window.levelManager.unload(),
   enter(...) or restart() while pending. Resolve the delayed request. Expect
   only the newest transition to construct/reveal a scene; watch late geometry,
   wrong state, input unlocking or a newer overlay disappearing.
6. **Failed chunks/prefetch:** in dev, block a later-level module during prefetch.
   Existing gameplay should continue. Unblock and transition; application factory
   resolution retries. If the browser retains a failed module fetch, reload.
   Block a required cold transition: expect a visible reload message, frozen old
   scene and disabled interaction. Watch unhandled rejection or a partial level.
7. **Credits/run reset:** finish L3, inspect credits over the final scene, then
   quit/title and restart. Expect no loading flash on Complete and exactly one
   outgoing-scene teardown. Watch black credits background or retained old runs.
8. **Production paths and budget:** serve the fresh dist under a nested URL,
   reload and enter all levels. Expect correct relative chunks/assets; workshop
   remains absent. Record actual remote MIME, encoding, cache headers, initial
   transferred/evaluated JS and warm-cache behavior. Static byte/gzip totals
   alone cannot establish the real delivered improvement.

### G. Risks, unresolved gates and stop

- Browser screenshots, cold/warm stage traces, first-use spikes, GPU uploads and
  peak memory are unavailable. The fixed four-job limit needs device validation;
  parallel model decoding can increase transient model memory despite fewer
  top-level jobs. Network jobs that never settle still hold slots; no speculative
  timeout/retry policy was added to nature's existing session cache.
- Startup progress is deliberately coarse required-step completion. Later-level
  module/build completion is owner-gated; no elapsed-time progress was invented.
- Prefetch can evaluate shared procedural code during gameplay and may cause a
  task spike. It is deferred until after presentation and excludes boot traffic;
  actual traces are still required to tune its timing or stage that work.
- Dynamic imports cannot be aborted. Cancellation invalidates construction and
  presentation; the resolved module/factory may remain in its intentional cache.
  Browser import-failure caching can require reload despite application retry.
- Required chunk failure retains the outgoing scene under an error overlay.
  Factory construction exceptions report the same reload recovery but cannot
  guarantee rolling back arbitrary partially constructed factory side effects.
  No general async scene-building contract or factory rollback was introduced.
- E1 broad staging and E2 conversion require real long-task/pose/clip references.
  E4 needs the actual host/header policy. No fabricated server configuration,
  compressed character asset, deployment or benchmark result was supplied.
- Revert E1 queue/readiness/composition changes together if rejected. Revert E3
  dynamic table and manager resolution/prefetch together to restore sync factories;
  revert the paired torch/asset opt-out to restore default Draco wiring.
- Delivered E work awaits manual testing; E as a whole is BLOCKED/partial. Phase
  F remains NOT STARTED and requires explicit authorization. No automatic commit,
  push or deployment was performed.

### H. Git change summary

```text
 M docs/performance/PERFORMANCE_BASELINE.md
 M docs/performance/PERFORMANCE_IMPLEMENTATION_PROGRESS.md
 M src/core/assets.js
 M src/core/level-manager.js
 M src/entities/police-visual.js
 M src/environment/nature-props.js
 M src/main.js
 M src/ui/loading-screen.js
?? scripts/measure-build-graph.mjs
?? scripts/measure-phase-e-loading.mjs
?? src/core/load-queue.js
?? src/core/loading-tasks.js
?? test/async-level-loading.test.mjs
?? test/loading-readiness.test.mjs
?? test/nature-loading.test.mjs
?? test/optional-draco.test.mjs
```

Eight tracked files plus eight new modules comprise the E change. Ordinary
git diff --stat omits the untracked modules; the final response includes its
actual tracked-file statistics. All changes remain uncommitted against `1221bea`.

# Chrono Express performance implementation progress

Session: 15 October 2026 (Africa/Johannesburg).
Plan: [PERFORMANCE_OPTIMIZATION_PLAN.md](PERFORMANCE_OPTIMIZATION_PLAN.md).
Source at session start: `26e415ebf9a9c5efcea4bc621d5e5748119d44a7`.
Initial working tree: clean. No commit, push, dependency installation or deployment.

## Phase register

Only Phase A was opened. No phase has been approved by the user.

| Phase | Plan tasks | Status | Completed / remaining |
|---|---|---|---|
| A - Quick wins | A0-A4 | BLOCKED | Partial A0 diagnostic tooling and automated checks completed. Real-browser prerequisite and remaining A0 work block A1-A4. |
| B - Rendering improvements | B1-B4 | NOT STARTED | All tasks remain; no rendering optimization or fidelity change. |
| C - CPU and game loop improvements | C1-C5 | NOT STARTED | All tasks remain; A0 loop instrumentation does not change simulation scheduling. |
| D - Memory improvements | D1-D3 | NOT STARTED | All tasks remain; query cleanup here belongs to A0 diagnostic ownership, not application shutdown. |
| E - Loading and build improvements | E1-E4 | NOT STARTED | All tasks remain; no readiness, loading, asset or hosting behavior change. |
| F - Advanced optimizations | F1-F2 | NOT STARTED | All tasks and their measurement/architecture gates remain. |

Allowed statuses: NOT STARTED, IN PROGRESS, IMPLEMENTED — AWAITING USER TESTING,
APPROVED, BLOCKED. Only explicit user acceptance can set APPROVED. Phase A is
not complete and must not be reported as implemented or approved.

## Blocker and scope decision

The plan says: "Establish a source revision and a real-browser baseline before
the first optimization." A0 also requires a browser on actual hardware. A fresh
computer/browser inventory returned `apps: []`, `browsers: []`. There is no
accessible game browser/GPU context to satisfy that requirement or establish
the A2-A4 screenshot/transition references. This is an environment limitation,
not an approval-review rejection.

Safe independent A0 diagnostic preparation was implemented and tested. The
performance optimizations A1-A4 were left pending rather than bypassing the
plan's gate. No later phase was entered. When access or baseline evidence is
available, resume **Phase A**, not Phase B, and finish its remaining work.

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

## Files changed in this session

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

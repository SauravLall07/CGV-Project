# Chrono Express optimization implementation plan

Prepared 15 October 2026. This plan is reviewable work for a later implementation phase. No optimization, gameplay modification, asset conversion, dependency change or deployment was performed during the audit.

Read [the findings register](PERFORMANCE_AUDIT.md) and [the baseline and reproduction protocol](PERFORMANCE_BASELINE.md) first. Findings P01-P24 are evidence-linked there. Priorities below favor behavior preservation and reversible work; GPU changes require real browser measurements. No FPS or load-time improvement percentage is promised.

## Outcomes and implementation boundaries

Maintain the existing artwork, geometry silhouette, effects, lighting appearance, animation curves, controls, difficulty, collision boundaries, progression, scoring/run clock, energy/strain, ghost occupancy and cinematic timing. The confirmed refresh-dependent guard behavior has no single behavior to preserve across devices: agree the intended reference separately and preserve that reference during any correctness repair.

Keep JavaScript/Three/Cannon/Vite and the present scene/level structure. No React migration, engine switch, general ECS, new renderer, blanket memoization, blanket pooling, default quality reduction or dependency upgrade is justified. Use existing diagnostic controls as experiments; post-off, unlit, no shadows and hidden scenery are not production fixes.

Establish a source revision and a real-browser baseline before the first optimization. Implement one independently measurable group per commit. Preserve old resources/paths until equivalence checks pass, then remove them in that same scoped change. Rollback means reverting that isolated commit and restoring referenced assets/URLs/settings together; it does not mean leaving runtime branches everywhere indefinitely. Keep reports append-only in future measurement updates so baseline evidence remains recoverable.

## Priority and dependencies

| Order | Work | Findings | Gate |
|---|---|---|---|
| 1 | A0 baseline/instrumentation; A1 diagnostics; A2 DOM guards | P19, P05 | Production browser baseline; current tests green |
| 2 | A3 minimap caches; A4 light-pool elapsed-time contract | P08, P18 | Trace relevant transitions/stationary moving lights |
| 3 | E1 readiness/parallel loading and measured construction stages | P11, P03 | Cold/warm startup recordings |
| 4 | E2 model/animation packaging; E3 level loading | P01, P02 | Retarget/animation parity and transition asset-readiness contracts |
| 5 | B1 geometry sharing and per-carriage batching | P04 | Actual render submission/scene CPU identified as material |
| 6 | C1 history storage, C2 raycast work, D1 texture ownership, D2 audio cache | P06, P07, P13, P14, P12 | Allocation/retention traces and behavior tests |
| 7 | B2-B4 culling, fill/shadows, grass | P20, P10, P09 | CPU/GPU pass evidence and screenshot baselines |
| 8 | C3-C5 timing/cosmetics/input; D3 shutdown; E4 delivery | P22, P16, P17, P15, P24 | Specific defect/workload verified; hosting access for E4 |
| 9 | F1/F2 deeper scheduling or simulation | P21, P23 and remaining timing evidence | Demonstrated benefit after earlier work; explicit presentation/timing contracts |

The top five benefit candidates by evidence and breadth are startup character packaging, staged/accurate loading with bounded parallel nature requests, lazy later-level code, sharing/batching the large scene hierarchy, and removing per-frame static UI/minimap work. Their relative browser gains are unknown. First implement the low-risk A steps, then use cold-start and frame traces to order the larger work.

## Phase A — Quick wins

### A0. Establish trustworthy frame/pass and startup measurement

- **Files:** `src/dev/benchmark.js`, `src/dev/render-overlay.js`, `src/dev/gpu-timer.js`, `src/ui/hud.js`, `src/core/loop.js`; instrumentation call sites in `src/main.js` and `src/core/level-manager.js`. Future measurements append to `docs/performance/PERFORMANCE_BASELINE.md`.
- **Modification and need:** collect uncapped wall-clock rAF intervals and raw per-pass CPU/GPU samples; label update versus traversal/submission/post/minimap distinctly; record mandatory-ready markers and build/compile/upload stages. Tag GPU query completion/frame IDs, invalidate disjoint samples, reset histories between sweep conditions, and report missing GPU support. HUD FPS should use wall-clock intervals without changing simulation delta.
- **Benefit:** reliable bottleneck/1% low assessment. Instrumentation is not itself expected to speed up gameplay.
- **Prerequisites:** obtain a browser on actual hardware; follow the baseline protocol; keep production instrumentation inactive by default and compare instrumented/uninstrumented overhead.
- **Side effects:** markers/queries and export can perturb timings; avoid per-frame DOM output, synchronous downloads or query polling waits. Keep diagnostics disabled outside capture.
- **Tests:** validate known synthetic intervals including long gaps; ensure hidden-tab samples are labeled/excluded by an explicit policy; verify extension-unavailable/disjoint handling and no nested elapsed queries. Existing game tests must remain green.
- **Verification:** compare traces and counter boundaries with browser Performance/Network; collect three 60 s production runs per scenario, cold/warm starts, and memory snapshots. Export raw samples, settings and environment rather than only summary averages.
- **Rollback:** revert diagnostic changes as one unit; preserve existing overlay until new sample equivalence is checked. Never alter time-system/player delta to make the counter look better.

### A1. Gate recurring production diagnostics

- **Files:** `src/entities/detective-visual.js`, `src/entities/police-visual.js`, `src/systems/level-music.js`, `src/systems/music-system.js`, `src/systems/ability-sfx.js`, `src/core/audio.js`, `src/core/level-manager.js`, `src/ui/minimap-icons.js`, `src/main.js`.
- **Modification and need:** place verbose animation/audio/cache/minimap diagnostic formatting behind DEV or an explicit disabled diagnostic flag. Preserve actionable load failures and warnings. Avoid changing source playback or animation code while gating logs.
- **Benefit:** removes known recurring string formatting/console work, including detective output every 60 frames. Magnitude unmeasured; not a primary FPS claim.
- **Prerequisites:** A0 production entry/string inventory and a source revision. No new logging dependency.
- **Side effects:** fewer ad hoc production diagnostics; retain an intentional troubleshooting option if necessary.
- **Tests:** build with diagnostics off/on; trigger a controlled missing optional asset to confirm errors remain observable; smoke-test all ability/music transitions.
- **Verification:** inspect emitted strings and console frequency; compare allocation/frame traces with DevTools both closed and open.
- **Rollback:** revert only gates; no asset or gameplay state migration is involved.

### A2. Write DOM only when displayed values change

- **Files:** `src/ui/hud.js`, `src/systems/interaction.js`, `src/ui/minimap.js`.
- **Modification and need:** cache run timer text, mode/ghost styling, suspicion display, availability/strain/low-energy states, prompt text/binding, and visibility. Preserve full-frequency numeric integration; skip only redundant presentation writes. Keep smooth bar animation where visible. Prefer unchanged-value guards before introducing a lower UI refresh cadence or CSS representation change.
- **Benefit:** reduces repeated DOM/text/style assignments and temporary strings with identical presentation.
- **Prerequisites:** A0 plus representative screenshots/DOM values for all modes and warning thresholds.
- **Side effects:** incomplete cache invalidation could leave stale controls, opacity or error prompts after rebinding/reset; widths-to-transform changes could alter gradient appearance and are separate work.
- **Tests:** exercise Normal/Slow/Freeze/Rewind/Ghost, cooldown, unavailable abilities, overheat, zero/low/full energy, suspicion thresholds, tutorial/pause/credits, reset and key rebinding. Validate both transition and stable-state displayed output; no implementation-mirroring unit tests are needed for every setter.
- **Verification:** count DOM mutations in a controlled 60 s route; compare main-thread style/layout/paint and allocations. Timer still displays the same tenth-second values and temporal treatment.
- **Rollback:** revert presentation guards as one commit; gameplay state never moves into the UI cache.

### A3. Cache static minimap data and bound icon pool reuse

- **Files:** `src/ui/minimap.js`, `src/ui/minimap-icons.js`, `src/environment/carriage-bounds.js`, `src/levels/moving-heist.js`, `src/levels/timewreck.js`; `src/levels/boarding.js` only if it needs an obstacle-revision signal.
- **Modification and need:** calculate carriage volumes once per level instance, cache wall/interior boxes per carriage, invalidate on relevant dynamic obstacle changes, and avoid projection recalculation when extents do not change. Retain a bounded high-water icon pool and hide surplus nodes instead of destroying/recreating them at every count change. Continue live actor transforms/facing.
- **Benefit:** eliminates repeated static metadata generation and reduces array/node churn without reducing minimap smoothness.
- **Prerequisites:** A0; identify which collider arrays mutate in place and which are static. Do not cache solely by array identity if contents change.
- **Side effects:** stale maps after moving barriers, carriage changes or restart; preserving too large a pool can retain excess memory. Leave damaged-world map semantics unchanged in this performance patch.
- **Tests:** compare map icons before/after at every carriage, roof/gap, L1 guard region, moving obstacle state and restart; confirm player/torch yaw and clipping remain correct. Use existing `scripts/debug-minimap-obstacles.mjs` for layout evidence.
- **Verification:** compare allocations/minimap CPU per frame and pool high-water counts. Only consider instancing obstacle icons in a separate measured change if draw count matters.
- **Rollback:** restore existing map metadata/update path; remove cache revisions and pooling together.

### A4. Restore the light-pool update contract

- **Files:** `src/levels/timewreck.js`, `src/core/light-pool.js` only for measured/test visibility of reassignment state; relevant lifecycle coverage in `test/lifecycle-graphics.test.mjs`.
- **Modification and need:** supply `delta` to the L3 light-pool update; verify braking/early-return branches apply newly changed exit/hazard light sources. Keep stable visible slot counts and existing intensity/color animation. Do not change light budgets or nearest-source ranking here.
- **Benefit:** restores intended periodic nearest-source refresh at a stationary viewer; reduces stale-light artifacts. This is primarily correctness, not an established speedup.
- **Prerequisites:** stationary-camera moving-source repro and image references; A0.
- **Side effects:** actual reassignments may become more frequent and expose pool transitions; compare visual continuity rather than assuming the old stale result is correct.
- **Tests:** move a source across the selection boundary with a stationary viewer, toggle source/ancestor visibility, enter Freeze and brake cinematic, then restart. Assert stable slot count and timer/movement triggers without hardcoding irrelevant internal sorting details.
- **Verification:** capture source/slot assignments and GPU shader-program counts; compare appearances along a normal escape route.
- **Rollback:** revert L3 call-site/branch changes as a unit if lighting regresses; retain the repro for diagnosis.

## Phase B — Rendering improvements

### B1. Share geometry, then batch static props inside existing visibility zones

- **Files:** `src/environment/carriages.js`, `src/environment/carriage-interior.js`, `src/entities/train.js`, `src/environment/level1-kit/kit-props.js`, `src/environment/passageways/level1-dressing.js`; adjust `src/environment/carriage-culling.js`, `src/environment/wreck-visibility.js`, `src/core/dispose.js` only where ownership/bounds require it.
- **Modification and need:** first share identical immutable shape geometries. Then merge same-material static pieces or instance exact repetitions per carriage/region. Preserve original transforms, normals, UVs, shadow flags and render order. Keep dynamic fixtures, interactive highlights, custom raycast targets and real occluder panels individually addressable.
- **Benefit:** fewer geometry allocations/object nodes and possibly fewer draw calls. Supported by the scene census; browser savings remain to measure.
- **Prerequisites:** A0 render CPU/draw-call evidence, screenshot baselines, collider/focus map, and the existing conservative visibility systems. Start with one repeated prop family.
- **Side effects:** coarse batches defeat culling; material sharing can spread highlights; merging across moving carriages breaks transforms; group/material combinations can still produce multiple draws. Sharing requires coherent disposal ownership.
- **Tests:** full L2/L3 route, roof/window/door sightlines, guard LOS and camera collision, interactable focus, wreck detachment, and all existing visibility/interaction tests. Pixel-compare static scenes with identical camera/seed; moving effects use phase-aligned captures.
- **Verification:** resource census, actual per-pass calls/triangles, render CPU, shadow GPU time, build time and post-restart counts, at unchanged quality. Reject if reduced counts do not improve target traces or cause coarse-culling regressions.
- **Rollback:** one prop family per commit; restore meshes and culling metadata together. Never remove source asset/recipe until parity passes.

### B2. Reduce culling overhead without weakening conservatism

- **Files:** `src/environment/wreck-visibility.js`, `src/environment/carriage-culling.js`, `src/levels/timewreck.js`, `src/levels/moving-heist.js`; `tests/wreck-visibility.test.js` and `test/near-raycast.test.mjs` for adjacent transform regressions.
- **Modification and need:** after measuring hooks, avoid redundant full-root matrix propagation; cache static bounds/portal storage and recompute only dirty dynamic candidates. Reuse temporary rects/collections where profiles show allocations. Preserve shadow-caster exclusions, dynamic panels, near-plane fail-open behavior, exception restoration and minimap isolation.
- **Benefit:** lower render-side CPU/allocations while keeping the same saved draws.
- **Prerequisites:** A0 hook timing and B1's final object boundaries. Three installed matrix-update order must be verified before removing any update call.
- **Side effects:** stale matrices or tighter bounds can hide visible geometry and change LOS/shadows; culling overhead may already be negligible.
- **Tests:** run all existing wreck coverage/rotation/near-plane/clip/hook tests; add targeted portal tests for doors, exterior roof view and camera on a boundary. Verify restoration after interrupted render and on disposal.
- **Verification:** compare candidate/tested/hidden counts, hook CPU and total frame time at identical camera paths; screenshots must retain doorway slivers, open wreck sides and shadows.
- **Rollback:** restore former conservative path and hook installation together; default to drawing extra objects on uncertainty.

### B3. Optimize proven post/shadow/fill work

- **Files:** `src/core/postprocessing.js`, `src/core/loop.js`, `src/core/renderer.js`, `src/environment/station-blockout.js`, `src/environment/sky-dome.js`, `src/levels/boarding.js`; specific measured shader in `src/shaders/` only if identified.
- **Modification and need:** use pass timings to choose a target. Candidate sequence: verify/remove redundant full-canvas clear; avoid redundant unchanged target resizes; cache static-only shadow results with explicit dirty invalidation; reduce mathematically redundant shader work. Retain current bloom extent, half-float color behavior, final grade, soft edges and visible shadow quality. Do not replace bloom with a diagnostic off toggle.
- **Benefit:** reduced GPU bandwidth/submissions or shader work if those passes dominate. No expected percentage until measured.
- **Prerequisites:** reliable fresh GPU queries, fallback browser traces where unavailable, reference images on integrated and capable GPUs, B1/B2 transforms stable.
- **Side effects:** missed clears leave artifacts; stale shadows omit animated player/guards/doors; modifying stock UnrealBloomPass internals can change edge halos. Current `nMips=3` customization still retains a five-input composite; verify changes against installed Three source, not assumptions from older versions.
- **Tests:** all quality/bloom toggles, resize/DPR/Auto transitions, first render, shadow-map resolution changes, moving casters, zone changes and sky presets; compare bright bulbs, glass, moon and dark gradients.
- **Verification:** fresh GPU shadow/scene/bloom/final and total-frame distributions at identical quality; no new shader/target leaks after 20 toggles/restarts.
- **Rollback:** isolate clear, resize, shadow and shader changes in separate commits; restore original pass/shadow policy when visual or timing results regress.

### B4. Spatially partition grass without changing the meadow

- **Files:** `src/environment/grass-field.js`, `src/environment/outdoor-environment.js`, `src/shaders/grass-shader.js` only if metadata is required; `src/core/dispose.js` only if ownership changes.
- **Modification and need:** preserve deterministic blade positions and density prefix order while grouping into modest spatial tiles; retain wind, blade shape/color, density and conservative wind bounds. Precompute the same placement recipe or cache CPU arrays to avoid rebuilding 100,000 transforms on every visit.
- **Benefit:** skip offscreen tiles, reduce repeat placement CPU. Avoid any default density reduction.
- **Prerequisites:** profile showing grass vertex/fill/placement cost; A0 and B1 ownership conventions. One batch is already efficient for draw submission, so tiling must win overall.
- **Side effects:** more draws, tile boundary popping, stale wind bounds or changed prefix distribution. Opaque versus alpha-tested/double-sided appearance cannot change silently.
- **Tests:** exact seeded blade position/count comparison, all density tiers, fly-around at tile edges and wind extremes, near-ground camera, Slow/Freeze/Rewind and restart.
- **Verification:** placement time, actual triangles submitted, main GPU time and total CPU/frame time across opening and side views; measure memory overhead of tile metadata.
- **Rollback:** keep original single-field recipe until comparison passes; revert grouping and disposal changes together.

## Phase C — CPU and game loop improvements

### C1. Bound temporal storage with stable ownership

- **Files:** `src/systems/time-system.js`, `src/entities/time-ghost.js`; snapshot producers/restorers in `src/levels/moving-heist.js`, `src/levels/timewreck.js`, `src/levels/timewreck-cargo.js` only where their contract changes. Relevant tests: `test/time-system.test.mjs`, `tests/time-puzzles.test.js` and timewreck suites.
- **Modification and need:** replace front shifting/splicing with bounded indices; reuse default transform snapshot slots; keep selectively recorded intact baseline and per-entry custom state ownership. Scan registered entries directly for rewind metadata; stop cloning availability on every frame through a versioned/read-only view rather than an externally mutable object.
- **Benefit:** lower steady allocation/copying and more stable retained history size.
- **Prerequisites:** browser allocation/GC traces; retain 20 Hz snapshots, current per-frame ghost sampling, 5 s player history, 10 s snapshot horizon and current rewind consumption. Lowering ghost sample frequency is a separate gameplay-fidelity decision.
- **Side effects:** shared mutable slots can corrupt old history or a ghost trajectory; ring wrap/off-by-one errors can alter energy/time and restore failed puzzles incorrectly.
- **Tests:** existing 10/30/60/144 time and cargo/relay/security tests; add full-buffer wrap, selective baseline retention, partial rewind/re-record and ghost replay while recording continues. Verify reset/checkpoint/level/run clears.
- **Verification:** allocation rate, GC pauses, stable retained history bytes and P99 frame ms on identical ability sequences; no numerical gameplay drift relative to agreed tolerances.
- **Rollback:** keep snapshot API stable where possible; revert storage and any producer changes together. No save migration exists.

### C2. Optimize measured raycast and collision candidate work

- **Files:** `src/core/near-raycast.js`, `src/systems/stealth.js`, `src/systems/interaction.js`, `src/cameras/third-person-camera.js`; `src/core/collision.js` and `src/entities/player.js` only if collision scans are actually hot.
- **Modification and need:** reuse hit arrays and immutable blocker-root lists; prewarm large static triangle grids under loading; cache/shared spatial metadata for static blockers while keeping separate moving-object updates. AABB broad-phase buckets are an option for long L1 collider arrays if traces justify them. Preserve full-frequency gameplay detection and collision substeps.
- **Benefit:** fewer allocation/rebuild spikes and candidate tests without detection latency changes.
- **Prerequisites:** A0 profiles split near-set rebuild, grid construction, candidate filtering, triangle testing and player collision. Existing nearby-raycast accuracy tests remain the reference.
- **Side effects:** moving door/guard/panel invalidation errors can let cameras clip or change stealth; broader shared lists can be slower than per-guard sets. Do not simply throttle LOS/AI and alter difficulty.
- **Tests:** hit-for-hit ray comparisons with transforms/material sides/layers/short rays; interaction eligibility and firing revalidation; collider tunnels/corners/stairs; moving doors, teleports, respawns and large-frame substeps.
- **Verification:** rebuild frequency and tested triangles/candidates, CPU/allocations and whole-frame lows. Reject complexity that does not beat the current tested accelerator.
- **Rollback:** revert one candidate layer at a time, retaining exact existing narrow-phase behavior.

### C3. Skip unchanged cosmetic uploads and schedule hidden visual work

- **Files:** `src/levels/timewreck-relay-feedback.js`, `src/environment/particles.js`, `src/levels/timewreck-atmosphere.js`, `src/environment/timewreck-exterior.js`, `src/environment/moonlit-valley.js`, `src/levels/timewreck.js`, `src/levels/moving-heist.js`.
- **Modification and need:** first guard unchanged relay bars/material state. Only then consider nearby/visible cosmetic updates or background chunk preparation. Keep logical clocks/hazards running; use analytic elapsed-time poses or deterministic catch-up to preserve appearances on re-entry. Particle wrapping uses stateful PRNG, so skipping integration cannot simply be replaced with one large delta.
- **Benefit:** less CPU/buffer upload work and chunk spikes if proven material.
- **Prerequisites:** A0 traces and clean separation of visual versus collidable/history state; B2 visibility behavior known.
- **Side effects:** particle reseeding, pop-in, stale fixture light position, or late terrain chunks. Do not apply visibility scheduling to pressure pads, hazard phases, collision or checkpoints.
- **Tests:** return to hidden regions after all time modes and long waits, repeated teleport/restart, compare same-time particles and fixture poses; exercise valley chunk recycle in both directions.
- **Verification:** upload bytes/frequency, frame spikes and CPU time in L3 demanding route. Keep fields full fidelity on capable devices.
- **Rollback:** revert cosmetic gates/chunk preparation independently; keep logical update ordering unchanged.

### C4. Repair refresh dependence against an agreed intended reference

- **Files:** `src/systems/stealth.js`, `src/environment/timewreck-exterior.js`; add focused behavior coverage in `tests/camera-and-cinematic.test.js` or a future `tests/refresh-rate-behavior.test.js`.
- **Modification and need:** capture 60 Hz intended guard search and glitch bob first. Replace frame-count accumulation with an equivalent elapsed-time pose or scaled integration. This is a separately reviewed correctness change, not a hidden performance optimization.
- **Benefit:** consistent visual/AI timing at different refresh rates; no FPS benefit claimed.
- **Prerequisites:** decide intended trajectory/difficulty; direct baseline reproduction is in PERFORMANCE_BASELINE.md. Do not silently choose 144 Hz behavior.
- **Side effects:** any timing normalization changes existing non-reference-device behavior; patrol re-entry, grace windows and frozen glitch phase must be checked.
- **Tests:** compare 30/60/144 Hz and irregular 10-100 ms schedules at the same simulation timestamps, alert-to-patrol transitions, chrono shield/freeze cases and multiple glitch cycles.
- **Verification:** trajectory/facing/time equality within explicit tolerances and human stealth playtest against the chosen reference.
- **Rollback:** revert correctness patch separately from performance commits if intended gameplay cannot be agreed or preserved.

### C5. Resolve measured animation-response delay without double ticking

- **Files:** `src/main.js`, `src/entities/player.js`, `src/entities/detective-visual.js`, `src/systems/distraction.js`; `test/throw.test.mjs` and `tests/camera-and-cinematic.test.js`.
- **Modification and need:** only if A0 input traces show a visible delay, select current locomotion before the frame's single mixer evaluation. Continue mixer ticking in title/arrival/cinematics according to current presentation policy. Preserve Throw frame-24 release and the callback handle across finishing events.
- **Benefit:** current-frame animation selection; physical latency improvement remains to measure.
- **Prerequisites:** event-to-pose/render trace, A2 UI work and agreed pause presentation; keep camera response and position update cadence unchanged.
- **Side effects:** rearranging mixer/release/level updates can create duplicate projectiles, consume inventory early, or change jump/crouch crossfades.
- **Tests:** all Throw tests, cast/throw overlap, cancellation/reset, idle/run/jump/crouch transitions, first-person visibility, title bind pose and cinematic skip.
- **Verification:** marker ordering, one mixer tick per rendered frame and repeated input-to-visible measurement at 30/60/144 Hz.
- **Rollback:** revert ordering/pose changes together; keep the input trace documenting the original behavior.

## Phase D — Memory improvements

### D1. Make texture/cache ownership explicit and reuse exact duplicates

- **Files:** `src/environment/level1-kit/kit-textures.js`, `src/environment/level1-kit/kit-materials.js`, `src/environment/textures.js`, `src/environment/nature-props.js`, `src/environment/passageways/passage-exterior.js`, `src/environment/outdoor-environment.js`, `src/core/dispose.js`; affected `src/assets/models/nature/{fern,fern-b,rock-moss-a,rock-moss-b}.glb` only if offline externalization is selected.
- **Modification and need:** inventory canonical texture/Source/sampler owners; reuse Sources where pixels and upload parameters match, with level-owned clones and intentional session cache. Dispose replaced procedural maps before losing their owners. Deduplicate exact embedded images through runtime sharing or verified asset repackaging. Add a budget/release path for session caches only if retained memory warrants it.
- **Benefit:** fewer duplicate decodes/uploads and predictable residency. The measured identical excess payload is 392,232 B, not a measured VRAM saving.
- **Prerequisites:** renderer/heap snapshots and Source identity inventory; B1 resource ownership. Current clones/repeat/color-space behavior must be preserved. Prefer no new dependency for exact sharing.
- **Side effects:** disposing a shared texture breaks live users; changing repeat/normal/sRGB on a shared object corrupts other surfaces; compression can alter normals/alpha/mips.
- **Tests:** repeated Boarding restarts and title round trips, texture variants/repeats, first upload after disposal, all material channels, all model silhouettes. Existing disposal tests plus an ownership-specific shared-image/restart test where necessary.
- **Verification:** CPU image retaining paths, Source/texture identities, GPU counters/residency tooling where available, cold/warm upload tasks and screenshot parity. PNG/JPEG file savings alone are insufficient.
- **Rollback:** restore original texture factory/asset pair and ownership/disposal together; retain the original files until image QA passes.

### D2. Deduplicate audio loads and budget decoded music

- **Files:** `src/systems/level-music.js`, `src/systems/ability-sfx.js`, `src/systems/music-system.js`, `src/core/audio.js`, `src/main.js`.
- **Modification and need:** cache in-flight track promises, coalesce unlock/start calls, abort obsolete fetch where safe, and record decoded buffer bytes. Retain active/next music with an explicit bounded cache if PCM memory is material. Keep small reused SFX cached. Evaluate media-element streaming as an alternative only after memory evidence and loop/start tests.
- **Benefit:** avoids duplicate fetch/decode and can reduce retained PCM without affecting mix.
- **Prerequisites:** actual durations/channel rates/PCM sizes, rapid New Game/quit reproduction and audio gesture policy. Do not alter pitch/dilation, fades or cue timing.
- **Side effects:** shared cancellation can cancel a still-needed request; eviction causes later gaps; streaming may change seamless loops/latency and browser autoplay behavior.
- **Tests:** overlapping menu unlocks, rapid menu->L1->quit->menu and restart, failed decode/retry, mute/volume, one-shot completion, every time mode and background/resume. Assert at most intended active sources; avoid relying only on internal debug counters.
- **Verification:** Network duplicate requests, decode duration, AudioBuffer byte inventory, active source/node graphs, audible loop/cue comparison and extended-session memory plateau.
- **Rollback:** restore prior buffer cache/player ownership and unlock path together; preserve existing playback tokens throughout.

### D3. Add application shutdown only for a demonstrated lifecycle need

- **Files:** `src/core/loop.js`, `src/core/clock.js`, `src/core/renderer.js`, `src/core/audio.js`, `src/core/assets.js`, `src/main.js`, `src/dev/render-overlay.js`, `src/dev/gpu-timer.js`.
- **Modification and need:** idempotent start/stop with rAF cancellation; release Timer document binding, subscriptions, pending query objects, audio graph, renderer and all root-owned UI/input resources. Restore shadow renderer wrapper as well as render/rAF wrappers. Use a coherent HMR/application owner if remount/context recovery is required.
- **Benefit:** avoids duplicate app chains and retained resources during reload/remount; ordinary level restart is already separate and must not tear down shared core.
- **Prerequisites:** reproduce remount/HMR/context-loss leak or establish application embedding requirements; lower priority than actual gameplay costs.
- **Side effects:** over-eager shutdown destroys persistent state or a live shared resource; async asset completions can attach into disposed scenes.
- **Tests:** start twice, stop, dispose twice, pending load completion after shutdown, remount and HMR where supported; no lingering event/timer/query sources and no black frame on resume.
- **Verification:** browser retaining paths and active rAF/query/audio/listener counts plateau across 20 application mounts where applicable.
- **Rollback:** revert the root lifecycle change as one unit; do not partially call shutdown from ordinary level transitions.

## Phase E — Loading and build improvements

### E1. Unify required readiness, parallelize nature and stage blocking preparation

- **Files:** `src/environment/nature-props.js`, `src/core/assets.js`, `src/ui/loading-screen.js`, `src/core/level-manager.js`, `src/main.js`, `src/environment/passageways/passage-exterior.js`, `src/environment/textures.js`, `src/environment/landing/materials.js`; measured builder call sites in `src/levels/boarding.js`, `src/environment/grass-field.js` as needed.
- **Modification and need:** share mandatory task/progress accounting; load nature with a small bounded concurrency queue; make overlay hide follow aggregate required-ready rather than manager item completion. Move import-time procedural builds into preparation owned by loading. Break proven long construction tasks into bounded stages and warm required materials/textures under the overlay. Preserve original seeded outputs and title-scene adoption.
- **Benefit:** shorter serialized startup path, responsive accurate loading, fewer first-use tasks. Splitting a long task can improve responsiveness without reducing total work.
- **Prerequisites:** A0 cold/warm waterfall/stage trace, required-versus-prefetch asset manifest, E2/E3 API compatibility. Start readiness/parallelism before broad factory refactoring.
- **Side effects:** too much concurrency increases transient decode memory; per-stage yields delay total ready; error paths can leave overlay stuck; partial scenes must never accept movement/interaction. Network progress is not build progress.
- **Tests:** throttle network/CPU; delay nature while FBXs finish and vice versa; missing optional/mandatory assets, rapid transition/restart cancellation, New Game click timing, failed prefetch and relative subdirectory assets. Compare final seeded scene and checkpoint placement.
- **Verification:** cold/warm mandatory bytes, request critical path, longest main-thread task, menu-ready/control-ready and first-use frame spikes; peak memory during parallel decode. Explicitly record whether canvas drawing/compile/upload remain on the critical path.
- **Rollback:** keep readiness ownership in one layer; revert queue/staging/loader changes together per step and restore original asset/factory contracts if behavior regresses.

### E2. Repackage character meshes and animations without changing them

- **Files:** `src/entities/detective-visual.js`, `src/entities/police-visual.js`, `src/core/assets.js`; affected binaries under `src/assets/models/detective/`, `src/assets/models/police/`, `src/assets/models/props/torch/`; `scripts/check-production.mjs` and test asset-hook files only if extensions/fixtures change.
- **Modification and need:** measure FBX decode/mesh/clip data; prototype offline GLB packaging with one mesh/skeleton and required curves. Keep animation names, bone bindings, scale, root-motion policy and event timing. Stop boot-fetching unused police turn; prefetch later clips safely if retaining split assets. Evaluate compression only when decoder/download/parse tradeoffs are favorable.
- **Benefit:** reduce the measured 28.43 MB FBX boot burden and repeated parse/setup work; exact saving depends on retained data and encoding.
- **Prerequisites:** E1 readiness stages, original clip and pose references, correct conversion tool/license/asset provenance. No blind runtime converter or dependency update.
- **Side effects:** retarget/normal/skin/bone differences, lost root tracks, crouch/jump timing or flashlight grip changes; decode compression can add CPU/worker cold-start cost.
- **Tests:** all original action durations and important poses sampled at fixed timestamps; run/walk/crouch/jump/cast/Throw, frame-24 release, police idle/patrol and torch mount; 30/60/144 correctness suite and visual clips on actual GPUs.
- **Verification:** emitted and transferred bytes, parse/decode/warmup and ready time, peak memory, draw/skin cost and first-use latency. Compare final production assets under subdirectory HTTP and relevant browsers.
- **Rollback:** keep original binaries until acceptance, then restore binaries and loader/catalog/test-hook references together if rejected. Do not delete unrelated source-only legacy assets for a false bundle win.

### E3. Split later levels and optional loaders along real boundaries

- **Files:** `src/main.js`, `src/core/level-manager.js`, `src/core/assets.js`, `src/levels/moving-heist.js`, `src/levels/timewreck.js`, `src/levels/complete.js`; `vite.config.js` only if the default split graph needs adjustment.
- **Modification and need:** support async factory resolution with existing pending-token cancellation; eagerly retain opening Boarding, prefetch L2/L3 before their transitions, and dynamically load Cannon/level builders with their level. Avoid fetching DRACO code for known uncompressed assets; preserve capability if future compressed assets require it. Prefer natural dynamic imports to arbitrary vendor chunking.
- **Benefit:** less first-menu JS download/parse/evaluation. Does not necessarily reduce total package size or steady-state FPS.
- **Prerequisites:** E1 aggregate readiness and safe async cancellation; B/C systems must not rely on later-level import side effects. Record module byte graph before/after.
- **Side effects:** transition waterfalls, prefetch competing with boot models, stale import completing after restart/quit, failure handling leaving no level. Manual chunking can create duplicate dependency/runtime work.
- **Tests:** cold transition with network throttle, rapid restart/quit during import, canceled imports, missing chunk, title adoption, energy/checkpoint carry, credits keepPrevious and relative deployment routes. Run full suite and production HTTP/render checks.
- **Verification:** initial entry/request/evaluation bytes versus total, usable time, transition longest task and first-play frame time; verify single Three/Cannon versions and no workshop shipping.
- **Rollback:** restore synchronous factory table and eager imports together; keep the old level manager semantics documented by existing tests.

### E4. Verify and configure production delivery

- **Files:** `scripts/check-production.mjs`, `vite.config.js` if required; proposed deployment-only `public/.htaccess` **only if** Apache overrides are supported and accepted by department hosting. Otherwise make the equivalent change in the actual host configuration rather than inventing a repo config.
- **Modification and need:** inspect actual Content-Type, Content-Encoding, Cache-Control and ETag/Last-Modified. Enable compression for text/appropriate binary data where beneficial, long immutable cache for fingerprinted assets, and short/revalidated HTML caching. Validate atomic relative subdirectory deployment; do not precompress already compressed media indiscriminately.
- **Benefit:** reduce transfer/revisit overhead if current server lacks these settings. Local gzip entry capacity is 443,703 B; actual improvement depends on current headers.
- **Prerequisites:** read-only hosting/header access and deployment policy. Keep deployment approval separate from this local audit/implementation plan.
- **Side effects:** stale HTML/chunk mismatch, unsupported Apache directives or wrong MIME for modules/WASM. A service worker is not necessary for basic caching.
- **Tests:** direct and nested subdirectory URLs, fresh/warm reload, old HTML versus new hashed assets, decoded response equality, correct content types, missing-file behavior and compression negotiation.
- **Verification:** actual transferred bytes, server headers and cold/warm navigation timing on the deployed host, not only `dist/` size.
- **Rollback:** revert server/config rules; redeploy matching HTML/asset set with previous headers. Preserve old hashed assets through the agreed cache window.

## Phase F — Advanced optimizations, measurement gated

### F1. Reduce static-state/hidden-tab work and refine Auto only where beneficial

- **Files:** `src/main.js`, `src/core/loop.js`, `src/core/clock.js`, `src/core/postprocessing.js`, `src/ui/minimap.js`, `src/core/audio.js`, `src/core/settings.js`.
- **Modification and need:** define an invalidation/render policy for genuinely static pause/tutorial/credits frames and a hidden-tab suspend/resume policy. Keep animated title/live settings/resize responsive. Only refine Auto quality if CPU stalls incorrectly trigger resolution changes; use sustained measured GPU pressure with conservative hysteresis and retain fixed tiers/current capable-device quality.
- **Benefit:** lower idle power/thermal load, more appropriate scale decisions. Expected FPS benefit is device/workload dependent.
- **Prerequisites:** A0, phase B/C wins, agreed visible pause animation and background-audio behavior, measured hidden-tab/Auto traces. Clock, root render scheduling and audio require one coordinated owner.
- **Side effects:** stale screenshots, missed resize, audio restart delays, large resumed delta, oscillating quality or changing intended paused visuals. Do not silently suspend music if it is meant to continue.
- **Tests:** pause/tutorial/credits transitions, settings changes while paused, both cameras, repeated hidden/unhidden cycles, pointer-lock loss, audio gesture recovery, DPR/resize, shader quality change and context recovery.
- **Verification:** idle CPU/GPU/audio activity, first resumed frame, no simulation time jump, thermal stability, scale transition count and screenshot fidelity; no capable-device quality decrease.
- **Rollback:** restore continuous loop and current Auto controller together per isolated policy change; do not alter saved user quality choices.

### F2. Fixed-step/interpolation or deeper GPU/asset architecture only after proof

- **Files:** for a justified simulation prototype, `src/core/loop.js`, `src/core/clock.js`, `src/main.js`, `src/entities/player.js`, `src/systems/time-system.js`, `src/systems/stealth.js`, `src/systems/respawn.js`, `src/levels/moving-heist.js`, `src/levels/timewreck.js`, related camera/animation modules. For a measured asset-preparation worker, only the identified pure generator plus its consumer; choose exact files from the trace before authorizing that branch of work.
- **Modification and need:** prototype a bounded accumulator/interpolation only if current remaining pacing/collision failures cannot be addressed locally. Preserve input edge consumption, clock policy, snapshot cadence, cinematic events and max catch-up behavior. A worker is suitable only for isolated serializable CPU generation; WebGL scene assembly remains owned on the rendering thread. GPU particle simulation/LOD/atlases are separate proposals if a measured workload justifies them.
- **Benefit:** conditional pacing/long-task relief; this audit does not establish that such rewrites outperform the current design.
- **Prerequisites:** evidence after A-E, intended timing reference, deterministic route harness and explicit architectural review. Reject the prototype if complexity exceeds measured benefit.
- **Side effects:** changes across virtually every timing-sensitive mechanic, input latency from interpolation, event duplication, serialized-data overhead or GPU compatibility/visual differences.
- **Tests:** complete mechanics/visual regression matrix below; schedules at 10/30/60/144 Hz plus irregular long frames, all ability transitions and repeated failures; compare state trajectories against the accepted reference rather than only final completion.
- **Verification:** raw frame distribution, CPU/GPU breakdown, input-to-visible measurements and state equivalence on multiple devices. No acceptance based solely on a synthetic accumulator benchmark.
- **Rollback:** prototype on an isolated change set; revert as a whole if equivalent timing or measurable benefit is not established. Do not mix with asset or UI quick wins.

## Validation and regression strategy

### Baseline and comparison discipline

1. Record source revision, environment, fixed quality/settings, camera/route/puzzle state and random-seed control before any implementation. Capture cold/warm startup plus title, L1, L2, L3, pauses, credits and restart baseline using the companion protocol.
2. Run the existing 89-test suite before/after each affected subsystem. Use `node --check` and the production build/path checks. Add tests for actual newly exposed behavior contracts (ring wrap, cancellation, visibility and timing), not assertions that merely mirror implementation details.
3. Capture identical scenarios for baseline and candidate at least three times, including actual browser 30/60/144 Hz cases where hardware allows. Keep Auto off for primary comparisons; profile Auto separately. Collect raw intervals, CPU spans, fresh GPU pass samples and allocation/retention traces. Measure cold first use independently from warmed steady state.
4. Accept numerical claims only when they exceed observed run-to-run variation and name the device/settings/scenario. Average FPS, 1% lows and P99 frame ms must use the same definitions. Never infer FPS from scene census or Node CPU-only update durations.
5. Compare screenshots at identical camera/phase/seed on actual hardware; visually review temporal sequences for animations/particles and dynamic shadows. Differences caused by nondeterministic scene generation must be controlled or explicitly separated from candidate differences.
6. Finish with 20 same-level restarts, 10 quit/title/new runs and a 30-minute session, checking heap retaining paths, source/listener/timer counts and renderer resource trends. Intentional caches may grow once and plateau; investigate monotonic growth at the same checkpoint after GC. Test audio memory independently.

### Correctness matrix and acceptance criteria

| Area | Required checks | Acceptance |
|---|---|---|
| Controls | Held/edge movement, run, jump, crouch toggle/hold, distract, interact, views, rebind conflict, modifiers, pointer/fullscreen denial, menu focus | Same actions/edges; no duplicate handlers, stuck keys or delayed interaction introduced |
| Movement/collision | L1 stairs/vents/laser jumps; L2 platforms/roof gaps; L3 gangways/security islands; corners and 100 ms frames | Same legal route/support/collider behavior and intended jump/landing trajectory tolerances |
| Stealth | Patrol stops/turns, visibility/cover, shielded guards, cameras, suspicion gain/decay, distraction/inventory | Same intended detection windows, cover and difficulty; P16 separately baselined |
| Time powers | Energy/strain/lockout, snapshot wrap, exhausted history, partial rewind, ghost pads/endpoint/cooldown | Same durations/costs/positions and pressure-pad behavior; no history aliasing |
| Animation/input | Every clip/crossfade, torch grip, Throw release/cancel, cast overlap, first-person hide | Preserved visible pose/timing and one release per throw; measurable response does not regress |
| Progression/clock | Checkpoints, failure/lives/resets, ability pickups, relay/cargo/mechanical/security, vault, brake/credits, restart/quit | Same progression, objective, run-clock/scoring and cinematic events; no duplicate transitions |
| Visuals | All zones, portal/roof/window views, moving wreck panels, sky presets, grass, mist, lasers, temporal effects, shadows, grade/bloom | Same artwork/effect/animation quality at existing settings; no culling holes/pop-in or stale targets |
| Pause/background | Tutorials, pause, hidden tab, focus loss, resume, settings/resize while covered | Intended frozen/live presentation and audio preserved; no time jump or stale input |
| Loading/deploy | Cold/warm, throttled/failing requests, rapid cancellation, subdirectory paths, cache updates | Accurate ready signal, no blank scene or first-use asset stall; correct server assets/MIME |
| Lifetime | Restart/title/cinematic cycles, cloned skeletons, textures/instances/shadows, audio sources and pending async work | No new retained-owner growth; cache plateau documented; canceled work cannot mutate dead level |
| Performance | Target-device frame/load/CPU/GPU/GC/memory results | Improvement exceeds measurement noise in target scenarios; no material regression elsewhere and no quality loss |

Use normal integrated-GPU laptop, capable desktop GPU, high-DPI display and high-refresh display profiles. Chrome/Edge/Firefox/Safari runs need actual supported devices; record unsupported extension/platform cases as limitations. Mobile requires a separate control/support decision before claiming a playable performance target. Do not sacrifice capable-device graphics to satisfy an untested mobile assumption.

## Findings-to-plan completeness

| Findings | Work items |
|---|---|
| P01, P02, P03 | E2, E3, E1; A0 gates all |
| P04, P05, P06, P07, P08 | B1, A2, C1, C2, A3 |
| P09, P10, P11 | B4, B3, E1 |
| P12, P13, P14, P15 | D2, D1, D1, D3 |
| P16, P17, P18, P19 | C4, C5, A4, A0 |
| P20, P21, P22, P23, P24 | B2, F1, C3, F1, E4 |

No broad fixed-timestep, worker, GPU particle, texture-atlas or automatic fidelity-reduction project is approved by the audit evidence. F2 is a decision gate if later measurements establish a need. The immediate next implementation should be A0-A3, followed by the measured startup path; present each scoped before/after result for review before expanding it.

# Level 3 refinement pass: R0-R7

Persistent execution plan and handover. Created 2026-10-15 (Africa/Johannesburg).
Read this file and inspect current source before continuing. Conversation history
is not required. The older `reports/level-3-upgrade-plan.md` remains the historical
implementation record for Batches 1-6; R0-R7 are a separate refinement pass.

## Current authorization and next action

The initiating message said "do batch r1" but then explicitly instructed
"Complete R0 only. Do not change gameplay or begin R1." Followed the detailed
scope: R0 only. No R1 implementation was authorized by this interpretation.
Starting commit: `8c83559`; working tree was clean. No AGENTS.md was found by
repository search. R0 changes only this plan and ignored diagnostic logs.

The user subsequently explicitly authorized R1 and then R2 in separate requests.
Both independently checkable implementations are complete; rendered acceptance
and profiling remain pending (see results below). R3 has not started and requires
the next user request.
Do not repeat completed upgrade mechanics or treat historical test counts as fresh verification.
Implement only the requested batch, validate, update this handover, then stop.

## Intended experience

Level 2 teaches time manipulation. Level 3 tests recognition, preparation,
sequential ability combinations, route choice and execution as the familiar train
breaks apart. Preserve the route, travelling toward decreasing Z:

Vault -> Convergence -> Mechanical -> Cargo -> Relay -> Security -> Passenger -> cab.

Rhythm: escape security, choose a route, combine abilities, recover briefly, cross
suspended wreckage, then sprint to the brake. Keep pressure local until the
Passenger finale. Do not add a whole-level countdown.

Maintain Level 2's wood, brass, teal panels and leather luggage. Each carriage
should have one dominant challenge and one recognisable damaged landmark. Use
specific structural damage with a cause rather than uniform debris/flickering red.

## Constraints that persist across batches

- Keep plain JavaScript, Three.js, Vite, custom player supports/collision and
  existing Cannon integration. No engine, TypeScript or physics migration.
- Preserve user changes and completed upgrade work. Inspect git status before edits.
- Keep Level 2 gameplay/appearance unchanged unless a shared correctness fix is
  necessary and explicitly documented/tested. Prefer L3-specific configuration.
- No new targeting system, combat, extra levels or broad architectural rewrite.
- Slow/Freeze/Rewind share one active mode over registered objects. Their
  combinations are sequential; Ghost can run alongside them.
- Preserve energy maximum 100, normal recharge 15/s, Slow drain 18/s, Freeze
  drain 28/s, Rewind drain 32/s, Ghost activation 35 plus 1.5/s while active,
  checkpoint recovery floor 50, and L3's disabled strain. Preserve other current
  durations/cooldowns unless playtest evidence supports a scoped change.
- Full energy buys about 3.57 seconds continuous Freeze. Actual sprint is
  4 * 1.7 = 6.8 m/s. Final wave is 6.2 m/s, with 12 m initial lead. Do not
  increase speed or shrink windows speculatively.
- Keep safe observation/switching/recharge floor and sensible local checkpoints.
  Preserve reasonable alternate solutions and retained one-shot repair history.
- Collision, holes, support heights and visible geometry must agree. Decorative
  debris can remain cosmetic. Large floor/carriage motion requires matching
  collision/support work; current atmospheric shake intentionally remains small.
- HUD stays compact; contextual instructions use current key bindings. Pair colour
  with shapes, motion or sound. Avoid long persistent instructional panels.
- No new heavy full-screen effects by default. Existing bloom/grading/vignette,
  instancing and pooling are already implemented.
- Never claim screenshots, shader compilation, human difficulty, measured FPS,
  GPU memory stability or remote deployment from Node tests/build success.
- Credits identities/roles, trailer and hosted URLs remain deferred from the
  earlier work. Do not invent identities or claim publication.

## Source map and reconciliation with existing work

| Area | Current source/evidence | Refinement implication |
| --- | --- | --- |
| L3 composition | `src/levels/timewreck.js` | Owns hazards, checkpoints, supports, breakup, stasis and finale; avoid rewriting it wholesale |
| Cargo | `src/levels/timewreck-cargo.js`, L3 integration | Real floor cut, hinged gangway, selective failure history and Rewind/Freeze already exist; refine alignment/readability |
| Relay | `timewreck.js`, `tests/timewreck-relay.test.js` | Ghost release, spring door, far-side permanent catch and retry logic already exist; refine causal feedback |
| Security | `src/levels/timewreck-security.js` | Two real holes, broad decks, intact recharge island, steering/jump and checkpoints exist; refine visual guidance and human tuning |
| Routes/rack | `src/levels/timewreck-routes.js` | Convergence fork, restorable shutters and Passenger rack exist |
| Vault/Mechanical | `timewreck.js`, `tests/timewreck-escape.test.js` | Two phased laser racks, safe pads, Slow/repair/hold sequence exist |
| Finale | `timewreck.js`, `src/ui/cinematic-skip.js`, camera modules | Wave, depletion, global stasis, broken bridge, locomotive, 2.5 s deceleration and 4.8 s skippable reveal exist; composition remains unverified |
| L2 reference | `src/levels/moving-heist.js` | Existing visual vocabulary, one-shot repairs, Ghost platforms and portal culling; actual light-pool constant is 8 |
| Culling | `src/environment/carriage-culling.js`, `wreck-visibility.js` | L2 portal code unchanged; R1 adds separate live solid-panel L3 occlusion. Sealed hull/ceiling/static zoning assumptions are unsafe for L3 |
| Lighting | `src/core/light-pool.js`, L2/L3 factories | L3 uses 12 pooled points, L2 uses 8; L3's "same budget" comment is stale. Pooling itself is not new work |
| Exterior | `src/environment/outdoor-environment.js`, `timewreck-exterior.js` | L3 already uses MEDIUM outdoor density plus a separate wreck exterior; measure separately before deleting detail |
| Atmosphere | `src/levels/timewreck-atmosphere.js`, `src/environment/particles.js` | Shake, storm debris, lamp/handle motion and batched particles exist; fixed collision constrains visual motion |
| Shell/materials | `src/environment/carriages.js`, `carriage-interior.js`, `textures.js`, `carriage-bounds.js` | Shared builders with damaged variants; protect L2 and actual cut-floor geometry |
| Time/reset | `src/systems/time-system.js`, `respawn.js`, `src/core/level-manager.js` | Shared modes, baseline snapshots, checkpoint restoration and lifecycle cleanup; preserve ordering |
| Player/cameras | `src/entities/player.js`, `src/cameras/{player-view,first-person-camera,third-person-camera}.js` | Actual supports/voids and both views; visual edits must respect camera clearance |
| Render finish | `src/core/{renderer,postprocessing,settings}.js`, `src/main.js` | Pixel ratio cap 1.25, render-scale/quality controls, half-float post target, reduced-resolution bloom and combined finish already exist |
| Regression evidence | `test/*.test.mjs`, `tests/*.test.js` | Time, interaction, lifecycle, Cargo/Relay/Security, continuous L3 traversal, alternate solutions and cinematic calculations; rendered approval still separate |

Older September/October audits describe historical gaps, including some now-fixed
physics, Ghost, collision and finale work. The latest upgrade handover records
78 passing tests and a successful build, but outstanding browser acceptance.
R0 independently reran those commands; results below are fresh.

## Fresh R0 baseline (2026-10-15)

| Check | Fresh result | Limit |
| --- | --- | --- |
| Working tree before work | Clean, HEAD `8c83559` | No pre-existing changes overwritten |
| `npm.cmd test` | PASS: 78 passed, 0 failed, 0 skipped; about 18.4 s | Node simulation/integration; no pixels or actual browser FPS |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning | Bundling does not establish browser boot/shader correctness |
| `node scripts/check-production.mjs` | PASS: 53 files, 72.62 MiB; 52 asset references reachable in case-sensitive local subdirectory HTTP check | Not remote deployment or first-load transfer/runtime memory |
| Browser surface inventory | `apps: []`, `browsers: []` | No connected surface for rendered checks |
| In-app launch | `Browser is not available: iab` | No page boot, screenshots, browser input or runtime profiling obtained |

Tests and Vite initially failed inside the sandbox on process spawning. Both
passed after approved worker/child-process access. No source fixes were needed.
Existing non-indexed-geometry warnings and headless audio messages remain; these
are not fresh evidence of a rendered defect. Logs (ignored by git):
`reports/refinement-r0-tests.log`, `reports/refinement-r0-build.log`,
`reports/refinement-r0-production.log`.

Historical evidence: the previous upgrade handover also reported 78 tests and
the same packaging counts. Historical source comments mention fill-rate sensitivity
and earlier FPS comparisons; hardware/settings/raw captures are not established
here, so do not adopt those numbers as the R0 runtime baseline.

### Available diagnostics and how to establish the missing runtime baseline

- `src/dev/render-overlay.js`: dev F9 overlay, FPS, average frame/update/render/
  minimap times, draw calls/triangles, geometry/texture counts, optional GPU timer
  queries for shadow/scene/bloom/final, and comparison toggles.
- Overlay toggles include Shift+3 simplified lighting, Shift+4 outdoor scenery,
  Shift+5 minimap, Shift+8 post, Shift+9 additive glows, Shift+0 unlit comparison.
  These are diagnostic comparisons, not approved production changes. Restore
  settings after each comparison; inspect implementation before using controls.
- `src/dev/benchmark.js`: six fixed-camera comparisons (normal, scenery hidden,
  lighting simplified, post off, unlit, 70% scale), each 3 s warmup + 4 s sample;
  reports mean frame/update/available GPU scene values. Dev-only in `main.js`.
  It does not currently provide frame-time percentiles or an independent split
  of every exterior subsystem; use a performance trace or scoped instrumentation.
- `src/dev/gpu-timer.js`: timer-query support is optional; report unavailable
  samples as n/a rather than zero. Instrumentation itself can add overhead.
- `MODEL_WORKSHOP.md`: F2 editor for exploration/bookmarks. Transfer accepted
  values to source; visual transforms do not automatically change colliders.
- Development starts: `?start=level3`, and `?start=level3-convergence`,
  `level3-mechanical`, `level3-cargo`, `level3-relay`, `level3-security`,
  `level3-passenger`. These are not production full-run evidence.
- Once a browser is available, record commit, hardware/GPU, browser, viewport,
  device pixel ratio, quality/render scale, shadows/bloom and camera pose. Capture
  both views at Vault, Mechanical, Cargo, Security and Passenger/finale, with
  normal and Freeze states. Compare identical poses/settings after warmup.
- Record frame-time distribution (including p95 via trace), draw calls, triangles,
  resources and heap through a full run and repeated restarts. Target 60 FPS on
  identified representative hardware and a stable 30 FPS fallback; these are
  project goals, not established measurements or rubric thresholds.
- Profile dev diagnostics for attribution; validate final feel/performance on
  production too. A static-camera dev benchmark does not cover a moving full run.

## Batches, dependencies and acceptance criteria

### R0 - Plan and baseline

Status: COMPLETE for feasible planning/baseline scope. Browser-dependent baseline
is explicitly outstanding, not silently passed. Dependencies: existing checkout.

Deliverables: this self-contained plan, source reconciliation, fresh automated
baseline, browser availability check, diagnostics inventory and next prompt.
No gameplay, rendering, timing, camera or ability source changes.

### R1 - Visibility and measured rendering cost

Status: IMPLEMENTED, automated acceptance passed; rendered acceptance and measured
performance PENDING. Depends on R0. Do not call this a verified speedup.

Implement conservative L3-specific visibility management using L2 as reference.
Account for broken walls/ceilings, floor openings, large sightlines, exterior
views, moving/detaching carriage groups, and the brake reveal. Start with intact
occlusion boundaries only; uncertain or moving content stays visible. Do not use
L2's sealed-hull assumptions as an L3 default. Preserve render hooks owned by the
overlay/other systems and restore hooks/visibility on teardown. Consider minimap
and shadow passes explicitly. Render-only visibility must not alter interaction,
collision, Ghost, time histories or light-pool source selection.

Compare 12 vs 8 pooled L3 point lights without committing the reduction until
readability and frame cost are measured. Attribute exterior, transparency and
post costs separately. Pool size stays fixed during normal rendering; do not
cause continuous shader recompilation by fluctuating visible-light counts.
Merge/instance only demonstrated expensive static repeated dressing, per-carriage
and compatible material. Keep moving/time-registered objects separate. Do not
change scenery quality or remove effects merely on an assumption.

Files: L3 factory, carriage culling, light pool, exterior modules, diagnostics,
main render hooks; tests only for meaningful visibility/lifecycle invariants.

Acceptance: no missing geometry in either view, through tears or during breakup/
reveal; correct visibility restoration after main/minimap renders and unload;
unchanged gameplay tests; screenshots and comparable timings/resource counts;
no unsupported speedup claim. Without browser access, implement only conservative
independently checkable work and record pending visual/performance acceptance.

### R2 - Mechanical visual reference

Status: IMPLEMENTED, automated/static checks passed; rendered visual acceptance
and runtime budget comparison PENDING. R1's measurement deferral remains explicit.

Refine Mechanical first: one damaged landmark recognisable from L2, buckled
structural shapes with plausible causes, exposed machinery, restrained brass/wood/
teal surfaces and a clearly protected switching recess. Warm practical light,
cool exterior through damage, amber mechanical warnings and cyan temporal cues.
Reduce competing glow and use selective motion. Evaluate a modest static
environment-lighting treatment for metals only if measured affordable; no live
reflection capture or extra full-screen effects by default.

Files: L3 factory/atmosphere, shared environment builders via L3-specific options,
textures/material factories as needed. Keep encounter timings unchanged.

Acceptance: before/after screenshots in both views and Freeze, readable hazards
and player, clear landing/control silhouettes, unchanged supports/collision and
L2, stable budget against R1. Rendered review required for visual approval.

### R3 - Extend carriage-specific visual composition

Status: NOT STARTED. Depends on R2's established visual direction. Split into
smaller carriage batches if needed; record explicit sub-batches before expanding.

Vault: ruptured containment around empty Core mount. Convergence: split junction,
readable branch signs. Cargo: folded gangway/loop bulkhead dominate. Relay:
operator station and visible linkage dominate. Security: suspended broad wreckage
and intact island dominate. Passenger: torn structure frames the bridge ahead.
Use one L2 callback per section, consistent material language, directional damage,
clear sightlines and selective motion. Reuse existing assets; prioritise large
structural shapes over many tiny debris meshes.

Files: L3 factory, Cargo/Security/routes/atmosphere, damaged carriage dressing,
exterior. Acceptance: each section distinguishable in captured gameplay, cues
consistent, no new hidden floors or false supports, no collision/camera regression,
budget comparisons at the same poses, Level 2 unaffected.

### R4 - Vault, Convergence and Mechanical encounter refinement

Status: NOT STARTED. Depends on R3 cues and browser-observed player behaviour for
difficulty/timing changes. Can inspect/fix demonstrated correctness independently.

Vault: assess two phased racks from safe observation positions, reassess between
them; freezing a dangerous pose stays dangerous; retain Slow/crouch alternatives.
Convergence: communicate fast/exposed vs slower/protected tradeoff before entry;
do not make both routes equally costly/dangerous. Mechanical: make safe ability
switch/recharge recess clear and refine existing Slow -> repair -> hold -> move
execution. Add no unrelated instant-kill layer or duplicate puzzle.

Files: L3 factory/routes, binding-aware hints, existing escape/time tests.
Acceptance: first-time players explain route choice and hazard safety from scene
state, failures teach a repeatable correction, retained history survives waiting,
both routes/cameras/retries work. Record evidence for any altered window.

### R5 - Cargo, Relay and Security encounter refinement

Status: NOT STARTED. Depends on R3 and R4's tuning approach.

Cargo: strengthen restored-pose alignment marks/hinge stops so restoration is
recognisable; preserve early interception and safe landing before the loop door.
Relay: show platform -> linkage -> door -> catch cause/effect, readable echo
occupancy/expiry, short execution and far-side recovery. Security: refine steering,
modest jump, landing silhouettes and second-leg assessment from the recharge
island before considering shorter Freeze windows or smaller supports.

Files: Cargo/Security builders, Relay in L3 factory, related tests and contextual
HUD calls. Acceptance: no hidden-floor/wall bypass, supports match visible decks,
Ghost height/expiry/cancellation recover safely, repeated checkpoint/depletion
retries work, broad legible landings, meaningful alternatives preserved. Human
playtest evidence is mandatory before declaring difficulty improved.

### R6 - Passenger pursuit and finale presentation/audio

Status: NOT STARTED. Depends on R3, R5 and measured chase readability.

Refine rack warning/landing footprint, keep-right then return-to-centre flow,
floor crossing readability and brake identification. Preserve wave speed/lead and
energy defaults absent evidence. Show broken span before brake; Freeze visibly
stops exterior/debris while player retains control; brake reveal establishes
locomotive, missing track and actual stopped motion. Refine existing sequence,
do not schedule it as absent. Add/selectively improve mechanical warning,
stasis hush and brake/settling sounds through existing audio ownership/settings.
Inspect available sounds and attribution before adding dependencies/assets.

Files: L3 factory/routes, exterior, camera reveal, cinematic skip, audio systems.
New roof traversal remains OPTIONAL AND UNSCHEDULED: requires a separate scope
decision because of collision, camera, checkpoint and performance cost.

Acceptance: first-time viewers understand danger, stasis and train stop; warning
sounds remain audible; mute/master controls work; minimum-energy retries remain
solvable; both views/pause/restart/quit/skip recover; completion occurs once;
rendered screenshots and an actual timed chase support tuning.

### R7 - Production integration, resource checks and final handover

Status: NOT STARTED. Depends on R1-R6; browser access required for completion.

Run New Game -> L1 -> L2 -> L3 -> victory on a freshly built production version
without shortcuts. Repeat deaths/checkpoints/depletion/alternate powers/rebindings,
both views and cinematic interruptions. Run appropriate automated regressions and
case-sensitive local subdirectory packaging. Compare agreed R0/R1 poses and a
moving full run; check shader/console/network errors, frame distribution, renderer
resources and heap over repeated runs/restarts. Resolve demonstrated regressions.
Update README/player-facing docs only for verified final behaviour.

Acceptance: full human/browser route, no softlock or resource growth without an
explained bounded cache, performance evidence on identified hardware, clean
production checks, screenshots, honest remaining limitations. Remote hosting,
credits identities and trailer are separate deferred deliverables unless requested.

## Progress and continuation protocol

- [x] R0: read upgrade handover, inspect current source and preserve clean baseline.
- [x] R0: fresh suite/build/local packaging check and browser availability check.
- [x] R0: persist scope, concrete recommendations, dependencies and acceptance here.
- [ ] Missing runtime baseline: production browser boot/play, screenshots, native
  controls, shader/audio results, FPS/frame-time/GPU/heap measurements.
- [x] R1 conservative visibility implementation and automated regression checks.
- [ ] R1 rendered visibility acceptance and measured rendering-cost comparisons.
- [x] R2 Mechanical visual-reference implementation and automated/static checks.
- [ ] R2 rendered first/third-person/Freeze review and runtime budget comparison.
- [ ] R3 remaining carriage visuals.
- [ ] R4 Vault/Convergence/Mechanical encounters.
- [ ] R5 Cargo/Relay/Security encounters.
- [ ] R6 Passenger/finale/audio.
- [ ] R7 production integration and final verification.

At each batch end record changed files, decisions/tradeoffs, exact commands and
fresh outcomes, pending acceptance with reason, and exact next action. Distinguish
implementation complete from rendered/performance acceptance complete. Preserve
historical results as history. Re-read relevant source rather than rereading all
audits or copying entire files into context. A fresh chat should resume here.

## R1 results (2026-10-15)

Starting tree had only the untracked R0 `reports/level-3-refinement-plan.md`;
preserved it and the completed upgrade work. No Level 2 runtime, ability costs,
wave settings, strain, scenery quality, light counts or post effects were changed.

Implementation:

- Added `src/environment/wreck-visibility.js`, separate from L2's portal culler.
  All L3 shell sides are open in current source, so sealed-carriage chains would
  be incorrect. Only full solid bulkhead side panels/lintels get L3-only metadata
  in `carriages.js`; floor, side damage, ceiling, door leaves and effects do not.
- Only a current interior carriage's real panels can occlude ordinary leaf
  meshes. All eight corners of a padded live world AABB must project strictly
  inside a solid panel's face, and the entire target must be beyond that panel.
  A partly exposed bound stays visible. Both candidate and panel world matrices
  are read each pass, supporting shake, moving objects and detached carriages
  without stale sealed-zone assumptions. Unknown/new objects are left visible.
- Shadow-casting, instanced, skinned, morphing, displaced, custom-shader,
  shader-modified, stencil-writing and depth-independent meshes are excluded.
  A transparent/alpha/clipped/hidden/wrong-layer/near-clipped occluder is not used.
  Exterior/roof cameras, orthographic/minimap views, global clipping, and the
  braking cinematic fail open. Camera locations near carriage ends also fail open.
- Hooks chain existing scene callbacks, restore visibility before the previous
  after hook, and release only their own hook ownership at disposal. Restoration
  also runs before a new pass, before the next simulation update, on culling
  errors and on level teardown. Lights are never hidden. Shadow casters stay
  visible because Three's scene-before hook precedes the shadow pass.
- `timewreck.js` installs/removes this lifecycle and exposes
  `level.getVisibilityStats()` with eligible candidates, active panels, tested
  bounds and last-pass hidden count. These are culling counters, not timings,
  actual renderer draw-call counts or a speedup measurement. No per-frame vector,
  matrix or bounding-box construction is needed in the culler; stats snapshots
  allocate only when requested. Bounds checks and matrix updates do add CPU work.
- Fixed the stale light-budget comment: L3 retains 12; L2 uses 8. The proposed
  12-vs-8 comparison, separate exterior/transparency/post attribution, geometry
  merging and quality reductions were not adopted without browser evidence.

Fresh validation:

| Command/check | Result |
| --- | --- |
| `node --import ./scripts/register-test-assets.mjs tests/wreck-visibility.test.js` | PASS: six focused tests |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-escape.test.js` | PASS: 21 tests, including new real-level visibility integration |
| `npm.cmd test` | PASS: 85 passed, 0 failed, 0 skipped (prior 78 preserved, seven added) |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning remains |
| `node scripts/check-production.mjs` | PASS: 53 files, 72.62 MiB, 52 case-sensitive subdirectory asset references |
| `git diff --check` | PASS |
| Browser inventory and launch | No apps/browsers; `Browser is not available: iab` |

Suite and Vite used approved process access. Logs are ignored local files
`reports/refinement-r1-{targeted,tests,build,production}.log`. Existing geometry
and headless audio timer messages remain. Automated tests exercise doorway/edge
exposure, live transforms, near-plane/layer/alpha fallbacks, shadow exclusion,
custom materials, interrupted passes, hook arguments/ownership and teardown.
The real-level test visits all seven L3 starts under NORMAL/FREEZE/REWIND at
three lateral camera positions and raycasts every culled padded bound corner
against actual bulkhead geometry, then checks exact visibility restoration and
orthographic pass recovery. Existing traversal/energy/retry/manager tests pass.
These geometric checks do not render pixels or establish native camera comfort.

Unmet R1 acceptance / required follow-up when browser access is available:

1. Capture actual first/third-person views through doorways, open sides and floor
   holes; walk carriage boundaries; inspect root shake and detached wreckage.
2. Check main colour, shadows, minimap, editor/exterior views and brake reveal;
   verify no missing geometry, flicker, cue loss, shader errors or hidden state.
3. Compare identical poses/settings with and without visibility management and
   record CPU/GPU frame distributions, draw calls, resources and heap. The
   algorithm adds CPU cost; retained benefit is not established by these tests.
4. Compare 12 vs 8 L3 point lights and isolate the two exterior systems,
   transparency and post cost using controlled diagnostics. Adopt reductions only
   if the timing/readability comparison supports them.
5. Run the actual full production game without shortcuts. Local packaging and
   Node geometry tests do not substitute for rendered/browser acceptance.

Historical R1 stop state: R2 was not started then. It was subsequently authorized
and implemented below. R1's pending browser checks remain open and must be
completed before final performance/visual approval.

## R2 results (2026-10-15)

Scope: Mechanical visual reference only. Preserved the existing uncommitted R0/R1
plan, visibility implementation and tests. Did not begin R3. No new assets,
dependencies, textures, lights, shadow casters, animation systems or post passes.
Did not change hazards, timing, supports, voids, collisions, checkpoints, abilities,
strain, wave speed or lead, player/camera source, or Level 2's builders/parameters.

Changed files and decisions:

- `src/environment/mechanical-reference.js`: three static merged material batches
  form a buckled brass service header, two hanging lining pieces, and a short
  subdued cyan seam. Brass profile echoes the existing luxury handrails. Offset
  rib/rail sections show one directional structural failure at the left viewport,
  opposite the right-hand switching recess. All parts remain above 2.55 m and
  outside the central aisle, use existing brass/dark-steel materials where possible,
  cast no new shadows and carry the existing decorative camera-exclusion flag.
- `src/environment/carriages.js`: only damaged Mechanical calls the new builder.
  Its three batches replace the long violet rupture strip and two broad cyan tears
  (three meshes for three). Four existing cylinder sconce shades become rectangular
  lantern glass recalling L2's practical fixtures, with less emissive intensity
  and slightly rougher glass. Existing warm strip, wood/teal shell, burgundy benches,
  handrails, blown viewports, generic wreck dressing and moving machinery remain.
- `src/levels/timewreck-routes.js`: the existing safe switching-pad footprint and
  position remain. Replaced its filled cyan box with one merged bracket/chevron
  outline facing decreasing Z/the shutter. The solid wood floor is exposed in the
  centre, rather than suggesting a glowing platform or extra ability surface.
  The outline uses a local muted cyan material so Convergence's shared marker
  material is unaffected. This adds one material resource in the route builder,
  but no mesh/draw batch; geometry is 10 triangles vs the old box's 12.
- `src/levels/timewreck.js`: moved the existing 3.8-intensity, 9 m-range Mechanical
  accent to the left damaged header and changed violet to cool blue-grey. Warm
  practical fills, source count, pool size 12, timings and machinery unchanged.
  No environment-map/reflection treatment was added without visual/cost evidence.
- Reused existing selective fixture motion; the new structural landmark is static.
  No scene-wide sway, flash or bloom increase was introduced.

Static before/after inventory from the actual carriage builders (Node, no WebGL):

| Mechanical shell | Before | After |
| --- | --- | --- |
| L2 meshes / triangles / source lights | 250 / 5016 / 16 | 250 / 5016 / 16 |
| L2 unique materials / geometries | 12 / 248 | 12 / 248 |
| L3 meshes / triangles / source lights | 114 / 2146 / 2 | 114 / 2126 / 2 |
| L3 unique materials / geometries | 23 / 112 | 23 / 112 |

Counts cover the Mechanical **shell** subtree, including instances. They exclude
level-owned moving trunks, extra fills, route marker and the rest of the train;
they are not actual draw-call, shader-program, GPU-memory or FPS measurements.
The four simplified shades save 80 triangles; the replacement header adds 60 vs
the old three boxes, net shell reduction 20. Triangle/resource counts do not
establish performance parity or improvement. L2's matching counts are supporting
structural evidence, not screenshot-based appearance approval.

Fresh validation:

| Command/check | Result |
| --- | --- |
| `npm.cmd test` | PASS: 85 passed, 0 failed, 0 skipped; existing R1/traversal/retry/disposal tests retained |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning remains |
| `node scripts/check-production.mjs` | PASS: 53 files, 72.62 MiB, 52 case-sensitive subdirectory asset references |
| Static geometry probe | PASS: header batches stay above 2.55 m and by left wall; no new shadow casters; marker stays inside original 1.1 x 2 m footprint, centre ray sees no marker, edge ray sees outline |
| `git diff --check` | PASS |
| Browser inventory / Mechanical in-app launch | Empty apps/browsers; `Browser is not available: iab` |

Tests/build used approved process access; logs:
`reports/refinement-r2-{tests,build,production,geometry,static-before,static-after}.log`
(ignored). Existing geometry/headless audio warnings remain. No redundant tests
were added for reversible material/shape choices; existing gameplay/R1 integration
and disposal tests ran against the new real scene.

Pending acceptance and manual next checks:

1. R1's actual culling/shadow/minimap/exterior/finale review, cost comparisons and
   production full-run remain pending. No measured speedup is claimed.
2. R2 has no before/after gameplay screenshots, actual first/third-person/Freeze
   approval, shader/audio browser result or human readability assessment. The
   intended composition is implemented but not visually certified.
3. Open development `?start=level3-mechanical`. In both views, inspect the header
   from entry and safe recess, lantern motion, warm/cool balance and trunk/shutter
   silhouettes. Freeze/Rewind the actual encounter, recover at checkpoints, and
   verify the outline clearly indicates safe solid floor without extra instruction.
4. Inspect header against viewport/generic wreckage for visual overlap and camera
   comfort; CPU clearance checks are not a rendered-camera check.
5. Capture identical poses/settings and measure frame distributions, draw calls
   and resources against R1. Check accent placement/pool selection for light pops
   and adjacent-carriage spill. Static budgets alone do not establish runtime cost.
6. Compare L2's Mechanical in browser and complete the production route before
   claiming visual parity/no regression. Preserve the plan's full-run requirements.

Next action: R3 only after a user request. Its broad visual propagation should use
this implementation as a candidate reference, retaining the explicit rendered
review deferral; do not represent an unseen style as visually approved. If browser
access becomes available, review Mechanical before extending the treatment.

## Exact next-batch prompt

```text
Use Game Studio. Complete R3 of the Level 3 refinement pass described in
reports/level-3-refinement-plan.md.

Read the plan and relevant current source first. Preserve existing user changes,
completed upgrades, Level 2 behaviour, and current gameplay/ability parameters.
Extend the carriage-specific visual composition described in R3, using Mechanical
as a candidate reference. Keep R1 and R2's pending rendered/performance checks
explicit; review Mechanical first if browser access becomes available. Preserve
distinct landmarks, safe-floor readability and current encounter timing. Do not
add an unmeasured lighting/effect budget. Split R3 into explicit carriage
sub-batches if needed and record the exact scope before editing.

Run appropriate regression/build/packaging checks and rendered verification where
available. If browser access is unavailable, continue independently checkable work
and record precisely which visual/performance acceptance criteria remain pending.
Update the plan with changes, decisions, fresh validation and exact next steps.
Complete R3 only; do not begin R4. Finish with a concise handover and next prompt.
```

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
and profiling remain pending (see results below). The latest request authorized
R3 and R4 only; both implementations and automated/static checks are now complete.
Their rendered/human/performance acceptance remains pending. The subsequent R5
request authorized R5 only. R5 implementation and automated/static checks are now
complete; rendered/human/runtime acceptance remains pending. The subsequent R6
request authorized R6 only. R6 implementation and automated/static checks are now
complete; rendered/audio/human/runtime acceptance remains pending. R7 has not started.
Do not repeat completed upgrade mechanics or treat historical test counts as fresh verification.
Implement only the requested batch, validate, update this handover, then stop.

## Historical R3/R4 scope (2026-10-15, recorded before editing)

The latest request mentions R2, which is already implemented, and explicitly
authorizes R3 and R4 only, stopping before R5. Preserve all existing working-tree
changes. Use Mechanical as an unrendered candidate reference, not approved art.

R3 sub-batches: (a) Vault containment and Convergence split-junction framing;
(b) Cargo folded header and Relay operator-station framing; (c) Security torn
overhead ribs and Passenger outward-torn bridge framing. Replace the six existing
generic violet rupture strips with merged, carriage-specific structural landmarks,
retaining mesh/light counts and keeping new geometry clear of traversable space.
Existing gangway, linkage, island and suspended decks remain the dominant playable
forms; no R5 encounter, alignment, occupancy or timing work is authorized.

R4: improve pre-entry route signs, pair Vault clearance colour with a changing
shape, and refine binding-aware observation/switching hints. Preserve every
gameplay value, collision/support shape, timing, checkpoint and alternate solution.
Run geometry/budget comparisons and gameplay regressions. Browser inventory is
again empty; rendered, human-readability and performance approval remain pending,
including every R1 and R2 follow-up below. Do not begin R5.

## R5 scope (2026-10-15, recorded before editing)

Authorized R5 only. Starting tree is clean at `ec08231`; preserve R1-R4 work,
Level 2 and every gameplay parameter. Browser inventory is again empty.

Implement Cargo's fixed hinge-stop/mating rail marks on intact lips; Relay's
moving linkage feedback, far-side catch connection and actual echo-expiry display;
Security's directional surface marks and paired jump/landing marks, with island
assessment instructions. No changes to clocks, supports, holes, motion amplitudes,
ability rules/costs, Ghost lifetime, checkpoints or collision. A read-only Ghost
remaining-lifetime accessor may serve Relay's display without changing replay.
Validate live state/reset/cancellation/expiry and geometry alignment plus existing
traversal/retry/alternate solutions. Keep R1 and R2-R4 rendered/performance/human
acceptance pending. Do not begin R6 or claim difficulty improved without playtests.

## R6 scope (2026-10-15, recorded before editing)

Authorized R6 only. Preserve the uncommitted R5 source/tests/handover and untracked
`state/` directory. Refine rack footprint and right-to-centre floor guidance,
identify the brake/track danger, and frame locomotive plus both broken-span edges
in the existing reveal. Preserve 6.2 m/s wave, 12 m lead, all energy/gameplay
parameters, 2.5 s deceleration and 4.8 s reveal. Add L3-owned procedural mechanical
warning, rumble/stasis hush and brake/settling audio through existing master gain;
inspect/reuse existing audio conventions, with no external asset/credit changes.
Use optional presentation-pause forwarding for lifecycle safety, without changing
Level 2. No roof traversal, new effects/lights or R7 integration. Browser inventory
is still empty; R1 and R2-R5 rendered/performance/human checks remain pending.

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

Status: IMPLEMENTED; automated/static checks passed. Rendered composition, camera
review and runtime budget acceptance PENDING. R2 remains a candidate reference.
The three explicit sub-batches are recorded above; results are below.

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

Status: IMPLEMENTED for cues/instructions and automated correctness; first-time
human readability and rendered acceptance PENDING. Difficulty/timing changes were
not made: no browser-observed player evidence exists and parameters are preserved.

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

Status: IMPLEMENTED; automated/static checks passed. Rendered first/third-person
review, human comprehension/difficulty and runtime budget acceptance PENDING.
No gameplay parameters or encounter windows were changed. Results below.

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

Status: IMPLEMENTED; automated/static/audio-graph checks passed. Rendered/audible
acceptance, human comprehension and actual timed chase/performance PENDING.
Wave, energy, hazard, deceleration and reveal timing parameters are unchanged.

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
- [x] R3 carriage-specific landmark implementation and static/regression checks.
- [ ] R3 rendered distinctiveness, both cameras/Freeze and runtime budget review.
- [x] R4 Vault/Convergence/Mechanical cues/instructions and correctness checks.
- [ ] R4 first-time human comprehension, rendered/retry review and difficulty acceptance.
- [x] R5 Cargo/Relay/Security feedback implementation and automated/static checks.
- [ ] R5 rendered camera/Freeze review, human comprehension and runtime budget acceptance.
- [x] R6 Passenger/finale/audio implementation and automated/static checks.
- [ ] R6 rendered/audible review, human comprehension and actual timed chase/performance.
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

Historical R2 next action (subsequently authorized and implemented below): R3's visual propagation should use
this implementation as a candidate reference, retaining the explicit rendered
review deferral; do not represent an unseen style as visually approved. If browser
access becomes available, review Mechanical before extending the treatment.

## R3/R4 results (2026-10-15)

R2 was already implemented when this request arrived. Followed the explicit
R3/R4-only instruction, preserving existing visibility/reference work and all
Level 2 and gameplay parameters. HEAD was `145db29` at final review; no commits,
resets or staging operations were performed by this pass. R5 has not started.

Changed files and decisions:

- `src/environment/wreck-landmarks.js` and damaged-only integration in
  `carriages.js`: replace the six existing generic violet rupture strips with
  single merged brass batches. Vault has an empty broken armillary containment
  crown at L2's Core-display Z; Convergence has a split junction header; Cargo a
  folded luggage fascia by the wall; Relay a broken operator-station surround;
  Security sheared ribs framing the intact island; Passenger a saloon arch torn
  outward at the forward end. Existing real gangway, platform/linkage, broad
  decks/island and bridge remain the playable landmarks. Existing warm fixtures,
  wood, teal, luggage and benches are retained. No new motion system: each batch
  follows its actual carriage; Vault retains existing fracture material ownership.
- Replacement disposes the old strip geometry, reuses its material, and retains
  one mesh per carriage. All new bounds are above 2.55 m, with no camera collision
  or shadows. These are overhead remains, not floor/support/repair targets; no
  occluder metadata was added. Mechanical's R2 geometry is unchanged.
- `timewreck-routes.js`: two static approach-facing signs above the actual fork
  identify DIRECT / FAST / EXPOSED and LOW / SHELTERED. They reuse the procedural
  sign factory and brass/cyan vocabulary, have no lights/shadows/camera collision,
  and introduce no route, collision, shutter or support changes.
- `timewreck.js`: existing Vault lamp becomes a horizontal green bar for standing
  clearance and an upright amber bar otherwise. The predicate is unchanged; Freeze
  holds the real dangerous pose too. Hints explain observation and reassessment
  between racks, retaining Slow/crouch alternatives. The fork hint now arrives at
  centre + 11.5 m, before the partition starts at +9 m, and explains the tradeoff
  using rebound crouch/Rewind/Freeze keys. Mechanical's entry hint describes solid
  floor within the brackets and release/recharge/repair/hold sequence. A one-shot
  prompt appears only inside the existing safe recess. Text display durations are
  adjusted; encounter windows, costs, speeds, cooldowns and checkpoint logic are not.
- `tests/timewreck-escape.test.js`: extend the existing clearance crossing test to
  check the non-colour signal; add dangerous-pose Freeze collision coverage and
  pre-entry/rebound-key/recess prompt integration. Existing multi-rate traversal,
  both fork routes, waiting/retained repair history, early interception, retries,
  depletion, visibility and teardown coverage remains passing. No R5 cue or puzzle
  logic was changed.

Static shell budget vs the captured pre-edit builders:

| L3 shell | Triangle delta | Mesh/light/shadow/material/geometry count delta |
| --- | --- | --- |
| Vault | +228 | 0 |
| Convergence | +24 | 0 |
| Cargo | +24 | 0 |
| Relay | +24 | 0 |
| Security | +36 | 0 |
| Passenger | +36 | 0 |
| Mechanical / cab | 0 | 0 |

Total landmark increase: 372 triangles. Level 2 counts match the pre-edit capture
for every carriage. Separately, the level-owned signs add two meshes, four
triangles, two materials and two 1024 x 128 procedural canvas sources (map and
emissive-map clones use each source). No new lights, shadows, full-screen effects,
assets, downloads or dependencies. Lamp shape changes add no resources. These
are structural counts, not measured draw calls, GPU memory, cost parity or speedup.

Fresh final validation:

| Command/check | Result |
| --- | --- |
| `npm.cmd test` | PASS: 87 passed, 0 failed, 0 skipped; about 30.1 s |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning |
| `node scripts/check-production.mjs` | PASS: 53 files, 72.62 MiB, 52 case-sensitive subdirectory asset references |
| Before/after actual builder inventory and geometry probe | PASS: all six landmarks above 2.55 m, no new shadows/camera collision; L2 counts unchanged; L3 shell resource counts unchanged |
| `git diff --check` | PASS |
| Browser surface inventory | `apps: []`, `browsers: []`; no rendered review available |

The initial sandbox suite attempt hit Node worker `spawn EPERM`; final tests and
Vite build passed with approved child-process access. Ignored logs:
`reports/refinement-r34-{tests,build,production,static-before,geometry}.log`.
Existing geometry/headless-audio warnings persist. No pixels or native camera
input were produced by the Node geometry checks.

Pending acceptance and exact next steps:

1. **R1 remains pending in full:** both-camera doorway/open-side/hole/boundary
   review, main/shadow/minimap/exterior/finale correctness, culling CPU/GPU
   distributions/draw calls/resources/heap, controlled 12-vs-8 light comparison,
   exterior/transparency/post attribution, and full production run. No verified
   rendering speedup is claimed. R2's Mechanical rendered/budget review also remains.
2. Review Mechanical first, then capture the six R3 carriages from real first- and
   third-person gameplay in Normal/Freeze at identical settings/poses. Confirm
   landmarks distinguish sections, do not overlap wreck dressing or obscure hazards,
   and remain comfortable under shake, culling, pooled lighting and fracture FX.
3. Check the signs' text size, lighting, approach angles and camera clearance in
   WebGL. Ask first-time players to explain the fork tradeoff, horizontal/upright
   rack lamps, danger retained during Freeze, and Mechanical switching sequence.
   Check checkpoints/retries in both views. Automated routes do not establish human
   comprehension or improved difficulty; no such approval is claimed.
4. Compare resources/frame distributions at R0/R1 poses and during a production
   full run/restarts. Static counts do not establish shader compilation, FPS or
   resource stability. No timing changes are justified before that evidence.
5. Stop here. R5 implementation requires the next request; R6/R7 remain untouched.

## R5 results (2026-10-15)

Started from clean HEAD `ec08231`. Preserved R1-R4, Level 2, ability/energy
parameters, all encounter clocks and durations, Ghost lifetime, floor cuts,
support sizes/heights, checkpoints and collision. R6 was not started. No commits,
staging, resets, dependencies or new assets were introduced.

Changed files and decisions:

- `src/levels/timewreck-cargo.js`: one merged brass batch forms fixed mating
  stops at both hinges. Each short stop lies wholly on an intact floor lip,
  meeting an existing moving rail in the restored flat pose. The earlier-pose
  outline remains; the references do not move with either leaf. No geometry spans
  the hole or adds a side path. Existing selective failure history, 24 support
  strips, walkable-angle threshold, early Freeze and safe landing are unchanged.
- `src/levels/timewreck-relay-feedback.js`, integrated by `timewreck.js`: the
  existing release linkage depresses with real occupancy; one added far-side
  linkage connects door to catch. Eight instanced bars above the doorway show
  actual remaining echo time while it weights the platform. A physical occupant
  keeps the row full; an unheld release collapses the bars to small ticks; the
  durable catch fills them green and depresses its linkage. Bar height/count and
  linkage/handle pose complement colour. Feedback changes no door targets,
  occupancy predicates, spring timing, seam protection or catch eligibility.
- `src/entities/time-ghost.js`: added only a read-only `getRemainingSeconds()`
  accessor calculated from the existing trajectory, playback clock and hold
  duration. It returns zero after expiry/cancellation/reset. No replay, energy,
  lifetime, occupancy or Level 2 behavior was changed. Relay reads it rather than
  maintaining a second timer; Ghost continues consuming real time during Freeze.
- `src/levels/timewreck-security.js`: five brass chevrons ride the actual moving
  decks and point towards the next deck/island/exit. Paired bars on the last two
  decks identify takeoff and landing without filling the jump gap. A single merged
  batch marks entry on the left and departure on the right, wholly on permanent
  approach/island floor. Each deck still has the same broad wood top, exact support
  footprint, settling duration, motion, outline and Freeze behavior. No supports
  or collision shapes were enlarged or shrunk.
- `timewreck.js` contextual hints explain Cargo's fixed/moving alignment and early
  Freeze alternative, Relay's platform/linkage/countdown/catch and recovery after
  expiry, and Security's steering, solid island recharge/reassessment and paired
  jump markers. They use current bindings. No extra persistent HUD panel, toast
  stream, lights, sound or post-processing was added. Passenger/finale unchanged.
- `tests/timewreck-{cargo,relay,security}.test.js`: added Cargo lip/reference
  geometry and restoration coverage and Relay real-clock/countdown/Freeze/reset
  integration. Extended existing occupancy-height/cancellation/expiry/catch/retry
  checks and Security support/geometry checks to cover the new marks. Existing
  full traversal, alternate solutions, wall/hole bypass, depletion, retained
  repair history, multi-rate execution and lifecycle tests remain passing.

Static resource inventory from the real assembled level:

| New feedback | Meshes | Triangles (including instances) | New geometries |
| --- | --- | --- | --- |
| Cargo fixed hinge stops | 1 | 96 | 1 |
| Relay bars (8 instances) + far-side linkage | 2 | 108 | 2 |
| Security surface marks | 6 | 36 | 6 |
| Total | 9 | 240 | 9 |

One new material for Relay bars; all other new geometry reuses encounter
materials. No new textures, lights, shadow casters or full-screen passes. Every
new cue excludes camera collision; resources remain under the existing disposal
roots. The probe confirms cue removal on teardown. These counts are not actual
draw calls, GPU memory, FPS, measured cost parity or leak/stability proof.

Fresh final validation:

| Command/check | Result |
| --- | --- |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-cargo.test.js` | PASS: 8 tests |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-relay.test.js` | PASS: 8 tests |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-security.test.js` | PASS: 7 tests |
| `npm.cmd test` | PASS: 89 passed, 0 failed, 0 skipped; about 12.5 s |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning |
| `node scripts/check-production.mjs` | PASS: 53 files, 72.63 MiB, 52 case-sensitive subdirectory asset references |
| Actual-level geometry/resource/disposal probe | PASS: inventory above, no new shadows/camera blockers; cues removed on teardown |
| `git diff --check` | PASS |
| Browser surface inventory | `apps: []`, `browsers: []`; no rendered/native-input review available |

Full tests and Vite used approved child-process access. Ignored logs:
`reports/refinement-r5-{cargo,relay,security,tests,build,production,geometry}.log`.
Existing non-indexed geometry and headless audio timer warnings remain.

Pending acceptance and exact next steps:

1. **R1 rendered/performance checks remain open:** doorway/open-side/hole/boundary
   views, shadows/minimap/editor/exterior/finale, live movement/shake/detachment,
   controlled culling CPU/GPU/frame distributions/draw calls/resources/heap,
   12-vs-8 pooled lights, exterior/transparency/post attribution, and actual full
   production run. No verified speedup is claimed. R2-R4 visual/human/runtime
   acceptance also remains pending.
2. Once a browser is available, review Mechanical first, then Cargo/Relay/Security
   in both player views with Normal/Slow/Freeze/Rewind and concurrent Ghost where
   applicable. Capture actual restored/broken/intercepted Cargo, observe alignment
   and rest/recharge before the loop. Verify Relay linkage and bar visibility,
   depletion/cancellation/expiry, seam safety, catch after expiry and checkpoint
   recovery. Inspect Security steering silhouettes, full settling, both island
   observation directions, jump interruption and safe landing. Automated geometric
   checks do not establish camera comfort, shader/audio correctness or readability.
3. Ask first-time players to explain cause/effect and safe next actions, then run
   deaths/checkpoints/depletion/alternatives/rebindings in both views. Human
   evidence is still required before claiming difficulty improved. No window or
   support tuning was justified or performed.
4. Compare identical poses/settings and a moving production run to R1; check
   resources/heap across restarts. Additional CPU matrix updates and rendering
   resources have unmeasured runtime cost; static budgets do not establish parity.
5. Stop at R5. R6 requires the next request; R7 remains untouched.

## R6 results (2026-10-15)

Preserved the existing R5 working-tree changes and untracked `state/` at entry.
HEAD progressed to `97f3d79` (R5) and then `6c1c3f0` (R6 source) during this pass;
this agent performed no commits, staging, resets or operations on `state/`.
At final review only this handover remains modified; tested source is committed.
R6 only; R7 not started. No ability costs, energy recovery, wave speed/lead,
hazard windows, support sizes/heights, collision, checkpoints, 2.5 s deceleration
or 4.8 s reveal duration changed. Level 2's builders and gameplay are unchanged.

Changed files and decisions:

- `src/levels/timewreck-routes.js`: replaced the Passenger rack's filled amber
  box with one merged corner-bracket batch. Its exact 3 x 1.1 m footprint and
  position match the existing fall blocker; the safe wood floor is exposed.
  Trigger, warning/fall durations, rack motion, history and collision unchanged.
- `src/environment/passenger-guidance.js`, `timewreck.js`: one merged brass
  chevron batch marks keep-right before the rack, a turn towards centre after it,
  and centre approach to the frozen floor. Every vertex stays on solid floor
  before the real hole; no mark bridges air or adds a support. Existing frozen
  crossing caps/geometry remain. A procedural sign identifies the emergency brake;
  another reads TRACK OUT / BRAKE in the cab, reinforcing the existing actual
  broken bridge beyond it. Rack warning text now explains right-then-centre flow.
- `src/cameras/wreck-stop-shot.js` and `player-view.js`: changed only the
  L3-specific reveal shot. It now looks across the locomotive and both missing
  track edges, rather than placing the gap behind the camera. It still uses the
  existing cinematic ownership, timing, skip and normal camera recovery. Source
  projection checks at FOV 55/60/95, aspects 4:3 and 16:9, and times 0/2.5/4.8 s
  keep the actual boiler and near/far gap edges inside the view. This is camera
  math, not proof of unobstructed pixels, composition, fog or human comprehension.
- `src/systems/wreck-audio.js`: L3-owned procedural mechanical warning, low
  rumble, brake clunk/squeal and single settling knock. Inspected existing
  `core/audio.js`, door/ability SFX, level music and procedural music ownership.
  No imported recording, dependency, attribution or credits change. All new
  voices pass through the shared master/mute node. Stasis hush reduces only this
  mechanical bed; warning transients bypass its gain. Existing music/ability audio
  remains unchanged, so audible balance against those tracks requires review.
- Brake squeal pitch/gain and rumble deceleration follow the existing simulated
  brake clock, not a separate 2.5-second wall-clock sequence. Pausing gates the
  local bus; the settling knock triggers once on stop. No wall-clock cleanup timers
  or per-frame voice creation. Two continuous bed voices plus one braking voice
  use existing Web Audio; short warning/clunk/settling voices disconnect on end.
  Checkpoint reset, skip/natural completion, restart and teardown stop/disconnect
  owned nodes. Completion guards prevent restarting the bed after a completed skip.
- `src/core/level-manager.js` forwards an optional `setPresentationPaused` hook;
  `src/main.js` calls it from existing input-state synchronization. L3 mutes its
  bus during title/credits/pause/editor/transition/caught states and permits normal
  play/cinematic audio. Other levels omit the hook, so this has no Level 2 effect.
  The hook does not alter simulation, camera input or pause precedence.
- `test/wreck-audio.test.mjs`, `tests/wreck-stop-shot.test.js`, existing camera/
  escape tests: validate real master-setting routing with a fake Web Audio graph,
  lazy/no-context behavior, warning-vs-bed routing, hush, pause, one-shot settling,
  reset/disposal, shot coverage, exact marker bounds, solid-floor guidance and
  optional manager pause forwarding. Existing minimum-energy repeated chase,
  actual scenery stop, camera recovery, skip-once, restart/quit/stale callback and
  full traversal tests remain passing. The first full run caught the old camera
  test's literal X=10 expectation; updated it to the deliberate new X=19 at 2 s
  and retained all first/third-person recovery assertions. Final suite passes.

Static rendering budget: net +3 meshes/+3 geometries/+100 triangles, two sign
materials and two 512 x 128 procedural canvas sources. Rack marker remains one
mesh, with 96 triangles replacing 12; guidance adds 12 and signs add 4. No new
lights, shadow casters, full-screen passes or external assets. New cues exclude
camera collision and are removed through existing level disposal. The probe checks
actual assembled resources/removal, not draw calls, shader compilation, GPU memory,
cost parity or leaks over rendered restarts. Audio adds unmeasured CPU/mix work.

Fresh final validation:

| Command/check | Result |
| --- | --- |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-escape.test.js` | PASS: 23 tests before final added geometry/forwarding assertions; all included in final suite below |
| Direct audio-graph and reveal-shot tests | PASS; also included in final suite |
| `npm.cmd test` | PASS: 91 passed, 0 failed, 0 skipped; about 29.5 s |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning |
| `node scripts/check-production.mjs` | PASS: 53 files, 72.63 MiB, 52 case-sensitive subdirectory asset references |
| Actual-level cue inventory/disposal probe | PASS: net budget above, no new shadow/camera blockers, cue removal |
| `git diff --check` | PASS |
| Browser surface inventory | `apps: []`, `browsers: []`; no rendered/native-input/audio capture available |

Full suite/build used approved child-process access. Ignored logs:
`reports/refinement-r6-{targeted,tests,build,production,geometry}.log`.
Existing non-indexed-geometry and headless audio timer warnings persist.

Pending acceptance and exact next steps:

1. **R1 remains pending in full:** both-camera doorway/open-side/hole/boundary
   visibility, shadows/minimap/editor/exterior/finale, root shake/detachment,
   culling CPU/GPU/frame distributions/draw calls/resources/heap, controlled
   12-vs-8 pooled lights, exterior/transparency/post attribution and actual full
   production route. No measured speedup is claimed. R2-R5 rendered/human/runtime
   acceptance remains pending as recorded above.
2. In a real browser, review Mechanical first, then capture Passenger approach,
   rack warning/fall footprint, right-to-centre transition, frozen crossing,
   locomotive/brake approach and reveal in both views. Confirm the real missing
   span is visible before the brake and the new reveal avoids obstruction/fog/cuts;
   projected landmark positions do not establish this. Confirm exterior/debris
   stasis while player retains control and actual stopped motion at 2.5 s.
3. Listen on representative speakers/headphones: confirm mechanical warning is
   audible against level music/ability sounds, local stasis hush communicates
   stopped machinery, brake squeal decays naturally and settling knock is clear.
   Test master volume/mute before unlock and during play, pause/resume/editor,
   repeated deaths/checkpoints, restart, quit and skip. Fake graph tests do not
   establish browser unlock behavior, audible quality or actual device cleanup.
4. Run an actual timed minimum-energy chase and human first-time comprehension
   pass in both views, including rebindings/depletion/alternatives/interruptions.
   Automated 30/60/144/variable-rate routes are not human difficulty approval.
   Wave/energy/window values remain unchanged pending that evidence.
5. Compare identical production poses/settings and full-run/restarter resource
   traces against R1. No FPS/memory/performance parity claim follows from static
   counts or build/tests. Stop here; R7 requires the next request and browser access
   for its full completion. Remote hosting, credits identities and trailer deferred.

## Exact next-batch prompt

```text
Use Game Studio. Complete R7 of the Level 3 refinement pass described in
reports/level-3-refinement-plan.md.

Read the plan and relevant current source first. Preserve existing user changes,
completed upgrades, Level 2 behaviour, and current gameplay/ability parameters.
Perform R7 production integration and final verification. Keep R1's pending
rendered visibility/performance checks and R2-R6's rendered/audio/human/runtime
acceptance explicit until actually verified. Run the freshly built production
route New Game -> L1 -> L2 -> L3 -> victory without shortcuts, with both views,
retries/depletion/rebindings/alternatives and finale interruptions. Capture pixels,
audio behavior and runtime performance/resources on identified hardware/settings.
Resolve demonstrated regressions while preserving gameplay parameters.

Run appropriate regression/build/packaging checks and rendered verification where
available. If browser access is unavailable, continue independently checkable work
and record precisely which visual/performance acceptance criteria remain pending.
Update the plan with changes, decisions, fresh validation and exact next steps.
Complete R7 only. If browser access remains unavailable, complete feasible checks
and record the precise blocker; do not mark full integration/visual/performance
acceptance complete or imply publication. Finish with an honest final handover.
```

## Expansion N9 acceptance reconciliation (2026-10-15)

The later [N8/N9 handover](level-3-expansion-plan.md#n8n9-implementation-and-verification-2026-10-15)
adds fresh automated coverage of both continuous L3 branches, minimum-energy
retries, new event lifecycle, stop/skip, audio graphs and resource disposal:
163 tests pass, plus build and local packaging. It preserves R1-R6 mechanics
and their unverified rendered requirements. No browser, screenshots, audible
review, native controls or hardware measurements were obtained. **R7 has not
been separately implemented or accepted**, and R1-R6 rendered acceptance stays
pending. Overlapping N9 tests are supporting evidence, not a retroactive pass
for R7 or the A1-A9 ledger; N1 is also still absent. No publication occurred.

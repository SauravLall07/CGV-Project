# Chrono Express: Beta Code Audit and Two-Week Plan

Reviewed 1 October 2026. Working target: **15 October 2026** (two weeks from the stated request; confirm against Moodle, which is authoritative). Source baseline compared with `reports/chrono-express-codebase-review-2026-09-08.docx`. This is a code and document audit, not a browser playthrough.

## Executive summary

The checkout contains three substantial level implementations, shared lifecycle/input/camera systems, custom vertex and fragment shaders, music, controls settings, and checkpoints. It is beyond a greybox, but is **not beta-ready on evidence**: all 29 existing tests pass when run directly, but the production build, full Chrome/Ubuntu run and hosted deployment remain unverified, and the concept's signature global-freeze ending is incomplete. The highest certainty work is finish credits and instructions, verify repaired vegetation merging, re-check interaction eligibility, implement/trim to a convincing finale, and get a repeatable published run plus trailer. Estimated rubric bands are provisional from implementation evidence only; the trailer cannot be graded from this checkout.

| Rubric (weight) | Evidence-based current estimate | To move up |
|---|---|---|
| Viewing (10%) | B: third/first person, animated world, minimap code | verify camera comfort/clipping and purposeful final camera beat |
| Control & Playability (10%) | C: broad controls, rebinds, checkpoint/restart code; playability unverified | complete three-level hands-on run; validate physics/support and retries |
| 3D Effects (15%) | B: procedural materials, particles, lighting, custom models | verify tree merge; check hierarchy, shadows and performance in browser |
| Shaders (10%) | B: several authored vertex/fragment shaders; actual gameplay linkage/compilation not independently observed | demonstrate state-driven effect on a real time-affected hazard and explain it |
| Gameplay & Experience (25%) | C (low confidence): levels differ in theme/mechanics; puzzle clarity and finale gaps | coherent onboarding, reliable hazard rules, readable conclusion and sound |
| Polish (10%) | C: menus/settings/HUD/restart/loading exist; credits contain placeholders | finish credits/help, verify load/failure feedback and browser quality |
| Innovation (10%) | B: time manipulation, ghost, procedural shaders, carriage reuse | make at least one multi-ability puzzle and the ending land as described |
| Trailer (10%) | Not evidenced; treat as not done until a link is supplied | record/edit/upload a <=2 minute gameplay trailer |

### Top blockers

1. Vite production build is still unverified because sandbox child-process spawns fail with `spawn EPERM`; all 29 existing tests passed via direct Node invocation.
2. No end-to-end playthrough or hosted Linux subdirectory deployment has been verified.
3. Team credits still say `[ Placeholder: add team names and roles here ]`; brief requires accurate third-party credits.
4. Timewreck's chase/brake beat does not deliver the concept's clear global-freeze, train-stops-on-bridge payoff.
5. The required <=2 minute beta trailer is not evidenced in this checkout.

## 1. Changes since 8 September review

| Old report issue | Status now | Evidence / remaining work |
|---|---|---|
| F1 rewind frame-rate dependence | FIXED in code | `src/systems/time-system.js:418-478` accumulates elapsed rewind time and uses a 20 Hz snapshot accumulator. Retest on uneven frame rates. |
| F2 interactions through walls / vertical mismatch | MOSTLY FIXED | `src/systems/interaction.js:280-360` checks visibility, vertical tolerance, line of sight and revalidates on E. Verify all roof/floor transitions and blocker registrations in play. |
| F3 temporal state surviving restart | FIXED in code | `src/systems/time-system.js:500-543` clears ghost/history/registrations and restores the run kit; `src/core/level-manager.js:65-75, 150-163` resets on transitions/unload. Smoke-test. |
| F4 delayed respawn outliving level | FIXED in code | `src/systems/respawn.js:42-45, 100-125` uses generation cancellation; manager resets respawn on enter/unload. Smoke-test fail then restart/quit. |
| F5 merged trees lose indices | FIXED in code | `src/environment/outdoor-environment.js:565-603` detects indexed inputs and offsets/preserves indices. Verify rendered silhouettes, but the old confirmed topology defect is fixed. |
| F6 InstancedMesh cleanup omission | FIXED in code | `src/core/dispose.js:43-47` calls `InstancedMesh.dispose()`. Memory impact still needs browser measurement. |
| G1 selected-object time-control design mismatch | STILL PRESENT / DECISION | `time-system.js` applies mode to its registered set; no per-target selection/range. Decide/document limited global field versus retargeting before polishing puzzles. |
| G2 hazard/collision mismatch | PARTIAL / VERIFY | `moving-heist.js` and `timewreck.js` have scripted collision rules and support arrays; test each visible hazard against ability state. |
| G3 Ghost not required/rewarding | PARTIAL / VERIFY | Ghost pads are registered in L2, but verify at least one understandable intended puzzle and viable alternative. |
| G4 ability introduction | IMPROVED | `boarding.js:43-44` disables the four abilities in L1; confirm tutorial unlock/teach point in L2. |
| G5 physical support/vertical traversal | PARTIAL | `main.js:651-662` supplies support/void queries; L3 derives support boxes from frozen slabs (`timewreck.js` around 1260-1340). Test real landings; much traversal remains constrained/teleport-assisted. |
| G6 scoped physics | PARTIAL / DESIGN GAP | `cannon-es` is in `package.json`, but current observed gameplay uses custom movement and scripted debris; no Cannon integration found in `src/`. Credits must reflect actual use. Decide if current model satisfies the brief or add one small physical interaction. |
| G7 global freeze / bridge finale | STILL PRESENT | L3 has a wave chase and brake cinematic (`timewreck.js` around 1370-1415); no convincing global stop of train/environment and bridge reveal found. |
| G8 volume and game SFX | PARTIALLY FIXED | settings now include master volume and mute (`settings.js:109-133`); `time-system.js` imports `ability-sfx.js`. Verify settings are applied to all buses and playthrough feedback; separate `level-music.js` and `MusicSystem` deserve a single-owner review. |
| G9 instructions ignore key rebinds | STILL PRESENT | Hard-coded `[1]/Q`, `[2]/F`, `Shift` strings remain in L2/L3 hints, e.g. `timewreck.js` near 1450 and `moving-heist.js` near 2600. |
| G10 credits placeholders / ending | STILL PRESENT | `src/ui/credits.js:129-143` contains team placeholder; music and asset attributions exist but need provenance/licence verification. Completion UI does show a time, but navigation/readability need player check. |
| G11 loading feedback | PARTIAL | `level-manager.js:120-141` defers builds to paint overlay. Procedural build/audio work is not fully represented as progress; loading screen progress reset/error paths need inspection. |
| G12 decoded music cache memory | STILL PRESENT / MEASURE | `src/systems/level-music.js` has module-level `bufferCache`; measure decoded buffers or bound cache/in-flight loads. |
| G13 allocations/performance | STILL PRESENT / MEASURE | During rewind `time-system.js:404-408` spreads/maps `registered` each frame. Profile identified in old report (guard circles, camera raycasts, HUD writes) still needs targeted measurement before optimization. |
| New checkpoint reset undefined function | FIXED in this audit | `src/systems/time-system.js:557-571` called undefined `captureAllSnapshots()` on respawn. Replaced it with per-registration baseline snapshot capture; lifecycle and L2 checkpoint tests now pass. |
| Old README/roadmap drift | STILL PRESENT | README describes some controls/systems inaccurately and roadmap milestone wording conflicts with its own phase numbering. Update after code behavior is settled. |

## 2. Architecture and runtime map

Entry point `index.html` loads `./src/main.js`. `main.js` builds renderer, scene, camera/view, player, keyboard, HUD, menu/settings/credits, shared time/respawn/interaction/audio, then constructs `createLevelManager()` over `createBoardingLevel`, `createMovingHeistLevel`, `createTimewreckLevel`, and `createCompleteLevel`. `createLoop()` owns one animation-frame loop. Per frame, main updates music/HUD, time system and active level; if input is playable it updates player/support collision, view/camera, interaction, respawn and ability HUD. Level transitions call `advance()` into the manager.

The manager defers level construction across animation frames for its loading overlay, disposes the departing level, resets time state, updates spawn/camera/objective, and supports restart/unload without page refresh (`src/core/level-manager.js:60-180`). Each level returns an explicit `dispose()`. `disposeObject()` deduplicates and disposes GPU geometries/materials/textures plus instanced meshes and lights (`src/core/dispose.js`). Input flows from settings-driven `keyboard-state.js` into shared callbacks; controls/pause/cinematic gates are coordinated in `main.js`. `player-view.js` owns first/third-person switching; `third-person-camera.js` owns pointer lock/orbit, `first-person-camera.js` shares view direction. `core/assets.js` wraps Three.js loading manager; level geometry and many textures are procedural.

Train hierarchy: `createTrain()` creates a root `THREE.Group`, attaches five carriage groups and locomotive (`src/entities/train.js:387-404`); each carriage owns components/doors/lights. L2/L3 `createCarriageEnvironment()` attaches named carriage groups under a root (`src/environment/carriages.js:2068-2138`); L3 animates/detaches carriage groups under their parent. This is sensible and explainable: motion/damage propagates through meaningful parent transforms. Nested pivots for doors, levers and machinery are similarly justified. Some interior layouts use scripted support volumes and teleport transfers rather than continuous physical spaces; explain this as intentional scope if retained.

Custom shaders live in `src/shaders/{chrono-field,security-laser,sky,terrain,vegetation}-shader.js`. Chrono and laser implement `ShaderMaterial` vertex and fragment stages. `time-system.js` exposes uniforms and updates time/mode/intensity; L2/L3 also set per-material intensity directly. The shaders exist and are used, but consistency of the shared uniform contract and visibly affected hazards needs a demonstrated verification.

## 3. Findings and actions

Effort: S <=2 hours, M <=1 day, L >1 day. Severity is beta priority, not a prediction of marks.

| ID | Severity / status | Evidence and why | Fix / effort |
|---|---|---|---|
| BUG-001 | HIGH, fixed in code, needs smoke | Rewind timing, reset, delayed respawn were old reproducible cross-run defects; current code adds elapsed-time stepping, reset APIs and cancellation tokens. | Play restart/fail/restart/replay loops across all levels. S |
| BUG-002 | MEDIUM, verification | The old tree-index defect appears fixed by indexed merging, but rendering was not observed in a browser. | Inspect both tree types and check the merge utility with current indexed/non-indexed inputs. S |
| BUG-003 | HIGH, verification | Interaction checks LOS/height/visibility now, but correctness depends on every blocker and level eligibility being registered correctly. | Play test switches through walls, roof hatch from ground, adjacent floors and moving targets in both views. S |
| BUG-004 | HIGH, fixed in this audit | Checkpoint respawn called undefined `captureAllSnapshots()`, logged and swallowed the ReferenceError, so temporal checkpoint restoration did not complete. `src/systems/time-system.js:557-571`; fixed by clearing and recapturing each registered object's baseline snapshot. S |
| BUG-005 | LOW, fixed in this audit | Camera yaw/snap occurred before level/time checkpoint restoration; moved camera restoration after both callbacks in `src/systems/respawn.js:63-90` to match stable scene state and the lifecycle assertion. S |
| GAP-001 | HIGH, design gap | Planned selected-object control/global finale is broader than current shared mode over registered objects. | Select a scope and communicate affected set; don't build a new target system unless required. M/L |
| GAP-002 | HIGH, gameplay gap | L3's freeze/wave/brake does not clearly stop all time and train on the promised destroyed-track bridge. | Add one short authored freeze beat and visible train deceleration/bridge reveal; own camera/input and allow skip. M/L |
| GAP-003 | HIGH, evidence absent | Trailer required at beta (brief p.3); no video/link is in repository evidence. | Capture representative gameplay after smoke fixes, edit <=2 min, upload and record URL. M |
| GAP-004 | HIGH, brief deliverable | Credits contain a literal team placeholder; `cannon-es` listed without observed runtime integration. | Fill team names/roles; verify every asset, code sample and licence; list only actual used dependencies. S |
| GAP-005 | MEDIUM | Many ability/objective prompts hard-code defaults despite key rebinding. | Build labels from settings and replace L2/L3 hint text. S/M |
| GAP-006 | MEDIUM | Loading overlay has real asset progress plumbing, but synchronous procedural builds and music decode do not map to a truthful per-level percentage; stale progress risk. | Reset progress on show; use stage labels unless measuring all tasks; handle load errors visibly. S |
| GAP-007 | MEDIUM | Basic player gravity/collision and scripted debris exist, but no Cannon API use found despite dependency. Working physics is rubric requirement; real support/impact response not established. | Verify movement/jump/platform behavior; implement one pushable crate only if current physics is insufficient. M |
| PERF-001 | MEDIUM | Rewind update creates array spreads/maps per frame; other allocation hotspots are listed in September report but were not re-profiled. | Profile worst-case levels first; eliminate proven hot allocations and record FPS/memory baseline. M |
| PERF-002 | MEDIUM | Decoded MP3 `AudioBuffer`s remain cached module-wide; compressed file size understates browser memory. | Measure decoded bytes and repeat-run growth; share in-flight decode promises or bound cache if material. M |
| CON-001 | MEDIUM | Music sample player plus lazily created procedural `MusicSystem` are two audio systems. Settings UI includes master/mute now; confirm both are connected/disposed once. | One audio owner or documented roles; verify mute/volume across menu, levels, SFX, pause. M |
| DOC-001 | LOW | README and roadmap contain outdated controls/scope language. | Correct after final bindings and mechanics; document intentional design differences. S |
| DEP-001 | BLOCKER until proven | `vite.config.js` sets `base:'./'` and tracks use bundled `new URL`, which supports subdirectory hosting, but build could not run here and hosted Linux URL was not checked. | Produce build, inspect archive root/case/relative references, publish and play full game on Chrome/Ubuntu. M |
| TEST-001 | MEDIUM, runner limitation | All 29 tests pass when each file runs directly under Node. The `npm test` harness itself fails to spawn child test processes with sandbox `EPERM`, and Vite build fails on child-process spawn while loading config. No source test failures remain evidenced. | Rerun standard scripts in the team environment and record results. S |

### Concept versus actual feature status

| Feature | Status | Evidence / remaining |
|---|---|---|
| L1 stealth, guards, cameras, lasers, suspicion, board | PARTIAL | All systems found in `boarding.js`/`stealth.js`; check one clear route, meaningful fail/retry, and whether departure timer is intended. |
| L2 distinct carriage traversal and vault/core theft | PARTIAL | `moving-heist.js` constructs carriage progression, roof transfer, puzzle hazards, vault; full unassisted win not verified. |
| Slow, Freeze, Rewind, Ghost | PARTIAL | `time-system.js` provides all; selected-object scope and learnable/tutorialized rules differ from concept. |
| L3 fast-time, loop, frozen support, breakup, escape | PARTIAL | `timewreck.js` includes these scripted zones and support boxes; validate physics, fairness, and checkpoints in play. |
| Final global freeze, destroyed bridge, train stop | NOT DONE to concept standard | Freeze ability and brake animation exist, but visible world/train stop and bridge payoff are not established. |
| Hierarchical modelling | DONE in structure | Train/carriage/component parent relationships are explicit and meaningful. |
| Custom vertex + fragment shader, state/time uniforms | PARTIAL to strong | Multiple ShaderMaterials exist; provide demo of gameplay integration and compile verification. |
| Keyboard + mouse; restart; menus/settings | IMPLEMENTED, unverified | Settings/rebind/pointer-lock/pause/restart code exists; no real browser verification here. |
| Loading screen | PARTIAL | Overlay and manager deferral exist; honest task progress/error behavior incomplete. |
| Audio/music and controls | PARTIAL | Five tracks, master/mute settings and ability SFX exist; verify all controls/buses and story feedback. |
| Credits | NOT DONE | Team placeholder remains; third-party sources/licences require team confirmation. |
| Minimap/checkpoints | IMPLEMENTED in code | UI/system code found; behavior, clarity and fair checkpoint placement need playtest. |
| Trailer | NOT EVIDENCED | Required for beta; no link/file provided in inspected repo. |

### Level identity and parity

One-sentence answers based on code structure: **L1** is the station infiltration built around guard/camera/laser detection and boarding. **L2** is carriage/roof traversal with time abilities and a vault theft. **L3** is a damaged-train escape with looping/fast hazards, frozen support, carriage breakup and a final wave/brake.

| System | L1 | L2 | L3 |
|---|---|---|---|
| Movement/camera | WORKS IN CODE; play verify | SAME SHARED PLAYER; roof transfer differs | SAME SHARED PLAYER; support elevation differs |
| Collision/support | DIFFERENT station bounds/obstacles | PARTIAL scripted bounds/support | PARTIAL void and dynamic support boxes |
| Physics | BASIC shared gravity/collision | scripted movers; no Cannon usage found | scripted debris and supports; impacts limited |
| Lights/shadows | DIFFERENT warm station setup | DIFFERENT carriage/security lighting | DIFFERENT emergency/flicker lighting |
| Shader | Laser shader available | Chrono core/fields; verify affected hazards | Chrono fields/motes/wave |
| Audio | shared music + ability SFX plumbing | per-level music/time SFX | per-level music/time SFX |
| Objective/HUD/prompts | SHARED HUD; stealth/objective content differs | SHARED HUD; some hard-coded bindings | SHARED HUD; hard-coded bindings remain |
| Checkpoints/failure | stealth suspicion/checkpoints | hazard/checkpoint restore hooks | repeated fail/reset and finale checkpoints |
| Restart/disposal | shared manager; code path | shared manager + local disposers | shared manager + exterior/resource disposers |
| Transition/loading | shared manager overlay | same | same |

No cell is marked runtime WORKS because there was no browser run. The intentional changes are challenge, lighting and carriage damage; inconsistent default-key help, final freeze behavior, loading progress, and incomplete standalone physics need resolution or explicit design decisions.

## 4. Deployment and performance

Subdirectory intent is correctly expressed by Vite `base:'./'` (`vite.config.js`) and audio `new URL(..., import.meta.url)` catalog. Source HTML uses relative `./src/main.js`. No absolute project asset URL or HTTP remote dependency was found in targeted source/config searches. Linux case parity was not exhaustively checked against the generated bundle because build was blocked. `dist/` exists in the checkout but may be stale; do not treat it as current.

Performance is unverified on modest lab hardware. Procedural environments are synchronous, outdoor/carriage builders use instancing, settings expose render scale/shadows, and teardown disposes GPU resources. The current rewind path allocates transient arrays per update. Audio buffers persist. No current bundle size, draw-call, triangle, FPS, or renderer-memory numbers are claimed.

Before upload: successful production build; archive has `index.html` at top level; case-sensitive asset checks; relative URLs under a non-root subdirectory; Chrome/Ubuntu console/network clean; full three-level play and restart twice; FPS and renderer memory stable across transitions; credits and <=2m trailer URL included. Verify exact Moodle beta archive naming/deadline.

## 5. Two-week critical path (15 Oct target)

| Dates (local) | Exit condition | Work |
|---|---|---|
| Oct 1-3 | Shared defects contained | run production build on a machine without sandbox `EPERM`; smoke restart/fail/interaction after checkpoint fixes; make key help binding-aware |
| Oct 4-7 | Three-level full run | play L1→L2→L3 without dev shortcuts; tune broken hazards/checkpoints; choose time-control scope; decide whether a small physics interaction is needed |
| Oct 8-10 | Finale and submission content | produce concept-faithful ending at achievable scale; fill credits after team verifies attribution; verify audio/settings; capture trailer footage |
| Oct 11-12 | Deployable candidate | successful build, archive, subdirectory upload; full Chrome/Ubuntu hosted run and error check |
| Oct 13-14 | Freeze scope and retest | fix only reproducible blockers; rerun start-to-finish/restart; export trailer and links; package contribution/deployment evidence |
| Oct 15 | Beta handoff | submit the exact Moodle-required archive/trailer; no feature additions |

If the team slips: cut new art, multiplayer, more levels, broad combat, and a full Cannon port. Keep the existing unique mechanics; prioritize reliable full run, the freeze/brake payoff in a short scripted form, credits, trailer, build and published run.

### First 48 hours: highest-return 10 cards

1. Build the production bundle in the team environment and record the output.
2. Verify indexed tree geometry renders correctly after the merge fix.
3. Play/retest checkpoint restore, delayed death, restart and transition cancellation.
4. Validate interaction line-of-sight and eligibility on both floors/roof.
5. Replace hard-coded ability/run prompts with active binding labels.
6. Fill team credits and verify asset/library attribution.
7. Lock one clear time-manipulation scope and ensure UI communicates affected targets.
8. Validate one Ghost puzzle and every L2/L3 hazard's visible collision rule.
9. Prototype a short global-freeze/train-stop/bridge ending.
10. Cut a playable candidate build and capture/publish the trailer after the run is stable.

## Appendix: review limits

Read the brief (15 pages), concept (5 pages), old DOCX review, roadmap, README, config/package files, and traced entry/loop/manager/input/camera/player/respawn/time/interaction/shaders/audio/credits plus the three level lifecycle/update paths. Repository search and file inventory covered the remaining modules; this was not a manual line-by-line audit of every large environment/UI source file. No browser session, Chrome/Ubuntu host, Moodle upload, team attribution confirmation, or video link was available.

Commands attempted: `npm.cmd test` (Node test runner is blocked by `spawn EPERM` before tests execute); each existing test file was then run directly with Node: all 29 tests pass across five files. `npm.cmd run build` remains blocked while Vite loads config (`spawn EPERM`). Two defects exposed by those direct tests were fixed in `src/systems/time-system.js` and `src/systems/respawn.js`; the full production build and browser behavior remain unverified.


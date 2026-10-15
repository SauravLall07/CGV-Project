# Level 3 upgrade implementation plan

This is the persistent handover for the Timewreck upgrade. Read this file and inspect current source before continuing; conversation history is not required. Scope: improve the existing Three.js/JavaScript/Vite game, using Level 2's mechanics and luxury railway materials. Implement one batch at a time, verify it, update this file, then stop. Do not implement later batches without a user request.

## Purpose and constraints

Level 2 teaches time manipulation; Level 3 tests preparation, combinations, route decisions and execution while the train fails. Keep the return route Vault -> Convergence -> Mechanical -> Cargo -> Relay -> Security -> Passenger -> locomotive. Reuse carriage builders, wood, teal panels, leather luggage and brass machinery. No engine migration, new ability targeting, combat, or unrelated refactoring. Preserve pre-existing user changes (initially package-lock.json modified and Chrono_Express_Beta_Readiness_Audit.pdf untracked).

Slow/Freeze/Rewind share one mode over registered objects; combinations must be sequential. Ghost runs separately. Energy maximum 100, recharge 15/s, Freeze drain 28/s, Rewind 32/s, Ghost activation 35. Level 3 strain is disabled; retain that until mandatory crossings are proven. Actual player code uses 4 m/s movement and a 1.7 run multiplier: sprint is 6.8 m/s (older finale comments say 7.2). Do not shrink windows without testing. Deterministic gameplay hazards, safe observation spots, readable warnings, actual floor openings and matching supports are required. Permit reasonable alternate solutions. Physics debris outside the route can remain decorative. Never certify browser behavior from unit tests alone.

## Source map and baseline

- src/levels/timewreck.js: existing L3 factory, hazard registration, rolling checkpoints, supports/voids, breakup and finale. Player travels toward decreasing Z.
- src/levels/timewreck-cargo.js: Batch 1 Cargo simulation and gangway builder (added during this batch).
- src/levels/moving-heist.js: L2 one-shot Rewind machinery, selective recordWhen history, tracked collision, Ghost platforms and roof combinations.
- src/systems/time-system.js: registration snapshots, recordWhen, shared modes, energy and checkpoint reset; baseline snapshot is captured on registration and checkpoint reset.
- src/systems/respawn.js: restores level callback before resetting time-system histories; checkpoint callbacks must immediately restore geometry/supports.
- src/entities/player.js: movement, support surfaces and rectangular voids.
- src/environment/carriages.js and carriage-bounds.js: shared shells, floor meshes, decorative dressing and dimensions. Keep L2 geometry unchanged.
- src/main.js: development start query and level manager wiring.
- tests/timewreck-cargo.test.js: targeted Batch 1 behavior and integration checks.

Documents reviewed: beta-readiness handover (13 Oct), October beta audit/cards, September Word review, concept, course brief, README, roadmap and Model Workshop. Older audits are historical evidence, not a current feature checklist. Current L3 already includes lasers, surges, blast doors, moving luggage, a loop bulkhead, frozen slabs, Cannon debris, stasis effects and brake animation. Build/full-run readiness remains separate from these upgrades.

## Batches and intended solutions

### Batch 1: Cargo Rewind / Freeze crossing (authorized now)

Add a wood/brass hinged gangway over a real opening before the existing loop bulkhead. It buckles on approach and remains failed; preserve the failure history while idle. Rewind restores the earlier level deck, then Freeze holds both deck and bulkhead open while the player crosses. An intact landing separates the crossing from the bulkhead so energy can recover. Door-open and restored-deck states must overlap. Use environmental cues, binding-aware help, accurate supports and a safe pre-puzzle checkpoint. Restore the same solvable setup after repeated failures. Do not introduce a global ability mode change or blanket Freeze strain.

Acceptance: gap is visible with no hidden floor/runner covering it; no route along the wall bypasses the gap; broken deck has no support; restored deck supports the actual player; Freeze preserves its pose and the open bulkhead; loop clock reverses with shared Rewind; prolonged waiting does not erase repair history; failures return to safe floor with usable energy/history; restart disposes all registrations and geometry. Run relevant tests, build, and browser checks where available.

### Batch 2: Relay Ghost emergency release

Reuse the operator platform vocabulary from L2. A safe spring-loaded platform releases a damaged fire door. Ghost holds it while the player crosses and engages a far-side manual catch that permanently opens the passage. Keep this shorter than Route Control. Check Ghost occupancy height, duration, energy, cancellation, checkpoint progress and no stale echo after reset. Do not add another lengthy code puzzle.

### Batch 3: Security two-stage crossing

Replace one continuous Freeze route with stable lip -> debris crossing -> intact recharge island -> offset second crossing -> exit. Require steering and one modest jump, never pixel-sized landings. Each leg must fit the energy budget with margin; floor holes and supports must match rendered geometry. Prove falls, depleted-energy recovery and repeated retries in both views.

### Batch 4: Mechanical and Convergence

Mechanical: Slow through the first runaway luggage bank, stop in a protected recess, Rewind a damaged maintenance shutter, cross, then handle the next bank. Ensure a visible earlier shutter state and meaningful safe switching point.

Convergence: one short fork only. Direct aisle is faster with close surge timing; maintenance passage is slower with crouching and a restorable shutter. Rejoin before Mechanical. Both routes need reliable collision/camera clearance, distinct cues and appropriate checkpoints. Keep the branch optional and understandable.

### Batch 5: Passenger, Vault and finale

Vault containment: refine the existing two laser racks into a readable escape decision involving both timings, with a safe place to observe. Avoid stacking additional unrelated instant-kill hazards. Preserve viable ability alternatives and clear body-height collision.

Passenger: add a clearly warned falling luggage rack and one separating floor crossing. Author deterministic obstructions; Freeze buys execution time while the existing pursuing wave waits. Tune obstacles before increasing wave speed (currently 6.2 m/s against actual 6.8 sprint). Restore warning, floor, wave lead and energy on retry.

Finale: show destroyed track/bridge ahead, stage a limited global stasis beat, preserve player control during the sprint, then visibly stop the train and reveal the locomotive at the broken span. Reuse existing stasis effects, brake animation and environment. Define camera/input ownership, skip/recovery behavior, all affected clocks and completion transition. Exterior motion must actually settle; text alone is not the payoff.

### Batch 6: Integration and tuning

Play the entire production build without shortcuts, then repeat deaths/restarts/quit at all new checkpoints. Test both views, rebindings, energy depletion, alternate abilities and variable frame rates. Check shader errors, draw calls/frame time and resource stability on representative hardware. Tune difficulty using observed player failures. Update player-facing docs only to describe verified final behavior. Credits/trailer/hosting requirements remain separate readiness tasks.

## Progress

- [x] Inspected current L3 Cargo, L2 Rewind reference, time recording, support/void and checkpoint ordering.
- [x] Saved complete upgrade scope and batch acceptance criteria here.
- [x] Implement Batch 1 Cargo geometry, timeline, landing and checkpoint integration.
- [x] Verify Batch 1 automated behavior and production build: 41/41 suite tests pass, including six new Cargo tests; production build passes.
- [x] Attempt browser playtest: in-app browser unavailable; browser inventory returned no connected browsers. Rendered visual QA and hands-on difficulty are explicitly unverified.
- [ ] Batches 2-6 are pending and not authorized by the current implementation request.

## Decisions

- 2026-10-15: Keep the existing JavaScript/custom support/Cannon architecture; specialist skill defaults are not a reason to migrate the project.
- 2026-10-15: Cargo uses selectively recorded one-shot failure history, following L2, so repairs remain available after waiting. Bulkhead keeps its periodic shared-time behavior and can be stopped separately after reaching the landing.
- 2026-10-15: Persist all progress here; only implement Batch 1 in this session.
- 2026-10-15: Gangway opening is 4.8 m long, Cargo center +3.8 to +8.6; deck width 1.6 m, intact top 0.1 m. The trigger is center +12.8; failure warns for 0.18 s then folds for 0.65 s. Two hinged halves fold downward. Supports follow each half in strips while shallow enough to stand on (<=0.18 rad); steeper failed leaves cannot support the player. The entire shell width is a void, so wall-side furniture supplies no invisible floor bypass. Early Slow/Freeze interception is an intentional alternate solution, consistent with L2.
- 2026-10-15: Landing is center +3.15, between gap end +3.8 and bulkhead +2. The nine-second bulkhead loop is unchanged; its green 2.5 s phase has door up and luggage raised. A player can repair/freeze/cross, recharge on the landing, then hold the next green window. No requirement to independently freeze different targets.
- 2026-10-15: Existing Cargo entry checkpoint is center +12.5 on safe floor; add an exit checkpoint at Cargo minZ +1.5 after all Cargo hazards. Reset gangway to intact and door clock to zero before the shared time system rebuilds snapshot baselines. Local Cargo fall messages use the actual player height; door/load failures now test visible object/body overlap rather than arbitrary phase cutoffs.
- 2026-10-15: Add dev-only `?start=level3-cargo` routing through existing level-manager options. R restarts at this same test start. Normal game progression is unchanged.
- 2026-10-15: Supporting test-only fixes were needed to run existing L2 regression tests: node-asset-loader now accepts Vite's implicit image URL imports as well as ?url, checking file existence; L2 canvas fixture also provides the ImageLoader element interface. Neither changes gameplay or texture loading in the browser.

## Verification, known issues and next step

Batch 1 implementation is complete. Batches 2-6 remain untouched. Baseline working tree changes listed above were preserved.

Verified on 2026-10-15:

- `npm.cmd test`: 41 tests passed, zero failures (six new Cargo tests). Sandbox initially prevented Node's isolated worker processes; final suite ran with approved process access. The single-process fallback was unsuitable because old test files replace global DOM stubs; do not use its failures as source regressions.
- New tests exercise 30/60/144 FPS repair after 14 seconds idle; Freeze retaining a broken pose; full-width floor raycasts; actual L3 decorative deck opening; real player traversal/energy recovery; shared Freeze holding the open bulkhead; body overlap with a partly closed frozen door; and three actual respawn/checkpoint resets followed by another successful repair.
- `npm.cmd run build`: passed after the final source edits. Existing >500 kB chunk warning remains. Test construction emits pre-existing BufferGeometry.toNonIndexed warnings from environment geometry; these are not Cargo failures.
- `git diff --check`: passed.
- Browser connection attempt: in-app browser reported unavailable and browser inventory was empty. No gameplay screenshots, shader compilation, first/third-person visual QA, runtime FPS/memory, or manual full-run result is claimed.

Local test instructions:

1. Run `npm run dev` in the repository (a local server was started for this session at http://127.0.0.1:5173/).
2. Open http://127.0.0.1:5173/?start=level3-cargo and choose NEW GAME. This shortcut works only in development; production follows the full level route.
3. Walk toward the wood/brass gangway and let it buckle. From safe floor, activate Rewind (default 3/C) until the deck matches its pale frame, then switch to Freeze (2/F).
4. Cross to the intact landing before the door; release Freeze and recharge. Wait for the bulkhead ring to turn green, then Freeze the open door/raised luggage and move through.
5. Deliberately fall once and repeat. R restarts at Cargo in this development shortcut. Custom bindings are reflected in new Cargo hints.

Next batch after user review: Batch 2, Relay Ghost emergency release. Read this plan, inspect the current Cargo implementation, retain the tests and don't treat the missing rendered QA as completed. The current request ends here.

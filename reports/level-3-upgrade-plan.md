# Level 3 upgrade implementation plan

This is the persistent handover for the Timewreck upgrade. Read this file and inspect current source before continuing; conversation history is not required. Scope: improve the existing Three.js/JavaScript/Vite game, using Level 2's mechanics and luxury railway materials. Implement one batch at a time, verify it, update this file, then stop. Do not implement later batches without a user request.

## Purpose and constraints

Level 2 teaches time manipulation; Level 3 tests preparation, combinations, route decisions and execution while the train fails. Keep the return route Vault -> Convergence -> Mechanical -> Cargo -> Relay -> Security -> Passenger -> locomotive. Reuse carriage builders, wood, teal panels, leather luggage and brass machinery. No engine migration, new ability targeting, combat, or unrelated refactoring. Preserve pre-existing user changes (initially package-lock.json modified and Chrono_Express_Beta_Readiness_Audit.pdf untracked).

Slow/Freeze/Rewind share one mode over registered objects; combinations must be sequential. Ghost runs separately. Energy maximum 100, recharge 15/s, Freeze drain 28/s, Rewind 32/s, Ghost activation 35. Level 3 strain is disabled; retain that until mandatory crossings are proven. Actual player code uses 4 m/s movement and a 1.7 run multiplier: sprint is 6.8 m/s (older finale comments say 7.2). Do not shrink windows without testing. Deterministic gameplay hazards, safe observation spots, readable warnings, actual floor openings and matching supports are required. Permit reasonable alternate solutions. Physics debris outside the route can remain decorative. Never certify browser behavior from unit tests alone.

## Source map and baseline

- src/levels/timewreck.js: existing L3 factory, hazard registration, rolling checkpoints, supports/voids, breakup and finale. Player travels toward decreasing Z.
- src/levels/timewreck-security.js: Batch 3 two-stage layout, floor cuts, deterministic debris and exact supports.
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

### Batch 1: Cargo Rewind / Freeze crossing (implemented)

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
- [x] Implement Batch 2 Relay Ghost release, far-side permanent catch and safe checkpoints.
- [x] Verify Batch 2 simulation/integration and restart lifecycle; 48/48 suite tests pass and production build passes.
- [ ] Batch 2 rendered browser QA remains unavailable; do not treat automated checks as visual or hands-on approval.
- [x] Implement Batch 3 Security two-stage crossing, full-width recharge island and grounded island/exit checkpoints.
- [x] Verify Batch 3 automated traversal, energy, falls, retries and rebuild: 55/55 suite tests pass; production build passes.
- [ ] Batch 3 rendered QA in first/third person remains unavailable.
- [ ] Batches 4-6 remain pending and are not authorized by this request.

## Decisions

- 2026-10-15: Keep the existing JavaScript/custom support/Cannon architecture; specialist skill defaults are not a reason to migrate the project.
- 2026-10-15: Cargo uses selectively recorded one-shot failure history, following L2, so repairs remain available after waiting. Bulkhead keeps its periodic shared-time behavior and can be stopped separately after reaching the landing.
- 2026-10-15 (Batch 1 session): Persist all progress here; only implement Batch 1 in that session.
- 2026-10-15: Gangway opening is 4.8 m long, Cargo center +3.8 to +8.6; deck width 1.6 m, intact top 0.1 m. The trigger is center +12.8; failure warns for 0.18 s then folds for 0.65 s. Two hinged halves fold downward. Supports follow each half in strips while shallow enough to stand on (<=0.18 rad); steeper failed leaves cannot support the player. The entire shell width is a void, so wall-side furniture supplies no invisible floor bypass. Early Slow/Freeze interception is an intentional alternate solution, consistent with L2.
- 2026-10-15: Landing is center +3.15, between gap end +3.8 and bulkhead +2. The nine-second bulkhead loop is unchanged; its green 2.5 s phase has door up and luggage raised. A player can repair/freeze/cross, recharge on the landing, then hold the next green window. No requirement to independently freeze different targets.
- 2026-10-15: Existing Cargo entry checkpoint is center +12.5 on safe floor; add an exit checkpoint at Cargo minZ +1.5 after all Cargo hazards. Reset gangway to intact and door clock to zero before the shared time system rebuilds snapshot baselines. Local Cargo fall messages use the actual player height; door/load failures now test visible object/body overlap rather than arbitrary phase cutoffs.
- 2026-10-15: Add dev-only `?start=level3-cargo` routing through existing level-manager options. R restarts at this same test start. Normal game progression is unchanged.
- 2026-10-15: Supporting test-only fixes were needed to run existing L2 regression tests: node-asset-loader now accepts Vite's implicit image URL imports as well as ?url, checking file existence; L2 canvas fixture also provides the ImageLoader element interface. Neither changes gameplay or texture loading in the browser.

## Verification, known issues and next step

Batch 1 implementation is complete. Batch 2 implementation and automated verification are complete, with rendered browser QA still pending. Batch 3 implementation and automated verification are complete; its rendered QA remains pending. Batches 4-6 remain untouched. The Batch 2 starting working tree was clean; prior completed work was preserved.

Batch 1 verification on 2026-10-15:

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

## Batch 2 results (2026-10-15)

Implemented only Relay's emergency release. Reused the existing teal/brass fire-door leaves and L2 operator-platform vocabulary; no code sequence, engine changes, new targeting or later-batch mechanics. Added a low platform 4.6 m before the door and one manual catch 1.8 m beyond it. Hints use current Ghost/interact bindings. Cyan means released; green means permanently latched.

Decisions and lifecycle:

- Player and Ghost weight use the same square 0.56 m half-size and 0.25 m height tolerance. The platform is registered with the existing stationary eight-second Ghost hold. Cost remains 35 energy plus the existing 1.5/s Ghost drain; normal-mode recharge remains 15/s.
- The spring door follows real time and Ghost occupancy independently of Slow/Freeze/Rewind. Opens in 0.4 s, closes in 0.45 s. An initial 0.65 s close allowed a solo sprint at 30 FPS; the final close was checked at 30/60/144 FPS. A real walking crossing from platform to catch takes about 1.55 s after summon, leaving substantial duration/energy margin. Shared ability modes remain unchanged globally.
- Collision tracks both rendered leaves, with the existing side housings blocking wall bypasses. Shut doors block walking and jumping. Closing waits at the current pose when the body occupies the seam, so cancellation does not crush the player.
- The catch is eligible only beyond the door, at floor height and within interaction range. It immediately latches the passage open and saves a far-side checkpoint. It also mechanically reopens the door if the echo was lost after crossing, preventing a far-side soft lock.
- Added a safe Relay entry checkpoint before the platform. Pre-catch respawns restore a shut door, usable energy, zero Ghost cooldown and no stale echo. Captured post-catch checkpoints restore the open/latched door immediately, before the time-system reset. Full restart rebuilds an unlatched puzzle. Teardown cancels the echo and unregisters the pad and interaction.
- Added dev-only `?start=level3-relay`; it uses the existing restart options, like the Cargo shortcut. Production progression is unchanged.

Verification:

- `npm.cmd test`: **48 passed, zero failures**, including seven new Relay integration tests and all six Cargo tests. Tests use the actual player, time, level and respawn systems. Catch tests invoke the registered interaction callback and eligibility predicate; browser aiming/prompt visibility remains unverified.
- Covered walking traversal and solo sprint at 30/60/144 FPS; energy cost, insufficient-energy rejection and safe recharge; airborne player/echo rejection; eight-second expiry; cancellation before crossing and inside the seam; far-side recovery; shared-mode switching; three repeated resets before and after the catch; disposal/unregistration and fresh level reconstruction.
- `npm.cmd run build`: passed. Existing large-chunk warning remains. Headless fixtures also log existing geometry warnings and audio cache/timer messages; browser audio behavior was not assessed.
- `git diff --check`: passed.
- Browser attempt: inventory returned no browsers; creating an in-app browser returned `Browser is not available: iab`. No screenshots, rendered visual QA, first/third-person catch aiming, runtime shader/performance results, or hands-on difficulty approval is claimed.

Local Relay playtest when a browser is available:

1. Run `npm run dev`, open `http://127.0.0.1:5173/?start=level3-relay`, and choose NEW GAME.
2. Walk onto the brass/teal spring platform. Summon Ghost using the displayed binding, walk through the released door, then use the far-side manual catch. Confirm green lamp and checkpoint toast.
3. Cancel Ghost before crossing and wait for expiry on another attempt. Confirm the door blocks safely, safe floor permits recharge, and a retry restores the entry setup. Cancel while inside the seam and confirm no crushing or trapping.
4. After latching, deliberately die and confirm the far-side spawn and open door. Press R and confirm a fresh unlatched puzzle with no echo. Repeat in both views and with rebound controls; check the catch prompt and brass linkage visually.

Batch 2 handover: browser and visual checks above remain outstanding. Batch 3 was subsequently authorized and is recorded below.


## Batch 3 results (2026-10-15)

Implemented only Security's two-stage crossing. Previous Cargo/Relay work is preserved; shared carriage builders, player physics, power costs and Level 3's disabled strain are unchanged. The starting working tree was clean.

Layout and behavior:

- Travel remains toward decreasing Z. Security has two actual full-width floor openings: center +1.4 to +6.8 and center -6.8 to -1.4. The intact 2.8 m island spans the entire 5.2 m shell width. Approach/exit lips have brass/cyan markings wholly on solid floor.
- Cut only the L3 Security floor and split its decorative floor strips at both holes; removed the old solid purple well surface that visually covered the opening. The shared L2 environment remains unchanged.
- First leg uses three broad wood/brass decks, 1.6 m wide, with overlapping ends and lateral offsets from -1.0 to +0.8 m. This requires steering from left to right. Second leg begins to the right and has a 2.2 m break before a 1.6 x 1.4 m landing. One sprint jump clears it with margin; simply running across fails at 30/60/144 FPS.
- Retained the existing Freeze-to-settle vocabulary: deterministic suspended debris levels onto its marked outlines over 0.2 s. Only fully level decks support the player. Supports match the rendered wood top (0.12 m) and deck footprint exactly, without the old invisible padding. The level's existing cosmetic train shake remains separate from gameplay coordinates.
- The initial shorter break could be skipped through the player's existing falling/landing behavior; the final 2.2 m break was verified with the actual player rather than estimated from speed alone. A complete tested first leg consumes about 59 energy; the second consumes about 69, including settling and extra landing time. Tests require over 38 and 28 energy remaining respectively, from 100. Release Freeze on the island and wait up to 4.5 s to fully recharge.
- Added explicit static floor tops at approach, island and exit to lower feet from the raised debris onto the visible floor. This fixes the player's inherited last-support height locally without changing global movement.
- Removed the old instant failure merely for being in Security without Freeze. Failure now follows a real fall below -0.65 m, preserving legitimate jumps and the safe island. Binding-aware hints explain steering, recharge and sprint+jump.
- Existing entry checkpoint remains before both holes. Added island and exit checkpoints only after the actual player is grounded at floor/deck height in those safe areas. Island retries spawn at its centre in NORMAL time with at least the existing 50-energy recovery floor; players can recharge safely before repeating leg two.
- Checkpoint restore immediately resets drift, settling and support lists before the time system rebuilds history. Full level teardown disposes crossing geometry and unregisters its timeline. A new run rebuilds the initial entry setup.
- Added development-only `?start=level3-security`, using the same restart routing as Cargo/Relay. Normal production progression is unchanged.

Verification:

- `npm.cmd test`: **55 passed, zero failures**, including seven new Security integration tests and all Cargo/Relay tests. Ran with approved Node worker-process access.
- Successful real-player first leg, island recharge and sprint-jump second leg at 30/60/144 FPS. Covered energy depletion while crossing and on the island; normal-time and wall-side falls; three entry and three island retries; recovery followed by another successful crossing; restart disposal and fresh temporal registration.
- Raycasts verify both floor holes across the shell, missing decorative strips over the holes, solid island floor, and rendered deck heights against exact support footprints. Cosmetic root transforms are accounted for in deck raycasts.
- `npm.cmd run build`: passed. Existing >500 kB bundle warning remains; existing environment geometry warnings remain in headless tests.
- `git diff --check`: passed.
- Browser inventory was empty, and opening the in-app browser returned `Browser is not available: iab`. Screenshots, first/third-person playtests, runtime shader compilation, camera clearance, rebound controls and hands-on difficulty remain **unverified**. Automated results do not certify either view.

Manual checks when a browser is available:

1. Run `npm run dev`, open `http://127.0.0.1:5173/?start=level3-security`, and select NEW GAME.
2. Observe the first gap from the intact lip. Freeze, allow the decks to settle, steer left then right across the overlapping decks, and stop on the marked island.
3. Release Freeze and recharge. Align to the right-hand second deck, Freeze again, then sprint+jump across the short break to the broad landing and exit.
4. Fall before the island and repeat from the entry checkpoint. Fall after reaching the island and repeat from its centre. Deliberately deplete energy on the island and on a crossing; confirm safe recharge and recovery.
5. Press R to verify a fresh entry start with drifting debris and no duplicated geometry. Repeat traversal/falls in both first and third person and with rebound controls; inspect floor visibility, outlines, jump readability and camera clearance.

Remaining issues: rendered and hands-on verification remains outstanding for Batches 1-3 because no browser is connected. Full production-route testing/performance tuning remains Batch 6. Next implementation batch, only on a new request: Batch 4, Mechanical combination and Convergence route choice. Stop after this Batch 3 handover.

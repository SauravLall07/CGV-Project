# Agent implementation prompt: make Level 3 harder, with readable hazard combinations

Implement the scoped difficulty pass for **Chrono Express**, a plain JavaScript / Three.js / Vite game with custom player collision and existing Cannon integration.

Workspace: `C:\Users\hpars\OneDrive\Documents\GitHub\CGV-Project`.

Read **`reports/lvl3-difficulty-implementation-plan.md` in full first**. It defines the encounter design, protected gameplay, implementation sequence and validation requirements. Execute that plan through implementation, rendered iteration and regression checks. This is an implementation task, not another planning response.

## First actions

Confirm branch/status/latest commit. At planning time the branch was `lvl3-visual-refresh`, HEAD `e87e45d`, with a clean working tree. That is context, not permission to reset to that revision. Preserve every newer change, especially the L3 structural openings, real/broken windows with reduced counts, temporal fixes and story-render mock conflict resolution. Follow applicable repository and skill instructions. Do not reset, clean, overwrite, stash away or replace the user's work. Do not commit, push or publish.

Inspect current code and every caller before editing:

- `src/levels/timewreck.js`, `timewreck-flying-panels.js`, `timewreck-debris.js`, `timewreck-cargo.js`, `timewreck-expansion-hazards.js`, `timewreck-routes.js`, `timewreck-spatial.js`, `timewreck-security.js`, `timewreck-connector.js`, atmosphere and feedback helpers.
- Player/controller collision, time-system registration/history, respawn/checkpoint integration, both cameras and decorative ray flags.
- Wreck audio, hazard audio, carriage bounds/shell/damage, ownership/retirement, minimap and visibility; inspect only as needed to integrate the new encounters correctly.
- Existing focused tests and browser diagnostic/playthrough scripts; reuse the project's patterns.

## What to deliver

1. **Cargo debris bursts:** replace part of the existing random side-lane flight schedule with two short, clearly telegraphed authored bursts and a visible recovery/clear interval. Reuse the existing pool/collision; do not just double object counts. Challenge passive centre-running inside this bounded encounter while preserving a reachable safe lane and a genuinely protected solid observation position.
2. **Linked Cargo decisions:** compose the bursts with the existing gangway/door/load/freight sequence. Provide a safe transition to reassess the next hazard. Encourage deliberate release/reposition/reuse of time powers rather than one thoughtless Freeze from entry. Preserve all valid skilled solutions; no artificial Freeze immunity or ability restrictions.
3. **Passenger lane changes:** strengthen the current left rack/right avoidance/centre return by adding one additional readable lateral decision on solid floor. Reuse existing racks/seats where possible. Leave the correct collapse approach and landing clear; never close every lane together or force contact with a hazard.
4. **Final duck/jump beat:** fit a short, well-signposted duck obstacle and a low jump obstacle on the solid post-collapse exit stretch. Prove run-up, crouch exit, jump landing and cab/brake clearance with the real controller. If the existing geometry cannot safely support both, implement the plan's explicit fallback (one combined duck-or-jump choice with visible alternatives), documenting the measured limitation. Do not move the original floor holes or change the wave to make the design fit.

Keep Vault as the introduction, Convergence's sheltered crouch route valid, Mechanical's switching recess safe, Relay as a quieter Ghost beat, Security's decks/island unoverlaid and the cab brake approach clear. These are four connected improvements in one authorised scope. The Cargo pilot is a validation stage; continue to Passenger without asking permission again.

## Current facts that matter

- Escape travels in **decreasing world Z**: Vault → Convergence → Mechanical → Cargo → Relay → Security → Passenger → cab.
- There are already six large flying hazards per early car and eight per later car. Existing flights deliberately favour side lanes and tests expect a safe centre. Make only the selected authored encounter require leaving centre, and replace that specific expectation with stronger reachable-route/safe-pad checks. Preserve centre/sheltered guarantees elsewhere.
- Small instanced scraps are harmless. Large visible debris is lethal even when frozen. Reuse swept contact and its reset rules rather than adding an oversized invisible hitbox.
- Passenger already contains the left rack at local Z `+5.8`, seat deflections at `+7.5`/`+3.5` and a true floor break `-3` to `+1.4`. These spaces are occupied, not blank slots for duplicate obstacles.
- Depletion starts at `passenger.maxZ - 1.8`; the wave already pursues during Passenger's rack/collapse. It is not a timer that starts only after the floor break.
- Keep actual sprint 6.8 m/s, wave 6.2 m/s and 12 m lead, current depletion/finale rules and brake timings. A stationary wait can consume nearly all initial lead in under two seconds. Prove the whole run, including lateral movement, crouching, collapse, Freeze release and brake interaction.
- Keep max energy 100, normal recharge 15/s, Slow/Freeze/Rewind drains 18/28/32 per second, Ghost 35 + 1.5/s, recovery floor 50, Ghost behaviour and disabled L3 strain. Reconcile against current source; don't silently retune mechanics to hide an unfair encounter.
- Preserve car dimensions, movement bounds, original supports/holes, checkpoint locations, structural openings/windows, L2 and Ending.

## Engineering and fairness requirements

Use a small authored local pattern and the existing registered scaled-time/snapshot APIs. No generic encounter framework, runtime CSG, engine migration or whole-controller rewrite. Seeded layout must reconstruct identically under Rewind, retry and checkpoint entry; no wall-clock gameplay timers or new random draws each frame.

Warning → active → recovery must be visible from actual first/third-person approaches, audible through existing master/mute/pause-aware audio, and meaningful without relying on colour alone. Derive warning time from measured relative speeds and evasive travel, not a nominal flash duration. A warning must precede contact, including entry during an existing cycle.

Coordinate existing random large flights with the authored waves so they cannot occupy the planned safe route at the same time. Validate full rotated sweeps and timed reachable routes, not only static X/Z gaps. Protect observation/recharge pads for their whole occupancy. Avoid mandatory waiting while chased, hidden lethal remnants, spawn kills, overlapping simultaneous lane closures and impossible Freeze poses. New paths should have credible entry/exit through openings or visible termination against the hull.

Physical obstacles must match the visible geometry and height rules. Cosmetic objects stay harmless. Do not create gap bridges, rooftop/side bypasses, unsupported cover, blocked interaction rays or camera traps. Keep existing root/world-coordinate ownership for registered hazards; integrate new pieces with rear retirement and checkpoint restoration. New collision registrations, callbacks, resources and audio must reset/dispose without leaks.

Keep the 12-light pool and bounded audio. Share/instance static and repeated structure within carriage ownership. No per-chip physics, global post stack or unnecessarily expensive transparent layers. Measure current frame cost before adding load; object counts alone are not performance evidence.

## Validation and completion

Follow the plan's baseline, Cargo pilot, Passenger implementation and integration steps through completion. Add focused tests for authored phases/seeds, reachable safe routes, warning lead, true swept/frozen contact, crouch/jump clearance, checkpoint energy, temporal restoration and lifecycle cleanup. Use the real player controller at 30/60/144 FPS and mixed deltas including 100 ms. Do not teleport through encounters, disable their collision or give infinite energy to demonstrate success.

Run:

```text
npm.cmd test
npm.cmd run build
node scripts/check-production.mjs
git diff --check
```

Preserve existing connector/Cargo/Relay/Security/expansion/spatial/debris/flying-panels/escape/audio/feedback/camera/visibility/minimap/lifecycle/Ending coverage. Do not remove meaningful assertions simply because the new design fails them.

Perform a real browser keyboard/time-control playthrough of Cargo through brake→Ending, with first/third-person and hold/toggle crouch checks. Include checkpoint retries, pause/resume, death, restart/quit, power transitions, Ghost expiry/cancel, rear breakup and repeated L3→Ending. Check a narrower viewport and performance/high quality tiers. Capture before/after plus telegraph, burst, clear route, collapse landing and final brake screenshots. Automated traversal and fixed diagnostic cameras support but do not substitute for playthrough.

Record comparable baseline/new frame-time median/p95, update/submission, draw calls/triangles/resources and available GPU data on the same source/settings/hardware/views; separate shader warmup and state limitations. Do not claim improved FPS from passing tests or fewer meshes.

Finish with implemented encounters, final placements/timings, a demonstrated normal-energy solution, evidence that blind sprinting is riskier while deliberate play succeeds, screenshot links, checks/results, performance observations and any genuine unperformed checks. If the route is unfair, adjust the new encounter geometry/schedule rather than weakening the existing mechanics. Do not call the work complete solely because Node tests pass.

# Level 3 difficulty implementation plan

Prepared 28 October 2026. Planning only; no game changes are authorised by this document's creation. The accompanying agent prompt is for the later implementation task.

## Goal and starting point

Make L3 harder through readable combinations of movement, timing and time powers. Players should observe, dodge, take cover, then commit. More random objects alone will add visual noise and unpredictable deaths.

Inspected branch: `lvl3-visual-refresh`, HEAD `e87e45d` (`Merge branch 'main' into lvl3-visual-refresh`); working tree clean when inspected. Verify again before implementation and preserve all newer work. The earlier structural-rebuild report is historical context, not a request to repeat that rebuild.

Current source already contains:

- Six large flying objects per Vault/Convergence, eight per remaining car, plus six harmless small scraps per car. Flights are seeded per object/cycle; their X positions favour side lanes. The tests explicitly expect a safe stationary centre.
- Cargo's Rewind gangway, looping door/load and swinging freight. Its centre and floor void cannot simply receive extra clutter.
- Passenger's left falling rack at local Z `+5.8`, existing seat deflections at `+7.5` and `+3.5`, and a floor break from `-3` to `+1.4`. The route already asks for right, then centre.
- Depletion at `passenger.maxZ - 1.8`, near Passenger entry: the pursuing wave is already active during the rack and collapse, not only after them.
- Root-owned hazards and carriage-owned shell meshes, checkpoint restoration, temporal snapshots, swept debris contact and rear-section retirement.

Primary owners: `src/levels/timewreck-flying-panels.js`, `timewreck-debris.js`, `timewreck-routes.js`, `timewreck-spatial.js`, `timewreck-cargo.js`, `timewreck-expansion-hazards.js`, and composition/reset/finale in `timewreck.js`. Read callers before changing interfaces. Warning audio belongs to `src/systems/wreck-audio.js` / `wreck-hazard-audio.js`; prompts must use binding labels.

## Intended encounters

| Area | Change | Player decision and protected space |
| --- | --- | --- |
| Vault | Preserve the current introductory challenge. | Learn large debris versus harmless scraps; retain observation pads. |
| Convergence | Preserve exposed/direct versus sheltered/crouched routes. | The low route remains a legitimate slower choice. No added obstruction under its roof. |
| Mechanical | Preserve the repair/Freeze, trunk sweeps and steam sequence. | Existing switching recess stays safe. No new hazard system here. |
| Cargo | Replace part of the current random flight schedule with two authored bursts and a readable clear interval. Compose them with the existing freight crossing. | Observe on a protected solid approach, dodge/hold a burst, cross the gangway, then reassess the existing freight. Avoid a single permanently safe centre line inside the selected burst zone. |
| Relay | Keep a quieter Ghost/mechanism beat. | Preserve pad occupancy, observation and recharge. |
| Security | Keep the two-hole traversal as its own precision challenge. | No new lethal overlay on decks, takeoff/landing strips or central island. |
| Passenger | Strengthen the existing rack/seat weave, then add a short duck/jump sequence on the solid exit stretch if timing/clearance tests support it. | Keep right past the left rack, make one additional visible lateral decision on solid floor, return to centre before collapse, then duck/jump with advance sightlines. |
| Cab | Keep the brake approach readable and clear. | Finish the existing final Freeze and brake interaction. No extra obstacle at the lever. |

These four improvements are one scoped implementation: Cargo bursts, linked Cargo decisions, Passenger lane changes, and the final duck/jump beat. Do not stop after the first pilot to request permission to continue. Choose exact placements from current geometry and measured traversal; the offsets above describe existing hazards, not free placement slots.

## Implementation sequence

1. **Baseline and route budget.** Record current Cargo/Passenger first- and third-person views, normal approach, existing hazards and checkpoint starts. Measure actual walk, sprint, lateral movement, crouch and jump behaviour with the real player controller. Inventory full hazard sweeps, safe pads, interaction rays, floor supports, void lips and camera clearance. Capture a repeatable frame-time/resource baseline at fixed settings; do not infer FPS from mesh counts.
2. **Cargo pilot.** Reuse the existing panel pool and `createDebrisCollision`; use a small L3 encounter definition/state in the existing module, or one focused helper if it materially simplifies that module. Prefer scheduling existing objects over increasing their count. Author a short cue → burst → recovery → second burst → clear pattern. Start tuning around 0.9–1.2 seconds of visible warning, then derive the real lead from relative player/debris speeds and both camera views. A distant flash without a readable approaching object is insufficient. Protect an actual solid observation position throughout the pattern. Establish a visible evasive lane for each burst, including object rotation and body radius. Render and play the entire Cargo puzzle before proceeding.
3. **Link Cargo decisions.** Separate the burst commitment and freight decision with a real safe position on existing solid floor. Keep the existing gangway and door/load puzzle solvable. If timing must be coordinated, introduce only local authored offsets with complete temporal/reset coverage. A Freeze held too early may leave a blockage, encouraging release/reposition/reuse; correct Freeze or Slow strategies must remain valid. Do not add Freeze immunity or a new ability lock to force difficulty.
4. **Passenger weave.** Reuse/adjust the existing rack and seat geometry rather than duplicate their current right-then-centre requirement. Add one additional lateral commitment with a visibly open bypass, leaving enough longitudinal distance to change lanes. Any moving load gets a warning and visible matching contact/blocking geometry. No simultaneous left/right closure, crush trap, or push into the collapse. Preserve the centre return before the original collapse lips.
5. **Final movement beat.** On existing solid floor after the collapse, fit at most one short overhead duck obstacle and one low jump obstacle. Use the real player's head/body/jump extents and both crouch modes. Leave a clear run-up, landing, stand-up and input-release interval between them; neither obstacle may overlap the floor break, cab doorway or brake ray. Their order/spacing may change to fit the actual route. If two cannot fit safely, deliver one combined duck-or-jump choice with visible alternatives and document the measured reason. Do not shorten the collapse or retime the wave to manufacture space.
6. **Integrate and verify.** Connect warnings, snapshots, checkpoints, fail-once protection, pause, retirement, minimap/camera behaviour and disposal. Complete all encounters before final validation. Keep L2, Ending, the recent windows and structural openings intact.

## Fairness and feasibility rules

- A burst may challenge the centre only within its authored encounter. Keep other cars' established centre/sheltered behaviour. Update the old all-car centre-safety assertion only where the design intentionally changes it; replace it with a proof of a reachable alternative and preserved safe pads.
- Coordinate existing randomized flights with the encounter. Exclude or reschedule conflicting random flights; do not layer authored hazards over independently random lethal coverage and assume the gaps remain safe.
- Assess space over time: a safe lane in one frame is insufficient if the next burst arrives before the player can reach it. Check initial phase, seed, checkpoint entry, waiting, Slow/Freeze release and Rewind restoration.
- Warning, contact and visual geometry must agree. Large objects remain lethal while frozen; small decorative scraps remain harmless. Avoid deaths from hidden/recycled objects and reset stale sweep history after discontinuities.
- Do not use a permanent full-width blocker as mandatory waiting during the wave chase. At 12 m lead and 6.2 m/s wave speed, standing still spends approximately 1.94 seconds of lead before accounting for the existing catch margin. That is an upper-bound intuition, not a usable timing allowance. Budget the whole rack/collapse/duck/jump/brake route with real simulation and render checks.
- Keep max energy 100, recharge 15/s, Slow/Freeze/Rewind drains 18/28/32 per second, Ghost 35 + 1.5/s, checkpoint recovery floor 50 and disabled L3 strain. Preserve current Ghost rules and finale energy/ability behaviour. Verify current source values rather than silently reinstating stale numbers.
- Preserve sprint 6.8 m/s, wave 6.2 m/s, 12 m lead, depletion trigger, brake timings, floor holes/support contracts, carriage dimensions, movement bounds and checkpoint locations. Adjust the new encounters when their budget fails.
- Use the registered scaled-time and snapshot contracts. No wall-clock gameplay scheduling or nondeterministic draws during updates. Rewind must recreate the same burst, cue, enabled state and collision pose; retry must reproduce a fair entry.
- Root-owned hazards must remain in their established coordinate system. Register retirement/reset ownership so no new collision, warning or floating machinery survives inaccessible rear cars.
- Keep the 12-light pool, bounded audio voices, shared/instanced resources and cheap materials. Avoid per-fragment physics, extra global post effects, shader-only collision or a general encounter/destruction framework.

## Evidence and acceptance

Add focused encounter tests for cue/active/recovery transitions, deterministic seeds, real swept contact, crouch/jump clearance, frozen contact, safe alternatives, and no accidental bridges. Run real-player traversal tests at 30/60/144 FPS plus mixed deltas including 100 ms. Test minimum checkpoint energy and legal power transitions; tests must walk/jump through the route rather than teleport past it or disable collisions.

Cargo must demonstrate protected observation → burst dodge/hold → gangway → freight → exit using normal mechanics. Passenger must demonstrate rack avoidance → extra lane commitment → centre collapse crossing → duck/jump beat → brake and Ending. Include failures and retries, not just an ideal completion.

Run the full suite (`npm.cmd test`), production build (`npm.cmd run build`), `node scripts/check-production.mjs`, and `git diff --check`. Include existing connector, Cargo, Relay, Security, expansion/spatial, debris/flying-panels, escape, feedback, audio, camera, visibility/minimap, lifecycle and Ending coverage. Never weaken unrelated tests to make new hazards pass.

Perform a real browser playthrough of the affected route with keyboard/time controls, in both views and both crouch modes. Check normal and checkpoint starts, death/retry, pause/resume, restart/quit, Ghost expiry/cancel, power depletion, rear breakup and repeated L3→Ending. Capture before/after images and the cue, active burst, safe gap, Passenger landing and brake states. Check a narrower aspect ratio and at least performance/high tiers. Diagnostic camera poses and automated traversal support this pass; they do not replace it.

Compare baseline/new frame-time median and p95, update/submission cost, draw calls, triangles and resource counts under the same source/settings/hardware/view, separating shader warmup. Profile available GPU information honestly. Existing Iris Xe performance is already constrained; no performance regression is a primary target and no FPS improvement is promised.

Deliver a short report with final placements/timings, successful routes and energy budget, blind-sprint failure versus deliberate success, warnings, screenshots, test/build results, performance limitations and any checks unavailable. More difficulty must come from required decisions, not simply higher death counts. Do not commit, push or publish unless requested.

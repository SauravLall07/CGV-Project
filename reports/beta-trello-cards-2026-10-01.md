# Trello Backlog for Beta

Labels use `Severity; Type; Level; Rubric`. Checklist includes the acceptance criteria item.

## BLOCKERS (do first)

### Build the production bundle outside the restricted sandbox
- **Suggested skill area:** tooling
- **Description:** All existing tests pass when run directly (29 tests across five files). The npm test runner and Vite build still hit child-process `spawn EPERM` in this sandbox; run the production build in the team environment. Files: package.json, vite.config.js.
- **Labels:** High; Bug; All; Polish
- **Effort:** S
- **Dependencies:** None
- **Checklist:**
  - [ ] Run npm test
  - [ ] Run npm run build
  - [ ] Save command output and resolve source failures
  - [ ] Acceptance: tests pass and clean dist build finishes

### Play one complete production run on the target browser
- **Suggested skill area:** QA / gameplay
- **Description:** No end-to-end browser proof exists. Verify the actual built game in Chrome on Ubuntu before beta. Files: dist/index.html, src/main.js, src/core/level-manager.js.
- **Labels:** Blocker; Deploy; All; Gameplay & Experience
- **Effort:** M
- **Dependencies:** Build the production bundle outside the restricted sandbox
- **Checklist:**
  - [ ] Serve build over HTTP
  - [ ] Complete L1 to L2 to L3 without dev shortcuts
  - [ ] Restart and repeat transitions
  - [ ] Acceptance: no blocker, softlock, console error, or asset 404

## Level 1

### Verify station stealth and boarding fail/retry path
- **Suggested skill area:** gameplay / QA
- **Description:** Guards, cameras, lasers and suspicion exist, but behavior has not been playtested in this review. Decide whether a departure timer is part of the shipped design. Files: src/levels/boarding.js, src/systems/stealth.js.
- **Labels:** High; Bug; L1; Gameplay & Experience
- **Effort:** M
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Test cover against each detector
  - [ ] Trigger suspicion and recover at checkpoint
  - [ ] Disable/bypass each laser
  - [ ] Test boarding interaction
  - [ ] Acceptance: clear objective and recoverable failure on repeated attempts

## Level 2

### Make level hints use the active key bindings
- **Suggested skill area:** UI / gameplay
- **Description:** Some L2/L3 prompts hard-code default ability and run keys while settings permit rebinding. Files: src/levels/moving-heist.js, src/levels/timewreck.js, src/core/settings.js.
- **Labels:** Medium; Feature; All; Control & Playability
- **Effort:** S
- **Dependencies:** None
- **Checklist:**
  - [ ] Expose binding label helper to level hint text
  - [ ] Replace hard-coded keys in both levels
  - [ ] Rebind all abilities and sprint
  - [ ] Acceptance: every displayed key matches the active settings

### Validate time puzzle rules and the Time Ghost route
- **Suggested skill area:** gameplay / level design
- **Description:** The levels register Ghost pads and hazards, but first-time solution clarity and collision correspondence are unverified. Files: src/levels/moving-heist.js, src/systems/time-system.js, src/entities/time-ghost.js.
- **Labels:** High; Polish; L2; Gameplay & Experience
- **Effort:** M
- **Dependencies:** Build the production bundle outside the restricted sandbox
- **Checklist:**
  - [ ] Solve every L2 puzzle without hints
  - [ ] Try abilities not intended by the route
  - [ ] Confirm visible hazard state matches failure collision
  - [ ] Make Ghost useful and explain recording/replay
  - [ ] Acceptance: intended and reasonable alternate routes behave consistently

## Level 3

### Stage a short global-freeze and train-stop finale
- **Suggested skill area:** gameplay / animation / cinematic
- **Description:** Current wave and brake beat do not clearly stop the world/train on the destroyed bridge as the concept describes. Files: src/levels/timewreck.js, src/environment/timewreck-exterior.js.
- **Labels:** High; Feature; L3; Innovation
- **Effort:** L
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Show destroyed track/bridge
  - [ ] Freeze train, debris and environmental motion for a readable window
  - [ ] Let player reach/pull brake
  - [ ] Visibly decelerate and resolve on bridge
  - [ ] Add camera/input ownership and skip path
  - [ ] Acceptance: a first-time viewer understands the freeze and that the train stopped

### Retest Timewreck supports, checkpoints and repeated deaths
- **Suggested skill area:** gameplay / physics
- **Description:** Dynamic support boxes and restore callbacks exist but have not been validated in play. Files: src/levels/timewreck.js, src/entities/player.js, src/systems/respawn.js.
- **Labels:** High; Bug; L3; Control & Playability
- **Effort:** M
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Test frozen slab landings and falling
  - [ ] Die at each checkpoint repeatedly
  - [ ] Test final wave while freezing and after depletion
  - [ ] Acceptance: each reset returns to reachable safe geometry with correct ability state

## Cross-level / Core systems

### Smoke-test temporal resets and respawn cancellation
- **Suggested skill area:** gameplay / core systems
- **Description:** September defects appear fixed in source; regression proof remains needed after restart, unload and New Game. Files: src/core/level-manager.js, src/systems/time-system.js, src/systems/respawn.js.
- **Labels:** High; Bug; All; Control & Playability
- **Effort:** S
- **Dependencies:** Build the production bundle outside the restricted sandbox
- **Checklist:**
  - [ ] Start ghost and spend energy then restart
  - [ ] Fail then restart/quit before timer expires
  - [ ] Progress to L3 depletion then replay
  - [ ] Acceptance: no stale ghost, cooldown, callback or controls leak into new run

### Choose and communicate the time-control scope
- **Suggested skill area:** game design / gameplay
- **Description:** Concept suggests selected-object time control; implementation applies a mode to registered objects. Make one explicit scope choice before puzzle tuning. Files: src/systems/time-system.js, src/ui/hud.js.
- **Labels:** High; Feature; All; Gameplay & Experience
- **Effort:** S
- **Dependencies:** None
- **Checklist:**
  - [ ] Team selects global registered set or selected/radius targets
  - [ ] Document ability eligibility per level
  - [ ] Ensure HUD explains affected objects
  - [ ] Acceptance: tester can predict what each activation changes

## Shaders & Visual Effects

### Demonstrate gameplay-driven Chrono and laser shader effects
- **Suggested skill area:** shaders / graphics
- **Description:** Custom vertex and fragment shaders exist; tie the demo to a visible gameplay state and check both compile in browser. Files: src/shaders/chrono-field.js, src/shaders/security-laser.js, src/systems/time-system.js.
- **Labels:** Medium; Polish; All; Shaders
- **Effort:** S
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Trigger slow/freeze/rewind and show distinct visible affected state
  - [ ] Trigger laser/alarm state
  - [ ] Confirm no shader compile warnings
  - [ ] Prepare brief uniform/attribute/varying explanation
  - [ ] Acceptance: shader state visibly follows gameplay and team can explain it

## Audio

### Verify master volume, mute and level sound feedback
- **Suggested skill area:** audio
- **Description:** Master volume/mute settings and sampled tracks/ability SFX exist; confirm all buses use them and the two music systems do not overlap. Files: src/core/audio.js, src/core/settings.js, src/systems/level-music.js, src/systems/music-system.js.
- **Labels:** Medium; Bug; All; Gameplay & Experience
- **Effort:** S
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Test muted first launch and saved mute
  - [ ] Change volume during menu and gameplay
  - [ ] Listen for ability and transition feedback
  - [ ] Check level transitions/pause for overlapping loops
  - [ ] Acceptance: one predictable mix and all sounds obey mute/master volume

## UI / Menus / Polish

### Replace team-credit placeholder and verify all attributions
- **Suggested skill area:** UI / production
- **Description:** Credits still contain a literal team placeholder; external sources and licences need team verification. Files: src/ui/credits.js, package.json, src/assets.
- **Labels:** Blocker; Feature; All; Polish
- **Effort:** S
- **Dependencies:** Confirm team names, roles and asset provenance
- **Checklist:**
  - [ ] Add accurate names/roles
  - [ ] Inventory third-party code, models, animations, audio and libraries
  - [ ] Check source and licence for each item
  - [ ] Remove unused cannon-es claim or explain actual usage
  - [ ] Acceptance: no placeholders and every borrowed item has source/licence where applicable

### Make loading progress reset and report real work
- **Suggested skill area:** UI / tooling
- **Description:** Manager shows an overlay around synchronous procedural building, but asset progress may be stale or incomplete. Files: src/ui/loading-screen.js, src/core/level-manager.js, src/core/assets.js.
- **Labels:** Medium; Polish; All; Polish
- **Effort:** S
- **Dependencies:** Build the production bundle outside the restricted sandbox
- **Checklist:**
  - [ ] Reset bar/message on each show
  - [ ] Use stage messages for unmeasured procedural/audio tasks
  - [ ] Show recoverable load errors
  - [ ] Acceptance: each transition never displays stale completion progress or hangs silently

## Performance & Memory

### Verify indexed tree geometry renders correctly
- **Suggested skill area:** graphics / performance
- **Description:** The previous tree-index bug was repaired by the merge helper; visually verify the resulting instanced tree silhouettes and indexed plus non-indexed inputs. Files: src/environment/outdoor-environment.js:194,211,565-603.
- **Labels:** High; Bug; All; 3D Effects
- **Effort:** S
- **Dependencies:** None
- **Checklist:**
  - [ ] Use index-aware merge or convert all parts to non-indexed consistently
  - [ ] Recompute required attributes
  - [ ] Inspect pine and deciduous output
  - [ ] Acceptance: resulting triangle count/connectivity matches inputs

### Measure memory, frame time and decoded audio across a full run
- **Suggested skill area:** performance / profiling
- **Description:** No browser measurements exist; rewind allocates temporary arrays and decoded MP3 cache persists. Files: src/systems/time-system.js, src/systems/level-music.js, src/core/renderer.js.
- **Labels:** Medium; Perf; All; Polish
- **Effort:** M
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Record FPS/frame time and renderer memory per level
  - [ ] Repeat run twice
  - [ ] Estimate decoded audio buffer memory
  - [ ] Inspect rewind allocations under use
  - [ ] Acceptance: no unexplained monotonic resource growth; tune only measured hot spots

## Deployment & Credits

### Publish and verify the relative-path production archive
- **Suggested skill area:** deployment / QA
- **Description:** Vite has relative base configured, but build and Linux subdirectory hosting are unverified. Files: vite.config.js, index.html, dist/.
- **Labels:** Blocker; Deploy; All; Polish
- **Effort:** M
- **Dependencies:** Build the production bundle outside the restricted sandbox
- **Checklist:**
  - [ ] Build and archive dist with index.html at root
  - [ ] Check case-sensitive asset paths
  - [ ] Deploy to a subdirectory
  - [ ] Open in Chrome/Ubuntu and check console/network
  - [ ] Acceptance: full game runs from hosted URL with no 404 or absolute-root dependency

## Trailer & Devlog

### Record and publish the beta trailer
- **Suggested skill area:** video / editing
- **Description:** The beta brief requires a trailer up to two minutes; no video/link is present in this checkout. Capture after core run works.
- **Labels:** Blocker; Feature; All; Game Trailer
- **Effort:** M
- **Dependencies:** Play one complete production run on the target browser
- **Checklist:**
  - [ ] Capture boarding, time puzzle, roof, vault, collapse and finale
  - [ ] Edit clear paced sequence with sound
  - [ ] Keep below two minutes
  - [ ] Upload and record link
  - [ ] Acceptance: public/unlisted link plays and showcases actual game

## Stretch / Innovation

### Add one optional replay-value feature after blockers
- **Suggested skill area:** game design / gameplay
- **Description:** Only proceed if beta candidate is stable; a best-time/clean-heist record or optional route has lower scope than new environments.
- **Labels:** Low; Feature; All; Innovation
- **Effort:** M
- **Dependencies:** Publish and verify the relative-path production archive
- **Checklist:**
  - [ ] Pick one small optional reward with team
  - [ ] Implement local feedback/UI
  - [ ] Retest full run and performance
  - [ ] Acceptance: adds a distinct replay reason without delaying submission

## Needs Decision

### Confirm beta date and exact Moodle submission requirements
- **Suggested skill area:** production / submission
- **Description:** 15 October is calculated from the stated two-week target; brief says Moodle dates/archive rules take precedence.
- **Labels:** High; Feature; All; Deploy
- **Effort:** S
- **Dependencies:** None
- **Checklist:**
  - [ ] Check Moodle deadline and timezone
  - [ ] Confirm required archive naming/contents
  - [ ] Confirm trailer upload/link rules
  - [ ] Acceptance: team calendar and package checklist reflect official instructions

### Confirm team names, roles and asset provenance
- **Suggested skill area:** production / credits
- **Description:** Required to make credits truthful; repository cannot establish team identity or source/licence provenance.
- **Labels:** High; Feature; All; Polish
- **Effort:** S
- **Dependencies:** None
- **Checklist:**
  - [ ] Agree exact names and roles
  - [ ] Verify each downloaded model/audio file source and licence
  - [ ] Confirm whether cannon-es is used
  - [ ] Acceptance: credits information is verified by team members




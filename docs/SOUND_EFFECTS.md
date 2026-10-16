# Chrono Express audio implementation report

Implemented 16 October 2026. This report describes the repository changes and
the verification actually performed.

## Audit and scope

The game uses Three.js with a custom requestAnimationFrame loop, custom player
ground/jump and box-collision handling, and Cannon ES for wreck debris.
Mixamo animation handles determine distractor release. Interaction registration,
hold interactions, time snapshots, checkpoints, and level factories own the
other authoritative state changes. Vite builds relative asset URLs for
subdirectory hosting. Existing optimizations include deferred level factories,
nearby raycasts, carriage culling, light pooling, shared resources and loading
barriers; these systems and the rendering/physics algorithms remain intact.

The audit covered source modules for all levels, player/train entities,
interaction, distraction, stealth, time control, respawn, menus, environment
components, and the existing audio tests. It found:

- Boarding: station entry, cipher dials, memory plates/replay demonstration,
  relay tile rotation, laser bypass, distractor pickups/throwing, stealth
  suspicion, checkpoints, forced boarding, animated doors and train departure.
- Moving Heist: four ability pickups, route board/operator platform/relay
  levers and covers, sliding and drop doors, cargo machinery, rewindable
  traps/hatch, three pressure switches, roof steam, ladder transition, zipline,
  drawbridge, Vault hatch and the Chrono Core theft.
- Timewreck: electrical surges, release plate/fire door/manual catch,
  maintenance shutters, gangway repair/failure, cargo loop door, falling rack,
  collapse/breakup, Cannon debris impacts, depletion warning, emergency brake
  and escape doors.
- UI: native buttons, keyboard focus, settings sliders/toggles/choices,
  rebinding, pause/settings/tutorial/credits panels.

Existing audio comprised one AudioContext/master gain, four ability WAVs, five
MP3 tracks, a time-distortion noise bed, a synthesized puzzle-door cue, and
procedural wreck/hazard audio. The public Slow/Freeze/Rewind methods bypassed
their existing sound wrappers; those methods now use their successful-action
wrappers. Their prior public animation behavior is preserved. Ghost's existing
cast animation remains unchanged.

There are no separate slide, dash, damage-health, breakable-object, crate
push/pull, inventory-panel or countdown mechanics to invent audio for. The
ladder is an instant section transition, not an animated climbing simulation.
Static decorations, lights and scenery do not receive continuous noise.
The final-life/game-over branch exists in respawn but is deliberately disabled
by the current main-game configuration; its cue is ready if a handler is
registered, without enabling that branch.

## Architecture

```text
cached sampled effects -> disposable source + gain -> SFX bus ------+
existing music player -----------------------------> music bus ----+-> world gate -> master -> device
train/wind + procedural environmental beds ---------> ambience bus -+
menu effects --------------------------------------> UI bus ---------------------> master
```

The UI bus follows SFX volume. The world gate mutes gameplay, music and ambience
on pause, tutorials, editor use and loading transitions; menu controls remain
audible. Sampled world voices stop on pause so stale footsteps/impacts cannot
reappear on resume. Music is muted during pause and continues its timeline.
Loss of window focus/visibility mutes master output and suspends the context;
the next pointer/key gesture resumes it. Context creation/resume failure and
unsupported Web Audio are handled silently without interrupting gameplay.
Existing wreck systems retain their own presentation pause/reset lifecycle,
and their environmental mix routes through ambience.

- `core/audio.js`: one context, lazily created category gains, focus/pause
  gates, settings subscription and teardown.
- `sound-catalog.js`: 41 real WAV URLs statically analyzable by Vite.
- `sound-effects.js`: shared decoded buffers and in-flight promises,
  asynchronous preload, playback handles, loop support, concurrency/cooldown
  guards, priorities, diagnostics and transition tracking.
- `movement-audio.js`: post-collision displacement cadence, grounded checks,
  jump/landing events, quiet crouch, louder running, slight rate variation.
- `soundscape.js`: one moving-train or exposed-roof loop in Moving Heist.
  Time stasis hushes it. The existing Timewreck machinery remains level-owned.
- `ui-audio.js`: delegated click/focus/input events with one cleanup function.
- Existing ability and door APIs are thin adapters to the shared player.

Gameplay calls `playSfx(name, options)` only after success/transition/impact
checks. A returned handle supports `stop()` and `setVolume()`. It is valid
for playback to return null before loading/unlock or when a limit is reached.
Call `preloadSfx()` from initialization, never from a gameplay update.
Missing assets produce a warning and can be explicitly retried; they never
schedule a delayed gameplay cue.

Footsteps integrate distance only after collisions and bounds resolve. Walking
uses a 1.3 m stride, running 1.55 m at higher velocity and crouching 0.83 m at
lower velocity. Jump initiation uses the actual accepted physics branch;
landing uses the airborne-to-grounded transition and pre-reset impact speed.
Station stone, carriage runners, wooden decks and metal roof/vent surfaces have
separate samples. Cinematic boarding footsteps follow scripted displacement.

Moving machines use their existing poses and direction changes. State is
seeded silently, persists through small easing increments/Freeze, and resets
on checkpoint restoration. Distance only attenuates/filters a real transition;
approaching a stationary door does not trigger it. Projectile wall impacts
require incoming normal speed above 2; Cannon debris requires impact speed
above 2.5 and proximity. Collision cooldowns prevent resting-contact chatter.

## Sound inventory

All filenames below are under `src/assets/audio/sfx/` unless another source
is named. Multiple related triggers in a row use the same purpose-built cue.

| Game event | Sound effect | Source file | Trigger |
|---|---|---|---|
| Station walking/running | Stone boot contact | step-stone.wav | Grounded resolved travel crosses stride distance |
| Roof/vent walking | Metal boot contact | step-metal.wav | Same cadence on metal surface |
| Carriage/freight walking | Wooden boot contact | step-wood.wav | Same cadence on wooden surface |
| Runner walking | Damped fabric contact | step-carpet.wav | Same cadence on carriage runner |
| Jump | Takeoff/boot scuff | jump.wav | Successful jump start only |
| Landing | Weighted landing thud | land.wav | Confirmed landing; volume/pitch follow impact |
| Crouch/stand; ladder transition | Clothing movement | cloth.wav | Posture edge or accepted ladder traversal |
| Puzzle/station/train/route/drop/cage/fire/cargo doors, shutters, roof hatch, escape doors | Mechanical travel open | door-open.wav | Unlock/open action or increasing open pose |
| Train/fire/cargo/drop/cage doors, shutters, roof hatch, barriers | Mechanical travel close | door-close.wav | Closing target or actual reverse motion |
| Locked relay, ladder exit, roof hatch or zipline | Bolt refusal | door-locked.wav | Actual rejected interaction |
| Puzzle doors, route latch, emergency catch, Freeze recovery | Unlock confirmation | unlock.wav | Unlock/latch/recovery succeeds |
| Pressure plates, relays, replay/bypass/access controls, boarding latch, brake | Mechanical switch | switch.wav | Press/engage/accepted lever action |
| Pressure plates and relay covers | Release click | switch-release.wav | Previously held/open state releases |
| Cipher/relay tiles; memory replay beat | Rotary detent | dial.wav | Dial/tile rotates; existing demonstration advances |
| Distractor/module/Core pickup | Pickup chime | pickup.wav | Inventory/ability/Core state actually acquired |
| Distractor throw | Hand-release whoosh | throw.wav | Animation release flag, not key press |
| Distractor collision; ladder contact | Metallic clatter | metal-impact.wav | Significant wall impact, one floor landing, or accepted ladder transition |
| Wreck debris/rack/collapse | Heavy debris impact | debris-impact.wav | Significant Cannon impact; rack reaches floor; collapse starts |
| Checkpoint | Checkpoint chime | checkpoint.wav | Existing checkpoint changes to a new position |
| Cipher/memory/tile/route/twin-switch solution, bypass, route-board log; completion | Completion chime | objective.wav | One-shot progress/solution/completion event |
| Failure | Descending failure cue | fail.wav | Respawn accepts a failure |
| Final life | Longer failure cue | game-over.wav | Existing game-over handler branch, when enabled |
| Recovery | Recovery chime | respawn.wav | Successful checkpoint respawn |
| Rising suspicion, overheat, surge warning, Core theft, finale depletion | Warning double pulse | warning.wav | Threshold/state edge, with cooldown |
| Full/empty inventory, invalid relay order/plate/ability | Soft refusal | error.wav | Actual rejected action |
| Time power ends/Ghost fades | Descending chrono release | ability-end.wav | Active mode returns to Normal or Ghost ends |
| Slow | Existing chrono cue | sfx-slow.wav | Successful Slow action |
| Freeze | Existing chrono cue | sfx-freeze.wav | Successful Freeze action |
| Rewind | Existing chrono cue | sfx-rewind.wav | Successful Rewind action |
| Ghost | Existing chrono cue | sfx-ghost.wav | Successful Ghost summon |
| UI button activation | Soft click | ui-click.wav | Enabled button click, including keyboard/touch-generated click |
| Menu navigation | Soft focus tick | ui-nav.wav | Focus enters a native control |
| Pause/settings/tutorial/credits open | Rising panel cue | ui-open.wav | Panel opens |
| Pause/settings/tutorial/credits close | Falling panel cue | ui-close.wav | Panel closes |
| Setting/rebind changes | Adjustment tick | ui-change.wav | Native control input or completed binding change |
| Electrical surge/failure burst | Electrical crack | electrical.wav | Surge enters dangerous phase or actual burst starts |
| Security steam/roof vents/departure | Steam exhale | steam.wav | Jet enters active phase near player; departure starts |
| Cargo/rewind machinery, drawbridge, gangway, rack; train departure | Mechanical movement | machinery.wav | Motion starts/reverses, or departure starts |
| Zipline | Cable/trolley glide | zipline.wav | Brake released and ride accepted |
| Moving-train interior | Low air/rail texture | train-air.wav | Moving Heist interior, single loop |
| Exposed train roof | Slipstream texture | roof-wind.wav | Moving Heist roof, replaces interior loop |
| Chrono distortion ambience | Existing filtered noise | src/systems/music-system.js | Time dilation/intensity; now ambience category |
| Wreck machinery, brake squeal/settling, snap, debris, environmental warnings | Existing procedural tones | src/systems/wreck-audio.js | Existing wreck events; category/lifecycle preserved |
| Swinging freight and steam hazard | Existing creak/hiss | src/systems/wreck-hazard-audio.js | Existing nearby active hazard state; ambience category |
| Menu/levels/victory | Existing music | menu-theme.mp3, level1-constance.mp3, level2-mistake-the-getaway.mp3, level3-final-count.mp3, victory-theme.mp3 in ../music/ | Existing music-state changes; separate music volume |

## Assets and licensing

37 new original sounds are reproducibly synthesized by
`scripts/generate-sfx.mjs`: 704,144 bytes total, mono 22,050 Hz 16-bit PCM WAV.
Short, small PCM files preserve transients and browser decoding compatibility
without a new encoder/tool dependency. Existing long music remains compressed
MP3. No network access or external sample pack was required.

`src/assets/audio/sfx/LICENSE.generated.txt` lists every new WAV and dedicates
the generator/new sounds to CC0-1.0. Existing ability and music asset licenses
are unchanged; this work does not establish or relicense their provenance.

## Files changed

| File | Change and purpose |
|---|---|
| package.json | Adds audio generation, focused tests and optional Chrome test commands; no dependency changes |
| scripts/generate-sfx.mjs | Creates the 37 original playable effects deterministically |
| scripts/check-browser-audio.mjs | Optional local Vite/Chrome DevTools verification using an isolated temporary profile |
| src/assets/audio/sfx/*.wav | 37 new files, individually listed in the inventory/license |
| src/assets/audio/sfx/LICENSE.generated.txt | New-asset provenance and CC0 scope |
| src/core/audio.js | Shared category graph, safe unlock, focus/pause/mute and teardown |
| src/core/settings.js | Three Audio-category sliders using existing persistence, validation and UI generation |
| src/core/level-manager.js | Exposes active level's surface resolver |
| src/main.js | Preload/unlock, lifecycle, focus, menu feedback, soundscape and surface wiring |
| src/entities/player.js | Observes resolved movement, jump/landing and scripted walk; resets step handles on pose reset |
| src/entities/train.js | Opening/closing cues on real door target transitions |
| src/environment/passageways/passage-components.js | Puzzle door unlock cue and shared opening adapter |
| src/environment/passageways/passage-onboarding.js | Accepted access-switch feedback |
| src/environment/passageways/passage-tutorial.js | Cipher rotation and solution feedback |
| src/environment/passageways/passage-guards.js | Memory replay/plates/solution and distractor pickup/refusal |
| src/environment/passageways/passage-bridge.js | Tile detents, puzzle completion and distractor pickup/refusal |
| src/levels/boarding.js | Pickups/bypass/entry/boarding/departure cues and station surface resolver |
| src/levels/moving-heist.js | Module/Core, relay, switches, doors, machinery, steam, ladder, zipline/drawbridge cues and surfaces |
| src/levels/timewreck.js | Surge/fire door/gangway/cargo/collapse/debris/brake/finale cues, listener cleanup and surfaces |
| src/levels/timewreck-routes.js | Maintenance shutters and rack motion/impact transitions |
| src/systems/sound-catalog.js | Static URLs for 41 existing/new WAV assets |
| src/systems/sound-effects.js | Sample cache, shared loading, bounded voices/handles and transition tracking |
| src/systems/movement-audio.js | Movement/impact cadence and state observer |
| src/systems/soundscape.js | Owned interior/roof ambience loop and stasis hush |
| src/systems/ui-audio.js | Delegated native-control sounds with cleanup |
| src/systems/ability-sfx.js | Existing public API adapted to central cache/player |
| src/systems/door-sfx.js | Replaces uncapped synthesized door nodes/timer with cached open/close samples |
| src/systems/distraction.js | Animation-release, significant wall collision, floor landing and empty-inventory cues |
| src/systems/respawn.js | Checkpoint/failure/final-life/respawn one-shots |
| src/systems/stealth.js | Suspicion threshold warning with hysteresis/reset |
| src/systems/time-system.js | Successful activation wrappers, rejection/end/overheat/recovery/Ghost feedback |
| src/systems/level-music.js | Music bus and natural-source-completion cleanup; existing shared music cache preserved |
| src/systems/music-system.js | Existing distortion bed routes through ambience |
| src/systems/wreck-audio.js | Existing procedural environmental mix routes through ambience |
| src/systems/wreck-hazard-audio.js | Existing hazard mix routes through ambience |
| src/ui/pause-menu.js | Pause/resume panel cues |
| src/ui/settings-menu.js | Settings panel and committed binding cues |
| src/ui/credits.js | Credits panel cues |
| test/audio-graph.test.mjs | Category routing, pause/focus/unlock/mute and persistence verification |
| test/movement-audio.test.mjs | Cadence, surfaces, stopped/airborne filtering and impact scaling |
| test/sound-effects.test.mjs | Cache/load failures/caps/priority/cleanup and actual WAV integrity |
| test/gameplay-audio.test.mjs | Real physics, doors, animation release, ability actions, respawn and transition integration |
| test/fixtures/audio-browser.html | Real Web Audio/browser and primitive-player test harness |
| test/level-music-cache.test.mjs | Updates routing assertions to account for music bus/world gate |
| test/wreck-audio.test.mjs | Updates routing/ownership assertions for category buses |
| docs/SOUND_EFFECTS.md | This audit, inventory, architecture and verification report |

No pre-existing assets/files were removed. A temporary baseline snapshot used
for validation was removed after testing; original assets were only linked
read-only into that snapshot. No shader/rendering features were changed.

## Performance and ownership

- One AudioContext; no added runtime dependencies.
- All short effects preload asynchronously after the first user gesture.
  Concurrent requests share promises; decoded buffers are reused for the
  session. Gameplay never fetches or decodes.
- At most 20 sampled voices including loops/UI. Per-key limits default to 2,
  footsteps and ambience use 1. Higher-priority events may replace a lower
  priority transient. Existing singleton music and bounded procedural beds
  are separate from that sampled-voice budget.
- Default event cooldown 90 ms; footsteps 130 ms, collision cues 150–200 ms,
  mechanical transitions 300 ms. The cooldown-key map is capped at 128.
- No new wall-clock gameplay timers. Step sources stop immediately on stop,
  jump, planting, pause or pose reset. Completed sources/gains disconnect.
- Transition trackers reuse per-mechanism state. Surface spans are cached;
  no new raycasts, collision queries, render passes or shader work.
- Environmental motion starts are filtered to 12 m; electrical/steam events
  to 10 m. This is simple distance-based mixing, not full 3D panning/occlusion.
- Level teardown stops shared world effects/ambience. New Cannon listeners
  unregister with their owning level. UI/focus/pause/settings subscriptions
  have teardown hooks.
- Chrome decoded all 41 WAVs to 7,948,036 PCM bytes (about 7.58 MiB) in the
  test context and reported zero live sampled voices after cleanup. This is
  the SFX cache, not total game or music memory.

## Verification results

Commands use `npm.cmd` on this Windows host because PowerShell blocks npm.ps1.
There are no configured lint or type-check scripts; JavaScript syntax/module
bundling is checked by Vite and the tests.

| Command/check | Result |
|---|---|
| npm.cmd run audio:generate | Pass: 37 playable WAVs, 704,144 bytes; deterministic local synthesis |
| npm.cmd run test:audio | Pass: 26 tests |
| npm.cmd run test:audio:browser | Pass in installed Chrome, isolated profile; required execution outside the restricted sandbox |
| npm.cmd test | 181 tests: 169 pass, 12 fail; all 12 failures reproduced from clean HEAD |
| npm.cmd run build | Pass; Vite reports a large-JS-chunk warning |
| node scripts/check-production.mjs | Pass: 95 packaged files, 94 case-sensitive subdirectory asset references |
| git diff --check | Pass |

The Chrome check observed a genuinely suspended context before user input,
then running playback after a dispatched click. It decoded every catalog WAV,
started real sources, checked category volume/mute/persistence/pause/UI,
exercised actual primitive-player movement and held-jump physics, and observed
three stone steps, one jump, one landing, one door-open and one door-close
transition. It finished with no pending loads or sampled voices.

The focused suite additionally exercises actual puzzle/train door transitions,
distractor animation release and floor landing, successful/rejected ability
actions, checkpoint/failure/final-life branches, rate/volume variation, voice
priority/caps, suspended/paused playback, failed HTTP loads, disposal during
loading, aborted pending fetches on disposal, and ended-node cleanup. The original wreck and music tests still pass.

The 12 baseline failures are unchanged:

- Six interaction tests use a DOM stub missing `appendChild`.
- Five throw-animation tests access `import.meta.env.DEV` under plain Node.
- One camera clearance assertion fails in the existing camera test.

The baseline check used an isolated copy of tracked HEAD source/tests with the
same assets and test loader; it reproduced these same 12 failures (14 targeted
tests, 2 pass / 12 fail). It did not alter the working source. Raw command logs
are in `reports/audio-*.log` locally.

Manual checks still required:

1. Listen to the mix through a complete playthrough: stone/carpet/wood/metal
   transitions, walk/run/crouch cadence, heavy falls and scripted boarding.
2. Exercise every full-level puzzle, door/hatch, steam/surge phase, zipline,
   drawbridge, rack, rewind repair and brake cinematic with music enabled.
   Automated tests cover representative real mechanics, not every full-level
   audible combination.
3. Verify pause/tutorial/settings layering and rapid focus/tab restoration
   in the complete game; check sliders, toggles and menu focus with keyboard,
   mouse and supported touch.
4. Test Safari/iOS and Android browsers on physical devices, including an
   interrupted audio session and user-gesture resume.
5. Profile full-game frame times and long-session heap usage on target
   hardware. No gameplay FPS/heap regression claim or subjective listening
   certification is made from the headless harness.

## Remaining opportunities

- Replace selected synthesized mechanical/footstep cues with professionally
  recorded, correctly licensed variants after listening review. No unavailable
  external sample references are shipped.
- Add spatial panning, wall/room occlusion and more detailed surface regions
  if playtests warrant their CPU/authoring cost. Current proximity filtering
  and distinct surfaces give feedback without new spatial queries.
- Add guard footsteps or per-prop ambient details selectively after stealth
  and mix review; unconditionally sounding every patrol/decorative clock could
  overwhelm the current puzzles and music.
- Compression of longer future ambience assets can reduce transfer size once
  an encoder/toolchain is chosen; current new audio totals less than 0.7 MB.
- Original music/ability attribution should be reviewed separately if the
  game is distributed. Their existing files and licensing were preserved.

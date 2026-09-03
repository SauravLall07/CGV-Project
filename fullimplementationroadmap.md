# Chrono Express — Full Implementation Roadmap (Alpha → Final)

This is the complete plan from where the Alpha blockout leaves off through to Final submission. It builds directly on the two earlier documents:

1. **Three.js setup plan** — tooling, deployment-safe config, base scene/camera/renderer/loop
2. **Alpha preliminary implementation plan** — `Train`/`Carriage` hierarchy, station blockout, placeholder player, third-person camera

Everything below assumes those exist. Hand this document to Claude Code **one phase at a time**, not all at once — the brief gives you roughly three weeks to a graded Beta, and reviewing a phase's output before starting the next is what keeps the codebase coherent across a 4–6 person team.

---

## 0. How this maps to your milestones

| Brief milestone | What must be true by then | Phases below it depends on |
|---|---|---|
| **Alpha** (formative) | Three.js running, hierarchy + blockout demonstrable | Already done (prior two plans) |
| **Beta** (graded, ~3 weeks from brief release) | "Fundamentally finished, minor bugs/an incomplete level or two acceptable." **Trailer is required at this stage.** | Phases 1–5 at least functionally complete; Phase 8 polish partial is fine |
| **Final** (graded, end of term) | Fully playable, hosted on LAMP, plus devlog video | All phases complete, Phase 9 (deploy/checklist) fully re-verified |

Exact dates are on Moodle and take precedence over anything here — treat the table above as relative sequencing, not a calendar.

**One cross-cutting warning before you start:** the **time-manipulation system** (Phase 3) is a dependency of Level 3's hazards (Phase 4) and of the Chrono Field shader (Phase 5), even though narratively it's introduced "in Level 2." Build its core early rather than leaving it until you reach Level 2 in level order — several later phases block on it.

---

## Phase 1 — Core Systems Foundation

**Goal:** the shared scaffolding every level depends on, so Levels 1–3 are built on the same plumbing instead of three separate hacks.

**Deliverables:**
- **Interaction system** — a raycast from the camera/player forward vector against an "interactable" layer, surfacing a contextual prompt (e.g. "E to open") and firing a callback. Doors, terminals, switches, and the eventual boarding control and emergency brake all use this one system.
- **Game state / level manager** — an explicit state machine (`Boarding → MovingHeist → Timewreck → Complete`), responsible for tearing down the current level's objects (calling `.dispose()` per the brief's memory-management warning) and instantiating the next. This is also what makes **restart-without-refresh** possible — restart just re-runs "tear down current, instantiate current" rather than reloading the page.
- **Checkpoint / respawn system** — a registered checkpoint position per level; a generic "fail" event (caught by guards, hit by hazard, fell off train) returns the player to the last checkpoint rather than hard-failing the run.
- **Asset loading pipeline** — `GLTFLoader` + `DRACOLoader` wired up, plus a loading screen with a real progress bar (`onProgress` from the loading manager), since the brief explicitly calls loading screens out as worth Polish marks and a hedge against "a slow first load looking like a crash."
- **HUD scaffold** — not the final HUD, just a fixed-position DOM or in-scene overlay that can show an objective line and an interaction prompt; the full HUD design happens in Phase 8, but every level from here needs somewhere to put "reach the vault" text.

**Rubric tie-in:** Control & Playability (clear objectives, fail states), Polish (restart, loading screen).

---

## Phase 2 — Level 1: The Boarding

**Goal:** the full stealth/infiltration level, per the concept doc.

**Deliverables:**
- Station environment building out the Alpha blockout: replace placeholder boxes with real geometry/materials for the luxury station look (wood, brass, glass, carpet) — either modelled assets (credit if downloaded, or Blender-original for Innovation credit) or well-textured primitives if the team's modelling bandwidth is limited.
- **Guard patrol AI** — waypoint-following state machine (`Patrol → Investigate → Alert`), using the interaction/hazard pattern from Phase 1 to trigger a fail state on player detection.
- **Camera detection** — rotating security cameras with a vision cone (frustum or angle+distance check against the player), feeding the same suspicion system as guards.
- **Suspicion/alarm meter** — a shared value in the game-state, incremented by detection events, decremented over time when unseen; hitting max triggers the fail/checkpoint-respawn path from Phase 1.
- **Laser barriers** — toggleable obstacles the player must disable or route around (a switch/terminal via the Phase 1 interaction system).
- **Boarding sequence** — reaching the train and interacting with the boarding control triggers the level-manager transition into Level 2, with the concept doc's described transition (doors close, station falls away, train starts moving).
- Level-specific lighting pass: warm, controlled, believable — per the concept doc's Level 1 visual identity table.

**Rubric tie-in:** Gameplay & Experience (clear theme, distinct fail state), 3D Effects (materials, lighting), Control & Playability.

**Note on "purpose in progression":** the concept doc is explicit that this level exists partly to teach the player that cameras/guards/machinery follow predictable cycles — because that predictability becomes meaningful once time manipulation lets the player exploit it in Level 2. Keep guard/camera cycles genuinely deterministic (not randomized) so that payoff exists later.

---

## Phase 3 — Level 2: The Moving Heist (build the time system here)

**Goal:** carriage-by-carriage traversal, and the time-manipulation system that the rest of the game depends on.

**Deliverables:**
- **Carriage environments** — extend the `Train`/`Carriage` hierarchy from the Alpha plan: Passenger → Security → Cargo → Mechanical → Vault, each with distinct interior geometry/props (still children of the same `Train` group, so the parent-child relationship you demonstrated at Alpha now has real content).
- **Time-manipulation core system**, built as its own module so Level 3 and the shaders can consume it rather than reimplementing it:
  - **Slow** — a per-object time-scale multiplier applied to that object's own animation/movement update, not global (guards/machinery slow, player doesn't).
  - **Freeze** — sets an object's time-scale to zero and flags it as a temporary platform/support if the design calls for it.
  - **Rewind** — records recent transform/state history per affected object and can restore an earlier snapshot (e.g. a collapsed bridge segment back to intact).
  - **Time Ghost** — records the player's own movement over a window, then replays it as a translucent mesh following that recorded path, capable of triggering a pressure plate/switch via the same interactable system.
  - A small resource/cooldown model gating how often abilities can be used (ties into the HUD in Phase 8).
- **Roof traversal set piece** — a carriage-to-carriage exterior route with wind/speed as a timing hazard, solvable using Slow Time, per the concept doc.
- **Vault break-in and Chrono Core pickup** — on pickup, fires the transition event into Level 3 (train begins destabilizing).

**Rubric tie-in:** Innovation (this is the concept's headline mechanic), Control & Playability (new tool, new way to fail), 3D Effects/Shaders groundwork (Phase 5 hooks into this system's per-object time-scale state).

---

## Phase 4 — Level 3: The Timewreck

**Goal:** survival/escape through environmental time hazards, reusing Level 2's assets per the concept doc's stated scope strategy.

**Deliverables:**
- Reuse carriage components from Phase 3 with changed lighting, damage decals/geometry, and particle effects — this is explicitly the concept doc's plan for keeping scope achievable, so don't model new carriages from scratch here.
- **Frozen carriage** — objects suspended mid-air (using the Freeze state from Phase 3's system) usable as platforms.
- **Fast-time carriage** — hazards running at extreme speed, where Slow Time (from Phase 3) becomes necessary rather than optional.
- **Time-loop carriage** — a scripted repeating cycle (door/object open-close-fall-rewind) the player must learn and time around.
- **Breaking train** — carriages visually disconnecting, thrown debris (this is where Phase 6's physics integration is exercised).
- **Final sequence** — Chrono Core depletion scripted event leaving only Freeze Time; a timed sprint sequence to the locomotive with time "catching up" behind the player; reaching the emergency brake (Phase 1's interaction system) ends the run with the concept doc's described stop-on-the-bridge cinematic beat.

**Rubric tie-in:** Gameplay & Experience (escalation, distinct challenge type from Levels 1–2), 3D Effects (particles, distortion), Trailer material (this level supplies several of the concept doc's suggested trailer beats).

---

## Phase 5 — Custom Shaders

**Goal:** the two shader concepts from the concept doc, marked separately from built-in 3D effects and requiring the team to be able to explain the code.

**Deliverables:**
- **Chrono Field / temporal-distortion shader** — custom vertex + fragment shader applied to objects currently under time manipulation (hook: Phase 3's per-object time-scale state feeds a uniform). A `uTime` uniform drives continuous animation; a game-state-derived `uIntensity` (or similar) uniform controls strength, so it visibly reacts to slow/freeze/rewind rather than being a static material. Scale intensity up between Level 2 (controlled) and Level 3 (unstable) per the concept doc.
- **Security laser/grid shader** — a moving-scan fragment shader for Level 1's laser barriers, changing behaviour (colour/speed) when disabled vs. when the alarm is triggered — driven by the same suspicion-system state from Phase 2.
- Every team member should be able to explain what each uniform/attribute/varying does and why — the brief states this is checked directly in the demo, and it's graded independently of the 3D Effects category.

**Rubric tie-in:** Shaders (10%, marked standalone).

---

## Phase 6 — Physics Integration

**Goal:** the physics-driven moments the concept doc calls for, without over-scoping a full physics-driven game.

**Deliverables:**
- Bring in a lightweight physics library (the brief explicitly permits any external library, credited in the credits screen) — pick one that's easy to sync one-way with Three.js meshes rather than building two-way authoritative physics for everything.
- Loose crates that can be pushed/knocked in Level 2's cargo carriage.
- Debris thrown/suspended in Level 3's breaking-train sequence, responding to impacts and the train's instability events from the level manager.
- Keep physics scoped to specific hazard objects, not full-scene rigid-body simulation — the brief's performance warnings (section 6.1) apply directly here, and an over-ambitious physics scope is a common way to blow the frame budget on lab hardware.

**Rubric tie-in:** Control & Playability ("does the game have a working physics model?"), 3D Effects.

---

## Phase 7 — Effects & Materials Pass

**Goal:** the visual-quality items from the 3D Effects rubric row that aren't tied to a single level.

**Deliverables:**
- Skybox (static is fine; dynamic if time allows) for exterior/tunnel moments in Levels 2–3.
- Particle systems: dust/ambient particles for the station, sparks/debris for the timewreck, and the shader-adjacent temporal distortion particles.
- Material pass distinguishing wood/metal/glass/carpet/machinery per the concept doc, using bump/normal maps where useful — the brief specifically credits textures "used for more than colour" as going beyond the baseline.
- Shadow strategy: shadow maps enabled deliberately and selectively (which lights cast, what resolution, constrained shadow camera bounds) rather than defaulted on everywhere — directly per the brief's performance section.
- Texture budget pass: power-of-two dimensions, compressed source images, nothing near 4096×4096 without a specific reason.

**Rubric tie-in:** 3D Effects (15%, the largest single technical category after Gameplay & Experience).

---

## Phase 8 — Polish, UI/UX, Audio, Performance

**Goal:** everything that turns "the mechanics work" into "the game feels good," plus the performance work the brief treats as mandatory, not optional.

**Deliverables:**
- **Full HUD**: objective text, suspicion meter (Level 1), time-ability availability/cooldown (Levels 2–3), replacing Phase 1's scaffold.
- **Menus**: main menu, pause, options (at minimum volume; a quality/graphics toggle is a cheap way to hedge against the "budget for the marking machine, not yours" warning).
- **Sound & music**: guard/alert stingers, ambient train loop, per-level music mood, time-ability SFX — the rubric explicitly lists sound/music under Gameplay & Experience.
- **Credits screen**, built incrementally rather than at the end: every external model, texture, sound, library, and adapted tutorial/code sample gets an entry the moment it's added to the project, with what it is, where it came from, and its licence. The brief is explicit that uncredited third-party work is treated as plagiarism — do not leave this to a pre-submission scramble.
- **Performance pass**, directly against brief section 6.1: profile with Chrome DevTools' Performance panel and a frame-rate counter (don't guess); confirm `.dispose()` is called on geometries/materials/textures during every level teardown (Phase 1's level manager is where this belongs); check draw call/triangle counts and merge/reuse geometries and materials where many small meshes are drawn separately; verify nothing allocates per-frame inside the render loop.
- Fix animation glitches and edge cases surfaced during playtesting across the full three-level run (memory climbing across a full playthrough is exactly the failure mode the brief warns markers will hit).

**Rubric tie-in:** Polish (10%), Gameplay & Experience (25%, largest category), and indirectly every other category since lag/bugs penalise across the board.

---

## Phase 9 — Innovation Pass (stretch, time-permitting)

**Goal:** the specific "makes it memorable" push the brief says is needed for the top band of Polish and Innovation.

Pick one or two of these rather than spreading effort thin — Innovation is only 10% and the brief is clear that assembling other people's assets, however well credited, "leaves little of your own to mark":

- Original Blender-modelled hero assets for the most visible objects (train exterior, Chrono Core, vault door) — the concept doc already flags these as the high-visibility custom-modelling targets.
- A working minimap (orthographic picture-in-picture) — explicitly called out under the Viewing rubric row as a way to reach the top band.
- Deeper sound design / adaptive music beyond baseline SFX.
- Cinematic camera work at key beats (boarding, vault opening, final brake) beyond what's needed for the trailer alone.

---

## Phase 10 — Deployment Discipline (ongoing, not a single step)

This isn't a one-time phase — it should happen continuously from Phase 1 onward, per the brief's own strongest recommendation ("deploy early and deploy often... a group that first uploads the night before the deadline is a group that discovers all of the above at the worst possible moment"):

- After every phase above, rebuild (`npm run build`), serve `dist/` locally over HTTP, and confirm parity with dev mode.
- Re-upload to the LAMP server at least weekly, not just at Beta and Final. Every re-upload, open the published URL in Chrome and check the console for 404s (the brief's most common deployment failure is an absolute path that only breaks once hosted in a subdirectory).
- Watch memory across a full three-level playthrough on the *published* build specifically — this is the scenario the brief says is exactly when undisposed resources catch up with a project.

---

## Phase 11 — Trailer & Devlog Production

**Trailer (needed by Beta, not just Final):**
- Max 2 minutes, uploaded to YouTube.
- Shot list drawn from the concept doc's own suggested cinematic moments: boarding, roof traversal, the freeze-time set piece, vault opening, train collapse, final brake sequence.
- Cut for pacing and clarity like a commercial trailer, not a raw gameplay capture — the top band explicitly rewards editing, pacing, and sound/narration.

**Devlog (Final submission only):**
- Behind-the-scenes explanation: how lighting/effects were handled, how gameplay mechanics were designed, and what the team's original contributions/innovations were.
- Good source material: screen-record short discussions during Phases 3 and 5 (time system, shaders) while decisions are fresh, rather than reconstructing rationale from memory at the end of term.

---

## Phase 12 — Final Submission Verification

Before the final upload, re-run the brief's own checklist (section 12) in full — not from memory:

- Three levels, each demonstrably distinct, playable start to finish
- Keyboard *and* mouse controls both functional
- At least one custom shader present, every member able to explain it
- Restart works without a page refresh
- Credits screen complete and accurate
- Production build uploaded (not source tree, not `node_modules`)
- Built game tested locally over HTTP before upload
- No absolute paths (`/...`) anywhere
- Asset filenames case-matched exactly
- `index.html` at the top level of the uploaded archive
- Published URL opened in Chrome, played through fully, console checked for 404s
- Frame rate acceptable and memory stable across a full three-level run on lab-equivalent hardware
- Trailer (already done at Beta) still linked and correct
- Devlog uploaded
- Every team member has submitted their individual contribution report on Moodle

---

## Suggested phase ordering vs. parallel work

Narratively the levels are sequential (1 → 2 → 3), but a 4–6 person team doesn't have to build them in that order in practice, once Phase 1's shared foundation exists:

- Phase 1 (foundation) should land first and alone — everything else depends on it.
- Phase 3's **time-system core** (not the full Level 2 environment, just the Slow/Freeze/Rewind/Time-Ghost module) is the other early-priority item, since Phases 4 and 5 both consume it.
- Once those two exist, Level 1 (Phase 2), the rest of Level 2 (Phase 3), and Level 3's hazard design (Phase 4) can reasonably be split across sub-teams working in parallel, since they touch mostly-separate carriages/environments and share the Phase 1 interaction/checkpoint/level-manager APIs as their common contract.
- Shaders (Phase 5) and Physics (Phase 6) are best owned by whoever is comfortable with that specific skill, and can start as soon as the systems they hook into (time-state, hazard objects) exist in stub form — they don't need to wait for full level content.
- Polish/Audio/Performance (Phase 8) and the credits screen specifically should be a running task from Phase 1 onward, not a phase that starts after everything else finishes.

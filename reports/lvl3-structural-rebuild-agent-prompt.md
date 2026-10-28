# Implementation prompt: rebuild Level 3 as a genuinely torn-open train

You are implementing a substantial Level 3 environmental rebuild in **Chrono Express**, a plain JavaScript / Three.js / Vite game with custom player collision/supports and existing Cannon integration.

The user wants **some L3 carriages genuinely half broken/open, matching the final cutscene's damaged carriages**, with the most convincing realism possible within this game's existing style and runtime. Complete the rebuild while preserving existing gameplay. Do not merely add fragments, cracked windows, glowing trim or more props to an intact corridor.

## Read first and preserve the starting work

- Workspace: `C:\Users\hpars\OneDrive\Documents\GitHub\CGV-Project`.
- Intended current branch: `lvl3-visual-refresh`. Confirm status and branch before editing.
- Read `reports/lvl3-structural-rebuild-analysis.md` in full and inspect `reports/lvl3-structural-rebuild-reference.png`.
- HEAD when the analysis was written was `169f9dfa67ef958989b365deb94740c7301876c0`, with substantial **uncommitted** visual/motion fixes. Preserve them, including untracked `src/environment/wreck-geometry.js` and `tests/timewreck-visuals.test.js`. Do not reset, clean, overwrite, stash away or replace the user's work. HEAD alone is not the implementation baseline.
- Follow applicable repository/skill instructions. Reconcile old reports with current source; their historical approval/batch statements are not new task scope.

Work through discovery, implementation, rendering, regression checks and iteration. Make routine reversible decisions yourself. The one-car pilot below is a validation step; do not stop there and ask permission to continue already authorised work. Do not commit, push or publish unless separately requested.

## Reference and intended result

Inspect these source modules directly:

- `src/environment/ending-train.js`
- `src/shaders/ending-time-damage.js`
- `src/environment/ending-debris.js`
- `src/environment/ending-gorge.js`

The ending has large connected side/roof openings, intact end sections, exposed floor and internal ribs/furniture, attached torn metal, local ageing and a restrained blue temporal rim. Openings are approximately 8–8.8 m long on 20 m cinematic cars. The saved reference is a diagnostic render of that existing model, with simple lighting, not the complete cutscene.

The `ending-plate*.jpg` assets are landscape backgrounds; the train is 3D. Do not copy a fixed-camera landscape plate into freely moving gameplay. Do not replace L3 with the cinematic train: dimensions, number of cars, coordinate systems, floor heights and gameplay requirements differ. Preserve the ending itself and its shots, actor choreography, train alignment and assets.

Make Cargo and Security the primary half-open hero cars. Alternate shelter and exposure elsewhere, with asymmetry and a believable structural cause. A half-open car retains floor/chassis and selected frame members while a substantial side/roof section is absent. Do not remove half of every car, mirror identical tears everywhere, or make a dense cage of ribs that visually fills the opening.

## Establish the baseline and protected spaces

Inspect current implementations and callers before modifying them:

- Shell/layout/dressing: `src/environment/carriages.js`, `carriage-bounds.js`, `wreck-landmarks.js`, `cargo-wreck-benchmark.js`, `luxury-seats.js`, `textures.js`.
- L3 composition: `src/levels/timewreck.js` and every `timewreck-*` helper, especially routes, spatial, connector, Cargo, Security, expansion hazards, flying panels, atmosphere and feedback.
- Exterior/sky: `outdoor-environment.js`, `timewreck-exterior.js`, `moonlit-valley.js`, `sky-dome.js`, `sky-environment.js`.
- Movement/camera: `src/entities/player.js`, `src/core/collision.js`, `near-raycast.js`, camera modules and interaction blockers.
- Visibility/map/render/lifecycle: `wreck-visibility.js`, `src/ui/minimap*.js`, `src/core/light-pool.js`, renderer/postprocessing, dispose, level-manager, time-system, respawn and audio systems.

Record screenshots from each start before changes. Document shell dimensions, spans, hazards' swept volumes, safe pads, required views/interaction rays, camera/standing/crouch/jump clearance and ownership. Record reproducible frame-time/GPU/CPU/resource information where available. Preserve current uncommitted changes in this baseline.

The escape order is **Vault → Convergence → Mechanical → Cargo → Relay → Security → Passenger → cab**, travelling in **decreasing world Z**. L3 shell half-width is **2.6 m**, ceiling **3.5 m**, and current player bounds are about **±2.3 m**. Existing car lengths are 18/40/30/28/18/20/20/8 m in that escape order. Treat these as compatibility constraints.

## Carriage art and gameplay requirements

Use the analysis table as the starting art plan; adapt exact tear contours from rendered views while protecting gameplay:

1. **Vault:** restrained upper-side/roof containment rupture, roughly 15–25% of one side. Keep the two laser racks, observation pads, left route around the right-side containment obstruction, debris approaches and spawn safe/readable.
2. **Convergence:** expose the direct lane with a larger side/roof peel, roughly 30–40%, while retaining the right sheltered route. Preserve the partition near X=0.85, maintenance lane X≈0.92–2.6, low roof underside≈1.34 m, shutter, threshold, trolley weave, electrical surges, and the buckling inter-car connector. Do not make the low roof visually vanish while its crouch requirement remains.
3. **Mechanical:** roughly 25–35% side/upper shell loss with credible retained machinery/steam attachments. Preserve moving trunk banks and their full sweeps, shutter, repair/Freeze sequence, switching recess at X=1.75, steam and checkpoint.
4. **Cargo:** roughly 40–50% of one side torn through its adjacent roof. Protect the hinged gangway, exact floor cut, mating stops, loop door/load, freight pendulum and anchor/sweep, safe waiting/recharge areas and folded-rack landmark. Remove decorative remnants that accidentally bridge the gap.
5. **Relay:** a more sheltered beat with an offset opening around 20–30%. Preserve Ghost pad/occupancy, linkage, blast door, far-side permanent catch, cabinet bypass and observation/recharge spaces. All relevant mechanisms must remain readable from their actual approaches.
6. **Security:** roughly 45–55% of one side exposed with connected roof loss. Preserve both true floor holes, five decks, their exact supports/top surfaces, central safe island, directional/jump marks, checkpoints and recovery. New structure must not offer an alternate bridge or obscure the landing.
7. **Passenger:** roughly 35–45% asymmetric side/roof loss. Preserve the left falling rack/right avoidance lane, seats/weave, collapse floor/pads, final depletion trigger, chasing wave, warning cues and forward view. Use the opening to show breakup behind without crowding the sprint.
8. **Cab:** mostly intact with a limited opening around 10–20%. Clearly frame the emergency brake while preserving its name, interaction/range, lever, final Freeze and transition to Ending.

The percentages describe proposed affected lengths of one side, not whole-car/floor area requirements. The rendered silhouette and protected gameplay take priority.

## Build real openings with a small L3-specific design

Currently `addBlownViewports()` builds continuous upper/lower wall bands and complete repeated panes, and `buildShell()` retains a complete ceiling. The storm-window material is opaque. Merely omitting the original wall box does not make an open carriage.

Implement a compact authored damage profile per carriage that coordinates missing side/roof regions, surviving frames/arches, cut edges and removed fixtures. Keep the intact/L2 branch unchanged. Avoid a general destruction engine, runtime CSG, engine migration or a wholesale rewrite of the large L3 controller.

Generate actual missing wall and roof geometry. Clip/segment corresponding outer skin, inner lining, glass, trims, rails, piers, roof bands, lamps, cables and props against the same opening. No pane or invisible lining may span an open section. Retain appropriate structure and attachment points, with local thickness and plausible cut faces. Keep solid floor meshes and their required names/geometry contracts available to existing floor-cut helpers.

Use large folds, medium exposed structural members and sparse small splinters. Keep bent sheet metal attached where appropriate. Retain the palette of painted green/teal steel, warm timber, brass and burgundy upholstery, using existing material/texture capabilities. Localise corrosion, exposed substrate, soot and wetness; use consistent texture scale and avoid uniform bright rust, plastic wood or neon outlining every edge.

Do not blindly reuse the ending's fragment-discard shader. GPU holes do not automatically become holes for CPU camera/interaction rays, occlusion bounds, collision or shadows. The ending also darkens back faces, which may be wrong from inside playable cars. Prefer geometric openings; any optional shader embellishment must have matching depth/shadow behaviour and explicit CPU-side treatment.

## Preserve collision and time behaviour

Keep current bounds, obstacle footprints, support heights, floor cuts, triggers, clocks, checkpoints, ability rules, energy and encounter windows. No new usable side exits, rooftop traversal, floor holes or accidental bypasses. Retain a convincing guarded chassis edge where the existing movement boundary remains; do not expose a tempting unguarded new drop and leave an invisible wall there. Designing new side-fall mechanics is outside this rebuild's default scope.

No decorative tear, beam, fixture or debris may intrude into standing/crouch/jump clearance, moving hazard sweeps, essential interaction rays or the camera path. Keep harmless decoration flagged appropriately; physical geometry must match its collision role. Never enlarge invisible hitboxes to hide art mistakes.

Preserve maximum energy 100, normal recharge 15/s, Slow/Freeze/Rewind drains 18/28/32 per second, Ghost cost 35 plus 1.5/s, checkpoint recovery floor 50, current Ghost occupancy/lifetime and disabled L3 strain. Preserve actual sprint 6.8 m/s, final wave 6.2 m/s and 12 m lead, depletion and brake timings. Do not retune mechanics to compensate for new clutter or poor visibility.

Retain the recent atmosphere-clock, Freeze-pose hold, reversible decorative motion and light-pool delta fixes. Use existing scaled-time/snapshot contracts for motion; do not introduce fresh wall-clock animation that jumps through Freeze/Rewind. Permanent art damage should normally be static. Any new interactive break/repair requires real registration, history, collision and reset coverage.

## Exterior, lighting and sound are part of the rebuild

Openings must reveal coherent sky, landscape, depth and train understructure. L3 currently captures/disposes a Timewreck sky for reflections without adding a visible dome, and uses legacy MEDIUM moving scenery rather than the optional moonlit-valley path. Inspect these systems before choosing the least expensive coherent L3-only combination. No visible black void, scenery crossing the hull, endlessly bright flat window texture or fixed-camera background distortion.

Match moon/storm direction, visible sky, fog and reflection environment. Use cool outside light on fractures and warm surviving practical lights inside. Retained roof sections should still read as shelter. Keep floor/landing/hazard faces readable at normal brightness; avoid solving everything through exposure or emissive surfaces. Use contact/material occlusion and restrained fill before adding costly shadow coverage. Profile any tightly bounded hero-region shadow solution; do not add shadowed lights per fracture or whole-train high-resolution shadows.

Keep the 12-point L3 light pool unless measured evidence justifies a scoped change. Relocate/remove fixture sources with their geometry; build the pool after sources exist, refresh with delta, and preserve hazard/stasis/brake cues. Do not let lamp atmosphere animate gameplay lights inadvertently. Narrow temporal fracture glows are secondary to geometry and must not imply new walkable/support surfaces.

Audit legacy close-flyer/streak offsets in `timewreck-exterior.js` against the ±2.6 shell. Distinguish under-floor track cues from exterior fragments and intentional lethal in-car panels. Use existing master/mute/pause-aware audio for restrained exposure wind/creaks, maintaining warning clarity and bounded voices. No per-frame reflection capture, heavy transmissive glass, default volumetric effects or additional global post stack.

## Camera, map, visibility, breakup and ownership

Inventory carriage-owned versus root-owned objects. New static shell components should follow their carriage. Many existing hazards/spatial visuals use root/world coordinates and snapshots; reparenting them casually will break their motion/collision. Once sections are inaccessible, safely retire or transfer their visual counterparts so no machinery, fixtures or floor fragments float beside departing cars. Preserve checkpoint/restart restoration.

Audit the current breakup list: Vault, Mechanical, Cargo and Security detach; Convergence and Relay are not explicitly in it. Resolve exposed visual inconsistencies deliberately without changing accessible gameplay or silently inventing a new destruction sequence. Do not blindly detach every registered object.

`wreck-visibility.js` must only use truly solid retained panels as occluders. Torn or shader-cut surfaces cannot keep full solid-box occlusion. Confirm views through openings, exterior camera positions, rotations, breakup and restored minimap visibility. Keep L2's separate culling unchanged.

Keep real holes open to camera and interaction raycasts. Retain L3 camera clearance hysteresis and decorative ancestor flags, while solid roof/posts still protect against clipping. Test both views, crouch modes, jumping, narrow routes, view switching, respawn and interaction aiming.

The minimap currently synthesises side walls through `listCarriageWallBoxes()` independently of visual geometry. Reflect destroyed walls accurately while distinguishing remaining gameplay boundaries and preserving actual floor holes/supports. Keep the minimap inexpensive and do not accidentally make decorative fragments appear as safe floor.

## Performance constraints

There is no healthy performance baseline to spend freely. Earlier headless Iris Xe captures were approximately 11 FPS; a short paused 1280×720 fixed-100% comparison averaged 91.4 ms without smoothing and 90.2 ms with it. These are limited diagnostics, not a full hardware profile or proof of GPU attribution. Re-measure on the current dirty source, consistent settings and representative views.

Opening walls can expose more scenery/other cars despite reducing shell triangles. Measure CPU update, scene traversal/submission, GPU scene/shadow/post, minimap, overdraw, draw calls, triangles, texture/resource counts, shader warmup and frame-time tails. Compare before/after like for like; separate loading/compilation from steady play. Report limitations honestly and do not claim smoother FPS from tests or a reduced mesh census.

Batch static structure per material **within each carriage**; instance repeated members and share owned resources appropriately. Bound texture sizes and scenery complexity/LOD. Avoid one merged whole-train mesh, many transparent layers, unnecessary double-sided surfaces, physics bodies per decorative chip, broad per-frame allocations or synchronous rebuilding. Preserve the current AA/quality controls unless a measured scoped fix is needed. Target no regression first, improve demonstrated costs, and state any remaining failure to achieve usable frame pacing.

## Execute and validate through completion

1. Baseline and protected-space/ownership inventory.
2. One complete Cargo hero section: real side-to-roof cut, capped edges, retained structure, fixture removal, readable puzzle and coherent exterior. Render from inside/outside/above before propagating the approach.
3. Apply the distinct profiles to all remaining cars with the stated shelter/exposure rhythm. Complete all affected surfaces and fixture dependencies.
4. Integrate lighting/materials/exterior/audio, raycasts, minimap, occlusion, breakup and reset ownership.
5. Run regressions, render representative states, profile and iterate until the authorised rebuild is complete. Document any true external blocker and finish independent work.

Run `npm.cmd test`, `npm.cmd run build`, `node scripts/check-production.mjs` and `git diff --check`. Include existing connector, Cargo, Relay, Security, expansion/spatial, debris/flying-panels, feedback, escape, visibility, camera, minimap, ending and lifecycle tests. Add focused tests for cut-through geometry/open-ray behaviour, protected clearances, unsafe occluder rejection, ownership/reset and disposal where the implementation introduces real logic. Keep L2 parity checks.

Required rendered coverage: every carriage's approach and primary challenge in first/third person; clear Cargo/Security side-to-roof openings; sheltered Convergence low route; moving/held/restored hazards; safe islands/pads; rearward breakup; brake into Ending; different viewport/aspect and quality tiers. Test new game, checkpoint retry, restart/quit, pause/resume, power transitions, Ghost expiry/cancellation and repeated L3→Ending transitions. A deterministic traversal test supports but does not replace a real browser playthrough.

Done means that Cargo/Security unmistakably look structurally open from normal gameplay views, all other cars have deliberate compatible damage, holes pass through every relevant surface, no assets float in empty space, the existing route/puzzles remain viable, cameras/map/occlusion agree with the scene, L2/Ending are preserved, and rendered/performance/resource evidence is reported. Do not call the rebuild complete solely because Node tests pass.

Deliver the implementation, before/after screenshots, concise change/risk summary, test/build/packaging results, source/settings/hardware-specific performance comparisons, and a clear statement of any checks that could not be performed. Do not promise photorealism or hide remaining low FPS.

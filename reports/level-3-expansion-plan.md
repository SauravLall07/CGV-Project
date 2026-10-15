# Level 3 expansion: N0-N9

Persistent design, implementation scope, and handover. Created 2026-10-15
(Africa/Johannesburg). Read this file and relevant current source before each
batch. No conversation history is required.

## Authorization and current state

Latest instruction (2026-10-15): implement **N6 and N7 only**. Starting HEAD
`2cb5d5e`, clean working tree. Both batches are implemented and automatically
checked; rendered acceptance remains pending. N1 is still NOT STARTED. N2-N5
are preserved; N8/N9 have not been started. See the N6/N7 handover and latest
exact next-batch prompt at the end.

Historical N4/N5 instruction (2026-10-15): implement **N4 and N5 only**. This batch is
implemented and automatically checked; rendered acceptance remains pending.
Starting HEAD `95f1128`, clean working tree. N1 remains NOT STARTED. Preserve
N2/N3 and all older completed work. N6-N9 are not authorized in this batch.
See the N4/N5 handover and latest exact next-batch prompt at the end.

Historical N2/N3 instruction (2026-10-15): implement **N2 and N3 only**. N1 is absent from
this checkout and remains NOT STARTED; the explicit request permits these two
encounters to proceed using the current material vocabulary, without doing N1
or starting N4. Starting working tree: only this N0 plan was untracked. Preserve it.
N2 uses Cargo centre -7 with checkpoint -4.2, warning 0.8 s and period 4.4 s.
N3 uses Mechanical +11, cycle 5 s (warning 1.6..2.35, live 2.35..3.65), safe
approach +13 and recovery +9. Existing collision/supports and old hazards remain.
Final validation/results are recorded in the N2/N3 handover below.

Historical N0 authorization was **N0 only**: inspect the existing game and handovers and save
the complete expansion design. No gameplay, rendering, audio, camera, test,
dependency, or configuration changes were part of N0. Subsequent explicit batch requests
supersede that historical scope only for the named batches. Implement only the
batch requested by the user, verify it, update this file, and stop.

N0 started at HEAD `a3cac97` with a clean working tree. Repository search found
no AGENTS.md. Existing implementation and both older plans are preserved.
Game Studio routes this existing plain JavaScript/Three.js/Vite project to its
Three.js workflow; its starter defaults do not justify a stack migration.

The preceding upgrade plan records Batches 1-5 implemented and Batch 6 automated
integration complete, with browser-dependent acceptance outstanding. The refinement
plan records R1-R6 implemented with automated/static checks, and R7 not started.
Read their latest results rather than treating earlier historical stop statements
as the current state. This N-series is a new expansion, not a renaming or repetition
of those batches. N9 carries their unresolved acceptance work forward; it must
explicitly reconcile the older ledgers after actual verification.

## Experience and scope

Make a recognisable luxury train feel progressively torn apart by time. Retain
wood, brass, teal panels, burgundy upholstery and strapped leather luggage beneath
the damage. Give each carriage one large recognisable destruction composition,
clear traversal choices, and a different movement rhythm. Larger authored forms
matter more than a uniform scatter of tiny fragments or brighter glow.

Route, travelling toward decreasing world Z:

`Vault -> Convergence -> Mechanical -> Cargo -> Relay -> Security -> Passenger -> cab`

Rhythm: observe -> choose -> execute -> recover. Pressure is local until the
Passenger chase. No whole-level countdown, combat, new abilities, ability targeting,
roof route, new level, engine migration, or unrelated architectural rewrite.
Preserve the existing play-session structure; record measured completion/retry
times during playtests rather than promising an unmeasured duration.

The complete new scope is: larger carriage-specific destruction; service trolley,
seat backs, crate silhouettes, a crouch beam and low jump threshold; swinging Cargo
freight; a Mechanical pressure assembly/steam crossing; physically distinct existing
Convergence branches; a Vault containment obstruction; a Relay equipment detour;
a Security island obstruction; a Passenger seat weave; one buckling inter-car
connector; linked repair fragments and stronger time-state feedback; staged
background destruction; and full production integration.

## Existing implementation and source map

| Area | Already present: preserve and build upon | Primary files |
| --- | --- | --- |
| Composition/lifecycle | L3 hazard clocks, rolling checkpoints, supports/voids, fracture/breakup, finale and conservative visibility hooks | `src/levels/timewreck.js` |
| Vault | Two phased laser racks at centre -1.2/-4.6; observation marks at +0.8/-2.9; shape-and-colour clearance lamps, empty containment crown | `timewreck.js`, `src/environment/wreck-landmarks.js` |
| Convergence | One direct surge at +4; partition X 0.78..0.92, Z -1..+9; maintenance corridor X 0.92..2.6, low ceiling Z 0..+8; repairable shutter at +4; approach signs | `src/levels/timewreck-routes.js`, `timewreck.js` |
| Mechanical | Sweeping luggage banks at +7/-6/-10; shutter at 0; safe right-side recess X 1.75, Z +2.7; damaged service header/lanterns | `timewreck.js`, `timewreck-routes.js`, `src/environment/mechanical-reference.js` |
| Cargo | Real opening Z +3.8..+8.6; 1.6 m gangway, retained repair history, hinge marks; landing +3.15; loop door +2 and existing dropping load -2 | `src/levels/timewreck-cargo.js`, `timewreck.js` |
| Relay | Release pad 4.6 m before door at centre -2.6, eight-second stationary Ghost hold, catch 1.8 m beyond door, linkage and actual expiry bars | `timewreck.js`, `src/levels/timewreck-relay-feedback.js` |
| Security | Real openings +1.4..+6.8 and -6.8..-1.4; broad offset decks, modest jump, full-width permanent island -1.4..+1.4; moving steering/jump marks | `src/levels/timewreck-security.js`, `timewreck.js` |
| Passenger/cab | Falling rack at +5.8, right-then-centre guidance, opening -3..+1.4, depletion/chase, timed stasis, brake, broken bridge/locomotive, skippable reveal | `timewreck.js`, `timewreck-routes.js`, `src/environment/passenger-guidance.js`, `src/cameras/wreck-stop-shot.js` |
| Environment | Damaged-only luxury dressing, open hull sides, small shake, moving fixtures, floating debris, exterior fragments | `src/environment/carriages.js`, `carriage-bounds.js`, `carriage-interior.js`, `wreck-landmarks.js`, `timewreck-exterior.js`, `src/levels/timewreck-atmosphere.js` |
| Time/player/reset | Shared time registration/snapshots, Ghost, custom box collision, rectangular support tops and voids; level restore precedes history reset | `src/systems/time-system.js`, `src/entities/player.js`, `src/systems/respawn.js` |
| Audio/presentation | L3 warning/rumble/stasis hush/brake/settle audio; master/mute routing and presentation-pause hook | `src/systems/wreck-audio.js`, `src/core/audio.js`, `level-manager.js`, `src/main.js` |
| Visibility/diagnostics | Live solid-bulkhead occlusion, pooled lights, overlay, frame metrics, benchmark, optional GPU timer | `src/environment/wreck-visibility.js`, `src/dev/{render-overlay,frame-metrics,benchmark,gpu-timer}.js` |
| Regression coverage | Cargo/Relay/Security/escape traversal, alternate solutions, multi-rate retries, cameras, disposal, manager lifecycle, visibility/audio graphs | `tests/timewreck-*.test.js`, `tests/wreck-*.test.js`, `test/*.test.mjs` |

Filenames shortened in this table refer to the directories already identified.
Use `rg` to locate live integration points before editing; line numbers will move.
The Level 2 reference is `src/levels/moving-heist.js`. Shared builders must retain
their intact/Level 2 path; prefer L3-owned modules and damaged-only configuration.

## Coordinates, invariants, and feasibility rules

- All placements below use **local Z relative to the named carriage centre**;
  world Z = `spans[key].center + offset`. X is world lateral, not screen left/right.
  The shell is X -2.6..+2.6. Current lengths: Vault 18, Convergence 40,
  Mechanical 30, Cargo 28, Relay 18, Security 20, Passenger 20, cab 8 metres.
  Derive spans from `carriage-bounds.js`, never duplicate absolute world positions.
- Placements and new timings are proposals, not tested fits. Before implementing
  each batch, overlay its bounds with hazards, supports, camera volume and spawn
  points. Record final accepted bounds here. Resolve routine overlap by moving or
  reducing the new prop, preserving the original puzzle's safe areas.
- Keep JavaScript, Three.js, Vite, Cannon-es decorative physics, and the custom
  player support/collision model. No TypeScript, Rapier or rendering rewrite.
- Movement is 4 m/s, sprint 6.8 m/s, crouch multiplier 0.42; collision radius
  0.18 m. Jump speed 6.4 and gravity 18 are current inputs, not permission to
  tune movement. Test real movement; do not infer jump reach from speed alone.
- Energy: max 100, checkpoint floor 50, recharge 15/s in Normal **only when Ghost
  is inactive**. Slow drain 18/s at 0.2x, Freeze 28/s, Rewind 32/s; Ghost costs
  35 plus 1.5/s while active. Ghost prevents normal recharge and consumes real
  time even during Freeze. Retain L3's disabled strain. Full-energy Freeze lasts
  about 3.57 s; at 50 energy about 1.79 s before any other costs.
- Slow/Freeze/Rewind are one shared mode over registered objects. Sequential
  combinations need safe switching/recharge floor. Ghost is separate. Do not
  demand simultaneously freezing one object and rewinding another.
- Preserve existing power costs, history behaviour, player parameters, wave
  6.2 m/s and initial lead 12 m, 2.5 s braking and 4.8 s reveal. If playtests show
  an addition unworkable, adjust the addition first. Any later proposed baseline
  tuning needs evidence and an explicit recorded scope decision.
- Freeze holds the actual pose: dangerous poses remain dangerous. Rewind restores
  registered state and immediately reapplies visible geometry and collision.
  One-shot failures use retained/selective history like Cargo and shutters;
  long idle waits must not erase the earlier repairable state.
- Existing L3 shell dressing does not automatically become gameplay collision.
  Add explicit level-owned boxes for new obstructions. XZ boxes alone cannot
  describe jumping over or crouching under a prop: enable collision from actual
  body height/pose, or add a narrowly scoped L3 helper. Do not globally change L2
  collision semantics. Avoid a large conservative box around a diagonal trolley
  that closes the passage visibly left open at its end.
- Solid props cannot bridge floor holes visually unless they are real authored
  supports. Split floor meshes AND runners/edge strips when cutting an opening;
  update voids and all support-array rebuilding paths, including checkpoint reset.
  No invisible floor, wall-side bypass, unsupported painted path or false landing.
- Keep a generous traversable lane (initial target >=1.0 m clear width, wider at
  turns), broad landings and readable corners. Exact camera/body clearances require
  both views. No tiny precision platforms or mandatory sprint-crouch combinations.
- Preserve safe spawn X=0 wherever possible, particularly Security's island.
  Any necessary checkpoint relocation must be batch-local, grounded, safe from
  the entire hazard sweep, and tested before/after repair. Never save airborne.
- Reset order: respawn moves player, invokes level restore, resets time histories,
  then snaps camera. New geometry/supports/clock state must be correct inside
  restore, not one frame later. Preserve Relay latch progress as appropriate.
- Teardown unregisters objects/interactions/pads; removes owned collision/void/
  support entries; disconnects audio; disposes owned resources once. Preserve
  shared materials until their owner disposes them. No wall-clock gameplay timers.

## Visual, asset, UI and performance direction

Early rooms retain more warm practical light and intact luxury forms. Mechanical
shows concentrated mechanical damage; Cargo heavy freight failure; Security a
large exposed crossing; Passenger escalating collapse and a clear cab destination.
Existing hull sides are already open: create convincing torn framing and landscape
views rather than claiming a new hole where an opening already exists.

Use directional splintering, bent brass, snapped straps and visibly attached
suspension points. Balance large static silhouettes against existing moving
hazards. Warm practicals/cold exterior, amber mechanical warning, restrained cyan
time cues, violet reserved for major temporal instability. Pair colour with shape,
motion or sound. Keep the player and safe surfaces readable during Freeze.

Reuse procedural geometry/materials and existing assets first. Merge compatible
static pieces per carriage/material; instance repeated fragments. Moving or
time-registered pieces stay separate. External models/textures require licence and
budget checks; no new asset dependency is assumed. No new dynamic lights, shadow
casters or full-screen passes by default; L3 already pools 12 point lights (L2 8).
These are starting constraints, not a promise that expanded geometry is free.

Keep the current compact DOM HUD. Use short, binding-aware contextual prompts,
physical route marks and warnings; no new permanent panel or centre-screen manual.
New audio uses existing master/mute/pause ownership; avoid uncontrolled concurrent
warning loops. New particles are bounded/reused, with no per-frame geometry or
material allocation and restrained transparent screen coverage.

At each implementation batch record delta meshes, triangles, materials, textures,
source lights, shadow casters, time registrations and audio voices. Compare the
same camera poses/settings and a moving run when rendering is available. Static
counts/disposal calls are evidence of structure, not FPS, GPU memory or leak proof.

## Batches and acceptance

### N0 - Complete design and handover

Status: COMPLETE for planning only. Dependencies: existing checkout and handovers.
Deliverable: this file, current-source reconciliation, proposed placements,
dependencies, acceptance ledger and exact N1 prompt. No gameplay code changes.
Validation: inspect document coverage, links/paths, batch numbering and diff scope;
do not rerun the gameplay suite for a Markdown-only addition.

### N1 - Cargo visual benchmark

Status: NOT STARTED. Depends on N0. Establish the new art scale in Cargo before
propagating it; Mechanical's R2 treatment remains an unrendered candidate reference.

**Placement/action:** large folded luggage framing above/by the existing gangway
(+3.8..+8.6), a static freight stack/splintered crate composition by a wall on the
downstream solid floor (-4..-5.5), and torn straps/lining drawn toward the rupture.
Keep entry +12.5, repair approach, landing +3.15, loop door +2/load -2 and exit
-12.5 fully functional. Reserve the downstream -7 moving-hazard footprint for N2.
The player continues the existing repair/hold/recharge/loop sequence unchanged.

**Abilities/reset/collision:** N1 creates decorative static geometry only; no
moving freight, blocker, trigger, timing, support, checkpoint or floor changes.
Do not place decoration in the traversable envelope and then hide its collision.
Mount pieces to the correct carriage so existing shake/detachment/reset follows.
No new repair cue on an object that is not repairable.

**Look/budget/files:** one substantial brass/wood/leather landmark with visible
cause, intact luxury context and a strong view of the real gap. Reuse damaged-only
builders, `wreck-landmarks.js` or a new L3-only dressing helper; preserve L2.
Prefer a few merged material batches, no new lights/shadows/post. Capture resource
delta and verify disposal through existing ownership.

**Acceptance:** geometry clear of gangway, all poses of loop load/door, hinge
marks and spawn; no visual floor across the gap; no new camera occlusion from
unplayable foreground clutter; Cargo regressions/build pass. Capture entry,
restored/broken deck, landing and exit in both views/Normal/Freeze with identical
settings. If unavailable, mark art as implemented candidate, not visually approved.
Do not spread this art treatment in N1 or begin N2's moving hazard.

### N2 - Swinging Cargo freight load

Status: IMPLEMENTED; automated traversal, lifecycle and build checks passed.
Rendered, audible, human-difficulty and runtime performance acceptance PENDING.
N1 implementation is absent: the explicit N2/N3-only request overrides the original
ordering dependency for this work. N1 visual benchmark review remains outstanding.

**Placement/action:** one suspended strapped trunk/freight pallet centred around
Cargo -7 on solid floor, after the existing loop load at -2 and before exit -12.5.
Stage observation/recharge around -4.5 and a safe landing around -10.5. Map actual
swept bounds before accepting these offsets. This deliberately revises the original
"before the gangway" suggestion: Cargo's entry/trigger is +12.5/+12.8 and the gap
starts at +8.6, leaving little independent staging room. Do not cram another sweep
into that repair approach or duplicate the existing vertical dropping load.

Wait for the lateral swing to clear, Slow it, or Freeze a visibly clear pose and
walk through. Creaking straps/anchor motion warn before movement; fixed floor
brackets identify the sweep. Freeze with the load blocking the route stays blocked.

**Simulation/collision:** deterministic analytic pendulum clock, registered with
shared time; snapshot phase and derive mesh/body volumes from the same pose.
Use body-height overlap and conservative small component volumes for an angled
load; check swept motion/substeps against frame spikes. No random Cannon body as
a mandatory hazard, no climbable moving support, no invisible full-aisle blocker.
Body contact uses the existing recoverable failure path, with one failure per hit;
no new health/damage/push system. There is no mandatory hazard-freeze-only solution.

**Reset:** add a grounded pre-swing local checkpoint on verified floor if existing
Cargo entry would replay too much; never overwrite it from within the sweep.
Existing exit checkpoint remains after the obstacle. Restore safe deterministic
phase, visual pose, collision and energy-floor recoverability before history reset.
Rewind restores phase normally; repair history of the upstream gangway is untouched.

**Budget/acceptance:** reuse trunk vocabulary; ropes/anchor are visibly connected,
bounded warning sound, no added light or unbounded trail. Test real movement and
wait/Slow/Freeze/Rewind at 30/60/144 FPS and mixed frame steps; zero/50 energy,
standing/crouched/jumping overlap, three retries, restart/quit/disposal. Demonstrate
safe recharge on both sides, no unavoidable spawn hit or wall bypass. Render
suspension/collision alignment and both-camera sightlines; listen for warning mix.

### N3 - Mechanical pressure assembly and steam crossing

Status: IMPLEMENTED; automated traversal, lifecycle, audio-graph and build checks
passed. Rendered/audible/human/performance acceptance PENDING. Completed with N2
under the combined request, using existing materials because N1 is not implemented.

**Placement/action:** ruptured wall-mounted brass pressure assembly and a short
cross-aisle vent slice near Mechanical +11, between entry +13.5 and first luggage
bank +7. Safe observation near +13 and recovery near +9; preserve the +2.7 recess,
shutter at 0, and banks -6/-10. Confirm vent reach leaves both staging patches safe.
Rattle/light pre-vent -> clear visible jet -> quiet gap. Player waits or Slows;
Freeze during a clear interval holds clearance. No safe-looking frozen active jet.

**Abilities/collision/reset:** one shared-time deterministic cycle; jet extent,
danger predicate, gauge/valve and particle state derive from its phase. Rewind
reverses the cycle, not permanently repairs the pipe. Use a small authored body
volume matching the jet, existing recoverable failure, and no opaque particle wall.
Ghost has no special role. Entry checkpoint resets to a safe pre-warning phase;
keep enough floor to recharge before facing luggage. No checkpoint inside the jet.

**Budget/acceptance:** static merged assembly plus bounded reused steam particles
and shared-audio hiss/warning; no new point lights or full-screen fog. Test phase
boundaries, frozen dangerous/clear states, rewind, body height, depletion and
multi-rate real traversal with the original luggage/shutter sequence. Repeat
resets/pause/restart/quit; verify audio ownership. Capture jet visibility and camera
clarity in both views, and prove safe spots before/after all new danger.

### N4 - Vault and Convergence destruction/traversal

Status: IMPLEMENTED; automated/static verification passed, rendered/human acceptance
pending. See N4/N5 handover. N1 remains an unverified, unimplemented benchmark.

**Vault:** enlarge the broken containment composition around the existing empty
crown, with fractured plinth and a broken floor-mounted arm near -2.1 between
racks -1.2/-4.6. The arm occupies one lateral side (candidate X +0.8..+2.2) and
forces a visible lane change, not a jump or extra timed kill zone. Keep centre
observation pad -2.9 and entry pad +0.8 safe, plus both laser approach sightlines.
Shift the new arm if its footprint intersects laser body slices or their safe
turning space. Scattered valuables remain decorative until N8's linked motion.

**Convergence:** diagonal overturned trolley/collapsed arch frames the fork entry
near +10.5..+12, leaving both existing branch entrances readable and reachable.
Add a low broken threshold on solid approach floor near +14 for one modest jump;
use actual height-sensitive collision, visible support if its top is standable,
and generous takeoff/landing space. Incorporate a visibly bent crouch beam into
the existing maintenance low-ceiling language near +7, rather than adding another
hidden crouch rule. The direct branch weaves past trolley wreckage before its
existing surge; maintenance retains its slower sheltered crouch/repair route.
No third branch, new surge, or second shutter; rejoin remains near -1.

**Abilities/reset/collision:** additions are static, unaffected by powers;
existing laser/surge/shutter modes and alternate solutions remain. Use a few
component boxes for trolley, not a huge enclosing diagonal AABB. Guard standing
and crouch clearance including hold/toggle crouch and jump-to-stand behaviour.
Keep +11/-3 fork checkpoints clear; if threshold recovery needs a checkpoint,
place on safe approach floor and document it. Static props persist across death;
existing temporal hazard reset/history remains intact.

**Budget/acceptance:** merge containment/arch debris per material and carriage.
Test both branches using real movement, safe pads, laser alternatives and original
repair histories. Check jump/land/retry and no camera snag/collision beyond visible
prop. Render both approach choices, reassessment pad and frozen lasers; first-time
players should identify the route tradeoff before committing.

### N5 - Relay equipment route and Security island obstruction

Status: IMPLEMENTED; automated/static verification passed, rendered/human acceptance
pending. See N4/N5 handover. Both are short spatial additions, not new puzzles.

**Relay:** fallen operator cabinet/relay housing near -0.8..-1.7 (between pad +2
and door -2.6), biased to one side, leaves a generous short stagger toward the
centre seam. Keep release pad, sightline to expiry bars, door sweep/body-protection
zone and far-side catch at -4.4 clear. No mandatory crouch, jump or action while
the Ghost timer runs. Target a walking pad-to-catch execution <=4 s after summon
as an initial design allowance, then verify against the real eight-second hold.

Player sees platform -> linkage -> released door, walks around equipment and
latches catch. Equipment is static; shared modes still do not control this spring
door. Ghost lifetime stays real-time. Preserve catch-after-expiry recovery and
pre/post-latch checkpoints. Add explicit equipment boxes; no blocker through door
seam or invisible obstruction to catch interaction ray.

**Security:** one broad fallen locker near island X -1.8, Z 0 (candidate footprint
X -2.3..-1.3, Z -0.6..+0.6), occupying only permanent floor. It encourages the
incoming left route to move toward the existing right-hand departure, without
blocking arrival, X=0 island checkpoint, either assessment view or recharge.
Keep a clear landing band near +1.4 and takeoff band near -1.4. Locker is solid
obstruction, not a shortcut platform; no overhang across either hole. Existing
five decks/chevrons/jump/support dimensions are preserved.

**Budget/acceptance:** use larger operator-station damage and torn Security ribs
around existing playable silhouettes, with restrained suspended non-support debris.
Test Relay walking/expiry/cancel/depletion/seam/catch/retries and Security incoming
landing/reposition/recharge/jump/outgoing landing at multiple frame rates. Ghost
does not recharge energy while holding. Test safe island spawn three times with
both views and no landing collision push into holes. Render signs/linkages/catch
aiming, deck edges and locker footprint; ask players to explain next actions.

### N6 - Passenger seat weave and chase integration

Status: IMPLEMENTED; automated/static checks passed; rendered/human acceptance
pending. See N6/N7 handover. The existing chase is already tight: begin with
small authored deflections and prove the entire route, not each obstacle alone.

**Placement/action:** candidate displaced seat back near +7.5 on the left, guiding
toward the existing rack's right-hand clearance; a second shallow seat/trolley
fragment near +3.5 biases the line back toward the centre before hole +1.4.
This creates a rightward then inward weave around the rack at +5.8. Avoid a large
left-right slalom in the short +8.5 entry-to-rack approach. After the opening ends
at -3, add side-only torn seating/curtains/sagging panels with an unobstructed cab
line. Keep the existing marked right-then-centre route coherent.

Seats are deliberate static obstructions with visible rounded ends and generous
turn clearance; no additional forced crouch/jump during this sprint. Existing rack
remains the falling hazard and existing floor the time-controlled crossing. No
new moving obstacle or faster wave. New decorative sagging panels remain above
body/camera clearance. Adjust new seat depth/position if retries become unreliable.

**Abilities/reset:** Freeze still holds rack/floor and pursuing wave under existing
rules. Static seats stay put; restore rack warning/history, depletion state, wave
lead, energy-floor recovery and supports using existing checkpoint ownership.
Never add a checkpoint on collapsing floor or behind an unrecoverable wave.

**Budget/acceptance:** reuse upholstery/wood/curtain materials; short late-level
destruction silhouette, no opaque foreground dust or extra light. Prove timed
actual-player arrival and at least three minimum-energy retries at 30/60/144 FPS
and mixed frames, including misalignment recovery and rebound controls. Record
time/energy/wave clearance rather than just success. Render warning footprint,
seat ends, return to centre, stasis and cab destination in both views; require
human first-time chase evidence before declaring difficulty tuned.

### N7 - One buckling inter-car connector

Status: IMPLEMENTED; automated/static checks passed; rendered/human acceptance
pending. See N6/N7 handover. Highest support/collision risk; kept isolated.

**Placement/action:** candidate boundary `b = spans.convergence.minZ` (also
Mechanical maxZ). A short authored connector cut across both floors, initially
consider `b - 1.2 .. b + 1.2`, joins real lips. Player hears a metal snap, sees
hinges start folding, and can cross promptly, Freeze early, or retreat onto
permanent floor and Rewind -> Freeze -> cross. Allow a successful jump if real
movement permits; do not globally weaken jumping to force the intended answer.
No roof/exterior detour and no major displacement of whole carriage groups.

**Safe areas/checkpoints:** safe pre-lip staging around b+3; post-lip recovery
around b-3, before N3's steam near b-4. Review actual distances as a combined route.
Existing Mechanical entry checkpoint b-1.5 is too close to the proposed opening:
N7 must explicitly relocate it to verified permanent floor (candidate b-2.5),
and update development Mechanical spawn/restart if it would land too close.
No reset on the connector. Check approach bounds/fracture/detachment behaviour.

**Simulation/supports:** one-shot retained failure history, deterministic warning
and fold, symmetric visible hinges and supports derived from the same angle.
Use Cargo's strip-support pattern within the existing player's capabilities;
never assume it carries a player automatically on a rotating platform. Remove
support when steep, match floors/runners/voids on BOTH carriages, and include
new strips in every per-frame and checkpoint support rebuild. Do not leave
decoration as a narrow hidden bridge. Pass-through cosmetic bellows is not floor.

**Reset/budget/acceptance:** restore intact connector, trigger and supports before
time history reset; preserve idle repair history; downstream deaths restore a safe
downstream checkpoint. Small separate moving batches, no free dynamic physics,
new lights or per-frame allocations. Test falls, early interception, prolonged idle
repair, depletion, stepping/jumping, full approach through steam, three retries,
restart/quit and teardown at multi-rate inputs. Render both lips from both cameras
and from below/side; support ray checks alone cannot approve camera comfort.

### N8 - Time feedback and staged background destruction

Status: NOT STARTED. Depends on N7. Consolidate feedback; do not add more mandatory
hazards or retune N2-N7 mechanics.

**Linked feedback:** a small bounded set of straps/splinters on Cargo gangway and
connector repairs follows the owning snapshot clock: boards lift, rails straighten,
fragments return to their source. Vault valuables can suspend near the damaged
plinth outside the route. Freight suspension, steam valve/gauge and Relay linkage
must show their actual state. Effects never imply a new target or a safe pose
while collision stays dangerous. Normal Freeze feedback is local to participating
objects; preserve the existing special finale global-stasis rules.

**Background events:** three proposed approach-triggered, non-colliding vignettes:
an exterior panel peels away beside a Convergence window after the fork; stray
luggage is drawn outward beside downstream Cargo; a lining panel drops behind
the Passenger runner above/outside the traversable envelope. Existing fracture,
Passenger rack/breakup and finale are already events, not missing features.
Keep all vignettes out of supports, hint sightlines, catch/brake aiming and escape
camera. No new failure volumes or player knockback.

**Clocks/reset:** author event phases from simulation/registered snapshot state,
not random triggers or wall time. Choose one-shot triggers with approach bounds
and safe gating; no offscreen surprise collision. For shared-time vignettes,
Slow/Freeze/Rewind affect motion coherently; finale stasis and braking also stop
exterior-linked motion using existing scale. Restore trigger/phase on checkpoint
according to saved progress, preventing repeat warning spam or stale fragments;
full restart rebuilds all events. Ghost expiry and spring-door exception stay intact.

**Look/audio/budget/acceptance:** progressive warm-to-exposed damage, broken brass
and dark structural depth instead of more uniform red flicker. Bounded pooled
fragments/particles, short master-routed creak/snap/suction cues, no new global
post pass. Keep warning transients audible over bed/music. Test snapshot/pose
alignment, Freeze/Rewind/resume, pause, reset, skip, natural completion, disposal
and no false supports. Render/listen to every vignette and repair in both views,
measure transparency/audio/registration cost, and retain control during stasis.

### N9 - Full integration, tuning and final handover

Status: NOT STARTED. Depends on N1-N8 implementations; browser/native play and
human evidence are required for full acceptance. Carry all old acceptance below.

Run a freshly built production game New Game -> L1 -> L2 -> L3 -> victory without
development shortcuts. Repeat both branches, camera modes, deaths, low/zero energy,
reasonable alternative powers, Ghost cancellation/expiry, rebound controls and
hold/toggle crouch. Cover pause/resume, caught/game-over, restart/quit during each
new event and finale, skip/natural completion once, and stale callbacks. Check
that sequential additions still allow independent observation and recharge.

Fix demonstrated regressions within the expansion first. Record failure causes
and timing/energy/wave margins before tuning; keep original ability/movement/wave
parameters unless an explicitly documented scope decision allows a proven change.
Update relevant traversal scripts to navigate real new obstacles; do not retain
old straight-line teleports or weaken expectations to make tests pass.

Run appropriate suite/build and local production packaging checks; capture actual
pixels, audible behaviour, console/network/shader outcomes and resource traces.
Compare L2 screenshots/behaviour as well as counts. Retest full integration after
material fixes, without repeating expensive checks without a new reason.
README/player-facing docs describe only verified behaviour. Credits identities,
trailer and remote hosting remain separate deferred deliverables; no publication.

## Carried acceptance ledger: still open at N0

These are historical unmet requirements, not fresh N0 failures. Earlier sessions
reported no connected browsers and unavailable in-app browser. **N0 did not attempt
a browser launch** and makes no claim about current availability. Recheck in the
next implementation/QA session; lack of access must not become a passing result.

| ID | Outstanding evidence | Carry into |
| --- | --- | --- |
| A1 | Actual production L1 -> L2 -> L3 -> victory without shortcuts; native pointer-lock and menu/input ordering | N9; old upgrade Batch 6 and refinement R7 remain incomplete until proven |
| A2 | Both cameras through doorways/open hull sides/floor holes/boundaries, live shake/detachment; shadows, minimap, editor/exterior and brake reveal with culling; shader correctness | Every affected batch, N9; old R1 |
| A3 | Controlled culling on/off CPU/GPU/frame distributions, actual draw calls, resources/heap; 12-vs-8 light comparison, separate exterior/transparency/post attribution | N1 baseline if available, N9; no speedup claim |
| A4 | Mechanical art reference and all carriage landmarks in Normal/Freeze; camera comfort, lighting-pool pops/spill, overlap and first-time distinctiveness | N1/N3-N6/N8/N9; old R2/R3 |
| A5 | First-time comprehension of Vault lamps/dangerous Freeze, fork tradeoff, Mechanical switching/recharge; both fork routes/crouch cameras/retries | N3/N4/N9; old R4 |
| A6 | Cargo repaired/broken/intercepted alignment and landing, Relay aiming/linkage/countdown/height/expiry/cancel/seam/catch recovery, Security settling/steering/island/jump/landing | N1/N2/N5/N9; old R5 and upgrades |
| A7 | Actual minimum-energy timed Passenger retries; rack footprint, right-to-centre route, wave/stasis and player control; broken span visible before brake and locomotive/gap unobstructed by fog/cuts in reveal | N6/N8/N9; old R6 |
| A8 | Audible warnings vs music/abilities, stasis hush, brake decay/settle, browser audio unlock, master/mute before/during play, pause/editor/skip/death/restart/quit and device cleanup | N2/N3/N8/N9; old R6 |
| A9 | Human difficulty/comprehension evidence, alternate solutions, depleted energy/rebindings, repeated real checkpoints; full-run/restarter resource stability on identified hardware | All gameplay batches/N9; automated routes are supporting evidence |

Keep this ledger even if the browser remains unavailable. N9 may complete feasible
automated work and report partial verification; it cannot close visual/audio/human/
performance acceptance by inference. Do not relabel old R7 as implemented merely
because N9 has started. When overlapping evidence is actually obtained, link it
and reconcile the affected older plan statuses explicitly.

## Verification and continuation protocol

For future code batches: inspect `git status --short`, relevant source and this
plan; record the starting revision and preserve user changes. Before mutation,
record final intended placements and any difference from the proposals. Continue
routine reversible implementation without permission loops within the batch.

Useful existing commands (run from repository root when relevant):

```powershell
npm.cmd test
npm.cmd run build
node scripts/check-production.mjs
git diff --check
```

Targeted test example:
`node --import ./scripts/register-test-assets.mjs tests/timewreck-cargo.test.js`.
Use meaningful real-player/simulation/lifecycle coverage for new hazards; do not
add tests that merely mirror decorative constants. A Markdown-only batch needs
document checks, not gameplay tests. Existing worker spawn EPERM, large-bundle,
non-indexed geometry and headless audio warnings in prior logs are historical;
diagnose fresh failures rather than assuming them away or claiming old passes.

Development: `npm.cmd run dev`, then inspect the reported URL. Existing shortcuts
include `?start=level3`, `level3-convergence`, `level3-mechanical`, `level3-cargo`,
`level3-relay`, `level3-security`, `level3-passenger`; choose NEW GAME. They are
dev-only and do not establish production full-route acceptance. N7 must account
for Mechanical's shortcut spawn if cutting its entry floor.

Capture before/after poses with revision, hardware/GPU, browser, viewport/DPR,
quality/render scale, shadows/bloom, camera and ability mode. Use F9 overlay/dev
benchmark after reading current controls; record p50/p95 frame/update/render and
available GPU timing, draws/triangles, geometry/textures and heap across moving
play and repeated restarts. GPU timer unavailable is n/a, not zero. Target 60 FPS
on named representative hardware and stable 30 FPS fallback as project goals,
not achieved measurements. Browser comparison and production validation supplement
static budgets and CPU disposal checks.

At each batch end append: changed files; final bounds/timings and reasons; resource
deltas; exact commands/results; screenshots/audio/performance evidence if obtained;
unresolved acceptance with cause; implementation vs verified status; and exact next
batch prompt. Keep summaries concise enough to resume from a fresh chat. Do not
depend on chat memory or silently discard deferred checks after compaction.

## Progress and N0 handover

- [x] N0: read both older handovers and inspect live level/route/gangway/landmark,
  movement, time, checkpoint, span, audio/visibility and diagnostic integration.
- [x] N0: preserve clean starting checkout at `a3cac97`; save all new scope here.
- [x] N0: distinguish existing features, proposed additions and historical evidence.
- [x] N0: define N1-N9, source-aware placements, dependencies and carried acceptance.
- [ ] N1 visual benchmark implementation and rendered approval.
- [x] N2/N3 implementation and automated/static verification (see results below).
- [ ] N2/N3 rendered, audible, human and measured performance acceptance.
- [x] N4/N5 implementation and automated/static verification (see handover below).
- [ ] N4/N5 rendered, human, audio and measured performance acceptance.
- [x] N6/N7 implementation and automated/static verification (see handover below).
- [ ] N6/N7 rendered, audible, human and measured performance acceptance.
- [ ] N8/N9 implementation; do not begin without their requested scope.
- [ ] Fresh rendered/audio/human/performance acceptance, including A1-A9.

N0 changes only this new Markdown file. Historical latest refinement result is
91 passing tests/build/packaging, not rerun or represented as fresh N0 validation.
Fresh N0 validation: N0-N9 headings and required feature/acceptance references are
present; Markdown code fences are balanced. `git diff --check` passed for tracked
changes (the new file is untracked); a separate new-file whitespace/conflict-marker
check passed. `git status --short` lists only this new plan, and scoped tracked
diffs for source, tests and package files are empty. No gameplay suite/build or
browser test was run for this documentation-only batch.

## N2/N3 implementation and verification (2026-10-15)

Starting HEAD `a3cac97`; only this untracked N0 plan existed at entry. Preserved
all existing upgrades, refinement work and Level 2. N1 is not present in source
or recorded as completed: proceeded only with the two explicitly requested
encounters. No N1 dressing or N4-N9 work was implemented; no commits/staging/reset.

Changed files:

- `src/levels/timewreck-expansion-hazards.js`: two level-owned deterministic
  encounters, geometry/pose/contact helpers, shared-time registration, proximity
  activation, warnings, bounded steam points, reset and read-only diagnostic state.
- `src/systems/wreck-hazard-audio.js`: lazy procedural suspension creak and filtered
  steam hiss, routed to the existing master, with presentation pause, reset,
  held-time silence and teardown. No samples, dependencies or attribution changes.
- `src/levels/timewreck.js`: construct/update/reset/dispose the new owners; add the
  Cargo pre-load checkpoint and binding-aware approach hints; forward pause to
  both audio owners; stop new audio on skip/natural completion. Move the existing
  luggage hint to Mechanical +9.3, after steam, so the steam hint does not replace
  the first luggage instructions before their encounter.
- `tests/timewreck-expansion.test.js`: nine tests covering real movement, shared
  powers, collision, safe spots, repeated live checkpoint recovery and disposal.
- `test/wreck-hazard-audio.test.mjs`: graph/lifecycle test for unlock, routing,
  voice bounds, pause/held-time silence, checkpoint reset and disposal.
- `tests/timewreck-escape.test.js`: the existing continuous Vault-to-brake route
  now observes steam clearance, holds/crosses it, then observes/holds/crosses the
  swinging freight before continuing through Relay, Security, Passenger and brake.
  No new route teleports or weakened failure assertions.

Final encounter decisions and bounds:

| Item | Implemented values and recovery |
| --- | --- |
| Freight placement | Cargo centre -7, case 1.7 x 1.15 x 0.9 m, hinge Y 3.15, suspension length 1.8 m, amplitude 0.82 rad, period 4.4 s, initial warning 0.8 s. Two suspension rods attach to case straps and header. |
| Freight activation | Approach within 2.5 m of its Z starts the clock and one creak/warning prompt. Case initially rests at a side pose; early Freeze is a valid alternative. Clock/snapshot state drives case rotation and warning arm. |
| Freight contact | Rotated rectangle SAT in XY against upright player body, plus real Z depth and player radius; standing/crouched/airborne height matters. Contact uses existing recoverable failure, not a new damage/push system. A side pose leaves actual clearance; freezing the central dangerous pose still fails. |
| Freight checkpoint | Cargo -4.2, safely after the old loop load and before trigger/sweep. Existing Cargo exit -12.5 retained. Downstream rest -10.5 safe. Reset returns side pose/clock/untriggered warning before shared history reset. |
| Steam placement | Mechanical +11, full-width band with Z half-depth 0.32 m, visible/contact height 0.2..2.3 m; floor brackets mark band. Wall-side pressure housing, ruptured pipes, gauge, valve and shape/colour clearance bar. |
| Steam cycle | 5 s: warning at 1.6..2.35, live jet at 2.35..3.65, otherwise clear. Starts at warning on approach (within +2.3/-2 m); safe entry checkpoint retained at +13.5. Approach +13 and recovery +9 remain safe and separate from luggage +7/recess +2.7. |
| Steam feedback | Upright amber during warning/live jet, horizontal green during clearance; thin local warning mist grows to a bounded full-width 128-point jet. Gauge/valve/mist derive from the same clock and rewind with it. Clear phase hides mist; frozen live phase retains both visible jet and danger. |
| Temporal interaction | Both register with existing Slow/Freeze/Rewind. Shared snapshot history, costs and mode semantics unchanged. Ghost has no new role. Player/hazard segments are sampled at <=20 ms clock / 0.06 m travel increments (bounded 128 samples), checking fast crossings rather than only final position. Large pose teleports check destination only. |
| Lifecycle | New props are under the L3 disposal root; two registrations use existing unregister ownership. No new obstacle/support/void entries or floor cuts. Clock/pose/contact-history reset immediately; warning state is rearmed. Sound bus follows pause and resets at checkpoint/completion/disposal. |

These are CPU-verified placements, not rendered approval. The case/contact model
uses the same rotated case dimensions; cosmetic brass strap thickness and small
existing train shake retain the usual visual tolerance. Contact samples are a
bounded discrete approximation, not a general continuous rigid-body solver.

Static resource delta from the new encounter subtree:

| Encounter | Meshes | Points | Triangles | Geometries | Materials referenced | Lights/shadow casters |
| --- | --- | --- | --- | --- | --- | --- |
| Cargo freight | 5 | 0 | 192 | 5 | 3 | 0 / 0 |
| Mechanical steam | 6 | 1 | 276 | 7 | 5 | 0 / 0 |

Combined: 11 meshes, one Points field (128 points), 468 triangles, 12 geometries,
six unique materials (two referenced by both encounters), two registrations,
zero textures/lights/shadow casters/post passes. Audio adds at most two retained
continuous sources (one oscillator, one filtered mono noise loop) after unlock,
plus existing short warning transients. Noise buffer is 0.4 s (19,200 samples at
48 kHz). Voices are reused, gain-hushed when distant/held and disconnected on reset/
completion/unload. Frame contact checks and steam buffer uploads add unmeasured
CPU/GPU work; these inventories do not establish measured runtime cost or parity.

Fresh final evidence:

| Check | Result |
| --- | --- |
| Targeted real-player/encounter tests | PASS: 9 tests; Normal/Slow/Freeze crossings at 30/60/144 FPS and repeating 1/144, 1/30, 100 ms, 1/60 steps; depleted safe-floor recovery, 50-energy crossings, dangerous frozen poses, actual pose rewind, thin-slice frame spike, crouched/wall-height contact and safe air above jet |
| Actual level checkpoint integration | Included above: three repeats per encounter at 30/60/144 FPS, safe Cargo -4.2 and Mechanical entry spawns, preserved energy floor and safe recharge; full suite retains manager restart/quit and complete attached-resource disposal checks |
| Hazard audio graph test | PASS: one test, no allocation before unlock/when inactive, bounded sources, master routing, pause and held-time gain, reset/disposal; no audible-quality claim |
| `npm.cmd test` | PASS: 146 passed, 0 failed/skipped; final run about 13.2 s, including updated continuous L3 route at 30/60/144 FPS |
| `npm.cmd run build` | PASS; existing >500 kB chunk warning remains |
| `node scripts/check-production.mjs` | PASS: 57 files, 72.64 MiB, 56 case-sensitive local subdirectory asset references |
| Actual encounter subtree resource probe | PASS: counts above, no new lights/shadows; resource-disposal assertions pass |
| `git diff --check` and new-file whitespace/conflict checks | PASS |
| Browser inventory / in-app launch | `apps: []`, `browsers: []`; `Browser is not available: iab` |

Full tests/build used approved child-process access after the initial sandboxed
multi-file Node test command failed with worker `spawn EPERM`. Direct targeted
tests ran normally. Existing non-indexed-geometry and headless audio timer warnings
remain. Ignored logs: `reports/expansion-n23-{initial,targeted,escape,tests,build,
production,geometry}.log`. No browser successfully booted or produced screenshots,
audio capture, shader results, actual frame timings, heap or GPU-memory traces.

Pending acceptance and next steps:

1. **A1-A9 remain open.** Automated traversal/geometry/audio graphs do not establish
   visual quality, human difficulty/comprehension, native input ordering, audible
   balance or runtime performance. Older upgrade Batch 6/refinement R7 acceptance
   is not closed by this work. No verified speedup, FPS or rendered improvement.
2. Cargo dev start: clear the original gangway/loop, stop around centre -4.2 and
   observe the load. Check side/central frozen poses, wait/Slow/Rewind alternatives,
   both wall edges, warning/suspension visibility, death and repeated checkpoint
   retries in both views. Confirm no decoration disguises contact or safe floor.
3. Mechanical dev start: approach from +13.5, observe upright warning/live jet and
   horizontal clear bar, cross normally or hold a clear phase, recover near +9,
   then play the original luggage/recess/shutter sequence. Inspect steam density,
   actual apparent contact height, gauge/valve readability, wall housing overlap
   and camera comfort. Test rebindings and pause/restart/quit in the real browser.
4. Listen to suspension creak, hiss and warning against music/abilities on actual
   speakers/headphones; test unlock, master/mute/pause/held time, completion/skip,
   checkpoint and teardown. Compare identical settings/poses and moving runs;
   measure frame distributions, draws/resources/heap across repeated runs.
5. **Next recommended batch is N1, the skipped visual benchmark**, preserving the
   implemented N2/N3 footprints and safe spots. After N1, proceed to N4 only on
   its requested instruction. N4-N9 remain untouched. No publication performed.

## Historical next-batch prompt after N2/N3 (superseded by explicit N4/N5 request)

```text
Use Game Studio. Complete N1 only from reports/level-3-expansion-plan.md.

Read that plan, the latest relevant results in reports/level-3-upgrade-plan.md
and reports/level-3-refinement-plan.md, and the current Cargo/environment source.
Inspect git status first and preserve existing changes and completed mechanics.
N2 and N3 are already implemented and automatically checked. N1 was skipped;
complete that visual benchmark now without reimplementing either new hazard.

Implement the Cargo visual benchmark: larger folded luggage framing around the
existing gangway, a substantial wall-side freight/crate destruction composition,
and attached torn straps/lining using the existing wood/brass/teal/leather language.
Respect the proposed placement reservations and resolve actual geometry overlap
before editing. Keep the entry, repair approach, real floor opening, hinge marks,
landing, loop door/load, exit, new Cargo -4.2 checkpoint, and implemented N2
freight sweep at -7 clear. Preserve N3 steam and Mechanical safe areas too.

N1 is static visual dressing only. Preserve gameplay, timing, ability/energy rules,
collision, supports, voids, checkpoints, cameras, Level 2 and the current stack.
Do not modify the N2/N3 clocks/contact rules or propagate the style to other carriages.
Reuse materials and merge compatible static pieces; add no lights, shadow casters
or full-screen passes by default. Ensure correct carriage ownership and disposal.

Run appropriate Cargo regressions, build and geometry/resource/diff checks.
Attempt rendered before/after review in both views and Normal/Freeze where tools
are available. If access is unavailable, complete independently checkable work
and keep visual approval/performance/human acceptance explicitly pending.
Do not claim a visual improvement or runtime speedup from static counts alone.

Update reports/level-3-expansion-plan.md with changed files, final placements,
resource deltas, fresh checks, remaining acceptance and the exact N4 prompt.
Carry A1-A9 forward. Complete N1 only, then stop with an honest handover.
```

## N4/N5 implementation and verification (2026-10-15)

Starting HEAD `95f1128`, clean working tree. Read this plan and current route,
laser, Relay, Security, landmark, player, support, collision and lifecycle source.
Used Game Studio's Three.js and playtest workflows with the existing JavaScript
stack. The user's explicit N4/N5 request superseded the historical N1 prompt.
N1 remains NOT STARTED; this batch uses the existing wood/brass/teal/burgundy
vocabulary without claiming N1 approval. N2/N3, old puzzles, Level 2, power costs,
movement, camera settings, wave and finale parameters are preserved. No staging,
commits, dependency changes or publication. N6-N9 were not started.

Changed files:

- `src/levels/timewreck-spatial.js`: L3-owned merged static compositions for four
  carriages, eight component solids and two Convergence support rectangles.
  Collision enable getters read actual feet/body height during player collision
  substeps. The threshold is jumpable; its top is a real support. The maintenance
  fascia reuses the existing low-roof rule. No shared collision changes.
- `src/levels/timewreck.js`: construct the owner, retain its supports in initial,
  frame and checkpoint rebuilding paths, remove owned collision/support entries
  at teardown, and provide binding-aware jump/Relay detour hints. Existing root
  disposal deduplicates the new GPU resources.
- `tests/timewreck-spatial.test.js`: actual-player Vault lane/pad and Security
  clearance checks, geometry-to-support ray checks, and owned-entry/resource
  teardown checks, including idempotent collision cleanup and single disposal.
- `tests/timewreck-escape.test.js`: continuous Vault-to-brake route walks the
  containment lane, jumps the threshold, passes the trolley's open end and walks
  the Relay detour. Added real-level threshold/checkpoint repeats at 30/60/144 FPS
  and mixed steps, plus hold/toggle crouch release/jump-to-stand checks. Existing
  Vault Freeze/Slow routes now use the actual clear lane instead of crossing
  the new solid arm. Original failure assertions remain.
- `tests/timewreck-relay.test.js`: real walking detour to seam/catch, measured
  echo/energy margin, and sprint detour for the no-Ghost negative test. Closed-door
  probes start beyond the cabinet to test the door itself. Cancellation, expiry,
  depletion, shared powers, seam protection, far-side recovery and retries remain.

Final placement decisions (Z relative to the named carriage centre):

| Addition | Accepted bounds and integration |
| --- | --- |
| Vault containment | Fractured teal base X +0.825..+2.175, Z -2.35..-1.85, Y 0..0.52; broad snapped brass arm X -0.15..+2.2, Z -2.3..-1.9, Y 0.53..0.71, with wood fracture. Arm extends farther inward than the +0.8 candidate to make the lane change real. X -0.5 clears it; about 2.45 m remains to the left wall. Both rack slices (-1.2/-4.6), centre pad -2.9 and entry +0.8 remain clear. Added attached, broken overhead pieces around the existing crown at +6.4, Y above 2.5. |
| Convergence threshold | Full-width X -2.6..+2.6, Z +13.87..+14.13, Y 0..0.24. Brass inset finishes flush with the 0.24 m support top. A second full-carriage support at Y 0 lowers feet back to intact floor after leaving the top. No floor cut/void or checkpoint change. Jump from the generous solid approach; +11 checkpoint remains after the threshold. |
| Convergence trolley/arch | Three stepped solids: X -2.5..0 at +12.1; -2.35..-1.15 at +11.5; -2.35..-1.75 at +10.7. Each has Z half-depth 0.24 and body top 1.15 m, with brass rails/burgundy torn lining. Components create a diagonal silhouette without a large enclosing collider. X +0.65 passes the open right end, then both branch entrances remain reachable near +10. Original +11 and -3 checkpoints, direct surge +4, partition, repair shutter and rejoin are unchanged. Broken overhead arch pieces remain above 2.7 m. |
| Maintenance beam | Brass fascia X +0.92..+2.6, Z +6.88..+7.12, underside Y 1.34 matching the existing roof. Bent teal cap and attached torn lining stay above that underside. No new collider, crouch mechanic or registration. Existing hold/toggle low-pose ownership prevents standing/jumping into it. |
| Relay cabinet | X -2.5..+0.25, Z -1.575..-0.825, body Y 0..1.05, with wooden fascia, brass controls and burgundy panel insets. Short open lane to the right is 2.35 m wide. Walking route: pad X 0/+2 -> X +0.7 -> Z -1.95 -> X 0 -> catch -4.4. Door -2.6, spring body-protection zone, release/linkage, expiry bars and far catch remain unchanged. Attached wall-side damage stays above body height. |
| Security locker | X -2.3..-1.3, Z -0.6..+0.6, main body Y 0..1.15, with damaged wood/brass cap and torn overhead ribs. Entire footprint lies on permanent island floor. Both 0.8 m landing/takeoff bands to island edges +/-1.4, centre checkpoint, recharge and rightward departure remain clear. No new platform/support or overhang across either hole; five decks retain their dimensions. |

The walking Relay execution takes **1.95 s** from movement after summon to catch
position (7.8 m at 4 m/s, including lateral segments), verified with actual player
movement at 30/60/144 FPS. With the 0.05 s post-summon update it retains **>5.9 s**
of the eight-second hold and energy falls below 63 from the post-summon ~65;
Ghost recharge is still disabled. These are automated execution timings, not
first-time human aiming/comprehension times. Continuous integration still reaches
brake completion at all three frame rates without new room teleports.

Resource delta, measured from the new owner's actual scene subtree:

| Carriage | Meshes/geometries | Triangles | Referenced materials |
| --- | --- | --- | --- |
| Vault | 3 / 3 | 84 | 3 |
| Convergence | 4 / 4 | 192 | 4 |
| Relay | 4 / 4 | 120 | 4 |
| Security | 3 / 3 | 120 | 3 |

Combined **14 meshes, 14 merged geometries, 516 triangles, four unique materials**.
Zero added textures, source lights, shadow casters, time registrations, particles,
audio voices or post passes. Static assembly intermediate geometries are disposed
after merging. Eight owned collision boxes and two static support rectangles;
no new voids. Collision/support entries are removed on disposal; shared materials
are freed once by the root owner. These counts and CPU lifecycle checks do not
prove GPU memory stability, frame rate, camera readability or improved visual quality.

Fresh final evidence:

| Check | Result |
| --- | --- |
| `npm.cmd test` | PASS: 152 passed, zero failed/skipped, about 14.45 s. Includes continuous route, both existing branches and repair histories, new threshold/retries, crouch modes, Relay detour/negative sprint/seam/recovery, Security crossings/recharge/retries, L2 regressions and complete level restart/unload disposal. |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-spatial.test.js` | Initial focused three tests passed; final four-test version, adding teardown, passes in the full suite. |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-relay.test.js` | Initial eight tests passed; final strengthened route/margin/negative tests pass in the full suite. |
| `npm.cmd run build` | PASS, final build about 1.4 s; existing >500 kB chunk warning remains. |
| `node scripts/check-production.mjs` | PASS after final build: 57 files, 72.65 MiB, 56 case-sensitive local subdirectory asset references. |
| Geometry/resource probe | PASS: measured subtree counts above; threshold top ray intersections match support height across the width. No new lights/shadows. |
| `git diff --check`, new-file whitespace/conflict checks | PASS at handover. |
| Browser inventory / launch | `apps: []`, `browsers: []`; attempted in-app game URL and received `Browser is not available: iab`. No rendered game session or screenshot obtained. |

A sandboxed multi-file Node worker attempt failed with `spawn EPERM`; the final
suite and Vite build ran with approved child-process access. Existing non-indexed
geometry and headless ability-audio timer warnings remain. Intermediate failures
were corrected: old straight-line Vault tests now use the visible lane, and the
new threshold test allows sufficient walking after landing to reach the trolley
opening. No movement/hazard rules were changed to satisfy tests. Ignored logs:
`reports/expansion-n45-{escape,relay,spatial,tests,build}.log`.

Implemented versus verified:

- **Implemented and automatically/static checked:** N4 and N5 only, as above.
- **Not visually verified:** containment composition, threshold/trolley and fork
  readability, bent beam/crouch camera clearance, Relay signs/linkage/countdown/
  interaction ray/cabinet silhouette, Security locker/deck-edge views in either
  camera or Normal/Freeze. CPU geometry rays are not rendered screenshots.
- **A1-A9 remain open.** No browser shader/console/network capture, native input,
  audible balance, hardware frame/GPU/heap measurements, both-view human retries
  or first-time comprehension evidence was obtained. No claim of speedup, visual
  improvement or tuned difficulty. Older Batch 6/R7 acceptance stays unresolved.
- When rendering is available, inspect both cameras through the threshold jump,
  trolley fork choice and maintenance beam with hold/toggle crouch. Observe both
  Vault pads/laser modes and left lane; check Relay aiming around the cabinet,
  actual eight-bar countdown and three retries; land on Security island, circle
  the locker, recharge and jump the unchanged departure. Capture identical
  settings/poses and moving runs; check culling, shadow/minimap paths and resource
  stability. No fresh camera/performance approval can be inferred from tests.
- Next sequential implementation batch is **N6 only**, on a new explicit request.
  The skipped N1 visual benchmark remains separate pending scope. Stop here.

## Historical next-batch prompt after N4/N5 (superseded by explicit N6/N7 request)

```text
Use Game Studio. Complete N6 only from reports/level-3-expansion-plan.md.

Read the plan and relevant current Passenger, player, time, wave, checkpoint,
guidance, support/collision and test source first. Inspect git status and preserve
existing changes and completed work. N2/N3 and N4/N5 are implemented and
automatically checked. N1 remains NOT STARTED; do not implement it in this batch.
Read the latest handovers and keep implementation distinct from rendered approval.

Implement the Passenger seat weave and chase integration: small static seat-back
deflections near +7.5 and +3.5, right around the existing rack at +5.8 then back
toward the centre before the hole at +1.4, plus side-only destruction after -3
with a clear cab destination. Resolve bounds against current geometry first.
Keep generous turns and visible collision; add no forced crouch/jump or moving
hazard. Adjust additions if minimum-energy retries become unreliable. Preserve
the existing rack/floor/wave, power/movement/energy parameters, checkpoints,
camera/finale, Level 2 and all N2-N5 footprints and safe spots.

Use existing materials, merge compatible static pieces and retain correct
ownership/reset/disposal. Add no lights/shadows/post passes by default. Update
the actual traversal routes to navigate the seats; do not bypass them with
teleports or weaken assertions. Prove timed arrival and three minimum-energy
retries at 30/60/144 FPS and mixed steps, including misalignment recovery and
rebound controls. Record time, energy and wave clearance as well as success.

Run appropriate tests, build, production packaging and geometry/resource/diff
checks. Attempt rendered verification in both views and Normal/Freeze, checking
warning footprint, seat ends, centre return, stasis and cab visibility. If browser
access is unavailable, complete independently checkable work and leave rendered,
audible, human and performance acceptance explicitly pending. Carry A1-A9 and
older Batch 6/R7 acceptance forward without treating automation as visual proof.

Update reports/level-3-expansion-plan.md with changed files, final bounds/reasons,
resource deltas, fresh evidence, unresolved issues, implemented versus visually
verified status and the exact N7 prompt. Complete N6 before stopping. Do not
begin N7 or any other batch, publish, or silently complete the skipped N1.
```

## N6/N7 implementation and verification (2026-10-15)

Starting revision `2cb5d5e`, clean working tree. Read this plan and current
Passenger guidance/rack/chase, Cargo strip support/history, floor dressing,
Convergence spatial supports, Mechanical steam, player, collision, checkpoint,
time, audio and lifecycle source before implementation. Used the established
Game Studio Three.js/playtest workflow. This explicit N6/N7 request supersedes
the historical N6-only continuation prompt. N1 remains NOT STARTED; N2-N5 and all
older completed work are preserved. No N8/N9 implementation, new dependencies,
publication, staging or commits. Existing gameplay parameters remain unchanged.

Changed files:

- `src/levels/timewreck-spatial.js`: N6 Passenger seat backs and side-only late
  damage, merged with the existing owner's materials. Rounded seat ends use
  static extruded profiles; explicit component colliders use the same extents.
- `src/levels/timewreck-connector.js`: N7 two-leaf connector, deterministic
  warning/fold clock, selective retained shared-time history, actual floor/edge
  cuts on both carriages, persistent moving support strips, permanent lips,
  clearance arm, restored outline and synchronous reset.
- `src/levels/timewreck.js`: construct/register connector, clip N4's floor support
  to the new lip, add void/fall detection, include strips in initial/frame/reset
  support rebuilding, add pre-lip checkpoint, relocate Mechanical checkpoint/dev
  spawn, guard the two new checkpoints against airborne saves, restore before
  history reset and remove owned supports/void on unload. Hide the inaccessible
  connector at existing breakup >1 s, before Mechanical detaches at 1.1 s; reset
  restores visibility. No new background vignette or carriage-motion change.
- `src/systems/wreck-audio.js`, `test/wreck-audio.test.mjs`: one short two-tone
  metal snap through existing master/pause/reset/disposal ownership, with graph
  assertions for voice bounds, routing, pause and pre-unlock silence.
- `tests/timewreck-connector.test.js`: real walking/Slow/early Freeze, minimum
  energy, long-idle repair, dangerous frozen pose, sprint jump, both floor/edge
  cuts, moving geometry/support alignment and reset at fixed/mixed frame rates.
- `tests/timewreck-spatial.test.js`: Passenger fixture and actual-player seat
  blocking/rightward/inward clearance; existing merged-resource disposal checks
  now cover the Passenger subtree too.
- `tests/timewreck-escape.test.js`: live connector fall/retry/depletion/repair/
  steam integration and relocated dev start, Passenger rebound-input run,
  minimum-energy retry misalignment recovery, per-frame chase metrics and
  connector retirement before detachment. The continuous Vault-to-brake route
  walks across N7 and navigates the two real seats without new pose shortcuts.

Final placement and timing decisions:

| Addition | Accepted implementation |
| --- | --- |
| Passenger first seat | Centre X -1.25, Z +7.5; wood X -2.5..0, Z +7.34..+7.66, Y 0..1.2. Burgundy inset reaches 0.01 m farther in Z and uses the same 0.12 m rounded-end profile. Keeps the right side open into the existing rack clearance. |
| Passenger second seat | Centre X +1.95, Z +3.5; wood X +1.4..+2.5, Z +3.34..+3.66, Y 0..1.2. Shallow lateral obstruction encourages returning to centre before the +1.4 hole. Centre remains open. |
| Passenger route/damage | Existing right-around-rack then inward route remains valid without a new crouch/jump. Rounded visual corners sit within component AABBs (small conservative corner tolerance), not a large slalom enclosure. After the hole, small seating remnants stay at |X| >=2.06, Z -4.3/-7; torn lining and sagging teal caps stay above Y 2.4. No solid floor/support across the hole or obstruction to the central cab line. |
| Connector opening | `b = spans.convergence.minZ = spans.mechanical.maxZ`. Full shell-width void X -2.6..+2.6, Z b-1.2..b+1.2. Both floor meshes and both floor-edge strip pairs stop at the real lips. Current damaged builders have no runner at this boundary; instanced Convergence floor plates stop well before the cut. N4's old full-carriage support is explicitly shortened. |
| Connector deck | Two symmetric leaves, each 2.2 m wide and 1.2 m long, top Y 0.04 when flat, 0.12 m thick, hinged at the two lips. Flush brass seams and fixed mating marks, visible symmetric axle bars. Restored outline is non-supporting. Clearance arm is horizontal while walkable and upright when steep. No wall-side bypass. |
| Connector clock | Trigger on near-side approach Z (b+1.2, b+3.4], one metal snap/toast, 1.3 s flat warning, then 1 s smooth fold to 1.2 rad. Prompt walking is deliberately valid. Snapshot pose drives both leaves, arm and support strips. Freeze retains the actual pose; Rewind restores it. Selective history retains intact baseline through >26 s idle. |
| Connector supports | Twelve persistent strips per leaf; X +/-1.1 only while angle <=0.15 rad, midpoint height and Z projection from the visible angle. No support when steep; no automatic player carrying. Two permanent shell-floor support rectangles stop at lips. Strip height approximation within each 0.1 m segment is bounded; ray checks compare segment midpoints, not general rigid-body physics. |
| Checkpoints/spawn | Added grounded pre-lip checkpoint b+3. Relocated Mechanical entry checkpoint and dev spawn from b-1.5 to b-2.5, on permanent floor, 1.3 m past the lip and 1.5 m before steam centre b-4. The two new saves require grounded feet within 0.06 m of floor. No checkpoint on leaves; downstream retry remains downstream. All original steam/luggage timings and safe recesses retained. |
| Lifecycle | Restore flat leaves, trigger, supports and visibility synchronously before shared history reset. One registration follows the existing unregister owner. Owned support/void entries removed at unload; GPU resources deduplicated by root disposal. Connector hidden once the old boundary becomes inaccessible during existing Passenger breakup, before Mechanical begins detaching. |

Measured automated route evidence:

| Schedule | Three Passenger retry times to brake approach | Lowest energy during run | Energy at brake approach | Minimum wave gap |
| --- | --- | --- | --- | --- |
| 30 FPS | 4.37, 4.37, 4.42 s | 2.940..3.690 | 19.440..20.190 | 9.850..10.160 m |
| 60 FPS | 4.37, 4.37, 4.42 s | 2.440..3.190 | 18.940..19.690 | 9.850..10.160 m |
| 144 FPS | 4.37, 4.37, 4.42 s | 2.273..3.023 | 18.773..19.523 | 9.850..10.160 m |
| Repeating 1/144, 1/30, 100 ms, 1/60 steps | 4.37, 4.37, 4.42 s | 2.044..4.294 | 18.544..20.794 | 9.850..10.513 m |

Runs start from the actual minimum-energy checkpoint recovery (50, <=54 after
brief entry progression), observe actual body collision and finish within 1.5 m
of the brake. Third retry includes a 0.05 s lateral misalignment and recovery.
Metrics sample every simulated player frame. A separate actual rebound-key run
uses I/J/L/O/P for movement/sprint/Freeze, rejects the old Freeze key and activates
the brake. Continuous full L3 integration still completes the finale at 30/60/144.
Energy near 2 is a **tight automated margin**, not proof of human difficulty or
robust first-time execution; no baseline power/wave/movement tuning was applied.

N7 walking takes 1.45 s from b+3 to permanent floor beyond b-2.5 with Normal,
Slow or early Freeze at all four schedules, including starting energy 50.
Tests also retain a fully broken pose during Freeze (actual fall), repair after
26 s idle, and successfully sprint-jump the broken opening. Live level tests
repeat three falls/restores per schedule, deplete Freeze safely on the staging
floor, recharge/repair/cross, then observe/freeze/cross steam. A later failure
restores grounded b-2.5 with energy >=50 and flat connector immediately.
Existing restart/quit/lifecycle tests cover the added owner and its resources.

Measured resource delta against the N4/N5 implementation:

| New subtree | Meshes | LineSegments | Triangles | Geometries | Referenced materials |
| --- | --- | --- | --- | --- | --- |
| Passenger static seats/damage | 4 | 0 | 456 | 4 | 4, all reused from N4/N5 spatial owner |
| Connector | 6 | 1 | 252 | 7 | 4 new unique materials, including line material |

Combined +10 meshes, +1 LineSegments object, +708 triangles, +11 geometries,
+4 unique materials, +1 time registration, +2 explicit seat solids, +26 persistent
support rectangles (24 moving strips, two permanent) and +1 void. Floor/strip
geometry replacements retain their object counts and dispose the old geometries.
Zero added textures, source lights, shadow casters, particles or post passes.
Audio adds at most two short oscillators per connector activation (0.09/0.16 s),
reusing the existing bus; no continuous source/sample/dependency. These inventories
and disposal checks do not establish GPU residency, leaks, frame rate or speedup.

Fresh final validation:

| Check | Result |
| --- | --- |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-connector.test.js` | PASS, three tests at fixed/mixed frame schedules. |
| `node --import ./scripts/register-test-assets.mjs --test --test-isolation=none --test-name-pattern 'N7:' tests/timewreck-escape.test.js` | PASS, live N7 integration at four schedules. |
| `node --import ./scripts/register-test-assets.mjs tests/timewreck-spatial.test.js` | PASS, five tests including actual Passenger route clearance. |
| `npm.cmd test` | PASS, 158 passed, zero failed/skipped; includes final detachment-retirement assertion, all existing L2/L3 regressions, audio, manager restart/quit and resource disposal. |
| `npm.cmd run build` | PASS, final build about 1.59 s. Existing >500 kB chunk warning remains. |
| `node scripts/check-production.mjs` | PASS: 57 files, 72.65 MiB, 56 case-sensitive local subdirectory asset references. |
| Actual-level resource/geometry probe | PASS: counts above; both actual floors/edges expose gap at five X/four Z samples; no old support remains across folded opening at centre or wall edges. Geometry/ray evidence only. |
| `git diff --check` and new-file whitespace/conflict/fence checks | PASS at handover. |
| Render availability | Fresh inventory: `apps: []`, `browsers: []`. Attempted in-app Passenger URL: `Browser is not available: iab`. No rendered frames obtained. |

Full suite/build used approved child-process access. Targeted isolation-free tests
ran without worker spawning. Existing non-indexed geometry/headless audio timer
warnings remain. Intermediate test fixes distinguish signed zero from a nonzero
hinge angle and stop at actual Freeze exhaustion before Normal recharge; no
gameplay rule was changed to accommodate those tests. Ignored evidence logs:
`reports/expansion-n67-{connector,spatial,integration,escape,tests,build,geometry}.log`
(spatial targeted output was returned directly, not saved as a log).

**Implementation versus acceptance:** N6/N7 are implemented and automatically/
statically checked. They are **not visually or audibly verified**. Both cameras,
seat/rack silhouettes and stasis/cab sightlines, both connector lips and side/
underside views, hinge/collision apparent alignment, human repair comprehension,
native rebound inputs, pause/audio balance, culling/shader/minimap rendering and
hardware CPU/GPU/heap measurements remain pending due to unavailable browser.
No FPS, visual-quality or difficulty-tuning claim. A1-A9 and older upgrade Batch
6/refinement R7 remain open. When a browser is available, inspect both cameras
in Normal/Freeze, all N7 alternatives and retries, then the minimum-energy chase
with measured human timings. N1 is still a skipped separate benchmark. Stop here;
the next sequential batch is N8 only, upon explicit request.

## Exact next-batch prompt

```text
Use Game Studio. Complete N8 only from reports/level-3-expansion-plan.md.

Read the plan, latest N2-N7 handovers and relevant current source first. Inspect
git status and preserve existing changes and completed work. N2-N7 are implemented
and automatically checked; N1 remains NOT STARTED. Do not implement N1 or N9.

Implement linked repair fragments/time feedback and the three bounded background
vignettes defined in N8. Use actual registered snapshot clocks for attached Cargo
gangway/connector straps and splinters, Vault valuables outside the route, and
approach-triggered exterior/lining events beside Convergence, downstream Cargo
and behind Passenger. Preserve real freight, steam, Relay and finale state cues.
Do not add mandatory hazards, false supports, lights, global post passes or retune
N2-N7 mechanics. Keep effects clear of camera/body routes, lips, catch/brake aiming,
warnings and the cab destination. Use pooled/bounded geometry and existing audio
ownership; handle pause, shared powers, finale stasis/braking, checkpoint progress,
restart/skip/natural completion and disposal without stale fragments or cue spam.

Preserve N7's opening at b +/-1.2, retained repair clock, grounded pre-checkpoint
b+3, Mechanical checkpoint/dev spawn b-2.5, and connector retirement before the
existing Mechanical detachment. Preserve N6 seat bounds and minimum-energy chase;
its measured energy margin is tight and human difficulty remains unverified.
Keep ability/movement/energy/wave/camera parameters, Level 2 and the current stack.

Run appropriate pose/history/lifecycle and continuous-route regressions, build,
production packaging and resource/diff checks. Attempt actual rendered/audible
verification of every repair/vignette in both views and Normal/Freeze/Rewind;
record settings and measured resources/performance where available. If browser
access remains unavailable, finish independently checkable implementation and
retain rendered/audio/human/performance acceptance explicitly pending. Carry
A1-A9 and older Batch 6/R7 acceptance forward; automation is not visual proof.

Update reports/level-3-expansion-plan.md with final bounds/clocks, changed files,
resource deltas, fresh evidence, unresolved issues, implemented versus visually
verified status and the exact N9 prompt. Complete N8 before stopping. Do not begin
N9, the skipped N1, or publication.
```

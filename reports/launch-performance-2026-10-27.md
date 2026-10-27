# Launch and rendering performance — 27 October 2026

Startup now shares the detective's source FBXs between the player and Time Ghost,
with independent skeletons, clips, geometry and materials. All 15 source files
load once, including Salute in the initial parallel group. The unused police turn
animation is no longer requested.

The loading overlay no longer hides repeated partial-world renders. The title
camera and light pool are established before the first world render, so the
temporary default camera cannot prepare unseen station regions. Ghost warmup
compiles only the Ghost against the world's lights and environment.

The train and the two sky reflection maps are prepared at station entry, under
the existing fade, rather than at launch. Train preparation compiles the train
alone and uses a temporary camera layer to exclude unrelated geometry from its
offscreen upload pass. Layer masks and renderer state are restored afterwards.
The development cover/reachability audit remains available at `/?checkCover`;
its two dense flood fills no longer run during ordinary development startup.

Minimap obstacles use growing instance batches grouped by material. Clipping,
moving obstacle bounds, colours and teardown remain supported. Unused batches
are hidden, and replaced/retired instance buffers are disposed.

## Observations

Local Chromium, desktop viewport, default saved settings, Vite development
server. The original source was inspected before edits; these are observations,
not a controlled hardware or cold-network benchmark.

| Check | Before | After |
| --- | ---: | ---: |
| GPU geometries allocated at title readiness | 448 | 75 |
| GPU textures allocated at title readiness | 175 | 36 |
| Shader programs at title readiness | 138 | 30 |
| Example development reload to overlay dismissal | 6.94 s | 6.10 s |
| Same-camera minimap draw calls, current 229 Boarding obstacles, no guards | 34 | 5 |

The minimap comparison rendered the original HEAD module and the updated module
in separate scenes with the same orthographic camera and obstacle list. The
batched version submits more offscreen triangles (507 versus 113 including the
floor/player) because the batch replaces individual mesh frustum tests. The
additional small quads trade for fewer submissions. No overall FPS uplift is
claimed: the original title view already ran near the browser's 60 Hz limit.

One production-preview boot reached overlay dismissal at 4.62 s. There is no
matching production baseline. Reload timing varies with CPU contention, asset
and driver caches. Large FBXs, procedural texture generation and synchronous
level construction remain costs. Station entry now owns the deferred reflection
capture and train upload cost; this work was moved, not eliminated.

## Verification

- `npm.cmd test`: **200 passed, 0 failed**, including four new regressions for
  concurrent detective loads, source retry, Ghost compilation and minimap batching.
- `npm.cmd run build`: passed; the existing large JavaScript chunk warning remains.
- `node scripts/check-production.mjs`: passed; 57 files, 70.99 MiB, 56 asset
  references verified through case-sensitive subdirectory HTTP checks.
- `git diff --check`: passed.
- Browser smoke: New Game, movement to the front doors, interaction and station
  entry in development and production preview. Direct development transitions
  into Moving Heist and Timewreck rendered their player, world and minimap.
- Screenshots inspected: [production title](launch-performance-2026-10-27/title.png),
  [plaza gameplay](launch-performance-2026-10-27/plaza.png),
  [production station entry](launch-performance-2026-10-27/station-entry.png),
  [Moving Heist](launch-performance-2026-10-27/level2.png),
  [Timewreck](launch-performance-2026-10-27/level3.png).

No complete manual playthrough, weak-device benchmark or remote deployment was
performed. Browser console errors observed were missing favicon requests;
existing FBX skin-weight and unsupported material-property warnings remain.

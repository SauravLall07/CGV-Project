# Level 3 windows — 28 October 2026

Starting point: clean `main`, latest commit `b7edcd3` (merge of the Level 3 visual refresh). This is a focused follow-up to that rebuild.

Opaque, animated storm pictures have been replaced with lightly tinted transparent glass showing the actual exterior. Alternate retained window bays are filled with matching wall panels. Each main carriage has intact/cracked glass and broken panes with attached corner shards and a physically open centre. Large side/roof tears remain open. The cab keeps its sole surviving window.

| Carriage | Before → after | Side-view comparison |
| --- | --- | --- |
| Vault | 6 → 3 | [Before](before/vault-side--1.jpg) / [After](after/vault-side--1.jpg) |
| Convergence | 17 → 9 | [Before](before/convergence-side--1.jpg) / [After](after/convergence-side--1.jpg) |
| Mechanical | 12 → 6 | [Before](before/mechanical-side-1.jpg) / [After](after/mechanical-side-1.jpg) |
| Cargo | 9 → 5 | [Before](before/cargo-side-1.jpg) / [After](after/cargo-side-1.jpg) |
| Relay | 6 → 3 | [Before](before/relay-side--1.jpg) / [After](after/relay-side--1.jpg) |
| Security | 6 → 3 | [Before](before/security-side--1.jpg) / [After](after/security-side--1.jpg) |
| Passenger | 7 → 4 | [Before](before/passenger-side--1.jpg) / [After](after/passenger-side--1.jpg) |
| Cab | 1 → 1 | [Before](before/cab-side-1.jpg) / [After](after/cab-side-1.jpg) |

Counts include both sides, exclude existing large tears, and round odd counts up. Remaining trim, seals, panes and shards belong to their carriage and use its existing disposal and camera-decoration rules. No new movement or time mechanics were added. The opaque storm shader is no longer used by these windows; static glass requires no animated texture clock.

Validation: 32 screenshots per revision cover first/third-person approaches and both side views of all eight carriages. Chrome headless, Windows/ANGLE Intel Iris Xe, 1280×720, pixel ratio 1, diagnostic high quality, exposure 1.15, existing fallback player. Both captures report zero browser page errors. Reproduce with the local Vite server on port 5176 and `node scripts/lvl3-window-check.mjs before|after` (override `LVL3_ORIGIN` / `PLAYWRIGHT_PATH` as needed).

Geometry regressions check half-counts, solid replacement panels, no opaque window backing, genuinely open broken centres, time-power stability, carriage ownership and existing torn-shell clearances. The full suite initially exposed two failing story-render tests: three shared-style mock instances lacked the merged renderer's `getState()` API. Only those mocks were updated; the focused story suite now passes all 46 tests.

Final `npm.cmd test`: **295 passed, 0 failed**. Production build passes with Vite's existing large-chunk warning. Packaging passes: 73 files, 79.56 MiB, 72 case-sensitive subdirectory asset-reference checks. `git diff --check` passes. See [test log](tests.log) for the final complete regression result.

Limits: these are diagnostic renders and automated regressions, not a new manual end-to-end playthrough or a controlled frame-time comparison. The existing exterior scenery is reused. Resource/render snapshots are recorded in each capture's `results.json`; they do not establish an FPS improvement. No commit, push or deployment was performed.

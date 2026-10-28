# Cargo obstacle motion — 28 October 2026

- Horizontal trunk: independent 3.2-second cycle; 0.6 seconds overhead, 0.35-second accelerating drop, 1.6 seconds on the floor, 0.65-second lift. Centre height falls from 2.25 m to 0.18 m; body/lid top is 0.39 m. The bulkhead retains its nine-second cycle.
- Hanging case: starts eight metres ahead, warns for 0.5 seconds, then sways through the existing ±0.82-radian arc every 3.2 seconds (previously 4.4 seconds). It moves before a sprint reaches it.
- Existing time-system clocks/snapshots drive both obstacles. Updated landing/death hints and the automated Cargo routes for the floor jump.

## Verification

- New checks pass: floor drops while door is open, walking fails, real jumps clear the trunk in Normal and Freeze, checkpoint reset, Freeze/Rewind pose restoration, and visible sway before arrival. Traversal covers 30/60/144 FPS and mixed steps including 100 ms.
- Focused Cargo/expansion suites: 18/20 pass. Both failures also reproduce with the committed source and committed tests (baseline 15/17): the long-wait Cargo gangway test and Mechanical steam integration are caught by the existing pursuing wave.
- Chrome diagnostic with real level/controller/rendering: floor drop, successful jump, and both sway directions captured; no page errors. Diagnostic entry poses isolate these obstacles; this is not an uninterrupted level playthrough.
- Production build, packaging check (79 asset references), syntax checks and `git diff --check` pass.
- Full-suite runs encountered additional route failures; follow-up full-suite comparisons stalled in `timewreck-escape.test.js` on both committed and working sources and were stopped. Full-level regression validation remains incomplete.

## Captures

[Floor obstacle](cargo-motion/02-floor-first.jpg) · [Jump cleared](cargo-motion/03-jump-cleared.jpg) · [Left sway](cargo-motion/04-sway-left.jpg) · [Right sway](cargo-motion/05-sway-right.jpg)

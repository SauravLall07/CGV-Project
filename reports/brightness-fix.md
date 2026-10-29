# Brightness and Level 1 readability — 29 October 2026

## Changes

- 100% brightness maps to exposure 1.15; 200% maps to 2.2. Saved percentages remain intact, and legacy exposure saves retain their exposure through migration.
- Level 1 disables additive amber in shadows and reduces neutral lift from 0.022 to 0.008. Other levels retain their grade defaults; teardown restores them.
- Existing hemisphere and ambient lights provide neutral interior bounce. Exterior lighting and distance fog remain unchanged.
- Level 1 canvas colours are encoded as sRGB rather than writing linear values into an sRGB texture.
- Concrete has softer normals, no metalness, and a less reflective puddle roughness map.

## Verification

- 58 focused tests pass, covering brightness migration/reload, grade/reset isolation, texture ownership and story rendering.
- Production build passes. Vite reports its existing large-chunk warning.
- Full-suite run: 337/347 passed. All 10 failures reproduce against the committed HEAD source in a temporary baseline copy: the Level 3 transition source assertion and nine Level 3 traversal/simulation cases. Temporary sources were removed.
- Browser checks at 100% brightness/exposure 1.15: Level 1 puzzle doorway at high quality (bloom on, high shadows, full resolution) and low quality (bloom off, shadows off, performance resolution); forecourt; lower passage; Level 2 passenger carriage; Level 3 Vault. No console errors during the final level-transition checks.
- Browser texture sampling: concrete mean red channel about 74/255; roughness minimum 159/255, avoiding near-mirror puddles.

## Screenshots

- [Before](brightness-before.png)
- [Level 1 high quality](brightness-level1-high.png)
- [Level 1 low quality](brightness-level1-low.png)
- [Forecourt](brightness-level1-exterior.png)
- [Lower corridor](brightness-level1-lower-corridor.png)
- [Level 2](brightness-level2.png)
- [Level 3](brightness-level3.png)

Screenshots use a fixed test camera for the doorway comparison. These are visual smoke checks, not full level playthroughs or a hardware performance benchmark.

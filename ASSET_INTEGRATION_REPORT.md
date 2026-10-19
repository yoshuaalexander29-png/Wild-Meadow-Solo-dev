# Asset integration iteration

## Implemented

- Replaced the main entry point with a Three.js scene using GLTFLoader.
- Added existing CC0 Quaternius GLB assets for the two hero slots and sword prop.
- Kept environment generation separate from the hero models; trees, hills, grass and flowers are not presented as character art.
- Added asset-load status and visible errors, adaptive pixel ratio, touch camera orbit, camera timeline, pause/restart controls, and context-loss messaging.
- Preserved the previous raw-WebGL scene as `index-procedural-backup.html`.
- Documented asset provenance and runtime network dependencies in `ASSET_MANIFEST.md`.

## Verified

- Static integration smoke test: see `tests/asset-integration-smoke.cjs`.
- JavaScript module syntax: checked with Node's module parser.
- No real-browser render or physical iPhone test is claimed.

## Visual review

- Existing contact-sheet screenshots were inspected. They show primitive-looking hero silhouettes and sparse, repetitive vegetation.
- No new screenshot is claimed: the previous Chromium/EGL route failed to initialise in this environment, and the new Three.js/GLB scene has not yet been captured in a real browser.

## Remaining

- Verify remote GLB/CORS loading and the rendered appearance in a real browser.
- Replace the mismatched human forest wanderer with a licensed deer-centaur/centaur model if a suitable model can be sourced.
- Replace the knight with an archetype-matched silver-haired barbarian asset if a suitable licensed model is found.
- Attach sword to the actual hand bone after confirming the imported rig.
- Measure frame time, triangle count and startup on a real browser; verify on iPhone 14 Safari.

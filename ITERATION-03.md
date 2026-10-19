# WILD MEADOW — Iteration 03

## Changes made

- Tightened the five-shot camera timeline substantially so the characters occupy more of the frame and the shots read as a character encounter rather than a distant meadow overview.
- Shifted the sky/fog tint toward cool sage-teal and the terrain toward a richer, darker green to increase separation from the character materials.
- Refined the title plate and controls toward a quieter forest-green / warm-stone palette.
- Added `ASSET_UPGRADE_PLAN.md` documenting vetted open-source asset sources, licences, the required renderer migration, and the integration gates.

## Open-source research

- Quaternius RPG Character Pack: CC0, six rigged/animated/textured fantasy characters; publisher page lists glTF among formats.
- Quaternius Ultimate Stylized Nature Pack: CC0, 60+ nature assets with textures and normal maps; publisher page lists glTF among formats.
- Three.js official examples and post-processing documentation for the renderer migration.

These assets have **not** been integrated. The container cannot resolve external hosts, so the model archives could not be downloaded. This iteration is a camera/colour/composition adjustment and a source-backed migration plan, not a completed character-art replacement.

## Verification

- `node tests/mock-webgl-smoke.cjs`: PASS (mock/API-level only).
- Six draw batches; no invalid draws detected by the mock; geometry finite; five camera keyframes detected.
- This test does not execute real WebGL or prove that the shaders render correctly.
- Attempted a genuine Chromium headless screenshot from the exact build; Chromium hung and was terminated after timeout. No Iteration 03 screenshot exists. Prior screenshots are baseline evidence only and must not be mistaken for this build.

## Remaining before visual acceptance

1. Download the two CC0 asset packs and preserve their licence files.
2. Migrate from raw WebGL to a local/pinned Three.js + glTF pipeline.
3. Replace primitive character geometry with authored models and import real foliage/ground materials.
4. Restore a working real-browser capture path; inspect actual pixels and iterate until the art target is met.
5. Test performance and controls in desktop and iPhone Safari.

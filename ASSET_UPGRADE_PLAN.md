# Open-source art replacement plan

The visual review of the existing captures shows that the main failure is not a shortage of grass: both hero characters are made from stacked ellipsoids and tapered primitives, the trees are repeated clumps, the ground has no authored texture, and the scene lacks cast shadows and strong depth separation. More procedural detail is not an adequate replacement for authored assets.

## Shortlisted sources (licence checked on the publisher pages)

1. **Quaternius — RPG Character Pack**  
   Source: https://quaternius.com/packs/rpgcharacters.html  
   The pack page describes six rigged, animated, textured fantasy characters and marks the licence CC0; FBX, OBJ, Blend and glTF are listed. This is the strongest immediate source for replacing the two primitive humanoid designs with authored characters. It is not yet integrated into this single-file build.

2. **Quaternius — Ultimate Stylized Nature Pack**  
   Source: https://quaternius.com/packs/ultimatestylizednature.html  
   The pack page lists 60+ nature assets, seamless textures and normal maps, formats including glTF, and CC0. Use it to replace repeated blob trees, simple rocks, and scattered grass with coherent authored foliage and ground dressing.

3. **Three.js**  
   Examples: https://threejs.org/examples/  
   Post-processing manual: https://threejs.org/manual/pages/how-to-use-post-processing.html  
   A proper engine and glTF loader would unlock imported meshes, material maps, environment lighting, shadows, and restrained colour grading. The current renderer is hand-written raw WebGL and has no glTF loader; simply linking to a pack does not make its files usable by the current code.

## Integration gates

- Download the chosen packs and retain their licence files and original source URLs in the release.
- Migrate the renderer to a pinned, local Three.js build (MIT) and glTFLoader; do not rely on a live CDN for the release.
- Import the glTF models, validate texture paths and animation clips, then replace—not layer over—the procedural hero meshes.
- Use one coherent stylized nature pack, a designed ground material, directional light with contact/cast shadows, atmospheric depth, and a deliberate camera composition.
- Capture the new build in an actual WebGL browser and inspect screenshots before calling the art pass complete.

## Current limitation

This execution environment cannot resolve external hosts from the container (`curl` fails DNS), and Chromium headless hangs rather than producing a screenshot. Therefore the actual model archives could not be downloaded here and this iteration cannot honestly claim that open-source models have been integrated or visually verified. The URLs above are actionable, but source links alone are not a finished asset integration.

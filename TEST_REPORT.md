# WILD MEADOW — test report

Date: 2026-10-18

## Project inspection and baseline

- Inspected the available project variants under `/mnt/data/wild-meadow*` and the mounted `/mnt/data/files/index.html` source.
- The authoritative runtime entry point for this standalone variant is `index.html`; no `package.json`, bundler or separate build step is required.
- Renderer: raw WebGL 1 with inline GLSL ES shaders and runtime-generated geometry.
- Runtime assets: none loaded from the network; no external URL dependencies found.
- The earlier baseline's existing test report documented a failed headless Chromium graphics initialisation. I attempted a new Playwright run against both `http://127.0.0.1:8765/` and `file:///mnt/data/wild-meadow-fixed/index.html`; both navigation attempts were blocked with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Therefore, no genuine browser-render screenshot was produced in this environment.

## Implemented

- Fixed the grass deformation path so the sway modifies the position passed into the MVP transform.
- Replaced unseeded procedural randomness with a deterministic seeded generator.
- Split static world, grass, forest spirit, warrior and sword into separate batches (six draw calls per frame in the mock run).
- Added a 20-second, five-keyframe eased camera timeline, character idle breathing deformation and a timed sword movement.
- Added face detail meshes, resize handling, visibility pause, WebGL context-loss messaging and visible JavaScript errors.

## Checks performed

1. Inline JavaScript extraction and `node --check`: **PASS**.
2. `node tests/mock-webgl-smoke.cjs`: **PASS (mock/API-level only)**.
   - One render callback executed without JavaScript exceptions in the harness.
   - Six mocked draw calls; 25,719 triangles per frame inferred from index counts.
   - No out-of-range index reads found by the harness.
   - All uploaded float geometry values were finite in the harness.
   - 996 buffers created and 984 deleted during setup; 12 buffers remain for six active batch pairs in the mocked run.
   - Cumulative buffer upload volume in the mock: 1,350,096 bytes. This is a JavaScript harness measurement, not a real GPU-memory measurement.
   - Seeded generation, five timeline keyframes, visibility/resize/context-loss listeners, and no external runtime URLs checked.
3. Static HTTP smoke test on the earlier variant: `GET /` returned HTTP 200 and served the HTML. This establishes static serving only, not rendering of the current release build.
4. `curl`/local HTTP was available, but Chromium navigation from Playwright was blocked by the environment policy with `ERR_BLOCKED_BY_ADMINISTRATOR`.

## Visual review

- Genuine screenshot: **NOT CAPTURED**.
- Camera angles/character close-ups: **NOT VISUALLY INSPECTED**.
- The shader correction and scene changes are code-reviewed, but visual improvement is **not verified** without rendered pixels.

## Not tested / blocked

- Real browser WebGL shader compilation and pixel output: **BLOCKED** by browser navigation policy in this container.
- Browser console/network results from a real render: **NOT TESTED**.
- Physical iPhone 14 Safari: **NOT TESTED**.
- Embedded ChatGPT runtime: **NOT TESTED**.
- Actual FPS, frame-time percentiles, thermal behaviour, GPU memory, real draw calls and sustained runtime: **NOT MEASURED**.
- Character art quality, visible clipping/intersections, grass density from the camera, actual animation appearance and cinematic composition: **NOT VISUALLY VERIFIED**.

## Release status

This is a tested source-level iteration with a passing mock/API-level smoke test. It is **not** a verified visual release and does not yet satisfy the full requested character-art or cinematic quality gate. The highest-impact next step is to open the exact delivered HTML in a real browser/device, capture the five timeline views and character close-ups, then iterate from the observed render. Physical iPhone verification remains required before claiming iPhone compatibility.

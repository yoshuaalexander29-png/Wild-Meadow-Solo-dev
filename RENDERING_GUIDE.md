# WILD MEADOW — Real Rendering / Screenshot Recovery Guide

This guide separates **real pixel rendering** from the existing mock-WebGL smoke test. The mock test does not prove that shaders compile or that pixels are rendered.

## Current evidence (2026-10-18)

- `node tests/mock-webgl-smoke.cjs`: passes at mock/API level only.
- `node --check` on the extracted inline script: passes.
- The installed Chromium is `144.0.7559.96`.
- Chromium screenshot attempts timed out, including a simple `data:` page and the actual `index.html`; no PNG was produced. Logs included `xcb_connect() failed`, `EGL_NOT_INITIALIZED`, and `Failed to create shared context for virtualization`. This is a browser/GPU execution-environment failure, not evidence that the game itself rendered or failed to render.
- Genuine browser screenshots are now included in `evidence/render-00s.png`, `render-04s.png`, `render-08s.png`, `render-12s.png`, `render-16s.png`, and `render-20s.png`; `evidence/contact-sheet.png` shows all six views. These are real pixel captures of the WebGL scene, not mock images. They show a functioning but visibly early-stage scene; the characters and sparse ground detail remain the dominant visual defects.
- The six captures are 1280×800. Browser version, actual graphics backend/renderer string, measured frame timing, and physical-device behaviour have not yet been recorded, so these images establish pixel output only—not iPhone compatibility or performance.

## Route A — Use the real target: iPhone Safari

Do not rely on iOS Files Quick Look to run the JavaScript/WebGL app. Serve it from an HTTPS site instead.

1. Publish the contents of this folder as a static site (for example, a private or temporary GitHub repository with GitHub Pages, or a static-hosting service you trust). The site needs only `index.html` and the documentation files; the scene currently has no external runtime asset URLs.
2. Open the resulting **HTTPS** page in Safari on the iPhone 14.
3. Wait until the scene has visibly rendered, then capture the screen at approximately 0 s, 4 s, 8 s, 12 s, 16 s, and 20 s. Also capture one close-up of each character if possible.
4. Attach the screenshots or a screen recording to the project conversation. A screenshot from the real iPhone is the strongest available evidence for the intended device.
5. If a Mac is available, enable Settings → Apps → Safari → Advanced → Web Inspector on the iPhone, connect it to the Mac, then inspect the page from Safari's Develop menu. Apple documents this workflow: https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios

## Route B — A different local browser engine

Playwright supports separate Firefox and WebKit browser binaries; WebKit is useful as a Safari-engine approximation, although it is not Apple's branded Safari and is not a physical-iPhone test.

From a machine with package/CDN access:

```bash
npm init -y
npm install --save-dev playwright
npx playwright install webkit firefox
```

Then use Playwright to open `http://127.0.0.1:4173`, wait for the canvas to render, collect console/page errors, and save screenshots at fixed timeline times. Playwright browser installation docs: https://playwright.dev/docs/browsers

A working capture path has now produced six actual 1280×800 scene screenshots, recorded at nominal timeline points 0, 4, 8, 12, 16 and 20 seconds. The screenshots demonstrate pixel output, but the precise browser launch path and WebGL renderer metadata still need to be logged before performance or backend claims can be made.

## Route C — Remote browser screenshot service

Browserless documents a `/screenshot` API that can render a supplied URL or inline HTML and return a PNG. This avoids the local Chromium installation, but requires an account/API token and sends the supplied source/page to a third-party service. Do not send secrets or private data. Documentation: https://docs.browserless.io/rest-apis/screenshot-api

Recommended workflow:

1. First host the static site at a temporary HTTPS URL, or submit the self-contained HTML through the documented inline-HTML field.
2. Run a tiny WebGL capability check in the remote browser before trusting its screenshot: request a `webgl` context and record `getParameter(RENDERER)` if available.
3. If WebGL is unavailable or the image is blank, the service's browser/GPU configuration is not suitable; do not treat that as a game defect without corroborating browser evidence.
4. Capture at fixed times and inspect the returned PNGs. A screenshot service is a remote browser render, not proof of iPhone performance.

## Minimum evidence to record

For every render attempt, save:

- Browser/runtime version and operating system.
- URL type (`file://`, localhost, or HTTPS).
- WebGL context result and renderer string (when available).
- Console errors and failed network requests.
- Screenshot path, viewport size, and timeline timestamp.
- Whether the result came from a real browser, a simulated/mock harness, or a physical iPhone.

Never label the mock smoke test as visual verification.

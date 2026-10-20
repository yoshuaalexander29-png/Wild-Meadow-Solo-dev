# Wild Meadow — Playable Anime Fantasy Environment

An explorable, third-person anime-fantasy meadow environment inspired by **Genshin Impact's Mondstadt**, built with **React 19**, **TypeScript**, **Vite**, and **Three.js**.

---

## Gameplay & Features

### 1. Responsive Third-Person Knight Controller
- **Character:** Quaternius CC0 `Knight_Male.glb` with real-time animation blending (`Idle`, `Walk`, `Run`).
- **Dynamic Speed & Damping:** Smooth acceleration, variable walk (~2.8 m/s) and sprint (~6.2 m/s) speeds, frame-rate independent rotation damping facing the direction of travel.
- **Footstep Audio:** Procedural soft grass rustle footsteps synchronized to movement speed.
- **Terrain Grounding & Collision:** Real-time height sampling with `getTerrainHeight(x, z)` and circle-capsule obstacle collision resolution preventing walking through trees, boulders, or ruin pillars.

### 2. Exploration Orbit / Follow Camera
- **Full 360° Orbit:** Horizontal yaw and vertical pitch elevation (-12° to +66°) with spring-like follow damping.
- **Zoom Adjustment:** Smooth distance zoom (3.0m to 11.0m) via mouse wheel.
- **Terrain Clearance:** Camera position is dynamically clamped above terrain elevation to prevent clipping through hills.
- **Optional Cinematic Mode:** Seamless toggle between player exploration and cinematic 5-shot tour.

### 3. Reactive Field Grass & Vegetation
- **Ambient Multi-Frequency Wind:** Broad travelling wind gusts across the meadow.
- **Character Interaction Deformation:** 6,800+ instanced blades bend away radially and downward when the knight steps through them, elastically springing back as he passes.
- **Genshin Stylized Cel Shading:** Base-to-tip color gradient (deep jade root `#2e6a25` to sunlit anime lime `#8fe352`).
- **Path Parting:** Grass naturally clears along the winding exploration dirt trail.

### 4. Explorable Mondstadt Landscape
- **Landmark 1 — The Ancient Windrise Oak:** Majestic ancient tree with spreading buttress roots and multi-tiered leafy canopies.
- **Landmark 2 — Weathered Ancient Ruin Arch:** Overgrown mossy stone pillars, broken cross lintel, and altar platform.
- **Landmark 3 — Scenic Overlook Bluff:** High-ground promontory with viewing boulders overlooking the valley and distant mountains.
- **Atmosphere:** Azure sky (`#7ecbf7`), soft distance fog (`#a0daf5`), warm golden sunlight (`#fff8d8`), and drifting Anemo dandelion motes.

### 5. Controls

#### Desktop
- **W / A / S / D** or **Arrow Keys:** Move the knight relative to the camera heading.
- **Left Shift / Right Shift:** Sprint.
- **Mouse Drag (Left Click):** Rotate camera around the knight.
- **Mouse Wheel:** Zoom in and out.

#### Touch / Mobile
- **Virtual Joystick (Bottom-Left):** Drag to move in any direction relative to the camera.
- **Sprint Button (Bottom-Right):** Tap to toggle sprint mode.
- **Touch Drag (Right Side / Screen):** Orbit camera around the knight.

---

### 6. Authored Speedway Course

- **Mainline + Canopy Cut:** The route fork and merge share waypoint data; the cut is measured against the longer mainline detour rather than being a second unrelated decoration.
- **Elevated traversal:** The running ribbon follows an authored lift profile with instanced timber supports. A short mainline gap is cut from both the rendered ribbon and the collision query; the Canopy Cut bypasses it.
- **Shared geometry contract:** `src/scene/courseLayout.ts` is the source for route points, widths, elevations, gap intervals, and cue positions. The renderer and support-surface resolver sample the same arc-length curves.
- **Visual hierarchy:** Muted meadow-stone lanes, darker moss shoulders, and a restrained amber guide/cue palette distinguish the playable route without replacing the pastoral environment with neon UI.
- **Physical safeguards:** Elevated support resolution is height-aware, so a character underneath a deck does not get pulled upward through it. Route widths, obstacle/stream clearance, lift grades, gap range, and shortcut length are regression-checked.

## Technical Architecture & Reused Techniques

- **Grass Deformation:** Inspired by `threejs-field-grass` and `three-stylized` using GPU-accelerated vertex displacement in `InstancedMesh` via `material.onBeforeCompile`.
- **Character Controller:** Camera-relative movement angle derivation adapted from `React-Three-Fiber-Character-Controller` patterns translated directly to native Three.js.
- **Audio:** Zero-dependency procedural synthesis using the browser's native `AudioContext` (pink noise wind buffer + bandpass filter + pentatonic chime harmonics + soft grass footsteps).

## Game-feel tuning and timing

Movement response values live in `src/scene/gameFeel.ts` so the controller, camera, and deterministic tests share one documented source of truth.

| Parameter | Current value | Intent |
|---|---:|---|
| Coyote time | 0.16 s | Allow a short late jump after leaving a ledge |
| Jump buffer | 0.20 s | Remember a jump press shortly before landing |
| Jump initial vertical speed | 7.2 m/s | Set takeoff strength |
| Gravity | 21.0 m/s² | Set the main jump arc |
| Apex hang threshold | 1.8 m/s | Reduce gravity near the apex |
| Apex gravity scale | 0.65 | Briefly widen the apex timing window while the character is still rising; descent uses full gravity |
| Vertical integration substep | 1/120 s | Bound integration steps within accepted frame deltas |
| Ground acceleration response | 18 s⁻¹ | Reach target horizontal speed promptly |
| Ground braking response | 24 s⁻¹ | Stop more decisively than accelerating |
| Air-control response | 10 s⁻¹ | Preserve steering while limiting mid-air direction changes |
| Ground turn response | 18 s⁻¹ | Smooth heading changes without an abrupt snap |
| Camera look-ahead | min(speed × 0.20 s, 1.8 m) | Preview nearby traversal without excessive leading |

Apex assistance is deliberately rising-only: reducing gravity for small-magnitude downward velocity made landings floatier and extended short drops, so the integrator now applies the 0.65 gravity scale only for positive vertical velocity below the 1.8 m/s threshold. A regression test checks rising and descending cases independently.

The controller uses a shared, tested delta clamp: frame deltas are limited to 1–50 ms, and non-finite values fall back to 1/60 s. A 120 ms hitch therefore advances one controller update by at most 50 ms; it does not yet run the *entire* movement/collision controller on a fixed-step accumulator. The vertical integrator substeps internally, but this does not make collision resolution or horizontal movement fully deterministic across frame rates. Do not treat the jump-integrator test as a full-controller certification.

Game-feel values are engineering starting points, not universal standards. A playable browser session and repeated jumps at multiple approach speeds are still required to tune them by feel. Validate both low-speed approaches and sprint approaches before changing the gap dimensions or jump strength.

### Engineering references

- [Godot: Physics interpolation and render/physics timing](https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/physics_interpolation_introduction.html) — explains why physics tick rate and render rate are distinct, and why fixed-step simulation is more predictable. Wild Meadow borrows the principle, not Godot-specific code.
- [Three.js: WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) — official renderer statistics and explicit renderer disposal guidance.
- [r/aigamedev: level-design tool discussion](https://www.reddit.com/r/aigamedev/comments/1qi9xtl/would_you_use_this_level_design_tool/) — useful reminder that traversal mechanics and level geometry must be considered together.
- [r/gamedesign: platformer design tips](https://www.reddit.com/r/gamedesign/comments/hy3jc5) — community advice on player-assistance windows and iterating on mechanics. Treat discussion as qualitative perspective, not authoritative measurement.

No external runtime library was added for this iteration. The existing native Three.js/TypeScript architecture already supports these small helpers, so adding another dependency would increase integration and maintenance cost without solving a demonstrated problem.

## Build & Verification

```bash
npm install
npm run dev    # Starts Vite dev server on 0.0.0.0:3000
npm run build  # Compiles TypeScript and builds production bundle
npm run lint   # Verifies TypeScript types with zero errors
npm test       # Bridge, route, gap, boardwalk, support-height, and jump-physics regression checks
```

## Asset Licenses

- **Knight Character Model (`Knight_Male.glb`):** Quaternius under **CC0 1.0 Universal** (Public Domain).


## Authored course and verification

The current course is authored from the shared route definitions in `src/scene/courseLayout.ts`. Rendering, support-height queries, and automated checks consume that same data.

- **Mainline:** a warm limestone lane with restrained brass guidance, an elevated profile, and an optional jump gap.
- **Canopy Cut:** a shorter, muted sage route that bypasses the gap and rejoins the mainline.
- **Physical consistency:** lane width, lift profile, gap intervals, support normals, and merge elevations are queried from the same route definition. The visual gap and collision gap are both driven by the shared gap interval.
- **Resource discipline:** route ribbons and guidance rings have explicit disposal; repeated guidance cues, board planks, and timber supports use instancing. Board spacing is measured in metres, and plank thickness is shared with the support-height query.
- **Palette discipline:** limestone, moss, sage, and brass are reused across the lane, edging, markers, and supports rather than introducing unrelated neon colors.

### Verification

The Node 20 GitHub Actions workflow runs:

```sh
npm run lint
npm test
npm run build
```

The verification suite checks bridge support, course entry distance, sampled obstacle and brook clearance, shortcut length, ramp grade limits, ramp-aware support normals, the open collision gap, one-sided elevated-deck support, boardwalk/support-height agreement, directional camera anticipation, horizontal acceleration/braking/air-control response at 30/60/120 FPS, coyote/buffer timing, vertical jump integration at 30/60/120 FPS plus a 120 ms integrator step, exact-centre obstacle recovery, perimeter sliding, and idempotent course disposal. Horizontal motion tests exercise the same pure response kernel used by the controller; they are not a full end-to-end simulation of all controller state and collision ordering.

Latest successful CI run (Node 20, commit `004c5ec3d8b37fe716730699b8d738baa45c2423`) reported:
- One-second horizontal response toward a 7.0 m/s target using the shared exponential response: **6.9997 m/s** at 30, 60, and 120 FPS.
- Vertical-only jump-integrator estimate at 7.2 m/s initial velocity: flight times of **0.800 s / 0.783 s / 0.775 s** at 30/60/120 FPS, corresponding to estimated horizontal ranges of **5.60 m / 5.48 m / 5.42 m** at a constant assumed 7.0 m/s horizontal speed.
- A 120 ms integrator test step produced a **0.840 s** sampled flight time and **5.88 m** estimated range. This is a numerical integration check, not a test of the full controller during a 120 ms browser hitch: the controller currently clamps each update delta to 50 ms.

These numbers are automated model outputs, not in-game telemetry, actual landing success rates, or measured player experience. No live-device frame-time, GPU draw-call, memory, or visual screenshot measurements have been captured in this environment.

A code review also found and fixed a collision edge case: an actor exactly at an obstacle's centre was previously skipped by the distance epsilon guard. Collision resolution now chooses a deterministic separation normal (opposite incoming motion, or +X when stationary); the regression test checks the resolved centre distance against the obstacle plus player radius. This improves recovery from invalid/overlapping spawn states but does not replace swept collision detection for high-speed tunnelling.

Automated checks do **not** replace a browser playthrough. Camera framing, visual seams, jump feel at different approach speeds, mobile readability, and performance still require runtime inspection on the target game build before the course can be called visually validated. The CI suite verifies the shared vertical integration algorithm, but does not yet simulate the complete character controller with horizontal acceleration, coyote time, collision footprint, and actual landing surfaces.


## Traversal evidence update — 20 October 2026

This section supersedes older statements about the latest verification run. The CI run for commit `a9622cd8de7cba1cea601187a470e8d208c253f4` passed type-check, the verification suite, and production build: [run 39494801851](https://github.com/yoshuaalexander29-png/Wild-Meadow-Solo-dev/actions/runs/39494801851).

### Measured results and what they prove

- **Actual controller update path, movement fixture:** one second of sprint input travelled **6.72 m / 6.67 m / 6.64 m** at 30 / 60 / 120 FPS. Spread: **0.08 m**. After one second of braking, horizontal speed was **0.000 m/s** at all three rates. This fixture starts at (28, 28), inside the 48 m radial boundary and away from authored obstacles; an earlier fixture outside the boundary produced misleading displacement and was corrected.
- **Actual controller update path, jump buffering:** at 120 FPS, a press buffered during descent was consumed after landing and produced a second takeoff. This covers a flat-ground fixture, not the elevated course gap.
- **Authored mainline gap:** route-curve chord **3.47 m**; landing deck is **0.13 m higher** than the takeoff deck. The production vertical integrator estimates **0.717 s** until descending through the landing elevation. Constant-horizontal-speed estimates over that window are **2.01 m at 2.8 m/s**, **3.73 m at 5.2 m/s**, and **5.02 m at 7.0 m/s**. The 0.42 m player radius is recorded, but is not added to root-centre travel: the course support resolver queries the root centre, not a swept capsule footprint.
- The nominal run-speed estimate exceeds the gap chord by only **0.26 m**. This is a narrow theoretical margin and ignores acceleration history, route curvature, landing-edge tolerance, collision ordering, and actual in-game input. It is **not** evidence that a low-speed or real-controller jump across the gap succeeds.
- Existing vertical-integrator tests report a **0.733 s** same-height flight estimate at 30 / 60 / 120 FPS, with a constant assumed 7 m/s horizontal range of **5.13 m**. A separate long-step integrator check and the controller delta-clamp tests do not simulate the whole controller through a browser hitch.

### Controller-level versus isolated tests

The verification suite now includes the production `createCharacterController(...).update(...)` path for frame-rate movement/braking, a buffered second jump, and one actual run-speed jump across the authored gap at 120 FPS. That jump used a 0.85 input magnitude, reached **5.14 m/s** takeoff speed, progressed **3.64 m** against the **3.47 m** gap chord, and landed on a surface reported as `course`. This is a successful deterministic controller fixture, not visual or player testing. Existing pure-function checks exercise the horizontal response kernel, jump-assist timers, vertical integration, and delta clamping. Surface-resolver checks cover the mainline gap being absent from support, landing on an elevated course, and avoiding magnetic support from below the deck.

Still **not** end-to-end verified: the gap at slow and sprint approaches; the same full-controller jump at 30 and 60 FPS; coyote-time activation in the full controller; landing-edge tolerance across the character footprint; a full under-deck jump trajectory; missed-jump recovery through the actual controller; and traversal from fork through merge and finish. The constant-speed reach envelope is geometry plus the production vertical integrator, not a substitute for those scenarios.

### Route and environmental-storytelling audit

The shared route data currently defines a 14-waypoint **Meadow Mainline**, a five-waypoint **Canopy Cut**, a mainline gap at normalized curve interval `[0.42, 0.465]`, and shared fork/merge coordinates. The renderer removes deck planks across the gap, and the support query uses the same gap interval. Elevated portions use instanced timber planks and timber posts, while the shortcut provides a route around the missing deck. These are the current construction/readability signals evidenced by source code.

This pass adds instanced timber crossbeams beneath the raised route, tying existing support posts together so the boardwalk has a clearer load-bearing construction logic. It does **not** add a new log/rope/repair-worksite prop cluster. Without a live view, placing decorative props by guessed coordinates could clutter the route or obscure the camera, and would not prove environmental storytelling. The existing fork, jump approach, landing, Canopy Cut, boardwalk, merge, scenic reveal, return, and finish therefore remain **a code-level route audit, not a confirmed coherent visual story**. The missing deck still needs a clear in-world reason visible to the player, and the route needs genuine screenshot review before it can be called visually readable or convincing.

### Visual evidence, performance, and remaining limitations

- **Live visual QA:** unavailable in this session. No browser/game preview or screenshot capture was exposed; no genuine gameplay screenshots were inspected. Visual cohesion, route readability, camera framing, deck seams, prop placement, and mobile readability remain unverified.
- **Performance:** no measured frame times, draw calls, GPU timings, or memory profile were captured. Keep profiling on the backlog until the game can run under measurement.
- **Lifecycle:** the automated suite checks that the course's owned objects are removed and repeated course disposal is safe. Full-scene teardown and long-session GPU/memory behaviour have not been profiled.
- **Verification commands:** the repository CI runs `npm install --no-audit --no-fund`, `npm run lint` (TypeScript `tsc --noEmit`), `npm test` (`tsx src/tests/bridge_tree_verification.ts`), and `npm run build` (`tsc && vite build`). The current CI result is the authoritative check; this session does not have a local checkout to independently run those shell commands.

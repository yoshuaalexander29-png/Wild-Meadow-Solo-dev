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


## Traversal verification update — 20 October 2026

The deterministic suite now includes a production-controller fixture and a geometry-derived jump-reach envelope. These are deliberately separated from live gameplay evidence.

- **Authored gap geometry:** the shared mainline spline gives a horizontal endpoint chord of **3.47 m**; the sampled landing support is **0.13 m higher** than takeoff. The production vertical integrator, stepped at **1/120 s**, reaches that relative height after **0.717 s** in this fixture.
- **Estimated constant-speed reach, not an actual jump:** 2.8 m/s walk = **2.01 m**, 5.2 m/s run = **3.73 m**, and 7.0 m/s sprint = **5.02 m** over that window. The 0.42 m horizontal collision radius is recorded separately: the current support query resolves the character root centre against the course, so body radius must not be added to the root-centre travel distance as if the resolver were a swept capsule. This supports the authored gap as a run/sprint challenge, but does **not** prove that a live jump lands reliably.
- **Production controller movement:** createCharacterController(...).update(...) was exercised for one second of sprint input and one second of no-input braking at 30/60/120 FPS on a terrain fixture inside the meadow boundary. Sprint travel was **6.72 / 6.67 / 6.64 m**; residual horizontal speed after braking was **0.000 m/s** at each rate. The travel spread was **0.08 m**. These are automated fixture results, not browser telemetry or a player-feel judgment.
- **Production jump assistance:** the actual controller update path was exercised for an initial jump followed by a jump press buffered during descent; the test observed the second takeoff. The coyote/buffer timer helper also has isolated unit tests.
- **Surface resolver:** existing checks cover a missing support surface inside the gap, a descending landing query on the elevated course, and a character below the boardwalk not being pulled upward through it. These exercise production surface-query functions, but the complete controller has not yet been driven through the gap and observed landing on the far deck.
- **Frame timing:** the shared controller delta clamp is tested for a 120 ms input hitch and invalid values. The complete controller is **not** on a fixed-step accumulator; horizontal movement and collision resolution are still render-update-driven.

### Route-fiction audit and visual evidence

The current course already has shared route geometry for the Meadow Mainline and Canopy Cut, moss-coloured shoulders, an amber direction guide, raised timber planks, and instanced support posts. The wider environment contains a fallen timber log near (-14, 2) and a campsite/worksite cluster with cut wood and a barrel. These provide a starting vocabulary for woodland use and repair.

This iteration did **not** add new decorative props: no live preview/browser was available in the engineering session, and adding scenery blind would risk obscuring the playable lane or worsening camera framing. In particular, there is not yet visual evidence that the jump approach, gap edges, landing, Canopy Cut, merge, scenic reveal, return, and finish read as one coherent woodland worksite. The deck supports are functional visual structure in code, but rope lashings, damaged supports, cut-log placement, and route-specific worksite storytelling remain unverified rather than claimed as finished.

### Verification and remaining gaps

The repository CI-equivalent commands are npm run lint (TypeScript tsc --noEmit), npm test (the Node/tsx terrain, course, game-feel, and controller verification script), and npm run build (TypeScript compile plus Vite production bundle). A successful production build currently reports a **919.64 kB minified JavaScript chunk** (**255.86 kB gzip**) and Vite's over-500-kB chunk warning. That is a bundle-size warning, not measured runtime frame-time evidence; profiling remains separate.

Still unverified: actual jump landings at slow, run, and sprint approach speeds; complete route traversal; camera framing and composition at the requested route checkpoints; mobile readability; screenshot-based visual coherence; runtime frame time, draw calls, GPU/CPU memory, and repeated scene lifecycle behaviour in a browser. Course-object disposal has an idempotency test, but this does not establish whole-scene resource correctness. No industry-leading or fully polished claim is warranted from these results.

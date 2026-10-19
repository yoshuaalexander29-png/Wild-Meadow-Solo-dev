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

## Technical Architecture & Reused Techniques

- **Grass Deformation:** Inspired by `threejs-field-grass` and `three-stylized` using GPU-accelerated vertex displacement in `InstancedMesh` via `material.onBeforeCompile`.
- **Character Controller:** Camera-relative movement angle derivation adapted from `React-Three-Fiber-Character-Controller` patterns translated directly to native Three.js.
- **Audio:** Zero-dependency procedural synthesis using the browser's native `AudioContext` (pink noise wind buffer + bandpass filter + pentatonic chime harmonics + soft grass footsteps).

## Build & Verification

```bash
npm install
npm run dev    # Starts Vite dev server on 0.0.0.0:3000
npm run build  # Compiles TypeScript and builds production bundle
npm run lint   # Verifies TypeScript types with zero errors
```

## Asset Licenses

- **Knight Character Model (`Knight_Male.glb`):** Quaternius under **CC0 1.0 Universal** (Public Domain).

# Wild Meadow — Genshin Impact Cozy Aesthetic Upgrade

Transform the 3D meadow scene into a vibrant, cozy Mondstadt-inspired fantasy environment (Genshin Impact aesthetic), remove the yellow sword and the modern character, re-center the cinematic choreography on the fantasy knight, and integrate ambient wind and meadow nature audio.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following directions were confirmed during clarification:
> - **Character Focus**: Remove the modern wanderer with the blue mohawk (`IMG_0908.jpeg`) and the floating yellow sword (`IMG_0909.jpeg`). Keep the Silverland fantasy knight as the central hero character and reposition him at stage center.
> - **Visual Style**: Vibrant Mondstadt meadow aesthetic featuring anime azure sky with soft gradient, lush emerald grass with rolling wind wave animations, anime-style rolling hills, and swirling glowing Anemo/dandelion motes.
> - **Atmospheric Audio**: Procedural soothing wind breeze and gentle meadow wind-chime harmonics using the Web Audio API (zero external audio file dependencies), with an interactive Sound toggle in the top HUD.

---

## 1. Overview & Core Concept

- **What It Does**: Presents a tranquil, anime-aesthetic 3D meadow diorama inspired by Genshin Impact's Mondstadt region (Windrise/Springvale). The fantasy knight stands amidst lush swaying grass, vibrant anime wildflowers, and glowing floating Anemo/dandelion motes while gentle breeze audio plays.
- **Target Audience / Mood**: Fans of cozy anime fantasy games, peaceful virtual dioramas, and Genshin Impact's idyllic nature exploration scenes.
- **Core Value**: Elevates the visual quality from a generic low-poly tech demo into a cohesive, atmospheric anime fantasy encounter with intentional camera pacing and immersive audio.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Initial Arrival**: The scene opens on the vibrant Mondstadt meadow with an anime sky gradient, rolling pastel hills, and drifting glowing motes. The status toast confirms the knight asset is ready.
2. **Cinematic Tour**: The 20-second camera sequence sweeps across the lush grass, moves in for a close-up portrait of the fantasy knight, and pans out to reveal the grand trees and distant mountain horizon.
3. **Interactive Orbit & Controls**: Users can drag to freely orbit the camera around the knight, pause or resume the sequence, jump to the next cinematic shot, or toggle ambient sound.

### Visual Identity & Theme
- **Color Palette & Atmosphere**:
  - Sky: Bright anime azure `#68b5e8` transitioning to soft horizon haze `#b8e4f7`.
  - Sun & Lighting: Warm golden key sunlight `#fff6d6` paired with cool sky hemisphere fill `#e8f7ff` and ground reflection `#6a8a55`.
  - Grass & Terrain: Vibrant Mondstadt green `#549e38`, `#6bb845`, `#7ecc50`, and `#8fdc5c`.
  - Distant Ridges: Layered pastel emerald `#78b88a`, `#8ecaa0`, and `#a3d9b4`.
  - Floating Motes: Luminescent dandelion tufts and soft cyan/emerald Anemo sparkles (`#a7f3d0`, `#e0f2fe`).
- **Typography & HUD Plates**:
  - Main wordmark in serif (`Georgia`) with clean gold uppercase eyebrow (`#f0dfa8`).
  - Frosted glass HUD plates with deep forest-glass gradient (`rgba(16, 38, 30, 0.88)` to `rgba(24, 52, 40, 0.82)`) and hairline border.
  - Buttons styled with warm parchment finish (`#f4eedb`), clear hover states, and smooth active press effects.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Character Re-centering & Removal**
  - *Chosen Approach*: Completely remove `Characters_Lis.glb` (modern blue-haired character), its contact shadow, and the standalone `Sword_Gold.glb`. Position the `Knight_Male.glb` model centrally at `(0, 0, -1.4)` and adjust all 5 camera shot focus points to center cleanly on him.
  - *Why*: Eliminates the jarring aesthetic clash between the sci-fi character/primitive sword and creates a balanced, peaceful hero focus.
- **Decision 2: Genshin-Inspired Procedural Particle System**
  - *Chosen Approach*: Create a custom Three.js particle system with drifting dandelion seeds and glowing Anemo motes with randomized orbital noise and vertical bobbing.
  - *Why*: Instantly evokes the magical, breezy atmosphere characteristic of Genshin Impact without requiring heavy external particle libraries.
- **Decision 3: Zero-Dependency Procedural Audio**
  - *Chosen Approach*: Synthesize ambient wind rustle (filtered white noise with gentle LFO modulation) and soft pentatonic chime tones via the browser's native `AudioContext`.
  - *Why*: Zero network latency, zero risk of 404 broken audio URLs, and lightweight cross-browser compatibility.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                                App.tsx                                 │
│  [State: isPaused, isMuted, shotIndex, captionHtml, statusText]        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│  HudHeader   │             │   Caption    │             │ StatusToast  │
│ [Brand/Btns] │             │ [Story Text] │             │ [Load Alert] │
└──────┬───────┘             └──────────────┘             └──────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MeadowCanvas (Ref Mount)                        │
│                                   │                                    │
│        ┌──────────────────────────┴──────────────────────────┐         │
│        ▼                                                     ▼         │
│ ┌─────────────────────────────┐               ┌──────────────────────┐ │
│ │     meadowScene.ts          │               │   proceduralAudio.ts │ │
│ │ - Anime Sky & Sunlight      │               │ - Filtered wind buff │ │
│ │ - Re-centered Knight GLB    │               │ - Soft chime bell    │ │
│ │ - Wind-Swaying Grass Mesh   │               │ - Start / Stop / Vol │ │
│ │ - Anemo Dandelion Particles │               └──────────────────────┘ │
│ │ - 5 Cinematic Camera Shots  │                                        │
│ └─────────────────────────────┘                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Mapping
- `src/scene/meadowScene.ts`:
  - Remove `ASSETS.forest` and `ASSETS.sword`.
  - Re-center knight to `(0, -1.4)`.
  - Update sky color, fog range, and directional sun warmth.
  - Add Anemo dandelion particle field with continuous wind drift.
  - Update `SHOTS` camera coordinates to track the central knight.
- `src/audio/proceduralAudio.ts`:
  - Native Web Audio synthesizer managing wind generator and harmonic chimes.
  - Exposes `initAudio()`, `toggleMute()`, `isMuted()`.
- `src/components/HudHeader.tsx`:
  - Add a Sound toggle button (`Audio: On / Off`) alongside `Restart`, `Pause`, and `Next shot ↗`.
- `src/App.tsx`:
  - Coordinates mute state, restart, pause, and next-shot callbacks.

import * as THREE from 'three';
import { getCourseSurface } from './courseLayout';

// -------------------------------------------------------------
// Unified Ghibli Countryside Terrain & Spatial Authoritative System
// Pure rolling hills, gentle meadows, winding crystal brook,
// arched timber bridge, and continuous physical collision.
// NO mountains, NO floating boundary geometry, NO invisible hazards.
// -------------------------------------------------------------

export interface ObstacleCollider {
  x: number;
  z: number;
  radius: number;
  label?: string;
}

// Authoritative Stream Boundaries & Coordinates
export const STREAM_MIN_X = -32.0;
export const STREAM_MAX_X = 32.0;
export const STREAM_BANK_WIDTH = 2.4;

export function getStreamCenterZ(x: number): number {
  return -x * 0.32 - 7.2 + Math.sin(x * 0.18) * 1.8;
}

/**
 * Calculates perpendicular distance to the meadow brook.
 * Takes into account the bounded headwaters (spring basin) and estuary/pond.
 */
export function getDistanceToStream(x: number, z: number): number {
  // If far past the headwaters or pond, distance increases rapidly
  if (x < STREAM_MIN_X - 3.0 || x > STREAM_MAX_X + 3.0) {
    const endX = x < STREAM_MIN_X ? STREAM_MIN_X : STREAM_MAX_X;
    const endZ = getStreamCenterZ(endX);
    return Math.hypot(x - endX, z - endZ) + 5.0;
  }

  const clampedX = THREE.MathUtils.clamp(x, STREAM_MIN_X, STREAM_MAX_X);
  const streamZ = getStreamCenterZ(clampedX);
  const perpDist = Math.hypot(x - clampedX, z - streamZ);
  return perpDist;
}

/**
 * Returns whether a point is inside the active visible water body.
 */
export function isInsideWaterBody(x: number, z: number): boolean {
  if (x < STREAM_MIN_X - 1.0 || x > STREAM_MAX_X + 1.0) return false;
  const dist = getDistanceToStream(x, z);
  return dist <= STREAM_BANK_WIDTH * 0.88;
}

// -------------------------------------------------------------
// Base Terrain Elevation (Pure Ghibli Rolling Countryside)
// Low rolling grassy rises, gentle swales, and natural clearings.
// All mountains, steep ridges, and artificial boundary walls have been removed.
// -------------------------------------------------------------
export function getBaseTerrainHeight(x: number, z: number): number {
  // Vast, gentle undulating countryside swells (Howl's / Totoro rolling green pastures)
  const swell1 = Math.sin(x * 0.035 + 0.6) * Math.cos(z * 0.035 + 0.3) * 1.15;
  const swell2 = Math.sin(x * 0.075 - z * 0.055) * 0.45;
  const swell3 = Math.cos(x * 0.02 + z * 0.028) * 0.65;

  // Landmark 1: The Great Ancient Oak Knoll at (-16, -18)
  const oakDist = Math.hypot(x + 16, z + 18);
  const oakKnoll = Math.max(0, 1 - oakDist / 14) * 1.9;

  // Landmark 2: Traveler's Camp Clearing at (2.2, 2.2) - gently leveled
  const campDist = Math.hypot(x - 2.2, z - 2.2);
  const campLevel = Math.max(0, 1 - campDist / 8) * 0.25;

  // Landmark 3: The Wind Rises Artist Knoll at (-11.5, 13.5) - sun-drenched wildflower hill
  const artistKnollDist = Math.hypot(x + 11.5, z - 13.5);
  const artistKnoll = Math.max(0, 1 - artistKnollDist / 13) * 1.45;

  // Landmark 4: Eastern Pastoral Rise at (22, 5) - gentle scenic vista over brook
  const eastRiseDist = Math.hypot(x - 22, z - 5);
  const eastRise = Math.max(0, 1 - eastRiseDist / 15) * 1.6;

  // Gentle Perimeter Horizon Swells (Radius 45m to 85m)
  // Seamlessly cups the meadow into rolling green horizon knolls without blocking sky
  const radialDist = Math.hypot(x, z);
  let perimeterRise = 0;
  if (radialDist > 42.0) {
    const pFactor = Math.min(1.0, (radialDist - 42.0) / 38.0);
    const wave = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 4.0 + 1.2);
    perimeterRise = pFactor * pFactor * (2.8 + wave * 1.6);
  }

  return swell1 + swell2 + swell3 + oakKnoll + campLevel + artistKnoll + eastRise + perimeterRise;
}

/**
 * Continuous physical terrain height with carved riverbed and banks.
 */
export function getTerrainHeight(x: number, z: number): number {
  const base = getBaseTerrainHeight(x, z);

  // Carve riverbed strictly within stream bounds
  if (x >= STREAM_MIN_X - 2.0 && x <= STREAM_MAX_X + 2.0) {
    const streamDist = getDistanceToStream(x, z);
    if (streamDist < STREAM_BANK_WIDTH) {
      // Smooth taper at stream endpoints (spring head and pond)
      let endTaper = 1.0;
      if (x < STREAM_MIN_X + 2.5) {
        endTaper = THREE.MathUtils.clamp((x - (STREAM_MIN_X - 1.5)) / 4.0, 0, 1);
      } else if (x > STREAM_MAX_X - 2.5) {
        endTaper = THREE.MathUtils.clamp(((STREAM_MAX_X + 1.5) - x) / 4.0, 0, 1);
      }

      const norm = streamDist / STREAM_BANK_WIDTH;
      // Cosine riverbed dip: 0.46m deep at stream center, smoothly rising to zero at bank rim
      const streamDip = (1.0 + Math.cos(norm * Math.PI)) * 0.5 * 0.46 * endTaper;
      return base - streamDip;
    }
  }

  return base;
}

/**
 * Water surface elevation: strictly within stream bounds, sits below meadow banks.
 * Never floats or hovers outside the stream bed.
 */
export function getWaterHeight(x: number, z: number): number {
  if (!isInsideWaterBody(x, z)) {
    return getTerrainHeight(x, z) - 1.0; // below ground if outside
  }

  const clampedX = THREE.MathUtils.clamp(x, STREAM_MIN_X, STREAM_MAX_X);
  const base = getBaseTerrainHeight(clampedX, getStreamCenterZ(clampedX));
  // Water surface sits 0.20m below the meadow bank rim, creating a crystal clear brook
  return base - 0.20;
}

// Calculate terrain normal for slope adaptation and asset placement
const _tempNormal = new THREE.Vector3();
export function getTerrainNormal(x: number, z: number, out = _tempNormal): THREE.Vector3 {
  const eps = 0.25;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  out.set(hL - hR, 2 * eps, hD - hU).normalize();
  return out;
}

// Footpath network (0 = on trail, > 2.5 = deep meadow)
export function getDistanceToPath(x: number, z: number): number {
  // Main path 1: Camp (2.2, 2.2) -> Bridge (-1.1, -6.9) -> Ancient Oak (-16, -18)
  const p1Z = -x * 0.42 - 6.6 + Math.sin(x * 0.14) * 2.5;
  const d1 = Math.abs(z - p1Z);

  // Branch path 2: Camp (2.2, 2.2) towards Artist Knoll (-11.5, 13.5)
  const p2Z = -(x - 2.2) * 0.85 + 2.2 + Math.sin(z * 0.18) * 1.1;
  const d2 = Math.hypot(x - (-4), z - 8) < 14 ? Math.abs(z - p2Z) : 99;

  // Branch path 3: Camp (2.2, 2.2) towards Eastern Pastoral Rise (22, 5)
  const p3Z = (x - 2.2) * 0.15 + 2.2 + Math.sin(x * 0.1) * 0.8;
  const d3 = Math.hypot(x - 12, z - 3.5) < 14 ? Math.abs(z - p3Z) : 99;

  return Math.min(d1, d2, d3);
}

// Surface types for footstep acoustic feedback, particle response, and hazard detection
export type SurfaceType = 'grass' | 'dirt' | 'stone' | 'wood' | 'water' | 'course';

export interface WalkableSurface {
  height: number;
  normal: THREE.Vector3;
  surfaceType: SurfaceType;
  waterDepth: number;
  isBridge: boolean;
  isDeepWater: boolean;
  slopeAngle: number;
}

// -------------------------------------------------------------
// Bridge Geometric Parameters (Spirited Away Vermilion Crossing)
// -------------------------------------------------------------
export const BRIDGE_CENTER_X = -1.1;
export const BRIDGE_CENTER_Z = -6.9;
export const BRIDGE_ROT_Y = -0.32;
export const BRIDGE_HALF_WIDTH = 1.2; // 2.4m wide comfortable walkway
export const BRIDGE_HALF_LENGTH = 2.6; // 5.2m span across brook banks

// Natural stepping stones allowing safe foot crossing across the brook
const STEPPING_STONES: { x: number; z: number; radius: number }[] = [
  { x: 5.5, z: -8.8, radius: 0.7 },
  { x: 6.4, z: -8.2, radius: 0.7 },
  { x: -7.8, z: -4.8, radius: 0.7 },
  { x: -8.7, z: -4.3, radius: 0.7 },
];

// Safe respawn checkpoint on the open campsite path
export const SAFE_RESPAWN = {
  x: 1.2,
  z: 0.2,
  rotY: -Math.PI * 0.25,
};

/**
 * Authoritative Bridge Deck Height Evaluator
 * Unifies the visual deck, the 4 grounded corner supports, bank abutments, and player collision.
 * Respects individual bank heights so deck spans naturally without clipping or floating.
 */
export function getBridgeDeckHeight(worldX: number, worldZ: number): {
  onBridge: boolean;
  deckHeight: number;
  normal: THREE.Vector3;
  localX: number;
  localZ: number;
  crown: number;
} {
  const dx = worldX - BRIDGE_CENTER_X;
  const dz = worldZ - BRIDGE_CENTER_Z;
  const cosR = Math.cos(-BRIDGE_ROT_Y);
  const sinR = Math.sin(-BRIDGE_ROT_Y);
  const localX = cosR * dx - sinR * dz;
  const localZ = sinR * dx + cosR * dz;

  if (Math.abs(localX) <= BRIDGE_HALF_WIDTH && Math.abs(localZ) <= BRIDGE_HALF_LENGTH + 0.35) {
    // Exact bank ground elevations at the two bridge ends
    const cosWorld = Math.cos(BRIDGE_ROT_Y);
    const sinWorld = Math.sin(BRIDGE_ROT_Y);

    const southX = BRIDGE_CENTER_X - sinWorld * (-BRIDGE_HALF_LENGTH);
    const southZ = BRIDGE_CENTER_Z + cosWorld * (-BRIDGE_HALF_LENGTH);
    const southGroundY = getTerrainHeight(southX, southZ);

    const northX = BRIDGE_CENTER_X - sinWorld * (BRIDGE_HALF_LENGTH);
    const northZ = BRIDGE_CENTER_Z + cosWorld * (BRIDGE_HALF_LENGTH);
    const northGroundY = getTerrainHeight(northX, northZ);

    // Normalized progress along bridge length (0 at south bank, 1 at north bank)
    const t = (localZ + BRIDGE_HALF_LENGTH) / (2 * BRIDGE_HALF_LENGTH);
    const spanBaseY = THREE.MathUtils.lerp(southGroundY, northGroundY, THREE.MathUtils.clamp(t, 0, 1));

    // Arch crown (graceful 0.08m rise at center for authentic Ghibli bridge curve)
    const normSpan = Math.min(1.0, Math.abs(localZ) / BRIDGE_HALF_LENGTH);
    const crown = Math.max(0, 1.0 - normSpan * normSpan) * 0.08;

    // Deck sits 0.24m above bank rim + crown
    const archDeckY = spanBaseY + 0.24 + crown;

    // Seamless threshold blend: smoothly ramp down to exact terrain height at the approach ends
    const terrainH = getTerrainHeight(worldX, worldZ);
    let finalDeckY = archDeckY;
    if (Math.abs(localZ) > BRIDGE_HALF_LENGTH - 0.45) {
      const taper = THREE.MathUtils.clamp((Math.abs(localZ) - (BRIDGE_HALF_LENGTH - 0.45)) / 0.8, 0, 1);
      finalDeckY = THREE.MathUtils.lerp(archDeckY, terrainH, taper);
    }

    // Deck normal follows the gentle arch slope
    const slopeZ = -2.0 * (localZ / BRIDGE_HALF_LENGTH) * (0.08 / BRIDGE_HALF_LENGTH);
    const normal = new THREE.Vector3(
      -sinWorld * slopeZ,
      1.0,
      cosWorld * slopeZ
    ).normalize();

    return {
      onBridge: true,
      deckHeight: Math.max(terrainH, finalDeckY),
      normal,
      localX,
      localZ,
      crown,
    };
  }

  return {
    onBridge: false,
    deckHeight: 0,
    normal: new THREE.Vector3(0, 1, 0),
    localX,
    localZ,
    crown: 0,
  };
}

/**
 * Evaluates the physical walkable surface at (x, z).
 * Handles the Spirited Away bridge deck, stepping stones, and brook depth.
 * Guarantees zero water death on dry ground, bridge approaches, or bridge deck.
 */
export interface SurfaceQueryContext {
  /** Character root Y before the current physics integration step. */
  characterY: number;
  /** Grounded state before surface resolution. */
  isGrounded: boolean;
  /** World-space vertical velocity; negative means descending. */
}

export function getWalkableSurface(
  x: number,
  z: number,
  context?: SurfaceQueryContext & { verticalVelocity: number }
): WalkableSurface {
  const terrainH = getTerrainHeight(x, z);
  const normal = getTerrainNormal(x, z);
  const slopeAngle = Math.acos(THREE.MathUtils.clamp(normal.y, -1, 1));

  // 1. Check Spirited Away Straight Vermilion Footbridge (Unified with bridgeSystem.ts)
  const bridgeEval = getBridgeDeckHeight(x, z);
  if (bridgeEval.onBridge) {
    // A bridge is a one-sided support surface: do not pull a character upward
    // through the deck when jumping/falling underneath it. A descending character
    // can land on it only while still at (or above) deck height.
    const mayUseDeck = !context ||
      (context.isGrounded && context.characterY >= bridgeEval.deckHeight - 0.48) ||
      (!context.isGrounded &&
        context.verticalVelocity <= 0 &&
        context.characterY >= bridgeEval.deckHeight - 0.08);
    if (mayUseDeck) {
      return {
        height: bridgeEval.deckHeight,
        normal: bridgeEval.normal,
        surfaceType: 'wood',
        waterDepth: 0,
        isBridge: true,
        isDeepWater: false,
        slopeAngle: bridgeEval.crown > 0.02 ? 0.02 : 0,
      };
    }
  }

  // The authored running lane is queried from the same route data as its mesh.
  // Height gating prevents an airborne character beneath the lane from snapping upward.
  const courseEval = getCourseSurface(x, z, getTerrainHeight);
  if (courseEval) {
    const mayUseCourse = !context ||
      (context.isGrounded && context.characterY >= courseEval.height - 0.48) ||
      (!context.isGrounded &&
        context.verticalVelocity <= 0 &&
        context.characterY >= courseEval.height - 0.08);
    if (mayUseCourse) return courseEval;
  }

  // 2. Check Natural Stepping Stones
  for (const stone of STEPPING_STONES) {
    const sDist = Math.hypot(x - stone.x, z - stone.z);
    if (sDist <= stone.radius) {
      const stoneHeight = getWaterHeight(stone.x, stone.z) + 0.12;
      return {
        height: Math.max(terrainH, stoneHeight),
        normal: new THREE.Vector3(0, 1, 0),
        surfaceType: 'stone',
        waterDepth: 0,
        isBridge: false,
        isDeepWater: false,
        slopeAngle: 0,
      };
    }
  }

  // 3. Check Stream Bed & Water Depth
  if (isInsideWaterBody(x, z)) {
    const waterH = getWaterHeight(x, z);
    const waterDepth = Math.max(0, waterH - terrainH);

    if (waterDepth > 0.02) {
      // Shallow wading: safe, pleasant brook splashing (~0.15m to 0.35m deep)
      // Deep water hazard is strictly in intentional deep pools (> 0.85m depth)
      const isDeep = waterDepth > 0.85;
      return {
        height: terrainH,
        normal,
        surfaceType: 'water',
        waterDepth,
        isBridge: false,
        isDeepWater: isDeep,
        slopeAngle,
      };
    }
  }

  // 4. Ground Surface Classification (Grass, Dirt Trail, Rock)
  const pathDist = getDistanceToPath(x, z);
  let surfaceType: SurfaceType = 'grass';
  if (pathDist < 1.35) {
    surfaceType = 'dirt';
  } else if (terrainH > 2.5 || Math.hypot(x + 11.5, z - 13.5) < 2.0) {
    surfaceType = 'stone';
  }

  return {
    height: terrainH,
    normal,
    surfaceType,
    waterDepth: 0,
    isBridge: false,
    isDeepWater: false,
    slopeAngle,
  };
}

// -------------------------------------------------------------
// Obstacle Colliders (Trees, Camp, Bridge Rails, Boulders, Easel)
// -------------------------------------------------------------
export const OBSTACLES: ObstacleCollider[] = [
  // Landmark 1: The Great Ancient Oak (Windrise Tree)
  { x: -16, z: -18, radius: 2.3, label: 'Great Oak Trunk' },
  { x: -14.3, z: -16.8, radius: 1.0, label: 'Oak Buttress Root' },
  { x: -17.5, z: -19.4, radius: 1.0, label: 'Oak Buttress Root' },
  { x: -14.7, z: -19.3, radius: 0.9, label: 'Oak Buttress Root' },

  // Landmark 2: Traveler's Rest Camp
  { x: 2.2, z: 2.2, radius: 0.85, label: 'Campfire Hearth' },
  { x: 3.4, z: 2.8, radius: 0.8, label: 'Camp Timber Bench' },
  { x: 1.0, z: 3.2, radius: 0.65, label: 'Camp Firewood Pile' },
  { x: 2.8, z: 1.0, radius: 0.35, label: 'Camp Lantern Post' },

  // Landmark 3: Spirited Away Vermilion Bridge Guardrails
  // Railings at localX = ±1.15m are colliders; center walkway corridor (x ~ -1.1) is open!
  { x: -2.15, z: -6.9, radius: 0.45, label: 'Bridge Left Rail' },
  { x: -0.05, z: -6.9, radius: 0.45, label: 'Bridge Right Rail' },

  // Landmark 4: The Wind Rises Artist Easel & Umbrella Knoll (-11.5, 13.5)
  { x: -11.5, z: 13.5, radius: 1.25, label: 'Wildflower Knoll Mossy Boulder' },
  { x: -10.6, z: 12.8, radius: 0.45, label: 'Artist Easel & Stool' },

  // Landmark 5: Eastern Pastoral Rise Granite Vista (22, 5)
  { x: 22.0, z: 5.0, radius: 1.4, label: 'Pastoral Granite Outcrop' },
  { x: 23.8, z: 6.8, radius: 1.1, label: 'Pastoral Boundary Stone' },
  { x: 21.0, z: 6.4, radius: 0.75, label: 'Pastoral Timber Bench' },

  // Weathered Fallen Cedar Timber Log
  { x: -14.0, z: 2.0, radius: 0.75, label: 'Fallen Cedar Log' },

  // Field Trees (Distinct archetypes with accurate trunk collision radii)
  { x: -7.5, z: -8.5, radius: 0.65 },
  { x: 8.5, z: -9.5, radius: 0.65 },
  { x: -12.0, z: -4.0, radius: 0.65 },
  { x: 16.0, z: -14.0, radius: 0.7 },
  { x: -5.0, z: -22.0, radius: 0.65 },
  { x: 4.0, z: -17.0, radius: 0.65 },
  { x: -22.0, z: -12.0, radius: 0.75 },
  { x: 20.0, z: -2.0, radius: 0.7 },
  { x: -8.0, z: 6.0, radius: 0.65 },
  { x: 6.0, z: 9.0, radius: 0.65 },
  { x: -18.0, z: 4.0, radius: 0.75 },
  { x: 12.0, z: 6.0, radius: 0.7 },
  { x: -24.0, z: 8.0, radius: 0.8 },
  { x: 22.0, z: -22.0, radius: 0.75 },
  { x: -8.0, z: 18.0, radius: 0.7 },
  { x: 14.0, z: 18.0, radius: 0.7 },
  { x: -2.0, z: 24.0, radius: 0.75 },

  // Large Weathered Field Boulders
  { x: -4.5, z: -13.5, radius: 1.1 },
  { x: 6.5, z: -4.5, radius: 1.15 },
  { x: -10.5, z: -27.0, radius: 1.2 },
  { x: 18.5, z: -20.0, radius: 1.1 },
  { x: 0.0, z: 12.0, radius: 1.15 },
];

/**
 * Continuous collision resolution with smooth tangent sliding.
 * Prevents getting stuck or clipping through obstacles.
 * Uses soft natural perimeter constraint without arbitrary invisible death.
 */
export function resolveCollision(
  currentX: number,
  currentZ: number,
  characterRadius = 0.42,
  velX = 0,
  velZ = 0
): { x: number; z: number; collided: boolean; slideVelX: number; slideVelZ: number } {
  let resolvedX = currentX;
  let resolvedZ = currentZ;
  let slideVelX = velX;
  let slideVelZ = velZ;
  let collided = false;

  // Check obstacle colliders
  for (const obs of OBSTACLES) {
    const dx = resolvedX - obs.x;
    const dz = resolvedZ - obs.z;
    const dist = Math.hypot(dx, dz);
    const minDist = obs.radius + characterRadius;

    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;

      // Push out to collider surface
      resolvedX = obs.x + nx * minDist;
      resolvedZ = obs.z + nz * minDist;
      collided = true;

      // Project velocity along collision tangent (frictionless sliding)
      const dot = slideVelX * nx + slideVelZ * nz;
      if (dot < 0) {
        slideVelX -= dot * nx;
        slideVelZ -= dot * nz;
      }
    }
  }

  // Soft perimeter boundary constraint (gentle pastoral meadow edge at radius 48m)
  // Character smoothly slides along outer boundary; NO sudden death trigger!
  const maxRadius = 48.0;
  const playerDist = Math.hypot(resolvedX, resolvedZ);
  if (playerDist > maxRadius) {
    const angle = Math.atan2(resolvedZ, resolvedX);
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    resolvedX = nx * maxRadius;
    resolvedZ = nz * maxRadius;
    collided = true;

    const dot = slideVelX * nx + slideVelZ * nz;
    if (dot > 0) {
      slideVelX -= dot * nx;
      slideVelZ -= dot * nz;
    }
  }

  return { x: resolvedX, z: resolvedZ, collided, slideVelX, slideVelZ };
}

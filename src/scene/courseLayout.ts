import * as THREE from 'three';

/** Shared authored route data. Rendering, surface queries and QA all consume this. */
export interface CourseRouteDefinition {
  name: string;
  points: Array<[number, number]>;
  width: number;
  edge: number;
  color: string;
  accent: string;
  rings: number[];
}

export const COURSE_SURFACE_LIFT = 0.065;
export const COURSE_SAMPLE_COUNT = 180;

export const COURSE_ROUTES: CourseRouteDefinition[] = [
  {
    name: 'Meadow Mainline',
    points: [[5.5, -1.0], [9.5, -2.8], [14.5, -5.0], [19.5, -7.8], [24.5, -9.0], [29.5, -6.5], [32.0, -1.0], [33.0, 5.5], [31.5, 11.5], [29.0, 17.5], [24.0, 22.5], [18.0, 25.0], [12.0, 25.5], [7.0, 24.5]],
    width: 2.9,
    edge: 0.16,
    color: '#d8c69a',
    accent: '#e5b45a',
    rings: [0.13, 0.62, 0.94],
  },
  {
    name: 'Canopy Cut',
    points: [[19.5, -7.8], [21.0, -4.8], [24.0, -2.0], [28.5, 0.8], [32.0, 5.5]],
    width: 2.25,
    edge: 0.13,
    color: '#a9c7b1',
    accent: '#e5b45a',
    rings: [0.52],
  },
];

interface RouteSample {
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  width: number;
}

const routeSamples = COURSE_ROUTES.map((route) => {
  const curve = new THREE.CatmullRomCurve3(
    route.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.35,
  );
  const points = Array.from({ length: COURSE_SAMPLE_COUNT + 1 }, (_, index) =>
    curve.getPointAt(index / COURSE_SAMPLE_COUNT)
  );
  return points.map((point, index): RouteSample => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: point.x,
      z: point.z,
      tangentX: dx / length,
      tangentZ: dz / length,
      width: route.width,
    };
  });
});

export interface CourseSurface {
  height: number;
  normal: THREE.Vector3;
  surfaceType: 'course';
  waterDepth: 0;
  isBridge: false;
  isDeepWater: false;
  slopeAngle: number;
}

/** Resolve the nearest authored route segment; no per-frame allocations on misses. */
export function getCourseSurface(
  x: number,
  z: number,
  terrainHeightAt: (x: number, z: number) => number,
): CourseSurface | null {
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestWidth = 0;
  for (const samples of routeSamples) {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq > 1e-8
        ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
        : 0;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const ex = x - px;
      const ez = z - pz;
      const distanceSq = ex * ex + ez * ez;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestWidth = a.width;
      }
    }
  }
  if (bestDistanceSq > (bestWidth * 0.5) ** 2) return null;

  const terrainH = terrainHeightAt(x, z);
  const eps = 0.25;
  const hL = terrainHeightAt(x - eps, z);
  const hR = terrainHeightAt(x + eps, z);
  const hD = terrainHeightAt(x, z - eps);
  const hU = terrainHeightAt(x, z + eps);
  const normal = new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  return {
    height: terrainH + COURSE_SURFACE_LIFT,
    normal,
    surfaceType: 'course',
    waterDepth: 0,
    isBridge: false,
    isDeepWater: false,
    slopeAngle: Math.acos(THREE.MathUtils.clamp(normal.y, -1, 1)),
  };
}

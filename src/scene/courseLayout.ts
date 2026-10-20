import * as THREE from 'three';

/**
 * Authored, closed-loop speedway through the meadow's open eastern basin.
 * One data source drives both the visible ribbon and its collision surface.
 * Heights are lift above the sampled meadow, not absolute world elevations.
 */
export const COURSE_WIDTH = 3.4;
export const COURSE_HALF_WIDTH = COURSE_WIDTH * 0.5;
export const COURSE_SAMPLE_COUNT = 240;

export interface CourseWaypoint {
  x: number;
  z: number;
  lift: number;
}

// Deliberate broad-radius turns, a rising east-side sweep, and a descending
// return: no randomly scattered platforms, hard spline cusps, or palette changes.
export const COURSE_WAYPOINTS: readonly CourseWaypoint[] = [
  { x: 6.0, z: -1.0, lift: 0.22 },
  { x: 10.0, z: -4.0, lift: 0.28 },
  { x: 16.0, z: -7.0, lift: 0.70 },
  { x: 23.0, z: -7.0, lift: 1.45 },
  { x: 29.0, z: -2.0, lift: 1.70 },
  { x: 32.0, z: 6.0, lift: 2.05 },
  { x: 34.0, z: 14.0, lift: 2.70 },
  { x: 33.0, z: 21.0, lift: 2.90 },
  { x: 28.0, z: 27.0, lift: 2.35 },
  { x: 21.0, z: 29.0, lift: 1.80 },
  { x: 15.0, z: 25.0, lift: 1.35 },
  { x: 11.0, z: 19.0, lift: 0.95 },
  { x: 10.0, z: 12.0, lift: 0.58 },
  { x: 7.0, z: 5.0, lift: 0.30 },
];

export interface CourseSample {
  x: number;
  z: number;
  lift: number;
  tangentX: number;
  tangentZ: number;
}

const curve = new THREE.CatmullRomCurve3(
  COURSE_WAYPOINTS.map((point) => new THREE.Vector3(point.x, point.lift, point.z)),
  true,
  'centripetal',
  0.35,
);
const sampledCurve = curve.getPoints(COURSE_SAMPLE_COUNT);
export const COURSE_SAMPLES: readonly CourseSample[] = sampledCurve.map((point, index) => {
  const before = sampledCurve[(index - 1 + sampledCurve.length) % sampledCurve.length];
  const after = sampledCurve[(index + 1) % sampledCurve.length];
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: point.x, z: point.z, lift: point.y, tangentX: dx / length, tangentZ: dz / length };
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

const _courseNormal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Query the same sampled centerline used to build the rendered ribbon. */
export function getCourseSurface(
  x: number,
  z: number,
  terrainHeightAt: (x: number, z: number) => number,
): CourseSurface | null {
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestX = 0;
  let bestZ = 0;
  let bestLift = 0;
  let bestTangentX = 1;
  let bestTangentZ = 0;

  for (let i = 0; i < COURSE_SAMPLES.length; i++) {
    const a = COURSE_SAMPLES[i];
    const b = COURSE_SAMPLES[(i + 1) % COURSE_SAMPLES.length];
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
      bestX = px;
      bestZ = pz;
      bestLift = THREE.MathUtils.lerp(a.lift, b.lift, t);
      const length = Math.hypot(dx, dz) || 1;
      bestTangentX = dx / length;
      bestTangentZ = dz / length;
    }
  }

  if (bestDistanceSq > COURSE_HALF_WIDTH * COURSE_HALF_WIDTH) return null;

  const grade = (COURSE_SAMPLES[0].lift - COURSE_SAMPLES[0].lift); // stable zero seed for finite normal fallback
  void grade;
  // Estimate the surface normal from the same local tangent and terrain samples.
  const eps = 0.35;
  const hAlongBefore = terrainHeightAt(bestX - bestTangentX * eps, bestZ - bestTangentZ * eps);
  const hAlongAfter = terrainHeightAt(bestX + bestTangentX * eps, bestZ + bestTangentZ * eps);
  const hAcrossLeft = terrainHeightAt(bestX + bestTangentZ * eps, bestZ - bestTangentX * eps);
  const hAcrossRight = terrainHeightAt(bestX - bestTangentZ * eps, bestZ + bestTangentX * eps);
  const alongSlope = (hAlongAfter - hAlongBefore + bestLift * 0.0) / (2 * eps);
  const crossSlope = (hAcrossLeft - hAcrossRight) / (2 * eps);
  _courseNormal.set(
    -bestTangentX * alongSlope - bestTangentZ * crossSlope,
    1,
    -bestTangentZ * alongSlope + bestTangentX * crossSlope,
  ).normalize();
  const terrainH = terrainHeightAt(bestX, bestZ);
  return {
    height: terrainH + bestLift,
    normal: _courseNormal.clone(),
    surfaceType: 'course',
    waterDepth: 0,
    isBridge: false,
    isDeepWater: false,
    slopeAngle: Math.acos(THREE.MathUtils.clamp(_courseNormal.y, -1, 1)),
  };
}

/** Build the ribbon geometry from the authoritative centerline samples. */
export function createCourseRibbonGeometry(
  terrainHeightAt: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < COURSE_SAMPLES.length; i++) {
    const sample = COURSE_SAMPLES[i];
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const half = COURSE_HALF_WIDTH;
    const leftX = sample.x + sideX * half;
    const leftZ = sample.z + sideZ * half;
    const rightX = sample.x - sideX * half;
    const rightZ = sample.z - sideZ * half;
    const leftY = terrainHeightAt(leftX, leftZ) + sample.lift;
    const rightY = terrainHeightAt(rightX, rightZ) + sample.lift;
    positions.push(leftX, leftY, leftZ, rightX, rightY, rightZ);
    uvs.push(0, i / 8, 1, i / 8);
    const next = (i + 1) % COURSE_SAMPLES.length;
    const base = i * 2;
    const nextBase = next * 2;
    indices.push(base, nextBase, base + 1, base + 1, nextBase, nextBase + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCourseEdgeGeometry(
  terrainHeightAt: (x: number, z: number) => number,
  side: -1 | 1,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < COURSE_SAMPLES.length; i++) {
    const sample = COURSE_SAMPLES[i];
    const sideX = sample.tangentZ * side;
    const sideZ = -sample.tangentX * side;
    const x = sample.x + sideX * (COURSE_HALF_WIDTH - 0.08);
    const z = sample.z + sideZ * (COURSE_HALF_WIDTH - 0.08);
    const y = terrainHeightAt(x, z) + sample.lift;
    positions.push(x, y + 0.03, z, x, y + 0.22, z);
    const next = (i + 1) % COURSE_SAMPLES.length;
    const base = i * 2;
    const nextBase = next * 2;
    indices.push(base, nextBase, base + 1, base + 1, nextBase, nextBase + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

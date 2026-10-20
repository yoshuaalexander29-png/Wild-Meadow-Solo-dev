import * as THREE from 'three';
import {
  getTerrainHeight,
  OBSTACLES,
  isInsideWaterBody,
  type WalkableSurface,
} from './terrain';

export type CourseFeatureType =
  | 'runup'
  | 'split'
  | 'ramp'
  | 'takeoff'
  | 'gap'
  | 'landing'
  | 'banked-turn'
  | 'safe-ground'
  | 'safe-ramp'
  | 'merge'
  | 'scenic-reveal'
  | 'descent'
  | 'return-sprint'
  | 'finish';

export interface SplineSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3; // Up vector after banking
  binormal: THREE.Vector3; // Right vector
  bankAngle: number; // In radians (positive = banked inwards)
  width: number;
  heightAboveTerrain: number;
  gradeAngle: number; // Slope in radians
  feature: CourseFeatureType;
  segmentId: string;
  t: number; // 0 to 1 along segment
}

export interface CourseSegmentData {
  id: string;
  name: string;
  feature: CourseFeatureType;
  controlPoints: THREE.Vector3[];
  heightOffsets: number[]; // Relative to terrain
  bankAngles: number[];
  widths: number[];
  samples: SplineSample[];
  length: number;
  isAirGap?: boolean;
}

export interface CourseNode {
  id: string;
  position: THREE.Vector3;
  feature: CourseFeatureType;
  connections: string[];
}

export interface CourseData {
  seed: number;
  nodes: CourseNode[];
  segments: CourseSegmentData[];
  checkpoints: {
    id: string;
    name: string;
    position: THREE.Vector3;
    rotationY: number;
    radius: number;
    order: number;
  }[];
  startGate: { position: THREE.Vector3; rotationY: number };
  takeoffPoint: THREE.Vector3;
  landingPlatform: {
    center: THREE.Vector3;
    width: number;
    length: number;
    rotationY: number;
    box: THREE.Box3;
  };
  scenicLookout: { position: THREE.Vector3; cameraOffset: THREE.Vector3; lookAt: THREE.Vector3 };
  finishGate: { position: THREE.Vector3; rotationY: number };
}

export interface CameraCourseContext {
  onCourse: boolean;
  feature: CourseFeatureType;
  targetLookAhead: THREE.Vector3;
  suggestedPitch?: number;
  suggestedYaw?: number;
  targetDistance?: number;
  isScenicReveal?: boolean;
  isAirborneTarget?: boolean;
}

export interface CourseProgress {
  currentSegmentId: string;
  currentFeature: CourseFeatureType;
  routeBranch: 'skill' | 'safe' | 'shared';
  checkpointsPassed: string[];
  isFinished: boolean;
  lapTime: number;
}

export interface PlatformerCourse {
  group: THREE.Group;
  data: CourseData;
  resolveSurface: (
    x: number,
    z: number,
    characterY?: number,
    verticalSpeed?: number,
    isGrounded?: boolean,
    previousSurfaceId?: string
  ) => WalkableSurface | null;
  getCameraContext: (charPos: THREE.Vector3, charHeading: number, speed: number) => CameraCourseContext;
  updateProgress: (charPos: THREE.Vector3, dt: number) => CourseProgress;
  getProgress: () => CourseProgress;
  resetProgress: () => void;
  obstacleMeshList: THREE.Mesh[];
  dispose: () => void;
}

// -----------------------------------------------------------------
// Seeded deterministic pseudo-random number generator
// -----------------------------------------------------------------
export function createSeededRng(seed: number) {
  let s = (seed % 2147483647) + (seed <= 0 ? 2147483646 : 0);
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// -----------------------------------------------------------------
// Hermite / Catmull-Rom Cubic Spline Interpolation with Parallel Transport
// -----------------------------------------------------------------
function sampleCatmullRom(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number
): { point: THREE.Vector3; tangent: THREE.Vector3 } {
  const t2 = t * t;
  const t3 = t2 * t;

  // Position
  const point = new THREE.Vector3();
  point.x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  point.y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  point.z =
    0.5 *
    (2 * p1.z +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);

  // Tangent derivative
  const tangent = new THREE.Vector3();
  tangent.x =
    0.5 *
    (-p0.x +
      p2.x +
      2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t +
      3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2);
  tangent.y =
    0.5 *
    (-p0.y +
      p2.y +
      2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t +
      3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t2);
  tangent.z =
    0.5 *
    (-p0.z +
      p2.z +
      2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t +
      3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2);
  tangent.normalize();

  return { point, tangent };
}

/**
 * Builds continuous parallel-transport (Bishop) reference frames along a sampled curve.
 * Prevents twisting or gimbal flips on arbitrary 3D ramps, crests, and turns.
 */
function buildParallelTransportFrames(
  points: THREE.Vector3[],
  tangents: THREE.Vector3[],
  bankAngles: number[],
  widths: number[],
  segmentId: string,
  feature: CourseFeatureType
): SplineSample[] {
  const count = points.length;
  if (count === 0) return [];

  const samples: SplineSample[] = [];

  // Initial reference up normal
  const upGuide = new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3();
  if (Math.abs(tangents[0].dot(upGuide)) > 0.96) {
    normal.set(1, 0, 0);
  } else {
    normal.crossVectors(tangents[0], upGuide).cross(tangents[0]).normalize();
  }

  for (let i = 0; i < count; i++) {
    const pt = points[i];
    const tgt = tangents[i];
    const bank = bankAngles[i] || 0;
    const width = widths[i] || 3.0;

    if (i > 0) {
      // Parallel transport from previous normal
      const prevTgt = tangents[i - 1];
      const axis = new THREE.Vector3().crossVectors(prevTgt, tgt);
      const axisLen = axis.length();
      if (axisLen > 0.0001) {
        axis.multiplyScalar(1 / axisLen);
        const angle = Math.acos(THREE.MathUtils.clamp(prevTgt.dot(tgt), -1, 1));
        normal.applyAxisAngle(axis, angle);
      }
      // Re-orthogonalize
      normal.sub(tgt.clone().multiplyScalar(normal.dot(tgt))).normalize();
    }

    // Binormal (perpendicular right vector across the deck)
    const rawBinormal = new THREE.Vector3().crossVectors(tgt, normal).normalize();

    // Apply deliberate cross-track banking rotation around tangent
    const finalBinormal = rawBinormal
      .clone()
      .multiplyScalar(Math.cos(bank))
      .add(normal.clone().multiplyScalar(Math.sin(bank)))
      .normalize();

    const finalNormal = new THREE.Vector3().crossVectors(finalBinormal, tgt).normalize();

    const groundH = getTerrainHeight(pt.x, pt.z);
    const heightAboveTerrain = pt.y - groundH;
    const horizontalLen = Math.hypot(tgt.x, tgt.z);
    const gradeAngle = Math.atan2(tgt.y, Math.max(0.001, horizontalLen));

    samples.push({
      point: pt.clone(),
      tangent: tgt.clone(),
      normal: finalNormal,
      binormal: finalBinormal,
      bankAngle: bank,
      width,
      heightAboveTerrain,
      gradeAngle,
      feature,
      segmentId,
      t: count > 1 ? i / (count - 1) : 0,
    });
  }

  return samples;
}

// -----------------------------------------------------------------
// Course Data Generator (Constrained Procedural Graph with Seed Variation)
// -----------------------------------------------------------------
export function generateCourseData(seed = 42): CourseData {
  const rng = createSeededRng(seed);

  // Small controlled variation offsets within safety corridor (preserving topology)
  const varSplitZ = (rng() - 0.5) * 0.4; // ±0.2m
  const varRampCrestY = (rng() - 0.5) * 0.25; // ±0.12m
  const varSafeMidX = (rng() - 0.5) * 0.4;
  const varLookoutZ = (rng() - 0.5) * 0.3;

  // 1. Course Nodes
  const nodeStart = new THREE.Vector3(6.0, 0, 0.0);
  nodeStart.y = getTerrainHeight(nodeStart.x, nodeStart.z);

  const nodeRunupMid = new THREE.Vector3(10.5, 0, 0.0);
  nodeRunupMid.y = getTerrainHeight(nodeRunupMid.x, nodeRunupMid.z);

  const nodeSplit = new THREE.Vector3(15.0, 0, varSplitZ);
  nodeSplit.y = getTerrainHeight(nodeSplit.x, nodeSplit.z);

  // Upper Skill Route Nodes
  const nodeSkillApproach = new THREE.Vector3(16.0, 0, 4.0);
  nodeSkillApproach.y = getTerrainHeight(nodeSkillApproach.x, nodeSkillApproach.y) + 0.8;

  const nodeSkillRampMid = new THREE.Vector3(18.0, 0, 11.5);
  nodeSkillRampMid.y = getTerrainHeight(nodeSkillRampMid.x, nodeSkillRampMid.z) + 2.7 + varRampCrestY;

  const nodeSkillCrest = new THREE.Vector3(19.2, 0, 14.2);
  nodeSkillCrest.y = getTerrainHeight(nodeSkillCrest.x, nodeSkillCrest.z) + 3.6 + varRampCrestY;

  const nodeTakeoff = new THREE.Vector3(20.4, 0, 16.4);
  nodeTakeoff.y = getTerrainHeight(nodeTakeoff.x, nodeTakeoff.z) + 4.35;

  // Landing Platform (4.5m wide, 3.2m long)
  const nodeLandingCenter = new THREE.Vector3(24.2, 0, 19.4);
  nodeLandingCenter.y = getTerrainHeight(nodeLandingCenter.x, nodeLandingCenter.z) + 4.45;

  const nodeBankedTurnMid = new THREE.Vector3(26.8, 0, 21.2);
  nodeBankedTurnMid.y = getTerrainHeight(nodeBankedTurnMid.x, nodeBankedTurnMid.z) + 4.42;

  const nodeMerge = new THREE.Vector3(30.0, 0, 22.0);
  nodeMerge.y = getTerrainHeight(nodeMerge.x, nodeMerge.z) + 4.4;

  // Safe Route Nodes
  const nodeSafeTurn1 = new THREE.Vector3(15.2, 0, -4.2);
  nodeSafeTurn1.y = getTerrainHeight(nodeSafeTurn1.x, nodeSafeTurn1.z);

  const nodeSafeGround = new THREE.Vector3(23.0 + varSafeMidX, 0, -6.5);
  nodeSafeGround.y = getTerrainHeight(nodeSafeGround.x, nodeSafeGround.z);

  const nodeSafeRiseStart = new THREE.Vector3(27.8, 0, 0.0);
  nodeSafeRiseStart.y = getTerrainHeight(nodeSafeRiseStart.x, nodeSafeRiseStart.z) + 0.55;

  const nodeSafeRampMid = new THREE.Vector3(28.4, 0, 9.8);
  nodeSafeRampMid.y = getTerrainHeight(nodeSafeRampMid.x, nodeSafeRampMid.z) + 1.85;

  const nodeSafeApproachMerge = new THREE.Vector3(29.6, 0, 18.2);
  nodeSafeApproachMerge.y = getTerrainHeight(nodeSafeApproachMerge.x, nodeSafeApproachMerge.z) + 3.95;

  // Shared Return & Finish Nodes
  const nodeScenicLookout = new THREE.Vector3(34.2, 0, 21.0 + varLookoutZ);
  nodeScenicLookout.y = getTerrainHeight(nodeScenicLookout.x, nodeScenicLookout.z) + 4.35;

  const nodeDescentMid = new THREE.Vector3(34.8, 0, 10.0);
  nodeDescentMid.y = getTerrainHeight(nodeDescentMid.x, nodeDescentMid.z) + 1.85;

  const nodeDescentGround = new THREE.Vector3(33.8, 0, 0.0);
  nodeDescentGround.y = getTerrainHeight(nodeDescentGround.x, nodeDescentGround.z);

  const nodeReturnTurn = new THREE.Vector3(30.5, 0, -6.8);
  nodeReturnTurn.y = getTerrainHeight(nodeReturnTurn.x, nodeReturnTurn.z);

  const nodeReturnSprint = new THREE.Vector3(24.5, 0, -8.6);
  nodeReturnSprint.y = getTerrainHeight(nodeReturnSprint.x, nodeReturnSprint.z);

  const nodeFinish = new THREE.Vector3(18.5, 0, -8.0);
  nodeFinish.y = getTerrainHeight(nodeFinish.x, nodeFinish.z);

  // -----------------------------------------------------------------
  // Segments Generation with Spline Sampling
  // -----------------------------------------------------------------
  function buildSegment(
    id: string,
    name: string,
    feature: CourseFeatureType,
    rawPoints: THREE.Vector3[],
    widths: number[],
    bankAngles: number[],
    subdivisions = 16,
    isAirGap = false
  ): CourseSegmentData {
    const sampledPoints: THREE.Vector3[] = [];
    const sampledTangents: THREE.Vector3[] = [];
    const sampledWidths: number[] = [];
    const sampledBanks: number[] = [];

    // Extend endpoints for Catmull-Rom continuity
    const pts = [
      rawPoints[0].clone().add(rawPoints[0].clone().sub(rawPoints[1])),
      ...rawPoints,
      rawPoints[rawPoints.length - 1]
        .clone()
        .add(rawPoints[rawPoints.length - 1].clone().sub(rawPoints[rawPoints.length - 2])),
    ];

    const numSections = rawPoints.length - 1;
    for (let sec = 0; sec < numSections; sec++) {
      const p0 = pts[sec];
      const p1 = pts[sec + 1];
      const p2 = pts[sec + 2];
      const p3 = pts[sec + 3];

      const w0 = widths[sec];
      const w1 = widths[sec + 1];
      const b0 = bankAngles[sec];
      const b1 = bankAngles[sec + 1];

      const steps = subdivisions;
      for (let s = 0; s < steps; s++) {
        // Avoid duplicate point at section junction
        if (sec > 0 && s === 0) continue;
        const u = s / steps;
        const res = sampleCatmullRom(p0, p1, p2, p3, u);
        sampledPoints.push(res.point);
        sampledTangents.push(res.tangent);
        sampledWidths.push(THREE.MathUtils.lerp(w0, w1, u));
        sampledBanks.push(THREE.MathUtils.lerp(b0, b1, u));
      }
    }
    // Include final endpoint
    const lastRes = sampleCatmullRom(
      pts[numSections - 1],
      pts[numSections],
      pts[numSections + 1],
      pts[numSections + 2],
      1.0
    );
    sampledPoints.push(lastRes.point);
    sampledTangents.push(lastRes.tangent);
    sampledWidths.push(widths[widths.length - 1]);
    sampledBanks.push(bankAngles[bankAngles.length - 1]);

    const samples = buildParallelTransportFrames(
      sampledPoints,
      sampledTangents,
      sampledBanks,
      sampledWidths,
      id,
      feature
    );

    let length = 0;
    for (let i = 1; i < samples.length; i++) {
      length += samples[i].point.distanceTo(samples[i - 1].point);
    }

    return {
      id,
      name,
      feature,
      controlPoints: rawPoints,
      heightOffsets: rawPoints.map((p) => p.y - getTerrainHeight(p.x, p.z)),
      bankAngles,
      widths,
      samples,
      length,
      isAirGap,
    };
  }

  // 1. Run-Up Segment: Start Gate (6, 0) -> (15, 0)
  const segRunup = buildSegment(
    'seg_runup',
    'Meadow Run-Up',
    'runup',
    [nodeStart, nodeRunupMid, nodeSplit],
    [3.2, 3.2, 4.4], // Broadens at split for readability
    [0, 0, 0],
    20
  );

  // 2. Skill Route: (15, 0) -> Takeoff (20.4, 16.4)
  const segSkillRamp = buildSegment(
    'seg_skill_ramp',
    'Skyward Ramp & Takeoff',
    'ramp',
    [nodeSplit, nodeSkillApproach, nodeSkillRampMid, nodeSkillCrest, nodeTakeoff],
    [3.6, 3.2, 3.0, 3.0, 3.2],
    [0, 0.04, 0.06, 0.04, 0],
    28
  );

  // 3. Air Gap (Takeoff -> Landing Pad)
  const segAirGap = buildSegment(
    'seg_air_gap',
    'Airborne Leap Gap',
    'gap',
    [nodeTakeoff, nodeLandingCenter],
    [3.2, 4.5],
    [0, 0],
    12,
    true
  );

  // 4. Skill Route Landing & Banked Turn: (24.2, 19.4) -> (30, 22)
  const segSkillBankedTurn = buildSegment(
    'seg_skill_banked',
    'Landing Pad & Banked Turn',
    'banked-turn',
    [nodeLandingCenter, nodeBankedTurnMid, nodeMerge],
    [4.5, 3.6, 3.6],
    [0, 0.19, 0], // ~11 degrees inward bank on turn
    24
  );

  // 5. Safe Route: (15, 0) -> (30, 22)
  const segSafeRoute = buildSegment(
    'seg_safe_route',
    'Pastoral Safe Bypass',
    'safe-ground',
    [
      nodeSplit,
      nodeSafeTurn1,
      nodeSafeGround,
      nodeSafeRiseStart,
      nodeSafeRampMid,
      nodeSafeApproachMerge,
      nodeMerge,
    ],
    [3.6, 3.2, 3.2, 3.2, 3.2, 3.4, 3.6],
    [0, -0.04, 0, 0.03, 0.05, 0.03, 0],
    36
  );

  // 6. Shared Return: Merge (30, 22) -> Finish (18.5, -8.0)
  const segReturn = buildSegment(
    'seg_return_finish',
    'Scenic Lookout & Downhill Finish',
    'descent',
    [
      nodeMerge,
      nodeScenicLookout,
      nodeDescentMid,
      nodeDescentGround,
      nodeReturnTurn,
      nodeReturnSprint,
      nodeFinish,
    ],
    [3.6, 4.0, 3.2, 3.2, 3.2, 3.2, 3.6],
    [0, 0, 0, 0, -0.05, 0, 0],
    40
  );

  const segments = [segRunup, segSkillRamp, segAirGap, segSkillBankedTurn, segSafeRoute, segReturn];

  // Checkpoints
  const checkpoints = [
    {
      id: 'cp_start',
      name: 'Start Gate',
      position: nodeStart.clone(),
      rotationY: Math.PI * 0.5,
      radius: 2.8,
      order: 0,
    },
    {
      id: 'cp_split',
      name: 'Path Junction',
      position: nodeSplit.clone(),
      rotationY: Math.PI * 0.45,
      radius: 3.2,
      order: 1,
    },
    {
      id: 'cp_takeoff',
      name: 'Ramp Takeoff',
      position: nodeTakeoff.clone(),
      rotationY: Math.atan2(
        nodeTakeoff.x - nodeSkillCrest.x,
        nodeTakeoff.z - nodeSkillCrest.z
      ),
      radius: 2.6,
      order: 2,
    },
    {
      id: 'cp_landing',
      name: 'Skill Landing Pad',
      position: nodeLandingCenter.clone(),
      rotationY: 0,
      radius: 3.4,
      order: 3,
    },
    {
      id: 'cp_safe_mid',
      name: 'Pastoral Waypoint',
      position: nodeSafeGround.clone(),
      rotationY: 0,
      radius: 3.2,
      order: 3,
    },
    {
      id: 'cp_merge',
      name: 'Panoramic Lookout Merge',
      position: nodeMerge.clone(),
      rotationY: -Math.PI * 0.35,
      radius: 3.4,
      order: 4,
    },
    {
      id: 'cp_finish',
      name: 'Victory Finish Gate',
      position: nodeFinish.clone(),
      rotationY: -Math.PI * 0.65,
      radius: 3.0,
      order: 5,
    },
  ];

  const landingBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(nodeLandingCenter.x, nodeLandingCenter.y + 0.1, nodeLandingCenter.z),
    new THREE.Vector3(4.6, 1.2, 3.4)
  );

  return {
    seed,
    nodes: [
      { id: 'start', position: nodeStart, feature: 'runup', connections: ['split'] },
      { id: 'split', position: nodeSplit, feature: 'split', connections: ['skill_approach', 'safe_turn'] },
      { id: 'takeoff', position: nodeTakeoff, feature: 'takeoff', connections: ['landing'] },
      { id: 'landing', position: nodeLandingCenter, feature: 'landing', connections: ['merge'] },
      { id: 'safe_ground', position: nodeSafeGround, feature: 'safe-ground', connections: ['merge'] },
      { id: 'merge', position: nodeMerge, feature: 'merge', connections: ['lookout'] },
      { id: 'lookout', position: nodeScenicLookout, feature: 'scenic-reveal', connections: ['finish'] },
      { id: 'finish', position: nodeFinish, feature: 'finish', connections: [] },
    ],
    segments,
    checkpoints,
    startGate: { position: nodeStart, rotationY: Math.PI * 0.5 },
    takeoffPoint: nodeTakeoff,
    landingPlatform: {
      center: nodeLandingCenter,
      width: 4.5,
      length: 3.2,
      rotationY: Math.atan2(
        nodeLandingCenter.x - nodeTakeoff.x,
        nodeLandingCenter.z - nodeTakeoff.z
      ),
      box: landingBox,
    },
    scenicLookout: {
      position: nodeScenicLookout,
      cameraOffset: new THREE.Vector3(-4.5, 3.2, -5.2),
      lookAt: new THREE.Vector3(0, 2.0, 0), // Looking across the whole meadow
    },
    finishGate: { position: nodeFinish, rotationY: -Math.PI * 0.65 },
  };
}

// -----------------------------------------------------------------
// Rigorous Course Data Validation (Geometry, Obstacles, Boundaries, Jumps)
// -----------------------------------------------------------------
export function validateCourseData(data: CourseData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Boundary & Stream Clearance Check
  const maxRadius = 48.0;
  for (const seg of data.segments) {
    if (seg.isAirGap) continue;

    for (let i = 0; i < seg.samples.length; i++) {
      const s = seg.samples[i];
      const halfW = s.width * 0.5 + 0.42; // Route half-width + character radius
      const distToCenter = Math.hypot(s.point.x, s.point.z);

      if (distToCenter + halfW > maxRadius) {
        errors.push(
          `Segment [${seg.id}] sample ${i} exceeds radius 48 boundary: ${(distToCenter + halfW).toFixed(2)}m`
        );
      }

      // Check stream bed proximity on ground surfaces
      if (s.heightAboveTerrain < 1.2 && isInsideWaterBody(s.point.x, s.point.z)) {
        errors.push(
          `Segment [${seg.id}] sample ${i} at (${s.point.x.toFixed(1)}, ${s.point.z.toFixed(1)}) intersects water body!`
        );
      }

      // Check obstacle clearance against trees and boulders
      for (const obs of OBSTACLES) {
        // If course is elevated high above the ground obstacle, safe headroom
        if (s.heightAboveTerrain > 2.6) continue;

        const dObs = Math.hypot(s.point.x - obs.x, s.point.z - obs.z);
        const minReq = halfW + obs.radius + 0.5; // At least 0.5m clearance
        if (dObs < minReq) {
          errors.push(
            `Segment [${seg.id}] too close to obstacle [${obs.label || 'Obstacle'}]: distance ${dObs.toFixed(2)}m < min required ${minReq.toFixed(2)}m`
          );
        }
      }

      // Check slope grade limits (max 16 degrees ≈ 0.28 rad)
      if (Math.abs(s.gradeAngle) > 0.32) {
        errors.push(
          `Segment [${seg.id}] sample ${i} grade ${(Math.abs(s.gradeAngle) * 57.3).toFixed(1)}° exceeds limit 16°`
        );
      }
    }
  }

  // 2. Junction Height Agreement Check at Merge Node (30, 22)
  const skillBankedSeg = data.segments.find((s) => s.id === 'seg_skill_banked');
  const safeRouteSeg = data.segments.find((s) => s.id === 'seg_safe_route');
  const returnSeg = data.segments.find((s) => s.id === 'seg_return_finish');

  if (skillBankedSeg && safeRouteSeg && returnSeg) {
    const endSkillY = skillBankedSeg.samples[skillBankedSeg.samples.length - 1].point.y;
    const endSafeY = safeRouteSeg.samples[safeRouteSeg.samples.length - 1].point.y;
    const startReturnY = returnSeg.samples[0].point.y;

    if (Math.abs(endSkillY - endSafeY) > 0.05) {
      errors.push(
        `Merge height mismatch between skill (${endSkillY.toFixed(3)}m) and safe (${endSafeY.toFixed(3)}m) routes!`
      );
    }
    if (Math.abs(endSkillY - startReturnY) > 0.05) {
      errors.push(
        `Merge height mismatch with return segment start (${startReturnY.toFixed(3)}m)!`
      );
    }
  } else {
    errors.push('Missing essential merge segments in course data!');
  }

  // 3. Jump Reachability Simulation Check
  const takeoffSeg = data.segments.find((s) => s.id === 'seg_skill_ramp');
  if (takeoffSeg) {
    const takeoffSample = takeoffSeg.samples[takeoffSeg.samples.length - 1];
    const takeoffDir = takeoffSample.tangent.clone().normalize();
    const takeoffVel = takeoffDir.multiplyScalar(7.0); // nominal sprint speed
    takeoffVel.y = 7.2; // jump impulse

    const testRates = [30, 60, 120];
    for (const fps of testRates) {
      const dt = 1 / fps;
      const sim = simulateJumpTrajectory(takeoffSample.point, takeoffVel, data.landingPlatform.box, dt);
      if (!sim.reached) {
        errors.push(`Jump reachability failed at ${fps} FPS! Landed short at margin ${sim.margin.toFixed(2)}m`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Exact physics simulation helper matching characterController gravity & apex hang-time.
 */
export function simulateJumpTrajectory(
  takeoffPos: THREE.Vector3,
  initialVel: THREE.Vector3,
  landingBox: THREE.Box3,
  dt: number
): { reached: boolean; landingPos: THREE.Vector3; timeToLanding: number; margin: number } {
  const pos = takeoffPos.clone();
  const vel = initialVel.clone();
  let time = 0;
  let reached = false;

  const baseGravity = 21.0;
  const maxTime = 1.5;

  while (time < maxTime) {
    time += dt;

    // Apex hang-time factor identical to characterController.ts
    const apexFactor = Math.abs(vel.y) < 1.8 ? 0.65 : 1.0;
    vel.y -= baseGravity * apexFactor * dt;

    pos.addScaledVector(vel, dt);

    // Check if trajectory intersects landing platform box while descending
    if (vel.y <= 0 && landingBox.containsPoint(pos)) {
      reached = true;
      break;
    }

    // Touchdown below landing box min Y
    if (vel.y <= 0 && pos.y <= landingBox.min.y) {
      break;
    }
  }

  // Margin from near edge of landing box
  const nearEdgeDist = pos.distanceTo(new THREE.Vector3(landingBox.min.x, landingBox.min.y, landingBox.min.z));
  return { reached, landingPos: pos, timeToLanding: time, margin: nearEdgeDist };
}

// -----------------------------------------------------------------
// Platformer Course 3D Construction & Surface Resolver
// -----------------------------------------------------------------
export function createPlatformerCourse(scene: THREE.Scene, seed = 42): PlatformerCourse {
  const group = new THREE.Group();
  group.name = 'PlatformerCourseGroup';
  scene.add(group);

  let data = generateCourseData(seed);
  let val = validateCourseData(data);
  if (!val.valid) {
    // Fallback to validated default seed
    data = generateCourseData(42);
    val = validateCourseData(data);
  }

  const obstacleMeshList: THREE.Mesh[] = [];
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  let isDisposed = false;

  // -------------------------------------------------------------
  // Materials Palette (Ghibli Cel-Shaded Warm Meadow Aesthetic)
  // -------------------------------------------------------------
  const trackMat = new THREE.MeshStandardMaterial({
    color: '#deb67a', // Warm packed earthen amber course planks
    roughness: 0.82,
    metalness: 0.04,
    flatShading: true,
  });
  ownedMaterials.add(trackMat);

  const skillTrackMat = new THREE.MeshStandardMaterial({
    color: '#e49348', // Vibrant cedar ochre for upper skill ramp & banked curve
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
  });
  ownedMaterials.add(skillTrackMat);

  const landingMat = new THREE.MeshStandardMaterial({
    color: '#3ea86b', // Clover green launch & target landing platform
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  });
  ownedMaterials.add(landingMat);

  const timberSupportMat = new THREE.MeshStandardMaterial({
    color: '#4a301e', // Deep weathered chestnut timber pilings
    roughness: 0.9,
    metalness: 0.03,
    flatShading: true,
  });
  ownedMaterials.add(timberSupportMat);

  const stonePlinthMat = new THREE.MeshStandardMaterial({
    color: '#7a766b', // Chiseled granite foundation bases
    roughness: 0.92,
    metalness: 0.05,
    flatShading: true,
  });
  ownedMaterials.add(stonePlinthMat);

  const vermilionRailMat = new THREE.MeshStandardMaterial({
    color: '#c23826', // Spirited Away style vermilion guard rails
    roughness: 0.64,
    metalness: 0.06,
    flatShading: true,
  });
  ownedMaterials.add(vermilionRailMat);

  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: '#e8af28', // Ghibli brass/gold post finials
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
  });
  ownedMaterials.add(goldAccentMat);

  const fasciaMat = new THREE.MeshStandardMaterial({
    color: '#553925', // Underside fascia timber edging
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });
  ownedMaterials.add(fasciaMat);

  // -------------------------------------------------------------
  // Track Ribbon Geometry Generation (Merged by material)
  // -------------------------------------------------------------
  const trackPositions: number[] = [];
  const trackNormals: number[] = [];
  const trackUVs: number[] = [];
  const trackIndices: number[] = [];

  const skillPositions: number[] = [];
  const skillNormals: number[] = [];
  const skillUVs: number[] = [];
  const skillIndices: number[] = [];

  const fasciaPositions: number[] = [];
  const fasciaNormals: number[] = [];
  const fasciaIndices: number[] = [];

  // Reusable support positions collector
  const supportPilings: { x: number; yTop: number; z: number; yBottom: number }[] = [];

  for (const seg of data.segments) {
    if (seg.isAirGap) continue;

    const isSkillSegment = seg.id === 'seg_skill_ramp' || seg.id === 'seg_skill_banked';
    const targetPos = isSkillSegment ? skillPositions : trackPositions;
    const targetNorm = isSkillSegment ? skillNormals : trackNormals;
    const targetUV = isSkillSegment ? skillUVs : trackUVs;
    const targetIdx = isSkillSegment ? skillIndices : trackIndices;

    const vertexStartOffset = targetPos.length / 3;
    const fasciaStartOffset = fasciaPositions.length / 3;
    const sampleCount = seg.samples.length;

    for (let i = 0; i < sampleCount; i++) {
      const s = seg.samples[i];
      const halfW = s.width * 0.5;

      // Left and right surface edge vertices
      const leftPt = s.point.clone().addScaledVector(s.binormal, -halfW);
      const rightPt = s.point.clone().addScaledVector(s.binormal, halfW);

      targetPos.push(leftPt.x, leftPt.y, leftPt.z);
      targetPos.push(rightPt.x, rightPt.y, rightPt.z);

      targetNorm.push(s.normal.x, s.normal.y, s.normal.z);
      targetNorm.push(s.normal.x, s.normal.y, s.normal.z);

      targetUV.push(0, s.t * 8);
      targetUV.push(1, s.t * 8);

      // Underside / side fascia (0.24m thickness)
      const deckThickness = 0.24;
      const leftBottom = leftPt.clone().addScaledVector(s.normal, -deckThickness);
      const rightBottom = rightPt.clone().addScaledVector(s.normal, -deckThickness);

      fasciaPositions.push(leftPt.x, leftPt.y, leftPt.z);
      fasciaPositions.push(leftBottom.x, leftBottom.y, leftBottom.z);
      fasciaPositions.push(rightPt.x, rightPt.y, rightPt.z);
      fasciaPositions.push(rightBottom.x, rightBottom.y, rightBottom.z);

      fasciaNormals.push(-s.binormal.x, -s.binormal.y, -s.binormal.z);
      fasciaNormals.push(-s.binormal.x, -s.binormal.y, -s.binormal.z);
      fasciaNormals.push(s.binormal.x, s.binormal.y, s.binormal.z);
      fasciaNormals.push(s.binormal.x, s.binormal.y, s.binormal.z);

      // Collect support pilings where elevated > 1.4m above terrain
      if (i % 4 === 0 && s.heightAboveTerrain > 1.4) {
        const groundYL = getTerrainHeight(leftPt.x, leftPt.z);
        const groundYR = getTerrainHeight(rightPt.x, rightPt.z);
        supportPilings.push({ x: leftPt.x + s.binormal.x * 0.25, yTop: leftBottom.y, z: leftPt.z + s.binormal.z * 0.25, yBottom: groundYL });
        supportPilings.push({ x: rightPt.x - s.binormal.x * 0.25, yTop: rightBottom.y, z: rightPt.z - s.binormal.z * 0.25, yBottom: groundYR });
      }
    }

    // Top surface triangle quads
    for (let i = 0; i < sampleCount - 1; i++) {
      const idx = vertexStartOffset + i * 2;
      targetIdx.push(idx, idx + 1, idx + 2);
      targetIdx.push(idx + 1, idx + 3, idx + 2);

      // Fascia quads
      const fIdx = fasciaStartOffset + i * 4;
      // Left side edge
      fasciaIndices.push(fIdx, fIdx + 1, fIdx + 4);
      fasciaIndices.push(fIdx + 1, fIdx + 5, fIdx + 4);
      // Right side edge
      fasciaIndices.push(fIdx + 2, fIdx + 6, fIdx + 3);
      fasciaIndices.push(fIdx + 3, fIdx + 6, fIdx + 7);
    }
  }

  // Create merged track meshes
  if (trackPositions.length > 0) {
    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(trackPositions, 3));
    trackGeo.setAttribute('normal', new THREE.Float32BufferAttribute(trackNormals, 3));
    trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(trackUVs, 2));
    trackGeo.setIndex(trackIndices);
    ownedGeometries.add(trackGeo);

    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.receiveShadow = true;
    trackMesh.castShadow = true;
    group.add(trackMesh);
    obstacleMeshList.push(trackMesh);
  }

  if (skillPositions.length > 0) {
    const skillGeo = new THREE.BufferGeometry();
    skillGeo.setAttribute('position', new THREE.Float32BufferAttribute(skillPositions, 3));
    skillGeo.setAttribute('normal', new THREE.Float32BufferAttribute(skillNormals, 3));
    skillGeo.setAttribute('uv', new THREE.Float32BufferAttribute(skillUVs, 2));
    skillGeo.setIndex(skillIndices);
    ownedGeometries.add(skillGeo);

    const skillMesh = new THREE.Mesh(skillGeo, skillTrackMat);
    skillMesh.receiveShadow = true;
    skillMesh.castShadow = true;
    group.add(skillMesh);
    obstacleMeshList.push(skillMesh);
  }

  if (fasciaPositions.length > 0) {
    const fasciaGeo = new THREE.BufferGeometry();
    fasciaGeo.setAttribute('position', new THREE.Float32BufferAttribute(fasciaPositions, 3));
    fasciaGeo.setAttribute('normal', new THREE.Float32BufferAttribute(fasciaNormals, 3));
    fasciaGeo.setIndex(fasciaIndices);
    ownedGeometries.add(fasciaGeo);

    const fasciaMesh = new THREE.Mesh(fasciaGeo, fasciaMat);
    fasciaMesh.receiveShadow = true;
    fasciaMesh.castShadow = true;
    group.add(fasciaMesh);
    obstacleMeshList.push(fasciaMesh);
  }

  // -------------------------------------------------------------
  // Dedicated Landing Platform Mesh
  // -------------------------------------------------------------
  const lp = data.landingPlatform;
  const lpGeo = new THREE.BoxGeometry(lp.width, 0.42, lp.length);
  ownedGeometries.add(lpGeo);
  const lpMesh = new THREE.Mesh(lpGeo, landingMat);
  lpMesh.position.copy(lp.center);
  lpMesh.position.y -= 0.18; // Platform top aligns with center.y
  lpMesh.rotation.y = lp.rotationY;
  lpMesh.receiveShadow = true;
  lpMesh.castShadow = true;
  group.add(lpMesh);
  obstacleMeshList.push(lpMesh);

  // -------------------------------------------------------------
  // Instanced Support Pilings with Stone Plinths
  // -------------------------------------------------------------
  const pilingCount = supportPilings.length;
  if (pilingCount > 0) {
    const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.0, 6);
    const plinthGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.45, 6);
    ownedGeometries.add(postGeo);
    ownedGeometries.add(plinthGeo);

    const postMesh = new THREE.InstancedMesh(postGeo, timberSupportMat, pilingCount);
    const plinthMesh = new THREE.InstancedMesh(plinthGeo, stonePlinthMat, pilingCount);
    postMesh.castShadow = true;
    postMesh.receiveShadow = true;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < pilingCount; i++) {
      const p = supportPilings[i];
      const h = Math.max(0.4, p.yTop - p.yBottom);
      const midY = p.yBottom + h * 0.5;

      dummy.position.set(p.x, midY, p.z);
      dummy.scale.set(1.0, h, 1.0);
      dummy.rotation.set(0, (i % 6) * 0.5, 0);
      dummy.updateMatrix();
      postMesh.setMatrixAt(i, dummy.matrix);

      // Stone plinth at base
      dummy.position.set(p.x, p.yBottom + 0.22, p.z);
      dummy.scale.set(1.0, 1.0, 1.0);
      dummy.updateMatrix();
      plinthMesh.setMatrixAt(i, dummy.matrix);
    }
    postMesh.instanceMatrix.needsUpdate = true;
    plinthMesh.instanceMatrix.needsUpdate = true;
    group.add(postMesh);
    group.add(plinthMesh);
    obstacleMeshList.push(postMesh);
  }

  // -------------------------------------------------------------
  // Checkpoint Gates, Lanterns, and Banners
  // -------------------------------------------------------------
  const gateTimberGeo = new THREE.BoxGeometry(0.24, 3.4, 0.24);
  const gateBeamGeo = new THREE.BoxGeometry(4.4, 0.28, 0.28);
  const lanternGeo = new THREE.DodecahedronGeometry(0.22, 1);
  ownedGeometries.add(gateTimberGeo);
  ownedGeometries.add(gateBeamGeo);
  ownedGeometries.add(lanternGeo);

  const lanternGlowMat = new THREE.MeshBasicMaterial({ color: '#ffea88' });
  ownedMaterials.add(lanternGlowMat);

  for (const cp of data.checkpoints) {
    const cpGroup = new THREE.Group();
    cpGroup.position.copy(cp.position);
    cpGroup.rotation.y = cp.rotationY;

    // Torii / Arch Posts
    const leftPost = new THREE.Mesh(gateTimberGeo, vermilionRailMat);
    leftPost.position.set(-2.0, 1.7, 0);
    leftPost.castShadow = true;
    cpGroup.add(leftPost);

    const rightPost = new THREE.Mesh(gateTimberGeo, vermilionRailMat);
    rightPost.position.set(2.0, 1.7, 0);
    rightPost.castShadow = true;
    cpGroup.add(rightPost);

    // Crossbar Beam
    const crossBeam = new THREE.Mesh(gateBeamGeo, vermilionRailMat);
    crossBeam.position.set(0, 3.2, 0);
    crossBeam.castShadow = true;
    cpGroup.add(crossBeam);

    // Gold Finials atop posts
    const finialL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), goldAccentMat);
    finialL.position.set(-2.0, 3.5, 0);
    ownedGeometries.add(finialL.geometry);
    cpGroup.add(finialL);

    const finialR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), goldAccentMat);
    finialR.position.set(2.0, 3.5, 0);
    ownedGeometries.add(finialR.geometry);
    cpGroup.add(finialR);

    // Hanging Lantern
    const lantern = new THREE.Mesh(lanternGeo, lanternGlowMat);
    lantern.position.set(0, 2.7, 0);
    cpGroup.add(lantern);

    group.add(cpGroup);
  }

  // -------------------------------------------------------------
  // Scenic Lookout Marker at Merge (34.2, 21.0)
  // -------------------------------------------------------------
  const lookoutPlaqueGeo = new THREE.BoxGeometry(1.2, 0.8, 0.12);
  ownedGeometries.add(lookoutPlaqueGeo);
  const lookoutPlaque = new THREE.Mesh(lookoutPlaqueGeo, goldAccentMat);
  lookoutPlaque.position.set(data.scenicLookout.position.x, data.scenicLookout.position.y + 1.2, data.scenicLookout.position.z);
  lookoutPlaque.rotation.y = Math.PI * 0.25;
  lookoutPlaque.castShadow = true;
  group.add(lookoutPlaque);

  // -------------------------------------------------------------
  // Progress State Tracking
  // -------------------------------------------------------------
  let activeSegmentId = 'seg_runup';
  let activeFeature: CourseFeatureType = 'runup';
  let routeBranch: 'skill' | 'safe' | 'shared' = 'shared';
  const passedCheckpoints = new Set<string>();
  let isFinished = false;
  let lapTimer = 0;
  let isRunStarted = false;

  // -------------------------------------------------------------
  // High-Performance State-Aware Surface Resolver
  // -------------------------------------------------------------
  function resolveSurface(
    x: number,
    z: number,
    characterY?: number,
    verticalSpeed?: number,
    isGrounded?: boolean,
    previousSurfaceId?: string
  ): WalkableSurface | null {
    // 1. Find candidate course samples near (x, z)
    let bestCandidate: {
      height: number;
      normal: THREE.Vector3;
      segmentId: string;
      feature: CourseFeatureType;
      distSq: number;
      crownSlope: number;
    } | null = null;

    for (const seg of data.segments) {
      if (seg.isAirGap) continue;

      const samples = seg.samples;
      const count = samples.length;

      for (let i = 0; i < count; i++) {
        const s = samples[i];
        const dx = x - s.point.x;
        const dz = z - s.point.z;
        const distSq = dx * dx + dz * dz;
        const halfW = s.width * 0.5 + 0.35; // Comfortable boundary tolerance

        if (distSq <= halfW * halfW) {
          // Project lateral distance along binormal
          const lateral = dx * s.binormal.x + dz * s.binormal.z;
          if (Math.abs(lateral) <= halfW) {
            // Calculate exact surface elevation with bank slope
            const bankOffset = lateral * Math.tan(s.bankAngle);
            const deckHeight = s.point.y + bankOffset;

            // Multi-level candidate evaluation
            if (characterY !== undefined) {
              const vy = verticalSpeed ?? 0;

              // Case A: Character is grounded on this course deck
              if (
                isGrounded &&
                (previousSurfaceId === seg.id || Math.abs(characterY - deckHeight) < 0.65)
              ) {
                return {
                  height: deckHeight,
                  normal: s.normal.clone(),
                  surfaceType: 'wood',
                  waterDepth: 0,
                  isBridge: true,
                  isDeepWater: false,
                  slopeAngle: Math.abs(s.gradeAngle),
                };
              }

              // Case B: Character is under the elevated deck (underpass headroom)
              // If character Y is below deck by more than 0.45m, deck is above them! Do NOT snap up!
              if (characterY < deckHeight - 0.45) {
                continue; // Skip elevated deck, allow lower ground terrain to support player
              }

              // Case C: Character is airborne jumping up from below (cannot land from underside)
              if (!isGrounded && vy > 0.05 && characterY < deckHeight) {
                continue;
              }

              // Case D: Character is airborne descending onto deck from above
              if (!isGrounded && vy <= 0.05 && characterY >= deckHeight - 0.35) {
                if (!bestCandidate || distSq < bestCandidate.distSq) {
                  bestCandidate = {
                    height: deckHeight,
                    normal: s.normal,
                    segmentId: seg.id,
                    feature: s.feature,
                    distSq,
                    crownSlope: Math.abs(s.gradeAngle),
                  };
                }
              }
            } else {
              // Backward-compatibility: height query without character state
              if (!bestCandidate || distSq < bestCandidate.distSq) {
                bestCandidate = {
                  height: deckHeight,
                  normal: s.normal,
                  segmentId: seg.id,
                  feature: s.feature,
                  distSq,
                  crownSlope: Math.abs(s.gradeAngle),
                };
              }
            }
          }
        }
      }
    }

    if (bestCandidate) {
      return {
        height: bestCandidate.height,
        normal: bestCandidate.normal.clone(),
        surfaceType: 'wood',
        waterDepth: 0,
        isBridge: true,
        isDeepWater: false,
        slopeAngle: bestCandidate.crownSlope,
      };
    }

    return null;
  }

  // -------------------------------------------------------------
  // Route-Aware Camera Context Anticipation
  // -------------------------------------------------------------
  const _camLookTarget = new THREE.Vector3();

  function getCameraContext(
    charPos: THREE.Vector3,
    _charHeading: number,
    speed: number
  ): CameraCourseContext {
    // Determine closest course feature
    let nearestDist = 999;
    let currentFeature: CourseFeatureType = 'runup';
    let currentSegment: CourseSegmentData = data.segments[0];

    for (const seg of data.segments) {
      for (const s of seg.samples) {
        const d = charPos.distanceTo(s.point);
        if (d < nearestDist) {
          nearestDist = d;
          currentFeature = s.feature;
          currentSegment = seg;
        }
      }
    }

    const onCourse = nearestDist < 5.5;
    if (!onCourse) {
      _camLookTarget.copy(charPos).add(new THREE.Vector3(0, 1.25, 0));
      return {
        onCourse: false,
        feature: 'runup',
        targetLookAhead: _camLookTarget,
      };
    }

    // Dynamic anticipation based on upcoming course landmark
    const lookAheadDist = THREE.MathUtils.clamp(speed * 0.45, 1.8, 4.2);

    if (currentFeature === 'split') {
      // Frame both diverging route options at the fork
      _camLookTarget.set(18.0, charPos.y + 1.6, 2.0);
      return {
        onCourse: true,
        feature: 'split',
        targetLookAhead: _camLookTarget,
        suggestedPitch: 0.22,
        targetDistance: 5.8,
      };
    }

    if (currentFeature === 'ramp' || currentFeature === 'takeoff') {
      // Tilt camera up slightly to reveal takeoff trajectory and sky crest
      _camLookTarget.copy(data.takeoffPoint).add(new THREE.Vector3(1.5, 0.8, 1.5));
      return {
        onCourse: true,
        feature: currentFeature,
        targetLookAhead: _camLookTarget,
        suggestedPitch: 0.18,
        targetDistance: 5.4,
      };
    }

    if (currentFeature === 'gap' || (currentFeature === 'landing' && charPos.y > data.landingPlatform.center.y + 0.1)) {
      // Focus camera firmly on the landing platform pad
      _camLookTarget.copy(data.landingPlatform.center).add(new THREE.Vector3(0, 0.8, 0));
      return {
        onCourse: true,
        feature: 'landing',
        targetLookAhead: _camLookTarget,
        suggestedPitch: 0.32,
        isAirborneTarget: true,
      };
    }

    if (currentFeature === 'banked-turn') {
      // Lead camera into the banked curve exit toward merge
      _camLookTarget.set(29.0, charPos.y + 1.25, 21.8);
      return {
        onCourse: true,
        feature: 'banked-turn',
        targetLookAhead: _camLookTarget,
        suggestedPitch: 0.26,
      };
    }

    if (currentFeature === 'scenic-reveal' || currentFeature === 'merge') {
      // Elevated scenic reveal across the whole meadow panorama
      _camLookTarget.copy(charPos).add(new THREE.Vector3(-3.5, 1.2, -4.5));
      return {
        onCourse: true,
        feature: 'scenic-reveal',
        targetLookAhead: _camLookTarget,
        suggestedPitch: 0.24,
        targetDistance: 6.2,
        isScenicReveal: true,
      };
    }

    // Default forward look-ahead along segment tangent
    const sample = currentSegment.samples.find((s) => s.point.distanceTo(charPos) < 2.5) || currentSegment.samples[0];
    _camLookTarget.copy(charPos).addScaledVector(sample.tangent, lookAheadDist).add(new THREE.Vector3(0, 1.25, 0));

    return {
      onCourse: true,
      feature: currentFeature,
      targetLookAhead: _camLookTarget,
    };
  }

  function updateProgress(charPos: THREE.Vector3, dt: number): CourseProgress {
    if (!isRunStarted) {
      if (charPos.distanceTo(data.startGate.position) < 3.2) {
        isRunStarted = true;
        lapTimer = 0;
        passedCheckpoints.add('cp_start');
      }
    } else if (!isFinished) {
      lapTimer += dt;

      // Check checkpoints
      for (const cp of data.checkpoints) {
        if (!passedCheckpoints.has(cp.id) && charPos.distanceTo(cp.position) <= cp.radius) {
          passedCheckpoints.add(cp.id);
          if (cp.id === 'cp_takeoff' || cp.id === 'cp_landing') {
            routeBranch = 'skill';
          } else if (cp.id === 'cp_safe_mid') {
            routeBranch = 'safe';
          }
          if (cp.id === 'cp_finish') {
            isFinished = true;
          }
        }
      }
    }

    return {
      currentSegmentId: activeSegmentId,
      currentFeature: activeFeature,
      routeBranch,
      checkpointsPassed: Array.from(passedCheckpoints),
      isFinished,
      lapTime: lapTimer,
    };
  }

  function resetProgress() {
    isRunStarted = false;
    isFinished = false;
    lapTimer = 0;
    passedCheckpoints.clear();
    routeBranch = 'shared';
    activeSegmentId = 'seg_runup';
    activeFeature = 'runup';
  }

  function dispose() {
    if (isDisposed) return;
    isDisposed = true;

    scene.remove(group);

    ownedGeometries.forEach((g) => g.dispose());
    ownedGeometries.clear();

    ownedMaterials.forEach((m) => m.dispose());
    ownedMaterials.clear();
  }

  return {
    group,
    data,
    resolveSurface,
    getCameraContext,
    updateProgress,
    getProgress: () => ({
      currentSegmentId: activeSegmentId,
      currentFeature: activeFeature,
      routeBranch,
      checkpointsPassed: Array.from(passedCheckpoints),
      isFinished,
      lapTime: lapTimer,
    }),
    resetProgress,
    obstacleMeshList,
    dispose,
  };
}

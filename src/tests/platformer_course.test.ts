import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  generateCourseData,
  validateCourseData,
  simulateJumpTrajectory,
  createPlatformerCourse,
} from '../scene/platformerCourse';
import { createSurfaceResolver } from '../scene/surfaceResolver';
import {
  getTerrainHeight,
  getWalkableSurface,
  OBSTACLES,
  BRIDGE_CENTER_X,
  BRIDGE_CENTER_Z,
  BRIDGE_ROT_Y,
  BRIDGE_HALF_LENGTH,
} from '../scene/terrain';
import {
  calculateBridgeCorners,
  SPIRITED_AWAY_BRIDGE_LAYOUT,
} from '../scene/bridgeSystem';
import { createDustSystem, canEmitSprintDust } from '../scene/dustSystem';
import { createThirdPersonCamera } from '../scene/thirdPersonCamera';
import { createHeroKnight } from '../scene/heroCharacter';

describe('Wild Meadow Platformer Course & Core Systems', () => {
  // 1. Determinism and Variation
  it('produces identical course data for identical seeds and controlled variation for different seeds', () => {
    const courseA1 = generateCourseData(42);
    const courseA2 = generateCourseData(42);
    const courseB = generateCourseData(108);

    expect(courseA1.nodes.length).toBe(courseA2.nodes.length);
    expect(courseA1.segments.length).toBe(courseA2.segments.length);

    for (let i = 0; i < courseA1.nodes.length; i++) {
      expect(courseA1.nodes[i].position.x).toBeCloseTo(courseA2.nodes[i].position.x, 5);
      expect(courseA1.nodes[i].position.y).toBeCloseTo(courseA2.nodes[i].position.y, 5);
      expect(courseA1.nodes[i].position.z).toBeCloseTo(courseA2.nodes[i].position.z, 5);
    }

    // Different seed produces controlled variations within bounds
    // Variation is intentionally constrained to authored safe-corridor control points;
    // the fixed takeoff coordinate is a gameplay contract, not a randomization target.
    const splitA = courseA1.segments.find((s) => s.id === 'seg_runup')!.controlPoints.at(-1)!;
    const splitB = courseB.segments.find((s) => s.id === 'seg_runup')!.controlPoints.at(-1)!;
    expect(splitA.z).not.toBe(splitB.z);
    expect(Math.abs(splitA.z - splitB.z)).toBeLessThan(0.5);
  });

  // 2. Topology and Connectivity
  it('connects all branches through merge to finish', () => {
    const data = generateCourseData(42);
    const segmentIds = data.segments.map((s) => s.id);

    expect(segmentIds).toContain('seg_runup');
    expect(segmentIds).toContain('seg_skill_ramp');
    expect(segmentIds).toContain('seg_air_gap');
    expect(segmentIds).toContain('seg_skill_banked');
    expect(segmentIds).toContain('seg_safe_route');
    expect(segmentIds).toContain('seg_return_finish');

    // Checkpoint count and presence
    expect(data.checkpoints.length).toBeGreaterThanOrEqual(5);
    const checkpointIds = data.checkpoints.map((c) => c.id);
    expect(checkpointIds).toContain('cp_start');
    expect(checkpointIds).toContain('cp_takeoff');
    expect(checkpointIds).toContain('cp_landing');
    expect(checkpointIds).toContain('cp_merge');
    expect(checkpointIds).toContain('cp_finish');
  });

  // 3. Spline & Curve Continuity
  it('generates continuous splines with valid tangents and finite values', () => {
    const data = generateCourseData(42);

    for (const seg of data.segments) {
      if (seg.isAirGap) continue;
      expect(seg.samples.length).toBeGreaterThan(3);

      for (let i = 0; i < seg.samples.length; i++) {
        const s = seg.samples[i];
        expect(Number.isFinite(s.point.x)).toBe(true);
        expect(Number.isFinite(s.point.y)).toBe(true);
        expect(Number.isFinite(s.point.z)).toBe(true);

        expect(s.tangent.length()).toBeCloseTo(1.0, 3);
        expect(s.normal.length()).toBeCloseTo(1.0, 3);
        expect(s.binormal.length()).toBeCloseTo(1.0, 3);

        // Tangent and binormal should be orthogonal
        expect(Math.abs(s.tangent.dot(s.binormal))).toBeLessThan(0.05);
      }
    }
  });

  // 4. Over 100 Seeds Clearance & Geometry Validation
  it('validates clearance, boundary constraints, and geometry over 100 deterministic seeds', () => {
    let passedCount = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const data = generateCourseData(seed);
      const val = validateCourseData(data);
      expect(val.valid).toBe(true);
      if (val.valid) passedCount++;
    }
    expect(passedCount).toBe(100);
  });

  // 5. Elevation Continuity & Merge Junction Agreement
  it('enforces seamless height agreement at the merge junction (30, 22)', () => {
    const data = generateCourseData(42);
    const skillBanked = data.segments.find((s) => s.id === 'seg_skill_banked')!;
    const safeRoute = data.segments.find((s) => s.id === 'seg_safe_route')!;
    const returnSeg = data.segments.find((s) => s.id === 'seg_return_finish')!;

    const endSkillY = skillBanked.samples[skillBanked.samples.length - 1].point.y;
    const endSafeY = safeRoute.samples[safeRoute.samples.length - 1].point.y;
    const startReturnY = returnSeg.samples[0].point.y;

    expect(Math.abs(endSkillY - endSafeY)).toBeLessThan(0.04);
    expect(Math.abs(endSkillY - startReturnY)).toBeLessThan(0.04);
  });

  // 6. Surface Query Agreement with Course Samples
  it('matches surface resolver query heights to sampled course geometry', () => {
    const scene = new THREE.Scene();
    const course = createPlatformerCourse(scene, 42);
    const resolver = createSurfaceResolver(course);

    const rampSeg = course.data.segments.find((s) => s.id === 'seg_skill_ramp')!;
    const midSample = rampSeg.samples[Math.floor(rampSeg.samples.length / 2)];

    const query = resolver(
      midSample.point.x,
      midSample.point.z,
      midSample.point.y,
      0,
      true,
      'seg_skill_ramp'
    );

    expect(query.isBridge).toBe(true);
    expect(query.height).toBeCloseTo(midSample.point.y, 1);

    course.dispose();
  });

  // 7. Multi-Level Surface Selection (Upper Deck vs Lower Terrain/Underpass)
  it('correctly selects upper vs lower surface at identical horizontal coordinates', () => {
    const scene = new THREE.Scene();
    const course = createPlatformerCourse(scene, 42);
    const resolver = createSurfaceResolver(course);

    // Pick a point along the elevated course (e.g. ramp crest near 19, 14, ~4m above terrain)
    const elevatedSample = course.data.segments
      .find((s) => s.id === 'seg_skill_ramp')!
      .samples.slice(-1)[0];

    const testX = elevatedSample.point.x;
    const testZ = elevatedSample.point.z;
    const elevatedY = elevatedSample.point.y;
    const groundTerrainY = getTerrainHeight(testX, testZ);

    // Case 1: Character standing on upper deck
    const upperQuery = resolver(testX, testZ, elevatedY, 0, true, 'seg_skill_ramp');
    expect(upperQuery.isBridge).toBe(true);
    expect(upperQuery.height).toBeCloseTo(elevatedY, 1);

    // Case 2: Character beneath the elevated deck on ground level
    const lowerQuery = resolver(testX, testZ, groundTerrainY, 0, true, 'ground');
    expect(lowerQuery.isBridge).toBe(false); // Ground terrain, not the elevated deck!
    expect(lowerQuery.height).toBeCloseTo(groundTerrainY, 2);

    course.dispose();
  });

  // 8. Jump Flight and Landing Across 30, 60, 120 FPS
  it('guarantees jump reachability across 30, 60, 120 FPS and dt=0.05', () => {
    const data = generateCourseData(42);
    const rampSeg = data.segments.find((s) => s.id === 'seg_skill_ramp')!;
    const takeoffSample = rampSeg.samples[rampSeg.samples.length - 1];

    const takeoffDir = takeoffSample.tangent.clone().normalize();
    const takeoffVel = takeoffDir.multiplyScalar(7.0); // sprint velocity
    takeoffVel.y = 7.2; // jump impulse

    const testFramerates = [30, 60, 120, 20]; // 20 FPS = max dt 0.05
    for (const fps of testFramerates) {
      const dt = 1 / fps;
      const sim = simulateJumpTrajectory(takeoffSample.point, takeoffVel, data.landingPlatform.box, dt);
      expect(sim.reached).toBe(true);
      expect(sim.margin).toBeGreaterThan(0.3); // Clear margin from near edge
    }
  });

  // 9. Existing Bridge Grounding, Water Safety, and Crate Removal
  it('preserves bridge corner grounding, terrain water safety, and brown cube removal', () => {
    // 1. Brown cube removal
    const crateCollider = OBSTACLES.find(
      (o) => (o.label && /crate/i.test(o.label)) || (Math.hypot(o.x - 1.0, o.z - 3.2) < 0.1 && o.radius === 0.8)
    );
    expect(crateCollider).toBeUndefined();

    // 2. Bridge corners grounded
    const corners = calculateBridgeCorners(SPIRITED_AWAY_BRIDGE_LAYOUT);
    const cornerKeys = ['nearLeft', 'nearRight', 'farLeft', 'farRight'] as const;
    for (const key of cornerKeys) {
      const c = corners[key];
      const actualGround = getTerrainHeight(c.worldX, c.worldZ);
      expect(Math.abs(c.groundY - actualGround)).toBeLessThan(0.002);
      expect(c.supportHeight).toBeGreaterThan(0);
      expect(c.deckY).toBeGreaterThan(c.groundY);
    }

    // 3. Dry ground safety (no water death on campsite, bridge, knoll)
    const testPositions = [
      { x: 2.2, z: 2.2 },
      { x: 1.2, z: 0.2 },
      { x: -1.1, z: -6.9 }, // Bridge center
      { x: -16.0, z: -18.0 }, // Windrise oak
      { x: -11.5, z: 13.5 }, // Artist knoll
    ];
    for (const pos of testPositions) {
      const surface = getWalkableSurface(pos.x, pos.z);
      expect(surface.isDeepWater).toBe(false);
    }

    // 4. Bridge traversal continuous elevation
    const sampleSteps = 20;
    let lastY: number | null = null;
    let maxStepDiff = 0;
    for (let i = 0; i <= sampleSteps; i++) {
      const t = (i / sampleSteps) * 2 - 1;
      const localZ = t * (BRIDGE_HALF_LENGTH + 0.8);
      const worldX = BRIDGE_CENTER_X - Math.sin(BRIDGE_ROT_Y) * localZ;
      const worldZ = BRIDGE_CENTER_Z + Math.cos(BRIDGE_ROT_Y) * localZ;
      const surface = getWalkableSurface(worldX, worldZ);
      if (lastY !== null) {
        const stepDiff = Math.abs(surface.height - lastY);
        if (stepDiff > maxStepDiff) maxStepDiff = stepDiff;
      }
      lastY = surface.height;
    }
    expect(maxStepDiff).toBeLessThan(0.35);
  });

  // 10. White Dust VFX & Exclusions
  it('configures neutral white dust with toneMapped=false and excludes water & wood surfaces', () => {
    const scene = new THREE.Scene();
    const dust = createDustSystem(scene);

    // Sprint emission rules
    expect(canEmitSprintDust({ grounded: true, sprinting: true, horizontalSpeed: 5.0, surface: 'grass' })).toBe(true);
    expect(canEmitSprintDust({ grounded: true, sprinting: true, horizontalSpeed: 5.0, surface: 'dirt' })).toBe(true);
    expect(canEmitSprintDust({ grounded: true, sprinting: true, horizontalSpeed: 5.0, surface: 'water' })).toBe(false);
    expect(canEmitSprintDust({ grounded: true, sprinting: true, horizontalSpeed: 5.0, surface: 'wood' })).toBe(false);
    expect(canEmitSprintDust({ grounded: false, sprinting: true, horizontalSpeed: 5.0, surface: 'grass' })).toBe(false);

    // Footfall puff on wood or water should not emit active particles
    dust.emitFootfallPuff(new THREE.Vector3(0, 0, 0), 0, 0, 'wood', true);
    dust.emitFootfallPuff(new THREE.Vector3(0, 0, 0), 0, 0, 'water', true);

    // Particle sprite materials should be toneMapped = false
    dust.group.traverse((obj) => {
      if ((obj as THREE.Sprite).isSprite) {
        const s = obj as THREE.Sprite;
        const mat = s.material as THREE.SpriteMaterial;
        expect(mat.toneMapped).toBe(false);
        expect(mat.color.getHexString()).toBe('ffffff');
      }
    });

    // Idempotent disposal
    expect(() => {
      dust.dispose();
      dust.dispose();
    }).not.toThrow();
  });

  // 11. Camera Route Context and Obstruction Check
  it('provides route anticipation context and handles manual orbit priority', () => {
    const scene = new THREE.Scene();
    const course = createPlatformerCourse(scene, 42);
    const camera = new THREE.PerspectiveCamera();
    const camCtrl = createThirdPersonCamera(camera, new THREE.Vector3(6, 0, 0));

    // Near start gate
    const startContext = course.getCameraContext(new THREE.Vector3(6, 0.5, 0), 0, 5.0);
    expect(startContext.onCourse).toBe(true);

    // Near fork / split (15, 0)
    const splitContext = course.getCameraContext(new THREE.Vector3(15, 0.5, 0), 0, 5.0);
    expect(splitContext.feature).toBe('split');
    expect(splitContext.targetLookAhead).toBeDefined();

    // Near takeoff (20, 16)
    const takeoffContext = course.getCameraContext(new THREE.Vector3(20, 4.3, 16), 0, 5.0);
    expect(takeoffContext.feature).toBe('takeoff');

    // Manual orbit cooldown retains user camera angles
    camCtrl.onPointerDrag(100, 50);
    const userYaw = camCtrl.yaw;
    camCtrl.update(0.016, new THREE.Vector3(15, 0.5, 0), 0, 5.0, 0, undefined, true, 0, splitContext);
    expect(camCtrl.yaw).toBeCloseTo(userYaw, 1); // User drag not overridden immediately

    course.dispose();
  });

  // 12. Idempotent Resource Disposal & Ownership
  it('disposes course and hero character resources idempotently without leaking or double disposing', () => {
    const scene = new THREE.Scene();
    const course = createPlatformerCourse(scene, 42);
    const hero = createHeroKnight();
    scene.add(hero.group);

    expect(() => {
      course.dispose();
      course.dispose();
      hero.dispose();
      hero.dispose();
    }).not.toThrow();
  });
});

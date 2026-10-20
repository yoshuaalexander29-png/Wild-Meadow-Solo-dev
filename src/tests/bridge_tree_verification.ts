import * as THREE from 'three';
import {
  getTerrainHeight,
  getWalkableSurface,
  resolveCollision,
  getDistanceToStream,
  STREAM_BANK_WIDTH,
  SAFE_RESPAWN,
  getBridgeDeckHeight,
  isInsideWaterBody,
  OBSTACLES,
  BRIDGE_CENTER_X,
  BRIDGE_CENTER_Z,
  BRIDGE_ROT_Y,
  BRIDGE_HALF_LENGTH,
} from '../scene/terrain';
import { COURSE_ROUTES, getCourseSurface, getCourseAnticipation, getCourseBoardwalkOffset, COURSE_SURFACE_LIFT } from '../scene/courseLayout';
import { advanceHorizontalVelocity, advanceVerticalMotion, clampControllerDelta, GAME_FEEL, getResponseAlpha, updateJumpAssistTimers } from '../scene/gameFeel';
import { createMeadowCourse } from '../scene/courseSystem';
import { createCharacterController } from '../scene/characterController';
import {
  calculateBridgeCorners,
  SPIRITED_AWAY_BRIDGE_LAYOUT,
} from '../scene/bridgeSystem';

declare const process: { exit: (code?: number) => never };

console.log('=== RUNNING WILD MEADOW VERIFICATION AUDIT ===\n');

// 1. Brown Cube Removal Check
console.log('Test 1: Brown Cube & Crate Collider Removal');
const crateCollider = OBSTACLES.find(
  (o) => (o.label && /crate/i.test(o.label)) || (Math.hypot(o.x - 1.0, o.z - 3.2) < 0.1 && o.radius === 0.8)
);
if (crateCollider) {
  console.error('FAIL: Found residual crate collider in OBSTACLES:', crateCollider);
  process.exit(1);
} else {
  console.log('PASS: No brown cube or crate collider found in OBSTACLES.');
}

// 2. Four Bridge Corners Grounding Check
console.log('\nTest 2: Four Bridge Corners Grounding Validation');
const corners = calculateBridgeCorners(SPIRITED_AWAY_BRIDGE_LAYOUT);
const cornerKeys = ['nearLeft', 'nearRight', 'farLeft', 'farRight'] as const;

let allGrounded = true;
for (const key of cornerKeys) {
  const c = corners[key];
  const actualGround = getTerrainHeight(c.worldX, c.worldZ);
  const diff = Math.abs(c.groundY - actualGround);

  console.log(
    `  Corner [${key}]: World (${c.worldX.toFixed(2)}, ${c.worldZ.toFixed(2)}) | ` +
    `Deck Y: ${c.deckY.toFixed(2)}m | Ground Y: ${c.groundY.toFixed(2)}m | ` +
    `Support Height: ${c.supportHeight.toFixed(2)}m | Diff from sampled: ${diff.toFixed(4)}m`
  );

  if (diff > 0.001 || c.supportHeight <= 0 || c.deckY <= c.groundY) {
    allGrounded = false;
  }
}

if (!allGrounded) {
  console.error('FAIL: One or more bridge corners are not properly grounded!');
  process.exit(1);
} else {
  console.log('PASS: All 4 bridge corner supports meet their exact independent ground elevations with positive support pilings.');
}

// 3. Water Hazard & Dry Ground Safety Check
console.log('\nTest 3: Water Hazard & Dry Ground Validation');
const testPositions = [
  { name: 'Campsite Hearth', x: 2.2, z: 2.2 },
  { name: 'Safe Respawn Point', x: 1.2, z: 0.2 },
  { name: 'Bridge South Approach', x: -1.1 + Math.sin(BRIDGE_ROT_Y) * 3.2, z: -6.9 + Math.cos(BRIDGE_ROT_Y) * 3.2 },
  { name: 'Bridge Center Deck', x: -1.1, z: -6.9 },
  { name: 'Bridge North Approach', x: -1.1 - Math.sin(BRIDGE_ROT_Y) * 3.2, z: -6.9 - Math.cos(BRIDGE_ROT_Y) * 3.2 },
  { name: 'Windrise Oak Mound', x: -16.0, z: -18.0 },
  { name: 'Artist Knoll', x: -11.5, z: 13.5 },
  { name: 'Former Boundary Zone (r=43m)', x: 30.0, z: 31.0 },
];

let waterSafetyPassed = true;
for (const pos of testPositions) {
  const surface = getWalkableSurface(pos.x, pos.z);
  const inWater = isInsideWaterBody(pos.x, pos.z);

  console.log(
    `  Position [${pos.name} (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})]: ` +
    `Surface: ${surface.surfaceType} | Height: ${surface.height.toFixed(2)}m | ` +
    `WaterDepth: ${surface.waterDepth.toFixed(2)}m | isDeepWater: ${surface.isDeepWater} | inWater: ${inWater}`
  );

  if (surface.isDeepWater) {
    console.error(`FAIL: Position ${pos.name} triggered deep water death on non-hazard surface!`);
    waterSafetyPassed = false;
  }
}

if (!waterSafetyPassed) {
  process.exit(1);
} else {
  console.log('PASS: Zero water death on dry ground, bridge approaches, or bridge deck.');
}

// 4. Bridge Traversal Continuous Elevation Check
console.log('\nTest 4: Bridge Traversal Continuity Check');
const sampleSteps = 20;
let lastY: number | null = null;
let maxStepDiff = 0;

for (let i = 0; i <= sampleSteps; i++) {
  const t = (i / sampleSteps) * 2 - 1; // -1 to +1
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

console.log(`  Max consecutive elevation delta along crossing corridor: ${maxStepDiff.toFixed(3)}m`);
if (maxStepDiff > 0.35) {
  console.error('FAIL: Elevation discontinuity detected along bridge corridor!');
  process.exit(1);
} else {
  console.log('PASS: Bridge deck elevation transitions smoothly from bank to bank without vertical snapping.');
}


 
// 5. Vertical ownership: an upper bridge deck must not magnetically catch a
// character passing underneath, while a descending character above the deck may land.
console.log('\nTest 5: Height-aware bridge support resolution');
const bridgeX = BRIDGE_CENTER_X;
const bridgeZ = BRIDGE_CENTER_Z;
const deck = getBridgeDeckHeight(bridgeX, bridgeZ);
if (!deck.onBridge) {
  console.error('FAIL: Expected bridge center to be a valid deck sample.');
  process.exit(1);
}
const belowDeck = getWalkableSurface(bridgeX, bridgeZ, {
  characterY: deck.deckHeight - 1.0,
  isGrounded: false,
  verticalVelocity: 3.0,
});
const descendingOntoDeck = getWalkableSurface(bridgeX, bridgeZ, {
  characterY: deck.deckHeight + 0.1,
  isGrounded: false,
  verticalVelocity: -2.0,
});
console.log(`  Under-deck query: ${belowDeck.surfaceType} at ${belowDeck.height.toFixed(2)}m; deck ${deck.deckHeight.toFixed(2)}m`);
console.log(`  Descending query: ${descendingOntoDeck.surfaceType} at ${descendingOntoDeck.height.toFixed(2)}m`);
if (belowDeck.surfaceType === 'wood' || belowDeck.height >= deck.deckHeight - 0.2) {
  console.error('FAIL: Under-deck character was incorrectly resolved to the bridge surface.');
  process.exit(1);
}
if (descendingOntoDeck.surfaceType !== 'wood') {
  console.error('FAIL: Descending character above the bridge was not offered the deck as a landing surface.');
  process.exit(1);
}
console.log('PASS: Surface support respects vertical position and descent direction.');


 
// 6. Course mesh/collision share one route source and the lane has a bounded footprint.
console.log('\nTest 6: Shared route and collision surface');
const routeCenter = getWalkableSurface(5.5, -1.0);
const offRoute = getWalkableSurface(5.5, 3.5);
console.log(`  Mainline center: ${routeCenter.surfaceType} at ${routeCenter.height.toFixed(2)}m`);
console.log(`  Off-route control: ${offRoute.surfaceType} at ${offRoute.height.toFixed(2)}m`);
if (routeCenter.surfaceType !== 'course') {
  console.error('FAIL: Authored mainline center did not resolve to its shared course surface.');
  process.exit(1);
}
if (offRoute.surfaceType === 'course') {
  console.error('FAIL: Course collision footprint expanded beyond the authored lane width.');
  process.exit(1);
}
console.log('PASS: The lane has a queryable surface with a bounded width.');


console.log('\nTest 7: Authored course topology, obstacle clearance, and shortcut value');
if (COURSE_ROUTES.length !== 2) {
  console.error(`FAIL: Expected one main route and one shortcut; found ${COURSE_ROUTES.length} routes.`);
  process.exit(1);
}
const mainRoute = COURSE_ROUTES.find((route) => route.name === 'Meadow Mainline');
const shortcutRoute = COURSE_ROUTES.find((route) => route.name === 'Canopy Cut');
if (!mainRoute || !shortcutRoute) {
  console.error('FAIL: Required mainline or shortcut route is missing.');
  process.exit(1);
}
const startPoint = mainRoute.points[0];
if (Math.hypot(startPoint[0] - SAFE_RESPAWN.x, startPoint[1] - SAFE_RESPAWN.z) > 5.0) {
  console.error('FAIL: Course entry is too far from the safe spawn.');
  process.exit(1);
}
const polylineLength = (points: Array<[number, number]>) => points.slice(1).reduce(
  (length, point, index) => length + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
  0,
);
const mainDetour = mainRoute.points.slice(3, 8);
const shortcutLength = polylineLength(shortcutRoute.points);
const detourLength = polylineLength(mainDetour);
console.log(`  Main route points: ${mainRoute.points.length}; shortcut points: ${shortcutRoute.points.length}`);
console.log(`  Shortcut polyline: ${shortcutLength.toFixed(1)}m; corresponding main detour: ${detourLength.toFixed(1)}m`);
if (shortcutLength >= detourLength * 0.92) {
  console.error('FAIL: Shortcut is not meaningfully shorter than the main route.');
  process.exit(1);
}
for (const route of COURSE_ROUTES) {
  const curve = new THREE.CatmullRomCurve3(
    route.points.map(([x, z]) => new THREE.Vector3(x, getTerrainHeight(x, z), z)),
    false,
    'centripetal',
    0.35,
  );
  for (let sample = 0; sample <= 120; sample++) {
    const point = curve.getPointAt(sample / 120);
    const clearance = route.width * 0.5 + 0.35;
    const blocker = OBSTACLES.find((obstacle) =>
      Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < obstacle.radius + clearance
    );
    if (blocker) {
      console.error(`FAIL: ${route.name} intersects obstacle ${blocker.label ?? 'unnamed'} near (${point.x.toFixed(1)}, ${point.z.toFixed(1)}).`);
      process.exit(1);
    }
    if (getDistanceToStream(point.x, point.z) < STREAM_BANK_WIDTH + route.width * 0.5 + 0.25) {
      console.error(`FAIL: ${route.name} lacks brook clearance near (${point.x.toFixed(1)}, ${point.z.toFixed(1)}).`);
      process.exit(1);
    }
  }
}
console.log('PASS: Both routes have sampled obstacle/brook clearance, a nearby entry, and a shorter shortcut.');


console.log('\nTest 8: Course ramp profile and support normal');
const mainlineForMerge = COURSE_ROUTES.find((route) => route.name === 'Meadow Mainline');
const shortcutForMerge = COURSE_ROUTES.find((route) => route.name === 'Canopy Cut');
if (!mainlineForMerge || !shortcutForMerge ||
    Math.abs(mainlineForMerge.lifts[3] - shortcutForMerge.lifts[0]) > 0.01 ||
    Math.abs(mainlineForMerge.lifts[7] - shortcutForMerge.lifts[4]) > 0.01) {
  console.error('FAIL: Shortcut and mainline elevations do not match at both shared junctions.');
  process.exit(1);
}

for (const route of COURSE_ROUTES) {
  if (route.lifts.length !== route.points.length || route.lifts.some((lift) => !Number.isFinite(lift) || lift < 0)) {
    console.error(`FAIL: ${route.name} has invalid lift metadata.`);
    process.exit(1);
  }
  for (let i = 1; i < route.points.length; i++) {
    const previous = route.points[i - 1];
    const current = route.points[i];
    const horizontalDistance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    const gradeDegrees = Math.atan2(Math.abs(route.lifts[i] - route.lifts[i - 1]), Math.max(horizontalDistance, 0.001)) * 180 / Math.PI;
    if (gradeDegrees > 12) {
      console.error(`FAIL: ${route.name} exceeds the 12-degree authored grade budget (${gradeDegrees.toFixed(1)}°).`);
      process.exit(1);
    }
  }
}
const forkPoint = mainRoute.points[3];
const shortcutStart = shortcutRoute.points[0];
const mergePoint = mainRoute.points[7];
const shortcutEnd = shortcutRoute.points[shortcutRoute.points.length - 1];
const forkHeightError = Math.abs(mainRoute.lifts[3] - shortcutRoute.lifts[0]);
const mergeHeightError = Math.abs(mainRoute.lifts[7] - shortcutRoute.lifts[shortcutRoute.lifts.length - 1]);
const mergeDistance = Math.hypot(mergePoint[0] - shortcutEnd[0], mergePoint[1] - shortcutEnd[1]);
if (Math.hypot(forkPoint[0] - shortcutStart[0], forkPoint[1] - shortcutStart[1]) > 0.01 ||
    mergeDistance > (mainRoute.width + shortcutRoute.width) * 0.5 - 0.25 ||
    forkHeightError > 0.05 || mergeHeightError > 0.05) {
  console.error('FAIL: Route fork/merge positions or deck elevations are discontinuous.');
  process.exit(1);
}
const rampSurface = getCourseSurface(24.5, -9.0, getTerrainHeight);
if (!rampSurface || rampSurface.surfaceType !== 'course' || rampSurface.height < getTerrainHeight(24.5, -9.0) + 0.8) {
  console.error('FAIL: Raised route section is not represented by the shared course support query.');
  process.exit(1);
}
if (rampSurface.slopeAngle < 0.01) {
  console.error('FAIL: Raised course section did not produce a ramp-aware support normal.');
  process.exit(1);
}
const mainlineGap = COURSE_ROUTES.find((route) => route.name === 'Meadow Mainline')?.gaps?.[0];
const mainlineDefinition = COURSE_ROUTES.find((route) => route.name === 'Meadow Mainline');
if (!mainlineGap || !mainlineDefinition) {
  console.error('FAIL: Mainline jump gap metadata is missing.');
  process.exit(1);
}
const mainlineCurve = new THREE.CatmullRomCurve3(
  mainlineDefinition.points.map(([x, z], index) => new THREE.Vector3(x, mainlineDefinition.lifts[index], z)),
  false,
  'centripetal',
  0.35,
);
const gapPoint = mainlineCurve.getPointAt((mainlineGap[0] + mainlineGap[1]) * 0.5);
if (getCourseSurface(gapPoint.x, gapPoint.z, getTerrainHeight) !== null) {
  console.error('FAIL: Mainline jump gap still resolves as a solid course surface.');
  process.exit(1);
}
console.log(`PASS: Course lift profiles are valid; sampled waypoint grades stay under 12°; ramp support slope is ${(rampSurface.slopeAngle * 180 / Math.PI).toFixed(1)}°.`);


 
console.log('\nTest 9: Explicit mainline jump gap and shortcut bypass');
const jumpGap = mainRoute.gaps?.[0];
if (!jumpGap) {
  console.error('FAIL: Mainline has no authored jump gap.');
  process.exit(1);
}
const mainCurveWithLift = new THREE.CatmullRomCurve3(
  mainRoute.points.map(([x, z], index) => new THREE.Vector3(x, mainRoute.lifts[index] ?? 0, z)),
  false,
  'centripetal',
  0.35,
);
const gapStart = mainCurveWithLift.getPointAt(jumpGap[0]);
const gapEnd = mainCurveWithLift.getPointAt(jumpGap[1]);
const gapCenter = mainCurveWithLift.getPointAt((jumpGap[0] + jumpGap[1]) * 0.5);
const gapLength = Math.hypot(gapEnd.x - gapStart.x, gapEnd.z - gapStart.z);
const gapSurface = getCourseSurface(gapCenter.x, gapCenter.z, getTerrainHeight);
console.log(`  Gap length: ${gapLength.toFixed(2)}m; center: (${gapCenter.x.toFixed(1)}, ${gapCenter.z.toFixed(1)})`);
if (gapLength < 3.0 || gapLength > 5.0) {
  console.error('FAIL: Mainline gap is outside the current jump-range design budget.');
  process.exit(1);
}
if (gapSurface !== null) {
  console.error('FAIL: Collision resolver still reports a walkable course surface inside the visual gap.');
  process.exit(1);
}
const shortcutCurve = new THREE.CatmullRomCurve3(
  shortcutRoute.points.map(([x, z], index) => new THREE.Vector3(x, shortcutRoute.lifts[index] ?? 0, z)),
  false,
  'centripetal',
  0.35,
);
let nearestShortcutDistance = Number.POSITIVE_INFINITY;
for (let sample = 0; sample <= 120; sample++) {
  const point = shortcutCurve.getPointAt(sample / 120);
  nearestShortcutDistance = Math.min(nearestShortcutDistance, Math.hypot(point.x - gapCenter.x, point.z - gapCenter.z));
}
if (nearestShortcutDistance <= shortcutRoute.width * 0.5 + 0.25) {
  console.error('FAIL: Shortcut passes too close to the mainline gap instead of bypassing it.');
  process.exit(1);
}
console.log('PASS: Gap is physically absent from the shared support query and a separate route bypasses it.');


 
console.log('\nTest 10: Directional camera anticipation');
const approachPoint = mainCurveWithLift.getPointAt(Math.max(0, jumpGap[0] - 0.015));
const approachTangent = mainCurveWithLift.getTangentAt(Math.max(0, jumpGap[0] - 0.015)).setY(0).normalize();
const anticipationStartX = approachPoint.x - approachTangent.x * 6.0;
const anticipationStartZ = approachPoint.z - approachTangent.z * 6.0;
const lookingTowardGap = getCourseAnticipation(
  anticipationStartX, anticipationStartZ, approachTangent.x * 7, approachTangent.z * 7,
);
const lookingAway = getCourseAnticipation(
  anticipationStartX, anticipationStartZ, -approachTangent.x * 7, -approachTangent.z * 7,
);
console.log(`  Toward-gap cue: ${lookingTowardGap.toFixed(2)}; away-from-gap cue: ${lookingAway.toFixed(2)}`);
if (lookingTowardGap <= 0.1 || lookingAway !== 0) {
  console.error('FAIL: Camera anticipation did not distinguish approaching from leaving the jump.');
  process.exit(1);
}
console.log('PASS: Camera cue increases look-ahead only when approaching the jump with route alignment.');


console.log('\nTest 11: Rendered boardwalk and support-query height agreement');
const boardwalkPoint = mainCurveWithLift.getPointAt(0.55);
const boardwalkProbe = getCourseSurface(boardwalkPoint.x, boardwalkPoint.z, getTerrainHeight);
const expectedBoardwalkOffset = getCourseBoardwalkOffset(boardwalkPoint.y);
if (!boardwalkProbe || expectedBoardwalkOffset <= 0) {
  console.error('FAIL: Elevated boardwalk fixture is missing.');
  process.exit(1);
}
const boardwalkBaseHeight = getTerrainHeight(boardwalkPoint.x, boardwalkPoint.z) + boardwalkPoint.y + COURSE_SURFACE_LIFT;
const boardwalkHeightError = Math.abs(boardwalkProbe.height - (boardwalkBaseHeight + expectedBoardwalkOffset));
console.log(`  Expected boardwalk offset: ${expectedBoardwalkOffset.toFixed(3)}m; height error: ${boardwalkHeightError.toFixed(4)}m`);
if (boardwalkHeightError > 0.001) {
  console.error('FAIL: Boardwalk support query disagrees with the authored deck height.');
  process.exit(1);
}
console.log('PASS: Rendered boardwalk and collision support share the same deck-height formula.');

console.log('\nTest 12: Height-gated elevated course support');
const elevatedProbe = getCourseSurface(24.5, -9.0, getTerrainHeight);
if (!elevatedProbe) {
  console.error('FAIL: Elevated course probe has no shared support surface.');
  process.exit(1);
}
const underDeck = getWalkableSurface(24.5, -9.0, {
  characterY: elevatedProbe.height - 1.0,
  isGrounded: false,
  verticalVelocity: 3.0,
});
const descendingAboveDeck = getWalkableSurface(24.5, -9.0, {
  characterY: elevatedProbe.height + 0.15,
  isGrounded: false,
  verticalVelocity: -2.0,
});
console.log(`  Under-deck support: ${underDeck.surfaceType}; descending support: ${descendingAboveDeck.surfaceType}`);
if (underDeck.surfaceType === 'course' || descendingAboveDeck.surfaceType !== 'course') {
  console.error('FAIL: Elevated route either pulls a character upward through its deck or fails to catch a descending landing.');
  process.exit(1);
}
console.log('PASS: Course deck support is one-sided and height-aware.');

console.log('\nTest 13: Missed-jump recovery and authored route junction support');
const missedGapSupport = getWalkableSurface(gapCenter.x, gapCenter.z, {
  characterY: getTerrainHeight(gapCenter.x, gapCenter.z) + gapCenter.y + COURSE_SURFACE_LIFT + 0.35,
  isGrounded: false,
  verticalVelocity: -3.0,
});
if (missedGapSupport.surfaceType === 'course') {
  console.error('FAIL: Missed jump gap resolves to the missing mainline deck instead of lower-world recovery.');
  process.exit(1);
}
const forkSupport = getCourseSurface(forkPoint[0], forkPoint[1], getTerrainHeight);
const mergeSupport = getCourseSurface(mergePoint[0], mergePoint[1], getTerrainHeight);
if (!forkSupport || !mergeSupport
  || Math.abs(forkSupport.height - (getTerrainHeight(forkPoint[0], forkPoint[1]) + mainRoute.lifts[3] + COURSE_SURFACE_LIFT + getCourseBoardwalkOffset(mainRoute.lifts[3]))) > 0.01
  || Math.abs(mergeSupport.height - (getTerrainHeight(mergePoint[0], mergePoint[1]) + mainRoute.lifts[7] + COURSE_SURFACE_LIFT + getCourseBoardwalkOffset(mainRoute.lifts[7]))) > 0.01) {
  console.error('FAIL: Shared fork/merge coordinates do not resolve to their authored deck elevations.');
  process.exit(1);
}
console.log(`  Missed-gap fallback: ${missedGapSupport.surfaceType}; fork support: ${forkSupport.height.toFixed(3)}m; merge support: ${mergeSupport.height.toFixed(3)}m`);
console.log('PASS: Missed jump falls back to the lower world and fork/merge support heights remain queryable.');

console.log('\nTest 14: Collision footprint, exact-centre recovery and meadow boundary');
const exactCentreCollision = resolveCollision(-16, -18, 0.42, 0, 0);
const recoveredDistance = Math.hypot(exactCentreCollision.x + 16, exactCentreCollision.z + 18);
if (!exactCentreCollision.collided || recoveredDistance < 2.3 + 0.42 - 1e-6) {
  console.error(`FAIL: Exact-centre obstacle overlap was not resolved (distance ${recoveredDistance.toFixed(3)}m).`);
  process.exit(1);
}
const boundaryCollision = resolveCollision(49, 0, 0.42, 4, 0);
const boundaryRadius = Math.hypot(boundaryCollision.x, boundaryCollision.z);
if (!boundaryCollision.collided || boundaryRadius > 48.000001 || boundaryCollision.slideVelX > 0.000001) {
  console.error('FAIL: Perimeter collision did not clamp position and remove outward velocity.');
  process.exit(1);
}
console.log(`  Exact-centre collider recovery: ${recoveredDistance.toFixed(3)}m from obstacle centre; boundary radius: ${boundaryRadius.toFixed(3)}m`);
console.log('PASS: Collision resolution handles exact-centre overlap and outward boundary movement.');

console.log('\nTest 15: Full-controller horizontal motion kernel and response timing');
function simulateHorizontalMotion(
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number,
  response: number,
  fps: number,
  durationSeconds: number,
) {
  let x = startX;
  let z = startZ;
  const dt = 1 / fps;
  const steps = Math.round(durationSeconds * fps);
  for (let i = 0; i < steps; i++) {
    const step = advanceHorizontalVelocity(x, z, targetX, targetZ, response, dt);
    x = step.x;
    z = step.z;
  }
  return { x, z };
}
const accelerationResults = [30, 60, 120].map((fps) =>
  simulateHorizontalMotion(0, 0, 7, 0, GAME_FEEL.groundAcceleration, fps, 1).x
);
const brakingResults = [30, 60, 120].map((fps) =>
  simulateHorizontalMotion(7, 0, 0, 0, GAME_FEEL.groundBraking, fps, 0.5).x
);
const airSteerResults = [30, 60, 120].map((fps) =>
  simulateHorizontalMotion(0, 0, 0, 7, GAME_FEEL.airControl, fps, 1).z
);
const frameConsistent = (values: number[]) => Math.max(...values) - Math.min(...values) < 1e-8;
if (!frameConsistent(accelerationResults) || !frameConsistent(brakingResults) || !frameConsistent(airSteerResults)) {
  console.error('FAIL: horizontal acceleration/braking/air steering changed with render frame rate.');
  process.exit(1);
}
if (accelerationResults[0] < 6.999 || brakingResults[0] > 0.001 || airSteerResults[0] < 6.99) {
  console.error('FAIL: horizontal motion response failed its one-second/half-second response contract.');
  process.exit(1);
}
console.log(`  1s ground acceleration to 7m/s at 30/60/120 FPS: ${accelerationResults.map(v => v.toFixed(4)).join(' / ')} m/s`);
console.log(`  0.5s braking from 7m/s at 30/60/120 FPS: ${brakingResults.map(v => v.toFixed(4)).join(' / ')} m/s`);
console.log(`  1s air steering to 7m/s at 30/60/120 FPS: ${airSteerResults.map(v => v.toFixed(4)).join(' / ')} m/s`);
console.log('PASS: live-controller horizontal response kernel is deterministic across tested render rates.');

console.log('\nTest 16: Centralized game-feel values and jump-assist timing');
const hitchDelta = clampControllerDelta(0.12);
const minimumDelta = clampControllerDelta(0.0001);
const invalidDelta = clampControllerDelta(Number.NaN);
if (Math.abs(hitchDelta - 0.05) > 1e-9 || Math.abs(minimumDelta - 0.001) > 1e-9
  || Math.abs(invalidDelta - 1 / 60) > 1e-9) {
  console.error('FAIL: Controller frame-delta clamp does not bound long or invalid frame times.');
  process.exit(1);
}
console.log(`  120ms hitch -> ${(hitchDelta * 1000).toFixed(0)}ms simulated; invalid delta -> ${(invalidDelta * 1000).toFixed(2)}ms fallback`);
console.log('PASS: Controller simulation delta is bounded and rejects non-finite frame times.');


if (GAME_FEEL.coyoteTimeSeconds !== 0.16 || GAME_FEEL.jumpBufferSeconds !== 0.2) {
  console.error('FAIL: Documented coyote/buffer timing changed unexpectedly.');
  process.exit(1);
}
const coyoteStart = updateJumpAssistTimers(0, 0, true, false, 1 / 60);
const coyoteMid = updateJumpAssistTimers(coyoteStart.coyoteTimer, 0, false, false, 0.1);
const coyoteExpired = updateJumpAssistTimers(coyoteMid.coyoteTimer, 0, false, false, 0.07);
if (Math.abs(coyoteStart.coyoteTimer - 0.16) > 1e-9
  || Math.abs(coyoteMid.coyoteTimer - 0.06) > 1e-9
  || coyoteExpired.coyoteTimer !== 0) {
  console.error('FAIL: Coyote timer does not respect its configured duration.');
  process.exit(1);
}
const buffered = updateJumpAssistTimers(0, GAME_FEEL.jumpBufferSeconds, true, false, 1 / 60);
const rollingBuffer = updateJumpAssistTimers(0, GAME_FEEL.jumpBufferSeconds, true, true, 1 / 60);
if (!buffered.consumeBufferedJump || rollingBuffer.consumeBufferedJump) {
  console.error('FAIL: Buffered jump consumption ignores grounded/rolling state.');
  process.exit(1);
}
function simulateVelocityResponse(frameDelta: number, duration = 1) {
  let velocity = 0;
  const frames = Math.round(duration / frameDelta);
  for (let i = 0; i < frames; i++) {
    velocity += (7.0 - velocity) * getResponseAlpha(GAME_FEEL.airControl, frameDelta);
  }
  return velocity;
}
const response30 = simulateVelocityResponse(1 / 30);
const response60 = simulateVelocityResponse(1 / 60);
const response120 = simulateVelocityResponse(1 / 120);
if (Math.abs(response30 - response60) > 1e-9 || Math.abs(response60 - response120) > 1e-9) {
  console.error(`FAIL: Controller movement response differs by frame rate: ${response30}, ${response60}, ${response120}`);
  process.exit(1);
}
console.log(`  Coyote: ${GAME_FEEL.coyoteTimeSeconds.toFixed(2)}s; buffer: ${GAME_FEEL.jumpBufferSeconds.toFixed(2)}s; air response: ${GAME_FEEL.airControl.toFixed(1)} s⁻¹`);
console.log(`  One-second air-steering speed at 30/60/120 FPS: ${response30.toFixed(4)} / ${response60.toFixed(4)} / ${response120.toFixed(4)} m/s`);
console.log('PASS: Coyote/buffer clocks and the controller movement-response helper meet their timing contracts.');

console.log('\nTest 17: Apex assistance does not slow the descent');
const risingNearApex = advanceVerticalMotion(0.5, 1 / 120);
const fallingNearGround = advanceVerticalMotion(-0.5, 1 / 120);
const expectedRisingVelocity = 0.5 - GAME_FEEL.jumpGravity * GAME_FEEL.jumpApexGravityScale / 120;
const expectedFallingVelocity = -0.5 - GAME_FEEL.jumpGravity / 120;
if (Math.abs(risingNearApex.velocity - expectedRisingVelocity) > 1e-8
  || Math.abs(fallingNearGround.velocity - expectedFallingVelocity) > 1e-8) {
  console.error('FAIL: Apex gravity assistance must apply only while rising near the apex.');
  process.exit(1);
}
console.log(`  Rising near apex: ${risingNearApex.velocity.toFixed(4)}m/s; descending: ${fallingNearGround.velocity.toFixed(4)}m/s`);
console.log('PASS: Apex assistance widens the rising apex window without softening descent.');

console.log('\nTest 18: Shared jump trajectory across frame rates and frame hitches');
function simulateJump(frameDelta: number) {
  let y = 0;
  let velocity: number = GAME_FEEL.jumpInitialSpeed;
  let elapsed = 0;
  let frames = 0;
  const horizontalSpeed = 7.0;
  while (frames < 240 && !(frames > 0 && y <= 0 && velocity < 0)) {
    const step = advanceVerticalMotion(velocity, frameDelta);
    velocity = step.velocity;
    y += step.displacement;
    elapsed += frameDelta;
    frames++;
  }
  if (frames >= 240) throw new Error('Jump simulation failed to return to ground.');
  return { elapsed, distance: elapsed * horizontalSpeed, frames };
}
const jumpRuns = [
  { label: '30 FPS', ...simulateJump(1 / 30) },
  { label: '60 FPS', ...simulateJump(1 / 60) },
  { label: '120 FPS', ...simulateJump(1 / 120) },
  { label: '120 ms frame hitch', ...simulateJump(0.12) },
];
for (const run of jumpRuns) {
  console.log(`  ${run.label}: flight ${run.elapsed.toFixed(3)}s, horizontal range ${run.distance.toFixed(2)}m`);
}
const jumpDistances = jumpRuns.map((run) => run.distance);
const jumpTimes = jumpRuns.map((run) => run.elapsed);
const distanceSpread = Math.max(...jumpDistances) - Math.min(...jumpDistances);
const timeSpread = Math.max(...jumpTimes) - Math.min(...jumpTimes);
if (distanceSpread > 1.0 || timeSpread > 0.15) {
  console.error(`FAIL: Jump trajectory diverges too much across frame rates (range spread ${distanceSpread.toFixed(2)}m, time spread ${timeSpread.toFixed(3)}s).`);
  process.exit(1);
}
if (jumpRuns.find((run) => run.label === '30 FPS')!.distance < 4.0) {
  console.error('FAIL: The current jump cannot cover even the lower bound of the authored gap budget.');
  process.exit(1);
}
console.log('PASS: Gameplay and test share the same bounded-substep integrator; jump range remains within the current tolerance.');

console.log('\nTest 19: Course scene cleanup is complete and idempotent');
const lifecycleScene = new THREE.Scene();
const lifecycleCourse = createMeadowCourse(lifecycleScene);
const ownedObjectCount = lifecycleScene.children.length;
if (!lifecycleScene.children.some((object) => object.name === 'MeadowCourse_InstancedTimberCrossbeams')) {
  console.error('FAIL: Raised route is missing its instanced under-deck crossbeam structure.');
  process.exit(1);
}
if (ownedObjectCount < 5) {
  console.error(`FAIL: Expected route and instanced course objects, found ${ownedObjectCount}.`);
  process.exit(1);
}
lifecycleCourse.dispose();
lifecycleCourse.dispose();
if (lifecycleScene.children.length !== 0) {
  console.error(`FAIL: Course cleanup left ${lifecycleScene.children.length} scene objects behind.`);
  process.exit(1);
}
console.log(`PASS: ${ownedObjectCount} course scene objects removed; repeated disposal did not throw.`);



console.log('\\nTest 17: Authored gap reach envelope (vertical production integrator + route geometry)');
const reachGap = mainRoute.gaps?.[0];
if (!reachGap) {
  console.error('FAIL: No authored mainline gap to measure.');
  process.exit(1);
}
const reachCurve = new THREE.CatmullRomCurve3(
  mainRoute.points.map(([x, z], index) => new THREE.Vector3(x, mainRoute.lifts[index] ?? 0, z)),
  false,
  'centripetal',
  0.35,
);
const reachStart = reachCurve.getPointAt(reachGap[0]);
const reachEnd = reachCurve.getPointAt(reachGap[1]);
const reachDistance = Math.hypot(reachEnd.x - reachStart.x, reachEnd.z - reachStart.z);
const reachStartGround = getTerrainHeight(reachStart.x, reachStart.z) + reachStart.y + COURSE_SURFACE_LIFT + getCourseBoardwalkOffset(reachStart.y);
const reachEndGround = getTerrainHeight(reachEnd.x, reachEnd.z) + reachEnd.y + COURSE_SURFACE_LIFT + getCourseBoardwalkOffset(reachEnd.y);
const launchHeightDelta = reachEndGround - reachStartGround;
const reachStep = 1 / 120;
let reachTime = 0;
let reachY = 0;
let reachV: number = GAME_FEEL.jumpInitialSpeed;
let passedApex = false;
while (reachTime < 2.0) {
  const step = advanceVerticalMotion(reachV, reachStep);
  reachV = step.velocity;
  reachY += step.displacement;
  reachTime += reachStep;
  if (reachV <= 0) passedApex = true;
  if (passedApex && reachY <= launchHeightDelta) break;
}
const assumedFootprintRadius = 0.42; // Same horizontal collision radius passed by the live controller.
// Support resolution is point-based: the controller must move its root centre across the chord. The 0.42m radius is recorded as body overhang, not incorrectly added to centre travel.
const runReach = 5.2 * reachTime;
const walkReach = 2.8 * reachTime;
const sprintReach = 7.0 * reachTime;
console.log(`  Horizontal gap chord: ${reachDistance.toFixed(2)}m; endpoint height delta: ${launchHeightDelta.toFixed(2)}m; integrated flight window: ${reachTime.toFixed(3)}s`);
console.log(`  Constant-speed envelope (not full controller telemetry): walk 2.8m/s=${walkReach.toFixed(2)}m, run 5.2m/s=${runReach.toFixed(2)}m, sprint 7.0m/s=${sprintReach.toFixed(2)}m; root-centre travel target ${reachDistance.toFixed(2)}m with ${assumedFootprintRadius.toFixed(2)}m body radius noted separately (not added to centre travel)`);
if (reachTime >= 2.0 || !(walkReach < reachDistance) || runReach < reachDistance || sprintReach < reachDistance) {
  console.error('FAIL: Current jump parameters do not produce the expected walk-fails / run-and-sprint-reach design envelope.');
  process.exit(1);
}
console.log('PASS: Authored gap fits the nominal run/sprint reach envelope; walking speed is intentionally insufficient. This is a vertical-integrator/constant-horizontal-speed estimate, not an end-to-end controller jump.');

console.log('\\nTest 18: Live production controller update at 30/60/120 FPS');
const controllerRuns: Array<{ fps: number; travel: number; stopSpeed: number }> = [];
for (const fps of [30, 60, 120]) {
  const root = new THREE.Group();
  const startX = 28;
  const startZ = 28;
  root.position.set(startX, getWalkableSurface(startX, startZ).height, startZ);
  const controller = createCharacterController(root, []);
  const frames = fps;
  for (let frame = 0; frame < frames; frame++) {
    controller.update(1 / fps, { x: 0, y: 1, sprint: true, jump: false }, 0, frame / fps);
  }
  const travel = Math.hypot(root.position.x - startX, root.position.z - startZ);
  for (let frame = 0; frame < frames; frame++) {
    controller.update(1 / fps, { x: 0, y: 0, sprint: false, jump: false }, 0, 1 + frame / fps);
  }
  const stopSpeed = Math.hypot(controller.velocity.x, controller.velocity.z);
  controllerRuns.push({ fps, travel, stopSpeed });
  controller.dispose();
}
for (const run of controllerRuns) {
  console.log(`  ${run.fps} FPS: one-second sprint travel=${run.travel.toFixed(2)}m; speed after one-second braking=${run.stopSpeed.toFixed(3)}m/s`);
}
const controllerTravelSpread = Math.max(...controllerRuns.map(r => r.travel)) - Math.min(...controllerRuns.map(r => r.travel));
if (controllerTravelSpread > 0.25 || controllerRuns.some(r => r.travel < 5.0 || r.travel > 7.5 || r.stopSpeed > 0.15)) {
  console.error('FAIL: Production controller movement diverges excessively by frame rate or braking does not settle.');
  process.exit(1);
}
console.log('PASS: The actual character-controller update path accelerates and brakes consistently at 30/60/120 FPS in an obstacle-free terrain fixture.');

console.log('\\nTest 19: Production controller buffered jump survives until landing');
{
  const root = new THREE.Group();
  root.position.set(28, getWalkableSurface(28, 28).height, 28);
  const controller = createCharacterController(root, []);
  let bufferedPressSent = false;
  let sawSecondTakeoff = false;
  let previousVerticalSpeed = 0;
  const fps = 120;
  for (let frame = 0; frame < 150; frame++) {
    const time = frame / fps;
    const pressBufferedJump = !bufferedPressSent && time >= 0.60;
    const input = { x: 0, y: 0, sprint: false, jump: frame === 0 || pressBufferedJump };
    if (pressBufferedJump) bufferedPressSent = true;
    controller.update(1 / fps, input, 0, time);
    if (bufferedPressSent && frame > 75 && controller.verticalSpeed > 4.0 && previousVerticalSpeed <= 0.1) {
      sawSecondTakeoff = true;
      break;
    }
    previousVerticalSpeed = controller.verticalSpeed;
  }
  controller.dispose();
  if (!sawSecondTakeoff) {
    console.error('FAIL: Buffered jump did not trigger a second takeoff after the first landing.');
    process.exit(1);
  }
}
console.log('PASS: A jump press buffered during descent is consumed by the live controller after ground contact.');





console.log('\\nTest 20: Production controller run-speed jump across the authored gap');
{
  const gap = mainRoute.gaps?.[0];
  if (!gap) {
    console.error('FAIL: Missing authored gap fixture.');
    process.exit(1);
  }
  const curve = new THREE.CatmullRomCurve3(
    mainRoute.points.map(([x, z], index) => new THREE.Vector3(x, mainRoute.lifts[index] ?? 0, z)),
    false,
    'centripetal',
    0.35,
  );
  const curveLength = curve.getLength();
  const gapStart = curve.getPointAt(gap[0]);
  const gapEnd = curve.getPointAt(gap[1]);
  const tangent = curve.getTangentAt(gap[0]).setY(0).normalize();
  const runUpStart = curve.getPointAt(Math.max(0, gap[0] - 4.0 / curveLength));
  const cameraYaw = Math.atan2(-tangent.x, -tangent.z);
  const root = new THREE.Group();
  root.position.set(runUpStart.x, getWalkableSurface(runUpStart.x, runUpStart.z).height, runUpStart.z);
  const controller = createCharacterController(root, []);
  const fps = 120;
  let jumpIssued = false;
  let takeoffSpeed = 0;
  let takeoffFrame = -1;
  let landingFrame = -1;
  let takeoffPosition: THREE.Vector3 | null = null;
  let landingPosition: THREE.Vector3 | null = null;
  let landedOnFarDeck = false;
  let furthestProgress = 0;
  const gapChord = Math.hypot(gapEnd.x - gapStart.x, gapEnd.z - gapStart.z);
  for (let frame = 0; frame < 240; frame++) {
    const remaining = (gapStart.x - root.position.x) * tangent.x + (gapStart.z - root.position.z) * tangent.z;
    const jump = !jumpIssued && remaining <= 0.08;
    if (jump) {
      jumpIssued = true;
      takeoffFrame = frame;
      takeoffPosition = root.position.clone();
      takeoffSpeed = Math.hypot(controller.velocity.x, controller.velocity.z);
    }
    controller.update(1 / fps, { x: 0, y: 0.85, sprint: false, jump }, cameraYaw, frame / fps);
    const progress = (root.position.x - gapStart.x) * tangent.x + (root.position.z - gapStart.z) * tangent.z;
    furthestProgress = Math.max(furthestProgress, progress);
    if (jumpIssued && frame > 10 && controller.isGrounded && progress >= gapChord - 0.05) {
      landedOnFarDeck = controller.surfaceType === 'course';
      landingFrame = frame;
      landingPosition = root.position.clone();
      break;
    }
    if (jumpIssued && frame > 10 && controller.isGrounded && progress < gapChord - 0.05) break;
  }
  const centreTravel = takeoffPosition && landingPosition
    ? Math.hypot(landingPosition.x - takeoffPosition.x, landingPosition.z - takeoffPosition.z)
    : 0;
  console.log(`  Run-up input magnitude 0.85; takeoff speed ${takeoffSpeed.toFixed(2)}m/s at (${takeoffPosition?.x.toFixed(2) ?? 'n/a'}, ${takeoffPosition?.z.toFixed(2) ?? 'n/a'}); landing (${landingPosition?.x.toFixed(2) ?? 'n/a'}, ${landingPosition?.z.toFixed(2) ?? 'n/a'}); centre travel ${centreTravel.toFixed(2)}m; flight ${takeoffFrame >= 0 && landingFrame >= 0 ? ((landingFrame - takeoffFrame) / fps).toFixed(3) : 'n/a'}s; gap chord ${gapChord.toFixed(2)}m; far-deck progress ${furthestProgress.toFixed(2)}m; surface ${controller.surfaceType}`);
  controller.dispose();
  if (!jumpIssued || !landedOnFarDeck) {
    console.error('FAIL: Actual controller did not complete the run-speed jump and land on the far elevated course deck.');
    process.exit(1);
  }
}
console.log('PASS: Actual controller crossed the authored gap from a run-speed approach and landed on the elevated course.');



console.log('\\nTest 21: Missed gap lands safely on the lower meadow');
{
  const gap = mainRoute.gaps?.[0];
  if (!gap) {
    console.error('FAIL: Missing authored gap fixture.');
    process.exit(1);
  }
  const curve = new THREE.CatmullRomCurve3(
    mainRoute.points.map(([x, z], index) => new THREE.Vector3(x, mainRoute.lifts[index] ?? 0, z)),
    false,
    'centripetal',
    0.35,
  );
  const gapStart = curve.getPointAt(gap[0]);
  const tangent = curve.getTangentAt(gap[0]).setY(0).normalize();
  const runUpStart = curve.getPointAt(Math.max(0, gap[0] - 4.0 / curve.getLength()));
  const cameraYaw = Math.atan2(-tangent.x, -tangent.z);
  const root = new THREE.Group();
  root.position.set(runUpStart.x, getWalkableSurface(runUpStart.x, runUpStart.z).height, runUpStart.z);
  const controller = createCharacterController(root, []);
  let recoveredOnGround = false;
  let recoveredProgress = 0;
  for (let frame = 0; frame < 240; frame++) {
    controller.update(1 / 120, { x: 0, y: 0.85, sprint: false, jump: false }, cameraYaw, frame / 120);
    const progress = (root.position.x - gapStart.x) * tangent.x + (root.position.z - gapStart.z) * tangent.z;
    if (progress > 0.8 && controller.isGrounded && controller.surfaceType !== 'course') {
      recoveredOnGround = !controller.isDead;
      recoveredProgress = progress;
      break;
    }
  }
  console.log(`  Missed-jump recovery: grounded=${controller.isGrounded}; surface=${controller.surfaceType}; alive=${!controller.isDead}; progress beyond gap start=${recoveredProgress.toFixed(2)}m`);
  controller.dispose();
  if (!recoveredOnGround) {
    console.error('FAIL: Missing the jump did not resolve to a safe lower-ground landing.');
    process.exit(1);
  }
}
console.log('PASS: Missing the jump produces a safe lower-meadow landing instead of a death state. This does not prove rejoining the elevated course without respawning.');

console.log('=== ALL AUDIT TESTS PASSED SUCCESSFULLY ===');

import * as THREE from 'three';
import {
  getTerrainHeight,
  getWalkableSurface,
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
import { advanceVerticalMotion, GAME_FEEL, updateJumpAssistTimers } from '../scene/gameFeel';
import { createMeadowCourse } from '../scene/courseSystem';
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

console.log('\nTest 13: Centralized game-feel values and jump-assist timing');
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
const alphaAt30 = 1 - Math.exp(-GAME_FEEL.airControl / 30);
const alphaAt60 = 1 - Math.exp(-GAME_FEEL.airControl / 60);
const alphaAt120 = 1 - Math.exp(-GAME_FEEL.airControl / 120);
const combined30 = 1 - (1 - alphaAt30) ** 2;
const combined60 = 1 - (1 - alphaAt60) ** 2;
if (Math.abs(combined30 - alphaAt60) > 1e-9 || Math.abs(combined60 - alphaAt120) > 1e-9) {
  console.error('FAIL: Exponential movement response is not frame-rate consistent.');
  process.exit(1);
}
console.log(`  Coyote: ${GAME_FEEL.coyoteTimeSeconds.toFixed(2)}s; buffer: ${GAME_FEEL.jumpBufferSeconds.toFixed(2)}s; air response: ${GAME_FEEL.airControl.toFixed(1)} s⁻¹`);
console.log('PASS: Coyote/buffer clocks and exponential movement response meet their timing contracts.');

console.log('\nTest 14: Shared jump trajectory across frame rates and frame hitches');
function simulateJump(frameDelta: number) {
  let y = 0;
  let velocity = GAME_FEEL.jumpInitialSpeed;
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

console.log('\nTest 15: Course scene cleanup is complete and idempotent');
const lifecycleScene = new THREE.Scene();
const lifecycleCourse = createMeadowCourse(lifecycleScene);
const ownedObjectCount = lifecycleScene.children.length;
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

console.log('\n=== ALL AUDIT TESTS PASSED SUCCESSFULLY ===');

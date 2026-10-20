import {
  getTerrainHeight,
  getWalkableSurface,
  getBridgeDeckHeight,
  isInsideWaterBody,
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

console.log('\n=== ALL AUDIT TESTS PASSED SUCCESSFULLY ===');

import * as THREE from 'three';
import { getTerrainHeight, getBaseTerrainHeight, getBridgeDeckHeight } from './terrain';

/**
 * Bridge Layout and Corner Geometry Specification
 * Enforces strict 4-corner grounding, independent bank elevation adaptation,
 * and unified collision alignment.
 */
export interface BridgeLayout {
  id: string;
  name: string;
  centerX: number;
  centerZ: number;
  rotY: number;
  deckLength: number; // span across stream banks
  deckWidth: number; // width of walkable deck
  deckThickness: number;
  railHeight: number;
  supportFootRadius: number;
  supportInsetX: number;
  supportInsetZ: number;
  style: 'spirited-away-vermilion' | 'rustic-timber-arched';
}

export interface BridgeCornerData {
  localX: number;
  localZ: number;
  worldX: number;
  worldZ: number;
  deckY: number;
  groundY: number;
  supportHeight: number;
}

export interface BridgeInstance {
  group: THREE.Group;
  layout: BridgeLayout;
  corners: {
    nearLeft: BridgeCornerData;
    nearRight: BridgeCornerData;
    farLeft: BridgeCornerData;
    farRight: BridgeCornerData;
  };
  getDeckHeightAt: (worldX: number, worldZ: number) => number | null;
  dispose: () => void;
}

/**
 * Standard Spirited Away Vermilion Bridge Specification
 * Art direction inspired by the bathhouse bridge in Studio Ghibli's Spirited Away:
 * - Rich vermilion lacquer rails and posts with classical Japanese balustrades
 * - Turned giboshi / ornamental pointed timber finials atop main entrance posts
 * - Deep dark timber undercarriage stringers and mortise cross-beams
 * - Weathered natural cypress/cedar deck planks
 * - Four independently grounded corner support pilings with stone foundation shoes
 */
export const SPIRITED_AWAY_BRIDGE_LAYOUT: BridgeLayout = {
  id: 'spirited-away-bridge',
  name: 'Spirited Away Vermilion Crossing',
  centerX: -1.1,
  centerZ: -6.9,
  rotY: -0.32,
  deckLength: 5.2, // spans comfortably across the 2.4m stream banks
  deckWidth: 2.4, // wide, generous traversal corridor
  deckThickness: 0.14,
  railHeight: 0.98,
  supportFootRadius: 0.16,
  supportInsetX: 0.95, // near the outer rail edges
  supportInsetZ: 2.1, // planted securely on bank turf
  style: 'spirited-away-vermilion',
};

/**
 * Calculates world coordinates and exact ground elevations for all 4 support feet.
 */
export function calculateBridgeCorners(layout: BridgeLayout): {
  nearLeft: BridgeCornerData;
  nearRight: BridgeCornerData;
  farLeft: BridgeCornerData;
  farRight: BridgeCornerData;
} {
  const { centerX, centerZ, rotY, supportInsetX, supportInsetZ } = layout;
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);

  function makeCorner(localX: number, localZ: number): BridgeCornerData {
    const worldX = centerX + cosR * localX - sinR * localZ;
    const worldZ = centerZ + sinR * localX + cosR * localZ;
    const groundY = getTerrainHeight(worldX, worldZ);
    const bridgeEval = getBridgeDeckHeight(worldX, worldZ);
    const deckY = bridgeEval.deckHeight;
    const supportHeight = Math.max(0.18, deckY - groundY);

    return {
      localX,
      localZ,
      worldX,
      worldZ,
      deckY,
      groundY,
      supportHeight,
    };
  }

  return {
    nearLeft: makeCorner(-supportInsetX, -supportInsetZ),
    nearRight: makeCorner(supportInsetX, -supportInsetZ),
    farLeft: makeCorner(-supportInsetX, supportInsetZ),
    farRight: makeCorner(supportInsetX, supportInsetZ),
  };
}

/**
 * Creates the Spirited Away Inspired Vermilion Timber Bridge.
 */
export function buildSpiritedAwayBridge(layout = SPIRITED_AWAY_BRIDGE_LAYOUT): BridgeInstance {
  const group = new THREE.Group();
  group.position.set(layout.centerX, 0, layout.centerZ);
  group.rotation.y = layout.rotY;

  const corners = calculateBridgeCorners(layout);

  const baseGroundY = getBaseTerrainHeight(layout.centerX, layout.centerZ);
  const deckBaseY = baseGroundY + 0.38;

  // Material Palette (Ghibli Cel-Shaded)
  const vermilionRailMat = new THREE.MeshStandardMaterial({
    color: '#b93022', // Rich Ghibli vermilion cinnabar lacquer
    roughness: 0.62,
    metalness: 0.05,
    flatShading: true,
  });

  const vermilionAccentMat = new THREE.MeshStandardMaterial({
    color: '#8f2015', // Deep shaded vermilion undertone
    roughness: 0.65,
    metalness: 0.04,
    flatShading: true,
  });

  const goldFinialMat = new THREE.MeshStandardMaterial({
    color: '#d4a438', // Muted bronze-gold giboshi post caps
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
  });

  const timberDeckMat = new THREE.MeshStandardMaterial({
    color: '#6e4f38', // Natural weathered cypress/cedar planks
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  });

  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: '#342318', // Heavy dark understructure beams & pilings
    roughness: 0.9,
    metalness: 0.03,
    flatShading: true,
  });

  const stonePlinthMat = new THREE.MeshStandardMaterial({
    color: '#5e635b', // Chiseled granite foundation plinths
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });

  // -------------------------------------------------------------
  // 1. Four Independently Grounded Corner Support Pilings & Shoes
  // -------------------------------------------------------------
  const cornerList = [corners.nearLeft, corners.nearRight, corners.farLeft, corners.farRight];

  cornerList.forEach((c) => {
    // A. Granite Foundation Plinth / Shoe embedded in earth
    const shoeSize = layout.supportFootRadius * 2.4;
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(shoeSize, 0.22, shoeSize),
      stonePlinthMat
    );
    // Plinth placed centered at local ground height
    shoe.position.set(c.localX, c.groundY + 0.08, c.localZ);
    shoe.castShadow = true;
    shoe.receiveShadow = true;
    group.add(shoe);

    // B. Heavy Dark Cypress Support Piling extending up to deck underside
    const pilingHeight = Math.max(0.15, c.deckY - (c.groundY + 0.16));
    const piling = new THREE.Mesh(
      new THREE.CylinderGeometry(
        layout.supportFootRadius * 0.9,
        layout.supportFootRadius * 1.05,
        pilingHeight,
        7
      ),
      darkTimberMat
    );
    piling.position.set(c.localX, c.groundY + 0.16 + pilingHeight * 0.5, c.localZ);
    piling.castShadow = true;
    piling.receiveShadow = true;
    group.add(piling);

    // C. Decorative Vermilion Base Collar wrapping the piling top
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(shoeSize * 0.85, 0.12, shoeSize * 0.85),
      vermilionAccentMat
    );
    collar.position.set(c.localX, c.deckY - 0.06, c.localZ);
    collar.castShadow = true;
    group.add(collar);
  });

  // Intermediate Riverbed Piling Bents in the shallows (for structural authenticity)
  [-0.95, 0.95].forEach((sideX) => {
    [0.0].forEach((midZ) => {
      const worldX = layout.centerX + Math.cos(layout.rotY) * sideX - Math.sin(layout.rotY) * midZ;
      const worldZ = layout.centerZ + Math.sin(layout.rotY) * sideX + Math.cos(layout.rotY) * midZ;
      const bedY = getTerrainHeight(worldX, worldZ);
      const midHeight = Math.max(0.3, deckBaseY - bedY);

      const midPiling = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.16, midHeight, 6),
        darkTimberMat
      );
      midPiling.position.set(sideX, bedY + midHeight * 0.5, midZ);
      midPiling.castShadow = true;
      group.add(midPiling);

      // Pier stone footing
      const midShoe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), stonePlinthMat);
      midShoe.scale.set(1.2, 0.6, 1.2);
      midShoe.position.set(sideX, bedY + 0.08, midZ);
      midShoe.castShadow = true;
      group.add(midShoe);
    });
  });

  // -------------------------------------------------------------
  // 2. Heavy Longitudinal Under-Beams & Cross-Girders
  // -------------------------------------------------------------
  const halfSpan = layout.deckLength * 0.5;

  [-layout.supportInsetX, layout.supportInsetX].forEach((bx) => {
    const stringer = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.22, layout.deckLength - 0.3),
      darkTimberMat
    );
    stringer.position.set(bx, deckBaseY - 0.11, 0);
    stringer.castShadow = true;
    group.add(stringer);
  });

  // Cross tie-beams connecting pilings
  [-layout.supportInsetZ, 0, layout.supportInsetZ].forEach((cz) => {
    const crossBeam = new THREE.Mesh(
      new THREE.BoxGeometry(layout.deckWidth - 0.1, 0.16, 0.18),
      darkTimberMat
    );
    crossBeam.position.set(0, deckBaseY - 0.16, cz);
    crossBeam.castShadow = true;
    group.add(crossBeam);
  });

  // -------------------------------------------------------------
  // 3. Walkable Timber Deck (Readable Cypress Planks with Bevels)
  // -------------------------------------------------------------
  const plankCount = 26;
  const plankSpacing = (layout.deckLength - 0.2) / plankCount;
  const plankWidth = plankSpacing * 0.92;

  for (let p = 0; p < plankCount; p++) {
    const t = (p + 0.5) / plankCount;
    const pZ = (t - 0.5) * (layout.deckLength - 0.2);

    const worldX = layout.centerX - Math.sin(layout.rotY) * pZ;
    const worldZ = layout.centerZ + Math.cos(layout.rotY) * pZ;
    const bridgeEval = getBridgeDeckHeight(worldX, worldZ);
    const pY = bridgeEval.deckHeight;

    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(layout.deckWidth, 0.085, plankWidth),
      timberDeckMat
    );
    plank.position.set(0, pY, pZ);
    plank.rotation.x = -2.0 * (pZ / halfSpan) * (0.08 / halfSpan);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // Vermilion Outer Edge Beams (Side Fascia Planks)
  [-layout.deckWidth * 0.5 - 0.05, layout.deckWidth * 0.5 + 0.05].forEach((fx) => {
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.16, layout.deckLength),
      vermilionAccentMat
    );
    fascia.position.set(fx, deckBaseY - 0.02, 0);
    fascia.castShadow = true;
    group.add(fascia);
  });

  // -------------------------------------------------------------
  // 4. Spirited Away Vermilion Balustrades, Rails & Giboshi Posts
  // -------------------------------------------------------------
  [-layout.deckWidth * 0.5 + 0.08, layout.deckWidth * 0.5 - 0.08].forEach((railSideX) => {
    // Main Entrance and Exit Posts (4 Grand Corner Posts with Giboshi Finials)
    [-halfSpan + 0.18, halfSpan - 0.18].forEach((pz) => {
      // Main structural post
      const cornerPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, layout.railHeight + 0.22, 0.18),
        vermilionRailMat
      );
      cornerPost.position.set(railSideX, deckBaseY + (layout.railHeight + 0.22) * 0.5, pz);
      cornerPost.castShadow = true;
      group.add(cornerPost);

      // Turned Giboshi (Bronze-Gold Ornamental Finial Cap)
      const finialBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 0.1, 8),
        goldFinialMat
      );
      finialBase.position.set(railSideX, deckBaseY + layout.railHeight + 0.24, pz);
      group.add(finialBase);

      const finialPoint = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.18, 8),
        goldFinialMat
      );
      finialPoint.position.set(railSideX, deckBaseY + layout.railHeight + 0.36, pz);
      group.add(finialPoint);
    });

    // Intermediate Baluster Posts along bridge length
    const intermediatePosts = [-1.4, -0.7, 0.0, 0.7, 1.4];
    intermediatePosts.forEach((pz) => {
      const midPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, layout.railHeight + 0.08, 0.12),
        vermilionRailMat
      );
      midPost.position.set(railSideX, deckBaseY + (layout.railHeight + 0.08) * 0.5, pz);
      midPost.castShadow = true;
      group.add(midPost);
    });

    // Horizontal Vermilion Handrail (Top Cap)
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.09, layout.deckLength - 0.2),
      vermilionRailMat
    );
    topRail.position.set(railSideX, deckBaseY + layout.railHeight, 0);
    topRail.castShadow = true;
    group.add(topRail);

    // Lower Curb Rail
    const bottomRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, layout.deckLength - 0.2),
      vermilionAccentMat
    );
    bottomRail.position.set(railSideX, deckBaseY + 0.18, 0);
    bottomRail.castShadow = true;
    group.add(bottomRail);

    // Classical Japanese Vertical Baluster Slats (Slender, rhythmic pattern)
    const slatCount = 28;
    for (let s = 0; s < slatCount; s++) {
      const t = (s + 0.5) / slatCount;
      const sZ = (t - 0.5) * (layout.deckLength - 0.6);
      // Skip where intermediate posts are located
      const nearPost = intermediatePosts.some((ipz) => Math.abs(ipz - sZ) < 0.18);
      if (nearPost) continue;

      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, layout.railHeight - 0.28, 0.045),
        vermilionRailMat
      );
      slat.position.set(railSideX, deckBaseY + 0.18 + (layout.railHeight - 0.28) * 0.5, sZ);
      slat.castShadow = true;
      group.add(slat);
    }
  });

  // -------------------------------------------------------------
  // 5. Seamless Bank Abutments / Flagstone Walkway Approaches
  // Flush with dirt footpath on both banks (Zero grey barrier blocks!)
  // -------------------------------------------------------------
  [-halfSpan - 0.35, halfSpan + 0.35].forEach((abZ) => {
    const worldX = layout.centerX + Math.cos(layout.rotY) * 0 - Math.sin(layout.rotY) * abZ;
    const worldZ = layout.centerZ + Math.sin(layout.rotY) * 0 + Math.cos(layout.rotY) * abZ;
    const groundH = getTerrainHeight(worldX, worldZ);

    // Weathered stone threshold ramp embedded in dirt trail
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(layout.deckWidth + 0.2, 0.14, 0.65),
      stonePlinthMat
    );
    ramp.position.set(0, groundH + 0.04, abZ);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    group.add(ramp);
  });

  return {
    group,
    layout,
    corners,
    getDeckHeightAt: (worldX: number, worldZ: number) => {
      const evalResult = getBridgeDeckHeight(worldX, worldZ);
      return evalResult.onBridge ? evalResult.deckHeight : null;
    },
    dispose: () => {
      vermilionRailMat.dispose();
      vermilionAccentMat.dispose();
      goldFinialMat.dispose();
      timberDeckMat.dispose();
      darkTimberMat.dispose();
      stonePlinthMat.dispose();
    },
  };
}

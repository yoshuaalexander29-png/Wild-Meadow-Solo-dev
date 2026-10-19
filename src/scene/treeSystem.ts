import * as THREE from 'three';

export type TreeArchetype = 'mature-broadleaf' | 'slender-woodland' | 'understory-sapling';

export interface TreeInstance {
  group: THREE.Group;
  archetype: TreeArchetype;
  position: THREE.Vector3;
  trunkRadius: number;
  dispose: () => void;
}

// Seeded deterministic random number generator
export function createSeededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Procedural Anatomical Tree Generator
 * Enforces strict botanical branching rules:
 * - Parent attachment: every branch originates directly from the surface of its parent.
 * - Progressive taper: trunk and branches continuously narrow toward their tips.
 * - Strict hierarchy: Generation 0 (Trunk) > Generation 1 (Main Limbs) > Generation 2 (Secondary Twigs).
 * - Clear canopy clearance: lowest foliage begins > 3.4m, eliminating all camera and player clipping.
 */
export function createBotanicalTree(
  archetype: TreeArchetype,
  seed = 42,
  sharedMaterials?: {
    trunkMat: THREE.Material;
    leafMats: THREE.Material[];
  }
): THREE.Group {
  const rnd = createSeededRandom(seed);
  const treeGroup = new THREE.Group();

  const trunkMat =
    sharedMaterials?.trunkMat ||
    new THREE.MeshStandardMaterial({
      color: '#4e3422', // Natural bark brown
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });

  const leafMats =
    sharedMaterials?.leafMats || [
      new THREE.MeshStandardMaterial({ color: '#275e35', roughness: 0.8, metalness: 0.02, flatShading: true }), // Deep understory
      new THREE.MeshStandardMaterial({ color: '#388046', roughness: 0.75, metalness: 0.02, flatShading: true }), // Mid canopy
      new THREE.MeshStandardMaterial({ color: '#4e9958', roughness: 0.7, metalness: 0.03, flatShading: true }), // Sunlit foliage
      new THREE.MeshStandardMaterial({ color: '#68b56f', roughness: 0.65, metalness: 0.03, flatShading: true }), // Chartreuse crest
    ];

  if (archetype === 'mature-broadleaf') {
    // -------------------------------------------------------------
    // Archetype 1: Mature Broadleaf Tree (Stately Upright Oak/Elm)
    // -------------------------------------------------------------
    const trunkHeight = 5.2;
    const baseRadius = 0.38;
    const topRadius = 0.20;

    // A. Main Tapered Trunk (anchored 0.4m into ground)
    const trunkGeo = new THREE.CylinderGeometry(topRadius, baseRadius, trunkHeight + 0.4, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = (trunkHeight - 0.4) * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // B. Root Buttresses firmly anchoring into ground slope
    const rootAngles = [0.2, 2.3, 4.4];
    rootAngles.forEach((ang) => {
      const rootLength = 1.35;
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.24, rootLength, 5),
        trunkMat
      );
      root.position.set(Math.cos(ang) * 0.4, 0.2, Math.sin(ang) * 0.4);
      root.rotation.set(0.45 * Math.sin(ang), ang, 0.45 * Math.cos(ang));
      root.castShadow = true;
      root.receiveShadow = true;
      treeGroup.add(root);
    });

    // C. Generation 1: Primary Scaffold Limbs (Forking at y = 3.8m to 4.5m)
    const limbConfigs = [
      { y: 3.8, angle: 0.4 + rnd() * 0.2, length: 1.6, pitch: 0.52 },
      { y: 4.1, angle: 2.5 + rnd() * 0.2, length: 1.7, pitch: 0.50 },
      { y: 4.4, angle: 4.6 + rnd() * 0.2, length: 1.5, pitch: 0.48 },
    ];

    limbConfigs.forEach((limbCfg) => {
      // Limb originates on trunk surface at height y
      const limbBaseRadius = topRadius * 0.65; // ~0.13m
      const limbTipRadius = limbBaseRadius * 0.55; // ~0.07m

      const limbGeo = new THREE.CylinderGeometry(limbTipRadius, limbBaseRadius, limbCfg.length, 6);
      const limb = new THREE.Mesh(limbGeo, trunkMat);

      // Offset from trunk center so branch starts at trunk surface
      const trunkRAtY = THREE.MathUtils.lerp(baseRadius, topRadius, limbCfg.y / trunkHeight);
      const startX = Math.cos(limbCfg.angle) * trunkRAtY;
      const startZ = Math.sin(limbCfg.angle) * trunkRAtY;

      // Position center of branch
      const halfL = limbCfg.length * 0.5;
      const dx = Math.cos(limbCfg.angle) * Math.sin(limbCfg.pitch) * halfL;
      const dy = Math.cos(limbCfg.pitch) * halfL;
      const dz = Math.sin(limbCfg.angle) * Math.sin(limbCfg.pitch) * halfL;

      limb.position.set(startX + dx, limbCfg.y + dy, startZ + dz);
      limb.rotation.set(
        limbCfg.pitch * Math.sin(limbCfg.angle),
        limbCfg.angle,
        limbCfg.pitch * Math.cos(limbCfg.angle)
      );
      limb.castShadow = true;
      treeGroup.add(limb);

      // D. Generation 2: Secondary Twigs emerging from primary limb
      const twigCount = 2;
      for (let t = 0; t < twigCount; t++) {
        const twigFrac = 0.55 + t * 0.35;
        const twigLen = 0.95;
        const twigBaseR = limbTipRadius * 0.7;
        const twigTipR = twigBaseR * 0.5;

        const twigGeo = new THREE.CylinderGeometry(twigTipR, twigBaseR, twigLen, 4);
        const twig = new THREE.Mesh(twigGeo, trunkMat);

        const tX = startX + dx * 2 * twigFrac;
        const tY = limbCfg.y + dy * 2 * twigFrac;
        const tZ = startZ + dz * 2 * twigFrac;

        const twigAng = limbCfg.angle + (t % 2 === 0 ? 0.65 : -0.65);
        twig.position.set(tX + Math.cos(twigAng) * 0.35, tY + 0.35, tZ + Math.sin(twigAng) * 0.35);
        twig.rotation.set(0.6 * Math.sin(twigAng), twigAng, 0.6 * Math.cos(twigAng));
        twig.castShadow = true;
        treeGroup.add(twig);
      }
    });

    // E. Canopy Foliage Clusters (Lowest leaves begin at y = 4.4m -> completely safe!)
    const crowns: [number, number, number, number][] = [
      [0, 5.5, 0, 1.8],
      [-1.1, 4.8, -0.8, 1.45],
      [1.2, 4.9, 0.7, 1.45],
      [-0.7, 4.7, 1.1, 1.35],
      [0.8, 4.9, -1.0, 1.35],
      [0, 6.4, 0.1, 1.3],
      [-0.4, 7.0, -0.2, 1.0],
    ];

    crowns.forEach(([cx, cy, cz, cr], idx) => {
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(cr, 1),
        leafMats[idx % leafMats.length]
      );
      crown.position.set(cx, cy, cz);
      crown.scale.set(1.15, 0.85, 1.15);
      crown.castShadow = true;
      crown.receiveShadow = true;
      treeGroup.add(crown);
    });
  } else if (archetype === 'slender-woodland') {
    // -------------------------------------------------------------
    // Archetype 2: Slender Woodland Tree (Birch/Aspen Silhouette)
    // -------------------------------------------------------------
    const trunkHeight = 5.8;
    const baseRadius = 0.28;
    const topRadius = 0.14;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(topRadius, baseRadius, trunkHeight + 0.4, 7),
      trunkMat
    );
    trunk.position.y = (trunkHeight - 0.4) * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Steep upward limbs (angles ~35 degrees)
    [0.7, 2.8, 4.9].forEach((bAng, idx) => {
      const branchH = 4.1 + idx * 0.35;
      const bLen = 1.3;
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.09, bLen, 5),
        trunkMat
      );
      branch.position.set(Math.cos(bAng) * 0.25, branchH + 0.45, Math.sin(bAng) * 0.25);
      branch.rotation.set(0.38 * Math.sin(bAng), bAng, 0.38 * Math.cos(bAng));
      branch.castShadow = true;
      treeGroup.add(branch);
    });

    // Layered, slender conical-oval canopy clusters
    const crowns: [number, number, number, number][] = [
      [0, 5.2, 0, 1.5],
      [-0.6, 4.6, 0.4, 1.25],
      [0.6, 4.7, -0.4, 1.25],
      [0.1, 6.1, 0.1, 1.35],
      [0, 7.1, 0, 1.05],
    ];

    crowns.forEach(([cx, cy, cz, cr], idx) => {
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(cr, 1),
        leafMats[(idx + 1) % leafMats.length]
      );
      crown.position.set(cx, cy, cz);
      crown.scale.set(1.05, 1.1, 1.05);
      crown.castShadow = true;
      crown.receiveShadow = true;
      treeGroup.add(crown);
    });
  } else {
    // -------------------------------------------------------------
    // Archetype 3: Understory Sapling (Light, Airy Young Tree)
    // -------------------------------------------------------------
    const trunkHeight = 4.4;
    const baseRadius = 0.18;
    const topRadius = 0.10;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(topRadius, baseRadius, trunkHeight + 0.3, 6),
      trunkMat
    );
    trunk.position.y = (trunkHeight - 0.3) * 0.5;
    trunk.rotation.z = 0.05;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    [1.1, 3.6].forEach((bAng, idx) => {
      const bH = 3.4 + idx * 0.4;
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.07, 1.1, 4),
        trunkMat
      );
      branch.position.set(Math.cos(bAng) * 0.2, bH + 0.35, Math.sin(bAng) * 0.2);
      branch.rotation.set(0.48 * Math.sin(bAng), bAng, 0.48 * Math.cos(bAng));
      branch.castShadow = true;
      treeGroup.add(branch);
    });

    const crowns: [number, number, number, number][] = [
      [0, 4.4, 0, 1.3],
      [-0.5, 4.1, 0.3, 1.05],
      [0.4, 4.2, -0.3, 1.05],
      [0, 5.2, 0.1, 0.95],
    ];

    crowns.forEach(([cx, cy, cz, cr], idx) => {
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(cr, 1),
        leafMats[(idx + 2) % leafMats.length]
      );
      crown.position.set(cx, cy, cz);
      crown.scale.set(1.15, 0.85, 1.15);
      crown.castShadow = true;
      crown.receiveShadow = true;
      treeGroup.add(crown);
    });
  }

  return treeGroup;
}

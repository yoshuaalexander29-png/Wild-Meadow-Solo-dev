import * as THREE from 'three';

export interface CloudSystem {
  group: THREE.Group;
  update: (time: number, delta: number) => void;
  dispose: () => void;
}

/**
 * Creates an authored, painterly Ghibli cumulus cloud formation.
 * Ghibli clouds have:
 *  - A gently flattened, shaded undershelf (cool ambient sky shadow).
 *  - Multiple sculpted, volumetric billows rising to grand sunlit dome crowns.
 *  - Distinctive horizontal asymmetry and towering silhouettes (as seen in IMG_0919 & IMG_0920).
 */
function createGhibliCloudGeometry(preset: 'monumental' | 'anvil' | 'drifter'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  let puffs: [number, number, number, number, number, number][] = [];

  if (preset === 'monumental') {
    // Majestic towering cumulus cloud column (Howl's secret garden style)
    puffs = [
      // Shaded flat-bottomed base shelf
      [0, 0, 0, 4.8, 1.4, 2.8],
      [-2.8, -0.2, 0.4, 3.6, 1.2, 2.4],
      [3.0, -0.1, -0.3, 3.8, 1.3, 2.6],
      // Main towering central dome
      [0.4, 2.2, 0, 3.8, 3.2, 3.2],
      // Secondary ascending billows
      [-2.2, 1.6, 0.5, 3.0, 2.5, 2.6],
      [2.4, 1.5, -0.4, 2.8, 2.3, 2.5],
      // Highest sunlit crown crests
      [0.2, 4.2, -0.1, 2.6, 2.4, 2.4],
      [-1.4, 3.4, 0.2, 2.2, 2.0, 2.1],
      [1.6, 3.2, 0.3, 2.0, 1.9, 2.0],
    ];
  } else if (preset === 'anvil') {
    // Elongated horizontal anvil cloud formation
    puffs = [
      [0, 0, 0, 5.8, 1.3, 2.6],
      [-3.6, 0.1, 0.2, 3.6, 1.1, 2.2],
      [3.4, 0.2, -0.2, 4.0, 1.2, 2.4],
      // Stepped vertical massing
      [1.4, 1.8, 0.1, 3.8, 2.6, 2.8],
      [-1.6, 1.4, -0.3, 3.0, 2.1, 2.3],
      [2.6, 3.4, 0.0, 2.8, 2.2, 2.5],
      [4.0, 3.6, 0.2, 2.4, 1.8, 2.0],
    ];
  } else {
    // Drifter: softer, gentle rolling summer sheep-cloud
    puffs = [
      [0, 0, 0, 4.0, 1.4, 2.4],
      [-2.1, 0.2, 0.3, 2.8, 1.3, 2.0],
      [2.2, 0.1, -0.2, 3.0, 1.3, 2.1],
      [0.3, 1.5, 0.1, 2.8, 2.0, 2.2],
      [-1.0, 1.3, -0.2, 2.1, 1.7, 1.8],
    ];
  }

  for (const [ox, oy, oz, sx, sy, sz] of puffs) {
    const puff = new THREE.IcosahedronGeometry(1.0, 2);
    puff.scale(sx, sy, sz);
    puff.translate(ox, oy, oz);
    parts.push(puff);
  }

  // Merge geometries
  let totalVerts = 0;
  for (const p of parts) totalVerts += p.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);

  // Ghibli cloud palette: warm ivory sunlit tops (#ffffff / #fffcf2),
  // soft shaded bases with subtle sky-reflection tone (#d4e4f5 / #c5d8ee)
  const sunlitColor = new THREE.Color('#ffffff');
  const baseShadowColor = new THREE.Color('#d0e1f3');

  let offset = 0;
  for (const p of parts) {
    const attr = p.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      const vx = attr.getX(i);
      const vy = attr.getY(i);
      const vz = attr.getZ(i);

      pos[offset * 3] = vx;
      pos[offset * 3 + 1] = vy;
      pos[offset * 3 + 2] = vz;

      // Vertical gradient from shaded flat bottom to sunlit top crests
      const heightFactor = THREE.MathUtils.clamp(vy / 3.8, 0, 1);
      const vertexCol = baseShadowColor.clone().lerp(sunlitColor, Math.pow(heightFactor, 0.7));

      colors[offset * 3] = vertexCol.r;
      colors[offset * 3 + 1] = vertexCol.g;
      colors[offset * 3 + 2] = vertexCol.b;

      offset++;
    }
    p.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}

export function createCloudSystem(scene: THREE.Scene): CloudSystem {
  const group = new THREE.Group();
  scene.add(group);

  const cloudMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: true,
  });

  const monumentalGeo = createGhibliCloudGeometry('monumental');
  const anvilGeo = createGhibliCloudGeometry('anvil');
  const drifterGeo = createGhibliCloudGeometry('drifter');

  const cloudInstances: { mesh: THREE.Mesh; baseSpeed: number; initX: number; minWrapX: number; maxWrapX: number }[] = [];

  const cloudConfigs: {
    geo: THREE.BufferGeometry;
    x: number;
    y: number;
    z: number;
    scale: number;
    rotY: number;
    speed: number;
  }[] = [
    // Central Colossal Northern Ghibli Thunderhead (Towering cumulus column as in IMG_0920)
    { geo: monumentalGeo, x: 2, y: 52, z: -95, scale: 5.2, rotY: 0.05, speed: 0.12 },
    // Flanking Northern Alpine thunderheads
    { geo: monumentalGeo, x: -44, y: 46, z: -88, scale: 3.8, rotY: 0.25, speed: 0.14 },
    { geo: anvilGeo, x: 44, y: 48, z: -92, scale: 4.0, rotY: -0.3, speed: 0.13 },
    { geo: drifterGeo, x: -78, y: 38, z: -78, scale: 2.8, rotY: 0.6, speed: 0.16 },

    // East Horizon Clouds
    { geo: monumentalGeo, x: 88, y: 46, z: -35, scale: 3.5, rotY: 1.1, speed: 0.14 },
    { geo: drifterGeo, x: 96, y: 40, z: 32, scale: 3.0, rotY: -0.8, speed: 0.15 },

    // West Horizon Clouds
    { geo: anvilGeo, x: -92, y: 44, z: 22, scale: 3.2, rotY: -1.2, speed: 0.15 },
    { geo: drifterGeo, x: -84, y: 38, z: -32, scale: 2.8, rotY: 0.4, speed: 0.17 },

    // High Zenith Drifters (Atmospheric vertical depth)
    { geo: drifterGeo, x: 12, y: 65, z: -15, scale: 2.6, rotY: 0.1, speed: 0.18 },
    { geo: drifterGeo, x: -32, y: 60, z: 35, scale: 2.6, rotY: -0.5, speed: 0.17 },
  ];

  for (const cfg of cloudConfigs) {
    const mesh = new THREE.Mesh(cfg.geo, cloudMat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.scale.setScalar(cfg.scale);
    mesh.rotation.y = cfg.rotY;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);

    cloudInstances.push({
      mesh,
      baseSpeed: cfg.speed,
      initX: cfg.x,
      minWrapX: -140,
      maxWrapX: 140,
    });
  }

  return {
    group,
    update: (time: number, delta: number) => {
      for (const inst of cloudInstances) {
        inst.mesh.position.x += inst.baseSpeed * delta * 2.0;
        // Subtle vertical thermal breath
        inst.mesh.position.y += Math.sin(time * 0.35 + inst.initX * 0.05) * 0.003;

        // Smooth wrap across horizon
        if (inst.mesh.position.x > inst.maxWrapX) {
          inst.mesh.position.x = inst.minWrapX;
        }
      }
    },
    dispose: () => {
      scene.remove(group);
      monumentalGeo.dispose();
      anvilGeo.dispose();
      drifterGeo.dispose();
      cloudMat.dispose();
    },
  };
}

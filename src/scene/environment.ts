import * as THREE from 'three';
import {
  getTerrainHeight,
  getTerrainNormal,
  getWaterHeight,
  getDistanceToPath,
  getDistanceToStream,
  STREAM_MIN_X,
  STREAM_MAX_X,
  STREAM_BANK_WIDTH,
  getStreamCenterZ,
} from './terrain';
import { buildSpiritedAwayBridge, type BridgeInstance } from './bridgeSystem';
import { createBotanicalTree } from './treeSystem';

export interface EnvironmentWorld {
  groundMesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  landmarkGroup: THREE.Group;
  bridgeInstance: BridgeInstance;
  update: (time: number) => void;
  dispose: () => void;
}

export function createEnvironment(scene: THREE.Scene): EnvironmentWorld {
  const landmarkGroup = new THREE.Group();
  scene.add(landmarkGroup);

  const mat = (color: string, roughness = 0.85, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });

  // -------------------------------------------------------------
  // 1. Extended Terrain Mesh (180m x 180m, Seamless Horizon Transition)
  // No mountains, no rectangular cutoffs, no exposed undersides.
  // -------------------------------------------------------------
  const terrainSize = 180;
  const segments = 140;
  const groundGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const lowlandGrassColor = new THREE.Color('#4ea03a');
  const sunlitCrestColor = new THREE.Color('#78c848');
  const deepForestLoam = new THREE.Color('#385a31');
  const pathColor = new THREE.Color('#a8976a');
  const streamBedColor = new THREE.Color('#2d422a');

  const tempNorm = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = -pos.getY(i);
    const y = getTerrainHeight(x, z);
    pos.setZ(i, y);

    getTerrainNormal(x, z, tempNorm);
    const slope = 1.0 - tempNorm.y;

    const spatialNoise =
      Math.sin(x * 0.12 + z * 0.1) * 0.35 +
      Math.cos(x * 0.22 - z * 0.18) * 0.25;

    const finalColor = lowlandGrassColor.clone();
    if (spatialNoise < -0.1) {
      finalColor.lerp(deepForestLoam, 0.4);
    }

    // High sunlit crests and rolling rises
    if (y > 1.3) {
      const crestFactor = Math.min(1.0, (y - 1.3) / 2.2);
      finalColor.lerp(sunlitCrestColor, crestFactor * 0.7);
    }

    // Subtle loam tone on steeper grassy slopes
    if (slope > 0.3) {
      const loamFactor = Math.min(0.5, (slope - 0.3) / 0.3);
      finalColor.lerp(deepForestLoam, loamFactor);
    }

    // Pebble bed & moist earth along stream corridor
    if (x >= STREAM_MIN_X - 2.5 && x <= STREAM_MAX_X + 2.5) {
      const streamDist = getDistanceToStream(x, z);
      if (streamDist < STREAM_BANK_WIDTH * 1.25) {
        const streamFactor = Math.exp(-Math.pow(streamDist / 1.6, 2));
        finalColor.lerp(streamBedColor, streamFactor * 0.95);
      }
    }

    // Dirt footpath network
    const pathDist = getDistanceToPath(x, z);
    if (pathDist < 2.5) {
      const pathFactor = Math.exp(-Math.pow(pathDist / 1.6, 2));
      finalColor.lerp(pathColor, pathFactor * 0.85);
    }

    colors[i * 3] = finalColor.r;
    colors[i * 3 + 1] = finalColor.g;
    colors[i * 3 + 2] = finalColor.b;
  }

  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.03,
    flatShading: true,
  });

  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // -------------------------------------------------------------
  // 2. Authoritative Bounded Brook Water Ribbon
  // Originates in rocky spring basin (sx = -32), passes under bridge (-1.1, -6.9),
  // widens into natural pond (sx = 32). Zero abrupt sliced ends!
  // -------------------------------------------------------------
  const streamSteps = 72;
  const streamCrossSegments = 5;
  const numVerts = (streamSteps + 1) * (streamCrossSegments + 1);

  const waterPos = new Float32Array(numVerts * 3);
  const waterUVs = new Float32Array(numVerts * 2);
  const waterIndices: number[] = [];

  const baseWaterPoints: THREE.Vector3[] = [];
  const baseWaterNormals: THREE.Vector3[] = [];
  const ribbonWidths: number[] = [];

  for (let s = 0; s <= streamSteps; s++) {
    const t = s / streamSteps;
    const sx = STREAM_MIN_X + t * (STREAM_MAX_X - STREAM_MIN_X);
    const sz = getStreamCenterZ(sx);
    const sy = getWaterHeight(sx, sz);

    baseWaterPoints.push(new THREE.Vector3(sx, sy, sz));

    // Next point tangent
    const nextSx = sx + 0.2;
    const nextSz = getStreamCenterZ(nextSx);
    const tx = nextSx - sx;
    const tz = nextSz - sz;
    const tLen = Math.hypot(tx, tz);
    const nx = -tz / tLen;
    const nz = tx / tLen;
    baseWaterNormals.push(new THREE.Vector3(nx, 0, nz));

    // Variable ribbon width: narrow at spring head, standard in brook, gently wider at pond
    let width = 2.1;
    if (t < 0.08) {
      // Taper down at spring head into rocky hollow
      width = 0.6 + (t / 0.08) * 1.5;
    } else if (t > 0.88) {
      // Widen gently into the pastoral pond
      width = 2.1 + ((t - 0.88) / 0.12) * 1.8;
    }
    ribbonWidths.push(width);

    for (let c = 0; c <= streamCrossSegments; c++) {
      const u = c / streamCrossSegments;
      const offset = (u - 0.5) * width;
      const vx = sx + nx * offset;
      const vz = sz + nz * offset;

      // Bed-hugging edge taper: water edges tuck gracefully into carved trench
      let edgeDip = 0;
      const edgeDist = Math.abs(u - 0.5) * 2; // 0 at center, 1 at edges
      if (edgeDist > 0.8) {
        edgeDip = Math.pow((edgeDist - 0.8) / 0.2, 2) * 0.035;
      }
      const vy = sy - edgeDip;

      const vertIdx = s * (streamCrossSegments + 1) + c;
      waterPos[vertIdx * 3] = vx;
      waterPos[vertIdx * 3 + 1] = vy;
      waterPos[vertIdx * 3 + 2] = vz;

      waterUVs[vertIdx * 2] = u;
      waterUVs[vertIdx * 2 + 1] = t * 16.0;
    }
  }

  for (let s = 0; s < streamSteps; s++) {
    for (let c = 0; c < streamCrossSegments; c++) {
      const row1 = s * (streamCrossSegments + 1);
      const row2 = (s + 1) * (streamCrossSegments + 1);
      const i0 = row1 + c;
      const i1 = row1 + c + 1;
      const i2 = row2 + c;
      const i3 = row2 + c + 1;

      waterIndices.push(i0, i2, i1);
      waterIndices.push(i1, i2, i3);
    }
  }

  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.BufferAttribute(waterPos, 3));
  waterGeo.setAttribute('uv', new THREE.BufferAttribute(waterUVs, 2));
  waterGeo.setIndex(waterIndices);
  waterGeo.computeVertexNormals();

  const waterMat = new THREE.MeshStandardMaterial({
    color: '#3dbfe0',
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // River Cobbles & Stepping Stones along Stream
  const riverStoneMat = mat('#636b62', 0.86, 0.08);
  for (let i = 0; i < 34; i++) {
    const t = i / 34;
    const sx = STREAM_MIN_X + 2.0 + t * (STREAM_MAX_X - STREAM_MIN_X - 4.0);
    // Don't place stones right in bridge walkway
    if (Math.abs(sx - (-1.1)) < 1.6) continue;

    const offsetSide = (i % 2 === 0 ? 1 : -1) * (0.8 + Math.sin(i * 1.5) * 0.45);
    const sz = getStreamCenterZ(sx) + offsetSide;
    const sy = getTerrainHeight(sx, sz) + 0.04;

    const rStone = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.24 + (i % 3) * 0.12, 1),
      riverStoneMat
    );
    rStone.position.set(sx, sy, sz);
    rStone.scale.set(1.25, 0.55, 1.15);
    rStone.rotation.set((i % 4) * 0.2, (i % 5) * 0.4, (i % 3) * 0.2);
    rStone.castShadow = true;
    rStone.receiveShadow = true;
    landmarkGroup.add(rStone);
  }

  // Spring Headwater Basin Boulders at sx = STREAM_MIN_X (-32)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const bx = STREAM_MIN_X + Math.cos(ang) * 1.4;
    const bz = getStreamCenterZ(STREAM_MIN_X) + Math.sin(ang) * 1.4;
    const by = getTerrainHeight(bx, bz) + 0.15;
    const bStone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 + (i % 3) * 0.25, 1), riverStoneMat);
    bStone.position.set(bx, by, bz);
    bStone.scale.set(1.2, 0.7, 1.1);
    bStone.castShadow = true;
    bStone.receiveShadow = true;
    landmarkGroup.add(bStone);
  }

  // Pond Lily Pads at sx = 30
  const lilyPadMat = mat('#387e3f', 0.7, 0.02);
  const lilyPads: [number, number][] = [
    [29.2, getStreamCenterZ(29.2) - 0.7],
    [30.4, getStreamCenterZ(30.4) + 0.8],
    [31.1, getStreamCenterZ(31.1) - 0.4],
    [28.5, getStreamCenterZ(28.5) + 0.6],
  ];
  lilyPads.forEach(([lx, lz], idx) => {
    const ly = getWaterHeight(lx, lz) + 0.01;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.01, 8), lilyPadMat);
    pad.position.set(lx, ly, lz);
    pad.rotation.y = idx * 1.2;
    landmarkGroup.add(pad);
  });

  // -------------------------------------------------------------
  // 3. Landmark: Spirited Away Vermilion Timber Footbridge
  // Distinct vermilion lacquered balustrades, turned giboshi finials,
  // dark timber understructure, and 4 independently grounded corner supports.
  // -------------------------------------------------------------
  const bridgeInstance = buildSpiritedAwayBridge();
  landmarkGroup.add(bridgeInstance.group);

  // -------------------------------------------------------------
  // 4. Landmark: Authentic Studio Ghibli Countryside Campfire & Rest
  // Grounded hearth, 5 logs, layered stylized anime flames, floating sparks.
  // -------------------------------------------------------------
  const woodDeckMat = mat('#6e4d34', 0.84, 0.04);
  const woodDarkMat = mat('#483222', 0.88, 0.05);

  const campGroup = new THREE.Group();
  const campY = getTerrainHeight(2.2, 2.2);
  campGroup.position.set(2.2, campY, 2.2);

  // A. Irregular Grounded River Stone Hearth Ring (14 varied stones half-embedded)
  const stoneColors = ['#6c675b', '#5c564b', '#7a7263', '#625c50', '#746c5f'];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + (i % 3) * 0.08;
    const r = 0.74 + (i % 2 === 0 ? 0.07 : -0.06);
    const stoneRadius = 0.16 + (i % 4) * 0.035;
    const stoneMat = mat(stoneColors[i % stoneColors.length], 0.92, 0.04);

    const cStone = new THREE.Mesh(new THREE.DodecahedronGeometry(stoneRadius, 1), stoneMat);
    cStone.position.set(Math.cos(ang) * r, stoneRadius * 0.42, Math.sin(ang) * r);
    cStone.scale.set(1.2, 0.68, 1.1);
    cStone.rotation.set((i % 4) * 0.25, ang + (i % 2) * 0.3, (i % 3) * 0.2);
    cStone.castShadow = true;
    cStone.receiveShadow = true;
    campGroup.add(cStone);
  }

  // B. Dark Charcoal & Soft Ash Basin
  const ashMat = new THREE.MeshStandardMaterial({
    color: '#1a1715',
    roughness: 0.96,
    metalness: 0.02,
    flatShading: true,
  });
  const ashBed = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, 0.05, 12), ashMat);
  ashBed.position.y = 0.02;
  ashBed.receiveShadow = true;
  campGroup.add(ashBed);

  // C. Glowing Hot Coals Core
  const coalMat = new THREE.MeshStandardMaterial({
    color: '#ff3600',
    emissive: '#ff2600',
    emissiveIntensity: 1.6,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
  });
  const coalCore = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.45, 0.07, 8), coalMat);
  coalCore.position.y = 0.045;
  campGroup.add(coalCore);

  // D. Charred Hardwood Logs in Star Pattern
  const logBarkMat = mat('#3c271a', 0.94, 0.03);
  const logCharMat = mat('#16120f', 0.96, 0.02);

  const logArrangements: [number, number, number, number, number][] = [
    [0.18, 0.12, 0.0, 0.72, 0.45],
    [-0.14, 0.14, 0.15, 2.1, 0.52],
    [-0.08, 0.13, -0.18, 3.8, 0.48],
    [0.16, 0.16, -0.12, -1.2, 0.55],
    [-0.18, 0.15, 0.05, -2.6, 0.5],
  ];

  logArrangements.forEach(([lx, ly, lz, rotY, pitch]) => {
    const lg = new THREE.Group();
    lg.position.set(lx, ly, lz);
    lg.rotation.y = rotY;

    const logBody = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.78, 6), logBarkMat);
    logBody.rotation.z = Math.PI / 2 - pitch;
    logBody.castShadow = true;
    logBody.receiveShadow = true;
    lg.add(logBody);

    const charTip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.22, 6), logCharMat);
    charTip.position.set(-Math.cos(pitch) * 0.35, -Math.sin(pitch) * 0.35, 0);
    charTip.rotation.z = Math.PI / 2 - pitch;
    lg.add(charTip);

    campGroup.add(lg);
  });

  // E. Layered Studio Ghibli Stylized Flame Meshes
  const flameCoreMat = new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0.96 });
  const innerFlame = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 7), flameCoreMat);
  innerFlame.scale.set(1.0, 1.45, 0.85);
  innerFlame.position.set(0, 0.32, 0);
  campGroup.add(innerFlame);

  const flameMidMat = new THREE.MeshBasicMaterial({ color: '#ffa21c', transparent: true, opacity: 0.92 });
  const midFlame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.62, 5), flameMidMat);
  midFlame.position.set(0, 0.44, 0);
  campGroup.add(midFlame);

  const flameOuterMat = new THREE.MeshBasicMaterial({ color: '#ff4805', transparent: true, opacity: 0.84 });
  const outerFlames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const fTongue = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.68, 4), flameOuterMat);
    const ang = (i / 3) * Math.PI * 2;
    fTongue.position.set(Math.cos(ang) * 0.11, 0.46, Math.sin(ang) * 0.11);
    fTongue.scale.set(0.9, 1.0, 0.6);
    campGroup.add(fTongue);
    outerFlames.push(fTongue);
  }

  // F. Gentle Floating Campfire Embers (14 sparse, natural rising sparks)
  const sparkCount = 14;
  const sparkGeo = new THREE.SphereGeometry(0.02, 4, 4);
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffb238' });
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, sparkCount);
  const sparkDummy = new THREE.Object3D();

  interface SparkData {
    x: number;
    y: number;
    z: number;
    speedY: number;
    angle: number;
    radius: number;
  }
  const sparks: SparkData[] = [];
  for (let i = 0; i < sparkCount; i++) {
    sparks.push({
      x: 0,
      y: 0.2 + Math.random() * 1.1,
      z: 0,
      speedY: 0.55 + Math.random() * 0.5,
      angle: Math.random() * Math.PI * 2,
      radius: 0.06 + Math.random() * 0.24,
    });
  }
  campGroup.add(sparkMesh);

  // Warm Campfire Point Light
  const campLight = new THREE.PointLight('#ff9233', 1.45, 6.5, 2.0);
  campLight.position.set(0, 0.65, 0);
  campLight.castShadow = true;
  campLight.shadow.mapSize.set(512, 512);
  campGroup.add(campLight);

  // Split Cedar Sitting Bench
  const campBench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.45), woodDeckMat);
  campBench.position.set(1.15, 0.42, 0.55);
  campBench.rotation.y = -0.52;
  campBench.castShadow = true;
  campBench.receiveShadow = true;
  campGroup.add(campBench);

  [-0.55, 0.55].forEach((bx) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.62, 5), woodDarkMat);
    leg.position.set(1.15 + bx * Math.cos(-0.52), 0.17, 0.55 + bx * Math.sin(-0.52));
    leg.castShadow = true;
    campGroup.add(leg);
  });

  // Stacked Firewood Pile
  for (let layer = 0; layer < 3; layer++) {
    const count = 3 - layer;
    for (let j = 0; j < count; j++) {
      const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.85, 5), mat('#5c412b'));
      wood.position.set(-1.1 + (j - count * 0.5) * 0.22, 0.1 + layer * 0.14, 1.0);
      wood.rotation.z = Math.PI / 2;
      wood.rotation.y = 0.15;
      wood.castShadow = true;
      campGroup.add(wood);
    }
  }

  // Traveler Water Barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.78, 8), mat('#5e432b', 0.8));
  barrel.position.set(-0.6, 0.37, -1.0);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  campGroup.add(barrel);

  landmarkGroup.add(campGroup);

  // -------------------------------------------------------------
  // 5. Landmark: The Wind Rises Artist Knoll & Umbrella (-11.5, 13.5)
  // Directly references IMG_0919: Painting easel, canvas, stool,
  // tilted white sun parasol/umbrella, and mossy Totoro field boulder!
  // -------------------------------------------------------------
  const artistGroup = new THREE.Group();
  const artistY = getTerrainHeight(-11.5, 13.5);
  artistGroup.position.set(-11.5, artistY, 13.5);

  const fieldRockMat = mat('#6b7067', 0.88, 0.05);
  const mossVelvetMat = mat('#467b38', 0.94, 0.02);

  // Weathered mossy boulder
  const totoroRock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 2), fieldRockMat);
  totoroRock.scale.set(1.3, 0.85, 1.15);
  totoroRock.position.set(0, 0.5, 0);
  totoroRock.rotation.set(0.2, 0.6, -0.15);
  totoroRock.castShadow = true;
  totoroRock.receiveShadow = true;
  artistGroup.add(totoroRock);

  const rockMoss = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2), mossVelvetMat);
  rockMoss.scale.set(1.25, 0.65, 1.1);
  rockMoss.position.set(0, 0.72, 0);
  rockMoss.rotation.set(0.22, 0.65, -0.12);
  rockMoss.receiveShadow = true;
  artistGroup.add(rockMoss);

  // Wooden Artist Tripod Easel & Canvas
  const easelGroup = new THREE.Group();
  easelGroup.position.set(0.9, 0.1, -0.7);
  easelGroup.rotation.y = -0.45;

  const easelWoodMat = mat('#a07b50', 0.8, 0.03);
  // 3 tripod legs
  [-0.24, 0.24].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 4), easelWoodMat);
    leg.position.set(lx, 0.7, 0.1);
    leg.rotation.z = lx > 0 ? 0.16 : -0.16;
    leg.rotation.x = -0.18;
    leg.castShadow = true;
    easelGroup.add(leg);
  });
  const backLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.55, 4), easelWoodMat);
  backLeg.position.set(0, 0.7, -0.32);
  backLeg.rotation.x = 0.35;
  backLeg.castShadow = true;
  easelGroup.add(backLeg);

  // Painting Canvas on Easel
  const canvasBoard = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 0.03), mat('#f4ede0', 0.75));
  canvasBoard.position.set(0, 0.88, 0.12);
  canvasBoard.rotation.x = -0.18;
  canvasBoard.castShadow = true;
  canvasBoard.receiveShadow = true;
  easelGroup.add(canvasBoard);

  // Small paintbox & wooden artist stool
  const paintBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.18), mat('#684828', 0.7));
  paintBox.position.set(0, 0.58, 0.16);
  paintBox.rotation.x = -0.18;
  easelGroup.add(paintBox);

  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 6), easelWoodMat);
  stool.position.set(0, 0.21, 0.7);
  stool.castShadow = true;
  easelGroup.add(stool);

  // Iconic Wind Rises Sun Umbrella / Parasol (Sheltering easel against breeze)
  const umbrellaPoleMat = mat('#e8dfce', 0.6, 0.1);
  const umbrellaFabricMat = mat('#fbf8eb', 0.75, 0.02);

  const umbrellaPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.3, 5), umbrellaPoleMat);
  umbrellaPole.position.set(-0.4, 1.05, 0.2);
  umbrellaPole.rotation.z = -0.22;
  umbrellaPole.rotation.x = 0.15;
  umbrellaPole.castShadow = true;
  easelGroup.add(umbrellaPole);

  const umbrellaCanopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 0.38, 12, 1, true),
    umbrellaFabricMat
  );
  umbrellaCanopy.position.set(-0.65, 2.15, 0.36);
  umbrellaCanopy.rotation.z = -0.25;
  umbrellaCanopy.rotation.x = 0.18;
  umbrellaCanopy.castShadow = true;
  umbrellaCanopy.receiveShadow = true;
  easelGroup.add(umbrellaCanopy);

  artistGroup.add(easelGroup);
  landmarkGroup.add(artistGroup);

  // -------------------------------------------------------------
  // 6. Landmark: The Great Ancient Windrise Oak (-16, -18)
  // Sprawling landmark specimen with massive grounded buttress roots.
  // -------------------------------------------------------------
  const oakGroup = new THREE.Group();
  const oakBaseY = getTerrainHeight(-16, -18);
  oakGroup.position.set(-16, oakBaseY, -18);

  const oakTrunkMat = mat('#4d3322', 0.94, 0.04);
  const oakLeavesMat = mat('#2b643a', 0.78, 0.02);
  const oakAccentLeavesMat = mat('#489454', 0.72, 0.03);

  // Massive tapered trunk (anchored securely into ground)
  const oakTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 2.2, 8.2, 10), oakTrunkMat);
  oakTrunk.position.y = 3.8;
  oakTrunk.castShadow = true;
  oakTrunk.receiveShadow = true;
  oakGroup.add(oakTrunk);

  // 6 Sweeping buttress roots spreading into the turf
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.25;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.9, 3.6, 6), oakTrunkMat);
    root.position.set(Math.cos(angle) * 1.9, 0.95, Math.sin(angle) * 1.9);
    root.rotation.set((Math.random() - 0.5) * 0.15, angle, 0.58);
    root.castShadow = true;
    root.receiveShadow = true;
    oakGroup.add(root);
  }

  // Spreading Multi-Tier Leafy Canopy (Warm layered Ghibli foliage clusters)
  const oakCanopyOffsets: [number, number, number, number, boolean][] = [
    [0, 8.4, 0, 4.4, false],
    [-2.8, 7.3, -1.6, 3.4, true],
    [3.0, 7.5, 1.8, 3.6, false],
    [-1.6, 7.7, 2.6, 3.2, true],
    [2.2, 7.1, -2.4, 3.1, false],
    [0.7, 10.0, 0.4, 3.2, true],
    [-1.9, 9.3, -1.3, 2.8, false],
    [1.5, 9.5, 1.5, 2.9, true],
  ];

  oakCanopyOffsets.forEach(([cx, cy, cz, scale, isAccent]) => {
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(scale, 1),
      isAccent ? oakAccentLeavesMat : oakLeavesMat
    );
    canopy.position.set(cx, cy, cz);
    canopy.scale.set(1.15, 0.8, 1.15);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    oakGroup.add(canopy);
  });
  landmarkGroup.add(oakGroup);

  // -------------------------------------------------------------
  // 7. Distinct Art-Directed Tree Archetypes (Botanically Plausible)
  // Strict botanical hierarchy: connected junctions, progressive tapering,
  // multi-tone Ghibli canopies, and > 3.4m open headroom (zero clipping).
  // -------------------------------------------------------------
  const treeLeafMats = [
    mat('#275e35', 0.8, 0.02), // Deep understory emerald
    mat('#388046', 0.75, 0.02), // Mid crown lush green
    mat('#4e9958', 0.7, 0.03), // Sunlit canopy green
    mat('#68b56f', 0.65, 0.03), // Sun-kissed chartreuse highlight
  ];
  const treeTrunkMat = mat('#4e3422', 0.92, 0.04);

  // Curated field tree locations (carefully composed, avoiding paths and bridge)
  const treePlacements: { x: number; z: number; archetype: 'mature-broadleaf' | 'slender-woodland' | 'understory-sapling'; scale: number; seed: number }[] = [
    { x: -7.5, z: -8.5, archetype: 'mature-broadleaf', scale: 1.0, seed: 101 },
    { x: 8.5, z: -9.5, archetype: 'slender-woodland', scale: 0.95, seed: 102 },
    { x: -12.0, z: -4.0, archetype: 'understory-sapling', scale: 0.9, seed: 103 },
    { x: 16.0, z: -14.0, archetype: 'mature-broadleaf', scale: 1.1, seed: 104 },
    { x: -5.0, z: -22.0, archetype: 'slender-woodland', scale: 1.05, seed: 105 },
    { x: 4.0, z: -17.0, archetype: 'understory-sapling', scale: 0.95, seed: 106 },
    { x: -22.0, z: -12.0, archetype: 'mature-broadleaf', scale: 1.15, seed: 107 },
    { x: 20.0, z: -2.0, archetype: 'slender-woodland', scale: 1.0, seed: 108 },
    { x: -8.0, z: 6.0, archetype: 'mature-broadleaf', scale: 0.95, seed: 109 },
    { x: 6.0, z: 9.0, archetype: 'understory-sapling', scale: 0.9, seed: 110 },
    { x: -18.0, z: 4.0, archetype: 'slender-woodland', scale: 1.1, seed: 111 },
    { x: 12.0, z: 6.0, archetype: 'mature-broadleaf', scale: 1.0, seed: 112 },
    { x: -24.0, z: 8.0, archetype: 'slender-woodland', scale: 1.15, seed: 113 },
    { x: 22.0, z: -22.0, archetype: 'mature-broadleaf', scale: 1.1, seed: 114 },
    { x: -8.0, z: 18.0, archetype: 'slender-woodland', scale: 1.0, seed: 115 },
    { x: 14.0, z: 18.0, archetype: 'mature-broadleaf', scale: 0.95, seed: 116 },
    { x: -2.0, z: 24.0, archetype: 'understory-sapling', scale: 1.1, seed: 117 },
  ];

  treePlacements.forEach(({ x, z, archetype, scale, seed }) => {
    const tree = createBotanicalTree(archetype, seed, {
      trunkMat: treeTrunkMat,
      leafMats: treeLeafMats,
    });
    const ty = getTerrainHeight(x, z);
    tree.position.set(x, ty, z);
    tree.scale.setScalar(scale);
    landmarkGroup.add(tree);
  });

  // Weathered ancient fallen mossy timber log
  const logX = -14.0;
  const logZ = 2.0;
  const logY = getTerrainHeight(logX, logZ) + 0.22;
  const fallenLog = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 3.8, 7), treeTrunkMat);
  fallenLog.position.set(logX, logY, logZ);
  fallenLog.rotation.set(0.12, 0.65, Math.PI / 2);
  fallenLog.castShadow = true;
  fallenLog.receiveShadow = true;
  landmarkGroup.add(fallenLog);

  const logMoss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat('#497b3c', 0.92));
  logMoss.position.set(logX - 0.5, logY + 0.22, logZ - 0.2);
  logMoss.scale.set(1.4, 0.4, 1.2);
  landmarkGroup.add(logMoss);

  return {
    groundMesh,
    waterMesh,
    landmarkGroup,
    update: (time: number) => {
      // 1. Crystal Water Surface Flow & Gentle Ripples
      const wPos = waterGeo.attributes.position;
      for (let s = 0; s <= streamSteps; s++) {
        const bp = baseWaterPoints[s];
        const bn = baseWaterNormals[s];
        const width = ribbonWidths[s];

        for (let c = 0; c <= streamCrossSegments; c++) {
          const u = c / streamCrossSegments;
          const offset = (u - 0.5) * width;
          const vertIdx = s * (streamCrossSegments + 1) + c;

          const vx = bp.x + bn.x * offset;
          const vz = bp.z + bn.z * offset;
          const ripple =
            Math.sin(time * 3.0 - s * 0.45 + c * 0.65) * 0.018 +
            Math.sin(time * 4.8 + vx * 0.75 + vz * 0.55) * 0.01;

          let edgeDip = 0;
          const edgeDist = Math.abs(u - 0.5) * 2;
          if (edgeDist > 0.8) {
            edgeDip = Math.pow((edgeDist - 0.8) / 0.2, 2) * 0.035;
          }

          wPos.setY(vertIdx, bp.y - edgeDip + ripple);
        }
      }
      waterGeo.attributes.position.needsUpdate = true;

      // 2. Studio Ghibli Campfire Flickering Flames & Warm Illumination
      const flicker1 = Math.sin(time * 8.5) * 0.08;
      const flicker2 = Math.cos(time * 12.2) * 0.05;
      campLight.intensity = 1.45 + flicker1 + flicker2;

      innerFlame.scale.y = 1.35 + Math.sin(time * 7.5) * 0.12;
      innerFlame.scale.x = 0.95 + Math.cos(time * 6.2) * 0.08;

      midFlame.scale.y = 1.0 + Math.sin(time * 9.2 + 0.4) * 0.18;
      midFlame.scale.x = 1.0 + Math.cos(time * 7.8) * 0.12;
      midFlame.rotation.y = time * 1.8;

      outerFlames.forEach((flame, idx) => {
        const phase = idx * 2.1;
        flame.scale.y = 0.85 + Math.sin(time * 9.8 + phase) * 0.28;
        flame.position.y = 0.44 + Math.cos(time * 8.4 + phase) * 0.04;
        flame.rotation.z = Math.sin(time * 6.2 + phase) * 0.18;
      });

      // 3. Gentle Rising Embers / Sparks
      for (let i = 0; i < sparkCount; i++) {
        const sp = sparks[i];
        sp.y += 0.016 * sp.speedY;
        sp.angle += 0.038;
        sp.x = Math.cos(sp.angle) * sp.radius * (1.0 + sp.y * 0.35);
        sp.z = Math.sin(sp.angle) * sp.radius * (1.0 + sp.y * 0.35);

        if (sp.y > 1.25) {
          sp.y = 0.12;
          sp.radius = 0.06 + Math.random() * 0.22;
          sp.speedY = 0.55 + Math.random() * 0.45;
          sp.angle = Math.random() * Math.PI * 2;
        }

        const sScale = Math.max(0.05, (1.25 - sp.y) / 1.25);
        sparkDummy.position.set(sp.x, sp.y, sp.z);
        sparkDummy.scale.setScalar(sScale);
        sparkDummy.updateMatrix();
        sparkMesh.setMatrixAt(i, sparkDummy.matrix);
      }
      sparkMesh.instanceMatrix.needsUpdate = true;
    },
    bridgeInstance,
    dispose: () => {
      scene.remove(groundMesh);
      scene.remove(waterMesh);
      scene.remove(landmarkGroup);
      groundGeo.dispose();
      groundMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      bridgeInstance.dispose();
    },
  };
}

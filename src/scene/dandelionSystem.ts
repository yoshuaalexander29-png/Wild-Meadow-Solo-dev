import * as THREE from 'three';
import { getTerrainHeight } from './terrain';

export interface DandelionSystem {
  group: THREE.Group;
  update: (time: number, delta: number, characterPos?: THREE.Vector3) => void;
  dispose: () => void;
}

/**
 * Creates the delicate, recognizable dandelion seed pappus geometry.
 * Composed of:
 *  1. A tiny brown/amber achene seed kernel at the base.
 *  2. A fine, slender beak/filament stem.
 *  3. A delicate radial crown of fine gossamer white parachute filaments (pappus hairs).
 */
function createDandelionPappusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Seed Kernel (slender tapered teardrop/cylinder at bottom)
  const seedGeo = new THREE.CylinderGeometry(0.008, 0.004, 0.045, 4);
  seedGeo.translate(0, -0.05, 0);
  parts.push(seedGeo);

  // 2. Slender central beak filament
  const stemGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.065, 3);
  stemGeo.translate(0, -0.015, 0);
  parts.push(stemGeo);

  // 3. Delicate radial pappus crown (12 fine radiating gossamer hairs)
  const hairCount = 12;
  const hairRadius = 0.048;
  for (let i = 0; i < hairCount; i++) {
    const angle = (i / hairCount) * Math.PI * 2;
    const hair = new THREE.CylinderGeometry(0.0015, 0.0015, hairRadius, 3);
    // Tilt hair outward like an open umbrella
    hair.rotateZ(0.68);
    hair.rotateY(angle);
    hair.translate(Math.cos(angle) * hairRadius * 0.42, 0.024, Math.sin(angle) * hairRadius * 0.42);
    parts.push(hair);
  }

  // 4. Central soft fluffy tuft core
  const core = new THREE.IcosahedronGeometry(0.014, 1);
  core.translate(0, 0.02, 0);
  parts.push(core);

  // Merge geometries
  let totalVerts = 0;
  for (const p of parts) totalVerts += p.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const p of parts) {
    const attr = p.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      pos[offset * 3] = attr.getX(i);
      pos[offset * 3 + 1] = attr.getY(i);
      pos[offset * 3 + 2] = attr.getZ(i);
      offset++;
    }
    p.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * Creates grounded blooming dandelion plant geometry:
 * Toothed basal leaves, slender flowering stalks, golden yellow ray flowers,
 * and ripe white spherical clock seed heads ready to release seeds.
 */
export function createGroundedDandelionGeometry(isClockHead: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Toothed basal leaf rosette (6 leaves radiating along ground)
  for (let l = 0; l < 6; l++) {
    const lAng = (l / 6) * Math.PI * 2 + (l % 2) * 0.2;
    const leaf = new THREE.BoxGeometry(0.16, 0.008, 0.045);
    leaf.rotateZ(-0.15); // gentle upward tilt
    leaf.rotateY(lAng);
    leaf.translate(Math.cos(lAng) * 0.08, 0.018, Math.sin(lAng) * 0.08);
    parts.push(leaf);
  }

  // Slender hollow scape stalk
  const stalkH = 0.26 + (isClockHead ? 0.04 : 0);
  const stalk = new THREE.CylinderGeometry(0.008, 0.012, stalkH, 5);
  stalk.translate(0, stalkH * 0.5, 0);
  parts.push(stalk);

  if (isClockHead) {
    // Ripe fluffy white spherical seed head (pappus clock)
    const clock = new THREE.IcosahedronGeometry(0.065, 2);
    clock.translate(0, stalkH + 0.045, 0);
    parts.push(clock);
  } else {
    // Vibrant golden-yellow open ray flower head
    const blossom = new THREE.CylinderGeometry(0.052, 0.025, 0.03, 8);
    blossom.translate(0, stalkH + 0.015, 0);
    parts.push(blossom);
  }

  // Merge
  let totalVerts = 0;
  for (const p of parts) totalVerts += p.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const p of parts) {
    const attr = p.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      pos[offset * 3] = attr.getX(i);
      pos[offset * 3 + 1] = attr.getY(i);
      pos[offset * 3 + 2] = attr.getZ(i);
      offset++;
    }
    p.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}

export function createDandelionSystem(scene: THREE.Scene): DandelionSystem {
  const group = new THREE.Group();
  scene.add(group);

  // -------------------------------------------------------------
  // Airborne Drifting Dandelion Fluff (Luminous, Delicate, Floating)
  // -------------------------------------------------------------
  const pappusCount = 68;
  const pappusGeo = createDandelionPappusGeometry();

  // Translucent luminous cream-white material with soft Ghibli warmth
  const pappusMat = new THREE.MeshStandardMaterial({
    color: '#fffff5',
    emissive: '#fff9e6',
    emissiveIntensity: 0.28,
    roughness: 0.65,
    metalness: 0.02,
    transparent: true,
    opacity: 0.88,
    flatShading: true,
  });

  const pappusMesh = new THREE.InstancedMesh(pappusGeo, pappusMat, pappusCount);
  pappusMesh.castShadow = false;
  pappusMesh.receiveShadow = false;
  group.add(pappusMesh);

  interface SeedParticle {
    x: number;
    y: number;
    z: number;
    baseY: number;
    speedX: number;
    speedZ: number;
    riseSpeed: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    rotSpeedX: number;
    rotSpeedY: number;
    wobblePhase: number;
    scale: number;
  }

  const seeds: SeedParticle[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < pappusCount; i++) {
    const x = (Math.random() - 0.5) * 44;
    const z = (Math.random() - 0.5) * 44;
    const groundY = getTerrainHeight(x, z);
    const y = groundY + 0.6 + Math.random() * 4.2;

    seeds.push({
      x,
      y,
      z,
      baseY: groundY,
      speedX: 0.35 + Math.random() * 0.45,
      speedZ: -0.2 - Math.random() * 0.35,
      riseSpeed: (Math.random() - 0.45) * 0.12,
      rotX: (Math.random() - 0.5) * 0.4,
      rotY: Math.random() * Math.PI * 2,
      rotZ: (Math.random() - 0.5) * 0.4,
      rotSpeedX: (Math.random() - 0.5) * 0.8,
      rotSpeedY: (Math.random() - 0.5) * 0.6,
      wobblePhase: Math.random() * Math.PI * 2,
      scale: 0.85 + Math.random() * 0.45,
    });
  }

  // -------------------------------------------------------------
  // Grounded Dandelion Field Patches (Clustered Wildflower Clocks)
  // -------------------------------------------------------------
  const clockGeo = createGroundedDandelionGeometry(true);
  const clockMat = new THREE.MeshStandardMaterial({
    color: '#fefef6',
    emissive: '#fffde8',
    emissiveIntensity: 0.18,
    roughness: 0.72,
    flatShading: true,
  });

  const clockCount = 42;
  const clockMesh = new THREE.InstancedMesh(clockGeo, clockMat, clockCount);
  clockMesh.receiveShadow = true;
  clockMesh.castShadow = true;

  const clockDummy = new THREE.Object3D();
  // Place clocks in natural sunny meadow glades
  const gladeCenters: [number, number][] = [
    [1.8, -2.5],
    [-4.5, 3.2],
    [6.2, 3.8],
    [-8.5, -4.5],
    [9.5, -6.5],
    [-6.2, 11.0],
  ];

  for (let i = 0; i < clockCount; i++) {
    const center = gladeCenters[i % gladeCenters.length];
    const ang = Math.random() * Math.PI * 2;
    const dist = 0.5 + Math.random() * 3.2;
    const cx = center[0] + Math.cos(ang) * dist;
    const cz = center[1] + Math.sin(ang) * dist;
    const cy = getTerrainHeight(cx, cz);

    clockDummy.position.set(cx, cy - 0.01, cz);
    clockDummy.rotation.set(
      (Math.random() - 0.5) * 0.15,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.15
    );
    clockDummy.scale.setScalar(0.85 + Math.random() * 0.4);
    clockDummy.updateMatrix();
    clockMesh.setMatrixAt(i, clockDummy.matrix);
  }
  clockMesh.instanceMatrix.needsUpdate = true;
  group.add(clockMesh);

  return {
    group,
    update: (time: number, delta: number, characterPos?: THREE.Vector3) => {
      // Animate drifting dandelion fluff
      for (let i = 0; i < pappusCount; i++) {
        const s = seeds[i];

        // Atmospheric breeze drift
        const windGust = Math.sin(time * 1.4 + s.wobblePhase) * 0.18;
        s.x += (s.speedX + windGust) * delta;
        s.z += s.speedZ * delta;

        // Gentle undulating thermal rise and fall
        const thermal = Math.sin(time * 2.1 + s.wobblePhase * 1.5) * 0.12;
        s.y += (s.riseSpeed + thermal) * delta;

        // Gentle rotational tilt in breeze
        s.rotY += s.rotSpeedY * delta;
        s.rotX = Math.sin(time * 1.8 + s.wobblePhase) * 0.22;
        s.rotZ = Math.cos(time * 1.5 + s.wobblePhase) * 0.18;

        // Interactive air displacement from moving character
        if (characterPos) {
          const dx = s.x - characterPos.x;
          const dy = s.y - (characterPos.y + 1.1);
          const dz = s.z - characterPos.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < 4.0 && distSq > 0.01) {
            const push = (2.0 - Math.sqrt(distSq)) * 1.6 * delta;
            s.x += (dx / Math.sqrt(distSq)) * push;
            s.y += Math.max(0.2, push * 0.8);
            s.z += (dz / Math.sqrt(distSq)) * push;
          }
        }

        // Ground constraint: bounce softly if approaching grass
        const groundH = getTerrainHeight(s.x, s.z);
        if (s.y < groundH + 0.45) {
          s.y = groundH + 0.45 + 0.05;
          s.riseSpeed = Math.abs(s.riseSpeed) + 0.15;
        }

        // World wrap: smoothly recirculate within meadow viewing volume
        if (s.x > 24) s.x = -24;
        if (s.x < -24) s.x = 24;
        if (s.z < -26) s.z = 24;
        if (s.z > 24) s.z = -26;
        if (s.y > groundH + 5.5) s.y = groundH + 0.8;

        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(s.rotX, s.rotY, s.rotZ);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        pappusMesh.setMatrixAt(i, dummy.matrix);
      }
      pappusMesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(group);
      pappusGeo.dispose();
      pappusMat.dispose();
      clockGeo.dispose();
      clockMat.dispose();
    },
  };
}

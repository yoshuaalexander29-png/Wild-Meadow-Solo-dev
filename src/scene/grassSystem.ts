import * as THREE from 'three';
import { getTerrainHeight, getDistanceToPath, getDistanceToStream } from './terrain';

export interface GrassSystem {
  mesh: THREE.InstancedMesh;
  flowerMeshes: THREE.InstancedMesh[];
  update: (time: number, characterPosition: THREE.Vector3, delta?: number) => void;
  triggerShockwave: (radius?: number, strength?: number) => void;
  dispose: () => void;
}

// Grounded stylized flower geometry with rooted green stem, paired leaves, and petaled crown
function createBotanicalFlowerGeometry(petalShape: 'star' | 'disc' | 'bell'): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // 1. Rooted Stem: base starts at y = 0.0 (ground surface) and extends to y = 0.32
  const stemHeight = 0.32;
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.02, stemHeight, 5);
  stemGeo.translate(0, stemHeight * 0.5, 0);
  geometries.push(stemGeo);

  // 2. Pair of small stylized leaves branching from stem
  const leafL = new THREE.BoxGeometry(0.09, 0.012, 0.035);
  leafL.rotateZ(0.42);
  leafL.translate(-0.045, 0.14, 0);
  geometries.push(leafL);

  const leafR = new THREE.BoxGeometry(0.09, 0.012, 0.035);
  leafR.rotateZ(-0.42);
  leafR.translate(0.045, 0.19, 0);
  geometries.push(leafR);

  // 3. Flower Crown / Blossom Head
  if (petalShape === 'star') {
    // 5 radiating star petals
    for (let p = 0; p < 5; p++) {
      const ang = (p / 5) * Math.PI * 2;
      const petal = new THREE.ConeGeometry(0.04, 0.11, 4);
      petal.rotateZ(Math.PI / 2);
      petal.rotateY(ang);
      petal.translate(Math.cos(ang) * 0.065, stemHeight + 0.01, Math.sin(ang) * 0.065);
      geometries.push(petal);
    }
  } else if (petalShape === 'disc') {
    // 6 round petals
    for (let p = 0; p < 6; p++) {
      const ang = (p / 6) * Math.PI * 2;
      const petal = new THREE.IcosahedronGeometry(0.042, 1);
      petal.scale(1.2, 0.45, 1.0);
      petal.translate(Math.cos(ang) * 0.06, stemHeight + 0.01, Math.sin(ang) * 0.06);
      geometries.push(petal);
    }
  } else {
    // Bell shaped flower
    const bell = new THREE.CylinderGeometry(0.06, 0.025, 0.12, 6);
    bell.translate(0, stemHeight + 0.05, 0);
    geometries.push(bell);
  }

  // 4. Pistil / Flower Center
  const centerGeo = new THREE.IcosahedronGeometry(0.038, 1);
  centerGeo.translate(0, stemHeight + 0.015, 0);
  geometries.push(centerGeo);

  const mergedGeo = mergeGeometriesManually(geometries);
  geometries.forEach((g) => g.dispose());
  return mergedGeo;
}

function mergeGeometriesManually(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  for (const g of geometries) {
    totalVerts += g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  let offset = 0;

  for (const g of geometries) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      positions[offset * 3] = p.getX(i);
      positions[offset * 3 + 1] = p.getY(i);
      positions[offset * 3 + 2] = p.getZ(i);
      offset++;
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

export function createGrassSystem(scene: THREE.Scene): GrassSystem {
  // Blade geometry: 2-segment tapered blade with curved spine
  const bladeWidth = 0.07;
  const bladeHeight = 0.54;
  const grassGeo = new THREE.ConeGeometry(bladeWidth, bladeHeight, 3);
  grassGeo.translate(0, bladeHeight * 0.5, 0);

  const uniforms = {
    uTime: { value: 0 },
    uCharacterPos: { value: new THREE.Vector3(0, 0, 0) },
    uDeformRadius: { value: 1.85 },
    uDeformStrength: { value: 0.92 },
  };

  const grassMat = new THREE.MeshStandardMaterial({
    roughness: 0.72,
    metalness: 0.05,
    flatShading: true,
  });

  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCharacterPos = uniforms.uCharacterPos;
    shader.uniforms.uDeformRadius = uniforms.uDeformRadius;
    shader.uniforms.uDeformStrength = uniforms.uDeformStrength;

    shader.vertexShader = `
      uniform float uTime;
      uniform vec3 uCharacterPos;
      uniform float uDeformRadius;
      uniform float uDeformStrength;
      varying float vHeightRatio;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      
      float hRatio = clamp(position.y / 0.54, 0.0, 1.0);
      vHeightRatio = hRatio;

      #ifdef USE_INSTANCING
        vec4 instWorldPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #else
        vec4 instWorldPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #endif

      // 1. Ambient multi-frequency natural wind gusts
      float wT = uTime * 2.2;
      float wave1 = sin(wT + instWorldPos.x * 0.22 + instWorldPos.z * 0.16);
      float wave2 = sin(wT * 1.5 - instWorldPos.x * 0.14 + instWorldPos.z * 0.31) * 0.5;
      float wave3 = cos(wT * 0.9 + instWorldPos.z * 0.25) * 0.25;
      float windVal = (wave1 + wave2 + wave3) * 0.15 * pow(hRatio, 1.3);

      transformed.x += windVal * 0.85;
      transformed.z += windVal * 0.65;

      // 2. Character interaction deformation field
      vec2 toBlade = instWorldPos.xz - uCharacterPos.xz;
      float charDist = length(toBlade);

      if (charDist < uDeformRadius) {
        float normDist = charDist / uDeformRadius;
        float factor = 1.0 - smoothstep(0.0, 1.0, normDist);
        factor = factor * factor * (3.0 - 2.0 * factor);

        vec2 pushDir = toBlade / max(charDist, 0.001);
        float bendAmt = factor * uDeformStrength * pow(hRatio, 1.15);

        transformed.xz += pushDir * bendAmt * 0.72;
        transformed.y -= bendAmt * 0.26;
      }
      `
    );

    shader.fragmentShader = `
      varying float vHeightRatio;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 rootColor = vec3(0.12, 0.32, 0.14); // Rich deep forest emerald jade
      vec3 tipColor = vec3(0.52, 0.84, 0.28);  // Sun-kissed Ghibli warm lime
      diffuseColor.rgb = mix(rootColor, tipColor, vHeightRatio * 0.88 + 0.12);
      `
    );
  };

  const bladeCount = 8800;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, bladeCount);
  grassMesh.receiveShadow = true;
  grassMesh.castShadow = false;

  let state = 0x47524153;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const dummy = new THREE.Object3D();
  let placed = 0;

  for (let i = 0; i < bladeCount; i++) {
    const angle = rnd() * Math.PI * 2;
    const r = 1.6 + Math.sqrt(rnd()) * 42.0;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    // Avoid water channel & river banks
    if (getDistanceToStream(x, z) < 1.6) continue;

    // Avoid campfire hearth
    if (Math.hypot(x - 2.2, z - 2.2) < 1.4) continue;

    // Avoid bridge deck and approaches
    if (Math.hypot(x - (-1.1), z - (-6.9)) < 2.8) continue;

    // Avoid Windrise Oak trunk
    if (Math.hypot(x - (-16), z - (-18)) < 3.2) continue;

    // Avoid artist easel station
    if (Math.hypot(x - (-10.6), z - 12.8) < 1.1) continue;

    // Thin out grass on the exploration footpaths
    const distToPath = getDistanceToPath(x, z);
    if (distToPath < 1.35 && rnd() > 0.12) {
      continue;
    }

    const y = getTerrainHeight(x, z);
    dummy.position.set(x, y - 0.02, z);
    dummy.rotation.set((rnd() - 0.5) * 0.1, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.12);

    const s = 0.75 + rnd() * 0.65;
    dummy.scale.set(s, s * (0.8 + rnd() * 0.5), s);
    dummy.updateMatrix();

    grassMesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }

  grassMesh.count = placed;
  grassMesh.instanceMatrix.needsUpdate = true;
  scene.add(grassMesh);

  // -------------------------------------------------------------
  // Overhauled Botanical Wildflowers (Matching IMG_0920 & IMG_0919)
  // Vibrant ribbon swarms of pinks, yellows, whites, and blues!
  // -------------------------------------------------------------
  interface FlowerConfig {
    name: string;
    shape: 'star' | 'disc' | 'bell';
    color: string;
    count: number;
    roughness: number;
  }

  const flowerConfigs: FlowerConfig[] = [
    { name: 'Windwheel Aster', shape: 'disc', color: '#e64e72', count: 180, roughness: 0.55 }, // Soft pink-crimson
    { name: 'Cecilia', shape: 'star', color: '#fffef0', count: 180, roughness: 0.5 }, // Luminous ivory star
    { name: 'Sweet Flower', shape: 'disc', color: '#fac432', count: 180, roughness: 0.55 }, // Golden buttercup
    { name: 'Totoro Bluebell', shape: 'bell', color: '#4a8de8', count: 150, roughness: 0.4 }, // Vivid cornflower blue
    { name: 'Blooming Dandelion', shape: 'disc', color: '#f5be25', count: 140, roughness: 0.5 }, // Sunny yellow ray florets
  ];

  const flowerUniforms = {
    uTime: { value: 0 },
  };

  const flowerMeshes: THREE.InstancedMesh[] = [];

  flowerConfigs.forEach((cfg, flowerIdx) => {
    const geo = createBotanicalFlowerGeometry(cfg.shape);
    const fMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      flatShading: true,
    });

    fMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = flowerUniforms.uTime;
      shader.vertexShader = `
        uniform float uTime;
        ${shader.vertexShader}
      `;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 instPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 instPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float hRatio = clamp(position.y / 0.32, 0.0, 1.0);
        float bend = pow(hRatio, 1.6);
        float plantPhase = instPos.x * 0.45 + instPos.z * 0.38;
        float swayX = sin(uTime * 2.2 + plantPhase) * 0.038 * bend;
        float swayZ = cos(uTime * 1.7 + plantPhase * 1.3) * 0.028 * bend;
        transformed.x += swayX;
        transformed.z += swayZ;
        `
      );
    };

    const fMesh = new THREE.InstancedMesh(geo, fMat, cfg.count);
    fMesh.receiveShadow = true;
    fMesh.castShadow = true;

    const fDummy = new THREE.Object3D();
    let fPlaced = 0;

    for (let i = 0; i < cfg.count; i++) {
      // Clustered drift distribution for painterly flower swarms
      const driftAngle = (flowerIdx * 1.25) + rnd() * 2.2;
      const r = 2.5 + Math.sqrt(rnd()) * 38.0;
      const x = Math.cos(driftAngle) * r + (rnd() - 0.5) * 4.5;
      const z = Math.sin(driftAngle) * r + (rnd() - 0.5) * 4.5;

      if (getDistanceToPath(x, z) < 1.35) continue;
      if (getDistanceToStream(x, z) < 1.65) continue;
      if (Math.hypot(x - 2.2, z - 2.2) < 1.6) continue;
      if (Math.hypot(x - (-1.1), z - (-6.9)) < 2.8) continue;
      if (Math.hypot(x - (-10.6), z - 12.8) < 1.1) continue;

      const y = getTerrainHeight(x, z);
      fDummy.position.set(x, y, z);
      const s = 0.85 + rnd() * 0.35;
      fDummy.scale.set(s, s * (0.9 + rnd() * 0.25), s);
      fDummy.rotation.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
      fDummy.updateMatrix();

      fMesh.setMatrixAt(fPlaced, fDummy.matrix);
      fPlaced++;
    }

    fMesh.count = fPlaced;
    fMesh.instanceMatrix.needsUpdate = true;
    scene.add(fMesh);
    flowerMeshes.push(fMesh);
  });

  let curRadius = 1.85;
  let curStrength = 0.92;

  return {
    mesh: grassMesh,
    flowerMeshes,
    triggerShockwave: (radius = 3.8, strength = 1.9) => {
      curRadius = radius;
      curStrength = strength;
      uniforms.uDeformRadius.value = curRadius;
      uniforms.uDeformStrength.value = curStrength;
    },
    update: (time: number, charPos: THREE.Vector3, delta = 0.016) => {
      uniforms.uTime.value = time;
      uniforms.uCharacterPos.value.copy(charPos);
      flowerUniforms.uTime.value = time;

      if (curRadius > 1.86 || curStrength > 0.93) {
        curRadius = THREE.MathUtils.damp(curRadius, 1.85, 4.5, delta);
        curStrength = THREE.MathUtils.damp(curStrength, 0.92, 4.5, delta);
        uniforms.uDeformRadius.value = curRadius;
        uniforms.uDeformStrength.value = curStrength;
      }
    },
    dispose: () => {
      scene.remove(grassMesh);
      grassGeo.dispose();
      grassMat.dispose();
      flowerMeshes.forEach((fm) => {
        scene.remove(fm);
        fm.geometry.dispose();
        if (Array.isArray(fm.material)) {
          fm.material.forEach((m) => m.dispose());
        } else {
          fm.material.dispose();
        }
      });
    },
  };
}

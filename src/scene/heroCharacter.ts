import * as THREE from 'three';

export interface HeroKnightRig {
  group: THREE.Group;
  pivot: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  cape: THREE.Group;
  plume: THREE.Group;
  sword: THREE.Group;
  shadowDisc: THREE.Mesh;
  updateProcedural: (
    dt: number,
    speed: number,
    isGrounded: boolean,
    isRolling: boolean,
    isEmoting: boolean,
    rollProgress: number,
    emoteProgress: number,
    time: number
  ) => void;
  dispose: () => void;
}

/**
 * Creates an authored, stylized Ghibli / BotW Cel-Shaded Adventurer Knight.
 * Zero external asset dependencies - instantly rendered and interactive on Frame 0.
 * Features articulated limbs, flowing cape with wind/speed physics, and responsive kinematics.
 */
export function createHeroKnight(): HeroKnightRig {
  const group = new THREE.Group();
  group.name = 'HeroKnightContainer';

  // Inner pivot allows rotating or shifting model relative to physics collider
  const pivot = new THREE.Group();
  pivot.name = 'HeroKnightPivot';
  group.add(pivot);

  // Materials palette
  const armorMat = new THREE.MeshStandardMaterial({
    color: '#9db3c8', // Polished silver-blue steel
    roughness: 0.42,
    metalness: 0.55,
    flatShading: true,
  });

  const armorDarkMat = new THREE.MeshStandardMaterial({
    color: '#657788', // Darker joint steel
    roughness: 0.5,
    metalness: 0.5,
    flatShading: true,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: '#f5b82e', // Warm Ghibli gold trim
    roughness: 0.35,
    metalness: 0.7,
    flatShading: true,
  });

  const tunicMat = new THREE.MeshStandardMaterial({
    color: '#2b586e', // Deep cobalt knight surcoat
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
  });

  const capeMat = new THREE.MeshStandardMaterial({
    color: '#cf3c29', // Radiant vermilion adventurer cloak
    roughness: 0.8,
    metalness: 0.02,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  const leatherMat = new THREE.MeshStandardMaterial({
    color: '#442818', // Rich oiled leather boots and belt
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });

  const swordSteelMat = new THREE.MeshStandardMaterial({
    color: '#e4ebf2',
    roughness: 0.28,
    metalness: 0.85,
    flatShading: true,
  });

  // 1. Soft Dynamic Ground Shadow Disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sCtx = shadowCanvas.getContext('2d');
  if (sCtx) {
    const grad = sCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(12, 24, 16, 0.65)');
    grad.addColorStop(0.5, 'rgba(12, 24, 16, 0.35)');
    grad.addColorStop(1, 'rgba(12, 24, 16, 0.0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.02;
  group.add(shadowDisc);

  // 2. Torso Group (Center of mass at y = 1.05m)
  const torso = new THREE.Group();
  torso.position.y = 1.05;
  pivot.add(torso);

  // Chestplate & Surcoat
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.34), tunicMat);
  chest.castShadow = true;
  chest.receiveShadow = true;
  torso.add(chest);

  const breastplate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.16), armorMat);
  breastplate.position.set(0, 0.04, 0.12);
  breastplate.castShadow = true;
  torso.add(breastplate);

  // Gold Collar / Gorget
  const gorget = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.3), goldMat);
  gorget.position.set(0, 0.28, 0.02);
  torso.add(gorget);

  // Leather Belt with Gold Buckle
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.36), leatherMat);
  belt.position.set(0, -0.22, 0);
  torso.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.06), goldMat);
  buckle.position.set(0, -0.22, 0.19);
  torso.add(buckle);

  // Small hip adventuring pouch
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.09), leatherMat);
  pouch.position.set(0.24, -0.24, 0.08);
  torso.add(pouch);

  // 3. Head & Helmet Group (Pivot at top of torso, y = 0.36m relative to torso)
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.02);
  torso.add(head);

  // Helmet Dome
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), armorMat);
  helmet.position.set(0, 0.18, 0);
  helmet.castShadow = true;
  head.add(helmet);

  // Helmet Visor Brow & Slit
  const visorBrow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.14), goldMat);
  visorBrow.position.set(0, 0.21, 0.16);
  head.add(visorBrow);

  const visorSlitMat = new THREE.MeshBasicMaterial({ color: '#161d24' });
  const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.04), visorSlitMat);
  visorSlit.position.set(0, 0.15, 0.18);
  head.add(visorSlit);

  // Crimson Plume / Feather Crest atop Helm
  const plume = new THREE.Group();
  plume.position.set(0, 0.36, -0.06);
  head.add(plume);

  const plumeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 5), capeMat);
  plumeMesh.rotation.x = -0.55;
  plumeMesh.position.set(0, 0.12, -0.08);
  plumeMesh.castShadow = true;
  plume.add(plumeMesh);

  // 4. Adventurer Sword strapped to Back
  const sword = new THREE.Group();
  sword.position.set(-0.16, 0.05, -0.2);
  sword.rotation.set(0.3, 0.2, -0.45);
  torso.add(sword);

  // Scabbard
  const scabbard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.05), leatherMat);
  scabbard.position.y = -0.2;
  scabbard.castShadow = true;
  sword.add(scabbard);

  // Gold Scabbard Chape & Locket
  const scabbardLocket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.06), goldMat);
  scabbardLocket.position.y = 0.22;
  sword.add(scabbardLocket);

  // Crossguard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), goldMat);
  guard.position.y = 0.3;
  sword.add(guard);

  // Hilt & Pommel
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), leatherMat);
  hilt.position.y = 0.42;
  sword.add(hilt);

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), goldMat);
  pommel.position.y = 0.54;
  sword.add(pommel);

  // 5. Flowing Vermilion Cape (Attached to shoulders)
  const cape = new THREE.Group();
  cape.position.set(0, 0.26, -0.16);
  torso.add(cape);

  const capeSeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.03), capeMat);
  capeSeg1.position.set(0, -0.19, 0);
  capeSeg1.castShadow = true;
  cape.add(capeSeg1);

  const capeSeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.03), capeMat);
  capeSeg2.position.set(0, -0.38, 0.02);
  capeSeg2.rotation.x = 0.12;
  capeSeg2.castShadow = true;
  capeSeg1.add(capeSeg2);

  // 6. Pauldrons (Shoulder Armor)
  const leftPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.22), armorMat);
  leftPauldron.position.set(-0.28, 0.22, 0);
  leftPauldron.rotation.z = -0.2;
  leftPauldron.castShadow = true;
  torso.add(leftPauldron);

  const rightPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.22), armorMat);
  rightPauldron.position.set(0.28, 0.22, 0);
  rightPauldron.rotation.z = 0.2;
  rightPauldron.castShadow = true;
  torso.add(rightPauldron);

  // 7. Left Arm (Shoulder Pivot at (-0.32, 0.16, 0))
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.32, 0.16, 0);
  torso.add(leftArm);

  const leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.15), tunicMat);
  leftUpperArm.position.set(0, -0.16, 0);
  leftUpperArm.castShadow = true;
  leftArm.add(leftUpperArm);

  const leftGauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.16), armorMat);
  leftGauntlet.position.set(0, -0.38, 0.02);
  leftGauntlet.castShadow = true;
  leftArm.add(leftGauntlet);

  // 8. Right Arm (Shoulder Pivot at (0.32, 0.16, 0))
  const rightArm = new THREE.Group();
  rightArm.position.set(0.32, 0.16, 0);
  torso.add(rightArm);

  const rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.15), tunicMat);
  rightUpperArm.position.set(0, -0.16, 0);
  rightUpperArm.castShadow = true;
  rightArm.add(rightUpperArm);

  const rightGauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.16), armorMat);
  rightGauntlet.position.set(0, -0.38, 0.02);
  rightGauntlet.castShadow = true;
  rightArm.add(rightGauntlet);

  // 9. Left Leg (Hip Pivot at (-0.15, 0, 0) relative to pivot, y = 0.72)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.72, 0);
  pivot.add(leftLeg);

  const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.18), armorDarkMat);
  leftThigh.position.set(0, -0.18, 0);
  leftThigh.castShadow = true;
  leftLeg.add(leftThigh);

  const leftKnee = new THREE.Group();
  leftKnee.position.set(0, -0.36, 0);
  leftLeg.add(leftKnee);

  const leftShin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.16), armorMat);
  leftShin.position.set(0, -0.18, 0);
  leftShin.castShadow = true;
  leftKnee.add(leftShin);

  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), leatherMat);
  leftBoot.position.set(0, -0.35, 0.04);
  leftBoot.castShadow = true;
  leftKnee.add(leftBoot);

  // 10. Right Leg (Hip Pivot at (0.15, 0, 0) relative to pivot, y = 0.72)
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.72, 0);
  pivot.add(rightLeg);

  const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.18), armorDarkMat);
  rightThigh.position.set(0, -0.18, 0);
  rightThigh.castShadow = true;
  rightLeg.add(rightThigh);

  const rightKnee = new THREE.Group();
  rightKnee.position.set(0, -0.36, 0);
  rightLeg.add(rightKnee);

  const rightShin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.16), armorMat);
  rightShin.position.set(0, -0.18, 0);
  rightShin.castShadow = true;
  rightKnee.add(rightShin);

  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), leatherMat);
  rightBoot.position.set(0, -0.35, 0.04);
  rightBoot.castShadow = true;
  rightKnee.add(rightBoot);

  // Locomotion Kinematics Cycle Tracking
  let walkPhase = 0;

  function updateProcedural(
    dt: number,
    speed: number,
    isGrounded: boolean,
    isRolling: boolean,
    isEmoting: boolean,
    rollProgress: number,
    _emoteProgress: number,
    time: number
  ) {
    // -------------------------------------------------------------
    // Rolling Action (Full Acrobatic Tumble)
    // -------------------------------------------------------------
    if (isRolling) {
      const rollAngle = (1.0 - rollProgress) * Math.PI * 2;
      pivot.rotation.x = -rollAngle;
      pivot.position.y = Math.sin((1.0 - rollProgress) * Math.PI) * 0.25;

      leftLeg.rotation.x = -0.7;
      rightLeg.rotation.x = -0.7;
      leftKnee.rotation.x = 1.1;
      rightKnee.rotation.x = 1.1;
      leftArm.rotation.x = 0.8;
      rightArm.rotation.x = 0.8;
      cape.rotation.x = 1.4;
      head.rotation.x = 0.4;
      return;
    }

    // Reset pivot rotation & height from roll
    pivot.rotation.x = 0;
    pivot.position.y = 0;

    // -------------------------------------------------------------
    // Emote / Victory Cheer Action (Salute with arm raised)
    // -------------------------------------------------------------
    if (isEmoting) {
      const cheerWave = Math.sin(time * 8.0) * 0.18;
      rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -2.5 + cheerWave, 0.15);
      rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, 0.4, 0.15);
      leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, -0.4, 0.15);
      head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, -0.25, 0.15);
      torso.position.y = 1.05 + Math.sin(time * 6.0) * 0.03;
      return;
    }

    // -------------------------------------------------------------
    // Airborne / Jump State
    // -------------------------------------------------------------
    if (!isGrounded) {
      // Tuck legs gently during mid-air leap
      leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, 0.45, 12.0, dt);
      rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, -0.3, 12.0, dt);
      leftKnee.rotation.x = THREE.MathUtils.damp(leftKnee.rotation.x, 0.65, 12.0, dt);
      rightKnee.rotation.x = THREE.MathUtils.damp(rightKnee.rotation.x, 0.45, 12.0, dt);

      // Arms raised outward for balance
      leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, -0.5, 12.0, dt);
      rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, -0.5, 12.0, dt);
      leftArm.rotation.z = THREE.MathUtils.damp(leftArm.rotation.z, -0.3, 12.0, dt);
      rightArm.rotation.z = THREE.MathUtils.damp(rightArm.rotation.z, 0.3, 12.0, dt);

      // Cape billows upward and behind
      cape.rotation.x = THREE.MathUtils.damp(cape.rotation.x, 0.75 + Math.sin(time * 7) * 0.1, 14.0, dt);
      plume.rotation.x = THREE.MathUtils.damp(plume.rotation.x, -0.3, 14.0, dt);

      shadowDisc.scale.setScalar(0.7);
      shadowMat.opacity = 0.4;
      return;
    }

    // Grounded shadow opacity & scale
    shadowDisc.scale.setScalar(1.0);
    shadowMat.opacity = 0.75;

    // -------------------------------------------------------------
    // Ground Locomotion (Idle, Walk, Sprint)
    // -------------------------------------------------------------
    if (speed > 0.25) {
      const isSprint = speed > 4.6;
      const strideRate = isSprint ? 14.5 : 9.5;
      walkPhase += dt * strideRate;

      const legSwingMax = isSprint ? 0.78 : 0.52;
      const armSwingMax = isSprint ? 0.68 : 0.42;

      const sinWalk = Math.sin(walkPhase);
      const cosWalk = Math.cos(walkPhase);

      // Hip Swing
      leftLeg.rotation.x = sinWalk * legSwingMax;
      rightLeg.rotation.x = -sinWalk * legSwingMax;

      // Knee Bend (Bends on back-swing / foot lift)
      leftKnee.rotation.x = Math.max(0, -sinWalk) * (isSprint ? 1.05 : 0.75);
      rightKnee.rotation.x = Math.max(0, sinWalk) * (isSprint ? 1.05 : 0.75);

      // Arm Counter-Swing
      leftArm.rotation.x = -sinWalk * armSwingMax;
      rightArm.rotation.x = sinWalk * armSwingMax;
      leftArm.rotation.z = -0.1;
      rightArm.rotation.z = 0.1;

      // Torso Vertical Bobbing & Subtle Rhythm Sway
      const bob = Math.abs(cosWalk) * (isSprint ? 0.06 : 0.035);
      torso.position.y = 1.05 + bob;
      torso.rotation.y = -sinWalk * 0.08;
      head.rotation.y = sinWalk * 0.05;

      // Dynamic Cape Billow (Flies back with forward velocity + flutter)
      const capeFly = isSprint ? 0.85 : 0.45;
      const capeFlutter = Math.sin(time * (isSprint ? 18.0 : 10.0)) * 0.12;
      cape.rotation.x = THREE.MathUtils.damp(cape.rotation.x, capeFly + capeFlutter, 14.0, dt);

      // Plume Flutter
      plume.rotation.x = THREE.MathUtils.damp(plume.rotation.x, -capeFly * 0.5, 14.0, dt);
    } else {
      // -----------------------------------------------------------
      // Idle Breathing & Natural Posture
      // -----------------------------------------------------------
      const breath = Math.sin(time * 2.5) * 0.015;
      torso.position.y = 1.05 + breath;

      // Subtle resting arm angles
      leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, 0.05, 8.0, dt);
      rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, 0.05, 8.0, dt);
      leftArm.rotation.z = THREE.MathUtils.damp(leftArm.rotation.z, -0.05, 8.0, dt);
      rightArm.rotation.z = THREE.MathUtils.damp(rightArm.rotation.z, 0.05, 8.0, dt);

      leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, 0, 8.0, dt);
      rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, 0, 8.0, dt);
      leftKnee.rotation.x = THREE.MathUtils.damp(leftKnee.rotation.x, 0, 8.0, dt);
      rightKnee.rotation.x = THREE.MathUtils.damp(rightKnee.rotation.x, 0, 8.0, dt);

      torso.rotation.y = THREE.MathUtils.damp(torso.rotation.y, 0, 8.0, dt);
      head.rotation.y = THREE.MathUtils.damp(head.rotation.y, 0, 8.0, dt);

      // Gentle meadow breeze caresses cape and plume
      const breeze = Math.sin(time * 3.2) * 0.08 + 0.18;
      cape.rotation.x = THREE.MathUtils.damp(cape.rotation.x, breeze, 6.0, dt);
      plume.rotation.x = THREE.MathUtils.damp(plume.rotation.x, Math.sin(time * 3.5) * 0.05, 6.0, dt);
    }
  }

  let isDisposed = false;
  function dispose() {
    if (isDisposed) return;
    isDisposed = true;

    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
      }
    });

    shadowTex.dispose();
    shadowMat.dispose();
    visorSlitMat.dispose();
    armorMat.dispose();
    armorDarkMat.dispose();
    goldMat.dispose();
    tunicMat.dispose();
    capeMat.dispose();
    leatherMat.dispose();
    swordSteelMat.dispose();
  }

  return {
    group,
    pivot,
    head,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    cape,
    plume,
    sword,
    shadowDisc,
    updateProcedural,
    dispose,
  };
}

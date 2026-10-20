import * as THREE from 'three';
import {
  getWalkableSurface,
  resolveCollision,
  SAFE_RESPAWN,
  type SurfaceType,
} from './terrain';
import { createDustSystem, type DustSystem } from './dustSystem';
import { meadowAudio } from '../audio/proceduralAudio';
import { advanceVerticalMotion, GAME_FEEL, updateJumpAssistTimers } from './gameFeel';
import type { MovementInput } from '../types';

export interface CharacterControllerCallbacks {
  onDeathState?: (isDead: boolean, reason?: string) => void;
  onImpact?: (trauma: number) => void;
}

export interface CharacterController {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  /** Current vertical physics velocity in world units per second. */
  verticalSpeed: number;
  isGrounded: boolean;
  isDead: boolean;
  surfaceType: SurfaceType;
  update: (delta: number, input: MovementInput, cameraYaw: number, time: number) => void;
  triggerJump: () => void;
  triggerRoll: () => void;
  triggerEmote: () => void;
  respawn: () => void;
  dispose: () => void;
}

const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _currentVel = new THREE.Vector3();

interface ParticleItem {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
  alpha: number;
  active: boolean;
}

export function createCharacterController(
  root: THREE.Group,
  animations: THREE.AnimationClip[],
  scene?: THREE.Scene,
  callbacksOrOnDeath?: ((isDead: boolean, reason?: string) => void) | CharacterControllerCallbacks
): CharacterController {
  const callbacks: CharacterControllerCallbacks =
    typeof callbacksOrOnDeath === 'function'
      ? { onDeathState: callbacksOrOnDeath }
      : callbacksOrOnDeath || {};

  const mixer = new THREE.AnimationMixer(root);
  const baseScale = root.scale.clone();

  // Animation clips from Quaternius Knight_Male.glb
  const idleClip = animations.find((c) => /^idle$/i.test(c.name)) || animations.find((c) => /idle/i.test(c.name)) || animations[0];
  const walkClip = animations.find((c) => /^walk$/i.test(c.name)) || animations.find((c) => /walk/i.test(c.name)) || idleClip;
  const runClip = animations.find((c) => /^run$/i.test(c.name)) || animations.find((c) => /run|sprint/i.test(c.name)) || walkClip;
  const jumpClip = animations.find((c) => /^jump$/i.test(c.name)) || animations.find((c) => /jump/i.test(c.name));
  const rollClip = animations.find((c) => /^roll$/i.test(c.name)) || animations.find((c) => /roll|dodge/i.test(c.name));
  const victoryClip = animations.find((c) => /victory|cheer/i.test(c.name));
  const deathClip = animations.find((c) => /^death$/i.test(c.name)) || animations.find((c) => /defeat|death/i.test(c.name));
  const standUpClip = animations.find((c) => /^standup$/i.test(c.name)) || animations.find((c) => /stand|wakeup/i.test(c.name));

  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : null;
  const jumpAction = jumpClip ? mixer.clipAction(jumpClip) : null;
  const rollAction = rollClip ? mixer.clipAction(rollClip) : null;
  const victoryAction = victoryClip ? mixer.clipAction(victoryClip) : null;
  const deathAction = deathClip ? mixer.clipAction(deathClip) : null;
  const standUpAction = standUpClip ? mixer.clipAction(standUpClip) : null;

  // Configure non-looping one-shot actions
  [jumpAction, rollAction, victoryAction, deathAction, standUpAction].forEach((action) => {
    if (action) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
  });

  let currentAction = idleAction;
  if (currentAction) {
    currentAction.play();
  }

  function fadeToAction(nextAction: THREE.AnimationAction | null, duration = 0.16) {
    if (!nextAction || currentAction === nextAction) return;
    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    if (currentAction) {
      currentAction.crossFadeTo(nextAction, duration, true);
    } else {
      nextAction.fadeIn(duration);
    }
    nextAction.play();
    currentAction = nextAction;
  }

  // Locomotion & Kinematics State
  let currentSpeed = 0;
  let targetRotationY = root.rotation.y;
  let currentRotationY = root.rotation.y;
  let currentBank = 0;
  let currentPitch = 0;
  let landingSquash = 0;

  let isGrounded = true;
  let verticalVelocity = 0;
  

  // Coyote time & Jump buffering
  let coyoteTimer = 0;
  let jumpBufferTimer = 0;
  let previousJumpInput = false;

  let currentSurfaceType: SurfaceType = 'grass';
  let footstepTimer = 0;
  let sprintFootToggle = 0;

  // Action states
  let isRolling = false;
  let rollTimer = 0;
  let isEmoting = false;
  let emoteTimer = 0;

  // Death / Hazard / Respawn state
  let isDead = false;
  let deathTimer = 0;
  let isRespawning = false;
  let standUpTimer = 0;

  // -----------------------------------------------------------------
  // 1. Breath of the Wild Ground-Contact Dust System
  // -----------------------------------------------------------------
  const dustSystem: DustSystem | null = scene ? createDustSystem(scene) : null;

  // -----------------------------------------------------------------
  // 2. Water Splash Particles
  // -----------------------------------------------------------------
  const splashCount = 30;
  const splashParticles: ParticleItem[] = [];
  const splashGeo = new THREE.IcosahedronGeometry(0.06, 1);
  const splashMat = new THREE.MeshBasicMaterial({
    color: '#b6e9fa',
    transparent: true,
    opacity: 0.85,
  });
  const splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, splashCount);
  splashMesh.castShadow = false;
  splashMesh.receiveShadow = false;
  if (scene) scene.add(splashMesh);

  for (let i = 0; i < splashCount; i++) {
    splashParticles.push({
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      scale: 0.1,
      alpha: 0,
      active: false,
    });
  }

  const pDummy = new THREE.Object3D();

  function spawnWaterSplash(posX: number, posY: number, posZ: number, count = 4) {
    let spawned = 0;
    for (let i = 0; i < splashCount && spawned < count; i++) {
      const p = splashParticles[i];
      if (!p.active) {
        p.active = true;
        p.x = posX + (Math.random() - 0.5) * 0.35;
        p.y = posY + 0.08;
        p.z = posZ + (Math.random() - 0.5) * 0.35;
        p.vx = (Math.random() - 0.5) * 1.5;
        p.vy = 1.3 + Math.random() * 1.6;
        p.vz = (Math.random() - 0.5) * 1.5;
        p.scale = 0.7 + Math.random() * 0.6;
        p.alpha = 0.85;
        spawned++;
      }
    }
  }

  function doJump() {
    if (isDead || isRespawning || isRolling) return;

    if (!isGrounded && coyoteTimer <= 0) {
      jumpBufferTimer = 0.2;
      return;
    }

    isGrounded = false;
    coyoteTimer = 0;
    jumpBufferTimer = 0;
    verticalVelocity = GAME_FEEL.jumpInitialSpeed;

    if (jumpAction) {
      jumpAction.timeScale = 1.15;
      fadeToAction(jumpAction, 0.09);
    }
    meadowAudio.playJumpSound();

    if (currentSurfaceType === 'water') {
      spawnWaterSplash(root.position.x, root.position.y, root.position.z, 6);
      meadowAudio.playWaterSplashSound(false);
    } else {
      dustSystem?.emitImpactPuff(root.position, currentSurfaceType, 3.5);
    }
  }

  function doRoll() {
    if (isDead || isRespawning || isRolling || !isGrounded) return;
    isRolling = true;
    rollTimer = 0.52;

    if (rollAction) {
      rollAction.timeScale = 1.45;
      fadeToAction(rollAction, 0.08);
    }
    meadowAudio.playRollSound();

    _currentVel.set(
      Math.sin(currentRotationY) * 8.0,
      0,
      Math.cos(currentRotationY) * 8.0
    );
    currentSpeed = 8.0;
    callbacks.onImpact?.(0.06);

    if (currentSurfaceType === 'water') {
      spawnWaterSplash(root.position.x, root.position.y, root.position.z, 8);
    } else {
      dustSystem?.emitImpactPuff(root.position, currentSurfaceType, 4.5);
    }
  }

  function doEmote() {
    if (isDead || isRespawning || isRolling || !isGrounded) return;
    isEmoting = true;
    emoteTimer = 1.8;
    if (victoryAction) {
      fadeToAction(victoryAction, 0.18);
    }
  }

  function triggerDeath(reason: string) {
    if (isDead) return;
    isDead = true;
    deathTimer = 1.4;
    isRolling = false;
    isEmoting = false;
    _currentVel.set(0, 0, 0);
    currentSpeed = 0;

    if (deathAction) {
      fadeToAction(deathAction, 0.1);
    } else if (victoryAction) {
      fadeToAction(victoryAction, 0.1);
    }

    if (currentSurfaceType === 'water') {
      spawnWaterSplash(root.position.x, root.position.y, root.position.z, 10);
      meadowAudio.playWaterSplashSound(true);
    }

    callbacks.onDeathState?.(true, reason);
  }

  function executeRespawn() {
    const spawnX = SAFE_RESPAWN.x;
    const spawnZ = SAFE_RESPAWN.z;
    const surface = getWalkableSurface(spawnX, spawnZ);

    root.position.set(spawnX, surface.height, spawnZ);
    currentRotationY = SAFE_RESPAWN.rotY;
    targetRotationY = SAFE_RESPAWN.rotY;
    root.rotation.set(0, currentRotationY, 0);

    _currentVel.set(0, 0, 0);
    currentSpeed = 0;
    verticalVelocity = 0;
    isGrounded = true;
    landingSquash = 0;

    isDead = false;
    isRespawning = true;
    standUpTimer = 1.2;

    if (standUpAction) {
      standUpAction.timeScale = 1.1;
      fadeToAction(standUpAction, 0.12);
    } else {
      fadeToAction(idleAction, 0.2);
    }

    meadowAudio.playRespawnSound();
    dustSystem?.reset();
    callbacks.onDeathState?.(false, undefined);
  }

  return {
    model: root,
    mixer,
    position: root.position,
    velocity: _currentVel,
    get speed() {
      return currentSpeed;
    },
    get verticalSpeed() {
      return verticalVelocity;
    },
    get isGrounded() {
      return isGrounded;
    },
    get isDead() {
      return isDead;
    },
    get surfaceType() {
      return currentSurfaceType;
    },
    triggerJump: doJump,
    triggerRoll: doRoll,
    triggerEmote: doEmote,
    respawn: executeRespawn,
    update: (delta: number, input: MovementInput, cameraYaw: number, time: number) => {
      const dt = THREE.MathUtils.clamp(delta, 0.001, 0.05);
      // Treat held jump as one press. Repeatedly calling doJump while held can
      // continually refresh the jump buffer and cause an unintended auto-bunny-hop.
      const jumpPressed = !!input.jump && !previousJumpInput;
      previousJumpInput = !!input.jump;

      mixer.update(dt);

      if (isDead) {
        deathTimer -= dt;
        if (deathTimer <= 0) {
          executeRespawn();
        }
        return;
      }

      if (isRespawning) {
        standUpTimer -= dt;
        if (standUpTimer <= 0) {
          isRespawning = false;
          fadeToAction(idleAction, 0.2);
        }
        return;
      }

      if (isRolling) {
        rollTimer -= dt;
        if (rollTimer <= 0) {
          isRolling = false;
        }
      }
      if (isEmoting) {
        emoteTimer -= dt;
        if (emoteTimer <= 0) {
          isEmoting = false;
        }
      }

      // Coyote time & jump buffering are centralized and independently testable.
      const jumpAssist = updateJumpAssistTimers(
        coyoteTimer,
        jumpBufferTimer,
        isGrounded,
        isRolling,
        dt,
      );
      coyoteTimer = jumpAssist.coyoteTimer;
      jumpBufferTimer = jumpAssist.jumpBufferTimer;
      if (jumpAssist.consumeBufferedJump) {
        doJump();
      }

      // Do not submit the same edge twice if it coincides with buffer consumption.
      if (jumpPressed && !isRolling && !jumpAssist.consumeBufferedJump) {
        doJump();
      }

      // -----------------------------------------------------------------
      // Locomotion Calculation (Analog Magnitude: Walk, Run, Sprint)
      // -----------------------------------------------------------------
      const inputLen = Math.hypot(input.x, input.y);
      const hasInput = inputLen > 0.06 && !isRolling;

      // Surface speed modifier: shallow stream wading
      const surfaceSpeedMult = currentSurfaceType === 'water' ? 0.78 : 1.0;

      let targetSpeed = 0.0;
      if (hasInput) {
        isEmoting = false;
        if (input.sprint || inputLen >= 0.86) {
          targetSpeed = 7.0;
        } else if (inputLen > 0.44) {
          const runRatio = (inputLen - 0.44) / 0.42;
          targetSpeed = 2.8 + runRatio * 2.4; // 2.8 to 5.2
        } else {
          targetSpeed = (inputLen / 0.44) * 2.8; // 0 to 2.8
        }
        targetSpeed *= surfaceSpeedMult;

        // Camera-relative movement vector
        _camForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize();
        _camRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)).normalize();

        _moveDir
          .set(0, 0, 0)
          .addScaledVector(_camForward, input.y)
          .addScaledVector(_camRight, input.x);

        if (_moveDir.lengthSq() > 0.0001) {
          _moveDir.normalize();
          _targetVel.copy(_moveDir).multiplyScalar(targetSpeed);
          targetRotationY = Math.atan2(_moveDir.x, _moveDir.z);
        } else {
          _targetVel.set(0, 0, 0);
        }
      } else if (!isRolling) {
        _targetVel.set(0, 0, 0);
      }

      // Keep displayed speed and actual movement response aligned. Exponential
      // response is frame-rate independent; braking is deliberately stronger
      // than acceleration, while air steering remains more restrained.
      const accelRate = hasInput
        ? GAME_FEEL.groundAcceleration
        : (isRolling ? GAME_FEEL.rollingAcceleration : GAME_FEEL.groundBraking);
      currentSpeed = THREE.MathUtils.damp(currentSpeed, isRolling ? 8.0 : targetSpeed, accelRate, dt);

      if (!isRolling) {
        const velocityResponse = isGrounded
          ? (hasInput ? GAME_FEEL.groundAcceleration : GAME_FEEL.groundBraking)
          : GAME_FEEL.airControl;
        _currentVel.lerp(_targetVel, 1 - Math.exp(-velocityResponse * dt));
      }

      // Smooth turning with natural banking
      let diff = targetRotationY - currentRotationY;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      const targetBank = THREE.MathUtils.clamp(-diff * (currentSpeed / 4.0) * 0.38, -0.24, 0.24);
      currentBank = THREE.MathUtils.damp(currentBank, targetBank, GAME_FEEL.bankResponse, dt);
      currentRotationY += diff * (1 - Math.exp(-GAME_FEEL.groundTurnResponse * dt));

      // Terrain slope pitch adaptation
      const surface = getWalkableSurface(root.position.x, root.position.z);
      currentSurfaceType = surface.surfaceType;

      const targetPitch = THREE.MathUtils.clamp(-surface.normal.z * 0.38, -0.28, 0.28);
      currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 8.0, dt);

      root.rotation.set(currentPitch, currentRotationY, currentBank, 'YXZ');

      // Update position with continuous obstacle sliding collisions
      const nextX = root.position.x + _currentVel.x * dt;
      const nextZ = root.position.z + _currentVel.z * dt;

      const collision = resolveCollision(nextX, nextZ, 0.42, _currentVel.x, _currentVel.z);
      root.position.x = collision.x;
      root.position.z = collision.z;
      _currentVel.x = collision.slideVelX;
      _currentVel.z = collision.slideVelZ;

      // -----------------------------------------------------------------
      // Vertical Physics & Ground Elevation
      // -----------------------------------------------------------------
      const groundSurface = getWalkableSurface(root.position.x, root.position.z, { characterY: root.position.y, isGrounded, verticalVelocity });
      currentSurfaceType = groundSurface.surfaceType;
      const groundY = groundSurface.height;

      // Deep water hazard: only in intentional deep pools (> 0.85m depth)
      if (isGrounded && groundSurface.isDeepWater) {
        triggerDeath('The current was too swift for the armored knight.');
        return;
      }

      if (!isGrounded) {
        // Apex hang-time
        const verticalStep = advanceVerticalMotion(verticalVelocity, dt);
        verticalVelocity = verticalStep.velocity;
        root.position.y += verticalStep.displacement;

        if (root.position.y <= groundY) {
          // Landing touchdown
          const impactSpeed = Math.abs(verticalVelocity);
          root.position.y = groundY;
          isGrounded = true;
          verticalVelocity = 0;
          landingSquash = THREE.MathUtils.clamp(impactSpeed * 0.024, 0.1, 0.26);

          if (impactSpeed > 3.8) {
            callbacks.onImpact?.(Math.min(0.2, impactSpeed * 0.024));
          }

          if (currentSurfaceType === 'water') {
            spawnWaterSplash(root.position.x, root.position.y, root.position.z, 8);
            meadowAudio.playWaterSplashSound(false);
          } else {
            dustSystem?.emitImpactPuff(root.position, currentSurfaceType, impactSpeed);
            meadowAudio.playFootstep(currentSurfaceType === 'course' ? 'dirt' : currentSurfaceType, true);
          }
        }
      } else {
        // Grounded step traversal (smooth step-up and step-down across bridge and slopes)
        const heightDiff = groundY - root.position.y;
        if (Math.abs(heightDiff) < 0.45) {
          root.position.y = THREE.MathUtils.damp(root.position.y, groundY, 26.0, dt);
        } else if (root.position.y < groundY) {
          root.position.y = groundY;
        } else if (root.position.y - groundY > 0.45) {
          isGrounded = false;
        }

        // Idle micro-animation breathing & weight shift
        if (currentSpeed < 0.25 && !isRolling && !isEmoting) {
          const breath = Math.sin(time * 2.8) * 0.015;
          const weightShift = Math.sin(time * 1.4) * 0.012;
          root.position.y += breath;
          root.rotation.z += weightShift;
        }
      }

      // Landing squash & stretch recovery
      if (landingSquash > 0.001) {
        root.scale.set(
          baseScale.x * (1.0 + landingSquash * 0.65),
          baseScale.y * (1.0 - landingSquash),
          baseScale.z * (1.0 + landingSquash * 0.65)
        );
        landingSquash = THREE.MathUtils.damp(landingSquash, 0, 16.0, dt);
      } else {
        root.scale.copy(baseScale);
      }

      // -----------------------------------------------------------------
      // Animation Blending & Movement State Transitions
      // -----------------------------------------------------------------
      if (!isRolling && !isEmoting && !isDead && !isRespawning) {
        if (!isGrounded) {
          fadeToAction(jumpAction, 0.12);
        } else if (currentSpeed > 4.6) {
          if (runAction) {
            runAction.timeScale = (currentSpeed / 5.2) * 1.05;
          }
          fadeToAction(runAction, 0.15);
        } else if (currentSpeed > 0.3) {
          if (walkAction) {
            walkAction.timeScale = (currentSpeed / 2.6) * 1.05;
          }
          fadeToAction(walkAction, 0.15);
        } else {
          fadeToAction(idleAction, 0.22);
        }
      }

      // Update procedural limb & cape kinematics if using authored hero rig
      if (root.userData.heroRig?.updateProcedural) {
        root.userData.heroRig.updateProcedural(
          dt,
          currentSpeed,
          isGrounded,
          isRolling,
          isEmoting,
          rollTimer / 0.45,
          emoteTimer / 1.8,
          time
        );
      }

      // -----------------------------------------------------------------
      // Footstep Acoustics & Footfall Puffs (Layer 1 of BotW VFX)
      // -----------------------------------------------------------------
      if (isGrounded && currentSpeed > 0.3 && !isRolling) {
        const stepInterval = currentSpeed > 4.6 ? 0.31 : 0.48;
        footstepTimer += dt;
        if (footstepTimer >= stepInterval) {
          footstepTimer = 0;
          if (currentSurfaceType === 'water') {
            spawnWaterSplash(root.position.x, root.position.y, root.position.z, 3);
            meadowAudio.playWaterSplashSound(false);
          } else {
            meadowAudio.playFootstep(currentSurfaceType === 'course' ? 'dirt' : currentSurfaceType, currentSpeed > 4.6);
            const isSprint = currentSpeed > 4.6;
            sprintFootToggle = sprintFootToggle === 0 ? 1 : 0;
            const cosR = Math.cos(currentRotationY);
            const sinR = Math.sin(currentRotationY);
            const side = sprintFootToggle === 0 ? -0.16 : 0.16;
            const footOffsetX = cosR * side - sinR * 0.18;
            const footOffsetZ = -sinR * side - cosR * 0.18;
            dustSystem?.emitFootfallPuff(
              root.position,
              footOffsetX,
              footOffsetZ,
              currentSurfaceType,
              isSprint
            );
          }
        }
      } else {
        footstepTimer = 0.2;
      }

      // -----------------------------------------------------------------
      // Update Particles (BotW Grounded Dust Trail & Water Splashes)
      // -----------------------------------------------------------------
      if (dustSystem) {
        dustSystem.update(
          dt,
          root.position,
          _currentVel.x,
          _currentVel.z,
          {
            grounded: isGrounded,
            sprinting: currentSpeed > 4.6,
            horizontalSpeed: currentSpeed,
            surface: currentSurfaceType,
          },
          time
        );
      }

      if (scene) {
        // Splash
        for (let i = 0; i < splashCount; i++) {
          const p = splashParticles[i];
          if (p.active) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vy -= 9.8 * dt; // gravity
            p.alpha -= dt * 2.2;

            if (p.alpha <= 0 || p.y < root.position.y) {
              p.active = false;
              p.y = -999;
            }

            pDummy.position.set(p.x, p.y, p.z);
            pDummy.scale.setScalar(p.scale * Math.max(0, p.alpha));
            pDummy.updateMatrix();
            splashMesh.setMatrixAt(i, pDummy.matrix);
          } else {
            pDummy.position.set(0, -999, 0);
            pDummy.scale.setScalar(0.001);
            pDummy.updateMatrix();
            splashMesh.setMatrixAt(i, pDummy.matrix);
          }
        }
        splashMesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: () => {
      mixer.stopAllAction();
      dustSystem?.dispose();
      root.userData.heroRig?.dispose();
      if (scene) {
        scene.remove(splashMesh);
      }
      splashGeo.dispose();
      splashMat.dispose();
    },
  };
}

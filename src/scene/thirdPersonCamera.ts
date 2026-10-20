import * as THREE from 'three';
import { getTerrainHeight } from './terrain';
import { GAME_FEEL } from './gameFeel';

export interface ThirdPersonCamera {
  camera: THREE.PerspectiveCamera;
  yaw: number;
  pitch: number;
  distance: number;
  isCinematic: boolean;
  setCinematic: (enabled: boolean) => void;
  onPointerDrag: (deltaX: number, deltaY: number) => void;
  onZoom: (deltaZoom: number) => void;
  addTrauma: (amount: number) => void;
  update: (
    delta: number,
    characterPos: THREE.Vector3,
    timelineTime: number,
    characterSpeed?: number,
    characterHeading?: number,
    characterVelocity?: THREE.Vector3,
    characterGrounded?: boolean,
    characterVerticalSpeed?: number,
    courseAnticipation?: number
  ) => void;
}

const _camTarget = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _travelDirection = new THREE.Vector3();
const _idealPos = new THREE.Vector3();
const _currentPos = new THREE.Vector3();
const _shakeOffset = new THREE.Vector3();

/** Signed shortest angular difference from `from` to `to`, in radians. */
function shortestAngleDelta(to: number, from: number): number {
  const fullTurn = Math.PI * 2;
  return ((to - from + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

export function createThirdPersonCamera(
  camera: THREE.PerspectiveCamera,
  initialTarget: THREE.Vector3
): ThirdPersonCamera {
  // Comfortable third-person defaults: 5.2m back, ~17 degrees elevation
  let targetYaw = 0.0;
  let currentYaw = 0.0;
  let targetPitch = 0.28;
  let currentPitch = 0.28;
  let targetDistance = 5.2;
  let currentDistance = 5.2;

  let isCinematic = false;
  let trauma = 0.0;
  // Manual orbit always wins for a short grace period. This prevents auto-follow
  // from fighting touch/mouse input while still allowing the camera to recover.
  let manualOrbitCooldown = 0;
  let hasInitializedLookTarget = false;

  // Initialize camera
  camera.fov = 45.0;
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();

  _camTarget.copy(initialTarget).add(new THREE.Vector3(0, 1.25, 0));
  _desiredTarget.copy(_camTarget);
  hasInitializedLookTarget = true;
  _currentPos.set(
    _camTarget.x + Math.sin(currentYaw) * Math.cos(currentPitch) * currentDistance,
    _camTarget.y + Math.sin(currentPitch) * currentDistance,
    _camTarget.z + Math.cos(currentYaw) * Math.cos(currentPitch) * currentDistance
  );
  camera.position.copy(_currentPos);
  camera.lookAt(_camTarget);

  return {
    camera,
    get yaw() {
      return currentYaw;
    },
    set yaw(v: number) {
      targetYaw = v;
      currentYaw = v;
      manualOrbitCooldown = 0;
    },
    get pitch() {
      return currentPitch;
    },
    set pitch(v: number) {
      targetPitch = v;
      currentPitch = v;
    },
    get distance() {
      return currentDistance;
    },
    set distance(v: number) {
      targetDistance = v;
      currentDistance = v;
    },
    get isCinematic() {
      return isCinematic;
    },
    setCinematic: (enabled: boolean) => {
      isCinematic = enabled;
    },
    addTrauma: (amount: number) => {
      trauma = Math.min(0.35, trauma + amount * 0.4);
    },
    onPointerDrag: (deltaX: number, deltaY: number) => {
      isCinematic = false;
      manualOrbitCooldown = 2.0;
      // Controlled, smooth manual orbit sensitivity
      targetYaw -= deltaX * 0.0035;
      targetPitch = THREE.MathUtils.clamp(targetPitch + deltaY * 0.0028, 0.05, 0.85);
    },
    onZoom: (deltaZoom: number) => {
      isCinematic = false;
      targetDistance = THREE.MathUtils.clamp(targetDistance + deltaZoom * 0.003, 3.5, 8.5);
    },
    update: (
      delta: number,
      characterPos: THREE.Vector3,
      _timelineTime: number,
      characterSpeed = 0,
      characterHeading?: number,
      characterVelocity?: THREE.Vector3,
      characterGrounded = true,
      characterVerticalSpeed = 0,
      courseAnticipation = 0
    ) => {
      const dt = THREE.MathUtils.clamp(delta, 0.001, 0.05);
      manualOrbitCooldown = Math.max(0, manualOrbitCooldown - dt);

      const horizontalVelocity = characterVelocity
        ? Math.hypot(characterVelocity.x, characterVelocity.z)
        : 0;
      const travelSpeed = Math.max(characterSpeed, horizontalVelocity);

      // Prefer measured velocity when it is meaningful; fall back to the model's
      // heading for the take-off apex, brief stops, and controllers without velocity.
      if (characterVelocity && horizontalVelocity > 0.8) {
        _travelDirection.set(characterVelocity.x, 0, characterVelocity.z).normalize();
      } else if (characterHeading !== undefined && Number.isFinite(characterHeading)) {
        _travelDirection.set(Math.sin(characterHeading), 0, Math.cos(characterHeading));
      } else {
        _travelDirection.set(-Math.sin(currentYaw), 0, -Math.cos(currentYaw));
      }

      // The camera sits behind the travel direction. Limit automatic yaw speed so
      // strafing/reversals cannot whip the view around, and let manual orbit take priority.
      if (manualOrbitCooldown <= 0 && travelSpeed > 2.6 && characterHeading !== undefined) {
        const desiredYaw = Math.atan2(_travelDirection.x, _travelDirection.z) + Math.PI;
        const yawError = shortestAngleDelta(desiredYaw, targetYaw);
        const autoResponse = 1 - Math.exp(-1.35 * dt);
        const maxAutoTurn = 1.15 * dt;
        targetYaw += THREE.MathUtils.clamp(yawError * autoResponse, -maxAutoTurn, maxAutoTurn);
      }

      currentYaw += shortestAngleDelta(targetYaw, currentYaw) * (1 - Math.exp(-GAME_FEEL.cameraYawResponse * dt));
      currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 16.0, dt);
      currentDistance = THREE.MathUtils.damp(currentDistance, targetDistance, 14.0, dt);

      // Velocity-aware look-ahead makes the route visible before the knight reaches it.
      // Keep the offset bounded, and damp the focus independently to avoid jitter.
      const anticipation = THREE.MathUtils.clamp(courseAnticipation, 0, 1);
      const lookAheadDistance = THREE.MathUtils.clamp(travelSpeed * GAME_FEEL.cameraSpeedLookAheadSeconds, 0, GAME_FEEL.cameraMaxLookAheadMetres) + anticipation * 0.5;
      _desiredTarget.set(
        characterPos.x + _travelDirection.x * lookAheadDistance,
        characterPos.y + 1.25 + (!characterGrounded
          ? THREE.MathUtils.clamp(characterVerticalSpeed * 0.035, -0.18, 0.28)
          : 0) + anticipation * 0.22,
        characterPos.z + _travelDirection.z * lookAheadDistance
      );
      if (!hasInitializedLookTarget) {
        _camTarget.copy(_desiredTarget);
        hasInitializedLookTarget = true;
      } else {
        _camTarget.lerp(_desiredTarget, 1 - Math.exp(-GAME_FEEL.cameraLookTargetResponse * dt));
      }
      const targetLook = _camTarget;

      const cosPitch = Math.cos(currentPitch);
      const sinPitch = Math.sin(currentPitch);
      const sinYaw = Math.sin(currentYaw);
      const cosYaw = Math.cos(currentYaw);

      // Terrain line-of-sight safety: softly shorten distance if terrain rises behind camera
      let safeDist = currentDistance;
      const testSteps = 6;
      for (let s = 1; s <= testSteps; s++) {
        const u = s / testSteps;
        const testD = currentDistance * u;
        const testX = targetLook.x + sinYaw * cosPitch * testD;
        const testY = targetLook.y + sinPitch * testD;
        const testZ = targetLook.z + cosYaw * cosPitch * testD;
        const groundH = getTerrainHeight(testX, testZ);
        if (testY < groundH + 0.45) {
          safeDist = Math.max(1.1, (currentDistance * (s - 1)) / testSteps);
          break;
        }
      }

      _idealPos.set(
        targetLook.x + sinYaw * cosPitch * safeDist,
        targetLook.y + sinPitch * safeDist,
        targetLook.z + cosYaw * cosPitch * safeDist
      );

      // Keep camera safely above ground
      const groundAtCam = getTerrainHeight(_idealPos.x, _idealPos.z);
      if (_idealPos.y < groundAtCam + 0.55) {
        _idealPos.y = groundAtCam + 0.55;
      }

      // Restrained landing shake
      if (trauma > 0.001) {
        const shake = trauma * trauma * 0.1;
        _shakeOffset.set(
          (Math.random() - 0.5) * shake,
          (Math.random() - 0.5) * shake,
          (Math.random() - 0.5) * shake
        );
        trauma = THREE.MathUtils.damp(trauma, 0, 10.0, dt);
      } else {
        _shakeOffset.set(0, 0, 0);
      }

      // Exponential smoothing is frame-rate independent and remains stable after hitches.
      _currentPos.lerp(_idealPos, 1 - Math.exp(-GAME_FEEL.cameraFollowResponse * dt));

      // FOV is intentionally fixed at initialization; do not rebuild the projection
      // matrix every frame when no projection parameter has changed.
      camera.position.copy(_currentPos).add(_shakeOffset);
      camera.lookAt(targetLook);
    },
  };
}

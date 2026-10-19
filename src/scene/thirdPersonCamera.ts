import * as THREE from 'three';
import { getTerrainHeight } from './terrain';

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
  update: (delta: number, characterPos: THREE.Vector3, timelineTime: number, characterSpeed?: number, characterHeading?: number) => void;
}

const _camTarget = new THREE.Vector3();
const _idealPos = new THREE.Vector3();
const _currentPos = new THREE.Vector3();
const _shakeOffset = new THREE.Vector3();

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

  // Initialize camera
  camera.fov = 45.0;
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();

  _camTarget.copy(initialTarget).add(new THREE.Vector3(0, 1.25, 0));
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
      _characterSpeed = 0,
      _characterHeading?: number
    ) => {
      // Stable, comfortable damping: NO autonomous orbiting or forced rotation
      const dt = THREE.MathUtils.clamp(delta, 0.001, 0.05);

      currentYaw = THREE.MathUtils.damp(currentYaw, targetYaw, 16.0, dt);
      currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 16.0, dt);
      currentDistance = THREE.MathUtils.damp(currentDistance, targetDistance, 14.0, dt);

      // Stable focus point on knight upper torso
      const targetLook = _camTarget.set(characterPos.x, characterPos.y + 1.25, characterPos.z);

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
          safeDist = Math.max(3.0, (currentDistance * (s - 1)) / testSteps);
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

      // Direct, smooth follow without rubber-banding
      _currentPos.lerp(_idealPos, Math.min(1.0, dt * 14.0));

      // Stable horizon and fixed 45 degree FOV
      camera.fov = 45.0;
      camera.position.copy(_currentPos).add(_shakeOffset);
      camera.lookAt(targetLook);
      camera.updateProjectionMatrix();
    },
  };
}

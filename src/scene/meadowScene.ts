import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MeadowSceneController, MovementInput } from '../types';
import { getTerrainHeight, SAFE_RESPAWN } from './terrain';
import { createEnvironment } from './environment';
import { createGrassSystem } from './grassSystem';
import { createDandelionSystem, type DandelionSystem } from './dandelionSystem';
import { createCloudSystem, type CloudSystem } from './cloudSystem';
import { createCharacterController, type CharacterController } from './characterController';
import { createThirdPersonCamera, type ThirdPersonCamera } from './thirdPersonCamera';
import { createHeroKnight } from './heroCharacter';

const ASSETS = {
  warrior: 'https://cdn.cinevva.com/assets/packs/quaternius/ultimate-animated-characters/Knight_Male.glb?download=1',
};

interface SceneCallbacks {
  onStatusChange?: (status: string, isReady?: boolean) => void;
  onError?: (errorText: string | null) => void;
}

export function initMeadowScene(
  container: HTMLDivElement,
  callbacks: SceneCallbacks
): MeadowSceneController {
  const { onStatusChange } = callbacks;

  // Renderer setup with ACESFilmicToneMapping and PCFSoftShadowMap
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // Luminous Studio Ghibli summer azure sky & soft atmospheric horizon fog (IMG_0919 & IMG_0920 palette)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3ea4ed');
  scene.fog = new THREE.Fog('#7ec2ea', 55, 165);

  // Procedural studio environment map reflection for authentic PBR metals and water
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
  scene.environment = environmentTarget.texture;
  // PMREMGenerator can be released after baking, but the target owns the texture
  // still used by the scene and must remain alive until scene teardown.
  pmremGenerator.dispose();
  roomEnvironment.dispose();

  // Camera setup
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 190);

  // Lighting: Cool Sky Hemisphere Fill + Warm Golden Key Sun + Rim Light (Ghibli Daylight State)
  const hemiLight = new THREE.HemisphereLight('#6cb6f8', '#428b34', 2.1);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight('#fff6dc', 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1.0;
  sun.shadow.camera.far = 85;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const rimLight = new THREE.DirectionalLight('#bde8ff', 0.95);
  rimLight.position.set(8, 7, -10);
  scene.add(rimLight);

  // 1. Build Inhabited Environment (Brook, bridge, campfire, Windrise oak, artist knoll)
  const environment = createEnvironment(scene);

  // Authored, terrain-following course ribbon: readable route edges, shortcut and checkpoints.
  const course = createCourseVisuals(scene);

  // 2. Build Interactive Grass & Wildflowers (GPU wind + character deformation)
  const grassSystem = createGrassSystem(scene);

  // 3. Delicate Dandelion System (Floating Pappus + Field Clocks)
  const dandelionSystem: DandelionSystem = createDandelionSystem(scene);

  // 4. Authored Painterly Ghibli Cumulus Cloud Formations
  const cloudSystem: CloudSystem = createCloudSystem(scene);

  // 5. Hero Character Controller Setup (Spawned immediately on campsite path)
  const initialKnightPos = new THREE.Vector3(
    SAFE_RESPAWN.x,
    getTerrainHeight(SAFE_RESPAWN.x, SAFE_RESPAWN.z),
    SAFE_RESPAWN.z
  );

  // Instantly create and mount the Ghibli Cel-Shaded Adventurer Knight
  const heroKnight = createHeroKnight();
  heroKnight.group.position.copy(initialKnightPos);
  heroKnight.group.rotation.y = SAFE_RESPAWN.rotY;
  heroKnight.group.userData.heroRig = heroKnight;
  scene.add(heroKnight.group);

  const thirdPersonCam: ThirdPersonCamera = createThirdPersonCamera(camera, initialKnightPos);

  let characterController: CharacterController = createCharacterController(
    heroKnight.group,
    [],
    scene,
    {
      onDeathState: (isDead, reason) => {
        if (isDead && reason) {
          onStatusChange?.(reason, false);
        }
      },
      onImpact: (trauma) => {
        thirdPersonCam.addTrauma(trauma);
      },
    }
  );

  onStatusChange?.('The knight is ready for exploration.', true);

  // Scene lifetime is established before any asynchronous asset request. A late GLTF
  // callback must never attach objects or create a controller after dispose().
  let paused = false;
  let animId = 0;
  let destroyed = false;

  // Dispose only resources owned by a rejected/late GLTF payload. GLTF materials may
  // share textures, so collect resources in sets to avoid duplicate dispose calls.
  function disposeLoadedGltf(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) {
            textures.add(value as THREE.Texture);
          }
        }
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }

  // Optional background enhancement: if external Quaternius GLTF is available & permitted
  const loader = new GLTFLoader();
  loader.load(
    ASSETS.warrior,
    (gltf) => {
      const root = gltf.scene;
      // Loading can finish after React unmounts the scene. Do not resurrect a disposed
      // renderer/controller tree; release the payload immediately instead.
      if (destroyed) {
        disposeLoadedGltf(root);
        return;
      }
      try {
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        if (!Number.isFinite(size.y) || size.y < 0.05) {
          disposeLoadedGltf(root);
          return;
        }

        // Wrap in properly offset child pivot so box.min.y is never submerged
        const targetHeight = 2.15;
        const scaleFactor = targetHeight / size.y;
        const pivotWrapper = new THREE.Group();
        pivotWrapper.name = 'GLTF_Knight_Pivot';

        root.scale.multiplyScalar(scaleFactor);
        root.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

        root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const mesh = o as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              const material = mesh.material as THREE.MeshStandardMaterial;
              material.roughness = Math.max(0.42, material.roughness ?? 0.65);
              material.metalness = Math.min(0.85, material.metalness ?? 0.2);
              material.flatShading = true;
              material.needsUpdate = true;
            }
          }
        });

        pivotWrapper.add(root);
        pivotWrapper.position.copy(characterController.position);
        pivotWrapper.rotation.copy(characterController.model.rotation);

        // Seamlessly hot-swap to the animated GLTF model while preserving current position & state
        const oldPos = characterController.position.clone();
        const oldRotY = heroKnight.group.rotation.y;

        scene.remove(heroKnight.group);
        scene.add(pivotWrapper);

        characterController.dispose();
        characterController = createCharacterController(
          pivotWrapper,
          gltf.animations || [],
          scene,
          {
            onDeathState: (isDead, reason) => {
              if (isDead && reason) {
                onStatusChange?.(reason, false);
              }
            },
            onImpact: (trauma) => {
              thirdPersonCam.addTrauma(trauma);
            },
          }
        );
        characterController.model.position.copy(oldPos);
        characterController.model.rotation.y = oldRotY;
      } catch (e) {
        // Fallback procedural knight remains active flawlessly
      }
    },
    undefined,
    () => {
      // Offline/CDN fallback: procedural knight remains active with 100% functionality
    }
  );

  // Runtime State
  const clock = new THREE.Clock();

  let movementInput: MovementInput = { x: 0, y: 0, sprint: false, jump: false };
  let isCameraDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let cameraPointerId: number | null = null;

  // Animation & Physics Loop
  function frame(now: number) {
    if (destroyed) return;
    animId = requestAnimationFrame(frame);

    const delta = Math.min(clock.getDelta(), 0.05);
    const timeInSeconds = now * 0.001;

    // 1. Update Inhabited Environment (Stream ripples, campfire flicker)
    if (!paused) {
      environment.update(timeInSeconds);
    }

    // 2. Update Character Movement, Directional Shadow Tracking & Camera
    if (characterController && !paused) {
      characterController.update(delta, movementInput, thirdPersonCam.yaw, timeInSeconds);

      sun.position.set(
        characterController.position.x - 13,
        characterController.position.y + 20,
        characterController.position.z + 11
      );
      sun.target.position.copy(characterController.position);
      sun.target.updateMatrixWorld();

      grassSystem.update(timeInSeconds, characterController.position, delta);

      thirdPersonCam.update(
        delta,
        characterController.position,
        timeInSeconds,
        characterController.speed,
        characterController.model.rotation.y,
        characterController.velocity,
        characterController.isGrounded,
        characterController.verticalSpeed
      );
    } else {
      sun.position.set(initialKnightPos.x - 13, initialKnightPos.y + 20, initialKnightPos.z + 11);
      sun.target.position.copy(initialKnightPos);
      sun.target.updateMatrixWorld();

      thirdPersonCam.update(delta, initialKnightPos, timeInSeconds, 0);
      grassSystem.update(timeInSeconds, initialKnightPos, delta);
    }

    // 3. Animate Dandelions & Sky Clouds
    if (!paused) {
      dandelionSystem.update(timeInSeconds, delta, characterController ? characterController.position : undefined);
      cloudSystem.update(timeInSeconds, delta);
    }

    // 4. Render
    renderer.render(scene, camera);
  }

  animId = requestAnimationFrame(frame);

  // Resize handler
  function onResize() {
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 700 ? 1 : 1.35));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize, { passive: true });

  // -----------------------------------------------------------------
  // Independent Camera Dragging & Multitouch Partitioning
  // -----------------------------------------------------------------
  const dom = renderer.domElement;

  function onPointerDown(e: PointerEvent) {
    // Touch exclusion zones:
    // 1. Left joystick zone: clientX < 45% and clientY > 45%
    if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.45 && e.clientY > window.innerHeight * 0.45) {
      return;
    }
    // 2. Right action controls cluster: clientX > 65% and clientY > 55%
    if (e.pointerType === 'touch' && e.clientX > window.innerWidth * 0.65 && e.clientY > window.innerHeight * 0.55) {
      return;
    }

    if (cameraPointerId === null) {
      cameraPointerId = e.pointerId;
      isCameraDragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (isCameraDragging && e.pointerId === cameraPointerId) {
      const deltaX = e.clientX - lastPointerX;
      const deltaY = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      thirdPersonCam.onPointerDrag(deltaX, deltaY);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId === cameraPointerId) {
      isCameraDragging = false;
      cameraPointerId = null;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    thirdPersonCam.onZoom(e.deltaY);
  }

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  dom.addEventListener('wheel', onWheel, { passive: false });

  // -----------------------------------------------------------------
  // Desktop Keyboard Navigation
  // -----------------------------------------------------------------
  const keyState: Record<string, boolean> = {};

  function updateKeyboardMovement() {
    let x = 0;
    let y = 0;
    if (keyState['KeyW'] || keyState['ArrowUp']) y += 1;
    if (keyState['KeyS'] || keyState['ArrowDown']) y -= 1;
    if (keyState['KeyA'] || keyState['ArrowLeft']) x -= 1;
    if (keyState['KeyD'] || keyState['ArrowRight']) x += 1;

    const sprint = !!keyState['ShiftLeft'] || !!keyState['ShiftRight'];
    const jump = !!keyState['Space'];

    const len = Math.hypot(x, y);
    if (len > 0) {
      x /= len;
      y /= len;
    }

    movementInput = { x, y, sprint, jump };
  }

  function onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    keyState[e.code] = true;
    // Jump is dispatched from the input edge in the controller update loop;
    // calling triggerJump here as well would double-submit the same press.
    if (e.code === 'KeyC') {
      characterController?.triggerRoll();
    } else if (e.code === 'KeyV') {
      characterController?.triggerEmote();
    }
    updateKeyboardMovement();
  }

  function onKeyUp(e: KeyboardEvent) {
    keyState[e.code] = false;
    updateKeyboardMovement();
  }

  function onBlur() {
    for (const k in keyState) keyState[k] = false;
    movementInput = { x: 0, y: 0, sprint: false, jump: false };
    isCameraDragging = false;
    cameraPointerId = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    setInput: (input: MovementInput) => {
      movementInput = input;
    },
    onPointerDrag: (deltaX: number, deltaY: number) => {
      thirdPersonCam.onPointerDrag(deltaX, deltaY);
    },
    onZoom: (deltaZoom: number) => {
      thirdPersonCam.onZoom(deltaZoom);
    },
    toggleCinematic: () => {
      thirdPersonCam.setCinematic(!thirdPersonCam.isCinematic);
      return thirdPersonCam.isCinematic;
    },
    isCinematic: () => thirdPersonCam.isCinematic,
    isPaused: () => paused,
    togglePause: () => {
      paused = !paused;
      return paused;
    },
    triggerJump: () => {
      characterController?.triggerJump();
    },
    triggerRoll: () => {
      characterController?.triggerRoll();
    },
    triggerEmote: () => {
      characterController?.triggerEmote();
    },
    restart: () => {
      if (characterController) {
        characterController.respawn();
      }
      thirdPersonCam.yaw = 0;
      thirdPersonCam.pitch = 0.28;
      thirdPersonCam.distance = 5.2;
      thirdPersonCam.setCinematic(false);
    },
    dispose: () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('wheel', onWheel);

      characterController?.dispose();
      grassSystem.dispose();
      dandelionSystem.dispose();
      cloudSystem.dispose();
      environment.dispose();
      course.dispose();
      scene.environment = null;
      environmentTarget.dispose();
      renderer.dispose();

      if (container.contains(dom)) {
        container.removeChild(dom);
      }
    },
  };
}


/**
 * A coherent, readable starter course inspired by fast 3D platformers:
 * a continuous running lane, a clearly differentiated shortcut, and warm
 * checkpoint rings. Geometry samples the same terrain-height function as
 * gameplay; no unsupported floating platforms are drawn.
 */
function createCourseVisuals(scene: THREE.Scene): { dispose: () => void } {
  const root = new THREE.Group();
  root.name = 'Wild Meadow • running course';
  scene.add(root);

  const laneMat = new THREE.MeshStandardMaterial({ color: '#e8d8ad', roughness: 0.88, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#287e78', roughness: 0.64, side: THREE.DoubleSide });
  const dashMat = new THREE.MeshStandardMaterial({ color: '#e5a94f', roughness: 0.68, metalness: 0.12 });
  const shortcutMat = new THREE.MeshStandardMaterial({ color: '#8bc9bd', roughness: 0.72, side: THREE.DoubleSide });
  const ringMat = new THREE.MeshStandardMaterial({
    color: '#f0bd55', emissive: '#5a3510', emissiveIntensity: 0.22, roughness: 0.34, metalness: 0.58,
  });
  const ownedGeometries = new Set<THREE.BufferGeometry>();

  type Point = readonly [number, number];
  const main: Point[] = [
    [5.5, -1], [9.5, -2.8], [14.5, -5], [19.5, -7.8], [24.5, -9],
    [29.5, -6.5], [32, -1], [33, 5.5], [31.5, 11.5], [29, 17.5],
    [24, 22.5], [18, 25], [12, 25.5], [7, 24.5],
  ];
  const shortcut: Point[] = [[19.5, -7.8], [21, -4.8], [24, -2], [28.5, 0.8], [32, 5.5]];

  const makeCurve = (points: Point[]) => new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.35,
  );

  const addRibbon = (curve: THREE.CatmullRomCurve3, halfWidth: number, material: THREE.Material, offset = 0) => {
    const divisions = Math.max(24, Math.ceil(curve.getLength() / 0.42));
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= divisions; i++) {
      const p = curve.getPoint(i / divisions);
      const tangent = curve.getTangent(i / divisions);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      p.y = getTerrainHeight(p.x, p.z) + 0.075;
      for (const sign of [-1, 1]) {
        const x = p.x + side.x * (offset + sign * halfWidth);
        const z = p.z + side.z * (offset + sign * halfWidth);
        positions.push(x, getTerrainHeight(x, z) + 0.075, z);
      }
      if (i < divisions) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'Course • terrain-conforming ribbon';
    root.add(mesh);
  };

  const addDashes = (curve: THREE.CatmullRomCurve3) => {
    const length = curve.getLength();
    const geometry = new THREE.BoxGeometry(0.075, 0.025, 0.62);
    ownedGeometries.add(geometry);
    for (let distance = 1.8; distance < length - 1.2; distance += 2.8) {
      const t = distance / length;
      const p = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      p.y = getTerrainHeight(p.x, p.z) + 0.105;
      const dash = new THREE.Mesh(geometry, dashMat);
      dash.position.copy(p);
      dash.rotation.y = Math.atan2(tangent.x, tangent.z);
      dash.name = 'Course • center marker';
      root.add(dash);
    }
  };

  const mainCurve = makeCurve(main);
  const shortcutCurve = makeCurve(shortcut);
  addRibbon(mainCurve, 1.45, laneMat);
  addRibbon(mainCurve, 0.105, edgeMat, -1.345);
  addRibbon(mainCurve, 0.105, edgeMat, 1.345);
  addDashes(mainCurve);
  addRibbon(shortcutCurve, 1.15, shortcutMat);
  addRibbon(shortcutCurve, 0.09, edgeMat, -1.06);
  addRibbon(shortcutCurve, 0.09, edgeMat, 1.06);
  addDashes(shortcutCurve);

  const addRing = (curve: THREE.CatmullRomCurve3, t: number, name: string) => {
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.095, 10, 28), ringMat);
    ownedGeometries.add(ring.geometry);
    ring.name = name;
    ring.position.set(p.x, getTerrainHeight(p.x, p.z) + 1.45, p.z);
    ring.rotation.y = Math.atan2(tangent.x, tangent.z);
    ring.castShadow = true;
    root.add(ring);
  };
  addRing(mainCurve, 0.12, 'Course • entry ring');
  addRing(shortcutCurve, 0.52, 'Course • shortcut ring');
  addRing(mainCurve, 0.94, 'Course • vista ring');

  return {
    dispose: () => {
      scene.remove(root);
      ownedGeometries.forEach((geometry) => geometry.dispose());
      laneMat.dispose();
      edgeMat.dispose();
      dashMat.dispose();
      shortcutMat.dispose();
      ringMat.dispose();
    },
  };
}

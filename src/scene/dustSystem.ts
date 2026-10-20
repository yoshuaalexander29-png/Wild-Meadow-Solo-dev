import * as THREE from 'three';
import type { SurfaceType } from './terrain';

/**
 * Breath of the Wild-Inspired Grounded Sprint Dust Trail System
 *
 * Implements the 3-layer responsive ground-contact VFX model:
 *  1. Footfall Puffs: Small, irregular bursts released when a foot contacts the ground.
 *  2. Trailing Dust: Faint particles left behind during sustained sprinting, with momentum
 *     and a slight lateral spread (distance-accumulator driven).
 *  3. Ground Interaction: Particles inherit the ground's color family (warm beige on dry dirt,
 *     muted olive-green on dry grass, stone dust on rock) and fade as they rise.
 *
 * Architecture:
 *  - Fixed-size particle pool (48 particles) avoiding GC allocations during sprint.
 *  - Small atlas of 4 hand-authored irregular, stylized cloudlet/puff contours.
 *  - State-driven: uses actual movement state and ground contact.
 */

export interface DustContext {
  grounded: boolean;
  sprinting: boolean;
  horizontalSpeed: number;
  surface: SurfaceType;
}

export const canEmitSprintDust = (s: DustContext): boolean =>
  s.grounded &&
  s.sprinting &&
  s.horizontalSpeed > 0.1 &&
  (s.surface === 'grass' || s.surface === 'dirt');

export interface DustSystem {
  group: THREE.Group;
  update: (
    delta: number,
    charPos: THREE.Vector3,
    moveDirX: number,
    moveDirZ: number,
    context: DustContext,
    time: number
  ) => void;
  emitFootfallPuff: (
    charPos: THREE.Vector3,
    footOffsetX: number,
    footOffsetZ: number,
    surface: SurfaceType,
    isSprinting: boolean
  ) => void;
  emitImpactPuff: (
    charPos: THREE.Vector3,
    surface: SurfaceType,
    impactSpeed: number
  ) => void;
  reset: () => void;
  dispose: () => void;
}

interface PooledDustParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  baseScale: number;
  maxScale: number;
  rotSpeed: number;
  peakOpacity: number;
  active: boolean;
}

/**
 * Creates 4 distinct irregular stylized dust puff textures in a single canvas atlas.
 * Rejects repeated spheres in favor of soft-edged multi-lobed cloudlet contours.
 */
function createDustTextureAtlas(): THREE.CanvasTexture[] {
  const tileSize = 128;
  const canvas = document.createElement('canvas');
  canvas.width = tileSize * 2;
  canvas.height = tileSize * 2;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 4 distinct authored puff lobe sets
    const puffVariants = [
      // Variant 0: Asymmetric 5-lobe billow
      {
        cx: 64,
        cy: 64,
        lobes: [
          { dx: 0, dy: 0, r: 38 },
          { dx: -14, dy: 6, r: 28 },
          { dx: 16, dy: 4, r: 26 },
          { dx: -8, dy: -14, r: 24 },
          { dx: 12, dy: -12, r: 22 },
        ],
      },
      // Variant 1: Stepped wind-swept curl puff
      {
        cx: 192,
        cy: 64,
        lobes: [
          { dx: -4, dy: 2, r: 36 },
          { dx: -18, dy: -4, r: 26 },
          { dx: 14, dy: 8, r: 24 },
          { dx: 8, dy: -16, r: 22 },
          { dx: -12, dy: 14, r: 20 },
        ],
      },
      // Variant 2: 4-lobe asymmetrical burst puff
      {
        cx: 64,
        cy: 192,
        lobes: [
          { dx: 2, dy: -2, r: 38 },
          { dx: -16, dy: 8, r: 26 },
          { dx: 16, dy: -8, r: 24 },
          { dx: 8, dy: 14, r: 24 },
          { dx: -8, dy: -16, r: 20 },
        ],
      },
      // Variant 3: Delicate airy 3-lobe drift puff
      {
        cx: 192,
        cy: 192,
        lobes: [
          { dx: 0, dy: 0, r: 34 },
          { dx: -14, dy: -6, r: 24 },
          { dx: 12, dy: 8, r: 22 },
          { dx: 4, dy: -12, r: 18 },
        ],
      },
    ];

    puffVariants.forEach(({ cx, cy, lobes }) => {
      lobes.forEach(({ dx, dy, r }) => {
        const x = cx + dx;
        const y = cy + dy;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.65)');
        grad.addColorStop(0.82, 'rgba(255, 255, 255, 0.18)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  // Create 4 distinct sub-textures sharing the atlas canvas
  const textures: THREE.CanvasTexture[] = [];
  const uvs = [
    { u: 0, v: 0.5 },
    { u: 0.5, v: 0.5 },
    { u: 0, v: 0 },
    { u: 0.5, v: 0 },
  ];

  uvs.forEach(({ u, v }) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.offset.set(u, v);
    tex.repeat.set(0.5, 0.5);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textures.push(tex);
  });

  return textures;
}

export function createDustSystem(scene: THREE.Scene): DustSystem {
  const group = new THREE.Group();
  scene.add(group);
  let isDisposed = false;

  const atlasTextures = createDustTextureAtlas();

  // Pure Neutral White Color for Stylized Anime / Ghibli / BotW Dust Puffs
  const WHITE_DUST_COLOR = new THREE.Color('#ffffff');

  // 4 Shared Materials corresponding to the 4 atlas variants
  // toneMapped = false guarantees crisp, radiant white without ACES curve tinting
  const spriteMaterials = atlasTextures.map((tex) =>
    new THREE.SpriteMaterial({
      map: tex,
      color: WHITE_DUST_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
  );

  // Fixed Particle Pool (48 particles)
  const poolSize = 48;
  const particles: PooledDustParticle[] = [];

  for (let i = 0; i < poolSize; i++) {
    const mat = spriteMaterials[i % spriteMaterials.length].clone();
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.position.set(0, -999, 0);
    group.add(sprite);

    particles.push({
      sprite,
      velocity: new THREE.Vector3(),
      age: 0,
      lifetime: 0.6,
      baseScale: 0.35,
      maxScale: 0.85,
      rotSpeed: 0,
      peakOpacity: 0.65,
      active: false,
    });
  }

  // Distance accumulator for frame-rate independent sprint trailing emission
  let distanceAccumulator = 0;
  const emissionSpacing = 0.46; // emit trailing particle every ~0.46m
  let trailingFootToggle = 0;
  const lastPosition = new THREE.Vector3();
  let hasValidLastPos = false;

  function spawnParticle(
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    initialScale: number,
    maxScale: number,
    lifetime: number,
    velX: number,
    velY: number,
    velZ: number,
    peakOpacity = 0.65
  ) {
    for (let i = 0; i < poolSize; i++) {
      const p = particles[i];
      if (!p.active) {
        p.active = true;
        p.age = 0;
        p.lifetime = lifetime;
        p.baseScale = initialScale;
        p.maxScale = maxScale;
        p.peakOpacity = peakOpacity;
        p.rotSpeed = (Math.random() - 0.5) * 1.6;

        p.velocity.set(velX, velY, velZ);

        p.sprite.position.set(x, y, z);
        p.sprite.scale.setScalar(initialScale);
        p.sprite.material.color.copy(color);
        p.sprite.material.opacity = peakOpacity;
        p.sprite.material.rotation = Math.random() * Math.PI * 2;
        p.sprite.visible = true;
        break;
      }
    }
  }

  function getSurfaceColor(_surface: SurfaceType): THREE.Color {
    return WHITE_DUST_COLOR;
  }

  return {
    group,
    update: (
      delta: number,
      charPos: THREE.Vector3,
      moveDirX: number,
      moveDirZ: number,
      context: DustContext,
      time: number
    ) => {
      const dt = THREE.MathUtils.clamp(delta, 0.001, 0.05);

      // -------------------------------------------------------------
      // 1. Distance Travelled Calculation & Sprint Dust Trail
      // -------------------------------------------------------------
      if (!hasValidLastPos) {
        lastPosition.copy(charPos);
        hasValidLastPos = true;
      }

      const dx = charPos.x - lastPosition.x;
      const dz = charPos.z - lastPosition.z;
      const horizontalDist = Math.hypot(dx, dz);
      lastPosition.copy(charPos);

      if (canEmitSprintDust(context)) {
        distanceAccumulator += horizontalDist;

        while (distanceAccumulator >= emissionSpacing) {
          distanceAccumulator -= emissionSpacing;
          trailingFootToggle = trailingFootToggle === 0 ? 1 : 0;

          // Trailing foot contact location
          const dirLen = Math.hypot(moveDirX, moveDirZ);
          const dirNormX = dirLen > 0.001 ? moveDirX / dirLen : 0;
          const dirNormZ = dirLen > 0.001 ? moveDirZ / dirLen : 1;

          const perpX = -dirNormZ;
          const perpZ = dirNormX;
          const lateralOffset = trailingFootToggle === 0 ? -0.16 : 0.16;

          // Spawn slightly behind the trailing foot
          const spawnX = charPos.x - dirNormX * 0.28 + perpX * lateralOffset;
          const spawnY = charPos.y + 0.04;
          const spawnZ = charPos.z - dirNormZ * 0.28 + perpZ * lateralOffset;

          // Velocity: momentum away from foot + slight lateral spread + upward lift
          const velX = -dirNormX * 0.45 + perpX * lateralOffset * 1.4 + (Math.random() - 0.5) * 0.18;
          const velY = 0.38 + Math.random() * 0.32;
          const velZ = -dirNormZ * 0.45 + perpZ * lateralOffset * 1.4 + (Math.random() - 0.5) * 0.18;

          const color = getSurfaceColor(context.surface);
          spawnParticle(
            spawnX,
            spawnY,
            spawnZ,
            color,
            0.32 + Math.random() * 0.12,
            0.72 + Math.random() * 0.25,
            0.52 + Math.random() * 0.16,
            velX,
            velY,
            velZ,
            0.62
          );
        }
      } else {
        distanceAccumulator = 0;
      }

      // -------------------------------------------------------------
      // 2. Particle Kinematics & Dissipation (Air Drag, Buoyancy, Wind)
      // -------------------------------------------------------------
      const windX = Math.sin(time * 1.6) * 0.08;
      const windZ = Math.cos(time * 1.2) * 0.06;

      for (let i = 0; i < poolSize; i++) {
        const p = particles[i];
        if (p.active) {
          p.age += dt;
          const t = p.age / p.lifetime;

          if (t >= 1.0) {
            p.active = false;
            p.sprite.visible = false;
            p.sprite.position.set(0, -999, 0);
            continue;
          }

          // Gentle drag deceleration
          p.velocity.x *= Math.pow(0.24, dt);
          p.velocity.z *= Math.pow(0.24, dt);

          // Gentle upward buoyancy draft with terminal limit
          p.velocity.y += (0.12 - p.velocity.y * 2.1) * dt;

          // Wind drift
          p.sprite.position.x += (p.velocity.x + windX) * dt;
          p.sprite.position.y += p.velocity.y * dt;
          p.sprite.position.z += (p.velocity.z + windZ) * dt;

          // Expansion as puff dissipates
          const currentScale = THREE.MathUtils.lerp(p.baseScale, p.maxScale, Math.pow(t, 0.62));
          p.sprite.scale.setScalar(currentScale);

          // Subtle organic rotation
          p.sprite.material.rotation += p.rotSpeed * dt;

          // Soft Gaussian fadeout
          const opacity = Math.sin((1.0 - t) * Math.PI * 0.5) * p.peakOpacity;
          p.sprite.material.opacity = Math.max(0, opacity);
        }
      }
    },

    emitFootfallPuff: (
      charPos: THREE.Vector3,
      footOffsetX: number,
      footOffsetZ: number,
      surface: SurfaceType,
      isSprinting: boolean
    ) => {
      // Never emit dust on water or wooden bridge deck
      if (surface === 'water' || surface === 'wood') return;

      const color = getSurfaceColor(surface);
      const spawnX = charPos.x + footOffsetX;
      const spawnY = charPos.y + 0.03;
      const spawnZ = charPos.z + footOffsetZ;

      const burstCount = isSprinting ? 2 : 1;
      for (let b = 0; b < burstCount; b++) {
        const velX = (Math.random() - 0.5) * 0.35;
        const velY = 0.32 + Math.random() * 0.28;
        const velZ = (Math.random() - 0.5) * 0.35;

        spawnParticle(
          spawnX,
          spawnY,
          spawnZ,
          color,
          isSprinting ? 0.34 : 0.26,
          isSprinting ? 0.68 : 0.52,
          isSprinting ? 0.48 : 0.40,
          velX,
          velY,
          velZ,
          0.58
        );
      }
    },

    emitImpactPuff: (
      charPos: THREE.Vector3,
      surface: SurfaceType,
      impactSpeed: number
    ) => {
      if (surface === 'water' || surface === 'wood') return;

      const count = Math.min(8, Math.max(4, Math.floor(impactSpeed * 1.4)));
      const color = WHITE_DUST_COLOR;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const radialSpeed = 1.0 + Math.random() * 0.75;

        const velX = Math.cos(angle) * radialSpeed;
        const velY = 0.32 + Math.random() * 0.38;
        const velZ = Math.sin(angle) * radialSpeed;

        const spawnX = charPos.x + Math.cos(angle) * 0.16;
        const spawnY = charPos.y + 0.04;
        const spawnZ = charPos.z + Math.sin(angle) * 0.16;

        spawnParticle(
          spawnX,
          spawnY,
          spawnZ,
          color,
          0.36 + Math.random() * 0.14,
          0.78 + Math.random() * 0.28,
          0.56 + Math.random() * 0.18,
          velX,
          velY,
          velZ,
          0.68
        );
      }
    },

    reset: () => {
      distanceAccumulator = 0;
      hasValidLastPos = false;
      for (let i = 0; i < poolSize; i++) {
        const p = particles[i];
        p.active = false;
        p.sprite.visible = false;
        p.sprite.position.set(0, -999, 0);
      }
    },

    dispose: () => {
      if (isDisposed) return;
      isDisposed = true;
      scene.remove(group);
      particles.forEach((p) => {
        p.sprite.material.dispose();
      });
      spriteMaterials.forEach((m) => m.dispose());
      atlasTextures.forEach((t) => t.dispose());
    },
  };
}

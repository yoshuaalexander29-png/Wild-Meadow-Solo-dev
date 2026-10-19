import * as THREE from 'three';
import type { SurfaceType } from './terrain';

/**
 * Authoritative Ground Contact & Movement Mode Contract
 * Serves as the single source of truth for:
 * - BotW-style sprint dust trails
 * - Footstep acoustic feedback
 * - Water splashes and wading effects
 * - Jump takeoff and landing squash/particles
 */
export type MovementMode = 'idle' | 'walk' | 'run' | 'sprint' | 'jump';

export interface GroundContact {
  grounded: boolean;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: SurfaceType;
  horizontalSpeed: number;
  movementMode: MovementMode;
}

export function createEmptyGroundContact(): GroundContact {
  return {
    grounded: true,
    point: new THREE.Vector3(0, 0, 0),
    normal: new THREE.Vector3(0, 1, 0),
    surface: 'grass',
    horizontalSpeed: 0,
    movementMode: 'idle',
  };
}

/**
 * Ground Contact Visualizer (Developer Diagnostic Tool)
 * Completely hidden in normal gameplay.
 * Toggled via query string (?debugContact=true) or pressing Backquote (`~`).
 */
export interface ContactVisualizer {
  group: THREE.Group;
  update: (contact: GroundContact) => void;
  toggle: () => boolean;
  dispose: () => void;
}

export function createGroundContactVisualizer(scene: THREE.Scene): ContactVisualizer {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Ground contact ring marker
  const ringGeo = new THREE.RingGeometry(0.35, 0.42, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#00ff88',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  group.add(ringMesh);

  // Surface normal arrow
  const normalArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 0),
    0.6,
    0x00ff88,
    0.15,
    0.08
  );
  group.add(normalArrow);

  // Check URL query parameter for initial debug state
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debugContact') === 'true') {
      group.visible = true;
    }
  }

  const surfaceColors: Record<SurfaceType, string> = {
    grass: '#44dd44',
    dirt: '#ddaa44',
    stone: '#aaaaaa',
    wood: '#dd7733',
    water: '#00ccff',
  };

  return {
    group,
    update: (contact: GroundContact) => {
      if (!group.visible) return;

      group.position.copy(contact.point);
      normalArrow.setDirection(contact.normal);

      const col = surfaceColors[contact.surface] || '#00ff88';
      ringMat.color.set(col);
      normalArrow.setColor(new THREE.Color(col));

      // Scale ring by speed
      const scale = contact.grounded ? 1.0 + Math.min(1.0, contact.horizontalSpeed / 6.0) * 0.4 : 0.4;
      ringMesh.scale.setScalar(scale);
      ringMat.opacity = contact.grounded ? 0.85 : 0.25;
    },
    toggle: () => {
      group.visible = !group.visible;
      return group.visible;
    },
    dispose: () => {
      scene.remove(group);
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

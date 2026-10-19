import type * as THREE from 'three';

export interface CameraShot {
  t: number;
  p: [number, number, number];
  look: [number, number, number];
  f: number;
}

export interface LoadedCharacter {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  label: string;
}

export interface MovementInput {
  x: number; // -1 to 1 (left to right)
  y: number; // -1 to 1 (backward to forward)
  sprint: boolean;
  jump?: boolean;
}

export interface MeadowSceneController {
  setInput: (input: MovementInput) => void;
  onPointerDrag: (deltaX: number, deltaY: number) => void;
  onZoom: (deltaZoom: number) => void;
  toggleCinematic: () => boolean;
  isCinematic: () => boolean;
  isPaused: () => boolean;
  togglePause: () => boolean;
  restart: () => void;
  respawn?: () => void;
  triggerJump?: () => void;
  triggerAttack?: () => void;
  triggerRoll?: () => void;
  triggerEmote?: () => void;
  onDeathState?: (callback: (isDead: boolean, reason?: string) => void) => void;
  dispose: () => void;
}

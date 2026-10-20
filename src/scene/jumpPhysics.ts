/**
 * Shared vertical jump integrator.
 *
 * Keep the controller and deterministic physics checks on the same update rule.
 * This intentionally preserves Wild Meadow's current apex hang-time behavior.
 */
export const JUMP_GRAVITY = 21.0;
export const JUMP_SPEED = 7.2;
export const JUMP_APEX_GRAVITY_SCALE = 0.65;
export const JUMP_APEX_SPEED_THRESHOLD = 1.8;

export interface VerticalJumpState {
  y: number;
  velocityY: number;
}

/** Advance one controller physics step using its existing semi-implicit Euler rule. */
export function stepVerticalJump(state: VerticalJumpState, deltaSeconds: number): VerticalJumpState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state;

  const apexFactor = Math.abs(state.velocityY) < JUMP_APEX_SPEED_THRESHOLD
    ? JUMP_APEX_GRAVITY_SCALE
    : 1.0;
  const velocityY = state.velocityY - JUMP_GRAVITY * apexFactor * deltaSeconds;
  return {
    y: state.y + velocityY * deltaSeconds,
    velocityY,
  };
}

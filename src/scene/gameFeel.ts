/**
 * Tunable movement and camera-response values for Wild Meadow.
 *
 * Values are in world units (metres), seconds, or inverse seconds as named.
 * Keep game-feel tuning here so controller changes can be compared and tested
 * without hunting through animation, collision, and camera code.
 */
export const GAME_FEEL = Object.freeze({
  // Input forgiveness
  coyoteTimeSeconds: 0.16,
  jumpBufferSeconds: 0.20,

  // Vertical motion
  jumpGravity: 21.0,
  jumpInitialSpeed: 7.2,
  jumpApexHangThreshold: 1.8,
  jumpApexGravityScale: 0.65,
  maxVerticalPhysicsStepSeconds: 1 / 120,

  // Ground movement and air steering (inverse seconds)
  groundAcceleration: 18.0,
  groundBraking: 24.0,
  rollingAcceleration: 5.5,
  airControl: 10.0,
  groundTurnResponse: 18.0,
  bankResponse: 12.0,

  // Camera response
  cameraYawResponse: 16.0,
  cameraFollowResponse: 14.0,
  cameraLookTargetResponse: 7.5,
  cameraMaxLookAheadMetres: 1.8,
  cameraSpeedLookAheadSeconds: 0.20,
});

export interface VerticalMotionStep {
  velocity: number;
  displacement: number;
}

/**
 * Semi-implicit Euler, substepped to 120 Hz. The controller clamps frame delta
 * to 50 ms before calling this function; substeps keep its vertical integration
 * stable within that accepted simulation interval.
 */
export function advanceVerticalMotion(velocity: number, deltaSeconds: number): VerticalMotionStep {
  if (!Number.isFinite(velocity) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { velocity, displacement: 0 };
  }

  let remaining = deltaSeconds;
  let nextVelocity = velocity;
  let displacement = 0;
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, GAME_FEEL.maxVerticalPhysicsStepSeconds);
    const gravityScale = Math.abs(nextVelocity) < GAME_FEEL.jumpApexHangThreshold
      ? GAME_FEEL.jumpApexGravityScale
      : 1;
    nextVelocity -= GAME_FEEL.jumpGravity * gravityScale * dt;
    displacement += nextVelocity * dt;
    remaining -= dt;
  }

  return { velocity: nextVelocity, displacement };
}

/** Exponential response alpha for a time-constant expressed as inverse seconds. */
export function getResponseAlpha(responsePerSecond: number, deltaSeconds: number): number {
  if (!Number.isFinite(responsePerSecond) || responsePerSecond <= 0
    || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  return 1 - Math.exp(-responsePerSecond * deltaSeconds);
}

export interface JumpAssistTimers {
  coyoteTimer: number;
  jumpBufferTimer: number;
  consumeBufferedJump: boolean;
}

/**
 * Advance the controller's coyote/buffer clocks. A buffered press is only
 * consumed on the ground, and not while a roll locks out jumping.
 */
export function updateJumpAssistTimers(
  coyoteTimer: number,
  jumpBufferTimer: number,
  isGrounded: boolean,
  isRolling: boolean,
  deltaSeconds: number,
): JumpAssistTimers {
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const nextCoyoteTimer = isGrounded
    ? GAME_FEEL.coyoteTimeSeconds
    : Math.max(0, coyoteTimer - dt);

  let nextJumpBufferTimer = jumpBufferTimer;
  let consumeBufferedJump = false;
  if (nextJumpBufferTimer > 0) {
    nextJumpBufferTimer = Math.max(0, nextJumpBufferTimer - dt);
    consumeBufferedJump = isGrounded && !isRolling;
  }

  return {
    coyoteTimer: nextCoyoteTimer,
    jumpBufferTimer: nextJumpBufferTimer,
    consumeBufferedJump,
  };
}

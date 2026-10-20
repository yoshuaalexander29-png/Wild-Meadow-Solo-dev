import { getWalkableSurface, type WalkableSurface } from './terrain';
import type { PlatformerCourse } from './platformerCourse';

export type SurfaceResolver = (
  x: number,
  z: number,
  characterY?: number,
  verticalSpeed?: number,
  isGrounded?: boolean,
  previousSurfaceId?: string
) => WalkableSurface;

/**
 * Creates a state-aware walkable surface resolver.
 * Unifies terrain, brook, stepping stones, Spirited Away vermilion bridge,
 * and the 3D multi-level procedural platformer course without circular dependencies.
 */
export function createSurfaceResolver(course?: PlatformerCourse | null): SurfaceResolver {
  return (
    x: number,
    z: number,
    characterY?: number,
    verticalSpeed?: number,
    isGrounded?: boolean,
    previousSurfaceId?: string
  ): WalkableSurface => {
    // 1. If course is present, evaluate candidate course surfaces with height & state awareness
    if (course) {
      const courseSurface = course.resolveSurface(
        x,
        z,
        characterY,
        verticalSpeed,
        isGrounded,
        previousSurfaceId
      );
      if (courseSurface) {
        return courseSurface;
      }
    }

    // 2. Base terrain, bridge, stepping stones, and water bed resolution
    return getWalkableSurface(x, z);
  };
}

import * as THREE from 'three';
import { getTerrainHeight } from './terrain';
import { COURSE_ROUTES, COURSE_SAMPLE_COUNT, COURSE_SURFACE_LIFT, type CourseRouteDefinition } from './courseLayout';

/**
 * Authored, terrain-following route dressing for the meadow.
 *
 * The route is deliberately a small, controlled palette and a shared spline
 * vocabulary: dark moss shoulder, warm ivory running lane, and restrained gold
 * guidance accents. All route meshes and collision queries use the same authored route data;
 * this module owns the render resources while courseLayout owns route geometry.
 */
export interface MeadowCourse {
  dispose: () => void;
}

const _up = new THREE.Vector3(0, 1, 0);

function makeRibbon(
  curve: THREE.CatmullRomCurve3,
  width: number,
  lift: number,
  color: string,
  segments: number,
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const side = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).setY(0).normalize();
    side.crossVectors(_up, tangent).normalize();
    for (const edge of [-1, 1]) {
      const x = point.x + side.x * width * 0.5 * edge;
      const z = point.z + side.z * width * 0.5 * edge;
      positions.push(x, getTerrainHeight(x, z) + point.y + lift, z);
      uvs.push(edge < 0 ? 0 : 1, t * 10);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'CourseRouteRibbon';
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}

function makeGuideLine(curve: THREE.CatmullRomCurve3, width: number, color: string): THREE.Mesh {
  return makeRibbon(curve, width, COURSE_SURFACE_LIFT + 0.01, color, COURSE_SAMPLE_COUNT);
}

export function createMeadowCourse(scene: THREE.Scene): MeadowCourse {
  const owned: THREE.Object3D[] = [];
  const routes: Array<{ curve: THREE.CatmullRomCurve3; definition: CourseRouteDefinition }> = [];

  for (const definition of COURSE_ROUTES) {
    const points = definition.points.map(([x, z], index) =>
      new THREE.Vector3(x, definition.lifts[index] ?? 0, z)
    );
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    routes.push({ curve, definition });

    // A subtle, darker shoulder gives the course a readable silhouette against grass.
    const shoulder = makeRibbon(curve, definition.width + definition.edge * 2, COURSE_SURFACE_LIFT - 0.03, '#536b4b', COURSE_SAMPLE_COUNT);
    shoulder.name = definition.name + ' / moss shoulder';
    scene.add(shoulder);
    owned.push(shoulder);

    const lane = makeRibbon(curve, definition.width, COURSE_SURFACE_LIFT, definition.color, COURSE_SAMPLE_COUNT);
    lane.name = definition.name + ' / running lane';
    scene.add(lane);
    owned.push(lane);

    // Thin center guide is restrained on purpose; it communicates direction without
    // turning the pastoral environment into a neon race track.
    const guide = makeGuideLine(curve, 0.075, definition.accent);
    guide.name = definition.name + ' / guide';
    scene.add(guide);
    owned.push(guide);

    for (const t of definition.rings) {
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).setY(0).normalize();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.075, 8, 24),
        new THREE.MeshStandardMaterial({
          color: definition.accent,
          emissive: '#6c4d17',
          emissiveIntensity: 0.18,
          roughness: 0.38,
          metalness: 0.12,
        }),
      );
      ring.name = 'CourseJumpCue';
      ring.position.set(point.x, getTerrainHeight(point.x, point.z) + point.y + 1.65, point.z);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      ring.castShadow = true;
      scene.add(ring);
      owned.push(ring);
    }
  }

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const object of owned) {
        scene.remove(object);
        object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          geometries.add(mesh.geometry);
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            materials.add(material);
          }
        });
      }
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}

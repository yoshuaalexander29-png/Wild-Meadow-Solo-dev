import * as THREE from 'three';
import { getTerrainHeight } from './terrain';

/**
 * Authored, terrain-following route dressing for the meadow.
 *
 * The route is deliberately a small, controlled palette and a shared spline
 * vocabulary: dark moss shoulder, warm ivory running lane, and restrained gold
 * guidance accents. All route meshes are generated from the same sampled curves
 * and owned/disposed here. This is visual navigation, not a physics surface.
 */
export interface MeadowCourse {
  dispose: () => void;
}

type RouteDefinition = {
  name: string;
  points: Array<[number, number]>;
  width: number;
  edge: number;
  color: string;
  accent: string;
  rings: number[];
};

const ROUTES: RouteDefinition[] = [
  {
    name: 'Meadow Mainline',
    points: [[1.2, 0.2], [4.8, 3.4], [8.5, 5.0], [12.0, 8.0], [16.5, 11.5], [20.5, 14.2], [25.0, 13.0], [28.5, 9.0], [30.0, 4.0], [27.0, -0.5], [22.0, -2.0]],
    width: 2.5,
    edge: 0.18,
    color: '#c9b98e',
    accent: '#f4d77b',
    rings: [0.23, 0.34, 0.45, 0.56, 0.68, 0.79],
  },
  {
    name: 'Canopy Cut',
    points: [[12.0, 8.0], [12.8, 12.0], [16.0, 15.2], [20.5, 17.0], [24.0, 15.5], [25.0, 13.0]],
    width: 1.85,
    edge: 0.14,
    color: '#8da88a',
    accent: '#f4d77b',
    rings: [0.28, 0.48, 0.68],
  },
  {
    name: 'Brookside Return',
    points: [[22.0, -2.0], [17.0, -3.0], [12.0, -2.0], [8.0, -0.2], [5.0, 1.0], [1.2, 0.2]],
    width: 2.0,
    edge: 0.14,
    color: '#a9bda0',
    accent: '#d5e7d5',
    rings: [0.25, 0.5, 0.73],
  },
];

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
  const normal = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).setY(0).normalize();
    side.crossVectors(_up, tangent).normalize();
    const terrainY = getTerrainHeight(point.x, point.z);
    for (const edge of [-1, 1]) {
      const x = point.x + side.x * width * 0.5 * edge;
      const z = point.z + side.z * width * 0.5 * edge;
      positions.push(x, getTerrainHeight(x, z) + lift, z);
      uvs.push(edge < 0 ? 0 : 1, t * 10);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
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
  return makeRibbon(curve, width, 0.075, color, 150);
}

export function createMeadowCourse(scene: THREE.Scene): MeadowCourse {
  const owned: THREE.Object3D[] = [];
  const routes: Array<{ curve: THREE.CatmullRomCurve3; definition: RouteDefinition }> = [];

  for (const definition of ROUTES) {
    const points = definition.points.map(([x, z]) =>
      new THREE.Vector3(x, getTerrainHeight(x, z), z)
    );
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    routes.push({ curve, definition });

    // A subtle, darker shoulder gives the course a readable silhouette against grass.
    const shoulder = makeRibbon(curve, definition.width + definition.edge * 2, 0.035, '#536b4b', 180);
    shoulder.name = definition.name + ' / moss shoulder';
    scene.add(shoulder);
    owned.push(shoulder);

    const lane = makeRibbon(curve, definition.width, 0.065, definition.color, 180);
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
      ring.position.set(point.x, getTerrainHeight(point.x, point.z) + 1.65, point.z);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      ring.castShadow = true;
      scene.add(ring);
      owned.push(ring);
    }
  }

  // Fork/merge gateposts: consistent timber-and-brass language marks the decision
  // points from a third-person camera without oversized UI or high-contrast clutter.
  const postMaterial = new THREE.MeshStandardMaterial({ color: '#70543a', roughness: 0.86 });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: '#f4d77b', roughness: 0.42, metalness: 0.08,
  });
  const gatePoints: Array<[number, number]> = [[12.0, 8.0], [25.0, 13.0]];
  for (const [x, z] of gatePoints) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.105, 1.45, 8),
        postMaterial,
      );
      post.position.set(x + side * 1.65, getTerrainHeight(x + side * 1.65, z) + 0.72, z);
      post.castShadow = true;
      scene.add(post);
      owned.push(post);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), capMaterial);
      cap.position.set(post.position.x, post.position.y + 0.79, post.position.z);
      scene.add(cap);
      owned.push(cap);
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

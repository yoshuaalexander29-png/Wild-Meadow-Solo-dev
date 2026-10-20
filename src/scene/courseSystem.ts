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
    points: [[5.5, -1.0], [9.5, -2.8], [14.5, -5.0], [19.5, -7.8], [24.5, -9.0], [29.5, -6.5], [32.0, -1.0], [33.0, 5.5], [31.5, 11.5], [29.0, 17.5], [24.0, 22.5], [18.0, 25.0], [12.0, 25.5], [7.0, 24.5]],
    width: 2.9,
    edge: 0.16,
    color: '#d8c69a',
    accent: '#e5b45a',
    rings: [0.13, 0.62, 0.94],
  },
  {
    name: 'Canopy Cut',
    points: [[19.5, -7.8], [21.0, -4.8], [24.0, -2.0], [28.5, 0.8], [32.0, 5.5]],
    width: 2.25,
    edge: 0.13,
    color: '#a9c7b1',
    accent: '#e5b45a',
    rings: [0.52],
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
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).setY(0).normalize();
    side.crossVectors(_up, tangent).normalize();
    for (const edge of [-1, 1]) {
      const x = point.x + side.x * width * 0.5 * edge;
      const z = point.z + side.z * width * 0.5 * edge;
      positions.push(x, getTerrainHeight(x, z) + lift, z);
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

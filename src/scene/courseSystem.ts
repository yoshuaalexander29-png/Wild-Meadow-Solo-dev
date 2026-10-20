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
  gaps: Array<[number, number]> = [],
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
      const midpoint = (i + 0.5) / segments;
      const inGap = gaps.some(([start, end]) => midpoint >= start && midpoint <= end);
      if (!inGap) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
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

function makeGuideLine(curve: THREE.CatmullRomCurve3, width: number, color: string, gaps: Array<[number, number]> = []): THREE.Mesh {
  return makeRibbon(curve, width, COURSE_SURFACE_LIFT + 0.01, color, COURSE_SAMPLE_COUNT, gaps);
}

export function createMeadowCourse(scene: THREE.Scene): MeadowCourse {
  const owned: THREE.Object3D[] = [];
  const routes: Array<{ curve: THREE.CatmullRomCurve3; definition: CourseRouteDefinition }> = [];

  const ringCapacity = COURSE_ROUTES.reduce((count, route) => count + route.rings.length, 0) + 1;
  const ringGeometry = new THREE.TorusGeometry(0.42, 0.075, 8, 24);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: '#e5b45a',
    emissive: '#6c4d17',
    emissiveIntensity: 0.18,
    roughness: 0.38,
    metalness: 0.12,
  });
  const ringInstances = new THREE.InstancedMesh(ringGeometry, ringMaterial, ringCapacity);
  ringInstances.name = 'MeadowCourse_JumpCuesAndFinish';
  ringInstances.castShadow = true;
  const ringPosition = new THREE.Vector3();
  const ringTangent = new THREE.Vector3();
  const ringScale = new THREE.Vector3(1, 1, 1);
  const ringRotation = new THREE.Quaternion();
  const ringMatrix = new THREE.Matrix4();
  let ringIndex = 0;

  for (const definition of COURSE_ROUTES) {
    const points = definition.points.map(([x, z], index) =>
      new THREE.Vector3(x, definition.lifts[index] ?? 0, z)
    );
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    routes.push({ curve, definition });

    // A subtle, darker shoulder gives the course a readable silhouette against grass.
    const shoulder = makeRibbon(curve, definition.width + definition.edge * 2, COURSE_SURFACE_LIFT - 0.03, '#536b4b', COURSE_SAMPLE_COUNT, definition.gaps);
    shoulder.name = definition.name + ' / moss shoulder';
    scene.add(shoulder);
    owned.push(shoulder);

    const lane = makeRibbon(curve, definition.width, COURSE_SURFACE_LIFT, definition.color, COURSE_SAMPLE_COUNT, definition.gaps);
    lane.name = definition.name + ' / running lane';
    scene.add(lane);
    owned.push(lane);

    // Thin center guide is restrained on purpose; it communicates direction without
    // turning the pastoral environment into a neon race track.
    const guide = makeGuideLine(curve, 0.075, definition.accent, definition.gaps);
    guide.name = definition.name + ' / guide';
    scene.add(guide);
    owned.push(guide);

    for (const t of definition.rings) {
      const point = curve.getPointAt(t);
      curve.getTangentAt(t, ringTangent).setY(0).normalize();
      ringPosition.set(point.x, getTerrainHeight(point.x, point.z) + point.y + 1.65, point.z);
      ringRotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringTangent);
      ringMatrix.compose(ringPosition, ringRotation, ringScale);
      ringInstances.setMatrixAt(ringIndex++, ringMatrix);
    }
  }

  // A larger matching ring gives the authored mainline an unmistakable endpoint.
  const finishRoute = routes.find((route) => route.definition.name === 'Meadow Mainline');
  if (finishRoute) {
    const finish = finishRoute.curve.getPointAt(1);
    finishRoute.curve.getTangentAt(1, ringTangent).setY(0).normalize();
    ringPosition.set(finish.x, getTerrainHeight(finish.x, finish.z) + finish.y + 1.2, finish.z);
    ringRotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringTangent);
    ringScale.setScalar(2.8);
    ringMatrix.compose(ringPosition, ringRotation, ringScale);
    ringInstances.setMatrixAt(ringIndex++, ringMatrix);
  }
  ringInstances.count = ringIndex;
  ringInstances.instanceMatrix.needsUpdate = true;
  scene.add(ringInstances);
  owned.push(ringInstances);

  // Timber decking turns the elevated route into a readable boardwalk rather than
  // a paper-thin ribbon. Repeated boards are instanced and omitted across the jump.
  const plankGeometry = new THREE.BoxGeometry(1, 0.07, 0.24);
  const plankMaterial = new THREE.MeshStandardMaterial({
    color: '#b18a5c',
    roughness: 0.92,
    metalness: 0,
  });
  const planks = new THREE.InstancedMesh(plankGeometry, plankMaterial, 512);
  planks.name = 'MeadowCourse_InstancedBoardwalkDeck';
  planks.castShadow = true;
  planks.receiveShadow = true;
  const plankPosition = new THREE.Vector3();
  const plankTangent = new THREE.Vector3();
  const plankScale = new THREE.Vector3();
  const plankRotation = new THREE.Quaternion();
  const plankMatrix = new THREE.Matrix4();
  let plankIndex = 0;
  for (const { curve, definition } of routes) {
    for (let t = 0.02; t < 0.99 && plankIndex < 512; t += 0.032) {
      const progress = t;
      if ((definition.gaps ?? []).some(([start, end]) => progress >= start && progress <= end)) continue;
      curve.getPointAt(t, _supportPoint);
      if (_supportPoint.y < 0.42) continue;
      curve.getTangentAt(t, plankTangent).setY(0).normalize();
      const terrainY = getTerrainHeight(_supportPoint.x, _supportPoint.z);
      plankPosition.set(
        _supportPoint.x,
        terrainY + _supportPoint.y + 0.005,
        _supportPoint.z,
      );
      plankRotation.setFromUnitVectors(_up.clone().set(0, 0, 1), plankTangent);
      plankScale.set(definition.width + definition.edge * 1.25, 1, 1);
      plankMatrix.compose(plankPosition, plankRotation, plankScale);
      planks.setMatrixAt(plankIndex++, plankMatrix);
    }
  }
  planks.count = plankIndex;
  planks.instanceMatrix.needsUpdate = true;
  if (plankIndex > 0) {
    scene.add(planks);
    owned.push(planks);
  } else {
    plankGeometry.dispose();
    plankMaterial.dispose();
  }

  // Instanced timber supports make elevated sections read as real structures
  // while keeping their draw-call cost constant as the course sampling is refined.
  const supportGeometry = new THREE.CylinderGeometry(0.075, 0.12, 1, 8);
  const supportMaterial = new THREE.MeshStandardMaterial({
    color: '#70543a',
    roughness: 0.88,
    metalness: 0,
  });
  const supportCapacity = COURSE_ROUTES.length * 20;
  const supports = new THREE.InstancedMesh(supportGeometry, supportMaterial, supportCapacity);
  supports.name = 'MeadowCourse_InstancedTimberSupports';
  supports.castShadow = true;
  supports.receiveShadow = true;
  const _supportPosition = new THREE.Vector3();
  const _supportScale = new THREE.Vector3(1, 1, 1);
  const _supportRotation = new THREE.Quaternion();
  const _supportMatrix = new THREE.Matrix4();
  const _supportPoint = new THREE.Vector3();
  const _supportTangent = new THREE.Vector3();
  const _supportSide = new THREE.Vector3();
  let supportIndex = 0;
  for (const { curve, definition } of routes) {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      curve.getPointAt(t, _supportPoint);
      if (_supportPoint.y < 0.48) continue;
      curve.getTangentAt(t, _supportTangent).setY(0).normalize();
      _supportSide.crossVectors(_up, _supportTangent).normalize();
      const terrainY = getTerrainHeight(_supportPoint.x, _supportPoint.z);
      const postHeight = _supportPoint.y + COURSE_SURFACE_LIFT - 0.06;
      if (postHeight <= 0.1) continue;
      for (const side of [-1, 1]) {
        if (supportIndex >= supportCapacity) break;
        _supportPosition.set(
          _supportPoint.x + _supportSide.x * (definition.width * 0.5 - 0.22) * side,
          terrainY + postHeight * 0.5,
          _supportPoint.z + _supportSide.z * (definition.width * 0.5 - 0.22) * side,
        );
        _supportScale.set(1, postHeight, 1);
        _supportMatrix.compose(_supportPosition, _supportRotation, _supportScale);
        supports.setMatrixAt(supportIndex++, _supportMatrix);
      }
    }
  }
  supports.count = supportIndex;
  supports.instanceMatrix.needsUpdate = true;
  if (supportIndex > 0) {
    scene.add(supports);
    owned.push(supports);
  } else {
    supportGeometry.dispose();
    supportMaterial.dispose();
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

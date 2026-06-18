import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTimberHub } from '../../src/geometry/timber-hub';
import { buildTimberHubSolid } from '../../src/geometry/timber-manifold';
import { finishTimberHub } from '../../src/geometry/timber-finish';
import { createTimberSocketTemplate, timberDims } from '../../src/geometry/timber-socket';
import { createHub, orientGeometryForSTL } from '../../src/geometry/hub-geometry';
import { validateStlGeometry } from '../../src/geometry/stl-validation';
import { genSphere, truncDome, classHubs } from '../../src/geodesic/math';
import { DOME_RADIUS } from '../../src/types';
import type { HubParams } from '../../src/types';

function triCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  return geo.attributes.position.count / 3;
}

function meshSpan(geo: THREE.BufferGeometry): number {
  geo.computeBoundingBox();
  return geo.boundingBox!.max.distanceTo(geo.boundingBox!.min);
}

const baseParams: HubParams = {
  matType: 'rect',
  rodD: 26.7,
  lumW: 19.05,
  lumH: 38.1,
  tol: 0.35,
  wall: 3.5,
  bodyScale: 1.4,
  chamfer: 2,
  detail: 32,
  printFoot: false,
  footMargin: 6,
  screwHoles: false,
  hubStyle: 'organic',
  junctionMeet: 1.0,
};

const dirs = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

describe('timber hub (profile sweep)', () => {
  it('builds multi-way hub with reasonable triangle count', () => {
    const geo = createTimberHub(dirs, baseParams);
    const tris = triCount(geo);
    expect(tris).toBeGreaterThan(300);
    expect(tris).toBeLessThan(25000);
  });

  it('1x2 timber hub is smaller than 2x4', () => {
    const small = createTimberHub(dirs, baseParams);
    const large = createTimberHub(dirs, {
      ...baseParams,
      lumW: 38.1,
      lumH: 88.9,
      wall: 5,
    });
    small.computeBoundingBox();
    large.computeBoundingBox();
    const smallSpan = small.boundingBox!.max.distanceTo(small.boundingBox!.min);
    const largeSpan = large.boundingBox!.max.distanceTo(large.boundingBox!.min);
    expect(smallSpan).toBeLessThan(largeSpan);
  });

  it('single socket template has open bore along axis', () => {
    const geo = createTimberSocketTemplate(baseParams);
    geo.computeBoundingBox();
    expect(geo.boundingBox!.max.y).toBeGreaterThan(25);
    expect(geo.boundingBox!.min.y).toBeGreaterThan(-1);
  });

  it('CSG solid is a single manifold body', () => {
    const solid = buildTimberHubSolid(dirs, {
      ...baseParams,
      printFrame: true,
      printFoot: true,
      junctionMeet: 0.75,
    });
    expect(solid.decompose().length).toBe(1);
  });

  it('finish pipeline keeps stable bounds (no shard explosion)', () => {
    const p = {
      ...baseParams,
      printFrame: true,
      printFoot: true,
      junctionMeet: 0.75,
      detail: 64,
    };
    const solid = buildTimberHubSolid(dirs, p);
    const rawSpan = solid.boundingBox().max[0] - solid.boundingBox().min[0];
    const geo = finishTimberHub(solid, dirs, p);
    const span = meshSpan(geo);
    expect(span).toBeGreaterThan(25);
    expect(span).toBeLessThan(rawSpan * 4 + 80);
  });

  it('print foot sits hub on bed', () => {
    const p = {
      ...baseParams,
      printFrame: true,
      printFoot: true,
      bodyScale: 1.5,
      detail: 48,
    };
    const solid = buildTimberHubSolid(dirs, p);
    const geo = finishTimberHub(solid, dirs, p);
    geo.computeBoundingBox();
    expect(geo.boundingBox!.min.y).toBeGreaterThan(-0.05);
    expect(geo.boundingBox!.min.y).toBeLessThan(0.5);
  });

  it('socket depth scales lumber insertion length', () => {
    const shallow = timberDims({ ...baseParams, socketDepth: 0.6 });
    const deep = timberDims({ ...baseParams, socketDepth: 1.0 });
    expect(deep.socketLen).toBeGreaterThan(shallow.socketLen);
  });

  it('print-frame hub exports valid STL mesh', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.5, DOME_RADIUS, true, false, 2, 3);
    const hubs = classHubs(dome);
    const geo = createHub(hubs[0].verts[0], dome, {
      ...baseParams,
      detail: 48,
      printFrame: true,
      printFoot: true,
    });
    expect(geo).not.toBeNull();
    const stlGeo = orientGeometryForSTL(geo!);
    const positions = stlGeo.attributes.position.array as Float32Array;
    const validation = validateStlGeometry(positions);
    expect(triCount(geo!)).toBeGreaterThan(300);
    expect(validation.errors).toHaveLength(0);
    stlGeo.dispose();
  });
});

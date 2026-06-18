import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildRoundNodeHubSolid,
  buildTimberNodeHubSolid,
} from '../../src/geometry/node-hub-manifold';
import { createHubFromDirs, orientGeometryForSTL } from '../../src/geometry/hub-geometry';
import { validateStlGeometry } from '../../src/geometry/stl-validation';
import { genSphere, truncDome, classHubs } from '../../src/geodesic/math';
import { DOME_RADIUS } from '../../src/types';
import type { HubParams } from '../../src/types';

/** Every undirected edge of a closed 2-manifold is shared by exactly 2 triangles. */
function edgeManifoldReport(geo: THREE.BufferGeometry): {
  open: number;
  nonManifold: number;
  triangles: number;
} {
  const idx = geo.index
    ? Array.from(geo.index.array)
    : Array.from({ length: geo.attributes.position.count }, (_, i) => i);
  const edges = new Map<string, number>();
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const c of edges.values()) {
    if (c === 1) open++;
    else if (c > 2) nonManifold++;
  }
  return { open, nonManifold, triangles: idx.length / 3 };
}

const baseRound: HubParams = {
  matType: 'round',
  rodD: 26.7,
  lumW: 19.05,
  lumH: 38.1,
  tol: 0.3,
  wall: 5,
  bodyScale: 1.6,
  chamfer: 2,
  detail: 48,
  printFoot: true,
  footMargin: 6,
  screwHoles: true,
  screwDia: 4.2,
  junctionMeet: 1,
  baseThickness: 4,
  baseScale: 1.35,
  socketDepth: 0.85,
  surfaceSmooth: 0.6,
  subdConnectionLength: 0,
  subdStrutSize: 1,
  hubStyle: 'organic',
};

const baseTimber: HubParams = { ...baseRound, matType: 'rect', wall: 3.5, tol: 0.35, bodyScale: 1.5 };

const dirSets: Record<string, THREE.Vector3[]> = {
  threeWay: [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-0.5, 0.8, 0.3).normalize(),
    new THREE.Vector3(-0.5, -0.8, 0.3).normalize(),
  ],
  fiveWay: [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ],
  sixWay: [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ],
};

describe('manifold solid integrity', () => {
  for (const [name, dirs] of Object.entries(dirSets)) {
    for (const organic of [true, false]) {
      it(`round ${name} (${organic ? 'organic' : 'sharp'}) is a single valid solid`, () => {
        const solid = buildRoundNodeHubSolid(dirs, baseRound, { organic });
        expect(solid.status()).toBe('NoError');
        expect(solid.isEmpty()).toBe(false);
        expect(solid.volume()).toBeGreaterThan(0);
        expect(solid.decompose().length).toBe(1);
        solid.delete();
      });

      it(`timber ${name} (${organic ? 'organic' : 'sharp'}) is a single valid solid`, () => {
        const solid = buildTimberNodeHubSolid(dirs, baseTimber, { organic });
        expect(solid.status()).toBe('NoError');
        expect(solid.isEmpty()).toBe(false);
        expect(solid.volume()).toBeGreaterThan(0);
        expect(solid.decompose().length).toBe(1);
        solid.delete();
      });
    }
  }
});

describe('exported hub mesh is watertight', () => {
  const cases: Array<{ label: string; p: HubParams }> = [
    { label: 'round organic', p: { ...baseRound, hubStyle: 'organic' } },
    { label: 'round sharp', p: { ...baseRound, hubStyle: 'sharp' } },
    { label: 'timber organic', p: { ...baseTimber, hubStyle: 'organic' } },
    { label: 'timber sharp', p: { ...baseTimber, hubStyle: 'sharp' } },
  ];

  for (const { label, p } of cases) {
    it(`${label} export has no open or non-manifold edges`, () => {
      const geo = createHubFromDirs(dirSets.fiveWay, { ...p, printFrame: true, printFoot: true });
      expect(geo).not.toBeNull();
      const report = edgeManifoldReport(geo!);
      expect(report.triangles).toBeGreaterThan(200);
      expect(report.open).toBe(0);
      expect(report.nonManifold).toBe(0);
    });

    it(`${label} passes STL validation with no warnings`, () => {
      const geo = createHubFromDirs(dirSets.fiveWay, { ...p, printFrame: true, printFoot: true });
      const stl = orientGeometryForSTL(geo!);
      const validation = validateStlGeometry(stl.attributes.position.array as Float32Array);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings).toHaveLength(0);
      stl.dispose();
    });
  }
});

describe('real dome hubs are watertight', () => {
  it('every classified hub type of a V2 dome exports closed', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.5, DOME_RADIUS, true, false, 2, 3);
    const hubs = classHubs(dome);
    expect(hubs.length).toBeGreaterThan(0);
    for (const ht of hubs) {
      const dirs = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]));
      const geo = createHubFromDirs(dirs, { ...baseRound, printFrame: true, printFoot: true });
      expect(geo, `${ht.label}`).not.toBeNull();
      const report = edgeManifoldReport(geo!);
      expect(report.open, `${ht.label} open edges`).toBe(0);
      expect(report.nonManifold, `${ht.label} non-manifold edges`).toBe(0);
    }
  });
});

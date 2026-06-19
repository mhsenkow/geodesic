import { describe, it, expect } from 'vitest';
import { genSphere, dualizeSphere, truncDome, classHubs } from '../../src/geodesic/math';
import { createHubFromDirs, orientGeometryForSTL } from '../../src/geometry/hub-geometry';
import { validateStlGeometry } from '../../src/geometry/stl-validation';
import { DOME_RADIUS } from '../../src/types';
import type { HubParams } from '../../src/types';
import * as THREE from 'three';

const base: HubParams = {
  matType: 'round',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  wall: 5,
  bodyScale: 1.6,
  chamfer: 2,
  detail: 32,
  printFoot: true,
  footMargin: 6,
  hubStyle: 'metaball',
  surfaceSmooth: 0.7,
};

describe('Goldberg truncated dome hubs', () => {
  it('exports watertight at truncation cut line', () => {
    const dual = dualizeSphere(genSphere(2, DOME_RADIUS, 'icosahedron'));
    const dome = truncDome(dual, 0.625, DOME_RADIUS, true, false, 2, 4);
    const hubs = classHubs(dome);
    expect(hubs.length).toBeGreaterThan(0);
    const ht = hubs[0];
    const dirs = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]));
    const geo = createHubFromDirs(dirs, { ...base, printFrame: true, printFoot: true });
    expect(geo).not.toBeNull();
    const stl = orientGeometryForSTL(geo!);
    const v = validateStlGeometry(stl.attributes.position.array as Float32Array);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
    stl.dispose();
  });
});

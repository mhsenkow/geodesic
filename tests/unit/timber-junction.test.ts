import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { junctionInset, minPairAngleDeg, pairAnglesDeg } from '../../src/geometry/timber-junction';
import { timberDims } from '../../src/geometry/timber-socket';
import type { HubParams } from '../../src/types';

const baseParams: HubParams = {
  matType: 'rect',
  rodD: 26.7,
  lumW: 19.05,
  lumH: 38.1,
  tol: 0.35,
  wall: 3.5,
  bodyScale: 1.0,
  chamfer: 2,
  detail: 48,
  printFoot: false,
  footMargin: 6,
  screwHoles: false,
  hubStyle: 'sharp',
  junctionMeet: 1,
};

describe('timber junction', () => {
  it('computes pair angles for orthogonal dirs', () => {
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    const angles = pairAnglesDeg(dirs);
    expect(angles).toHaveLength(3);
    for (const a of angles) expect(a).toBeCloseTo(90, 0);
  });

  it('uses deeper inset for tighter meet angles', () => {
    const d = timberDims(baseParams);
    const wide = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ];
    const tight = [
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0.2, 0.98, 0).normalize(),
      new THREE.Vector3(-0.2, 0.98, 0).normalize(),
    ];
    expect(minPairAngleDeg(tight)).toBeLessThan(minPairAngleDeg(wide));
    expect(junctionInset(d, baseParams, tight)).toBeGreaterThan(junctionInset(d, baseParams, wide));
  });

  it('scales inset with junctionMeet slider', () => {
    const d = timberDims(baseParams);
    const dirs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
    const low = junctionInset(d, { ...baseParams, junctionMeet: 0.7 }, dirs);
    const high = junctionInset(d, { ...baseParams, junctionMeet: 1.4 }, dirs);
    expect(high).toBeGreaterThan(low);
  });
});

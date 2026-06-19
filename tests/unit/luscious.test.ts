import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createHubFromDirs, orientGeometryForSTL } from '../../src/geometry/hub-geometry';
import { buildRoundNodeHubSolid } from '../../src/geometry/node-hub-manifold';
import { buildMetaballHubSolid } from '../../src/geometry/metaball-hub';
import { validateStlGeometry } from '../../src/geometry/stl-validation';
import { genSphere, dualizeSphere, truncDome, classHubs } from '../../src/geodesic/math';
import { DEFAULT_SETTINGS, DOME_RADIUS } from '../../src/types';
import type { HubParams } from '../../src/types';

const dirs = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

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
  screwHoles: true,
  screwDia: 4.2,
  junctionMeet: 1,
  baseThickness: 4,
  baseScale: 1.35,
  socketDepth: 0.9,
  surfaceSmooth: 0.6,
  subdConnectionLength: 0,
  subdStrutSize: 1,
  hubStyle: 'organic',
  strutTaper: 0.7,
  boreThrough: false,
  baseVent: true,
};

function watertight(p: HubParams) {
  const geo = createHubFromDirs(dirs, { ...p, printFrame: true, printFoot: true });
  expect(geo).not.toBeNull();
  const stl = orientGeometryForSTL(geo!);
  const v = validateStlGeometry(stl.attributes.position.array as Float32Array);
  stl.dispose();
  return v;
}

describe('luscious hub options stay watertight', () => {
  it('tapered organic hub', () => {
    const solid = buildRoundNodeHubSolid(dirs, { ...base, strutTaper: 0.6 });
    expect(solid.status()).toBe('NoError');
    expect(solid.decompose().length).toBe(1);
    solid.delete();
    expect(watertight({ ...base, strutTaper: 0.6 }).warnings).toHaveLength(0);
  });

  it('hollow through-core organic hub', () => {
    const solid = buildRoundNodeHubSolid(dirs, { ...base, boreThrough: true });
    expect(solid.status()).toBe('NoError');
    expect(solid.decompose().length).toBe(1);
    solid.delete();
    const v = watertight({ ...base, boreThrough: true });
    expect(v.errors).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
  });

  it('hollow through-core metaball hub', () => {
    const solid = buildMetaballHubSolid(dirs, { ...base, hubStyle: 'metaball', boreThrough: true }, {
      preview: true,
    });
    expect(solid.status()).toBe('NoError');
    expect(solid.decompose().length).toBe(1);
    solid.delete();
  });

  it('base drain vent stays watertight', () => {
    const v = watertight({ ...base, baseVent: true });
    expect(v.errors).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
  });

  it('goldberg buckyball 3-way hubs export closed', () => {
    const dual = dualizeSphere(genSphere(3, DOME_RADIUS, 'icosahedron'));
    const dome = truncDome(dual, 0.625, DOME_RADIUS, true, false, 2, 4);
    const hubs = classHubs(dome);
    expect(hubs.length).toBeGreaterThan(0);
    // Goldberg hubs never exceed 3-way (truncation lowers base-ring valence).
    expect(hubs.every((h) => h.val <= 3)).toBe(true);
    const ht = hubs.find((h) => h.val === 3) ?? hubs[0];
    const hdirs = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]));
    const geo = createHubFromDirs(hdirs, {
      ...base,
      hubStyle: 'metaball',
      printFrame: true,
      printFoot: true,
    });
    expect(geo).not.toBeNull();
    const stl = orientGeometryForSTL(geo!);
    const v = validateStlGeometry(stl.attributes.position.array as Float32Array);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
    stl.dispose();
  });

  it('default settings carry the new luscious params', () => {
    expect(DEFAULT_SETTINGS.strutTaper).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.geoTopology).toBe('geodesic');
    expect(typeof DEFAULT_SETTINGS.baseVent).toBe('boolean');
  });
});

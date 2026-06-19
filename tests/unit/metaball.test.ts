import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMetaballHubSolid } from '../../src/geometry/metaball-hub';
import { createHubFromDirs, orientGeometryForSTL } from '../../src/geometry/hub-geometry';
import { validateStlGeometry } from '../../src/geometry/stl-validation';
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
  lumW: 19.05,
  lumH: 38.1,
  tol: 0.3,
  wall: 5,
  bodyScale: 1.6,
  chamfer: 2,
  detail: 28,
  printFoot: true,
  footMargin: 6,
  screwHoles: true,
  screwDia: 4.2,
  junctionMeet: 1,
  baseThickness: 4,
  baseScale: 1.35,
  socketDepth: 0.9,
  surfaceSmooth: 0.7,
  subdConnectionLength: 0,
  subdStrutSize: 1,
  hubStyle: 'metaball',
};

describe('metaball hub (levelSet SDF)', () => {
  it('round metaball is a single watertight solid', () => {
    const solid = buildMetaballHubSolid(dirs, base, { preview: true });
    expect(solid.status()).toBe('NoError');
    expect(solid.isEmpty()).toBe(false);
    expect(solid.volume()).toBeGreaterThan(0);
    expect(solid.decompose().length).toBe(1);
    solid.delete();
  });

  it('timber metaball is a single watertight solid', () => {
    const solid = buildMetaballHubSolid(dirs, { ...base, matType: 'rect', wall: 3.5, tol: 0.35 }, {
      preview: true,
    });
    expect(solid.status()).toBe('NoError');
    expect(solid.volume()).toBeGreaterThan(0);
    expect(solid.decompose().length).toBe(1);
    solid.delete();
  });

  it('higher surfaceSmooth blends more (single body, more volume in the joins)', () => {
    const lean = buildMetaballHubSolid(dirs, { ...base, surfaceSmooth: 0.2 }, { preview: true });
    const molten = buildMetaballHubSolid(dirs, { ...base, surfaceSmooth: 0.95 }, { preview: true });
    expect(lean.decompose().length).toBe(1);
    expect(molten.decompose().length).toBe(1);
    expect(molten.volume()).toBeGreaterThan(lean.volume());
    lean.delete();
    molten.delete();
  });

  it('metaball export is watertight (no open edges, no warnings)', () => {
    const geo = createHubFromDirs(dirs, { ...base, printFrame: true, printFoot: true });
    expect(geo).not.toBeNull();
    const stl = orientGeometryForSTL(geo!);
    const validation = validateStlGeometry(stl.attributes.position.array as Float32Array);
    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings).toHaveLength(0);
    stl.dispose();
  });
});

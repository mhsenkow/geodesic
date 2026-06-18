import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { nodeSmoothRadius } from '../../src/geometry/node-hub-manifold';
import { buildRoundNodeHubSolid } from '../../src/geometry/node-hub-manifold';
import { createHubFromDirs, polishOrganicHubMesh } from '../../src/geometry/hub-geometry';
import type { HubParams } from '../../src/types';

const dirs = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-0.5, 0.8, 0.3).normalize(),
  new THREE.Vector3(-0.5, -0.8, 0.3).normalize(),
];

const baseParams: HubParams = {
  matType: 'round',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  wall: 4,
  bodyScale: 1.6,
  chamfer: 1,
  detail: 32,
  printFoot: false,
  footMargin: 6,
  surfaceSmooth: 0.65,
  meshSubdivide: true,
  subdConnectionLength: 0,
  subdStrutSize: 1,
  hubStyle: 'organic',
};

describe('node hub (MultiPipe manifold)', () => {
  it('connection length 0 yields smoother node radius than sharp', () => {
    const smooth = nodeSmoothRadius({ ...baseParams, subdConnectionLength: 0 });
    const sharp = nodeSmoothRadius({ ...baseParams, subdConnectionLength: 1.5 });
    expect(smooth).toBeGreaterThan(sharp);
  });

  it('builds watertight round node solid', () => {
    const solid = buildRoundNodeHubSolid(dirs, baseParams);
    expect(solid.numVert()).toBeGreaterThan(100);
    expect(solid.numTri()).toBeGreaterThan(100);
    solid.delete();
  });
});

describe('organic hub refinement', () => {
  it('organic round hub is refined denser than sharp CSG', () => {
    const sharp = createHubFromDirs(dirs, { ...baseParams, hubStyle: 'sharp' });
    const organic = createHubFromDirs(dirs, { ...baseParams, hubStyle: 'organic', surfaceSmooth: 0.7 });
    expect(sharp).not.toBeNull();
    expect(organic).not.toBeNull();
    const sharpTris = sharp!.index ? sharp!.index.count / 3 : sharp!.attributes.position.count / 3;
    const organicTris = organic!.index
      ? organic!.index.count / 3
      : organic!.attributes.position.count / 3;
    expect(organicTris).toBeGreaterThan(sharpTris);
  });

  it('timber organic hub is a solid mesh', () => {
    const geo = createHubFromDirs(dirs, {
      ...baseParams,
      matType: 'rect',
      hubStyle: 'organic',
      surfaceSmooth: 0.6,
    });
    expect(geo).not.toBeNull();
    expect(geo!.attributes.position.count).toBeGreaterThan(500);
  });
});

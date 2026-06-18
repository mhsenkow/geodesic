import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyRoundWeaverbird, createHub, createHubFromDirs } from '../../src/geometry/hub-geometry';
import { roundWeaverbirdOptions, shouldPolishHubMesh } from '../../src/geometry/mesh-smooth';
import { genSphere, truncDome } from '../../src/geodesic/math';
import { DOME_RADIUS } from '../../src/types';
import type { HubParams } from '../../src/types';

function triCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  return geo.attributes.position.count / 3;
}

const baseParams: HubParams = {
  matType: 'round',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  wall: 4,
  bodyScale: 1.5,
  chamfer: 1,
  detail: 48,
  printFoot: false,
  footMargin: 6,
  surfaceSmooth: 0.65,
  meshSubdivide: true,
};

describe('round hub mesh', () => {
  it('polishes when surface smooth is set', () => {
    expect(shouldPolishHubMesh({ ...baseParams, surfaceSmooth: 0.5 })).toBe(true);
  });

  it('skips polish when smooth is zero and subdivide off', () => {
    expect(
      shouldPolishHubMesh({ ...baseParams, surfaceSmooth: 0, meshSubdivide: false })
    ).toBe(false);
  });

  it('dome preview uses lighter subdivide than export', () => {
    const preview = roundWeaverbirdOptions({
      ...baseParams,
      domePreview: true,
      surfaceSmooth: 0.9,
      meshSubdivide: true,
    });
    const exportOpts = roundWeaverbirdOptions({
      ...baseParams,
      printFrame: true,
      surfaceSmooth: 0.9,
      meshSubdivide: true,
    });
    expect(preview?.subdivideLevels).toBe(1);
    expect(exportOpts?.subdivideLevels).toBe(2);
  });

  it('print base seats hub on bed and adds geometry', () => {
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ];
    const noBase = createHubFromDirs(dirs, {
      ...baseParams,
      printFrame: true,
      printFoot: false,
      surfaceSmooth: 0.55,
    });
    const withBase = createHubFromDirs(dirs, {
      ...baseParams,
      printFrame: true,
      printFoot: true,
      surfaceSmooth: 0.55,
    });
    noBase!.computeBoundingBox();
    withBase!.computeBoundingBox();
    // Base sits the hub flat on the print bed.
    expect(withBase!.boundingBox!.min.y).toBeGreaterThan(-0.05);
    expect(withBase!.boundingBox!.min.y).toBeLessThan(0.6);
    // Base disc adds geometry.
    expect(triCount(withBase!)).toBeGreaterThan(triCount(noBase!));
  });

  it('detail drives tessellation; organic is denser than sharp', () => {
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ];
    const sharp = createHubFromDirs(dirs, { ...baseParams, hubStyle: 'sharp', detail: 32 });
    const organic = createHubFromDirs(dirs, { ...baseParams, hubStyle: 'organic', detail: 32 });
    const organicHi = createHubFromDirs(dirs, { ...baseParams, hubStyle: 'organic', detail: 80 });
    expect(sharp).not.toBeNull();
    expect(organic).not.toBeNull();
    // Refinement of the organic surface produces more triangles than crisp CSG.
    expect(triCount(organic!)).toBeGreaterThan(triCount(sharp!));
    // Higher detail → finer tessellation.
    expect(triCount(organicHi!)).toBeGreaterThan(triCount(organic!));
  });

  it('polish does not explode bounding span', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.5, DOME_RADIUS, true, false, 2, 3);
    const raw = createHub(0, dome, { ...baseParams, surfaceSmooth: 0 });
    const polished = createHub(0, dome, { ...baseParams, printFrame: true, surfaceSmooth: 0.7 });
    raw!.computeBoundingBox();
    polished!.computeBoundingBox();
    const rawSpan = raw!.boundingBox!.max.distanceTo(raw!.boundingBox!.min);
    const polSpan = polished!.boundingBox!.max.distanceTo(polished!.boundingBox!.min);
    expect(polSpan).toBeLessThan(rawSpan * 1.5);
  });

  it('applyRoundWeaverbird welds and smooths merged lathe mesh', () => {
    const geo = new THREE.SphereGeometry(10, 16, 12);
    const out = applyRoundWeaverbird(geo, {
      ...baseParams,
      surfaceSmooth: 0.6,
      meshSubdivide: true,
    });
    expect(triCount(out)).toBeGreaterThan(triCount(geo) * 2);
  });
});

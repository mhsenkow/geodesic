import { describe, it, expect } from 'vitest';
import { createTimberSocketGeometry } from '../../src/geometry/timber-socket';
import type { HubParams } from '../../src/types';

const baseParams: HubParams = {
  matType: 'rect',
  rodD: 26.7,
  lumW: 38.1,
  lumH: 88.9,
  tol: 0.4,
  wall: 5,
  bodyScale: 1.4,
  chamfer: 2,
  detail: 32,
  printFoot: false,
  footMargin: 6,
  screwHoles: false,
};

describe('timber socket geometry', () => {
  it('builds sharp style with reasonable triangle count', () => {
    const geo = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp' });
    const tris = geo.attributes.position.count / 3;
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThan(800);
  });

  it('builds organic style with more geometry than sharp', () => {
    const sharp = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp' });
    const organic = createTimberSocketGeometry({ ...baseParams, hubStyle: 'organic', bodyScale: 1.6 });
    expect(organic.attributes.position.count).toBeGreaterThan(sharp.attributes.position.count);
  });

  it('increases geometry with thicker walls', () => {
    const thin = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp', wall: 3 });
    const thick = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp', wall: 8 });
    expect(thick.attributes.position.count).toBeGreaterThanOrEqual(thin.attributes.position.count);
  });
});

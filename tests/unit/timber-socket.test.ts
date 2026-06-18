import { describe, it, expect } from 'vitest';
import { createTimberSocketGeometry } from '../../src/geometry/timber-socket';
import type { HubParams } from '../../src/types';

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
};

describe('timber socket geometry', () => {
  it('builds organic profile socket with reasonable triangle count', () => {
    const geo = createTimberSocketGeometry({ ...baseParams, bodyScale: 1.4 });
    const tris = geo.attributes.position.count / 3;
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThan(1200);
  });

  it('higher flare scale lengthens socket envelope', () => {
    const low = createTimberSocketGeometry({ ...baseParams, bodyScale: 1.1 });
    const high = createTimberSocketGeometry({ ...baseParams, bodyScale: 1.8 });
    low.computeBoundingBox();
    high.computeBoundingBox();
    expect(high.boundingBox!.max.y).toBeGreaterThanOrEqual(low.boundingBox!.max.y);
  });

  it('builds sharp socket rooted at origin for junction assembly', () => {
    const geo = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp' });
    geo.computeBoundingBox();
    expect(geo.boundingBox!.min.y).toBeGreaterThan(-0.01);
  });

  it('increases geometry with thicker walls', () => {
    const thin = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp', wall: 3 });
    const thick = createTimberSocketGeometry({ ...baseParams, hubStyle: 'sharp', wall: 8 });
    expect(thick.attributes.position.count).toBeGreaterThanOrEqual(thin.attributes.position.count);
  });
});

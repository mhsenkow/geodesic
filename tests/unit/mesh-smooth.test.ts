import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { weaverbirdSmooth } from '../../src/geometry/mesh-smooth';

describe('weaverbirdSmooth', () => {
  it('increases triangle count when subdividing', () => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 0, 1, 1,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex([0, 1, 2, 3, 4, 5]);

    const smooth = weaverbirdSmooth(geo, { subdivideLevels: 1, smoothIterations: 1 });
    expect(smooth.attributes.position.count / 3).toBeGreaterThan(geo.attributes.position.count / 3);
  });

  it('preserves topology when not subdividing', () => {
    const geo = new THREE.IcosahedronGeometry(5, 0);
    const beforeTris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    const smooth = weaverbirdSmooth(geo, { subdivideLevels: 0, smoothIterations: 2 });
    const afterTris = smooth.index ? smooth.index.count / 3 : smooth.attributes.position.count / 3;
    expect(afterTris).toBe(beforeTris);
  });
});

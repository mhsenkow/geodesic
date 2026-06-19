import { describe, it, expect } from 'vitest';
import { genSphere, dualizeSphere, truncDome, classHubs } from '../../src/geodesic/math';

describe('base polyhedron seeds', () => {
  it('icosahedron V1 has 12 verts / 20 faces', () => {
    const s = genSphere(1, 5, 'icosahedron');
    expect(s.verts.length).toBe(12);
    expect(s.faces.length).toBe(20);
  });

  it('octahedron V1 has 6 verts / 8 faces', () => {
    const s = genSphere(1, 5, 'octahedron');
    expect(s.verts.length).toBe(6);
    expect(s.faces.length).toBe(8);
  });

  it('tetrahedron V1 has 4 verts / 4 faces', () => {
    const s = genSphere(1, 5, 'tetrahedron');
    expect(s.verts.length).toBe(4);
    expect(s.faces.length).toBe(4);
  });

  it('subdivision multiplies faces by frequency²', () => {
    for (const base of ['icosahedron', 'octahedron', 'tetrahedron'] as const) {
      const v1 = genSphere(1, 5, base);
      const v2 = genSphere(2, 5, base);
      const v3 = genSphere(3, 5, base);
      expect(v2.faces.length).toBe(v1.faces.length * 4);
      expect(v3.faces.length).toBe(v1.faces.length * 9);
      // every vertex lies on the sphere
      for (const p of v2.verts) expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(5, 4);
    }
  });

  it('goldberg dual: icosahedron V1 → dodecahedron (12 pentagons, all 3-valent)', () => {
    const ico = genSphere(1, 5, 'icosahedron'); // 12 v, 20 f, 30 e
    const dual = dualizeSphere(ico);
    expect(dual.verts.length).toBe(20); // one per original face
    expect(dual.faces.length).toBe(12); // one per original vertex
    expect(dual.edges.length).toBe(30); // one per original edge
    expect(dual.faces.every((f) => f.length === 5)).toBe(true); // pentagons
    expect(dual.adj.every((a) => a.length === 3)).toBe(true); // every hub 3-way
  });

  it('goldberg dual is all-3-valent across seeds and frequencies', () => {
    for (const base of ['icosahedron', 'octahedron', 'tetrahedron'] as const) {
      for (const freq of [1, 2, 3]) {
        const dual = dualizeSphere(genSphere(freq, 5, base));
        expect(dual.adj.every((a) => a.length === 3), `${base} V${freq}`).toBe(true);
        expect(dual.verts.length, `${base} V${freq}`).toBe(genSphere(freq, 5, base).faces.length);
      }
    }
  });

  it('goldberg dome classifies into hubs', () => {
    const dual = dualizeSphere(genSphere(3, 5, 'icosahedron'));
    const dome = truncDome(dual, 0.625, 5, true, false, 2, 4);
    const hubs = classHubs(dome);
    expect(hubs.length).toBeGreaterThan(0);
    expect(dome.verts.length).toBeGreaterThan(0);
  });

  it('every base solid yields a classifiable truncated dome', () => {
    for (const base of ['icosahedron', 'octahedron', 'tetrahedron'] as const) {
      const sp = genSphere(2, 5, base);
      const dome = truncDome(sp, 0.625, 5, true, false, 2, 4);
      const hubs = classHubs(dome);
      expect(hubs.length, base).toBeGreaterThan(0);
      expect(dome.verts.length, base).toBeGreaterThan(0);
      expect(dome.edges.length, base).toBeGreaterThan(0);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { genSphere, truncDome, classHubs, computeStrutTypes } from '../../src/geodesic/math';
import { DOME_RADIUS, type BaseSolid } from '../../src/types';

const BASES: BaseSolid[] = ['icosahedron', 'octahedron', 'tetrahedron'];

/** Full sphere as DomeData (ratio 1, no flat-base snap) for pure-geometry checks. */
function fullSphere(freq: number, base: BaseSolid) {
  const sp = genSphere(freq, DOME_RADIUS, base);
  return truncDome(sp, 1, DOME_RADIUS, false, false, 2, 4);
}

describe('Euler characteristic (V − E + F = 2)', () => {
  for (const base of BASES) {
    for (const freq of [1, 2, 3]) {
      it(`holds for ${base} V${freq}`, () => {
        const sp = genSphere(freq, DOME_RADIUS, base);
        expect(sp.verts.length - sp.edges.length + sp.faces.length).toBe(2);
      });
    }
  }
});

describe('geodesic chord factors (ground truth)', () => {
  it('V1 icosphere has a single strut length × 30', () => {
    const struts = computeStrutTypes(fullSphere(1, 'icosahedron'), 4);
    expect(struts.length).toBe(1);
    expect(struts[0].count).toBe(30);
  });

  it('V2 icosphere has exactly two strut lengths in the canonical ~0.884 ratio', () => {
    const struts = computeStrutTypes(fullSphere(2, 'icosahedron'), 4);
    expect(struts.length).toBe(2);
    // 120 edges total in a 2V icosahedron.
    expect(struts.reduce((s, t) => s + t.count, 0)).toBe(120);
    // Canonical 2V chord-factor ratio 0.5465/0.6180 ≈ 0.8843.
    const ratio = struts[0].length / struts[1].length;
    expect(ratio).toBeCloseTo(0.8843, 2);
  });
});

describe('hub strut angles (ground truth)', () => {
  it('V1 icosphere hubs are 5-valent with ~60° adjacent struts (equilateral faces)', () => {
    const hubs = classHubs(fullSphere(1, 'icosahedron'));
    expect(hubs.length).toBe(1);
    expect(hubs[0].val).toBe(5);
    expect(hubs[0].angs[0]).toBeCloseTo(60, 0);
  });

  it('V1 octahedron hubs are 4-valent with 60° and 90° strut pairs', () => {
    const hubs = classHubs(fullSphere(1, 'octahedron'));
    expect(hubs[0].val).toBe(4);
    expect(hubs[0].angs[0]).toBeCloseTo(60, 0);
    expect(hubs[0].angs[hubs[0].angs.length - 1]).toBeCloseTo(90, 0);
  });
});

describe('cut length accounts for socket seating', () => {
  it('subtracts both socket floor insets from the chord', () => {
    const dome = fullSphere(2, 'icosahedron');
    const vertexSocket = dome.verts.map(() => ({ floorMm: 36, seatMm: 35 }));
    const struts = computeStrutTypes(dome, 4, { vertexSocket });
    for (const s of struts) {
      expect(s.cutLength).toBeCloseTo(s.length - 0.072, 4);
      expect(s.insertionDepthMm).toBeCloseTo(35, 3);
    }
  });

  it('clusters near-identical lengths into one buildable cut', () => {
    const dome = fullSphere(1, 'icosahedron');
    // All 30 struts identical; even with a 1 mm cluster tolerance → one type.
    const struts = computeStrutTypes(dome, 4, { clusterToleranceM: 0.001 });
    expect(struts.length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { genSphere, truncDome, classHubs, computeStrutTypes, strutTableCsv } from '../../src/geodesic/math';
import { DOME_RADIUS } from '../../src/types';

describe('genSphere', () => {
  it('generates correct vertex count for V1', () => {
    const sp = genSphere(1, DOME_RADIUS);
    expect(sp.verts.length).toBe(12);
    expect(sp.faces.length).toBe(20);
  });

  it('generates more geometry for V2', () => {
    const v1 = genSphere(1, DOME_RADIUS);
    const v2 = genSphere(2, DOME_RADIUS);
    expect(v2.verts.length).toBeGreaterThan(v1.verts.length);
    expect(v2.edges.length).toBeGreaterThan(v1.edges.length);
  });
});

describe('truncDome', () => {
  it('truncates sphere to fewer vertices', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.625, DOME_RADIUS, true, false, 2, 4);
    expect(dome.verts.length).toBeLessThan(sp.verts.length);
    expect(dome.yT).toBeDefined();
  });

  it('removes geometry when door is enabled', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const noDoor = truncDome(sp, 0.625, DOME_RADIUS, true, false, 2, 4);
    const withDoor = truncDome(sp, 0.625, DOME_RADIUS, true, true, 2, 4);
    expect(withDoor.verts.length).toBeLessThanOrEqual(noDoor.verts.length);
  });
});

describe('classHubs', () => {
  it('groups hubs by valence and angle signature', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.625, DOME_RADIUS, true, false, 2, 4);
    const hubs = classHubs(dome);
    expect(hubs.length).toBeGreaterThan(0);
    const totalAssigned = hubs.reduce((s, h) => s + h.verts.length, 0);
    expect(totalAssigned).toBeGreaterThan(0);
    hubs.forEach((h, i) => {
      expect(h.label).toBe(`H${i + 1}`);
      expect(h.color).toBeTruthy();
    });
  });

  it('deduplicates identical hub signatures', () => {
    const sp = genSphere(1, DOME_RADIUS);
    const dome = truncDome(sp, 0.5, DOME_RADIUS, true, false, 2, 4);
    const hubs = classHubs(dome);
    const sigs = new Set(hubs.map((h) => `${h.val}:${h.angs.join(',')}`));
    expect(sigs.size).toBe(hubs.length);
  });
});

describe('computeStrutTypes', () => {
  it('returns sorted unique strut lengths', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.625, DOME_RADIUS, true, false, 2, 4);
    const struts = computeStrutTypes(dome, 4);
    expect(struts.length).toBeGreaterThan(0);
    for (let i = 1; i < struts.length; i++) {
      expect(struts[i].length).toBeGreaterThanOrEqual(struts[i - 1].length);
    }
    const csv = strutTableCsv(struts, 'test');
    expect(csv).toContain('label,length_m,count,material');
  });
});

import { describe, it, expect } from 'vitest';
import { optimizeStickCount } from '../../src/guides/material';
import { importDesignJson, normalizeSettings } from '../../src/storage/settings-schema';
import { hubParamsFingerprint } from '../../src/utils/cache-key';
import { estimatePlatePack } from '../../src/geometry/printability';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('50-improvements utilities', () => {
  it('optimizeStickCount bins lengths', () => {
    expect(optimizeStickCount([2, 2, 2], 2.4, 10)).toBe(3);
  });

  it('settings schema migrates v1 fields', () => {
    const s = normalizeSettings({ tol: 0.5, freq: 3 });
    expect(s.tolX).toBe(0.5);
    expect(s.previewQuality).toBe('balanced');
  });

  it('imports design JSON', () => {
    const s = importDesignJson(JSON.stringify({ settings: { freq: 1, diam: 3 } }));
    expect(s.freq).toBe(1);
    expect(s.diam).toBe(3);
  });

  it('stable hub param fingerprint is deterministic', () => {
    const base = { matType: 'round' as const, wall: 5, detail: 48, rodD: 26.7, lumW: 19, lumH: 38, tol: 0.3, bodyScale: 1.6, chamfer: 2, printFoot: true, footMargin: 6 };
    const a = hubParamsFingerprint({ ...DEFAULT_SETTINGS, ...base });
    const b = hubParamsFingerprint({ ...DEFAULT_SETTINGS, ...base });
    expect(a).toBe(b);
  });

  it('plate pack warns when too deep', () => {
    const pack = estimatePlatePack(
      [{ val: 6, angs: [], verts: [0], isBase: false, dirs: [], vPos: [], label: 'H1', color: '#fff' }],
      100,
      80,
      50
    );
    expect(pack.plateFits).toBe(false);
  });
});

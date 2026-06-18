import { describe, it, expect } from 'vitest';
import {
  MATERIAL_CATALOG,
  getMaterialProfile,
  applyMaterialProfile,
} from '../../src/materials/catalog';

describe('material catalog', () => {
  it('includes standard 1x2 lumber actual dimensions', () => {
    const oneByTwo = getMaterialProfile('lumber-1x2');
    expect(oneByTwo).toBeDefined();
    expect(oneByTwo!.lumW).toBeCloseTo(19.05, 0);
    expect(oneByTwo!.lumH).toBeCloseTo(38.1, 0);
    expect(oneByTwo!.matType).toBe('rect');
  });

  it('includes standard 2x4 lumber actual dimensions', () => {
    const twoByFour = getMaterialProfile('lumber-2x4');
    expect(twoByFour).toBeDefined();
    expect(twoByFour!.lumW).toBeCloseTo(38.1, 0);
    expect(twoByFour!.lumH).toBeCloseTo(88.9, 0);
    expect(twoByFour!.matType).toBe('rect');
  });

  it('includes 3/4 inch PVC Sch40 OD', () => {
    const pvc = getMaterialProfile('pvc-0.75');
    expect(pvc!.rodD).toBeCloseTo(26.67, 1);
  });

  it('includes EMT and solid rod profiles', () => {
    expect(getMaterialProfile('emt-1')!.rodD).toBeCloseTo(29.46, 1);
    expect(getMaterialProfile('rod-0.5in')!.rodD).toBeCloseTo(12.7, 1);
  });

  it('applyMaterialProfile sets tolerance and wall defaults', () => {
    const applied = applyMaterialProfile(MATERIAL_CATALOG[0]);
    expect(applied.tol).toBeGreaterThan(0);
    expect(applied.wall).toBeGreaterThan(0);
    expect(applied.materialStockId).toBe(MATERIAL_CATALOG[0].id);
  });
});

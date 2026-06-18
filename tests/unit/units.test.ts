import { describe, it, expect } from 'vitest';
import {
  mmToIn,
  inToMm,
  mToFt,
  ftToM,
  mmToDisplay,
  displayToMm,
  mToDisplay,
  displayToM,
  formatMm,
  formatMeters,
  clampDoorWidth,
  defaultUnitSystem,
} from '../../src/units';

describe('units', () => {
  it('converts mm and inches', () => {
    expect(mmToIn(25.4)).toBeCloseTo(1, 5);
    expect(inToMm(1)).toBeCloseTo(25.4, 5);
  });

  it('converts meters and feet', () => {
    expect(mToFt(3.048)).toBeCloseTo(10, 5);
    expect(ftToM(10)).toBeCloseTo(3.048, 3);
  });

  it('round-trips display values', () => {
    expect(displayToMm(mmToDisplay(38.1, 'imperial'), 'imperial')).toBeCloseTo(38.1, 2);
    expect(displayToM(mToDisplay(3, 'imperial'), 'imperial')).toBeCloseTo(3, 2);
  });

  it('formats labels for each system', () => {
    expect(formatMm(6, 'metric')).toBe('6.00 mm');
    expect(formatMm(6, 'imperial')).toMatch(/in$/);
    expect(formatMeters(3, 'metric')).toBe('3.0 m');
    expect(formatMeters(3, 'imperial')).toMatch(/ft$/);
  });

  it('clamps door width to dome', () => {
    expect(clampDoorWidth(8, 3)).toBeCloseTo(2.55, 2);
    expect(clampDoorWidth(0.1, 4)).toBe(0.25);
  });

  it('defaultUnitSystem returns a valid system', () => {
    expect(['metric', 'imperial']).toContain(defaultUnitSystem());
  });
});

export type UnitSystem = 'metric' | 'imperial';

const MM_PER_IN = 25.4;
const M_PER_FT = 0.3048;

export function defaultUnitSystem(): UnitSystem {
  return 'metric';
}

export function mmToIn(mm: number): number {
  return mm / MM_PER_IN;
}

export function inToMm(inches: number): number {
  return inches * MM_PER_IN;
}

export function mToFt(m: number): number {
  return m / M_PER_FT;
}

export function ftToM(ft: number): number {
  return ft * M_PER_FT;
}

/** Small dimensions stored internally as mm. */
export function mmToDisplay(mm: number, units: UnitSystem): number {
  return units === 'metric' ? mm : mmToIn(mm);
}

export function displayToMm(value: number, units: UnitSystem): number {
  return units === 'metric' ? value : inToMm(value);
}

/** Dome / door dimensions stored internally as meters. */
export function mToDisplay(m: number, units: UnitSystem): number {
  return units === 'metric' ? m : mToFt(m);
}

export function displayToM(value: number, units: UnitSystem): number {
  return units === 'metric' ? value : ftToM(value);
}

export function formatMm(mm: number, units: UnitSystem, decimals?: number): string {
  if (units === 'metric') {
    const d = decimals ?? (mm < 10 ? 2 : 1);
    return `${mm.toFixed(d)} mm`;
  }
  const inches = mmToIn(mm);
  const d = decimals ?? (inches < 1 ? 3 : 2);
  return `${inches.toFixed(d)} in`;
}

export function formatMeters(m: number, units: UnitSystem, decimals?: number): string {
  if (units === 'metric') {
    return `${m.toFixed(decimals ?? 1)} m`;
  }
  const ft = mToFt(m);
  return `${ft.toFixed(decimals ?? (ft >= 10 ? 0 : 1))} ft`;
}

export function smallUnitLabel(units: UnitSystem): string {
  return units === 'metric' ? 'mm' : 'in';
}

export function distanceUnitLabel(units: UnitSystem): string {
  return units === 'metric' ? 'm' : 'ft';
}

export function smallInputStep(units: UnitSystem): number {
  return units === 'metric' ? 0.5 : 0.0625;
}

export function distanceInputStep(units: UnitSystem): number {
  return units === 'metric' ? 0.25 : 0.5;
}

export function clampDoorWidth(doorM: number, domeM: number): number {
  const max = Math.max(0.5, domeM * 0.85);
  return Math.min(Math.max(0.25, doorM), max);
}

export function roundDisplay(value: number, units: UnitSystem, kind: 'small' | 'distance'): number {
  if (kind === 'distance') {
    return Math.round(value * (units === 'metric' ? 100 : 10)) / (units === 'metric' ? 100 : 10);
  }
  return Math.round(value * (units === 'metric' ? 10 : 100)) / (units === 'metric' ? 10 : 100);
}

import type { MaterialProfile } from '../materials/catalog';
import { getMaterialsByCategory, CATEGORY_LABELS } from '../materials/catalog';
import type { UnitSystem } from '../units';
import {
  formatMm,
  formatMeters,
  mmToIn,
  mmToDisplay,
  mToDisplay,
  displayToMm,
  displayToM,
  smallInputStep,
  distanceInputStep,
  clampDoorWidth,
  roundDisplay,
} from '../units';
import type { AppSettings, MaterialType } from '../types';

export function formatMaterialOption(profile: MaterialProfile, units: UnitSystem): string {
  if (profile.matType === 'rect' && profile.lumW && profile.lumH) {
    if (units === 'imperial') {
      return `${profile.nominal} (${mmToIn(profile.lumW).toFixed(2)}" × ${mmToIn(profile.lumH).toFixed(2)}")`;
    }
    return `${profile.nominal} (${profile.lumW.toFixed(0)} × ${profile.lumH.toFixed(0)} mm)`;
  }
  if (profile.rodD) {
    if (units === 'imperial') {
      return `${profile.name} (OD ${mmToIn(profile.rodD).toFixed(3)} in)`;
    }
    return `${profile.name} (OD ${profile.rodD.toFixed(1)} mm)`;
  }
  return profile.name;
}

export function formatMaterialNote(profile: MaterialProfile, units: UnitSystem): string {
  const size =
    profile.matType === 'rect' && profile.lumW && profile.lumH
      ? units === 'imperial'
        ? `${profile.nominal} actual ${mmToIn(profile.lumW).toFixed(2)}" × ${mmToIn(profile.lumH).toFixed(2)}" (${profile.lumW.toFixed(0)} × ${profile.lumH.toFixed(0)} mm)`
        : `${profile.nominal} actual ${profile.lumW.toFixed(1)} × ${profile.lumH.toFixed(1)} mm (${mmToIn(profile.lumW).toFixed(2)}" × ${mmToIn(profile.lumH).toFixed(2)}")`
      : profile.rodD
        ? units === 'imperial'
          ? `OD ${mmToIn(profile.rodD).toFixed(3)} in (${profile.rodD.toFixed(1)} mm)`
          : `OD ${profile.rodD.toFixed(1)} mm (${mmToIn(profile.rodD).toFixed(3)} in)`
        : profile.actualLabel;
  return profile.notes ? `${size} · ${profile.notes}` : size;
}

const LABELS: Record<string, { metric: string; imperial: string }> = {
  'label-diameter': { metric: 'Dome Diameter (m)', imperial: 'Dome Diameter (ft)' },
  'label-door-width': { metric: 'Door Width (m)', imperial: 'Door Width (ft)' },
  'label-rod-diam': { metric: 'Tube Outer Diameter (mm)', imperial: 'Tube Outer Diameter (in)' },
  'label-lum-w': { metric: 'Lumber Width (mm)', imperial: 'Lumber Width (in)' },
  'label-lum-h': { metric: 'Lumber Depth (mm)', imperial: 'Lumber Depth (in)' },
  'label-wall': { metric: 'Wall Thickness (mm)', imperial: 'Wall Thickness (in)' },
  'label-tolerance': { metric: 'Printer Tolerance', imperial: 'Printer Tolerance' },
  'label-foot-margin': { metric: 'Build Foot Margin (mm)', imperial: 'Build Foot Margin (in)' },
  'label-base-thickness': { metric: 'Base Thickness (mm)', imperial: 'Base Thickness (in)' },
  'label-foot-margin-insp': { metric: 'Foot Margin (mm)', imperial: 'Foot Margin (in)' },
  'label-hub-chamfer': { metric: 'Entry Bevel (mm)', imperial: 'Entry Bevel (in)' },
  'label-stock-length': { metric: 'Stock Length (m)', imperial: 'Stock Length (ft)' },
};

export function applyUnitLabels(units: UnitSystem): void {
  for (const [id, text] of Object.entries(LABELS)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text[units];
  }
}

export function setUnitToggle(units: UnitSystem): void {
  const metric = document.getElementById('unit-metric') as HTMLInputElement | null;
  const imperial = document.getElementById('unit-imperial') as HTMLInputElement | null;
  if (metric) metric.checked = units === 'metric';
  if (imperial) imperial.checked = units === 'imperial';
}

export function refreshMaterialStockSelect(
  stockId: string,
  units: UnitSystem,
  matType?: MaterialType
): void {
  const stockSelect = document.getElementById('material-stock') as HTMLSelectElement | null;
  if (!stockSelect) return;
  stockSelect.innerHTML = '';
  for (const [cat, items] of getMaterialsByCategory(matType)) {
    const group = document.createElement('optgroup');
    group.label = CATEGORY_LABELS[cat];
    for (const m of items) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = formatMaterialOption(m, units);
      group.appendChild(opt);
    }
    stockSelect.appendChild(group);
  }
  stockSelect.value = stockId;
}

function setInputAttrs(
  id: string,
  attrs: { min?: number; max?: number; step?: number; value?: number }
): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  if (attrs.min != null) el.min = String(attrs.min);
  if (attrs.max != null) el.max = String(attrs.max);
  if (attrs.step != null) el.step = String(attrs.step);
  if (attrs.value != null) el.value = String(attrs.value);
}

export function applyInputConstraints(s: AppSettings): void {
  const u = s.unitSystem;
  const doorMax = mToDisplay(Math.max(0.5, s.diam * 0.85), u);
  const doorMin = mToDisplay(0.25, u);

  if (u === 'metric') {
    setInputAttrs('diameter', { min: 1, max: 30, step: distanceInputStep(u), value: roundDisplay(mToDisplay(s.diam, u), u, 'distance') });
    setInputAttrs('door-width', { min: doorMin, max: doorMax, step: distanceInputStep(u), value: roundDisplay(mToDisplay(s.doorW, u), u, 'distance') });
    setInputAttrs('rodDiameter', { min: 5, max: 80, step: 0.1, value: roundDisplay(mmToDisplay(s.rodD, u), u, 'small') });
    setInputAttrs('lumberW', { min: 10, max: 150, step: 0.1, value: roundDisplay(mmToDisplay(s.lumW, u), u, 'small') });
    setInputAttrs('lumberH', { min: 20, max: 200, step: 0.1, value: roundDisplay(mmToDisplay(s.lumH, u), u, 'small') });
    setInputAttrs('wallThickness', { min: 2, max: 15, step: 0.5, value: roundDisplay(mmToDisplay(s.wall, u), u, 'small') });
  } else {
    setInputAttrs('diameter', { min: 3.3, max: 98, step: distanceInputStep(u), value: roundDisplay(mToDisplay(s.diam, u), u, 'distance') });
    setInputAttrs('door-width', { min: doorMin, max: doorMax, step: distanceInputStep(u), value: roundDisplay(mToDisplay(s.doorW, u), u, 'distance') });
    setInputAttrs('rodDiameter', { min: 0.2, max: 3.15, step: 0.01, value: roundDisplay(mmToDisplay(s.rodD, u), u, 'small') });
    setInputAttrs('lumberW', { min: 0.4, max: 6, step: 0.01, value: roundDisplay(mmToDisplay(s.lumW, u), u, 'small') });
    setInputAttrs('lumberH', { min: 0.8, max: 8, step: 0.01, value: roundDisplay(mmToDisplay(s.lumH, u), u, 'small') });
    setInputAttrs('wallThickness', { min: 0.08, max: 0.6, step: 0.01, value: roundDisplay(mmToDisplay(s.wall, u), u, 'small') });
  }

  const doorGroup = document.getElementById('door-width-group');
  if (doorGroup) doorGroup.style.display = s.door ? 'flex' : 'none';

  const dualW = document.getElementById('lum-w-dual');
  const dualH = document.getElementById('lum-h-dual');
  if (dualW) dualW.textContent = u === 'metric' ? `≈ ${mmToIn(s.lumW).toFixed(2)} in` : `≈ ${s.lumW.toFixed(1)} mm`;
  if (dualH) dualH.textContent = u === 'metric' ? `≈ ${mmToIn(s.lumH).toFixed(2)} in` : `≈ ${s.lumH.toFixed(1)} mm`;

  const rodDual = document.getElementById('rod-d-dual');
  if (rodDual) rodDual.textContent = u === 'metric' ? `≈ ${mmToIn(s.rodD).toFixed(3)} in` : `≈ ${s.rodD.toFixed(1)} mm`;
}

export function formatSliderValues(s: AppSettings): void {
  const u = s.unitSystem;
  const tolVal = document.getElementById('tol-val');
  if (tolVal) tolVal.textContent = formatMm(s.tol, u, 2);
  const footVal = document.getElementById('foot-margin-val');
  if (footVal) footVal.textContent = formatMm(s.footMargin, u, 1);
  const footInspVal = document.getElementById('foot-margin-insp-val');
  if (footInspVal) footInspVal.textContent = formatMm(s.footMargin, u, 1);
  const baseThVal = document.getElementById('base-thickness-val');
  if (baseThVal) baseThVal.textContent = formatMm(s.baseThickness, u, 1);
  const chamferVal = document.getElementById('hub-chamfer-val');
  if (chamferVal) chamferVal.textContent = formatMm(s.chamfer, u, 1);
}

export function readDistanceInput(id: string, units: UnitSystem): number {
  const raw = +(document.getElementById(id) as HTMLInputElement).value;
  return displayToM(raw, units);
}

export function readSmallInput(id: string, units: UnitSystem): number {
  const raw = +(document.getElementById(id) as HTMLInputElement).value;
  return displayToMm(raw, units);
}

export { formatMm, formatMeters, clampDoorWidth };

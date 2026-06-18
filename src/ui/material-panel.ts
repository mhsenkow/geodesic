import type { AppSettings, StrutType, UnitSystem } from '../types';
import type { MaterialEstimate } from '../guides/material';
import { formatMeters } from '../units';

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Scaled-bar cut list, longest strut first. */
export function renderCutList(strutTypes: StrutType[], units: UnitSystem): void {
  const el = document.getElementById('cut-list');
  if (!el) return;
  if (!strutTypes.length) {
    el.innerHTML = '<p class="hint-text">No struts in this dome.</p>';
    return;
  }
  const sorted = [...strutTypes].sort((a, b) => b.length - a.length);
  const max = sorted[0].length || 1;
  const rows = sorted
    .map((s) => {
      const pct = Math.max(3, (s.length / max) * 100);
      return `<div class="strut-row"><span class="strut-label">${s.label}</span><div class="strut-bar-track"><div class="strut-bar" style="width:${pct.toFixed(1)}%"></div></div><span class="strut-len">${formatMeters(
        s.length,
        units,
        2
      )}</span><span class="strut-count">×${s.count}</span></div>`;
    })
    .join('');
  const totalLen = strutTypes.reduce((a, s) => a + s.length * s.count, 0);
  const totalCount = strutTypes.reduce((a, s) => a + s.count, 0);
  el.innerHTML =
    rows +
    `<div class="cut-list-total"><span>${totalCount} struts · ${strutTypes.length} lengths</span><b>${formatMeters(
      totalLen,
      units,
      1
    )} total</b></div>`;
}

function readoutRows(rows: Array<[string, string, boolean?]>): string {
  return rows
    .map(
      ([label, value, isCost]) =>
        `<div class="mat-row${isCost ? ' mat-cost' : ''}"><span>${label}</span><b>${value}</b></div>`
    )
    .join('');
}

export function renderMaterialEstimate(est: MaterialEstimate, settings: AppSettings): void {
  const units = settings.unitSystem;
  const kindEl = document.getElementById('mat-stock-kind');
  if (kindEl) kindEl.textContent = settings.matType === 'round' ? 'Tube' : 'Timber';

  const stockEl = document.getElementById('mat-stock-readout');
  if (stockEl) {
    const stickLabel = formatMeters(settings.stockLength, units, 1);
    stockEl.innerHTML = readoutRows([
      ['Total length', formatMeters(est.totalStrutLengthM, units, 1)],
      ['Longest strut', formatMeters(est.longestStrutM, units, 2)],
      ['Sticks needed', `${est.sticksNeeded} × ${stickLabel}`],
      ['Stock cost', money(est.stockCost), true],
    ]);
  }

  const printEl = document.getElementById('mat-print-readout');
  if (printEl) {
    printEl.innerHTML = readoutRows([
      ['Hubs to print', `${est.hubCount}`],
      ['Print volume', `${est.printVolumeCm3.toFixed(1)} cm³`],
      ['Filament', `${Math.round(est.printMassG)} g · ${est.filamentLengthM.toFixed(1)} m`],
      ['Print cost', money(est.printCost), true],
    ]);
  }

  const totalEl = document.getElementById('mat-total-readout');
  if (totalEl) {
    totalEl.innerHTML = `<span>Estimated total</span><b>${money(est.totalCost)}</b>`;
  }
}

/** Highlight the quick-pick chip whose value matches the current slider. */
export function refreshChipStates(): void {
  document.querySelectorAll<HTMLElement>('.chip-row').forEach((row) => {
    const targetId = row.getAttribute('data-target');
    if (!targetId) return;
    const slider = document.getElementById(targetId) as HTMLInputElement | null;
    if (!slider) return;
    const cur = parseFloat(slider.value);
    row.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
      const v = parseFloat(chip.getAttribute('data-value') ?? 'NaN');
      chip.classList.toggle('active', Math.abs(v - cur) < 0.001);
    });
  });
}

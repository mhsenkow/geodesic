import type { AppSettings, StrutType, UnitSystem } from '../types';
import type { MaterialEstimate } from '../guides/material';
import { formatMeters } from '../units';

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Show/hide the on-canvas length legend and fill its min/max labels. */
function updateStrutLegend(strutTypes: StrutType[], units: UnitSystem, colorByLength: boolean): void {
  const legend = document.getElementById('strut-legend');
  if (!legend) return;
  const show = colorByLength && strutTypes.length > 0;
  legend.toggleAttribute('hidden', !show);
  legend.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (!show) return;
  const lengths = strutTypes.map((s) => s.length);
  const minEl = document.getElementById('strut-legend-min');
  const maxEl = document.getElementById('strut-legend-max');
  if (minEl) minEl.textContent = formatMeters(Math.min(...lengths), units, 2);
  if (maxEl) maxEl.textContent = formatMeters(Math.max(...lengths), units, 2);
}

/** Scaled-bar cut list, longest strut first. */
export function renderCutList(strutTypes: StrutType[], units: UnitSystem, colorByLength = false): void {
  updateStrutLegend(strutTypes, units, colorByLength);
  const el = document.getElementById('cut-list');
  if (!el) return;
  if (!strutTypes.length) {
    el.innerHTML = '<p class="hint-text">No struts in this dome.</p>';
    return;
  }
  const sorted = [...strutTypes].sort((a, b) => b.cutLength - a.cutLength);
  const max = sorted[0].cutLength || 1;
  const rows = sorted
    .map((s) => {
      const pct = Math.max(3, (s.cutLength / max) * 100);
      const pairs = s.hubPairs?.length ? ` · joins ${s.hubPairs.join(', ')}` : '';
      const bevel = s.seatBevelDeg != null ? ` · seat bevel ~${s.seatBevelDeg.toFixed(0)}°` : '';
      const tip = `Cut length (saw to this). Center-to-center ${formatMeters(s.length, units, 3)} · seats ~${s.insertionDepthMm.toFixed(0)} mm per end${bevel}${pairs}`;
      return `<div class="strut-row" title="${tip}"><span class="strut-label">${s.label}</span><div class="strut-bar-track"><div class="strut-bar" style="width:${pct.toFixed(1)}%"></div></div><span class="strut-len">${formatMeters(
        s.cutLength,
        units,
        2
      )}</span><span class="strut-count">×${s.count}</span></div>`;
    })
    .join('');
  const totalLen = strutTypes.reduce((a, s) => a + s.cutLength * s.count, 0);
  const totalCount = strutTypes.reduce((a, s) => a + s.count, 0);
  el.innerHTML =
    rows +
    `<div class="cut-list-total"><span>${totalCount} struts · ${strutTypes.length} cut lengths</span><b>${formatMeters(
      totalLen,
      units,
      1
    )} to cut</b></div>` +
    `<p class="hint-text">Lengths are <b>cut lengths</b> — already account for how far each strut seats into a hub. Hover a row for center-to-center.</p>`;
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
    stockEl.innerHTML =
      readoutRows([
        ['Total to cut', formatMeters(est.totalCutLengthM, units, 1)],
        ['Longest cut', formatMeters(est.longestCutM, units, 2)],
        ['Sticks needed', `${est.sticksNeeded} × ${stickLabel}`],
        ['Stock cost', money(est.stockCost), true],
      ]) +
      (est.oversizeStrutsM.length
        ? `<p class="hint-text" style="color:var(--warn,#ff6b35)">⚠ ${est.oversizeStrutsM.length} strut${est.oversizeStrutsM.length > 1 ? 's' : ''} longer than one ${stickLabel} stick (up to ${formatMeters(Math.max(...est.oversizeStrutsM), units, 2)}) — splice with couplers or use longer stock.</p>`
        : '') +
      (!est.spanOk && est.maxSpanM != null
        ? `<p class="hint-text" style="color:var(--warn,#ff6b35)">⚠ Longest strut ${formatMeters(est.longestStrutM, units, 2)} exceeds the safe span for this material (~${formatMeters(est.maxSpanM, units, 2)}). Use stiffer/larger stock, raise frequency, or shrink the dome.</p>`
        : '');
  }

  const printEl = document.getElementById('mat-print-readout');
  if (printEl) {
    printEl.innerHTML = readoutRows([
      ['Hubs to print', `${est.hubCount}`],
      ['Solid volume', `${est.printVolumeCm3.toFixed(0)} cm³`],
      [`Filament @ ${settings.printInfillPct}%`, `${Math.round(est.printMassG)} g · ${est.filamentLengthM.toFixed(1)} m`],
      ['Print cost', money(est.printCost), true],
    ]);
  }

  const totalEl = document.getElementById('mat-total-readout');
  if (totalEl) {
    const weight = est.structureMassKg > 0 ? ` · ~${est.structureMassKg.toFixed(1)} kg` : '';
    totalEl.innerHTML = `<span>Estimated total${weight}</span><b>${money(est.totalCost)}</b>`;
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

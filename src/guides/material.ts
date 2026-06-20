import * as THREE from 'three';
import type { AppSettings, DomeData, HubParams, HubType, StrutType } from '../types';
import { createHub } from '../geometry/hub-geometry';
import { hubTypeFingerprint } from '../utils/cache-key';
import { getMaterialProfile } from '../materials/catalog';

/** Cross-sectional area (mm²) of one stock stick, accounting for hollow tubes. */
function stockCrossSectionMm2(settings: AppSettings): number {
  const profile = getMaterialProfile(settings.materialStockId);
  if (settings.matType === 'rect') return Math.max(1, settings.lumW * settings.lumH);
  const r = settings.rodD / 2;
  const wall = profile?.stockWallMm;
  if (wall && wall > 0 && wall < r) {
    const ri = r - wall;
    return Math.PI * (r * r - ri * ri);
  }
  return Math.PI * r * r;
}

/** Enclosed volume (mm³) of a closed mesh via the signed-tetrahedron sum. */
export function meshVolumeMm3(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let vol = 0;
  const accum = (i0: number, i1: number, i2: number) => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    vol += a.dot(b.clone().cross(c)) / 6;
  };
  const index = geo.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      accum(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) accum(i, i + 1, i + 2);
  }
  return Math.abs(vol);
}

const FILAMENT_DIAMETER_DEFAULT = 1.75;
const VOL_CACHE_MAX = 64;
const volCache = new Map<string, number>();

function hubVolumeKey(ht: HubType, p: HubParams): string {
  return hubTypeFingerprint(ht, p);
}

export function clearVolCache(): void {
  volCache.clear();
}

function cacheVol(key: string, v: number): number {
  if (volCache.size >= VOL_CACHE_MAX) {
    const first = volCache.keys().next().value;
    if (first) volCache.delete(first);
  }
  volCache.set(key, v);
  return v;
}

export interface CutPlan {
  /** Number of stock sticks required. */
  sticks: number;
  /** Per-stick list of piece lengths (m) assigned to it. */
  layout: number[][];
  /** Leftover offcut length (m) on each stick. */
  offcuts: number[];
  /** Pieces that do not fit a single stick even on their own (need splicing). */
  oversize: number[];
}

/**
 * First-fit decreasing 1D cut optimizer. Each cut consumes a fixed saw `kerfM`
 * plus a proportional `wastePct` allowance. Returns the full per-stick layout
 * so callers can emit a real cut sheet, not just a count.
 */
export function planCuts(
  lengthsM: number[],
  stockLenM: number,
  wastePct: number,
  kerfM = 0
): CutPlan {
  const empty: CutPlan = { sticks: 0, layout: [], offcuts: [], oversize: [] };
  if (!lengthsM.length || stockLenM <= 0) return empty;
  const waste = 1 + Math.max(0, wastePct) / 100;
  const kerf = Math.max(0, kerfM);
  const sorted = [...lengthsM].sort((a, b) => b - a);
  const bins: number[] = [];
  const layout: number[][] = [];
  const oversize: number[] = [];
  for (const len of sorted) {
    const need = len * waste + kerf;
    if (need > stockLenM) {
      oversize.push(len);
      continue;
    }
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] + need <= stockLenM) {
        bins[i] += need;
        layout[i].push(len);
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push(need);
      layout.push([len]);
    }
  }
  return {
    sticks: bins.length,
    layout,
    offcuts: bins.map((used) => Math.max(0, stockLenM - used)),
    oversize,
  };
}

/** First-fit decreasing stick count for 1D cut stock (thin wrapper over planCuts). */
export function optimizeStickCount(
  lengthsM: number[],
  stockLenM: number,
  wastePct: number,
  kerfM = 0
): number {
  return planCuts(lengthsM, stockLenM, wastePct, kerfM).sticks;
}

/** Printable solid volume (mm³) of one hub of this type — built once, cached. */
function hubPrintVolumeMm3(ht: HubType, dome: DomeData, p: HubParams): number {
  const key = hubVolumeKey(ht, p);
  const cached = volCache.get(key);
  if (cached !== undefined) return cached;
  let v = 0;
  try {
    const geo = createHub(ht.verts[0], dome, p);
    if (geo) {
      v = meshVolumeMm3(geo);
      geo.dispose();
    }
  } catch {
    v = 0;
  }
  return cacheVol(key, v);
}

export interface MaterialEstimate {
  /** Linear stock — sum of center-to-center strut lengths. */
  totalStrutLengthM: number;
  /** Sum of physical cut lengths (what you actually buy/cut). */
  totalCutLengthM: number;
  strutCount: number;
  /** Longest center-to-center span (structural reach). */
  longestStrutM: number;
  /** Longest physical cut length. */
  longestCutM: number;
  sticksNeeded: number;
  /** Full per-stick cut layout for a cut sheet. */
  cutPlan: CutPlan;
  /** Struts too long for a single stock stick — need splicing/couplers. */
  oversizeStrutsM: number[];
  stockCost: number;
  /** 3D print */
  hubCount: number;
  /** Solid model volume of all hubs (cm³). */
  printVolumeCm3: number;
  /** Infill-adjusted filament volume actually extruded (cm³). */
  filamentVolumeCm3: number;
  printMassG: number;
  filamentLengthM: number;
  printCost: number;
  /** Structure weight */
  strutMassKg: number;
  /** Struts + printed hubs, kg. */
  structureMassKg: number;
  /** Advisory safe span for the chosen material (m), or null if unknown. */
  maxSpanM: number | null;
  /** False when the longest strut exceeds the material's safe span. */
  spanOk: boolean;
  /** Combined */
  totalCost: number;
}

/** Walls/shell always print solid; only the interior is reduced by infill. */
const SHELL_FRACTION = 0.2;

/** Fixed saw kerf consumed per cut (m) — a blade eats material regardless of piece length. */
const STOCK_KERF_M = 0.003;

export function estimateMaterial(
  dome: DomeData,
  hubTypes: HubType[],
  strutTypes: StrutType[],
  hubParams: HubParams,
  settings: AppSettings
): MaterialEstimate {
  // ── Linear stock (tube / timber) ──────────────────────────────
  const totalStrutLengthM = strutTypes.reduce((s, t) => s + t.length * t.count, 0);
  const totalCutLengthM = strutTypes.reduce((s, t) => s + t.cutLength * t.count, 0);
  const strutCount = strutTypes.reduce((s, t) => s + t.count, 0);
  const longestStrutM = strutTypes.reduce((m, t) => Math.max(m, t.length), 0);
  const longestCutM = strutTypes.reduce((m, t) => Math.max(m, t.cutLength), 0);
  const stock = Math.max(0.1, settings.stockLength);
  const wastePct = Math.max(0, settings.stockWastePct);
  // You cut to the cut length, not the center-to-center span.
  const expanded: number[] = [];
  for (const t of strutTypes) {
    for (let i = 0; i < t.count; i++) expanded.push(t.cutLength);
  }
  const cutPlan = planCuts(expanded, stock, wastePct, STOCK_KERF_M);
  const sticksNeeded = cutPlan.sticks;
  const stockCost = sticksNeeded * Math.max(0, settings.stockPrice);

  // ── 3D print material ─────────────────────────────────────────
  const volParams: HubParams = {
    ...hubParams,
    printFrame: true,
    printFoot: hubParams.printFoot ?? true,
    domePreview: false,
    detail: Math.max(hubParams.detail, 48),
  };
  let printVolumeMm3 = 0;
  let hubCount = 0;
  for (const ht of hubTypes) {
    const v = hubPrintVolumeMm3(ht, dome, volParams);
    printVolumeMm3 += v * ht.verts.length;
    hubCount += ht.verts.length;
  }
  const printVolumeCm3 = printVolumeMm3 / 1000;
  // Effective filament = solid shell + infill-filled interior.
  const infill = Math.min(1, Math.max(0.05, settings.printInfillPct / 100));
  const fillFactor = SHELL_FRACTION + (1 - SHELL_FRACTION) * infill;
  const filamentVolumeMm3 = printVolumeMm3 * fillFactor;
  const filamentVolumeCm3 = filamentVolumeMm3 / 1000;
  const printMassG = filamentVolumeCm3 * Math.max(0.1, settings.filamentDensity);
  const filamentDia = settings.filamentDiameterMm ?? FILAMENT_DIAMETER_DEFAULT;
  const filamentArea = Math.PI * (filamentDia / 2) ** 2;
  const filamentLengthM = filamentArea > 0 ? filamentVolumeMm3 / filamentArea / 1000 : 0;
  const printCost = (printMassG / 1000) * Math.max(0, settings.filamentPrice);

  // ── Structure weight + span safety ────────────────────────────
  const profile = getMaterialProfile(settings.materialStockId);
  const areaM2 = stockCrossSectionMm2(settings) / 1e6;
  const density = profile?.densityKgM3 ?? 0;
  const strutMassKg = density > 0 ? areaM2 * totalCutLengthM * density : 0;
  const structureMassKg = strutMassKg + printMassG / 1000;
  const maxSpanM = profile?.maxSpanM ?? null;
  const spanOk = maxSpanM == null || longestStrutM <= maxSpanM;

  return {
    totalStrutLengthM,
    totalCutLengthM,
    strutCount,
    longestStrutM,
    longestCutM,
    sticksNeeded,
    cutPlan,
    oversizeStrutsM: cutPlan.oversize,
    stockCost,
    hubCount,
    printVolumeCm3,
    filamentVolumeCm3,
    printMassG,
    filamentLengthM,
    printCost,
    strutMassKg,
    structureMassKg,
    maxSpanM,
    spanOk,
    totalCost: stockCost + printCost,
  };
}

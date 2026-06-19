import * as THREE from 'three';
import type { AppSettings, DomeData, HubParams, HubType, StrutType } from '../types';
import { createHub } from '../geometry/hub-geometry';

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

const FILAMENT_DIAMETER_MM = 1.75;

const volCache = new Map<string, number>();

function hubVolumeKey(ht: HubType, p: HubParams): string {
  return `${ht.val}:${ht.angs.join(',')}:${ht.isBase}:${JSON.stringify(p)}`;
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
  volCache.set(key, v);
  return v;
}

export interface MaterialEstimate {
  /** Linear stock */
  totalStrutLengthM: number;
  strutCount: number;
  longestStrutM: number;
  sticksNeeded: number;
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
  /** Combined */
  totalCost: number;
}

/** Walls/shell always print solid; only the interior is reduced by infill. */
const SHELL_FRACTION = 0.2;

export function estimateMaterial(
  dome: DomeData,
  hubTypes: HubType[],
  strutTypes: StrutType[],
  hubParams: HubParams,
  settings: AppSettings
): MaterialEstimate {
  // ── Linear stock (tube / timber) ──────────────────────────────
  const totalStrutLengthM = strutTypes.reduce((s, t) => s + t.length * t.count, 0);
  const strutCount = strutTypes.reduce((s, t) => s + t.count, 0);
  const longestStrutM = strutTypes.reduce((m, t) => Math.max(m, t.length), 0);
  const stock = Math.max(0.1, settings.stockLength);
  const waste = 1 + Math.max(0, settings.stockWastePct) / 100;
  // A strut longer than the stock can't be cut from one stick — clamp usable length.
  const sticksNeeded =
    totalStrutLengthM > 0 ? Math.ceil((totalStrutLengthM * waste) / stock) : 0;
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
  const filamentArea = Math.PI * (FILAMENT_DIAMETER_MM / 2) ** 2; // mm²
  const filamentLengthM = filamentArea > 0 ? filamentVolumeMm3 / filamentArea / 1000 : 0;
  const printCost = (printMassG / 1000) * Math.max(0, settings.filamentPrice);

  return {
    totalStrutLengthM,
    strutCount,
    longestStrutM,
    sticksNeeded,
    stockCost,
    hubCount,
    printVolumeCm3,
    filamentVolumeCm3,
    printMassG,
    filamentLengthM,
    printCost,
    totalCost: stockCost + printCost,
  };
}

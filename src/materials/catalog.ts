import type { MaterialType } from '../types';

export type MaterialCategory = 'lumber' | 'pvc' | 'emt' | 'rod';

/** Real-world stock profile with actual (not nominal) dimensions in mm. */
export interface MaterialProfile {
  id: string;
  name: string;
  category: MaterialCategory;
  matType: MaterialType;
  /** Nominal trade name, e.g. "2×4" or '3/4" PVC Sch40' */
  nominal: string;
  /** Human-readable actual size */
  actualLabel: string;
  rodD?: number;
  lumW?: number;
  lumH?: number;
  /** Which lumber face is the strut length axis (depth into socket) */
  lumberDepthAxis?: 'width' | 'height';
  defaultTol: number;
  defaultWall: number;
  notes?: string;
}

/** Actual dimensions: US lumber (dry), PVC Sch40 OD, EMT OD, solid rod. */
export const MATERIAL_CATALOG: MaterialProfile[] = [
  // ── Lumber (actual cross-section, mm) ─────────────────────────────
  {
    id: 'lumber-1x4',
    name: '1×4 Furring Strip',
    category: 'lumber',
    matType: 'rect',
    nominal: '1×4',
    actualLabel: '19 × 89 mm (0.75" × 3.5")',
    lumW: 19.05,
    lumH: 88.9,
    lumberDepthAxis: 'height',
    defaultTol: 0.5,
    defaultWall: 4,
    notes: 'Light frames, purlins, cladding battens',
  },
  {
    id: 'lumber-2x4',
    name: '2×4 Stud / Framing',
    category: 'lumber',
    matType: 'rect',
    nominal: '2×4',
    actualLabel: '38 × 89 mm (1.5" × 3.5")',
    lumW: 38.1,
    lumH: 88.9,
    lumberDepthAxis: 'height',
    defaultTol: 0.4,
    defaultWall: 5,
    notes: 'Most common US framing lumber',
  },
  {
    id: 'lumber-2x6',
    name: '2×6 Framing',
    category: 'lumber',
    matType: 'rect',
    nominal: '2×6',
    actualLabel: '38 × 140 mm (1.5" × 5.5")',
    lumW: 38.1,
    lumH: 139.7,
    lumberDepthAxis: 'height',
    defaultTol: 0.4,
    defaultWall: 5,
    notes: 'Heavier rafters and floor joists',
  },
  // ── PVC Schedule 40 (outer diameter, mm) ──────────────────────────
  {
    id: 'pvc-0.5',
    name: '1/2" PVC Sch40',
    category: 'pvc',
    matType: 'round',
    nominal: '1/2" PVC',
    actualLabel: 'OD 21.3 mm',
    rodD: 21.34,
    defaultTol: 0.35,
    defaultWall: 4,
    notes: 'Light garden domes, small prototypes',
  },
  {
    id: 'pvc-0.75',
    name: '3/4" PVC Sch40',
    category: 'pvc',
    matType: 'round',
    nominal: '3/4" PVC',
    actualLabel: 'OD 26.7 mm',
    rodD: 26.67,
    defaultTol: 0.3,
    defaultWall: 4,
    notes: 'Common DIY geodesic conduit',
  },
  {
    id: 'pvc-1',
    name: '1" PVC Sch40',
    category: 'pvc',
    matType: 'round',
    nominal: '1" PVC',
    actualLabel: 'OD 33.4 mm',
    rodD: 33.4,
    defaultTol: 0.3,
    defaultWall: 5,
    notes: 'Greenhouses and medium domes',
  },
  {
    id: 'pvc-1.25',
    name: '1-1/4" PVC Sch40',
    category: 'pvc',
    matType: 'round',
    nominal: '1-1/4" PVC',
    actualLabel: 'OD 42.2 mm',
    rodD: 42.16,
    defaultTol: 0.25,
    defaultWall: 5,
  },
  // ── EMT electrical conduit (outer diameter, mm) ───────────────────
  {
    id: 'emt-0.5',
    name: '1/2" EMT Conduit',
    category: 'emt',
    matType: 'round',
    nominal: '1/2" EMT',
    actualLabel: 'OD 18.3 mm',
    rodD: 18.29,
    defaultTol: 0.2,
    defaultWall: 4,
    notes: 'Thin-wall steel, strong for weight',
  },
  {
    id: 'emt-0.75',
    name: '3/4" EMT Conduit',
    category: 'emt',
    matType: 'round',
    nominal: '3/4" EMT',
    actualLabel: 'OD 23.1 mm',
    rodD: 23.11,
    defaultTol: 0.2,
    defaultWall: 4,
  },
  {
    id: 'emt-1',
    name: '1" EMT Conduit',
    category: 'emt',
    matType: 'round',
    nominal: '1" EMT',
    actualLabel: 'OD 29.5 mm',
    rodD: 29.46,
    defaultTol: 0.2,
    defaultWall: 5,
    notes: 'Event domes and climbing frames',
  },
  // ── Solid metal rod ───────────────────────────────────────────────
  {
    id: 'rod-6mm',
    name: '6 mm Solid Rod',
    category: 'rod',
    matType: 'round',
    nominal: '6 mm rod',
    actualLabel: 'Ø 6.0 mm',
    rodD: 6.0,
    defaultTol: 0.15,
    defaultWall: 3,
    notes: 'Mild steel or aluminum rod',
  },
  {
    id: 'rod-8mm',
    name: '8 mm Solid Rod',
    category: 'rod',
    matType: 'round',
    nominal: '8 mm rod',
    actualLabel: 'Ø 8.0 mm',
    rodD: 8.0,
    defaultTol: 0.15,
    defaultWall: 3.5,
  },
  {
    id: 'rod-10mm',
    name: '10 mm Solid Rod',
    category: 'rod',
    matType: 'round',
    nominal: '10 mm rod',
    actualLabel: 'Ø 10.0 mm',
    rodD: 10.0,
    defaultTol: 0.15,
    defaultWall: 4,
  },
  {
    id: 'rod-0.25in',
    name: '1/4" Solid Rod',
    category: 'rod',
    matType: 'round',
    nominal: '1/4" rod',
    actualLabel: 'Ø 6.35 mm',
    rodD: 6.35,
    defaultTol: 0.15,
    defaultWall: 3,
  },
  {
    id: 'rod-0.375in',
    name: '3/8" Solid Rod',
    category: 'rod',
    matType: 'round',
    nominal: '3/8" rod',
    actualLabel: 'Ø 9.53 mm',
    rodD: 9.53,
    defaultTol: 0.15,
    defaultWall: 3.5,
  },
  {
    id: 'rod-0.5in',
    name: '1/2" Solid Rod',
    category: 'rod',
    matType: 'round',
    nominal: '1/2" rod',
    actualLabel: 'Ø 12.7 mm',
    rodD: 12.7,
    defaultTol: 0.15,
    defaultWall: 4,
  },
];

export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  lumber: 'Lumber (actual dims)',
  pvc: 'PVC Pipe — Sch40 OD',
  emt: 'EMT Metal Conduit',
  rod: 'Solid Metal Rod',
};

export function getMaterialProfile(id: string): MaterialProfile | undefined {
  return MATERIAL_CATALOG.find((m) => m.id === id);
}

export function getMaterialsByCategory(): Map<MaterialCategory, MaterialProfile[]> {
  const map = new Map<MaterialCategory, MaterialProfile[]>();
  for (const m of MATERIAL_CATALOG) {
    if (!map.has(m.category)) map.set(m.category, []);
    map.get(m.category)!.push(m);
  }
  return map;
}

export function applyMaterialProfile(profile: MaterialProfile): {
  matType: MaterialType;
  rodD: number;
  lumW: number;
  lumH: number;
  tol: number;
  wall: number;
  materialStockId: string;
} {
  return {
    matType: profile.matType,
    rodD: profile.rodD ?? 26.67,
    lumW: profile.lumW ?? 38.1,
    lumH: profile.lumH ?? 88.9,
    tol: profile.defaultTol,
    wall: profile.defaultWall,
    materialStockId: profile.id,
  };
}

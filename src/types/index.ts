export type MaterialType = 'round' | 'rect';
export type HubStyle = 'sharp' | 'organic' | 'metaball';
export type UnitSystem = 'metric' | 'imperial';
export type BaseSolid = 'icosahedron' | 'octahedron' | 'tetrahedron';
export type GeoTopology = 'geodesic' | 'goldberg';

export interface Vec3 {
  0: number;
  1: number;
  2: number;
  length: 3;
}

export interface DomeData {
  verts: number[][];
  faces: number[][];
  edges: number[][];
  adj: number[][];
  isBase: boolean[];
  isDoor: boolean[];
  yT: number;
}

export interface HubType {
  val: number;
  angs: number[];
  verts: number[];
  isBase: boolean;
  dirs: number[][];
  vPos: number[];
  label: string;
  color: string;
}

export interface StrutType {
  length: number;
  count: number;
  label: string;
}

export interface AppSettings {
  freq: number;
  diam: number;
  trunc: number;
  matType: MaterialType;
  rodD: number;
  lumW: number;
  lumH: number;
  tol: number;
  /** Socket tolerance across local X (mm). Defaults to tol for old saves. */
  tolX: number;
  /** Socket tolerance across local Y (mm). Defaults to tol for old saves. */
  tolY: number;
  wall: number;
  flatBot: boolean;
  door: boolean;
  doorW: number;
  showWire: boolean;
  showHubs: boolean;
  showMarkers: boolean;
  selHub: number | null;
  inspectorOpen: boolean;
  bodyScale: number;
  chamfer: number;
  detail: number;
  hubWire: boolean;
  printFoot: boolean;
  footMargin: number;
  showBuildGuide: boolean;
  printUpOverride: [number, number, number] | null;
  presetId: string | null;
  materialStockId: string;
  screwHoles: boolean;
  screwDia: number;
  hubStyle: HubStyle;
  junctionMeet: number;
  /** Print plate thickness (mm). */
  baseThickness: number;
  /** Multiplier on auto base diameter. */
  baseScale: number;
  /** Lumber insertion depth as fraction of lumber depth (0.55–1.05). */
  socketDepth: number;
  /** Explicit insertion depth in mm. 0 = derive from socketDepth fraction. */
  socketDepthMm: number;
  /** 0–1 mesh polish — Weaverbird (round) or Manifold smoothOut (timber). */
  surfaceSmooth: number;
  /** Round tube: loop-subdivide before Taubin smooth (inspector / export). */
  meshSubdivide: boolean;
  /** MultiPipe Connection Length as × node radius (0 = smoothest). */
  subdConnectionLength: number;
  /** MultiPipe StrutSize multiplier (<1 taper, >1 bulge). */
  subdStrutSize: number;
  unitSystem: UnitSystem;
  /** Material & cost calculator inputs. */
  stockLength: number;
  stockWastePct: number;
  stockPrice: number;
  filamentDensity: number;
  filamentPrice: number;
  /** Print infill % — scales the solid volume to estimate real filament use. */
  printInfillPct: number;
  /** Seed polyhedron for the geodesic subdivision. */
  baseSolid: BaseSolid;
  /** geodesic (triangulated struts) or goldberg (hex/pentagon buckyball dual). */
  geoTopology: GeoTopology;
  strutTaper: number;
  boreThrough: boolean;
  baseVent: boolean;
  /** Printer nozzle diameter for min-wall checks. */
  nozzleDia: number;
  frictionRibs: boolean;
  ribDepth: number;
  ribCount: number;
  screwBosses: boolean;
  embossLabels: boolean;
  alignmentNotches: boolean;
  showOverhangHeatmap: boolean;
  buildPlateW: number;
  buildPlateD: number;
}

export interface HubParams {
  matType: MaterialType;
  rodD: number;
  lumW: number;
  lumH: number;
  tol: number;
  tolX?: number;
  tolY?: number;
  wall: number;
  bodyScale: number;
  chamfer: number;
  detail: number;
  printFoot: boolean;
  footMargin: number;
  printFrame?: boolean;
  /** Dome preview: polish + foot along print-up, keep strut alignment. */
  domePreview?: boolean;
  printUpOverride?: [number, number, number] | null;
  screwHoles?: boolean;
  screwDia?: number;
  hubStyle?: HubStyle;
  /** Timber: solid junction blend (0.6–1.5). Raise when strut meet angles are tight. */
  junctionMeet?: number;
  baseThickness?: number;
  baseScale?: number;
  socketDepth?: number;
  socketDepthMm?: number;
  surfaceSmooth?: number;
  meshSubdivide?: boolean;
  subdConnectionLength?: number;
  subdStrutSize?: number;
  /** Strut tip radius as a fraction of its root — <1 gives tapered teardrop arms. */
  strutTaper?: number;
  /** Bore straight through the solid core (lighter, drains, prints faster). */
  boreThrough?: boolean;
  /** Drainage vent through the print base. */
  baseVent?: boolean;
  nozzleDia?: number;
  frictionRibs?: boolean;
  ribDepth?: number;
  ribCount?: number;
  screwBosses?: boolean;
  embossLabels?: boolean;
  alignmentNotches?: boolean;
  showOverhangHeatmap?: boolean;
  hubLabel?: string;
  socketLabels?: string[];
}

export interface StlValidationResult {
  valid: boolean;
  triangleCount: number;
  warnings: string[];
  errors: string[];
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  settings: Partial<AppSettings>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  freq: 2,
  diam: 4.0,
  trunc: 0.625,
  matType: 'round',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  tolX: 0.3,
  tolY: 0.3,
  wall: 5,
  flatBot: true,
  door: false,
  doorW: 2,
  showWire: true,
  showHubs: true,
  showMarkers: true,
  selHub: null,
  inspectorOpen: false,
  bodyScale: 1.6,
  chamfer: 2.0,
  detail: 48,
  hubWire: false,
  printFoot: true,
  footMargin: 6,
  showBuildGuide: true,
  printUpOverride: null,
  presetId: null,
  materialStockId: 'pvc-0.75',
  screwHoles: true,
  screwDia: 4.2,
  hubStyle: 'organic',
  junctionMeet: 1.0,
  baseThickness: 4,
  baseScale: 1.35,
  socketDepth: 0.9,
  socketDepthMm: 0,
  surfaceSmooth: 0.6,
  meshSubdivide: true,
  subdConnectionLength: 0,
  subdStrutSize: 1,
  unitSystem: 'metric',
  stockLength: 2.4,
  stockWastePct: 10,
  stockPrice: 6,
  filamentDensity: 1.24,
  filamentPrice: 25,
  printInfillPct: 30,
  baseSolid: 'icosahedron',
  geoTopology: 'geodesic',
  strutTaper: 0.88,
  boreThrough: false,
  baseVent: true,
  nozzleDia: 0.4,
  frictionRibs: true,
  ribDepth: 0.35,
  ribCount: 2,
  screwBosses: true,
  embossLabels: true,
  alignmentNotches: true,
  showOverhangHeatmap: false,
  buildPlateW: 220,
  buildPlateD: 220,
};

export const DOME_RADIUS = 5;
export const EPS = 0.001;

export const HUB_COLORS: Record<number, string> = {
  3: '#ff3366',
  4: '#ff6b35',
  5: '#00ffcc',
  6: '#7c5cfc',
  7: '#ffd700',
};

export type MaterialType = 'round' | 'rect';
export type HubStyle = 'sharp' | 'organic';

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
}

export interface HubParams {
  matType: MaterialType;
  rodD: number;
  lumW: number;
  lumH: number;
  tol: number;
  wall: number;
  bodyScale: number;
  chamfer: number;
  detail: number;
  printFoot: boolean;
  footMargin: number;
  printFrame?: boolean;
  printUpOverride?: [number, number, number] | null;
  screwHoles?: boolean;
  screwDia?: number;
  hubStyle?: HubStyle;
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
  lumW: 38,
  lumH: 89,
  tol: 0.3,
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
  hubStyle: 'sharp',
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

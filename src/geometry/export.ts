import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { AppSettings, HubType, DomeData, HubParams } from '../types';
import { createHub, orientGeometryForSTL } from './hub-geometry';
import { validateStlGeometry } from './stl-validation';

const stlExporter = new STLExporter();

export interface ExportResult {
  blob: Blob;
  filename: string;
  validation: ReturnType<typeof validateStlGeometry>;
}

export function exportHubStl(
  htIdx: number,
  hubTypes: HubType[],
  dome: DomeData,
  settings: AppSettings,
  hubParams: HubParams
): ExportResult | null {
  if (!dome || htIdx == null || htIdx < 0 || htIdx >= hubTypes.length) return null;

  const ht = hubTypes[htIdx];
  const geo = createHub(ht.verts[0], dome, {
    ...hubParams,
    detail: Math.max(settings.detail, 64),
    printFrame: true,
    printFoot: hubParams.printFoot ?? true,
  });
  if (!geo) return null;

  const stlGeo = orientGeometryForSTL(geo);
  const positions = stlGeo.attributes.position.array as Float32Array;
  const validation = validateStlGeometry(positions);

  const mesh = new THREE.Mesh(stlGeo, new THREE.MeshBasicMaterial());
  const parsed = stlExporter.parse(mesh, { binary: true });
  const blob = new Blob([parsed as BlobPart], { type: 'application/octet-stream' });
  const matSuffix =
    settings.matType === 'round' ? `${settings.rodD}mm` : 'timber';
  const filename = `print_ready_hub_${ht.label}_${ht.val}way_V${settings.freq}_${matSuffix}.stl`;

  geo.dispose();
  stlGeo.dispose();

  return { blob, filename, validation };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

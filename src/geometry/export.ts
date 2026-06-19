import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import pkg from '../../package.json';
import type { AppSettings, HubType, DomeData, HubParams, StrutType } from '../types';
import { createHub, hubDirsFromVertex, orientGeometryForSTL } from './hub-geometry';
import { analyzePrintability, estimatePlatePack } from './printability';
import { validateStlGeometry } from './stl-validation';
import { isManifoldReady } from './manifold-init';
import { designJsonMeta } from '../storage/settings-schema';
import { zipStore } from './zip';

const stlExporter = new STLExporter();
const gltfExporter = new GLTFExporter();

export interface ExportResult {
  blob: Blob;
  filename: string;
  validation: ReturnType<typeof validateStlGeometry>;
  blocked: boolean;
}

export interface Packed3mfResult {
  blob: Blob;
  filename: string;
  manifest: unknown;
  warnings: string[];
}

export interface BatchExportProgress {
  current: number;
  total: number;
  label: string;
}

function xml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function geometryVolumeMm3(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    vol += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(vol);
}

/** Deduplicated vertex index for smaller 3MF files. */
function meshTo3mfXml(geo: THREE.BufferGeometry): string {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const vertMap = new Map<string, number>();
  const verts: string[] = [];
  const tris: string[] = [];
  const q = (v: number) => v.toFixed(4);

  const indexVert = (i: number): number => {
    const key = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = vertMap.size;
      vertMap.set(key, idx);
      verts.push(`<vertex x="${q(pos.getX(i))}" y="${q(pos.getY(i))}" z="${q(pos.getZ(i))}"/>`);
    }
    return idx;
  };

  for (let i = 0; i < pos.count; i += 3) {
    tris.push(
      `<triangle v1="${indexVert(i)}" v2="${indexVert(i + 1)}" v3="${indexVert(i + 2)}"/>`
    );
  }
  return `<vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles>`;
}

function buildExportHubGeo(
  ht: HubType,
  dome: DomeData,
  settings: AppSettings,
  hubParams: HubParams,
  emboss: boolean
): THREE.BufferGeometry | null {
  return createHub(ht.verts[0], dome, {
    ...hubParams,
    detail: Math.max(settings.detail, 64),
    printFrame: true,
    printFoot: hubParams.printFoot ?? true,
    hubLabel: ht.label,
    socketLabels: ht.dirs.map((_, i) => String(i + 1)),
    embossLabels: emboss ? hubParams.embossLabels : false,
    alignmentNotches: emboss ? hubParams.alignmentNotches : false,
  });
}

export function exportHubStl(
  htIdx: number,
  hubTypes: HubType[],
  dome: DomeData,
  settings: AppSettings,
  hubParams: HubParams,
  options: { force?: boolean } = {}
): ExportResult | null {
  if (!dome || htIdx == null || htIdx < 0 || htIdx >= hubTypes.length) return null;
  if (!isManifoldReady()) {
    return {
      blob: new Blob(),
      filename: '',
      validation: {
        valid: false,
        triangleCount: 0,
        errors: ['Manifold CSG engine not loaded — export would use non-watertight fallback mesh.'],
        warnings: [],
      },
      blocked: !options.force,
    };
  }

  const ht = hubTypes[htIdx];
  const geo = buildExportHubGeo(ht, dome, settings, hubParams, true);
  if (!geo) return null;

  const dirs = hubDirsFromVertex(dome, ht.verts[0]);
  const stlGeo = orientGeometryForSTL(geo);
  const positions = stlGeo.attributes.position.array as Float32Array;
  const validation = validateStlGeometry(positions);
  validation.warnings.push(...analyzePrintability(stlGeo, hubParams, dirs).warnings);

  const blocked = validation.errors.length > 0 && !options.force;
  if (blocked) {
    geo.dispose();
    stlGeo.dispose();
    return { blob: new Blob(), filename: '', validation, blocked: true };
  }

  const mesh = new THREE.Mesh(stlGeo, new THREE.MeshBasicMaterial());
  const parsed = stlExporter.parse(mesh, { binary: true });
  const blob = new Blob([parsed as BlobPart], { type: 'application/octet-stream' });
  const matSuffix = settings.matType === 'round' ? `${settings.rodD}mm` : 'timber';
  const filename = `print_ready_hub_${ht.label}_${ht.val}way_V${settings.freq}_${matSuffix}.stl`;

  geo.dispose();
  stlGeo.dispose();

  return { blob, filename, validation, blocked: false };
}

export async function exportAllHubsZip(
  hubTypes: HubType[],
  dome: DomeData,
  settings: AppSettings,
  hubParams: HubParams,
  onProgress?: (p: BatchExportProgress) => void
): Promise<{ blob: Blob; filename: string; warnings: string[] } | null> {
  if (!dome || !hubTypes.length) return null;
  const files: Array<{ path: string; data: string | Uint8Array }> = [];
  const warnings: string[] = [];

  for (let i = 0; i < hubTypes.length; i++) {
    onProgress?.({ current: i + 1, total: hubTypes.length, label: hubTypes[i].label });
    const result = exportHubStl(i, hubTypes, dome, settings, hubParams, { force: true });
    if (!result || result.blocked) continue;
    warnings.push(...result.validation.errors, ...result.validation.warnings);
    const buf = new Uint8Array(await result.blob.arrayBuffer());
    files.push({ path: result.filename, data: buf });
    await new Promise((r) => setTimeout(r, 0));
  }

  if (!files.length) return null;
  const blob = zipStore(files);
  return {
    blob,
    filename: `geodesic_hubs_V${settings.freq}_${settings.diam}m.zip`,
    warnings,
  };
}

export function exportHubGlb(
  htIdx: number,
  hubTypes: HubType[],
  dome: DomeData,
  settings: AppSettings,
  hubParams: HubParams
): Promise<{ blob: Blob; filename: string } | null> {
  if (!dome || htIdx < 0 || htIdx >= hubTypes.length) return Promise.resolve(null);
  const ht = hubTypes[htIdx];
  const geo = buildExportHubGeo(ht, dome, settings, hubParams, true);
  if (!geo) return Promise.resolve(null);

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: ht.color }));
  return new Promise((resolve) => {
    gltfExporter.parse(
      mesh,
      (result) => {
        geo.dispose();
        const data = result as ArrayBuffer;
        resolve({
          blob: new Blob([data], { type: 'model/gltf-binary' }),
          filename: `hub_${ht.label}_${ht.val}way.glb`,
        });
      },
      () => resolve(null),
      { binary: true }
    );
  });
}

export function exportPackedBuildPlate3mf(
  hubTypes: HubType[],
  dome: DomeData,
  strutTypes: StrutType[],
  settings: AppSettings,
  hubParams: HubParams
): Packed3mfResult | null {
  if (!dome || !hubTypes.length) return null;

  const objects: string[] = [];
  const items: string[] = [];
  const metadata: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  const plateW = Math.max(60, settings.buildPlateW ?? 220);
  const plateD = Math.max(60, settings.buildPlateD ?? 220);
  const padding = 10;
  let cursorX = padding;
  let cursorY = padding;
  let rowDepth = 0;
  let objectId = 1;
  let hubFootprint = 40;

  for (const ht of hubTypes) {
    const geo = buildExportHubGeo(ht, dome, settings, hubParams, true);
    if (!geo) continue;

    const stlGeo = orientGeometryForSTL(geo);
    const nonIndexed = stlGeo.index ? stlGeo.toNonIndexed() : stlGeo;
    nonIndexed.computeBoundingBox();
    const bb = nonIndexed.boundingBox!;
    const width = bb.max.x - bb.min.x;
    const depth = bb.max.y - bb.min.y;
    hubFootprint = Math.max(hubFootprint, width, depth);
    if (cursorX + width + padding > plateW && cursorX > padding) {
      cursorX = padding;
      cursorY += rowDepth + padding;
      rowDepth = 0;
    }
    const tx = cursorX - bb.min.x;
    const ty = cursorY - bb.min.y;
    rowDepth = Math.max(rowDepth, depth);
    cursorX += width + padding;

    const dirs = hubDirsFromVertex(dome, ht.verts[0]);
    const validation = validateStlGeometry(nonIndexed.attributes.position.array as Float32Array);
    const print = analyzePrintability(nonIndexed, hubParams, dirs);
    warnings.push(...validation.errors, ...validation.warnings, ...print.warnings);
    const volumeCm3 = geometryVolumeMm3(nonIndexed) / 1000;
    objects.push(
      `<object id="${objectId}" type="model" name="${xml(ht.label)}">` +
        `<metadata name="geodesic:label">${xml(ht.label)}</metadata>` +
        `<metadata name="geodesic:count">${ht.verts.length}</metadata>` +
        `<metadata name="geodesic:valence">${ht.val}</metadata>` +
        `<metadata name="geodesic:volume_cm3">${volumeCm3.toFixed(3)}</metadata>` +
        `<mesh>${meshTo3mfXml(nonIndexed)}</mesh>` +
        `</object>`
    );
    for (let q = 0; q < ht.verts.length; q++) {
      const qx = tx + (q % 3) * 2;
      const qy = ty + Math.floor(q / 3) * 2;
      items.push(
        `<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${qx.toFixed(3)} ${qy.toFixed(3)} 0"/>`
      );
    }
    metadata.push({
      id: objectId,
      label: ht.label,
      count: ht.verts.length,
      valence: ht.val,
      isBase: ht.isBase,
      volumeCm3: Number(volumeCm3.toFixed(3)),
      plate: { x: Number(tx.toFixed(3)), y: Number(ty.toFixed(3)) },
    });
    objectId++;
    if (nonIndexed !== stlGeo) nonIndexed.dispose();
    stlGeo.dispose();
    geo.dispose();
  }

  if (!objects.length) return null;
  const pack = estimatePlatePack(hubTypes, plateW, plateD, hubFootprint);
  warnings.push(...pack.warnings);

  const manifest = {
    ...designJsonMeta(),
    generatedAt: new Date().toISOString(),
    settings,
    struts: strutTypes,
    buildPlate: { widthMm: settings.buildPlateW, depthMm: settings.buildPlateD },
    hubs: metadata,
    warnings,
  };
  const model =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    '<metadata name="Application">Geodesic Hub Generator</metadata>' +
    `<metadata name="geodesic:hub_types">${hubTypes.length}</metadata>` +
    `<resources>${objects.join('')}</resources><build>${items.join('')}</build></model>`;

  const blob = zipStore([
    {
      path: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
        '<Default Extension="json" ContentType="application/json"/>' +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
        '</Relationships>',
    },
    { path: '3D/3dmodel.model', data: model },
    { path: 'Metadata/geodesic-manifest.json', data: JSON.stringify(manifest, null, 2) },
  ]);

  return { blob, filename: `geodesic_hub_plate_V${settings.freq}_${settings.diam}m.3mf`, manifest, warnings };
}

export function designJson(
  settings: AppSettings,
  hubTypes: HubType[],
  strutTypes: StrutType[]
): string {
  return JSON.stringify(
    {
      ...designJsonMeta(),
      exportedAt: new Date().toISOString(),
      settings,
      hubs: hubTypes.map((h) => ({
        label: h.label,
        valence: h.val,
        count: h.verts.length,
        isBase: h.isBase,
        angles: h.angs,
      })),
      struts: strutTypes,
    },
    null,
    2
  );
}

export function bomCsv(
  settings: AppSettings,
  hubTypes: HubType[],
  strutTypes: StrutType[],
  estimate: {
    sticksNeeded: number;
    printMassG: number;
    filamentLengthM: number;
    totalCost: number;
    stockCost: number;
    printCost: number;
  }
): string {
  const rows = [
    'category,label,quantity,unit,notes',
    ...hubTypes.map(
      (h) => `hub,${h.label},${h.verts.length},each,${h.val}-way${h.isBase ? ' base' : ''}`
    ),
    ...strutTypes.map((s) => `strut,${s.label},${s.count},each,${s.length.toFixed(4)} m`),
    `stock,linear sticks,${estimate.sticksNeeded},sticks,${settings.stockLength} m each`,
    `filament,PLA/PETG,${estimate.printMassG.toFixed(0)},g,~${estimate.filamentLengthM.toFixed(1)} m`,
    `cost,total,${estimate.totalCost.toFixed(2)},${settings.currencySymbol},stock ${estimate.stockCost.toFixed(2)} + print ${estimate.printCost.toFixed(2)}`,
  ];
  return rows.join('\n');
}

export function vertexCoordsCsv(dome: DomeData, hubTypes: HubType[]): string {
  const vertexHub = new Map<number, string>();
  for (const ht of hubTypes) {
    for (const vi of ht.verts) vertexHub.set(vi, ht.label);
  }
  const rows = ['vertex_index,x,y,z,hub_label,is_base,is_door'];
  for (let i = 0; i < dome.verts.length; i++) {
    const v = dome.verts[i];
    rows.push(
      `${i},${v[0].toFixed(6)},${v[1].toFixed(6)},${v[2].toFixed(6)},${vertexHub.get(i) ?? ''},${dome.isBase[i]},${dome.isDoor[i]}`
    );
  }
  return rows.join('\n');
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

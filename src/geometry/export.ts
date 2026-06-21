import * as THREE from 'three';
import pkg from '../../package.json';
import type { AppSettings, HubType, DomeData, HubParams, StrutType } from '../types';
import { createHub, hubDirsFromVertex, orientGeometryForSTL } from './hub-geometry';
import { analyzePrintability, estimatePlatePack } from './printability';
import { validateStlGeometry } from './stl-validation';
import { isManifoldReady } from './manifold-init';
import { designJsonMeta } from '../storage/settings-schema';
import { strutTableCsv } from '../geodesic/math';
import { planCuts } from '../guides/material';
import { assemblyGuide, coverPanelsCsv } from '../guides/build-docs';
import { getMaterialProfile } from '../materials/catalog';
import { csvRow } from '../utils/csv';
import { zipStore } from './zip';

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

export type BatchExportMode = 'unique' | 'production';

interface BomEstimate {
  sticksNeeded: number;
  printMassG: number;
  filamentLengthM: number;
  totalCost: number;
  stockCost: number;
  printCost: number;
}

export interface BatchExportOptions {
  mode?: BatchExportMode;
  strutTypes?: StrutType[];
  materialLabel?: string;
  bomEstimate?: BomEstimate;
  onProgress?: (p: BatchExportProgress) => void;
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function batchReadme(
  settings: AppSettings,
  hubTypes: HubType[],
  struts: StrutType[],
  mode: BatchExportMode,
  warnings: string[],
  sticksNeeded?: number
): string {
  const hubCount = hubTypes.reduce((sum, ht) => sum + ht.verts.length, 0);
  const strutCount = struts.reduce((s, t) => s + t.count, 0);
  const profile = getMaterialProfile(settings.materialStockId);
  const matName = profile?.nominal ?? (settings.matType === 'round' ? `${settings.rodD} mm tube` : `${settings.lumW}×${settings.lumH} mm timber`);
  const stickLen = profile?.stockLengthM ?? settings.stockLength;
  const socketCount = hubTypes.reduce((n, h) => n + h.verts.length * h.val, 0);
  const screwsPerSocket = settings.matType === 'rect' ? 2 : 1;
  const screwCount = settings.screwHoles ? socketCount * screwsPerSocket : 0;
  const lines = [
    'Geodesic Hub Generator export bundle',
    '',
    `Mode: ${mode === 'production' ? 'Production set (one STL file per physical hub)' : 'Test set (one STL file per unique hub type)'}`,
    `Dome: V${settings.freq}, ${settings.diam} m diameter, ${settings.geoTopology}`,
    `Hub types: ${hubTypes.length}`,
    `Physical hubs: ${hubCount}`,
    '',
    'SHOPPING LIST',
    `- ${hubCount} printed hubs (${hubTypes.length} unique designs — see STL files)`,
    `- ${strutCount} struts of ${matName}` +
      (sticksNeeded ? ` → ~${sticksNeeded} × ${stickLen} m sticks (see tables/cut_sheet.csv)` : ' (see tables/cut_sheet.csv for the cutting plan)'),
    screwCount ? `- ${screwCount} × ${settings.screwDia} mm screws / set-screws` : '- No fasteners (friction-fit sockets)',
    '',
    'Lengths in tables/strut_lengths.csv are CUT lengths (already account for socket seating).',
    'cut_length_m = what you saw to · length_m = hub center-to-center.',
    '',
    'Recommended workflow:',
    '1. Print one unique hub type first and confirm socket fit.',
    '2. Cut all struts from tables/cut_sheet.csv, then label per tables/vertices.csv.',
    '3. Review warnings before batch printing, then assemble ring by ring.',
    '',
    warnings.length ? `Warnings: ${warnings.length}` : 'Warnings: none',
    ...warnings.map((w) => `- ${w}`),
  ];
  return lines.join('\n');
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

export async function exportHubStl(
  htIdx: number,
  hubTypes: HubType[],
  dome: DomeData,
  settings: AppSettings,
  hubParams: HubParams,
  options: { force?: boolean } = {}
): Promise<ExportResult | null> {
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
  const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
  const stlExporter = new STLExporter();
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
  options: BatchExportOptions = {}
): Promise<{ blob: Blob; filename: string; warnings: string[] } | null> {
  if (!dome || !hubTypes.length) return null;
  const files: Array<{ path: string; data: string | Uint8Array }> = [];
  const warnings: string[] = [];
  const mode = options.mode ?? 'unique';
  const exportedHubs: Array<Record<string, unknown>> = [];
  const total = hubTypes.length;

  for (let i = 0; i < hubTypes.length; i++) {
    const ht = hubTypes[i];
    options.onProgress?.({ current: i + 1, total, label: ht.label });
    const result = await exportHubStl(i, hubTypes, dome, settings, hubParams, { force: true });
    if (!result || result.blocked) continue;
    warnings.push(...result.validation.errors, ...result.validation.warnings);
    const buf = new Uint8Array(await result.blob.arrayBuffer());
    const copiedFiles: string[] = [];
    if (mode === 'production') {
      const pad = Math.max(2, String(ht.verts.length).length);
      const base = stripExt(result.filename);
      for (let q = 0; q < ht.verts.length; q++) {
        const path = `stl/production/${ht.label}/${base}_${String(q + 1).padStart(pad, '0')}_of_${ht.verts.length}.stl`;
        files.push({ path, data: buf });
        copiedFiles.push(path);
      }
    } else {
      const path = `stl/test-set/${result.filename}`;
      files.push({ path, data: buf });
      copiedFiles.push(path);
    }
    exportedHubs.push({
      label: ht.label,
      valence: ht.val,
      count: ht.verts.length,
      isBase: ht.isBase,
      stlFiles: copiedFiles,
      triangleCount: result.validation.triangleCount,
      warnings: uniqueStrings(result.validation.warnings),
      errors: uniqueStrings(result.validation.errors),
    });
    await new Promise((r) => setTimeout(r, 0));
  }

  if (!files.length) return null;
  const struts = options.strutTypes ?? [];
  const exportWarnings = uniqueStrings(warnings);
  const manifest = {
    ...designJsonMeta(),
    exportedAt: new Date().toISOString(),
    mode,
    settings,
    totals: {
      hubTypes: hubTypes.length,
      physicalHubs: hubTypes.reduce((sum, ht) => sum + ht.verts.length, 0),
      stlFiles: files.filter((f) => f.path.endsWith('.stl')).length,
      strutTypes: struts.length,
      physicalStruts: struts.reduce((sum, st) => sum + st.count, 0),
    },
    hubs: exportedHubs,
    struts,
    warnings: exportWarnings,
  };
  files.push({ path: 'metadata/export-manifest.json', data: JSON.stringify(manifest, null, 2) });
  files.push({ path: 'metadata/design.json', data: designJson(settings, hubTypes, struts) });
  if (struts.length) {
    files.push({
      path: 'tables/strut_lengths.csv',
      data: strutTableCsv(struts, options.materialLabel ?? 'stock', dome, hubTypes),
    });
    files.push({ path: 'tables/cut_sheet.csv', data: cutSheetCsv(struts, settings) });
    files.push({ path: 'ASSEMBLY.md', data: assemblyGuide(settings, hubTypes, struts, dome, options.bomEstimate?.sticksNeeded) });
  }
  files.push({ path: 'tables/vertices.csv', data: vertexCoordsCsv(dome, hubTypes) });
  files.push({ path: 'tables/cover_panels.csv', data: coverPanelsCsv(dome, settings.diam) });
  if (options.bomEstimate) {
    files.push({ path: 'tables/bom.csv', data: bomCsv(settings, hubTypes, struts, options.bomEstimate) });
  }
  files.push({
    path: 'README.txt',
    data: batchReadme(settings, hubTypes, struts, mode, exportWarnings, options.bomEstimate?.sticksNeeded),
  });
  const blob = zipStore(files);
  return {
    blob,
    filename: `geodesic_hubs_${mode}_V${settings.freq}_${settings.diam}m.zip`,
    warnings: exportWarnings,
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
    void import('three/examples/jsm/exporters/GLTFExporter.js')
      .then(({ GLTFExporter }) => {
        const gltfExporter = new GLTFExporter();
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
          () => {
            geo.dispose();
            resolve(null);
          },
          { binary: true }
        );
      })
      .catch(() => {
        geo.dispose();
        resolve(null);
      });
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
  let usedMaxX = padding;
  let usedMaxY = padding;
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
    const instances: Array<{ x: number; y: number }> = [];
    for (let q = 0; q < ht.verts.length; q++) {
      if (cursorX + width + padding > plateW && cursorX > padding) {
        cursorX = padding;
        cursorY += rowDepth + padding;
        rowDepth = 0;
      }
      const qx = cursorX - bb.min.x;
      const qy = cursorY - bb.min.y;
      items.push(
        `<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${qx.toFixed(3)} ${qy.toFixed(3)} 0"/>`
      );
      instances.push({ x: Number(qx.toFixed(3)), y: Number(qy.toFixed(3)) });
      usedMaxX = Math.max(usedMaxX, cursorX + width + padding);
      usedMaxY = Math.max(usedMaxY, cursorY + depth + padding);
      cursorX += width + padding;
      rowDepth = Math.max(rowDepth, depth);
    }
    metadata.push({
      id: objectId,
      label: ht.label,
      count: ht.verts.length,
      valence: ht.val,
      isBase: ht.isBase,
      volumeCm3: Number(volumeCm3.toFixed(3)),
      footprintMm: { width: Number(width.toFixed(3)), depth: Number(depth.toFixed(3)) },
      instances,
    });
    objectId++;
    if (nonIndexed !== stlGeo) nonIndexed.dispose();
    stlGeo.dispose();
    geo.dispose();
  }

  if (!objects.length) return null;
  const pack = estimatePlatePack(hubTypes, plateW, plateD, hubFootprint);
  if (usedMaxY > plateD) warnings.push(`Packed layout needs ~${usedMaxY.toFixed(0)} mm depth (plate ${plateD} mm).`);
  if (usedMaxX > plateW) warnings.push(`Packed layout needs ~${usedMaxX.toFixed(0)} mm width (plate ${plateW} mm).`);
  warnings.push(...pack.warnings.filter((w) => !warnings.includes(w)));

  const manifest = {
    ...designJsonMeta(),
    generatedAt: new Date().toISOString(),
    settings,
    struts: strutTypes,
    buildPlate: {
      widthMm: settings.buildPlateW,
      depthMm: settings.buildPlateD,
      packedWidthMm: Number(usedMaxX.toFixed(3)),
      packedDepthMm: Number(usedMaxY.toFixed(3)),
    },
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
  const socketCount = hubTypes.reduce((n, h) => n + h.verts.length * h.val, 0);
  const screwsPerSocket = settings.matType === 'rect' ? 2 : 1;
  const screwCount = settings.screwHoles ? socketCount * screwsPerSocket : 0;
  const rows = [
    'category,label,quantity,unit,notes',
    ...hubTypes.map(
      (h) => csvRow(['hub', h.label, h.verts.length, 'each', `${h.val}-way${h.isBase ? ' base' : ''}`])
    ),
    ...strutTypes.map((s) =>
      csvRow(['strut', s.label, s.count, 'each', `cut ${s.cutLength.toFixed(4)} m (center-to-center ${s.length.toFixed(4)} m)`])
    ),
    csvRow(['stock', 'linear sticks', estimate.sticksNeeded, 'sticks', `${settings.stockLength} m each`]),
    ...(screwCount > 0
      ? [csvRow(['fastener', `${settings.screwDia} mm screw/set-screw`, screwCount, 'each', `${screwsPerSocket} per socket × ${socketCount} sockets`])]
      : []),
    csvRow(['filament', 'PLA/PETG', estimate.printMassG.toFixed(0), 'g', `~${estimate.filamentLengthM.toFixed(1)} m`]),
    csvRow(['cost', 'total', estimate.totalCost.toFixed(2), settings.currencySymbol, `stock ${estimate.stockCost.toFixed(2)} + print ${estimate.printCost.toFixed(2)}`]),
  ];
  return rows.join('\n');
}

/** Per-stick cutting plan: which strut pieces come off each stock stick, with offcut. */
export function cutSheetCsv(strutTypes: StrutType[], settings: AppSettings): string {
  const labelFor = new Map<string, string>();
  const expanded: number[] = [];
  for (const t of strutTypes) {
    labelFor.set(t.cutLength.toFixed(4), t.label);
    for (let i = 0; i < t.count; i++) expanded.push(t.cutLength);
  }
  const plan = planCuts(
    expanded,
    Math.max(0.1, settings.stockLength),
    Math.max(0, settings.stockWastePct),
    0.003
  );
  const rows = ['stick,pieces,cuts,offcut_m'];
  plan.layout.forEach((pieces, i) => {
    const cuts = pieces.map((L) => `${labelFor.get(L.toFixed(4)) ?? '?'}@${L.toFixed(3)}`).join(' + ');
    rows.push(csvRow([i + 1, pieces.length, cuts, plan.offcuts[i].toFixed(3)]));
  });
  if (plan.oversize.length) {
    rows.push(
      csvRow(['oversize', plan.oversize.length, plan.oversize.map((L) => L.toFixed(3)).join(' '), 'splice/longer stock'])
    );
  }
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
      csvRow([
        i,
        v[0].toFixed(6),
        v[1].toFixed(6),
        v[2].toFixed(6),
        vertexHub.get(i) ?? '',
        dome.isBase[i],
        dome.isDoor[i],
      ])
    );
  }
  return rows.join('\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

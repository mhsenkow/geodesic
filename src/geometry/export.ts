import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import pkg from '../../package.json';
import type { AppSettings, HubType, DomeData, HubParams, StrutType } from '../types';
import { createHub, orientGeometryForSTL } from './hub-geometry';
import { analyzePrintability } from './printability';
import { validateStlGeometry } from './stl-validation';
import { zipStore } from './zip';

const stlExporter = new STLExporter();

export interface ExportResult {
  blob: Blob;
  filename: string;
  validation: ReturnType<typeof validateStlGeometry>;
}

export interface Packed3mfResult {
  blob: Blob;
  filename: string;
  manifest: unknown;
  warnings: string[];
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
    hubLabel: ht.label,
    socketLabels: ht.dirs.map((_, i) => String(i + 1)),
  });
  if (!geo) return null;

  const stlGeo = orientGeometryForSTL(geo);
  const positions = stlGeo.attributes.position.array as Float32Array;
  const validation = validateStlGeometry(positions);
  validation.warnings.push(...analyzePrintability(stlGeo, hubParams).warnings);

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

function meshTo3mfXml(geo: THREE.BufferGeometry): string {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  let vertices = '<vertices>';
  for (let i = 0; i < pos.count; i++) {
    vertices += `<vertex x="${pos.getX(i).toFixed(4)}" y="${pos.getY(i).toFixed(4)}" z="${pos.getZ(i).toFixed(4)}"/>`;
  }
  vertices += '</vertices><triangles>';
  for (let i = 0; i < pos.count; i += 3) {
    vertices += `<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`;
  }
  return `${vertices}</triangles>`;
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
  const padding = 10;
  let cursorX = padding;
  let cursorY = padding;
  let rowDepth = 0;
  let objectId = 1;

  for (const ht of hubTypes) {
    const geo = createHub(ht.verts[0], dome, {
      ...hubParams,
      detail: Math.max(settings.detail, 64),
      printFrame: true,
      printFoot: hubParams.printFoot ?? true,
      hubLabel: ht.label,
      socketLabels: ht.dirs.map((_, i) => String(i + 1)),
    });
    if (!geo) continue;

    const stlGeo = orientGeometryForSTL(geo);
    const nonIndexed = stlGeo.index ? stlGeo.toNonIndexed() : stlGeo;
    nonIndexed.computeBoundingBox();
    const bb = nonIndexed.boundingBox!;
    const width = bb.max.x - bb.min.x;
    const depth = bb.max.y - bb.min.y;
    if (cursorX + width + padding > plateW && cursorX > padding) {
      cursorX = padding;
      cursorY += rowDepth + padding;
      rowDepth = 0;
    }
    const tx = cursorX - bb.min.x;
    const ty = cursorY - bb.min.y;
    rowDepth = Math.max(rowDepth, depth);
    cursorX += width + padding;

    const validation = validateStlGeometry(nonIndexed.attributes.position.array as Float32Array);
    const print = analyzePrintability(nonIndexed, hubParams);
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
    items.push(`<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${tx.toFixed(3)} ${ty.toFixed(3)} 0"/>`);
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
  const usedDepth = cursorY + rowDepth + padding;
  if (usedDepth > Math.max(60, settings.buildPlateD ?? 220)) {
    warnings.push(`Packed hub types need about ${usedDepth.toFixed(0)} mm of plate depth.`);
  }

  const manifest = {
    app: 'Geodesic Hub Generator',
    version: pkg.version,
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

  const filename = `geodesic_hub_plate_V${settings.freq}_${settings.diam}m.3mf`;
  return { blob, filename, manifest, warnings };
}

export function designJson(
  settings: AppSettings,
  hubTypes: HubType[],
  strutTypes: StrutType[]
): string {
  return JSON.stringify(
    {
      app: 'Geodesic Hub Generator',
      version: pkg.version,
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

import * as THREE from 'three';
import type { HubParams } from '../types';
import { socketTolerances } from './socket-fit';

export interface PrintabilityReport {
  totalAreaMm2: number;
  overhangAreaMm2: number;
  overhangPct: number;
  worstDownNormalY: number;
  minWallMm: number;
  requiredWallMm: number;
  maxEdgeMm: number;
  avgEdgeMm: number;
  targetEdgeMm: number;
  warnings: string[];
}

export function targetTriangleLength(p: HubParams): number {
  const detail = THREE.MathUtils.clamp(p.detail || 48, 16, 128);
  const tol = socketTolerances(p);
  const feature =
    p.matType === 'round'
      ? p.rodD / 2 + tol.max + p.wall
      : Math.max(p.lumW + tol.x * 2, p.lumH + tol.y * 2) + p.wall * 2;
  return THREE.MathUtils.clamp(feature * 0.38 * (64 / detail), 2.2, 9.5);
}

function triangleIndices(geo: THREE.BufferGeometry): number[] {
  if (!geo.index) {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    return Array.from({ length: pos.count }, (_, i) => i);
  }
  return Array.from(geo.index.array);
}

export function analyzePrintability(geo: THREE.BufferGeometry, p: HubParams): PrintabilityReport {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = triangleIndices(geo);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const maxOverhangNormalY = -Math.cos(THREE.MathUtils.degToRad(45));
  let totalAreaMm2 = 0;
  let overhangAreaMm2 = 0;
  let worstDownNormalY = 1;
  let maxEdgeMm = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    const area = n.length() * 0.5;
    if (area <= 0) continue;
    n.normalize();
    totalAreaMm2 += area;
    worstDownNormalY = Math.min(worstDownNormalY, n.y);
    if (n.y < maxOverhangNormalY) overhangAreaMm2 += area;

    const e0 = a.distanceTo(b);
    const e1 = b.distanceTo(c);
    const e2 = c.distanceTo(a);
    maxEdgeMm = Math.max(maxEdgeMm, e0, e1, e2);
    edgeSum += e0 + e1 + e2;
    edgeCount += 3;
  }

  const nozzle = Math.max(0.1, p.nozzleDia ?? 0.4);
  const requiredWallMm = nozzle * 2;
  const tipWall = p.matType === 'round' ? Math.max(1.4, p.wall * 0.45) : p.wall;
  const minWallMm = Math.min(p.wall, tipWall);
  const targetEdgeMm = targetTriangleLength(p);
  const overhangPct = totalAreaMm2 > 0 ? (overhangAreaMm2 / totalAreaMm2) * 100 : 0;
  const avgEdgeMm = edgeCount ? edgeSum / edgeCount : 0;
  const warnings: string[] = [];

  if (overhangPct > 8) warnings.push(`${overhangPct.toFixed(1)}% of surface is steeper than a 45° self-support angle.`);
  if (minWallMm < requiredWallMm) warnings.push(`Minimum wall ${minWallMm.toFixed(2)} mm is below 2× nozzle (${requiredWallMm.toFixed(2)} mm).`);
  if (maxEdgeMm > targetEdgeMm * 1.45) warnings.push(`Largest triangle edge ${maxEdgeMm.toFixed(1)} mm exceeds the ${targetEdgeMm.toFixed(1)} mm export target.`);

  return {
    totalAreaMm2,
    overhangAreaMm2,
    overhangPct,
    worstDownNormalY,
    minWallMm,
    requiredWallMm,
    maxEdgeMm,
    avgEdgeMm,
    targetEdgeMm,
    warnings,
  };
}

export function applyOverhangHeatmap(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  const pos = out.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const safe = new THREE.Color(0x6fd6ff);
  const warn = new THREE.Color(0xffcf5a);
  const bad = new THREE.Color(0xff4d68);
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    const risk = THREE.MathUtils.clamp((-n.y - 0.3) / 0.7, 0, 1);
    if (risk < 0.5) color.lerpColors(safe, warn, risk * 2);
    else color.lerpColors(warn, bad, (risk - 0.5) * 2);
    for (let j = 0; j < 3; j++) {
      const off = (i + j) * 3;
      colors[off] = color.r;
      colors[off + 1] = color.g;
      colors[off + 2] = color.b;
    }
  }

  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return out;
}

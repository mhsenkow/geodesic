import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HubParams, HubStyle } from '../types';
import { EPS } from '../types';

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

function rectFrameShape(outerW: number, outerH: number, innerW: number, innerH: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, outerH / 2);
  shape.lineTo(-outerW / 2, outerH / 2);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-innerW / 2, -innerH / 2);
  hole.lineTo(-innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, -innerH / 2);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

function smoothStep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function extrudeFrame(
  outerW: number,
  outerH: number,
  innerW: number,
  innerH: number,
  depth: number,
  bevel = 0,
  bevelSegs = 2
): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(rectFrameShape(outerW, outerH, innerW, innerH), {
    depth,
    steps: 1,
    bevelEnabled: bevel > EPS,
    bevelSegments: bevel > EPS ? bevelSegs : 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

interface TimberDims {
  innerW: number;
  innerH: number;
  wall: number;
  outerW: number;
  outerH: number;
  socketLen: number;
  bevel: number;
}

function timberDims(p: HubParams): TimberDims {
  const innerW = p.lumW + p.tol * 2;
  const innerH = p.lumH + p.tol * 2;
  const wall = Math.max(2.5, p.wall);
  const outerW = innerW + wall * 2;
  const outerH = innerH + wall * 2;
  const socketLen = Math.max(innerH * 0.78, 55);
  const bevel = Math.min(Math.max(p.chamfer, 0), wall * 0.48);
  return { innerW, innerH, wall, outerW, outerH, socketLen, bevel };
}

/** Single hollow tube segment along +Y (one watertight mesh per socket). */
function buildSharpSocket(p: HubParams): THREE.BufferGeometry {
  const d = timberDims(p);
  const lipLen = Math.max(d.wall * 1.2, 4);

  const shaft = extrudeFrame(d.outerW, d.outerH, d.innerW, d.innerH, d.socketLen - lipLen, 0);
  const lip = extrudeFrame(
    d.outerW,
    d.outerH,
    d.innerW,
    d.innerH,
    lipLen,
    d.bevel,
    Math.max(2, Math.round(d.bevel))
  );
  lip.translate(0, d.socketLen - lipLen, 0);

  const parts: THREE.BufferGeometry[] = [prepGeo(shaft), prepGeo(lip)];

  if (p.screwHoles) {
    parts.push(...screwHolePatches(d, p.screwDia ?? 4.2));
  }

  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

/** Tapered flare at hub + straight sleeve + rounded blend core. */
function buildOrganicSocket(p: HubParams): THREE.BufferGeometry {
  const d = timberDims(p);
  const flare = Math.max(1, p.bodyScale);
  const rootLen = Math.max(d.innerH * 0.38, 22) * Math.min(flare, 1.8);
  const lipLen = Math.max(d.wall * 1.35, 5);
  const shaftLen = d.socketLen - rootLen - lipLen;
  const steps = Math.max(6, Math.round((p.detail || 48) / 8));

  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const tm = (t0 + t1) / 2;
    const ease = 1 - smoothStep(tm);
    const scale = 1 + (flare - 1) * ease * 1.15;
    const ow = d.innerW + d.wall * 2 * scale;
    const oh = d.innerH + d.wall * 2 * scale;
    const segLen = rootLen / steps;
    const seg = extrudeFrame(ow, oh, d.innerW, d.innerH, segLen, 0);
    seg.translate(0, t0 * rootLen, 0);
    parts.push(prepGeo(seg));
  }

  if (shaftLen > EPS) {
    const shaft = extrudeFrame(d.outerW, d.outerH, d.innerW, d.innerH, shaftLen, 0);
    shaft.translate(0, rootLen, 0);
    parts.push(prepGeo(shaft));
  }

  const lip = extrudeFrame(
    d.outerW,
    d.outerH,
    d.innerW,
    d.innerH,
    lipLen,
    d.bevel,
    Math.max(3, Math.round(d.bevel * 1.2))
  );
  lip.translate(0, d.socketLen - lipLen, 0);
  parts.push(prepGeo(lip));

  const coreR = Math.max(d.outerW, d.outerH) * (0.42 + (flare - 1) * 0.12);
  const core = new THREE.SphereGeometry(
    coreR,
    Math.max(16, Math.round((p.detail || 48) / 3)),
    Math.max(12, Math.round((p.detail || 48) / 4))
  );
  core.scale(1.08, 0.72 * flare, 1.08);
  core.translate(0, rootLen * 0.35, 0);
  parts.push(prepGeo(core));

  if (p.screwHoles) {
    parts.push(...screwHolePatches(d, p.screwDia ?? 4.2));
  }

  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

/** Through-hole patches on wide socket faces (merged into socket mesh). */
function screwHolePatches(d: TimberDims, screwDia: number): THREE.BufferGeometry[] {
  const r = Math.max(1.6, screwDia / 2);
  const y1 = d.socketLen * 0.36;
  const y2 = d.socketLen * 0.62;
  const patches: THREE.BufferGeometry[] = [];

  const makePanel = (w: number, h: number, depth: number, cx: number, cy: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(w, 0);
    shape.lineTo(w, h);
    shape.lineTo(0, h);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(cx, cy, r, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.computeVertexNormals();
    return geo;
  };

  for (const sign of [-1, 1] as const) {
    for (const y of [y1, y2]) {
      const panel = makePanel(d.outerH, d.wall * 1.05, d.wall, d.outerH / 2, y);
      panel.translate(0, 0, -d.wall);
      panel.rotateY((sign * Math.PI) / 2);
      panel.translate(sign * (d.innerW / 2 + d.wall / 2), 0, 0);
      patches.push(prepGeo(panel));
    }
  }
  return patches;
}

export function createTimberSocketGeometry(p: HubParams): THREE.BufferGeometry {
  const style: HubStyle = p.hubStyle ?? 'sharp';
  return style === 'organic' ? buildOrganicSocket(p) : buildSharpSocket(p);
}

/** @deprecated use createTimberSocketGeometry */
export function createCleanTimberSocket(p: HubParams): THREE.BufferGeometry[] {
  return [createTimberSocketGeometry(p)];
}

/** @deprecated sockets overlap at center; no separate core needed */
export function createTimberNodeCore(_p: HubParams): THREE.BufferGeometry {
  return prepGeo(new THREE.BufferGeometry());
}

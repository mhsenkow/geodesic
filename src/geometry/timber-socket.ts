import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HubParams, HubStyle } from '../types';
import { EPS } from '../types';
import {
  timberOuterDimsAtZ,
  timberSocketLen,
} from './timber-organic-profile';
import { socketTolerances } from './socket-fit';

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

export interface TimberDims {
  innerW: number;
  innerH: number;
  wall: number;
  outerW: number;
  outerH: number;
  socketLen: number;
  bevel: number;
}

export function timberDims(p: HubParams): TimberDims {
  const tol = socketTolerances(p);
  let lumW = p.lumW;
  let lumH = p.lumH;
  if (p.lumberDepthAxis === 'width') [lumW, lumH] = [p.lumH, p.lumW];
  const innerW = lumW + tol.x * 2;
  const innerH = lumH + tol.y * 2;
  const wall = Math.max(2.5, p.wall);
  const outerW = innerW + wall * 2;
  const outerH = innerH + wall * 2;
  const minLen = innerH * 0.55 + wall * 2 + 4;
  const socketLen = Math.max(timberSocketLen(p, innerH, wall), minLen);
  const bevel = Math.min(Math.max(p.chamfer, 0.5), wall * 0.48);
  return { innerW, innerH, wall, outerW, outerH, socketLen, bevel };
}

export function flareParams(p: HubParams, _style: HubStyle, d: TimberDims) {
  const flare = Math.max(1.08, p.bodyScale);
  const rootLen = Math.max(d.innerH * 0.36, d.innerH * 0.42) * Math.min(flare, 1.7);
  const lipLen = Math.max(d.wall * 1.25, 4);
  const shaftLen = Math.max(d.socketLen - rootLen - lipLen, d.innerH * 0.28);
  const steps = Math.max(8, Math.round((p.detail || 48) / 6));
  return { flare, rootLen, lipLen, shaftLen, steps };
}

/**
 * One hollow timber socket along +Y (hub center at y=0, lumber entry at y=socketLen).
 * Outer profile flares toward the hub; inner bore stays constant so the junction stays open.
 */
export function createTimberSocketTemplate(p: HubParams): THREE.BufferGeometry {
  const d = timberDims(p);
  const steps = Math.max(12, Math.round((p.detail || 48) / 4));
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < steps; i++) {
    const y0 = (i / steps) * d.socketLen;
    const y1 = ((i + 1) / steps) * d.socketLen;
    const segLen = y1 - y0;
    if (segLen <= EPS) continue;
    const o0 = timberOuterDimsAtZ(y0, d, p);
    const seg = extrudeFrame(o0.outerW, o0.outerH, d.innerW, d.innerH, segLen, 0);
    seg.translate(0, y0, 0);
    parts.push(prepGeo(seg));
  }

  const lipLen = Math.max(d.wall * 1.25, 4);
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
  parts.push(prepGeo(lip));

  if (p.screwHoles) {
    parts.push(...screwHolePatches(d, p.screwDia ?? 4.2));
  }

  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

/** @deprecated alias */
export function createTimberSocketGeometry(p: HubParams): THREE.BufferGeometry {
  return createTimberSocketTemplate(p);
}

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

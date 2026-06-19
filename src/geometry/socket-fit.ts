import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import type { HubParams } from '../types';
import { EPS } from '../types';
import { frameForStrutAxisZ, WORLD_UP } from './hub-orient';
import { getManifold } from './manifold-init';
import { transformManifold } from './manifold-mesh';

export interface SocketTolerances {
  x: number;
  y: number;
  max: number;
  avg: number;
}

export interface RoundFitDims {
  iRx: number;
  iRy: number;
  iR: number;
  oR: number;
  strutLen: number;
  voidInset: number;
}

export interface TimberFitDims {
  innerW: number;
  innerH: number;
  wall: number;
  socketLen: number;
}

export function socketTolerances(p: HubParams): SocketTolerances {
  const x = Math.max(0, p.tolX ?? p.tol);
  const y = Math.max(0, p.tolY ?? p.tol);
  return { x, y, max: Math.max(x, y), avg: (x + y) / 2 };
}

export function socketLengthFromSettings(
  stockMm: number,
  p: HubParams,
  minLen: number,
  defaultDepthFraction = 0.85
): number {
  const explicit = Math.max(0, p.socketDepthMm ?? 0);
  if (explicit > EPS) return Math.max(explicit, minLen);
  const depthFrac = THREE.MathUtils.clamp(p.socketDepth ?? defaultDepthFraction, 0.55, 1.05);
  return Math.max(stockMm * 2.5 * (depthFrac / defaultDepthFraction), minLen);
}

export function ellipticCylinderAlongZ(
  h: number,
  rx: number,
  ry: number,
  segs: number,
  center = false
): Manifold {
  const Manifold = getManifold();
  const cyl = Manifold.cylinder(Math.max(h, EPS), 1, 1, segs, center);
  return transformManifold(cyl, new THREE.Matrix4().makeScale(Math.max(rx, EPS), Math.max(ry, EPS), 1));
}

function alignZ(mfd: Manifold, dir: THREE.Vector3): Manifold {
  return transformManifold(mfd, frameForStrutAxisZ(dir, WORLD_UP));
}

function axisXTransform(dir: THREE.Vector3, origin: THREE.Vector3): THREE.Matrix4 {
  const frame = frameForStrutAxisZ(dir, WORLD_UP);
  const lx = new THREE.Vector3();
  const ly = new THREE.Vector3();
  const lz = new THREE.Vector3();
  frame.extractBasis(lx, ly, lz);
  const mat = new THREE.Matrix4().makeBasis(ly, lz, lx);
  mat.setPosition(origin);
  return mat;
}

function ribPositions(count: number, start: number, end: number): number[] {
  const n = THREE.MathUtils.clamp(Math.round(count), 0, 4);
  if (n <= 0) return [];
  const span = Math.max(end - start, 0);
  return Array.from({ length: n }, (_, i) => start + span * ((i + 1) / (n + 1)));
}

export function addRoundFrictionRibs(
  hub: Manifold,
  dirs: THREE.Vector3[],
  d: RoundFitDims,
  p: HubParams
): Manifold {
  if (!p.frictionRibs || !dirs.length) return hub;
  const Manifold = getManifold();
  const depth = Math.max(0, p.ribDepth ?? 0);
  const count = Math.round(p.ribCount ?? 0);
  if (depth <= EPS || count <= 0) return hub;

  const overlap = Math.max(0.08, depth * 0.4);
  const width = Math.max(1.0, depth * 3.2);
  const ribOuter = ellipticCylinderAlongZ(width, d.iRx + overlap, d.iRy + overlap, 28, false);
  const ribInner = ellipticCylinderAlongZ(
    width + EPS * 2,
    Math.max(d.iRx - depth, d.iRx * 0.72),
    Math.max(d.iRy - depth, d.iRy * 0.72),
    28,
    false
  );
  const rib = Manifold.difference(ribOuter, ribInner);
  const zAt = ribPositions(count, d.voidInset, d.strutLen - width * 0.5);
  const ribs: Manifold[] = [];
  for (const dir of dirs) {
    for (const z of zAt) ribs.push(alignZ(rib.translate(0, 0, z), dir));
  }
  return ribs.length ? Manifold.union([hub, Manifold.union(ribs)]) : hub;
}

function rectPrismAlongZ(w: number, h: number, len: number): Manifold {
  const Manifold = getManifold();
  return Manifold.cube([Math.max(w, EPS), Math.max(h, EPS), Math.max(len, EPS)], true).translate(
    0,
    0,
    len / 2
  );
}

function rectRingAlongZ(outerW: number, outerH: number, innerW: number, innerH: number, len: number): Manifold {
  const Manifold = getManifold();
  const outer = rectPrismAlongZ(outerW, outerH, len);
  const inner = rectPrismAlongZ(Math.max(innerW, EPS), Math.max(innerH, EPS), len + EPS * 2).translate(
    0,
    0,
    -EPS
  );
  return Manifold.difference(outer, inner);
}

export function addTimberFrictionRibs(
  hub: Manifold,
  dirs: THREE.Vector3[],
  d: TimberFitDims,
  p: HubParams,
  voidInset: number
): Manifold {
  if (!p.frictionRibs || !dirs.length) return hub;
  const Manifold = getManifold();
  const depth = Math.max(0, p.ribDepth ?? 0);
  const count = Math.round(p.ribCount ?? 0);
  if (depth <= EPS || count <= 0) return hub;

  const overlap = Math.max(0.08, depth * 0.4);
  const width = Math.max(1.0, depth * 3.2);
  const rib = rectRingAlongZ(
    d.innerW + overlap * 2,
    d.innerH + overlap * 2,
    Math.max(d.innerW - depth * 2, d.innerW * 0.76),
    Math.max(d.innerH - depth * 2, d.innerH * 0.76),
    width
  );
  const zAt = ribPositions(count, voidInset, d.socketLen - width * 0.5);
  const ribs: Manifold[] = [];
  for (const dir of dirs) {
    for (const z of zAt) ribs.push(alignZ(rib.translate(0, 0, z), dir));
  }
  return ribs.length ? Manifold.union([hub, Manifold.union(ribs)]) : hub;
}

export function addRoundScrewBosses(
  hub: Manifold,
  dirs: THREE.Vector3[],
  d: RoundFitDims,
  p: HubParams
): Manifold {
  if (!p.screwHoles || !p.screwBosses || !dirs.length) return hub;
  const Manifold = getManifold();
  const screwR = Math.max(1.6, (p.screwDia ?? 4.2) / 2);
  const bossR = Math.max(screwR * 2.15, screwR + 2.2);
  const bossLen = Math.max(p.wall * 1.35, screwR * 2.2);
  const at = d.voidInset + (d.strutLen - d.voidInset) * 0.5;
  const bosses: Manifold[] = [];

  for (const dir of dirs) {
    const frame = frameForStrutAxisZ(dir, WORLD_UP);
    const lx = new THREE.Vector3();
    frame.extractBasis(lx, new THREE.Vector3(), new THREE.Vector3());
    for (const side of [-1, 1] as const) {
      const origin = dir
        .clone()
        .normalize()
        .multiplyScalar(at)
        .add(lx.clone().multiplyScalar(side * Math.max(d.oR * 0.82, d.iR + p.wall * 0.45)));
      const boss = Manifold.cylinder(bossLen, bossR, bossR, 20, true);
      bosses.push(transformManifold(boss, axisXTransform(dir, origin)));
    }
  }
  return bosses.length ? Manifold.union([hub, Manifold.union(bosses)]) : hub;
}

export function addTimberScrewBosses(
  hub: Manifold,
  dirs: THREE.Vector3[],
  d: TimberFitDims,
  p: HubParams
): Manifold {
  if (!p.screwHoles || !p.screwBosses || !dirs.length) return hub;
  const Manifold = getManifold();
  const screwR = Math.max(1.6, (p.screwDia ?? 4.2) / 2);
  const bossR = Math.max(screwR * 2.15, screwR + 2.2);
  const bossLen = Math.max(d.wall * 1.4, screwR * 2.2);
  const along = [d.socketLen * 0.42, d.socketLen * 0.66];
  const bosses: Manifold[] = [];

  for (const dir of dirs) {
    const frame = frameForStrutAxisZ(dir, WORLD_UP);
    const lx = new THREE.Vector3();
    frame.extractBasis(lx, new THREE.Vector3(), new THREE.Vector3());
    for (const zDist of along) {
      for (const side of [-1, 1] as const) {
        const origin = dir
          .clone()
          .normalize()
          .multiplyScalar(zDist)
          .add(lx.clone().multiplyScalar(side * (d.innerW / 2 + d.wall * 0.55)));
        const boss = Manifold.cylinder(bossLen, bossR, bossR, 20, true);
        bosses.push(transformManifold(boss, axisXTransform(dir, origin)));
      }
    }
  }
  return bosses.length ? Manifold.union([hub, Manifold.union(bosses)]) : hub;
}

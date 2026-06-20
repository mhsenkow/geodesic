import * as THREE from 'three';
import type { DomeData, HubParams, HubType } from '../types';
import { alignmentQuat } from './hub-orient';
import { createHubFromDirs, hubDirsFromVertex } from './hub-geometry';

import { hubParamsFingerprint, hubTypeFingerprint } from '../utils/cache-key';

const protoCache = new Map<string, THREE.BufferGeometry>();
const instanceCache = new Map<string, THREE.BufferGeometry>();
let lastParamsFingerprint = '';

function paramsFingerprint(p: HubParams): string {
  return hubParamsFingerprint(p);
}

function hubTypeKey(ht: HubType, p: HubParams): string {
  return hubTypeFingerprint(ht, p);
}

export function clearHubPrototypeCache(force = true): void {
  if (!force && lastParamsFingerprint) return;
  for (const g of protoCache.values()) g.dispose();
  for (const g of instanceCache.values()) g.dispose();
  protoCache.clear();
  instanceCache.clear();
}

export function noteHubParamsFingerprint(p: HubParams): void {
  const fp = paramsFingerprint(p);
  if (lastParamsFingerprint && lastParamsFingerprint !== fp) {
    clearHubPrototypeCache(true);
  }
  lastParamsFingerprint = fp;
}

export function getHubPrototype(ht: HubType, p: HubParams): THREE.BufferGeometry {
  const key = hubTypeKey(ht, p);
  let proto = protoCache.get(key);
  if (!proto) {
    const dirs = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]));
    // Roll the prototype's sockets relative to its own outward radial; the
    // instance rotation that maps it onto each symmetry-related vertex carries
    // that roll with it, so rectangular sockets stay aligned with the struts.
    const vlen = Math.hypot(ht.vPos[0], ht.vPos[1], ht.vPos[2]) || 1;
    const rollRefUp: [number, number, number] = [
      ht.vPos[0] / vlen,
      ht.vPos[1] / vlen,
      ht.vPos[2] / vlen,
    ];
    const built = createHubFromDirs(dirs, { ...p, rollRefUp });
    if (!built) throw new Error('Failed to build hub prototype');
    proto = built;
    protoCache.set(key, proto);
  }
  return proto;
}

/** Worst per-strut angular error (deg) of a one-to-one greedy match. */
export function worstMatchErrorDeg(a: THREE.Vector3[], b: THREE.Vector3[]): number {
  const used = new Set<number>();
  let worst = 0;
  for (const va of a) {
    let best = -1;
    let bestDot = -2;
    for (let j = 0; j < b.length; j++) {
      if (used.has(j)) continue;
      const dot = va.dot(b[j]);
      if (dot > bestDot) {
        bestDot = dot;
        best = j;
      }
    }
    if (best < 0) break;
    used.add(best);
    worst = Math.max(worst, Math.acos(THREE.MathUtils.clamp(bestDot, -1, 1)) * (180 / Math.PI));
  }
  return worst;
}

function alignErrorDeg(canonical: THREE.Vector3[], actual: THREE.Vector3[], m: THREE.Matrix4): number {
  const transformed = canonical.map((c) => c.clone().applyMatrix4(m));
  return worstMatchErrorDeg(transformed, actual);
}

export const ALIGN_FALLBACK_THRESHOLD_DEG = 3;

export interface Alignment {
  matrix: THREE.Matrix4;
  reflected: boolean;
  residualDeg: number;
}

/**
 * Best orthogonal transform (proper rotation *or* a reflection) mapping the
 * canonical strut set onto a vertex's actual struts. Hubs of one class can be
 * mirror images of the stored prototype — a pure rotation can never align
 * those, so we also test a reflected variant and keep whichever fits better.
 */
export function bestAlignment(canonical: THREE.Vector3[], actual: THREE.Vector3[]): Alignment {
  const qRot = alignmentQuat(canonical, actual);
  const mRot = new THREE.Matrix4().makeRotationFromQuaternion(qRot);
  const errRot = alignErrorDeg(canonical, actual, mRot);

  const reflX = new THREE.Matrix4().makeScale(-1, 1, 1);
  const canonReflected = canonical.map((c) => c.clone().applyMatrix4(reflX));
  const qRefl = alignmentQuat(canonReflected, actual);
  const mRefl = new THREE.Matrix4().makeRotationFromQuaternion(qRefl).multiply(reflX);
  const errRefl = alignErrorDeg(canonical, actual, mRefl);

  if (errRefl + 0.5 < errRot) {
    return { matrix: mRefl, reflected: true, residualDeg: errRefl };
  }
  return { matrix: mRot, reflected: false, residualDeg: errRot };
}

/** Flip triangle winding so faces stay outward after a mirroring transform. */
function reverseWinding(geo: THREE.BufferGeometry): void {
  const index = geo.getIndex();
  if (index) {
    const arr = index.array as Uint32Array | Uint16Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    index.needsUpdate = true;
  } else {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let i = 0; i < a.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const tmp = a[i + 3 + k];
        a[i + 3 + k] = a[i + 6 + k];
        a[i + 6 + k] = tmp;
      }
    }
    pos.needsUpdate = true;
  }
  geo.computeVertexNormals();
}

/** Residual above this (deg) means the class signature matched by coincidence,
 *  not by symmetry — rebuild that hub from its own struts so sockets land on
 *  the dome edges exactly. Small enough that visible misalignment never ships. */
const FALLBACK_THRESHOLD_DEG = ALIGN_FALLBACK_THRESHOLD_DEG;

/**
 * Place a hub at a dome vertex. Reuses the cached per-type prototype via a
 * rotation/reflection when the vertex is symmetry-related to it (the common,
 * fast case); otherwise rebuilds from the vertex's own struts so the sockets
 * always line up with the dome edges.
 */
export function buildHubInstance(
  ht: HubType,
  dome: DomeData,
  vi: number,
  p: HubParams,
  scale: number
): THREE.BufferGeometry | null {
  const actual = hubDirsFromVertex(dome, vi);
  const canonical = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]).normalize());
  const align = bestAlignment(canonical, actual);

  if (align.residualDeg > FALLBACK_THRESHOLD_DEG) {
    const key = `fallback:${vi}:${paramsFingerprint(p)}`;
    let base = instanceCache.get(key);
    if (!base) {
      const v = dome.verts[vi];
      const vlen = Math.hypot(v[0], v[1], v[2]) || 1;
      const rollRefUp: [number, number, number] = [v[0] / vlen, v[1] / vlen, v[2] / vlen];
      const built = createHubFromDirs(actual, { ...p, rollRefUp });
      if (!built) return null;
      instanceCache.set(key, built);
      base = built;
    }
    const geo = base.clone();
    geo.scale(scale, scale, scale);
    return geo;
  }

  const proto = getHubPrototype(ht, p);
  const geo = proto.clone();
  geo.applyMatrix4(align.matrix);
  if (align.reflected) reverseWinding(geo);
  geo.scale(scale, scale, scale);
  return geo;
}

/** @deprecated use buildHubInstance — kept for back-compat (rotation only). */
export function instantiateHubAtVertex(
  proto: THREE.BufferGeometry,
  ht: HubType,
  dome: DomeData,
  vi: number,
  scale: number
): THREE.BufferGeometry {
  const actual = hubDirsFromVertex(dome, vi);
  const canonical = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]));
  const align = bestAlignment(canonical, actual);
  const geo = proto.clone();
  geo.applyMatrix4(align.matrix);
  if (align.reflected) reverseWinding(geo);
  geo.scale(scale, scale, scale);
  return geo;
}

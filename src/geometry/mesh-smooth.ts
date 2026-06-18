import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface WeaverbirdOptions {
  subdivideLevels?: number;
  smoothIterations?: number;
  lambda?: number;
  mu?: number;
  weldTolerance?: number;
}

export interface HubParamsLike {
  surfaceSmooth?: number;
  meshSubdivide?: boolean;
  printFrame?: boolean;
  domePreview?: boolean;
  detail?: number;
}

/** Shrink-wrap polish whenever smooth settings are active. */
export function shouldPolishHubMesh(p: HubParamsLike): boolean {
  const amount = p.surfaceSmooth ?? 0;
  return amount >= 0.05 || (!!p.meshSubdivide && amount >= 0.02);
}

export function roundWeaverbirdOptions(p: HubParamsLike): WeaverbirdOptions | null {
  if (!shouldPolishHubMesh(p)) return null;

  const amount = THREE.MathUtils.clamp(p.surfaceSmooth ?? 0, 0, 1);
  const preview = !!p.domePreview;
  const subdivide = !!p.meshSubdivide && amount >= 0.15;
  let subdivideLevels = 0;
  if (subdivide) {
    subdivideLevels = preview ? (amount >= 0.35 ? 1 : 0) : amount >= 0.45 ? 2 : 1;
  }

  const iterations = preview
    ? Math.max(3, Math.round(3 + amount * 6))
    : Math.max(3, Math.round(3 + amount * 10));

  return {
    subdivideLevels,
    smoothIterations: iterations,
    lambda: 0.3 + amount * 0.3,
    mu: -(0.3 + amount * 0.24),
    weldTolerance: undefined,
  };
}

function ensureIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) return geo;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const triVerts = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) triVerts[i] = i;
  const out = geo.clone();
  out.setIndex(Array.from(triVerts));
  return out;
}

function weldToleranceForGeo(geo: THREE.BufferGeometry, override?: number): number {
  if (override != null) return override;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  return Math.max(0.08, bb.max.distanceTo(bb.min) * 0.012);
}

function buildAdjacency(index: THREE.BufferAttribute, vertCount: number): number[][] {
  const adj: number[][] = Array.from({ length: vertCount }, () => []);
  const seen = new Set<string>();
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    for (const [v, w] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = v < w ? `${v},${w}` : `${w},${v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      adj[v].push(w);
      adj[w].push(v);
    }
  }
  return adj;
}

function taubinPass(pos: Float32Array, adj: number[][], factor: number): void {
  const n = adj.length;
  const delta = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const nb = adj[v];
    if (!nb.length) continue;
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const u of nb) {
      ax += pos[u * 3];
      ay += pos[u * 3 + 1];
      az += pos[u * 3 + 2];
    }
    const inv = 1 / nb.length;
    ax = ax * inv - pos[v * 3];
    ay = ay * inv - pos[v * 3 + 1];
    az = az * inv - pos[v * 3 + 2];
    delta[v * 3] = ax * factor;
    delta[v * 3 + 1] = ay * factor;
    delta[v * 3 + 2] = az * factor;
  }
  for (let i = 0; i < pos.length; i++) pos[i] += delta[i];
}

function loopSubdivideOnce(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const indexed = ensureIndexed(geo);
  const posAttr = indexed.getAttribute('position') as THREE.BufferAttribute;
  const verts = Array.from(posAttr.array as Float32Array);
  const oldIndex = indexed.index!;
  const edgeMid = new Map<string, number>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

  const getMid = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    let idx = edgeMid.get(key);
    if (idx !== undefined) return idx;
    idx = verts.length / 3;
    edgeMid.set(key, idx);
    verts.push(
      (verts[a * 3] + verts[b * 3]) * 0.5,
      (verts[a * 3 + 1] + verts[b * 3 + 1]) * 0.5,
      (verts[a * 3 + 2] + verts[b * 3 + 2]) * 0.5
    );
    return idx;
  };

  const newTris: number[] = [];
  for (let i = 0; i < oldIndex.count; i += 3) {
    const a = oldIndex.getX(i);
    const b = oldIndex.getX(i + 1);
    const c = oldIndex.getX(i + 2);
    const ab = getMid(a, b);
    const bc = getMid(b, c);
    const ca = getMid(c, a);
    newTris.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  out.setIndex(newTris);
  return out;
}

/** Taubin shrink-wrap on welded lathe+sphere hubs. */
export function weaverbirdSmooth(
  geo: THREE.BufferGeometry,
  opts: WeaverbirdOptions = {}
): THREE.BufferGeometry {
  const {
    subdivideLevels = 0,
    smoothIterations = 2,
    lambda = 0.35,
    mu = -0.38,
    weldTolerance,
  } = opts;

  const weld = weldToleranceForGeo(geo, weldTolerance);
  let work = mergeVertices(ensureIndexed(geo.clone()), weld * 1.35);

  for (let level = 0; level < subdivideLevels; level++) {
    work = loopSubdivideOnce(work);
    work = mergeVertices(work, weld * 1.2);
  }

  const posAttr = work.getAttribute('position') as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const index = work.index as THREE.BufferAttribute;
  const adj = buildAdjacency(index, pos.length / 3);

  for (let i = 0; i < smoothIterations; i++) {
    taubinPass(pos, adj, lambda);
    taubinPass(pos, adj, mu);
  }

  posAttr.needsUpdate = true;
  work.computeVertexNormals();
  return work;
}

/** @deprecated */
export function estimateRoundCoreRadius(p: {
  rodD?: number;
  tol?: number;
  wall?: number;
  bodyScale?: number;
}): number {
  const iR = (p.rodD ?? 26.7) / 2 + (p.tol ?? 0.3);
  const oR = iR + (p.wall ?? 4);
  return oR * Math.max(0.85, (p.bodyScale ?? 1.5) * 0.62);
}

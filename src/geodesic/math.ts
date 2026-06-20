import type { BaseSolid, DomeData, HubType, StrutType } from '../types';
import { DOME_RADIUS, EPS, HUB_COLORS } from '../types';
import { BASE_SEEDS, ICOSAHEDRON_FACES, ICOSAHEDRON_VERTS } from './constants';
import { csvRow } from '../utils/csv';

export interface SphereData {
  verts: number[][];
  faces: number[][];
  edges: number[][];
  adj: number[][];
}

export function genSphere(
  freq: number,
  rad: number = DOME_RADIUS,
  base: BaseSolid = 'icosahedron'
): SphereData {
  const seed = BASE_SEEDS[base] ?? { verts: ICOSAHEDRON_VERTS, faces: ICOSAHEDRON_FACES };
  const vm = new Map<string, number>();
  const verts: number[][] = [];
  const faces: number[][] = [];

  function addVert(x: number, y: number, z: number): number {
    const l = Math.hypot(x, y, z);
    if (l < 1e-12) return 0;
    const nx = (x / l) * rad;
    const ny = (y / l) * rad;
    const nz = (z / l) * rad;
    // Weld duplicates on the *unit* direction so the tolerance is relative to
    // radius — an absolute 1e-7 grid would mis-weld at large rad / odd scales.
    const ux = x / l;
    const uy = y / l;
    const uz = z / l;
    const k = `${ux.toFixed(6)},${uy.toFixed(6)},${uz.toFixed(6)}`;
    if (vm.has(k)) return vm.get(k)!;
    const i = verts.length;
    verts.push([nx, ny, nz]);
    vm.set(k, i);
    return i;
  }

  for (const [ai, bi, ci] of seed.faces) {
    const a = seed.verts[ai];
    const b = seed.verts[bi];
    const c = seed.verts[ci];
    const grid: number[][] = [];
    for (let i = 0; i <= freq; i++) {
      grid[i] = [];
      for (let j = 0; j <= freq - i; j++) {
        const k = freq - i - j;
        grid[i][j] = addVert(
          (a[0] * k + b[0] * j + c[0] * i) / freq,
          (a[1] * k + b[1] * j + c[1] * i) / freq,
          (a[2] * k + b[2] * j + c[2] * i) / freq
        );
      }
    }
    for (let i = 0; i < freq; i++) {
      for (let j = 0; j < freq - i; j++) {
        faces.push([grid[i][j], grid[i][j + 1], grid[i + 1][j]]);
        if (i + j + 1 < freq) {
          faces.push([grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]]);
        }
      }
    }
  }

  const es = new Set<string>();
  const edges: number[][] = [];
  const adj: number[][] = verts.map(() => []);

  for (const [a, b, c] of faces) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = `${Math.min(u, v)},${Math.max(u, v)}`;
      if (!es.has(k)) {
        es.add(k);
        edges.push([Math.min(u, v), Math.max(u, v)]);
        adj[u].push(v);
        adj[v].push(u);
      }
    }
  }

  return { verts, faces, edges, adj };
}

/**
 * Goldberg / fullerene dual of a geodesic sphere — the actual "buckyball".
 * Each original triangle face becomes a 3-valent vertex (its centroid), each
 * original vertex becomes a polygon face (pentagon at 5-valent seeds, hexagon
 * elsewhere). Struts run along dual edges; every hub is 3-way.
 */
export function dualizeSphere(sp: SphereData): SphereData {
  const rad = Math.hypot(sp.verts[0][0], sp.verts[0][1], sp.verts[0][2]) || DOME_RADIUS;
  const dverts: number[][] = sp.faces.map((f) => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const vi of f) {
      cx += sp.verts[vi][0];
      cy += sp.verts[vi][1];
      cz += sp.verts[vi][2];
    }
    const l = Math.hypot(cx, cy, cz) || 1;
    return [(cx / l) * rad, (cy / l) * rad, (cz / l) * rad];
  });

  const ek = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const edgeFaces = new Map<string, number[]>();
  sp.faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const k = ek(f[i], f[(i + 1) % f.length]);
      const arr = edgeFaces.get(k);
      if (arr) arr.push(fi);
      else edgeFaces.set(k, [fi]);
    }
  });

  const edges: number[][] = [];
  const adj: number[][] = dverts.map(() => []);
  for (const fs of edgeFaces.values()) {
    if (fs.length === 2) {
      const [a, b] = fs;
      edges.push([Math.min(a, b), Math.max(a, b)]);
      adj[a].push(b);
      adj[b].push(a);
    }
  }

  const vFaces: number[][] = sp.verts.map(() => []);
  sp.faces.forEach((f, fi) => f.forEach((vi) => vFaces[vi].push(fi)));
  const neighborsOfV = (v: number, face: number[]): [number, number] => {
    const i = face.indexOf(v);
    const n = face.length;
    return [face[(i - 1 + n) % n], face[(i + 1) % n]];
  };

  const faces: number[][] = [];
  for (let v = 0; v < sp.verts.length; v++) {
    const fs = vFaces[v];
    if (fs.length < 3) continue;
    const ordered: number[] = [fs[0]];
    let current = fs[0];
    let w = neighborsOfV(v, sp.faces[current])[1];
    let ok = true;
    for (let g = 0; g < fs.length + 2; g++) {
      const arr = edgeFaces.get(ek(v, w)) ?? [];
      const next = arr.find((fi) => fi !== current);
      if (next === undefined) {
        ok = false;
        break;
      }
      if (next === fs[0]) break;
      ordered.push(next);
      const [pp, qq] = neighborsOfV(v, sp.faces[next]);
      w = pp === w ? qq : pp;
      current = next;
    }
    if (ok && ordered.length >= 3) faces.push(ordered);
  }

  return { verts: dverts, faces, edges, adj };
}

export function truncDome(
  sp: SphereData,
  ratio: number,
  rad: number = DOME_RADIUS,
  flatBase = true,
  doorEnabled = false,
  doorWidthM = 2,
  domeDiameterM = 4
): DomeData {
  const yT = rad * (1 - 2 * ratio);
  const keep = sp.verts.map((v) => v[1] >= yT - rad * 0.02);
  const isBase = sp.verts.map((v, i) => keep[i] && v[1] < yT + rad * 0.12);

  const doorHalfWidth = (doorWidthM / domeDiameterM) * rad * 0.5;
  const isDoor = sp.verts.map((v, i) => {
    if (!doorEnabled || !keep[i]) return false;
    const onBaseRing = v[1] < yT + rad * 0.15;
    const inDoorWedge = Math.abs(v[0]) < doorHalfWidth && v[2] > rad * 0.3;
    return onBaseRing && inDoorWedge;
  });

  let kf = sp.faces.filter((f) => f.every((v) => keep[v]));
  if (doorEnabled) {
    kf = kf.filter((f) => f.every((v) => !isDoor[v]));
  }

  const used = new Set<number>();
  kf.forEach((f) => f.forEach((v) => used.add(v)));

  const o2n = new Map<number, number>();
  const nv: number[][] = [];
  for (const oi of used) {
    if (doorEnabled && isDoor[oi]) continue;
    const v = [...sp.verts[oi]] as number[];
    if (flatBase && isBase[oi]) v[1] = yT;
    o2n.set(oi, nv.length);
    nv.push(v);
  }

  const nf = kf
    .map((f) => f.map((v) => o2n.get(v)!))
    .filter((f) => f.every((v) => v !== undefined));

  const es = new Set<string>();
  const ne: number[][] = [];
  const na: number[][] = nv.map(() => []);

  for (const f of nf) {
    for (let i = 0; i < f.length; i++) {
      const u = f[i];
      const v = f[(i + 1) % f.length];
      const k = `${Math.min(u, v)},${Math.max(u, v)}`;
      if (!es.has(k)) {
        es.add(k);
        ne.push([Math.min(u, v), Math.max(u, v)]);
        na[u].push(v);
        na[v].push(u);
      }
    }
  }

  const nib = nv.map((_, i) => {
    for (const [o, n] of o2n) {
      if (n === i && isBase[o]) return true;
    }
    return false;
  });

  const nid = nv.map((_, i) => {
    for (const [o, n] of o2n) {
      if (n === i && isDoor[o]) return true;
    }
    return false;
  });

  return { verts: nv, faces: nf, edges: ne, adj: na, isBase: nib, isDoor: nid, yT };
}

export function classHubs(d: DomeData): HubType[] {
  const tm = new Map<string, Omit<HubType, 'label' | 'color'>>();

  for (let i = 0; i < d.verts.length; i++) {
    const nb = d.adj[i];
    const val = nb.length;
    if (!val) continue;
    const vi = d.verts[i];
    const dirs = nb.map((j) => {
      const vj = d.verts[j];
      const dx = vj[0] - vi[0];
      const dy = vj[1] - vi[1];
      const dz = vj[2] - vi[2];
      const l = Math.hypot(dx, dy, dz);
      return [dx / l, dy / l, dz / l];
    });
    const angs: number[] = [];
    for (let j = 0; j < dirs.length; j++) {
      for (let k = j + 1; k < dirs.length; k++) {
        const dot =
          dirs[j][0] * dirs[k][0] + dirs[j][1] * dirs[k][1] + dirs[j][2] * dirs[k][2];
        angs.push(Math.round((Math.acos(Math.max(-1, Math.min(1, dot))) * 1800) / Math.PI) / 10);
      }
    }
    angs.sort((a, b) => a - b);
    const sig = `${d.isBase[i] ? 'base' : 'field'}:${val}:${angs.join(',')}`;
    if (!tm.has(sig)) {
      tm.set(sig, { val, angs, verts: [], isBase: d.isBase[i], dirs, vPos: vi });
    }
    tm.get(sig)!.verts.push(i);
  }

  const types = [...tm.values()].sort((a, b) => b.val - a.val || a.angs[0] - b.angs[0]);
  types.forEach((t, i) => {
    (t as HubType).label = `H${i + 1}`;
    (t as HubType).color = HUB_COLORS[t.val] || '#ffffff';
  });
  return types as HubType[];
}

/** Per-vertex socket geometry, supplied by the geometry layer so the pure math
 *  can turn center-to-center chords into real cut lengths. */
export interface VertexSocket {
  /** Distance from hub center to the socket floor (deepest seat), mm. */
  floorMm: number;
  /** How far the strut engages before bottoming out, mm. */
  seatMm: number;
}

export interface StrutComputeOptions {
  /** Socket geometry per dome vertex; lets cut length = chord − floorA − floorB. */
  vertexSocket?: VertexSocket[];
  /** Hub-type label per dome vertex, for strut→hub adjacency. */
  vertexHubLabel?: string[];
  /** Cluster strut lengths within this tolerance (meters) into one type.
   *  0 keeps the legacy exact 0.1 mm grouping. ~0.0005 (0.5 mm) is buildable. */
  clusterToleranceM?: number;
}

/**
 * Strut types for the dome. `length` is the geodesic chord (hub center to hub
 * center — the design dimension and what chord-factor tables list); `cutLength`
 * is what you actually saw, after the strut seats `floorMm` into a hub at each
 * end. Struts are grouped by *cut* length within a buildable tolerance, since
 * that is the number a builder sets their stop block to.
 */
export function computeStrutTypes(
  d: DomeData,
  scaleToMeters: number,
  opts: StrutComputeOptions = {}
): StrutType[] {
  const sockets = opts.vertexSocket;
  const hubLabels = opts.vertexHubLabel;
  const tolM = Math.max(0, opts.clusterToleranceM ?? 0);
  const worldToM = scaleToMeters / (DOME_RADIUS * 2);

  interface Acc {
    lengthSum: number;
    cutSum: number;
    seatSum: number;
    bevelSum: number;
    count: number;
    pairs: Set<string>;
    sortKey: number;
  }
  const groups = new Map<string, Acc>();

  // Bevel (deg from square) to seat a strut end flush on a sphere-tangent face.
  const endBevelDeg = (from: number[], to: number[]): number => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    const rl = Math.hypot(from[0], from[1], from[2]) || 1;
    const dot = (dx * from[0] + dy * from[1] + dz * from[2]) / (dl * rl);
    return (Math.asin(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
  };

  for (const [a, b] of d.edges) {
    const va = d.verts[a];
    const vb = d.verts[b];
    const length = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]) * worldToM;

    const floorA = sockets?.[a]?.floorMm ?? 0;
    const floorB = sockets?.[b]?.floorMm ?? 0;
    const cutLength = Math.max(0, length - (floorA + floorB) / 1000);
    const seatAvg = ((sockets?.[a]?.seatMm ?? 0) + (sockets?.[b]?.seatMm ?? 0)) / 2;
    const bevelAvg = (endBevelDeg(va, vb) + endBevelDeg(vb, va)) / 2;

    // Group by cut length (what you cut), at a buildable tolerance.
    const key = tolM > 0 ? String(Math.round(cutLength / tolM)) : cutLength.toFixed(4);
    let g = groups.get(key);
    if (!g) {
      g = { lengthSum: 0, cutSum: 0, seatSum: 0, bevelSum: 0, count: 0, pairs: new Set(), sortKey: cutLength };
      groups.set(key, g);
    }
    g.lengthSum += length;
    g.cutSum += cutLength;
    g.seatSum += seatAvg;
    g.bevelSum += bevelAvg;
    g.count++;
    if (hubLabels) {
      const la = hubLabels[a];
      const lb = hubLabels[b];
      if (la && lb) g.pairs.add([la, lb].sort().join('–'));
    }
  }

  return [...groups.values()]
    .sort((x, y) => x.sortKey - y.sortKey)
    .map((g, i) => ({
      length: g.lengthSum / g.count,
      cutLength: g.cutSum / g.count,
      insertionDepthMm: g.seatSum / g.count,
      count: g.count,
      label: `S${i + 1}`,
      hubPairs: g.pairs.size ? [...g.pairs].sort() : undefined,
      seatBevelDeg: g.bevelSum / g.count,
    }));
}

export function strutTableCsv(
  struts: StrutType[],
  materialLabel: string,
  dome?: DomeData,
  hubTypes?: HubType[]
): string {
  const withHubs = !!(dome && hubTypes);
  const header = withHubs
    ? 'label,length_m,cut_length_m,insertion_depth_mm,seat_bevel_deg,count,material,cut_priority,hub_pairs'
    : 'label,length_m,cut_length_m,insertion_depth_mm,seat_bevel_deg,count,material,cut_priority';
  const rows = [header];
  struts.forEach((s, i) => {
    const priority = i + 1;
    const cells: (string | number)[] = [
      s.label,
      s.length.toFixed(4),
      s.cutLength.toFixed(4),
      s.insertionDepthMm.toFixed(1),
      (s.seatBevelDeg ?? 0).toFixed(1),
      s.count,
      materialLabel,
      priority,
    ];
    if (withHubs) cells.push((s.hubPairs ?? []).join('; '));
    rows.push(csvRow(cells));
  });
  return rows.join('\n');
}

export { EPS };

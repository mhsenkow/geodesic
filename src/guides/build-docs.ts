import type { AppSettings, DomeData, HubType, StrutType } from '../types';
import { DOME_RADIUS } from '../types';
import { getMaterialProfile } from '../materials/catalog';
import { csvRow } from '../utils/csv';

/** Group vertex heights into rings (bottom → top) within a tolerance. */
function ringsByHeight(dome: DomeData): { y: number; verts: number[] }[] {
  const order = dome.verts.map((_, i) => i).sort((a, b) => dome.verts[a][1] - dome.verts[b][1]);
  const span = Math.max(1e-6, dome.verts.reduce((m, v) => Math.max(m, v[1]), -Infinity) -
    dome.verts.reduce((m, v) => Math.min(m, v[1]), Infinity));
  const tol = span * 0.04;
  const rings: { y: number; verts: number[] }[] = [];
  for (const vi of order) {
    const y = dome.verts[vi][1];
    const last = rings[rings.length - 1];
    if (last && Math.abs(y - last.y) <= tol) last.verts.push(vi);
    else rings.push({ y, verts: [vi] });
  }
  return rings;
}

function hubLabelByVertex(hubTypes: HubType[]): Map<number, HubType> {
  const m = new Map<number, HubType>();
  for (const ht of hubTypes) for (const vi of ht.verts) m.set(vi, ht);
  return m;
}

/**
 * Human-readable assembly guide (Markdown) — turns the parts into a dome:
 * hub inventory, the cut list (cut lengths + which hubs each strut joins),
 * a ring-by-ring build order, and the fastener tally. References the embossed
 * hub labels and numbered sockets so a sea of near-identical parts is buildable.
 */
export function assemblyGuide(
  settings: AppSettings,
  hubTypes: HubType[],
  struts: StrutType[],
  dome: DomeData,
  sticksNeeded?: number
): string {
  const hubCount = hubTypes.reduce((s, h) => s + h.verts.length, 0);
  const strutCount = struts.reduce((s, t) => s + t.count, 0);
  const profile = getMaterialProfile(settings.materialStockId);
  const matName = profile?.nominal ?? (settings.matType === 'round' ? `${settings.rodD} mm tube` : `${settings.lumW}×${settings.lumH} mm timber`);
  const socketCount = hubTypes.reduce((n, h) => n + h.verts.length * h.val, 0);
  const screwsPerSocket = settings.matType === 'rect' ? 2 : 1;
  const screwCount = settings.screwHoles ? socketCount * screwsPerSocket : 0;
  const baseCount = hubTypes.filter((h) => h.isBase).reduce((s, h) => s + h.verts.length, 0);
  const byVert = hubLabelByVertex(hubTypes);
  const rings = ringsByHeight(dome);

  const L = (m: number) => `${m.toFixed(3)} m`;
  const lines: string[] = [];
  lines.push(`# Assembly Guide — V${settings.freq} ${settings.diam} m ${settings.geoTopology} dome`, '');
  lines.push('## What you are building', '');
  lines.push(`- **${hubCount} printed hubs** in ${hubTypes.length} unique types`);
  lines.push(`- **${strutCount} struts** of ${matName}` + (sticksNeeded ? ` (~${sticksNeeded} stock sticks — see tables/cut_sheet.csv)` : ''));
  lines.push(screwCount ? `- **${screwCount} × ${settings.screwDia} mm** screws / set-screws` : '- Friction-fit sockets (no fasteners)');
  lines.push('');

  lines.push('## 1 · Print the hubs', '');
  lines.push('Each hub is embossed with its **type label** and each socket is numbered.', '');
  lines.push('| Label | Hub | Count | Sockets |', '|---|---|---|---|');
  for (const h of hubTypes) {
    lines.push(`| ${h.label} | ${h.val}-way${h.isBase ? ' (base)' : ''} | ${h.verts.length} | 1–${h.val} |`);
  }
  lines.push('');

  lines.push('## 2 · Cut the struts', '');
  lines.push('Lengths below are **cut lengths** — they already subtract how far each strut seats into a hub at both ends. (Hub center-to-center is in `tables/strut_lengths.csv`.)', '');
  lines.push('| Label | Cut length | Count | Seats/end | Joins |', '|---|---|---|---|---|');
  for (const s of struts) {
    lines.push(`| ${s.label} | ${L(s.cutLength)} | ${s.count} | ${s.insertionDepthMm.toFixed(0)} mm | ${(s.hubPairs ?? []).join(', ') || '—'} |`);
  }
  lines.push('');

  lines.push('## 3 · Assemble ring by ring (bottom → top)', '');
  lines.push('Build the base ring first, then work upward. Insert each strut into the numbered sockets per `tables/vertices.csv`.', '');
  rings.forEach((ring, i) => {
    const counts = new Map<string, number>();
    for (const vi of ring.verts) {
      const ht = byVert.get(vi);
      if (ht) counts.set(ht.label, (counts.get(ht.label) ?? 0) + 1);
    }
    const desc = [...counts.entries()].map(([lbl, n]) => `${n}× ${lbl}`).join(', ') || '—';
    const tag = i === 0 ? ' (base ring)' : i === rings.length - 1 ? ' (apex)' : '';
    lines.push(`- **Ring ${i}**${tag}: ${ring.verts.length} hubs — ${desc}`);
  });
  lines.push('');

  lines.push('## 4 · Anchor & finish', '');
  lines.push(`- ${baseCount} base hub${baseCount === 1 ? '' : 's'} sit on the ground / foundation ring — anchor these first.`);
  if (screwCount) lines.push('- Drive set-screws / wood screws once each ring is square.');
  lines.push('- Cover panels (if skinning): see `tables/cover_panels.csv`.');
  lines.push('');
  return lines.join('\n');
}

/**
 * Cover-panel cut list (#49). Each dome face becomes a flat skin panel; faces
 * are grouped by congruent edge-length signature. Reports the polygon edge
 * lengths, the count, and the average fold (dihedral) angle to its neighbours
 * — the bevel reference for seaming panels. Add seam allowance when cutting.
 */
export function coverPanelsCsv(dome: DomeData, scaleToMeters: number): string {
  const worldToM = scaleToMeters / (DOME_RADIUS * 2);
  const faceNormal = (f: number[]): [number, number, number] => {
    // Newell's method — robust for non-planar polygons.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < f.length; i++) {
      const a = dome.verts[f[i]];
      const b = dome.verts[f[(i + 1) % f.length]];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const normals = dome.faces.map(faceNormal);

  // Edge → faces, to find each face's neighbours for the fold angle.
  const ek = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const edgeFaces = new Map<string, number[]>();
  dome.faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const k = ek(f[i], f[(i + 1) % f.length]);
      (edgeFaces.get(k) ?? edgeFaces.set(k, []).get(k)!).push(fi);
    }
  });

  interface Panel { sides: number; edges: number[]; count: number; foldSum: number; foldN: number }
  const groups = new Map<string, Panel>();
  dome.faces.forEach((f, fi) => {
    const edges = f.map((_, i) => {
      const a = dome.verts[f[i]];
      const b = dome.verts[f[(i + 1) % f.length]];
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * worldToM;
    });
    // average fold angle to neighbours across this face's edges
    let foldSum = 0, foldN = 0;
    for (let i = 0; i < f.length; i++) {
      const fs = edgeFaces.get(ek(f[i], f[(i + 1) % f.length])) ?? [];
      const nb = fs.find((x) => x !== fi);
      if (nb === undefined) continue;
      const dot = normals[fi][0] * normals[nb][0] + normals[fi][1] * normals[nb][1] + normals[fi][2] * normals[nb][2];
      foldSum += Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
      foldN++;
    }
    const sig = `${f.length}:${edges.map((e) => e.toFixed(3)).sort().join(',')}`;
    const g = groups.get(sig);
    if (g) { g.count++; g.foldSum += foldSum; g.foldN += foldN; }
    else groups.set(sig, { sides: f.length, edges, count: 1, foldSum, foldN });
  });

  const rows = ['label,sides,edge_lengths_m,count,avg_fold_deg,note'];
  [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .forEach((g, i) => {
      const fold = g.foldN ? g.foldSum / g.foldN : 0;
      rows.push(
        csvRow([
          `P${i + 1}`,
          g.sides,
          g.edges.map((e) => e.toFixed(3)).join('; '),
          g.count,
          fold.toFixed(1),
          'add seam allowance',
        ])
      );
    });
  return rows.join('\n');
}

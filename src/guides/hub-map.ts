import type { DomeData, HubType } from '../types';

export function generateHubMapSvg(
  dome: DomeData,
  hubTypes: HubType[],
  width = 800,
  height = 600
): string {
  const verts = dome.verts;
  const xs = verts.map((v) => v[0]);
  const zs = verts.map((v) => v[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const pad = 40;
  const scaleX = (width - pad * 2) / (maxX - minX || 1);
  const scaleZ = (height - pad * 2) / (maxZ - minZ || 1);
  const scale = Math.min(scaleX, scaleZ);

  const toScreen = (v: number[]) => ({
    x: pad + (v[0] - minX) * scale,
    y: pad + (maxZ - v[2]) * scale,
  });

  const vertexHub = new Map<number, HubType>();
  for (const ht of hubTypes) {
    for (const vi of ht.verts) vertexHub.set(vi, ht);
  }

  let edges = '';
  for (const [a, b] of dome.edges) {
    const pa = toScreen(verts[a]);
    const pb = toScreen(verts[b]);
    edges += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#335577" stroke-width="1"/>`;
  }

  let nodes = '';
  for (let i = 0; i < verts.length; i++) {
    const ht = vertexHub.get(i);
    const p = toScreen(verts[i]);
    const color = ht?.color ?? '#888';
    const label = ht?.label ?? '?';
    nodes += `<circle cx="${p.x}" cy="${p.y}" r="8" fill="${color}" stroke="#000" stroke-width="0.5"/>`;
    nodes += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" fill="#ccc" font-size="9" font-family="monospace">${label}</text>`;
  }

  const legend = hubTypes
    .map(
      (ht, i) =>
        `<text x="20" y="${height - 20 - i * 16}" fill="${ht.color}" font-size="11" font-family="monospace">${ht.label}: ${ht.val}-way × ${ht.verts.length}${ht.isBase ? ' (base)' : ''}</text>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#060a14"/>
  ${edges}
  ${nodes}
  <text x="20" y="24" fill="#00ffcc" font-size="14" font-family="sans-serif">Hub Placement Map (top view)</text>
  ${legend}
</svg>`;
}

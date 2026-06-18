import type { StlValidationResult } from '../types';

/** Lightweight STL mesh validation (manifold heuristics). */
export function validateStlGeometry(positions: Float32Array): StlValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const triangleCount = positions.length / 9;

  if (triangleCount < 4) {
    errors.push('Mesh has fewer than 4 triangles.');
  }

  if (positions.length % 9 !== 0) {
    errors.push('Position buffer length is not a multiple of 9 (3 verts × 3 coords).');
  }

  const edgeCount = new Map<string, number>();
  for (let i = 0; i < triangleCount; i++) {
    const base = i * 9;
    const verts = [
      [positions[base], positions[base + 1], positions[base + 2]],
      [positions[base + 3], positions[base + 4], positions[base + 5]],
      [positions[base + 6], positions[base + 7], positions[base + 8]],
    ];
    for (let e = 0; e < 3; e++) {
      const a = verts[e];
      const b = verts[(e + 1) % 3];
      const key =
        a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))
          ? `${a[0]},${a[1]},${a[2]}|${b[0]},${b[1]},${b[2]}`
          : `${b[0]},${b[1]},${b[2]}|${a[0]},${a[1]},${a[2]}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }

  let openEdges = 0;
  for (const count of edgeCount.values()) {
    if (count === 1) openEdges++;
    else if (count > 2) warnings.push('Non-manifold edge detected.');
  }

  if (openEdges > 0) {
    warnings.push(`${openEdges} open boundary edge(s) — mesh may not be watertight.`);
  }

  return {
    valid: errors.length === 0,
    triangleCount,
    warnings,
    errors,
  };
}

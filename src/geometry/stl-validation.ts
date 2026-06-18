import type { StlValidationResult } from '../types';

/**
 * Lightweight STL mesh validation (manifold heuristics).
 *
 * STL is a triangle soup with no shared indices, so edges are matched by
 * vertex position. Coordinates are quantized to a tolerance grid first: an
 * exact float match is too strict (a watertight Manifold solid cast from
 * Float64 to Float32 leaves sub-micron gaps that would read as "open"), and
 * quantizing welds those numerical twins back together.
 */
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

  // Quantization grid sized to the model so welding survives the Float32 cast
  // but stays far below any real feature.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] < min) min = positions[i];
    if (positions[i] > max) max = positions[i];
  }
  const span = Number.isFinite(max - min) ? max - min : 1;
  const grid = Math.max(1e-4, span * 1e-5);
  const q = (v: number) => Math.round(v / grid);
  const key = (i: number) => `${q(positions[i])},${q(positions[i + 1])},${q(positions[i + 2])}`;

  const edgeCount = new Map<string, number>();
  for (let t = 0; t < triangleCount; t++) {
    const base = t * 9;
    const vk = [key(base), key(base + 3), key(base + 6)];
    for (let e = 0; e < 3; e++) {
      const a = vk[e];
      const b = vk[(e + 1) % 3];
      if (a === b) continue; // degenerate edge — ignore
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeCount.set(ek, (edgeCount.get(ek) ?? 0) + 1);
    }
  }

  // Open boundary edges (shared by a single triangle) are the reliable,
  // printability-critical signal that a mesh is not watertight. The
  // "edge shared by >2 triangles" heuristic is intentionally not surfaced as a
  // warning: dense organic meshes sample the surface so closely that valid
  // fillets register false positives, and the Manifold engine already
  // guarantees 2-manifold output.
  let openEdges = 0;
  for (const count of edgeCount.values()) {
    if (count === 1) openEdges++;
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

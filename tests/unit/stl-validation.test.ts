import { describe, it, expect } from 'vitest';
import { validateStlGeometry } from '../../src/geometry/stl-validation';

describe('validateStlGeometry', () => {
  it('accepts a simple closed tetrahedron', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1,
      0, 0, 0, 0, 0, 1, 1, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    const result = validateStlGeometry(positions);
    expect(result.valid).toBe(true);
    expect(result.triangleCount).toBe(4);
  });

  it('rejects empty mesh', () => {
    const result = validateStlGeometry(new Float32Array([]));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('flags an open mesh (cube missing its top face) as not watertight', () => {
    // 8 cube corners; 5 of 6 faces (top omitted) → a 4-edge opening.
    const c = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ];
    const tris = [
      [0, 1, 2], [0, 2, 3], // bottom
      [0, 4, 5], [0, 5, 1], // front
      [1, 5, 6], [1, 6, 2], // right
      [2, 6, 7], [2, 7, 3], // back
      [3, 7, 4], [3, 4, 0], // left  (top intentionally missing)
    ];
    const positions = new Float32Array(tris.flatMap((t) => t.flatMap((i) => c[i])));
    const result = validateStlGeometry(positions);
    expect(result.triangleCount).toBe(10);
    // The detector must actually catch the hole, not just pass valid meshes.
    expect(result.warnings.some((w) => /open boundary edge/i.test(w))).toBe(true);
  });
});

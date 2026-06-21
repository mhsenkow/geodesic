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

  it('flags an inside-out (inverted-winding) closed mesh', () => {
    // A closed tetrahedron and its winding-reversed twin: exactly one is
    // inside-out, and the validator must catch that one (open-edge checks can't).
    const tetra = [
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1,
      0, 0, 0, 0, 0, 1, 1, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ];
    const reversed: number[] = [];
    for (let t = 0; t < tetra.length; t += 9) {
      reversed.push(
        tetra[t], tetra[t + 1], tetra[t + 2],
        tetra[t + 6], tetra[t + 7], tetra[t + 8],
        tetra[t + 3], tetra[t + 4], tetra[t + 5]
      );
    }
    const reInverted = (p: number[]) => validateStlGeometry(new Float32Array(p)).warnings.some((w) => /inside-out/i.test(w));
    const a = reInverted(tetra);
    const b = reInverted(reversed);
    expect(a).not.toBe(b); // exactly one orientation is flagged inside-out
  });
});

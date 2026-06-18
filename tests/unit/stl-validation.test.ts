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
});

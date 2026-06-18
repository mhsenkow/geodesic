import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  alignmentQuat,
  matchDirPermutation,
  quatForStrutAxisY,
} from '../../src/geometry/hub-orient';

describe('hub orientation', () => {
  it('finds a minimum-error strut pairing', () => {
    const canonical = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    const actual = [
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
    ];
    const perm = matchDirPermutation(canonical, actual);
    let err = 0;
    for (let i = 0; i < canonical.length; i++) {
      err += 1 - canonical[i].dot(actual[perm[i]]);
    }
    expect(err).toBeLessThan(1e-6);
  });

  it('aligns permuted directions within tolerance', () => {
    const canonical = [
      new THREE.Vector3(1, 0.2, 0).normalize(),
      new THREE.Vector3(-0.5, 0.8, 0.3).normalize(),
      new THREE.Vector3(-0.2, -0.4, 0.9).normalize(),
    ];
    const shuffled = [canonical[2], canonical[0], canonical[1]];
    const perm = matchDirPermutation(canonical, shuffled);
    const q = alignmentQuat(canonical, shuffled);
    for (let i = 0; i < canonical.length; i++) {
      const aligned = canonical[i].clone().applyQuaternion(q).normalize();
      expect(aligned.dot(shuffled[perm[i]])).toBeGreaterThan(0.999);
    }
  });

  it('uses world-up for consistent timber roll', () => {
    const dir = new THREE.Vector3(0.8, 0.1, 0.6).normalize();
    const q = quatForStrutAxisY(dir);
    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    expect(yAxis.dot(dir)).toBeGreaterThan(0.999);
  });
});

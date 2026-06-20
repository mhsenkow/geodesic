import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createLegacyHubFromDirs } from '../../src/geometry/hub-geometry';
import type { HubParams } from '../../src/types';

// The legacy lathe/extrude pipeline only runs when the Manifold WASM engine
// fails to load — so the normal suite (which always inits Manifold) never
// touches it. Exercise it directly so it can't rot silently.
const dirs = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-0.35, 0.85, 0.15).normalize(),
  new THREE.Vector3(-0.4, -0.65, 0.55).normalize(),
];

const base: HubParams = {
  matType: 'round',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  wall: 5,
  bodyScale: 1.5,
  chamfer: 1.5,
  detail: 24,
  printFoot: false,
  footMargin: 6,
};

function allFinite(geo: THREE.BufferGeometry): boolean {
  const arr = geo.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}

describe('legacy (Manifold-unavailable) fallback hub', () => {
  it('builds a non-empty, finite round hub mesh', () => {
    const geo = createLegacyHubFromDirs(dirs, base);
    expect(geo).not.toBeNull();
    expect(geo!.getAttribute('position').count).toBeGreaterThan(50);
    expect(allFinite(geo!)).toBe(true);
  });

  it('builds a non-empty, finite timber hub mesh', () => {
    const geo = createLegacyHubFromDirs(dirs, { ...base, matType: 'rect' });
    expect(geo).not.toBeNull();
    expect(geo!.getAttribute('position').count).toBeGreaterThan(50);
    expect(allFinite(geo!)).toBe(true);
  });
});

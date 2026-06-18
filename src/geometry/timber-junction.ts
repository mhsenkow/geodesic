import * as THREE from 'three';
import type { HubParams } from '../types';
import type { TimberDims } from './timber-socket';
import { timberBoreDepth } from './timber-organic-profile';

/** Pairwise angles (degrees) between strut directions at a hub. */
export function pairAnglesDeg(dirs: THREE.Vector3[]): number[] {
  const angles: number[] = [];
  for (let j = 0; j < dirs.length; j++) {
    for (let k = j + 1; k < dirs.length; k++) {
      const ang =
        Math.acos(Math.max(-1, Math.min(1, dirs[j].dot(dirs[k])))) * (180 / Math.PI);
      angles.push(ang);
    }
  }
  return angles;
}

export function minPairAngleDeg(dirs: THREE.Vector3[]): number {
  const angles = pairAnglesDeg(dirs);
  return angles.length ? Math.min(...angles) : 180;
}

/**
 * How far from the hub center the lumber bore opens.
 * Tighter strut meet angles → deeper solid core (scaled by junctionMeet).
 */
export function junctionInset(d: TimberDims, p: HubParams, dirs: THREE.Vector3[]): number {
  const meet = p.junctionMeet ?? 1;
  const minAng = minPairAngleDeg(dirs);
  const tight = THREE.MathUtils.clamp((102 - minAng) / 42, 0, 1.25);
  const base = d.wall * 1.25 + Math.min(d.outerW, d.outerH) * 0.22;
  const angleBonus = tight * Math.max(d.innerH * 0.4, 8);
  return Math.min((base + angleBonus) * meet, d.socketLen * 0.55);
}

/** Round-style bore inset, boosted when strut meet angles are tight. */
export function timberVoidInset(d: TimberDims, p: HubParams, dirs: THREE.Vector3[]): number {
  const roundLike = Math.max(d.socketLen - timberBoreDepth(p), d.wall * 2);
  const angleInset = junctionInset(d, p, dirs);
  return Math.min(roundLike, angleInset);
}

/** @deprecated use timberCoreRadius from timber-organic-profile */
export function junctionSphereRadius(d: TimberDims, p: HubParams, dirs: THREE.Vector3[]): number {
  void dirs;
  const meet = p.junctionMeet ?? 1;
  const outer = Math.max(d.outerW, d.outerH) * 0.5;
  return outer * Math.max(0.85, p.bodyScale * 0.62) * meet;
}

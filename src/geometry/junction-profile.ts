import * as THREE from 'three';
import type { HubParams } from '../types';
import { EPS } from '../types';

/** MultiPipe Connection Length → lathe flare exponent (0 = smoothest). */
export function junctionFlarePower(p: HubParams): number {
  const conn = p.subdConnectionLength ?? 0;
  if (conn <= EPS) return 0.85;
  return THREE.MathUtils.clamp(1.35 - conn * 0.45, 0.95, 1.35);
}

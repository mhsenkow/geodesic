import * as THREE from 'three';
import type { HubParams } from '../types';
import { roundSocketGeometry } from './socket-fit';
import { timberDims } from './timber-socket';
import { timberVoidInset } from './timber-junction';

export interface HubSocketInfo {
  /** Distance from hub center to the socket floor where the strut bottoms out, mm. */
  floorFromCenterMm: number;
  /** How far the strut engages into the socket before bottoming out, mm. */
  seatDepthMm: number;
  /** Total bored socket length, mm. */
  socketLenMm: number;
  /** Human-readable socket opening, e.g. "Ø 27.30 mm" or "39.4 × 90.5 mm". */
  openingLabel: string;
}

/**
 * Socket geometry at one hub, for either material — the bridge between the
 * Manifold mesh builder and the strut cut-length math. For timber the floor
 * depth depends on the strut meet angles, so `dirs` is required for accuracy.
 */
export function hubSocketInfo(p: HubParams, dirs: THREE.Vector3[]): HubSocketInfo {
  if (p.matType === 'round') {
    const sg = roundSocketGeometry(p);
    return {
      floorFromCenterMm: sg.floorFromCenterMm,
      seatDepthMm: sg.seatDepthMm,
      socketLenMm: sg.socketLenMm,
      openingLabel: sg.openingLabel,
    };
  }
  const d = timberDims(p);
  const floor = timberVoidInset(d, p, dirs);
  return {
    floorFromCenterMm: floor,
    seatDepthMm: Math.max(0, d.socketLen - floor),
    socketLenMm: d.socketLen,
    openingLabel: `${d.innerW.toFixed(1)} × ${d.innerH.toFixed(1)} mm`,
  };
}

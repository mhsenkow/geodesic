import type { HubParams } from '../types';
import { smoothStep01 } from './hub-geometry';
import { junctionFlarePower } from './junction-profile';
import { socketLengthFromSettings, socketTolerances } from './socket-fit';
import type { TimberDims } from './timber-socket';

/** Stock size analogue to round tube outer diameter (mm). */
export function timberStock(p: HubParams): number {
  const tol = socketTolerances(p);
  const innerW = p.lumW + tol.x * 2;
  const innerH = p.lumH + tol.y * 2;
  return Math.max(innerW, innerH);
}

/** Match round hub: socketLen = rodD × 2.5. */
export function timberSocketLen(p: HubParams, innerH: number, wall: number): number {
  const stock = timberStock(p);
  const minLen = innerH * 0.55 + wall * 2 + 4;
  return socketLengthFromSettings(stock, p, minLen);
}

/** Match round hub: open-bore region depth = rodD × 1.3. */
export function timberBoreDepth(p: HubParams): number {
  return timberStock(p) * 1.3;
}

/** Outer rectangular envelope at distance z along socket (hub at z=0, entry at socketLen). */
export function timberOuterDimsAtZ(
  z: number,
  d: TimberDims,
  p: HubParams
): { outerW: number; outerH: number } {
  const socketLen = d.socketLen;
  const t = socketLen > 0 ? z / socketLen : 0;
  const stock = Math.max(d.innerW, d.innerH);
  const boreDep = stock * 1.3;
  const stopZ = socketLen - boreDep;
  const flareEndT = socketLen > 0 ? stopZ / socketLen : 0;

  const baseW = d.innerW + d.wall * 2;
  const baseH = d.innerH + d.wall * 2;
  let scale = 1;

  if (t < flareEndT && flareEndT > 0) {
    const nt = t / flareEndT;
    const flarePower = junctionFlarePower(p);
    scale = 1 + (p.bodyScale - 1) * Math.pow(1 - smoothStep01(nt), flarePower);
  }

  let outerW = baseW * scale;
  let outerH = baseH * scale;

  if (t > 0.85) {
    const lip = smoothStep01((t - 0.85) / 0.15);
    const taper = Math.min(Math.max(p.chamfer, 0), d.wall * 0.75);
    outerW -= taper * lip;
    outerH -= taper * lip;
  }

  return {
    outerW: Math.max(outerW, baseW * 0.92),
    outerH: Math.max(outerH, baseH * 0.92),
  };
}

/** Round-style junction sphere radius for timber hubs. A generous floor keeps
 *  the node a solid blended mass even at wide strut angles / high valence,
 *  instead of a spiky star of barely-overlapping prisms. */
export function timberCoreRadius(d: TimberDims, p: HubParams): number {
  const outer = Math.max(d.outerW, d.outerH) * 0.5;
  return outer * Math.max(1.05, p.bodyScale * 0.7);
}

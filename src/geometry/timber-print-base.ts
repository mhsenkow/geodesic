import type { Manifold } from 'manifold-3d';
import type { HubParams } from '../types';
import { EPS } from '../types';
import { estimateBuildFootRadius } from './hub-geometry';
import { getManifold } from './manifold-init';
import { transformManifold } from './manifold-mesh';
import * as THREE from 'three';

export interface PrintBaseDims {
  thickness: number;
  topRadius: number;
  bottomRadius: number;
  seatY: number;
  weldOverlap: number;
}

/** Resolve print-base dimensions from hub bounds and user settings (mm). */
export function printBaseDims(hubBounds: { min: number[]; max: number[] }, p: HubParams): PrintBaseDims {
  const span = Math.max(hubBounds.max[0] - hubBounds.min[0], hubBounds.max[2] - hubBounds.min[2]);
  const hubReach = span * 0.5;
  const margin = p.footMargin ?? 6;
  const scale = p.baseScale ?? 1.35;
  const thickness = Math.max(p.baseThickness ?? 4, 2);

  const topRadius = Math.max(estimateBuildFootRadius(p), hubReach + margin * 0.45) * scale;
  const bottomRadius = topRadius * 1.08;
  const seatY = hubBounds.min[1];
  const weldOverlap = Math.min(Math.max(p.wall * 0.25, 0.8), 2.5);

  return { thickness, topRadius, bottomRadius, seatY, weldOverlap };
}

/**
 * Flat boolean print plate fused to the hub bottom (round or timber).
 * Wide bottom flare for bed adhesion; top overlaps hub slightly for a watertight union.
 * The hub must already be oriented so print-up is +Y.
 */
export function unionPrintBase(hub: Manifold, p: HubParams): Manifold {
  const Manifold = getManifold();
  const bb = hub.boundingBox();
  const base = printBaseDims(bb, p);
  const segs = Math.max(64, Math.round((p.detail || 48) / 3) * 4);

  // Flatten any organic lumps below the seat plane for a clean boolean weld.
  const trimY = base.seatY + base.weldOverlap * 0.4;
  const seated = hub.trimByPlane([0, 1, 0], trimY);

  const totalH = base.thickness + base.weldOverlap;
  const plate = Manifold.cylinder(totalH, base.bottomRadius, base.topRadius, segs, false);
  const rot = transformManifold(plate, new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const topY = trimY + base.weldOverlap * 0.25;
  const welded = rot.translate(0, topY - totalH, 0);

  return Manifold.union(seated, welded);
}

/** @deprecated use unionPrintBase */
export function unionTimberPrintBase(hub: Manifold, p: HubParams): Manifold {
  return unionPrintBase(hub, p);
}

export function sitManifoldOnBed(m: Manifold): Manifold {
  const bb = m.boundingBox();
  const lift = -bb.min[1];
  return lift > EPS ? m.translate(0, lift, 0) : m;
}

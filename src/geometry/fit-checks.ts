import * as THREE from 'three';
import type { HubParams } from '../types';
import { socketTolerances } from './socket-fit';
import { hubSocketInfo } from './socket-geometry';

export interface FitCheckReport {
  minMeetAngleDeg: number;
  meetAngleWarning: string | null;
  socketOpeningMm: { x: number; y: number; label: string };
  /** Total bored socket length, mm. */
  socketDepthMm: number;
  /** How far the strut actually engages before bottoming out, mm (the real grip). */
  socketSeatDepthMm: number;
  socketDepthWarning: string | null;
  sampledMinWallMm: number;
  strutFitOk: boolean;
  strutFitWarning: string | null;
  suggestedPrintUp: [number, number, number] | null;
  firstLayerGapMm: number;
  firstLayerWarning: string | null;
}

function minPairAngleDeg(dirs: THREE.Vector3[]): number {
  let min = 180;
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const dot = dirs[i].clone().normalize().dot(dirs[j].clone().normalize());
      min = Math.min(min, Math.acos(THREE.MathUtils.clamp(dot, -1, 1)) * (180 / Math.PI));
    }
  }
  return min;
}

/** Estimate minimum wall from meet angles and param wall (conservative). */
export function sampleMinWallMm(p: HubParams, minMeetDeg: number): number {
  const tipWall = p.matType === 'round' ? Math.max(1.4, p.wall * 0.45) : p.wall;
  const meetFactor = THREE.MathUtils.clamp(minMeetDeg / 90, 0.42, 1);
  return Math.min(p.wall, tipWall) * meetFactor;
}

export function analyzeFitChecks(
  geo: THREE.BufferGeometry,
  dirs: THREE.Vector3[],
  p: HubParams
): FitCheckReport {
  const minMeet = dirs.length >= 2 ? minPairAngleDeg(dirs) : 180;
  let meetAngleWarning: string | null = null;
  const requiredMeet = 35 + (p.junctionMeet ?? 1) * 8;
  if (minMeet < requiredMeet && dirs.length >= 3) {
    meetAngleWarning = `Tightest strut meet ${minMeet.toFixed(1)}° — raise Junction Meet or wall for ${requiredMeet.toFixed(0)}°+ clearance.`;
  }

  const tol = socketTolerances(p);
  const innerR = p.matType === 'round' ? p.rodD / 2 + tol.max : Math.hypot(p.lumW, p.lumH) / 2;
  const sock = hubSocketInfo(p, dirs);
  const socketLen = sock.socketLenMm;
  const socketOpeningMm =
    p.matType === 'round'
      ? {
          x: p.rodD + tol.x * 2,
          y: p.rodD + tol.y * 2,
          label:
            Math.abs(tol.x - tol.y) < 0.001
              ? `Ø ${(p.rodD + tol.max * 2).toFixed(2)} mm`
              : `${(p.rodD + tol.x * 2).toFixed(2)} × ${(p.rodD + tol.y * 2).toFixed(2)} mm oval`,
        }
      : {
          x: p.lumW + tol.x * 2,
          y: p.lumH + tol.y * 2,
          label: `${(p.lumW + tol.x * 2).toFixed(2)} × ${(p.lumH + tol.y * 2).toFixed(2)} mm`,
        };
  const stockDepth = p.matType === 'round' ? p.rodD : Math.max(p.lumW, p.lumH);
  const minDepth = stockDepth * 0.62;
  const maxDepth = stockDepth * 1.65;
  const socketDepthWarning =
    socketLen < minDepth
      ? `Socket depth ${socketLen.toFixed(1)} mm is shallow for ${stockDepth.toFixed(1)} mm stock; seat more strut for better load transfer.`
      : socketLen > maxDepth
        ? `Socket depth ${socketLen.toFixed(1)} mm is deep for ${stockDepth.toFixed(1)} mm stock; fit may become over-constrained.`
        : null;
  const minWallAtMeet = p.wall * (minMeet / 90);
  const strutFitOk = minWallAtMeet >= innerR * 0.15 + 1.2;
  const strutFitWarning = strutFitOk
    ? null
    : `Socket depth/bevel may not leave enough wall at ${minMeet.toFixed(1)}° meet — shorten socket or thicken wall.`;

  geo.computeBoundingBox();
  const firstLayerGapMm = geo.boundingBox ? Math.max(0, geo.boundingBox.min.y) : 0;
  const firstLayerWarning =
    firstLayerGapMm > 0.08 ? `Hub sits ${firstLayerGapMm.toFixed(2)} mm above bed plane.` : null;

  let suggestedPrintUp: [number, number, number] | null = null;
  if (dirs.length) {
    const up = new THREE.Vector3(0, 0, 0);
    for (const d of dirs) up.add(d.clone().normalize());
    if (up.lengthSq() > 0.01) {
      up.normalize();
      suggestedPrintUp = [up.x, up.y, up.z];
    }
  }

  return {
    minMeetAngleDeg: minMeet,
    meetAngleWarning,
    socketOpeningMm,
    socketDepthMm: socketLen,
    socketSeatDepthMm: sock.seatDepthMm,
    socketDepthWarning,
    sampledMinWallMm: sampleMinWallMm(p, minMeet),
    strutFitOk,
    strutFitWarning,
    suggestedPrintUp,
    firstLayerGapMm,
    firstLayerWarning,
  };
}

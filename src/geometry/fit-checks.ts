import * as THREE from 'three';
import type { HubParams } from '../types';
import { socketTolerances, socketLengthFromSettings } from './socket-fit';

export interface FitCheckReport {
  minMeetAngleDeg: number;
  meetAngleWarning: string | null;
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
  const socketLen = p.matType === 'round' ? socketLengthFromSettings(p.rodD, p, p.rodD * 1.2) : p.lumH * 1.2;
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
    sampledMinWallMm: sampleMinWallMm(p, minMeet),
    strutFitOk,
    strutFitWarning,
    suggestedPrintUp,
    firstLayerGapMm,
    firstLayerWarning,
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HubParams } from '../types';
import { EPS } from '../types';
import { socketTolerances } from './socket-fit';

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

export function estimateBuildFootRadius(p: HubParams): number {
  const margin = p.footMargin ?? 6;
  if (p.matType === 'round') {
    const iR = p.rodD / 2 + socketTolerances(p).max;
    const oR = iR + p.wall;
    return oR * Math.max(1.15, p.bodyScale * 0.85) + margin;
  }
  return Math.max(p.lumW, p.lumH) * Math.max(0.58, p.bodyScale * 0.45) + p.wall + margin;
}

export function choosePrintUp(dirs: THREE.Vector3[]): THREE.Vector3 {
  if (dirs.length === 0) return new THREE.Vector3(0, 1, 0);
  const sum = new THREE.Vector3();
  for (const dir of dirs) sum.add(dir);
  const candidates: THREE.Vector3[] = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
  ];
  if (sum.lengthSq() > 1e-6) {
    candidates.push(sum.clone().normalize(), sum.clone().multiplyScalar(-1).normalize());
  }
  for (const dir of dirs) {
    candidates.push(dir.clone().normalize(), dir.clone().multiplyScalar(-1).normalize());
  }
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const cross = new THREE.Vector3().crossVectors(dirs[i], dirs[j]);
      if (cross.lengthSq() > 1e-6) {
        candidates.push(cross.normalize(), cross.clone().multiplyScalar(-1));
      }
      const bisect = dirs[i].clone().add(dirs[j]);
      if (bisect.lengthSq() > 1e-6) candidates.push(bisect.normalize());
    }
  }

  const score = (up: THREE.Vector3): number => {
    let s = sum.lengthSq() > 1e-6 ? -up.dot(sum.clone().normalize()) * 0.2 : 0;
    for (const dir of dirs) {
      const d = dir.dot(up);
      s += Math.max(0, -d - 0.15) ** 2 * 4.0;
      s += Math.max(0, 0.18 - Math.abs(d)) * 0.12;
    }
    return s;
  };

  let best = candidates[0].clone().normalize();
  let bestScore = Infinity;
  for (const c of candidates) {
    if (c.lengthSq() < 1e-6) continue;
    const up = c.clone().normalize();
    const s = score(up);
    if (s < bestScore) {
      bestScore = s;
      best = up;
    }
  }
  return best;
}

function footRadiusForGeo(geo: THREE.BufferGeometry, p: HubParams): number {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanRadius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.28;
  const scale = p.baseScale ?? 1.35;
  return Math.max(estimateBuildFootRadius(p) * scale * 0.74, spanRadius);
}

/** Print-frame foot — hub already rotated so print-up is +Y. */
export function addBuildFoot(geo: THREE.BufferGeometry, p: HubParams): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const radius = footRadiusForGeo(geo, p);
  const bottomY = bb.min.y - 0.35;
  const thick = Math.max(p.baseThickness ?? 4, 2.5);
  const targetTopY = Math.min(Math.max(p.wall * 0.9, 3), bb.max.y - EPS);
  const topY = Math.max(Math.min(targetTopY, bottomY + thick), bottomY + 2.5);
  const height = topY - bottomY;
  const segs = Math.max(48, Math.round((p.detail || 48) / 8) * 8);
  const foot = new THREE.CylinderGeometry(radius * 0.92, radius, height, segs, 1, false);
  foot.translate(0, bottomY + height / 2, 0);
  const merged = mergeGeometries([prepGeo(geo), prepGeo(foot)], false);
  if (merged) merged.computeVertexNormals();
  return merged || geo;
}

/** Dome-preview foot — extends along print-up without reorienting strut sockets. */
export function attachBuildFootWorld(
  geo: THREE.BufferGeometry,
  dirs: THREE.Vector3[],
  p: HubParams
): THREE.BufferGeometry {
  const printUp = p.printUpOverride
    ? new THREE.Vector3(...p.printUpOverride).normalize()
    : choosePrintUp(dirs);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let minAlong = Infinity;
  const ref = Math.abs(printUp.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perpX = new THREE.Vector3().crossVectors(ref, printUp).normalize();
  const perpZ = new THREE.Vector3().crossVectors(printUp, perpX);
  let minPx = Infinity;
  let maxPx = -Infinity;
  let minPz = Infinity;
  let maxPz = -Infinity;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    minAlong = Math.min(minAlong, v.dot(printUp));
    const px = v.dot(perpX);
    const pz = v.dot(perpZ);
    minPx = Math.min(minPx, px);
    maxPx = Math.max(maxPx, px);
    minPz = Math.min(minPz, pz);
    maxPz = Math.max(maxPz, pz);
  }

  const spanRadius = Math.max(maxPx - minPx, maxPz - minPz) * 0.28;
  const scale = p.baseScale ?? 1.35;
  const radius = Math.max(estimateBuildFootRadius(p) * scale * 0.74, spanRadius);
  const thick = Math.max(p.baseThickness ?? 4, 2.5);
  const bottomAlong = minAlong - 0.35;
  const topAlong = minAlong + Math.min(thick, Math.max(p.wall * 0.9, 3));
  const height = Math.max(topAlong - bottomAlong, 2.5);
  const midAlong = bottomAlong + height / 2;

  const segs = Math.max(32, Math.round((p.detail || 48) / 8) * 4);
  const foot = new THREE.CylinderGeometry(radius * 0.92, radius, height, segs, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), printUp);
  foot.applyQuaternion(q);
  const mid = printUp.clone().multiplyScalar(midAlong);
  foot.translate(mid.x, mid.y, mid.z);

  const merged = mergeGeometries([prepGeo(geo), prepGeo(foot)], false);
  if (merged) merged.computeVertexNormals();
  return merged || geo;
}

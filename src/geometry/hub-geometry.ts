import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DomeData, HubParams } from '../types';
import { DOME_RADIUS, EPS } from '../types';
import { createTimberSocketGeometry } from './timber-socket';

export function smoothStep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

function createTimberSocketGeometries(p: HubParams): THREE.BufferGeometry[] {
  return [createTimberSocketGeometry(p)];
}

function buildOrganicSocketProfile(
  innerR: number,
  outerR: number,
  socketLen: number,
  boreDep: number,
  bodyScale: number,
  taper: number,
  screwDia = 0
): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const flareR = outerR * bodyScale;
  const stopY = socketLen - boreDep;

  pts.push(new THREE.Vector2(EPS, 0));

  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * socketLen;
    let r = outerR;
    const flareEndT = stopY / socketLen;
    if (t < flareEndT) {
      const nt = t / flareEndT;
      r = outerR + (flareR - outerR) * Math.pow(1 - smoothStep01(nt), 1.35);
    }
    if (t > 0.85) {
      const lip = smoothStep01((t - 0.85) / 0.15);
      r -= Math.min(taper, (outerR - innerR) * 0.75) * lip;
    }
    // Set-screw pilot indent (~40% along socket)
    if (screwDia > EPS && t > 0.34 && t < 0.48) {
      const dent = smoothStep01(1 - Math.abs(t - 0.41) / 0.07);
      r -= (screwDia / 2) * dent * 0.85;
    }
    pts.push(new THREE.Vector2(r, y));
  }

  pts.push(new THREE.Vector2(innerR, socketLen));
  pts.push(new THREE.Vector2(innerR, stopY));
  pts.push(new THREE.Vector2(EPS, stopY));
  return pts;
}

export function estimateBuildFootRadius(p: HubParams): number {
  const margin = p.footMargin ?? 6;
  if (p.matType === 'round') {
    const iR = p.rodD / 2 + p.tol;
    const oR = iR + p.wall;
    return oR * Math.max(1.15, p.bodyScale * 0.85) + margin;
  }
  return Math.max(p.lumW, p.lumH) * Math.max(0.58, p.bodyScale * 0.45) + p.wall + margin;
}

export function choosePrintUp(dirs: THREE.Vector3[]): THREE.Vector3 {
  if (dirs.length === 0) return new THREE.Vector3(0, 1, 0);
  const sum = new THREE.Vector3();
  for (const dir of dirs) sum.add(dir);
  if (sum.lengthSq() < 1e-6) return new THREE.Vector3(0, 1, 0);
  return sum.normalize();
}

function addBuildFoot(geo: THREE.BufferGeometry, p: HubParams): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanRadius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.28;
  const radius = Math.max(estimateBuildFootRadius(p), spanRadius);
  const bottomY = bb.min.y - 0.35;
  const targetTopY = Math.min(Math.max(p.wall * 0.9, 3), bb.max.y - EPS);
  const topY = Math.max(targetTopY, bottomY + 2.5);
  const height = topY - bottomY;
  const segs = Math.max(48, Math.round((p.detail || 48) / 8) * 8);
  const foot = new THREE.CylinderGeometry(radius * 0.92, radius, height, segs, 1, false);
  foot.translate(0, bottomY + height / 2, 0);
  const merged = mergeGeometries([prepGeo(geo), prepGeo(foot)], false);
  if (merged) merged.computeVertexNormals();
  return merged || geo;
}

export function orientHubForPrint(
  geo: THREE.BufferGeometry,
  dirs: THREE.Vector3[],
  p: HubParams
): THREE.BufferGeometry {
  let printUp: THREE.Vector3;
  if (p.printUpOverride) {
    printUp = new THREE.Vector3(...p.printUpOverride).normalize();
  } else {
    printUp = choosePrintUp(dirs);
  }
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(printUp, new THREE.Vector3(0, 1, 0)));
  if (p.printFoot) geo = addBuildFoot(geo, p);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  geo.computeVertexNormals();
  geo.userData.printUp = printUp.toArray();
  return geo;
}

export function orientGeometryForSTL(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.clone();
  out.rotateX(Math.PI / 2);
  out.computeBoundingBox();
  out.translate(0, 0, -out.boundingBox!.min.z);
  out.computeVertexNormals();
  return out;
}

export function previewHubScale(p: HubParams): number {
  if (p.matType === 'round') return (DOME_RADIUS * 0.015) / (p.rodD / 2 + p.tol + p.wall);
  const timberEnvelope = Math.max(p.lumW, p.lumH) / 2 + p.tol + p.wall;
  return (DOME_RADIUS * 0.022) / timberEnvelope;
}

export function createHub(
  vidx: number,
  d: DomeData,
  p: HubParams
): THREE.BufferGeometry | null {
  const vi = d.verts[vidx];
  const nb = d.adj[vidx];
  if (!nb.length) return null;

  const dirs = nb.map((j) =>
    new THREE.Vector3(
      d.verts[j][0] - vi[0],
      d.verts[j][1] - vi[1],
      d.verts[j][2] - vi[2]
    ).normalize()
  );
  const geos: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  if (p.matType === 'round') {
    const iR = p.rodD / 2 + p.tol;
    const oR = iR + p.wall;
    const sLen = p.rodD * 2.5;
    const bDep = p.rodD * 1.3;
    const profile = buildOrganicSocketProfile(
      iR,
      oR,
      sLen,
      bDep,
      p.bodyScale,
      p.chamfer,
      p.screwHoles ? p.screwDia ?? 0 : 0
    );
    const tpl = new THREE.LatheGeometry(profile, p.detail);

    for (const dir of dirs) {
      const g = tpl.clone();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      geos.push(prepGeo(g));
    }

    const coreR = oR * Math.max(0.85, p.bodyScale * 0.62);
    geos.push(
      prepGeo(new THREE.SphereGeometry(coreR, Math.max(24, p.detail / 2), Math.max(12, p.detail / 3)))
    );
  } else {
    for (const dir of dirs) {
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const socket = createTimberSocketGeometry(p);
      socket.applyQuaternion(q);
      geos.push(prepGeo(socket));
    }
  }

  if (!geos.length) return null;
  let merged = mergeGeometries(geos, false);
  if (merged) merged.computeVertexNormals();
  if (merged && p.printFrame) merged = orientHubForPrint(merged, dirs, p);
  return merged;
}

export function createBuildGuide(geo: THREE.BufferGeometry, p: HubParams): THREE.Group {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, estimateBuildFootRadius(p) * 2);
  const size = Math.max(40, span * 1.22);
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(size, 16, 0x00ffcc, 0x25446a);
  grid.position.y = 0.02;
  group.add(grid);

  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.48, 96),
    new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
    })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -0.02;
  group.add(plate);

  const center = new THREE.Vector3((bb.min.x + bb.max.x) / 2, 0, (bb.min.z + bb.max.z) / 2);
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    center,
    size * 0.24,
    0x00ffcc,
    size * 0.05,
    size * 0.025
  );
  group.add(arrow);
  return group;
}

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
  });
}

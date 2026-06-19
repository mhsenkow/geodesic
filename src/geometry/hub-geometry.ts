import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DomeData, HubParams } from '../types';
import { DOME_RADIUS, EPS } from '../types';
import { createTimberHub } from './timber-hub';
import { isManifoldReady } from './manifold-init';
import { createRoundNodeHub, createTimberNodeHub } from './node-hub-manifold';
import { createMetaballHub } from './metaball-hub';
import { roundWeaverbirdOptions, shouldPolishHubMesh, weaverbirdSmooth } from './mesh-smooth';
import { quatForStrutAxisY, WORLD_UP } from './hub-orient';
import { junctionFlarePower } from './junction-profile';
import { addBuildFoot, attachBuildFootWorld, choosePrintUp, estimateBuildFootRadius } from './hub-foot';
import { socketLengthFromSettings, socketTolerances } from './socket-fit';

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

function buildOrganicSocketProfile(
  innerR: number,
  outerR: number,
  socketLen: number,
  boreDep: number,
  bodyScale: number,
  taper: number,
  screwDia = 0,
  flarePower = 1.15
): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const flareR = outerR * bodyScale;
  const stopY = socketLen - boreDep;

  pts.push(new THREE.Vector2(EPS, 0));

  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * socketLen;
    let r = outerR;
    const flareEndT = stopY / socketLen;
    if (t < flareEndT) {
      const nt = t / flareEndT;
      r = outerR + (flareR - outerR) * Math.pow(1 - smoothStep01(nt), flarePower);
    }
    if (t > 0.85) {
      const lip = smoothStep01((t - 0.85) / 0.15);
      r -= Math.min(taper, (outerR - innerR) * 0.75) * lip;
    }
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

function buildRoundHubMeshLathe(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  const tol = socketTolerances(p);
  const iR = p.rodD / 2 + tol.max;
  const oR = iR + p.wall;
  const sLen = socketLengthFromSettings(p.rodD, p, p.rodD * 1.2);
  const bDep = p.rodD * 1.3;
  const strutScale = p.subdStrutSize ?? 1;
  const effectiveScale = p.bodyScale * (0.85 + strutScale * 0.15);
  const profile = buildOrganicSocketProfile(
    iR,
    oR * strutScale,
    sLen,
    bDep,
    effectiveScale,
    p.chamfer,
    p.screwHoles ? p.screwDia ?? 0 : 0,
    junctionFlarePower(p)
  );
  const tpl = new THREE.LatheGeometry(profile, p.detail);
  const geos: THREE.BufferGeometry[] = [];

  for (const dir of dirs) {
    const g = tpl.clone();
    g.applyQuaternion(quatForStrutAxisY(dir, WORLD_UP));
    g.deleteAttribute('normal');
    if (g.attributes.uv) g.deleteAttribute('uv');
    geos.push(g);
  }

  const meet = p.junctionMeet ?? 1;
  const coreR = oR * Math.max(0.85, effectiveScale * 0.62) * meet;
  const sphere = new THREE.SphereGeometry(
    coreR,
    Math.max(24, Math.round(p.detail * 0.75)),
    Math.max(12, Math.round(p.detail * 0.5))
  );
  sphere.deleteAttribute('normal');
  if (sphere.attributes.uv) sphere.deleteAttribute('uv');
  geos.push(sphere);

  let merged = mergeGeometries(geos, false)!;
  merged = mergeVertices(merged, Math.max(0.08, oR * 0.055));
  merged.computeVertexNormals();
  return merged;
}

function buildRoundHubMesh(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  return buildRoundHubMeshLathe(dirs, p);
}

export function polishOrganicHubMesh(geo: THREE.BufferGeometry, p: HubParams): THREE.BufferGeometry {
  const opts = roundWeaverbirdOptions(p);
  if (!opts) return geo;
  return weaverbirdSmooth(geo, opts);
}

/** @deprecated */
export function polishRoundHubMesh(geo: THREE.BufferGeometry, p: HubParams): THREE.BufferGeometry {
  return polishOrganicHubMesh(geo, p);
}

export { estimateBuildFootRadius, choosePrintUp, addBuildFoot, attachBuildFootWorld } from './hub-foot';

export function hubDirsFromVertex(d: DomeData, vidx: number): THREE.Vector3[] {
  const vi = d.verts[vidx];
  const nb = d.adj[vidx];
  return nb.map((j) =>
    new THREE.Vector3(
      d.verts[j][0] - vi[0],
      d.verts[j][1] - vi[1],
      d.verts[j][2] - vi[2]
    ).normalize()
  );
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
  geo.deleteAttribute('normal');
  geo.computeVertexNormals();
  geo.userData.printUp = printUp.toArray();
  return geo;
}

export function orientGeometryForSTL(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = geo.index ? geo.toNonIndexed() : geo.clone();
  out.rotateX(Math.PI / 2);
  out.computeBoundingBox();
  out.translate(0, 0, -out.boundingBox!.min.z);
  out.computeVertexNormals();
  return out;
}

export function previewHubScale(p: HubParams): number {
  if (p.matType === 'round') return (DOME_RADIUS * 0.015) / (p.rodD / 2 + socketTolerances(p).max + p.wall);
  const timberEnvelope = Math.max(p.lumW, p.lumH) / 2 + p.tol + p.wall;
  return (DOME_RADIUS * 0.022) / timberEnvelope;
}

/**
 * Build one hub from strut directions.
 *
 * Primary path: the Manifold CSG engine (watertight, organic, true boolean
 * base). Falls back to the legacy merge-and-weld mesh only if Manifold WASM
 * never loaded, so the app still renders something.
 */
export function createHubFromDirs(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry | null {
  if (!dirs.length) return null;

  if (isManifoldReady()) {
    try {
      if ((p.hubStyle ?? 'organic') === 'metaball') return createMetaballHub(dirs, p);
      return p.matType === 'round' ? createRoundNodeHub(dirs, p) : createTimberNodeHub(dirs, p);
    } catch (err) {
      console.warn('Manifold hub build failed — falling back to legacy mesh.', err);
    }
  }

  return createLegacyHubFromDirs(dirs, p);
}

/** Legacy lathe/extrude merge path — fallback only when Manifold is unavailable. */
export function createLegacyHubFromDirs(
  dirs: THREE.Vector3[],
  p: HubParams
): THREE.BufferGeometry | null {
  if (!dirs.length) return null;

  const organic = (p.hubStyle ?? 'organic') === 'organic';

  let geo: THREE.BufferGeometry | null =
    p.matType === 'round' ? buildRoundHubMesh(dirs, p) : createTimberHub(dirs, p);

  if (!geo) return null;

  if (organic && shouldPolishHubMesh(p)) {
    geo = polishOrganicHubMesh(geo, p);
  }

  if (p.printFrame) {
    geo = orientHubForPrint(geo, dirs, p);
  } else if (p.domePreview && p.printFoot) {
    geo = attachBuildFootWorld(geo, dirs, p);
    geo.computeVertexNormals();
  }

  return geo;
}

export function createHub(
  vidx: number,
  d: DomeData,
  p: HubParams
): THREE.BufferGeometry | null {
  return createHubFromDirs(hubDirsFromVertex(d, vidx), p);
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

/** @deprecated use polishRoundHubMesh */
export function applyRoundWeaverbird(geo: THREE.BufferGeometry, p: HubParams): THREE.BufferGeometry {
  return polishRoundHubMesh(geo, p);
}

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DomeData, HubParams } from '../types';
import { DOME_RADIUS, EPS } from '../types';
import { createTimberHub } from './timber-hub';
import { isManifoldReady } from './manifold-init';
import { createRoundNodeHub, createTimberNodeHub } from './node-hub-manifold';
import { createMetaballHub } from './metaball-hub';
import { effectiveHubStyle } from './smooth-curves';
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
      const style = effectiveHubStyle(p);
      // Round tube: metaball/hybrid produce the amorphous SDF blob look.
      if (p.matType === 'round') {
        if (style === 'metaball') return createMetaballHub(dirs, p);
        if (style === 'hybrid')
          return createMetaballHub(dirs, { ...p, hubStyle: 'metaball', surfaceSmooth: (p.surfaceSmooth ?? 0.6) * 1.05 });
        return createRoundNodeHub(dirs, p);
      }
      // Timber: a marching-cubes SDF blob can't represent the flat faces a
      // rectangular socket needs, so metaball/hybrid fall back to the
      // crisp-socket organic node hub rather than producing unusable geometry.
      const blobby = style === 'metaball' || style === 'hybrid';
      const timberParams = blobby ? { ...p, hubStyle: 'organic' as const } : p;
      return createTimberNodeHub(dirs, timberParams);
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
  return createHubFromDirs(hubDirsFromVertex(d, vidx), {
    ...p,
    rollRefUp: outwardRadial(d, vidx),
    socketRollUps: socketRollUpsForVertex(d, vidx, p.socketRollDeg ?? 0),
  });
}

/** Dome center → vertex direction; the roll reference for rectangular sockets. */
export function outwardRadial(d: DomeData, vidx: number): [number, number, number] {
  const v = d.verts[vidx];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Roll reference for one edge (va→vb): the outward radial at the strut
 * MIDPOINT, optionally twisted by `twistDeg` about the edge toward the
 * "on-edge" orientation. Both endpoint hubs and the beam call this with the
 * same edge and get the identical vector, so a beam seats flush at both ends.
 * The perp sign is stabilised so the two ends agree at any angle.
 */
export function edgeRollUp(va: number[], vb: number[], twistDeg = 0): [number, number, number] {
  const mx = (va[0] + vb[0]) / 2;
  const my = (va[1] + vb[1]) / 2;
  const mz = (va[2] + vb[2]) / 2;
  const rl = Math.hypot(mx, my, mz) || 1;
  let ux = mx / rl, uy = my / rl, uz = mz / rl; // midpoint radial (face flat to dome)
  const tw = (twistDeg * Math.PI) / 180;
  if (Math.abs(tw) > 1e-6) {
    let ax = vb[0] - va[0], ay = vb[1] - va[1], az = vb[2] - va[2];
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    // perp = edge × radial, in the cross-section plane
    let px = ay * uz - az * uy;
    let py = az * ux - ax * uz;
    let pz = ax * uy - ay * ux;
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl; py /= pl; pz /= pl;
    // Stabilise sign (both ends + the beam converge to the same perp).
    if (py < -1e-9 || (Math.abs(py) < 1e-9 && px < -1e-9) || (Math.abs(py) < 1e-9 && Math.abs(px) < 1e-9 && pz < 0)) {
      px = -px; py = -py; pz = -pz;
    }
    const c = Math.cos(tw), s = Math.sin(tw);
    ux = ux * c + px * s; uy = uy * c + py * s; uz = uz * c + pz * s;
  }
  return [ux, uy, uz];
}

/** Per-socket roll references in hubDirsFromVertex order (see edgeRollUp). */
export function socketRollUpsForVertex(
  d: DomeData,
  vidx: number,
  twistDeg = 0
): [number, number, number][] {
  return d.adj[vidx].map((j) => edgeRollUp(d.verts[vidx], d.verts[j], twistDeg));
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

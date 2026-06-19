import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import type { HubParams } from '../types';
import { EPS } from '../types';
import { frameForStrutAxisZ, WORLD_UP } from './hub-orient';
import { getCrossSection, getManifold } from './manifold-init';
import { transformManifold } from './manifold-mesh';
import { finishManifoldHub } from './timber-finish';
import { timberCoreRadius } from './timber-organic-profile';
import { timberVoidInset } from './timber-junction';
import { timberDims, type TimberDims } from './timber-socket';
import {
  addRoundFrictionRibs,
  addRoundScrewBosses,
  addTimberFrictionRibs,
  addTimberScrewBosses,
  ellipticCylinderAlongZ,
  socketLengthFromSettings,
  socketTolerances,
} from './socket-fit';
import { styleSmoothScale } from './smooth-curves';

/* ------------------------------------------------------------------ *
 * Organic Manifold hub engine.
 *
 * A hub is built as a real watertight solid via CSG:
 *   union(node blob + strut shells)  →  smoothOut() + refineToLength()
 *   →  difference(lumber/rod bores)   →  difference(screw holes)
 *
 * smoothOut() only fills in tangent vectors; refineToLength() then
 * tessellates the smoothly curved surface (the Weaverbird / subdivision
 * analog).  Bores are subtracted *after* refinement so the sockets that
 * accept the strut stay crisp and correctly sized, while the outer hull
 * is organically blended.  The result is guaranteed manifold.
 * ------------------------------------------------------------------ */

export interface OrganicOptions {
  /** false → crisp CSG (sharp style); true → smoothed + refined. */
  organic: boolean;
  /** Dome preview uses coarser refinement than inspector / export. */
  preview?: boolean;
}

interface SmoothPlan {
  minSharpAngle: number;
  minSmoothness: number;
}

/** Map surfaceSmooth + connection length onto smoothOut() arguments. */
function smoothPlan(p: HubParams, baseSharpAngle: number): SmoothPlan {
  const t = THREE.MathUtils.clamp(p.surfaceSmooth ?? 0.55, 0, 1);
  const conn = THREE.MathUtils.clamp(p.subdConnectionLength ?? 0, 0, 3);
  const styleScale = styleSmoothScale(p.hubStyle, t);
  // More smoothing → fold more edges into the blend (higher angle threshold)
  // and add a larger fillet to the edges that stay sharp.
  const minSharpAngle = THREE.MathUtils.clamp(
    baseSharpAngle + t * 34 - conn * 9,
    40,
    120
  );
  const minSmoothness = THREE.MathUtils.clamp(0.14 + styleScale * 0.78 - conn * 0.12, 0, 1);
  return { minSharpAngle, minSmoothness };
}

/** Target triangle edge length for refineToLength — adapts to feature size. */
function refineLength(featureSize: number, p: HubParams, opts: OrganicOptions): number {
  const detail = THREE.MathUtils.clamp(p.detail || 48, 12, 128);
  const detailScale = 48 / detail; // higher detail → shorter edges
  const base = opts.preview ? featureSize * 0.62 : featureSize * 0.34;
  // "Subdivide Mesh" → an extra refinement step (finer triangles, smoother hull).
  const subd = !opts.preview && p.meshSubdivide ? 0.66 : 1;
  const len = base * detailScale * subd;
  return THREE.MathUtils.clamp(len, featureSize * 0.1, featureSize * 0.9);
}

function smoothAndRefine(
  solid: Manifold,
  featureSize: number,
  baseSharpAngle: number,
  p: HubParams,
  opts: OrganicOptions
): Manifold {
  if (!opts.organic) return solid;
  const { minSharpAngle, minSmoothness } = smoothPlan(p, baseSharpAngle);
  return solid.smoothOut(minSharpAngle, minSmoothness).refineToLength(refineLength(featureSize, p, opts));
}

function alignZ(m: Manifold, dir: THREE.Vector3): Manifold {
  return transformManifold(m, frameForStrutAxisZ(dir, WORLD_UP));
}

function nodeSphereSegments(p: HubParams): number {
  return Math.max(28, Math.round((p.detail || 48) / 1.5));
}

function strutSegments(p: HubParams): number {
  return Math.max(20, Math.round((p.detail || 48) / 2));
}

/** @deprecated kept for back-compat — now derived from smoothPlan. */
export function nodeSmoothRadius(p: HubParams): number {
  return smoothPlan(p, 60).minSmoothness * 0.13;
}

// ────────────────────────────── ROUND ──────────────────────────────

interface RoundDims {
  iRx: number;
  iRy: number;
  iR: number;
  oR: number;
  strutR: number;
  tipR: number;
  nodeR: number;
  strutLen: number;
  voidInset: number;
}

function roundDims(p: HubParams): RoundDims {
  const tol = socketTolerances(p);
  const iRx = p.rodD / 2 + tol.x;
  const iRy = p.rodD / 2 + tol.y;
  const iR = Math.max(iRx, iRy);
  const oR = iR + p.wall;
  const strutScale = p.subdStrutSize ?? 1;
  const meet = p.junctionMeet ?? 1;
  const strutR = oR * strutScale;
  // Tapered teardrop arm: tip is slimmer than the root but keeps a printable wall.
  const taper = THREE.MathUtils.clamp(p.strutTaper ?? 1, 0.55, 1);
  const tipR = Math.max(strutR * taper, iR + Math.max(1.4, p.wall * 0.45));
  const nodeR = oR * Math.max(1.04, p.bodyScale * 0.78) * meet;
  const strutLen = socketLengthFromSettings(p.rodD, p, p.rodD * 1.2);
  const boreDep = p.rodD * 1.3;
  // Bore-through hollows the core; otherwise leave a solid seat at depth.
  const voidInset = p.boreThrough ? 0 : Math.max(strutLen - boreDep, strutLen * 0.32);
  return { iRx, iRy, iR, oR, strutR, tipR, nodeR, strutLen, voidInset };
}

/** Set screws crossing each round socket wall, for clamping the inserted tube. */
function subtractRoundScrewHoles(hub: Manifold, dirs: THREE.Vector3[], p: HubParams): Manifold {
  const Manifold = getManifold();
  const d = roundDims(p);
  const r = Math.max(1.6, (p.screwDia ?? 4.2) / 2);
  const holeLen = (d.oR + d.iR) * 1.4;
  const at = d.voidInset + (d.strutLen - d.voidInset) * 0.5;
  const holes: Manifold[] = [];

  for (const dir of dirs) {
    const frame = frameForStrutAxisZ(dir, WORLD_UP);
    const lx = new THREE.Vector3();
    const ly = new THREE.Vector3();
    const lz = new THREE.Vector3();
    frame.extractBasis(lx, ly, lz);
    const origin = dir.clone().normalize().multiplyScalar(at);
    // bore crosses the strut along its local X axis
    const cyl = Manifold.cylinder(holeLen, r, r, 14, true);
    const mat = new THREE.Matrix4().makeBasis(ly, lz, lx);
    mat.setPosition(origin);
    holes.push(transformManifold(cyl, mat));
  }
  if (!holes.length) return hub;
  return Manifold.difference(hub, Manifold.union(holes));
}

export function buildRoundNodeHubSolid(
  dirs: THREE.Vector3[],
  p: HubParams,
  opts: OrganicOptions = { organic: true }
): Manifold {
  const Manifold = getManifold();
  const d = roundDims(p);
  const segs = strutSegments(p);

  const outers: Manifold[] = [Manifold.sphere(d.nodeR, nodeSphereSegments(p))];
  // Cone strut: fat root at the node, slimmer tip — tapered teardrop arm.
  const strutTemplate = Manifold.cylinder(d.strutLen, d.strutR, d.tipR, segs, false);
  for (const dir of dirs) {
    outers.push(alignZ(strutTemplate, dir));
  }

  let solid = dirs.length ? Manifold.union(outers) : outers[0];
  solid = smoothAndRefine(solid, d.oR, 66, p, opts);

  if (dirs.length) {
    const boreLen = d.strutLen - d.voidInset + d.oR;
    const voidTemplate = ellipticCylinderAlongZ(boreLen, d.iRx, d.iRy, segs).translate(
      0,
      0,
      d.voidInset
    );
    const voids = dirs.map((dir) => alignZ(voidTemplate, dir));
    solid = Manifold.difference(solid, Manifold.union(voids));
  } else {
    const boreLen = d.strutLen - d.voidInset + d.oR;
    const v = ellipticCylinderAlongZ(boreLen, d.iRx, d.iRy, segs).translate(0, 0, d.voidInset);
    solid = Manifold.difference(solid, v);
  }

  // Entry bevel: a conical lead-in at each socket mouth so the tube slides in.
  const ch = THREE.MathUtils.clamp(p.chamfer ?? 0, 0, p.wall * 0.95);
  if (ch > EPS && dirs.length) {
    // oval counterbore lead-in at the mouth so out-of-round tube still starts cleanly.
    const coneTpl = ellipticCylinderAlongZ(ch + EPS, d.iRx + ch, d.iRy + ch, segs).translate(
      0,
      0,
      d.strutLen - ch
    );
    const cones = dirs.map((dir) => alignZ(coneTpl, dir));
    solid = Manifold.difference(solid, Manifold.union(cones));
  }

  if (dirs.length) {
    solid = addRoundFrictionRibs(solid, dirs, d, p);
    solid = addRoundScrewBosses(solid, dirs, d, p);
  }

  if (p.screwHoles && dirs.length) {
    solid = subtractRoundScrewHoles(solid, dirs, p);
  }
  return solid;
}

// ────────────────────────────── TIMBER ─────────────────────────────

function rectPrismAlongZ(w: number, h: number, len: number): Manifold {
  const Manifold = getManifold();
  return Manifold.cube([w, h, len], true).translate(0, 0, len / 2);
}

function subtractTimberScrewHoles(
  hub: Manifold,
  dirs: THREE.Vector3[],
  d: TimberDims,
  p: HubParams
): Manifold {
  const Manifold = getManifold();
  const r = Math.max(1.6, (p.screwDia ?? 4.2) / 2);
  const holeLen = d.outerW + d.outerH;
  const along = [d.socketLen * 0.42, d.socketLen * 0.66];
  const holes: Manifold[] = [];

  for (const dir of dirs) {
    const frame = frameForStrutAxisZ(dir, WORLD_UP);
    const lx = new THREE.Vector3();
    const ly = new THREE.Vector3();
    const lz = new THREE.Vector3();
    frame.extractBasis(lx, ly, lz);
    for (const zDist of along) {
      const origin = dir.clone().normalize().multiplyScalar(zDist);
      const cyl = Manifold.cylinder(holeLen, r, r, 14, true);
      const mat = new THREE.Matrix4().makeBasis(ly, lz, lx);
      mat.setPosition(origin);
      holes.push(transformManifold(cyl, mat));
    }
  }
  if (!holes.length) return hub;
  return Manifold.difference(hub, Manifold.union(holes));
}

export function buildTimberNodeHubSolid(
  dirs: THREE.Vector3[],
  p: HubParams,
  opts: OrganicOptions = { organic: true }
): Manifold {
  const Manifold = getManifold();
  const d = timberDims(p);
  const inset = timberVoidInset(d, p, dirs);
  const feature = Math.max(d.outerW, d.outerH) * 0.5;
  // Timber keeps flat socket faces unless smoothing is pushed high.
  const baseSharpAngle = 52;

  const outerTemplate = rectPrismAlongZ(d.outerW, d.outerH, d.socketLen);
  const outers: Manifold[] = dirs.length
    ? dirs.map((dir) => alignZ(outerTemplate, dir))
    : [outerTemplate];

  const coreR = timberCoreRadius(d, p) * (p.junctionMeet ?? 1);
  if (coreR > EPS) outers.push(Manifold.sphere(coreR, nodeSphereSegments(p)));

  let solid = outers.length > 1 ? Manifold.union(outers) : outers[0];
  solid = smoothAndRefine(solid, feature, baseSharpAngle, p, opts);

  const boreLen = Math.max(d.socketLen - inset + d.wall, d.innerH * 0.6);
  const voidTemplate = rectPrismAlongZ(d.innerW, d.innerH, boreLen).translate(0, 0, inset);
  if (dirs.length) {
    const voids = dirs.map((dir) => alignZ(voidTemplate, dir));
    solid = Manifold.difference(solid, Manifold.union(voids));
  } else {
    solid = Manifold.difference(solid, voidTemplate);
  }

  // Entry bevel: a flared rectangular lead-in at each lumber mouth.
  const ch = THREE.MathUtils.clamp(p.chamfer ?? 0, 0, d.wall * 0.95);
  if (ch > EPS && dirs.length) {
    const CrossSection = getCrossSection();
    const scaleTop: [number, number] = [
      (d.innerW + ch * 2) / d.innerW,
      (d.innerH + ch * 2) / d.innerH,
    ];
    const bevelTpl = CrossSection.square([d.innerW, d.innerH], true)
      .extrude(ch + EPS, 1, 0, scaleTop, false)
      .translate(0, 0, d.socketLen - ch);
    const bevels = dirs.map((dir) => alignZ(bevelTpl, dir));
    solid = Manifold.difference(solid, Manifold.union(bevels));
  }

  if (dirs.length) {
    solid = addTimberFrictionRibs(solid, dirs, d, p, inset);
    solid = addTimberScrewBosses(solid, dirs, d, p);
  }

  if (p.screwHoles && dirs.length) {
    solid = subtractTimberScrewHoles(solid, dirs, d, p);
  }
  return solid;
}

// ───────────────────────────── PUBLIC ──────────────────────────────

export function createRoundNodeHub(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  const organic = (p.hubStyle ?? 'organic') === 'organic';
  const opts: OrganicOptions = { organic, preview: p.domePreview && !p.printFrame };
  const solid = buildRoundNodeHubSolid(dirs, p, opts);
  const geo = finishManifoldHub(solid, dirs, p, { matType: 'round', skipSmooth: true });
  geo.userData.manifoldNode = true;
  return geo;
}

export function createTimberNodeHub(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  const organic = (p.hubStyle ?? 'organic') === 'organic';
  const opts: OrganicOptions = { organic, preview: p.domePreview && !p.printFrame };
  const solid = buildTimberNodeHubSolid(dirs, p, opts);
  const geo = finishManifoldHub(solid, dirs, p, { matType: 'rect', skipSmooth: true });
  geo.userData.manifoldNode = true;
  return geo;
}

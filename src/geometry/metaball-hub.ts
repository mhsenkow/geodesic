import * as THREE from 'three';
import type { Manifold, Vec3 } from 'manifold-3d';
import type { HubParams } from '../types';
import { EPS } from '../types';
import { getManifold } from './manifold-init';
import { frameForStrutAxisZ, WORLD_UP } from './hub-orient';
import { transformManifold } from './manifold-mesh';
import { finishManifoldHub } from './timber-finish';
import { timberDims, type TimberDims } from './timber-socket';
import { timberVoidInset } from './timber-junction';
import {
  addRoundFrictionRibs,
  addRoundScrewBosses,
  addTimberFrictionRibs,
  addTimberScrewBosses,
  ellipticCylinderAlongZ,
  socketLengthFromSettings,
  socketTolerances,
} from './socket-fit';

/* ------------------------------------------------------------------ *
 * Amorphous "metaball" hub.
 *
 * The outer shell is a signed-distance field: a node sphere smooth-min'd
 * (metaball-blended) with one capsule per strut. Manifold.levelSet turns
 * that field into a guaranteed-watertight mesh, then crisp bores / screw
 * holes / entry bevels are booleaned out so the sockets still fit struts.
 *
 * surfaceSmooth → blend radius k (bigger = more molten/amorphous)
 * bodyScale     → node sphere size
 * subdStrutSize → strut (capsule) radius
 * ------------------------------------------------------------------ */

export interface MetaballOptions {
  preview?: boolean;
}

/**
 * Polynomial smooth-max — the metaball blend.
 * Manifold.levelSet treats POSITIVE as inside, so each primitive is a
 * "positive-inside" field and the union is a smooth max (which bulges
 * material outward where struts meet — the molten metaball look).
 */
function smax(a: number, b: number, k: number): number {
  if (k <= EPS) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * h * k * (1 / 6);
}

interface MetaDims {
  round: boolean;
  iRx: number;
  iRy: number;
  iR: number;
  oR: number;
  nodeR: number;
  strutR: number;
  tipR: number;
  strutLen: number;
  voidInset: number;
  k: number;
  feature: number;
  timber?: TimberDims;
}

function metaDims(dirs: THREE.Vector3[], p: HubParams): MetaDims {
  const round = p.matType === 'round';
  const meet = p.junctionMeet ?? 1;
  const strutScale = p.subdStrutSize ?? 1;
  const t = THREE.MathUtils.clamp(p.surfaceSmooth ?? 0.6, 0, 1);
  const taper = THREE.MathUtils.clamp(p.strutTaper ?? 1, 0.55, 1);

  if (round) {
    const tol = socketTolerances(p);
    const iRx = p.rodD / 2 + tol.x;
    const iRy = p.rodD / 2 + tol.y;
    const iR = Math.max(iRx, iRy);
    const oR = iR + p.wall;
    const strutLen = socketLengthFromSettings(p.rodD, p, p.rodD * 1.2);
    const boreDep = p.rodD * 1.3;
    const strutR = oR * strutScale;
    return {
      round,
      iRx,
      iRy,
      iR,
      oR,
      nodeR: oR * Math.max(1.02, p.bodyScale * 0.74) * meet,
      strutR,
      tipR: Math.max(strutR * taper, iR + Math.max(1.4, p.wall * 0.45)),
      strutLen,
      voidInset: p.boreThrough ? 0 : Math.max(strutLen - boreDep, strutLen * 0.32),
      // blend radius scales with strut size; more smooth → fatter molten joins
      k: oR * (0.35 + t * 1.7),
      feature: oR,
    };
  }

  const d = timberDims(p);
  const halfDiag = Math.hypot(d.outerW, d.outerH) / 2;
  const strutR = halfDiag * strutScale;
  return {
    round,
    iRx: 0,
    iRy: 0,
    iR: 0,
    oR: halfDiag,
    nodeR: halfDiag * Math.max(1.02, p.bodyScale * 0.7) * meet,
    strutR,
    tipR: Math.max(strutR * taper, Math.hypot(d.innerW, d.innerH) / 2 + 1.5),
    strutLen: d.socketLen,
    voidInset: p.boreThrough ? Math.max(2, d.wall) : timberVoidInset(d, p, dirs),
    k: halfDiag * (0.3 + t * 1.5),
    feature: halfDiag,
    timber: d,
  };
}

function levelSetEdge(m: MetaDims, opts: MetaballOptions, p: HubParams): number {
  const detail = THREE.MathUtils.clamp(p.detail || 48, 12, 128);
  // Detail nudges resolution, but the grid must always resolve the strut radius
  // or levelSet can pinch a strut off into a second component.
  const q = THREE.MathUtils.clamp(48 / detail, 0.7, 1.5);
  const base = (opts.preview ? 0.34 : 0.2) * m.feature * q;
  return THREE.MathUtils.clamp(base, m.feature * 0.16, m.feature * 0.36);
}

function alignZ(mfd: Manifold, dir: THREE.Vector3): Manifold {
  return transformManifold(mfd, frameForStrutAxisZ(dir, WORLD_UP));
}

/** Outer metaball shell as a watertight Manifold via levelSet. */
function buildMetaballShell(dirs: THREE.Vector3[], m: MetaDims, opts: MetaballOptions, p: HubParams): Manifold {
  const Manifold = getManifold();
  const ends = dirs.map((d) => d.clone().normalize().multiplyScalar(m.strutLen));
  const nodeR = m.nodeR;
  const strutR = m.strutR;
  const tipR = m.tipR;
  const k = m.k;

  // Positive-inside fields: (radius − distance). Combined with smooth-max.
  const sdf = (point: Vec3): number => {
    const px = point[0];
    const py = point[1];
    const pz = point[2];
    let d = nodeR - Math.sqrt(px * px + py * py + pz * pz);
    for (let i = 0; i < ends.length; i++) {
      const bx = ends[i].x;
      const by = ends[i].y;
      const bz = ends[i].z;
      const bb = bx * bx + by * by + bz * bz || 1;
      let h = (px * bx + py * by + pz * bz) / bb;
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const cx = px - bx * h;
      const cy = py - by * h;
      const cz = pz - bz * h;
      // radius tapers from root (h=0) to tip (h=1) → teardrop arm
      const r = strutR + (tipR - strutR) * h;
      const cd = r - Math.sqrt(cx * cx + cy * cy + cz * cz);
      d = smax(d, cd, k);
    }
    return d;
  };

  const reach = m.strutLen + m.strutR + m.k + 3;
  const bounds = { min: [-reach, -reach, -reach] as Vec3, max: [reach, reach, reach] as Vec3 };
  const edge = levelSetEdge(m, opts, p);
  return Manifold.levelSet(sdf, bounds, edge, 0);
}

function subtractInterior(solid: Manifold, dirs: THREE.Vector3[], m: MetaDims, p: HubParams): Manifold {
  const Manifold = getManifold();
  const segs = Math.max(20, Math.round((p.detail || 48) / 2));
  const voids: Manifold[] = [];

  for (const dir of dirs) {
    if (m.round) {
      const boreLen = m.strutLen - m.voidInset + m.oR;
      const cyl = ellipticCylinderAlongZ(boreLen, m.iRx, m.iRy, segs).translate(0, 0, m.voidInset);
      voids.push(alignZ(cyl, dir));
    } else {
      const d = m.timber!;
      const boreLen = Math.max(d.socketLen - m.voidInset + d.wall, d.innerH * 0.6);
      const box = Manifold.cube([d.innerW, d.innerH, boreLen], true).translate(
        0,
        0,
        m.voidInset + boreLen / 2
      );
      voids.push(alignZ(box, dir));
    }
  }
  let out = voids.length ? Manifold.difference(solid, Manifold.union(voids)) : solid;

  // Entry bevel
  const ch = THREE.MathUtils.clamp(p.chamfer ?? 0, 0, (m.round ? p.wall : m.timber!.wall) * 0.95);
  if (ch > EPS) {
    const cones = dirs.map((dir) => {
      if (m.round) {
        const cone = ellipticCylinderAlongZ(ch + EPS, m.iRx + ch, m.iRy + ch, segs).translate(
          0,
          0,
          m.strutLen - ch
        );
        return alignZ(cone, dir);
      }
      const d = m.timber!;
      const box = Manifold.cube([d.innerW + ch * 2, d.innerH + ch * 2, ch + EPS], true).translate(
        0,
        0,
        m.strutLen - ch / 2
      );
      return alignZ(box, dir);
    });
    out = Manifold.difference(out, Manifold.union(cones));
  }

  if (dirs.length) {
    if (m.round) {
      out = addRoundFrictionRibs(out, dirs, m, p);
      out = addRoundScrewBosses(out, dirs, m, p);
    } else {
      out = addTimberFrictionRibs(out, dirs, m.timber!, p, m.voidInset);
      out = addTimberScrewBosses(out, dirs, m.timber!, p);
    }
  }

  // Screw holes
  if (p.screwHoles && dirs.length) {
    const r = Math.max(1.6, (p.screwDia ?? 4.2) / 2);
    const holeLen = m.oR * 2.6;
    const at = m.voidInset + (m.strutLen - m.voidInset) * 0.5;
    const holes: Manifold[] = [];
    for (const dir of dirs) {
      const frame = frameForStrutAxisZ(dir, WORLD_UP);
      const lx = new THREE.Vector3();
      const ly = new THREE.Vector3();
      const lz = new THREE.Vector3();
      frame.extractBasis(lx, ly, lz);
      const origin = dir.clone().normalize().multiplyScalar(at);
      const cyl = Manifold.cylinder(holeLen, r, r, 14, true);
      const mat = new THREE.Matrix4().makeBasis(ly, lz, lx);
      mat.setPosition(origin);
      holes.push(transformManifold(cyl, mat));
    }
    out = Manifold.difference(out, Manifold.union(holes));
  }

  return out;
}

export function buildMetaballHubSolid(
  dirs: THREE.Vector3[],
  p: HubParams,
  opts: MetaballOptions = {}
): Manifold {
  const m = metaDims(dirs, p);
  const shell = buildMetaballShell(dirs, m, opts, p);
  if (!dirs.length) return shell;
  return subtractInterior(shell, dirs, m, p);
}

export function createMetaballHub(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  const opts: MetaballOptions = { preview: p.domePreview && !p.printFrame };
  const solid = buildMetaballHubSolid(dirs, p, opts);
  const geo = finishManifoldHub(solid, dirs, p, { matType: p.matType, skipSmooth: true });
  geo.userData.metaball = true;
  return geo;
}

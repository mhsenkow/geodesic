import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import type { HubParams } from '../types';
import { EPS } from '../types';
import { frameForStrutAxisZ, WORLD_UP } from './hub-orient';
import { getCrossSection, getManifold } from './manifold-init';
import { transformManifold } from './manifold-mesh';
import { finishManifoldHub } from './timber-finish';
import { timberVoidInset } from './timber-junction';
import { timberCoreRadius } from './timber-organic-profile';
import { flareParams, timberDims, type TimberDims } from './timber-socket';
import { addTimberFrictionRibs, addTimberScrewBosses } from './socket-fit';

function alignZToDirection(m: Manifold, dir: THREE.Vector3, refUp = WORLD_UP): Manifold {
  return transformManifold(m, frameForStrutAxisZ(dir, refUp));
}

/** Solid socket shell along +Z (hub center at z=0, lumber entry at z=socketLen). */
export function buildOuterAlongZ(d: TimberDims, p: HubParams): Manifold {
  const Manifold = getManifold();
  const CrossSection = getCrossSection();
  const { flare, rootLen, lipLen, shaftLen } = flareParams(p, 'organic', d);

  if (rootLen <= EPS && shaftLen + lipLen <= EPS) {
    return Manifold.cube([d.outerW, d.outerH, d.socketLen], true).translate(0, 0, d.socketLen / 2);
  }

  const parts: Manifold[] = [];

  if (rootLen > EPS) {
    const baseW = d.innerW + d.wall * 2 * flare * 1.06;
    const baseH = d.innerH + d.wall * 2 * flare * 1.06;
    const scaleTop: [number, number] = [d.outerW / baseW, d.outerH / baseH];
    parts.push(CrossSection.square([baseW, baseH], true).extrude(rootLen, 3, 0, scaleTop, false));
  }

  const tailLen = shaftLen + lipLen;
  if (tailLen > EPS) {
    parts.push(
      Manifold.cube([d.outerW, d.outerH, tailLen], true).translate(0, 0, rootLen + tailLen / 2)
    );
  }

  return parts.length === 1 ? parts[0] : Manifold.union(parts);
}

/** Lumber bore along +Z; inset matches round hub open-bore depth. */
export function buildVoidAlongZ(d: TimberDims, inset: number): Manifold {
  const Manifold = getManifold();
  const boreLen = Math.max(d.socketLen - inset + d.wall * 0.5, d.innerH * 0.55);
  return Manifold.cube([d.innerW, d.innerH, boreLen], true).translate(0, 0, inset + boreLen / 2);
}

export function subtractScrewHoles(hub: Manifold, dirs: THREE.Vector3[], d: TimberDims, p: HubParams): Manifold {
  const Manifold = getManifold();
  const r = Math.max(1.6, (p.screwDia ?? 4.2) / 2);
  const holeLen = d.wall * 3.5;
  const along = [d.socketLen * 0.36, d.socketLen * 0.62];
  const holes: Manifold[] = [];

  for (const dir of dirs) {
    const localZ = dir.clone().normalize();
    const frame = frameForStrutAxisZ(localZ, WORLD_UP);
    const localX = new THREE.Vector3();
    const localY = new THREE.Vector3();
    const localZOut = new THREE.Vector3();
    frame.extractBasis(localX, localY, localZOut);

    for (const zDist of along) {
      for (const side of [-1, 1] as const) {
        const origin = localZ
          .clone()
          .multiplyScalar(zDist)
          .add(localX.clone().multiplyScalar(side * (d.innerW / 2 + d.wall * 0.55)));
        const cyl = Manifold.cylinder(holeLen, r, r, 12, true);
        const mat = new THREE.Matrix4().makeBasis(
          localY.clone().multiplyScalar(side),
          localZ,
          localX.clone().multiplyScalar(side)
        );
        mat.setPosition(origin);
        holes.push(transformManifold(cyl, mat));
      }
    }
  }

  if (!holes.length) return hub;
  return Manifold.difference(hub, Manifold.union(holes));
}

/**
 * One printable solid: union(all outer envelopes + junction core) − union(all lumber voids).
 */
export function buildTimberHubSolid(dirs: THREE.Vector3[], p: HubParams): Manifold {
  const Manifold = getManifold();
  const d = timberDims(p);
  const inset = timberVoidInset(d, p, dirs);

  if (!dirs.length) {
    return Manifold.difference(buildOuterAlongZ(d, p), buildVoidAlongZ(d, inset));
  }

  const outerTemplate = buildOuterAlongZ(d, p);
  const voidTemplate = buildVoidAlongZ(d, inset);

  const outers: Manifold[] = dirs.map((dir) => alignZToDirection(outerTemplate, dir));
  const voids: Manifold[] = dirs.map((dir) => alignZToDirection(voidTemplate, dir));

  const coreR = timberCoreRadius(d, p) * (p.junctionMeet ?? 1);
  if (coreR > EPS) {
    const segs = Math.max(24, Math.round((p.detail || 48) / 2));
    outers.push(Manifold.sphere(coreR, segs));
  }

  let hub = Manifold.difference(Manifold.union(outers), Manifold.union(voids));

  hub = addTimberFrictionRibs(hub, dirs, d, p, inset);
  hub = addTimberScrewBosses(hub, dirs, d, p);

  if (p.screwHoles) {
    hub = subtractScrewHoles(hub, dirs, d, p);
  }

  return hub;
}

/** Full timber hub (sharp CSG): solid → orient/foot. */
export function createTimberHubManifold(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  const solid = buildTimberHubSolid(dirs, p);
  return finishManifoldHub(solid, dirs, p, { matType: 'rect' });
}

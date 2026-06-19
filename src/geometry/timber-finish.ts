import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import type { HubParams } from '../types';
import { choosePrintUp } from './hub-foot';
import { addHubDecorations } from './hub-decorations';
import { manifoldToBufferGeometry, transformManifold } from './manifold-mesh';
import { targetTriangleLength } from './printability';
import { sitManifoldOnBed, unionPrintBase } from './timber-print-base';

function alignManifoldToPrintUp(m: Manifold, printUp: THREE.Vector3): Manifold {
  const q = new THREE.Quaternion().setFromUnitVectors(
    printUp.clone().normalize(),
    new THREE.Vector3(0, 1, 0)
  );
  return transformManifold(m, new THREE.Matrix4().makeRotationFromQuaternion(q));
}

function surfaceSmoothAmount(p: HubParams): number {
  const t = THREE.MathUtils.clamp(p.surfaceSmooth ?? 0.5, 0, 1);
  return 0.03 + t * 0.055;
}

export interface FinishManifoldOptions {
  matType?: 'round' | 'rect';
  /** Node hubs already ran smoothOut + refine during CSG. */
  skipSmooth?: boolean;
}

/**
 * Orient → optional polish → watertight print base → seat on bed.
 * Everything stays inside Manifold so the base is a true boolean union
 * (not a merged shell), then a single conversion to BufferGeometry.
 */
export function finishManifoldHub(
  solid: Manifold,
  dirs: THREE.Vector3[],
  p: HubParams,
  opts: FinishManifoldOptions = {}
): THREE.BufferGeometry {
  const matType = opts.matType ?? p.matType;
  let hub = solid;
  let printUp: THREE.Vector3 | null = null;

  if (p.printFrame) {
    printUp = p.printUpOverride
      ? new THREE.Vector3(...p.printUpOverride).normalize()
      : choosePrintUp(dirs);
    hub = alignManifoldToPrintUp(hub, printUp);
  }

  const smooth = surfaceSmoothAmount(p);
  const shouldSmooth = !opts.skipSmooth && (p.printFrame || p.domePreview) && smooth > 0.008;
  if (shouldSmooth) {
    hub = hub.smoothOut(50, smooth).refine(2);
  }

  // Watertight print base only for the standalone printable hub (inspector / export).
  if (p.printFrame && p.printFoot) {
    hub = unionPrintBase(hub, { ...p, matType });
  }

  if (p.printFrame) {
    hub = hub.refineToLength(targetTriangleLength({ ...p, matType }));
  }

  if (p.printFrame) {
    hub = sitManifoldOnBed(hub);
  }

  let geo = manifoldToBufferGeometry(hub);
  if (p.printFrame) {
    const decorated = addHubDecorations(geo, dirs, { ...p, matType }, printUp);
    if (decorated !== geo) geo.dispose();
    geo = decorated;
  }
  if (printUp) geo.userData.printUp = printUp.toArray();
  return geo;
}

/** @deprecated use finishManifoldHub */
export function finishTimberHub(
  solid: Manifold,
  dirs: THREE.Vector3[],
  p: HubParams
): THREE.BufferGeometry {
  return finishManifoldHub(solid, dirs, p, { matType: 'rect' });
}

export function prepGeoForStl(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HubParams } from '../types';
import { isManifoldReady } from './manifold-init';
import { createTimberHubManifold } from './timber-manifold';
import { createTimberSocketTemplate, timberDims } from './timber-socket';
import { timberCoreRadius } from './timber-organic-profile';
import { quatForStrutAxisY, WORLD_UP } from './hub-orient';

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

/** Solid timber sockets + junction sphere — printable shell, not hollow tubes. */
function createTimberHubOrganic(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  if (!dirs.length) return createTimberSocketTemplate(p);

  const template = createTimberSocketTemplate(p);
  const parts: THREE.BufferGeometry[] = [];

  for (const dir of dirs) {
    const socket = template.clone();
    socket.applyQuaternion(quatForStrutAxisY(dir, WORLD_UP));
    parts.push(prepGeo(socket));
  }
  template.dispose();

  const d = timberDims(p);
  const coreR = timberCoreRadius(d, p) * (p.junctionMeet ?? 1);
  const segs = Math.max(20, Math.round((p.detail || 48) / 2));
  const sphere = new THREE.SphereGeometry(coreR, segs, Math.max(12, Math.round(segs / 2)));
  parts.push(prepGeo(sphere));

  const merged = mergeGeometries(parts, false);
  if (!merged) return createTimberSocketTemplate(p);

  const weld = Math.max(0.08, Math.max(d.outerW, d.outerH) * 0.04);
  const welded = mergeVertices(merged, weld);
  welded.computeVertexNormals();
  return welded;
}

/** Legacy merge-only fallback when Manifold WASM is unavailable. */
function createTimberHubLegacy(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  return createTimberHubOrganic(dirs, p);
}

/** Printable timber hub — organic mesh shells or sharp CSG. */
export function createTimberHub(dirs: THREE.Vector3[], p: HubParams): THREE.BufferGeometry {
  if ((p.hubStyle ?? 'organic') === 'organic') {
    return createTimberHubOrganic(dirs, p);
  }
  if (!isManifoldReady()) {
    return createTimberHubLegacy(dirs, p);
  }
  return createTimberHubManifold(dirs, p);
}

import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import type { HubParams } from '../types';
import { getManifold } from './manifold-init';
import { bufferGeometryToManifold } from './manifold-mesh';

const font = new Font(helvetikerBold as unknown as ConstructorParameters<typeof Font>[0]);

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

function textGeo(text: string, size: number, height: number): THREE.BufferGeometry {
  const geo = new TextGeometry(text, {
    font,
    size,
    height,
    curveSegments: 2,
    bevelEnabled: true,
    bevelThickness: height * 0.18,
    bevelSize: height * 0.12,
    bevelSegments: 1,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2,
    -bb.min.z
  );
  return prepGeo(geo);
}

function basisForNormal(normal: THREE.Vector3, preferredUp = new THREE.Vector3(0, 1, 0)): THREE.Matrix4 {
  const z = normal.clone().normalize();
  const ref = Math.abs(z.dot(preferredUp)) > 0.92 ? new THREE.Vector3(1, 0, 0) : preferredUp;
  const x = new THREE.Vector3().crossVectors(ref, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

function transformGeo(geo: THREE.BufferGeometry, normal: THREE.Vector3, pos: THREE.Vector3): THREE.BufferGeometry {
  const out = geo.clone();
  const mat = basisForNormal(normal);
  mat.setPosition(pos);
  out.applyMatrix4(mat);
  return prepGeo(out);
}

function rotatedDirs(dirs: THREE.Vector3[], printUp: THREE.Vector3 | null): THREE.Vector3[] {
  if (!printUp) return dirs.map((d) => d.clone().normalize());
  const q = new THREE.Quaternion().setFromUnitVectors(printUp.clone().normalize(), new THREE.Vector3(0, 1, 0));
  return dirs.map((d) => d.clone().normalize().applyQuaternion(q).normalize());
}

function socketReach(p: HubParams): number {
  if (p.socketDepthMm && p.socketDepthMm > 0) return p.socketDepthMm;
  const stock = p.matType === 'round' ? p.rodD : Math.max(p.lumW, p.lumH);
  const depthFrac = THREE.MathUtils.clamp(p.socketDepth ?? 0.85, 0.55, 1.05);
  return stock * 2.5 * (depthFrac / 0.85);
}

interface DecorationLayout {
  center: THREE.Vector3;
  footY: number;
  labelSize: number;
  labelHeight: number;
}

function decorationLayout(
  bbMin: THREE.Vector3,
  bbMax: THREE.Vector3,
  p: HubParams
): DecorationLayout {
  return {
    center: new THREE.Vector3(
      (bbMin.x + bbMax.x) / 2,
      bbMin.y + (bbMax.y - bbMin.y) * 0.45,
      (bbMin.z + bbMax.z) / 2
    ),
    footY: bbMin.y + Math.max(p.baseThickness ?? 4, 2) * 0.72,
    labelSize: THREE.MathUtils.clamp(Math.max(p.rodD, p.lumH) * 0.18, 3.0, 7.0),
    labelHeight: THREE.MathUtils.clamp(p.wall * 0.12, 0.45, 1.0),
  };
}

/** Build embossed label / notch solids in print-up space (+Y up). */
function buildDecorationGeometries(
  dirs: THREE.Vector3[],
  p: HubParams,
  printUp: THREE.Vector3 | null,
  bbMin: THREE.Vector3,
  bbMax: THREE.Vector3
): THREE.BufferGeometry[] {
  if (!p.embossLabels && !p.alignmentNotches) return [];

  const { center, footY, labelSize, labelHeight } = decorationLayout(bbMin, bbMax, p);
  const reach = socketReach(p);
  const parts: THREE.BufferGeometry[] = [];

  if (p.embossLabels && p.hubLabel && p.printFoot) {
    const g = textGeo(p.hubLabel, labelSize * 1.1, labelHeight);
    const mat = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0)
    );
    mat.setPosition(new THREE.Vector3(center.x, footY, center.z));
    g.applyMatrix4(mat);
    parts.push(prepGeo(g));
  }

  const outDirs = rotatedDirs(dirs, printUp);
  const labels = p.socketLabels ?? outDirs.map((_, i) => String(i + 1));
  const notchTemplate = new THREE.BoxGeometry(labelSize * 0.95, labelHeight * 1.8, labelHeight * 3.2);
  notchTemplate.translate(0, 0, labelHeight * 0.55);

  outDirs.forEach((dir, i) => {
    const normal = dir.clone().normalize();
    const anchor = center.clone().add(normal.clone().multiplyScalar(reach * 0.76));
    if (p.embossLabels) {
      const g = textGeo(labels[i] ?? String(i + 1), labelSize * 0.78, labelHeight);
      parts.push(transformGeo(g, normal, anchor.clone().add(normal.clone().multiplyScalar(labelHeight * 0.35))));
    }
    if (p.alignmentNotches) {
      const notchPos = anchor
        .clone()
        .add(normal.clone().multiplyScalar(labelHeight * 0.45))
        .add(new THREE.Vector3(0, labelSize * 0.42, 0));
      parts.push(transformGeo(notchTemplate, normal, notchPos));
    }
  });

  notchTemplate.dispose();
  return parts;
}

/**
 * Fuse embossed labels and alignment notches into the hub solid so export
 * stays a single watertight manifold (not a merged triangle soup).
 */
export function unionHubDecorations(
  hub: Manifold,
  dirs: THREE.Vector3[],
  p: HubParams,
  printUp: THREE.Vector3 | null
): Manifold {
  if (!p.embossLabels && !p.alignmentNotches) return hub;

  const bb = hub.boundingBox();
  const bbMin = new THREE.Vector3(bb.min[0], bb.min[1], bb.min[2]);
  const bbMax = new THREE.Vector3(bb.max[0], bb.max[1], bb.max[2]);
  const geos = buildDecorationGeometries(dirs, p, printUp, bbMin, bbMax);
  if (!geos.length) return hub;

  const Manifold = getManifold();
  const solids: Manifold[] = [hub];
  for (const geo of geos) {
    try {
      solids.push(bufferGeometryToManifold(geo, Manifold));
    } catch {
      // Skip decoration pieces that fail manifold conversion rather than breaking export.
    } finally {
      geo.dispose();
    }
  }

  if (solids.length === 1) return hub;
  return Manifold.union(solids);
}

/** Legacy mesh merge — prefer unionHubDecorations on the Manifold path. */
export function addHubDecorations(
  geo: THREE.BufferGeometry,
  dirs: THREE.Vector3[],
  p: HubParams,
  printUp: THREE.Vector3 | null
): THREE.BufferGeometry {
  if (!p.embossLabels && !p.alignmentNotches) return geo;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const geos = buildDecorationGeometries(dirs, p, printUp, bb.min, bb.max);
  if (!geos.length) return geo;

  const parts: THREE.BufferGeometry[] = [prepGeo(geo), ...geos];
  const merged = mergeGeometries(parts, false);
  for (const g of geos) g.dispose();
  if (!merged) return geo;
  merged.computeVertexNormals();
  return merged;
}

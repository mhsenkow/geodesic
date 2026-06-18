import * as THREE from 'three';
import type { HubParams } from '../types';
import { EPS } from '../types';

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

interface HoleSpec {
  cx: number;
  cy: number;
  r: number;
}

/** Flat panel extruded in +Z with optional through-holes (for screw clearance). */
function extrudePanelWithHoles(
  width: number,
  height: number,
  depth: number,
  holes: HoleSpec[]
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, height);
  shape.lineTo(0, height);
  shape.closePath();

  for (const h of holes) {
    const hole = new THREE.Path();
    hole.absarc(h.cx, h.cy, h.r, 0, Math.PI * 2, false);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false,
  });
  geo.computeVertexNormals();
  return geo;
}

function rectFrameShape(outerW: number, outerH: number, innerW: number, innerH: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, outerH / 2);
  shape.lineTo(-outerW / 2, outerH / 2);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-innerW / 2, -innerH / 2);
  hole.lineTo(-innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, -innerH / 2);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

/**
 * Clean structural timber socket: four wall panels + entry lip + stop ring.
 * Strut inserts along +Y; wide lumber face gets screw holes through side walls.
 */
export function createCleanTimberSocket(p: HubParams): THREE.BufferGeometry[] {
  const innerW = p.lumW + p.tol * 2;
  const innerH = p.lumH + p.tol * 2;
  const wall = Math.max(2.5, p.wall);
  const outerW = innerW + wall * 2;
  const outerH = innerH + wall * 2;

  const socketLen = Math.max(innerH * 0.72, 50);
  const screwY = socketLen * 0.38;
  const screwR = p.screwHoles ? Math.max(1.8, (p.screwDia ?? 4.2) / 2) : 0;

  const sideHoles: HoleSpec[] =
    p.screwHoles && screwR > EPS
      ? [
          { cx: outerH / 2, cy: screwY, r: screwR },
          { cx: outerH / 2, cy: socketLen - screwY * 0.65, r: screwR },
        ]
      : [];

  const endHoles: HoleSpec[] =
    p.screwHoles && screwR > EPS
      ? [{ cx: outerW / 2, cy: screwY, r: screwR * 0.92 }]
      : [];

  const parts: THREE.BufferGeometry[] = [];

  for (const sign of [-1, 1] as const) {
    const panel = extrudePanelWithHoles(outerH, socketLen, wall, sideHoles);
    panel.translate(0, 0, -wall);
    panel.rotateY((sign * Math.PI) / 2);
    panel.translate(sign * (innerW / 2 + wall / 2), 0, 0);
    parts.push(prepGeo(panel));
  }

  for (const sign of [-1, 1] as const) {
    const panel = extrudePanelWithHoles(outerW, socketLen, wall, endHoles);
    panel.translate(0, 0, -wall);
    panel.translate(0, 0, sign * (innerH / 2 + wall / 2));
    parts.push(prepGeo(panel));
  }

  const lipLen = Math.max(wall * 1.4, 5);
  const bevel = Math.min(Math.max(p.chamfer * 0.4, 0), wall * 0.35);
  const lip = new THREE.ExtrudeGeometry(rectFrameShape(outerW, outerH, innerW, innerH), {
    depth: lipLen,
    steps: 1,
    bevelEnabled: bevel > EPS,
    bevelSegments: bevel > EPS ? 2 : 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  lip.rotateX(-Math.PI / 2);
  lip.translate(0, socketLen - lipLen * 0.15, 0);
  parts.push(prepGeo(lip));

  const stopLen = Math.max(wall * 0.9, 3);
  const stop = new THREE.ExtrudeGeometry(rectFrameShape(outerW, outerH, innerW + 0.6, innerH + 0.6), {
    depth: stopLen,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 4,
  });
  stop.rotateX(-Math.PI / 2);
  stop.translate(0, stopLen * 0.5, 0);
  parts.push(prepGeo(stop));

  return parts;
}

/** Compact box node that joins socket roots — no organic sphere. */
export function createTimberNodeCore(p: HubParams): THREE.BufferGeometry {
  const innerW = p.lumW + p.tol * 2;
  const innerH = p.lumH + p.tol * 2;
  const wall = Math.max(2.5, p.wall);
  const outerW = innerW + wall * 2;
  const outerH = innerH + wall * 2;
  const coreW = outerW * 1.05;
  const coreH = outerH * 1.05;
  const coreLen = Math.max(wall * 2.2, 8);

  const geo = new THREE.BoxGeometry(coreW, coreLen, coreH, 1, 1, 1);
  geo.translate(0, coreLen / 2, 0);
  geo.computeVertexNormals();
  return prepGeo(geo);
}

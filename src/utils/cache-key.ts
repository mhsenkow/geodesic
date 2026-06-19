import type { HubParams } from '../types';

/** Stable fingerprint for hub-param caches (order-independent, no JSON.stringify). */
export function hubParamsFingerprint(p: HubParams): string {
  const keys: (keyof HubParams)[] = [
    'matType',
    'rodD',
    'lumW',
    'lumH',
    'tol',
    'tolX',
    'tolY',
    'wall',
    'bodyScale',
    'chamfer',
    'detail',
    'printFoot',
    'footMargin',
    'hubStyle',
    'junctionMeet',
    'baseThickness',
    'baseScale',
    'socketDepth',
    'socketDepthMm',
    'surfaceSmooth',
    'meshSubdivide',
    'subdConnectionLength',
    'subdStrutSize',
    'strutTaper',
    'boreThrough',
    'baseVent',
    'nozzleDia',
    'frictionRibs',
    'ribDepth',
    'ribCount',
    'screwBosses',
    'screwHoles',
    'screwDia',
    'embossLabels',
    'alignmentNotches',
    'printFrame',
    'domePreview',
    'junctionDrip',
    'surfaceNoise',
    'hubStyleBlend',
    'treeSupportBase',
  ];
  const parts: string[] = [];
  for (const k of keys) {
    const v = p[k];
    if (v === undefined) continue;
    parts.push(`${k}:${typeof v === 'number' ? v.toFixed(4) : String(v)}`);
  }
  return parts.join('|');
}

export function hubTypeFingerprint(ht: { val: number; angs: number[]; isBase: boolean }, p: HubParams): string {
  return `${ht.val}:${ht.angs.map((a) => a.toFixed(2)).join(',')}:${ht.isBase}:${hubParamsFingerprint(p)}`;
}

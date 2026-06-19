import type { HubParams, HubStyle } from '../types';
import * as THREE from 'three';

/** Preset-specific easing from surfaceSmooth → Manifold smoothOut inputs. */
export function styleSmoothScale(hubStyle: HubStyle | undefined, surfaceSmooth: number): number {
  const t = THREE.MathUtils.clamp(surfaceSmooth ?? 0.5, 0, 1);
  switch (hubStyle ?? 'organic') {
    case 'sharp':
      return t * 0.35;
    case 'metaball':
      return 0.55 + t * 0.65;
    case 'organic':
    default:
      return 0.4 + t * 0.55;
  }
}

export function effectiveHubStyle(p: HubParams): HubStyle {
  const blend = THREE.MathUtils.clamp(p.hubStyleBlend ?? 0, 0, 1);
  const base = p.hubStyle ?? 'organic';
  if (base === 'sharp' || blend < 0.08) return base === 'metaball' ? 'metaball' : base;
  if (blend > 0.92 && base === 'organic') return 'metaball';
  if (blend > 0.5 && base === 'organic') return 'metaball';
  return base;
}

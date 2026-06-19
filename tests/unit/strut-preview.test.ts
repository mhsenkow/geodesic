import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type HubParams } from '../../src/types';
import { strutPreviewStock } from '../../src/scene/main-scene';

const hubParams: HubParams = {
  matType: 'rect',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  tolX: 0.3,
  tolY: 0.3,
  wall: 5,
  bodyScale: 1.6,
  chamfer: 2,
  detail: 32,
  printFoot: true,
  footMargin: 6,
};

describe('strut preview stock', () => {
  it('renders timber as rectangular beams with width/depth proportions', () => {
    const stock = strutPreviewStock({ ...DEFAULT_SETTINGS, matType: 'rect', diam: 4 }, hubParams);
    expect(stock.kind).toBe('rect');
    if (stock.kind !== 'rect') return;
    expect(stock.depth).toBeGreaterThan(stock.width);
    expect(stock.width / stock.depth).toBeCloseTo(19 / 38, 3);
  });

  it('renders round stock as a circular radius', () => {
    const stock = strutPreviewStock(
      { ...DEFAULT_SETTINGS, matType: 'round', diam: 4 },
      { ...hubParams, matType: 'round' }
    );
    expect(stock.kind).toBe('round');
    if (stock.kind !== 'round') return;
    expect(stock.radius).toBeGreaterThan(0);
  });
});

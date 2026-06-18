import { describe, it, expect } from 'vitest';
import { junctionFlarePower } from '../../src/geometry/junction-profile';
import type { HubParams } from '../../src/types';

describe('junction profile (MultiPipe params)', () => {
  it('connection length 0 gives smoothest flare', () => {
    const smooth = junctionFlarePower({ subdConnectionLength: 0 } as HubParams);
    const sharp = junctionFlarePower({ subdConnectionLength: 1.5 } as HubParams);
    expect(smooth).toBeLessThan(sharp);
  });
});

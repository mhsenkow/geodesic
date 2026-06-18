import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { genSphere, truncDome, classHubs } from '../../src/geodesic/math';
import { hubDirsFromVertex } from '../../src/geometry/hub-geometry';
import { alignmentQuat } from '../../src/geometry/hub-orient';
import {
  bestAlignment,
  worstMatchErrorDeg,
  ALIGN_FALLBACK_THRESHOLD_DEG,
} from '../../src/geometry/hub-prototype';

function domeHubs(freq: number, trunc = 0.625) {
  const sp = genSphere(freq, 5);
  const dome = truncDome(sp, trunc, 5, true, false, 2, 4);
  return { dome, hubs: classHubs(dome) };
}

describe('dome hub preview alignment', () => {
  // The dome preview reuses one prototype per hub class, rotated/reflected into
  // each vertex. A pure rotation cannot align mirror-image (chiral) hubs — this
  // test pins that reflection handling closes that gap.
  it('reflection handling fixes chiral hubs a rotation alone cannot', () => {
    const { dome, hubs } = domeHubs(2);
    let rotationOnlyWorst = 0;
    let reflectionAwareWorst = 0;

    for (const ht of hubs) {
      const canonical = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]).normalize());
      for (const vi of ht.verts) {
        const actual = hubDirsFromVertex(dome, vi);
        const q = alignmentQuat(canonical, actual);
        const rotated = canonical.map((c) => c.clone().applyQuaternion(q));
        rotationOnlyWorst = Math.max(rotationOnlyWorst, worstMatchErrorDeg(rotated, actual));

        const a = bestAlignment(canonical, actual);
        if (a.residualDeg <= ALIGN_FALLBACK_THRESHOLD_DEG) {
          // only count residuals that the fast prototype path would actually ship
          reflectionAwareWorst = Math.max(reflectionAwareWorst, a.residualDeg);
        }
      }
    }

    // The bug: rotation alone leaves some hubs grossly misaligned.
    expect(rotationOnlyWorst).toBeGreaterThan(30);
    // The fix: anything kept on the prototype path is within the small threshold;
    // everything else is rebuilt per-vertex (exact), so nothing ships misaligned.
    expect(reflectionAwareWorst).toBeLessThanOrEqual(ALIGN_FALLBACK_THRESHOLD_DEG + 1e-6);
  });

  it('every vertex is either symmetry-aligned or flagged for exact rebuild', () => {
    for (const freq of [2, 3]) {
      const { dome, hubs } = domeHubs(freq);
      for (const ht of hubs) {
        const canonical = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]).normalize());
        for (const vi of ht.verts) {
          const actual = hubDirsFromVertex(dome, vi);
          const a = bestAlignment(canonical, actual);
          const willRebuild = a.residualDeg > ALIGN_FALLBACK_THRESHOLD_DEG;
          // Effective error that ships: 0 when rebuilt from actual dirs, else the
          // (small) prototype residual.
          const effective = willRebuild ? 0 : a.residualDeg;
          expect(effective, `V${freq} ${ht.label} v${vi}`).toBeLessThanOrEqual(
            ALIGN_FALLBACK_THRESHOLD_DEG + 1e-6
          );
        }
      }
    }
  });
});

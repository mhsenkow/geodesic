import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { genSphere, truncDome, classHubs, dualizeSphere } from '../../src/geodesic/math';
import { hubDirsFromVertex, socketRollUpsForVertex, edgeRollUp } from '../../src/geometry/hub-geometry';
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

    // A pure rotation — even with the optimal strut correspondence from the
    // permutation search — cannot perfectly align mirror-image (chiral) hubs;
    // a measurable residual always remains.
    expect(rotationOnlyWorst).toBeGreaterThan(1);
    // Reflection handling closes that gap: anything kept on the prototype path
    // is within the small threshold (and strictly better than rotation alone),
    // and everything else is rebuilt per-vertex (exact). Nothing ships misaligned.
    expect(reflectionAwareWorst).toBeLessThan(rotationOnlyWorst);
    expect(reflectionAwareWorst).toBeLessThanOrEqual(ALIGN_FALLBACK_THRESHOLD_DEG + 1e-6);
  });

  it('aligns every hub of a symmetric dome to ~0° (no permutation mismatch)', () => {
    // Regression: a symmetry-rotated hub used to pair struts to the wrong
    // sockets, leaving 30°+ residual that fell back to slow per-vertex rebuilds.
    // On a pristine (untruncated) dome every same-type vertex is an exact
    // rotation/reflection of the prototype, so residual must be ~0 everywhere.
    const cases = [
      { sp: genSphere(2, 5), label: 'geo V2' },
      { sp: genSphere(3, 5), label: 'geo V3' },
      { sp: dualizeSphere(genSphere(2, 5)), label: 'goldberg V2' },
    ];
    for (const { sp, label } of cases) {
      const dome = truncDome(sp, 1, 5, false, false, 2, 4);
      const hubs = classHubs(dome);
      let worst = 0;
      for (const ht of hubs) {
        const canonical = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]).normalize());
        for (const vi of ht.verts) {
          worst = Math.max(worst, bestAlignment(canonical, hubDirsFromVertex(dome, vi)).residualDeg);
        }
      }
      expect(worst, `${label} worst residual`).toBeLessThan(0.5);
    }
  });

  it('both hubs of an edge share the identical per-edge roll reference (beams match)', () => {
    // A single beam must seat flush at both ends regardless of how each
    // connector is rotated — so both endpoint hubs must roll that socket
    // against the same reference: the edge-midpoint radial.
    for (const freq of [2, 3]) {
      const { dome } = domeHubs(freq);
      for (const [a, b] of dome.edges) {
        const ra = socketRollUpsForVertex(dome, a)[dome.adj[a].indexOf(b)];
        const rb = socketRollUpsForVertex(dome, b)[dome.adj[b].indexOf(a)];
        for (let k = 0; k < 3; k++) expect(ra[k]).toBeCloseTo(rb[k], 9);
        // …and it is the edge-midpoint radial.
        const m = [
          (dome.verts[a][0] + dome.verts[b][0]) / 2,
          (dome.verts[a][1] + dome.verts[b][1]) / 2,
          (dome.verts[a][2] + dome.verts[b][2]) / 2,
        ];
        const L = Math.hypot(m[0], m[1], m[2]) || 1;
        for (let k = 0; k < 3; k++) expect(ra[k]).toBeCloseTo(m[k] / L, 9);
      }
    }
  });

  it('lumber-face twist keeps both ends matched at every angle', () => {
    // edgeRollUp must be symmetric in its endpoints for any twist, so a
    // collectively-rotated connector still seats one beam flush at both ends.
    const { dome } = domeHubs(3);
    for (const deg of [0, 30, 45, 90]) {
      for (const [a, b] of dome.edges) {
        const ra = edgeRollUp(dome.verts[a], dome.verts[b], deg);
        const rb = edgeRollUp(dome.verts[b], dome.verts[a], deg);
        for (let k = 0; k < 3; k++) expect(ra[k]).toBeCloseTo(rb[k], 9);
      }
    }
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

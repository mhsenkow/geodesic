import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Orthonormal frame: X/Y = lumber face, Z = strut axis outward from hub. */
export function frameForStrutAxisZ(strutDir: THREE.Vector3, refUp = WORLD_UP): THREE.Matrix4 {
  const z = strutDir.clone().normalize();
  let u = refUp.clone().sub(z.clone().multiplyScalar(refUp.dot(z)));
  if (u.lengthSq() < 1e-6) {
    u = new THREE.Vector3(1, 0, 0).sub(z.clone().multiplyScalar(z.x));
  }
  u.normalize();
  const x = new THREE.Vector3().crossVectors(u, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/** Lathe / round socket: Y = strut axis. */
export function quatForStrutAxisY(strutDir: THREE.Vector3, refUp = WORLD_UP): THREE.Quaternion {
  const y = strutDir.clone().normalize();
  let z = refUp.clone().sub(y.clone().multiplyScalar(refUp.dot(y)));
  if (z.lengthSq() < 1e-6) {
    z = new THREE.Vector3(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
  }
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function permuteArr(arr: number[]): number[][] {
  if (arr.length <= 1) return [arr];
  const result: number[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const head = arr[i];
    const tail = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permuteArr(tail)) {
      result.push([head, ...p]);
    }
  }
  return result;
}

const permCache = new Map<number, number[][]>();
function permutations(n: number): number[][] {
  let p = permCache.get(n);
  if (!p) {
    p = permuteArr(Array.from({ length: n }, (_, i) => i));
    permCache.set(n, p);
  }
  return p;
}

/** Best one-to-one pairing of strut directions (adj order differs per vertex). */
export function matchDirPermutation(
  canonical: THREE.Vector3[],
  actual: THREE.Vector3[]
): number[] {
  const n = canonical.length;
  if (n !== actual.length || n === 0) return Array.from({ length: n }, (_, i) => i);
  if (n === 1) return [0];

  let bestPerm = Array.from({ length: n }, (_, i) => i);
  let bestErr = Infinity;

  for (const perm of permutations(n)) {
    let err = 0;
    for (let i = 0; i < n; i++) {
      err += 1 - THREE.MathUtils.clamp(canonical[i].dot(actual[perm[i]]), -1, 1);
    }
    if (err < bestErr) {
      bestErr = err;
      bestPerm = perm;
    }
  }
  return bestPerm;
}

function pickIndependentTriple(dirs: THREE.Vector3[]): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const a = dirs[0].clone().normalize();
  let b = dirs[1]?.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
  if (Math.abs(a.dot(b)) > 0.95 && dirs[2]) {
    b = dirs[2].clone().normalize();
  }
  let c = new THREE.Vector3().crossVectors(a, b);
  if (c.lengthSq() < 1e-6) {
    b = new THREE.Vector3(1, 0, 0);
    if (Math.abs(a.dot(b)) > 0.9) b.set(0, 0, 1);
    b.sub(a.clone().multiplyScalar(a.dot(b))).normalize();
    c = new THREE.Vector3().crossVectors(a, b);
  }
  c.normalize();
  b.crossVectors(c, a).normalize();
  return [a, b, c];
}

/** Sum of (1 − cos θ) alignment error of rotation q over matched pairs. */
function rotationError(src: THREE.Vector3[], dst: THREE.Vector3[], q: THREE.Quaternion): number {
  const a = new THREE.Vector3();
  let err = 0;
  for (let i = 0; i < src.length; i++) {
    a.copy(src[i]).applyQuaternion(q);
    err += 1 - a.dot(dst[i]);
  }
  return err;
}

/**
 * Iteratively refine a rotation to the least-squares optimum over ALL matched
 * pairs (Horn-style fixed point: rotate by the residual torque axis Σ aᵢ×bᵢ
 * through atan2(|Σ aᵢ×bᵢ|, Σ aᵢ·bᵢ) until it stops moving). Unlike a 2-vector
 * frame fit, this makes every socket — not just two — land on its strut.
 */
function refineRotation(
  src: THREE.Vector3[],
  dst: THREE.Vector3[],
  seed: THREE.Quaternion
): THREE.Quaternion {
  const q = seed.clone().normalize();
  const a = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  for (let iter = 0; iter < 60; iter++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let d = 0;
    for (let i = 0; i < src.length; i++) {
      a.copy(src[i]).applyQuaternion(q);
      const b = dst[i];
      cx += a.y * b.z - a.z * b.y;
      cy += a.z * b.x - a.x * b.z;
      cz += a.x * b.y - a.y * b.x;
      d += a.x * b.x + a.y * b.y + a.z * b.z;
    }
    const clen = Math.hypot(cx, cy, cz);
    if (clen < 1e-9) break;
    const angle = Math.atan2(clen, d);
    if (angle < 1e-7) break;
    axis.set(cx / clen, cy / clen, cz / clen);
    dq.setFromAxisAngle(axis, angle);
    q.premultiply(dq).normalize();
  }
  return q;
}

/** Cheap 2-vector frame rotation mapping src → dst for a *fixed* pairing. */
function frameFitQuat(src: THREE.Vector3[], dst: THREE.Vector3[]): THREE.Quaternion {
  const [sa, sb, sc] = pickIndependentTriple(src);
  const [ta, tb, tc] = pickIndependentTriple(dst);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4()
      .makeBasis(ta, tb, tc)
      .multiply(new THREE.Matrix4().makeBasis(sa, sb, sc).invert())
  );
}

/** Cap on exhaustive permutation search; above this we trust the no-rotation
 *  greedy pairing (those rare high-valence hubs rebuild from their own struts). */
const MAX_EXHAUSTIVE_VALENCE = 6;

/**
 * Horn / Kabsch rotation mapping canonical strut dirs → actual dirs.
 *
 * The correct strut-to-strut correspondence depends on the (unknown) rotation,
 * so a no-rotation pairing fails for symmetry-rotated hubs (a 60°-rotated
 * 6-way hub pairs to the wrong neighbours). We instead score *every* pairing
 * by a cheap frame fit, keep the best, then polish it to the least-squares
 * optimum — so a symmetric hub aligns to ~0° instead of landing 30°+ off.
 */
export function alignmentQuat(
  canonical: THREE.Vector3[],
  actual: THREE.Vector3[]
): THREE.Quaternion {
  const n = canonical.length;
  if (n === 0) return new THREE.Quaternion();
  const src = canonical.map((v) => v.clone().normalize());
  const act = actual.map((v) => v.clone().normalize());
  if (n === 1) return new THREE.Quaternion().setFromUnitVectors(src[0], act[0]);

  const perms =
    n <= MAX_EXHAUSTIVE_VALENCE ? permutations(n) : [matchDirPermutation(canonical, actual)];

  let bestQ = new THREE.Quaternion();
  let bestErr = Infinity;
  let bestDst = act;
  for (const perm of perms) {
    const dst = perm.map((i) => act[i]);
    const q = frameFitQuat(src, dst);
    const e = rotationError(src, dst, q);
    if (e < bestErr) {
      bestErr = e;
      bestQ = q;
      bestDst = dst;
    }
  }
  return refineRotation(src, bestDst, bestQ);
}

export function sortDirsCanonical(dirs: THREE.Vector3[]): THREE.Vector3[] {
  return [...dirs].sort((a, b) => {
    const ea = Math.atan2(a.y, Math.hypot(a.x, a.z));
    const eb = Math.atan2(b.y, Math.hypot(b.x, b.z));
    if (Math.abs(ea - eb) > 1e-5) return ea - eb;
    const aa = Math.atan2(a.x, a.z);
    const ab = Math.atan2(b.x, b.z);
    return aa - ab;
  });
}

export { WORLD_UP };

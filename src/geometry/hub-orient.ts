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

function permutations(n: number): number[][] {
  return permuteArr(Array.from({ length: n }, (_, i) => i));
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

/** Horn / Kabsch rotation mapping canonical strut dirs → actual dirs. */
export function alignmentQuat(
  canonical: THREE.Vector3[],
  actual: THREE.Vector3[]
): THREE.Quaternion {
  if (canonical.length === 0) return new THREE.Quaternion();
  if (canonical.length === 1) {
    return new THREE.Quaternion().setFromUnitVectors(
      canonical[0].clone().normalize(),
      actual[0].clone().normalize()
    );
  }

  const perm = matchDirPermutation(canonical, actual);
  const src = canonical.map((v) => v.clone().normalize());
  const dst = perm.map((i) => actual[i].clone().normalize());

  const [sa, sb, sc] = pickIndependentTriple(src);
  const [ta, tb, tc] = pickIndependentTriple(dst);

  const srcMat = new THREE.Matrix4().makeBasis(sa, sb, sc);
  const dstMat = new THREE.Matrix4().makeBasis(ta, tb, tc);
  const rotMat = dstMat.multiply(srcMat.clone().invert());

  const q = new THREE.Quaternion().setFromRotationMatrix(rotMat);

  let err = 0;
  for (let i = 0; i < src.length; i++) {
    err += 1 - src[i].clone().applyQuaternion(q).dot(dst[i]);
  }

  if (err > 0.02) {
    const q0 = new THREE.Quaternion().setFromUnitVectors(src[0], dst[0]);
    let err0 = 0;
    for (let i = 0; i < src.length; i++) {
      err0 += 1 - src[i].clone().applyQuaternion(q0).dot(dst[i]);
    }
    if (err0 < err) return q0;
  }

  return q;
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

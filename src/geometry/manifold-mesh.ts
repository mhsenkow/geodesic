import * as THREE from 'three';
import type { Manifold, Mesh } from 'manifold-3d';

function toManifoldMesh(
  vertProperties: Float32Array,
  triVerts: Uint32Array
): Mesh {
  return { numProp: 3, vertProperties, triVerts } as Mesh;
}

/** Convert BufferGeometry to Manifold Mesh (must be manifold / watertight). */
export function bufferGeometryToManifoldMesh(geo: THREE.BufferGeometry): Mesh {
  if (!geo.index) {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const triVerts = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) triVerts[i] = i;
    return toManifoldMesh(new Float32Array(pos.array), triVerts);
  }

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  return toManifoldMesh(new Float32Array(pos.array), new Uint32Array(geo.index.array));
}

export function bufferGeometryToManifold(geo: THREE.BufferGeometry, ManifoldCtor: typeof Manifold): Manifold {
  return ManifoldCtor.ofMesh(bufferGeometryToManifoldMesh(geo));
}

export function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g;
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.groups?.length) geo.clearGroups();
  return geo;
}

export function manifoldToBufferGeometry(m: Manifold): THREE.BufferGeometry {
  const mesh = m.getMesh();
  mesh.merge();
  const { numProp, vertProperties, triVerts } = mesh;

  const positions = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3] = vertProperties[i * numProp];
    positions[i * 3 + 1] = vertProperties[i * numProp + 1];
    positions[i * 3 + 2] = vertProperties[i * numProp + 2];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(Array.from(triVerts));
  geo.computeVertexNormals();
  return geo;
}

export function transformManifold(m: Manifold, matrix: THREE.Matrix4): Manifold {
  return m.transform([...matrix.elements] as Parameters<Manifold['transform']>[0]);
}

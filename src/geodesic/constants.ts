export const PHI = (1 + Math.sqrt(5)) / 2;

export const ICOSAHEDRON_VERTS: number[][] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
].map((v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
});

export const ICOSAHEDRON_FACES: number[][] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

function normalize(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// Octahedron — 6 vertices (±axis), 8 triangular faces. Yields 4-valent poles.
export const OCTAHEDRON_VERTS: number[][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
].map(normalize);

export const OCTAHEDRON_FACES: number[][] = [
  [0, 2, 4],
  [2, 1, 4],
  [1, 3, 4],
  [3, 0, 4],
  [2, 0, 5],
  [1, 2, 5],
  [3, 1, 5],
  [0, 3, 5],
];

// Tetrahedron — 4 vertices, 4 triangular faces. Coarsest geodesic seed.
export const TETRAHEDRON_VERTS: number[][] = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
].map(normalize);

export const TETRAHEDRON_FACES: number[][] = [
  [0, 1, 2],
  [0, 3, 1],
  [0, 2, 3],
  [1, 3, 2],
];

export interface BaseSeed {
  verts: number[][];
  faces: number[][];
}

export const BASE_SEEDS: Record<string, BaseSeed> = {
  icosahedron: { verts: ICOSAHEDRON_VERTS, faces: ICOSAHEDRON_FACES },
  octahedron: { verts: OCTAHEDRON_VERTS, faces: OCTAHEDRON_FACES },
  tetrahedron: { verts: TETRAHEDRON_VERTS, faces: TETRAHEDRON_FACES },
};

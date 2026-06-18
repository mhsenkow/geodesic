import { beforeAll } from 'vitest';
import { initManifold } from '../../src/geometry/manifold-init';

beforeAll(async () => {
  await initManifold();
}, 60_000);

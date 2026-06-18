import type { CrossSection as CrossSectionType, Manifold as ManifoldType } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

let ManifoldClass: typeof ManifoldType | null = null;
let CrossSectionClass: typeof CrossSectionType | null = null;
let initPromise: Promise<void> | null = null;

export function isManifoldReady(): boolean {
  return ManifoldClass !== null;
}

export function getManifold(): typeof ManifoldType {
  if (!ManifoldClass) {
    throw new Error('Manifold WASM not initialized — call initManifold() first');
  }
  return ManifoldClass;
}

export function getCrossSection(): typeof CrossSectionType {
  if (!CrossSectionClass) {
    throw new Error('Manifold WASM not initialized — call initManifold() first');
  }
  return CrossSectionClass;
}

async function loadModule() {
  const wasm = await import('manifold-3d');
  // Vite dev prebundles manifold-3d away from manifold.wasm — point at the bundled asset URL.
  if (typeof window !== 'undefined') {
    return wasm.default({
      locateFile: () => wasmUrl,
    });
  }
  // Node/Vitest: default locateFile resolves next to manifold.js in node_modules.
  return wasm.default();
}

/** Load manifold-3d WASM once (browser or Vitest). */
export function initManifold(): Promise<void> {
  if (ManifoldClass) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      const module = await loadModule();
      module.setup();
      ManifoldClass = module.Manifold;
      CrossSectionClass = module.CrossSection;
    })();
  }
  return initPromise;
}

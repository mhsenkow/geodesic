import { initApp } from './ui/app';
import { initManifold, isManifoldReady } from './geometry/manifold-init';
import './styles/main.css';

async function boot(): Promise<void> {
  try {
    await initManifold();
  } catch (err) {
    console.error('Manifold failed to load — timber hubs will not render correctly.', err);
  }
  initApp();
  if (!isManifoldReady()) {
    window.dispatchEvent(new CustomEvent('geodesic:manifold-failed'));
  }
}

boot();

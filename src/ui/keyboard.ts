import type { GeodesicApp } from './app';

export function bindKeyboard(app: GeodesicApp): void {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }

    switch (e.key) {
      case 'Escape':
        if (app.settings.inspectorOpen) {
          app.closeInspector();
          e.preventDefault();
        }
        break;
      case 'ArrowLeft':
        if (app.settings.inspectorOpen && app.hubTypes.length) {
          const next = ((app.settings.selHub ?? 0) - 1 + app.hubTypes.length) % app.hubTypes.length;
          app.openInspector(next);
          e.preventDefault();
        }
        break;
      case 'ArrowRight':
        if (app.settings.inspectorOpen && app.hubTypes.length) {
          const next = ((app.settings.selHub ?? 0) + 1) % app.hubTypes.length;
          app.openInspector(next);
          e.preventDefault();
        }
        break;
      case 'i':
      case 'I':
        if (app.hubTypes.length) {
          app.openInspector(app.settings.selHub ?? 0);
          e.preventDefault();
        }
        break;
      case 'e':
      case 'E':
        if (app.settings.inspectorOpen && app.settings.selHub != null) {
          void app.exportSelectedHub();
          e.preventDefault();
        }
        break;
    }
  });
}

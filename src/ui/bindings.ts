import type { GeodesicApp } from './app';
import type { UnitSystem } from '../types';
import { PRESETS } from '../presets';
import { clearSettings } from '../storage/settings';
import {
  readDistanceInput,
  readSmallInput,
  formatSliderValues,
  clampDoorWidth,
} from './units-ui';
import { refreshChipStates } from './material-panel';

export function bindUi(app: GeodesicApp): void {
  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.parentElement?.classList.toggle('collapsed');
    });
  });

  const presetSelect = document.getElementById('preset-select') as HTMLSelectElement;
  if (presetSelect) {
    PRESETS.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    });
    presetSelect.addEventListener('change', (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (id) app.applyPreset(id);
    });
  }

  const stockSelect = document.getElementById('material-stock') as HTMLSelectElement;
  stockSelect?.addEventListener('change', (e) => {
    app.applyMaterialStock((e.target as HTMLSelectElement).value);
  });

  document.querySelectorAll('input[name="unitSystem"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      app.setUnitSystem((e.target as HTMLInputElement).value as UnitSystem);
    })
  );

  document.getElementById('screw-holes')?.addEventListener('change', (e) => {
    app.settings.screwHoles = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('screw-dia')?.addEventListener('change', (e) => {
    app.settings.screwDia = +(e.target as HTMLSelectElement).value;
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('diameter')?.addEventListener('change', () => {
    const u = app.settings.unitSystem;
    app.settings.diam = readDistanceInput('diameter', u);
    app.settings.doorW = clampDoorWidth(app.settings.doorW, app.settings.diam);
    app.syncFormFromSettings();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('truncation')?.addEventListener('change', (e) => {
    app.settings.trunc = +(e.target as HTMLInputElement).value;
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('rodDiameter')?.addEventListener('change', () => {
    app.settings.rodD = readSmallInput('rodDiameter', app.settings.unitSystem);
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('lumberW')?.addEventListener('change', () => {
    app.settings.lumW = readSmallInput('lumberW', app.settings.unitSystem);
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('lumberH')?.addEventListener('change', () => {
    app.settings.lumH = readSmallInput('lumberH', app.settings.unitSystem);
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('wallThickness')?.addEventListener('change', () => {
    app.settings.wall = readSmallInput('wallThickness', app.settings.unitSystem);
    app.syncFormFromSettings();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('door-width')?.addEventListener('change', () => {
    const u = app.settings.unitSystem;
    app.settings.doorW = clampDoorWidth(readDistanceInput('door-width', u), app.settings.diam);
    app.syncFormFromSettings();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('frequency')?.addEventListener('input', (e) => {
    app.settings.freq = +(e.target as HTMLInputElement).value;
    document.getElementById('freq-val')!.textContent = `V${app.settings.freq}`;
  });
  document.getElementById('frequency')?.addEventListener('change', () => {
    void app.buildDome(false);
  });

  document.getElementById('tolerance')?.addEventListener('input', (e) => {
    app.settings.tol = +(e.target as HTMLInputElement).value;
    formatSliderValues(app.settings);
  });
  document.getElementById('tolerance')?.addEventListener('change', () => {
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('printFoot')?.addEventListener('change', (e) => {
    app.settings.printFoot = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    app.persist();
  });

  document.getElementById('foot-margin')?.addEventListener('input', (e) => {
    app.settings.footMargin = +(e.target as HTMLInputElement).value;
    formatSliderValues(app.settings);
    app.updateInspector();
    app.persist();
  });

  document.getElementById('door-enabled')?.addEventListener('change', (e) => {
    app.settings.door = (e.target as HTMLInputElement).checked;
    app.syncFormFromSettings();
    void app.buildDome(false);
  });

  document.querySelectorAll('input[name="matType"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      app.settings.matType = (e.target as HTMLInputElement).value as 'round' | 'rect';
      if (app.settings.matType === 'rect' && app.settings.bodyScale < 1.2) {
        app.settings.bodyScale = 1.5;
        app.settings.hubStyle = 'organic';
      }
      app.ensureMaterialStockMatchesType(false);
      app.syncFormFromSettings();
      const isR = app.settings.matType === 'round';
      document.querySelectorAll('.round-only').forEach((el) => {
        (el as HTMLElement).style.display = isR ? 'flex' : 'none';
      });
      document.querySelectorAll('.rect-only').forEach((el) => {
        (el as HTMLElement).style.display = isR ? 'none' : 'flex';
      });
      void app.buildDome(false);
    })
  );

  ['showWireframe', 'showHubs', 'showMarkers'].forEach((id, i) => {
    const keys = ['showWire', 'showHubs', 'showMarkers'] as const;
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[keys[i]] = (e.target as HTMLInputElement).checked;
      void app.buildDome(false);
    });
  });

  const refinementMap: Record<string, 'bodyScale' | 'chamfer' | 'detail'> = {
    'hub-body': 'bodyScale',
    'hub-chamfer': 'chamfer',
    'hub-detail': 'detail',
  };

  (['hub-body', 'hub-chamfer', 'hub-detail', 'junction-meet'] as const).forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const val = +(e.target as HTMLInputElement).value;
      if (id === 'junction-meet') {
        app.settings.junctionMeet = val;
        const valEl = document.getElementById('junction-meet-val');
        if (valEl) valEl.textContent = val.toFixed(2) + '×';
        app.updateInspector();
      } else {
        app.settings[refinementMap[id]] = val;
        const valEl = document.getElementById(id + '-val');
        if (valEl) {
          valEl.textContent =
            id === 'hub-body' ? val.toFixed(1) + 'x' : id === 'hub-detail' ? String(val) : val.toFixed(1);
        }
        if (id === 'hub-chamfer') formatSliderValues(app.settings);
        app.updateInspector();
      }
      app.persist();
    });
  });

  document.getElementById('mesh-subdivide')?.addEventListener('change', (e) => {
    app.settings.meshSubdivide = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  // Refinement sliders update the inspector live on `input`; on release
  // (`change`) the dome preview rebuilds so it reflects the new hub shape too.
  (
    [
      'hub-body',
      'hub-chamfer',
      'hub-detail',
      'junction-meet',
      'subd-connection-length',
      'subd-strut-size',
      'socket-depth',
      'surface-smooth',
    ] as const
  ).forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => void app.buildDome(false));
  });

  (['subd-connection-length', 'subd-strut-size'] as const).forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const val = +(e.target as HTMLInputElement).value;
      if (id === 'subd-connection-length') {
        app.settings.subdConnectionLength = val;
        const el = document.getElementById('subd-connection-length-val');
        if (el) el.textContent = val.toFixed(2) + '×';
      } else {
        app.settings.subdStrutSize = val;
        const el = document.getElementById('subd-strut-size-val');
        if (el) el.textContent = val.toFixed(2) + '×';
      }
      app.updateInspector();
      app.persist();
    });
  });

  const timberPrintMap: Record<string, keyof GeodesicApp['settings']> = {
    'socket-depth': 'socketDepth',
    'surface-smooth': 'surfaceSmooth',
  };

  Object.entries(timberPrintMap).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const val = +(e.target as HTMLInputElement).value;
      (app.settings[key] as number) = val;
      if (id === 'socket-depth') {
        const el = document.getElementById('socket-depth-val');
        if (el) el.textContent = Math.round(val * 100) + '%';
      }
      if (id === 'surface-smooth') {
        const el = document.getElementById('surface-smooth-val');
        if (el) el.textContent = Math.round(val * 100) + '%';
      }
      app.updateInspector();
      app.persist();
    });
  });

  document.querySelectorAll('input[name="hubStyle"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      app.settings.hubStyle = (e.target as HTMLInputElement).value as 'sharp' | 'organic';
      if (app.settings.hubStyle === 'organic' && app.settings.bodyScale < 1.15) {
        app.settings.bodyScale = 1.4;
      }
      app.syncFormFromSettings();
      void app.buildDome(false);
      app.persist();
    })
  );

  document.getElementById('hub-wireframe')?.addEventListener('change', (e) => {
    app.settings.hubWire = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    app.persist();
  });

  document.getElementById('hub-build-guide')?.addEventListener('change', (e) => {
    app.settings.showBuildGuide = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    app.persist();
  });

  document.getElementById('print-up-override')?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    const grp = document.getElementById('print-up-group');
    if (grp) grp.style.display = enabled ? 'flex' : 'none';
    if (!enabled) {
      app.settings.printUpOverride = null;
    } else {
      app.settings.printUpOverride = [
        +(document.getElementById('print-up-x') as HTMLInputElement).value,
        +(document.getElementById('print-up-y') as HTMLInputElement).value,
        +(document.getElementById('print-up-z') as HTMLInputElement).value,
      ];
    }
    app.updateInspector();
    app.persist();
  });

  ['print-up-x', 'print-up-y', 'print-up-z'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (app.settings.printUpOverride) {
        app.settings.printUpOverride = [
          +(document.getElementById('print-up-x') as HTMLInputElement).value,
          +(document.getElementById('print-up-y') as HTMLInputElement).value,
          +(document.getElementById('print-up-z') as HTMLInputElement).value,
        ];
        app.updateInspector();
        app.persist();
      }
    });
  });

  // ── Material & cost calculator inputs ──────────────────────────
  document.getElementById('stock-length')?.addEventListener('change', () => {
    app.settings.stockLength = readDistanceInput('stock-length', app.settings.unitSystem);
    app.updateMaterialPanels();
    app.persist();
  });
  const costInputs: Array<[string, 'stockWastePct' | 'stockPrice' | 'filamentDensity' | 'filamentPrice']> = [
    ['stock-waste', 'stockWastePct'],
    ['stock-price', 'stockPrice'],
    ['filament-density', 'filamentDensity'],
    ['filament-price', 'filamentPrice'],
  ];
  costInputs.forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[key] = Math.max(0, +(e.target as HTMLInputElement).value);
      app.updateMaterialPanels();
      app.persist();
    });
  });

  // ── Quick-pick chips: set the target slider to an optimal value ─
  document.querySelectorAll<HTMLElement>('.chip-row').forEach((row) => {
    const targetId = row.getAttribute('data-target');
    if (!targetId) return;
    const slider = document.getElementById(targetId) as HTMLInputElement | null;
    if (!slider) return;
    row.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        slider.value = chip.getAttribute('data-value') ?? slider.value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        refreshChipStates();
      });
    });
    slider.addEventListener('input', () => refreshChipStates());
  });

  document.getElementById('btn-export-hub')?.addEventListener('click', () => void app.exportSelectedHub());
  document.getElementById('btn-export-all')?.addEventListener('click', () => void app.exportAllHubs());
  document.getElementById('btn-export-struts')?.addEventListener('click', () => app.exportStrutTable());
  document.getElementById('btn-export-map')?.addEventListener('click', () => app.exportHubMap());
  document.getElementById('btn-open-inspector')?.addEventListener('click', () =>
    app.openInspector(app.settings.selHub ?? 0)
  );
  document.getElementById('insp-close')?.addEventListener('click', () => app.closeInspector());
  document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
    clearSettings();
    location.reload();
  });
}

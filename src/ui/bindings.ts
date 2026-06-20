import type { GeodesicApp } from './app';
import type { HubStyle, UnitSystem } from '../types';
import { PRESETS } from '../presets';
import { debounce } from '../utils/debounce';
import { clearSettings, loadCustomPresets } from '../storage/settings';
import {
  readDistanceInput,
  readSmallInput,
  formatSliderValues,
  clampDoorWidth,
} from './units-ui';
import { refreshChipStates } from './material-panel';

export function bindUi(app: GeodesicApp): void {
  const debouncedBuild = debounce(() => void app.buildDome(false), 280);

  document.querySelectorAll('.section-header').forEach((header) => {
    const btn = header as HTMLElement;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    const toggle = () => header.parentElement?.classList.toggle('collapsed');
    btn.addEventListener('click', toggle);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  const presetSelect = document.getElementById('preset-select') as HTMLSelectElement;
  if (presetSelect) {
    PRESETS.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.title = p.description;
      presetSelect.appendChild(opt);
    });
    loadCustomPresets().forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `★ ${p.name}`;
      opt.title = p.description;
      presetSelect.appendChild(opt);
    });
    presetSelect.addEventListener('change', (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (id.startsWith('custom-')) {
        const cp = loadCustomPresets().find((p) => p.id === id);
        if (cp) {
          app.settings = { ...app.settings, ...cp.settings, presetId: id };
          app.syncFormFromSettings();
          void app.buildDome(false);
        }
      } else if (id) app.applyPreset(id);
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

  document.getElementById('screw-bosses')?.addEventListener('change', (e) => {
    app.settings.screwBosses = (e.target as HTMLInputElement).checked;
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

  document.getElementById('base-solid')?.addEventListener('change', (e) => {
    app.settings.baseSolid = (e.target as HTMLSelectElement).value as typeof app.settings.baseSolid;
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('geo-topology')?.addEventListener('change', (e) => {
    app.settings.geoTopology = (e.target as HTMLSelectElement).value as typeof app.settings.geoTopology;
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('strut-taper')?.addEventListener('input', (e) => {
    app.settings.strutTaper = +(e.target as HTMLInputElement).value;
    const el = document.getElementById('strut-taper-val');
    if (el) el.textContent = Math.round(app.settings.strutTaper * 100) + '%';
    app.updateInspector();
    app.persist();
  });

  document.getElementById('bore-through')?.addEventListener('change', (e) => {
    app.settings.boreThrough = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('base-vent')?.addEventListener('change', (e) => {
    app.settings.baseVent = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    app.persist();
  });

  document.getElementById('friction-ribs')?.addEventListener('change', (e) => {
    app.settings.frictionRibs = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  ([
    ['rib-depth', 'ribDepth'],
    ['rib-count', 'ribCount'],
    ['socket-depth-mm', 'socketDepthMm'],
  ] as const).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[key] = Math.max(0, +(e.target as HTMLInputElement).value);
      app.updateInspector();
      void app.buildDome(false);
      app.persist();
    });
  });

  ([
    ['emboss-labels', 'embossLabels'],
    ['alignment-notches', 'alignmentNotches'],
  ] as const).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[key] = (e.target as HTMLInputElement).checked;
      app.updateInspector();
      app.persist();
    });
  });

  document.getElementById('overhang-heatmap')?.addEventListener('change', (e) => {
    app.settings.showOverhangHeatmap = (e.target as HTMLInputElement).checked;
    app.updateInspector();
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
    debouncedBuild();
  });
  document.getElementById('frequency')?.addEventListener('change', () => {
    void app.buildDome(false);
  });

  document.getElementById('tolerance')?.addEventListener('input', (e) => {
    app.settings.tol = +(e.target as HTMLInputElement).value;
    app.settings.tolX = app.settings.tol;
    app.settings.tolY = app.settings.tol;
    app.syncFormFromSettings();
    formatSliderValues(app.settings);
  });
  document.getElementById('tolerance')?.addEventListener('change', () => {
    app.updateInspector();
    void app.buildDome(false);
    app.persist();
  });

  ([
    ['tol-x', 'tolX'],
    ['tol-y', 'tolY'],
    ['nozzle-dia', 'nozzleDia'],
    ['build-plate-w', 'buildPlateW'],
    ['build-plate-d', 'buildPlateD'],
  ] as const).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[key] = Math.max(0, +(e.target as HTMLInputElement).value);
      if (id === 'tol-x' || id === 'tol-y') {
        app.settings.tol = (app.settings.tolX + app.settings.tolY) / 2;
        app.syncFormFromSettings();
        void app.buildDome(false);
      } else {
        app.updateInspector();
      }
      app.persist();
    });
  });

  document.getElementById('printFoot')?.addEventListener('change', (e) => {
    app.settings.printFoot = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    app.updateMaterialPanels();
    app.persist();
  });

  document.getElementById('foot-margin')?.addEventListener('input', (e) => {
    app.settings.footMargin = +(e.target as HTMLInputElement).value;
    formatSliderValues(app.settings);
    app.updateInspector();
    app.persist();
  });

  document.getElementById('base-thickness')?.addEventListener('input', (e) => {
    app.settings.baseThickness = +(e.target as HTMLInputElement).value;
    formatSliderValues(app.settings);
    app.updateInspector();
    app.persist();
  });

  document.getElementById('base-scale')?.addEventListener('input', (e) => {
    app.settings.baseScale = +(e.target as HTMLInputElement).value;
    const el = document.getElementById('base-scale-val');
    if (el) el.textContent = app.settings.baseScale.toFixed(2) + '×';
    app.updateInspector();
    app.persist();
  });

  ['foot-margin', 'base-thickness', 'base-scale'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => app.updateMaterialPanels());
  });

  document.getElementById('door-enabled')?.addEventListener('change', (e) => {
    app.settings.door = (e.target as HTMLInputElement).checked;
    app.syncFormFromSettings();
    void app.buildDome(false);
  });

  document.getElementById('flat-base')?.addEventListener('change', (e) => {
    app.settings.flatBot = (e.target as HTMLInputElement).checked;
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('preview-quality')?.addEventListener('change', (e) => {
    app.settings.previewQuality = (e.target as HTMLSelectElement).value as typeof app.settings.previewQuality;
    void app.buildDome(false);
    app.persist();
  });

  document.getElementById('nozzle-preset')?.addEventListener('change', (e) => {
    const preset = (e.target as HTMLSelectElement).value as typeof app.settings.nozzlePreset;
    app.settings.nozzlePreset = preset;
    app.settings.nozzleDia = { '0.2': 0.2, '0.4': 0.4, '0.6': 0.6, '0.8': 0.8 }[preset] ?? 0.4;
    app.updateInspector();
    app.persist();
  });

  ([
    ['tree-support-base', 'treeSupportBase'],
    ['emboss-preview', 'embossPreview'],
    ['auto-open-inspector', 'autoOpenInspector'],
  ] as const).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[key] = (e.target as HTMLInputElement).checked;
      app.updateInspector();
      app.persist();
    });
  });

  (['junction-drip', 'surface-noise'] as const).forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const val = +(e.target as HTMLInputElement).value;
      if (id === 'junction-drip') app.settings.junctionDrip = val;
      else app.settings.surfaceNoise = val;
      app.updateInspector();
      debouncedBuild();
      app.persist();
    });
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

  ['showWireframe', 'showStrutBodies', 'showHubs', 'showMarkers'].forEach((id, i) => {
    const keys = ['showWire', 'showStrutBodies', 'showHubs', 'showMarkers'] as const;
    document.getElementById(id)?.addEventListener('change', (e) => {
      app.settings[keys[i]] = (e.target as HTMLInputElement).checked;
      void app.buildDome(false);
    });
  });

  document.getElementById('strut-color-mode')?.addEventListener('change', (e) => {
    app.settings.strutColorMode = (e.target as HTMLSelectElement).value as typeof app.settings.strutColorMode;
    void app.buildDome(false);
    app.persist();
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
      'strut-taper',
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
      app.settings.hubStyle = (e.target as HTMLInputElement).value as HubStyle;
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
  const costInputs: Array<
    [string, 'stockWastePct' | 'stockPrice' | 'filamentDensity' | 'filamentPrice' | 'printInfillPct']
  > = [
    ['stock-waste', 'stockWastePct'],
    ['stock-price', 'stockPrice'],
    ['filament-density', 'filamentDensity'],
    ['filament-price', 'filamentPrice'],
    ['print-infill', 'printInfillPct'],
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
  document.getElementById('btn-export-glb')?.addEventListener('click', () => void app.exportSelectedGlb());
  document.getElementById('btn-export-test-set')?.addEventListener('click', () => void app.exportAllHubs('unique'));
  document.getElementById('btn-export-production-set')?.addEventListener('click', () => void app.exportAllHubs('production'));
  document.getElementById('btn-export-plate')?.addEventListener('click', () => void app.exportBuildPlate3mf());
  document.getElementById('btn-export-struts')?.addEventListener('click', () => app.exportStrutTable());
  document.getElementById('btn-export-map')?.addEventListener('click', () => app.exportHubMap());
  document.getElementById('btn-export-design')?.addEventListener('click', () => app.exportDesignJson());
  document.getElementById('btn-import-design')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) app.importDesignFromFile(file);
  });
  document.getElementById('btn-export-bom')?.addEventListener('click', () => app.exportBom());
  document.getElementById('btn-export-vertices')?.addEventListener('click', () => app.exportVertexCoords());
  document.getElementById('btn-save-preset')?.addEventListener('click', () => app.saveCustomPreset());
  document.getElementById('btn-revert-inspector')?.addEventListener('click', () => app.revertInspectorSettings());
  document.getElementById('btn-keyboard-help')?.addEventListener('click', () => {
    document.getElementById('keyboard-help')?.classList.toggle('visible');
  });
  document.getElementById('btn-copy-share')?.addEventListener('click', () => void app.copyShareUrl());
  document.getElementById('btn-open-inspector')?.addEventListener('click', () =>
    app.openInspector(app.settings.selHub ?? 0)
  );
  document.getElementById('insp-close')?.addEventListener('click', () => app.closeInspector());
  document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
    if (!confirm('Reset all settings to defaults? This discards your current design and any unsaved changes.')) return;
    clearSettings();
    location.reload();
  });
}

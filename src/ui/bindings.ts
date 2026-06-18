import type { GeodesicApp } from './app';
import type { AppSettings } from '../types';
import { PRESETS } from '../presets';
import { clearSettings } from '../storage/settings';
import { getMaterialsByCategory, CATEGORY_LABELS } from '../materials/catalog';

type NumericSettingKey = {
  [K in keyof AppSettings]: AppSettings[K] extends number ? K : never;
}[keyof AppSettings];

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
  if (stockSelect) {
    for (const [cat, items] of getMaterialsByCategory()) {
      const group = document.createElement('optgroup');
      group.label = CATEGORY_LABELS[cat];
      for (const m of items) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.actualLabel})`;
        group.appendChild(opt);
      }
      stockSelect.appendChild(group);
    }
    stockSelect.addEventListener('change', (e) => {
      app.applyMaterialStock((e.target as HTMLSelectElement).value);
    });
  }

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

  const binds: [string, NumericSettingKey, boolean][] = [
    ['diameter', 'diam', true],
    ['truncation', 'trunc', true],
    ['rodDiameter', 'rodD', true],
    ['lumberW', 'lumW', true],
    ['lumberH', 'lumH', true],
    ['tolerance', 'tol', true],
    ['wallThickness', 'wall', true],
    ['door-width', 'doorW', true],
  ];

  binds.forEach(([id, key, rebuild]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      (app.settings[key] as number) = +(e.target as HTMLInputElement).value;
      if (rebuild) void app.buildDome(false);
      else app.updateInspector();
      app.persist();
    });
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
    document.getElementById('tol-val')!.textContent = app.settings.tol.toFixed(2) + 'mm';
  });

  document.getElementById('printFoot')?.addEventListener('change', (e) => {
    app.settings.printFoot = (e.target as HTMLInputElement).checked;
    app.updateInspector();
    app.persist();
  });

  document.getElementById('foot-margin')?.addEventListener('input', (e) => {
    app.settings.footMargin = +(e.target as HTMLInputElement).value;
    document.getElementById('foot-margin-val')!.textContent =
      app.settings.footMargin.toFixed(1) + 'mm';
    app.updateInspector();
    app.persist();
  });

  document.getElementById('door-enabled')?.addEventListener('change', (e) => {
    app.settings.door = (e.target as HTMLInputElement).checked;
    void app.buildDome(false);
  });

  document.querySelectorAll('input[name="matType"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      app.settings.matType = (e.target as HTMLInputElement).value as 'round' | 'rect';
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

  (['hub-body', 'hub-chamfer', 'hub-detail', 'hub-wall'] as const).forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const val = +(e.target as HTMLInputElement).value;
      if (id === 'hub-wall') {
        app.settings.wall = val;
        document.getElementById('hub-wall-val')!.textContent = val.toFixed(1);
        void app.buildDome(false);
      } else {
        app.settings[refinementMap[id]] = val;
        const valEl = document.getElementById(id + '-val');
        if (valEl) {
          valEl.textContent =
            id === 'hub-body' ? val.toFixed(1) + 'x' : id === 'hub-detail' ? String(val) : val.toFixed(1);
        }
        app.updateInspector();
      }
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

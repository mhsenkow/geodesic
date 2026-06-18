import * as THREE from 'three';
import type { AppSettings, DomeData, HubParams, HubType, StrutType } from '../types';
import { DOME_RADIUS } from '../types';
import {
  genSphere,
  truncDome,
  classHubs,
  computeStrutTypes,
  strutTableCsv,
} from '../geodesic/math';
import { exportHubStl, downloadBlob, downloadText } from '../geometry/export';
import { generateHubMapSvg } from '../guides/hub-map';
import { estimateMaterial } from '../guides/material';
import { renderCutList, renderMaterialEstimate, refreshChipStates } from './material-panel';
import { loadSettings, saveSettings } from '../storage/settings';
import { getPreset } from '../presets';
import { getMaterialProfile, applyMaterialProfile, defaultStockForMatType } from '../materials/catalog';
import { MainScene } from '../scene/main-scene';
import { InspectorScene, computePairAngles } from '../scene/inspector-scene';
import { showToast } from './toast';
import { withLoading } from './loading';
import { bindKeyboard } from './keyboard';
import { bindUi } from './bindings';
import {
  applyUnitLabels,
  applyInputConstraints,
  formatSliderValues,
  formatMaterialNote,
  refreshMaterialStockSelect,
  setUnitToggle,
  formatMeters,
} from './units-ui';
import { clampDoorWidth, mToDisplay } from '../units';
import type { UnitSystem } from '../types';

export class GeodesicApp {
  settings: AppSettings;
  dome: DomeData | null = null;
  hubTypes: HubType[] = [];
  strutTypes: StrutType[] = [];

  private mainScene: MainScene;
  private inspector: InspectorScene;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private mDown = new THREE.Vector2();
  private wasDrag = false;
  private animId = 0;

  constructor() {
    this.settings = loadSettings();
    this.mainScene = new MainScene(document.body);
    this.inspector = new InspectorScene(document.getElementById('insp-canvas-wrap')!);

    bindUi(this);
    bindKeyboard(this);
    this.bindRaycast();
    this.syncFormFromSettings();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());

    void this.buildDome(false);
    this.animate();
  }

  hubParams(): HubParams {
    return {
      matType: this.settings.matType,
      rodD: this.settings.rodD,
      lumW: this.settings.lumW,
      lumH: this.settings.lumH,
      tol: this.settings.tol,
      wall: this.settings.wall,
      bodyScale: this.settings.bodyScale,
      chamfer: this.settings.chamfer,
      detail: this.settings.detail,
      printFoot: this.settings.printFoot,
      footMargin: this.settings.footMargin,
      printUpOverride: this.settings.printUpOverride,
      screwHoles: this.settings.screwHoles,
      screwDia: this.settings.screwDia,
      hubStyle: this.settings.hubStyle,
      junctionMeet: this.settings.junctionMeet,
      baseThickness: this.settings.baseThickness,
      baseScale: this.settings.baseScale,
      socketDepth: this.settings.socketDepth,
      surfaceSmooth: this.settings.surfaceSmooth,
      meshSubdivide: this.settings.meshSubdivide,
      subdConnectionLength: this.settings.subdConnectionLength,
      subdStrutSize: this.settings.subdStrutSize,
    };
  }

  persist(): void {
    saveSettings(this.settings);
  }

  async buildDome(showAutoInspector = true): Promise<void> {
    await withLoading(async () => {
      this.settings.doorW = clampDoorWidth(this.settings.doorW, this.settings.diam);
      const sp = genSphere(this.settings.freq, DOME_RADIUS);
      this.dome = truncDome(
        sp,
        this.settings.trunc,
        DOME_RADIUS,
        this.settings.flatBot,
        this.settings.door,
        this.settings.doorW,
        this.settings.diam
      );
      this.hubTypes = classHubs(this.dome);
      this.strutTypes = computeStrutTypes(this.dome, this.settings.diam);

      if (this.settings.selHub != null && this.settings.selHub >= this.hubTypes.length) {
        this.settings.selHub = this.hubTypes.length ? 0 : null;
      }

      this.mainScene.buildDomeVisual(this.dome, this.hubTypes, this.settings, this.hubParams());
      this.updateStats();
      this.updateHubList();
      this.updateMaterialPanels();

      if (showAutoInspector && !this.settings.inspectorOpen && this.hubTypes.length > 0) {
        this.openInspector(0, false);
      } else if (this.settings.inspectorOpen) {
        this.updateInspector();
      }

      this.persist();
    });
  }

  /** Refresh the cut-list and material/cost panels (volumes are cached per param set). */
  updateMaterialPanels(): void {
    if (!this.dome) return;
    renderCutList(this.strutTypes, this.settings.unitSystem);
    const est = estimateMaterial(
      this.dome,
      this.hubTypes,
      this.strutTypes,
      this.hubParams(),
      this.settings
    );
    renderMaterialEstimate(est, this.settings);
  }

  openInspector(htIdx: number, persist = true): void {
    if (htIdx == null || htIdx < 0 || htIdx >= this.hubTypes.length) return;
    this.settings.selHub = htIdx;
    this.settings.inspectorOpen = true;
    document.getElementById('hub-inspector')?.classList.add('visible');
    this.updateInspector();
    this.updateHubList();
    if (persist) this.persist();
  }

  closeInspector(): void {
    document.getElementById('hub-inspector')?.classList.remove('visible');
    this.settings.selHub = null;
    this.settings.inspectorOpen = false;
    this.inspector.clear();
    this.updateHubList();
    this.persist();
  }

  updateInspector(): void {
    if (this.settings.selHub == null || !this.dome) return;
    const ht = this.hubTypes[this.settings.selHub];
    const geo = this.inspector.update(ht, this.dome, this.settings, this.hubParams());
    if (!geo) return;

    const badge = document.getElementById('insp-badge');
    if (badge) {
      badge.textContent = `${ht.label} — ${ht.val}-way × ${ht.verts.length}${ht.isBase ? ' · base' : ''}`;
    }

    const triCount = geo.attributes.position.count / 3;
    const stats = document.getElementById('insp-mesh-stats');
    if (stats) {
      stats.textContent = `${Math.round(triCount).toLocaleString()} tris · ~${((triCount * 50) / 1024).toFixed(0)} KB`;
    }

    const angDiv = document.getElementById('insp-angles');
    const angHint = document.getElementById('insp-angles-hint');
    if (angDiv) {
      angDiv.innerHTML = '';
      const angles = computePairAngles(ht.dirs);
      const minAng = angles.length ? Math.min(...angles) : 180;
      for (const ang of angles) {
        const chip = document.createElement('span');
        chip.className = 'insp-angle-chip';
        chip.textContent = ang.toFixed(1) + '°';
        chip.style.borderColor = ht.color;
        chip.style.color = ht.color;
        if (Math.abs(ang - minAng) < 0.05) {
          chip.style.fontWeight = '700';
          chip.title = 'Tightest meet angle — raise Junction Meet if the core looks thin';
        }
        angDiv.appendChild(chip);
      }
      if (angHint) {
        angHint.textContent =
          angles.length > 0
            ? `Tightest strut meet: ${minAng.toFixed(1)}° — use Junction Meet blend to solidify the core.`
            : '';
      }
    }
  }

  async exportSelectedHub(): Promise<void> {
    if (!this.dome || this.settings.selHub == null) return;
    await withLoading(async () => {
      const result = exportHubStl(
        this.settings.selHub!,
        this.hubTypes,
        this.dome!,
        this.settings,
        this.hubParams()
      );
      if (!result) {
        showToast('Export failed — no geometry generated.', 'error');
        return;
      }
      if (!result.validation.valid || result.validation.warnings.length) {
        const msg = [
          ...result.validation.errors,
          ...result.validation.warnings,
        ].join(' ');
        showToast(`STL exported with warnings: ${msg}`, 'error', 6000);
      } else {
        showToast(`Exported ${result.filename}`, 'success');
      }
      downloadBlob(result.blob, result.filename);
    }, 'Exporting STL…');
  }

  async exportAllHubs(): Promise<void> {
    if (!this.dome) return;
    showToast(`Exporting ${this.hubTypes.length} hub types…`, 'info');
    for (let i = 0; i < this.hubTypes.length; i++) {
      await new Promise((r) => setTimeout(r, i * 400));
      const result = exportHubStl(i, this.hubTypes, this.dome, this.settings, this.hubParams());
      if (result) downloadBlob(result.blob, result.filename);
    }
    showToast('All hubs exported.', 'success');
  }

  exportStrutTable(): void {
    const u = this.settings.unitSystem;
    const mat =
      this.settings.matType === 'round'
        ? u === 'imperial'
          ? `Round tube OD ${(this.settings.rodD / 25.4).toFixed(3)} in`
          : `Round tube OD ${this.settings.rodD.toFixed(1)} mm`
        : u === 'imperial'
          ? `Timber ${(this.settings.lumW / 25.4).toFixed(2)}" × ${(this.settings.lumH / 25.4).toFixed(2)}"`
          : `Timber ${this.settings.lumW.toFixed(0)}×${this.settings.lumH.toFixed(0)} mm`;
    const csv = strutTableCsv(this.strutTypes, mat);
    const diamLabel = formatMeters(this.settings.diam, u).replace(/\s/g, '');
    downloadText(csv, `strut_lengths_V${this.settings.freq}_${diamLabel}.csv`, 'text/csv');
    showToast('Strut length table downloaded.', 'success');
  }

  exportHubMap(): void {
    if (!this.dome) return;
    const svg = generateHubMapSvg(this.dome, this.hubTypes);
    downloadText(svg, `hub_map_V${this.settings.freq}_${this.settings.diam}m.svg`, 'image/svg+xml');
    showToast('Hub placement map downloaded.', 'success');
  }

  applyPreset(presetId: string): void {
    const preset = getPreset(presetId);
    if (!preset) return;
    this.settings = { ...this.settings, ...preset.settings, presetId };
    if (preset.settings.materialStockId) {
      const profile = getMaterialProfile(preset.settings.materialStockId);
      if (profile) Object.assign(this.settings, applyMaterialProfile(profile));
      this.settings = { ...this.settings, ...preset.settings, presetId };
    }
    this.syncFormFromSettings();
    void this.buildDome();
    showToast(`Applied preset: ${preset.name}`, 'success');
  }

  applyMaterialStock(stockId: string, rebuild = true): void {
    const profile = getMaterialProfile(stockId);
    if (!profile) return;
    Object.assign(this.settings, applyMaterialProfile(profile));
    if (profile.matType === 'rect' && this.settings.bodyScale < 1.2) {
      this.settings.bodyScale = 1.5;
      this.settings.hubStyle = 'organic';
    }
    this.syncFormFromSettings();
    if (rebuild) void this.buildDome(false);
  }

  setUnitSystem(units: UnitSystem): void {
    if (this.settings.unitSystem === units) return;
    this.settings.unitSystem = units;
    this.syncFormFromSettings();
    this.persist();
  }

  /** Keep stock picker aligned with round vs timber mode. */
  ensureMaterialStockMatchesType(rebuild = false): void {
    const profile = getMaterialProfile(this.settings.materialStockId);
    if (profile && profile.matType === this.settings.matType) return;
    this.applyMaterialStock(defaultStockForMatType(this.settings.matType), rebuild);
  }

  updateStats(): void {
    const set = (id: string, val: string | number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    set('stat-verts', this.dome ? this.dome.verts.length : '—');
    set('stat-edges', this.dome ? this.dome.edges.length : '—');
    set('stat-hub-types', this.hubTypes.length || '—');
    set('stat-faces', this.dome ? this.dome.faces.length : '—');
  }

  updateHubList(): void {
    const c = document.getElementById('hub-list');
    if (!c) return;
    c.innerHTML = '';
    this.hubTypes.forEach((ht, i) => {
      const b = document.createElement('div');
      b.className = 'hub-badge' + (this.settings.selHub === i ? ' selected' : '');
      b.innerHTML = `<div class="info"><span class="dot" style="background:${ht.color}"></span><span>${ht.label} — ${ht.val}-way${ht.isBase ? ' (base)' : ''}</span></div><span class="count">×${ht.verts.length}</span>`;
      b.addEventListener('click', () => this.openInspector(i));
      c.appendChild(b);
    });
    const exportAll = document.getElementById('btn-export-all') as HTMLButtonElement | null;
    if (exportAll) exportAll.disabled = this.hubTypes.length === 0;
  }

  syncFormFromSettings(): void {
    const s = this.settings;
    s.doorW = clampDoorWidth(s.doorW, s.diam);

    const setVal = (id: string, val: string | number | boolean) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) return;
      if (el.type === 'checkbox') (el as HTMLInputElement).checked = Boolean(val);
      else el.value = String(val);
    };

    applyUnitLabels(s.unitSystem);
    setUnitToggle(s.unitSystem);
    refreshMaterialStockSelect(s.materialStockId, s.unitSystem, s.matType);
    applyInputConstraints(s);

    setVal('frequency', s.freq);
    setVal('truncation', s.trunc);
    setVal('tolerance', s.tol);
    setVal('printFoot', s.printFoot);
    setVal('foot-margin', s.footMargin);
    setVal('showWireframe', s.showWire);
    setVal('showHubs', s.showHubs);
    setVal('showMarkers', s.showMarkers);
    setVal('door-enabled', s.door);
    setVal('hub-body', s.bodyScale);
    setVal('hub-chamfer', s.chamfer);
    setVal('hub-detail', s.detail);
    setVal('hub-wireframe', s.hubWire);
    setVal('hub-build-guide', s.showBuildGuide);
    setVal('print-up-x', s.printUpOverride?.[0] ?? 0);
    setVal('print-up-y', s.printUpOverride?.[1] ?? 1);
    setVal('print-up-z', s.printUpOverride?.[2] ?? 0);
    setVal('print-up-override', s.printUpOverride != null);
    setVal('screw-holes', s.screwHoles);
    setVal('screw-dia', s.screwDia);
    (document.getElementById('style-sharp') as HTMLInputElement).checked = s.hubStyle === 'sharp';
    (document.getElementById('style-organic') as HTMLInputElement).checked = s.hubStyle === 'organic';
    setVal('junction-meet', s.junctionMeet);
    setVal('socket-depth', s.socketDepth);
    setVal('surface-smooth', s.surfaceSmooth);
    setVal('mesh-subdivide', s.meshSubdivide);
    setVal('subd-connection-length', s.subdConnectionLength);
    setVal('subd-strut-size', s.subdStrutSize);
    setVal('stock-length', mToDisplay(s.stockLength, s.unitSystem).toFixed(2));
    setVal('stock-waste', s.stockWastePct);
    setVal('stock-price', s.stockPrice);
    setVal('filament-density', s.filamentDensity);
    setVal('filament-price', s.filamentPrice);
    const stockKind = document.getElementById('mat-stock-kind');
    if (stockKind) stockKind.textContent = s.matType === 'round' ? 'Tube' : 'Timber';

    const profile = getMaterialProfile(s.materialStockId);
    const note = document.getElementById('material-stock-note');
    if (note && profile) note.textContent = formatMaterialNote(profile, s.unitSystem);

    const doorHint = document.getElementById('door-width-hint');
    if (doorHint) {
      const maxDoor = formatMeters(Math.max(0.5, s.diam * 0.85), s.unitSystem);
      doorHint.textContent = `Max ${maxDoor} (~85% of dome)`;
    }

    const freqVal = document.getElementById('freq-val');
    if (freqVal) freqVal.textContent = `V${s.freq}`;
    formatSliderValues(s);
    document.getElementById('hub-body-val')!.textContent = s.bodyScale.toFixed(1) + 'x';
    document.getElementById('hub-detail-val')!.textContent = String(s.detail);
    const jmVal = document.getElementById('junction-meet-val');
    if (jmVal) jmVal.textContent = s.junctionMeet.toFixed(2) + '×';
    const sdVal = document.getElementById('socket-depth-val');
    if (sdVal) sdVal.textContent = Math.round(s.socketDepth * 100) + '%';
    const ssVal = document.getElementById('surface-smooth-val');
    if (ssVal) ssVal.textContent = Math.round(s.surfaceSmooth * 100) + '%';
    const sclVal = document.getElementById('subd-connection-length-val');
    if (sclVal) sclVal.textContent = s.subdConnectionLength.toFixed(2) + '×';
    const sssVal = document.getElementById('subd-strut-size-val');
    if (sssVal) sssVal.textContent = s.subdStrutSize.toFixed(2) + '×';

    const isRound = s.matType === 'round';
    // Timber Style (Sharp/Organic) toggle is timber-only; the .rect-only rule
    // below shows it for timber and hides it for round.
    (document.getElementById('mat-round') as HTMLInputElement).checked = isRound;
    (document.getElementById('mat-rect') as HTMLInputElement).checked = !isRound;
    document.querySelectorAll('.round-only').forEach((el) => {
      (el as HTMLElement).style.display = isRound ? 'flex' : 'none';
    });
    document.querySelectorAll('.rect-only').forEach((el) => {
      (el as HTMLElement).style.display = isRound ? 'none' : 'flex';
    });

    const presetSelect = document.getElementById('preset-select') as HTMLSelectElement | null;
    if (presetSelect && s.presetId) presetSelect.value = s.presetId;

    refreshChipStates();
  }

  private bindRaycast(): void {
    const canvas = this.mainScene.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      this.mDown.set(e.clientX, e.clientY);
      this.wasDrag = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - this.mDown.x) > 4 || Math.abs(e.clientY - this.mDown.y) > 4) {
        this.wasDrag = true;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.wasDrag || !this.mainScene.markerMeshes.length) return;
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.mainScene.camera);
      const hits = this.raycaster.intersectObjects(this.mainScene.markerMeshes);
      if (hits.length > 0) {
        const vidx = hits[0].object.userData.vidx as number;
        const htIdx = this.hubTypes.findIndex((ht) => ht.verts.includes(vidx));
        if (htIdx >= 0) this.openInspector(htIdx);
      }
    });
  }

  onResize(): void {
    const sw = window.innerWidth > 768 ? 320 : 0;
    this.mainScene.resize(sw);
    const iw = Math.min(480, window.innerWidth - sw - 40);
    this.inspector.resize(iw);
  }

  private animate = (): void => {
    this.animId = requestAnimationFrame(this.animate);
    this.mainScene.render();
    this.inspector.render();
  };
}

export function initApp(): GeodesicApp {
  window.addEventListener('geodesic:manifold-failed', () => {
    showToast('Timber hub engine failed to load. Hard-refresh the page.', 'error', 8000);
  });
  return new GeodesicApp();
}

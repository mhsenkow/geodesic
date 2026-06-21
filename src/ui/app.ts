import * as THREE from 'three';
import type { AppSettings, DomeData, HubParams, HubType, StrutType } from '../types';
import { DOME_RADIUS } from '../types';
import {
  genSphere,
  dualizeSphere,
  truncDome,
  classHubs,
  computeStrutTypes,
  strutTableCsv,
  type VertexSocket,
} from '../geodesic/math';
import { hubSocketInfo } from '../geometry/socket-geometry';
import {
  designJson,
  exportHubStl,
  exportPackedBuildPlate3mf,
  exportAllHubsZip,
  exportHubGlb,
  bomCsv,
  vertexCoordsCsv,
  downloadBlob,
  downloadText,
} from '../geometry/export';
import { importDesignJson, addCustomPreset, loadCustomPresets } from '../storage/settings';
import { analyzePrintability, estimatePlatePack, nozzleFromPreset } from '../geometry/printability';
import { analyzeFitChecks } from '../geometry/fit-checks';
import { hubDirsFromVertex } from '../geometry/hub-geometry';
import { validateStlGeometry } from '../geometry/stl-validation';
import { generateHubMapSvg } from '../guides/hub-map';
import { estimateMaterial, meshVolumeMm3, clearVolCache } from '../guides/material';
import { renderCutList, renderMaterialEstimate, refreshChipStates } from './material-panel';
import { loadSettings, saveSettings, settingsShareHash } from '../storage/settings';
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
  private inspectorSnapshot: AppSettings | null = null;
  private inspectorPaused = false;

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
    const profile = getMaterialProfile(this.settings.materialStockId);
    return {
      matType: this.settings.matType,
      rodD: this.settings.rodD,
      lumW: this.settings.lumW,
      lumH: this.settings.lumH,
      tol: this.settings.tol,
      tolX: this.settings.tolX,
      tolY: this.settings.tolY,
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
      socketDepthMm: this.settings.socketDepthMm,
      surfaceSmooth: this.settings.surfaceSmooth,
      meshSubdivide: this.settings.meshSubdivide,
      subdConnectionLength: this.settings.subdConnectionLength,
      subdStrutSize: this.settings.subdStrutSize,
      strutTaper: this.settings.strutTaper,
      boreThrough: this.settings.boreThrough,
      baseVent: this.settings.baseVent,
      nozzleDia: nozzleFromPreset(this.settings.nozzlePreset, this.settings.nozzleDia),
      frictionRibs: this.settings.frictionRibs,
      ribDepth: this.settings.ribDepth,
      ribCount: this.settings.ribCount,
      screwBosses: this.settings.screwBosses,
      embossLabels: this.settings.embossLabels,
      alignmentNotches: this.settings.alignmentNotches,
      showOverhangHeatmap: this.settings.showOverhangHeatmap,
      lumberDepthAxis: profile?.lumberDepthAxis,
      socketRollDeg: this.settings.socketRollDeg,
      junctionDrip: this.settings.junctionDrip,
      surfaceNoise: this.settings.surfaceNoise,
      hubStyleBlend: this.settings.hubStyleBlend,
      treeSupportBase: this.settings.treeSupportBase,
      previewQuality: this.settings.previewQuality,
    };
  }

  persist(): void {
    saveSettings(this.settings);
  }

  async buildDome(showAutoInspector = true): Promise<void> {
    await withLoading(async () => {
      this.settings.doorW = clampDoorWidth(this.settings.doorW, this.settings.diam);
      let sp = genSphere(this.settings.freq, DOME_RADIUS, this.settings.baseSolid);
      if (this.settings.geoTopology === 'goldberg') sp = dualizeSphere(sp);
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
      this.strutTypes = computeStrutTypes(this.dome, this.settings.diam, this.strutComputeOptions());

      if (this.settings.selHub != null && this.settings.selHub >= this.hubTypes.length) {
        this.settings.selHub = this.hubTypes.length ? 0 : null;
      }

      this.mainScene.buildDomeVisual(this.dome, this.hubTypes, this.settings, this.hubParams());
      this.updateStats();
      this.updateHubList();
      this.updateMaterialPanels();

      if (this.settings.autoOpenInspector && showAutoInspector && !this.settings.inspectorOpen && this.hubTypes.length > 0) {
        this.openInspector(0, false);
      } else if (this.settings.inspectorOpen) {
        this.updateInspector();
      }

      this.persist();
    });
  }

  /** Per-vertex socket geometry + hub labels so reported strut lengths become
   *  real cut lengths (chord − how far the strut seats into a hub at each end). */
  private strutComputeOptions() {
    if (!this.dome) return {};
    const hp = this.hubParams();
    const vertexSocket: VertexSocket[] = new Array(this.dome.verts.length);
    const vertexHubLabel: string[] = new Array(this.dome.verts.length);
    for (const ht of this.hubTypes) {
      const dirs = ht.dirs.map((d) => new THREE.Vector3(d[0], d[1], d[2]));
      const info = hubSocketInfo(hp, dirs);
      for (const vi of ht.verts) {
        vertexSocket[vi] = { floorMm: info.floorFromCenterMm, seatMm: info.seatDepthMm };
        vertexHubLabel[vi] = ht.label;
      }
    }
    // PVC/EMT can be cut to ~0.5 mm; timber realistically ~1 mm.
    const clusterToleranceM = (this.settings.matType === 'rect' ? 1 : 0.5) / 1000;
    return { vertexSocket, vertexHubLabel, clusterToleranceM };
  }

  /** Refresh the cut-list and material/cost panels (volumes are cached per param set). */
  updateMaterialPanels(): void {
    if (!this.dome) return;
    renderCutList(
      this.strutTypes,
      this.settings.unitSystem,
      this.settings.strutColorMode === 'length' && this.settings.showStrutBodies
    );
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
    if (!this.inspectorSnapshot) this.inspectorSnapshot = { ...this.settings };
    this.settings.selHub = htIdx;
    this.settings.inspectorOpen = true;
    document.getElementById('hub-inspector')?.classList.add('visible');
    this.updateInspector();
    this.updateHubList();
    if (persist) this.persist();
  }

  revertInspectorSettings(): void {
    if (!this.inspectorSnapshot) return;
    this.settings = { ...this.inspectorSnapshot, selHub: this.settings.selHub, inspectorOpen: true };
    this.syncFormFromSettings();
    clearVolCache();
    void this.buildDome(false);
    this.updateInspector();
    showToast('Inspector settings reverted.', 'info');
  }

  saveCustomPreset(): void {
    const name = prompt('Preset name?');
    if (!name?.trim()) return;
    addCustomPreset(name.trim(), 'Custom saved preset', this.settings);
    showToast(`Saved preset “${name.trim()}”.`, 'success');
  }

  importDesignFromFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        this.settings = importDesignJson(String(reader.result));
        this.syncFormFromSettings();
        clearVolCache();
        void this.buildDome(false);
        showToast('Design imported.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Invalid design JSON.', 'error');
      }
    };
    reader.readAsText(file);
  }

  closeInspector(): void {
    document.getElementById('hub-inspector')?.classList.remove('visible');
    this.settings.selHub = null;
    this.settings.inspectorOpen = false;
    this.inspector.clear();
    this.inspectorSnapshot = null;
    this.updateHubList();
    this.persist();
  }

  updateInspector(): void {
    if (this.settings.selHub == null || !this.dome) return;
    const ht = this.hubTypes[this.settings.selHub];
    const geo = this.inspector.update(ht, this.dome, this.settings, {
      ...this.hubParams(),
      embossLabels: this.settings.embossPreview || this.settings.embossLabels,
      alignmentNotches: this.settings.embossPreview || this.settings.alignmentNotches,
    });
    if (!geo) return;

    const badge = document.getElementById('insp-badge');
    if (badge) {
      badge.textContent = `${ht.label} — ${ht.val}-way × ${ht.verts.length}${ht.isBase ? ' · base' : ''}`;
    }

    const triCount = geo.attributes.position.count / 3;
    const stats = document.getElementById('insp-mesh-stats');
    if (stats) {
      const cm3 = meshVolumeMm3(geo) / 1000;
      const infill = THREE.MathUtils.clamp(this.settings.printInfillPct / 100, 0.05, 1);
      const grams = cm3 * (0.2 + 0.8 * infill) * this.settings.filamentDensity;
      stats.textContent = `${Math.round(triCount).toLocaleString()} tris · ${cm3.toFixed(0)} cm³ · ~${Math.round(grams)} g`;
    }

    const badgeWrap = document.getElementById('insp-validation-badges');
    if (badgeWrap) {
      badgeWrap.innerHTML = '';
      const addBadge = (kind: 'ok' | 'warn' | 'error', text: string, title = '') => {
        const el = document.createElement('span');
        el.className = `validation-badge ${kind}`;
        el.textContent = text;
        if (title) el.title = title;
        badgeWrap.appendChild(el);
      };
      const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
      const validation = validateStlGeometry(nonIndexed.attributes.position.array as Float32Array);
      if (nonIndexed !== geo) nonIndexed.dispose();
      const dirs = hubDirsFromVertex(this.dome, ht.verts[0]).map((d) => d.clone());
      const report = analyzePrintability(geo, this.hubParams(), dirs, { measureWall: true });
      const fit = analyzeFitChecks(geo, dirs, this.hubParams());
      const plate = estimatePlatePack(this.hubTypes, this.settings.buildPlateW, this.settings.buildPlateD, 45);
      addBadge(validation.errors.length ? 'error' : validation.warnings.length ? 'warn' : 'ok', 'Watertight', [
        ...validation.errors,
        ...validation.warnings,
      ].join(' '));
      addBadge(
        report.overhangPct > 8 ? 'warn' : 'ok',
        `Overhang ${report.overhangPct.toFixed(1)}%`,
        report.warnings.find((w) => w.includes('surface')) ?? 'Down-facing area over a 45 degree support threshold.'
      );
      addBadge(
        report.minWallMm < report.requiredWallMm ? 'warn' : 'ok',
        `Wall ${report.minWallMm.toFixed(1)}mm`,
        `2x nozzle target: ${report.requiredWallMm.toFixed(1)}mm`
      );
      addBadge(
        fit.socketDepthWarning || !fit.strutFitOk ? 'warn' : 'ok',
        `Socket ${fit.socketDepthMm.toFixed(0)}mm · seats ${fit.socketSeatDepthMm.toFixed(0)}mm`,
        `${fit.socketOpeningMm.label} opening; strut engages ~${fit.socketSeatDepthMm.toFixed(0)} mm per end. ${fit.socketDepthWarning ?? fit.strutFitWarning ?? 'Socket depth and clearance are in the expected range.'}`
      );
      addBadge(
        report.maxEdgeMm > report.targetEdgeMm * 1.45 ? 'warn' : 'ok',
        `Edge ${report.maxEdgeMm.toFixed(1)}mm`,
        `Target max edge: ${report.targetEdgeMm.toFixed(1)}mm`
      );
      addBadge(plate.plateFits ? 'ok' : 'warn', 'Plate pack', plate.warnings.join(' ') || 'Fits build plate.');
      if (report.supportMaterialPct > 5) {
        addBadge('warn', `Support ~${report.supportMaterialPct.toFixed(0)}%`, `~${report.supportVolumeCm3.toFixed(1)} cm³ support material est.`);
      }
      if (fit.suggestedPrintUp && !this.settings.printUpOverride) {
        addBadge('ok', 'Print-up hint', `Try [${fit.suggestedPrintUp.map((v) => v.toFixed(2)).join(', ')}]`);
      }
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
      const result = await exportHubStl(
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
      if (result.blocked) {
        showToast(`Export blocked: ${result.validation.errors.join(' ')}`, 'error', 8000);
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

  private exportMaterialLabel(): string {
    const u = this.settings.unitSystem;
    return this.settings.matType === 'round'
      ? u === 'imperial'
        ? `Round tube OD ${(this.settings.rodD / 25.4).toFixed(3)} in`
        : `Round tube OD ${this.settings.rodD.toFixed(1)} mm`
      : u === 'imperial'
        ? `Timber ${(this.settings.lumW / 25.4).toFixed(2)}" × ${(this.settings.lumH / 25.4).toFixed(2)}"`
        : `Timber ${this.settings.lumW.toFixed(0)}×${this.settings.lumH.toFixed(0)} mm`;
  }

  async exportAllHubs(mode: 'unique' | 'production' = 'unique'): Promise<void> {
    if (!this.dome) return;
    await withLoading(async () => {
      const est = estimateMaterial(this.dome!, this.hubTypes, this.strutTypes, this.hubParams(), this.settings);
      const result = await exportAllHubsZip(
        this.hubTypes,
        this.dome!,
        this.settings,
        this.hubParams(),
        {
          mode,
          strutTypes: this.strutTypes,
          materialLabel: this.exportMaterialLabel(),
          bomEstimate: est,
          onProgress: (p) => showToast(`Exporting ${p.label} (${p.current}/${p.total})…`, 'info', 1200),
        }
      );
      if (!result) {
        showToast('Batch export failed.', 'error');
        return;
      }
      downloadBlob(result.blob, result.filename);
      const warnText = result.warnings.length ? ` with ${result.warnings.length} warning(s)` : '';
      showToast(`Exported ${result.filename}${warnText}`, result.warnings.length ? 'info' : 'success', 6000);
    }, mode === 'production' ? 'Zipping production hub set…' : 'Zipping test hub set…');
  }

  async exportBuildPlate3mf(): Promise<void> {
    if (!this.dome) return;
    await withLoading(async () => {
      const result = exportPackedBuildPlate3mf(
        this.hubTypes,
        this.dome!,
        this.strutTypes,
        this.settings,
        this.hubParams()
      );
      if (!result) {
        showToast('3MF export failed — no hub geometry generated.', 'error');
        return;
      }
      downloadBlob(result.blob, result.filename);
      if (result.warnings.length) {
        showToast(`3MF exported with ${result.warnings.length} print warning(s).`, 'error', 6000);
      } else {
        showToast(`Exported ${result.filename}`, 'success');
      }
    }, 'Packing 3MF build plate…');
  }

  exportDesignJson(): void {
    const content = designJson(this.settings, this.hubTypes, this.strutTypes);
    downloadText(content, `geodesic_design_V${this.settings.freq}_${this.settings.diam}m.json`, 'application/json');
    showToast('Design JSON exported.', 'success');
  }

  async copyShareUrl(): Promise<void> {
    const url = new URL(location.href);
    url.hash = settingsShareHash(this.settings);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('Share URL copied.', 'success');
    } catch {
      downloadText(url.toString(), 'geodesic_share_url.txt', 'text/plain');
      showToast('Clipboard unavailable — share URL downloaded.', 'info');
    }
  }

  exportStrutTable(): void {
    const u = this.settings.unitSystem;
    const csv = strutTableCsv(this.strutTypes, this.exportMaterialLabel(), this.dome ?? undefined, this.hubTypes);
    const diamLabel = formatMeters(this.settings.diam, u).replace(/\s/g, '');
    downloadText(csv, `strut_lengths_V${this.settings.freq}_${diamLabel}.csv`, 'text/csv');
    showToast('Strut length table downloaded.', 'success');
  }

  exportBom(): void {
    if (!this.dome) return;
    const est = estimateMaterial(this.dome, this.hubTypes, this.strutTypes, this.hubParams(), this.settings);
    const csv = bomCsv(this.settings, this.hubTypes, this.strutTypes, est);
    downloadText(csv, `bom_V${this.settings.freq}_${this.settings.diam}m.csv`, 'text/csv');
    showToast('BOM CSV downloaded.', 'success');
  }

  exportVertexCoords(): void {
    if (!this.dome) return;
    const csv = vertexCoordsCsv(this.dome, this.hubTypes);
    downloadText(csv, `vertices_V${this.settings.freq}.csv`, 'text/csv');
    showToast('Vertex coordinates downloaded.', 'success');
  }

  async exportSelectedGlb(): Promise<void> {
    if (!this.dome || this.settings.selHub == null) return;
    const result = await exportHubGlb(
      this.settings.selHub,
      this.hubTypes,
      this.dome,
      this.settings,
      this.hubParams()
    );
    if (!result) {
      showToast('GLB export failed.', 'error');
      return;
    }
    downloadBlob(result.blob, result.filename);
    showToast(`Exported ${result.filename}`, 'success');
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
    if (preset.settings.tol != null && preset.settings.tolX == null) this.settings.tolX = preset.settings.tol;
    if (preset.settings.tol != null && preset.settings.tolY == null) this.settings.tolY = preset.settings.tol;
    if (preset.settings.materialStockId) {
      const profile = getMaterialProfile(preset.settings.materialStockId);
      if (profile) Object.assign(this.settings, applyMaterialProfile(profile));
      this.settings = { ...this.settings, ...preset.settings, presetId };
      if (preset.settings.tol != null && preset.settings.tolX == null) this.settings.tolX = preset.settings.tol;
      if (preset.settings.tol != null && preset.settings.tolY == null) this.settings.tolY = preset.settings.tol;
    }
    this.syncFormFromSettings();
    void this.buildDome();
    showToast(`Applied preset: ${preset.name}`, 'success');
  }

  applyMaterialStock(stockId: string, rebuild = true): void {
    const profile = getMaterialProfile(stockId);
    if (!profile) return;
    Object.assign(this.settings, applyMaterialProfile(profile));
    this.settings.tolX = this.settings.tol;
    this.settings.tolY = this.settings.tol;
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
    const exportTest = document.getElementById('btn-export-test-set') as HTMLButtonElement | null;
    if (exportTest) exportTest.disabled = this.hubTypes.length === 0;
    const exportProduction = document.getElementById('btn-export-production-set') as HTMLButtonElement | null;
    if (exportProduction) exportProduction.disabled = this.hubTypes.length === 0;
    const exportPlate = document.getElementById('btn-export-plate') as HTMLButtonElement | null;
    if (exportPlate) exportPlate.disabled = this.hubTypes.length === 0;
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
    setVal('tol-x', s.tolX);
    setVal('tol-y', s.tolY);
    setVal('nozzle-dia', s.nozzleDia);
    setVal('build-plate-w', s.buildPlateW);
    setVal('build-plate-d', s.buildPlateD);
    setVal('printFoot', s.printFoot);
    setVal('foot-margin', s.footMargin);
    setVal('base-thickness', s.baseThickness);
    setVal('base-scale', s.baseScale);
    setVal('showWireframe', s.showWire);
    setVal('showStrutBodies', s.showStrutBodies);
    setVal('strut-color-mode', s.strutColorMode);
    setVal('showHubs', s.showHubs);
    setVal('showMarkers', s.showMarkers);
    setVal('door-enabled', s.door);
    setVal('flat-base', s.flatBot);
    setVal('preview-quality', s.previewQuality);
    setVal('nozzle-preset', s.nozzlePreset);
    setVal('lumber-face', String(s.socketRollDeg));
    setVal('filament-diameter', s.filamentDiameterMm);
    setVal('tree-support-base', s.treeSupportBase);
    setVal('emboss-preview', s.embossPreview);
    setVal('auto-open-inspector', s.autoOpenInspector);
    setVal('junction-drip', s.junctionDrip);
    setVal('surface-noise', s.surfaceNoise);
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
    setVal('screw-bosses', s.screwBosses);
    setVal('screw-dia', s.screwDia);
    (document.getElementById('style-sharp') as HTMLInputElement).checked = s.hubStyle === 'sharp';
    (document.getElementById('style-organic') as HTMLInputElement).checked = s.hubStyle === 'organic';
    const styleMeta = document.getElementById('style-metaball') as HTMLInputElement | null;
    if (styleMeta) styleMeta.checked = s.hubStyle === 'metaball';
    setVal('base-solid', s.baseSolid);
    setVal('geo-topology', s.geoTopology);
    setVal('strut-taper', s.strutTaper);
    setVal('bore-through', s.boreThrough);
    setVal('base-vent', s.baseVent);
    setVal('friction-ribs', s.frictionRibs);
    setVal('rib-depth', s.ribDepth);
    setVal('rib-count', s.ribCount);
    setVal('socket-depth-mm', s.socketDepthMm);
    setVal('emboss-labels', s.embossLabels);
    setVal('alignment-notches', s.alignmentNotches);
    setVal('overhang-heatmap', s.showOverhangHeatmap);
    const taperVal = document.getElementById('strut-taper-val');
    if (taperVal) taperVal.textContent = Math.round(s.strutTaper * 100) + '%';
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
    setVal('print-infill', s.printInfillPct);
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
    const baseScaleVal = document.getElementById('base-scale-val');
    if (baseScaleVal) baseScaleVal.textContent = s.baseScale.toFixed(2) + '×';

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
    const presetDesc = document.getElementById('preset-description');
    if (presetDesc) {
      const preset = getPreset(s.presetId ?? '') ?? loadCustomPresets().find((p) => p.id === s.presetId);
      presetDesc.textContent = preset?.description ?? 'Custom configuration.';
    }

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
    if (!this.settings.inspectorOpen) this.inspectorPaused = true;
    this.mainScene.render();
    if (this.settings.inspectorOpen) this.inspector.render();
  };
}

export function initApp(): GeodesicApp {
  window.addEventListener('geodesic:manifold-failed', () => {
    showToast('Manifold CSG engine failed to load — hubs may not export watertight. Hard-refresh the page.', 'error', 8000);
  });
  return new GeodesicApp();
}

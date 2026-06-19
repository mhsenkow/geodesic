import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DOME_RADIUS, DEFAULT_SETTINGS, type HubParams } from '../../src/types';
import { genSphere, truncDome, classHubs, computeStrutTypes } from '../../src/geodesic/math';
import { buildRoundNodeHubSolid } from '../../src/geometry/node-hub-manifold';
import { analyzePrintability } from '../../src/geometry/printability';
import { exportAllHubsZip, exportPackedBuildPlate3mf } from '../../src/geometry/export';

const dirs = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-0.35, 0.85, 0.15).normalize(),
  new THREE.Vector3(-0.4, -0.65, 0.55).normalize(),
];

const hubParams: HubParams = {
  matType: 'round',
  rodD: 26.7,
  lumW: 19,
  lumH: 38,
  tol: 0.3,
  tolX: 0.3,
  tolY: 0.3,
  wall: 5,
  bodyScale: 1.5,
  chamfer: 1.5,
  detail: 24,
  printFoot: true,
  footMargin: 6,
  surfaceSmooth: 0.45,
  socketDepth: 0.85,
  socketDepthMm: 0,
  meshSubdivide: false,
  subdConnectionLength: 0,
  subdStrutSize: 1,
  hubStyle: 'sharp',
  screwHoles: false,
  screwBosses: false,
  frictionRibs: false,
  ribDepth: 0.35,
  ribCount: 2,
  embossLabels: false,
  alignmentNotches: false,
};

describe('printability and fit features', () => {
  it('friction ribs are actual positive socket geometry', () => {
    const plain = buildRoundNodeHubSolid(dirs, hubParams, { organic: false });
    const ribbed = buildRoundNodeHubSolid(
      dirs,
      { ...hubParams, frictionRibs: true, ribDepth: 0.45, ribCount: 2 },
      { organic: false }
    );
    expect(ribbed.volume()).toBeGreaterThan(plain.volume());
    plain.delete();
    ribbed.delete();
  });

  it('min-wall checker warns below two nozzle widths', () => {
    const geo = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
    const report = analyzePrintability(geo, { ...hubParams, wall: 0.6, nozzleDia: 0.4 });
    expect(report.requiredWallMm).toBeCloseTo(0.8);
    expect(report.warnings.some((w) => w.includes('Minimum wall'))).toBe(true);
  });

  it('exports a packed 3MF build plate with hub metadata', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      freq: 1,
      detail: 16,
      embossLabels: false,
      alignmentNotches: false,
      frictionRibs: false,
    };
    const sphere = genSphere(settings.freq, DOME_RADIUS, settings.baseSolid);
    const dome = truncDome(
      sphere,
      settings.trunc,
      DOME_RADIUS,
      settings.flatBot,
      settings.door,
      settings.doorW,
      settings.diam
    );
    const hubs = classHubs(dome);
    const struts = computeStrutTypes(dome, settings.diam);
    const result = exportPackedBuildPlate3mf(hubs, dome, struts, settings, {
      ...hubParams,
      detail: 16,
      embossLabels: false,
      alignmentNotches: false,
      frictionRibs: false,
    });
    expect(result).not.toBeNull();
    expect(result!.filename.endsWith('.3mf')).toBe(true);
    expect(result!.blob.size).toBeGreaterThan(1000);
    await expect(result!.blob.text()).resolves.toContain('3D/3dmodel.model');
    const manifest = result!.manifest as {
      hubs: Array<{ count: number; instances: Array<{ x: number; y: number }> }>;
      buildPlate: { packedWidthMm: number; packedDepthMm: number };
    };
    const repeated = manifest.hubs.find((h) => h.count > 1);
    expect(repeated).toBeDefined();
    expect(repeated!.instances).toHaveLength(repeated!.count);
    const uniquePositions = new Set(repeated!.instances.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(uniquePositions.size).toBe(repeated!.count);
    expect(manifest.buildPlate.packedWidthMm).toBeGreaterThan(0);
    expect(manifest.buildPlate.packedDepthMm).toBeGreaterThan(0);
  });

  it('exports test and production ZIP bundles with metadata', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      freq: 1,
      detail: 16,
      embossLabels: false,
      alignmentNotches: false,
      frictionRibs: false,
    };
    const sphere = genSphere(settings.freq, DOME_RADIUS, settings.baseSolid);
    const dome = truncDome(
      sphere,
      settings.trunc,
      DOME_RADIUS,
      settings.flatBot,
      settings.door,
      settings.doorW,
      settings.diam
    );
    const hubs = classHubs(dome);
    const struts = computeStrutTypes(dome, settings.diam);
    const params = {
      ...hubParams,
      detail: 16,
      embossLabels: false,
      alignmentNotches: false,
      frictionRibs: false,
    };
    const unique = await exportAllHubsZip(hubs, dome, settings, params, {
      mode: 'unique',
      strutTypes: struts,
      materialLabel: 'test stock',
    });
    const production = await exportAllHubsZip(hubs, dome, settings, params, {
      mode: 'production',
      strutTypes: struts,
      materialLabel: 'test stock',
    });
    expect(unique).not.toBeNull();
    expect(production).not.toBeNull();
    expect(unique!.filename).toContain('unique');
    expect(production!.filename).toContain('production');
    expect(production!.blob.size).toBeGreaterThan(unique!.blob.size);
    const uniqueText = await unique!.blob.text();
    expect(uniqueText).toContain('metadata/export-manifest.json');
    expect(uniqueText).toContain('metadata/design.json');
    expect(uniqueText).toContain('tables/strut_lengths.csv');
    expect(uniqueText).toContain('README.txt');
  });
});

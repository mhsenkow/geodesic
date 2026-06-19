import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { meshVolumeMm3, estimateMaterial } from '../../src/guides/material';
import { genSphere, truncDome, classHubs, computeStrutTypes } from '../../src/geodesic/math';
import { DEFAULT_SETTINGS, DOME_RADIUS } from '../../src/types';
import type { AppSettings, HubParams } from '../../src/types';

describe('mesh volume', () => {
  it('computes the volume of a unit-ish box', () => {
    const box = new THREE.BoxGeometry(10, 10, 10); // 1000 mm³
    expect(meshVolumeMm3(box)).toBeCloseTo(1000, 1);
  });

  it('approximates a sphere volume', () => {
    const sphere = new THREE.SphereGeometry(5, 64, 48); // (4/3)π·125 ≈ 523.6
    expect(meshVolumeMm3(sphere)).toBeGreaterThan(500);
    expect(meshVolumeMm3(sphere)).toBeLessThan(530);
  });
});

describe('material estimate', () => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    matType: 'round',
    diam: 3,
    stockLength: 2.4,
    stockWastePct: 10,
    stockPrice: 6,
    filamentDensity: 1.24,
    filamentPrice: 25,
  };
  const hubParams: HubParams = {
    matType: 'round',
    rodD: 26.7,
    lumW: 19,
    lumH: 38,
    tol: 0.3,
    wall: 5,
    bodyScale: 1.6,
    chamfer: 2,
    detail: 32,
    printFoot: true,
    footMargin: 6,
    screwHoles: true,
    screwDia: 4.2,
    junctionMeet: 1,
    baseThickness: 4,
    baseScale: 1.35,
    socketDepth: 0.9,
    surfaceSmooth: 0.6,
    subdConnectionLength: 0,
    subdStrutSize: 1,
    hubStyle: 'organic',
  };

  it('produces a coherent estimate for a small dome', () => {
    const sp = genSphere(1, DOME_RADIUS);
    const dome = truncDome(sp, 0.5, DOME_RADIUS, true, false, 2, settings.diam);
    const hubs = classHubs(dome);
    const struts = computeStrutTypes(dome, settings.diam);

    const est = estimateMaterial(dome, hubs, struts, hubParams, settings);

    // Linear stock
    expect(est.totalStrutLengthM).toBeGreaterThan(0);
    expect(est.strutCount).toBe(dome.edges.length);
    expect(est.sticksNeeded).toBeGreaterThanOrEqual(1);
    expect(est.stockCost).toBeCloseTo(est.sticksNeeded * settings.stockPrice, 5);

    // Print material
    expect(est.hubCount).toBe(dome.verts.length);
    expect(est.printVolumeCm3).toBeGreaterThan(0);
    // Infill-adjusted filament is less than the solid volume but proportional to it.
    expect(est.filamentVolumeCm3).toBeGreaterThan(0);
    expect(est.filamentVolumeCm3).toBeLessThan(est.printVolumeCm3);
    expect(est.printMassG).toBeCloseTo(est.filamentVolumeCm3 * settings.filamentDensity, 3);
    expect(est.filamentLengthM).toBeGreaterThan(0);

    // Combined
    expect(est.totalCost).toBeCloseTo(est.stockCost + est.printCost, 5);
  });

  it('more material costs more', () => {
    const sp = genSphere(2, DOME_RADIUS);
    const dome = truncDome(sp, 0.625, DOME_RADIUS, true, false, 2, settings.diam);
    const hubs = classHubs(dome);
    const struts = computeStrutTypes(dome, settings.diam);

    const cheap = estimateMaterial(dome, hubs, struts, hubParams, { ...settings, filamentPrice: 20 });
    const pricey = estimateMaterial(dome, hubs, struts, hubParams, { ...settings, filamentPrice: 40 });
    expect(pricey.printCost).toBeGreaterThan(cheap.printCost);
  });
});

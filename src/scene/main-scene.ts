import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AppSettings, DomeData, HubParams, HubType } from '../types';
import { HUB_COLORS } from '../types';
import { disposeObject, previewHubScale } from '../geometry/hub-geometry';
import { buildHubInstance, noteHubParamsFingerprint } from '../geometry/hub-prototype';

export class MainScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly domeGroup = new THREE.Group();

  private autoRot = true;
  private arTimer: ReturnType<typeof setTimeout> | null = null;
  markerMeshes: THREE.Object3D[] = [];

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x060a14);
    this.scene.fog = new THREE.Fog(0x060a14, 30, 60);
    this.camera.position.set(4, 6, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 40;
    this.controls.target.set(0, 2, 0);

    this.scene.add(new THREE.HemisphereLight(0x4466aa, 0x112244, 0.7));
    const dl1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dl1.position.set(8, 15, 10);
    this.scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0x7788cc, 0.5);
    dl2.position.set(-6, 5, -8);
    this.scene.add(dl2);
    this.scene.add(new THREE.AmbientLight(0x223344, 0.4));
    this.scene.add(new THREE.GridHelper(20, 20, 0x1a2240, 0x111830));
    this.scene.add(this.domeGroup);

    this.controls.addEventListener('start', () => {
      this.autoRot = false;
      if (this.arTimer) clearTimeout(this.arTimer);
    });
    this.controls.addEventListener('end', () => {
      this.arTimer = setTimeout(() => {
        this.autoRot = true;
      }, 4000);
    });
  }

  buildDomeVisual(
    dome: DomeData,
    hubTypes: HubType[],
    settings: AppSettings,
    hubParams: HubParams
  ): void {
    while (this.domeGroup.children.length) {
      const c = this.domeGroup.children[0];
      this.domeGroup.remove(c);
      disposeObject(c);
    }
    this.markerMeshes = [];

    if (settings.showWire) {
      const lineGeo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      for (const [a, b] of dome.edges) {
        pts.push(new THREE.Vector3(...(dome.verts[a] as [number, number, number])));
        pts.push(new THREE.Vector3(...(dome.verts[b] as [number, number, number])));
      }
      lineGeo.setFromPoints(pts);
      this.domeGroup.add(
        new THREE.LineSegments(
          lineGeo,
          new THREE.LineBasicMaterial({ color: 0x335577, transparent: true, opacity: 0.6 })
        )
      );
    }

    if (settings.showMarkers && !settings.showHubs) {
      const mg = new THREE.SphereGeometry(0.12, 12, 12);
      for (let i = 0; i < dome.verts.length; i++) {
        const val = dome.adj[i].length;
        const col = HUB_COLORS[val] || 0xffffff;
        const m = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }));
        m.position.set(...(dome.verts[i] as [number, number, number]));
        m.userData.vidx = i;
        this.domeGroup.add(m);
        this.markerMeshes.push(m);
      }
    }

    if (settings.showHubs) {
      noteHubParamsFingerprint(hubParams);
      const quality = settings.previewQuality ?? 'balanced';
      const detailCap = quality === 'fast' ? 24 : quality === 'full' ? hubParams.detail : Math.min(hubParams.detail, 36);
      const hp: HubParams = {
        ...hubParams,
        detail: detailCap,
        domePreview: true,
        printFrame: false,
        printFoot: false,
        embossLabels: false,
        alignmentNotches: false,
      };
      const hvs = previewHubScale(hp);
      const maxHubs = quality === 'fast' ? 60 : quality === 'balanced' ? 150 : 400;
      const rendered = new Set<number>();
      for (const ht of hubTypes) {
        for (const vi of ht.verts) {
          if (rendered.size >= maxHubs) break;
          let hg: THREE.BufferGeometry | null;
          try {
            hg = buildHubInstance(ht, dome, vi, hp, hvs);
          } catch {
            continue;
          }
          if (!hg) continue;
          const mesh = new THREE.Mesh(
            hg,
            new THREE.MeshStandardMaterial({ color: ht.color, metalness: 0.7, roughness: 0.25 })
          );
          mesh.position.set(...(dome.verts[vi] as [number, number, number]));
          mesh.userData.vidx = vi;
          this.domeGroup.add(mesh);
          rendered.add(vi);
          this.markerMeshes.push(mesh);
        }
      }
      if (rendered.size < dome.verts.length && settings.showMarkers) {
        const mg = new THREE.SphereGeometry(0.1, 8, 8);
        for (let i = 0; i < dome.verts.length; i++) {
          if (rendered.has(i)) continue;
          const val = dome.adj[i].length;
          const m = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: HUB_COLORS[val] || 0x888888 }));
          m.position.set(...(dome.verts[i] as [number, number, number]));
          m.userData.vidx = i;
          this.domeGroup.add(m);
          this.markerMeshes.push(m);
        }
      }
    }
  }

  resize(sidebarWidth: number): { width: number; height: number } {
    const w = window.innerWidth - sidebarWidth;
    const h = window.innerWidth > 768 ? window.innerHeight : window.innerHeight * 0.55;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    return { width: w, height: h };
  }

  render(): void {
    if (this.autoRot) this.domeGroup.rotation.y += 0.0015;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AppSettings, DomeData, HubParams, HubType } from '../types';
import {
  createBuildGuide,
  createHub,
  disposeObject,
} from '../geometry/hub-geometry';

export class InspectorScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 480 / 340, 0.01, 2000);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private inspMesh: THREE.Mesh | null = null;
  private inspWireMesh: THREE.Mesh | null = null;
  private inspBuildGuide: THREE.Group | null = null;
  private readonly inspMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    metalness: 0.8,
    roughness: 0.25,
  });
  private readonly inspWireMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x04060c);
    this.camera.position.set(0, 0, 150);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(480, 340);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 3.0;

    this.scene.add(new THREE.HemisphereLight(0x7799cc, 0x112244, 0.8));
    const idl1 = new THREE.DirectionalLight(0xffffff, 1.8);
    idl1.position.set(50, 80, 60);
    this.scene.add(idl1);
    const idl2 = new THREE.DirectionalLight(0x88aacc, 0.6);
    idl2.position.set(-40, 30, -50);
    this.scene.add(idl2);
    const ibl = new THREE.PointLight(0x00ffcc, 0.4, 500);
    ibl.position.set(0, -50, 0);
    this.scene.add(ibl);
    this.scene.add(new THREE.AmbientLight(0x445566, 0.5));
  }

  update(
    ht: HubType,
    dome: DomeData,
    settings: AppSettings,
    hubParams: HubParams
  ): THREE.BufferGeometry | null {
    this.clear();

    const hp: HubParams = { ...hubParams, printFrame: true };
    const geo = createHub(ht.verts[0], dome, hp);
    if (!geo) return null;

    if (settings.showBuildGuide) {
      this.inspBuildGuide = createBuildGuide(geo, hp);
      this.scene.add(this.inspBuildGuide);
    }

    const mat = this.inspMat.clone();
    mat.color.set(ht.color);
    mat.emissive.set(new THREE.Color(ht.color).multiplyScalar(0.1));
    this.inspMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.inspMesh);

    if (settings.hubWire) {
      this.inspWireMesh = new THREE.Mesh(geo.clone(), this.inspWireMat.clone());
      this.scene.add(this.inspWireMesh);
    }

    geo.computeBoundingSphere();
    const bs = geo.boundingSphere!;
    const dist = bs.radius * 3.5;
    this.camera.position.set(dist * 0.4, dist * 0.6, dist);
    this.controls.target.copy(bs.center);
    this.controls.update();

    return geo;
  }

  clear(): void {
    if (this.inspMesh) {
      this.scene.remove(this.inspMesh);
      disposeObject(this.inspMesh);
      this.inspMesh = null;
    }
    if (this.inspWireMesh) {
      this.scene.remove(this.inspWireMesh);
      disposeObject(this.inspWireMesh);
      this.inspWireMesh = null;
    }
    if (this.inspBuildGuide) {
      this.scene.remove(this.inspBuildGuide);
      disposeObject(this.inspBuildGuide);
      this.inspBuildGuide = null;
    }
  }

  resize(width: number): void {
    const h = Math.round(width * (340 / 480));
    this.renderer.setSize(width, h);
    this.camera.aspect = width / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export function computePairAngles(dirs: number[][]): number[] {
  const drs = dirs.map((d) => new THREE.Vector3(...(d as [number, number, number])));
  const angles: number[] = [];
  for (let j = 0; j < drs.length; j++) {
    for (let k = j + 1; k < drs.length; k++) {
      const ang = Math.acos(Math.max(-1, Math.min(1, drs[j].dot(drs[k])))) * (180 / Math.PI);
      angles.push(ang);
    }
  }
  return angles;
}

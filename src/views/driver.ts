import * as THREE from 'three';
import { PROJECTION_ORIGIN, project, roadLines, showRendererFailure, type LonLat, type RoadCollection, type TurnPreview, type VehicleSnapshot } from './types';

/** Real road centrelines, with explicitly approximate widths and generic flat surroundings. */
export class DriverView {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.15, 3_000);
  private routeMesh: THREE.Mesh | null = null;
  private turnMeshes: THREE.Mesh[] = [];
  private active = true;
  private lastSnapshot: VehicleSnapshot | null = null;
  private observer: ResizeObserver | null = null;
  private turnsKey = '';

  constructor(private container: HTMLElement, roads: RoadCollection, private origin: LonLat = PROJECTION_ORIGIN) {
    container.dataset.renderer = 'driver';
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor('#bdd9df');
      this.renderer.domElement.setAttribute('aria-label', 'Driver’s-eye view of the mapped Fremont road network');
      this.renderer.domElement.dataset.renderer = 'driver-canvas';
      this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
      container.append(this.renderer.domElement);
      this.scene.background = new THREE.Color('#bdd9df');
      this.scene.fog = new THREE.Fog('#bdd9df', 400, 1_850);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(50_000, 50_000), new THREE.MeshBasicMaterial({ color: '#c1cda6' }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.04;
      this.scene.add(ground);
      const lines = roadLines(roads);
      this.scene.add(this.ribbons(lines, 10.8, '#87928b', 0));
      this.scene.add(this.ribbons(lines, 9, '#505c60', 0.025));
      // A neutral centre guide shows the shared mapped path; it is not surveyed lane marking.
      this.scene.add(this.ribbons(lines, 0.11, '#a7b4b0', 0.03));
      this.addBonnet();
      this.resize();
      container.dataset.rendererReady = 'true';
      this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        showRendererFailure(container, 'Driver’s-eye view', 'WebGL context lost. Switch to overhead view or reload.');
      });
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
    } catch (error) {
      showRendererFailure(container, 'Driver’s-eye view', error);
    }
  }

  update(snapshot: VehicleSnapshot): void {
    this.lastSnapshot = snapshot;
    const [east, north] = project(snapshot.position, this.origin);
    // The simulation stays in geographic coordinates. Only rendering uses x=east, z=-north.
    this.camera.position.set(east, 1.55, -north);
    this.camera.lookAt(east + Math.sin(snapshot.heading) * 30, 1.55, -north - Math.cos(snapshot.heading) * 30);
    if (this.active && !this.container.hidden) this.renderer?.render(this.scene, this.camera);
  }

  setRoute(coordinates: LonLat[]): void {
    this.removeMesh(this.routeMesh);
    this.routeMesh = coordinates.length > 1 ? this.ribbons([coordinates], 0.8, '#4ee1ce', 0.07) : null;
    if (this.routeMesh) this.scene.add(this.routeMesh);
  }

  setTurns(turns: TurnPreview[]): void {
    const key = JSON.stringify(turns);
    if (key === this.turnsKey) return;
    this.turnsKey = key;
    this.turnMeshes.forEach((mesh) => this.removeMesh(mesh));
    this.turnMeshes = turns.filter((turn) => turn.coordinates.length > 1).map((turn) => this.ribbons([turn.coordinates], turn.selected ? 1.1 : 0.5, turn.selected ? '#ffc15f' : '#92beb0', 0.09));
    this.turnMeshes.forEach((mesh) => this.scene.add(mesh));
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      if (this.lastSnapshot) this.update(this.lastSnapshot);
    }
  }

  resize(): void {
    if (!this.active || this.container.hidden || !this.container.clientWidth || !this.container.clientHeight) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height, false);
    if (this.active && this.lastSnapshot) this.renderer?.render(this.scene, this.camera);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }

  private ribbons(lines: number[][][], width: number, color: string, height: number): THREE.Mesh {
    const vertices: number[] = [];
    const half = width / 2;
    for (const line of lines) {
      for (let index = 1; index < line.length; index++) {
        const a = project(line[index - 1] as LonLat, this.origin);
        const b = project(line[index] as LonLat, this.origin);
        const dx = b[0] - a[0];
        const dz = -(b[1] - a[1]);
        const length = Math.hypot(dx, dz);
        if (length < 0.001) continue;
        const nx = -dz / length * half;
        const nz = dx / length * half;
        const az = -a[1];
        const bz = -b[1];
        vertices.push(
          a[0] + nx, height, az + nz, b[0] + nx, height, bz + nz, a[0] - nx, height, az - nz,
          b[0] + nx, height, bz + nz, b[0] - nx, height, bz - nz, a[0] - nx, height, az - nz,
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  }

  private removeMesh(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material.dispose());
  }

  private addBonnet(): void {
    // Generic vehicle body is attached to the camera, never to simulation state.
    const bonnet = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.15, 1.4), new THREE.MeshBasicMaterial({ color: '#163c43' }));
    bonnet.position.set(0, -0.88, -1.1);
    this.camera.add(bonnet);
    this.scene.add(this.camera);
  }
}

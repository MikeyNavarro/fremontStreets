import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, LineString } from 'geojson';
import { showRendererFailure, type LonLat, type RoadCollection, type TurnPreview, type VehicleSnapshot } from './types';

const emptyLines = (): FeatureCollection<LineString> => ({ type: 'FeatureCollection', features: [] });

/** North-up local vector map. All roads and route overlays come from the bundled extract. */
export class OverheadView {
  private map: LibreMap | null = null;
  private marker: Marker | null = null;
  private labels: Marker[] = [];
  private loaded = false;
  private active = true;
  private lastFollow = 0;
  private lastLabelRefresh = 0;
  private lastSnapshot: VehicleSnapshot | null = null;
  private route = emptyLines();
  private turns = emptyLines();
  private roads: RoadCollection;
  private observer: ResizeObserver | null = null;
  private turnsKey = '';

  constructor(private container: HTMLElement, roads: RoadCollection, bounds?: [LonLat, LonLat]) {
    this.roads = roads;
    container.dataset.renderer = 'overhead';
    try {
      // MapLibre 6 ships its worker as a separate ESM asset. Vite's dependency
      // prebundle changes import.meta.url, so resolve that asset explicitly for
      // both development and built deployments instead of using a relative URL.
      maplibregl.setWorkerUrl(mapWorkerUrl);
      this.map = new maplibregl.Map({
        container,
        center: [-121.9886, 37.5485],
        zoom: 16.5,
        minZoom: 12,
        maxZoom: 20,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            roads: { type: 'geojson', data: roads, attribution: '© OpenStreetMap contributors · ODbL' },
            route: { type: 'geojson', data: this.route },
            turns: { type: 'geojson', data: this.turns },
          },
          layers: [
            { id: 'ground', type: 'background', paint: { 'background-color': '#dce6d7' } },
            { id: 'road-casing', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#a6b4a4', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.2, 16, 12, 20, 58] } },
            { id: 'roads', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'highway'], ['primary', 'secondary', 'trunk', 'motorway'], '#f4d8a1', '#fcfcf4'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 9, 20, 51] } },
            { id: 'route-border', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#075b64', 'line-width': 9, 'line-opacity': 0.85 } },
            { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#42d9d0', 'line-width': 5, 'line-opacity': 0.95 } },
            { id: 'turns', type: 'line', source: 'turns', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['boolean', ['get', 'selected'], false], '#e88828', '#58766a'], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 8, 4], 'line-opacity': 0.95 } },
          ],
        },
      });
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      // Keep the useful street-learning scale when driving. Fitting the entire
      // extract here would hide local street labels; zoom-out remains available.
      const car = document.createElement('div');
      car.className = 'vehicle-map-marker';
      car.setAttribute('aria-label', 'Your vehicle');
      car.style.cssText = 'width:38px;height:44px;filter:drop-shadow(0 3px 5px #102f4560);';
      car.innerHTML = '<svg width="38" height="44" viewBox="0 0 38 44" xmlns="http://www.w3.org/2000/svg"><path d="M19 2 35 37 19 30 3 37Z" fill="#063f4a" stroke="#fff" stroke-width="3"/><path d="m19 9 8 20-8-4-8 4Z" fill="#61efdc"/></svg>';
      this.marker = new maplibregl.Marker({ element: car, rotationAlignment: 'map' }).setLngLat([-121.9886, 37.5485]).addTo(this.map);
      this.map.on('load', () => {
        this.loaded = true;
        container.dataset.rendererReady = 'true';
        this.syncOverlays();
        this.refreshLabels();
      });
      this.map.on('moveend', () => this.refreshLabels());
      this.map.on('zoomend', () => this.refreshLabels());
      this.map.on('error', (event) => {
        container.dataset.rendererError = String(event.error);
      });
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
    } catch (error) {
      showRendererFailure(container, 'Overhead map', error);
    }
  }

  update(snapshot: VehicleSnapshot): void {
    this.lastSnapshot = snapshot;
    this.marker?.setLngLat(snapshot.position).setRotation(snapshot.heading * 180 / Math.PI);
    const now = performance.now();
    if (this.active && !this.container.hidden && this.map && now - this.lastFollow > 80) {
      this.map.jumpTo({ center: snapshot.position });
      this.lastFollow = now;
    }
  }

  setRoute(coordinates: LonLat[]): void {
    this.route = {
      type: 'FeatureCollection',
      features: coordinates.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [],
    };
    this.syncOverlays();
  }

  setTurns(turns: TurnPreview[]): void {
    const key = JSON.stringify(turns);
    if (key === this.turnsKey) return;
    this.turnsKey = key;
    this.turns = {
      type: 'FeatureCollection',
      features: turns.filter((turn) => turn.coordinates.length > 1).map((turn) => ({ type: 'Feature', properties: { selected: !!turn.selected }, geometry: { type: 'LineString', coordinates: turn.coordinates } })),
    };
    this.syncOverlays();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      this.syncOverlays();
      if (this.lastSnapshot) this.update(this.lastSnapshot);
    }
  }

  resize(): void {
    if (this.active && !this.container.hidden && this.container.clientWidth && this.container.clientHeight) this.map?.resize();
  }

  dispose(): void {
    this.observer?.disconnect();
    this.labels.forEach((label) => label.remove());
    this.marker?.remove();
    this.map?.remove();
    this.map = null;
  }

  private syncOverlays(): void {
    if (!this.map || !this.loaded || !this.active || this.container.hidden) return;
    (this.map.getSource('route') as GeoJSONSource | undefined)?.setData(this.route);
    (this.map.getSource('turns') as GeoJSONSource | undefined)?.setData(this.turns);
  }

  private refreshLabels(): void {
    if (!this.map || !this.loaded || !this.active) return;
    const now = performance.now();
    // Markers already track map movement. Refresh only the visible label selection,
    // rather than rebuilding DOM labels on every vehicle follow frame.
    if (now - this.lastLabelRefresh < 1_000 && this.labels.length) return;
    this.lastLabelRefresh = now;
    this.labels.forEach((label) => label.remove());
    this.labels = [];
    if (this.map.getZoom() < 14.1) return;
    const bounds = this.map.getBounds();
    const seen = new Set<string>();
    const points: { point: maplibregl.Point; name: string }[] = [];
    for (const feature of this.roads.features) {
      const name = feature.properties?.name;
      if (typeof name !== 'string' || seen.has(name)) continue;
      const lines = feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [feature.geometry.coordinates];
      for (const line of lines) {
        if (line.length < 2) continue;
        const coordinate = line[Math.floor(line.length / 2)] as LonLat;
        if (!bounds.contains(coordinate)) continue;
        const point = this.map.project(coordinate);
        if (points.some((item) => Math.abs(item.point.x - point.x) < 116 && Math.abs(item.point.y - point.y) < 33)) continue;
        const element = document.createElement('span');
        element.className = 'map-street-label';
        element.textContent = name;
        element.style.cssText = 'font:600 10px/1.2 system-ui,sans-serif;color:#435e54;text-shadow:0 1px 2px #fff,1px 0 2px #fff,-1px 0 2px #fff;white-space:nowrap;pointer-events:none;letter-spacing:.02em;';
        this.labels.push(new maplibregl.Marker({ element }).setLngLat(coordinate).addTo(this.map));
        points.push({ point, name });
        seen.add(name);
        break;
      }
      if (this.labels.length >= 65) break;
    }
  }
}

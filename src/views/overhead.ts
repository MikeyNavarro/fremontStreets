import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { showRendererFailure, type BoundaryGeometry, type BoundaryCollection, type LonLat, type RoadCollection, type TurnPreview, type VehicleSnapshot } from './types';

const emptyLines = (): FeatureCollection<LineString> => ({ type: 'FeatureCollection', features: [] });

/** North-up local vector map. All roads and route overlays come from the bundled extract. */
export class OverheadView {
  private map: LibreMap | null = null;
  private marker: Marker | null = null;
  private labels: Marker[] = [];
  private loaded = false;
  private active = true;
  private lastFollow = 0;
  private headingUp=false;
  private preferredZoom=16.5;
  private readonly reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastLabelRefresh = 0;
  private lastSnapshot: VehicleSnapshot | null = null;
  private route = emptyLines();
  private turns = emptyLines();
  private roads: RoadCollection;
  private observer: ResizeObserver | null = null;
  private turnsKey = '';
  private boundaries: BoundaryCollection = { type: 'FeatureCollection', features: [] };
  private classifiedRoads = emptyLines();
  private followVehicle = true;
  private vertexMarkers: Marker[] = [];
  private stopVertexEditing: (() => void) | null = null;
  private studyRoads = emptyLines();
  private studyJunctions: FeatureCollection<Point> = {type:'FeatureCollection',features:[]};
  private studyNames: Set<string> | null = null;
  private stationMarker: Marker | null = null;
  private destinationMarker: Marker | null = null;

  constructor(private container: HTMLElement, roads: RoadCollection, bounds?: [LonLat, LonLat]) {
    const rank:Record<string,number>={primary:0,motorway:1,trunk:1,secondary:2,tertiary:3,residential:4};
    this.roads={...roads,features:[...roads.features].sort((a,b)=>(rank[String(a.properties?.highway)]??5)-(rank[String(b.properties?.highway)]??5))};
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
        minZoom: 10,
        maxZoom: 20,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            roads: { type: 'geojson', data: roads, attribution: '© OpenStreetMap contributors · ODbL' },
            route: { type: 'geojson', data: this.route },
            turns: { type: 'geojson', data: this.turns },
            'study-zones': { type: 'geojson', data: this.boundaries },
            'classified-roads': { type: 'geojson', data: this.classifiedRoads },
            'study-targets': { type: 'geojson', data: this.studyRoads },
            'study-intersections': { type: 'geojson', data: this.studyJunctions },
          },
          layers: [
            { id: 'ground', type: 'background', paint: { 'background-color': '#101f29' } },
            { id: 'study-zone-fill', type: 'fill', source: 'study-zones', paint: { 'fill-color': ['coalesce', ['get', 'color'], ['match', ['get', 'id'], 'zone1', '#5b8cff', 'zone2', '#ef86b5', 'zone3', '#f7a35c', '#899e92']], 'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.045, 0.02] } },
            { id: 'road-casing', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#304957', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['match',['get','highway'],['motorway','trunk','primary'],3,1.2], 16, ['match',['get','highway'],['motorway','trunk'],11,['primary','secondary'],9,['tertiary'],7,['service','living_street'],3.5,5], 20, ['match',['get','highway'],['motorway','trunk','primary'],46,23]] } },
            { id: 'roads', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'highway'], ['motorway','trunk'], '#87929e', ['primary'], '#72868f', ['secondary','tertiary'], '#4b6676', ['service','living_street'],'#20333e', '#2d4656'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['match',['get','highway'],['motorway','trunk','primary'],1.8,.6], 16, ['match',['get','highway'],['motorway','trunk'],8.5,['primary','secondary'],6.5,['tertiary'],4.5,['service','living_street'],2,3], 20, ['match',['get','highway'],['motorway','trunk','primary'],40,18]] } },
            { id:'study-target-lines',type:'line',source:'study-targets',paint:{'line-color':['case',['boolean',['get','selected'],false],'#8becce',['match',['get','group'],'ew','#6aabd0','#c8a27f']],'line-width':['interpolate',['linear'],['zoom'],11,2,16,5,20,18],'line-opacity':.95} },
            { id:'study-intersection-points',type:'circle',source:'study-intersections',paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,2,16,6],'circle-color':'#cfb486','circle-stroke-color':'#182e3a','circle-stroke-width':1.5} },
            { id: 'study-zone-border', type: 'line', source: 'study-zones', paint: { 'line-color': ['coalesce', ['get', 'color'], ['match', ['get', 'id'], 'zone1', '#5b8cff', 'zone2', '#ef86b5', 'zone3', '#f7a35c', '#60796b']], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 2, 1], 'line-dasharray': [3, 2] } },
            { id: 'classified-roads', type: 'line', source: 'classified-roads', filter: ['!=', ['get', 'uncertain'], true], paint: { 'line-color': ['coalesce', ['get', 'color'], ['match', ['get', 'zoneId'], 'zone1', '#5b8cff', 'zone2', '#ef86b5', 'zone3', '#f7a35c', '#597766']], 'line-width': 4 } },
            { id: 'uncertain-roads', type: 'line', source: 'classified-roads', filter: ['==', ['get', 'uncertain'], true], paint: { 'line-color': '#3b4442', 'line-width': 5, 'line-dasharray': [1, 1] } },
            { id:'route-glow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#60dfc4','line-width':18,'line-opacity':.12} },
            { id: 'route-border', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#173d41', 'line-width': 9, 'line-opacity': 0.85 } },
            { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#74e0c4', 'line-width': 5, 'line-opacity': 0.95 } },
            { id: 'turns', type: 'line', source: 'turns', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['boolean', ['get', 'selected'], false], '#e6bb80', '#668b98'], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 8, 4], 'line-opacity': 0.95 } },
          ],
        },
      });
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      // Keep the useful street-learning scale when driving. Fitting the entire
      // extract here would hide local street labels; zoom-out remains available.
      const car = document.createElement('div');
      car.className = 'vehicle-map-marker';
      car.setAttribute('aria-label', 'Your vehicle');
      car.style.cssText = 'width:44px;height:48px;filter:drop-shadow(0 4px 7px #0007);';
      car.innerHTML = '<svg width="44" height="48" viewBox="0 0 44 48" xmlns="http://www.w3.org/2000/svg"><circle cx="22" cy="25" r="19" fill="#64e7ce" fill-opacity=".13" stroke="#8cead8" stroke-opacity=".4"/><path d="M22 6 36 38 22 31 8 38Z" fill="#9ff3df" stroke="#102c35" stroke-width="2.5"/><path d="m22 14 6 15-6-3-6 3Z" fill="#1b5b56"/></svg>';
      this.marker = new maplibregl.Marker({ element: car, rotationAlignment: 'map' }).setLngLat([-121.9886, 37.5485]).addTo(this.map);
      this.map.on('load', () => {
        this.loaded = true;
        container.dataset.rendererReady = 'true';
        this.syncOverlays();
        this.syncStudy();
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
    if (this.followVehicle && this.active && !this.container.hidden && this.map && now - this.lastFollow > 80) {
      const heading=this.headingUp?snapshot.heading*180/Math.PI:0;
      const current=this.map.getBearing(),delta=((heading-current+540)%360)-180;
      if(this.reducedMotion)this.map.jumpTo({center:snapshot.position,bearing:current+delta});
      else this.map.easeTo({center:snapshot.position,bearing:current+delta,duration:110,easing:t=>t});
      this.lastFollow = now;
    }
  }

  setRoute(coordinates: LonLat[]): void {
    this.route = {
      type: 'FeatureCollection',
      features: coordinates.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [],
    };
    this.syncSource('route',this.route);
  }

  setTurns(turns: TurnPreview[]): void {
    const key = JSON.stringify(turns);
    if (key === this.turnsKey) return;
    this.turnsKey = key;
    this.turns = {
      type: 'FeatureCollection',
      features: turns.filter((turn) => turn.coordinates.length > 1).map((turn) => ({ type: 'Feature', properties: { selected: !!turn.selected }, geometry: { type: 'LineString', coordinates: turn.coordinates } })),
    };
    this.syncSource('turns',this.turns);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      this.syncOverlays();
      if (this.lastSnapshot) this.update(this.lastSnapshot);
    }
  }

  /** Display sourced study polygons without changing the road graph or vehicle. */
  setBoundaries(collection: BoundaryCollection, selectedZoneId?: string, showAll = false): void {
    this.boundaries = {
      type: 'FeatureCollection',
      features: collection.features
        .filter((feature) => showAll || !selectedZoneId || feature.properties?.id === selectedZoneId)
        .map((feature) => ({ ...feature, properties: { ...feature.properties, selected: feature.properties?.id === selectedZoneId } })),
    };
    this.syncSource('study-zones',this.boundaries);
  }

  setFollowVehicle(enabled: boolean): void {
    if (enabled && !this.followVehicle && this.map && this.lastSnapshot) {
      this.map.jumpTo({ center: this.lastSnapshot.position, zoom: this.preferredZoom });
    }
    this.followVehicle = enabled;
  }

  setStation(position: LonLat): void {
    if(!this.map)return;
    const element=document.createElement('div');element.className='station-map-label';element.textContent='Police headquarters';element.setAttribute('aria-label','Fremont Police Headquarters building reference');
    this.stationMarker?.remove();this.stationMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat(position).addTo(this.map);
  }

  setStudyOverlay(roads: FeatureCollection<LineString>, junctions: FeatureCollection<Point>, names: string[] | null): void {
    this.studyRoads=roads;this.studyJunctions=junctions;this.studyNames=names?new Set(names):null;this.syncStudy();this.lastLabelRefresh=0;this.refreshLabels();
  }

  private syncStudy(): void {
    if(!this.loaded||!this.map)return;
    (this.map.getSource('study-targets') as GeoJSONSource)?.setData(this.studyRoads);
    (this.map.getSource('study-intersections') as GeoJSONSource)?.setData(this.studyJunctions);
    this.map.setPaintProperty('roads','line-opacity',this.studyNames?.size ? .62 : 1);
    this.map.setPaintProperty('road-casing','line-opacity',this.studyNames?.size ? .6 : 1);
    this.container.dataset.studyTargetCount=String(this.studyRoads.features.length);
    this.container.dataset.studyIntersectionCount=String(this.studyJunctions.features.length);
  }

  focusPosition(position: LonLat, label?: string): void {
    if(!this.map)return;this.followVehicle=false;this.map.stop();this.map.jumpTo({center:position,zoom:this.preferredZoom});
    this.destinationMarker?.remove();this.destinationMarker=null;
    if(label){const element=document.createElement('div');element.className='destination-map-label';element.textContent=label;this.destinationMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat(position).addTo(this.map);}
  }

  clearStudyDestination(): void { this.destinationMarker?.remove();this.destinationMarker=null; }

  /** Diagnostics are derived from the MapLibre style/source, never a UI mirror. */
  getZoneDiagnostics() {
    const style = this.map?.getStyle();
    const source = style?.sources['study-zones'];
    const sourceData = source?.type === 'geojson' && typeof source.data !== 'string' ? structuredClone(source.data) : null;
    const fill = style?.layers.find((layer) => layer.id === 'study-zone-fill');
    const border = style?.layers.find((layer) => layer.id === 'study-zone-border');
    const rendered = this.loaded && this.map ? this.map.queryRenderedFeatures(undefined, { layers: ['study-zone-fill'] }) : [];
    return {
      loaded: this.loaded,
      sourceData,
      fillLayer: fill ? structuredClone(fill) : null,
      borderLayer: border ? structuredClone(border) : null,
      renderedZoneIds: [...new Set(rendered.map((feature) => feature.properties.id))],
      vertexHandleCount: this.vertexMarkers.length,
    };
  }

  focusBoundary(geometry: BoundaryGeometry): void {
    const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
    if (!coordinates.length || !this.map) return;
    const bounds = new maplibregl.LngLatBounds();
    coordinates.forEach((point) => bounds.extend(point as LonLat));
    this.map.fitBounds(bounds, { padding: 55, duration: this.reducedMotion?0:250, maxZoom: 16.5 });
  }

  setClassifiedRoads(collection: FeatureCollection<LineString>): void {
    this.classifiedRoads = collection;
    this.syncSource('classified-roads',this.classifiedRoads);
  }

  /** Draggable vertices stay encapsulated here; a validator must accept each drop.
   * Invalid candidates never update the displayed polygon or the saved document.
   */
  beginBoundaryEdit(geometry: BoundaryGeometry, onChange: (candidate: BoundaryGeometry) => boolean, zoneId?: string): () => void {
    this.stopVertexEditing?.();
    if (!this.map) return () => {};
    const map = this.map;
    const initial = structuredClone(geometry);
    const polygons = initial.type === 'Polygon' ? [initial.coordinates] : initial.coordinates;
    const drawHandles = () => {
      this.clearVertexMarkers();
      const cells = new Set<string>();
      const width = this.container.clientWidth, height = this.container.clientHeight;
      polygons.forEach((polygon, polygonIndex) => polygon.forEach((ring, ringIndex) => {
      ring.slice(0, -1).forEach((coordinate, index) => {
        const point = map.project(coordinate as LonLat);
        if (point.x < -16 || point.y < -16 || point.x > width + 16 || point.y > height + 16) return;
        // This thins only overlapping screen handles, never source geometry.
        // Zooming/panning reveals more handles; every vertex stays available
        // in the editor's precise numeric selector at every zoom level.
        const cell = `${Math.floor(point.x / 16)}:${Math.floor(point.y / 16)}`;
        if (cells.has(cell) || this.vertexMarkers.length >= 600) return;
        cells.add(cell);
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'zone-vertex-handle';
        element.dataset.testid = 'zone-vertex';
        element.dataset.zoneId = zoneId ?? '';
        element.dataset.vertexIndex = String(index);
        element.dataset.ringIndex = String(ringIndex);
        element.dataset.polygonIndex = String(polygonIndex);
        element.title = `Drag boundary vertex ${index + 1}`;
        element.setAttribute('aria-label', `Boundary vertex ${index + 1}`);
        element.style.cssText = 'width:14px;height:14px;min-width:14px;padding:0;border:2px solid #fff;border-radius:50%;background:#264b48;box-shadow:0 0 0 2px #294a46;cursor:grab;';
        const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(coordinate as LonLat).addTo(map);
        marker.on('dragend', () => {
          const candidate = structuredClone(initial);
          const target = candidate.type === 'Polygon' ? candidate.coordinates : candidate.coordinates[polygonIndex];
          const point = marker.getLngLat();
          target[ringIndex][index] = [point.lng, point.lat];
          if (index === 0) target[ringIndex][target[ringIndex].length - 1] = [point.lng, point.lat];
          if (!onChange(candidate)) marker.setLngLat(coordinate as LonLat);
        });
        this.vertexMarkers.push(marker);
      });
      }));
    };
    drawHandles();
    map.on('moveend', drawHandles);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      map.off('moveend', drawHandles);
      this.clearVertexMarkers();
      if (this.stopVertexEditing === stop) this.stopVertexEditing = null;
    };
    this.stopVertexEditing = stop;
    return stop;
  }

  setHeadingUp(enabled:boolean):void {this.headingUp=enabled;if(this.map)this.map.jumpTo({bearing:enabled&&this.lastSnapshot?this.lastSnapshot.heading*180/Math.PI:0});}
  setZoom(zoom:number):void {this.preferredZoom=Math.max(10,Math.min(20,zoom));this.map?.jumpTo({zoom:this.preferredZoom});}
  setQuality(quality:'low'|'balanced'|'high'):void {this.map?.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='low'?.65:quality==='balanced'?1.25:2));}
  presentation(){return {headingUp:this.headingUp,zoom:this.map?.getZoom(),bearing:this.map?.getBearing(),followVehicle:this.followVehicle,pixelRatio:this.map?.getPixelRatio(),width:this.container.clientWidth,height:this.container.clientHeight};}

  resize(): void {
    if (this.active && !this.container.hidden && this.container.clientWidth && this.container.clientHeight) this.map?.resize();
  }

  dispose(): void {
    this.observer?.disconnect();
    this.stopVertexEditing?.();
    this.clearVertexMarkers();
    this.labels.forEach((label) => label.remove());
    this.marker?.remove();
    this.map?.remove();
    this.map = null;
  }

  private syncSource(name:string,data:FeatureCollection):void {if(this.map&&this.loaded&&this.active&&!this.container.hidden)(this.map.getSource(name) as GeoJSONSource)?.setData(data);}

  private syncOverlays(): void {
    if (!this.map || !this.loaded || !this.active || this.container.hidden) return;
    (this.map.getSource('route') as GeoJSONSource | undefined)?.setData(this.route);
    (this.map.getSource('turns') as GeoJSONSource | undefined)?.setData(this.turns);
    (this.map.getSource('study-zones') as GeoJSONSource | undefined)?.setData(this.boundaries);
    (this.map.getSource('classified-roads') as GeoJSONSource | undefined)?.setData(this.classifiedRoads);
  }

  private clearVertexMarkers(): void {
    this.vertexMarkers.forEach((marker) => marker.remove());
    this.vertexMarkers = [];
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
    if (this.map.getZoom() < 13.5) return;
    const bounds = this.map.getBounds();
    const seen = new Set<string>();
    const points: { point: maplibregl.Point; name: string }[] = [];
    for (const feature of this.roads.features) {
      const name = feature.properties?.name;
      if (typeof name !== 'string' || seen.has(name)) continue;
      if(this.studyNames&&!this.studyNames.has(name))continue;
      const lines = feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [feature.geometry.coordinates];
      for (const line of lines) {
        if (line.length < 2) continue;
        const coordinate = line[Math.floor(line.length / 2)] as LonLat;
        if (!bounds.contains(coordinate)) continue;
        const point = this.map.project(coordinate);
        const car=this.lastSnapshot?this.map.project(this.lastSnapshot.position):null;if(car&&Math.hypot(point.x-car.x,point.y-car.y)<55)continue;
        if(point.x<30||point.x>this.container.clientWidth-40||point.y<135||point.y>this.container.clientHeight-100)continue;
        if (points.some((item) => Math.abs(item.point.x - point.x) < 155 && Math.abs(item.point.y - point.y) < 42)) continue;
        const element = document.createElement('span');
        element.className = 'map-street-label';if(/^(primary|secondary|trunk|motorway)$/.test(String(feature.properties?.highway)))element.classList.add('major-label');
        element.textContent = name;
        element.style.cssText = '';
        this.labels.push(new maplibregl.Marker({ element }).setLngLat(coordinate).addTo(this.map));
        points.push({ point, name });
        seen.add(name);
        break;
      }
      if (this.labels.length >= 45) break;
    }
  }
}

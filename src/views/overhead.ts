import {RoadLabels} from './road-labels';
import {roadLabelLayers, ROAD_LABEL_SOURCE} from './road-label-style';
import type {PreparedRoadLabels} from './road-label-geometry';
import {CameraController} from './camera-controller';
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
  private roadLabels:RoadLabels|null=null;
  private loaded = false;
  private active = true;
  private lastFollow = 0;
  private headingUp=false;
  private preferredZoom=16.5;
  private readonly reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastSnapshot: VehicleSnapshot | null = null;
  private route = emptyLines();
  private turns = emptyLines();
  private readonly unavailableRoadCount:number;
  private observer: ResizeObserver | null = null;
  private turnsKey = '';
  private boundaries: BoundaryCollection = { type: 'FeatureCollection', features: [] };
  private classifiedRoads = emptyLines();
  private camera: CameraController | null = null;
  private labelsVisible=true;
  private assistanceHidden=false;
  private selection=emptyLines();
  onAmbiguousClick:(()=>void)|null=null;
  onRoadClick:((wayId:string,position:LonLat)=>void)|null=null;
  private vertexMarkers: Marker[] = [];
  private stopVertexEditing: (() => void) | null = null;
  private stopPointerInteraction:(()=>void)|null=null;
  private studyRoads = emptyLines();
  private studyJunctions: FeatureCollection<Point> = {type:'FeatureCollection',features:[]};
  private studyNames: Set<string> | null = null;
  private stationMarker: Marker | null = null;
  private destinationMarker: Marker | null = null;

  constructor(private container: HTMLElement, roads: RoadCollection, private labelData:PreparedRoadLabels) {
    this.unavailableRoadCount=roads.features.filter(feature=>feature.properties?.playable===false).length;
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
        // Arrow keys belong to the simulator; MapLibre keyboard panning would
        // otherwise move an Explore camera whenever the player accelerates.
        keyboard: false,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            // Native subpixel tessellation avoids quantized vertex zigzags
            // rejecting line-label anchors. This is the road layer's ordinary
            // renderer tolerance; all source and graph coordinates stay intact.
            [ROAD_LABEL_SOURCE]:{type:'geojson',data:labelData.collection,promoteId:'labelId',tolerance:0.375,buffer:128,maxzoom:18},
            roads: { type: 'geojson', data: roads, attribution: '© OpenStreetMap contributors · ODbL' },
            route: { type: 'geojson', data: this.route },
            turns: { type: 'geojson', data: this.turns },
            'study-zones': { type: 'geojson', data: this.boundaries },
            'classified-roads': { type: 'geojson', data: this.classifiedRoads },
            'inspection': {type:'geojson',data:this.selection},
            'qa-nodes':{type:'geojson',data:{type:'FeatureCollection',features:[]}},
            'study-targets': { type: 'geojson', data: this.studyRoads },
            'study-intersections': { type: 'geojson', data: this.studyJunctions },
          },
          layers: [
            { id: 'ground', type: 'background', paint: { 'background-color': '#101f29' } },
            { id: 'study-zone-fill', type: 'fill', source: 'study-zones', paint: { 'fill-color': ['coalesce', ['get', 'color'], ['match', ['get', 'id'], 'zone1', '#5b8cff', 'zone2', '#ef86b5', 'zone3', '#f7a35c', '#899e92']], 'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.045, 0.02] } },
            { id: 'road-casing', type: 'line', source: 'roads', filter: ['!=',['get','playable'],false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#304957', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['match',['get','highway'],['motorway','trunk','primary'],3,1.2], 16, ['match',['get','highway'],['motorway','trunk'],11,['primary','secondary'],9,['tertiary'],7,['service','living_street'],3.5,5], 20, ['match',['get','highway'],['motorway','trunk','primary'],46,23]] } },
            { id: 'roads', type: 'line', source: 'roads', filter: ['!=',['get','playable'],false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'highway'], ['motorway','trunk'], '#87929e', ['primary'], '#72868f', ['secondary','tertiary'], '#4b6676', ['service','living_street'],'#20333e', '#2d4656'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['match',['get','highway'],['motorway','trunk','primary'],1.8,.6], 16, ['match',['get','highway'],['motorway','trunk'],8.5,['primary','secondary'],6.5,['tertiary'],4.5,['service','living_street'],2,3], 20, ['match',['get','highway'],['motorway','trunk','primary'],40,18]] } },
            {id:'unavailable-roads',type:'line',source:'roads',filter:['==',['get','playable'],false],paint:{'line-color':'#ce9468','line-width':['interpolate',['linear'],['zoom'],12,1,16,3,20,10],'line-dasharray':[2,2],'line-opacity':.75}},
            { id:'study-target-lines',type:'line',source:'study-targets',paint:{'line-color':['case',['boolean',['get','selected'],false],'#b3d5ee',['match',['get','group'],'ew','#6aabd0','#c8a27f']],'line-width':['interpolate',['linear'],['zoom'],11,2,16,5,20,18],'line-opacity':.95} },
            { id:'study-intersection-points',type:'circle',source:'study-intersections',paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,2,16,6],'circle-color':'#cfb486','circle-stroke-color':'#182e3a','circle-stroke-width':1.5} },
            { id: 'study-zone-border', type: 'line', source: 'study-zones', paint: { 'line-color': ['coalesce', ['get', 'color'], ['match', ['get', 'id'], 'zone1', '#5b8cff', 'zone2', '#ef86b5', 'zone3', '#f7a35c', '#60796b']], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 2, 1], 'line-dasharray': [3, 2] } },
            { id: 'classified-roads', type: 'line', source: 'classified-roads', filter: ['!=', ['get', 'uncertain'], true], paint: { 'line-color': ['coalesce', ['get', 'color'], ['match', ['get', 'zoneId'], 'zone1', '#5b8cff', 'zone2', '#ef86b5', 'zone3', '#f7a35c', '#597766']], 'line-width': 4 } },
            { id: 'uncertain-roads', type: 'line', source: 'classified-roads', filter: ['==', ['get', 'uncertain'], true], paint: { 'line-color': '#3b4442', 'line-width': 5, 'line-dasharray': [1, 1] } },
            { id:'route-glow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#60dfc4','line-width':18,'line-opacity':.12} },
            { id: 'route-border', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#173d41', 'line-width': 9, 'line-opacity': 0.85 } },
            { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#74e0c4', 'line-width': 5, 'line-opacity': 0.95 } },
            {id:'qa-nodes',type:'circle',source:'qa-nodes',paint:{'circle-radius':4,'circle-color':'#f7b76a','circle-stroke-color':'#10212c','circle-stroke-width':1}},
            {id:'inspection-lines',type:'line',source:'inspection',paint:{'line-color':'#f4dc9d','line-width':7,'line-opacity':.95}},
            { id: 'turns', type: 'line', source: 'turns', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['boolean', ['get', 'selected'], false], '#e6bb80', '#668b98'], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 8, 4], 'line-opacity': 0.95 } },
            ...roadLabelLayers(),
          ],
        },
      });
      const map=this.map;
      this.roadLabels=new RoadLabels(map,labelData);
      // Apply pending quiz visibility before source tiles first become visible.
      map.on('style.load',()=>this.roadLabels?.loaded());
      this.camera=new CameraController({stop:()=>map.stop(),read:()=>({center:map.getCenter().toArray() as LonLat,zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()}),move:(pose,animate)=>{if(animate&&!this.reducedMotion)map.easeTo({...pose,duration:110,easing:t=>t});else map.jumpTo(pose);}},follow=>{this.container.dataset.cameraMode=follow?'Follow':'Explore';const status=document.getElementById('camera-mode');if(status)status.textContent=follow?'Follow vehicle':'Explore freely';const control=document.getElementById('map-follow') as HTMLInputElement|null;if(control)control.checked=follow;});
      this.container.dataset.cameraMode='Follow';
      // MapLibre easeTo stops gesture handlers. Hold follow updates from pointer
      // down, before dragstart exists, and stop animations without killing gestures.
      const canvas=map.getCanvasContainer(),pointers=new Set<number>();
      let wheelTimer:ReturnType<typeof setTimeout>|null=null;
      const finish=()=>{if(!pointers.size&&wheelTimer===null)this.camera?.endInteraction();};
      const down=(event:PointerEvent)=>{pointers.add(event.pointerId);this.camera?.beginInteraction();};
      const up=(event:PointerEvent)=>{pointers.delete(event.pointerId);finish();};
      // ScrollZoom delays the first wheel event to distinguish wheel/trackpad.
      // isZooming alone cannot protect that pending native gesture from easeTo.
      const wheel=()=>{this.camera?.beginInteraction();if(wheelTimer!==null)clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{wheelTimer=null;finish();},200);};
      const release=()=>{pointers.clear();if(wheelTimer!==null)clearTimeout(wheelTimer);wheelTimer=null;finish();};
      canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('wheel',wheel,{capture:true,passive:true});window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);window.addEventListener('blur',release);
      this.stopPointerInteraction=()=>{canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('wheel',wheel,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',release);release();};
      // Pointer-down already canceled the follow animation. Calling map.stop
      // here would also cancel the user's newly established native gesture.
      map.on('dragstart',()=>this.camera?.explore(false));
      map.on('rotatestart',event=>{if(event.originalEvent)this.camera?.explore(false);});
      map.on('pitchstart',event=>{if(event.originalEvent)this.camera?.explore(false);});
      map.on('click',event=>{if(!this.onRoadClick)return;
        const hits=map.queryRenderedFeatures([[event.point.x-6,event.point.y-6],[event.point.x+6,event.point.y+6]],{layers:['roads']}).map(hit=>{let distance=Infinity;const lines=hit.geometry.type==='LineString'?[hit.geometry.coordinates]:hit.geometry.type==='MultiLineString'?hit.geometry.coordinates:[];for(const line of lines)for(let i=1;i<line.length;i++){const a=map.project(line[i-1] as LonLat),b=map.project(line[i] as LonLat),dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((event.point.x-a.x)*dx+(event.point.y-a.y)*dy)/(dx*dx+dy*dy||1)));distance=Math.min(distance,Math.hypot(event.point.x-a.x-t*dx,event.point.y-a.y-t*dy));}return {hit,distance};}).sort((a,b)=>a.distance-b.distance);
        if(!hits.length)return;
        if(hits.some(other=>other.hit.properties.name!==hits[0].hit.properties.name&&other.distance-hits[0].distance<1.5)){this.onAmbiguousClick?.();return;}
        this.onRoadClick(String(hits[0].hit.properties.wayId),event.lngLat.toArray() as LonLat);
      });
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
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
      });
      this.map.on('error', (event) => {
        container.dataset.rendererError = String(event.error);
      });
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
      if(import.meta.env.DEV&&new URLSearchParams(location.search).get('labelDebug')==='1'){
        const debug={ready:()=>map.loaded()&&map.areTilesLoaded()&&!map.isMoving(),inspect:(box?:maplibregl.PointLike|[maplibregl.PointLike,maplibregl.PointLike])=>this.roadLabels?.inspect(box),source:(id:string)=>structuredClone(this.labelData.byId.get(id)??null),project:(position:LonLat)=>map.project(position),setView:(pose:{center?:LonLat;zoom?:number;bearing?:number;pitch?:number})=>{this.camera?.explore();map.jumpTo(pose);},stats:()=>({...this.labelData.diagnostics,...this.roadLabels?.presentation()})};
        Object.defineProperty(window,'__FREMONT_LABEL_DEBUG__',{value:debug,configurable:true});
      }
    } catch (error) {
      showRendererFailure(container, 'Overhead map', error);
    }
  }

  update(snapshot: VehicleSnapshot): void {
    this.lastSnapshot = snapshot;
    this.marker?.setLngLat(snapshot.position).setRotation(snapshot.heading * 180 / Math.PI);
    const now = performance.now();
    if (this.camera?.follow && this.active && !this.container.hidden && this.map && !this.map.isZooming() && now - this.lastFollow > 80) {
      const heading=this.headingUp?snapshot.heading*180/Math.PI:0;
      const current=this.map.getBearing(),delta=((heading-current+540)%360)-180;
      this.camera.update(snapshot.position,current+delta);
      this.lastFollow = now;
    }
  }

  setRoute(coordinates: LonLat[],wayIds:string[]=[]): void {
    // Guidance-off practice retains ordinary names without destination emphasis.
    this.roadLabels?.setRoute(wayIds);
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
    if(active===this.active)return;
    if(active)this.camera?.resume();else this.camera?.suspend();
    this.active = active;
    this.roadLabels?.setActive(active);
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

  /** Legacy callers can detach; only the dedicated center action restores follow. */
  setFollowVehicle(enabled: boolean): void {if(!enabled)this.camera?.explore();}
  centerOnVehicle(position:LonLat):void {this.camera?.centerOnVehicle(position);}
  isFollowing():boolean{return this.camera?.follow??true;}
  setLabelsVisible(visible:boolean):void {this.labelsVisible=visible;this.syncLabelVisibility();}
  setAssistanceHidden(hidden:boolean):void {this.assistanceHidden=hidden;this.container.classList.toggle('assistance-hidden',hidden);this.syncLabelVisibility();}
  private syncLabelVisibility(){this.roadLabels?.setVisible(this.labelsVisible&&!this.assistanceHidden);}
  setCurrentRoad(wayId:string):void{this.roadLabels?.setCurrentRoad(wayId);}
  getLabelDiagnostics(){return this.roadLabels?.inspect()??null;}
  setInspection(lines:FeatureCollection<LineString>):void {this.selection=lines;this.syncSource('inspection',lines);this.roadLabels?.setInspection(lines.features.map(f=>String(f.properties?.wayId??'')).filter(Boolean));}
  setQANodes(nodes:Array<{id:string;position:LonLat}>):void{this.syncSource('qa-nodes',{type:'FeatureCollection',features:nodes.map(n=>({type:'Feature',properties:{nodeId:n.id,status:'Unresolved'},geometry:{type:'Point',coordinates:n.position}}))});}
  focusRoad(coordinates:LonLat[]):void {if(!this.map||!coordinates.length)return;this.camera?.explore();const bounds=new maplibregl.LngLatBounds();coordinates.forEach(p=>bounds.extend(p));this.map.fitBounds(bounds,{padding:100,maxZoom:17,duration:this.reducedMotion?0:250});}

  setStation(position: LonLat): void {
    if(!this.map)return;
    const element=document.createElement('div');element.className='station-map-label';element.textContent='Police headquarters';element.setAttribute('aria-label','Fremont Police Headquarters building reference');
    this.stationMarker?.remove();this.stationMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat(position).addTo(this.map);
  }

  setStudyOverlay(roads: FeatureCollection<LineString>, junctions: FeatureCollection<Point>, names: string[] | null): void {
    this.studyRoads=roads;this.studyJunctions=junctions;this.studyNames=names?new Set(names):null;this.syncStudy();this.roadLabels?.setStudyRoads(roads.features.filter(f=>f.properties?.selected).map(f=>String(f.properties?.wayId??'')).filter(Boolean));
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

  markPosition(position:LonLat,label:string):void {this.destinationMarker?.remove();if(!this.map)return;const element=document.createElement('div');element.className='learning-reference-marker';element.textContent=label;this.destinationMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat(position).addTo(this.map);}
  focusPosition(position: LonLat, label?: string): void {
    if(!this.map)return;this.camera?.focus({center:position});
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
    this.camera?.explore();
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
  presentation(){return {headingUp:this.headingUp,zoom:this.map?.getZoom(),bearing:this.map?.getBearing(),followVehicle:this.camera?.follow??true,center:this.map?.getCenter().toArray(),pitch:this.map?.getPitch(),unavailableRoads:this.unavailableRoadCount,unavailableLineDasharray:this.loaded?this.map?.getPaintProperty('unavailable-roads','line-dasharray'):null,pixelRatio:this.map?.getPixelRatio(),labels:this.roadLabels?.presentation()??null,width:this.container.clientWidth,height:this.container.clientHeight};}

  resize(): void {
    if (this.active && !this.container.hidden && this.container.clientWidth && this.container.clientHeight) this.map?.resize();
  }

  dispose(): void {
    if(import.meta.env.DEV)Reflect.deleteProperty(window,'__FREMONT_LABEL_DEBUG__');
    this.observer?.disconnect();
    this.stopPointerInteraction?.();
    this.stopVertexEditing?.();
    this.clearVertexMarkers();
    this.marker?.remove();
    this.map?.remove();
    this.map = null;
  }

  private syncSource(name:string,data:FeatureCollection):void {if(this.map&&this.loaded&&this.active&&!this.container.hidden)(this.map.getSource(name) as GeoJSONSource)?.setData(data);}

  private syncOverlays(): void {
    if (!this.map || !this.loaded || !this.active || this.container.hidden) return;
    (this.map.getSource('inspection') as GeoJSONSource | undefined)?.setData(this.selection);
    (this.map.getSource('route') as GeoJSONSource | undefined)?.setData(this.route);
    (this.map.getSource('turns') as GeoJSONSource | undefined)?.setData(this.turns);
    (this.map.getSource('study-zones') as GeoJSONSource | undefined)?.setData(this.boundaries);
    (this.map.getSource('classified-roads') as GeoJSONSource | undefined)?.setData(this.classifiedRoads);
  }

  private clearVertexMarkers(): void {
    this.vertexMarkers.forEach((marker) => marker.remove());
    this.vertexMarkers = [];
  }

}

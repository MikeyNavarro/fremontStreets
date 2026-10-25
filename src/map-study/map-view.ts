import * as maplibregl from 'maplibre-gl';
import type {GeoJSONSource, LayerSpecification, MapMouseEvent} from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {FeatureCollection, LineString, MultiLineString, Point} from 'geojson';
import type {LonLat} from '../core/types';
import {roadLabelLayers, ROAD_LABEL_LAYERS, ROAD_LABEL_SOURCE} from '../views/road-label-style';
import type {MapStudyData, MapScope, SelectionGeometry} from './types';
import type {MapJunction} from './junctions';

const empty = (): FeatureCollection => ({type:'FeatureCollection',features:[]});
const lineLayout = {'line-cap':'round','line-join':'round'} as const;
const major = ['motorway','trunk','primary','secondary','tertiary'];
export interface RoadHit {wayId:string;position:LonLat;distance:number}
export interface MapCallbacks {road:(hits:RoadHit[])=>void;junction:(id:string)=>void;error:(message:string)=>void}

/** A normal interactive map. No vehicle, follow controller, timer or render loop. */
export class StudyMapView {
  readonly map:maplibregl.Map;
  readonly ready:Promise<void>;
  private loaded=false;
  private visibleLabels=true;
  private selected:SelectionGeometry={type:'FeatureCollection',features:[]};
  private comparison:SelectionGeometry={type:'FeatureCollection',features:[]};
  private displayedJunctions:MapJunction[]=[];
  private labels:MapStudyData['labels'];
  private labelByWay=new Map<string,Set<string>>();
  private labelById=new Map<string,MapStudyData['labels']['features'][number]>();
  private roadById=new Map<string,MapStudyData['roads']['features'][number]>();
  private hq:maplibregl.Marker;
  private showHq=true;
  private answerProtected=false;
  private overview=false;
  private observer:ResizeObserver;
  constructor(readonly container:HTMLElement,readonly data:MapStudyData,private callbacks:MapCallbacks){
    for(const road of data.roads.features)this.roadById.set(road.properties.wayId,road);
    this.labels={type:'FeatureCollection',features:data.labels.features.map(f=>({...f,properties:{...f.properties}}))};
    for(const feature of this.labels.features){
      const id=String(feature.id);this.labelById.set(id,feature);
      for(const wayId of feature.properties.sourceWayIds){if(!this.labelByWay.has(wayId))this.labelByWay.set(wayId,new Set());this.labelByWay.get(wayId)!.add(id);}
      feature.properties.priority=feature.properties.curriculumIds.some(id=>data.zone1EntryIds.includes(id))?2:major.includes(feature.properties.highway)?4:5;
    }
    maplibregl.setWorkerUrl(mapWorkerUrl);
    const zones:FeatureCollection={type:'FeatureCollection',features:data.zones.zones.filter(z=>z.geometry).map(z=>({type:'Feature',properties:{id:z.id,name:z.name},geometry:z.geometry!}))};
    const layers:LayerSpecification[]=[
      {id:'ground',type:'background',paint:{'background-color':'#101e28'}},
      {id:'zone-fill',type:'fill',source:'zones',filter:['==',['get','id'],'zone1'],paint:{'fill-color':'#4f9cad','fill-opacity':.055}},
      {id:'road-casing',type:'line',source:'roads',layout:lineLayout,paint:{'line-color':'#263f4e','line-width':['interpolate',['linear'],['zoom'],10,.6,13,2,16,8,20,28]}},
      {id:'roads',type:'line',source:'roads',layout:lineLayout,paint:{'line-color':['match',['get','highway'],['motorway','trunk'],'#6b8291',['primary','secondary'],'#597785',['tertiary'],'#425f70','#294451'],'line-width':['interpolate',['linear'],['zoom'],10,['match',['get','highway'],['motorway','trunk','primary'],1,.4],14,['match',['get','highway'],['motorway','trunk','primary'],3.5,1.3],17,['match',['get','highway'],['motorway','trunk','primary'],8,4],20,22]}},
      {id:'zone-boundary',type:'line',source:'zones',filter:['==',['get','id'],'zone1'],paint:{'line-color':'#79bfcc','line-width':1.8,'line-dasharray':[3,3],'line-opacity':.85}},
      {id:'connecting-outline',type:'line',source:'connecting',layout:lineLayout,paint:{'line-color':'#142d36','line-width':10}},
      {id:'connecting-lines',type:'line',source:'connecting',layout:lineLayout,paint:{'line-color':'#8bd7c9','line-width':5,'line-opacity':.9}},
      {id:'comparison-outline',type:'line',source:'comparison',layout:lineLayout,paint:{'line-color':'#13304a','line-width':['interpolate',['linear'],['zoom'],10,4,16,12,20,28]}},
      {id:'comparison-lines',type:'line',source:'comparison',layout:lineLayout,paint:{'line-color':'#4DA6FF','line-width':['interpolate',['linear'],['zoom'],10,2.2,16,6,20,20]}},
      {id:'selection-glow',type:'line',source:'selected',layout:lineLayout,paint:{'line-color':'#FF8C00','line-width':['interpolate',['linear'],['zoom'],10,7,16,18,20,34],'line-opacity':.16}},
      {id:'selection-outline',type:'line',source:'selected',layout:lineLayout,paint:{'line-color':'#3b2817','line-width':['interpolate',['linear'],['zoom'],10,4.5,16,11,20,27]}},
      {id:'selection-lines',type:'line',source:'selected',layout:lineLayout,paint:{'line-color':'#FF8C00','line-width':['interpolate',['linear'],['zoom'],10,2.5,16,6,20,20]}},
      {id:'outside-lines',type:'line',source:'outside',layout:lineLayout,paint:{'line-color':'#ffe0a8','line-width':['interpolate',['linear'],['zoom'],10,1,16,2,20,4],'line-dasharray':[2,3]}},
      ...roadLabelLayers(),
      {id:'crossings',type:'circle',source:'crossings',paint:{'circle-radius':5,'circle-color':'#172833','circle-stroke-color':'#b0a2d4','circle-stroke-width':2}},
      {id:'junctions',type:'circle',source:'junctions',paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,3.5,15,5.5,19,8],'circle-color':['case',['==',['get','physical'],'Verified'],'#96e2cc','#f4c36e'],'circle-stroke-color':'#14212b','circle-stroke-width':2}},
      {id:'focused-junction',type:'circle',source:'focused-junction',paint:{'circle-radius':11,'circle-color':'#ffffff','circle-opacity':.2,'circle-stroke-color':'#ffffff','circle-stroke-width':2}},
    ];
    this.map=new maplibregl.Map({container,center:[-121.97,37.56],zoom:12,minZoom:9,maxZoom:20,keyboard:true,clickTolerance:5,attributionControl:{compact:true},style:{version:8,sources:{
      roads:{type:'geojson',data:data.roads,promoteId:'wayId',attribution:'© OpenStreetMap contributors · ODbL · City of Fremont GIS (approximate historical study boundary)'},
      [ROAD_LABEL_SOURCE]:{type:'geojson',data:this.labels,promoteId:'labelId',tolerance:.375,buffer:128,maxzoom:18},
      zones:{type:'geojson',data:zones},selected:{type:'geojson',data:empty()},outside:{type:'geojson',data:empty()},comparison:{type:'geojson',data:empty()},connecting:{type:'geojson',data:empty()},junctions:{type:'geojson',data:empty()},crossings:{type:'geojson',data:empty()},'focused-junction':{type:'geojson',data:empty()},
    },layers}});
    this.map.addControl(new maplibregl.NavigationControl(),'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
    this.map.getCanvas().setAttribute('aria-label','Interactive Fremont street study map. Down arrow selects the next study street; up arrow selects the previous street. During practice, arrows pan. Drag to pan; plus and minus zoom.');
    this.map.getCanvas().setAttribute('aria-keyshortcuts','ArrowDown ArrowUp');
    const landmark=document.createElement('button');landmark.type='button';landmark.className='headquarters-marker';landmark.textContent='HQ';landmark.title='Fremont Police Headquarters · building reference';landmark.setAttribute('aria-label','Find Fremont Police Headquarters');
    landmark.addEventListener('click',event=>{event.stopPropagation();this.findHeadquarters();});
    this.hq=new maplibregl.Marker({element:landmark}).setLngLat(data.headquarters.position).addTo(this.map);
    this.ready=new Promise((resolve,reject)=>{this.map.once('load',()=>{this.loaded=true;container.dataset.rendererReady='true';this.focusZone();resolve();});this.map.once('error',event=>{if(!this.loaded)reject(event.error);});});
    this.map.on('error',event=>{container.dataset.rendererError=String(event.error);callbacks.error(String(event.error));});
    this.map.on('movestart',event=>{if('originalEvent' in event&&event.originalEvent)this.overview=false;});
    this.map.on('moveend',()=>this.syncCameraControls());
    this.map.on('click',event=>this.clicked(event));
    this.map.on('mousemove',event=>{const hits=this.map.queryRenderedFeatures(event.point,{layers:['roads','junctions','crossings']});this.map.getCanvas().style.cursor=hits.length?'pointer':'';});
    this.observer=new ResizeObserver(()=>this.map.resize());this.observer.observe(container);
  }
  private source(id:string,data:FeatureCollection){(this.map.getSource(id) as GeoJSONSource).setData(data);}
  private clicked(event:MapMouseEvent){
    const points=this.map.queryRenderedFeatures(event.point,{layers:['junctions','crossings']});
    if(points.length&&!this.answerProtected){this.callbacks.junction(String(points[0].properties.id));return;}
    const byWay=new Map<string,RoadHit>();
    for(const feature of this.map.queryRenderedFeatures([[event.point.x-7,event.point.y-7],[event.point.x+7,event.point.y+7]],{layers:['roads']})){
      const wayId=String(feature.properties.wayId),source=this.roadById.get(wayId);
      if(!source)continue;
      const line=source.geometry.coordinates;
      let distance=Infinity,position=event.lngLat.toArray() as LonLat;
      // A pointer hit selects this exact original source line, not a nearby
      // corroborated section or a quantized vector-tile approximation.
      for(let i=1;i<line.length;i++){const a=this.map.project(line[i-1] as LonLat),b=this.map.project(line[i] as LonLat),dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((event.point.x-a.x)*dx+(event.point.y-a.y)*dy)/(dx*dx+dy*dy||1))),candidate=Math.hypot(event.point.x-a.x-t*dx,event.point.y-a.y-t*dy);if(candidate<distance){distance=candidate;position=[line[i-1][0]+t*(line[i][0]-line[i-1][0]),line[i-1][1]+t*(line[i][1]-line[i-1][1])];}}
      if(distance<=7&&(!byWay.has(wayId)||distance<byWay.get(wayId)!.distance))byWay.set(wayId,{wayId,position,distance});
    }
    const hits=[...byWay.values()].sort((a,b)=>a.distance-b.distance);
    if(hits.length)this.callbacks.road(hits.filter(hit=>hit.distance<=hits[0].distance+2.5));
  }
  setSelection(selected:SelectionGeometry,outside:SelectionGeometry,comparison:SelectionGeometry){this.selected=selected;this.comparison=comparison;this.source('selected',selected);this.source('outside',outside);this.source('comparison',comparison);}
  setConnections(wayIds:readonly string[]){const ids=new Set(wayIds);this.source('connecting',{type:'FeatureCollection',features:this.data.roads.features.filter(f=>ids.has(f.properties.wayId))});}
  setJunctions(junctions:MapJunction[],visible:boolean){
    this.displayedJunctions=visible?junctions:[];
    const features=(kind:MapJunction['kind']):FeatureCollection<Point>=>({type:'FeatureCollection',features:this.displayedJunctions.filter(j=>j.kind===kind).map(j=>({type:'Feature',properties:{id:j.id,physical:j.evidence.topology.status},geometry:{type:'Point',coordinates:j.position}}))});
    this.source('junctions',features('junction'));this.source('crossings',features('nonconnecting-crossing'));
  }
  focusJunction(junction:MapJunction|null,move=true){this.source('focused-junction',{type:'FeatureCollection',features:junction?[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:junction.position}}]:[]});if(junction&&move){this.overview=false;this.map.easeTo({center:junction.position,zoom:Math.max(16,this.map.getZoom()),duration:this.motion(450),padding:this.padding()});}}
  setPriorities(mode:MapScope,selectedIds:readonly string[],wayIds:readonly string[]=[]){
    const curriculum=new Set(mode==='zone1'?this.data.zone1EntryIds:this.data.entries.map(e=>e.id));
    const selected=new Set(selectedIds),extra=new Set<string>();for(const id of wayIds)for(const labelId of this.labelByWay.get(id)??[])extra.add(labelId);
    const update:Array<{id:string;addOrUpdateProperties:Array<{key:string;value:number}>}>=[];
    for(const [id,f] of this.labelById){const p=f.properties;const priority=p.curriculumIds.some(v=>selected.has(v))||extra.has(id)?0:p.curriculumIds.some(v=>curriculum.has(v))?2:major.includes(p.highway)?4:5;if(priority!==p.priority){p.priority=priority;update.push({id,addOrUpdateProperties:[{key:'priority',value:priority}]});}}
    if(update.length)(this.map.getSource(ROAD_LABEL_SOURCE) as GeoJSONSource).updateData({update});
  }
  setLabelsVisible(visible:boolean){this.visibleLabels=visible;for(const id of ROAD_LABEL_LAYERS)this.map.setLayoutProperty(id,'visibility',visible&&!this.answerProtected?'visible':'none');}
  protectAnswers(protectedState:boolean){this.answerProtected=protectedState;this.setLabelsVisible(this.visibleLabels);this.hq.getElement().hidden=!this.showHq||protectedState;}
  setHeadquartersVisible(visible:boolean){this.showHq=visible;this.hq.getElement().hidden=!visible||this.answerProtected;}
  setBoundaryVisible(visible:boolean,scope:MapScope){for(const id of ['zone-boundary','zone-fill']){this.map.setLayoutProperty(id,'visibility',visible?'visible':'none');this.map.setFilter(id,scope==='zone1'?['==',['get','id'],'zone1']:null);}}
  findHeadquarters(){this.overview=false;this.map.easeTo({center:this.data.headquarters.position,zoom:16.5,duration:this.motion(500),padding:this.padding()});}
  focusZone(){this.fitZone(this.map.getPitch(),this.map.getBearing());}
  setPerspective(pitch:0|30){this.fitZone(pitch,this.map.getBearing());}
  rotateTo(bearing:number){
    if(!Number.isFinite(bearing))return;
    if(this.overview)this.fitZone(this.map.getPitch(),bearing);
    else this.map.easeTo({bearing,duration:this.motion(350)});
  }
  resetNorth(){this.rotateTo(0);}
  private fitZone(pitch:number,bearing:number){
    const zone=this.data.zones.zones.find(z=>z.id==='zone1');if(!zone?.geometry)return;
    const coordinates=zone.geometry.type==='Polygon'?zone.geometry.coordinates.flat():zone.geometry.coordinates.flat(2);
    this.overview=true;this.fitCoordinates(coordinates,pitch,bearing);
  }
  focusGeometry(features:FeatureCollection<LineString|MultiLineString>){this.overview=false;const coordinates=features.features.flatMap(f=>f.geometry.type==='LineString'?f.geometry.coordinates:f.geometry.coordinates.flat());this.fitCoordinates(coordinates as LonLat[]);}
  private fitCoordinates(coordinates:LonLat[],pitch=this.map.getPitch(),bearing=this.map.getBearing()){
    if(!coordinates.length)return;
    const bounds=new maplibregl.LngLatBounds();for(const position of coordinates)bounds.extend(position);
    const padding=this.padding();
    // MapLibre's bounds solver handles bearing but assumes a flat map. Use its
    // native transform on a detached clone to fit the actual polygon at pitch,
    // without moving the live camera through speculative intermediate poses.
    const camera=this.map.cameraForBounds(bounds,{padding,absolutePadding:true,bearing,maxZoom:17});
    if(!camera?.center||camera.zoom===undefined)return;
    const transform=this.map._camera.transform.clone();
    transform.setPadding(padding);transform.setCenter(maplibregl.LngLat.convert(camera.center));
    transform.setBearing(bearing);transform.setPitch(pitch);
    const locations=coordinates.map(position=>maplibregl.LngLat.convert(position));
    const fits=(zoom:number)=>{transform.setZoom(zoom);return locations.every(position=>{
      const p=transform.locationToScreenPoint(position);
      return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=padding.left&&p.x<=transform.width-padding.right&&p.y>=padding.top&&p.y<=transform.height-padding.bottom;
    });};
    let zoom=camera.zoom;
    if(!fits(zoom)){
      let low=this.map.getMinZoom(),high=zoom;
      for(let iteration=0;iteration<22;iteration++){const middle=(low+high)/2;if(fits(middle))low=middle;else high=middle;}
      zoom=low;
    }
    this.map.easeTo({...camera,zoom,pitch,bearing,padding,duration:this.motion(550)});
  }
  private padding(){
    const box=this.container.getBoundingClientRect(),mobile=innerWidth<=760;
    const padding={top:32,right:mobile?24:60,bottom:mobile?95:72,left:mobile?24:40};
    const visible=(element:HTMLElement|null):element is HTMLElement=>!!element&&!element.hidden&&getComputedStyle(element).visibility!=='hidden'&&element.getClientRects().length>0;
    const tools=document.querySelector<HTMLElement>('.map-tools');
    if(visible(tools))padding.top=Math.max(padding.top,tools.getBoundingClientRect().bottom-box.top+16);
    for(const id of ['road-drawer','selection-panel','quiz-panel','disambiguation']){
      const element=document.getElementById(id);if(!visible(element))continue;
      const panel=element.getBoundingClientRect();
      if(mobile)padding.bottom=Math.max(padding.bottom,box.bottom-panel.top+16);
      else if(id==='road-drawer')padding.left=Math.max(padding.left,panel.right-box.left+16);
      else padding.right=Math.max(padding.right,box.right-panel.left+16);
    }
    return padding;
  }
  private syncCameraControls(){
    const pitch=this.map.getPitch(),bearing=this.map.getBearing();
    document.getElementById('perspective-flat')?.setAttribute('aria-pressed',String(Math.abs(pitch)<.5));
    document.getElementById('perspective-angled')?.setAttribute('aria-pressed',String(Math.abs(pitch-30)<.5));
    const input=document.getElementById('map-bearing') as HTMLInputElement|null;
    if(input&&document.activeElement!==input)input.value=String(Math.round(bearing));
    const value=document.getElementById('map-bearing-value');if(value)value.textContent=`${Math.round(bearing)}°`;
  }
  viewport(){const box=this.container.getBoundingClientRect(),padding=this.padding();return {width:box.width,height:box.height,padding,left:padding.left,top:padding.top,right:box.width-padding.right,bottom:box.height-padding.bottom};}
  private motion(milliseconds:number){return matchMedia('(prefers-reduced-motion: reduce)').matches?0:milliseconds;}
  settled(){return this.loaded&&this.map.loaded()&&this.map.areTilesLoaded()&&!this.map.isMoving();}
  presentation(){const map=this.map;return {ready:this.loaded,tilesReady:this.loaded&&map.loaded()&&map.areTilesLoaded(),camera:{center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()},viewport:this.viewport(),selectedGeometry:this.selected,comparisonGeometry:this.comparison,displayedJunctions:this.displayedJunctions,selectionColor:map.getPaintProperty('selection-lines','line-color'),comparisonColor:map.getPaintProperty('comparison-lines','line-color')};}
  renderedCount(layer:string){return this.loaded?this.map.queryRenderedFeatures(undefined,{layers:[layer]}).length:0;}
  inspectLabels(){const map=this.map;return {sourceFeatureCount:this.labels.features.length,geometryBuilds:1,visible:this.visibleLabels&&!this.answerProtected,layers:ROAD_LABEL_LAYERS.map(id=>({id,placement:map.getLayoutProperty(id,'symbol-placement'),visibility:map.getLayoutProperty(id,'visibility')})),rendered:this.loaded?map.queryRenderedFeatures(undefined,{layers:[...ROAD_LABEL_LAYERS]}).map(f=>({id:f.id,name:f.properties.name,label:f.properties.label,priority:f.properties.priority,sourceWayIds:f.properties.sourceWayIds,layer:f.layer.id})):[]};}
  inspect(){return {...this.presentation(),labels:this.inspectLabels(),renderedSelectedCount:this.renderedCount('selection-lines'),renderedComparisonCount:this.renderedCount('comparison-lines'),renderedRoadCount:this.renderedCount('roads')};}
  project(position:LonLat){const p=this.map.project(position);return {x:p.x,y:p.y};}
  dispose(){this.observer.disconnect();this.hq.remove();this.map.remove();}
}

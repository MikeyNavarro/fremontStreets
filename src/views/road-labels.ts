import type {GeoJSONSource, Map as LibreMap, PointLike} from 'maplibre-gl';
import {RoadLabelPriorityController, type PreparedRoadLabels} from './road-label-geometry';
import {ROAD_LABEL_LAYERS, ROAD_LABEL_SOURCE} from './road-label-style';

/** Owns cartographic priority/visibility only. It never changes the road graph. */
export class RoadLabels {
  private ready=false;
  private active=true;
  private visible=true;
  private currentWayId:string|null=null;
  private studyWayIds:string[]=[];
  private inspectedWayIds:string[]=[];
  private connectorWayIds:string[]=[];
  private destinationWayId:string|null=null;
  private dirty=true;
  private priorityUpdates=0;
  private readonly priorities:RoadLabelPriorityController;
  constructor(private readonly map:LibreMap,readonly prepared:PreparedRoadLabels){
    this.priorities=new RoadLabelPriorityController(prepared);
  }
  loaded(){this.ready=true;this.syncVisibility();this.syncPriority();}
  setActive(active:boolean){this.active=active;if(active)this.syncPriority();}
  setVisible(visible:boolean){if(this.visible===visible)return;this.visible=visible;this.syncVisibility();}
  setCurrentRoad(wayId:string){if(this.currentWayId===wayId)return;this.currentWayId=wayId;this.dirty=true;this.syncPriority();}
  setStudyRoads(ids:Iterable<string>){this.studyWayIds=[...new Set(ids)];this.dirty=true;this.syncPriority();}
  setInspection(ids:Iterable<string>){this.inspectedWayIds=[...new Set(ids)];this.dirty=true;this.syncPriority();}
  setRoute(ids:readonly string[]){this.connectorWayIds=[...new Set(ids)];this.destinationWayId=ids.at(-1)??null;this.dirty=true;this.syncPriority();}
  private syncVisibility(){
    if(!this.ready)return;
    for(const id of ROAD_LABEL_LAYERS)this.map.setLayoutProperty(id,'visibility',this.visible?'visible':'none');
  }
  private syncPriority(){
    if(!this.ready||!this.active||!this.dirty)return;
    this.dirty=false;
    const diff=this.priorities.update({selectedWayIds:[...this.studyWayIds,...this.inspectedWayIds,...(this.destinationWayId?[this.destinationWayId]:[])],currentWayId:this.currentWayId,connectorWayIds:this.connectorWayIds});
    if(diff.update.length){
      (this.map.getSource(ROAD_LABEL_SOURCE) as GeoJSONSource).updateData(diff);
      this.priorityUpdates++;
    }
  }
  /** Cheap state for routine simulation snapshots; querying symbols is opt-in. */
  presentation(){return {
    visible:this.visible,sourceFeatureCount:this.prepared.collection.features.length,geometryBuilds:1,priorityUpdates:this.priorityUpdates,
    layers:ROAD_LABEL_LAYERS.map(id=>({id,visibility:this.ready?this.map.getLayoutProperty(id,'visibility'):null,minzoom:this.map.getLayer(id)?.minzoom,maxzoom:this.map.getLayer(id)?.maxzoom,placement:this.ready?this.map.getLayoutProperty(id,'symbol-placement'):null,spacing:this.ready?this.map.getLayoutProperty(id,'symbol-spacing'):null})),
  };}
  /** queryRenderedFeatures tests placed symbol collision boxes, not merely source lines.
   * Repeated anchors may share a feature ID; callers must not infer anchor counts
   * from unique IDs. Query separate screen boxes or inspect actual screenshots.
   */
  inspect(box?:PointLike|[PointLike,PointLike]){
    const rendered=this.ready?this.map.queryRenderedFeatures(box,{layers:[...ROAD_LABEL_LAYERS]}):[];
    return {...this.presentation(),tilesReady:this.ready&&this.map.loaded()&&this.map.areTilesLoaded(),zoom:this.map.getZoom(),bearing:this.map.getBearing(),rendered:rendered.map(f=>({id:f.id,layer:f.layer.id,name:f.properties.name,label:f.properties.label,displayLabel:f.layer.id.endsWith('-wide')?f.properties.compactLabel:f.properties.label,highway:f.properties.highway,priority:f.properties.priority,curriculumIds:f.properties.curriculumIds,sourceWayIds:f.properties.sourceWayIds,geometry:f.geometry}))};
  }
}

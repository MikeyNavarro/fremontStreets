import type {FeatureCollection,LineString,MultiLineString} from 'geojson';
import type {LonLat} from '../core/types';
import type {MapJunction,MapJunctionComponent,MapJunctionFact,MapJunctionPair} from './junctions';
import {canonicalRoadName} from '../study-network';
import {project} from '../core/projection';
import type {GeometryOptions,MapScope,MapStudyData,MapStudyEntry,RoadSearchResult,SelectionGeometry} from './types';
import {pointInZone,boundsOfGeometry,geometryLength,lineLength} from './geometry';
export {boundsOfGeometry,geometryLength} from './geometry';
export {ZONE1_ENTRY_IDS} from './types';

interface DataIndex {entries:Map<string,MapStudyEntry>;sections:Map<string,MapStudyData['sections'][number]>;junctions:Map<string,MapJunction>;ways:Map<string,MapStudyData['roads']['features'][number]>;connectors:RoadSearchResult[]}
const indexes=new WeakMap<MapStudyData,DataIndex>();
function index(data:MapStudyData):DataIndex{
  const existing=indexes.get(data);if(existing)return existing;
  const connectors=new Map<string,RoadSearchResult>();
  for(const feature of data.roads.features){
    const p=feature.properties;if(p.entryIds.length||!(p.name||p.ref))continue;
    let result=connectors.get(p.roadId);
    if(!result){result={id:p.roadId,kind:'connector',label:p.name||p.ref,wayIds:[],names:[p.name||p.ref],defaultZone1:false,distinctSections:1};connectors.set(p.roadId,result);}
    result.wayIds.push(p.wayId);
  }
  const value:DataIndex={entries:new Map(data.entries.map(e=>[e.id,e])),sections:new Map(data.sections.map(s=>[s.id,s])),junctions:new Map(data.junctions.map(j=>[j.id,j])),ways:new Map(data.roads.features.map(f=>[f.properties.wayId,f])),connectors:[...connectors.values()]};indexes.set(data,value);return value;
}
export function studyEntries(data:MapStudyData,scope:MapScope='zone1'):MapStudyEntry[]{
  const entries=index(data).entries;
  return scope==='zone1'?data.zone1EntryIds.map(id=>entries.get(id)!).filter(Boolean):data.entries;
}
export function entryGeometry(data:MapStudyData,entryId:string,options:GeometryOptions={}):SelectionGeometry{
  const cached=index(data),entry=cached.entries.get(entryId),features:SelectionGeometry['features']=[];
  for(const id of entry?.sectionIds??[]){
    if(options.sectionId&&id!==options.sectionId)continue;
    const section=cached.sections.get(id)!;
    const full=options.fullRoad||options.zone1===false;
    let geometry:LineString|MultiLineString;
    if(options.outsideOnly)geometry=section.outside;
    else if(options.verifiedOnly)geometry=full?section.verified:section.verifiedInside;
    else geometry=full?section.geometry:section.inside;
    if(!geometry.coordinates.length)continue;
    features.push({type:'Feature',id:section.id,properties:{entryId,sectionId:section.id,name:section.name,sourceWayIds:section.sourceWayIds,outside:!!options.outsideOnly,clipped:!full||!!options.outsideOnly},geometry});
  }
  return {type:'FeatureCollection',features};
}
export function connectorGeometry(data:MapStudyData,wayIds:readonly string[]):MapStudyData['roads']{
  const ways=index(data).ways;return {type:'FeatureCollection',features:wayIds.map(id=>ways.get(id)).filter((f):f is MapStudyData['roads']['features'][number]=>!!f)};
}
const searchKey=(s:string)=>canonicalRoadName(s.normalize('NFKD'));
export function searchRoads(data:MapStudyData,query:string,limit=30):RoadSearchResult[]{
  const needle=searchKey(query),tokens=needle.split(' ').filter(Boolean),matches=(values:string[])=>tokens.every(token=>values.some(value=>searchKey(value).includes(token)));
  const entries=data.entries.filter(entry=>matches([entry.label,entry.originalLabel,...entry.names,...entry.mappedNames])).map(entry=>({id:entry.id,kind:'study' as const,label:entry.label,entryId:entry.id,wayIds:entry.sourceWayIds,names:entry.mappedNames,defaultZone1:entry.defaultZone1,distinctSections:entry.sectionIds.length}));
  entries.sort((a,b)=>Number(b.defaultZone1)-Number(a.defaultZone1)||Number(searchKey(b.label)===needle)-Number(searchKey(a.label)===needle)||a.label.localeCompare(b.label));
  const connectors=needle?index(data).connectors.filter(road=>matches(road.names)).sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id)):[];
  return [...entries,...connectors].slice(0,limit);
}
export type ScopedMapJunction=MapJunction&{displayNodeId:string;displaySectionId:string;displayQuizPairs:MapJunctionPair[];sourceJunctionId?:string};
export interface OrderedJunction {junction:ScopedMapJunction;sectionId:string;sectionName:string;distanceMetres:number;sectionIndex:number}
function scopedJunction(junction:MapJunction,component:MapJunction["components"][number],entryId:string,sectionId:string,pairFilter:(pair:MapJunctionPair)=>boolean=()=>true):ScopedMapJunction{
  const displayQuizPairs=junction.quizPairs.filter(pair=>pair.nodeIds.includes(component.nodeId)&&pair.roadIds.some(roadId=>junction.roads.some(road=>road.id===roadId&&road.entryIds.includes(entryId)))&&pairFilter(pair));
  const scopedFact=(dimension:'topology'|'grade'):MapJunctionFact=>{
    const original=junction.evidence[dimension];if(original.status==='Conflicted')return original;
    const claimDimension=dimension==='grade'?'gradeSeparation':'topology';
    return {status:displayQuizPairs.length?'Verified':'Unresolved',scope:`Specific named physical relationships at selected source node ${component.nodeId}; not every movement or road in the logical group.`,note:displayQuizPairs.length?`Applicable independent physical evidence: ${displayQuizPairs.map(pair=>`${pair.roadA} / ${pair.roadB}`).join('; ')}. Individual legal turns remain unverified.`:'No independently corroborated named physical pair applies to this selected road/component. Other components of this logical junction may have separately supported facts.',sourceIds:[...new Set(displayQuizPairs.flatMap(pair=>pair.sourceIds))],claimIds:[...new Set(displayQuizPairs.flatMap(pair=>pair.claimIds.filter(claim=>claim.includes(`-${claimDimension}-`)&&claim.endsWith(`-osm-node-${component.nodeId}`))))]};
  };
  const evidence={...junction.evidence,topology:scopedFact('topology'),grade:scopedFact('grade')};
  const conflicted=junction.statusLabel.startsWith('Conflicting')||Object.values(evidence).some(fact=>fact.status==='Conflicted');
  const statusLabel=conflicted?'Conflicting evidence — exploratory only':displayQuizPairs.length?'Named relationship at the selected source node independently corroborated':evidence.location.sourceIds.length?'City-corroborated named location; selected relationship source-mapped only':'Source-mapped junction; independent corroboration unresolved';
  return {...junction,position:[...component.position],displayNodeId:component.nodeId,displaySectionId:sectionId,displayQuizPairs,evidence,statusLabel};
}
/** Order follows each source-preserving chain's coordinate sequence. Separate
 * branches/carriageways remain explicit; no global north/south order is invented. */
export function entryJunctions(data:MapStudyData,entryId:string,options:GeometryOptions={}):OrderedJunction[]{
  const cached=index(data),entry=cached.entries.get(entryId),result:OrderedJunction[]=[];
  const zone=data.zones.zones.find(z=>z.id==='zone1')?.geometry;
  const seen=new Set<string>();
  for(const [sectionIndex,id]of(entry?.sectionIds??[]).entries()){
    if(options.sectionId&&id!==options.sectionId)continue;
    const section=cached.sections.get(id)!;
    const distances=new Map<string,number>();let distance=0;
    section.sourceNodeIds.forEach((node,i)=>{
      if(i)distance+=lineLength([section.geometry.coordinates[i-1] as LonLat,section.geometry.coordinates[i] as LonLat]);
      if(!distances.has(node))distances.set(node,distance);
    });
    const sectionRows:OrderedJunction[]=[];
    for(const ordered of section.junctionOrder){
      const junction=cached.junctions.get(ordered.junctionId);if(!junction||junction.kind!=='junction'||seen.has(junction.id))continue;
      const components=junction.components.filter(component=>distances.has(component.nodeId)&&(options.fullRoad||options.zone1===false||!zone||pointInZone(component.position,zone)));
      components.sort((a,b)=>distances.get(a.nodeId)!-distances.get(b.nodeId)!||a.nodeId.localeCompare(b.nodeId));
      const component=components[0];if(!component)continue;
      // The dataset's global logical-site representative can be on the other
      // carriageway or outside the clipped study area. Display an actual node
      // on this selected source chain instead; retain all evidence/components.
      const scoped=scopedJunction(junction,component,entryId,id);
      seen.add(junction.id);sectionRows.push({junction:scoped,sectionId:id,sectionName:section.name,distanceMetres:distances.get(component.nodeId)!,sectionIndex});
    }
    sectionRows.sort((a,b)=>a.distanceMetres-b.distanceMetres||a.junction.id.localeCompare(b.junction.id));
    result.push(...sectionRows);
  }
  return result;
}

/** A node belongs to an entry only through an actual adjacent source segment.
 * A logical site's aggregate road names or a nearby line cannot establish this. */
function assignedWaysAtNode(data:MapStudyData,entryId:string,nodeId:string,position:LonLat):Set<string>{
  const cached=index(data),ways=new Set<string>();
  for(const id of cached.entries.get(entryId)?.sectionIds??[]){
    const section=cached.sections.get(id);if(!section)continue;
    for(let i=0;i<section.sourceNodeIds.length;i++){
      const coordinate=section.geometry.coordinates[i];
      if(section.sourceNodeIds[i]!==nodeId||coordinate?.[0]!==position[0]||coordinate?.[1]!==position[1])continue;
      for(const segment of [section.sourceSegments[i-1],section.sourceSegments[i]]){
        if(!segment)continue;const way=cached.ways.get(segment.wayId);
        // Interchanges and ramps remain on the background map. They are not
        // ordinary direct intersections between the assigned surface corridors.
        if(way&&way.properties.entryIds.includes(entryId)&&section.sourceWayIds.includes(segment.wayId)
          &&way.properties.highway!=='motorway'&&!way.properties.highway.endsWith('_link'))ways.add(segment.wayId);
      }
    }
  }
  return ways;
}

/** Actual components connecting TWO DISTINCT active curriculum entries.
 * Zone 1 membership is a curriculum constraint even when full-road display is on. */
export function assignedPairComponents(data:MapStudyData,junction:MapJunction,pair:MapJunctionPair,scope:MapScope):MapJunctionComponent[]{
  if(junction.kind!=='junction'||!['shared-node','name-change'].includes(junction.connectionType)||pair.roadIds[0]===pair.roadIds[1])return [];
  const active=new Set(studyEntries(data,scope).map(entry=>entry.id));
  const roads=pair.roadIds.map(id=>junction.roads.find(road=>road.id===id));if(roads.some(road=>!road))return [];
  const zone=data.zones.zones.find(value=>value.id==='zone1')?.geometry;
  return junction.components.filter(component=>{
    if(!pair.nodeIds.includes(component.nodeId)||!pair.roadIds.every(id=>component.roadIds.includes(id))
      ||scope==='zone1'&&(!zone||!pointInZone(component.position,zone)))return false;
    if(!junction.mappedPairs.some(mapped=>pair.roadIds.every(id=>mapped.roadIds.includes(id))&&mapped.nodeIds.includes(component.nodeId)))return false;
    const identities=roads.map(road=>road!.entryIds.filter(id=>active.has(id)&&[...assignedWaysAtNode(data,id,component.nodeId,component.position)]
      .some(wayId=>road!.sourceWayIds.includes(wayId)&&component.sourceWayIds.includes(wayId))));
    return identities[0].some(a=>identities[1].some(b=>a!==b));
  });
}

/** Focused study walkthrough. Each visible name/pair belongs to its actual
 * selected source node. Repeated carriageway nodes are grouped by retained
 * logical identity; distinct physical pair components never borrow that marker. */
export function assignedEntryJunctions(data:MapStudyData,entryId:string,scope:MapScope,options:GeometryOptions={}):OrderedJunction[]{
  const cached=index(data),entry=cached.entries.get(entryId),active=new Set(studyEntries(data,scope).map(value=>value.id));
  if(!entry||!active.has(entryId))return [];
  const rows:OrderedJunction[]=[];
  const candidates=new Map<string,Array<{junction:MapJunction;component:MapJunctionComponent;pairs:MapJunctionPair[];sectionId:string;sectionName:string;sectionIndex:number;distanceMetres:number}>>();
  for(const [sectionIndex,sectionId]of entry.sectionIds.entries()){
    if(options.sectionId&&sectionId!==options.sectionId)continue;
    const section=cached.sections.get(sectionId);if(!section)continue;
    const distances=new Map<string,number>();let distance=0;
    section.sourceNodeIds.forEach((node,i)=>{if(i)distance+=lineLength([section.geometry.coordinates[i-1] as LonLat,section.geometry.coordinates[i] as LonLat]);if(!distances.has(node))distances.set(node,distance);});
    for(const ordered of section.junctionOrder){
      const junction=cached.junctions.get(ordered.junctionId);if(!junction||junction.kind!=='junction')continue;
      const atNode=new Map<string,MapJunctionPair[]>();
      for(const pair of junction.mappedPairs){
        if(!pair.roadIds.some(id=>junction.roads.some(road=>road.id===id&&road.entryIds.includes(entryId))))continue;
        for(const component of assignedPairComponents(data,junction,pair,scope)){
          if(!distances.has(component.nodeId))continue;
          // The selected source chain must itself supply the selected entry's
          // way at this component, not a different branch elsewhere in the group.
          const i=section.sourceNodeIds.indexOf(component.nodeId),selectedWays=[section.sourceSegments[i-1]?.wayId,section.sourceSegments[i]?.wayId].filter((id):id is string=>!!id);
          const selectedOrdinaryWays=assignedWaysAtNode(data,entryId,component.nodeId,component.position);
          if(!pair.roadIds.some(id=>junction.roads.some(road=>road.id===id&&road.entryIds.includes(entryId)&&road.sourceWayIds.some(way=>selectedWays.includes(way)&&selectedOrdinaryWays.has(way)&&component.sourceWayIds.includes(way)))))continue;
          atNode.set(component.nodeId,[...(atNode.get(component.nodeId)??[]),pair]);
        }
      }
      for(const [nodeId,pairs]of atNode){const component=junction.components.find(value=>value.nodeId===nodeId)!;
        const candidate={junction,component,pairs,sectionId,sectionName:section.name,sectionIndex,distanceMetres:distances.get(nodeId)!};
        candidates.set(junction.id,[...(candidates.get(junction.id)??[]),candidate]);
      }
    }
  }
  const pairKey=(pair:MapJunctionPair)=>[...pair.roadIds].sort().join('|');
  for(const choices of candidates.values()){
    const covered=new Set<string>();let emitted=0;
    while(true){
      choices.sort((a,b)=>b.pairs.filter(pair=>!covered.has(pairKey(pair))).length-a.pairs.filter(pair=>!covered.has(pairKey(pair))).length||a.sectionIndex-b.sectionIndex||a.distanceMetres-b.distanceMetres||a.component.nodeId.localeCompare(b.component.nodeId));
      const chosen=choices[0],pairs=chosen.pairs.filter(pair=>!covered.has(pairKey(pair)));if(!pairs.length)break;
      const pairIds=new Set(pairs.map(pairKey)),roadIds=new Set(pairs.flatMap(pair=>pair.roadIds));
      const scoped=scopedJunction(chosen.junction,chosen.component,entryId,chosen.sectionId,pair=>pairIds.has(pairKey(pair)));
      const roads=scoped.roads.filter(road=>roadIds.has(road.id)).map(road=>{
        const applicable=new Map(road.entryIds.filter(id=>active.has(id)).map(id=>[id,[...assignedWaysAtNode(data,id,chosen.component.nodeId,chosen.component.position)].filter(way=>road.sourceWayIds.includes(way)&&chosen.component.sourceWayIds.includes(way))]));
        return {...road,entryIds:[...applicable].filter(([,ways])=>ways.length).map(([id])=>id),sourceWayIds:[...new Set([...applicable.values()].flat())]};
      });
      const sourceWayIds=[...new Set(roads.flatMap(road=>road.sourceWayIds))];
      const nodePairs=pairs.map(pair=>({...pair,nodeIds:[chosen.component.nodeId]}));
      const junction:ScopedMapJunction={...scoped,id:emitted?`${scoped.id}:assigned:${chosen.component.nodeId}`:scoped.id,sourceJunctionId:scoped.id,
        roads,roadNames:roads.map(road=>road.name),entryIds:[...new Set(roads.flatMap(road=>road.entryIds))],sourceWayIds,nodeIds:[chosen.component.nodeId],
        components:[{...chosen.component,roadNames:roads.map(road=>road.name),roadIds:[...roadIds],sourceWayIds}],mappedPairs:nodePairs,quizPairs:scoped.displayQuizPairs};
      rows.push({junction,sectionId:chosen.sectionId,sectionName:chosen.sectionName,sectionIndex:chosen.sectionIndex,distanceMetres:chosen.distanceMetres});
      pairs.forEach(pair=>covered.add(pairKey(pair)));emitted++;
    }
  }
  return rows.sort((a,b)=>a.sectionIndex-b.sectionIndex||a.distanceMetres-b.distanceMetres||a.junction.id.localeCompare(b.junction.id));
}
export function entryCrossings(data:MapStudyData,entryId:string,options:GeometryOptions={}):MapJunction[]{
  const zone=data.zones.zones.find(z=>z.id==='zone1')?.geometry;
  const section=options.sectionId?index(data).sections.get(options.sectionId):null;
  if(options.sectionId&&(!section||section.entryId!==entryId))return [];
  const onSection=(position:LonLat):boolean=>{
    if(!section)return true;
    const p=project(position),coordinates=section.geometry.coordinates as LonLat[];
    for(let i=1;i<coordinates.length;i++){
      const a=project(coordinates[i-1]),b=project(coordinates[i]),dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
      // Existing crossing coordinates may be rounded. This sub-metre matching
      // tolerance only filters displayed nonconnections; it creates no edges.
      if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=.5)return true;
    }return false;
  };
  return data.junctions.filter(j=>j.kind==='nonconnecting-crossing'&&j.entryIds.includes(entryId)&&(options.fullRoad||options.zone1===false||!zone||pointInZone(j.position,zone))&&(!section||j.sourceWayIds.some(id=>section.sourceWayIds.includes(id)))&&onSection(j.position));
}
export function compareEntries(data:MapStudyData,roadA:string,roadB:string,options:GeometryOptions={}):{junctions:ScopedMapJunction[];crossings:MapJunction[];message:string}{
  if(roadA===roadB)return {junctions:[],crossings:[],message:'Choose two different study roads to compare.'};
  const cached=index(data),a=cached.entries.get(roadA),b=cached.entries.get(roadB);
  const zone=data.zones.zones.find(z=>z.id==='zone1')?.geometry;
  const aWays=new Set(a?.sourceWayIds),bWays=new Set(b?.sourceWayIds),seen=new Set<string>(),junctions:ScopedMapJunction[]=[];
  for(const sectionId of a?.sectionIds??[]){
    if(options.sectionId&&sectionId!==options.sectionId)continue;
    const section=cached.sections.get(sectionId)!;
    const nodeOrder=new Map(section.sourceNodeIds.map((node,i)=>[node,i]));
    for(const ordered of section.junctionOrder){
      const junction=cached.junctions.get(ordered.junctionId);if(!junction||junction.kind!=='junction'||seen.has(junction.id)||!junction.entryIds.includes(roadB))continue;
      const isPair=(pair:MapJunctionPair)=>pair.roadIds.some(id=>junction.roads.some(road=>road.id===id&&road.entryIds.includes(roadA)))&&pair.roadIds.some(id=>junction.roads.some(road=>road.id===id&&road.entryIds.includes(roadB)));
      const pairNodes=new Set(junction.mappedPairs.filter(isPair).flatMap(pair=>pair.nodeIds));
      // A visible logical group can contain unrelated source nodes on another
      // carriageway. Only the compared pair's actual shared node establishes a
      // connection in the selected section/zone; the group ID alone cannot.
      const components=junction.components.filter(component=>pairNodes.has(component.nodeId)&&nodeOrder.has(component.nodeId)&&component.sourceWayIds.some(id=>aWays.has(id))&&component.sourceWayIds.some(id=>bWays.has(id))&&(options.fullRoad||options.zone1===false||!zone||pointInZone(component.position,zone)));
      components.sort((left,right)=>nodeOrder.get(left.nodeId)!-nodeOrder.get(right.nodeId)!);
      const component=components[0];if(!component)continue;
      junctions.push(scopedJunction(junction,component,roadA,sectionId,isPair));seen.add(junction.id);
    }
  }
  const crossings=entryCrossings(data,roadA,options).filter(j=>j.entryIds.includes(roadB));
  return {junctions,crossings,message:junctions.length?`${junctions.length} source-mapped connecting junction${junctions.length===1?'':'s'} in this view. Individual legal turns remain separately unverified.`:'No direct source-mapped junction found in the selected available sections. This does not prove the complete real-world roads never connect.'};
}
export function roadAtWay(data:MapStudyData,wayId:string):RoadSearchResult[]{
  const cached=index(data),feature=cached.ways.get(wayId);if(!feature)return [];
  const p=feature.properties;
  if(p.entryIds.length)return p.entryIds.map(id=>cached.entries.get(id)!).filter(Boolean).map(entry=>({id:entry.id,kind:'study',label:entry.label,entryId:entry.id,wayIds:entry.sourceWayIds,names:entry.mappedNames,defaultZone1:entry.defaultZone1,distinctSections:entry.sectionIds.length}));
  const component=cached.connectors.find(c=>c.id===p.roadId);
  return component?[component]:[];
}

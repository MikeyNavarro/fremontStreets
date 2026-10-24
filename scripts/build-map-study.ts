import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import type {LineString,MultiLineString} from 'geojson';
import type {LonLat,RoadData,RoadWay} from '../src/core/types';
import type {ZoneDocument} from '../src/core/zones';
import type {StudyNetwork} from '../src/study-network';
import type {VerificationRegistry} from '../src/training/verification';
import {prepareRoadLabels} from '../src/views/road-label-geometry';
import {appendLinePiece,clipLineToZone,geometryLength,lineLength,pointInZone} from '../src/map-study/geometry';
import {buildMapJunctions,type AssociatedEvidence,type NamedPhysicalFact,type SourceVisualCrossing} from '../src/map-study/junctions';
import {ZONE1_ENTRY_IDS,type MapRoadProperties,type MapRoadSection,type MapStudyData,type MapStudyEntry} from '../src/map-study/types';

const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const sourceValue=(way:RoadWay,key:string)=>String(way[key]??way.tags?.[key]??'');
const round=(n:number)=>Math.round(n*100)/100;
const valid=(p:LonLat|undefined):p is LonLat=>!!p&&p.length===2&&p.every(Number.isFinite);

/** Connected component identities only join identical source names/refs through
 * actual shared OSM nodes. Same-name disconnected places remain disambiguated. */
function roadComponents(roads:RoadData):Map<string,string>{
  const parent=new Map<string,string>(),nodeOwners=new Map<string,string>();
  const find=(id:string):string=>{const p=parent.get(id)!;if(p===id)return id;const result=find(p);parent.set(id,result);return result;};
  const join=(a:string,b:string)=>{const x=find(a),y=find(b);if(x!==y)parent.set(x<y?y:x,x<y?x:y);};
  for(const way of roads.ways){
    const id=String(way.id);parent.set(id,id);
    const name=sourceValue(way,'name'),ref=sourceValue(way,'ref');if(!name&&!ref)continue;
    const identity=JSON.stringify([name,ref]);
    for(const node of way.nodes){const key=`${identity}:${node}`,previous=nodeOwners.get(key);if(previous)join(id,previous);else nodeOwners.set(key,id);}
  }
  return new Map([...parent.keys()].map(id=>[id,`road:${find(id)}`]));
}
export interface MapInputs {roads:RoadData;network:StudyNetwork;zones:ZoneDocument;registry:VerificationRegistry;evidence:AssociatedEvidence;physicalFacts:NamedPhysicalFact[];crossings:SourceVisualCrossing[];sourceHashes:Record<string,string>}
export function buildMapStudyData(input:MapInputs):MapStudyData{
  const {roads,network,zones,registry,evidence,physicalFacts,crossings,sourceHashes}=input;
  const zone=zones.zones.find(zone=>zone.id==='zone1')?.geometry;if(!zone)throw new Error('Zone 1 historical polygon is required.');
  if(network.entries.length!==38||new Set(network.entries.map(e=>e.id)).size!==38)throw new Error('The exact existing 38-entry curriculum is required.');
  const defaultIds=new Set<string>(ZONE1_ENTRY_IDS);
  if(!ZONE1_ENTRY_IDS.every(id=>network.entries.some(e=>e.id===id)))throw new Error('A requested Zone 1 identity is missing.');
  if(sourceHashes['public/data/roads.json']&&(network.roadsSha256!==sourceHashes['public/data/roads.json']||registry.roadsSha256!==sourceHashes['public/data/roads.json']))throw new Error('Road identities/evidence belong to a different source version.');
  const sourceWays=new Map(roads.ways.map(way=>[String(way.id),way])),wayCounts=new Map<string,number>();
  for(const way of roads.ways)wayCounts.set(String(way.id),(wayCounts.get(String(way.id))??0)+1);
  if([...wayCounts.values()].some(count=>count!==1))throw new Error('Conflicting duplicate source-way IDs require resolution.');
  const entriesByWay=new Map<string,string[]>();
  for(const entry of network.entries)for(const id of entry.sourceWayIds){const found=entriesByWay.get(id)??[];found.push(entry.id);entriesByWay.set(id,found);}
  const components=roadComponents(roads);
  const features:MapStudyData['roads']['features']=[];
  for(const way of roads.ways){
    const wayId=String(way.id),coordinates=way.nodes.map(id=>roads.nodes[String(id)]);
    // Never bridge a missing coordinate by filtering it out of a source line.
    if(coordinates.length<2||!coordinates.every(valid))throw new Error(`Malformed source way ${wayId}; map export refuses an invented shortcut.`);
    const properties:MapRoadProperties={wayId,roadId:components.get(wayId)!,name:sourceValue(way,'name'),ref:sourceValue(way,'ref'),highway:sourceValue(way,'highway'),entryIds:entriesByWay.get(wayId)??[],bridge:sourceValue(way,'bridge'),tunnel:sourceValue(way,'tunnel'),layer:sourceValue(way,'layer'),access:sourceValue(way,'motorcar')||sourceValue(way,'motor_vehicle')||sourceValue(way,'access'),oneway:sourceValue(way,'oneway')};
    features.push({type:'Feature',id:wayId,properties,geometry:{type:'LineString',coordinates}});
  }
  const labels=prepareRoadLabels(roads,network.entries);
  const junctions=buildMapJunctions(roads,network,evidence,crossings,physicalFacts,registry.junctions);
  for(const junction of junctions)junction.inZone1=junction.components.length?junction.components.some(c=>pointInZone(c.position,zone)):pointInZone(junction.position,zone);
  const junctionsByNode=new Map<string,string[]>();
  for(const junction of junctions.filter(j=>j.kind==='junction'))for(const node of junction.nodeIds){const list=junctionsByNode.get(node)??[];list.push(junction.id);junctionsByNode.set(node,list);}
  const sections:MapRoadSection[]=[],entries:MapStudyEntry[]=[];
  for(const entry of network.entries){
    const evidenceEntry=registry.entries.find(candidate=>candidate.id===entry.id);if(!evidenceEntry)throw new Error(`Missing evidence record for ${entry.id}`);
    const eligible=evidenceEntry.identity.status==='Verified'&&evidenceEntry.geometry.status!=='Conflicted';
    const verifiedSegments=new Set(eligible?evidenceEntry.segments.map(s=>s.edgeId.replace(/:[fr]$/,'')):[]);
    const source=prepareRoadLabels({...roads,ways:entry.sourceWayIds.map(id=>sourceWays.get(id)).filter((way):way is RoadWay=>!!way)},[{id:entry.id,sourceWayIds:entry.sourceWayIds}]);
    const entrySections:MapRoadSection[]=[];
    for(const chain of source.byId.values()){
      const geometry=chain.feature.geometry,coordinates=geometry.coordinates as LonLat[],clipped=clipLineToZone(coordinates,zone);
      const verifiedLines:LonLat[][]=[];
      chain.sourceSegments.forEach((segment,i)=>{if(verifiedSegments.has(`${segment.wayId}:${segment.index}`))appendLinePiece(verifiedLines,coordinates[i],coordinates[i+1]);});
      const verified:MultiLineString={type:'MultiLineString',coordinates:verifiedLines};
      const verifiedInside:MultiLineString={type:'MultiLineString',coordinates:verifiedLines.flatMap(line=>clipLineToZone(line,zone).inside.coordinates)};
      const order=new Map<string,number>();let distance=0;
      chain.sourceNodeIds.forEach((node,i)=>{if(i)distance+=lineLength([coordinates[i-1],coordinates[i]]);for(const id of junctionsByNode.get(node)??[])if(!order.has(id))order.set(id,distance);});
      const section:MapRoadSection={id:`${entry.id}:${chain.feature.id}`,entryId:entry.id,name:chain.feature.properties.label,sourceWayIds:chain.feature.properties.sourceWayIds,sourceNodeIds:chain.sourceNodeIds,sourceSegments:chain.sourceSegments,geometry,inside:clipped.inside,outside:clipped.outside,verified,verifiedInside,lengths:{full:round(geometryLength(geometry)),zone1:round(geometryLength(clipped.inside)),outside:round(geometryLength(clipped.outside))},junctionOrder:[...order].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).map(([junctionId,distanceMetres])=>({junctionId,distanceMetres:round(distanceMetres)}))};
      entrySections.push(section);sections.push(section);
    }
    const total=(key:'full'|'zone1'|'outside')=>round(entrySections.reduce((sum,section)=>sum+section.lengths[key],0));
    const lengths={full:total('full'),zone1:total('zone1'),outside:total('outside')};
    const fraction=lengths.full?lengths.zone1/lengths.full:0;
    const zone1Relationship=lengths.zone1<.01?'outside':lengths.outside<.01?'within':fraction>=.95?'nearly-within':'partial';
    const label=entry.originalLabel==='Lake Arrowhead'?'Lake Arrowhead Avenue':entry.originalLabel==='Niles Canyon'?'Niles Canyon Road':entry.originalLabel;
    const limitations=[entry.coverage,'Lengths sum mapped centerlines, including separate carriageways; they are not end-to-end corridor distances.','Source chain sections and junction order are not an exhaustive real-world inventory.',...(evidenceEntry.geometry.status==='Verified'?[]:[evidenceEntry.geometry.reason])];
    if(defaultIds.has(entry.id)&&!lengths.zone1)limitations.push('This requested default target has no positive-length overlap in the retained source polygon; keep the entry visible and use Show Full Road to inspect available geometry.');
    entries.push({id:entry.id,originalLabel:entry.originalLabel,label,group:entry.group,mappedNames:entry.mappedNames,names:entry.names,sourceWayIds:entry.sourceWayIds,defaultZone1:defaultIds.has(entry.id),requestedZone1Group:defaultIds.has(entry.id)?ZONE1_ENTRY_IDS.slice(0,4).includes(entry.id as never)?'within-or-nearly':'partial':null,zone1Relationship,lengths,evidence:{identity:evidenceEntry.identity,geometry:evidenceEntry.geometry,topology:evidenceEntry.topology,maneuvers:evidenceEntry.maneuvers},sectionIds:entrySections.map(section=>section.id),junctionIds:[...new Set(entrySections.flatMap(section=>section.junctionOrder.map(row=>row.junctionId)))],recognitionSectionIds:entrySections.filter(section=>section.verified.coordinates.length).map(section=>section.id),limitations});
  }
  const data:MapStudyData={schema:1,version:'',sourceHashes,metadata:{boundaryVersion:String(zones.metadata.boundaryVersion??''),evidenceVersion:registry.version,generatedBy:'npm run data:map (scripts/build-map-study.ts)',sourceDate:String(roads.metadata?.dataTimestamp??roads.metadata?.fetchedAt??''),attribution:'© OpenStreetMap contributors · ODbL; City of Fremont GIS; USDOT/BTS/FHWA bridge evidence',sources:[...Object.entries(registry.sources).map(([id,source])=>({id,url:source.url,version:source.version,retrievedAt:source.retrievedAt,limitations:source.limitations})),...evidence.sources.map(source=>({id:source.id,url:source.url,version:String(source.dataModifiedAt??source.publishedAt??''),retrievedAt:source.retrievedAt,limitations:source.limitations}))],limitations:['Historical City police polygons are approximate study boundaries; current adoption is unverified.','Available mapped extent is incomplete citywide and does not certify complete real-world corridors.','Clipped boundary points are presentation endpoints, never invented source junctions.','Mapped geographic connections and named physical-intersection evidence do not verify individual legal turns.']},zone1EntryIds:[...ZONE1_ENTRY_IDS],zones,headquarters:{name:'Fremont Police Headquarters',address:'2000 Stevenson Boulevard, Fremont, CA 94538',position:network.station.position,sourceUrl:network.station.sourceUrl,note:'OSM headquarters building reference. This landmark is not the former approximate public-road vehicle departure or a verified driveway.'},roads:{type:'FeatureCollection',features},labels:labels.collection,entries,sections,junctions};
  data.version=`map-study-v1-${sha(JSON.stringify(data)).slice(0,20)}`;return data;
}

const INPUT_FILES=['public/data/roads.json','public/data/study-network.json','public/data/zones.json','public/data/verification.json','data-sources/geographic-evidence.json','data-sources/independent-junctions/scoped-proposed-facts.json','docs/data/study-intersections.json'];
function main(){
  const raw=Object.fromEntries(INPUT_FILES.map(file=>[file,readFileSync(new URL(`../${file}`,import.meta.url))]));
  const read=<T>(name:string)=>JSON.parse(raw[name].toString()) as T;
  const data=buildMapStudyData({roads:read('public/data/roads.json'),network:read('public/data/study-network.json'),zones:read('public/data/zones.json'),registry:read('public/data/verification.json'),evidence:read('data-sources/geographic-evidence.json'),physicalFacts:read<{facts:NamedPhysicalFact[]}>('data-sources/independent-junctions/scoped-proposed-facts.json').facts,crossings:read<{unconnectedVisualCrossings:SourceVisualCrossing[]}>('docs/data/study-intersections.json').unconnectedVisualCrossings,sourceHashes:Object.fromEntries(INPUT_FILES.map(file=>[file,sha(raw[file])]))});
  const output=JSON.stringify(data),outputBytes=Buffer.byteLength(output,'utf8')+1;mkdirSync(new URL('../public/data/',import.meta.url),{recursive:true});writeFileSync(new URL('../public/data/.map-study.json.tmp',import.meta.url),output+'\n');renameSync(new URL('../public/data/.map-study.json.tmp',import.meta.url),new URL('../public/data/map-study.json',import.meta.url));
  const realJunctions=data.junctions.filter(j=>j.kind==='junction'),crossings=data.junctions.filter(j=>j.kind==='nonconnecting-crossing');
  const zone1Geometry=data.zones.zones.find(zone=>zone.id==='zone1')!.geometry!;
  const zone1PhysicalPairs=realJunctions.reduce((sum,junction)=>sum+junction.quizPairs.filter(pair=>junction.components.some(component=>pair.nodeIds.includes(component.nodeId)&&pointInZone(component.position,zone1Geometry))).length,0);
  const report=`# Interactive map geographic derivation\n\nVersion: \`${data.version}\`. Reproduce with \`npm run data:map\`. This creates a map-only dataset from committed snapshots without downloads or edits to the original geographic sources.\n\nThe default curriculum is exactly the user's 18 requested IDs; all original 38 IDs, original labels, categories, aliases and source mappings remain. Earlier broad zone membership included other roads; it does not automatically add targets. The requested four nearly-within / fourteen partial groups remain curriculum metadata. Computed overlap below concerns imported centerline geometry and can differ from those broad descriptions.\n\nExact clipping also retains positive overlaps for optional ${data.entries.filter(e=>!e.defaultZone1&&e.lengths.zone1>0).map(e=>`${e.label} (${e.lengths.zone1.toFixed(2)} m)`).join(' and ')||'none of the remaining entries'}. The historical boundary and its existing 75 m review band remain approximate; these measurements do not change the user-specified 18-entry curriculum. This is a fixed study selection, not a claim that precisely 18 roads have any mathematical polygon overlap.\n\n## Source preservation and clipping\n\nEvery background line is an original OSM way with all source coordinates retained. The same native label preparation retains source identity, geometry and label provenance. Selected-road sections join only compatible source segments at shared OSM nodes. Original geometry stays separate from derived clips. Each source segment is split at all actual line/polygon intersections, including multiple crossings, polygon holes and MultiPolygon components. Midpoints classify the resulting intervals only. Boundary cut points never enter the source-node junction inventory.\n\nThe retained historical City polygon is an approximate study boundary, not a current jurisdiction claim. Full-road display means the complete **available mapped extent**, not the complete real-world corridor. Lengths use the existing local metric projection and sum centerlines, including separate carriageways; they are not single end-to-end corridor lengths. Separate branches, source-name changes and carriageway chains remain separate walkthrough sections.\n\n## Generated inventory\n\n- ${data.entries.length} original study identities; ${data.zone1EntryIds.length} default Zone 1 entries.\n- ${data.roads.features.length} original source-way features; ${data.labels.features.length} source-preserving native label chains.\n- ${data.sections.length} explicit study sections.\n- ${realJunctions.length} mapped junction entries, grouped only with retained logical source relationships or a matching City catalog record.\n- ${realJunctions.filter(j=>j.quizPairs.length).length} junction groups contain scoped independently corroborated physical road-pair facts eligible for geographic intersection recognition. These are not legal-turn permissions.\n- ${zone1PhysicalPairs} scoped physical question pairs have an eligible source node inside the Zone 1 polygon; grouped-site membership alone cannot qualify an outside pair for Zone 1 scoring.\n- ${crossings.length} nonconnecting visual crossing records are kept separately and never become ordinary junction markers.\n- Headquarters uses the existing OSM building reference at ${JSON.stringify(data.headquarters.position)}, not the former road-departure point.\n- Dataset size: ${outputBytes.toLocaleString('en-US')} bytes before transfer compression.\n\n## All 38 entries\n\n| ID | Original study entry | Default Zone 1 | Imported length in Zone 1 (km) | Full imported centerlines (km) | Geometry evidence | Sections |\n|---|---|---|---:|---:|---|---:|\n${data.entries.map(e=>`| ${e.id} | ${e.originalLabel} | ${e.defaultZone1?'Yes':'Optional all-streets'} | ${(e.lengths.zone1/1000).toFixed(2)} | ${(e.lengths.full/1000).toFixed(2)} | ${e.evidence.geometry.status} | ${e.sectionIds.length} |`).join('\n')}\n\n## Evidence and limitations\n\nRoad recognition uses only individually corroborated source segments with verified identity and no conflicted geometry. A whole displayed road can remain partially unresolved. Junction markers use actual shared OSM node IDs. Named City intersection points corroborate locations only. Scored intersection pairs additionally require applicable implemented physical-junction and grade evidence for those exact names and a real shared source node. Grouping does not fabricate movements between every road in a group. Known conflicts remain excluded. Legal access, every turn, signals, lanes, current closures and full corridor coverage remain unresolved where their sources do not establish them. Existing grade-separated line crossings stay nonconnecting.\n\nLogical-junction marker positions are view-scoped to an actual source node on the selected road section and inside Zone 1 when clipped. The global representative and original components remain unchanged. A physical-evidence badge applies only to a specifically corroborated pair at that selected road/node; evidence for another pair elsewhere in a group cannot promote the selected connection. Section-specific crossing notices likewise stay on the selected source line.\n\nSection ordering follows the source chain's coordinate order; each source node retains its actual geographic location. It does not invent a global north–south order or an exhaustive sequence across gaps. Distinct same-name connector components use actual source-node connectivity for disambiguation.\n\n## Input SHA-256 values\n\n${Object.entries(data.sourceHashes).map(([file,hash])=>`- \`${file}\`: \`${hash}\``).join('\n')}\n\nOriginal OSM/City provenance, source dates, licensing and independent evidence scope remain in the input files, [prior accuracy audit](geographic-audit.md), [learning evidence](learning-accuracy.md), and [independent source research](junction-source-research.md). Software derivation tests do not independently verify real-world geography.\n`;
  writeFileSync(new URL('../docs/map-study-geography.md',import.meta.url),report);
  console.log(JSON.stringify({version:data.version,entries:data.entries.length,defaultEntries:data.zone1EntryIds.length,roads:data.roads.features.length,labels:data.labels.features.length,sections:data.sections.length,junctions:realJunctions.length,crossings:crossings.length,physicalQuizJunctions:realJunctions.filter(j=>j.quizPairs.length).length,bytes:outputBytes}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildGraph, project } from '../src/core';
import type { RoadData, LonLat } from '../src/core';
import type { StudyNetwork } from '../src/study-network';
import { fact, type VerificationRegistry, type EntryEvidence, type JunctionEvidence } from '../src/training/verification';
const read=(path:string)=>readFileSync(path,'utf8');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const roadRaw=read('public/data/roads.json'), cityRaw=read('data-sources/city-streets-full.geojson'), curriculumRaw=read('data-sources/study-entries.json');
const roads=JSON.parse(roadRaw) as RoadData, graph=buildGraph(roads), network=JSON.parse(read('public/data/study-network.json')) as StudyNetwork;
const city=JSON.parse(cityRaw), features=new Map<number,any>(city.features.map((f:any)=>[f.properties.OBJECTID,f]));
const tolerance=15,spacing=10;
type XY={x:number;y:number};
const lines=(f:any):LonLat[][]=>f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[];
function distance(p:XY,a:XY,b:XY){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
const entries:EntryEvidence[]=network.entries.map(entry=>{
 const cityLines=entry.cityObjectIds.flatMap(id=>{const f=features.get(id);return f?lines(f).flatMap(line=>line.slice(1).map((p,i)=>({id,a:project(line[i]),b:project(p)}))):[];});
 const segments:EntryEvidence['segments']=[];
 for(const id of entry.edgeIds){const e=graph.edges.get(id)!;const a=graph.nodes.get(e.from)!,b=graph.nodes.get(e.to)!;const n=Math.max(1,Math.ceil(e.length/spacing));let max=0;const matches=new Set<number>();
  for(let i=0;i<=n;i++){const p={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n};let nearest=Infinity,object=0;for(const s of cityLines){const d=distance(p,s.a,s.b);if(d<nearest){nearest=d;object=s.id;}}max=Math.max(max,nearest);matches.add(object);if(max>tolerance)break;}
  if(max<=tolerance)segments.push({edgeId:id,cityObjectIds:[...matches].sort((a,b)=>a-b),maxOffsetMetres:Math.round(max*100)/100,samples:n+1});
 }
 const source=[...entry.cityObjectIds.map(id=>`city:OBJECTID=${id}`),...entry.sourceWayIds.map(id=>`osm:way=${id}`)];
 return {id:entry.id,label:entry.originalLabel,totalEdges:entry.edgeIds.length,segments,
 identity:fact(entry.cityObjectIds.length&&entry.sourceWayIds.length&&!entry.needsConfirmation?'Verified':'Unresolved','Existing explicit curriculum-to-source mappings','City road-name records and OSM names/ref tags support the existing explicit mapping; original curriculum label is retained.',source),
 geometry:fact(segments.length===entry.edgeIds.length&&segments.length>0?'Verified':'Unresolved','Only the individually listed segments qualify for scored location/recognition tasks',`${segments.length}/${entry.edgeIds.length} directed segments corroborated against corresponding City centerlines at <=${tolerance} m, sampled every <=${spacing} m. Missing corroboration is not proof of a wrong road. This is centerline consistency, not surveyed lane precision.`,['city','osm']),
 topology:fact('Unresolved','Entire corridor and all approaches','OSM shared-node topology is checked by software. Complete independent real-world connectivity has not been established.',['osm']),
 maneuvers:fact('Unresolved','Legal movements and restrictions','No comprehensive independent turning/access evidence; absent restrictions do not prove permission. Scored navigation and maneuver questions are withheld.',['osm'])};
});
const wayById=new Map(roads.ways.map(w=>[String(w.id),w]));
const junctions:JunctionEvidence[]=network.intersections.map(j=>{
 // City endpoint corroboration is recorded only as supporting evidence; it
 // cannot establish grade or permitted turns without additional records.
 const p=project(j.position);const nearby=j.entryIds.flatMap(id=>network.entries.find(e=>e.id===id)!.cityObjectIds.filter(id=>{const f=features.get(id);return f&&lines(f).some(line=>[line[0],line.at(-1)!].some(q=>{const x=project(q);return Math.hypot(x.x-p.x,x.y-p.y)<15;}));}));
 const graded=j.sourceWayIds.some(id=>{const tags=wayById.get(id)?.tags;return tags&&(tags.bridge==='yes'||tags.tunnel==='yes'||tags.layer&&tags.layer!=='0');});
 return {id:j.id,entryIds:j.entryIds,position:j.position,
 identity:fact('Verified','Names of roads at the OSM source node','Existing explicit source-way mappings',j.sourceWayIds.map(id=>`osm:way=${id}`)),
 geometry:fact('Unresolved','Source junction point',`${new Set(nearby).size} City feature endpoints within 15 m. Proximity alone does not verify a drivable intersection.`,[...new Set(nearby)].map(id=>`city:OBJECTID=${id}`)),
 topology:fact('Unresolved','Drivable junction',graded?'Grade-separated source attributes require explicit review.':'Shared OSM node exists; independent grade/access confirmation remains required.',[`osm:node=${j.nodeId}`]),
 maneuvers:fact('Unresolved','Individual turning movements','Supported graph rules are not independent legal-movement verification.',j.restrictionIds.map(id=>`osm:relation=${id}`))};
});
const registry:VerificationRegistry={schema:1,version:`evidence-v1-${hash(roadRaw+cityRaw+curriculumRaw+'15m-10m-policy1').slice(0,16)}`,roadsSha256:hash(roadRaw),curriculumSha256:hash(curriculumRaw),
 sources:{city:{url:city.metadata.sourceUrl,sha256:hash(cityRaw),retrievedAt:city.metadata.retrievedAt,version:new Date(city.metadata.editingInfo.dataLastEditDate).toISOString(),limitations:city.metadata.license+' Centerlines are not lane, grade or turn-permission records.'},osm:{url:'https://www.openstreetmap.org/copyright',sha256:hash(roadRaw),retrievedAt:String(roads.metadata?.fetchedAt??roads.metadata?.importedAt??'See committed import manifests'),version:network.version,limitations:'ODbL; bounded non-atomic imports. 232 unsupported restriction records. See import manifests for URLs, dates and object versions.'}},
 policy:{geometryToleranceMetres:tolerance,sampleSpacingMetres:spacing,note:'Independent cached City/OSM centerline comparison; no source geometry is altered. Status scope is explicit. No independently verified maneuvers are available. Software graph tests are separate.'},entries,junctions};
writeFileSync('public/data/verification.json',JSON.stringify(registry)+'\n');
writeFileSync('docs/learning-accuracy.md',`# Learning geographic evidence audit\n\nEvidence version: ${registry.version}. Reproduce with \`npm run data:verify\`; no downloads.\n\n${registry.policy.note}\n\nCity: ${city.metadata.sourceUrl}; retrieved ${city.metadata.retrievedAt}; data edit ${registry.sources.city.version}. Credit City of Fremont GIS Division. ${registry.sources.city.limitations}\n\nOSM: source IDs and import history in roads.json and existing manifests; attribution © OpenStreetMap contributors, ODbL. Both complete source file hashes are in verification.json.\n\nThe exact 38 curriculum identities, labels, groups and existing mappings are preserved. Historic approximate patrol polygons and approximate public-road HQ spawn are unchanged. Whole-city coverage is not claimed.\n\n| Entry | Identity | Whole imported geometry | Eligible directed segments | Topology | Maneuvers |\n|---|---|---|---:|---|---|\n${entries.map(e=>`| ${e.label} | ${e.identity.status} | ${e.geometry.status} | ${e.segments.length}/${e.totalEdges} | ${e.topology.status} | ${e.maneuvers.status} |`).join('\n')}\n\n## Eligibility and unresolved work\n\nRecognition questions may use only individually corroborated segments, never an arbitrary section of a partially corroborated corridor. A 15 m centerline tolerance with samples at most 10 m apart is a documented comparison policy, not a survey accuracy claim. Name agreement alone cannot qualify geometry.\n\nAll ${junctions.length} source junctions retain an independent four-dimension record. City endpoint proximity and OSM shared nodes are evidence for review, not proof of legal turns or grade. No scored intersection or maneuver questions qualify yet. Navigation remains available as unscored practice under supported graph rules. The full 20-task exam is unavailable until sufficient independently supported intersection and navigation tasks exist. Higher mastery levels must disclose this evidence gap.\n\nNext evidence needed: independent junction/grade/access and relevant turn-permission records; review of unmatched segments; explicit resolution records for any confirmed conflicts. OSM/City source disagreement must not be resolved by drawing new connections. No verified movement is inferred from absence of a prohibition.\n`);
console.log(JSON.stringify({version:registry.version,entries:entries.length,recognitionEntries:entries.filter(e=>e.segments.length).length,segments:entries.reduce((sum,e)=>sum+e.segments.length,0),wholeGeometryVerified:entries.filter(e=>e.geometry.status==='Verified').length,scoredIntersections:0,scoredNavigation:0}));
